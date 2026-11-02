let transferFilter='all';
Object.assign(iconPaths,{upload:'M12 21V6 m-5 5 5-5 5 5 M4 8V3h16v5',pause:'M8 5v14 M16 5v14',check:'m5 12 4 4L19 6'});
const transferIcon=name=>svgIcon(name).outerHTML;
const uploadLabels={packing:'正在压缩',opening:'连接官网',login:'需要登录',uploading:'正在上传',submitting:'正在投稿',complete:'投稿成功',attention:'需要处理',error:'上传失败',cancelled:'已取消',interrupted:'任务中断'};
const transferDone=j=>['complete','cancelled'].includes(j.status);
function transferButton(action,id,label,icon=''){return `<button data-action="${action}" data-id="${esc(id)}">${icon?transferIcon(icon):''}${label}</button>`;}
function transferActions(j,kind){
 if(kind==='download')return (j.status==='attention'?transferButton('job-folder',j.id,'打开文件夹','external'):'')+(['active','waiting'].includes(j.status)?transferButton('job-pause',j.id,'暂停','pause'):'')+(j.status==='paused'?transferButton('job-resume',j.id,'继续','play'):'')+(j.status==='error'?transferButton('job-retry',j.id,j.downloaded?'输入密码 / 重试解压':'重试','restore'):'')+(['active','waiting','paused','error'].includes(j.status)?transferButton('job-cancel',j.id,'取消','close'):'')+(j.gameId&&state.games.some(g=>g.id===j.gameId)?transferButton('prod-open-game',j.gameId,'在库中查看','library'):'');
 return (['opening','login','uploading','submitting','attention'].includes(j.status)?transferButton('upload-show',j.id,'官网进度','external'):'')+(!['complete','cancelled','interrupted','error'].includes(j.status)?transferButton('upload-cancel',j.id,'取消','close'):'')+(['attention','error','interrupted','cancelled'].includes(j.status)&&!j.submitted?transferButton('upload-retry',j.id,'继续上传','restore'):'')+(j.url?`<button data-action="web" data-url="${esc(j.url)}">${transferIcon('external')}查看资源</button>`:'')+(j.archive?transferButton('upload-folder',j.id,'压缩包','external'):'');
}
function transferText(el,value){value=String(value??'');if(el.textContent!==value)el.textContent=value;}
function updateTransferRow(row,j,kind){
 const status=(kind==='download'?jobLabels:uploadLabels)[j.status]||j.status;
 transferText(row.querySelector('h3'),j.title);transferText(row.querySelector('.transfer-status'),status);
 const progress=row.querySelector('progress'),known=kind==='download'?j.total>0:Number.isFinite(j.progress),value=j.status==='complete'?100:kind==='download'?(j.total?j.completed/j.total*100:0):j.progress;
 progress.hidden=transferDone(j)||(!known&&kind==='upload');
 if(known||j.status==='complete')progress.value=Math.max(0,Math.min(100,value||0));else progress.removeAttribute('value');
 const speed=kind==='download'&&j.status==='active'?Math.max(0,j.speed||0):0;
 transferText(row.querySelector('.transfer-metric'),kind==='download'?`${bytes(j.completed||0)} / ${j.total?bytes(j.total):'大小待确认'}${speed?' · '+bytes(speed)+'/s':''}`:known?`${Math.round(value)}%`:'官方未提供百分比');
 transferText(row.querySelector('.transfer-message'),j.error||j.message||(j.status==='extracting'?'下载完成，正在自动解压入库':kind==='upload'&&j.status==='uploading'?'正在上传，等待官方确认':''));
 row.querySelector('.transfer-message').classList.toggle('error',['error','attention','interrupted'].includes(j.status));
 const controls=row.querySelector('.transfer-controls'),html=transferActions(j,kind);if(controls.dataset.html!==html){controls.dataset.html=html;controls.innerHTML=html;}
 const art=row.querySelector('.transfer-art'),cover=j.cover||state.games.find(g=>g.id===j.gameId||g.workId&&String(g.workId)===String(j.workId))?.cover;
 if(art.dataset.cover!==(cover||'')){art.dataset.cover=cover||'';art.innerHTML=cover?`<img src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:transferIcon(kind);}
 row.dataset.status=j.status;
}
function transferList(host,items){
 const wanted=new Set(items.map(({j,kind})=>kind+':'+j.id));for(const el of [...host.children])if(!wanted.has(el.dataset.key))el.remove();
 items.forEach(({j,kind},index)=>{const key=kind+':'+j.id;let row=[...host.children].find(el=>el.dataset.key===key);if(!row){row=document.createElement('article');row.className='transfer-row';row.dataset.key=key;row.innerHTML=`<div class="transfer-art">${transferIcon(kind)}</div><div class="transfer-body"><div class="transfer-title"><h3></h3><span class="transfer-status"></span></div><p class="transfer-metric"></p><progress max="100" aria-label="${kind==='download'?'下载':'上传'}进度"></progress><p class="transfer-message"></p></div><div class="transfer-controls"></div>`;}if(host.children[index]!==row)host.insertBefore(row,host.children[index]||null);updateTransferRow(row,j,kind);});
}
renderTransfers=function(){
 if(!$('#transfer-center'))$('#main').innerHTML=`<div id="transfer-center"><header class="transfer-page-head"><div><p class="eyebrow">TRANSFER CENTER</p><h1>下载与上传</h1></div><button class="primary" data-action="new-task">${transferIcon('plus')}添加下载</button></header><section class="transfer-overview"><div class="transfer-overview-icon">${transferIcon('download')}</div><div class="transfer-now"><small>当前传输</small><h2 id="transfer-current"></h2><p id="transfer-summary"></p></div><div class="transfer-speed"><small>总下载速度</small><strong id="transfer-speed"></strong></div></section><nav class="transfer-filters" aria-label="任务筛选">${[['all','全部'],['download','下载'],['upload','上传'],['history','已结束']].map(([key,label])=>`<button data-transfer-filter="${key}" aria-pressed="${key===transferFilter}">${label}</button>`).join('')}</nav><section class="transfer-group" id="download-group"><h2>下载队列 <small></small></h2><div id="jobs"></div></section><section class="transfer-group" id="upload-group"><h2>上传队列 <small></small></h2><div id="upload-jobs"></div></section><section class="transfer-group" id="history-group"><h2>已结束 <small></small></h2><div id="transfer-history"></div></section><p id="transfer-empty" class="empty" hidden>这里还没有任务。可从作品资源页选择下载，或添加下载链接。</p><p id="transfer-engine" class="error"></p></div>`;
 const downloads=state.jobs||[],uploads=state.uploads||[],all=[...downloads.map(j=>({j,kind:'download'})),...uploads.map(j=>({j,kind:'upload'}))],active=all.filter(x=>!transferDone(x.j)),running=active.filter(x=>['active','packing','opening','uploading','submitting','extracting'].includes(x.j.status));
 transferText($('#transfer-current'),running[0]?.j.title||(active.length?'任务等待处理':'传输已就绪'));
 transferText($('#transfer-summary'),`${downloads.filter(j=>j.status==='active').length} 个下载中 · ${uploads.filter(j=>!transferDone(j)).length} 个上传任务 · ${active.filter(x=>x.j.status==='paused').length} 个已暂停`);
 transferText($('#transfer-speed'),bytes(downloads.filter(j=>j.status==='active').reduce((n,j)=>n+(j.speed||0),0))+'/s');
 let visible=0;
 for(const [type,selector]of [['download','#jobs'],['upload','#upload-jobs'],['history','#transfer-history']]){const items=all.filter(x=>type==='history'?transferDone(x.j):x.kind===type&&!transferDone(x.j)),show=transferFilter==='all'||transferFilter===type;const group=$(selector).parentElement;group.hidden=!show||!items.length;transferText(group.querySelector('small'),items.length);transferList($(selector),items);if(show)visible+=items.length;}
 $('#transfer-empty').hidden=visible>0;transferText($('#transfer-engine'),state.engineError||'');
 document.querySelectorAll('[data-transfer-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.transferFilter===transferFilter)));
};
renderUploads=function(){if(page==='transfers')renderTransfers();};
document.addEventListener('click',e=>{const b=e.target.closest('[data-transfer-filter]');if(b){transferFilter=b.dataset.transferFilter;renderTransfers();}});
