let scanChoices=new Map(),scanIdentity='',scanOpen=false,resourceViewSerial=0;
async function beginLibraryScan(single=false,gameId){
 const result=await api('scanLibrary',{single,gameId,nsfw:true});
 if(result){switchView('library');scanOpen=true;renderScan((await api('state')).scan);}
}
function renderScan(scan){
 if(!scanOpen||!scan)return;
 if(scan.id!==scanIdentity){scanChoices.clear();scanIdentity=scan.id;}
 const busy=['scanning','stopping'].includes(scan.status),labels={matching:'正在匹配',matched:'名称一致',review:'请选择候选',unmatched:'未找到匹配',error:'需要处理',duplicate:'已在库中'};
 const rows=scan.rows.map(row=>{
   const disabled=busy||row.status==='duplicate'||row.status==='matching';
   if(!scanChoices.has(row.id)&&row.status!=='matching')scanChoices.set(row.id,{include:row.include,workId:row.selected});
   const choice=scanChoices.get(row.id)||{include:false,workId:''};
   return `<article class="scan-row" data-row="${esc(row.id)}"><div class="scan-row-head"><label class="toggle"><input type="checkbox" data-scan-check="${esc(row.id)}" ${choice.include?'checked':''} ${disabled?'disabled':''}><strong>${esc(row.name)}</strong></label><span class="subtle">${labels[row.status]||row.status}</span></div><p class="path">${esc(row.dir)}</p>${row.error?`<p class="error">${esc(row.error)}</p>`:''}<label class="field"><span>关联 NextMoe 作品</span><select data-scan-choice="${esc(row.id)}" ${disabled?'disabled':''}><option value="">仅本地入库，暂不关联资料</option>${row.matches.map(w=>`<option value="${esc(w.id)}" ${String(w.id)===choice.workId?'selected':''}>${esc(title(w))} · ${esc(w.release_date||'日期未知')}${w.matchScore===1?' · 名称一致':''}</option>`).join('')}</select></label>${row.status!=='duplicate'?`<div class="scan-search"><input data-scan-query="${esc(row.id)}" aria-label="修改游戏搜索名称" value="${esc(row.query)}" ${busy?'disabled':''}><button class="secondary" data-action="scan-rematch" data-id="${esc(row.id)}" ${disabled?'disabled':''}>重新搜索</button></div>`:''}</article>`;
 }).join('');
 modal('扫描与识别游戏',`<p class="path">${esc(scan.root||'')}</p><p class="notice">${busy?'正在扫描和查询 NextMoe':'扫描结果'} · ${scan.processed} / ${scan.total} · ${scan.nsfw?'含成人作品':'全年龄'}。只发送游戏名称查询，原目录保持不动。</p>${!busy&&!scan.nsfw?'<button class="secondary" data-action="scan-all-content">包含成人作品重新识别</button>':''}${scan.error?`<p class="error">${esc(scan.error)}</p>`:''}<div class="actions">${busy?'<button class="secondary" data-action="scan-cancel">停止扫描</button>':'<button class="primary" data-action="scan-commit">将勾选项加入游戏库</button>'}<span class="subtle">匹配不准可输入作品名搜索，再从候选中选择；未匹配也可仅本地入库。</span></div>${rows||'<p class="subtle">'+(busy?'正在查找游戏目录…':'未找到可识别的 EXE。可尝试添加单个游戏目录。')+'</p>'}${scan.warnings?.length?`<details><summary>扫描提示（${scan.warnings.length}）</summary>${scan.warnings.map(w=>`<p class="subtle">${esc(w)}</p>`).join('')}</details>`:''}`);
}
function localLinkForm(id){const g=state.games.find(g=>g.id===id);modal('添加个人直链',`<form id="local-link-form" data-id="${esc(id)}"><p class="notice">为「${esc(g.title)}」保存已有下载直链，仅保存在本机。若想上传游戏生成站内直链，请使用“上传生成直链”。</p><label class="field"><span>名称</span><input name="label" value="个人资源" maxlength="100"></label><label class="field"><span>HTTP(S) 下载直链</span><input name="url" type="url" required placeholder="https://…/game.zip"></label><button type="submit" class="primary">保存直链</button><p class="error" id="form-error"></p></form>`);}
async function renderGameExtra(g){
 const el=$('#game-extra');if(!el)return;const serial=++resourceViewSerial;
 el.innerHTML=`<div class="detail-section"><h3>作品资料与资源</h3><div class="actions">${g.workId?`<button class="secondary" data-action="linked-work" data-id="${esc(g.id)}">查看 NextMoe 资料</button>`:`<button class="secondary" data-action="identify-game" data-id="${esc(g.id)}">识别并关联 NextMoe</button>`}<button class="secondary" data-action="local-link" data-id="${esc(g.id)}">添加已有直链</button><button class="chip" data-action="share-game" data-id="${esc(g.id)}">上传生成直链</button></div><p class="subtle" id="local-resource-status">${g.workId?'正在检查站内直链…':'尚未关联作品，识别后可检查 NextMoe 资源。'}</p>${(g.links||[]).map(l=>`<p><button class="chip" data-action="web" data-url="${esc(l.url)}">${esc(l.label)} ↗</button><span class="subtle"> · 个人直链</span></p>`).join('')}</div>`;
 if(!g.workId)return;
 try{const r=await api('gameResources',g.id);if(serial!==resourceViewSerial||!el.isConnected)return;
 const texts={hosted:'NextMoe 已有站内直链，可在作品详情中选择资源。',none:'NextMoe 暂无可见站内直链。你可以添加已有直链，或上传游戏生成直链。',partial:'当前资源页未发现站内直链，可查看来源网站继续查找，或添加个人直链。','no-key':'尚未配置资源密钥，暂时无法检查站内直链；可以先添加个人直链。'};
 el.querySelector('#local-resource-status').textContent=texts[r.status]||'尚未关联作品。';
 }catch(e){if(serial===resourceViewSerial&&el.isConnected)el.querySelector('#local-resource-status').textContent='资源检查失败：'+e.message+'。可稍后重试或添加个人直链。';}
}
document.addEventListener('change',e=>{
 const id=e.target.dataset.scanCheck||e.target.dataset.scanChoice;if(!id)return;
 const c=scanChoices.get(id)||{include:false,workId:''};if(e.target.dataset.scanCheck)c.include=e.target.checked;else c.workId=e.target.value;scanChoices.set(id,c);
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id;
 if(a==='close'){scanOpen=false;return;}
 if(!['scan-library','scan-all-content','scan-review','scan-cancel','scan-commit','scan-rematch','identify-game','linked-work','local-link'].includes(a))return;
 b.disabled=true;
 try{
   if(a==='scan-library')await beginLibraryScan();
   else if(a==='scan-all-content'){scanChoices.clear();await api('scanLibrary',{retry:true,nsfw:true});renderScan((await api('state')).scan);}
   else if(a==='scan-review'){scanOpen=true;renderScan(state.scan);}
   else if(a==='scan-cancel')await api('cancelScan');
   else if(a==='scan-commit'){const choices=[...scanChoices].filter(([,v])=>v.include).map(([id,v])=>({id,workId:v.workId}));if(!choices.length)throw new Error('请先勾选要入库的游戏');const r=await api('commitScan',choices);if(r.errors.length)toast(`已添加 ${r.added}，已关联 ${r.updated}。${r.errors.map(x=>x.name+'：'+x.error).join('；')}`);else{scanOpen=false;closeModal();toast(`已添加 ${r.added} 个游戏，关联 ${r.updated} 个已有游戏，跳过 ${r.skipped} 个重复目录`);}}
   else if(a==='scan-rematch'){const query=document.querySelector(`[data-scan-query="${id}"]`).value.trim();if(!query)throw new Error('请输入作品名');scanChoices.delete(id);await api('rematchScan',{id,query});}
   else if(a==='identify-game')await matchGameForm(id);
   else if(a==='linked-work'){const g=state.games.find(g=>g.id===id);await workDetail(g.workId,true);}
   else if(a==='local-link')localLinkForm(id);
 }catch(e){toast(e.message);}finally{if(b.isConnected)b.disabled=false;}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='local-link-form')return;e.preventDefault();const f=e.target,d=new FormData(f),b=f.querySelector('button');b.disabled=true;try{await api('saveGameLink',{id:f.dataset.id,url:d.get('url'),label:d.get('label')});gameDetail(f.dataset.id);toast('个人直链已保存');}catch(e){f.querySelector('#form-error').textContent=e.message;}finally{b.disabled=false;}});
$('#dialog').addEventListener('cancel',()=>{scanOpen=false;});
window.komorebi.onState(s=>{if(scanOpen&&$('#dialog-title').textContent==='扫描与识别游戏'&&$('#dialog').open)renderScan(s.scan);const b=$('[data-action="scan-review"]');if(b){b.hidden=!s.scan?.id;b.textContent=['scanning','stopping'].includes(s.scan?.status)?`查看扫描进度 ${s.scan.processed}/${s.scan.total}`:'查看上次扫描结果';}});

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.scanQuery){e.preventDefault();document.querySelector(`[data-action="scan-rematch"][data-id="${e.target.dataset.scanQuery}"]`)?.click();}});
