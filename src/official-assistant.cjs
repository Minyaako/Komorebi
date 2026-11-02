const {BrowserWindow,Menu,dialog,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {officialPageAction,allowedOfficialUrl,shareDraft}=require('./official-adapter.cjs');
const windows=new Set();
function openAssistant({mode,input,saveKey,onStatus=()=>{}}){
  const draft=mode==='share'?shareDraft(input):null;
  const partition=session.fromPartition('persist:official-assistant');
  partition.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  partition.setPermissionCheckHandler(()=>false);
  const win=new BrowserWindow({width:1180,height:860,title:'木漏日 · 官方页面助手',webPreferences:{partition:'persist:official-assistant',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  windows.add(win);win.on('closed',()=>windows.delete(win));
  const wc=win.webContents;let busy=false,closing=false;
  const guard=()=>{const u=new URL(wc.getURL());if(!allowedOfficialUrl(u.href)|| (draft ? u.origin!=='https://www.letmoe.com'||u.pathname!==`/game/${draft.workId}` : u.origin!=='https://developer.nextmoe.dev'||!/^\/dashboard\/apps\/[^/]+\/?$/.test(u.pathname)))throw new Error('请先进入对应的官方应用详情或作品页');};
  const run=fn=>async()=>{if(busy)return;busy=true;try{const message=await fn();onStatus({ok:true,mode});if(message&&!win.isDestroyed())await dialog.showMessageBox(win,{message,type:'info'});}catch(e){const message=String(e.message).replace(/nmk_(?:live|test)_[A-Za-z0-9_-]+/g,'[密钥已隐藏]');onStatus({ok:false,mode,message});if(!win.isDestroyed())await dialog.showMessageBox(win,{message,type:'error'});}finally{busy=false;}};
  const action=async(name,data)=>{guard();const result=await wc.executeJavaScriptInIsolatedWorld(1004,[{code:`(async()=>{try{return {ok:true,value:await (${officialPageAction.toString()})(${JSON.stringify(name)},${JSON.stringify(data||{})})};}catch(e){return {ok:false,error:String(e.message)};}})()`}]);if(!result?.ok)throw new Error(result?.error||'官方页面操作未完成');return result.value;};
  for(const event of ['will-navigate','will-redirect'])wc.on(event,(e,url)=>{if(!allowedOfficialUrl(url))e.preventDefault();});
  wc.on('will-attach-webview',e=>e.preventDefault());
  wc.setWindowOpenHandler(({url})=>{if(allowedOfficialUrl(url))wc.loadURL(url).catch(()=>{});return {action:'deny'};});
  // Menus belong to the main process; the remote page receives no preload or IPC bridge.
  const items=draft?[
    {label:'1. 打开并填写投稿表单',click:run(async()=>{const target=`https://www.letmoe.com/game/${draft.workId}`;if(wc.getURL()!==target)await wc.loadURL(target);await action('share-open',draft);for(let i=0;i<20;i++){try{return await action('share-fill',draft);}catch(e){if(i===19||!String(e.message).includes('对话框'))throw e;await new Promise(r=>setTimeout(r,150));}}})},
    {label:'2. 选择压缩包并上传…',click:run(async()=>{
      guard();const picked=await dialog.showOpenDialog(win,{title:'选择已去除存档的投稿包（选择后开始上传至 LetMoe）',properties:['openFile'],filters:[{name:'游戏压缩包',extensions:['zip','7z','rar']}]});
      if(picked.canceled)return;
      const file=fs.realpathSync(picked.filePaths[0]),stat=fs.statSync(file);
      if(!stat.isFile()||!['.zip','.7z','.rar'].includes(path.extname(file).toLowerCase())||stat.size>10*1024**3)throw new Error('请选择不超过 10 GB 的 ZIP、7z 或 RAR 文件');
      guard();
      // Scoped to a single top-level official form; never scans filesystem or follows frames.
      wc.debugger.attach('1.3');
      try {
        const {root}=await wc.debugger.sendCommand('DOM.getDocument');
        const {nodeIds}=await wc.debugger.sendCommand('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'[role="dialog"] input[type="file"]'});
        const archives=[];
        for(const nodeId of nodeIds){const {attributes}=await wc.debugger.sendCommand('DOM.getAttributes',{nodeId});const a={};for(let i=0;i<attributes.length;i+=2)a[attributes[i]]=attributes[i+1];if(/zip|rar|7z/i.test(a.accept||''))archives.push(nodeId);}
        if(archives.length!==1)throw new Error('请先打开投稿表单并选择官方站内托管；无法唯一定位压缩包上传框');
        guard();await wc.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:archives[0],files:[file]});
      }finally{if(wc.debugger.isAttached())wc.debugger.detach();}
      return '已交给官方上传组件，请在页面查看进度；上传完成后核对表单并提交投稿。';
    })}
  ]:[
    {label:'1. 填写新密钥名称与目录权限',click:run(()=>action('key-fill',{name:'木漏日个人接入-'+new Date().toISOString().slice(0,10).replaceAll('-','')}))},
    {label:'2. 验证并加密保存刚生成的密钥',click:run(async()=>{let key=await action('key-read');try{await saveKey(key);}finally{key='';}return '官方接口验证成功，密钥已加密保存到当前木漏日配置。可关闭官方密钥对话框。';})}
  ];
  win.setMenu(Menu.buildFromTemplate([{label:'木漏日助手',submenu:items},{label:'编辑',submenu:[{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
  win.on('close',async e=>{if(closing)return;e.preventDefault();if(busy)return;
    const r=dialog.showMessageBoxSync(win,{type:'question',message:'关闭官方页面助手？',detail:'若页面仍在上传，关闭会中断传输。网站登录会话保存在当前木漏日的配置目录。',buttons:['继续留在页面','关闭'],defaultId:0,cancelId:0});if(r===0)return;
    try{partition.flushStorageData();await partition.cookies.flushStore();closing=true;win.destroy();}catch{await dialog.showMessageBox(win,{type:'error',message:'网站会话写入失败，请稍后再关闭助手。'});}
  });
  wc.loadURL(draft?`https://www.letmoe.com/game/${draft.workId}`:'https://developer.nextmoe.dev/dashboard').catch(()=>{});
  return {opened:true};
}
module.exports={openAssistant,hasAssistantWindows:()=>windows.size>0};
