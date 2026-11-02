const {test}=require('node:test'),assert=require('node:assert/strict');const {removeEntry,restoreEntry}=require('../src/library-entries.cjs');
test('移出与恢复只变更库记录，保留私人字段且写入失败回滚',()=>{
 const original={id:'1',dir:'D:/game',title:'游戏',note:'笔记',score:8,links:[{url:'https://example.com/a.zip'}]};const store={value:{games:[original]},save(){}};
 assert.throws(()=>removeEntry(store,'1',{activeUpload:true}),/正在上传/);removeEntry(store,'1');assert.equal(store.value.games.length,0);assert.equal(store.value.removedGames[0].note,'笔记');restoreEntry(store,'1');assert.deepEqual(store.value.games[0],original);assert.equal(store.value.removedGames.length,0);
 store.save=()=>{throw new Error('disk');};assert.throws(()=>removeEntry(store,'1'),/disk/);assert.deepEqual(store.value.games,[original]);
});
test('未安装作品可以恢复，已有安装记录时阻止重复恢复',()=>{
 const g={id:'saved',workId:'7',dir:null,note:'收藏笔记'};const store={value:{games:[g,{id:'local',dir:'D:/local'}]},save(){}};removeEntry(store,'saved');restoreEntry(store,'saved');assert.equal(store.value.games[0].note,'收藏笔记');removeEntry(store,'saved');store.value.games.push({id:'installed',workId:'7',dir:'D:/game'});assert.throws(()=>restoreEntry(store,'saved'),/已在库中/);
});
