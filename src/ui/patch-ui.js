const patchTypes={manual:'人工汉化',ai:'AI 翻译',machine_polishing:'机翻润色',machine:'机器翻译',save:'存档',crack:'免验证',fix:'修复',mod:'模组',r18:'成人补丁',decensor:'去修正',image:'图片',other:'其他'};
const patchMeta=x=>[...(x.type||[]).map(t=>patchTypes[t]||t),...(x.language||[]),...(x.platform||[])].join(' · ');
function patchLink(url,label){try{const u=new URL(url);if(u.protocol!=='https:'||!['www.moyu.moe','moyu.moe'].includes(u.hostname)||u.username||u.password)return '';}catch{return '';}return '<button data-action="web" data-url="'+esc(url)+'">'+esc(label)+'</button>';}
function renderPatchPage(e){
 const d=e.detail||{};
 $('#breadcrumb').textContent='补丁';
 $('#main').innerHTML=`<article class="entity-page"><p class="eyebrow">MOYU · 补丁资源</p><h1>${esc(e.name)}</h1><p class="muted">${esc(patchMeta(d))}</p><div class="actions">${d.catalog_work_id?`<button data-patch-work="${esc(d.catalog_work_id)}">查看对应作品</button>`:''}${patchLink(d.web_url,'在官网查看补丁')}</div><h2>补丁文件</h2><p class="muted">请核对适用版本及作者说明。</p>${e.items.map(r=>`<section class="detail-section"><h3>${esc(r.name||'补丁资源')}</h3><p class="muted">${esc(patchMeta(r))} · ${esc(r.size||'大小未知')}</p><p>${esc(r.localization_group_name||'')}${r.model_name?' · '+esc(r.model_name):''}</p><div class="resource-markdown">${renderResourceMarkdown(r.note||'')}</div>${r.storage==='user'?'':`<button data-download-patch="${esc(r.id)}">下载补丁</button>`}${patchLink(r.web_url,'打开官方资源页')}</section>`).join('')}${e.busy?'<p>正在读取补丁…</p>':!e.items.length&&!e.error?'<p>暂无补丁文件。</p>':''}${e.error?`<p class="error">${esc(e.error)}</p><button data-entity-retry>重试</button>`:''}${e.cursor?`<button data-entity-next ${e.busy?'disabled':''}>加载更多补丁</button>`:''}</article>`;
}
const beforePatchWork=renderWorkPage;
renderWorkPage=function(){beforePatchWork();if(!workPage)return;$('#work-resources')?.insertAdjacentHTML('afterend',`<section class="work-resources"><div class="sectionhead"><h2>补丁与附加内容</h2><button data-work-patches>查询补丁</button></div><p class="muted">汉化、修复、存档与模组 · 来自 moyu</p><div id="work-patches"></div></section>`);};
document.addEventListener('click',async e=>{
 const work=e.target.closest('[data-patch-work]');if(work){workDetail(work.dataset.patchWork,prefs.adult);return;}
 const button=e.target.closest('[data-work-patches]');if(!button)return;
 const w=workPage,host=$('#work-patches');button.disabled=true;host.textContent='正在查询补丁…';
 try{const r=await api('workPatches',{workId:w.id,nsfw:!!selectedAdult});if(!host.isConnected||workPage!==w)return;host.innerHTML=r.items.length?'<div class="entity-results">'+r.items.map(p=>entityButton(p,'patch')).join('')+'</div>':'<p class="muted">暂无可用补丁。</p>';}
 catch(err){if(host.isConnected)host.innerHTML='<p class="error">'+esc(err.message)+'</p><button data-action="connection-settings">账号与连接</button>';}
 finally{if(button.isConnected)button.disabled=false;}
});
function publicPatchLinks(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const panel = template.content.querySelector('#resource-detail-tabpanel-download');
  const links = new Set();
  for (const anchor of panel?.querySelectorAll('a[href]') || []) {
    try {
      const url = new URL(anchor.getAttribute('href'));
      if (url.origin === 'https://dl.imoe.uk' && !url.username && !url.password && url.pathname.startsWith('/moyu/')) links.add(url.href);
    } catch { /* Ignore non-file links in the official panel. */ }
  }
  return [...links];
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-download-patch], [data-patch-mirror]');
  if (!button || button.disabled) return;
  const resource = entityPage?.items.find(item => String(item.id) === (button.dataset.downloadPatch || button.dataset.patchMirror));
  if (!resource) return;
  button.disabled = true;
  try {
    let url = button.dataset.url;
    if (!url) {
      const links = publicPatchLinks(await api('publicPatchPage', resource.id));
      if (!button.isConnected) return;
      if (!links.length) throw new Error('当前页面未提供可识别的托管直链，请打开官方资源页。');
      if (links.length > 1) {
        modal('选择补丁文件', links.map((link, index) => `<button data-patch-mirror="${esc(resource.id)}" data-url="${esc(link)}">文件 ${index + 1} · ${esc(new URL(link).pathname.split('/').pop())}</button>`).join(''));
        return;
      }
      url = links[0];
    }
    await api('download', {url, kind:'patch', title:resource.name || '游戏补丁'});
    closeModal();
    go('transfers');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
