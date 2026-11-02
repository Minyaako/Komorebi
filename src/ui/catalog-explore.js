let directOnly=false;
(()=>{
const work=renderWorkPage;
renderWorkPage=function(){work();const w=workPage;if(!w)return;
 const groups=[['系列合集','series',w.series||[]],['会社 / 社团','company',w.companies||[]],...(w.credits||[]).map(g=>[g.role_name||g.role_key,'credit_name',g.credits||[]])];
 const content=groups.filter(g=>g[2].length).map(([label,kind,entries])=>`<section class="work-relations"><h3>${esc(label)}</h3><div class="entity-results">${entries.map(x=>entityButton(x,kind)).join('')}</div></section>`).join('');
 if(content)$('#work-resources')?.insertAdjacentHTML('beforebegin',`<section class="work-related"><h2>探索关联作品</h2>${content}</section>`);
};
const discover=renderDiscover;
renderDiscover=function(){discover();$('#search').parentElement.insertAdjacentHTML('afterend',`<label class="direct-search-filter"><input id="direct-only" type="checkbox" ${directOnly?'checked':''}>只看有直链的作品 <small>按资源元数据核实，首次查询较慢</small></label>`);$('#direct-only').onchange=()=>{directOnly=$('#direct-only').checked;mode='name';$('#search-mode').value=mode;runSearch();};};
let observer,lastAttempt='';
function observeMore(){observer?.disconnect();const button=page==='discover'?document.querySelector('[data-action=more],[data-entity-more]'):page==='entity'?document.querySelector('[data-entity-next]'):null;if(!button)return;
 observer=new IntersectionObserver(entries=>{if(!entries.some(x=>x.isIntersecting)||searching||navRestoring||entityPage?.busy&&page==='entity')return;const cursor=page==='entity'?entityPage?.cursor:catalogKinds[mode]?entitySearchData?.next_cursor:next;const k=JSON.stringify([page,query,mode,directOnly,filters,cursor,entityPage?.id]);if(!cursor||lastAttempt===k)return;lastAttempt=k;button.click();},{root:null,rootMargin:'0px 0px 120px 0px'});observer.observe(button);
}
const content=renderDiscoverContent;renderDiscoverContent=function(){content();if(directOnly&&results!==null&&!catalogKinds[mode]&&!results.length&&next){const empty=$('#discover-content .empty');if(empty)empty.innerHTML='<h2>本批作品暂无直链</h2><p>继续加载可检查后续作品。</p>';}observeMore();};
const entity=renderCatalogEntity;renderCatalogEntity=function(){entity();observeMore();};
const search=runSearch;runSearch=async function(more=false){if(!more)lastAttempt='';try{return await search(more);}finally{observeMore();}};
const load=loadCatalogEntity;loadCatalogEntity=async function(more=false){if(!more)lastAttempt='';try{return await load(more);}finally{observeMore();}};
})();
