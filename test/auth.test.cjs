const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const {NextMoe}=require('../src/nextmoe.cjs');
test('OAuth PKCE 回调校验、换码、轮换 refresh token，不需要 client secret',async()=>{
  const values={};let authUrl,exchange;
  const vault={get:k=>values[k],set:(k,v)=>values[k]=v};
  const api=new NextMoe({settings:()=>({clientId:'test-client'}),vault,request:async(url,options)=>{
    exchange=new URLSearchParams(options.body);
    return new Response(JSON.stringify({access_token:'access',refresh_token:exchange.get('grant_type')==='refresh_token'?'rotated':'refresh',expires_in:900}),{status:200});
  },openExternal:async raw=>{
    authUrl=new URL(raw);const redirect=authUrl.searchParams.get('redirect_uri');
    const bad=await fetch(redirect+'?state=wrong&code=fake');assert.equal(bad.status,400);
    await fetch(redirect+'?state='+authUrl.searchParams.get('state')+'&code=verified-code');
  }});
  await api.login();assert.equal(values.refreshToken,'refresh');assert.equal(exchange.get('code'),'verified-code');
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),authUrl.searchParams.get('code_challenge'));
  assert.equal(exchange.has('client_secret'),false);api.expires=0;await api.accessToken();assert.equal(values.refreshToken,'rotated');api.logout();assert.equal(values.refreshToken,null);
});
test('取消换码中的登录不会保存迟到的令牌，且能再次登录',async()=>{
  const values={};let release,started;
  const ready=new Promise(r=>started=r);
  const api=new NextMoe({settings:()=>({clientId:'test'}),vault:{get:k=>values[k],set:(k,v)=>values[k]=v},
    request:async()=>{started();await new Promise(r=>release=r);return Response.json({access_token:'a',refresh_token:'r'});},
    openExternal:async raw=>{const u=new URL(raw);await fetch(u.searchParams.get('redirect_uri')+'?code=x&state='+u.searchParams.get('state'));}});
  const login=api.login();const rejected=assert.rejects(login,/取消/);await ready;api.cancelLogin();await rejected;release();
  await new Promise(r=>setImmediate(r));assert.equal(values.refreshToken,undefined);assert.equal(api.loginPending,false);
});
test('退出账号后旧刷新请求不能恢复登录',async()=>{
  const values={refreshToken:'old'};let release;
  const api=new NextMoe({settings:()=>({clientId:'test'}),vault:{get:k=>values[k],set:(k,v)=>values[k]=v},request:async()=>{await new Promise(r=>release=r);return Response.json({access_token:'a',refresh_token:'r'});}});
  const pending=api.accessToken();api.logout();release();await assert.rejects(pending,/退出/);assert.equal(values.refreshToken,null);
});

test('授权窗口在完成和取消后关闭，避免残留账号窗口',async()=>{
  let closed=0;
  const api=new NextMoe({settings:()=>({clientId:'test'}),vault:{get:()=>null,set:()=>{}},request:async()=>Response.json({access_token:'a',refresh_token:'r'}),openExternal:async raw=>{const u=new URL(raw);setImmediate(()=>fetch(u.searchParams.get('redirect_uri')+'?code=x&state='+u.searchParams.get('state')));return ()=>closed++;}});
  await api.login();assert.equal(closed,1);
  api.openExternal=async()=>{setImmediate(()=>api.cancelLogin());return ()=>closed++;};
  await assert.rejects(api.login(),/取消/);assert.equal(closed,2);
});
