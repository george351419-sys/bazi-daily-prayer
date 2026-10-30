import test from 'node:test';
import assert from 'node:assert/strict';
import {personalizeActionOptions,actionOptions} from '../lib/action-personalization.mjs';
import {actionCards} from '../content/action-alternatives.mjs';
import {validateRitual} from '../lib/ark-cloud.mjs';
import {packageFixture} from './fixtures/ritual-package.mjs';
test('all sixteen slots have five distinct movements with source and conditions',()=>{
 for(const day of personalizeActionOptions({primary_element:'木',secondary_element:'水'}))for(const action of day){
  const options=actionOptions(action);assert.equal(options.length,5);
  const seen=new Set();for(const option of options){
   assert.equal(option.branch,action.branch);assert.ok(option.source);assert.equal(option.review_status,'proposed');
   const card=actionCards.find(c=>c.id===option.id);assert.ok(card);
   for(const key of card.movement_keys){assert.ok(!seen.has(key),key);seen.add(key);}
   assert.ok(!option.text.includes('{n}'));assert.ok(option.text.length<=30);
  }
 }
});
test('v3 validates expanded strips and rejects old-size disguised v3',()=>{
 const old=packageFixture();
 const expanded=Buffer.concat([old.subarray(0,468608),Buffer.alloc(64*7680),old.subarray(468608)]);
 expanded.writeUInt32LE(expanded.length,8);expanded.writeUInt32LE(960128,32);expanded.writeUInt32LE(3,36);
 assert.doesNotThrow(()=>validateRitual(expanded));
 old.writeUInt32LE(3,36);assert.throws(()=>validateRitual(old));
 expanded.writeUInt32LE(4,60);assert.throws(()=>validateRitual(expanded));
});
