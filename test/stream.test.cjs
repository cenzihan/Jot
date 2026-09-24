const {test}=require('node:test'),assert=require('node:assert/strict');
const {readCompletion}=require('../src/stream');
const sse=items=>items.map(x=>'data: '+(typeof x==='string'?x:JSON.stringify(x))+'\r\n\r\n').join('');
const chunk=delta=>({choices:[{index:0,delta}]});
function response(text){const bytes=new TextEncoder().encode(text);let i=0;return new Response(new ReadableStream({pull(c){if(i===bytes.length)c.close();else c.enqueue(bytes.slice(i,i+=1));}}),{headers:{'content-type':'text/event-stream'}});}
test('SSE survives single-byte UTF-8 and CRLF splits; merges tool fragments',async()=>{
 let shown='';const m=await readCompletion(response(sse([chunk({content:'你好'}),chunk({tool_calls:[{index:0,id:'call1',function:{name:'manage_',arguments:'{"kind":'}}]}),chunk({tool_calls:[{index:0,function:{name:'record',arguments:'"todo"}'}}]}),{choices:[{index:0,delta:{},finish_reason:'tool_calls'}]},'[DONE]'])),t=>shown+=t);
 assert.equal(shown,'你好');assert.equal(m.tool_calls[0].function.name,'manage_record');assert.deepEqual(JSON.parse(m.tool_calls[0].function.arguments),{kind:'todo'});
});
test('Interrupted or truncated streams reject incomplete operations',async()=>{
 await assert.rejects(readCompletion(response(sse([chunk({content:'partial'})])),()=>{}),/提前中断/);
 await assert.rejects(readCompletion(response(sse([{choices:[{delta:{},finish_reason:'length'}]}])),()=>{}),/截断/);
});
test('Providers returning ordinary JSON remain compatible',async()=>{
 let text='';await readCompletion(new Response(JSON.stringify({choices:[{message:{content:'fallback'}}]}),{headers:{'content-type':'application/json'}}),t=>text+=t);assert.equal(text,'fallback');
});
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store}=require('../src/core'),{Services}=require('../src/services');
test('streamed tools execute once only after completion; custom prompt is sent',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jot-stream-core-'));
 try{const store=new Store(dir);store.state.settings.chat={baseUrl:'https://example.com/v1',model:'fixture',key:'',style:'precise',systemPrompt:'称呼我为同学'};let requests=0;const service=new Services(store,async()=>'',async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.stream,true);assert.match(body.messages[0].content,/称呼我为同学/);assert.match(body.messages[0].content,/短期 Today 行动/);requests++;if(requests===1){assert.equal(store.state.todos.length,0);return response(sse([chunk({tool_calls:[{index:0,id:'call1',function:{name:'manage_record',arguments:'{"kind":"todo","op":"add","data":{"title":"测试"}}'}}]}),{choices:[{delta:{},finish_reason:'tool_calls'}]},'[DONE]']));}return response(sse([chunk({content:'已添加'}),{choices:[{delta:{},finish_reason:'stop'}]},'[DONE]']));});await service.chat('添加测试');assert.equal(store.state.todos.length,1);assert.equal(requests,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('interrupted streamed tool never changes records',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jot-stream-broken-'));
 try{const store=new Store(dir);store.state.settings.chat={baseUrl:'https://example.com/v1',model:'fixture',key:''};const service=new Services(store,async()=>'',async()=>response(sse([chunk({tool_calls:[{index:0,id:'call1',function:{name:'manage_record',arguments:'{"kind":"todo","op":"add","data":{"title":"测试"}}'}}]})])));await assert.rejects(service.chat('添加测试'),/提前中断/);assert.equal(store.state.todos.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
