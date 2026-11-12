import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SyncIdleRelease,deliveredPackageKey} from '../public/sync-idle.js';
const status=()=>({pendingUpdate:false,device:{id:'device'},plan:{revision:'one',artworkIds:['photo']},build:{status:'published',sha256:'sha'},deviceReport:{targetSha:'sha',stored:true}});
function setup(){let state={status:status(),connection:{paired:true,deviceId:'device'}},released=0,id=0;const timers=new Map();
 const policy=new SyncIdleRelease({read:()=>state,release:()=>{released++;},setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 return{policy,timers,get state(){return state;},get released(){return released;},async fire(){const [key,timer]=timers.entries().next().value;timers.delete(key);timer.fn();await Promise.resolve();}};
}
test('current stored receipt schedules one 30 second release, not extended by polling',async()=>{
 const h=setup();h.policy.update();h.policy.update();assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].ms,30000);await h.fire();assert.equal(h.released,1);
});
test('wrong hashes, manual confirmations, pending plans and generation never trigger release',()=>{
 for(const mutate of [s=>s.status.pendingUpdate=true,s=>s.status.deviceReport.targetSha='old',s=>s.connection.deviceId='other',s=>s.connection.generating=true,s=>{s.status.deviceReport=null;s.connection.delivered={targetSha:'sha',deviceId:'device',evidence:'user-confirmed'};}]){const h=setup();mutate(h.state);h.policy.update();assert.equal(h.timers.size,0);}
});
test('new plan or loss of completion cancels old deadline, including changes during the grace period',async()=>{
 const h=setup();h.policy.update();h.state.status.plan.revision='two';h.policy.update();assert.equal(h.timers.size,1);h.state.status.pendingUpdate=true;await h.fire();assert.equal(h.released,0);
});
test('busy operations postpone release and active settings cancel it',async()=>{
 const h=setup();h.policy.update();h.state.connection.busy=true;await h.fire();assert.equal(h.released,0);assert.equal([...h.timers.values()][0].ms,1000);h.state.connection.busy=false;await h.fire();assert.equal(h.released,1);
 const next=setup();next.policy.update();next.state.connection.blocked=true;next.policy.update();assert.equal(next.timers.size,0);
});
test('only current BLE package evidence permits fallback when cloud is delayed',()=>{
 const s=status();s.deviceReport=null;const c={paired:true,deviceId:'device',delivered:{evidence:'ble-download-complete',targetSha:'sha',deviceId:'device'}};assert.ok(deliveredPackageKey(s,c));c.delivered.targetSha='old';assert.equal(deliveredPackageKey(s,c),null);
});
test('mini program and web use identical power release policy',()=>{
 const web=readFileSync(new URL('../public/sync-idle.js',import.meta.url),'utf8').replace('export function ','function ').replace('export class ','class ');
 const mini=readFileSync(new URL('../miniprogram/utils/sync-idle.js',import.meta.url),'utf8');assert.equal(mini,web+'\nmodule.exports={deliveredPackageKey,SyncIdleRelease};\n');
});
