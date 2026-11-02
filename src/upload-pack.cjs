const fs=require('node:fs/promises'),path=require('node:path');
const {Worker}=require('node:worker_threads');
const {spawn}=require('node:child_process');
const {inside}=require('./core.cjs');
function regexMatches(names,source){
 if(!source)return Promise.resolve(names.map(()=>false));
 if(source.length>500)throw new Error('正则表达式不能超过 500 字');
 return new Promise((resolve,reject)=>{
  const w=new Worker(`const {parentPort,workerData:d}=require('node:worker_threads');try{const r=new RegExp(d.source,'iu');parentPort.postMessage({matches:d.names.map(n=>r.test(n))});}catch(e){parentPort.postMessage({error:'正则表达式无效：'+e.message});}`,{eval:true,workerData:{names,source}});
  const timer=setTimeout(()=>{w.terminate();reject(new Error('正则匹配超时，请简化表达式'));},2000);
  w.once('message',r=>{clearTimeout(timer);w.terminate();r.error?reject(new Error(r.error)):resolve(r.matches);});w.once('error',e=>{clearTimeout(timer);reject(e);});
 });
}
async function inspectDirectory(root,{excludeFolders=[],excludeRegex=''}={}){
 root=await fs.realpath(root);if(!(await fs.stat(root)).isDirectory())throw new Error('游戏目录不存在');
 const folders=[],files=[],skipped=[];
 async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name),rel=path.relative(root,full).split(path.sep).join('/');
  if(item.isSymbolicLink()){skipped.push(rel);continue;}
  if(files.length+folders.length>100000)throw new Error('目录文件过多，请选择单个游戏目录');
  if(item.isDirectory()){folders.push(rel);await walk(full);}else if(item.isFile()){const stat=await fs.stat(full);files.push({path:rel,size:stat.size});}
 }}await walk(root);
 if(!Array.isArray(excludeFolders)||excludeFolders.some(f=>!folders.includes(f)))throw new Error('排除目录已变化，请重新预览');
 const names=[...folders,...files.map(f=>f.path)],matches=await regexMatches(names,String(excludeRegex));
 const excludedDirs=new Set([...excludeFolders,...folders.filter((_,i)=>matches[i])]);
 const underExcluded=p=>{let current=p;while(current){if(excludedDirs.has(current))return true;const i=current.lastIndexOf('/');if(i<0)break;current=current.slice(0,i);}return false;};
 const included=[],excluded=[];files.forEach((f,i)=>(underExcluded(f.path)||matches[folders.length+i]?excluded:included).push(f));
 return {root,folders,files:included,excluded,skipped,count:included.length,bytes:included.reduce((n,f)=>n+f.size,0),suggested:folders.filter(f=>/^(?:save(?:data|s)?|全cg存档|存档|全cg)$/i.test(f.split('/').at(-1)))};
}
async function packDirectory(plan,dest,sevenZip,{signal,onProgress=()=>{},manifest}={}){
 if(!plan.files.length)throw new Error('排除后没有可上传的文件');
 if(inside(plan.root,dest)||path.resolve(plan.root)===path.resolve(dest))throw new Error('压缩包必须保存在游戏目录之外');
 await fs.mkdir(path.dirname(dest),{recursive:true});
 for(const f of plan.files){if(signal?.aborted)throw new Error('已取消');const full=path.join(plan.root,f.path);if(!inside(plan.root,await fs.realpath(full))||(await fs.lstat(full)).isSymbolicLink())throw new Error('游戏目录内容已变化，请重新预览');}
 if(manifest&&plan.files.some(f=>f.path.toLowerCase()==='komorebi.json'))throw new Error('目录已有 komorebi.json，请在排除规则中排除旧文件后重试');
 const list=dest+'.list';await fs.writeFile(list,plan.files.map(f=>'./'+f.path).join('\n'),'utf8');
 const compress=(cwd,items)=>new Promise((resolve,reject)=>{
  const cp=spawn(sevenZip,['a','-tzip','-mx=1','-r-','-spd','-scsUTF-8','-bsp1','-sse','-ssp',dest,...items],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let tail='';const abort=()=>cp.kill();signal?.addEventListener('abort',abort,{once:true});
  cp.stdout.on('data',b=>{tail=(tail+b.toString()).slice(-2000);const all=[...tail.matchAll(/(\d+)%/g)];if(all.length)onProgress(Number(all.at(-1)[1]));});cp.stderr.on('data',()=>{});
  cp.on('error',reject);cp.on('close',code=>{signal?.removeEventListener('abort',abort);signal?.aborted?reject(new Error('已取消')):code===0?resolve():reject(new Error('压缩失败，请检查文件占用和磁盘空间'));});
 });
 try{await compress(plan.root,['@'+list]);
 if(manifest){const metadata=dest+'.metadata';await fs.mkdir(metadata,{recursive:true});await fs.writeFile(path.join(metadata,'komorebi.json'),JSON.stringify(manifest,null,2));await compress(metadata,['komorebi.json']);}
 const stat=await fs.stat(dest);if(stat.size>10*1024**3)throw new Error('生成的压缩包超过官方单文件 10 GB 上限');return dest;
 }finally{await fs.unlink(list).catch(()=>{});}
}
module.exports={inspectDirectory,packDirectory,regexMatches};
