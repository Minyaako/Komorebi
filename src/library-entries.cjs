function removeEntry(store,id,{activeUpload=false}={}){
 const g=store.value.games.find(g=>g.id===id);if(!g)throw new Error('游戏已不在库中');
 if(activeUpload)throw new Error('这部游戏正在上传，请完成或取消任务后再移除');
 const before=store.value.games,removed=store.value.removedGames||[];
 store.value.games=before.filter(g=>g.id!==id);store.value.removedGames=[{...g,removedAt:Date.now()},...removed.filter(g=>g.id!==id)];
 try{store.save();}catch(e){store.value.games=before;store.value.removedGames=removed;throw e;}return {id,title:g.title};
}
function restoreEntry(store,id){
 const removed=store.value.removedGames||[],g=removed.find(g=>g.id===id);if(!g)throw new Error('没有找到移除记录');
 if(store.value.games.some(x=>x.id===id||((!x.dir||!g.dir)&&g.workId&&String(x.workId)===String(g.workId))||(x.dir&&g.dir&&x.dir.toLowerCase()===g.dir.toLowerCase())))throw new Error('该游戏已在库中');
 const before=store.value.games,{removedAt,...entry}=g;
 store.value.games=[entry,...before];store.value.removedGames=removed.filter(g=>g.id!==id);
 try{store.save();}catch(e){store.value.games=before;store.value.removedGames=removed;throw e;}return {id};
}
module.exports={removeEntry,restoreEntry};
