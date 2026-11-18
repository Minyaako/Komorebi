const {test}=require('node:test'),assert=require('node:assert/strict');
const {score,variants}=require('../src/ui/fuzzy-search.cjs'),{matches}=require('../src/ui/library-query.cjs'),{NextMoe}=require('../src/nextmoe.cjs');
test('normalized names, transpositions, aliases and staff match; tag operators stay exact',()=>{
 assert.ok(score('STEINS;GATE','steins gate')>0);assert.ok(score('CLANNAD','clanad')>0);assert.ok(score('CLANNAD','clanand')>0);assert.ok(score('千恋＊万花','千恋万华')>0);assert.equal(score('无关作品','Key'),0);assert.equal(score('校园','校圆'),0);
 const g={title:'CLANNAD',catalog:{titles:[{value:'クラナド'}],companies:[{display_name:'Visual Arts'}],credits:[{credits:[{display_name:'麻枝准'}]}],tags:[{display_name:'校园'}]}};
 for(const q of ['clanad','visualarts','麻枝准','クラナド','clanad +校园'])assert.ok(matches(g,q),q);
 assert.equal(matches(g,'clanad +校圆'),false);assert.equal(matches(g,'clanad -校园'),false);
 assert.ok(variants('clanad').length<=3);assert.equal(variants('a').length,0);
});
test('remote fallback preserves filters and marks candidates without fake totals/cursors',async()=>{
 const calls=[];const api=new NextMoe({settings:()=>({}),vault:{get:()=>null},request:async url=>{
 const u=new URL(url);calls.push(u);return Response.json(u.searchParams.get('q')==='clanad'?{items:[],total:0}:{items:[{id:'1',display_name:'CLANNAD'},{id:'2',display_name:'Unrelated'}],next_cursor:'candidate-only'});
 }});
 const result=await api.search({query:'clanad',tags:'7',exclude:'9',nsfw:true,released_after:'2000-01-01'});
 assert.deepEqual(result.items.map(x=>x.id),['1']);assert.equal(result.approximate,true);assert.equal(result.next_cursor,null);assert.equal(result.total,undefined);
 assert.ok(calls.length<=4);for(const u of calls){assert.equal(u.searchParams.get('nsfw'),'true');assert.equal(u.searchParams.get('tag_id'),'7');assert.equal(u.searchParams.get('exclude_tag_tree'),'9');assert.equal(u.searchParams.get('released_after'),'2000-01-01');}
 await api.search({query:'clanad',tags:'7',exclude:'9',nsfw:true,released_after:'2000-01-01'});assert.ok(calls.length<=4);
});
test('normal results and pagination do not trigger fuzzy expansion; tags stay literal',async()=>{
 let calls=0;const api=new NextMoe({settings:()=>({}),vault:{get:()=>null},request:async()=>{calls++;return Response.json({items:[]});}});
 await api.search({query:'clanad',cursor:'next'});assert.equal(calls,1);
 await api.searchFamily({object:'tag',query:'clanad'});assert.equal(calls,2);
});
