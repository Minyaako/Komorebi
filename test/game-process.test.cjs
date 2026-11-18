const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),path=require('node:path');
const {GameProcess}=require('../src/game-process.cjs');
test('launcher exits but new game process continues; reused PID and existing applications ignored',async()=>{
 const cp=new EventEmitter();cp.pid=100;let now=10000,rows=[];
 const tracker=new GameProcess(cp,path.resolve('game'),{now:()=>now,list:async()=>rows,interval:100000});
 try{
  await tracker.poll();rows=[{id:101,parent:100,born:10001,exe:path.resolve('game','game.exe')},{id:200,parent:1,born:1,exe:path.resolve('game','old.exe')}];
  now=11000;cp.emit('exit');await tracker.poll();assert.equal(tracker.ended,false);assert.deepEqual([...tracker.known.keys()],[101]);
  rows=[{id:100,parent:1,born:12000,exe:path.resolve('unrelated.exe')},{id:300,parent:100,born:12001,exe:path.resolve('other.exe')}];
  await tracker.poll();assert.equal(tracker.ended,true);
 }finally{tracker.dispose();}
});
test('launcher handoff survives missing intermediate process without counting preexisting games',async()=>{
 const cp=new EventEmitter();cp.pid=1;let rows=[];
 const tracker=new GameProcess(cp,path.resolve('game'),{now:()=>10000,list:async()=>rows,interval:100000});
 try{await tracker.poll();rows=[{id:3,parent:2,born:10000,exe:path.resolve('game','bin','real.exe')}];cp.emit('exit');await tracker.poll();assert.equal(tracker.ended,false);rows=[];await tracker.poll();assert.equal(tracker.ended,true);}finally{tracker.dispose();}
});
