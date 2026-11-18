const numeric=v=>{if(!/^\d+$/.test(String(v)))throw Error('无效补丁或作品 ID');return String(v);};
const read=(api,route)=>api.cached(route,120000,()=>api.api(route,{kind:'app'}));
async function search(api,{query='',cursor='',nsfw=false,workId}={}){
 if(!api.vault.get('apiKey'))throw Error('查询补丁需要个人资源密钥，请在账号与连接中申领或填写。');
 const p=new URLSearchParams({limit:'48',has_resources:'true',nsfw:String(!!nsfw)});let works,source;
 if(workId){p.set('refs','catalog:'+numeric(workId));}
 else if(query.trim()){
  source=await api.search({query,cursor,nsfw});works=source.items||[];
  if(!works.length)return {...source,total:undefined};
  p.set('refs',works.map(w=>'catalog:'+numeric(w.id)).join(','));
 }else{p.set('sort','updated');p.set('include_total','true');if(cursor)p.set('cursor',String(cursor).slice(0,512));}
 const data=await read(api,'/v2/moyu/patches?'+p);
 if(!works){
  const ids=[...new Set((data.items||[]).map(x=>x.catalog_work_id).filter(Boolean))].map(numeric);
  works=ids.length?(await api.api('/v2/catalog/works?'+new URLSearchParams({ids:ids.join(','),include:'titles,covers',nsfw:String(!!nsfw)}))).items||[]:[];
 }
 const byId=new Map(works.map(w=>[String(w.id),w]));
 return {...data,items:(data.items||[]).filter(x=>nsfw||x.content_limit!=='nsfw').map(x=>({...x,display_name:byId.get(String(x.catalog_work_id))?.localized?.['zh-Hans']?.value||byId.get(String(x.catalog_work_id))?.display_name||'补丁页 '+x.id})),...(source?{next_cursor:source.next_cursor||null,total:undefined,approximate:source.approximate}:{}),candidatePaging:!!source};
}
async function detail(api,{id,nsfw=false,cursor}){
 const safe=numeric(id),p=new URLSearchParams({ids:safe,nsfw:String(!!nsfw)});
 const patch=(await read(api,'/v2/moyu/patches?'+p)).items?.find(x=>String(x.id)===safe);
 if(!patch||!nsfw&&patch.content_limit==='nsfw')throw Error('补丁不存在或不符合当前内容设置。');
 const resources=await read(api,'/v2/moyu/patches/'+safe+'/resources?'+new URLSearchParams({limit:'48',include:'publisher',include_total:'true',...(cursor?{cursor:String(cursor).slice(0,512)}:{})}));
 return {detail:patch,related:resources};
}
module.exports={search,detail};
