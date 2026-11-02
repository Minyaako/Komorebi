class ResourceStatus {
 constructor({store,api,hasKey,now=Date.now}){Object.assign(this,{store,api,hasKey,now});this.pending=new Map();this.failed=new Map();}
 async check(g,{force=false}={}){if(!g.workId)return {status:'unlinked'};const key=String(g.workId),cached=g.directLinkCheck;
 if(!force&&(g.dismissUploadSuggestion||this.store.value.settings.hideUploadSuggestions))return cached?.workId===key?cached:{status:'dismissed'};
 if(!force&&cached?.workId===key&&this.now()-cached.checkedAt<86400000)return cached;
 if(!this.hasKey())return {status:'no-key'};
 if(!force&&this.failed.get(key)>this.now())return {status:'unavailable'};
 if(this.pending.has(key))return this.pending.get(key);
 const task=(async()=>{try{let cursor='',status='none';const seen=new Set();for(let i=0;i<20;i++){const r=await this.api.resources(key,true,cursor);if((r.items||[]).some(x=>x.direct_download===true)){status='hosted';break;}cursor=r.next_cursor;if(!cursor)break;if(seen.has(cursor)||i===19){status='partial';break;}seen.add(cursor);}const result={workId:key,status,checkedAt:this.now()};g.directLinkCheck=result;this.store.save();return result;}catch(e){this.failed.set(key,this.now()+300000);throw e;}finally{this.pending.delete(key);}})();this.pending.set(key,task);return task;
 }
}
module.exports={ResourceStatus};
