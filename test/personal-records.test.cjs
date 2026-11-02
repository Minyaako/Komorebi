const {test}=require('node:test'),assert=require('node:assert/strict');
const {NextMoe}=require('../src/nextmoe.cjs');
test('personal records cache, pagination, refresh, allowlist and logout isolation',async()=>{
 const values={refreshToken:'r'};let calls=0,release;
 const api=new NextMoe({settings:()=>({}),vault:{get:k=>values[k],set:(k,v)=>values[k]=v},request:async url=>{
  if(url.includes('/catalog/'))return Response.json({items:[{id:'7',display_name:'Test'}]});
  calls++;if(release===true)await new Promise(r=>release=r);
  return Response.json({items:[{work_id:'7',state:'doing',access_token:'never'}],total:2,next_cursor:'cur_next'});
 }});api.token='a';api.expires=Date.now()+900000;
 const [a,b]=await Promise.all([api.personalRecords(),api.personalRecords()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.items[0].title,'Test');assert.equal(a.items[0].access_token,undefined);
 await api.personalRecords({cursor:a.next_cursor});assert.equal(calls,2);
 await api.personalRecords({force:true});assert.equal(calls,3);
 await assert.rejects(api.personalRecords({section:'../../other'}));
 release=true;const pending=api.personalRecords({force:true});await new Promise(r=>setImmediate(r));api.logout();release();await assert.rejects(pending,/账号已切换/);
});
