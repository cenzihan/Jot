'use strict';
let profileEditorId=null,profileDeletePending=null;
function profileLogo(profile){
  const value=`${profile.name} ${profile.baseUrl}`.toLowerCase();
  const icon=value.includes('cxapi.alvin.im')?'jot':value.includes('deepseek')?'deepseek':value.includes('dashscope')||value.includes('qwen')?'qwen':value.includes('anthropic')||value.includes('claude')?'anthropic':value.includes('alibaba')?'alibabacloud':value.includes('gemini')?'googlegemini':value.includes('kimi')?'kimi':null;
  if(icon){const src=icon==='jot'?'../assets/jot-mark.svg':`../node_modules/simple-icons/icons/${icon}.svg`;return `<img src="${src}" alt="" aria-hidden="true">`;}
  return `<span aria-hidden="true">${esc((profile.name||'?').slice(0,1).toUpperCase())}</span>`;
}
const settingsViewBeforeProfiles=settingsView;
settingsView=function(){
  const box=document.createElement('div');box.innerHTML=settingsViewBeforeProfiles();
  const section=box.querySelector('.settings-section[data-settings-group="model"]');
  if(!section)return box.innerHTML;
  const chat=state.settings.chat,profiles=chat.profiles||[];
  const selected=profiles.find(p=>p.id===profileEditorId);
  const value=selected||{name:'',baseUrl:'',model:'',format:'openai',hasKey:false};
  const cards=profiles.map(p=>`<article class="profile-card ${chat.activeProfileId===p.id?'is-active':''}"><div class="profile-monogram">${esc((p.name||'?').slice(0,1).toUpperCase())}</div><div class="profile-card-copy"><strong>${esc(p.name)}</strong>${chat.activeProfileId===p.id?'<span class="profile-active-badge">已启用</span>':''}<small>${esc(p.model)} · ${esc(p.baseUrl)}</small><small>${p.hasKey?'密钥已保存':'未填写密钥'}</small></div><div class="profile-card-actions"><button type="button" data-profile-test="${esc(p.id)}">测试</button><button type="button" data-profile-edit="${esc(p.id)}">编辑</button>${chat.activeProfileId===p.id?'':`<button type="button" data-profile-use="${esc(p.id)}" class="profile-use">启用</button>`}</div></article>`).join('')||'<p class="hint">还没有保存的配置。添加一套后，可在这里一键切换。</p>';
  section.outerHTML=`<section class="settings-section profile-section" data-settings-group="model"><div class="profile-heading"><div><h3>我的模型配置</h3><p>每套配置独立保存地址、模型和密钥。切换后从下一条对话生效。</p></div><button type="button" id="profile-new" class="profile-new">＋ 新增</button></div><div class="profile-list">${cards}</div><p id="profile-list-status" class="hint" role="status"></p><div class="profile-editor"><div class="profile-editor-head"><h4>${selected?'编辑配置':'新增配置'}</h4>${selected?`<button type="button" id="profile-delete" class="profile-delete">删除这套配置</button>`:''}</div><div class="form-grid"><label>名称<input name="profileName" maxlength="50" value="${esc(value.name)}" placeholder="例如 Jot Luna"></label><label>接口格式<select name="profileFormat"><option value="openai" ${value.format!=='anthropic'?'selected':''}>OpenAI 兼容</option><option value="anthropic" ${value.format==='anthropic'?'selected':''}>Anthropic Messages</option></select></label></div><label>API 地址<input name="profileBase" type="url" value="${esc(value.baseUrl)}" placeholder="https://api.example.com/v1"></label><div class="form-grid"><label>模型名称<input name="profileModel" value="${esc(value.model)}" placeholder="保留服务商的模型前缀"></label><label>API Key<input name="profileKey" type="password" autocomplete="off" placeholder="${value.hasKey?'已保存，留空保持不变':'输入这套配置的密钥'}"></label></div><div class="profile-editor-actions"><button type="button" id="profile-test-edit">测试连接</button><button type="button" id="profile-load-models">读取模型</button><button type="button" id="profile-save" class="primary">${selected?'保存修改':'保存并启用'}</button></div><p class="hint">测试会向当前模型发送一条简短请求，不改动 Todo 或日志。</p><p id="profile-edit-status" class="hint" role="status"></p></div></section>`;
  if(selected)box.querySelector('[name="profileKey"]').closest('.form-grid').insertAdjacentHTML('afterend','<label class="inline-check"><input type="checkbox" name="profileClearKey">清除这套配置的密钥</label>');
  if(selected&&chat.activeProfileId===selected.id)box.querySelector('#profile-delete')?.remove();
  box.querySelectorAll('.profile-card .profile-monogram').forEach((tile,index)=>{tile.innerHTML=profileLogo(profiles[index]);});
  return box.innerHTML;
};
function profileFields(){const f=document.querySelector('#settings-form').elements;return {name:f.profileName.value,baseUrl:f.profileBase.value,model:f.profileModel.value,format:f.profileFormat.value,key:f.profileKey.value,clearKey:!!f.profileClearKey?.checked};}
function profileStatus(text,where='edit'){const el=document.querySelector(`#profile-${where}-status`);if(el)el.textContent=text;}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try{
    if(button.id==='profile-new'){profileEditorId=null;render();document.querySelector('[name="profileName"]')?.focus();return;}
    if(button.dataset.profileEdit){profileEditorId=button.dataset.profileEdit;render();return;}
    if(button.id==='profile-save'){
      const values=profileFields();const id=await call('profile-save',{...values,id:profileEditorId||undefined});
      if(!profileEditorId)await call('profile-use',id);
      profileEditorId=id;cachedChatModels=null;await refresh();render();profileStatus('已保存这套配置。');return;
    }
    if(button.id==='profile-test-edit'){
      const config=profileFields();config.profileId=profileEditorId||undefined;profileStatus('正在测试实际对话接口…');
      const result=await call('connection-test',config);profileStatus(`连接成功 · ${result.latencyMs} ms · 模型可回复`);return;
    }
    if(button.id==='profile-load-models'){
      const config=profileFields();config.profileId=profileEditorId||undefined;profileStatus('正在读取模型列表…');
      const models=await call('models-list',config);const input=document.querySelector('[name="profileModel"]');
      document.querySelector('#profile-model-picker')?.remove();const select=document.createElement('select');select.id='profile-model-picker';select.innerHTML='<option value="">选择模型</option>'+models.map(m=>`<option value="${esc(m.id)}">${esc(m.name===m.id?m.id:m.name+' · '+m.id)}</option>`).join('');
      input.after(select);profileStatus(models.length?`找到 ${models.length} 个模型；请选择或继续手填。`:'接口未返回模型，请手动填写。');return;
    }
    if(button.dataset.profileTest){
      const p=(state.settings.chat.profiles||[]).find(x=>x.id===button.dataset.profileTest);
      if(!p)return;profileStatus(`正在测试 ${p.name}…`,'list');
      const result=await call('connection-test',{profileId:p.id,baseUrl:p.baseUrl,model:p.model,format:p.format});
      profileStatus(`${p.name} · 连接成功 · ${result.latencyMs} ms`,'list');return;
    }
    if(button.id==='profile-delete'&&profileEditorId){
      if(profileDeletePending!==profileEditorId){profileDeletePending=profileEditorId;button.textContent='再点一次确认删除';return;}
      await call('profile-remove',profileEditorId);profileEditorId=null;profileDeletePending=null;await refresh();render();profileStatus('配置已删除；当前对话设置未被清空。');return;
    }
  }catch(error){profileStatus(error.message||String(error),button.dataset.profileTest?'list':'edit');}
});
document.addEventListener('change',event=>{
  if(event.target.id==='profile-model-picker'&&event.target.value){document.querySelector('[name="profileModel"]').value=event.target.value;profileStatus('已填入模型名称，保存后生效。');}
});
render();
