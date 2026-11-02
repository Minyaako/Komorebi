let contextOrigin=null;
function closeContextMenu(restore=false){$('#context-menu')?.remove();if(restore&&contextOrigin?.isConnected)contextOrigin.focus();}
function invokeAction(action,id,extra={}){const b=document.createElement('button');Object.assign(b.dataset,{action,id,...extra});b.hidden=true;document.body.append(b);b.click();b.remove();}
function contextItems(target){
 const row=target.closest('.transfer-row');
 if(row){const [kind,...parts]=row.dataset.key.split(':'),id=parts.join(':'),job=(kind==='download'?state.jobs:state.uploads).find(j=>j.id===id);if(!job)return [];
  const list=[...row.querySelectorAll('.transfer-controls button[data-action]')].map(b=>({label:b.textContent.trim(),run:()=>invokeAction(b.dataset.action,b.dataset.id,{...b.dataset})}));
  if(['complete','cancelled','error','interrupted','attention'].includes(job.status))list.push({label:'删除任务记录（保留文件）',run:async()=>{await api('removeTask',{kind,id});toast('任务记录已删除；可在队列空白处右键撤销');}});
  return list;
 }
 const resource=target.closest('.resource');if(resource){const b=resource.querySelector('[data-action=resource-download]');return b?[{label:b.textContent.trim(),run:()=>b.click()}]:[];}
 const entity=target.closest('[data-entity-kind]');if(entity)return [{label:'查看资料与关联作品',run:()=>entity.click()}];
 const item=target.closest('[data-action=select-game],[data-action=local-detail],[data-action=wall-select],[data-action=detail]');
 let g=item?state.games.find(g=>g.id===item.dataset.id):target.closest('#steam-scene')?state.games.find(g=>g.id===selectedId):target.closest('.work-page')?state.games.find(g=>String(g.workId)===String(workPage?.id)):null;
 if(g){const list=[{label:'在库中查看',run:async()=>{go('library');await selectSteamGame(g.id);}}];
  if(g.dir){list.unshift({label:state.playtime?.running.includes(g.id)?'游戏运行中':'启动游戏',disabled:state.playtime?.running.includes(g.id),run:()=>invokeAction('launch',g.id)});list.push({label:'打开游戏目录',run:()=>invokeAction('folder',g.id)},{label:'管理游戏',run:()=>gameDetail(g.id)},{label:'上传生成直链',run:()=>invokeAction('share-game',g.id)});}
  if(g.workId)list.push({label:'作品详情与资源',run:()=>workDetail(g.workId,true)});
  list.push({label:'移出库（保留文件）',run:()=>invokeAction('remove-game',g.id)},{label:'彻底删除游戏…',danger:true,run:()=>invokeAction('delete-game',g.id)});return list;
 }
 const workId=item?.dataset.action==='detail'?item.dataset.id:target.closest('.work-page')?workPage?.id:null;
 if(workId)return [{label:'查看作品详情',run:()=>workDetail(workId,prefs.adult)},{label:'加入游戏库（不下载）',run:async()=>{await api('addCatalog',{id:workId,nsfw:page==='work'?selectedAdult:prefs.adult});toast('已加入游戏库');}}];
 const tag=target.closest('[data-action=work-tag],[data-action=filter-tag],[data-action=aggregate-tag]');if(tag)return ['+','-'].map(op=>({label:op==='+'?'搜索包含此标签的作品':'搜索排除此标签的作品',run:()=>{navBeforeLeave();query='';mode='name';filters=[];results=null;go('discover');addTag({id:tag.dataset.id,display_name:tag.dataset.name},op);runSearch();}}));
 if(target.closest('#transfer-center'))return [{label:'添加下载',run:()=>invokeAction('new-task','')},{label:'撤销上次删除任务记录',disabled:!state.canUndoTask,run:async()=>{await api('undoTask');toast('任务记录已恢复，不会自动开始传输');}}];
 return [];
}
function showContextMenu(target,x,y,submenu=null){
 const items=submenu||contextItems(target);if(!items.length)return false;closeContextMenu();contextOrigin=target.closest('button,[tabindex]')||target;
 const menu=document.createElement('div');menu.id='context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','快捷操作');
 for(const item of items){const b=document.createElement('button');b.type='button';b.role='menuitem';b.textContent=item.label;if(item.children){b.setAttribute('aria-haspopup','menu');b.append(svgIcon('arrow'));}b.disabled=!!item.disabled;if(item.danger)b.className='error';b.onclick=async()=>{closeContextMenu();try{if(item.children){showContextMenu(target,x,y,[{label:'返回',run:()=>showContextMenu(target,x,y)},...item.children]);return;}await item.run();}catch(e){toast(e.message);}};menu.append(b);}
 document.body.append(menu);const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';menu.querySelector('button:not(:disabled)')?.focus();return true;
}
document.addEventListener('contextmenu',e=>{if(e.target.closest('input,textarea,[contenteditable=true],dialog'))return;if(showContextMenu(e.target,e.clientX,e.clientY))e.preventDefault();});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#context-menu'))closeContextMenu();});
document.addEventListener('keydown',e=>{const menu=$('#context-menu');if(menu){if(e.key==='Escape'){e.preventDefault();closeContextMenu(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const bs=[...menu.querySelectorAll('button:not(:disabled)')],i=bs.indexOf(document.activeElement);bs[e.key==='Home'?0:e.key==='End'?bs.length-1:(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length]?.focus();}return;}if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){const r=e.target.getBoundingClientRect();if(showContextMenu(e.target,r.left,r.bottom))e.preventDefault();}});
window.addEventListener('blur',()=>closeContextMenu());window.addEventListener('resize',()=>closeContextMenu());
// Match right-click actions with an explicit discoverable menu button for each task.
const transfersBeforeMenus=renderTransfers;renderTransfers=function(){transfersBeforeMenus();let undo=$('#undo-task-button');if(!undo){undo=document.createElement('button');undo.id='undo-task-button';undo.textContent='撤销删除任务';undo.onclick=async()=>{try{await api('undoTask');toast('任务记录已恢复');}catch(e){toast(e.message);}};$('.transfer-filters').append(undo);}undo.hidden=!state.canUndoTask;for(const row of document.querySelectorAll('.transfer-row')){const controls=row.querySelector('.transfer-controls');if(!controls.querySelector('.task-menu-button')){const b=document.createElement('button');b.className='task-menu-button';b.ariaLabel='任务操作';b.title='任务操作（也可右键）';b.innerHTML='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';b.onclick=()=>{const r=b.getBoundingClientRect();showContextMenu(row,r.left,r.bottom);};controls.append(b);}}};
