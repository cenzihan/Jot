"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  safeStorage,
  Notification,
  shell,
  session,
  powerMonitor,
  net,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { Store, stats } = require("./core");
const { Services } = require("./services");
const { readPet, listPets } = require("./pets");
const TEST = process.env.SHIBAN_TEST === "1";
if (TEST && process.env.SHIBAN_TEST_DIR)
  app.setPath("userData", process.env.SHIBAN_TEST_DIR);
else app.setPath("userData",path.join(app.getPath("appData"),"Shiban"));
app.setName("Jot");
app.setAppUserModelId("com.shiban.desktop");
let store,
  services,
  pet,
  panel,
  tray,
  quitting = false,
  drag = null,
  shortcutStatus = {},
  petData = null,
  gazeTimer = null,
  chatRestoreBounds = null;
if (!TEST && !app.requestSingleInstanceLock()) {
  dialog.showErrorBox('Jot 已在运行','请先从系统托盘退出正在运行的 Jot，再打开这个版本。为了保护记录，请勿同时运行两个版本。');
  app.quit();
} else {
  app.on("second-instance", () => showPanel());
  app
    .whenReady()
    .then(start)
    .catch((e) => {
      dialog.showErrorBox("Jot无法启动", e.message);
      app.quit();
    });
}
function changed() {
  resizePet();
  for (const w of [pet, panel])
    if (w && !w.isDestroyed()) w.webContents.send("changed");
}
function resizePet(){
  if(!pet||pet.isDestroyed()||!store)return;
  const minimal=store.state.settings.minimal||!petData;
  const [w,h]=minimal?[168,66]:[132,146];
  const [oldW,oldH]=pet.getSize();if(oldW===w&&oldH===h)return;
  const [x,y]=pet.getPosition();const pos=clampPosition(x,y+oldH-h,w,h);
  pet.setBounds({x:pos.x,y:pos.y,width:w,height:h});
}
function petState(state) {
  if (pet && !pet.isDestroyed()) pet.webContents.send("pet-state", state);
}
function clampPosition(x, y, w, h) {
  const area = screen.getDisplayNearestPoint({
    x: Math.round(x),
    y: Math.round(y),
  }).workArea;
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - w))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - h))),
  };
}
function showPanel(record = false) {
  if (!panel) return;
  if(panel.isMinimized())panel.restore();
  panel.show();
  panel.focus();
  if (record) panel.webContents.send("record");
}
function secureWindow(w) {
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
}
function publicState() {
  const s = store.snapshot();
  for (const key of ["chat", "speech"]) {
    s.settings[key].hasKey = !!s.settings[key].key;
    delete s.settings[key].key;
  }
  for (const source of s.sources) delete source.seen;
  s.history = s.history
    .slice(-100)
    .reverse()
    .map(({ id, label, at, undone }) => ({ id, label, at, undone }));
  return {
    ...s,
    stats: stats(s),
    petData,
    shortcutStatus,
    recovered: store.recovered,
  };
}
async function decrypt(value) {
  if (!value) return "";
  if (safeStorage.decryptStringAsync)
    return (await safeStorage.decryptStringAsync(Buffer.from(value, "base64")))
      .result;
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}
async function encrypt(value) {
  if (!value) return "";
  if (safeStorage.encryptStringAsync)
    return (await safeStorage.encryptStringAsync(value)).toString("base64");
  if (!safeStorage.isEncryptionAvailable()) throw Error("系统密钥保护暂不可用");
  return safeStorage.encryptString(value).toString("base64");
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, args) => {
    try {
      if (
        ![pet?.webContents.id, panel?.webContents.id].includes(event.sender.id)
      )
        throw Error("无效窗口");
      return { ok: true, value: await fn(args) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}
async function start() {
  store = new Store(app.getPath("userData"));
  if(!store.state.settings.jotCapsuleApplied){
    store.state.settings.minimal=true;
    store.state.settings.motion=false;
    store.state.settings.jotCapsuleApplied=true;
    store.save();
  }
  if (!store.state.settings.calmDefaultApplied) {
    store.state.settings.motion = false;
    store.state.settings.calmDefaultApplied = true;
    store.save();
  }
  services = new Services(
    store,
    decrypt,
    (...args) => net.fetch(...args),
    changed,
  );
  services.onProgress = payload => { if(panel&&!panel.isDestroyed())panel.webContents.send('chat-progress',payload); };
  if (store.state.settings.pet) {
    const meta = store.state.settings.pet,
      p = path.join(store.dir, meta.file);
    if (fs.existsSync(p))
      petData = {
        ...meta,
        url:
          `data:${meta.mime || "image/png"};base64,` +
          fs.readFileSync(p).toString("base64"),
      };
  }
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback, details) =>
      callback(
        wc?.id === panel?.webContents.id &&
          permission === "media" &&
          !(details.mediaTypes || []).includes("video"),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission) =>
      wc?.id === panel?.webContents.id && permission === "media",
  );
  const area = screen.getPrimaryDisplay().workArea;
  const pos = store.state.settings.position || {
    x: area.x + area.width - 160,
    y: area.y + area.height - 185,
  };
  pet = new BrowserWindow({
    width: 132,
    height: 146,
    ...clampPosition(pos.x, pos.y, 132, 146),
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: !TEST,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  panel = new BrowserWindow({
    width: 620,
    height: 810,
    minWidth: 520,
    minHeight: 580,
    frame: false,
    transparent: true,
    show: false,
    backgroundColor: "#00000000",
    title: "Jot",
    autoHideMenuBar: true,
    alwaysOnTop: store.state.settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  secureWindow(pet);
  secureWindow(panel);
  resizePet();
  panel.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      panel.hide();
    }
  });
  handle("panel-chat-layout", (expanded) => {
    if(typeof expanded!=='boolean')throw Error('对话布局参数无效');
    if(expanded){
      if(chatRestoreBounds)return {overlay:panel.getBounds().width<900};
      if(panel.isMaximized())return {overlay:false};
      const current=panel.getBounds();
      const area=screen.getDisplayMatching(current).workArea;
      if(area.width<900)return {overlay:true};
      chatRestoreBounds=current;
      const width=Math.min(Math.max(current.width+360,940),area.width);
      const x=Math.max(area.x,Math.min(current.x,area.x+area.width-width));
      panel.setBounds({x,y:current.y,width,height:current.height});
      return {overlay:false};
    }
    if(chatRestoreBounds){
      if(!panel.isMaximized())panel.setBounds(chatRestoreBounds);
      chatRestoreBounds=null;
    }
    return {overlay:false};
  });
  handle("state", () => publicState());
  handle("models-list", (config) => services.listModels(config));
  handle("action", (a) => {
    const result = store.act(a);
    changed();
    if (a.data?.status === "done" || a.kind === "log") petState("celebrate");
    return result.event?.id;
  });
  handle("undo", (id) => {
    const r = store.undo(id);
    changed();
    return r;
  });
  handle("settings", async (incoming) => {
    if (!incoming || typeof incoming !== "object") throw Error("配置无效");
    const candidate = structuredClone(store.state.settings);
    if(incoming.chat?.style!==undefined){
      if(!['jot','warm','precise','custom'].includes(incoming.chat.style))throw Error('未知对话风格');
      candidate.chat.style=incoming.chat.style;
    }
    if(incoming.chat?.format!==undefined){
      if(!['openai','anthropic'].includes(incoming.chat.format))throw Error('未知对话接口格式');
      candidate.chat.format=incoming.chat.format;
    }
    if(incoming.chat?.systemPrompt!==undefined){
      if(typeof incoming.chat.systemPrompt!=='string'||incoming.chat.systemPrompt.length>8000)throw Error('System Prompt 最多 8000 字');
      candidate.chat.systemPrompt=incoming.chat.systemPrompt.trim();
    }
    for(const [key,max] of [['memoryStable',1500],['memoryRecent',1000]])if(incoming.chat?.[key]!==undefined){
      if(typeof incoming.chat[key]!=='string'||incoming.chat[key].length>max)throw Error(key==='memoryStable'?'稳定偏好最多 1500 字':'近期摘要最多 1000 字');
      candidate.chat[key]=incoming.chat[key].trim();
    }
    for (const name of ["chat", "speech"])
      if (incoming[name]) {
        const endpointChanged=incoming[name].baseUrl!==undefined&&incoming[name].baseUrl.trim()!==candidate[name].baseUrl;
        for (const k of [
          "baseUrl",
          "model",
          ...(name === "speech" ? ["mode", "exe", "modelPath"] : []),
        ])
          if (incoming[name][k] !== undefined) {
            if (
              typeof incoming[name][k] !== "string" ||
              incoming[name][k].length > 2000
            )
              throw Error("配置内容过长");
            candidate[name][k] = incoming[name][k].trim();
          }
        if (incoming[name].key !== undefined) {
          if (
            typeof incoming[name].key !== "string" ||
            incoming[name].key.length > 4000
          )
            throw Error("密钥格式不正确");
          candidate[name].key = await encrypt(incoming[name].key.trim());
        } else if(endpointChanged) candidate[name].key='';
      }
    for (const k of [
      "minimal",
      "motion",
      "alwaysOnTop",
      "notifications",
      "autoSummarize",
    ])
      if (incoming[k] !== undefined) candidate[k] = !!incoming[k];
    if (incoming.capsuleTheme !== undefined) {
      if (!["black", "white", "black-logo", "white-logo"].includes(incoming.capsuleTheme)) throw Error("未知胶囊外观");
      candidate.capsuleTheme = incoming.capsuleTheme;
    }
    for (const k of ["quietStart", "quietEnd"])
      if (incoming[k] !== undefined) {
        const n = Number(incoming[k]);
        if (!Number.isInteger(n) || n < 0 || n > 23)
          throw Error("免打扰小时须为0至23");
        candidate[k] = n;
      }
    store.state.settings = candidate;
    store.save();
    panel.setAlwaysOnTop(candidate.alwaysOnTop);
    changed();
    return true;
  });
  handle("chat", async (input) => {
    petState("thinking");
    try {
      return await services.chat(input);
    } finally {
      petState("idle");
    }
  });
  handle("memory-summarize", () => services.summarizeRecentMemory());
  handle("cancel-chat", () => services.controller?.abort());
  handle("transcribe", async (bytes) => {
    petState("thinking");
    try {
      return await services.transcribe(bytes);
    } finally {
      petState("idle");
    }
  });
  handle("pet-state", (state) => {
    if (["idle", "listening", "thinking", "celebrate"].includes(state))
      petState(state);
  });
  handle("panel-hide", () => panel.hide());
  handle("panel-minimize",()=>panel.minimize());
  handle("panel-maximize",()=>panel.isMaximized()?panel.unmaximize():panel.maximize());
  handle("panel-open",()=>showPanel());
  handle("panel-record",()=>showPanel(true));
  handle("panel-toggle", () =>
    panel.isVisible() ? panel.hide() : showPanel(),
  );
  handle("pet-menu", () =>
    Menu.buildFromTemplate([
      { label: "打开Jot", click: () => showPanel() },
      { label: "语音记录  Ctrl+Shift+Space", click: () => showPanel(true) },
      { type: "separator" },
      { label: "隐藏宠物", click: () => pet.hide() },
      {
        label: "退出Jot",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]).popup({ window: pet }),
  );
  handle("pet-drag-start", () => {
    drag = {
      cursor: screen.getCursorScreenPoint(),
      position: pet.getPosition(),
    };
  });
  handle("pet-drag-move", () => {
    if (drag) {
      const p = screen.getCursorScreenPoint();
      const pos = clampPosition(
        drag.position[0] + p.x - drag.cursor.x,
        drag.position[1] + p.y - drag.cursor.y,
        ...pet.getSize(),
      );
      pet.setPosition(pos.x, pos.y);
    }
  });
  handle("pet-drag-end", () => {
    drag = null;
    const [x, y] = pet.getPosition();
    store.state.settings.position = { x, y };
    store.save();
  });
  function importPet(input) {
    const p = readPet(input),
      dest = "pet-" + randomUUID() + "." + p.ext;
    fs.writeFileSync(path.join(store.dir, dest), p.bytes);
    store.state.settings.pet = {
      name: p.name,
      file: dest,
      rows: p.rows,
      mime: p.mime,
      version: p.version,
    };
    store.state.settings.minimal = false;
    store.save();
    petData = {
      ...store.state.settings.pet,
      url: `data:${p.mime};base64,` + p.bytes.toString("base64"),
    };
    changed();
    return p.name;
  }
  const petRoot = path.join(app.getPath("home"), ".codex", "pets");
  handle("pet-list", () => listPets(petRoot).map(({ manifest, ...p }) => p));
  handle("pet-select", (id) => {
    const p = listPets(petRoot).find((x) => x.id === id);
    if (!p || p.error) throw Error("找不到可用的 Codex Pet");
    return importPet(p.manifest);
  });
  handle("pet-import", async () => {
    const d = await dialog.showOpenDialog(panel, {
      title: "选择宠物 pet.json 或精灵图",
      filters: [
        { name: "Codex Pet", extensions: ["json", "png", "webp"] },
        { name: "静态图片", extensions: ["png", "webp", "gif"] },
      ],
      properties: ["openFile"],
    });
    if (d.canceled) return null;
    return importPet(d.filePaths[0]);
  });
  handle("pet-reset", () => {
    store.state.settings.pet = null;
    store.save();
    petData = null;
    changed();
  });
  handle("pick-local", async (kind) => {
    if (!["exe", "modelPath"].includes(kind)) throw Error("无效选项");
    const d = await dialog.showOpenDialog(panel, {
      title: kind === "exe" ? "选择 whisper-cli.exe" : "选择 ggml 模型",
      filters: [
        {
          name: kind === "exe" ? "Whisper 程序" : "Whisper 模型",
          extensions: kind === "exe" ? ["exe"] : ["bin"],
        },
      ],
      properties: ["openFile"],
    });
    return d.canceled ? null : d.filePaths[0];
  });
  handle("source-add", async (kind) => {
    const d = await dialog.showOpenDialog(panel, {
      title: "选择要读取的 Agent 记录（启用后会发送文本给已配置的对话服务）",
      properties: [kind === "folder" ? "openDirectory" : "openFile"],
      filters: [
        { name: "会话记录", extensions: ["jsonl", "json", "md", "txt"] },
      ],
    });
    if (d.canceled) return null;
    const p = d.filePaths[0];
    if (!store.state.sources.some((s) => s.path === p))
      store.state.sources.push({
        id: randomUUID(),
        name: path.basename(p),
        path: p,
        enabled: false,
        seen: {},
      });
    store.save();
    changed();
    return p;
  });
  handle("source-toggle", (id) => {
    const s = store.state.sources.find((x) => x.id === id);
    if (!s) throw Error("来源不存在");
    if (services.sourceBusy) throw Error("请等待本次汇总结束");
    s.enabled = !s.enabled;
    store.save();
    changed();
  });
  handle("source-remove", (id) => {
    if (services.sourceBusy) throw Error("请等待本次汇总结束");
    store.state.sources = store.state.sources.filter((x) => x.id !== id);
    store.save();
    changed();
  });
  handle("source-scan", () => services.scanSources());
  handle("open-data", () => shell.openPath(store.dir));
  handle("open-github", () => shell.openExternal("https://github.com/cenzihan/Jot"));
  handle("export", async (kind) => {
    if (!["json", "md", "csv"].includes(kind)) throw Error("无效导出格式");
    const d = await dialog.showSaveDialog(panel, {
      defaultPath: `Jot-${new Date().toISOString().slice(0, 10)}.${kind}`,
    });
    if (d.canceled) return null;
    const s = store.snapshot();
    let content;
    if (kind === "json") {
      delete s.settings;
      delete s.reminded;
      for (const source of s.sources) delete source.seen;
      content = JSON.stringify(s, null, 2);
    }
    if (kind === "md")
      content =
        "# Jot · 完成日志\n\n" +
        s.logs
          .slice()
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
          .map(
            (l) =>
              `- ${new Date(l.completedAt).toLocaleString("zh-CN")} · ${l.title}\n${l.notes ? "  " + l.notes + "\n" : ""}`,
          )
          .join("\n");
    if (kind === "csv") {
      const escape = (x) =>
        '"' +
        String(/^[=+@\-]/.test(String(x)) ? "'" + x : x).replace(/"/g, '""') +
        '"';
      content =
        "\uFEFF类型,标题,状态,记录时间,截止或完成时间\r\n" +
        [
          ...s.todos.map((x) => [
            "Todo",
            x.title,
            x.status,
            x.createdAt,
            x.completedAt || x.dueAt || "",
          ]),
          ...s.todayActions.map((x) => [
            "Today",
            x.title,
            x.status,
            x.day,
            x.completedAt || "",
          ]),
          ...s.logs.map((x) => [
            "日志",
            x.title,
            "完成",
            x.createdAt,
            x.completedAt,
          ]),
          ...s.notes.map(x=>['普通记录',x.title,x.status,x.recordedAt,x.completedAt||'']),
        ]
          .map((r) => r.map(escape).join(","))
          .join("\r\n");
    }
    fs.writeFileSync(d.filePath, content, "utf8");
    return d.filePath;
  });
  handle("snooze", (id) => {
    const d = store.state.todos.find((x) => x.id === id && x.dueAt);
    if (!d) throw Error("截止事项不存在");
    store.state.reminded[id] = {
      dueAt: d.dueAt,
      snoozeUntil: Date.now() + 3600000,
    };
    store.save();
  });
  handle("quit", () => {
    quitting = true;
    app.quit();
  });
  await Promise.all([pet.loadFile(path.join(__dirname,"pet.html")), panel.loadFile(path.join(__dirname,"index.html"))]);
  if (!TEST) gazeTimer = setInterval(() => {
    if (
      !pet.isVisible() ||
      !store.state.settings.motion ||
      store.state.settings.minimal ||
      petData?.rows !== 11
    )
      return;
    const cursor = screen.getCursorScreenPoint(),
      bounds = pet.getBounds();
    pet.webContents.send("pet-gaze", {
      x: cursor.x - bounds.x - bounds.width / 2,
      y: cursor.y - bounds.y - bounds.height / 2,
    });
  }, 140);
  if (!TEST) {
    const icon = nativeImage.createFromPath(
      path.join(__dirname, "..", "assets", "icon.png"),
    );
    tray = new Tray(icon);
    tray.setToolTip("Jot · Today / Todo / 完成日志");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开Jot", click: () => showPanel() },
        { label: "显示宠物", click: () => pet.show() },
        { label: "语音记录", click: () => showPanel(true) },
        { type: "separator" },
        {
          label: "退出",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => showPanel());
    shortcutStatus.panel = globalShortcut.register(
      "CommandOrControl+Shift+J",
      () => showPanel(),
    );
    shortcutStatus.voice = globalShortcut.register(
      "CommandOrControl+Shift+Space",
      () => showPanel(true),
    );
    changed();
    setInterval(reminders, 60000);
    setTimeout(reminders, 10000);
    powerMonitor.on("resume", reminders);
    setInterval(() => {
      if (
        store.state.settings.autoSummarize &&
        !services.sourceBusy &&
        !services.busy
      )
        services.scanSources().catch(() => {});
    }, 15 * 60000);
  }
  if (process.argv.includes("--panel")) showPanel();
}
function reminders() {
  const s = store.state;
  if (!s.settings.notifications) return;
  const h = new Date().getHours(),
    a = s.settings.quietStart,
    b = s.settings.quietEnd;
  if (a !== b && (a < b ? h >= a && h < b : h >= a || h < b)) return;
  const due = s.todos.filter(
    (x) => !x.legacyDdlId && !["done","cancelled"].includes(x.status) && x.dueAt && Date.parse(x.dueAt) - Date.now() < 86400000,
  );
  const eligible = due.filter((x) => {
    const last = s.reminded[x.id];
    if (last?.snoozeUntil > Date.now()) return false;
    const phase = Date.parse(x.dueAt) <= Date.now() ? "overdue" : "soon";
    return (
      !last ||
      last.dueAt !== x.dueAt ||
      last.phase !== phase ||
      !!last.snoozeUntil
    );
  });
  if (!eligible.length) return;
  const top = eligible.sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const notification = new Notification({
    title: "Jot · 截止提醒",
    body: `${top.title}${eligible.length > 1 ? ` 等 ${eligible.length} 项` : ""}\n${Date.parse(top.dueAt) <= Date.now() ? "已到截止时间" : "截止于 " + new Date(top.dueAt).toLocaleString("zh-CN")}`,
  });
  notification.on("click", () => showPanel());
  notification.show();
  petState("waiting");
  for (const x of eligible)
    s.reminded[x.id] = {
      dueAt: x.dueAt,
      phase: Date.parse(x.dueAt) <= Date.now() ? "overdue" : "soon",
    };
  store.save();
}
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  clearInterval(gazeTimer);
});
app.on("window-all-closed", () => app.quit());
