const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LibraryScanner,discoverFolders,cleanName,rankMatches,configTitles}=require('../src/library-scan.cjs');
const {Store}=require('../src/core.cjs');
function fixture(){const base=path.resolve(__dirname,'../../../work/verification');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'komorebi-scan-'));const file=(name)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'INERT TEST ONLY');};return {root,file};}
test('name cleaning preserves subtitles; exact localized titles outrank sequels',()=>{
 assert.equal(cleanName('サヤガタリ-妖刀の約束-_简体中文版（含全CG存档）'),'サヤガタリ-妖刀の約束-');
 const ranked=rankMatches('游戏名',[{id:'2',display_name:'游戏名 2'},{id:'1',display_name:'Game',localized:{'zh-Hans':{value:'游戏名'}}}]);
 assert.equal(ranked[0].id,'1');assert.equal(ranked[0].matchScore,1);assert.ok(ranked[1].matchScore<1);
});
test('scan recognizes nested game folders once and skips patch/save/installer directories',async()=>{
 const {root,file}=fixture();file('分类/游戏一/game.exe');file('分类/游戏一/sub/helper.exe');file('游戏二/bin/game.exe');file('汉化补丁/patch.exe');file('savedata/tool.exe');file('安装包/setup.exe');
 const r=await discoverFolders(root);assert.deepEqual(r.folders.map(p=>path.relative(root,p)).sort(),[path.join('分类','游戏一'),'游戏二'].sort());
});
test('preview does not mutate library; duplicate paths and repeated commits preserve personal data',async()=>{
 const {root,file}=fixture();file('游戏一/game.exe');file('同名/game.exe');
 const store=new Store(path.join(root,'state/library.json'));const scanner=new LibraryScanner({store,interval:0,api:{search:async({query})=>({items:query==='游戏一'?[{id:'1',display_name:'游戏一',cover:{url:'https://example.org/a.png'}}]:[{id:'2',display_name:'同名'},{id:'3',display_name:'同名'}]})}});
 await scanner.start(root);assert.equal(store.value.games.length,0);
 const one=scanner.value.rows.find(r=>r.name==='游戏一'),ambiguous=scanner.value.rows.find(r=>r.name==='同名');assert.equal(one.selected,'1');assert.equal(ambiguous.selected,'');
 const result=await scanner.commit([{id:one.id,workId:'1'},{id:ambiguous.id,workId:''}]);assert.equal(result.added,2);assert.equal(result.errors.length,0);
 store.value.games[0].note='private';store.value.games[0].score=9;
 await scanner.commit([{id:one.id,workId:'1'}]);assert.equal(store.value.games.length,2);assert.equal(store.value.games[0].note,'private');
 await scanner.start(root);assert.equal(scanner.value.rows.find(r=>r.name==='游戏一').status,'duplicate');
});
test('cancellation keeps completed results; API failure is not treated as no match',async()=>{
 const {root,file}=fixture();file('A/game.exe');file('B/game.exe');
 const scanner=new LibraryScanner({store:new Store(path.join(root,'state/library.json')),interval:0,api:{search:async()=>{throw new Error('rate limited');}}});
 await scanner.start(root);assert.ok(scanner.value.rows.every(r=>r.status==='error'));assert.equal(scanner.value.rows[0].error,'rate limited');
 scanner.api.search=async()=>{scanner.cancel();return {items:[]};};await scanner.start(root);assert.equal(scanner.value.status,'cancelled');assert.equal(scanner.value.rows.length,1);
});
test('renamed directory can match a Shift-JIS configuration title; local recognition includes adult works by default',async()=>{
 const {root,file}=fixture();file('renamed/game.exe');
 fs.writeFileSync(path.join(root,'renamed/Start.ini'),Buffer.concat([Buffer.from('#GAME_TITLE="FORTUNE'),Buffer.from([0x81,0x7e]),Buffer.from('WORLD"\r\n')]));
 assert.deepEqual(await configTitles(path.join(root,'renamed')),['FORTUNE×WORLD']);
 const queries=[],s=new LibraryScanner({store:new Store(path.join(root,'state/library.json')),interval:0,api:{search:async q=>{queries.push(q);return {items:q.query==='FORTUNE×WORLD'?[{id:'5769',display_name:q.query}]:[]};}}});
 await s.start(root);assert.equal(s.value.rows[0].selected,'5769');assert.ok(queries.every(q=>q.nsfw===true));
});
test('a persistence failure rolls back memory and remains retryable',async()=>{
 const {root,file}=fixture();file('A/game.exe');let fail=true;const store={value:{games:[]},save(){if(fail)throw Error('disk unavailable');}};
 const s=new LibraryScanner({store,interval:0,api:{search:async()=>({items:[]})}});await s.start(root);const id=s.value.rows[0].id;
 const failed=await s.commit([{id}]);assert.equal(failed.added,0);assert.equal(failed.errors.length,1);assert.equal(store.value.games.length,0);
 fail=false;assert.equal((await s.commit([{id}])).added,1);
});
test('扫描安装已收藏的作品，保留记录而不重复建库',async()=>{
 const {root,file}=fixture();file('游戏一/game.exe');const store=new Store(path.join(root,'state/library.json'));store.value.games=[{id:'saved',workId:'1',title:'游戏一',dir:null,note:'收藏笔记',state:'doing',score:9}];store.save();const scanner=new LibraryScanner({store,interval:0,api:{search:async()=>({items:[{id:'1',display_name:'游戏一'}]})}});await scanner.start(root);const row=scanner.value.rows[0];const r=await scanner.commit([{id:row.id,workId:'1'}]);assert.equal(r.updated,1);assert.equal(r.errors.length,0);assert.equal(store.value.games.length,1);assert.equal(store.value.games[0].id,'saved');assert.equal(store.value.games[0].note,'收藏笔记');assert.equal(store.value.games[0].score,9);assert.equal(store.value.games[0].dir,path.join(root,'游戏一'));
});
