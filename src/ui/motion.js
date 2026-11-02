const motionReduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function enterSurface(el,delay=0){if(!el||motionReduced())return;el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,delay,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'});}
function enterItems(root,selector='.gamecard'){if(!root||motionReduced())return;[...root.querySelectorAll(selector)].slice(0,24).forEach((el,i)=>enterSurface(el,Math.min(i,8)*24));}
let dialogMotion=0;
function openDialogMotion(){dialogMotion++;const d=document.querySelector('#dialog');d.getAnimations().forEach(a=>a.cancel());if(!d.open)d.showModal();if(!motionReduced())d.animate([{opacity:0,transform:'translateY(12px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:220,easing:'cubic-bezier(.16,1,.3,1)'});}
async function closeDialogMotion(){const d=document.querySelector('#dialog'),serial=++dialogMotion;d.getAnimations().forEach(a=>a.cancel());if(!d.open)return;if(!motionReduced())await d.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(7px)'}],{duration:140,easing:'ease-in',fill:'forwards'}).finished.catch(()=>{});if(serial===dialogMotion){d.close();d.getAnimations().forEach(a=>a.cancel());}}
document.querySelector('#dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialogMotion();});
let wallFrame=0,wallEpoch=0;
function stopWallCamera(){cancelAnimationFrame(wallFrame);wallFrame=0;}
function moveWallCamera(shell,left,top){stopWallCamera();const fromX=shell.scrollLeft,fromY=shell.scrollTop,start=performance.now();left=Math.max(0,Math.min(left,shell.scrollWidth-shell.clientWidth));top=Math.max(0,Math.min(top,shell.scrollHeight-shell.clientHeight));if(motionReduced()){shell.scrollTo(left,top);return;}function step(now){if(!shell.isConnected)return;const t=Math.min(1,(now-start)/540),ease=1-Math.pow(1-t,3);shell.scrollTo(fromX+(left-fromX)*ease,fromY+(top-fromY)*ease);if(t<1)wallFrame=requestAnimationFrame(step);else wallFrame=0;}wallFrame=requestAnimationFrame(step);}
function animateWallSelection(id){
 const shell=document.querySelector('.wall-shell');if(!shell)return;stopWallCamera();const epoch=++wallEpoch,tiles=[...shell.querySelectorAll('.wall button')],before=tiles.map(el=>el.getBoundingClientRect());
 // Capture the currently painted frame before cancelling interrupted animations.
 tiles.forEach(el=>{el.getAnimations().forEach(a=>a.cancel());el.style.transform='';el.classList.toggle('selected',el.dataset.id===id);el.setAttribute('aria-pressed',String(el.dataset.id===id));el.querySelector('.wall-copy span').textContent=el.dataset.id===id?'正在聚焦 · 点击查看':' ';});
 const after=tiles.map(el=>el.getBoundingClientRect());
 if(!motionReduced())tiles.forEach((el,i)=>{const a=before[i],b=after[i];if(!a.width||!b.width)return;el.animate([{transform:`translate(${a.x-b.x}px,${a.y-b.y}px) scale(${a.width/b.width},${a.height/b.height})`},{transform:'translate(0,0) scale(1,1)'}],{duration:540,easing:'cubic-bezier(.2,.75,.2,1)'}).finished.catch(()=>{});});
 const selected=tiles.find(el=>el.dataset.id===id);if(selected){const box=after[tiles.indexOf(selected)],viewport=shell.getBoundingClientRect();moveWallCamera(shell,shell.scrollLeft+box.left-viewport.left-(shell.clientWidth-box.width)/2,shell.scrollTop+box.top-viewport.top-(shell.clientHeight-box.height)/2);}
 return epoch;
}
function installWallMotion(shell){shell.addEventListener('wheel',stopWallCamera,{passive:true});shell.addEventListener('pointerdown',stopWallCamera,{passive:true});shell.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(e.key))stopWallCamera();});enterItems(shell,'.wall button');}
document.addEventListener('fullscreenchange',()=>{const shell=document.querySelector('.wall-shell');if(shell)enterSurface(shell.querySelector('.wall'));});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches){stopWallCamera();document.getAnimations().forEach(a=>{try{a.finish();}catch{a.cancel();}});}});
