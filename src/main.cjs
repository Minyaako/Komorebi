const {addSeries}=require('./series-library.cjs');
const seriesRequests=new Map();
const {initStorage,libraryRoot,addLibrary,normalizeLaunch,overlap}=require('./storage.cjs');
const {ArchiveWatch}=require('./archive-watch.cjs');
const {removeTaskRecord,undoTaskRecord}=require('./task-records.cjs');
const {deletionTarget,deleteGame}=require('./delete-game.cjs');
const {ImageCache}=require('./image-cache.cjs');
const {Playtime}=require('./playtime.cjs');
const {ResourceStatus}=require('./resource-status.cjs');
const {sameDocument}=require('./ipc-origin.cjs');
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session, powerMonitor, Tray, Menu, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { Store, DownloadManager, inside, webUrl, scanExecutables } = require('./core.cjs');
const {removeEntry,restoreEntry}=require('./library-entries.cjs');
const { NextMoe } = require('./nextmoe.cjs');
const { openAssistant, hasAssistantWindows } = require('./official-assistant.cjs');
const {Uploads}=require('./uploads.cjs');
const {startOfficialUpload}=require('./official-upload.cjs');
const { LibraryScanner,metadata } = require('./library-scan.cjs');
const {openAuthorization,flushOfficialSession}=require('./auth-window.cjs');

const base=app.getAppPath();
const dataDir=path.resolve(process.env.KOMOREBI_DATA || path.join(app.getPath('appData'),'Komorebi'));
fs.mkdirSync(dataDir,{recursive:true});
app.setPath('userData',path.join(dataDir,'electron'));
app.setName('木漏日 Komorebi');
// A profile has one writer: concurrent Chromium instances can lose session updates.
const ownsProfile=app.requestSingleInstanceLock();
if(!ownsProfile)app.quit();
if(ownsProfile&&!process.env.KOMOREBI_DATA){try{require('./app-data.cjs').migrateData(dataDir,[process.env.KOMOREBI_LEGACY_DATA,path.join(base,'data'),path.join(path.dirname(process.execPath),'data')]);}catch(e){dialog.showErrorBox('数据迁移未完成',e.message+'。旧数据已保留，请勿同时打开旧版本。');app.exit(1);}}
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}});
let tray,quitPending=false;
let win,store,downloads,uploads,api,scanner,resourceStatus,playtime,archiveWatch,closing=false,engineError='';
const bannerCache=new ImageCache(path.join(dataDir,'cache','banners'));
const vaultFile=path.join(dataDir,'secrets.bin');
let vaultMemo;
const vault={
  read() {
    if(vaultMemo)return vaultMemo;
    if(!fs.existsSync(vaultFile)) return (vaultMemo={});
    if(!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密暂不可用');
    try {return (vaultMemo=JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultFile))));}
    catch {throw new Error('无法解密本机凭据，请在原 Windows 用户下运行');}
  },
  get(k){return this.read()[k] || null;},
  set(k,v){
    if(!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据加密暂不可用，未保存密钥');
    const data={...this.read()}; if(v==null) delete data[k]; else data[k]=v;
    fs.writeFileSync(vaultFile+'.tmp',safeStorage.encryptString(JSON.stringify(data)));
    fs.renameSync(vaultFile+'.tmp',vaultFile);vaultMemo=data;
  }
};
function snapshot(){
  return {appVersion:app.getVersion(),dataDir,collections:store.value.collections||[],watchStatus:archiveWatch?.status||{},canUndoTask:!!store.value.deletedTasks?.length,playtime:playtime?.snapshot(),profileStatus:api?.profileStatus,profile:api?.profile||null,removedGames:store.value.removedGames||[],uploads:store.value.uploads||[],games:store.value.games,scan:scanner?.value,jobs:store.value.jobs.map(({url,gid,...j})=>j),settings:{...store.value.settings,libraryDir:store.value.settings.libraryDir || path.join(dataDir,'library')},loginPending:!!api?.loginPending,hasKey:!!vault.get('apiKey'),loggedIn:!!vault.get('refreshToken'),engineError};
}
function changed(){if(win && !win.isDestroyed()) win.webContents.send('state',snapshot());}
function game(id){const g=store.value.games.find(g=>g.id===id);if(!g)throw new Error('游戏不存在');return g;}
async function openWeb(url){const u=webUrl(url);await shell.openExternal(u);}
const deletingGames=new Set();
function ensureGameIdle(id){
 if(playtime.running.has(id))throw new Error('请先退出游戏');
 if([...uploads.running.keys()].some(key=>store.value.uploads.find(j=>j.id===key)?.gameId===id))throw new Error('游戏正在上传，请先完成或取消任务');
 if(store.value.jobs.some(j=>(j.gameId===id||j.workId&&String(j.workId)===String(game(id).workId))&&['active','waiting','paused','extracting'].includes(j.status)))throw new Error('该游戏还有未结束的下载或安装任务');
 if(scanner.active||scanner.committing)throw new Error('请等待扫描入库完成');
}
const methods={
  async storageAction({action,id,libraryId,enabled}={}){
    const s=store.value.settings;
    if(['addLibrary','downloadDir','addWatch'].includes(action)){
      const r=await dialog.showOpenDialog(win,{title:action==='addWatch'?'选择网盘客户端下载目录':action==='downloadDir'?'选择新下载压缩包的存储位置':'添加游戏库位置',properties:['openDirectory','createDirectory']});if(r.canceled)return false;
      const folder=fs.realpathSync(r.filePaths[0]);
      if(action==='addLibrary')await addLibrary(store,folder);
      else if(action==='downloadDir'){if(s.watchFolders.some(w=>overlap(w.path,folder)||overlap(folder,w.path)))throw new Error('下载缓存不能与网盘监听目录重叠');s.downloadDir=folder;}
      else{
        const dest=libraryRoot(store,libraryId);
        if(folder===path.parse(folder).root||[base,dataDir,app.getPath('home')].some(p=>overlap(folder,p))||[...s.libraries.map(x=>x.path),s.downloadDir].some(p=>overlap(p,folder)||overlap(folder,p)))throw new Error('请选择独立的网盘下载目录，不要与游戏库、应用或下载缓存重叠');
        if(s.watchFolders.some(w=>overlap(w.path,folder)||overlap(folder,w.path)))throw new Error('该目录已被现有监听位置覆盖');
        const w={id:require('node:crypto').randomUUID(),path:folder,libraryId:libraryId||s.defaultLibraryId,enabled:true};await archiveWatch.baseline(w);s.watchFolders.push(w);
      }
    }else if(action==='default'){libraryRoot(store,id);s.defaultLibraryId=id;s.libraryDir=libraryRoot(store,id);}
    else if(action==='removeLibrary'){
      if(id===s.defaultLibraryId)throw new Error('请先把其他位置设为默认游戏库');
      if(s.watchFolders.some(w=>w.libraryId===id))throw new Error('请先更改关联的下载监听位置');
      if(store.value.jobs.some(j=>j.libraryId===id&&!['complete','cancelled','error'].includes(j.status)))throw new Error('该位置还有未结束任务');
      s.libraries=s.libraries.filter(x=>x.id!==id);
    }else{
      const w=s.watchFolders.find(x=>x.id===id);if(!w)throw new Error('监听位置不存在');
      if(action==='watchEnabled')w.enabled=!!enabled;
      else if(action==='watchLibrary'){libraryRoot(store,libraryId);w.libraryId=libraryId;}
      else if(action==='removeWatch'){w.enabled=false;s.watchFolders=s.watchFolders.filter(x=>x.id!==id);}
      else if(action==='scanExisting'){const files=await require('./archive-watch.cjs').listArchives(w.path);for(const f of files)delete store.value.watchSeen[archiveWatch.key(w,f.file)];archiveWatch.candidates.clear();}
      else throw new Error('未知存储操作');
    }
    store.save();changed();return true;
  },
  searchFamily:args=>api.searchFamily(args),
  collection(input){const result=require('./collections.cjs').updateCollection(store,input);changed();return result;},
  async enrichLibrary(){const games=[...store.value.games].filter(g=>g.workId);let at=0,loaded=0,failed=0;await Promise.all(Array.from({length:3},async()=>{while(at<games.length){const g=games[at++];try{const w=await api.detail(g.workId,true);if(store.value.games.includes(g)){g.catalog=metadata(w).catalog;loaded++;}}catch{failed++;}}}));store.save();changed();return {loaded,failed};},
  catalogEntity:args=>api.catalogEntity(args),
  addSeries(input){const key=String(input.id)+':'+!!input.nsfw;if(!seriesRequests.has(key)){const pending=addSeries(store,api,input).then(r=>{changed();return r;}).finally(()=>seriesRequests.delete(key));seriesRequests.set(key,pending);}return seriesRequests.get(key);},
  removeTask(input){const result=removeTaskRecord(store,input,{downloadBusy:downloads.processing.has(input.id),uploadBusy:uploads.running.has(input.id)});changed();return result;},
  undoTask(){const result=undoTaskRecord(store);changed();return result;},
  async deleteGame(id){
    if(deletingGames.has(id))throw new Error('正在删除此游戏');deletingGames.add(id);
    try{
      ensureGameIdle(id);const g=game(id);
      const protectedPaths=[base,dataDir,app.getPath('home'),app.getPath('documents'),app.getPath('desktop'),app.getPath('downloads'),store.value.settings.libraryDir||path.join(dataDir,'library'),...store.value.settings.libraries.map(x=>x.path),store.value.settings.downloadDir,...store.value.settings.watchFolders.map(x=>x.path)];
      const target=await deletionTarget(g,{games:[...store.value.games,...(store.value.removedGames||[])],protectedPaths});
      const r=await dialog.showMessageBox(win,{type:'warning',title:'彻底删除游戏',message:`彻底删除「${g.title}」？`,detail:target?`将永久删除以下整个目录（包括其中的存档、补丁和其他文件），并移除本机库记录。\n\n${target}\n\n此操作不能在木漏日中恢复。目录外的存档、压缩包和云端资料不受影响。`:'仅删除本机库记录；这部游戏尚未安装。',buttons:['取消','彻底删除'],defaultId:0,cancelId:0,noLink:true});
      if(r.response!==1)return {deleted:false};
      ensureGameIdle(id);const result=await deleteGame(store,id,{target,protectedPaths});changed();return result;
    }finally{deletingGames.delete(id);}
  },
  cacheBanner:url=>bannerCache.get(url),
  syncPlaytime:()=>playtime.sync({includeGuest:true}),
  profile:args=>api.userInfo(args),
  personalRecords:args=>api.personalRecords(args),
  async addCatalog({id,nsfw=false}){const w=await api.detail(id,nsfw);const existing=store.value.games.find(g=>String(g.workId)===String(w.id));if(existing)return existing;const before=store.value.games;const g={id:require('node:crypto').randomUUID(),...metadata(w),dir:null,executables:[],executable:null,state:'wish',score:null,note:'',addedAt:Date.now()};store.value.games=[g,...before];try{store.save();}catch(e){store.value.games=before;throw e;}changed();return g;},
  removeGame(id){if(playtime.running.has(id))throw new Error('请先退出游戏，再移出库');const activeUpload=[...uploads.running.keys()].some(key=>store.value.uploads.find(j=>j.id===key)?.gameId===id);const result=removeEntry(store,id,{activeUpload});changed();return result;},
  restoreGame(id){const result=restoreEntry(store,id);changed();return result;},
  async matchGame({id,workId}){const g=game(id),w=await api.detail(workId,true);const old=store.value.games;store.value.games=old.map(x=>x===g?{...g,...metadata(w)}:x);try{store.save();}catch(e){store.value.games=old;throw e;}changed();return true;},
  uploadPreview:input=>uploads.preview(input),
  startUpload:input=>uploads.start(input),
  showUpload:id=>uploads.show(id),
  retryUpload:id=>uploads.retry(id),
  openUploadFolder(id){const j=store.value.uploads.find(j=>j.id===id);if(!j||!fs.existsSync(j.archive))throw new Error('压缩包尚未生成');shell.showItemInFolder(j.archive);},
  cancelUpload:id=>uploads.cancel(id),
  async scanLibrary({single=false,nsfw=true,depth=4,gameId,retry=false}={}){
    if(scanner.active||scanner.rematching||scanner.committing)throw new Error('请等待当前扫描任务完成');
    let root=gameId?game(gameId).dir:retry?scanner.value.root:null;
    if(retry)single=!!scanner.value.single;
    if(!root){const r=await dialog.showOpenDialog(win,{title:single?'选择单个游戏目录并识别':'选择游戏库根目录，一次扫描多个游戏',properties:['openDirectory']});if(r.canceled)return null;root=r.filePaths[0];}
    scanner.start(root,{single:single||!!gameId,nsfw,depth}).catch(e=>{scanner.value.error=e.message;scanner.value.status='error';changed();});return {started:true};
  },
  cancelScan(){if(scanner.active)scanner.cancel();return true;},
  rematchScan:input=>scanner.rematch(input),
  commitScan:choices=>scanner.commit(choices),
  gameResources(input){const {id,force=false}=typeof input==='string'?{id:input}:input;return resourceStatus.check(game(id),{force});},
  dismissUploadSuggestion(id){game(id).dismissUploadSuggestion=true;store.save();changed();return true;},
  uploadSuggestionPreference(value){store.value.settings.hideUploadSuggestions=!!value;store.save();changed();return true;},
  saveGameLink({id,url,label}){const g=game(id);const link={url:webUrl(url),label:String(label||'个人直链').slice(0,100),addedAt:Date.now()};g.links=g.links||[];if(!g.links.some(l=>l.url===link.url))g.links.push(link);store.save();changed();return true;},
  keyAssistant:()=>openAssistant({mode:'key',saveKey:async key=>{await methods.connectKey(key);}}),
  shareAssistant:input=>openAssistant({mode:'share',input}),
  state:()=>snapshot(),
  search:args=>api.search(args),
  tags:query=>api.tags(query),
  detail:({id,nsfw})=>api.detail(id,nsfw),
  resources:({id,nsfw,cursor})=>api.resources(id,nsfw,cursor),
  async download(input){if(engineError)throw new Error(engineError);return downloads.add(input);},
  async resourceDownload({resourceId,title,workId,cover,nsfw,libraryId}){
    const existing=store.value.jobs.find(j=>String(j.resourceId)===String(resourceId)&&!['complete','cancelled'].includes(j.status));if(existing)return {jobId:existing.id};
    if(engineError)throw new Error(engineError);
    const files=await api.file(resourceId,nsfw);
    const mirror=files.mirrors?.find(m=>m.kind==='hosted');
    if(!mirror) return {external:files.mirrors?.filter(m=>m.kind==='external_link') || [],message:'此资源只有网盘方式，请在浏览器完成下载后导入压缩包。'};
    const jobId=await downloads.add({url:mirror.url,title,workId,cover,filename:'game.zip',password:mirror.archive_password,resourceId,nsfw,libraryId});
    return {jobId};
  },
  async jobFolder(id){const job=downloads.get(id);const result=await shell.openPath(path.dirname(downloads.archive(job)));if(result)throw new Error(result);return true;},
  jobAction:({id,action,password})=>downloads.action(id,action,password),
  async connectKey(value){
    const key=await api.validateKey(value || vault.get('apiKey'));
    vault.set('apiKey',key);api.invalidateCache();changed();return {ok:true};
  },
  async settings(input){
    const clientId=String(input.clientId || '').trim().slice(0,200);
    if(input.clearKey && input.apiKey?.trim())throw new Error('请只选择保存新密钥或清除密钥其中一项');
    if(input.apiKey?.trim()) {
      const key=await api.validateKey(input.apiKey);
      vault.set('apiKey',key);
    }
    if(input.clearKey) vault.set('apiKey',null);
    if(clientId!==store.value.settings.clientId) api.logout();
    store.value.settings.clientId=clientId;store.save();api.invalidateCache();changed();return snapshot();
  },
  chooseLibrary:()=>methods.storageAction({action:'addLibrary'}),
  async login(){const r=await api.login();api.userInfo().catch(()=>{});changed();return r;},
  cancelLogin(){api.cancelLogin();return true;},
  logout(){api.logout();changed();return true;},
  async importArchive(input={}){
    const r=await dialog.showOpenDialog(win,{title:'选择已下载的游戏压缩包',filters:[{name:'压缩包',extensions:['zip','7z','rar']}],properties:['openFile']});if(r.canceled)return null;
    return downloads.importLocal(r.filePaths[0],input);
  },
  async importFolder(){
    const r=await dialog.showOpenDialog(win,{title:'选择已有游戏目录（保留原位置）',properties:['openDirectory']});
    if(r.canceled)return null;
    const dir=r.filePaths[0];if(store.value.games.some(g=>g.dir===dir))throw new Error('该目录已经在游戏库中');
    const executables=await scanExecutables(dir);
    const g={id:require('node:crypto').randomUUID(),title:path.basename(dir),dir,executables,executable:executables.length===1?executables[0]:null,state:'wish',score:null,note:'',addedAt:Date.now()};
    store.value.games.unshift(g);store.save();changed();return g;
  },
  async chooseExe(id){
    const g=game(id);if(!g.dir)throw new Error('请先安装或关联本地游戏目录');const r=await dialog.showOpenDialog(win,{title:'选择游戏启动程序',defaultPath:g.dir,filters:[{name:'Windows 程序',extensions:['exe']}],properties:['openFile']});
    if(!r.canceled){const real=fs.realpathSync(r.filePaths[0]);if(!inside(fs.realpathSync(g.dir),real)||!real.toLowerCase().endsWith('.exe'))throw new Error('请选择该游戏目录中的 EXE');g.executable=path.relative(fs.realpathSync(g.dir),real);store.save();changed();}return true;
  },
  async launch(id){
    if(playtime.running.has(id))throw new Error('该游戏已经启动，正在记录时长');
    if(deletingGames.has(id))throw new Error('该游戏正在删除');
    const g=game(id);if(!g.dir)throw new Error('请先安装游戏');
    if(!g.executable||!fs.existsSync(path.join(g.dir,g.executable))){const candidates=await scanExecutables(g.dir);g.executables=candidates;if(candidates.length===1)g.executable=candidates[0];else {g.executable=null;await methods.chooseExe(id);if(!g.executable)return false;}}
    const exe=await normalizeLaunch(g);store.save();
    if(!inside(fs.realpathSync(g.dir),exe)||!exe.toLowerCase().endsWith('.exe'))throw new Error('启动程序路径无效');
    await new Promise((resolve,reject)=>{const cp=spawn(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore'});cp.once('error',reject);cp.once('spawn',()=>{playtime.start(g,cp);cp.unref();resolve();});});
    g.lastPlayed=Date.now();g.state='doing';store.save();changed();return true;
  },
  async openFolder(id){const dir=game(id).dir;if(!dir)throw new Error('这部作品尚未安装');const err=await shell.openPath(dir);if(err)throw new Error(err);return true;},
  saveGame({id,state,score,note}){
    const g=game(id);if(!['wish','doing','done','on_hold','dropped'].includes(state))throw new Error('无效游玩状态');
    if(score!==null && (!Number.isInteger(score)||score<1||score>10))throw new Error('评分范围 1—10');
    Object.assign(g,{state,score,note:String(note||'').slice(0,2000)});store.save();changed();return true;
  },
  syncGame:id=>api.sync(game(id)),
  setBackground(value){store.value.settings.background=!!value;store.save();changed();return true;},
  openAppData:()=>shell.openPath(dataDir),
  quitApp:()=>{requestQuit();return true;},
  openWeb,
};
if(ownsProfile)app.whenReady().then(async()=>{
  store=new Store(path.join(dataDir,'library.json'));
  initStorage(store,dataDir);
  // Public OAuth client identifier; contains no application secret.
  if(!store.value.settings.clientId){store.value.settings.clientId='01f2e512a8e45bfbed8b80e61bd72ac7';store.save();}
  api=new NextMoe({settings:()=>store.value.settings,vault,openExternal:url=>openAuthorization(url,()=>api.cancelLogin()),onChange:changed});
  playtime=new Playtime({store,api,changed});
  powerMonitor.on('suspend',()=>playtime.suspend());powerMonitor.on('resume',()=>playtime.resume());
  resourceStatus=new ResourceStatus({store,api,hasKey:()=>!!vault.get('apiKey')});
  uploads=new Uploads({store,dataDir,sevenZip:path.join(base,'tools','7zip','7z.exe'),startOfficial:startOfficialUpload});uploads.on('change',changed);
  scanner=new LibraryScanner({store,api});scanner.on('change',changed);
  downloads=new DownloadManager({store,dataDir,aria2:path.join(base,'tools','aria2c.exe'),sevenZip:path.join(base,'tools','7zip','7z.exe')});
  archiveWatch=new ArchiveWatch({store,downloads,changed});archiveWatch.start();
  downloads.resolveResource=async job=>{const f=await api.file(job.resourceId,job.nsfw);const m=f.mirrors?.find(x=>x.kind==='hosted');if(!m)throw new Error('资源已无可用直链，请重新选择');return m.url;};
  try{await downloads.start();}catch(e){engineError='下载引擎启动失败：'+e.message;}
  const ui=pathToFileURL(path.join(base,'src','ui/index.html')).href;
  ipcMain.handle('call',async(event,name,args)=>{
    if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || !sameDocument(event.senderFrame.url,ui) || !Object.hasOwn(methods,name))return {error:'无效请求'};
    try{return {value:await methods[name](args)};}catch(e){return {error:e.message};}
  });
  session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  win=new BrowserWindow({width:1340,height:890,minWidth:900,minHeight:640,backgroundColor:'#171b1b',title:'木漏日 · Komorebi',autoHideMenuBar:true,webPreferences:{preload:path.join(base,'src','preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  downloads.on('change',changed);
  await win.loadURL(ui);
  api.userInfo().then(()=>playtime.sync()).catch(()=>{});
  try{tray=new Tray(nativeImage.createFromPath(path.join(base,'src','assets','tray.png')));tray.setToolTip('木漏日 · 后台运行');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开木漏日',click:showMain},{type:'separator'},{label:'退出木漏日',click:()=>requestQuit()}]));tray.on('double-click',showMain);tray.on('click',showMain);}catch(e){console.error('Tray unavailable:',e.message);}
  win.on('close',e=>{if(closing)return;e.preventDefault();if(tray&&store.value.settings.background!==false)win.hide();else requestQuit();});

}).catch(e=>{dialog.showErrorBox('木漏日启动失败',e.message);app.quit();});
function showMain(){if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}}
async function requestQuit(){
 if(closing||quitPending)return;quitPending=true;
 try{
  if(uploads?.active||hasAssistantWindows()){showMain();await dialog.showMessageBox(win,{message:'官网助手或上传任务仍在运行，请先完成或关闭后再退出。'});return;}
  if(downloads?.processing.size||scanner?.committing||archiveWatch?.busy){showMain();await dialog.showMessageBox(win,{message:'正在整理文件，请完成后再退出。'});return;}
  if(playtime?.running.size){showMain();const r=await dialog.showMessageBox(win,{message:'游戏仍在运行，退出木漏日将停止计时。',buttons:['继续记录','退出'],defaultId:0,cancelId:0});if(r.response!==1)return;}
  archiveWatch?.stop();playtime?.close();if(scanner?.active)scanner.cancel();api?.cancelLogin();await downloads?.stop();await flushOfficialSession().catch(e=>console.error('Session flush:',e.message));closing=true;tray?.destroy();win?.destroy();app.quit();
 }catch(e){showMain();dialog.showErrorBox('退出未完成',e.message);}finally{quitPending=false;}
}
app.on('before-quit',e=>{if(!ownsProfile||closing||!win)return;e.preventDefault();requestQuit();});
app.on('activate',showMain);
app.on('window-all-closed',()=>{if(!tray||closing)app.quit();});

