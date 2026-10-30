import test from 'node:test';
import assert from 'node:assert/strict';
import {transferStatus} from '../public/transfer-status.js';
const ready={syncConfigured:true,plan:{artworkIds:['new','tomorrow'],contentMode:'prayer'},pendingUpdate:false,build:{status:'published',publishedAt:'2026-10-30T05:00:00Z'},deviceReport:{lastSeen:'2026-10-30T05:01:00Z',stale:false,stored:false}};
test('new picture waits for its own plan rather than accepting an old completion',()=>{
 assert.equal(transferStatus({...ready,plan:{artworkIds:['old']},deviceReport:{...ready.deviceReport,stored:true,renderReport:{day:0}}},'new').phase,'preparing');
});
test('download uses the real reported percentage, not fabricated phase percentages',()=>{
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:1,downloadProgress:43}},'new').percent,43);
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:1}},'new').percent,null);
});
test('stored and refreshed are separate states; older screen report cannot complete refresh',()=>{
 const stored={...ready,deviceReport:{...ready.deviceReport,stored:true}};
 assert.equal(transferStatus(stored,'new').phase,'stored');
 assert.equal(transferStatus({...stored,deviceReport:{...stored.deviceReport,renderReport:{day:0}}},'new').phase,'rendered');
 assert.equal(transferStatus({...stored,deviceReport:{...stored.deviceReport,renderReport:{day:0},showingPrevious:true}},'new').phase,'stored');
});
test('old or stale reports never finish a new transfer',()=>{
 for(const report of [{lastSeen:'2026-10-30T04:59:00Z'},{stale:true}]){
  assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,stored:true,renderReport:{day:0},...report}},'new').phase,'waiting');
 }
});
test('unbound, photo mode, firmware mismatch and retry states tell the next action',()=>{
 assert.equal(transferStatus({syncConfigured:false},'new').phase,'unbound');
 assert.equal(transferStatus({...ready,plan:{contentMode:'photo'}},'new').phase,'photo');
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,firmwareUpdateRequired:true}},'new').phase,'firmware');
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:3}},'new').phase,'retrying');
 assert.equal(transferStatus({...ready,pendingUpdate:true,deviceReport:{...ready.deviceReport,stored:true,renderReport:{day:0}}},'new').phase,'preparing');
});
