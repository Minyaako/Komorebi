let uploadPreviewToken='',uploadPreviewSerial=0,uploadDebounce,matchSerial=0,matchTarget=null;
async function matchGameForm(id,after='detail'){
 const g=state.games.find(x=>x.id===id);matchTarget={id,after};
 modal('选择匹配作品',`<form id="match-name-form"><label class="field"><span>作品名称</span><div class="actions"><input name="query" required value="${esc(g.title)}" placeholder="输入中文名、日文名或别名"><button class="primary">搜索</button></div></label></form><div id="match-results" aria-live="polite"></div>`);
 await searchMatch();
}
async function searchMatch(){const form=$('#match-name-form');if(!form)return;const query=form.elements.query.value.trim();if(!query)return;const serial=++matchSerial,target=matchTarget;$('#match-results').innerHTML='<p class="subtle">正在搜索（包含成人作品）…</p>';
 try{const r=await api('search',{query,nsfw:true});if(serial!==matchSerial||target!==matchTarget||!$('#match-results'))return;
 $('#match-results').innerHTML=(r.items||[]).map(w=>`<button class="match-candidate" data-action="match-pick" data-id="${esc(w.id)}"><span>${legacyCover(w)}</span><span><strong>${esc(title(w))}</strong><small>${esc(w.display_name||'')} · ${esc(w.release_date||'日期未知')}</small></span><span>选择 →</span></button>`).join('')||'<p class="subtle">没有找到作品，试试别名或缩短名称。</p>';
 }catch(e){if(serial===matchSerial&&$('#match-results'))$('#match-results').textContent=e.message;}
}
async function uploadForm(id){
 const g=state.games.find(x=>x.id===id);if(!g)return;if(!g.dir){toast('请先安装或导入本地游戏');return;}if(!g.workId)return matchGameForm(id,'upload');
 uploadPreviewToken='';uploadPreviewSerial++;
 modal('上传生成直链',`<form id="upload-form" data-id="${esc(id)}"><p class="notice">压缩「${esc(g.title)}」的游戏目录，后台上传并投稿到 LetMoe。原文件不变。</p><details><summary>资源信息与启动程序（已自动填写）</summary><label class="field"><span>资源标题</span><input name="title" required maxlength="200" value="${esc(g.title)}"></label><label class="field"><span>资源说明</span><textarea name="description" required rows="3">${esc('转载资源。完整解压后按启动信息运行游戏。')}</textarea></label><label class="field"><span>启动程序</span><select name="executable"><option value="">打开游戏目录</option></select><small>相对路径会写入压缩包内的 komorebi.json。</small></label></details><details open><summary>排除存档与其他文件</summary><p class="subtle">勾选不打包的目录；已预选常见存档目录，可取消。</p><div id="exclude-folders" class="exclude-folders">正在读取目录…</div><label class="field"><span>正则排除（可选）</span><input name="excludeRegex" placeholder="例如：(^|/)(save|savedata)(/|$)|\\.log$"><small>匹配相对路径，分隔符为 /，忽略大小写；输入表达式本身，不加两侧斜杠。</small></label></details><div id="pack-preview" class="notice" aria-live="polite">正在计算压缩内容…</div><p id="form-error" class="error"></p><div class="actions upload-footer"><button class="primary" type="submit" disabled>上传并投稿</button><span class="subtle">${esc(g.title)}.zip · 登录或异常时才显示官网。</span></div></form>`);
 await refreshUploadPreview(true);
}
async function refreshUploadPreview(initial=false){
 const f=$('#upload-form');if(!f)return;const serial=++uploadPreviewSerial;uploadPreviewToken='';f.querySelector('[type=submit]').disabled=true;
 const excludeFolders=[...f.querySelectorAll('[data-exclude-folder]:checked')].map(x=>x.value);
 try{const p=await api('uploadPreview',{id:f.dataset.id,excludeFolders,excludeRegex:f.elements.excludeRegex.value,suggest:initial});if(serial!==uploadPreviewSerial||!f.isConnected)return;
 if(initial)$('#exclude-folders').innerHTML=p.folders.map(name=>`<label class="toggle"><input type="checkbox" data-exclude-folder value="${esc(name)}" ${p.selectedFolders.includes(name)?'checked':''}>${esc(name)}</label>`).join('')||'<span class="subtle">目录内没有子文件夹</span>';
 const selected=initial?state.games.find(x=>x.id===f.dataset.id)?.executable:f.elements.executable.value;
 f.elements.executable.innerHTML='<option value="">打开游戏目录</option>'+p.executables.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('');
 $('#pack-preview').innerHTML=`将打包 ${p.count} 个文件 · ${bytes(p.bytes)}（压缩前），排除 ${p.excludedCount} 个文件。另加入 komorebi.json。${p.skipped.length?`跳过 ${p.skipped.length} 个链接。`:''}<details><summary>查看排除结果</summary><div class="excluded-preview">${p.excluded.map(x=>`<div>${esc(x)}</div>`).join('')||'无排除文件'}${p.excludedCount>p.excluded.length?'<p>仅显示前 200 项</p>':''}</div></details>`;
 uploadPreviewToken=p.token;$('#form-error').textContent='';f.querySelector('[type=submit]').disabled=!p.count;
 }catch(e){if(serial===uploadPreviewSerial&&f.isConnected)$('#form-error').textContent=e.message;}
}
function renderUploads(){const el=$('#upload-jobs');if(!el)return;const labels={packing:'正在压缩',opening:'连接官网',login:'需要登录',uploading:'正在上传',submitting:'正在投稿',complete:'投稿成功',attention:'需要处理',error:'失败',cancelled:'已取消',interrupted:'上次任务中断'};
 el.innerHTML=(state.uploads||[]).map(j=>`<article class="job"><div class="job-icon">↑</div><div class="job-body"><div class="job-head"><h3>${esc(j.title)}</h3><span>${labels[j.status]||j.status}</span></div><progress max="100" ${j.progress?`value="${j.progress}"`:''} aria-label="上传任务进度"></progress><p class="subtle">${esc(j.message)}</p><div class="actions">${['opening','login','uploading','submitting','attention'].includes(j.status)?`<button class="secondary" data-action="upload-show" data-id="${j.id}">查看官网进度</button>`:''}${!['complete','cancelled','interrupted','error'].includes(j.status)?`<button class="chip" data-action="upload-cancel" data-id="${j.id}">取消任务</button>`:''}${['attention','error','interrupted','cancelled'].includes(j.status)&&!j.submitted?`<button class="secondary" data-action="upload-retry" data-id="${j.id}">使用现有压缩包继续</button>`:''}${j.url?`<button class="secondary" data-action="web" data-url="${esc(j.url)}">查看资源</button>`:''}<button class="chip" data-action="upload-folder" data-id="${j.id}">查看压缩包</button><span class="path">${esc(j.archive)}</span></div></div></article>`).join('');
}
document.addEventListener('input',e=>{if(e.target.name!=='excludeRegex'||!$('#upload-form'))return;uploadPreviewToken='';uploadPreviewSerial++;$('#upload-form [type=submit]').disabled=true;clearTimeout(uploadDebounce);uploadDebounce=setTimeout(()=>refreshUploadPreview(),400);});
document.addEventListener('change',e=>{if(e.target.hasAttribute('data-exclude-folder')){clearTimeout(uploadDebounce);refreshUploadPreview();}});
document.addEventListener('submit',async e=>{
 if(e.target.id==='match-name-form'){e.preventDefault();await searchMatch();return;}
 if(e.target.id!=='upload-form')return;e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]');b.disabled=true;
 try{if(!uploadPreviewToken)throw new Error('请等待排除预览完成');await api('startUpload',{token:uploadPreviewToken,title:f.elements.title.value,description:f.elements.description.value,executable:f.elements.executable.value});closeModal();switchView('downloads');renderUploads();toast('已开始压缩，随后自动上传并投稿');}catch(e){if(f.isConnected){$('#form-error').textContent=e.message;b.disabled=false;}}
});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;try{
 if(b.dataset.action==='match-pick'){const target=matchTarget;b.disabled=true;await api('matchGame',{id:target.id,workId:b.dataset.id});updateState(await api('state'));target.after==='upload'?await uploadForm(target.id):gameDetail(target.id);}
 if(b.dataset.action==='upload-folder')await api('openUploadFolder',b.dataset.id);
 if(b.dataset.action==='upload-retry'){b.disabled=true;await api('retryUpload',b.dataset.id);}
 if(b.dataset.action==='upload-show')await api('showUpload',b.dataset.id);
 if(b.dataset.action==='upload-cancel')await api('cancelUpload',b.dataset.id);
 }catch(e){toast(e.message);b.disabled=false;}});

