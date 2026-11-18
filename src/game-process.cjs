const {EventEmitter}=require('node:events');
const {execFile}=require('node:child_process');
const path=require('node:path');
function processes(){
 const script="[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_Process | ForEach-Object { @{id=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;exe=$_.ExecutablePath;born=([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()} }) | ConvertTo-Json -Compress";
 return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024},(err,out)=>{if(err)return reject(err);try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')));}catch(e){reject(e);}}));
}
class GameProcess extends EventEmitter{
 constructor(child,dir,{list=processes,now=Date.now,interval=5000}={}){
  super();Object.assign(this,{child,dir:path.resolve(dir).toLowerCase(),list,now});this.started=now()-1000;this.rootExited=false;this.known=new Map();this.ended=false;
  child.once('exit',()=>{this.rootExited=true;this.rootExitAt=now();this.poll();});
  this.timer=setInterval(()=>this.poll(),interval);this.timer.unref?.();this.poll();
 }
 select(rows){
  const candidates=rows.filter(p=>p.born>=this.started);
  const ids=new Set([this.child.pid]);
  // Processes launched in the game's directory cover launcher hand-offs whose intermediate parent has exited.
  const matches=new Map();
  for(const p of candidates){const rel=p.exe&&path.relative(this.dir,path.resolve(p.exe).toLowerCase());if(p.exe&&rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel))matches.set(p.id,p);}
  let change=true;
  while(change){change=false;for(const p of candidates){if((ids.has(p.parent)&&(p.parent!==this.child.pid||!this.rootExited||p.born<=this.rootExitAt))||this.known.get(p.id)?.born===p.born||matches.has(p.id)){if(!ids.has(p.id)){ids.add(p.id);change=true;}matches.set(p.id,p);}}}
  // Never retain the launcher PID after exit: Windows can reuse it.
  if(this.rootExited&&matches.get(this.child.pid)?.born!==this.known.get(this.child.pid)?.born)matches.delete(this.child.pid);
  this.known=matches;return [...matches.values()];
 }
 async poll(){
  if(this.pending||this.ended)return this.pending;
  this.pending=(async()=>{const alive=this.select(await this.list());if(this.rootExited&&!alive.length){this.dispose();this.emit('exit',0);}})().catch(()=>{/* Keep tracking during a transient process-query failure. */}).finally(()=>{this.pending=null;});return this.pending;
 }
 async kill(){
  const alive=this.select(await this.list());
  if(!this.rootExited&&!alive.some(p=>p.id===this.child.pid))this.child.kill();
  for(const p of alive){try{process.kill(p.id);}catch(e){if(e.code!=='ESRCH')throw e;}}
  await this.poll();return true;
 }
 dispose(){this.ended=true;clearInterval(this.timer);}
}
module.exports={GameProcess,processes};
