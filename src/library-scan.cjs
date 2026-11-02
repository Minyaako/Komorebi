const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {inside,scanExecutables}=require('./core.cjs');
const skip=/^(?:savedata|saves?|全\s*cg存档|存档|汉化补丁|patch(?:es)?|_?redist|node_modules|\.git|tools?|cache|windows|system volume information|\$recycle\.bin)$/i;
const exe=n=>/\.exe$/i.test(n)&&! /^(?:unins|uninstall|setup|install|redist|vcredist|dxsetup|crash|unitycrash|notification_helper)/i.test(n);
const key=p=>path.resolve(p).replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
function cleanName(name){
 return String(name).normalize('NFKC').replace(/[（(【\[]([^）)】\]]*)[）)】\]]/g,(all,text)=>/汉化|中文|简体|繁体|硬盘|免安装|存档|解压|补丁|steam|dlsite|r18|r-18|^pc$|\d{6,}/i.test(text)?' ':all)
 .trim().replace(/(?:[_\s]*(?:简体中文版|繁体中文版|汉化版|中文硬盘版|免安装版|硬盘版|整合版|汉化整合版|含全CG存档|无存档))+$/ig,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
}
function normalized(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu,'');}
async function configTitles(dir){
 const names=[];
 for(const filename of ['Start.ini','Game.ini']){
   const file=path.join(dir,filename);try{
     const st=await fs.promises.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>256*1024||!inside(fs.realpathSync(dir),fs.realpathSync(file)))continue;
     const bytes=await fs.promises.readFile(file);let texts=[];
     try{texts=[new TextDecoder('utf-8',{fatal:true}).decode(bytes)];}catch{texts=[new TextDecoder(filename==='Start.ini'?'shift_jis':'gb18030').decode(bytes)];}
     for(const text of texts){const title=text.match(/^\s*#?(?:GAME_TITLE|Title)\s*=\s*["']?([^\r\n"']+)/mi)?.[1]?.trim();if(title&&title.length<=200&&!/[\uFFFD\uE000-\uF8FF]/.test(title))names.push(title);}
   }catch{}
 }
 return [...new Set(names)];
}
function workTitle(w){return w.localized?.['zh-Hans']?.value||w.display_name||w.title||'';}
function workNames(w){return [workTitle(w),w.display_name,...Object.values(w.localized||{}).map(t=>t.value),...(w.titles||[]).flatMap(t=>[t.title,t.name,t.value]),...(w.aliases||[]).map(t=>typeof t==='string'?t:t.value||t.title)].filter(Boolean);}
function rankMatches(query,items){
 const q=normalized(query);if(!q)return [];
 return [...new Map(items.map(w=>[String(w.id),w])).values()].map(w=>{
   const names=workNames(w).map(normalized);let score=0;
   for(const n of names){if(n===q){score=1;break;}if(Math.min(q.length,n.length)>=4&&(n.includes(q)||q.includes(n)))score=Math.max(score,Math.min(q.length,n.length)/Math.max(q.length,n.length)*.85);}
   return {...w,matchScore:score};
 }).sort((a,b)=>b.matchScore-a.matchScore).slice(0,12);
}
async function discoverFolders(root,{depth=4,cancelled=()=>false}={}){
 root=fs.realpathSync(root);const found=[],warnings=[];let visited=0;
 async function walk(dir,level){
   if(cancelled())return;if(++visited>10000)throw new Error('目录数量超过 10000，请选择更小的游戏库');
   let entries;try{entries=await fs.promises.readdir(dir,{withFileTypes:true});}catch{warnings.push('无法读取：'+dir);return;}
   if(level===0&&entries.some(e=>e.isFile()&&exe(e.name)))warnings.push('游戏库根目录含独立 EXE，本次仅扫描子目录；单个游戏请使用“添加单个游戏”。');
   if(level>0&&entries.some(e=>e.isFile()&&exe(e.name))){
     let candidate=dir;
     if(/^(?:bin|binaries|win32|win64|x64|x86)$/i.test(path.basename(dir))&&dir!==root)candidate=path.dirname(dir);
     if(!found.some(p=>key(p)===key(candidate)||inside(p,candidate)))found.push(candidate);
     return;
   }
   if(level>=depth)return;
   for(const e of entries){
     if(cancelled())return;
     if(e.isSymbolicLink()){warnings.push('跳过链接：'+path.join(dir,e.name));continue;}
     if(e.isDirectory()&&!skip.test(e.name)){
       const p=path.join(dir,e.name);try{if(!inside(root,fs.realpathSync(p)))continue;}catch{continue;}
       await walk(p,level+1);
     }
   }
 }
 await walk(root,0);
 return {folders:found.filter(p=>!found.some(other=>other!==p&&inside(other,p))).slice(0,300),warnings,limited:found.length>300};
}
function metadata(w){return {workId:String(w.id),title:workTitle(w),cover:w.cover?.url||w.cover||null,catalog:{display_name:w.display_name,release_date:w.release_date,ratings:w.ratings||[],tags:w.tags||[],companies:w.companies||[],series:w.series||[],credits:w.credits||[],titles:w.titles||[],intros:w.intros||[]}};}
class LibraryScanner extends EventEmitter{
 constructor({store,api,interval=2200}){super();Object.assign(this,{store,api,interval});this.value={status:'idle',rows:[],warnings:[],processed:0,total:0};this.active=false;this.lastRequest=0;}
 changed(){this.emit('change');}
 async search(query,nsfw){
   const wait=Math.max(0,this.lastRequest+this.interval-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));
   if(this.cancelled)throw new Error('扫描已停止');this.lastRequest=Date.now();
   return this.api.search({query,nsfw});
 }
 async start(root,{single=false,nsfw=true,depth=4}={}){
   if(this.active||this.rematching)throw new Error('已有扫描或匹配任务正在进行');
   if(this.committing)throw new Error('正在入库，请稍后');
   this.active=true;this.cancelled=false;this.value={id:randomUUID(),root,status:'scanning',rows:[],warnings:[],processed:0,total:0,nsfw,single};this.changed();
   try{
     const result=single?{folders:[fs.realpathSync(root)],warnings:[]}:await discoverFolders(root,{depth:Math.min(6,Math.max(1,Number(depth)||4)),cancelled:()=>this.cancelled});
     this.value.warnings=result.warnings;if(result.limited)this.value.warnings.push('已达到单次 300 个游戏上限，请分目录扫描');
     this.value.total=result.folders.length;
     for(const dir of result.folders){
       if(this.cancelled)break;
       const existing=this.store.value.games.find(g=>g.dir&&key(g.dir)===key(dir));
       const searchNames=cleanName(path.basename(dir)).split(/[|｜]/).map(s=>s.trim()).filter(Boolean);
       const row={id:randomUUID(),dir,name:path.basename(dir),query:searchNames[0]||path.basename(dir),status:'matching',matches:[],selected:'',include:!existing,existingId:existing?.id};
       this.value.rows.push(row);this.changed();
       if(existing?.workId){row.status='duplicate';row.include=false;}
       else try{
         row.executables=await scanExecutables(dir);
         if(!row.executables.length)throw new Error('目录中没有可识别的 EXE，可改为选择单个游戏目录或启动程序');
         const config=await configTitles(dir),short=row.query.split(/[~〜～]/)[0].trim();
         const queries=[...new Set([...searchNames,...config,short.length>=3?short:''].filter(Boolean))].slice(0,3);
         let shortMatch=false;
         for(const query of queries){
           const r=await this.search(query,nsfw);if(this.cancelled)break;
           const ranked=rankMatches(query,[...row.matches,...(r.items||[])]);
           if(!row.matches.length||ranked[0]?.matchScore>=(row.matches[0]?.matchScore||0)){row.matches=ranked;row.query=query;shortMatch=query===short&&!searchNames.includes(query)&&!config.includes(query);}
           if(row.matches.some(w=>w.matchScore===1))break;
         }
         if(this.cancelled)break;
         if(!shortMatch&&row.matches[0]?.matchScore===1&&row.matches[1]?.matchScore!==1){row.selected=String(row.matches[0].id);row.status='matched';}
         else row.status=row.matches.length?'review':'unmatched';
         row.include=true;
       }catch(e){row.status='error';row.error=e.message;row.include=false;}
       this.value.processed++;this.changed();
     }
     this.value.status=this.cancelled?'cancelled':'ready';
   }catch(e){this.value.status='error';this.value.error=e.message;}
   finally{for(const row of this.value.rows)if(row.status==='matching'){row.status='error';row.error='识别已停止，可重新搜索';row.include=false;}this.active=false;this.changed();}
 }
 cancel(){this.cancelled=true;this.value.status='stopping';this.changed();}
 row(id){const r=this.value.rows.find(r=>r.id===id);if(!r)throw new Error('扫描结果已过期，请重新扫描');return r;}
 async rematch({id,query,workId}){
   if(this.active||this.committing||this.rematching)throw new Error('请等待当前扫描或匹配完成');
   const row=this.row(id);this.rematching=true;this.cancelled=false;row.status='matching';this.changed();
   try{
     const items=workId?[await this.api.detail(workId,this.value.nsfw)]:(await this.search(String(query||row.query).trim().slice(0,200),this.value.nsfw)).items||[];
     row.query=String(query||row.query);row.matches=rankMatches(row.query,items);row.selected=workId&&items[0]?String(items[0].id):'';row.status=row.selected?'matched':items.length?'review':'unmatched';delete row.error;
   }catch(e){row.status='error';row.error=e.message;}finally{this.rematching=false;this.changed();}
 }
 async commit(choices){
   if(this.active||this.committing||this.rematching)throw new Error('请等待扫描完成');
   if(!Array.isArray(choices)||choices.length>300)throw new Error('无效入库列表');
   this.committing=true;let added=0,updated=0,skipped=0;const errors=[];
   try{for(const choice of choices){
     const row=this.row(choice.id);if(row.status==='duplicate'){skipped++;continue;}
     let before;
     try{
       const work=choice.workId?row.matches.find(w=>String(w.id)===String(choice.workId)):null;
       if(choice.workId&&!work)throw new Error('请从当前候选作品中选择');
       const canonical=fs.realpathSync(row.dir);if(key(canonical)!==key(row.dir))throw new Error('目录位置发生变化，请重新扫描');
       const executables=await scanExecutables(canonical);if(!executables.length)throw new Error('未找到启动程序');
       before=this.store.value.games;
       const existing=this.store.value.games.find(g=>g.dir&&key(g.dir)===key(canonical));
       let outcome;
       if(existing){if(work&&!existing.workId){this.store.value.games=before.map(g=>g===existing?{...g,...metadata(work)}:g);outcome='updated';}else outcome='skipped';}
       else if(work&&before.some(g=>!g.dir&&String(g.workId)===String(work.id))){this.store.value.games=before.map(g=>!g.dir&&String(g.workId)===String(work.id)?{...g,...metadata(work),dir:canonical,executables,executable:executables.length===1?executables[0]:null}:g);outcome='updated';}
       else {this.store.value.games=[{id:randomUUID(),title:row.name,dir:canonical,executables,executable:executables.length===1?executables[0]:null,state:'wish',score:null,note:'',addedAt:Date.now(),...(work?metadata(work):{})},...before];outcome='added';}
       if(outcome!=='skipped')this.store.save();
       if(outcome==='added')added++;else if(outcome==='updated')updated++;else skipped++;
       row.status='duplicate';row.include=false;
     }catch(e){if(before)this.store.value.games=before;errors.push({name:row.name,error:e.message});}
   }}finally{this.committing=false;this.changed();}
   return {added,updated,skipped,errors};
 }
}
module.exports={LibraryScanner,discoverFolders,cleanName,rankMatches,configTitles,metadata,key};
