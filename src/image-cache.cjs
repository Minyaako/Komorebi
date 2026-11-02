const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{pathToFileURL}=require('node:url');
class ImageCache{
 constructor(dir,request=fetch){this.dir=dir;this.request=request;this.pending=new Map();}
 async get(raw){
  const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw new Error('图片必须使用 HTTPS');
  const key=createHash('sha256').update(url.href).digest('hex');
  if(this.pending.has(key))return this.pending.get(key);
  const promise=this.load(url.href,key).finally(()=>this.pending.delete(key));this.pending.set(key,promise);return promise;
 }
 async load(url,key){
  const file=path.join(this.dir,key+'.img');
  try{if((await fs.stat(file)).size>0)return pathToFileURL(file).href;}catch(e){if(e.code!=='ENOENT')throw e;}
  const response=await this.request(url,{signal:AbortSignal.timeout(20000),credentials:'omit'});
  if(!response.ok)throw new Error('横幅下载失败');
  if(!/^image\/(jpeg|png|webp|gif|avif)(;|$)/i.test(response.headers.get('content-type')||''))throw new Error('不支持的图片格式');
  const limit=20*1024*1024;if(Number(response.headers.get('content-length'))>limit)throw new Error('图片过大');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('图片过大');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
  if(!size)throw new Error('图片为空');
  await fs.mkdir(this.dir,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,Buffer.concat(chunks));await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  return pathToFileURL(file).href;
 }
}
module.exports={ImageCache};
