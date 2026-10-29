import test from 'node:test';
import assert from 'node:assert/strict';
import {actionPlans} from '../content/ritual-content.mjs';
import {personalizeActionPlans} from '../lib/action-personalization.mjs';

test('two-day action numbers follow primary then secondary Hetu values',()=>{
 const days=personalizeActionPlans({primary_element:'火',secondary_element:'木'});
 assert.equal(days.length,2);assert.equal(days[0].length,8);assert.equal(days[1].length,8);
 assert.deepEqual(days[0].map(action=>action.number_basis.number),[2,7,2,7,2,7,2,7]);
 assert.deepEqual(days[1].map(action=>action.number_basis.number),[3,8,3,8,3,8,3,8]);
 for(const day of days)for(const action of day){assert.ok(!/(几次|片刻)/.test(action.text));assert.match(action.detail,/河图数/);}
});
test('photo content keeps the generic action templates without invented elements',()=>{
 const days=personalizeActionPlans({});
 assert.equal(days,actionPlans);
});
