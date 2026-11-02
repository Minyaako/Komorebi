const {test}=require('node:test');const assert=require('node:assert/strict');
const {NextMoe}=require('../src/nextmoe.cjs');
test('个人密钥验证仅请求官方资源元数据，不获取下载链接',async()=>{
 let called=0;const api=new NextMoe({request:async(url,opts)=>{
  called++;assert.equal(url,'https://api.nextmoe.dev/v2/letmoe/works?limit=1');
  assert.equal(opts.headers.Authorization,'Bearer nmk_test_fixture');return Response.json({items:[]});
 }});
 await assert.rejects(api.validateKey('invalid'),/完整/);assert.equal(called,0);
 assert.equal(await api.validateKey(' nmk_test_fixture '),'nmk_test_fixture');assert.equal(called,1);
});
test('失效密钥不能通过验证',async()=>{
 const api=new NextMoe({request:async()=>Response.json({},{status:401})});
 await assert.rejects(api.validateKey('nmk_test_invalid'),/凭据/);
});
