const {libraryRoot}=require('./storage.cjs');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function inside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function safeName(s) {
  let n = String(s || '未命名作品').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 70);
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(n)) n = '_' + n;
  return n || 'game';
}
function webUrl(raw) {
  const u = new URL(String(raw));
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || /[\r\n]/.test(raw)) throw new Error('请使用不含账号密码的 HTTP(S) 下载直链');
  return u.href;
}
function run(binary, args, { timeout = 600000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '', size = 0;
    const timer = setTimeout(() => { cp.kill(); reject(new Error('解压操作超时，下载文件已保留')); }, timeout);
    cp.on('error', e => { clearTimeout(timer); reject(e); });
    cp.stdout.on('data', b => { size += b.length; if (size > maxBuffer) { cp.kill(); reject(new Error('压缩包目录过大')); } else output += b.toString('utf8'); });
    cp.stderr.on('data', b => { error = (error + b.toString('utf8')).slice(-3000); });
    cp.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(/password|encrypted|Wrong password/i.test(error + output) ? '密码不正确或压缩包损坏，请填写密码后重试' : `7-Zip 无法处理此文件（${code}）。请检查文件完整性、密码或分卷是否齐全。`));
      else resolve(output);
    });
  });
}
function inspectListing(text) {
  const sections = text.split(/\r?\n\r?\n/).filter(s => /^Path = /m.test(s));
  if (!sections.length || sections.length > 100000) throw new Error('压缩包为空或文件数量超出 Demo 限制');
  let total = 0;
  for (const item of sections) {
    const name = item.match(/^Path = (.*)$/m)?.[1]?.trim();
    const parts = name?.replaceAll('\\', '/').split('/');
    if (!name || path.win32.isAbsolute(name) || path.posix.isAbsolute(name) || /[:\x00-\x1f]/.test(name) || parts.some(p => p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error('压缩包包含不安全的文件路径，已停止解压');
    if (/^(Symbolic Link|Hard Link|Reparse Point) = /m.test(item) || /^Attributes = .*\bl[rwx-]{9}/m.test(item) || /^Mode = l/m.test(item)) throw new Error('此 Demo 不解压包含符号链接或硬链接的压缩包');
    total += Number(item.match(/^Size = (\d+)$/m)?.[1] || 0);
    if (!Number.isSafeInteger(total) || total > 100 * 1024 ** 3) throw new Error('解压大小超过 100 GB 的 Demo 限制');
  }
  return { count: sections.length, total };
}
async function scanExecutables(root) {
  const canonicalRoot=fs.realpathSync(root);
  const files = [];
  let count = 0;
  async function walk(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      if (++count > 100000) throw new Error('文件数量超过限制');
      const p = path.join(dir, entry.name);
      const st = await fsp.lstat(p);
      if (st.isSymbolicLink()) throw new Error('目录包含链接，不能自动入库');
      if (!inside(canonicalRoot, fs.realpathSync(p))) throw new Error('文件超出游戏目录');
      if (st.isDirectory()) await walk(p);
      else if (/\.exe$/i.test(entry.name) && !/^(unins|uninstall|setup|install|redist|vcredist|dxsetup|crash)/i.test(entry.name)) files.push(path.relative(root, p));
    }
  }
  await walk(root);
  return files.sort((a,b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b));
}
class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.value = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { games: [], jobs: [], settings: {} };
  }
  save() {
    const tmp = this.file + '.tmp';
    const persisted={...this.value,deletedTasks:(this.value.deletedTasks||[]).map(e=>e.kind==='download'&&e.task.resourceId?{...e,task:{...e.task,url:undefined}}:e),jobs:this.value.jobs.map(j=>j.resourceId?{...j,url:undefined}:j)};
    fs.writeFileSync(tmp, JSON.stringify(persisted, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
class DownloadManager extends EventEmitter {
  constructor({ store, dataDir, aria2, sevenZip }) {
    super(); Object.assign(this, { store, dataDir, aria2, sevenZip });
    this.secret = randomBytes(32).toString('hex'); this.passwords = new Map(); this.processing = new Set();
    this.stopping = false;
    for (const job of store.value.jobs) {
      if (job.status==='moving'){job.status='attention';job.message='文件整理中断，请打开文件夹检查源文件与目标文件';}
      if (!['complete', 'error', 'cancelled', 'attention'].includes(job.status)) job.status = 'paused';
      delete job.gid; job.speed = 0;
    }
    store.save();
  }
  async start() {
    const probe = http.createServer();
    await new Promise(r => probe.listen(0, '127.0.0.1', r));
    this.port = probe.address().port;
    await new Promise(r => probe.close(r));
    this.cp = spawn(this.aria2, ['--no-conf=true','--enable-rpc=true','--rpc-listen-all=false', `--rpc-listen-port=${this.port}`, `--rpc-secret=${this.secret}`, '--max-concurrent-downloads=2', '--file-allocation=none', '--auto-file-renaming=false', '--allow-overwrite=false', '--continue=true', '--max-tries=4', '--retry-wait=3', '--connect-timeout=15', '--timeout=30', '--check-certificate=true', '--console-log-level=error', '--summary-interval=0'], { windowsHide: true, stdio: 'ignore' });
    let spawnError;
    this.cp.on('error', e => { spawnError = e; });
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (spawnError) throw spawnError;
      try { await this.rpc('getVersion'); ready = true; break; } catch { await sleep(100); }
    }
    if (!ready) { this.cp.kill(); throw new Error('aria2 无法启动'); }
    this.timer = setInterval(() => this.tick(), 600);
    this.cp.on('exit', () => {
      if (!this.stopping) {
        for (const j of this.store.value.jobs) if (['active','waiting'].includes(j.status)) { j.status = 'error'; j.error = '下载引擎已退出，请重启应用后重试'; }
        this.changed();
      }
    });
  }
  async rpc(method, params = []) {
    const r = await fetch(`http://127.0.0.1:${this.port}/jsonrpc`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:randomUUID(), method:'aria2.' + method, params:['token:' + this.secret, ...params] }), signal: AbortSignal.timeout(4000) });
    const b = await r.json(); if (b.error) throw new Error('下载引擎操作失败：' + b.error.message); return b.result;
  }
  changed() { this.store.save(); this.emit('change'); }
  async add({ url, title, workId = null, cover = null, password = '', filename = '', resourceId = null, nsfw = false, libraryId=null }) {
    url = webUrl(url);
    if (this.store.value.jobs.filter(j => !['complete','cancelled','error'].includes(j.status)).length >= 20) throw new Error('最多同时保留 20 个待处理任务');
    const id = randomUUID();
    const root = libraryRoot(this.store,libraryId) || path.join(this.dataDir, 'library');
    const job = { id, archiveDir:this.store.value.settings.downloadDir||path.join(this.dataDir,'downloads'), libraryId:libraryId||this.store.value.settings.defaultLibraryId||null, title: safeName(title), workId, cover, url, resourceId, nsfw, filename: safeName(filename || decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'download.zip'), root, status:'waiting', completed:0, total:0, speed:0, createdAt:Date.now() };
    // A fixed archive filename prevents Content-Disposition from choosing paths.
    job.filename = /\.(zip|7z|rar)$/i.test(job.filename) ? job.filename : 'download.zip';
    this.passwords.set(id, String(password));
    await fsp.mkdir(path.dirname(this.archive(job)), { recursive:true });
    await fsp.mkdir(root, { recursive:true });
    this.store.value.jobs.unshift(job);
    try { await this.enqueue(job); } catch(e) { job.status='error'; job.error=e.message; }
    this.changed(); return id;
  }
  async receiveArchive(file,{libraryId=null,watchId=null}={}) {
    const source=await fsp.realpath(file),before=await fsp.stat(source);
    if(!before.isFile())throw new Error('下载文件不存在');
    const id=randomUUID(),root=libraryRoot(this.store,libraryId),folder=path.join(root,'.archives',id),target=path.join(folder,path.basename(source));
    const job={id,libraryId:libraryId||this.store.value.settings.defaultLibraryId,watchId,originalArchive:source,sourceArchive:source,root,filename:path.basename(source),title:path.basename(source,path.extname(source)),downloaded:true,status:'moving',completed:before.size,total:before.size,speed:0,createdAt:Date.now()};
    this.processing.add(id);this.store.value.jobs.unshift(job);this.changed();
    try {
      await fsp.mkdir(folder,{recursive:true});
      await fsp.copyFile(source,target,fs.constants.COPYFILE_EXCL);
      const after=await fsp.stat(source),copied=await fsp.stat(target);
      if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||copied.size!==before.size)throw new Error('文件仍在变化，原文件已保留，请下载完成后手动处理');
      job.sourceArchive=target;job.status='attention';job.message='网盘文件已移入目标游戏库，等待手动解压或整理';this.changed();
      await fsp.unlink(source);
    }catch(e){job.status='attention';job.message='需要手动检查文件：'+e.message;}
    finally{this.processing.delete(id);this.changed();}
    return id;
  }
  async importLocal(file,{title,workId=null,cover=null,password='',libraryId=null,watchId=null}={}){
    const sourceArchive=await fsp.realpath(file),stat=await fsp.stat(sourceArchive);
    if(!stat.isFile()||!/[.](zip|7z|rar)$/i.test(sourceArchive))throw new Error('请选择 ZIP、7z 或 RAR 压缩包');
    const duplicate=this.store.value.jobs.find(j=>j.sourceArchive===sourceArchive&&!['complete','cancelled'].includes(j.status));if(duplicate)return duplicate.id;
    const id=randomUUID(),root=libraryRoot(this.store,libraryId)||path.join(this.dataDir,'library');
    const job={id,sourceArchive,watchId,libraryId:libraryId||this.store.value.settings.defaultLibraryId||null,title:title||path.basename(file,path.extname(file)),workId,cover,filename:path.basename(file),root,status:'paused',downloaded:true,completed:stat.size,total:stat.size,speed:0,createdAt:Date.now()};
    await fsp.mkdir(root,{recursive:true});this.passwords.set(id,password||'');this.store.value.jobs.unshift(job);this.changed();this.install(job);return id;
  }
  archive(job) { return job.sourceArchive || path.join(job.archiveDir||path.join(this.dataDir, 'downloads'), job.id, job.filename); }
  async enqueue(job) {
    if(!job.url && job.resourceId && this.resolveResource) job.url=await this.resolveResource(job);
    if(!job.url) throw new Error('下载链接已失效，请重新选择资源');
    job.gid = await this.rpc('addUri', [[job.url], { dir:path.dirname(this.archive(job)), out:job.filename, split:'4', 'max-connection-per-server':'4', 'min-split-size':'5M' }]);
    job.status='waiting'; job.error='';
  }
  get(id) { const j=this.store.value.jobs.find(j=>j.id===id); if(!j) throw new Error('任务不存在'); return j; }
  async action(id, action, password = '') {
    const job=this.get(id);
    if (this.processing.has(id)) throw new Error('正在校验与解压，请等待完成');
    if (action==='pause' && ['active','waiting'].includes(job.status)) { await this.rpc('pause',[job.gid]); job.status='paused'; }
    else if (action==='resume' && job.status==='paused') {
      if(job.downloaded){this.install(job);return;}
      if (job.gid) await this.rpc('unpause',[job.gid]); else await this.enqueue(job);
      job.status='waiting';
    } else if (action==='retry' && job.status==='error') {
      this.passwords.set(id, password);
      if(job.sourceArchive&&!fs.existsSync(job.sourceArchive))throw new Error('原压缩包已移动或删除，请恢复文件后重试');
      if(job.downloaded && fs.existsSync(this.archive(job))) this.install(job); else {if(job.resourceId)delete job.url;await this.enqueue(job);}
    } else if (action==='cancel' && !['complete','cancelled'].includes(job.status)) {
      if(job.gid) await this.rpc('forceRemove',[job.gid]).catch(()=>{});
      job.status='cancelled'; job.speed=0; this.passwords.delete(id);
    } else throw new Error('当前状态无法执行此操作');
    this.changed();
  }
  async tick() {
    if(this.ticking || this.stopping) return;
    this.ticking=true;
    try {
      for (const job of this.store.value.jobs) {
        if(!job.gid || !['active','waiting','paused'].includes(job.status) || this.processing.has(job.id)) continue;
        try {
          const s=await this.rpc('tellStatus',[job.gid,['status','totalLength','completedLength','downloadSpeed','errorCode']]);
          Object.assign(job,{total:Number(s.totalLength),completed:Number(s.completedLength),speed:Number(s.downloadSpeed)});
          if(s.status==='complete') { job.downloaded=true; this.install(job); }
          else if(s.status==='error') { job.status='error'; job.error=`下载失败（aria2 ${s.errorCode}），请确认直链有效后重试`; }
          else if(s.status==='removed') job.status='cancelled';
          else job.status=s.status;
        } catch(e) { job.status='error'; job.error=e.message; }
      }
      this.changed();
    } finally { this.ticking=false; }
  }
  async install(job) {
    if(this.processing.has(job.id)) return;
    this.processing.add(job.id); job.status='extracting'; job.speed=0; this.changed();
    const staging=path.join(job.root, '.staging-' + job.id);
    const destination=path.join(job.root, job.id);
    try {
      const sourceBefore=job.sourceArchive?await fsp.stat(job.sourceArchive):null;
      const password=this.passwords.get(job.id) || '';
      const listing=await run(this.sevenZip,['l','-slt','-ba','-sccUTF-8','-p'+password,'--',this.archive(job)]);
      const {total}=inspectListing(listing);
      const disk=await fsp.statfs(job.root);
      if(total + 64*1024**2 > disk.bavail*disk.bsize) throw new Error('游戏库磁盘空间不足，下载文件已保留');
      if(!inside(job.root,staging) || !inside(job.root,destination)) throw new Error('目标目录校验失败');
      // Only an application-owned UUID staging directory can be cleaned up.
      if(fs.existsSync(staging)) await fsp.rm(staging,{recursive:true,force:true});
      await fsp.mkdir(staging);
      await run(this.sevenZip,['x','-y','-aoa','-sccUTF-8','-p'+password,'-o'+staging,'--',this.archive(job)]);
      if(sourceBefore){const after=await fsp.stat(job.sourceArchive);if(after.size!==sourceBefore.size||after.mtimeMs!==sourceBefore.mtimeMs)throw new Error('压缩包仍在变化，请等待网盘下载完成后重试');}
      const executables=await scanExecutables(staging);
      if(fs.existsSync(destination)) throw new Error('目标已存在；为避免覆盖，请手动检查游戏目录');
      await fsp.rename(staging,destination);
      const game={id:job.id,libraryId:job.libraryId||null,managedRoot:job.root,workId:job.workId,title:job.title,cover:job.cover,dir:destination,executables,executable:executables.length===1?executables[0]:null,state:'wish',score:null,note:'',addedAt:Date.now()};
      const saved=this.store.value.games.find(g=>!g.dir&&job.workId&&String(g.workId)===String(job.workId));if(saved){Object.assign(saved,{libraryId:game.libraryId,managedRoot:game.managedRoot,dir:game.dir,executables:game.executables,executable:game.executable});game.id=saved.id;}else this.store.value.games.unshift(game); job.status='complete'; job.gameId=game.id; job.error='';
      this.passwords.delete(job.id);
    } catch(e) { job.status='error'; job.error=e.message; }
    finally { this.processing.delete(job.id); this.changed(); }
  }
  async stop() {
    this.stopping=true; clearInterval(this.timer);
    await this.rpc('pauseAll').catch(()=>{});
    while(this.processing.size) await sleep(100);
    await this.rpc('shutdown').catch(()=>{});
    await sleep(400); this.cp?.kill();
    for(const j of this.store.value.jobs) if(['active','waiting'].includes(j.status)) j.status='paused';
    this.store.save();
  }
}
module.exports={ Store, DownloadManager, inspectListing, scanExecutables, inside, safeName, webUrl, run, sleep };
