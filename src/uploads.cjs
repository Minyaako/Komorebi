const path=require('node:path'),{randomUUID}=require('node:crypto'),{EventEmitter}=require('node:events');
const {inspectDirectory,packDirectory}=require('./upload-pack.cjs');
const {safeName,inside}=require('./core.cjs');
const fs=require('node:fs/promises');
const {shareDraft}=require('./official-adapter.cjs');
class Uploads extends EventEmitter{
 constructor({store,dataDir,sevenZip,startOfficial}){super();Object.assign(this,{store,dataDir,sevenZip,startOfficial});this.previews=new Map();this.running=new Map();store.value.uploads||=[];for(const j of store.value.uploads)if(!['complete','cancelled','interrupted'].includes(j.status)){j.status='interrupted';j.message='上次任务已中断，请先查看官网投稿记录；不会自动重复上传';}store.save();}
 game(id){const g=this.store.value.games.find(x=>x.id===id);if(!g)throw new Error('游戏不存在');return g;}
 async preview({id,excludeFolders,excludeRegex='',suggest=false}){const g=this.game(id);let plan=await inspectDirectory(g.dir,{excludeFolders:excludeFolders||[],excludeRegex});if(suggest)plan=await inspectDirectory(g.dir,{excludeFolders:plan.suggested,excludeRegex});const token=randomUUID();if(this.previews.size>=20)this.previews.delete(this.previews.keys().next().value);this.previews.set(token,{id,plan,rules:{excludeFolders:suggest?plan.suggested:excludeFolders||[],excludeRegex}});return {token,folders:plan.folders,selectedFolders:suggest?plan.suggested:excludeFolders||[],count:plan.count,bytes:plan.bytes,excludedCount:plan.excluded.length,excluded:plan.excluded.slice(0,200).map(f=>f.path),skipped:plan.skipped,executables:plan.files.filter(f=>/\.(exe|cmd|bat)$/i.test(f.path)).map(f=>f.path)};}
 changed(j,patch){if(Object.entries(patch).every(([k,v])=>j[k]===v))return;Object.assign(j,patch);this.store.save();this.emit('change');}
 async start({token,title,description,executable=''}){
  const preview=this.previews.get(token);if(!preview)throw new Error('请先预览压缩内容');const g=this.game(preview.id);
  if(this.running.size)throw new Error('请先完成或取消当前上传任务');
  if(!g.workId)throw new Error('请先按名称选择关联作品');
  const draft=shareDraft({workId:g.workId,title,description});
  const launch=String(executable).replaceAll('\\','/');if(launch&&!preview.plan.files.some(f=>f.path===launch))throw new Error('启动文件已排除或不在游戏目录中');
  const id=randomUUID(),archive=path.join(this.dataDir,'uploads',id,safeName(g.title)+'.zip');
  const manifest={schema:'komorebi.submission',version:1,work:{provider:'nextmoe',id:draft.workId,title:g.title},resource:{title:draft.title,description:draft.description,source:'repost'},launch:launch?{type:'file',path:launch}:{type:'directory'}};
  const j={id,gameId:g.id,title:g.title,archive,status:'packing',progress:0,message:'正在压缩游戏目录',createdAt:Date.now()};const controller=new AbortController();const task={controller};
  this.running.set(id,task);this.store.value.uploads.unshift(j);this.store.save();this.emit('change');this.previews.delete(token);
  (async()=>{try{
   const plan=await inspectDirectory(g.dir,preview.rules);if(launch&&!plan.files.some(f=>f.path===launch))throw new Error('启动文件已变化，请重新预览');
   await packDirectory(plan,archive,this.sevenZip,{signal:controller.signal,manifest,onProgress:p=>this.changed(j,{progress:p})});
   if(controller.signal.aborted)return;
   task.browser=this.startOfficial({draft:{...draft,launch},archive,onState:patch=>{this.changed(j,patch);if(['complete','cancelled'].includes(patch.status))this.running.delete(id);}});
  }catch(e){if(!controller.signal.aborted)this.changed(j,{status:'error',message:e.message});this.running.delete(id);}})();return {id};
 }
 show(id){const b=this.running.get(id)?.browser;if(!b)throw new Error('当前没有打开的官网任务页');b.show();}
 async retry(id){
  const j=this.store.value.uploads.find(x=>x.id===id);
  if(!j||!['attention','error','interrupted','cancelled'].includes(j.status))throw new Error('当前任务无需继续');
  if(j.submitted)throw new Error('该任务已发送投稿，请先在官网核对结果，避免重复提交');
  if([...this.running.keys()].some(key=>key!==id))throw new Error('请先完成其他上传任务');
  if(![path.join(this.dataDir,'uploads'),...(this.store.value.settings?.legacyUploadDirs||[])].some(root=>inside(root,j.archive)))throw new Error('压缩包位置不正确');
  const stat=await fs.stat(j.archive);if(!stat.isFile()||!stat.size||stat.size>10*1024**3)throw new Error('压缩包不存在或大小无效');
  const manifestFile=path.join(j.archive+'.metadata','komorebi.json');if((await fs.stat(manifestFile)).size>65536)throw new Error('投稿记录过大');
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  if(manifest.schema!=='komorebi.submission'||manifest.version!==1)throw new Error('无法读取原投稿信息');
  const draft=shareDraft({workId:manifest.work?.id,title:manifest.resource?.title,description:manifest.resource?.description});
  const launch=manifest.launch?.type==='file'?String(manifest.launch.path||'').replaceAll('\\','/') : '';
  if(launch&&(launch.startsWith('/')||launch.includes(':')||launch.split('/').includes('..')))throw new Error('启动程序相对路径无效');
  // Re-check after disk reads so a double click cannot start two uploads.
  if(!['attention','error','interrupted','cancelled'].includes(j.status))throw new Error('任务已经继续');
  const old=this.running.get(id);old?.controller.abort();old?.browser?.cancel();
  const task={controller:new AbortController()};this.running.set(id,task);this.changed(j,{status:'opening',message:'使用已有压缩包继续上传',progress:0});
  try{task.browser=this.startOfficial({draft:{...draft,launch},archive:j.archive,onState:patch=>{this.changed(j,patch);if(['complete','cancelled'].includes(patch.status))this.running.delete(id);}});}catch(e){this.running.delete(id);this.changed(j,{status:'error',message:e.message});throw e;}
  return {id};
 }
 cancel(id){const task=this.running.get(id);if(!task)return;task.controller.abort();task.browser?.cancel();this.running.delete(id);const j=this.store.value.uploads.find(j=>j.id===id);if(j)this.changed(j,{status:'cancelled',message:j.submitted?'停止跟踪；请到官网核对已发送投稿':'已取消，原游戏目录保持不变'});}
 get active(){return this.running.size>0;}
}
module.exports={Uploads};
