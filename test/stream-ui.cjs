const {_electron:electron}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shiban-stream-'));let requested=false;
 const server=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;const input=JSON.parse(b);requested=input.stream===true;res.setHeader('content-type','text/event-stream');const send=d=>res.write('data: '+JSON.stringify({choices:[{index:0,delta:d}]})+'\n\n');send({content:'第一段实时文字'});const timer=setTimeout(()=>{send({content:'，第二段。'});res.end('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');},input.messages.at(-1).content.includes('停止测试')?15000:2500);res.on('close',()=>clearTimeout(timer));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const env={...process.env,SHIBAN_TEST:'1',SHIBAN_TEST_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;let app;
 try{
 app=await electron.launch(process.env.SHIBAN_RELEASE?{executablePath:process.env.SHIBAN_RELEASE,args:[],env}:{args:[path.join(__dirname,'..')],env});
 for(let i=0;i<100&&!app.windows().some(w=>w.url().endsWith('index.html'));i++)await new Promise(r=>setTimeout(r,100));
 const page=app.windows().find(w=>w.url().endsWith('index.html'));await page.waitForSelector('#send');
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('index.html'));w.webContents.setBackgroundThrottling(false);w.showInactive();});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(base=>window.shiban.call('settings',{chat:{baseUrl:base,model:'test'}}),'http://127.0.0.1:'+server.address().port+'/v1');
 assert.equal((await page.evaluate(()=>window.shiban.call('state'))).value.settings.motion,false);
 await page.locator('#chat-input').fill('流式测试');await page.locator('#send').click();
 await page.locator('#streaming-reply').filter({hasText:'第一段实时文字'}).waitFor();assert.equal(await page.locator('#send').isDisabled(),true);assert.equal((await page.evaluate(()=>window.shiban.call('state'))).value.messages.filter(m=>m.role==='assistant').length,0);
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);assert.ok((await page.locator('#messages').innerText()).includes('第一段实时文字，第二段。'));
 await page.locator('#chat-input').fill('停止测试');await page.locator('#send').click();await page.locator('#streaming-reply').filter({hasText:'第一段实时文字'}).waitFor();await page.locator('#cancel-chat').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);
 assert.equal((await page.evaluate(()=>window.shiban.call('state'))).value.todos.length,0);assert.ok(requested);assert.deepEqual(errors,[]);console.log('PASS: visible streaming before completion, final response, cancel, calm default, no page errors');
 }finally{if(app)await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
