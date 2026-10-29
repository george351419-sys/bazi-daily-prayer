import {packageFixture} from './fixtures/ritual-package.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ritualPosition,searchAnswers,actionPlans} from '../lib/ritual.mjs';
import {validateRitual} from '../lib/ark-cloud.mjs';
const start=Date.parse('2026-10-29T01:00:00+08:00');
test('two-minute eight-slot days, two-day repeat and restart use absolute anchor',()=>{
 const p={mode:'test',startsAt:new Date(start).toISOString()};
 for(let i=0;i<33;i++){const r=ritualPosition(p,start+i*120000);assert.equal(r.dayIndex,Math.floor(i/8)%2);assert.equal(r.actionIndex,i%8);assert.equal(Date.parse(r.nextAt),start+(i+1)*120000);}
 assert.equal(ritualPosition(p,start+119999).actionIndex,0);
});
test('daily changes at Shanghai 01:00; actions only 07–23 and expire instead of repeating yesterday',()=>{
 const p={mode:'daily',startsAt:new Date(start).toISOString()};
 const at=s=>ritualPosition(p,Date.parse('2026-10-'+s+'+08:00'));
 assert.equal(at('29T06:59:59').actionIndex,null);assert.equal(at('29T07:00:00').actionIndex,0);assert.equal(at('29T09:00:00').actionIndex,1);assert.equal(at('29T22:59:59').actionIndex,7);assert.equal(at('29T23:00:00').actionIndex,null);
 assert.equal(at('30T00:59:59').dayIndex,0);assert.equal(at('30T01:00:00').dayIndex,1);assert.equal(at('31T01:00:00').dayIndex,2);
});
test('100 searchable answers preserve original IDs, detail and review status',()=>{
 assert.equal(searchAnswers().length,100);const one=searchAnswers('ob001');assert.equal(one.length,1);assert.ok(one[0].phone_detail);assert.equal(one[0].review_status,'待人工审稿');assert.equal(searchAnswers('unlikely-no-result').length,0);
 for(const day of actionPlans){assert.equal(day.length,8);for(const a of day){assert.equal(a.status,'generic_pending_assessment');assert.equal(a.number_status,'unresolved');assert.ok(!a.text.includes('{n}'));}}
});
test('bounded binary package rejects bad offsets, truncation, frame palette and corrupt pixels',()=>{
 const b=packageFixture();assert.doesNotThrow(()=>validateRitual(b));assert.throws(()=>validateRitual(b.subarray(1)));for(const offset of [8,20,24,28,32,36,64+16,64+32]){const bad=Buffer.from(b);bad[offset]=255;assert.throws(()=>validateRitual(bad));}
 assert.equal(b.length,948608);
});

test('first-install clocks need a distinct run ID and daily clocks align to Shanghai 01:00',()=>{
 const first=packageFixture();first.writeUInt32LE(0,12);first.writeUInt32LE(1,40);assert.throws(()=>validateRitual(first));first[44]=1;assert.doesNotThrow(()=>validateRitual(first));
 const daily=packageFixture();daily.writeUInt32LE(0,16);assert.doesNotThrow(()=>validateRitual(daily));daily.writeUInt32LE(daily.readUInt32LE(12)+60,12);assert.throws(()=>validateRitual(daily));
});
