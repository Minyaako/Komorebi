const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Playtime,dayKey}=require('../src/playtime.cjs');
function fixture(at=new Date(2026,10,1,23,59,45).getTime()) {let time=at,calls=[];const store={value:{},save(){}},api={profile:{id:'a'},generation:0,putPlaytime:async(id,m)=>calls.push([id,m])};const tracker=new Playtime({store,api,now:()=>time});return {tracker,store,api,calls,advance:n=>time+=n};}
test('elapsed time splits at local midnight, skips suspend and long gaps; restart does not count downtime',()=>{
 const f=fixture(),cp=new EventEmitter();try{f.tracker.start({id:'g',workId:'1',title:'Game'},cp);f.advance(30000);f.tracker.checkpoint();const e=f.tracker.snapshot().entries[0];assert.equal(e.seconds,30);assert.equal(e.days['2026-11-01'],15);assert.equal(e.days['2026-11-02'],15);f.tracker.checkpoint();assert.equal(e.seconds,30);assert.throws(()=>f.tracker.start({id:'g'},cp));f.tracker.suspend();f.advance(3600000);f.tracker.resume();f.advance(10000);f.tracker.checkpoint();assert.equal(f.tracker.snapshot().entries[0].seconds,40);f.advance(120000);f.tracker.checkpoint();assert.equal(f.tracker.snapshot().entries[0].seconds,40);f.tracker.close();const again=new Playtime({store:f.store,api:f.api});assert.equal(again.running.size,0);assert.equal(again.snapshot().entries[0].seconds,40);again.close();}finally{f.tracker.close();}
});
test('absolute-minute retries are idempotent, owner isolation and explicit guest adoption',async()=>{
 const f=fixture();try{const cp=new EventEmitter();f.tracker.start({id:'g',workId:'1',title:'G'},cp);f.advance(60000);f.tracker.checkpoint();await f.tracker.sync();await f.tracker.sync();assert.deepEqual(f.calls,[['1',1]]);f.advance(60000);f.tracker.checkpoint();f.api.putPlaytime=async()=>{throw new Error('offline');};await assert.rejects(f.tracker.sync());assert.equal(f.tracker.snapshot().entries[0].seconds,120);f.api.putPlaytime=async(id,m)=>f.calls.push([id,m]);await f.tracker.sync();assert.deepEqual(f.calls,[['1',1],['1',2]]);f.api.profile={id:'b'};f.api.generation++;await f.tracker.sync();assert.equal(f.calls.length,2);f.api.profile=null;f.tracker.start({id:'guest',workId:'2',title:'Guest'},new EventEmitter());f.advance(60000);f.tracker.checkpoint();f.api.profile={id:'b'};await f.tracker.sync();assert.equal(f.calls.length,2);await f.tracker.sync({includeGuest:true});assert.deepEqual(f.calls[2],['2',1]);}finally{f.tracker.close();}
});
test('process exit finishes session and auto syncs, no elapsed time after exit',async()=>{
 const f=fixture(),cp=new EventEmitter();try{f.tracker.start({id:'g',workId:'1'},cp);f.advance(60000);cp.emit('exit',0);await f.tracker.pending;assert.equal(f.tracker.running.size,0);assert.deepEqual(f.calls,[['1',1]]);f.advance(60000);f.tracker.checkpoint();assert.equal(f.tracker.snapshot().entries[0].seconds,60);}finally{f.tracker.close();}
});
test('adopting guest records does not assign later guest play to the previous account',async()=>{
 const f=fixture();try{f.api.profile=null;f.tracker.start({id:'g',workId:'1'},new EventEmitter());f.advance(60000);f.tracker.checkpoint();f.api.profile={id:'a'};await f.tracker.sync({includeGuest:true});f.tracker.stop('g');await f.tracker.pending;f.api.profile=null;f.tracker.start({id:'g',workId:'1'},new EventEmitter());f.advance(60000);f.tracker.checkpoint();const entries=Object.values(f.store.value.playtime.entries);assert.equal(entries.find(e=>e.owner==='a').seconds,60);assert.equal(entries.find(e=>e.owner==='').seconds,60);}finally{f.tracker.close();}
});
test('playtime writes only absolute minutes and validates official bounds',async()=>{
 const {NextMoe}=require('../src/nextmoe.cjs');let calls=0;const api=new NextMoe({settings:()=>({}),vault:{get:()=>null},request:async(url,options)=>{calls++;assert.match(url,/\/v2\/me\/playtimes\/7$/);assert.equal(options.method,'PUT');assert.deepEqual(JSON.parse(options.body),{minutes:12});return Response.json({minutes:12});}});api.accessToken=async()=>'fixture';await api.putPlaytime('7',12);await assert.rejects(api.putPlaytime('7',60001));await assert.rejects(api.putPlaytime('7',1.5));assert.equal(calls,1);
});
test('ending a launched process waits for exit and leaves other games running',async()=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events');
 const f=fixture(),cp=spawn(process.execPath,['-e','setInterval(()=>{},10000)'],{stdio:'ignore',windowsHide:true});
 try{await once(cp,'spawn');const exit=once(cp,'exit');
 f.tracker.start({id:'active'},cp);f.tracker.start({id:'other'},new EventEmitter());f.advance(7500);
 assert.equal(await f.tracker.requestStop('active'),true);assert.equal(await f.tracker.requestStop('active'),false);
 assert.deepEqual(f.tracker.snapshot().stopping,['active']);await exit;
 assert.deepEqual(f.tracker.snapshot().running,['other']);assert.equal(f.tracker.snapshot().entries[0].seconds,7.5);
 }finally{if(cp.exitCode===null&&!cp.killed)cp.kill();f.tracker.close();}
});
test('playtime survives a real store reload after exit',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{Store}=require('../src/core.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'komorebi-playtime-'));
 const file=path.join(root,'state.json'),store=new Store(file),cp=new EventEmitter();let time=1000;
 const tracker=new Playtime({store,api:{},now:()=>time});
 try{tracker.start({id:'g'},cp);time+=135000;tracker.resume();time+=15000;tracker.checkpoint();time+=32000;cp.emit('exit');
 const restored=new Store(file);assert.equal(Object.values(restored.value.playtime.entries)[0].seconds,47);
 }finally{tracker.close();}
});
