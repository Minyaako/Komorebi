async function filterHosted(api,items,nsfw){
 const matched=new Set();let index=0;
 await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
  while(index<items.length){const w=items[index++];
   const has=await api.cached('hosted-search:'+w.id+':'+!!nsfw,300000,async()=>{
    let cursor='';const seen=new Set();
    for(let page=0;page<100;page++){
     const r=await api.resources(w.id,nsfw,cursor);
     if((r.items||[]).some(x=>x.direct_download===true))return true;
     cursor=r.next_cursor;if(!cursor)return false;
     if(seen.has(cursor))throw Error('资源分页异常，请稍后重试直链筛选');seen.add(cursor);
    }
    throw Error('资源页过多，暂时无法确定直链状态');
   });if(has)matched.add(String(w.id));
  }
 }));return items.filter(w=>matched.has(String(w.id)));
}
module.exports={filterHosted};
