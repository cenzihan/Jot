"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (v) =>
  v
    ? new Date(v).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
const day = (v) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const localTime = (v) => {
  const d = new Date(v || Date.now());
  return `${day(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
let state,
  page = "today",
  search = "",
  filter = "active",
  sort = localStorage.getItem("ddlSort") || "dueAt-asc",
  toastTimer,
  chatBusy = false,
  liveReply = null,
  refreshSeq = 0,
  recording = null,
  transcribing = false,
  startingRecord = false;
let selectedDay=day(Date.now()),calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
const leftTools=document.createElement('div');leftTools.className='topbar-left';
const gearButton=$('#settings-button');gearButton.before(leftTools);leftTools.append(gearButton);
leftTools.insertAdjacentHTML('afterbegin','<button id="home-logo" class="icon-button" data-page="today" aria-label="Jot 首页" title="Jot"><img src="../assets/jot-mark.svg" alt="Jot"></button>');
leftTools.insertAdjacentHTML('beforeend','<button id="calendar-button" class="icon-button" data-page="calendar" aria-label="日历日志" title="日历日志"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 11h18m-13 4h2m4 0h2m-8 3h2"/></svg></button>');
$('#completed-field').insertAdjacentHTML('beforebegin','<label id="recorded-field" hidden>记录时间<input name="recordedAt" type="datetime-local"></label>');
const oldModelLabel=$('#model-label');
const modelButton=document.createElement('button');
modelButton.id='model-label';modelButton.type='button';modelButton.setAttribute('aria-haspopup','menu');modelButton.setAttribute('aria-expanded','false');modelButton.setAttribute('aria-label','切换对话模型');
oldModelLabel.replaceWith(modelButton);
modelButton.insertAdjacentHTML('afterend','<div id="chat-model-menu" class="chat-model-menu" role="menu" aria-label="对话模型" hidden></div>');
$('.chat').insertAdjacentHTML('afterbegin','<button id="chat-launcher" type="button" aria-label="打开 Jot 对话" title="打开 Jot 对话"><span class="launcher-wordmark">Jot <em>it!</em></span><span class="launcher-chevron" aria-hidden="true">›</span></button>');
$('.chat').insertAdjacentHTML('beforeend','<button id="chat-collapse-pill" type="button" aria-label="收起 Jot 对话" title="收起对话"><span class="launcher-wordmark">Jot <em>it!</em></span><span class="launcher-chevron" aria-hidden="true">‹</span></button>');
$('.chat-caption').insertAdjacentHTML('beforebegin','<span id="chat-context-count" class="chat-context-count" title="每次最多发送最近 20 条对话，另附已保存的近期摘要；不是模型 token 上限">对话 0/20</span>');
$('#chat-input').placeholder='问 Jot，或请它帮你记一件事…';
let cachedChatModels=null,cachedModelProvider='',chatModelSearch='';
async function call(name, args) {
  const r = await window.shiban.call(name, args);
  if (!r.ok) throw Error(r.error);
  return r.value;
}
function toast(message, eventId) {
  clearTimeout(toastTimer);
  const t = $("#toast");
  t.innerHTML =
    esc(message) +
    (eventId ? `<button data-undo="${esc(eventId)}">撤销</button>` : "");
  t.hidden = false;
  toastTimer = setTimeout(() => (t.hidden = true), 7000);
}
function fail(e) {
  toast(e.message || String(e));
}
function modelProviderKey(){return `${state.settings.chat.baseUrl}|${state.settings.chat.format||'openai'}`;}
function profileMenuHTML(){
  const chat=state.settings.chat,profiles=chat.profiles||[];
  return `<div class="model-menu-profiles"><strong>已保存配置</strong>${profiles.map(p=>`<button type="button" data-profile-use="${esc(p.id)}" class="${p.id===chat.activeProfileId?'selected':''}"><span>${esc(p.name)}</span><small>${esc(p.model)}</small></button>`).join('')||'<p class="model-menu-state">尚未保存配置</p>'}</div>`;
}
function renderChatModelMenu(){
  const menu=$('#chat-model-menu');
  if(!cachedChatModels){menu.innerHTML=profileMenuHTML()+'<div class="model-menu-state">正在读取模型…</div>';return;}
  const filtered=cachedChatModels.filter(m=>`${m.id} ${m.name}`.toLowerCase().includes(chatModelSearch.toLowerCase())).slice(0,100);
  menu.innerHTML=profileMenuHTML()+`<label class="model-menu-search">切换模型<input id="chat-model-search" type="search" placeholder="搜索当前接口的模型" value="${esc(chatModelSearch)}" autocomplete="off"></label><div class="model-menu-list">${filtered.map(m=>`<button type="button" role="menuitem" data-chat-model="${esc(m.id)}" class="${m.id===state.settings.chat.model?'selected':''}"><span>${esc(m.name)}</span><small>${esc(m.id)}</small></button>`).join('')||'<p class="model-menu-state">没有匹配的模型</p>'}</div><button type="button" class="model-menu-settings" data-page="settings">管理模型配置 →</button>`;
}
async function toggleChatModelMenu(){
  const menu=$('#chat-model-menu');
  if(!menu.hidden){menu.hidden=true;modelButton.setAttribute('aria-expanded','false');return;}
  if(chatBusy){toast('当前回复结束后再切换模型');return;}
  menu.hidden=false;modelButton.setAttribute('aria-expanded','true');
  if(cachedModelProvider!==modelProviderKey()){cachedChatModels=null;cachedModelProvider=modelProviderKey();chatModelSearch='';}
  renderChatModelMenu();
  if(cachedChatModels){$('#chat-model-search')?.focus();return;}
  try{cachedChatModels=await call('models-list',{baseUrl:state.settings.chat.baseUrl,format:state.settings.chat.format||'openai'});if(menu.hidden)return;renderChatModelMenu();$('#chat-model-search')?.focus();}
  catch(error){if(menu.hidden)return;menu.innerHTML=profileMenuHTML()+`<p class="model-menu-state">${esc(error.message||'模型列表暂不可用')}</p><button type="button" class="model-menu-settings" data-page="settings">管理模型配置 →</button>`;}
}
async function refresh(force = false) {
  if(force)cachedChatModels=null;
  const seq = ++refreshSeq;
  const s = await call("state");
  if (seq !== refreshSeq) return;
  state = s;
  $("#todo-count").textContent = s.todos.filter(x => !x.legacyDdlId && !["done","cancelled"].includes(x.status)).length;
  $("#ddl-count")?.replaceChildren();
  if (force || page !== "settings") render();
  renderMessages();
}
const pageInfo = {
  today: ["今天", "随手记下，不必都是完成的事。"],
  calendar: ["日历日志", "按日期回看普通记录与完成事项。"],
  todo: ["Todo", "所有待办，按优先级排列。"],
  ddl: ["DDL", "截止时间与记录时间，分别排序。"],
  log: ["完成日志", "查看完成事项与统计。"],
  sources: ["Agent 记录", "从已启用的记录来源生成完成草稿。"],
  settings: ["设置", "模型、语音与宠物外观。"]
};
function navigate(next) {
  page = next;
  search = "";
  filter = "active";
  $$("button[data-page]").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === next),
  );
  render();
  $("main").scrollTop = 0;
}
function render() {
  if (!state) return;
  const quick=$('#quick-record'),draft=quick?{date:quick.dataset.date,value:quick.elements.recordTitle.value}:null;
  document.body.dataset.page=page;
  const [title, sub] = pageInfo[page];
  $("#page-title").textContent = title;
  $("#subtitle").textContent = sub;
  $("#today-date").textContent = page === "today" ? new Date().toLocaleDateString("zh-CN", {month:"long",day:"numeric"})+' · '+new Date().toLocaleDateString('zh-CN',{weekday:'short'}) : "";
  const model=state.settings.chat.model||"未配置模型";
  $("#model-label").textContent = model.includes("luna")?"Luna":model.split("/").at(-1);
  $("#model-label").title=model;
  $("#completion-count").hidden=true;
  $("#completion-count").textContent=`已完成 ${state.stats.today} 项`;
  $("#add-main").hidden = ["settings", "sources"].includes(page);
  $("#add-main").title = page === "log" ? "＋ 记录完成" : ['today','calendar'].includes(page) ? "＋ 添加今日行动" : "＋ 添加长期 Todo";
  $("#add-main").setAttribute("aria-label",$("#add-main").title);
  $("#add-main").textContent="＋";
  $("#view").innerHTML = {
    today: todayView,
    calendar: calendarView,
    todo: () => tableView("todo"),
    ddl: () => tableView("ddl"),
    log: logView,
    sources: sourcesView,
    settings: settingsView,
  }[page]();
  const newQuick=$('#quick-record');if(draft&&newQuick?.dataset.date===draft.date)newQuick.elements.recordTitle.value=draft.value;
  if (page === "settings") loadPetChoices();
}
function empty(title, body = "", kind) {
  return `<div class="empty"><span class="empty-icon">${kind === "ddl" ? "◷" : "✧"}</span>${esc(title)}${body ? "<br>" + esc(body) : ""}${kind ? `<br><button data-add="${kind}">＋ ${kind === "ddl" ? "添加 DDL" : kind === "log" ? "记下一项完成" : "添加第一条待办"}</button>` : ""}</div>`;
}
function statsView() {
  return `<div class="stats"><div class="stat"><small>今日完成</small><strong>${state.stats.today}</strong></div><div class="stat"><small>本周完成</small><strong>${state.stats.week}</strong></div><div class="stat"><small>待办事项</small><strong>${state.todos.filter((t) => t.status !== "done").length}</strong></div><div class="stat"><small>进行中的 DDL</small><strong>${state.ddls.filter((t) => t.status === "open").length}</strong></div></div>`;
}
function dueLabel(d) {
  if (d.status === "done") return '<span class="tag green">已完成</span>';
  if (d.status === "cancelled") return '<span class="tag">已取消</span>';
  const hours = (Date.parse(d.dueAt) - Date.now()) / 3600000;
  if (hours < 0)
    return `<span class="tag danger">逾期 ${Math.max(1, Math.ceil(-hours / 24))} 天</span>`;
  return `<span class="tag ${hours < 24 ? "high" : ""}">${hours < 1 ? "不足 1 小时" : hours < 24 ? `剩 ${Math.ceil(hours)} 小时` : `剩 ${Math.ceil(hours / 24)} 天`}</span>`;
}
function taskRow(t) {
  const linked = state.ddls.find((d) => d.id === t.ddlId);
  return `<div class="task-row"><button class="check ${t.status === "done" ? "done" : ""}" data-complete="${t.id}" data-kind="todo" title="${t.status === "done" ? "重新打开" : "标记完成"}">${t.status === "done" ? "✓" : ""}</button><div class="row-title"><strong class="${t.status === "done" ? "done-text" : ""}">${esc(t.title)}</strong><small>${linked ? "◷ " + esc(linked.title) + " · " + fmt(linked.dueAt) : t.status === "doing" ? "进行中" : "待办"}</small></div>${t.priority === "high" ? '<span class="tag high">优先</span>' : ""}<button class="icon-button" data-edit="${t.id}" data-kind="todo" title="编辑">⋯</button></div>`;
}
function chart() {
  const max = Math.max(...state.stats.days.map((x) => x.count), 1);
  return `<div class="chart">${state.stats.days.map((d, i) => `<div class="chart-col" title="${d.date}"><span>${d.count}</span><div class="bar" style="height:${Math.max(3, (d.count / max) * 82)}px"></div><span>${i === 6 ? "今天" : d.date.slice(8) + "日"}</span></div>`).join("")}</div>`;
}
function todayView() {
  return `${state.recovered?'<p class="hint error">已从备份恢复数据，原文件已保留。</p>':''}${quickRecord(day(Date.now()))}${recordsView(day(Date.now()))}`;
}
function entriesFor(dateKey){
  const notes=state.notes||[];
  return [...notes.filter(n=>day(n.recordedAt)===dateKey).map(n=>({...n,kind:'note',at:n.recordedAt,done:n.status==='done'})),...state.logs.filter(l=>day(l.completedAt)===dateKey&&!notes.some(n=>n.id===l.entityId)).map(l=>({...l,kind:'log',at:l.completedAt,done:true}))].sort((a,b)=>b.at.localeCompare(a.at));
}
function quickRecord(dateKey){return `<form id="quick-record" class="quick-record" data-date="${dateKey}"><textarea name="recordTitle" rows="1" maxlength="300" aria-label="普通记录" placeholder="这一刻，记点什么…" required></textarea><button type="submit" title="保存普通记录，不计入完成统计">写下</button></form>`;}
function recordsView(dateKey){
  const entries=entriesFor(dateKey);
  return `<div class="daily-records">${entries.length?entries.map(n=>`<article class="daily-record ${n.done?'record-done':''}" data-record-id="${n.id}"><div class="record-content"><strong>${esc(n.title)}</strong>${n.notes?`<p>${esc(n.notes)}</p>`:''}<div class="record-meta"><time>${new Date(n.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</time><span>${n.done?'✓ 已完成':'普通记录'}</span></div></div><div class="row-actions">${n.kind==='note'?`<button data-complete="${n.id}" data-kind="note" title="${n.done?'改回普通记录':'标记为已完成'}" aria-label="${n.done?'改回普通记录':'标记为已完成'}">${n.done?'↶':'✓'}</button><button data-edit="${n.id}" data-kind="note" title="编辑记录" aria-label="编辑记录">✎</button><button data-delete="${n.id}" data-kind="note" title="删除记录" aria-label="删除记录">×</button>`:n.entityId?`<button data-edit="${n.entityId}" data-kind="${n.source}" title="查看原事项">↗</button>`:`<button data-edit="${n.id}" data-kind="log" title="编辑完成记录">✎</button><button data-delete="${n.id}" data-kind="log" title="删除完成记录">×</button>`}</div></article>`).join(''):empty(dateKey===day(Date.now())?'今天还没有记录':'这一天还没有记录','普通记录不会计入完成统计。')}</div>`;
}
function calendarView(){
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();const first=new Date(year,month,1),offset=(first.getDay()+6)%7;
  const cells=Array.from({length:42},(_,i)=>{const d=new Date(year,month,1-offset+i),key=day(d),entries=entriesFor(key),complete=entries.filter(e=>e.done).length;return `<button type="button" data-date="${key}" class="calendar-day ${d.getMonth()!==month?'outside':''} ${key===selectedDay?'selected':''} ${key===day(Date.now())?'is-today':''}" aria-pressed="${key===selectedDay}" aria-label="${key}，${entries.length} 条记录，${complete} 项完成"><span>${d.getDate()}</span><span class="day-dots">${entries.some(e=>!e.done)?'<i></i>':''}${complete?'<i class="complete-dot"></i>':''}</span></button>`;}).join('');
  const selected=entriesFor(selectedDay);
  return `<section class="calendar"><div class="calendar-month"><strong>${year} 年 ${month+1} 月</strong><div><button type="button" data-month="-1" aria-label="上个月">‹</button><button id="calendar-today" type="button">今天</button><button type="button" data-month="1" aria-label="下个月">›</button></div></div><div class="weekdays">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells}</div><div class="calendar-legend"><span><i></i>普通记录</span><span><i class="complete-dot"></i>已完成</span></div></section><div class="day-preview-heading"><h3>${selectedDay===day(Date.now())?'今天':selectedDay.replaceAll('-',' / ')}</h3><span>${selected.length} 条记录 · ${selected.filter(e=>e.done).length} 项完成</span></div>${quickRecord(selectedDay)}${recordsView(selectedDay)}`;
}

function tableView(kind) {
  const isDDL = kind === "ddl";
  let items = (isDDL ? state.ddls : state.todos).filter(
    (t) =>
      (filter === "all" ||
        (filter === "done"
          ? t.status === "done"
          : isDDL
            ? t.status === "open"
            : t.status !== "done")) &&
      (!search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.notes.toLowerCase().includes(search.toLowerCase())),
  );
  if (isDDL) {
    const [field, order] = sort.split("-");
    items.sort(
      (a, b) => (order === "asc" ? 1 : -1) * a[field].localeCompare(b[field]),
    );
  } else
    items.sort(
      (a, b) =>
        ({ high: 0, normal: 1, low: 2 })[a.priority] -
          { high: 0, normal: 1, low: 2 }[b.priority] ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return `<div class="toolbar"><div class="filter">${[
    ["active", "未完成"],
    ["done", "已完成"],
    ["all", "全部"],
  ]
    .map(
      ([v, l]) =>
        `<button data-filter="${v}" class="${filter === v ? "active" : ""}">${l}</button>`,
    )
    .join(
      "",
    )}</div><input id="search" placeholder="搜索标题或备注" value="${esc(search)}">${
    isDDL
      ? `<select id="ddl-sort" aria-label="DDL 排序">${[
          ["dueAt-asc", "截止时间 · 从近到远"],
          ["dueAt-desc", "截止时间 · 从远到近"],
          ["createdAt-desc", "记录时间 · 从新到旧"],
          ["createdAt-asc", "记录时间 · 从旧到新"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${sort === v ? "selected" : ""}>${l}</option>`,
          )
          .join("")}</select>`
      : ""
  }</div><section class="section"><div class="table-wrap"><table><thead><tr><th class="table-title">${isDDL ? "截止事项" : "待办事项"} · ${items.length}</th><th>${isDDL ? "截止时间" : "优先级 / 关联"}</th><th>${isDDL ? "记录时间" : "状态"}</th><th class="table-actions">操作</th></tr></thead><tbody>${items.map((t) => `<tr><td class="title-cell">${esc(t.title)}${t.notes ? `<div class="time">${esc(t.notes.slice(0, 80))}</div>` : ""}</td><td>${isDDL ? `<div class="time">${fmt(t.dueAt)}</div>${dueLabel(t)}` : `<span class="tag ${t.priority === "high" ? "high" : ""}">${{ high: "优先", normal: "普通", low: "稍后" }[t.priority]}</span><div class="time">${esc(state.ddls.find((d) => d.id === t.ddlId)?.title || "未关联 DDL")}</div>`}</td><td>${isDDL ? `<div class="time">${fmt(t.createdAt)}</div>` : `<span class="tag ${t.status === "done" ? "green" : ""}">${{ open: "待办", doing: "进行中", done: "已完成" }[t.status]}</span>`}</td><td><div class="row-actions"><button data-complete="${t.id}" data-kind="${kind}" title="${t.status === "done" ? "重新打开" : "完成"}">${t.status === "done" ? "↶" : "✓"}</button><button data-edit="${t.id}" data-kind="${kind}" title="编辑">✎</button><button data-delete="${t.id}" data-kind="${kind}" title="删除">×</button></div>${isDDL && t.status === "open" ? `<button class="link-button" style="margin-top:7px" data-snooze="${t.id}">1 小时后提醒</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${!items.length ? empty("这里还没有记录", filter === "active" ? "可以手动添加，也可以让Jot帮你记。" : "试试切换筛选条件。", filter === "active" ? kind : null) : ""}</section>${isDDL ? '<p class="hint">Todo 与 DDL 独立管理。完成关联待办后，DDL 仍需单独标记完成。</p>' : ""}${historyView()}`;
}
function logView() {
  const groups = new Map();
  for (const l of state.logs
    .slice()
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))) {
    const key = day(l.completedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  return `${statsView()}<p class="hint">累计 ${state.stats.total} 项完成。关联 Todo 已有完成日志时，DDL 的关闭记录不重复计入完成数量。</p>${groups.size ? [...groups].map(([d, logs]) => `<div class="log-date">${d} ${d === day(Date.now()) ? "· 今天" : ""}</div>${logs.map((l) => `<div class="log-item"><span style="color:#77956e">✓</span><div class="row-title"><strong>${esc(l.title)}</strong><small>${fmt(l.completedAt)} · ${{ todo: "Todo", ddl: "DDL 关闭", manual: "手动记录", agent: "Agent 摘要" }[l.source] || "记录"}</small>${l.notes ? `<p>${esc(l.notes)}</p>` : ""}${l.sourceRef ? `<small title="${esc(l.sourceRef)}">来源：${esc(l.sourceRef)}</small>` : ""}</div><div class="row-actions">${!l.entityId ? `<button data-edit="${l.id}" data-kind="log" title="编辑">✎</button><button data-delete="${l.id}" data-kind="log" title="删除">×</button>` : ""}</div></div>`).join("")}`).join("") : empty("还没有完成记录", "完成一个 Todo，或者补记今天已经做好的事。", "log")}${historyView()}`;
}
function historyView() {
  return `<details class="section"><summary>操作记录与撤销 · 最近 ${state.history.length} 条</summary>${state.history.length ? state.history.map((h) => `<div class="history-row"><div>${esc(h.label)}<small>${fmt(h.at)}</small></div><button data-undo="${h.id}" ${h.undone ? "disabled" : ""}>${h.undone ? "已撤销" : "撤销"}</button></div>`).join("") : empty("暂无修改记录")}</details>`;
}
function sourcesView() {
  const pending = state.drafts.filter((d) => d.status === "pending");
  return `<section class="settings-section"><h3>连接本地的工作记录</h3><p>支持 Codex / Claude 的 JSONL 会话，以及 JSON 消息数组、Markdown 和文本。只读取你启用的来源；汇总时，会把用户与助手的文字发送到你配置的对话 API。工具调用和执行输出不会作为会话消息提取。</p><div class="settings-actions"><button data-source-add="folder">＋ 添加记录文件夹</button><button data-source-add="file">＋ 添加单个文件</button><button id="scan-sources" class="primary">汇总启用的来源</button></div><p class="hint">每次检查最近 30 个文件，每个文件最多 12MB，摘要使用末尾最多 80 条消息 / 24000 字。增量去重；结果先进入草稿。可在设置中开启每 15 分钟自动汇总。</p></section><section class="section">${state.sources.length ? state.sources.map((s) => `<div class="source"><strong>${esc(s.name)}</strong><span class="tag ${s.enabled ? "green" : ""}" style="float:right">${s.enabled ? "已启用" : "未启用"}</span><p>${esc(s.path)}</p><p>${s.lastScan ? "上次汇总：" + fmt(s.lastScan) : "尚未汇总"}</p>${s.error ? `<p class="error">${esc(s.error)}</p>` : ""}<div class="settings-actions"><button data-source-toggle="${s.id}">${s.enabled ? "停用" : "启用并允许发送文本"}</button><button data-source-remove="${s.id}">移除来源</button></div></div>`).join("") : empty("尚未连接记录来源", "选择你希望Jot帮你整理的文件或文件夹。")}</section><section class="section"><div class="section-title"><h3>待确认的完成事项 <small>${pending.length} 条</small></h3></div>${pending.length ? pending.map((d) => `<article class="draft"><strong>${esc(d.title)}</strong><blockquote>${esc(d.evidence)}</blockquote><small>来源：${esc(d.sourceRef)}</small><small>${fmt(d.completedAt)}${d.dateEstimated ? " · 日期暂用文件更新时间，采纳后可编辑" : ""}</small><div class="settings-actions"><button class="primary" data-draft-accept="${d.id}">采纳到完成日志</button><button data-draft-dismiss="${d.id}">忽略</button></div></article>`).join("") : empty("这里会出现有原文依据的完成草稿", "仅讨论、计划或失败的尝试，不会直接计入统计。")}</section>`;
}
function settingsView() {
  const s=state.settings;
  const capsuleNames={black:'Black Default',white:'White Default','black-logo':'Black Classic','white-logo':'White Classic'};
  const capsuleTheme=s.capsuleTheme||'black';
  const capsuleLogo=capsuleTheme.endsWith('-logo');
  const petPreview=state.petData&&!s.minimal
    ? `<div class="preview-sprite" style="background-image:url('${esc(state.petData.url)}');background-size:${state.petData.rows?'496px '+(67*state.petData.rows)+'px':'contain'}"></div>`
    : `<div class="capsule-preview ${capsuleTheme.startsWith('white')?'white':''}">${capsuleLogo?'<img class="capsule-preview-logo" src="../assets/jot-mark.svg" alt="">':'<span class="capsule-preview-wordmark">Jot</span>'}<span>≋</span><span>⌄</span></div>`;
  return `<div class="settings-links"><button data-page="log">完成日志与统计</button><button data-page="sources">Agent 记录来源</button></div>
  <form id="settings-form">
  <section class="settings-section"><h3>对话模型</h3><p>兼容 Chat Completions 工具调用。密钥加密保存在本机，留空可保持现有密钥。</p>
    <label>API Base URL<input name="chatBase" value="${esc(s.chat.baseUrl)}" placeholder="https://你的服务/v1"></label>
    <div class="form-grid"><label>模型名称<input name="chatModel" value="${esc(s.chat.model)}" placeholder="保留服务商要求的模型前缀"></label><label>API Key<input name="chatKey" type="password" autocomplete="off" placeholder="${s.chat.hasKey?'已保存，留空保持不变':'输入你的密钥'}"></label></div>
    <label class="inline-check"><input name="clearChatKey" type="checkbox">清除已保存的对话密钥</label>
  </section>
  <section class="settings-section"><h3>Jot 风格与 System Prompt</h3><p>风格决定语气；下面的提示词可补充或覆盖风格偏好。任务独立性、可用工具和撤销逻辑不变。保存后从下一条消息生效，不影响 Agent 来源摘要。</p>
    <label>对话风格<select name="chatStyle">${[['jot','Jot · 简洁清晰'],['warm','温和陪伴'],['precise','严谨执行'],['custom','自定义']].map(([v,l])=>`<option value="${v}" ${(s.chat.style||'jot')===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>自定义 System Prompt<textarea class="prompt-editor" name="systemPrompt" maxlength="8000" rows="6" placeholder="例如：用中文回答，先给结论；称呼我为同学。不要主动添加未要求的任务。">${esc(s.chat.systemPrompt||'')}</textarea></label>
    <p class="hint">最多 8000 字。仅存本机，聊天请求会发送到你配置的模型服务；不要填写密码或其他密钥。</p>
  </section>
  <section class="settings-section"><h3>宠物外观</h3><p>默认胶囊安静地待在桌面，也可导入 Codex Pet 的 pet.json 或精灵图。</p>
    <div class="skin-preview">${petPreview}<div><strong>${s.minimal?(capsuleNames[capsuleTheme]||'Black Default'):esc(s.pet?.name||'Black Default')}</strong><small>${s.minimal||!s.pet?'打开、语音、展开；可拖动，无持续动画。':'Codex 兼容皮肤，可随时切回默认胶囊。'}</small></div></div>
    <div class="settings-actions capsule-choices">${Object.entries(capsuleNames).map(([id,name])=>`<button type="button" data-capsule-theme="${id}" class="${s.minimal&&capsuleTheme===id?'selected':''}">${name}</button>`).join('')}</div>
    <div class="skin-selection"><select id="codex-pet-choice" aria-label="本机 Codex 宠物"><option value="">正在读取本机 Codex Pet…</option></select><button type="button" id="use-codex-pet">使用此皮肤</button></div>
    <div class="settings-actions"><button type="button" id="import-pet">从文件导入</button><button type="button" id="restore-pet" ${!s.pet?'disabled':''}>恢复导入的皮肤</button></div>
    <label class="inline-check"><input type="checkbox" name="motion" ${s.motion?'checked':''}>启用宠物动画与视线跟随</label>
    <label class="inline-check"><input type="checkbox" name="alwaysOnTop" ${s.alwaysOnTop?'checked':''}>面板始终置顶</label>
    <p class="hint">打开面板：Ctrl + Shift + J ${state.shortcutStatus.panel===false?'（已被占用）':''}<br>开始 / 停止语音：Ctrl + Shift + Space ${state.shortcutStatus.voice===false?'（已被占用）':''}</p>
  </section>
  <section class="settings-section"><h3>语音识别</h3><p>录音后先校对文字，再发送。语音与对话分别配置；对话 Key 不会自动用于听写。</p>
    <label>识别方式<select name="speechMode" id="speech-mode"><option value="cloud" ${s.speech.mode==='cloud'?'selected':''}>云端 API</option><option value="local" ${s.speech.mode==='local'?'selected':''}>本地 Whisper · 离线</option></select></label>
    <div id="speech-cloud" ${s.speech.mode==='local'?'hidden':''}>
      <div class="settings-actions"><button type="button" id="groq-preset">填入 Groq 听写预设</button></div>
      <p class="hint">需单独申请语音 API Key。云端模式将音频发送到这里配置的服务。</p>
      <label>语音 API Base URL<input name="speechBase" value="${esc(s.speech.baseUrl)}"></label>
      <div class="form-grid"><label>语音模型<input name="speechModel" value="${esc(s.speech.model)}"></label><label>语音 API Key<input name="speechKey" type="password" autocomplete="off" placeholder="${s.speech.hasKey?'已保存，留空保持不变':'输入语音服务密钥'}"></label></div>
      <label class="inline-check"><input name="clearSpeechKey" type="checkbox">清除已保存的语音密钥</label>
    </div>
    <div id="speech-local" ${s.speech.mode!=='local'?'hidden':''}>
      <label>本地识别程序<div class="path-row"><input name="speechExe" value="${esc(s.speech.exe)}" placeholder="whisper-cli.exe"><button type="button" data-pick="exe">选择</button></div></label>
      <label>模型文件<div class="path-row"><input name="speechModelPath" value="${esc(s.speech.modelPath)}" placeholder="ggml-base.bin"><button type="button" data-pick="modelPath">选择</button></div></label>
      <p class="hint">需安装 whisper.cpp Windows 程序和多语言 ggml 模型。tiny 约 75 MiB，base 约 142 MiB。不要选择英语专用的 .en 模型。</p>
    </div>
  </section>
  <section class="settings-section"><h3>提醒与自动汇总</h3>
    <label class="inline-check"><input type="checkbox" name="notifications" ${s.notifications?'checked':''}>截止前 24 小时与逾期时提醒</label>
    <div class="form-grid"><label>免打扰开始（小时）<input name="quietStart" type="number" min="0" max="23" value="${s.quietStart}"></label><label>免打扰结束（小时）<input name="quietEnd" type="number" min="0" max="23" value="${s.quietEnd}"></label></div>
    <p class="hint">相同起止小时代表不设免打扰；应用运行期间处理提醒。</p>
    <label class="inline-check"><input type="checkbox" name="autoSummarize" ${s.autoSummarize?'checked':''}>每 15 分钟汇总已启用的 Agent 来源</label>
  </section><button type="submit" class="primary">保存所有设置</button></form>
  <section class="settings-section" style="margin-top:20px"><h3>数据与备份</h3><p>数据本地保存。导出不含 API 密钥；备份和操作记录保留在数据文件夹。</p><div class="settings-actions"><button data-export="json">导出 JSON</button><button data-export="md">导出完成日志</button><button data-export="csv">导出 CSV</button><button id="open-data">打开数据文件夹</button></div><p class="hint">Jot 0.6.4</p></section><div class="jot-settings-footer"><span class="github-pending" title="GitHub 仓库建立后开放" aria-label="GitHub 仓库即将开放"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.1c-3.1.67-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1 1.94-.7 2.2-1.1.1-.72.39-1.21.71-1.49-2.48-.28-5.1-1.24-5.1-5.49 0-1.21.43-2.2 1.15-2.98-.12-.28-.5-1.41.11-2.94 0 0 .94-.3 3.06 1.14A10.6 10.6 0 0 1 12 6.04c.94 0 1.88.13 2.76.37 2.12-1.44 3.05-1.14 3.05-1.14.61 1.53.23 2.66.11 2.94.72.78 1.15 1.77 1.15 2.98 0 4.26-2.62 5.2-5.12 5.48.4.34.76 1.01.76 2.04v3.28c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg><span>GitHub · 即将开放</span></span></div>`;
}
async function loadPetChoices() {
  try {const pets=await call("pet-list"),el=$("#codex-pet-choice");if(!el)return;el.innerHTML=pets.length?pets.map(p=>`<option value="${esc(p.id)}" ${p.error?'disabled':''}>${esc(p.name)}${p.error?' · 格式错误':''}</option>`).join(""):'<option value="">没有找到本机 Codex Pet，请从文件导入</option>';}catch(e){fail(e);}
}
let chatLayoutRequest=0;
function expandChat(expanded) {
  const request=++chatLayoutRequest;
  $(".app").classList.toggle("chat-expanded",expanded);
  if(!expanded)$(".app").classList.remove("chat-overlay");
  $("#messages").hidden=!expanded;
  $("#chat-toggle").setAttribute("aria-expanded",String(expanded));
  $("#chat-toggle").setAttribute("aria-label",expanded?"收起对话":"展开右侧对话");
  call("panel-chat-layout",expanded).then(layout=>{
    if(request===chatLayoutRequest)$(".app").classList.toggle("chat-overlay",expanded&&layout.overlay);
  }).catch(fail);
  if(expanded)$("#messages").scrollTop=$("#messages").scrollHeight;
}

function renderMessages() {
  const el = $("#messages");
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  const contextBadge=$("#chat-context-count");
  if(contextBadge)contextBadge.textContent=`对话 ${Math.min(state.messages.length,20)}/20`;
  el.innerHTML = state.messages.length
    ? state.messages
        .slice(-80)
        .map(
          (m) =>
            `<div class="message ${m.role}"><small>${m.role === "assistant" ? "Jot" : "你"} · ${fmt(m.at)}</small><div class="message-body">${m.role === "assistant" ? renderMarkdown(m.content) : esc(m.content)}</div>${m.eventIds?.length?`<div class="chat-changes"><span>已修改 ${m.eventIds.length} 项 · 可撤销</span>`:''}${(
              m.eventIds || []
            )
              .map((id) => {
                const h = state.history.find((x) => x.id === id);
                return h
                  ? `<button data-undo="${id}" ${h.undone ? "disabled" : ""}>${h.undone ? "已撤销" : "撤销：" + esc(h.label)}</button>`
                  : "";
              })
              .join("")}${m.eventIds?.length?'</div>':''}</div>`,
        )
        .join("")
    : '<div class="chat-welcome"><p>可以这样开始：</p><button class="suggestion" data-suggestion="今天有哪些行动？">查看今天的安排</button><button class="suggestion" data-suggestion="今天提醒我整理实验图表">添加今日行动</button><button class="suggestion" data-suggestion="记入完成日志：今天读完了一篇论文">记下一项完成</button></div>';
  if(liveReply){const bubble=document.createElement('div');bubble.className='message assistant';bubble.id='streaming-reply';const label=document.createElement('small');label.textContent=liveReply.status;const body=document.createElement('div');body.className='message-body';body.innerHTML=renderMarkdown(liveReply.text);bubble.append(label,body);el.append(bubble);}
  if (nearBottom || chatBusy) el.scrollTop = el.scrollHeight;
}
const markdownRenderer=window.markdownit?.({html:false,linkify:false,breaks:true}).disable(['link','image','autolink']);
function renderMarkdown(value){
  const source=String(value??'');
  if(!markdownRenderer||!window.DOMPurify)return esc(source);
  return window.DOMPurify.sanitize(markdownRenderer.render(source),{ALLOWED_TAGS:['p','br','strong','em','s','del','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','hr','table','thead','tbody','tr','th','td'],ALLOWED_ATTR:[]});
}
window.shiban.on('chat-progress',p=>{
  if(p.done)liveReply=null;
  else {if(p.reset||!liveReply)liveReply={text:'',status:'正在回复…'};if(p.text)liveReply.text+=p.text;if(p.status)liveReply.status=p.status;}
  if(state)renderMessages();
});
function editor(kind, id) {
  const f = $("#edit-form"),
    item = id
      ? state[{ todo: "todos", today:"todayActions", ddl: "ddls", log: "logs",note:"notes" }[kind]].find(
          (x) => x.id === id,
        )
      : null;
  f.reset();
  f.elements.id.value = id || "";
  f.elements.kind.value = kind;
  $("#edit-title").textContent =
    (id ? "编辑" : "添加") +
    { todo: "长期 Todo", today:"今日行动", ddl: " DDL", log: "完成日志",note:"普通记录" }[kind];
  f.elements.title.value = item?.title || "";
  f.elements.notes.value = item?.notes || "";
  $("#task-fields").hidden = ['log','note'].includes(kind);
  $("#recorded-field").hidden=kind!=='note';
  f.elements.recordedAt.required=kind==='note';
  f.elements.recordedAt.value=localTime(item?.recordedAt || (page==='calendar'?new Date(selectedDay+'T12:00:00'):Date.now()));
  $("#priority-field").hidden = kind !== "todo";
  $("#today-day-field").hidden = kind !== "today";
  $("#today-link-field").hidden = kind !== "today";
  $("#due-field").hidden = kind !== "ddl";
  $("#completed-field").hidden = kind !== "log";
  $("#planned-field").hidden = true;
  $("#completion-note-field").hidden = !['todo','today'].includes(kind);
  $("#due-field").hidden = kind !== "todo";
  f.elements.dueAt.required = false;
  f.elements.completedAt.required = kind === "log";
  f.elements.status.innerHTML = (
    kind === "today" ? [["open","未完成"],["done","已完成"]] : kind === "ddl"
      ? [
          ["open", "未结束"],
          ["done", "已完成"],
          ["cancelled", "已取消"],
        ]
      : [
          ["open", "待办"],
          ["doing", "进行中"],
          ["done", "已完成"],
          ["cancelled", "已取消"],
        ]
  )
    .map(([v, l]) => `<option value="${v}">${l}</option>`)
    .join("");
  f.elements.status.value = item?.status || "open";
  f.elements.priority.value = item?.priority || "normal";
  f.elements.plannedDate.value = item?.plannedDate || "";
  f.elements.actionDay.value = item?.day || (page === 'calendar' ? selectedDay : day(Date.now()));
  f.elements.todoId.innerHTML = '<option value="">不关联</option>' + state.todos.filter(t=>!t.legacyDdlId&&t.status!=='cancelled').map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('');
  f.elements.todoId.value = item?.todoId || '';
  f.elements.dueAt.value = item?.dueAt ? localTime(item.dueAt) : "";
  f.elements.completionNote.value = item?.completionNote || "";
  f.elements.completedAt.value = localTime(item?.completedAt);
  $("#editor").showModal();
  f.elements.title.focus();
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.page) {
      $('#chat-model-menu').hidden=true;modelButton.setAttribute('aria-expanded','false');
      navigate(b.dataset.page);
      return;
    }
    if(b.dataset.profileUse){
      if(chatBusy){toast('当前回复结束后再切换配置');return;}
      await call('profile-use',b.dataset.profileUse);
      cachedChatModels=null;$('#chat-model-menu').hidden=true;modelButton.setAttribute('aria-expanded','false');
      await refresh();render();toast('已切换模型配置');return;
    }
    if(b.dataset.chatModel){
      if(chatBusy){toast('当前回复结束后再切换模型');return;}
      await call('settings',{chat:{model:b.dataset.chatModel}});
      $('#chat-model-menu').hidden=true;modelButton.setAttribute('aria-expanded','false');
      await refresh();toast('已切换对话模型');return;
    }
    if(b.dataset.date){selectedDay=b.dataset.date;calendarMonth=new Date(selectedDay+'T12:00:00');calendarMonth.setDate(1);render();return;}
    if(b.dataset.month){calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+Number(b.dataset.month),1);render();return;}
    if(b.id==='calendar-today'){selectedDay=day(Date.now());calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();return;}
    if (b.dataset.add) {
      editor(b.dataset.add);
      return;
    }
    if (b.dataset.edit) {
      editor(b.dataset.kind, b.dataset.edit);
      return;
    }
    if (b.dataset.filter) {
      filter = b.dataset.filter;
      render();
      return;
    }
    if (b.dataset.undo) {
      await call("undo", b.dataset.undo);
      toast("已撤销");
      await refresh();
      return;
    }
    if (b.dataset.complete) {
      const kind = b.dataset.kind,
        item = state[{todo:'todos',today:'todayActions',ddl:'ddls',note:'notes'}[kind]].find(
          (x) => x.id === b.dataset.complete,
        );
      const id = await call("action", {
        kind,
        op: "update",
        id: item.id,
        data: { status: item.status === "done" ? "open" : "done" },
      });
      toast(item.status === "done" ? "已重新打开" : "已记录完成", id);
      await refresh();
      return;
    }
    if (b.dataset.delete) {
      const id = await call("action", {
        kind: b.dataset.kind,
        op: "delete",
        id: b.dataset.delete,
      });
      toast("记录已删除，可撤销", id);
      await refresh();
      return;
    }
    if (b.dataset.draftAccept || b.dataset.draftDismiss) {
      const id = await call("action", {
        kind: "draft",
        op: b.dataset.draftAccept ? "accept" : "dismiss",
        id: b.dataset.draftAccept || b.dataset.draftDismiss,
      });
      toast(b.dataset.draftAccept ? "已加入完成日志" : "已忽略草稿", id);
      await refresh();
      return;
    }
    if (b.dataset.sourceAdd) {
      await call("source-add", b.dataset.sourceAdd);
      return;
    }
    if (b.dataset.sourceToggle) {
      await call("source-toggle", b.dataset.sourceToggle);
      return;
    }
    if (b.dataset.sourceRemove) {
      await call("source-remove", b.dataset.sourceRemove);
      return;
    }
    if (b.dataset.snooze) {
      await call("snooze", b.dataset.snooze);
      toast("已设置 1 小时后再提醒");
      return;
    }
    if (b.dataset.export) {
      const result = await call("export", b.dataset.export);
      if (result) toast("已导出至 " + result);
      return;
    }
    if (b.dataset.pick) {
      const p = await call("pick-local", b.dataset.pick);
      if (p)
        $("#settings-form").elements[
          b.dataset.pick === "exe" ? "speechExe" : "speechModelPath"
        ].value = p;
      if(p)$("#settings-form").elements[b.dataset.pick === "exe" ? "speechExe" : "speechModelPath"].dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    if (b.dataset.suggestion) {
      $("#chat-input").value = b.dataset.suggestion;
      $("#chat-input").focus();
      return;
    }
    if (b.dataset.capsuleTheme) {
      await call("settings", { minimal: true, capsuleTheme: b.dataset.capsuleTheme });
      await refresh(true);
      toast("已切换 " + ({black:'Black Default',white:'White Default','black-logo':'Black Classic','white-logo':'White Classic'}[b.dataset.capsuleTheme]||'默认外观'));
      return;
    }
    switch (b.id) {
      case "add-main":
        editor(page === "log" ? "log" : ['today','calendar'].includes(page)?'today':"todo");
        break;
      case "edit-close":
      case "edit-cancel":
        $("#editor").close();
        break;
      case "hide":
        await call("panel-hide");
        break;
      case "minimize":
        await call("panel-minimize");
        break;
      case "maximize":
        await call("panel-maximize");
        break;
      case "chat-toggle":
        expandChat($("#messages").hidden);
        break;
      case "chat-launcher":
        expandChat(true);
        $('#chat-input').focus();
        break;
      case "chat-collapse-pill":
        expandChat(false);
        break;
      case "model-label":
        await toggleChatModelMenu();
        break;
      case "chat-close":
        expandChat(false);
        break;
      case "send":
        await send();
        break;
      case "record":
        await toggleRecord();
        break;
      case "cancel-chat":
        await call("cancel-chat");
        break;
      case "scan-sources":
        b.disabled = true;
        b.textContent = "正在汇总…";
        try {
          toast(await call("source-scan"));
        } finally {
          await refresh();
        }
        break;
      case "import-pet": {
        const name = await call("pet-import");
        if (name) toast("已导入 " + name);
        await refresh(true);
        break;
      }
      case "use-codex-pet": {
        const id=$("#codex-pet-choice").value;if(!id){toast("请先选择一个皮肤");break;}
        await call("pet-select",id);await refresh(true);toast("已切换宠物皮肤");break;
      }
      case "minimal-pet":await call("settings",{minimal:true});await refresh(true);toast("已切换 Jot 极简胶囊");break;
      case "restore-pet":await call("settings",{minimal:false});await refresh(true);toast("已恢复导入的皮肤");break;
      case "reset-pet":
        await call("pet-reset");
        await refresh(true);
        break;
      case "groq-preset": {
        const f = $("#settings-form");
        f.elements.speechBase.value = "https://api.groq.com/openai/v1";
        f.elements.speechModel.value = "whisper-large-v3-turbo";
        toast("预设已自动保存，请填写自己的语音 API Key");
        break;
      }
      case "open-data":
        await call("open-data");
        break;
    }
  } catch (err) {
    fail(err);
  }
});
document.addEventListener("input", (e) => {
  if(e.target.id==='chat-model-search'){
    const at=e.target.selectionStart;chatModelSearch=e.target.value;renderChatModelMenu();const input=$('#chat-model-search');input?.focus();input?.setSelectionRange(at,at);return;
  }
  if(e.target.matches('#quick-record textarea')){e.target.style.height='auto';e.target.style.height=Math.min(115,e.target.scrollHeight)+'px';}
  if (e.target.id === "search") {
    const start = e.target.selectionStart;
    search = e.target.value;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(start, start);
  }
});
document.addEventListener('click',e=>{if(!e.target.closest('#chat-model-menu,#model-label')){$('#chat-model-menu').hidden=true;modelButton.setAttribute('aria-expanded','false');}});
document.addEventListener("change", (e) => {
  if (e.target.id === "ddl-sort") {
    sort = e.target.value;
    localStorage.setItem("ddlSort", sort);
    render();
  }
  if (e.target.id === "speech-mode") {
    $("#speech-cloud").hidden = e.target.value === "local";
    $("#speech-local").hidden = e.target.value !== "local";
  }
});
$("#edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target,
    kind = f.elements.kind.value,
    id = f.elements.id.value,
    data = { title: f.elements.title.value, notes: f.elements.notes.value };
  if (!['log','note'].includes(kind)) data.status = f.elements.status.value;
  if(kind==='note')data.recordedAt=new Date(f.elements.recordedAt.value).toISOString();
  if (kind === "todo") {
    data.priority = f.elements.priority.value;
    data.dueAt = f.elements.dueAt.value ? new Date(f.elements.dueAt.value).toISOString() : null;
    data.completionNote = f.elements.completionNote.value;
  }
  if(kind==='today'){
    data.day=f.elements.actionDay.value;
    data.todoId=f.elements.todoId.value||null;
    data.completionNote=f.elements.completionNote.value;
  }
  if (kind === "ddl")
    data.dueAt = new Date(f.elements.dueAt.value).toISOString();
  if (kind === "log")
    data.completedAt = new Date(f.elements.completedAt.value).toISOString();
  try {
    const previousToday=kind==='today'&&!id?new Set(state.todayActions.map(x=>x.id)):null;
    const event = await call("action", {
      kind,
      op: id ? "update" : "add",
      id,
      data,
    });
    $("#editor").close();
    toast("已保存", event);
    await refresh();
    if(previousToday)jotSuggestNewToday(previousToday);
  } catch (err) {
    fail(err);
  }
});
document.addEventListener("submit", async (e) => {
  if(e.target.id==='quick-record'){
    e.preventDefault();const form=e.target,title=form.elements.recordTitle.value.trim();if(!title)return;
    const dateKey=form.dataset.date,stamp=dateKey===day(Date.now())?new Date():new Date(dateKey+'T12:00:00');
    const submit=form.querySelector('button');submit.disabled=true;form.elements.recordTitle.value='';
    try{const id=await call('action',{kind:'note',op:'add',data:{title,recordedAt:stamp.toISOString()}});toast('已记下',id);await refresh();}catch(err){fail(err);submit.disabled=false;const current=$('#quick-record');if(current?.dataset.date===dateKey)current.elements.recordTitle.value=title;}return;
  }
  if (e.target.id !== "settings-form") return;
  e.preventDefault();
  const f = e.target.elements;
  const settings = {
    chat: { baseUrl: f.chatBase.value, model: f.chatModel.value, format:f.chatFormat.value, style:f.chatStyle.value, systemPrompt:f.systemPrompt.value, memoryStable:f.memoryStable.value, memoryRecent:f.memoryRecent.value },
    speech: {
      mode: f.speechMode.value,
      baseUrl: f.speechBase.value,
      model: f.speechModel.value,
      exe: f.speechExe.value,
      modelPath: f.speechModelPath.value,
    },
    quietStart: Number(f.quietStart.value),
    quietEnd: Number(f.quietEnd.value),
  };
  for (const k of [
    "motion",
    "alwaysOnTop",
    "notifications",
    "autoSummarize",
  ])
    settings[k] = f[k].checked;
  if (f.chatKey.value || f.clearChatKey.checked)
    settings.chat.key = f.clearChatKey.checked ? "" : f.chatKey.value;
  if (f.speechKey.value || f.clearSpeechKey.checked)
    settings.speech.key = f.clearSpeechKey.checked ? "" : f.speechKey.value;
  try {
    await call("settings", settings);
    toast("设置已保存");
    await refresh(true);
  } catch (err) {
    fail(err);
  }
});
async function send() {
  const input = $("#chat-input").value.trim();
  if (!input || chatBusy || recording || transcribing) return;
  const previousToday=new Set(state.todayActions.map(x=>x.id));
  expandChat(true);
  chatBusy = true;
  $("#send").disabled = true;
  $("#send").hidden = true;
  $("#cancel-chat").hidden = false;
  $("#chat-input").value = "";
  try {
    await call("chat", input);
  } catch (e) {
    fail(e);
  } finally {
    chatBusy = false;
    liveReply = null;
    $("#send").disabled = false;
    $("#send").hidden = false;
    $("#cancel-chat").hidden = true;
    await refresh();
    jotSuggestNewToday(previousToday);
  }
}
$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
function voiceStatus(text) {
  $("#voice-status").hidden = !text;
  $("#voice-status").textContent = text;
}
function wav(chunks, rate) {
  const length = chunks.reduce((n, c) => n + c.length, 0),
    all = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  const size = Math.floor((length * 16000) / rate),
    buf = new ArrayBuffer(44 + size * 2),
    v = new DataView(buf);
  function str(o, s) {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  }
  str(0, "RIFF");
  v.setUint32(4, 36 + size * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, size * 2, true);
  for (let i = 0; i < size; i++) {
    const p = (i * rate) / 16000,
      lo = Math.floor(p),
      frac = p - lo,
      sample =
        (all[lo] || 0) * (1 - frac) +
        (all[Math.min(lo + 1, length - 1)] || 0) * frac;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return new Uint8Array(buf);
}
async function toggleRecord() {
  if (transcribing || startingRecord) return;
  expandChat(true);
  if (recording) {
    const r = recording;
    recording = null;
    clearInterval(r.tick);
    clearTimeout(r.limit);
    r.node.disconnect();
    r.source.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    await r.ctx.close();
    $("#record").classList.remove("recording");
    $("#record").innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
    await call("pet-state", "idle");
    if (!r.chunks.length) {
      voiceStatus("没有录到声音，请重试");
      return;
    }
    transcribing = true;
    $("#record").disabled = true;
    voiceStatus("正在识别，请稍等…");
    try {
      const result = await call("transcribe", wav(r.chunks, r.rate));
      if (!result.trim()) {
        voiceStatus("没有识别到文字，请重试");
        return;
      }
      $("#chat-input").value += ($("#chat-input").value ? "\n" : "") + result;
      voiceStatus("已转成文字。请校对后点击发送。");
      $("#chat-input").focus();
    } catch (e) {
      voiceStatus(e.message);
    } finally {
      transcribing = false;
      $("#record").disabled = false;
    }
    return;
  }
  if (
    state.settings.speech.mode === "cloud" &&
    (!state.settings.speech.baseUrl || !state.settings.speech.model)
  ) {
    toast("请先配置语音识别服务");
    navigate("settings");
    return;
  }
  let stream, ctx;
  startingRecord = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream),
      node = ctx.createScriptProcessor(4096, 1, 1),
      silent = ctx.createGain();
    silent.gain.value = 0;
    const chunks = [];
    node.onaudioprocess = (e) =>
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);
    const started = Date.now();
    recording = {
      stream,
      ctx,
      source,
      node,
      chunks,
      rate: ctx.sampleRate,
      tick: setInterval(
        () =>
          voiceStatus(
            `录音中 ${Math.floor((Date.now() - started) / 1000)} 秒 · 再次点击或按快捷键停止`,
          ),
        1000,
      ),
      limit: setTimeout(() => toggleRecord(), 90000),
    };
    $("#record").textContent = "■";
    $("#record").classList.add("recording");
    voiceStatus("录音中 · 再次点击停止");
    await call("pet-state", "listening");
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    await ctx?.close();
    voiceStatus("无法打开麦克风：" + e.message);
  } finally {
    startingRecord = false;
  }
}
window.shiban.on("changed", () => refresh().catch(fail));
window.shiban.on("record", () => toggleRecord().catch(fail));
window.addEventListener("beforeunload", () =>
  recording?.stream.getTracks().forEach((t) => t.stop()),
);
refresh().catch(fail);
