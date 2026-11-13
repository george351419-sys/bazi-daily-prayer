import test from 'node:test';
import assert from 'node:assert/strict';
import {ritualPosition} from '../lib/ritual.mjs';
import {personalizeActionOptions,actionOptions} from '../lib/action-personalization.mjs';
import {actionCards} from '../content/action-alternatives.mjs';
import {validateRitual} from '../lib/ark-cloud.mjs';
import {packageZiFixture} from './fixtures/ritual-zi-package.mjs';
const at=s=>Date.parse(s+'+08:00');
test('23:00 starts ninth slot, midnight retains same day, 01:00 clears for new content day',()=>{
 const p={mode:'daily',actionSlots:9,startsAt:'2026-11-04T01:00:00+08:00'};
 for(const [time,day,action] of [['2026-11-04T22:59:59',0,7],['2026-11-04T23:00:00',0,8],['2026-11-05T00:00:00',0,8],['2026-11-05T00:59:59',0,8],['2026-11-05T01:00:00',1,null],['2026-11-05T06:59:59',1,null],['2026-11-05T07:00:00',1,0],['2026-11-05T23:00:00',1,8],['2026-11-06T00:59:59',1,8],['2026-11-06T01:00:00',2,null]]){
  const r=ritualPosition(p,at(time));assert.equal(r.dayIndex,day,time);assert.equal(r.actionIndex,action,time);
 }
 assert.equal(ritualPosition(p,at('2026-11-04T23:00:00')).nextAt,new Date(at('2026-11-05T01:00:00')).toISOString());
 assert.equal(ritualPosition({...p,actionSlots:8},at('2026-11-04T23:00:00')).actionIndex,null,'legacy package stays eight slots');
});
test('nine-slot diagnostics preserve absolute time across both cached days',()=>{
 const start=at('2026-11-04T01:00:00'),p={mode:'test',actionSlots:9,startsAt:new Date(start).toISOString()};
 for(let i=0;i<37;i++){const r=ritualPosition(p,start+i*120000);assert.equal(r.dayIndex,Math.floor(i/9)%2);assert.equal(r.actionIndex,i%9);}
});
test('both days have five distinct quiet Zi movements with conditions and sources',()=>{
 for(const day of personalizeActionOptions({primary_element:'木',secondary_element:'水'},9)){
  assert.equal(day.length,9);const a=day[8];assert.equal(a.hour,23);assert.equal(a.branch,'子');assert.equal(a.relation_type,'general_scene_fallback');
  const options=actionOptions(a),seen=new Set();assert.equal(options.length,5);
  for(const option of options){assert.ok(option.source);assert.ok(option.detail);assert.equal(option.branch,'子');assert.ok(!option.text.includes('{n}'));for(const key of actionCards.find(c=>c.id===option.id).movement_keys){assert.ok(!seen.has(key));seen.add(key);}}
 }
});
test('v5 stays within old memory limit, validates 90 strips and rejects corrupt compressed answers',()=>{
 const b=packageZiFixture();assert.equal(b.length,1586928);validateRitual(b);
 const bad=Buffer.from(b);bad.writeUInt32LE(5497,bad.readUInt32LE(32));assert.throws(()=>validateRitual(bad));
 b.writeUInt32LE(4,36);assert.throws(()=>validateRitual(b));
});
