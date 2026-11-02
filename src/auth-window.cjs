const {BrowserWindow,session}=require('electron');
const {allowedOfficialUrl}=require('./official-adapter.cjs');
const PARTITION='persist:official-assistant';
function authorizationTarget(raw){
  const u=new URL(raw);
  if(u.origin!=='https://account.nextmoe.com'||u.pathname!=='/api/v1/oauth/authorize')throw new Error('无效授权入口');
  const callback=new URL(u.searchParams.get('redirect_uri'));
  if(callback.protocol!=='http:'||callback.hostname!=='127.0.0.1'||!callback.port||callback.pathname!=='/callback'||callback.username||callback.password||callback.search||callback.hash)throw new Error('无效本机回调');
  return {url:u.href,allows:raw=>{try{const next=new URL(raw);return allowedOfficialUrl(next.href)||(next.origin===callback.origin&&next.pathname===callback.pathname&&!next.username&&!next.password);}catch{return false;}}};
}
function openAuthorization(raw,onCancel){
  const target=authorizationTarget(raw),ses=session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);
  const win=new BrowserWindow({width:960,height:780,title:'木漏日 · NextMoe 授权',webPreferences:{partition:PARTITION,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  let finished=false;
  win.setMenu(null);
  for(const event of ['will-navigate','will-redirect'])win.webContents.on(event,(e,url)=>{if(!target.allows(url))e.preventDefault();});
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  win.webContents.setWindowOpenHandler(({url})=>{if(target.allows(url))win.loadURL(url).catch(()=>{});return {action:'deny'};});
  win.on('closed',()=>{if(!finished)onCancel();});
  const close=()=>{finished=true;if(!win.isDestroyed())win.destroy();};
  win.loadURL(target.url).catch(()=>{if(!finished){onCancel();close();}});
  return close;
}
async function flushOfficialSession(){const ses=session.fromPartition(PARTITION);ses.flushStorageData();await ses.cookies.flushStore();}
module.exports={openAuthorization,authorizationTarget,flushOfficialSession};
