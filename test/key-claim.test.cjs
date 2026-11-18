const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {claimKey,provision}=require('../src/key-claim.cjs');
function fixture({apps=[],keys=[],status}={}){
 const calls=[];let minted;
 const page={goto:async()=>{},url:()=>'https://developer.nextmoe.dev/dashboard',getByRole:()=>({first:()=>({waitFor:async()=>{}})}),evaluate:(fn,arg)=>vm.runInNewContext('('+fn+')(arg)',{arg,location:new URL('https://developer.nextmoe.dev/dashboard'),document:{cookie:'access_token=fixture-login'},fetch:async(route,options)=>{
  assert.equal(options.headers.Authorization,'Bearer fixture-login');const body=options.body&&JSON.parse(options.body);calls.push({route,body});
  const data=route.endsWith('/apps')?(body?{client_id:'personal',review_status:status}:apps):body?{key:'nmk_live_dummy'}:keys;return {ok:true,json:async()=>({code:0,data})};
 }})};
 return {calls,run:()=>provision(page,{clientId:'mine',name:'fixture-name',stage:k=>minted=k}),minted:()=>minted};
}
test('claims under owned app, requesting only catalog scope',async()=>{const f=fixture({apps:[{client_id:'mine'}]});await f.run();assert.equal(f.minted(),'nmk_live_dummy');assert.deepEqual(f.calls.at(-1),{route:'/api/v1/dev/apps/mine/keys',body:{name:'fixture-name',test:false,scopes:['catalog:read']}});});
test('creates personal app if necessary and respects pending review',async()=>{const f=fixture({status:'pending'});await assert.rejects(f.run(),/审核/);assert.equal(f.calls.length,2);});
test('does not issue a duplicate after an uncertain previous attempt',async()=>{const f=fixture({keys:[{name:'fixture-name'}]});await assert.rejects(f.run(),/同名/);assert.equal(f.minted(),undefined);});
test('resumes verification of staged key without another browser or issuance',async()=>{const state={pendingApiKey:'fixture'},vault={get:k=>state[k],set:(k,v)=>state[k]=v};await assert.rejects(claimKey({vault,connect:async()=>{throw Error('offline')}}),/offline/);assert.equal(state.pendingApiKey,'fixture');await claimKey({vault,connect:async k=>assert.equal(k,'fixture')});assert.equal(state.pendingApiKey,null);});
