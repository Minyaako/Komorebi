const {test}=require('node:test'),assert=require('node:assert/strict');
const {filterHosted}=require('../src/hosted-search.cjs');
test('直链筛选读取全部资源分页、保留作品顺序，不调用取链接口',async()=>{
 const calls=[],api={cached:(_k,_t,f)=>f(),resources:async(id,adult,cursor)=>{calls.push({id,adult,cursor});return id==='a'&&!cursor?{items:[{direct_download:false}],next_cursor:'n'}:{items:[{direct_download:id==='a'}]};},file(){throw Error('不应取链');}};
 assert.deepEqual(await filterHosted(api,[{id:'a'},{id:'b'}],true),[{id:'a'}]);assert.ok(calls.some(x=>x.cursor==='n'));assert.ok(calls.every(x=>x.adult));
});
test('资源读取失败不伪装为没有直链',async()=>{await assert.rejects(filterHosted({cached:(_k,_t,f)=>f(),resources:async()=>{throw Error('offline');}},[{id:1}],false),/offline/);});
