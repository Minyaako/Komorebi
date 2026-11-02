// Rich descriptions are untrusted content; never allow app actions or active HTML.
function renderResourceMarkdown(value){
 const source=String(value||'');if(!source.trim())return '';
 const fragment=DOMPurify.sanitize(marked.parse(source,{gfm:true,breaks:true,async:false}),{
  ALLOWED_TAGS:['p','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','del','s','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','a','img','input','details','summary'],
  ALLOWED_ATTR:['href','src','alt','title','start','align','type','checked','disabled'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true
 });
 for(const a of fragment.querySelectorAll('a')){const href=a.getAttribute('href');try{const u=new URL(href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();a.setAttribute('href',u.href);a.setAttribute('rel','noopener noreferrer');}catch{a.removeAttribute('href');}}
 for(const img of fragment.querySelectorAll('img')){try{const u=new URL(img.getAttribute('src'));if(u.protocol!=='https:'||u.username||u.password)throw Error();img.src=u.href;img.loading='lazy';img.referrerPolicy='no-referrer';}catch{img.replaceWith(document.createTextNode(img.alt||''));}}
 for(const input of fragment.querySelectorAll('input')){if(input.getAttribute('type')!=='checkbox')input.remove();else input.disabled=true;}
 const wrapper=document.createElement('div');wrapper.append(fragment);return wrapper.innerHTML;
}
window.addEventListener('click',async e=>{const link=e.target.closest('.resource-markdown a[href]');if(!link)return;e.preventDefault();e.stopImmediatePropagation();try{await api('openWeb',link.href);}catch(err){toast(err.message);}},true);
