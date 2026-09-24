const api = window.shiban,
  root = document.querySelector("#pet"),
  canvas = document.querySelector("canvas"),
  ctx = canvas.getContext("2d");
let state = "idle",
  data = null,
  image = null,
  frame = 0,
  timer,
  restoreTimer,
  motion = true,
  loadedUrl = null,
  gaze = -1,
  skinEnabled = false;
const rows = {
  idle: 0,
  thinking: 7,
  listening: 6,
  celebrate: 4,
  waiting: 6,
  left: 2,
  right: 1,
};
const durations = [
  [280, 110, 110, 140, 140, 320],
  [120, 120, 120, 120, 120, 120, 120, 220],
  [120, 120, 120, 120, 120, 120, 120, 220],
  [140, 140, 140, 280],
  [140, 140, 140, 140, 280],
  [140, 140, 140, 140, 140, 140, 140, 240],
  [150, 150, 150, 150, 150, 260],
  [120, 120, 120, 120, 120, 220],
  [150, 150, 150, 150, 150, 280],
];
function animate() {
  clearTimeout(timer);
  ctx.clearRect(0, 0, 192, 208);
  if (!image || !image.complete || !skinEnabled) return;
  if (state === "idle" && motion && data.rows === 11 && gaze >= 0) {
    ctx.drawImage(image,(gaze%8)*192,(9+Math.floor(gaze/8))*208,192,208,0,0,192,208);
    return;
  }
  if (!data.rows) {
    ctx.drawImage(image, 0, 0, 192, 208);
    return;
  }
  const row = motion ? (rows[state] || 0) : 0;
  const times = durations[row];
  frame %= times.length;
  ctx.drawImage(image, frame * 192, row * 208, 192, 208, 0, 0, 192, 208);
  if (motion) {
    const duration = times[frame];
    frame++;
    timer = setTimeout(animate, duration);
  }
}
async function refresh() {
  const res = await api.call("state");
  if (!res.ok) return;
  const s = res.value;
  motion = s.settings.motion;
  root.classList.toggle("still", !motion);
  root.classList.toggle("dot", s.settings.minimal || !s.petData);
  root.classList.toggle("white", ["white", "white-logo"].includes(s.settings.capsuleTheme));
  root.classList.toggle("logo-skin", ["black-logo", "white-logo"].includes(s.settings.capsuleTheme));
  data = s.petData;
  const use = !!data && !s.settings.minimal;
  skinEnabled = use;
  if (!motion) frame = 0;
  canvas.hidden = !use;
  document.querySelector("#minimal").hidden = use;
  if (use && loadedUrl !== data.url) {
    loadedUrl = data.url;
    image = new Image();
    image.onload = animate;
    image.onerror = () => { canvas.hidden=true;document.querySelector("#minimal").hidden=false;document.querySelector("#pet-label").textContent="皮肤读取失败"; };
    image.src = data.url;
  } else if (use) animate();
  else clearTimeout(timer);
  const count = s.ddls.filter(
    (d) => d.status === "open" && Date.parse(d.dueAt) - Date.now() < 86400000,
  ).length;
  const badge = document.querySelector("#badge");
  badge.textContent = count;
  badge.hidden = !count;
}
function setState(next) {
  state = next;
  frame = 0;
  root.classList.remove(
    "idle",
    "thinking",
    "listening",
    "celebrate",
    "waiting",
    "left",
    "right",
  );
  root.classList.add(next);
  document.querySelector("#pet-label").textContent =
    {
      thinking: "想一想",
      listening: "听着呢",
      celebrate: "做得好",
      waiting: "看看 DDL",
    }[next] || "Jot";
  if (data) animate();
  clearTimeout(restoreTimer);
  if (["celebrate", "waiting"].includes(next))
    restoreTimer = setTimeout(() => setState("idle"), 4000);
}
let start = null,
  moved = false;
root.addEventListener("pointerdown", async (e) => {
  if (e.button !== 0) return;
  start = { x: e.screenX, y: e.screenY };
  moved = false;
  (e.target.closest('button')||root).setPointerCapture(e.pointerId);
  await api.call("pet-drag-start");
});
root.addEventListener("pointermove", (e) => {
  if (!start) return;
  if (Math.abs(e.screenX - start.x) + Math.abs(e.screenY - start.y) > 4)
    moved = true;
  if (moved) {
    if (state !== "left" && state !== "right")
      setState(e.screenX < start.x ? "left" : "right");
    api.call("pet-drag-move");
  }
});
root.addEventListener("pointerup", async () => {
  if (!start) return;
  start = null;
  await api.call("pet-drag-end");
  if (!moved && !pointerButton) await api.call("panel-toggle");
  setState("idle");
});
root.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  api.call("pet-menu");
});
api.on("changed", refresh);
api.on("pet-state", setState);
api.on("pet-gaze", ({x,y}) => {
  if(!skinEnabled || !motion || data?.rows!==11 || state!=="idle")return;
  const next=Math.hypot(x,y)<70?-1:Math.round(((Math.atan2(y,x)+Math.PI/2+2*Math.PI)%(2*Math.PI))/(Math.PI/8))%16;
  if(next!==gaze){gaze=next;animate();}
});
refresh();
let pointerButton=false;
root.addEventListener('pointerdown',e=>{pointerButton=!!e.target.closest('button');},true);
document.querySelector('#minimal').addEventListener('click',e=>{
  if(moved)return;
  const id=e.target.closest('button')?.id;
  if(id==='capsule-jot')api.call('panel-open');
  if(id==='capsule-expand')api.call('panel-toggle');
  if(id==='capsule-voice')api.call('panel-record');
});
