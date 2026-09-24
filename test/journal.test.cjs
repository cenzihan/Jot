const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {Store,stats}=require('../core');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jot-notes-'));try{return fn(new Store(dir),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('ordinary note is not a completion; completion/reopen/delete/undo are consistent',()=>fixture(s=>{
const note=s.act({kind:'note',op:'add',data:{title:'想到一个点子'}}).result;assert.equal(stats(s.state).today,0);assert.equal(s.state.logs.length,0);
const done=s.act({kind:'note',op:'update',id:note.id,data:{status:'done'}});assert.equal(stats(s.state).today,1);s.act({kind:'note',op:'update',id:note.id,data:{status:'done'}});assert.equal(s.state.logs.length,1);s.undo(done.event.id);assert.equal(s.state.logs.length,0);assert.equal(s.state.notes[0].status,'open');
s.act({kind:'note',op:'update',id:note.id,data:{status:'done'}});const deleted=s.act({kind:'note',op:'delete',id:note.id});assert.equal(s.state.notes.length,0);assert.equal(s.state.logs.length,0);s.undo(deleted.event.id);assert.equal(s.state.notes.length,1);assert.equal(s.state.logs.length,1);
s.act({kind:'note',op:'update',id:note.id,data:{status:'open'}});assert.equal(stats(s.state).today,0);
}));
test('old data migration preserves records, notes date survives restart, invalid date rolls back',()=>fixture((s,dir)=>{
const t=s.act({kind:'todo',op:'add',data:{title:'原待办'}}).result;const old=s.snapshot();delete old.notes;fs.writeFileSync(s.file,JSON.stringify(old));const migrated=new Store(dir);assert.deepEqual(migrated.state.todos,[t]);assert.deepEqual(migrated.state.notes,[]);
const recordedAt='2026-09-22T12:00:00+08:00';const n=migrated.act({kind:'note',op:'add',data:{title:'补记昨天',recordedAt}}).result;assert.equal(n.recordedAt,new Date(recordedAt).toISOString());migrated.act({kind:'note',op:'update',id:n.id,data:{status:'done'}});assert.equal(migrated.state.logs[0].completedAt,n.recordedAt);assert.equal(new Store(dir).state.notes[0].title,'补记昨天');const before=migrated.snapshot();assert.throws(()=>migrated.act({kind:'note',op:'update',id:n.id,data:{recordedAt:'nonsense'}}));assert.deepEqual(migrated.state,before);
}));
