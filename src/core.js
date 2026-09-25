'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const clone = value => structuredClone(value);
const iso = () => new Date().toISOString();
function text(value, name = '内容', max = 3000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`${name}不能为空，最多 ${max} 字`);
  return value.trim();
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('请提供有效的日期和时间');
  return new Date(value).toISOString();
}
function empty() { return {version:1,todos:[],todayActions:[],ddls:[],logs:[],notes:[],drafts:[],history:[],messages:[],sources:[],reminded:{},settings:{chat:{baseUrl:'',model:'',key:'',format:'openai',profiles:[],activeProfileId:null,memoryStable:'',memoryRecent:'',memoryAuto:true},speech:{mode:'cloud',baseUrl:'https://api.groq.com/openai/v1',model:'whisper-large-v3-turbo',key:'',exe:'',modelPath:''},pet:null,minimal:false,capsuleTheme:'black',motion:true,alwaysOnTop:false,notifications:true,quietStart:23,quietEnd:8,autoSummarize:false,position:null}}; }
class Store {
  constructor(dir) {
    this.dir=dir; this.file=path.join(dir,'data.json'); fs.mkdirSync(dir,{recursive:true});
    this.recovered=false;
    if(fs.existsSync(this.file)) {
      try {this.state=JSON.parse(fs.readFileSync(this.file,'utf8')); this.validate();}
      catch(e) {
        fs.copyFileSync(this.file,path.join(dir,`damaged-${Date.now()}.json`));
        const backups=fs.existsSync(path.join(dir,'backups'))?fs.readdirSync(path.join(dir,'backups')).sort().reverse():[];
        for(const f of backups) {try {this.state=JSON.parse(fs.readFileSync(path.join(dir,'backups',f),'utf8'));this.validate();this.recovered=true;break;}catch{}}
        if(!this.recovered) throw Error('本地数据损坏，已保留原文件；没有可用备份，请从导出文件恢复。');
      }
    } else this.state=empty();
    if(!this.state.notes)this.state.notes=[];
    if(!Array.isArray(this.state.notes))throw Error('普通记录格式无效');
    this.migrateUnifiedTodos();
    this.migrateTodayActions();
    this.save();
  }
  migrateUnifiedTodos() {
    if(this.state.migrations?.unifiedTodos) return;
    if(this.state.ddls.length && fs.existsSync(this.file)) {
      const backup=path.join(this.dir,`before-unified-todos-${Date.now()}.json`);
      fs.copyFileSync(this.file,backup);
    }
    const mappings=new Map();
    for(const d of this.state.ddls){
      const id=randomUUID(); mappings.set(d.id,id);
      this.state.todos.push({id,title:d.title,notes:d.notes||'',priority:'normal',status:d.status==='done'?'done':d.status==='cancelled'?'cancelled':'open',createdAt:d.createdAt||iso(),completedAt:d.status==='done'?d.completedAt||null:null,plannedDate:null,dueAt:d.dueAt||null,completionNote:'',legacyDdlId:d.id});
    }
    for(const l of this.state.logs)if(l.source==='ddl'&&mappings.has(l.entityId)){l.legacyDdlId=l.entityId;l.entityId=mappings.get(l.entityId);l.source='todo';}
    for(const t of this.state.todos){if(t.plannedDate===undefined)t.plannedDate=null;if(t.dueAt===undefined)t.dueAt=null;if(t.completionNote===undefined)t.completionNote='';}
    this.state.migrations={...this.state.migrations,unifiedTodos:true};
  }
  migrateTodayActions() {
    if(this.state.migrations?.todayActionsV1)return;
    if(fs.existsSync(this.file))fs.copyFileSync(this.file,path.join(this.dir,`before-today-actions-${Date.now()}.json`));
    this.state.todayActions=[];
    for(const todo of this.state.todos){
      if(todo.plannedDate&&todo.status!=='done'&&todo.status!=='cancelled')this.state.todayActions.push({id:randomUUID(),title:todo.title,notes:'',day:todo.plannedDate,todoId:todo.id,status:'open',createdAt:iso(),completedAt:null,completionNote:'',migratedFromPlannedDate:true});
    }
    this.state.migrations={...this.state.migrations,todayActionsV1:true};
  }
  validate() {if(this.state.version!==1 || ['todos','ddls','logs','drafts','history','messages','sources'].some(k=>!Array.isArray(this.state[k])) || (this.state.notes!==undefined&&!Array.isArray(this.state.notes)) || (this.state.todayActions!==undefined&&!Array.isArray(this.state.todayActions)) || !this.state.settings)throw Error('不支持的数据格式');}
  save() {
    const backups=path.join(this.dir,'backups'); fs.mkdirSync(backups,{recursive:true});
    const daily=path.join(backups,new Date().toISOString().slice(0,10)+'.json');
    if(!fs.existsSync(daily) && fs.existsSync(this.file) && !this.recovered)fs.copyFileSync(this.file,daily);
    const temp=this.file+'.tmp'; const fd=fs.openSync(temp,'w');
    try {fs.writeFileSync(fd,JSON.stringify(this.state,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temp,this.file);
  }
  snapshot(){return clone(this.state);}
  transaction(label,fn) {
    const original=clone(this.state); const keys=['todos','todayActions','ddls','logs','drafts','notes'];
    try {
      const result=fn(this.state); const changes=[];
      for(const key of keys){const before=new Map(original[key].map(x=>[x.id,x])),after=new Map(this.state[key].map(x=>[x.id,x]));
        for(const id of new Set([...before.keys(),...after.keys()])) if(JSON.stringify(before.get(id))!==JSON.stringify(after.get(id)))changes.push({key,id,before:before.get(id)||null,after:clone(after.get(id)||null)});
      }
      let event=null;
      if(changes.length){event={id:randomUUID(),label,at:iso(),changes,undone:false};this.state.history.push(event);}
      this.save();return {result,event};
    } catch(e){this.state=original;throw e;}
  }
  undo(id) {
    const event=this.state.history.find(x=>x.id===id);
    if(!event||event.undone)throw Error('该操作已经撤销或不存在');
    for(const c of event.changes){const current=this.state[c.key].find(x=>x.id===c.id)||null;if(JSON.stringify(current)!==JSON.stringify(c.after))throw Error('这些记录后来又被修改过，请先撤销后续修改');}
    const original=clone(this.state);
    try{for(const c of event.changes){this.state[c.key]=this.state[c.key].filter(x=>x.id!==c.id);if(c.before)this.state[c.key].push(clone(c.before));}event.undone=true;this.save();return event.label;}catch(e){this.state=original;throw e;}
  }
  act(action,origin='手动') {
    if(!action || !['todo','today','log','draft','note'].includes(action.kind))throw Error('无效的记录类型');
    if(!['add','update','delete','accept','dismiss'].includes(action.op))throw Error('无效的操作');
    const key={todo:'todos',today:'todayActions',ddl:'ddls',log:'logs',draft:'drafts',note:'notes'}[action.kind];
    return this.transaction(`${origin} · ${ {add:'新增',update:'修改',delete:'删除',accept:'采纳',dismiss:'忽略'}[action.op]}${ {todo:'长期待办',today:'今日行动',ddl:'截止事项',log:'完成日志',draft:'总结草稿',note:'普通记录'}[action.kind]}`,s=>{
      const a=action; let item=s[key].find(x=>x.id===a.id);
      if(a.op!=='add'&&!item)throw Error('找不到这条记录，请刷新后重试');
      if(a.kind==='draft') {
        if(a.op==='accept') {if(item.status!=='pending')throw Error('草稿已处理');s.logs.push({id:randomUUID(),title:item.title,completedAt:item.completedAt,createdAt:iso(),source:'agent',sourceRef:item.sourceRef,notes:item.evidence||'',entityId:null});item.status='accepted';return item;}
        if(a.op==='dismiss'){item.status='dismissed';return item;}throw Error('不支持的草稿操作');
      }
      if(a.op==='delete') {
        if(['note','today','todo'].includes(a.kind))s.logs=s.logs.filter(l=>l.entityId!==item.id);
        if(a.kind==='todo')for(const task of s.todayActions)if(task.todoId===item.id)task.todoId=null;
        if(a.kind==='ddl'){for(const t of s.todos)if(t.ddlId===item.id)t.ddlId=null;}
        if(a.kind==='log'&&item.entityId)throw Error('任务完成记录请通过重新打开原任务撤回');
        s[key]=s[key].filter(x=>x.id!==item.id);return item;
      }
      if(!['add','update'].includes(a.op))throw Error('不支持的操作');
      const p=a.data||{};
      if(a.kind==='note'){
        if(a.op==='add'){item={id:randomUUID(),title:text(p.title,'记录',300),notes:'',createdAt:iso(),recordedAt:p.recordedAt!==undefined?date(p.recordedAt):iso(),status:'open',completedAt:null};s.notes.push(item);}
        if(p.title!==undefined)item.title=text(p.title,'记录',300);
        if(p.notes!==undefined){if(typeof p.notes!=='string'||p.notes.length>10000)throw Error('备注过长');item.notes=p.notes;}
        if(p.recordedAt!==undefined)item.recordedAt=date(p.recordedAt);
        if(p.status!==undefined){if(!['open','done'].includes(p.status))throw Error('记录状态无效');item.status=p.status;}
        const existing=s.logs.find(l=>l.entityId===item.id);
        if(item.status==='done'){
          item.completedAt=p.completedAt!==undefined?date(p.completedAt):(item.completedAt||item.recordedAt);
          if(existing){existing.title=item.title;existing.notes=item.notes;existing.completedAt=item.completedAt;}
          else s.logs.push({id:randomUUID(),title:item.title,notes:item.notes,createdAt:iso(),completedAt:item.completedAt,entityId:item.id,source:'note'});
        }else{item.completedAt=null;s.logs=s.logs.filter(l=>l.entityId!==item.id);}
        return item;
      }
      if(a.op==='add') {item={id:randomUUID(),title:text(p.title,'标题',300),createdAt:iso(),notes:'',...(a.kind==='log'?{completedAt:iso(),source:'manual',entityId:null}:{status:'open',completedAt:null}),...(a.kind==='todo'?{priority:'normal',plannedDate:null,dueAt:null,completionNote:''}:{}),...(a.kind==='today'?{day:dayKey(new Date()),todoId:null,completionNote:''}:{})};s[key].push(item);}
      if(p.title!==undefined)item.title=text(p.title,'标题',300);
      if(p.notes!==undefined){if(typeof p.notes!=='string'||p.notes.length>10000)throw Error('备注过长');item.notes=p.notes;}
      if(a.kind==='log'){if(item.entityId)throw Error('请编辑关联任务');if(p.completedAt!==undefined)item.completedAt=date(p.completedAt);return item;}
      if(a.kind==='today'){
        if(p.day!==undefined){if(typeof p.day!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(p.day)||dayKey(new Date(p.day+'T12:00:00'))!==p.day)throw Error('行动日期无效');item.day=p.day;}
        if(p.todoId!==undefined){if(p.todoId!==null&&!s.todos.some(t=>t.id===p.todoId))throw Error('关联的 Todo 不存在');item.todoId=p.todoId;}
        if(p.completionNote!==undefined){if(typeof p.completionNote!=='string'||p.completionNote.length>10000)throw Error('完成说明过长');item.completionNote=p.completionNote.trim();}
      }
      if(a.kind==='ddl'&&p.dueAt!==undefined)item.dueAt=date(p.dueAt);
      if(a.kind==='todo'){
        if(p.priority!==undefined){if(!['low','normal','high'].includes(p.priority))throw Error('无效的优先级');item.priority=p.priority;}
        if(p.plannedDate!==undefined){if(p.plannedDate!==null&&(typeof p.plannedDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.plannedDate)||dayKey(new Date(p.plannedDate+'T12:00:00'))!==p.plannedDate))throw Error('计划日期无效');item.plannedDate=p.plannedDate;}
        if(p.dueAt!==undefined)item.dueAt=p.dueAt===null?null:date(p.dueAt);
        if(p.completionNote!==undefined){if(typeof p.completionNote!=='string'||p.completionNote.length>10000)throw Error('完成说明过长');item.completionNote=p.completionNote.trim();}
      }
      if(p.status!==undefined){if(!(a.kind==='todo'?['open','doing','done','cancelled']:['open','done','cancelled']).includes(p.status))throw Error('无效的状态');item.status=p.status;}
      const existing=s.logs.find(x=>x.entityId===item.id);
      if(item.status==='done'){
        item.completedAt=p.completedAt!==undefined?date(p.completedAt):(item.completedAt||iso());
        if(existing){existing.title=item.title;existing.completedAt=item.completedAt;existing.notes=item.completionNote||'';}else s.logs.push({id:randomUUID(),title:item.title,completedAt:item.completedAt,createdAt:iso(),source:a.kind,entityId:item.id,notes:item.completionNote||''});
      }else{item.completedAt=null;s.logs=s.logs.filter(x=>x.entityId!==item.id);}
      return item;
    });
  }
}
function dayKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function stats(state,now=new Date()) {
  const unique=new Set(state.logs.map(l=>l.entityId));
  const counted=state.logs.filter(l=>!((l.source==='ddl'||l.legacyDdlId)&&state.todos.some(t=>t.ddlId===(l.legacyDdlId||l.entityId)&&unique.has(t.id))));
  const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
  const days=Array.from({length:7},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-6+i);return {date:dayKey(d),count:counted.filter(l=>dayKey(l.completedAt)===dayKey(d)).length};});
  return {today:counted.filter(l=>dayKey(l.completedAt)===dayKey(now)).length,week:counted.filter(l=>new Date(l.completedAt)>=start&&new Date(l.completedAt)<=now).length,total:counted.filter(l=>new Date(l.completedAt)<=now).length,days};
}
module.exports={Store,empty,stats,dayKey,text,date};
