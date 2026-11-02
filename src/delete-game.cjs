const fs=require('node:fs/promises'),path=require('node:path');
const contains=(parent,child)=>{const r=path.relative(parent,child);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
async function deletionTarget(game,{games=[],protectedPaths=[]}={}){
 if(!game.dir)return null;
 const target=await fs.realpath(game.dir),stat=await fs.lstat(game.dir);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('不自动删除链接或非文件夹路径，请在资源管理器检查');
 if(target===path.parse(target).root)throw new Error('不能删除磁盘根目录');
 for(const raw of protectedPaths.filter(Boolean)){
  const p=await fs.realpath(raw).catch(()=>path.resolve(raw));
  if(contains(target,p))throw new Error('该目录包含游戏库根目录或应用数据，不能整目录删除');
 }
 for(const other of games){if(other.id===game.id||!other.dir)continue;const p=await fs.realpath(other.dir).catch(()=>path.resolve(other.dir));if(contains(target,p)||contains(p,target))throw new Error('该目录与另一部游戏共用或嵌套，不能整目录删除');}
 return target;
}
async function deleteGame(store,id,{target,protectedPaths=[]}={}){
 const game=store.value.games.find(g=>g.id===id);if(!game)throw new Error('游戏已不在库中');
 const current=await deletionTarget(game,{games:[...store.value.games,...(store.value.removedGames||[])],protectedPaths});
 if(current!==target)throw new Error('游戏目录已变化，请重新确认');
 // The exact canonical directory has been checked immediately before recursive removal.
 if(current)await fs.rm(current,{recursive:true,force:false});
 const before=store.value.games,removed=store.value.removedGames||[];
 store.value.games=before.filter(g=>g.id!==id);store.value.removedGames=removed.filter(g=>g.id!==id);
 try{store.save();}catch(e){store.value.games=before;store.value.removedGames=removed;throw new Error('游戏文件已删除，但库记录保存失败：'+e.message);}
 return {deleted:true};
}
module.exports={deletionTarget,deleteGame};
