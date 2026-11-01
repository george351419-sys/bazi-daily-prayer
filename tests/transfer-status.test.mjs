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

test('下载完成和回执未完整上报不再显示等待领取',()=>{
 const completed=transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:2}},'new');assert.equal(completed.phase,'confirming');assert.match(completed.title,/下载完成/);
 const idle=transferStatus(ready,'new');assert.equal(idle.phase,'confirming');assert.doesNotMatch(idle.title,/等待画屏领取/);
});
test('当前包刷新回执不依赖另一次保存标记，其他包回执不可冒充成功',()=>{
 const current={...ready,build:{...ready.build,sha256:'new-sha'},deviceReport:{...ready.deviceReport,targetSha:'new-sha',stored:false,renderedCurrent:true,renderReport:{day:0}}};
 assert.equal(transferStatus(current,'new').phase,'rendered');
 const previous={...current,deviceReport:{...current.deviceReport,targetSha:'old-sha',stored:true,renderedCurrent:false,downloadState:2}};
 assert.equal(transferStatus(previous,'new').phase,'confirming');
});
test('当前包的保存和刷新凭据在休眠后仍有效，但不套用到新包',()=>{
 const asleep={...ready,build:{...ready.build,sha256:'current'},deviceReport:{...ready.deviceReport,stale:true,targetSha:'current',stored:true}};
 assert.equal(transferStatus(asleep,'new').phase,'stored');
 assert.match(transferStatus(asleep,'new').detail,/确认键/);
 assert.equal(transferStatus({...asleep,deviceReport:{...asleep.deviceReport,renderedCurrent:true,renderReport:{day:0}}},'new').phase,'rendered');
 assert.equal(transferStatus({...asleep,build:{...asleep.build,sha256:'next'}},'new').phase,'waiting');
});
