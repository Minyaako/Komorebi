const {test}=require('node:test');
const assert=require('node:assert/strict');
const {NextMoe}=require('../src/nextmoe.cjs');
test('标签使用搜索接口，保留排序、去重并补充计数，转发分页及内容范围',async()=>{
 const calls=[];
 const api=new NextMoe({settings:()=>({}),vault:{get:()=>null},request:async raw=>{
  const u=new URL(raw);calls.push(u);
  return Response.json(u.pathname.endsWith('/search')?{items:[{target_object:'tag',id:'2'},{target_object:'tag',id:'1'},{target_object:'tag',id:'2'},{target_object:'work',id:'3'}],next_cursor:'next'}:{items:[{id:'1',work_count:0,is_sexual:true},{id:'2',work_count:17,is_sexual:false}]});
 }});
 const result=await api.tags({query:' 魔法 ',cursor:'page2',nsfw:false});
 assert.deepEqual(result,{items:[{id:'2',work_count:17,is_sexual:false}],next_cursor:'next'});
 assert.equal(calls[0].pathname,'/v2/catalog/search');
 assert.equal(calls[0].searchParams.get('object'),'tag');assert.equal(calls[0].searchParams.get('q'),'魔法');
 assert.equal(calls[0].searchParams.get('cursor'),'page2');assert.equal(calls[1].searchParams.get('ids'),'2,1');
 assert.ok(calls.every(u=>u.searchParams.get('nsfw')==='false'));
 const all=await api.tags({query:'魔法',nsfw:true});assert.deepEqual(all.items.map(t=>t.id),['2','1']);
 assert.equal(calls[3].searchParams.get('nsfw'),'true');
});
test('空结果页仍保留后续游标，不发空 IDs 查询',async()=>{
 const api=new NextMoe({});let count=0;
 api.api=async()=>{count++;return {items:[],next_cursor:'more'};};
 assert.deepEqual(await api.tags('无匹配'),{items:[],next_cursor:'more'});assert.equal(count,1);
});
