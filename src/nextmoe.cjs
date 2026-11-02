const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const ORIGIN = 'https://api.nextmoe.dev';
const AUTH = 'https://account.nextmoe.com/api/v1/oauth/';
const id = x => { if(!/^\d+$/.test(String(x))) throw new Error('无效的作品或资源 ID'); return String(x); };
class NextMoe {
  constructor({ settings, vault, openExternal, request = fetch, onChange=()=>{} }) {
    Object.assign(this,{settings,vault,openExternal,request,onChange}); this.cache=new Map();this.pending=new Map();this.cacheEpoch=0; this.generation=0;this.profile=null;
  }
  invalidateCache(){this.cacheEpoch++;this.cache.clear();this.pending.clear();}
  async cached(key,ttl,load){
    const epoch=this.cacheEpoch,old=this.cache.get(key);if(old&&Date.now()-old.time<ttl)return old.value;
    if(this.pending.has(key))return this.pending.get(key);
    const pending=Promise.resolve().then(load).then(value=>{if(epoch===this.cacheEpoch){if(this.cache.size>=150)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{time:Date.now(),value});}return value;}).finally(()=>{if(this.pending.get(key)===pending)this.pending.delete(key);});
    this.pending.set(key,pending);return pending;
  }
  async userInfo({force=false}={}){
    if(force)this.cache.delete('userinfo');
    if(!this.vault.get('refreshToken'))return null;
    const generation=this.generation;this.profileStatus='loading';this.onChange();
    try {const result=await this.cached('userinfo',300000,async()=>{
      const token=await this.accessToken();if(!token)return null;
      const b=await this.json(AUTH+'userinfo',{headers:{Authorization:'Bearer '+token}});
      let picture=null;try{const u=new URL(b.picture);if(u.protocol==='https:'&&!u.username&&!u.password)picture=u.href;}catch{}
      return {id:String(b.sub||''),name:String(b.name||b.preferred_username||'NextMoe 用户').slice(0,100),picture};
    });
    if(generation!==this.generation||!this.vault.get('refreshToken'))return null;
    this.profile=result;this.profileStatus='ready';this.onChange();return result;
    }catch(e){if(generation===this.generation){this.profileStatus='error';this.onChange();}throw e;}
  }
  async personalRecords({section='work-states',cursor='',force=false}={}) {
    if(!['work-states','playtimes','ratings'].includes(section))throw new Error('未知的个人记录类型');
    if(!this.vault.get('refreshToken'))throw new Error('请先登录 NextMoe');
    const generation=this.generation;
    const params=new URLSearchParams({limit:'20',include_total:'true'});
    if(cursor)params.set('cursor',String(cursor).slice(0,512));
    const key='personal:'+section+'?'+params;
    if(force)this.cache.delete(key);
    const result=await this.cached(key,300000,async()=>{
      const data=await this.api('/v2/me/'+section+'?'+params,{kind:'user'});
      const ids=[...new Set((data.items||[]).map(x=>String(x.work_id)).filter(x=>/^\d+$/.test(x)))];
      let works=[];
      if(ids.length){try{works=(await this.api('/v2/catalog/works?ids='+ids.join(',')+'&include=titles&nsfw=true')).items||[];}catch{}}
      const titles=Object.fromEntries(works.map(w=>[w.id,w.display_name||w.name||w.titles?.[0]?.title||'']));
      return {items:(data.items||[]).map(x=>({work_id:x.work_id,title:titles[x.work_id]||'',state:x.state,completion:x.completion,minutes:x.minutes,overall:x.overall,recommend:x.recommend,short_summary:x.short_summary,spoiler_level:x.spoiler_level})),total:data.total,next_cursor:data.next_cursor||null};
    });
    if(generation!==this.generation)throw new Error('账号已切换，请重新加载');
    return result;
  }
  async json(url, options={}) {
    const r=await this.request(url,{...options,signal:AbortSignal.timeout(25000),headers:{'User-Agent':'KomorebiDemo/0.1 (personal desktop prototype)','Accept':'application/json',...options.headers}});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) {
      const message=r.status===429?`请求较多，请在 ${r.headers.get('Retry-After') || '60'} 秒后重试`:r.status===403?'当前凭据缺少此接口权限，请检查 scope':r.status===401?'登录已失效或凭据不正确，请重新登录／配置':body.detail || body.error_description || body.title || `请求失败 ${r.status}`;
      const e=new Error(message); e.status=r.status; throw e;
    }
    return body;
  }
  async accessToken() {
    const refresh=this.vault.get('refreshToken');
    if(!refresh) return null;
    if(this.token && this.expires>Date.now()+30000) return this.token;
    const generation=this.generation;
    if(!this.refreshing) this.refreshing=(async()=>{
      try {
        const b=await this.json(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:this.settings().clientId,refresh_token:refresh}).toString()});
        if(generation!==this.generation) throw new Error('账号已退出或切换，请重新登录');
        this.accept(b,true); return this.token;
      } catch(e) { if(generation===this.generation && [400,401].includes(e.status)) this.logout(); throw e; }
      finally { if(generation===this.generation) this.refreshing=null; }
    })();
    return this.refreshing;
  }
  accept(b,refresh=false) {
    if(!b.access_token || !b.refresh_token) throw new Error('授权响应缺少令牌');
    this.vault.set('refreshToken',b.refresh_token);
    if(!refresh){this.generation++;this.profile=null;}
    this.token=b.access_token; this.expires=Date.now()+Number(b.expires_in || 900)*1000;
    this.invalidateCache(); this.onChange();
  }
  cancelLogin() { this.abortLogin?.(); }
  logout() { this.cancelLogin(); this.generation++; this.refreshing=null; this.token=null; this.expires=0;this.profile=null; this.invalidateCache(); this.vault.set('refreshToken',null); this.onChange(); }
  async api(route,{kind='catalog',method='GET',body}={}) {
    const headers={};
    if(kind==='app') {
      const key=this.vault.get('apiKey');
      if(!key) throw new Error('请先在设置中配置你自己的 NextMoe 应用密钥');
      headers.Authorization='Bearer '+key;
    } else {
      const token=await this.accessToken();
      if(token) headers.Authorization='Bearer '+token;
      else if(kind==='user') throw new Error('请先登录 NextMoe');
    }
    if(body) headers['Content-Type']='application/json';
    return this.json(ORIGIN+route,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  }
  searchFamily({object,query='',cursor='',nsfw=false,limit=20}={}){
    if(!['work','tag','company','character','credit_name','series','engine','trait'].includes(object))throw new Error('未知搜索类别');
    const p=new URLSearchParams({object,q:String(query).trim().slice(0,200),limit:String(Math.min(20,Math.max(1,Number(limit)||20))),nsfw:String(!!nsfw),include_total:'true',locale:'zh'});if(cursor)p.set('cursor',String(cursor).slice(0,512));
    const route='/v2/catalog/search?'+p;return this.cached(route,300000,()=>this.api(route));
  }
  async catalogEntity({object,id:entityId,cursor='',nsfw=false,more=false}={}){
    const families={company:'companies',character:'characters',credit_name:'credit-names',series:'series',engine:'engines',trait:'traits'};
    if(!families[object])throw new Error('未知目录实体');const safeId=id(entityId),suffix=new URLSearchParams({nsfw:String(!!nsfw),limit:'48',include_total:'true'});if(cursor)suffix.set('cursor',String(cursor).slice(0,512));
    let route;
    if(object==='character')route=`/v2/catalog/characters/${safeId}/appearances?${suffix}`;
    else if(object==='credit_name')route=`/v2/catalog/credit-names/${safeId}/credits?${suffix}`;
    else if(object==='trait'){suffix.set('trait_id',safeId);route='/v2/catalog/characters?'+suffix;}
    else{suffix.set(object+'_id',safeId);suffix.set('include','titles,ratings');route='/v2/catalog/works?'+suffix;}
    const detailRoute=`/v2/catalog/${families[object]}/${safeId}?view=full&nsfw=${!!nsfw}`;
    const [detail,related]=await Promise.allSettled([more?Promise.resolve(null):this.cached(detailRoute,300000,()=>this.api(detailRoute)),this.cached(route,180000,()=>this.api(route))]);
    return {detail:detail.status==='fulfilled'?detail.value:null,detailError:detail.status==='rejected'?detail.reason.message:null,related:related.status==='fulfilled'?{...related.value,items:(related.value.items||[]).map(x=>x.work||x)}:null,relatedError:related.status==='rejected'?related.reason.message:null};
  }
  async search({query='',tags='',exclude='',cursor='',nsfw=false,sort='',released_after='',released_before='',directOnly=false}={}) {
    const p=new URLSearchParams({limit:'48',include:'titles,companies,tags,ratings',include_total:'true',nsfw:String(!!nsfw)});
    if(query.trim()) p.set('q',query.trim().slice(0,200));
    for(const [key,val] of [['tag_id',tags],['exclude_tag_tree',exclude]]) if(val) { if(!/^\d+(,\d+)*$/.test(val)) throw new Error('标签 ID 请用英文逗号分隔'); p.set(key,val); }
    for(const [key,value] of Object.entries({released_after,released_before})){if(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('日期格式无效');p.set(key,value);}}
    if(cursor) p.set('cursor',cursor);
    if(['rating_bangumi','rating_vndb','rating_nextmoe','rating_dlsite','rating_erogamescape','popularity','released_desc','released_asc'].includes(sort)) p.set('sort',sort);
    const route='/v2/catalog/works?'+p;
    const result=await this.cached(route,120000,()=>this.api(route));
    if(!directOnly)return result;
    const visible=await require('./hosted-search.cjs').filterHosted(this,result.items||[],nsfw);
    return {...result,items:visible,total:undefined,filtered:true};
  }
  detail(workId, nsfw) {const route=`/v2/catalog/works/${id(workId)}?view=full&include=releases,playtimes,companies,credits,series&nsfw=${!!nsfw}`;return this.cached(route,300000,()=>this.api(route)); }
  async validateKey(value) {
    const key=String(value||'').trim();
    if(!/^nmk_(live|test)_[A-Za-z0-9_-]+$/.test(key))throw new Error('请粘贴完整的 nmk_live_ 或 nmk_test_ 应用密钥');
    // Read metadata only: /file would count a download and must not be prefetched.
    await this.json(ORIGIN+'/v2/letmoe/works?limit=1',{headers:{Authorization:'Bearer '+key}});
    return key;
  }
  tags(input={}) {return this.cached('tags:'+JSON.stringify(input),300000,()=>this.loadTags(input));}
  async loadTags(input={}) {
    const {query='',cursor='',nsfw=false}=typeof input==='string'?{query:input}:input;
    const p=new URLSearchParams({object:'tag',q:String(query).trim().slice(0,200),locale:'zh',limit:'50',nsfw:String(!!nsfw)});
    if(cursor)p.set('cursor',cursor);
    // /tags is an inventory endpoint: q is ignored there. Search canonical names
    // and aliases first, then hydrate counts and sexual flags by canonical ID.
    const hits=await this.api('/v2/catalog/search?'+p);
    const ids=[...new Set((hits.items||[]).filter(t=>t.target_object==='tag' && /^\d+$/.test(t.id)).map(t=>t.id))];
    if(!ids.length)return {items:[],next_cursor:hits.next_cursor||null};
    const details=await this.api('/v2/catalog/tags?'+new URLSearchParams({ids:ids.join(','),nsfw:String(!!nsfw)}));
    const byId=new Map((details.items||[]).map(t=>[t.id,t]));
    return {items:ids.map(id=>byId.get(id)).filter(t=>t && (nsfw || !t.is_sexual)),next_cursor:hits.next_cursor||null};
  }
  resources(workId, nsfw, cursor='') {const route=`/v2/letmoe/works/${id(workId)}/resources?limit=100&nsfw=${!!nsfw}${cursor?'&cursor='+encodeURIComponent(cursor):''}`;return this.cached(route,30000,()=>this.api(route,{kind:'app'})); }
  file(resourceId, nsfw) { return this.api(`/v2/letmoe/resources/${id(resourceId)}/file?nsfw=${!!nsfw}`,{kind:'app'}); }
  async putPlaytime(workId,minutes){
    if(!Number.isInteger(minutes)||minutes<0||minutes>60000)throw new Error('官方时长范围为 0–60000 分钟；完整时长仍保存在本机');
    const result=await this.api(`/v2/me/playtimes/${id(workId)}`,{kind:'user',method:'PUT',body:{minutes}});
    for(const key of this.cache.keys())if(key.startsWith('personal:playtimes'))this.cache.delete(key);
    return result;
  }
  async sync(game) {
    if(!game.workId) throw new Error('此游戏还未关联 NextMoe 作品');
    // Narrow writes avoid work-records PUT clearing unrelated playtime or ratings.
    const workId=id(game.workId);
    await this.api(`/v2/me/work-states/${workId}`,{kind:'user',method:'PUT',body:{state:game.state}});
    if(game.score) {
      let existing={};
      try { existing=await this.api(`/v2/me/ratings/${workId}`,{kind:'user'}); } catch(e) { if(e.status!==404) throw e; }
      const rating={overall:game.score};
      for(const k of ['recommend','aspect_scores','spoiler_level','short_summary']) if(existing[k]!=null) rating[k]=existing[k];
      try { await this.api(`/v2/me/ratings/${workId}`,{kind:'user',method:'PUT',body:rating}); }
      catch(e) { throw new Error('游玩状态已同步，但评分失败：'+e.message); }
    }
    return {ok:true};
  }
  async login() {
    if(this.loginPending) throw new Error('登录窗口已打开，请在木漏日授权窗口中完成授权');
    const clientId=this.settings().clientId;
    if(!clientId) throw new Error('请先在设置中填写 NextMoe OAuth Client ID');
    if(this.refreshing) await this.refreshing.catch(()=>{});
    if(this.loginPending) throw new Error('登录窗口已打开');
    this.loginPending=true; this.onChange();
    const generation=this.generation;
    const verifier=randomBytes(48).toString('base64url'), state=randomBytes(32).toString('base64url');
    let server,timer,closeAuthorization;
    try {
      return await new Promise((resolve,reject)=>{
        let consumed=false,settled=false;
        const finish=(e,value)=>{if(settled)return;settled=true;clearTimeout(timer);server?.close(); e?reject(e):resolve(value);};
        this.abortLogin=()=>finish(new Error('已取消本次登录'));
        server=http.createServer(async(req,res)=>{
          const u=new URL(req.url,'http://127.0.0.1');
          if(u.pathname!=='/callback'){res.writeHead(404).end();return;}
          const received=u.searchParams.get('state') || '';
          const receivedBytes=Buffer.from(received),expectedBytes=Buffer.from(state);
          if(receivedBytes.length!==expectedBytes.length || !timingSafeEqual(receivedBytes,expectedBytes)) {res.writeHead(400).end('Invalid state');return;}
          if(consumed){res.writeHead(409).end('Already received');return;}
          if(u.searchParams.has('error')) {res.writeHead(200).end('Authorization cancelled.');finish(new Error('你取消了授权'));return;}
          if(!u.searchParams.get('code')) {res.writeHead(400).end('Missing code');return;}
          consumed=true;
          const reply=(status,message)=>{if(!res.writableEnded)res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end(message);};
          try {
            const b=await this.json(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,redirect_uri:redirect,code:u.searchParams.get('code'),code_verifier:verifier}).toString()});
            if(settled || generation!==this.generation){reply(400,'本次登录已取消或超时，请返回木漏日重新登录。');return;}
            this.accept(b);reply(200,'NextMoe 登录成功，授权已加密保存在本机。请返回木漏日。');finish(null,{ok:true});
          } catch(e) {reply(500,'登录未完成，请返回木漏日查看错误并重试。');finish(e);}
        });
        let redirect;
        server.on('error',finish);
        server.listen(0,'127.0.0.1',async()=>{
          redirect=`http://127.0.0.1:${server.address().port}/callback`;
          const params=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'openid profile catalog:read',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
          try {const close=await this.openExternal(AUTH+'authorize?'+params);if(typeof close==='function'){if(settled)close();else closeAuthorization=close;}} catch(e){finish(e);}
        });
        timer=setTimeout(()=>finish(new Error('登录等待超时，请重试')),600000);
      });
    } finally {closeAuthorization?.();this.loginPending=false;this.abortLogin=null;server?.close();clearTimeout(timer);this.onChange();}
  }
}
module.exports={ NextMoe };
