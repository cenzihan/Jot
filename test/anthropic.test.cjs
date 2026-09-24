const {test}=require('node:test'),assert=require('node:assert/strict');
const {toAnthropic,normalize,readAnthropic}=require('../src/anthropic');
const {Services}=require('../src/services');
const {Store}=require('../src/core');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('Anthropic request maps system, tool use and tool result',()=>{
  const body=toAnthropic([{role:'system',content:'规则'},{role:'user',content:'加任务'},{role:'assistant',content:null,tool_calls:[{id:'tool1',function:{name:'manage_record',arguments:'{"kind":"todo"}'}}]},{role:'tool',tool_call_id:'tool1',content:'{"ok":true}'}],null);
  assert.equal(body.system,'规则');assert.equal(body.messages[1].content[0].type,'tool_use');assert.equal(body.messages[2].content[0].type,'tool_result');
});
test('Anthropic plain response normalizes text and tools',()=>{
  const m=normalize({content:[{type:'text',text:'好的'},{type:'tool_use',id:'t1',name:'manage_record',input:{kind:'todo',op:'add',data:{title:'A'}}}]});
  assert.equal(m.content,'好的');assert.equal(JSON.parse(m.tool_calls[0].function.arguments).data.title,'A');
});
test('Anthropic SSE streams text and accumulates complete tool JSON',async()=>{
  const lines=[{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'已添加'}},{type:'content_block_start',index:1,content_block:{type:'tool_use',id:'t1',name:'manage_record',input:{}}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"kind":"todo",'}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'"op":"add","data":{"title":"A"}}'}},{type:'message_delta',delta:{stop_reason:'tool_use'}},{type:'message_stop'}];
  const payload=lines.map(x=>`event: ${x.type}\ndata: ${JSON.stringify(x)}\n\n`).join('');
  const response=new Response(payload,{headers:{'content-type':'text/event-stream'}});let text='';const m=await readAnthropic(response,x=>text+=x);
  assert.equal(text,'已添加');assert.equal(JSON.parse(m.tool_calls[0].function.arguments).data.title,'A');
  const interrupted=new Response(payload.replace('event: message_stop\ndata: {"type":"message_stop"}\n\n',''),{headers:{'content-type':'text/event-stream'}});
  await assert.rejects(readAnthropic(interrupted,()=>{}),/提前中断/);
});
test('Anthropic service selects /messages and x-api-key without leaking format into state',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jot-anthropic-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new Store(dir);
  store.state.settings.chat={baseUrl:'https://api.anthropic.com/v1',model:'fixture',format:'anthropic',key:'encrypted'};
  let request;const service=new Services(store,async()=> 'test-secret',async(url,opts)=>{request={url,opts};return Response.json({content:[{type:'text',text:'你好'}]});});
  const m=await service.completion([{role:'system',content:'规则'},{role:'user',content:'你好'}]);
  assert.equal(m.content,'你好');assert.equal(request.url,'https://api.anthropic.com/v1/messages');assert.equal(request.opts.headers['x-api-key'],'test-secret');assert.equal(JSON.parse(request.opts.body).system,'规则');
});
test('Model discovery uses provider auth, preserves saved config, and blocks cross-host key reuse',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jot-models-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(dir);store.state.settings.chat={baseUrl:'https://example.com/v1',model:'saved-model',format:'openai',key:'encrypted'};
  const requests=[];const service=new Services(store,async()=> 'secret-from-store',async(url,options)=>{requests.push({url,options});return Response.json({data:[{id:'cx/gpt-5.6-luna'},{id:'cx/gpt-5.6-luna'},{id:'cx/gpt-6-astra'}]});});
  assert.deepEqual((await service.listModels({baseUrl:'https://example.com/v1',format:'openai'})).map(x=>x.id),['cx/gpt-5.6-luna','cx/gpt-6-astra']);
  assert.equal(requests[0].options.headers.Authorization,'Bearer secret-from-store');
  await assert.rejects(service.listModels({baseUrl:'https://other.example/v1',format:'openai'}),/输入.*API Key/);
  assert.equal(requests.length,1);
  await service.listModels({baseUrl:'https://other.example/v1',format:'anthropic',key:'new-key'});
  assert.equal(requests[1].options.headers['x-api-key'],'new-key');
  assert.equal(requests[1].options.headers['anthropic-version'],'2023-06-01');
  assert.equal(store.state.settings.chat.model,'saved-model');
});
