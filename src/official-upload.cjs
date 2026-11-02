const {BrowserWindow,session}=require('electron');
const path=require('node:path');
const {officialPageAction,allowedOfficialUrl}=require('./official-adapter.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function startOfficialUpload({draft,archive,onState}){
 const ses=session.fromPartition('persist:official-assistant');ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);
 const win=new BrowserWindow({show:false,width:1180,height:860,title:'木漏日 · 上传任务',webPreferences:{partition:'persist:official-assistant',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.setMenu(null);const wc=win.webContents,target=`https://www.letmoe.com/game/${draft.workId}`;let cancelled=false,finished=false,submitted=false;
 const notify=(status,message,extra={})=>onState({status,message,...extra});
 const action=(name)=>wc.executeJavaScriptInIsolatedWorld(1004,[{code:`(${officialPageAction.toString()})(${JSON.stringify(name)},${JSON.stringify({...draft,filename:path.basename(archive)})})`}]);
 for(const event of ['will-navigate','will-redirect'])wc.on(event,(e,url)=>{if(!allowedOfficialUrl(url))e.preventDefault();});
 wc.on('will-attach-webview',e=>e.preventDefault());wc.setWindowOpenHandler(({url})=>{if(allowedOfficialUrl(url))wc.loadURL(url).catch(()=>{});return {action:'deny'};});
 win.on('close',e=>{if(!finished&&!cancelled){e.preventDefault();win.hide();}});
 const show=()=>{if(!win.isDestroyed()){win.show();win.focus();}};
 async function alive(){if(cancelled||win.isDestroyed())throw new Error('任务已取消');}
 const run=async()=>{try{
  notify('opening','正在连接官方站点');await wc.loadURL(target);
  let ready=false,failures=0;const loginDeadline=Date.now()+10*60*1000;
  while(Date.now()<loginDeadline){await alive();await wait(1000);const s=await action('share-status');
   if(s.login){notify('login','请在官方窗口登录，登录后会自动继续');show();continue;}
   if(new URL(wc.getURL()).hostname==='account.nextmoe.com'){notify('opening','正在等待账号中心完成授权');show();continue;}
   if(wc.getURL()!==target){await wc.loadURL(target);continue;}
   notify('opening',s.authenticated?'已登录，正在打开投稿表单':'正在加载作品投稿入口');
   try{await action('share-open');await wait(300);await action('share-fill');ready=true;break;}catch(e){if(++failures>=10)throw new Error('自动填表未完成：'+e.message);}
  }
  if(!ready)throw new Error('官网尚未就绪，请打开任务页面检查登录或表单');
  win.hide();await alive();
  if(wc.getURL()!==target)throw new Error('官方页面已切换，上传停止');
  wc.debugger.attach('1.3');try{
   const {root}=await wc.debugger.sendCommand('DOM.getDocument');const {nodeIds}=await wc.debugger.sendCommand('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'[role="dialog"] input[type="file"]'});const matches=[];
   for(const nodeId of nodeIds){const {attributes}=await wc.debugger.sendCommand('DOM.getAttributes',{nodeId});const attrs={};for(let i=0;i<attributes.length;i+=2)attrs[attributes[i]]=attributes[i+1];if(/zip|rar|7z/i.test(attrs.accept||''))matches.push(nodeId);}
   if(matches.length!==1)throw new Error('官方上传控件已变化');
   await wc.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:matches[0],files:[archive]});
  }finally{if(wc.debugger.isAttached())wc.debugger.detach();}
  notify('uploading','正在上传至 LetMoe');const deadline=Date.now()+24*60*60*1000;
  while(Date.now()<deadline){await alive();await wait(1500);const s=await action('share-status');
   if(s.failed)throw new Error('官方报告上传失败，请打开任务页面处理');
   if(!s.dialog)throw new Error('官方投稿表单已关闭，请检查投稿记录');
   if(s.login)throw new Error('上传期间官网登录失效，请打开任务页面处理');
   if(s.ready){submitted=true;notify('submitting','上传完成，正在提交投稿',{submitted:true});await action('share-submit');break;}
   notify('uploading','正在上传，等待官方完成确认',{progress:Number(s.progress)||0});
  }
  if(!submitted)throw new Error('未收到上传完成确认，请查看官方任务页');
  for(let i=0;i<40;i++){await alive();await wait(1000);const s=await action('share-status');if(s.success||s.resource){finished=true;notify('complete','投稿成功，等待站内处理',{url:s.resource?`https://www.letmoe.com/resource/${s.resource}`:null});await ses.cookies.flushStore();win.destroy();return;}}
  throw new Error('已发送投稿，尚未收到明确结果。请查看官网记录，避免重复提交');
 }catch(e){if(cancelled)return;notify('attention',e.message,{submitted});show();}};
 run();return {show,cancel(){cancelled=true;finished=true;if(!win.isDestroyed())win.destroy();notify('cancelled',submitted?'已停止跟踪；已发送的投稿请在官网查看':'已取消');},get active(){return !finished&&!cancelled;}};
}
module.exports={startOfficialUpload};
