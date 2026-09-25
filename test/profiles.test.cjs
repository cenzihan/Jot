const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeChatProfiles,profileSave,profileUse,profileRemove,syncActiveProfile}=require('../src/profiles');
const {Services}=require('../src/services');

test('migrates existing chat connection without losing its encrypted key',()=>{
  const chat={baseUrl:'https://example.com/v1',model:'first',format:'openai',key:'cipher-one'};
  assert.equal(normalizeChatProfiles(chat),true);
  assert.equal(normalizeChatProfiles(chat),false);
  assert.equal(chat.profiles.length,1);
  assert.equal(chat.profiles[0].key,'cipher-one');
  assert.equal(chat.activeProfileId,chat.profiles[0].id);
});
test('profiles switch all fields together and keep independent keys',()=>{
  const chat={baseUrl:'https://one.example/v1',model:'one',format:'openai',key:'cipher-one'};
  normalizeChatProfiles(chat);
  const first=chat.activeProfileId;
  const second=profileSave(chat,{name:'Claude',baseUrl:'https://two.example/v1',model:'two',format:'anthropic'},'cipher-two');
  profileUse(chat,second);
  assert.equal(chat.key,'cipher-two');assert.equal(chat.format,'anthropic');
  assert.throws(()=>profileRemove(chat,second),/先切换/);
  profileUse(chat,first);
  assert.equal(chat.key,'cipher-one');assert.equal(chat.model,'one');
  const before={baseUrl:chat.baseUrl,format:chat.format};chat.model='one-new';syncActiveProfile(chat,before);
  assert.equal(chat.profiles[0].model,'one-new');
  chat.baseUrl='https://new.example/v1';chat.key='';syncActiveProfile(chat,before);
  assert.equal(chat.activeProfileId,null);assert.equal(chat.profiles[0].key,'cipher-one');
  profileRemove(chat,second);assert.equal(chat.profiles.length,1);
});
test('connection test sends a real minimal request without changing records',async()=>{
  const requests=[];const store={state:{settings:{chat:{baseUrl:'https://one.example/v1',model:'one',format:'openai',key:'cipher-one',profiles:[]}},messages:[],todos:[]}};
  const service=new Services(store,async value=>value==='cipher-one'?'secret':'',async(url,options)=>{requests.push({url,options});return Response.json({choices:[{message:{content:'OK'}}]});});
  const result=await service.testConnection({baseUrl:'https://one.example/v1',model:'one',format:'openai'});
  assert.equal(result.ok,true);assert.equal(requests[0].url,'https://one.example/v1/chat/completions');
  assert.equal(requests[0].options.headers.Authorization,'Bearer secret');
  assert.equal(store.state.messages.length,0);
  await assert.rejects(service.testConnection({baseUrl:'https://two.example/v1',model:'two',format:'openai'}),/输入.*API Key/);
});
test('connection test supports Anthropic messages and explains authentication errors',async()=>{
  const store={state:{settings:{chat:{baseUrl:'https://api.anthropic.com/v1',model:'claude-test',format:'anthropic',key:'cipher',profiles:[]}}}};
  let request;const service=new Services(store,async()=> 'anthropic-secret',async(url,options)=>{request={url,options};return Response.json({content:[{type:'text',text:'OK'}]});});
  const result=await service.testConnection({baseUrl:'https://api.anthropic.com/v1',model:'claude-test',format:'anthropic'});
  assert.equal(result.ok,true);assert.equal(request.url,'https://api.anthropic.com/v1/messages');
  assert.equal(request.options.headers['x-api-key'],'anthropic-secret');
  service.fetch=async()=>new Response('',{status:401});
  await assert.rejects(service.testConnection({baseUrl:'https://api.anthropic.com/v1',model:'claude-test',format:'anthropic'}),/API Key 无效/);
});
test('auto memory keeps stable preferences separate and runs after ten messages',async()=>{
  const chat={baseUrl:'https://one.example/v1',model:'one',format:'openai',key:'',memoryStable:'请说中文',memoryRecent:'旧摘要',memoryAuto:true};
  const store={state:{settings:{chat},messages:Array.from({length:10},(_,i)=>({id:String(i),role:i%2?'assistant':'user',content:`消息 ${i}`}))},save(){this.saved=true}};
  const service=new Services(store,async()=>'',async()=>Response.json({choices:[{message:{content:'新的近期摘要'}}]}));
  await service.autoRefreshMemory();assert.equal(chat.memoryRecent,'新的近期摘要');assert.equal(chat.memoryStable,'请说中文');assert.equal(store.saved,true);
  store.saved=false;await service.autoRefreshMemory();assert.equal(store.saved,false);
});
