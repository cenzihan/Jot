'use strict';
const fs=require('node:fs'),path=require('node:path');const {imageSize}=require('image-size');
function readPet(input){
  let file=path.resolve(input),name=path.basename(file,path.extname(file)),version=null;
  if(path.extname(file).toLowerCase()==='.json'){
    if(fs.statSync(file).size>65536)throw Error('pet.json 过大');const meta=JSON.parse(fs.readFileSync(file,'utf8'));name=String(meta.displayName||meta.name||name).slice(0,80);version=meta.spriteVersionNumber||null;
    const ref=meta.spritesheetPath||meta.spritesheet||meta.spriteSheet||'spritesheet.webp';if(typeof ref!=='string')throw Error('spritesheetPath 必须是图片文件名');const base=path.dirname(file);file=path.resolve(base,ref);if(path.dirname(file)!==base)throw Error('宠物图片必须在 pet.json 同一目录');
    if(!fs.existsSync(file)&&ref==='spritesheet.webp'&&fs.existsSync(path.join(base,'spritesheet.png')))file=path.join(base,'spritesheet.png');
  }
  if(!/\.(png|webp|gif)$/i.test(file)||fs.statSync(file).size>24*1024*1024)throw Error('请使用不超过24MB的 PNG、WebP 或 GIF 图片');
  const bytes=fs.readFileSync(file);let dim;try{dim=imageSize(bytes);}catch{throw Error('无法识别宠物图片');}if(!['png','webp','gif'].includes(dim.type))throw Error('图片内容与支持格式不符');
  const {width,height}=dim;let rows=0;if(width===1536&&[1872,2288].includes(height))rows=height/208;else if(width>1024||height>1024)throw Error('支持1536×1872/2288的Codex精灵图，或不超过1024×1024的静态图片');
  if(version===2&&rows!==11)throw Error('v2 Codex Pet 需要 1536×2288 精灵图');
  return {name,rows,bytes,ext:dim.type,mime:'image/'+dim.type,version:rows===11?2:rows===9?1:null,file};
}
function listPets(root){if(!fs.existsSync(root))return [];const entries=[];for(const d of fs.readdirSync(root,{withFileTypes:true})){if(!d.isDirectory()||d.isSymbolicLink())continue;const manifest=path.join(root,d.name,'pet.json');if(!fs.existsSync(manifest))continue;try{const p=readPet(manifest);entries.push({id:d.name,name:p.name,rows:p.rows,version:p.version,manifest});}catch(e){entries.push({id:d.name,name:d.name,error:e.message,manifest});}}return entries;}
module.exports={readPet,listPets};
