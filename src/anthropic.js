'use strict';

function toAnthropic(messages,tool){
  const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
  const converted=[];
  for(const m of messages){
    if(m.role==='system')continue;
    if(m.role==='tool'){
      converted.push({role:'user',content:[{type:'tool_result',tool_use_id:m.tool_call_id,content:m.content}]});
    }else if(m.role==='assistant'&&m.tool_calls?.length){
      converted.push({role:'assistant',content:[...(m.content?[{type:'text',text:m.content}]:[]),...m.tool_calls.map(c=>({type:'tool_use',id:c.id,name:c.function.name,input:JSON.parse(c.function.arguments)}))]});
    }else converted.push({role:m.role,content:m.content||''});
  }
  return {system,messages:converted,...(tool?{tools:[{name:tool.function.name,description:tool.function.description,input_schema:tool.function.parameters}],tool_choice:{type:'auto'}}:{})};
}
function normalize(data,onText){
  if(!Array.isArray(data.content))throw Error('模型返回格式不兼容 Anthropic Messages');
  if(data.stop_reason&&!['end_turn','tool_use','stop_sequence'].includes(data.stop_reason))throw Error('模型输出被截断，未执行操作');
  const content=data.content.filter(x=>x.type==='text').map(x=>x.text||'').join('');
  if(content&&onText)onText(content);
  const calls=data.content.filter(x=>x.type==='tool_use').map(x=>({id:x.id,type:'function',function:{name:x.name,arguments:JSON.stringify(x.input||{})}}));
  return {role:'assistant',content,...(calls.length?{tool_calls:calls}:{})};
}
async function readAnthropic(res,onText){
  if(!res.headers?.get('content-type')?.includes('text/event-stream'))return normalize(await res.json(),onText);
  const reader=res.body.getReader(),decoder=new TextDecoder();
  let buffer='',content='',finished=false,stopReason=null;
  const calls=new Map();
  function event(block){
    const data=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
    if(!data)return;
    const x=JSON.parse(data);
    if(x.type==='error')throw Error(x.error?.message||'模型流式服务返回错误');
    if(x.type==='content_block_start'&&x.content_block?.type==='tool_use')calls.set(x.index,{id:x.content_block.id,name:x.content_block.name,json:''});
    if(x.type==='content_block_delta'){
      if(x.delta?.type==='text_delta'){content+=x.delta.text||'';onText(x.delta.text||'');}
      if(x.delta?.type==='input_json_delta'&&calls.has(x.index))calls.get(x.index).json+=x.delta.partial_json||'';
    }
    if(x.type==='message_delta')stopReason=x.delta?.stop_reason||stopReason;
    if(x.type==='message_stop')finished=true;
  }
  try{
    while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});buffer=buffer.replace(/\r\n/g,'\n');let i;while((i=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,i));buffer=buffer.slice(i+2);}if(done)break;}
    if(buffer.trim())event(buffer);
    if(!finished||!['end_turn','tool_use','stop_sequence'].includes(stopReason))throw Error('连接提前中断或模型输出不完整，未执行操作');
    const tool_calls=[...calls.values()].map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:c.json||'{}'}}));
    if(tool_calls.some(c=>!c.id||!c.function.name))throw Error('工具调用不完整');
    return {role:'assistant',content,...(tool_calls.length?{tool_calls}:{})};
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
module.exports={toAnthropic,normalize,readAnthropic};
