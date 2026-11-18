const fs=require('node:fs'),path=require('node:path');
const site='https://developer.nextmoe.dev',dash=site+'/dashboard',personal='木漏日个人资源';
function browserPath(){
 for(const [base,rel] of [[process.env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe'],[process.env.ProgramFiles,'Microsoft/Edge/Application/msedge.exe'],[process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe'],[process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe']]){
  if(base&&fs.existsSync(path.join(base,rel)))return path.join(base,rel);
 }
 throw new Error('未找到 Edge 或 Chrome。请安装其中之一，或在账号与连接中粘贴个人密钥。');
}
const button=(root,name)=>root.getByRole('button',{name,exact:true});
async function provision(page,{clientId,name,stage}){
 await page.goto(dash,{waitUntil:'domcontentloaded'});
 // Authentication and second-factor challenges are completed only by the user.
 const create=button(page,'创建应用').first();
 await create.waitFor({timeout:300000});
 if(new URL(page.url()).origin!==site||new URL(page.url()).pathname.replace(/\/$/,'')!=='/dashboard')throw new Error('未回到官方开发者控制台。');
 // Use the same first-party requests as the dashboard. Its credential stays inside the page.
 const result=await page.evaluate(async({clientId,name,personal})=>{
  if(location.origin!=='https://developer.nextmoe.dev'||location.pathname.replace(/\/$/,'')!=='/dashboard')throw Error('开发者控制台地址已变化。');
  async function call(route,body){
   const raw=document.cookie.split('; ').find(v=>v.startsWith('access_token='))?.slice(13);
   if(!raw)throw Error('开发者登录会话已失效，请重新登录。');
   const response=await fetch('/api/v1'+route,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:{Authorization:'Bearer '+decodeURIComponent(raw),'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
   const json=await response.json();if(!response.ok||json.code!==0)throw Error('开发者平台：'+String(json.message||response.status).slice(0,180));
   return json.data;
  }
  const apps=await call('/dev/apps');if(!Array.isArray(apps))throw Error('官方应用列表格式已变化。');
  let app=apps.find(a=>a.client_id===clientId)||apps.find(a=>a.name===personal);
  if(!app)app=await call('/dev/apps',{name:personal});
  if(!app||!/^([a-zA-Z0-9_-]+)$/.test(app.client_id||''))throw Error('未获得有效的个人应用。');
  if(['pending','declined'].includes(app.review_status))throw Error('个人应用尚未通过官方审核。审核通过后可再次点击申领。');
  const route='/dev/apps/'+app.client_id+'/keys';
  const keys=await call(route);
  if(!Array.isArray(keys))throw Error('官方密钥列表格式已变化。');
  if(keys.some(k=>k.name===name&&!k.revoked_at))throw Error('官方已存在本机的同名密钥。为避免重复生成，请先在控制台检查该密钥。');
  const minted=await call(route,{name,test:false,scopes:['catalog:read']});
  if(!/^nmk_live_[A-Za-z0-9_-]+$/.test(minted?.key||''))throw Error('官方未返回可保存的生产密钥。');
  return minted.key;
 },{clientId,name,personal});
 stage(result);
}
let active;
async function claimKey({dataDir,clientId,vault,connect}){
 if(active)return active;
 active=(async()=>{
  if(vault.get('apiKey')){await connect(vault.get('apiKey'));return '已有密钥已验证，无需重复申领。';}
  const finish=async()=>{await connect(vault.get('pendingApiKey'));vault.set('pendingApiKey',null);return '个人资源密钥已验证并加密保存。';};
  if(vault.get('pendingApiKey'))return finish();
  const id=vault.get('keyDeviceId')||require('node:crypto').randomUUID().slice(0,8);vault.set('keyDeviceId',id);
  const {chromium}=require('playwright-core');
  const ctx=await chromium.launchPersistentContext(path.join(dataDir,'developer-browser'),{executablePath:browserPath(),headless:false,chromiumSandbox:true,ignoreDefaultArgs:['--enable-automation'],serviceWorkers:'block'});
  try{
   const page=ctx.pages()[0]||await ctx.newPage();page.setDefaultTimeout(15000);
   await provision(page,{clientId,name:'木漏日个人接入-'+id,stage:key=>vault.set('pendingApiKey',key)});
   return await finish();
  }catch(e){if(/timeout|closed/i.test(e.message))throw new Error('申领未完成：请在浏览器完成官方登录或授权，再回到开发者控制台。已收到的密钥会在重试时继续验证。');throw e;}
  finally{await ctx.close().catch(()=>{});}
 })();try{return await active;}finally{active=null;}
}
module.exports={claimKey,provision,browserPath};
