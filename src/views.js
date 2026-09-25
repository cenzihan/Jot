"use strict";
// v0.5 UI composition. Kept separate from the v0.4 renderer so migration stays reviewable.
document.querySelector('[data-page="ddl"]').hidden = true;
document.querySelector('#chat-input').rows = 2;
pageInfo.today = ['今天', '只放眼前要做的事。'];
pageInfo.todo = ['Todo', '长期目标与进度'];
pageInfo.calendar = ['日历', '按天、周、月查看安排与记录'];

const jotPresets = {
  custom: {name:'自定义',base:'',model:''},
  jot: {name:'Jot 当前接口',base:'https://cxapi.alvin.im/v1',model:'cx/gpt-5.6-luna'},
  deepseek: {name:'DeepSeek',base:'https://api.deepseek.com',model:'deepseek-v4-flash'},
  qwen: {name:'阿里云百炼 / 千问',base:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},
  siliconflow: {name:'硅基流动',base:'https://api.siliconflow.cn/v1',model:'deepseek-ai/DeepSeek-V4-Flash'},
  zhipu: {name:'智谱 GLM',base:'https://open.bigmodel.cn/api/paas/v4',model:''},
  openai: {name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-4.1-mini'},
  anthropic: {name:'Anthropic / Claude',base:'https://api.anthropic.com/v1',model:'claude-sonnet-4-6',format:'anthropic'},
};
const previousSettingsView=settingsView;
settingsView=function(){
  const s=state.settings;
  const options=Object.entries(jotPresets).map(([id,p])=>`<option value="${id}">${esc(p.name)}</option>`).join('');
  return previousSettingsView().replace('<label>API Base URL',`<label>接口格式<select name="chatFormat"><option value="openai" ${(s.chat.format||'openai')==='openai'?'selected':''}>OpenAI 兼容 · Chat Completions</option><option value="anthropic" ${s.chat.format==='anthropic'?'selected':''}>Anthropic · Messages</option></select></label><label>服务商预设<select id="chat-provider"><option value="">选择预设</option>${options}</select></label><p class="hint">预设只填地址、示例模型与格式，不代表服务免费。更改 API 地址会清除旧地址的已存密钥，请填写新密钥。</p><label>API Base URL`).replace('<label class="inline-check"><input name="clearChatKey"',`<div class="jot-model-discovery"><button type="button" id="load-models">读取可用模型</button><label id="model-picker-field" hidden>从接口选择模型<select id="model-picker"><option value="">先读取模型列表</option></select></label><p id="model-list-status" class="hint" role="status">若服务支持 GET /models，可读取并选择；不支持时仍可手填。</p></div><label class="inline-check"><input name="clearChatKey"`).replace('Jot 0.6.4','Jot 0.6.5');
};

function jotTasksFor(key){return state.todayActions.filter(t=>t.day===key).sort((a,b)=>(a.status==='done')-(b.status==='done')||a.createdAt.localeCompare(b.createdAt));}
const settingsViewWithProvider=settingsView;
settingsView=function(){return settingsViewWithProvider().replace('Jot 0.6.5','Jot 0.6.7');};
function jotTaskRow(t,kind='today'){
  const linked=t.todoId&&state.todos.find(x=>x.id===t.todoId);
  const subtitle=kind==='today'?(linked?'关联 '+linked.title:'独立行动'):(t.dueAt?'截止 '+fmt(t.dueAt):'没有截止时间');
  const suggestion=kind==='today'&&!linked&&t.status!=='done'&&jotLinkSuggestions.get(t.id);
  return `<article class="jot-task ${t.status==='done'?'jot-done':''}"><button class="jot-check" data-complete="${esc(t.id)}" data-kind="${kind}" aria-label="${t.status==='done'?'重新打开':'完成'} ${esc(t.title)}">${t.status==='done'?'✓':''}</button><div class="jot-task-body"><strong>${esc(t.title)}</strong><small>${esc(subtitle)}${t.completionNote&&t.status==='done'?' · 已填写完成说明':''}</small>${suggestion?`<div class="jot-link-suggestion"><span>可能关联「${esc(suggestion.title)}」${suggestion.reason?' · '+esc(suggestion.reason):''}</span><button data-link-accept="${esc(t.id)}">关联</button><button data-link-dismiss="${esc(t.id)}">忽略</button></div>`:''}</div><button class="jot-task-edit" data-edit="${esc(t.id)}" data-kind="${kind}" title="编辑与完成说明">···</button></article>`;
}
const jotLinkSuggestions=new Map();
let jotCompletedOpen=false;
async function jotSuggestNewToday(beforeIds){
  if(!state.settings.chat.baseUrl||!state.settings.chat.model)return;
  const added=state.todayActions.filter(x=>!beforeIds.has(x.id)&&!x.todoId&&x.status!=='done');
  for(const item of added.slice(0,4)){
    try{const result=await call('link-suggest',item.id);if(!result)continue;
      const current=state.todayActions.find(x=>x.id===item.id),todo=state.todos.find(x=>x.id===result.todoId);
      if(current&&!current.todoId&&current.status!=='done'&&todo){jotLinkSuggestions.set(item.id,{todoId:todo.id,title:todo.title,reason:result.reason});if(page==='today')render();}
    }catch{/* Linking is optional; a provider error must not interrupt saving. */}
  }
}
todayView=function(){
  const key=day(Date.now()), tasks=jotTasksFor(key),open=tasks.filter(t=>t.status!=='done'),done=tasks.filter(t=>t.status==='done');
  const progress=tasks.length?Math.round(done.length/tasks.length*100):0;
  return `<section class="jot-section"><div class="jot-section-head"><h3>今日行动</h3><span>${open.length?`先完成眼前的 ${open.length} 件事`:'今天的行动已完成'}</span></div><div class="jot-progress" role="progressbar" aria-label="今日行动进度" aria-valuenow="${done.length}" aria-valuemin="0" aria-valuemax="${tasks.length}"><span style="width:${progress}%"></span></div><div class="jot-task-list">${open.length?open.map(t=>jotTaskRow(t)).join(''):`<p class="jot-soft-empty">${tasks.length?'可以歇一会儿了。':'今天还没有行动。'}</p>`}</div><button class="jot-text-action" data-add="today">＋ 添加今日行动</button>${done.length?`<details class="jot-completed" ${jotCompletedOpen?'open':''}><summary>已完成 ${done.length} 项 <span>展开回看</span></summary>${done.map(t=>jotTaskRow(t)).join('')}</details>`:''}</section><section class="jot-section"><div class="jot-section-head"><h3>随手记录</h3><span>不计入完成</span></div>${quickRecord(key)}${recordsView(key)}</section>`;
};

let jotCalendarMode=localStorage.getItem('jotCalendarMode')||'month';
function jotCalendarEntries(key){
  const records=entriesFor(key);
  return [...jotTasksFor(key).map(t=>({title:t.title,kind:'today',id:t.id,done:t.status==='done'})),...records.filter(x=>x.kind==='note'||x.source==='agent'||x.source==='manual').map(x=>({title:x.title,kind:x.source==='agent'?'agent':x.done?'done':'note',id:x.id,done:x.done})),...state.todos.filter(t=>t.dueAt&&day(t.dueAt)===key&&!t.legacyDdlId).map(t=>({title:'截止 · '+t.title,kind:'deadline',id:t.id,done:t.status==='done',overdue:t.status==='open'&&new Date(t.dueAt).getTime()<Date.now()}))];
}
function jotCalendarCell(key,outside=false){const entries=jotCalendarEntries(key);return `<button data-date="${key}" class="jot-cal-cell ${outside?'outside':''} ${key===selectedDay?'selected':''} ${key===day(Date.now())?'is-today':''}" aria-label="${key}，${entries.length} 项"><span class="jot-cal-number">${Number(key.slice(-2))}</span>${entries.slice(0,3).map(e=>`<span class="jot-cal-item ${e.kind} ${e.done?'done':''} ${e.overdue?'overdue':''}" title="${esc(e.title)}">${esc(e.title)}</span>`).join('')}${entries.length>3?`<span class="jot-cal-more">＋${entries.length-3} 项</span>`:''}</button>`;}
function jotCalendarDetail(key){const entries=jotCalendarEntries(key);return `<div class="day-preview-heading"><h3>${key===day(Date.now())?'今天':key.replaceAll('-',' / ')}</h3><span>${entries.length} 项</span></div>${entries.filter(e=>e.kind==='today').map(e=>jotTaskRow(state.todayActions.find(t=>t.id===e.id))).join('')}${entries.filter(e=>e.kind==='deadline').map(e=>`<div class="jot-deadline">${esc(e.title)}</div>`).join('')}${quickRecord(key)}${recordsView(key)}`;}
calendarView=function(){
  const anchor=new Date(selectedDay+'T12:00:00'),year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();
  const viewSwitch=`<div class="jot-cal-switch">${[['day','日'],['week','周'],['month','月']].map(([v,l])=>`<button data-cal-mode="${v}" class="${jotCalendarMode===v?'active':''}">${l}</button>`).join('')}</div>`;
  let cells='',label='';
  if(jotCalendarMode==='month'){
    const first=new Date(year,month,1),offset=(first.getDay()+6)%7;
    const count=Math.ceil((offset+new Date(year,month+1,0).getDate())/7)*7;
    cells=Array.from({length:count},(_,i)=>{const d=new Date(year,month,1-offset+i),k=day(d);return jotCalendarCell(k,d.getMonth()!==month);}).join('');label=`${year} 年 ${month+1} 月`;
  } else if(jotCalendarMode==='week'){
    const monday=new Date(anchor);monday.setDate(anchor.getDate()-(anchor.getDay()+6)%7);
    cells=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return jotCalendarCell(day(d));}).join('');label=`${day(monday)} 起的一周`;
  }else{cells=jotCalendarCell(selectedDay);label=selectedDay.replaceAll('-',' / ');}
  return `<section class="jot-calendar"><div class="jot-calendar-toolbar"><strong>${label}</strong>${viewSwitch}<div class="jot-cal-arrows"><button data-cal-shift="-1" aria-label="上一${jotCalendarMode==='month'?'月':jotCalendarMode==='week'?'周':'天'}">‹</button><button id="calendar-today">今天</button><button data-cal-shift="1" aria-label="下一${jotCalendarMode==='month'?'月':jotCalendarMode==='week'?'周':'天'}">›</button></div></div><div class="jot-weekdays">${['一','二','三','四','五','六','日'].map(x=>`<span>${x}</span>`).join('')}</div><div class="jot-cal-grid ${jotCalendarMode}">${cells}</div><div class="jot-calendar-legend" aria-label="日历颜色说明"><span class="today">今日行动</span><span class="done">已完成</span><span class="note">随手记录</span><span class="agent">Agent 摘要</span><span class="deadline">Todo 截止</span><span class="overdue">已逾期</span></div></section><section class="jot-section">${jotCalendarDetail(selectedDay)}</section><button class="jot-week-review" data-week-review>让 Jot 回顾这一周 <span>↗</span></button>`;
};

tableView=function(){
  const all=state.todos.filter(t=>!t.legacyDdlId&&(filter==='all'||(filter==='done'?t.status==='done':!['done','cancelled'].includes(t.status)))&&(!search||`${t.title} ${t.notes||''}`.toLowerCase().includes(search.toLowerCase())));
  all.sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||b.createdAt.localeCompare(a.createdAt));
  return `<div class="toolbar"><div class="filter">${[['active','进行中'],['done','已完成'],['all','全部']].map(([v,l])=>`<button data-filter="${v}" class="${filter===v?'active':''}">${l}</button>`).join('')}</div><input id="search" placeholder="搜索长期目标" value="${esc(search)}"></div><div class="jot-todo-list">${all.map(t=>{const actions=state.todayActions.filter(a=>a.todoId===t.id),done=actions.filter(a=>a.status==='done').length;return `<article class="jot-todo-row">${jotTaskRow(t,'todo')}<div class="jot-todo-meta"><span>${actions.length?`${done} / ${actions.length} 次行动`:'尚无关联行动'}</span><span>${t.dueAt?'截止 '+fmt(t.dueAt):'无截止时间'}</span>${t.status==='done'?'<span>已完成</span>':t.status==='cancelled'?'<span>已取消</span>':''}<button data-delete="${esc(t.id)}" data-kind="todo" title="删除任务，可撤销">删除</button></div>${t.status==='done'&&t.completionNote?`<p class="jot-completion-note">完成说明：${esc(t.completionNote)}</p>`:''}</article>`;}).join('')||empty('还没有长期目标','点击右上角添加。','todo')}</div>`;
};

logView=function(){
  const items=entriesForAll();
  let lastDay='';
  return `<div class="jot-journal-head"><strong>${state.stats.total}</strong><span>累计完成 · 本周 ${state.stats.week} · 今天 ${state.stats.today}</span></div><div class="jot-timeline">${items.map(e=>{const key=day(e.at),heading=key!==lastDay?`<div class="jot-timeline-date">${key===day(Date.now())?'今天':key}</div>`:'';lastDay=key;const label=e.source==='agent'?'Agent 摘要':e.done?'已完成':'普通记录';return `${heading}<article class="jot-timeline-entry ${e.done?'is-done':''} ${e.source==='agent'?'is-agent':e.done?'is-complete':'is-note'}"><span class="jot-timeline-dot"></span><div><strong>${esc(e.title)}</strong><small>${label} · ${fmt(e.at)}${e.source==='today'?' · Today':e.source==='todo'?' · Todo':''}</small>${e.notes?`<p>${esc(e.notes)}</p>`:''}${e.sourceRef?`<small title="${esc(e.sourceRef)}">依据：${esc(e.sourceRef.split(/[\\/]/).at(-1))}</small>`:''}</div><div class="row-actions">${e.kind==='note'?`<button data-edit="${esc(e.id)}" data-kind="note" aria-label="编辑记录">✎</button>`:e.entityId?`<button data-edit="${esc(e.entityId)}" data-kind="${esc(e.source)}" aria-label="查看原事项">↗</button>`:`<button data-edit="${esc(e.id)}" data-kind="log" aria-label="编辑完成记录">✎</button>`}</div></article>`;}).join('')||empty('还没有记录','完成行动或随手写下一点什么。','log')}</div>${historyView()}`;
};
function entriesForAll(){
  const notes=(state.notes||[]).map(n=>({id:n.id,title:n.title,notes:n.notes,at:n.recordedAt,done:n.status==='done',kind:'note'}));
  const noteIds=new Set(notes.map(n=>n.id));
  const logs=state.logs.filter(l=>!noteIds.has(l.entityId)).map(l=>({...l,at:l.completedAt,done:true,kind:'log'}));
  return [...notes,...logs].sort((a,b)=>b.at.localeCompare(a.at));
}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.linkDismiss){jotLinkSuggestions.delete(b.dataset.linkDismiss);render();return;}
  if(b.dataset.linkAccept){const id=b.dataset.linkAccept,suggestion=jotLinkSuggestions.get(id);if(!suggestion)return;
    call('action',{kind:'today',op:'update',id,data:{todoId:suggestion.todoId}}).then(async event=>{jotLinkSuggestions.delete(id);toast('已关联 Todo，可撤销',event);await refresh();}).catch(fail);return;}
  if(b.dataset.weekReview!==undefined){const start=new Date(selectedDay+'T12:00:00');start.setDate(start.getDate()-(start.getDay()+6)%7);const end=new Date(start);end.setDate(start.getDate()+6);expandChat(true);$('#chat-input').value=`请根据已有记录回顾 ${day(start)} 至 ${day(end)} 这一周完成了什么、还有哪些长期 Todo 在推进。不要修改任何记录；没有依据的内容不要推断。`;$('#chat-input').focus();return;}
  if(b.id==='load-models'){
    const f=document.querySelector('#settings-form').elements,status=document.querySelector('#model-list-status');
    b.disabled=true;b.textContent='正在读取…';status.textContent='正在连接模型接口…';
    call('models-list',{baseUrl:f.chatBase.value,format:f.chatFormat.value,key:f.chatKey.value}).then(models=>{
      const picker=document.querySelector('#model-picker');
      picker.innerHTML='<option value="">选择模型</option>'+models.map(m=>`<option value="${esc(m.id)}">${esc(m.name===m.id?m.id:m.name+' · '+m.id)}</option>`).join('');
      document.querySelector('#model-picker-field').hidden=!models.length;
      status.textContent=models.length?`已读取 ${models.length} 个模型；选择后立即生效。模型列表不保证支持工具调用。`:'接口返回空列表，请手动填写模型名称。';
    }).catch(error=>{status.textContent=error.message||'读取失败，请手动填写模型名称。';}).finally(()=>{b.disabled=false;b.textContent='重新读取模型';});
  }
  if(b.dataset.calMode){jotCalendarMode=b.dataset.calMode;localStorage.setItem('jotCalendarMode',jotCalendarMode);render();}
  if(b.dataset.calShift){const d=new Date(selectedDay+'T12:00:00');if(jotCalendarMode==='month')d.setMonth(d.getMonth()+Number(b.dataset.calShift));else d.setDate(d.getDate()+Number(b.dataset.calShift)*(jotCalendarMode==='week'?7:1));selectedDay=day(d);calendarMonth=new Date(d.getFullYear(),d.getMonth(),1);render();}
});
document.addEventListener('toggle',e=>{if(e.target.matches?.('.jot-completed'))jotCompletedOpen=e.target.open;},true);
document.addEventListener('change',e=>{
  if(e.target.id==='model-picker'&&e.target.value){document.querySelector('#settings-form').elements.chatModel.value=e.target.value;document.querySelector('#model-list-status').textContent='模型已更新并自动保存。';commitSettings({chat:{model:e.target.value}});return;}
  if(e.target.id!=='chat-provider')return;
  const p=jotPresets[e.target.value];if(!p||e.target.value==='custom')return;
  const f=document.querySelector('#settings-form').elements;f.chatBase.value=p.base;f.chatModel.value=p.model;f.chatFormat.value=p.format||'openai';
  document.querySelector('#model-picker-field').hidden=true;
  commitSettings({chat:{baseUrl:p.base,model:p.model,format:p.format||'openai'}});
  toast('已切换服务商并自动保存；更改地址会清除旧密钥，请填写新密钥');
});
render();
