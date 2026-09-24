const path=require('node:path');
const {version}=require('./package.json');

(async()=>{
  const {packager}=await import('@electron/packager');
  const result=await packager({
    dir:__dirname,
    name:'Jot',
    platform:'win32',
    arch:'x64',
    overwrite:true,
    out:process.env.JOT_PACKAGE_OUT||path.join(__dirname,'dist',`v${version}`),
    asar:true,
    icon:path.join(__dirname,'assets/icon.ico'),
    ...(process.env.SHIBAN_ELECTRON_ZIP_DIR?{electronZipDir:process.env.SHIBAN_ELECTRON_ZIP_DIR}:{}),
    ignore:[/^\/(?:test|qa|docs|dist|outputs|work|\.git|\.github)(?:\/|$)/,/\.zip$/,/\.log$/,/^\/\.env(?:\.|$)/,/^\/\.gitignore$/,/^\/AGENTS\.md$/,/^\/README(?:_EN)?\.md$/],
    win32metadata:{CompanyName:'Jot',FileDescription:'Jot',ProductName:'Jot',InternalName:'Jot'}
  });
  console.log(result.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
