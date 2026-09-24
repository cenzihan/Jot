'use strict';
// Parse UTF-8 SSE across arbitrary network chunk boundaries. Never execute partial tools.
async function readCompletion(res, onText) {
  if (!res.headers?.get('content-type')?.includes('text/event-stream')) {
    const m=(await res.json()).choices?.[0]?.message;
    if(!m)throw Error('模型返回格式不兼容 Chat Completions');
    if(m.content)onText(m.content);
    return m;
  }
  const reader=res.body.getReader(), decoder=new TextDecoder();
  let buffer='',content='',finished=false;
  const calls=[];
  function event(block){
    const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if(!data)return;
    if(data==='[DONE]'){finished=true;return;}
    const obj=JSON.parse(data);
    if(obj.error)throw Error('模型流式服务返回错误');
    const c=obj.choices?.find(x=>x.index===0)||obj.choices?.[0];
    if(!c)return;
    if(c.finish_reason){if(!['stop','tool_calls'].includes(c.finish_reason))throw Error('模型输出被截断，请缩小请求后重试');finished=true;}
    const d=c.delta||{};
    if(typeof d.content==='string'){content+=d.content;onText(d.content);}
    for(const t of d.tool_calls||[]){
      if(!Number.isInteger(t.index)||t.index<0||t.index>11)throw Error('工具序号无效');
      const a=calls[t.index]||={id:'',type:'function',function:{name:'',arguments:''}};
      if(t.id)a.id+=t.id;
      if(t.function?.name)a.function.name+=t.function.name;
      if(t.function?.arguments)a.function.arguments+=t.function.arguments;
    }
  }
  try{
    while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});buffer=buffer.replace(/\r\n/g,'\n');let p;while((p=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,p));buffer=buffer.slice(p+2);}if(done)break;}
    if(buffer.trim())event(buffer);
    if(!finished)throw Error('连接提前中断，未执行不完整操作');
    const tool_calls=calls.filter(Boolean);
    if(tool_calls.some(t=>!t.id||!t.function.name))throw Error('工具调用不完整');
    return {role:'assistant',content, ...(tool_calls.length?{tool_calls}:{})};
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
module.exports={readCompletion};
