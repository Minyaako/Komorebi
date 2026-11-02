const {randomUUID}=require('node:crypto');
function updateCollection(store,{action,id,name,gameIds=[],gameId}){
 const before=store.value.collections||[],entry=before.find(c=>c.id===id);
 if(action==='move'){
  if(!store.value.games.some(g=>g.id===gameId))throw Error('游戏已不在库中');
  let target=entry;
  if(id&&!target)throw Error('收藏集不存在');
  if(!id){name=String(name||'').trim();if(!name||name.length>60)throw Error('收藏集名称需为 1–60 个字符');if(before.some(c=>c.name===name))throw Error('已有同名收藏集');target={id:randomUUID(),name,gameIds:[]};}
  store.value.collections=[...before,...(!id?[target]:[])].map(c=>({...c,gameIds:c.id===target.id?[...new Set([...c.gameIds,gameId])]:c.gameIds.filter(x=>x!==gameId)}));
  try{store.save();}catch(e){store.value.collections=before;throw e;}return true;
 }
 if(action!=='save' &&action!=='delete')throw Error('未知收藏集操作');
 if(id&&!entry)throw Error('收藏集不存在');
 if(action==='save'){
  name=String(name||'').trim();if(!name||name.length>60)throw Error('收藏集名称需为 1–60 个字符');
  if(before.some(c=>c.id!==id&&c.name===name))throw Error('已有同名收藏集');
  if(!Array.isArray(gameIds))throw Error('无效游戏列表');
  const valid=new Set(store.value.games.map(g=>g.id));
  const c={id:id||randomUUID(),name,gameIds:[...new Set(gameIds.filter(x=>valid.has(x)))]};
  store.value.collections=entry?before.map(x=>x===entry?c:x):[...before,c];
 }else store.value.collections=before.filter(c=>c.id!==id);
 try{store.save();}catch(e){store.value.collections=before;throw e;}return true;
}
module.exports={updateCollection};
