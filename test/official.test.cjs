const test=require('node:test'),assert=require('node:assert/strict');
const {allowedOfficialUrl,shareDraft}=require('../src/official-adapter.cjs');
test('official assistant rejects lookalike origins and privileged schemes',()=>{
 for(const u of ['http://www.letmoe.com/game/1','https://www.letmoe.com.evil.test','https://evil@www.letmoe.com','file:///tmp/a','javascript:alert(1)','https://www.letmoe.com:444'])assert.equal(allowedOfficialUrl(u),false,u);
 for(const u of ['https://www.letmoe.com/game/5682','https://developer.nextmoe.dev/dashboard','https://account.nextmoe.com/'])assert.equal(allowedOfficialUrl(u),true);
});
test('share draft validates work and copies only public fields',()=>{
 assert.throws(()=>shareDraft({workId:'../1',title:'a',description:'b'}));
 assert.throws(()=>shareDraft({workId:'1',title:'',description:'b'}));
 assert.deepEqual(shareDraft({workId:5682,title:' a ',description:' b ',note:'private',apiKey:'secret',dir:'private'}),{workId:'5682',title:'a',description:'b',origin:'repost'});
});
