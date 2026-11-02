const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('komorebi',{
  call:async(name,args)=>{const r=await ipcRenderer.invoke('call',name,args);if(r.error)throw new Error(r.error);return r.value;},
  onState:fn=>{const listener=(_e,s)=>fn(s);ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener);}
});
