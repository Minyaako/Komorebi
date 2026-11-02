// Personal data is fetched on entry/refresh, never on download progress pulses.
let personalKey='',personalOwner='',personalEpoch=0;
const personalSections={'work-states':'游玩状态',playtimes:'游玩时长',ratings:'我的评分'};
let personalRecordsCache={};
function personalSignature(){return JSON.stringify([state.loggedIn,state.profile,state.profileStatus,state.loginPending,state.games.map(g=>[g.id,!!g.dir,g.state])]);}
function updatePersonalPage(){
 const owner=state.loggedIn?(state.profile?.id||'authorized'):'';
 if(owner!==personalOwner){personalOwner=owner;personalEpoch++;personalRecordsCache={};}
 if(page==='profile'&&personalKey!==personalSignature())renderPersonalPage();
}
function renderPersonalPage(){
 personalKey=personalSignature();const p=state.loggedIn?state.profile:null;
 $('#main').innerHTML=`<div class="personal-page"><header class="profile-heading"><div class="avatar large">${p?.picture?`<img src="${esc(p.picture)}" alt="头像" referrerpolicy="no-referrer">`:esc((p?.name||'旅').slice(0,1))}</div><div><p class="muted">个人资料</p><h1>${esc(p?.name||(state.loggedIn?'NextMoe 已授权':'本地访客'))}</h1><p class="muted">${p?.id?'账号 ID · '+esc(p.id):'在这里收藏故事，记录自己的游玩旅程。'}</p></div></header><div class="actions">${state.loggedIn?'<button data-action="prod-profile">刷新资料</button><button data-action="prod-logout">退出账号</button>':'<button class="primary" data-action="prod-login">登录 NextMoe</button>'}<button data-action="connection-settings">账号与连接设置</button>${state.loginPending?'<button data-action="prod-cancel-login">取消授权</button>':''}</div>${state.profileStatus==='error'?'<p class="error">账号资料加载失败，可以点击刷新重试。</p>':''}<section class="personal-local"><h2>本机游戏库</h2><div class="personal-stats">${[['已入库',state.games.length],['已安装',state.games.filter(g=>g.dir).length],['在玩',state.games.filter(g=>g.state==='doing').length],['已完成',state.games.filter(g=>g.state==='done').length]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</div></section><section><h2>NextMoe 个人记录</h2><p class="muted">${state.loggedIn?'来自官方账号；本机记录需同步后才会出现在这里。':'登录后查看官方账号的游玩状态、累计时长与评分。'}</p>${state.loggedIn?`<div class="personal-records">${Object.entries(personalSections).map(([key,label])=>`<section class="personal-section"><h3>${label}</h3><div id="personal-${key}" aria-live="polite"></div></section>`).join('')}</div>`:''}</section><p class="muted personal-footnote">收藏夹需要额外的 folder:read 授权；官方还提供关注厂商、屏蔽标签与隐私设置接口，后续可接入。</p></div>`;
 if(state.loggedIn)for(const section of Object.keys(personalSections)){paintPersonalRecords(section);if(!personalRecordsCache[section])loadPersonalRecords(section);}
}
function paintPersonalRecords(section){
 const el=$('#personal-'+section);if(!el)return;
 const data=personalRecordsCache[section];
 if(!data){el.innerHTML='<p class="muted">正在读取…</p>';return;}
 const items=data.items||[];
 el.innerHTML=`${data.total!=null?`<p class="muted">共 ${esc(data.total)} 部 · 已显示 ${items.length} 部</p>`:''}${items.map(x=>{const local=state.games.find(g=>String(g.workId)===String(x.work_id));const value=section==='work-states'?(names[x.state]||x.state):section==='playtimes'?`${Math.floor(x.minutes/60)} 小时 ${x.minutes%60} 分钟`:`${x.overall??'未评分'} / 10`;return `<article class="personal-record"><button data-personal-work="${esc(x.work_id)}">${esc(x.title||local?.title||'作品 '+x.work_id)}</button><span>${esc(value)}</span>${section==='ratings'&&x.short_summary?`<details><summary>${x.spoiler_level&&x.spoiler_level!=='none'?'展开短评（含剧透）':'展开短评'}</summary><p>${esc(x.short_summary)}</p></details>`:''}</article>`;}).join('')}${!items.length&&!data.error&&!data.loading?'<p class="muted">还没有记录。</p>':''}${data.error?`<p class="error">${esc(data.error)}</p>`:''}${data.loading?'<p class="muted">正在读取…</p>':''}${!data.loading&&(data.next_cursor||data.error)?`<button data-personal-more="${section}">${data.error?'重试':'加载更多'}</button>`:''}`;
}
async function loadPersonalRecords(section,more=false,force=false){
 const old=personalRecordsCache[section];if(old?.loading)return;
 const epoch=personalEpoch;
 personalRecordsCache[section]={...(more?old:{}),loading:true};paintPersonalRecords(section);
 try{const result=await api('personalRecords',{section,cursor:more?old?.next_cursor:undefined,force});if(epoch!==personalEpoch)return;personalRecordsCache[section]={...result,items:[...(more?old?.items||[]:[]),...result.items]};}
 catch(e){if(epoch!==personalEpoch)return;personalRecordsCache[section]={...(more?old:{}),error:e.message};}
 if(page==='profile')paintPersonalRecords(section);
}
async function refreshPersonalPage(){
 personalEpoch++;personalRecordsCache={};
 const results=await Promise.allSettled([api('profile',{force:true}),...Object.keys(personalSections).map(s=>loadPersonalRecords(s,false,true))]);
 updatePersonalPage();if(results[0].status==='rejected')throw results[0].reason;
}
document.addEventListener('click',e=>{const work=e.target.closest('[data-personal-work]');if(work){workDetail(work.dataset.personalWork,true);return;}const more=e.target.closest('[data-personal-more]');if(more){const s=more.dataset.personalMore;loadPersonalRecords(s,!!personalRecordsCache[s]?.next_cursor);}});
