// Runs only in the isolated official-site window; submit is an explicit separate action.
async function officialPageAction(action, data) {
  const visible = e => e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  if(action==='share-status'){
    const root=[...document.querySelectorAll('[role=dialog]')].filter(visible).at(-1);
    const text=root?.innerText||'';
    const submit=root&&[...root.querySelectorAll('button')].find(e=>e.textContent.trim()==='提交投稿');
    const completed=/(上传完成|上传成功)|(^|\n)\s*已上传\s*($|\n)/m.test(text)&&text.includes(data.filename)&&!/上传失败|上传中|正在上传/.test(text);
    const buttons=[...document.querySelectorAll('button')].filter(visible);
    const authenticated=buttons.some(e=>e.getAttribute('aria-label')==='账号菜单')||!!submit;
    return {authenticated,login:!authenticated&&buttons.some(e=>/^(登录|登录后继续)$/.test(e.textContent.trim())),dialog:!!root,failed:/上传失败|文件上传出错/.test(text),ready:!!(completed&&submit&&!submit.disabled&&submit.getAttribute('aria-disabled')!=='true'),progress:root?.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),success:/投稿成功|提交成功|资源已提交/.test(document.body.innerText),resource:location.pathname.match(/^\/resource\/(\d+)$/)?.[1]||null};
  }
  if(action==='share-open'){
    if(location.origin!=='https://www.letmoe.com'||location.pathname!==`/game/${data.workId}`)throw new Error('请先登录并进入投稿作品');
    if([...document.querySelectorAll('[role=dialog]')].some(visible))return true;
    const buttons=[...document.querySelectorAll('button')].filter(e=>visible(e)&&/^(投稿资源|发布资源)$/.test(e.textContent.trim()));
    if(buttons.length!==1)throw new Error('未能唯一识别发布资源入口，页面可能尚未加载完成或结构已变化');buttons[0].click();return true;
  }
  const dialogs = [...document.querySelectorAll('[role=dialog]')].filter(visible);
  const root = dialogs.at(-1);
  if (!root) throw new Error('请先在官方页面打开创建密钥或投稿对话框');
  const field = name => {
    const byLabel = [...root.querySelectorAll('label')].find(e => e.textContent.trim().startsWith(name));
    const target = byLabel?.control || (byLabel?.htmlFor && document.getElementById(byLabel.htmlFor));
    return target || [...root.querySelectorAll('input,textarea,[role=combobox]')].find(e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ')).trim().startsWith(name));
  };
  if(action==='share-submit'){
    if(location.origin!=='https://www.letmoe.com'||location.pathname!==`/game/${data.workId}`||field('标题')?.value!==data.title)throw new Error('投稿作品或标题发生变化，已停止自动提交');
    const status=await officialPageAction('share-status',data);
    if(!status.ready)throw new Error('官方上传尚未确认完成');
    const submit=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()==='提交投稿');submit.click();return true;
  }
  const fill = (e, text) => {
    if (!e || !visible(e)) throw new Error('页面字段发生变化，请在官方表单中手动填写');
    if (e.isContentEditable) { e.focus(); e.textContent=text; e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text})); }
    else { const proto = e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(e,text); e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true})); }
  };
  if(action==='key-fill') {
    if(location.origin!=='https://developer.nextmoe.dev' || !/^\/dashboard\/apps\/[^/]+\/?$/.test(location.pathname)) throw new Error('请进入你自己的应用详情');
    fill(field('密钥名称'), data.name);
    const check=[...root.querySelectorAll('[role=checkbox],input[type=checkbox]')].find(e=>(e.getAttribute('aria-label')||e.closest('label')?.textContent||document.getElementById(e.getAttribute('aria-labelledby'))?.textContent||e.parentElement.textContent).includes('catalog:read'));
    if(!check)throw new Error('请手动选择 catalog:read，勿额外勾选不需要的权限');
    if(!(check.checked || check.getAttribute('aria-checked')==='true'))check.click();
    return '名称与目录读取权限已填写；请核对权限后在官方页面生成密钥。';
  }
  if(action==='key-read') {
    if(location.origin!=='https://developer.nextmoe.dev' || !/^\/dashboard\/apps\/[^/]+\/?$/.test(location.pathname)) throw new Error('当前不是官方应用详情');
    const keys=[...new Set(root.innerText.match(/nmk_(?:live|test)_[A-Za-z0-9_-]+/g)||[])];
    if(keys.length!==1)throw new Error('请在官方页面生成密钥，保持“密钥已生成”对话框打开');
    return keys[0];
  }
  if(action==='share-fill') {
    if(location.origin!=='https://www.letmoe.com' || location.pathname!==`/game/${data.workId}`)throw new Error('当前作品页面与投稿草稿不一致');
    const title=field('标题');
    const editors=[...root.querySelectorAll('[contenteditable=true],textarea')].filter(visible);
    if(editors.length!==1)throw new Error('无法唯一定位资源说明，请切换到预览编辑模式');
    fill(title,data.title);fill(editors[0],data.description);
    const source=field('来源');
    if(!source)throw new Error('标题和说明已填写；来源字段无法定位，请手动选择“转载”');
    if(source.tagName==='SELECT'){
      const option=[...source.options].find(o=>o.textContent.trim()==='转载');
      if(!option)throw new Error('请在官方表单手动选择转载来源');
      source.value=option.value;source.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(source.textContent.trim()!=='转载'){
      source.click();let option;
      for(let i=0;i<30;i++){
        const choices=[...document.querySelectorAll('[role=option]')].filter(e=>visible(e)&&e.textContent.trim()==='转载');
        if(choices.length===1){option=choices[0];break;}
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(!option)throw new Error('标题和说明已填写；请选择来源“转载”后继续');
      option.click();
    }
    if(data.launch){
      const mode=field('启动方式');if(!mode)throw new Error('无法定位启动方式');
      if(!mode.textContent.includes('打开某个文件')){
        if(mode.tagName==='SELECT'){const o=[...mode.options].find(o=>o.textContent.trim()==='打开某个文件');if(!o)throw new Error('启动方式选项变化');mode.value=o.value;mode.dispatchEvent(new Event('change',{bubbles:true}));}
        else{mode.click();let choice;for(let i=0;i<30;i++){choice=[...document.querySelectorAll('[role=option]')].find(e=>visible(e)&&e.textContent.trim()==='打开某个文件');if(choice)break;await new Promise(r=>setTimeout(r,50));}if(!choice)throw new Error('无法选择文件启动方式');choice.click();}
      }
      let launch;for(let i=0;i<30;i++){launch=field('启动文件');if(launch&&visible(launch))break;await new Promise(r=>setTimeout(r,50));}fill(launch,data.launch);
    }
    return '标题、说明和转载来源已填写。请核对语言、平台和运行环境，再选择上传。';
  }
  throw new Error('未知操作');
}
const hosts = new Set(['www.letmoe.com','developer.nextmoe.dev','account.nextmoe.com']);
function allowedOfficialUrl(value){try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && hosts.has(u.hostname);}catch{return false;}}
function shareDraft(input){
  const workId=String(input.workId||'').trim();
  if(!/^\d+$/.test(workId))throw new Error('请填写 NextMoe 作品数字 ID');
  const title=String(input.title||'').trim().slice(0,200);
  if(!title)throw new Error('请填写资源标题');
  const description=String(input.description||'').trim().slice(0,10000);
  if(!description)throw new Error('请填写资源说明');
  return {workId,title,description,origin:'repost'};
}
module.exports={officialPageAction,allowedOfficialUrl,shareDraft};
