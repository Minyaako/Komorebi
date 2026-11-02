// Session navigation snapshots: no credentials, file data or browser URL routing.
const navEntries=[];let navIndex=-1,navRestoring=false,navPrepared=false,navEpoch=0;
const navClone=v=>structuredClone(v);
function navResourceHTML(){const host=$('#resource-list')?.cloneNode(true);host?.querySelectorAll('[data-action="resource-download"]').forEach(b=>b.disabled=false);return host?.innerHTML||null;}
function navSnapshot(){return {page,entity:typeof entityPage!=='undefined'?navClone(entityPage):null,entitySearch:typeof entitySearchData!=='undefined'?navClone(entitySearchData):null,search:navClone({directOnly:typeof directOnly!=='undefined'&&directOnly,query,mode,sort,after,before,filters,results,next,total,filterOpen,searching,adult:prefs.adult}),work:page==='work'?{id:workPage?.id||navPendingWork,data:navClone(workPage),adult:selectedAdult,returnTo:workReturn,resources:resourceBusy?null:navResourceHTML(),cursor:resourceCursor,resourceData:$('#resource-list')?.dataset.resources||'[]'}:null,library:{filter:libraryFilter,id:selectedId,route:libraryRoute,tab:steamTab,layout:allLayout,query:$('#library-query')?.value||''},scroll:['#main','.steam-detail','.steam-game-list','.wall-shell'].map(selector=>{const el=$(selector);return {selector,x:el?.scrollLeft||0,y:el?.scrollTop||0};})};}
let navPendingWork=null;
function navButtons(){const back=$('#nav-back'),forward=$('#nav-forward');back.disabled=navIndex<=0;forward.disabled=navIndex<0||navIndex>=navEntries.length-1;}
function navSave(){if(navIndex>=0&&!navRestoring)navEntries[navIndex]=navSnapshot();}
function navBeforeLeave(){if(navRestoring||navPrepared)return;navSave();navPrepared=true;}
function navPush(){if(navRestoring)return;navEntries.splice(navIndex+1);navEntries.push(navSnapshot());if(navEntries.length>60)navEntries.shift();navIndex=navEntries.length-1;navPrepared=false;navButtons();}
const navGo=go;
go=function(target){if(navRestoring)return;if(navIndex>=0&&target===page){navPrepared=false;return;}navBeforeLeave();navEpoch++;navGo(target);navPush();};
const navWorkDetail=workDetail;
workDetail=async function(id,adult=prefs.adult){if(navRestoring)return;navBeforeLeave();navPendingWork=id;const epoch=++navEpoch,pending=navWorkDetail(id,adult);navPush();await pending;if(epoch===navEpoch)navSave();};
const navSearch=runSearch;
runSearch=async function(more=false){const epoch=navEpoch;await navSearch(more);if(epoch===navEpoch&&page==='discover')navSave();};
const navSelectGame=selectSteamGame;
selectSteamGame=async function(id,initial=false){if(navRestoring&&!initial)return;const shouldPush=!navRestoring&&!initial&&page==='library'&&(libraryRoute!=='detail'||selectedId!==id);if(shouldPush)navBeforeLeave();const pending=navSelectGame(id,initial);if(shouldPush){navEpoch++;navPush();}await pending;};
const navShowAll=showAllLibrary;
showAllLibrary=function(){const shouldPush=!navRestoring&&page==='library'&&libraryRoute!=='all';if(shouldPush)navBeforeLeave();navShowAll();if(shouldPush){navEpoch++;navPush();}};
async function navigateHistory(delta){const target=navIndex+delta;if(navRestoring||target<0||target>=navEntries.length)return;navSave();navIndex=target;const saved=navClone(navEntries[target]),epoch=++navEpoch;navRestoring=true;navPrepared=false;closeModal();serial++;suggestionSerial++;workPageSerial++;steamSerial++;detailSerial++;clearTimeout(window.suggestTimer);clearTimeout(wallClickTimer);stopWallCamera();searching=false;unresolved=null;
 try{entityPage=saved.entity||null;entitySearchData=saved.entitySearch||null;({query,mode,sort,after,before,filters,results,next,total,filterOpen}=saved.search);directOnly=!!saved.search.directOnly;if(saved.search.adult!==prefs.adult){results=null;next=null;total=null;entitySearchData=null;if(entityPage){entityPage.nsfw=prefs.adult;entityPage.items=[];entityPage.detail=null;entityPage.busy=true;}}
 libraryFilter=saved.library.filter||'all';({id:selectedId,route:libraryRoute,tab:steamTab,layout:allLayout}=saved.library);prefs.allLayout=allLayout;
 if(saved.page==='work'){
   if(saved.work.data){page='work';workPage=saved.work.data;selected=workPage;selectedAdult=saved.work.adult;workReturn=saved.work.returnTo;resourceCursor=saved.work.cursor;resourceBusy=false;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===workReturn));render();if(saved.work.resources){$('#resource-list').innerHTML=saved.work.resources;$('#resource-list').querySelectorAll('[data-action=resource-download]').forEach(b=>b.disabled=false);$('#resource-list').dataset.resources=saved.work.resourceData||'[]';$('#work-more').hidden=!resourceCursor;}else await loadWorkResources();}
   else await navWorkDetail(saved.work.id,saved.work.adult);
 }else{navGo(saved.page);if(saved.page==='entity'&&entityPage?.busy)await loadCatalogEntity();if(saved.page==='discover'&&saved.search.searching)await navSearch();if(saved.page==='library'){if($('#library-query')){$('#library-query').value=saved.library.query;filterSteamList(saved.library.query);}if(libraryRoute==='detail')await navSelectGame(selectedId,true);}}
 if(epoch!==navEpoch)return;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));for(const pos of saved.scroll){const el=$(pos.selector);if(el)el.scrollTo({left:pos.x,top:pos.y,behavior:'instant'});}
 }finally{navRestoring=false;navButtons();}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b){e.preventDefault();navigateHistory(Number(b.dataset.nav));}});
window.addEventListener('keydown',e=>{if(e.altKey&&!e.ctrlKey&&!e.metaKey&&['ArrowLeft','ArrowRight'].includes(e.key)&&!$('#dialog').open){e.preventDefault();navigateHistory(e.key==='ArrowLeft'?-1:1);}});
navButtons();
