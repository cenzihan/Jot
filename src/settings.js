"use strict";
const settingsViewBeforeTabs=settingsView;
settingsView=function(){
  const box=document.createElement('div');box.innerHTML=settingsViewBeforeTabs();
  const form=box.querySelector('#settings-form');
  form.querySelector('button[type="submit"]')?.remove();
  const github=box.querySelector('.github-pending');
  if(github){const button=document.createElement('button');button.type='button';button.id='open-github';button.className='github-pending';button.setAttribute('aria-label','打开 Jot GitHub 仓库');button.title='打开 github.com/cenzihan/Jot';button.innerHTML=github.innerHTML.replace('GitHub · 即将开放','GitHub · cenzihan/Jot');github.replaceWith(button);}
  for(const section of box.querySelectorAll('.settings-section')){
    const title=section.querySelector('h3')?.textContent||'';
    section.dataset.settingsGroup=title.includes('宠物')?'appearance':title.includes('语音')?'speech':title.includes('提醒')||title.includes('数据')?'data':'model';
  }
  const memory=document.createElement('section');memory.className='settings-section';memory.dataset.settingsGroup='memory';
  memory.innerHTML=`<h3>Jot 记忆卡</h3><p>稳定偏好由你决定，近期摘要帮助 Jot 接上前面的对话。</p><label>稳定偏好<textarea name="memoryStable" maxlength="1500" rows="5" placeholder="例如：习惯用中文、喜欢简洁回复。">${esc(state.settings.chat.memoryStable||'')}</textarea></label><p class="hint">只由你手动确认，不会被自动摘要改写。</p><label class="inline-check"><input name="memoryAuto" type="checkbox" ${state.settings.chat.memoryAuto!==false?'checked':''}>自动更新近期摘要</label><label>近期摘要<textarea name="memoryRecent" maxlength="1000" rows="6" placeholder="最近关注的事情与已经确认的决定。">${esc(state.settings.chat.memoryRecent||'')}</textarea></label><div class="settings-actions"><button type="button" id="generate-memory">现在整理一次</button><button type="button" id="undo-memory" hidden>撤销上次记忆修改</button></div><p class="hint">每累积几轮对话，Jot 会用当前模型压缩近期上下文；不修改 Today、Todo 或日志。也可手动编辑或清空摘要。稳定偏好始终独立。</p>`;
  form.append(memory);
  box.querySelector('.settings-links').dataset.settingsGroup='data';
  box.querySelector('.jot-settings-footer').dataset.settingsGroup='data';
  const tabs=document.createElement('nav');tabs.className='jot-settings-tabs';tabs.setAttribute('aria-label','设置分类');
  tabs.innerHTML=[['model','模型与风格'],['memory','记忆'],['speech','语音'],['appearance','外观'],['data','数据与提醒']].map(([id,name])=>`<button type="button" data-settings-tab="${id}">${name}</button>`).join('');
  const content=document.createElement('div');content.className='jot-settings-content';while(box.firstChild)content.append(box.firstChild);
  const layout=document.createElement('div');layout.className='jot-settings-layout';layout.append(tabs,content);
  const status=document.createElement('p');status.className='jot-settings-status';status.id='settings-status';status.setAttribute('role','status');status.textContent='更改会自动保存';content.prepend(status);
  layout.querySelector('.settings-section .hint')?.setAttribute('data-note','autosave');
  return layout.outerHTML.replaceAll('选择后点击“保存所有设置”生效','选择后立即生效').replaceAll('保存后从下一条消息生效','修改后从下一条消息生效').replace('Jot 0.6.7','Jot 0.6.12');
};

let settingsTab=localStorage.getItem('jotSettingsTab')||'model';
let settingsTimer;
let settingsQueue=Promise.resolve();
let memoryUndo=null;
function activateSettingsTab(){
  const layout=document.querySelector('.jot-settings-layout');if(!layout)return;
  if(!['model','memory','speech','appearance','data'].includes(settingsTab))settingsTab='model';
  layout.querySelectorAll('[data-settings-tab]').forEach(b=>{const active=b.dataset.settingsTab===settingsTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  layout.querySelectorAll('[data-settings-group]').forEach(el=>{el.hidden=el.dataset.settingsGroup!==settingsTab;});
}
const renderBeforeSettingsTabs=render;
render=function(){renderBeforeSettingsTabs();if(page==='settings')activateSettingsTab();};
function settingsStatus(message){const el=document.querySelector('#settings-status');if(el)el.textContent=message;}
function commitSettings(patch){
  settingsStatus('正在保存…');
  settingsQueue=settingsQueue.catch(()=>{}).then(async()=>{
    await call('settings',patch);
    await refresh(false);
    settingsStatus('已自动保存');
  }).catch(err=>{settingsStatus('保存失败 · '+(err.message||err));fail(err);return false;});
  return settingsQueue;
}
const settingFields={chatBase:['chat','baseUrl'],chatModel:['chat','model'],chatFormat:['chat','format'],chatStyle:['chat','style'],systemPrompt:['chat','systemPrompt'],memoryStable:['chat','memoryStable'],memoryRecent:['chat','memoryRecent'],speechMode:['speech','mode'],speechBase:['speech','baseUrl'],speechModel:['speech','model'],speechExe:['speech','exe'],speechModelPath:['speech','modelPath']};
function saveSettingInput(el){
  const name=el.name;
  if(name==='chatKey'||name==='speechKey'){
    if(!el.value)return;
    const group=name==='chatKey'?'chat':'speech',value=el.value;
    commitSettings({[group]:{key:value}}).then(()=>{if(el.value===value)el.value='';el.placeholder='已保存，留空保持不变';});return;
  }
  if(name==='clearChatKey'||name==='clearSpeechKey'){
    if(el.checked)commitSettings({[name==='clearChatKey'?'chat':'speech']:{key:''}}).then(()=>{el.checked=false;const key=el.form.elements[name==='clearChatKey'?'chatKey':'speechKey'];key.placeholder='输入你的密钥';});return;
  }
  if(name==='memoryAuto'){commitSettings({chat:{memoryAuto:el.checked}});return;}
  if(settingFields[name]){const [group,key]=settingFields[name];
    if(name==='memoryStable'||name==='memoryRecent'){
      const previous=state.settings.chat[key]||'';
      if(previous!==el.value){memoryUndo={key,value:previous};const undo=document.querySelector('#undo-memory');if(undo)undo.hidden=false;}
    }
    commitSettings({[group]:{[key]:el.value}});return;
  }
  if(['motion','alwaysOnTop','notifications','autoSummarize'].includes(name)){commitSettings({[name]:el.checked});return;}
  if(name==='quietStart'||name==='quietEnd')commitSettings({[name]:Number(el.value)});
}
document.addEventListener('input',e=>{
  const el=e.target;if(!el.closest?.('#settings-form'))return;
  if(!['TEXTAREA','INPUT'].includes(el.tagName)||el.type==='checkbox'||el.type==='password'||el.type==='number')return;
  clearTimeout(settingsTimer);settingsStatus('正在编辑…');settingsTimer=setTimeout(()=>saveSettingInput(el),650);
});
document.addEventListener('change',e=>{
  const el=e.target;if(!el.closest?.('#settings-form'))return;
  if(!el.name)return;
  clearTimeout(settingsTimer);
  if(el.type!=='password')saveSettingInput(el);
});
document.addEventListener('focusout',e=>{
  const el=e.target;if(!el.closest?.('#settings-form'))return;
  if(el.type==='password')saveSettingInput(el);
  else if(el.tagName==='TEXTAREA'||el.type==='text'||el.type==='url'){clearTimeout(settingsTimer);saveSettingInput(el);}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='open-github'){await call('open-github');return;}
  if(b.dataset.settingsTab){settingsTab=b.dataset.settingsTab;localStorage.setItem('jotSettingsTab',settingsTab);activateSettingsTab();return;}
  if(b.id==='generate-memory'){
    b.disabled=true;b.textContent='正在整理近期对话…';settingsStatus('正在生成摘要…');
    try{const summary=await call('memory-summarize');const el=document.querySelector('[name="memoryRecent"]');memoryUndo={key:'memoryRecent',value:el.value};el.value=summary;document.querySelector('#undo-memory').hidden=false;await commitSettings({chat:{memoryRecent:summary}});}catch(err){settingsStatus('生成失败');fail(err);}finally{b.disabled=false;b.textContent='现在整理一次';}return;
  }
  if(b.id==='undo-memory'&&memoryUndo){const {key,value}=memoryUndo;memoryUndo=null;const el=document.querySelector(`[name="${key}"]`);if(el)el.value=value;b.hidden=true;await commitSettings({chat:{[key]:value}});return;}
  if(b.id==='groq-preset'){const f=document.querySelector('#settings-form').elements;commitSettings({speech:{baseUrl:f.speechBase.value,model:f.speechModel.value}});return;}
});
render();
const profileScript=document.createElement('script');profileScript.src='profiles-ui.js';document.body.append(profileScript);
