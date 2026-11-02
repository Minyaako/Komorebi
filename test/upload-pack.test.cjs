const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {inspectDirectory,packDirectory,regexMatches}=require('../src/upload-pack.cjs');const {run}=require('../src/core.cjs');
const seven=path.resolve(__dirname,'../tools/7zip/7z.exe');
test('目录排除、正则排除、游戏名压缩包与提交 JSON，原目录不变',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../../../work/pack-test-')),root=path.join(dir,'测试游戏');await fs.mkdir(path.join(root,'savedata'),{recursive:true});await fs.mkdir(path.join(root,'assets'));
 await fs.writeFile(path.join(root,'game.exe'),'inert fixture');await fs.writeFile(path.join(root,'savedata','user.sav'),'private save');await fs.writeFile(path.join(root,'debug.log'),'log');await fs.writeFile(path.join(root,'assets','story.dat'),'story');
 const plan=await inspectDirectory(root,{excludeFolders:['savedata'],excludeRegex:'\\.log$'});assert.equal(plan.count,2);assert.equal(plan.excluded.length,2);
 const archive=path.join(dir,'out','测试游戏.zip');const manifest={schema:'komorebi.submission',version:1,launch:{type:'file',path:'game.exe'}};
 await packDirectory(plan,archive,seven,{manifest});
 const list=await run(seven,['l','-slt','-ba','-sccUTF-8',archive]);assert.match(list,/Path = game.exe/);assert.match(list,/Path = komorebi.json/);assert.doesNotMatch(list,/user.sav|debug.log/);
 const json=await run(seven,['x','-so',archive,'komorebi.json']);assert.deepEqual(JSON.parse(json),manifest);
 assert.equal(await fs.readFile(path.join(root,'savedata','user.sav'),'utf8'),'private save');await assert.rejects(fs.stat(path.join(root,'komorebi.json')));
 await assert.rejects(inspectDirectory(root,{excludeFolders:['../outside']}),/目录已变化/);
 await assert.rejects(inspectDirectory(root,{excludeRegex:'['}),/正则表达式无效/);
});
test('病态正则限时终止，不阻塞主进程',async()=>{await assert.rejects(regexMatches(['a'.repeat(20000)+'!'],'(a+)+$'),/超时/);});
