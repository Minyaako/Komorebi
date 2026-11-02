const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
class Playtime {
 constructor({store,api,changed=()=>{},now=Date.now}){
  Object.assign(this,{store,api,changed,now});this.running=new Map();this.pending=null;this.paused=false;
  store.value.playtime ||= {entries:{},synced:{}};
  // Checkpoints are durable; never count downtime after a crash/restart.
  this.timer=setInterval(()=>{try{this.checkpoint();}catch(e){this.syncError='本机记录保存失败：'+e.message;this.changed();}},15000);this.timer.unref?.();
  this.syncTimer=setInterval(()=>this.sync().catch(()=>{}),300000);this.syncTimer.unref?.();
 }
 get data(){return this.store.value.playtime;}
 entry(game,owner){const key=JSON.stringify([owner||'',game.id,game.workId||'']);return this.data.entries[key] ||= {gameId:game.id,workId:game.workId||null,title:game.title,owner:owner||'',seconds:0,days:{}};}
 start(game,child){
  if(this.running.has(game.id))throw new Error('该游戏正在计时');
  const session={entry:this.entry(game,this.api.profile?.id),last:this.now(),child};this.running.set(game.id,session);
  child.once('exit',()=>this.stop(game.id));child.once('error',()=>this.stop(game.id));this.store.save();this.changed();
 }
 checkpoint(){
  const end=this.now();let dirty=false;
  for(const s of this.running.values()){
   let start=s.last;s.last=end;
   // A long event-loop/sleep gap is not reliable play evidence.
   if(this.paused||end<=start||end-start>60000)continue;
   while(start<end){const d=new Date(start),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),until=Math.min(end,next),seconds=(until-start)/1000,key=dayKey(d);s.entry.seconds+=seconds;s.entry.days[key]=(s.entry.days[key]||0)+seconds;start=until;dirty=true;}
  }
  if(dirty){this.store.save();this.changed();}
 }
 stop(id){if(!this.running.has(id))return;this.checkpoint();this.running.delete(id);this.changed();this.sync().catch(()=>{});}
 suspend(){this.checkpoint();this.paused=true;}
 resume(){for(const s of this.running.values())s.last=this.now();this.paused=false;}
 snapshot(){return {entries:Object.values(this.data.entries).map(({owner,...e})=>e),running:[...this.running.keys()],syncError:this.syncError||'',lastSynced:this.lastSynced||null};}
 async sync({includeGuest=false}={}){
  if(this.pending)return this.pending;
  const owner=this.api.profile?.id;if(!owner)return {offline:true};
  const generation=this.api.generation;
  if(includeGuest){
   for(const [oldKey,e]of Object.entries(this.data.entries))if(!e.owner){
    const key=JSON.stringify([owner,e.gameId,e.workId||'']),existing=this.data.entries[key];
    if(existing){existing.seconds+=e.seconds;for(const [day,seconds]of Object.entries(e.days))existing.days[day]=(existing.days[day]||0)+seconds;for(const s of this.running.values())if(s.entry===e)s.entry=existing;}
    else {e.owner=owner;this.data.entries[key]=e;}
    delete this.data.entries[oldKey];
   }
   this.store.save();
  }
  this.pending=(async()=>{
   this.checkpoint();const totals={};for(const e of Object.values(this.data.entries))if(e.owner===owner&&e.workId)totals[e.workId]=(totals[e.workId]||0)+e.seconds;
   let count=0;
   for(const [workId,seconds]of Object.entries(totals)){
    const minutes=Math.floor(seconds/60),key=JSON.stringify([owner,workId]);
    if(minutes<1||this.data.synced[key]===minutes)continue;
    if(this.api.generation!==generation||this.api.profile?.id!==owner)throw new Error('账号已切换，时长留待原账号同步');
    await this.api.putPlaytime(workId,minutes);
    if(this.api.generation!==generation)throw new Error('账号已切换');
    this.data.synced[key]=minutes;this.store.save();count++;
   }
   this.syncError='';this.lastSynced=this.now();this.changed();return {count};
  })().catch(e=>{this.syncError=e.message;this.changed();throw e;}).finally(()=>{this.pending=null;});return this.pending;
 }
 close(){this.checkpoint();clearInterval(this.timer);clearInterval(this.syncTimer);this.running.clear();}
}
module.exports={Playtime,dayKey};
