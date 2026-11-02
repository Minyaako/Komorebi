const {randomUUID}=require('node:crypto');
const {metadata}=require('./library-scan.cjs');
async function addSeries(store,api,{id,nsfw=false}){
 const items=new Map(),seen=new Set();let cursor='';
 for(let page=0;;page++){
  if(page>=100||seen.has(cursor))throw new Error('系列分页未完整返回，请稍后重试；尚未添加任何作品');
  seen.add(cursor);
  const r=await api.catalogEntity({object:'series',id,nsfw:!!nsfw,cursor,more:true});
  if(r.relatedError||!r.related)throw new Error(r.relatedError||'系列作品暂时无法读取');
  for(const w of r.related.items||[])if(w.id!=null)items.set(String(w.id),w);
  cursor=r.related.next_cursor;if(!cursor)break;
 }
 const before=store.value.games,existing=new Set(before.map(g=>String(g.workId))),added=[];
 for(const w of items.values())if(!existing.has(String(w.id)))added.push({id:randomUUID(),...metadata(w),seriesId:String(id),dir:null,executables:[],executable:null,state:'wish',score:null,note:'',addedAt:Date.now()});
 if(added.length){store.value.games=[...added,...before];try{store.save();}catch(e){store.value.games=before;throw e;}}
 return {added:added.length,existing:items.size-added.length,total:items.size};
}
module.exports={addSeries};
