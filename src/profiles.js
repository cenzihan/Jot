'use strict';
const {randomUUID}=require('node:crypto');
const {endpoint}=require('./services');
function normalizeChatProfiles(chat){
  if(Array.isArray(chat.profiles))return false;
  chat.profiles=[];chat.activeProfileId=null;
  if(chat.baseUrl&&chat.model){chat.profiles.push({id:randomUUID(),name:'原有配置',baseUrl:chat.baseUrl,model:chat.model,format:chat.format||'openai',key:chat.key||''});chat.activeProfileId=chat.profiles[0].id;}
  return true;
}
function validateProfile(input){
  if(!input||typeof input!=='object')throw Error('配置无效');
  const name=String(input.name||'').trim(),baseUrl=String(input.baseUrl||'').trim().replace(/\/+$/,''),model=String(input.model||'').trim(),format=input.format||'openai';
  if(!name||name.length>50)throw Error('配置名称须为 1–50 字');
  if(!baseUrl||baseUrl.length>2000)throw Error('请填写 API 地址');
  endpoint(baseUrl,'/models');
  if(!model||model.length>200)throw Error('请填写模型名称');
  if(!['openai','anthropic'].includes(format))throw Error('未知接口格式');
  return {name,baseUrl,model,format};
}
function profileSave(chat,input,encryptedKey){
  normalizeChatProfiles(chat);const value=validateProfile(input);
  if(chat.profiles.length>=20&&!input.id)throw Error('最多保存 20 套配置');
  let item=input.id?chat.profiles.find(x=>x.id===input.id):null;
  if(input.id&&!item)throw Error('找不到这套配置');
  if(item){const changed=item.baseUrl!==value.baseUrl||item.format!==value.format;Object.assign(item,value);if(encryptedKey!==undefined)item.key=encryptedKey;else if(changed)item.key='';}
  else {item={id:randomUUID(),...value,key:encryptedKey??''};chat.profiles.push(item);}
  return item.id;
}
function profileUse(chat,id){
  normalizeChatProfiles(chat);const item=chat.profiles.find(x=>x.id===id);if(!item)throw Error('找不到这套配置');
  Object.assign(chat,{activeProfileId:item.id,baseUrl:item.baseUrl,model:item.model,format:item.format,key:item.key||''});
  return item;
}
function profileRemove(chat,id){
  normalizeChatProfiles(chat);const index=chat.profiles.findIndex(x=>x.id===id);if(index<0)throw Error('找不到这套配置');
  if(chat.activeProfileId===id)throw Error('请先切换到另一套配置，再删除这套配置');
  chat.profiles.splice(index,1);
}
function syncActiveProfile(chat,before){
  normalizeChatProfiles(chat);if(!chat.activeProfileId)return;
  const item=chat.profiles.find(x=>x.id===chat.activeProfileId);if(!item){chat.activeProfileId=null;return;}
  if(chat.baseUrl!==before.baseUrl||chat.format!==before.format){chat.activeProfileId=null;return;}
  item.model=chat.model;item.key=chat.key;
}
module.exports={normalizeChatProfiles,validateProfile,profileSave,profileUse,profileRemove,syncActiveProfile};
