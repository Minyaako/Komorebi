const {test}=require('node:test'),assert=require('node:assert/strict'),{NextMoe}=require('../src/nextmoe.cjs');
function fixture(){const calls=[];const api=new NextMoe({settings:()=>({}),vault:{get:k=>k==='apiKey'?'nmk_live_fixture':null},request:async(url,options)=>{
 const u=new URL(url);calls.push({u,options});
 if(u.pathname==='/v2/catalog/works')return Response.json({items:[{id:'123',display_name:'Fixture'}],next_cursor:'catalog-next'});
 if(u.pathname.endsWith('/resources'))return Response.json({items:[{id:'999',patch_id:'77',name:'汉化',note:'**说明**'}],next_cursor:'resource-next'});
 return Response.json({items:[{id:'77',catalog_work_id:'123',content_limit:'sfw',resource_count:1,web_url:'https://www.moyu.moe/patch/77'},{id:'78',catalog_work_id:'123',content_limit:'nsfw'}],next_cursor:null});
 }});return {api,calls};}
test('patch name search resolves catalog IDs, preserves catalog cursor and application authentication',async()=>{
 const {api,calls}=fixture(),r=await api.searchFamily({object:'patch',query:'Fixture',cursor:'catalog-page'});
 assert.equal(r.items[0].id,'77');assert.equal(r.items[0].display_name,'Fixture');assert.equal(r.items.length,1);assert.equal(r.next_cursor,'catalog-next');assert.equal(r.total,undefined);
 const patch=calls.find(c=>c.u.pathname==='/v2/moyu/patches');assert.equal(patch.u.searchParams.get('refs'),'catalog:123');assert.equal(patch.u.searchParams.has('cursor'),false);assert.equal(patch.options.headers.Authorization,'Bearer nmk_live_fixture');assert.ok(calls.every(c=>!c.u.pathname.endsWith('/file')));
});
test('patch resources use patch ID and resource cursor; adult visibility checked before resources',async()=>{
 const {api,calls}=fixture();const r=await api.catalogEntity({object:'patch',id:'77',cursor:'files-next'});
 assert.equal(r.related.items[0].id,'999');assert.ok(calls.some(c=>c.u.pathname==='/v2/moyu/patches/77/resources'&&c.u.searchParams.get('cursor')==='files-next'));
 await assert.rejects(api.catalogEntity({object:'patch',id:'78'}),/内容设置/);await assert.rejects(api.catalogEntity({object:'patch',id:'..'}),/无效/);
});
test('missing key has actionable error and makes no catalog calls',async()=>{
 const api=new NextMoe({settings:()=>({}),vault:{get:()=>null},request:()=>{throw Error('unexpected request')}});await assert.rejects(api.searchFamily({object:'patch',query:'Game'}),/个人资源密钥/);
});
