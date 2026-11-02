function removeTaskRecord(store,{kind,id},{downloadBusy=false,uploadBusy=false}={}){
 const key=kind==='download'?'jobs':kind==='upload'?'uploads':null;if(!key)throw new Error('未知任务类型');
 const list=store.value[key]||[],task=list.find(j=>j.id===id);if(!task)throw new Error('任务不存在');
 if((kind==='download'?downloadBusy:uploadBusy)||!['complete','cancelled','error','interrupted','attention'].includes(task.status))throw new Error('请先取消任务，再删除记录');
 const previous=store.value.deletedTasks||[];store.value[key]=list.filter(j=>j.id!==id);store.value.deletedTasks=[{kind,task},...previous].slice(0,50);
 try{store.save();}catch(e){store.value[key]=list;store.value.deletedTasks=previous;throw e;}return true;
}
function undoTaskRecord(store){const previous=store.value.deletedTasks||[],entry=previous[0];if(!entry)return false;const key=entry.kind==='download'?'jobs':'uploads',list=store.value[key]||[];if(list.some(j=>j.id===entry.task.id))throw new Error('任务记录已存在');store.value[key]=[entry.task,...list];store.value.deletedTasks=previous.slice(1);try{store.save();}catch(e){store.value[key]=list;store.value.deletedTasks=previous;throw e;}return true;}
module.exports={removeTaskRecord,undoTaskRecord};
