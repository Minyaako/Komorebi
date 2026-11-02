const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Uploads}=require('../src/uploads.cjs');
test('发布入口失败后复用已有ZIP及提交信息，阻止重复继续和已提交任务重投',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../../../work/retry-test-')),archive=path.join(dir,'uploads','fixture','游戏.zip');
 await fs.mkdir(archive+'.metadata',{recursive:true});await fs.writeFile(archive,'fixture');await fs.writeFile(path.join(archive+'.metadata','komorebi.json'),JSON.stringify({schema:'komorebi.submission',version:1,work:{id:'221469'},resource:{title:'游戏',description:'转载资源'},launch:{type:'file',path:'game.exe'}}));
 const j={id:'fixture',status:'attention',submitted:false,archive};const store={value:{games:[],uploads:[j]},save(){}};let calls=0,received;
 const uploads=new Uploads({store,dataDir:dir,startOfficial:args=>{calls++;received=args;return {show(){},cancel(){}};}});
 await uploads.retry(j.id);assert.equal(calls,1);assert.equal(received.archive,archive);assert.equal(received.draft.workId,'221469');assert.equal(received.draft.launch,'game.exe');assert.equal(store.value.uploads.length,1);
 await assert.rejects(uploads.retry(j.id),/无需继续/);j.status='attention';j.submitted=true;await assert.rejects(uploads.retry(j.id),/已发送投稿/);assert.equal(calls,1);j.status='cancelled';j.submitted=false;await uploads.retry(j.id);assert.equal(calls,2);
});
