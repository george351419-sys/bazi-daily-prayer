import test from 'node:test';
import assert from 'node:assert/strict';
import {ritualSyncWindow} from '../lib/ritual-sync-window.mjs';
test('pending preparation schedules seven minutes from task start, then bounded retries',()=>{
 const now=Date.parse('2026-11-12T08:00:00Z'),task={status:'drawing',createdAt:new Date(now).toISOString()};
 assert.equal(ritualSyncWindow(task,null,null,now).sync_wait_seconds,420);
 assert.equal(ritualSyncWindow(task,null,null,now+120000).sync_wait_seconds,300);
 assert.equal(ritualSyncWindow(task,null,null,now+600000).sync_wait_seconds,300);
 assert.equal(ritualSyncWindow(task,null,null,now).sync_window_seconds,180);
});
test('current publication clears pending while old publication cannot',()=>{
 const plan={revision:'new'};
 assert.equal(ritualSyncWindow({status:'complete'},plan,{status:'published',publication:{manifest:{revision:'new'}}}).sync_wait_pending,false);
 assert.equal(ritualSyncWindow({status:'complete'},plan,{status:'published',publication:{manifest:{revision:'old'}}}).sync_wait_pending,true);
});
