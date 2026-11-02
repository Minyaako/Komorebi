const {test}=require('node:test'),assert=require('node:assert/strict');const {NextMoe}=require('../src/nextmoe.cjs');
const client=request=>new NextMoe({settings:()=>({clientId:'test'}),vault:{get:k=>k==='apiKey'?'key':null,set(){}},openExternal(){},request});
test('相同元数据请求合并并缓存，成人范围隔离，下载取链不缓存',async()=>{
 let calls=0;const api=client(async()=>{calls++;await new Promise(r=>setTimeout(r,15));return Response.json({items:[]});});
 await Promise.all(Array.from({length:10},()=>api.detail('1',true)));assert.equal(calls,1);await api.detail('1',true);assert.equal(calls,1);await api.detail('1',false);assert.equal(calls,2);
 await api.resources('1',true);await api.resources('1',true);assert.equal(calls,3);
 await api.file('1',true);await api.file('1',true);assert.equal(calls,5);
 api.invalidateCache();await api.detail('1',true);assert.equal(calls,6);
});
test('失败可重试，清缓存后迟到的旧结果不污染新缓存',async()=>{
 let release;const api=client(async()=>Response.json({}));const first=api.cached('x',10000,()=>new Promise(r=>release=r));await Promise.resolve();api.invalidateCache();assert.equal(await api.cached('x',10000,async()=>2),2);release(1);await first;assert.equal(await api.cached('x',10000,async()=>3),2);
 await assert.rejects(api.cached('bad',10000,async()=>{throw new Error('offline');}));assert.equal(await api.cached('bad',10000,async()=>4),4);
});
test('用户资料使用userinfo，仅返回头像昵称，退出后丢弃迟到结果',async()=>{
 let release;const values={refreshToken:'r'};const api=new NextMoe({settings:()=>({clientId:'x'}),vault:{get:k=>values[k],set:(k,v)=>values[k]=v},request:async url=>{assert.match(url,/oauth\/userinfo$/);await new Promise(r=>release=r);return Response.json({sub:'1',name:'测试用户',picture:'https://example.org/a.png',email:'private',access_token:'never expose'});}});api.token='a';api.expires=Date.now()+900000;
 const first=api.userInfo();await new Promise(r=>setImmediate(r));release();assert.deepEqual(await first,{id:'1',name:'测试用户',picture:'https://example.org/a.png'});
 api.invalidateCache();const pending=api.userInfo();await new Promise(r=>setImmediate(r));api.logout();release();assert.equal(await pending,null);assert.equal(api.profile,null);
});
