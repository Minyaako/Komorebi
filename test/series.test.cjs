const {test}=require('node:test'),assert=require('node:assert/strict');
const {addSeries}=require('../src/series-library.cjs');
test('系列分页全部入库、去重、保留笔记、重复操作不新增',async()=>{
 const old={id:'local',workId:'1',note:'保留',dir:'existing'},store={value:{games:[old]},save(){}};const calls=[];
 const api={catalogEntity:async p=>{calls.push(p);return {related:p.cursor?{items:[{id:2,display_name:'二'},{id:3,display_name:'三'}]}:{items:[{id:1},{id:2,display_name:'二'}],next_cursor:'next'}};}};
 assert.deepEqual(await addSeries(store,api,{id:9,nsfw:true}),{added:2,existing:1,total:3});assert.equal(store.value.games.find(g=>g.workId==='1'),old);assert.ok(calls.every(p=>p.nsfw&&p.object==='series'));assert.equal(store.value.games[0].dir,null);assert.deepEqual(await addSeries(store,api,{id:9}),{added:0,existing:3,total:3});
});
test('系列分页失败、循环游标、保存失败不留下部分入库',async()=>{
 const before=[],s={value:{games:before},save(){throw Error('disk');}};
 await assert.rejects(addSeries(s,{catalogEntity:async()=>({related:{items:[{id:1}]}})},{id:1}),/disk/);assert.equal(s.value.games,before);
 await assert.rejects(addSeries(s,{catalogEntity:async p=>p.cursor?{relatedError:'offline'}:{related:{items:[{id:1}],next_cursor:'n'}}},{id:1}),/offline/);assert.equal(s.value.games,before);
 await assert.rejects(addSeries(s,{catalogEntity:async()=>({related:{items:[{id:1}],next_cursor:'n'}})},{id:1}),/分页/);assert.equal(s.value.games,before);
});
