const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const archiveFile=name=>/\.(zip|7z|rar)$/i.test(name)&&! /\.part\d+\.rar$/i.test(name);
const fingerprint=s=>`${s.size}:${s.mtimeMs}`;
async function listArchives(root){const files=[];let visited=0;async function walk(dir,depth){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(++visited>5000)throw new Error('目录文件过多，请选择更具体的下载文件夹');if(e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory()&&depth<2)await walk(file,depth+1);else if(e.isFile()&&archiveFile(e.name)){const stat=await fs.stat(file);files.push({file,size:stat.size,fingerprint:fingerprint(stat)});}}}await walk(root,0);return files;}
class ArchiveWatch{
 constructor({store,downloads,now=Date.now,stableMs=45000,changed=()=>{}}){Object.assign(this,{store,downloads,now,stableMs,changed});this.candidates=new Map();this.status={};this.stopped=false;this.busy=false;}
 key(w,file){return createHash('sha256').update(w.id+'\0'+file.toLowerCase()).digest('hex');}
 async baseline(w){for(const f of await listArchives(w.path))this.store.value.watchSeen[this.key(w,f.file)]=f.fingerprint;this.store.save();}
 start(){this.timer=setInterval(()=>this.tick(),5000);this.timer.unref?.();}
 stop(){this.stopped=true;clearInterval(this.timer);}
 async tick(){if(this.busy||this.stopped)return;this.busy=true;
  try{for(const w of this.store.value.settings.watchFolders||[]){if(!w.enabled)continue;
   try{const files=await listArchives(w.path);this.status[w.id]={message:'正在监听，文件稳定 45 秒后移动，等待手动处理',checkedAt:this.now()};
    for(const f of files){const key=this.key(w,f.file);if(!f.size||this.store.value.watchSeen[key]===f.fingerprint)continue;
     const old=this.candidates.get(key);if(!old||old.fingerprint!==f.fingerprint){this.candidates.set(key,{fingerprint:f.fingerprint,since:this.now()});continue;}
     if(this.now()-old.since<this.stableMs||this.downloads.processing.size)continue;
     if(await fs.stat(f.file+'.aria2').then(()=>true,()=>false))continue;
     if(this.stopped||!w.enabled)break;
     if(this.store.value.jobs.some(j=>j.sourceArchive===f.file&&!['complete','cancelled'].includes(j.status)))continue;
     await this.downloads.receiveArchive(f.file,{libraryId:w.libraryId,watchId:w.id});this.store.value.watchSeen[key]=f.fingerprint;this.candidates.delete(key);this.store.save();
    }
   }catch(e){this.status[w.id]={message:e.message,error:true,checkedAt:this.now()};}
  }}finally{this.busy=false;this.changed();}
 }
}
module.exports={ArchiveWatch,listArchives,archiveFile,fingerprint};
