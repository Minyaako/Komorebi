let bannerResizeObserver=null;
const decodedBanners=new Map(),bannerLoads=new Map();
async function loadBannerImage(url){
 if(decodedBanners.has(url)){const img=decodedBanners.get(url);decodedBanners.delete(url);decodedBanners.set(url,img);return img;}
 if(bannerLoads.has(url))return bannerLoads.get(url);
 const pending=(async()=>{let source=url;
  if(/^https:\/\//.test(url)&&window.komorebi){try{source=await window.komorebi.call('cacheBanner',url);}catch{}}
  const img=new Image();img.alt='';img.className='banner-foreground wide-art';img.src=source;
  try{await img.decode();}catch(e){if(source===url)throw e;img.src=url;await img.decode();}
  if(decodedBanners.size>=40)decodedBanners.delete(decodedBanners.keys().next().value);
  decodedBanners.set(url,img);return img;
 })().finally(()=>bannerLoads.delete(url));bannerLoads.set(url,pending);return pending;
}
async function renderBannerArt(host,work,isCurrent,initial=false){
 bannerResizeObserver?.disconnect();
 // Keep selection fixed; resizing only changes CSS cropping, never fetches again.
 const url=chooseBanner(work,1200,320)?.url||cover(work);if(!url)return;
 let foreground;
 try{foreground=decodedBanners.get(url)||await loadBannerImage(url);}catch{const fallback=cover(work);if(!fallback||fallback===url)return;try{foreground=await loadBannerImage(fallback);}catch{return;}}
 if(!host.isConnected||!isCurrent())return;
 host.getAnimations({subtree:true}).forEach(a=>a.cancel());
 if(host.querySelector('.banner-foreground')!==foreground){const stage=document.createElement('div');stage.className='banner-layer';stage.append(foreground);host.replaceChildren(stage);}
 host.parentElement.classList.remove('cover-layout','composite-banner');host.dataset.imageWidth=String(foreground.naturalWidth);host.dataset.imageUrl=url;host.dataset.localImageUrl=foreground.src;
 const updateSize=()=>{host.dataset.renderWidth=String(host.clientWidth);};updateSize();
 const observer=new ResizeObserver(()=>{if(!host.isConnected||!isCurrent()){observer.disconnect();return;}updateSize();});bannerResizeObserver=observer;observer.observe(host);
}
