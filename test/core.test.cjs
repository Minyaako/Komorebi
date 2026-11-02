const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const {Store,DownloadManager,inspectListing,webUrl,safeName,sleep,run}=require('../src/core.cjs');
const {zip,randomBytes}=require('./fixtures.cjs');
const ROOT=path.resolve(__dirname,'../../../work/verification');fs.mkdirSync(ROOT,{recursive:true});
const tools=path.resolve(__dirname,'../tools');
async function waitFor(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(100);}throw new Error('等待超时');}
test('拒绝跨目录、设备名、ADS、链接与超大解压目录',()=>{
  for(const p of ['../escape','C:\\escape','/escape','a/../b','a:stream','CON','x./y']) assert.throws(()=>inspectListing(`Path = ${p}\nSize = 1\n`));
  assert.throws(()=>inspectListing('Path = link\nSymbolic Link = outside\n'));
  assert.throws(()=>inspectListing('Path = huge\nSize = 999999999999\n'));
  assert.equal(inspectListing('Path = game/data.bin\nSize = 40\n').total,40);
  assert.throws(()=>webUrl('file:///C:/secret'));assert.throws(()=>webUrl('https://me:pass@example.com/a'));
  assert.equal(safeName('a/b:c'),'a_b_c');
});
test('真实 aria2：下载、暂停继续、自动解压入库、失败隔离、重启恢复',async t=>{
  const root=fs.mkdtempSync(path.join(ROOT,'core-'));const archive=zip({'Sample/game.exe':'INERT TEST FILE; never execute','Sample/readme.txt':'自制链路测试包，不是游戏', 'Sample/data.bin':randomBytes(3*1024*1024)});
  const malicious=zip({'../escaped.txt':'must not appear'});
  fs.writeFileSync(path.join(root,'private.txt'),'密码包验证');
  await run(path.join(tools,'7zip/7z.exe'),['a','-t7z','-psecret','-mhe=on',path.join(root,'encrypted.7z'),path.join(root,'private.txt')]);
  const encrypted=fs.readFileSync(path.join(root,'encrypted.7z'));
  const server=http.createServer((req,res)=>{
    const data=req.url==='/encrypted.7z'?encrypted:req.url==='/bad.zip'?Buffer.from('not a zip'):req.url==='/traversal.zip'?malicious:archive;
    const start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]||0);
    res.writeHead(start?206:200,{'Content-Type':'application/zip','Content-Length':data.length-start,'Accept-Ranges':'bytes',...(start?{'Content-Range':`bytes ${start}-${data.length-1}/${data.length}`}:{})});
    let p=start;const timer=setInterval(()=>{if(p>=data.length){clearInterval(timer);res.end();return;}res.write(data.subarray(p,p+65536));p+=65536;},20);res.on('close',()=>clearInterval(timer));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const store=new Store(path.join(root,'state.json'));const m=new DownloadManager({store,dataDir:root,aria2:path.join(tools,'aria2c.exe'),sevenZip:path.join(tools,'7zip/7z.exe')});
  t.after(async()=>{await m.stop();await new Promise(r=>server.close(r));});await m.start();
  const jobId=await m.add({url:url+'/sample.zip',title:'自动入库测试'});
  await waitFor(()=>m.get(jobId).status==='active');await m.action(jobId,'pause');assert.equal(m.get(jobId).status,'paused');await m.action(jobId,'resume');
  await waitFor(()=>['complete','error'].includes(m.get(jobId).status));assert.equal(m.get(jobId).status,'complete',m.get(jobId).error);
  const game=store.value.games[0];assert.equal(fs.readFileSync(path.join(game.dir,'Sample/readme.txt'),'utf8'),'自制链路测试包，不是游戏');assert.ok(game.executable.endsWith('game.exe'));
  assert.ok(fs.existsSync(m.archive(m.get(jobId))),'保留原压缩包');
  for(const file of ['bad.zip','traversal.zip']){const jid=await m.add({url:url+'/'+file,title:file});await waitFor(()=>['complete','error'].includes(m.get(jid).status));assert.equal(m.get(jid).status,'error');}
  assert.equal(store.value.games.length,1);assert.equal(fs.existsSync(path.join(root,'library','escaped.txt')),false);
  const locked=await m.add({url:url+'/encrypted.7z',title:'密码包'});
  await waitFor(()=>m.get(locked).status==='error');assert.equal(store.value.games.length,1);
  await m.action(locked,'retry','secret');await waitFor(()=>['complete','error'].includes(m.get(locked).status));assert.equal(m.get(locked).status,'complete',m.get(locked).error);
  const disk=new Store(path.join(root,'state.json'));assert.ok(disk.value.games.some(g=>g.dir===game.dir));
  const resumable=await m.add({url:url+'/sample.zip',title:'退出恢复'});await waitFor(()=>m.get(resumable).status==='active');await m.action(resumable,'pause');
  const restored=new DownloadManager({store:new Store(path.join(root,'state.json')),dataDir:root,aria2:path.join(tools,'aria2c.exe'),sevenZip:path.join(tools,'7zip/7z.exe')});
  assert.equal(restored.get(resumable).status,'paused');assert.equal(restored.get(resumable).gid,undefined);
  await m.stop();await restored.start();
  try{await restored.action(resumable,'resume');await waitFor(()=>['complete','error'].includes(restored.get(resumable).status));assert.equal(restored.get(resumable).status,'complete',restored.get(resumable).error);}
  finally{await restored.stop();}
});
