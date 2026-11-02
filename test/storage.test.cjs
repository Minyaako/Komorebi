const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store,DownloadManager,run,sleep}=require('../src/core.cjs');
const {initStorage,addLibrary,libraryRoot,normalizeLaunch}=require('../src/storage.cjs');
const {ArchiveWatch}=require('../src/archive-watch.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'komorebi-storage-'));
test('旧库迁移、多个位置及首次启动路径校正',async()=>{
 const root=temp(),s=new Store(path.join(root,'state.json'));s.value.settings.libraryDir=path.join(root,'old');initStorage(s,root);assert.equal(libraryRoot(s),path.join(root,'old'));
 const second=path.join(root,'second');fs.mkdirSync(second);const l=await addLibrary(s,second);assert.equal(libraryRoot(s,l.id),second);assert.equal((await addLibrary(s,second)).id,l.id);
 fs.mkdirSync(path.join(second,'nested'));fs.writeFileSync(path.join(second,'nested','game.exe'),'inert');const g={dir:second,executable:'nested/game.exe'};assert.equal(await normalizeLaunch(g),path.join(second,'nested','game.exe'));assert.equal(g.launchDir,path.join(second,'nested'));g.executable='../outside.exe';fs.writeFileSync(path.join(root,'outside.exe'),'inert');await assert.rejects(normalizeLaunch(g));
});
test('监听跳过旧文件、等待稳定、sidecar、去重与禁用',async()=>{
 const root=temp(),s=new Store(path.join(root,'state.json'));initStorage(s,root);const dir=path.join(root,'cloud');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'old.zip'),'old');const w={id:'watch',path:dir,libraryId:'default',enabled:true};s.value.settings.watchFolders=[w];let now=0;const calls=[];const watch=new ArchiveWatch({store:s,now:()=>now,stableMs:45,downloads:{processing:new Set(),receiveArchive:async(...a)=>calls.push(a)}});await watch.baseline(w);await watch.tick();assert.equal(calls.length,0);
 const file=path.join(dir,'new.zip');fs.writeFileSync(file,'new');await watch.tick();now=44;await watch.tick();assert.equal(calls.length,0);fs.writeFileSync(file+'.aria2','pending');now=46;await watch.tick();assert.equal(calls.length,0);fs.unlinkSync(file+'.aria2');await watch.tick();assert.equal(calls.length,1);assert.equal(calls[0][1].libraryId,'default');await watch.tick();assert.equal(calls.length,1);
 w.enabled=false;fs.writeFileSync(path.join(dir,'disabled.zip'),'new');now=100;await watch.tick();now=200;await watch.tick();assert.equal(calls.length,1);
});
test('本地密码包失败保留、补密码重试到第二个库且原包不删除',async()=>{
 const root=temp(),s=new Store(path.join(root,'state.json'));initStorage(s,root);const second=path.join(root,'second');fs.mkdirSync(second);const l=await addLibrary(s,second);const exe=path.join(root,'game.exe');fs.writeFileSync(exe,'INERT TEST; NEVER EXECUTE');const zip=path.join(root,'test.7z'),sevenZip=path.resolve(__dirname,'../tools/7zip/7z.exe');await run(sevenZip,['a','-t7z','-psecret','-mhe=on',zip,exe]);
 const m=new DownloadManager({store:s,dataDir:root,sevenZip});const id=await m.importLocal(zip,{libraryId:l.id});const wait=async()=>{for(let i=0;i<200&&m.processing.size;i++)await sleep(50);assert.equal(m.processing.size,0);};await wait();assert.equal(m.get(id).status,'error');assert.ok(fs.existsSync(zip));await m.action(id,'retry','secret');await wait();assert.equal(m.get(id).status,'complete');assert.equal(s.value.games[0].dir,path.join(second,id));assert.ok(fs.existsSync(zip));assert.equal(s.value.games[0].executable,'game.exe');assert.ok(!fs.readFileSync(path.join(root,'state.json'),'utf8').includes('secret'));
});

test('网盘文件移动后保持待操作，重启不解压且源文件移走',async()=>{
 const root=temp(),s=new Store(path.join(root,'state.json'));initStorage(s,root);const file=path.join(root,'cloud.zip');fs.writeFileSync(file,'not an archive: must never extract');const m=new DownloadManager({store:s,dataDir:root});const id=await m.receiveArchive(file,{watchId:'cloud'});const j=m.get(id);assert.equal(j.status,'attention');assert.equal(fs.existsSync(file),false);assert.equal(fs.readFileSync(j.sourceArchive,'utf8'),'not an archive: must never extract');assert.equal(s.value.games.length,0);const restarted=new DownloadManager({store:new Store(s.file),dataDir:root});assert.equal(restarted.get(id).status,'attention');
});
