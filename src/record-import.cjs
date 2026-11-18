// Interoperable readers for Reina Exporter's public schema and WhiteCloud 0.4.
// No upstream executable is required and source files are opened read-only.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const text=v=>typeof v==='string'?v.trim():'';
const positive=v=>Number.isFinite(v)&&v>=0?v:0;
const norm=v=>text(v).normalize('NFKC').toLowerCase();
function launch(dir,exe){
 dir=text(dir);exe=text(exe).replaceAll('{InstallDir}',dir);
 if(!path.isAbsolute(dir))return {dir:null,executable:null};
 const relative=path.isAbsolute(exe)?path.relative(dir,exe):exe;
 return {dir:path.normalize(dir),executable:relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&/\.exe$/i.test(relative)?relative:null};
}
function sessions(rows){
 const days={};let seconds=0,endSeen=0;
 for(const r of rows.sort((a,b)=>a.start-b.start)){
  let start=Math.max(positive(r.start),endSeen),end=positive(r.end);
  if(!start||end<=start||end-start>31*86400000)continue;
  endSeen=end;
  while(start<end){const d=new Date(start),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),until=Math.min(end,next),n=(until-start)/1000;
   const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
   days[key]=(days[key]||0)+n;seconds+=n;start=until;
  }
 }
 return {seconds,days};
}
function readRecords(file){
 if(fs.statSync(file).size>100*1024*1024)throw Error('记录文件超过 100 MB，请分批导出');
 let source,records;
 if(/\.(sqlite|db)$/i.test(file)){
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{readOnly:true,allowExtension:false});
  try{
   db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
   const games=db.prepare('SELECT uuid,name,gameDir,exePath FROM games LIMIT 10001').all();
   const history=db.prepare('SELECT game,start,end FROM history LIMIT 500001').all();
   if(history.length>500000)throw Error('会话记录过多，请分批导出');
   source='WhiteCloud';const groups=new Map();for(const h of history){if(!groups.has(h.game))groups.set(h.game,[]);groups.get(h.game).push(h);}
   records=games.map(g=>({sourceId:g.uuid,title:g.name,...launch(g.gameDir,g.exePath),...sessions(groups.get(g.uuid)||[])}));
  }finally{db.close();}
 }else{
  const doc=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(doc.format==='reina-playnite-export'){
   if(doc.version!==1||!Array.isArray(doc.games))throw Error('仅支持 Reina Exporter v1 的 Playnite JSON');
   source='Playnite';const states={'Not Played':'wish','Plan to Play':'wish',Playing:'doing',Played:'done',Beaten:'done',Completed:'done','On Hold':'on_hold',Abandoned:'dropped'};
   records=doc.games.map(g=>({sourceId:g.id,title:g.name,...launch(g.install_directory,g.play_action?.path),state:states[g.completion_status]||'wish',note:text(g.notes).slice(0,2000),score:typeof g.user_score==='number'&&g.user_score>=0?Math.min(10,g.user_score/10):null,seconds:positive(g.playtime_seconds),days:{},lastPlayedAt:Date.parse(g.last_activity)||null}));
  }else if(Array.isArray(doc.games)&&doc.games.every(g=>typeof g.name==='string'&&typeof g.playTimeMs==='number')){
   source='Vnite';records=doc.games.map(g=>({sourceId:g.name,title:g.name,seconds:positive(g.playTimeMs)/1000,days:{},dir:null,executable:null}));
  }else throw Error('无法识别记录格式。支持 Reina Exporter 的 Playnite JSON、WhiteCloud db.3.sqlite 和 Vnite 游玩时长 JSON 报告');
 }
 if(records.length>10000)throw Error('单次最多导入 10000 部作品');
 const valid=records.filter(g=>text(g.title)&&text(g.sourceId));
 return {source,records:valid.map(g=>({...g,title:text(g.title).slice(0,300),sourceId:text(g.sourceId),seconds:positive(g.seconds)})),invalid:records.length-valid.length};
}
function mergeRecords(value,input){
 const next=structuredClone(value),result={added:0,merged:0,skipped:input.invalid||0};
 next.playtime||={entries:{},synced:{}};
 for(const row of input.records){
  const origin=input.source+':'+row.sourceId;
  let matches=next.games.filter(g=>g.importOrigins?.includes(origin));
  if(!matches.length&&row.dir)matches=next.games.filter(g=>g.dir&&norm(path.resolve(g.dir))===norm(path.resolve(row.dir)));
  if(!matches.length&&!row.dir)matches=next.games.filter(g=>norm(g.title)===norm(row.title));
  if(matches.length>1){result.skipped++;continue;}
  let g=matches[0];
  if(!g){g={id:randomUUID(),title:row.title,dir:row.dir||null,executable:row.executable||null,executables:row.executable?[row.executable]:[],state:row.state||'wish',score:row.score??null,note:row.note||'',addedAt:Date.now(),lastPlayedAt:row.lastPlayedAt||null};next.games.push(g);result.added++;}
  else result.merged++;
  g.importOrigins=[...new Set([...(g.importOrigins||[]),origin])];
  const entries=Object.values(next.playtime.entries).filter(e=>e.gameId===g.id),total=entries.reduce((n,e)=>n+e.seconds,0),delta=Math.max(0,row.seconds-total);
  // Only fill the missing baseline. Re-importing never doubles existing playtime.
  if(delta){const key=JSON.stringify(['',g.id,g.workId||'']),entry=next.playtime.entries[key]||={gameId:g.id,workId:g.workId||null,title:g.title,owner:'',seconds:0,days:{}};
   entry.seconds+=delta;let remaining=delta;
   for(const [day,seconds] of Object.entries(row.days||{})){const existing=entries.reduce((n,e)=>n+(e.days[day]||0),0),add=Math.min(remaining,Math.max(0,seconds-existing));if(add){entry.days[day]=(entry.days[day]||0)+add;remaining-=add;}}
  }
 }
 return {value:next,result};
}
module.exports={readRecords,mergeRecords,sessions,launch};
