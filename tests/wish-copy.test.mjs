import test from 'node:test';import assert from 'node:assert/strict';
import {wishCopy,WISH_GROUPS} from '../lib/wish-copy.mjs';import {WISHES} from '../lib/domain.mjs';
test('canonical wish IDs stay stable while user-facing labels use the revised catalog',()=>{assert.equal(WISHES.length,36);assert.equal(WISHES[0].id,'W01');assert.equal(WISHES[0].label,'生活富足');assert.doesNotMatch(JSON.stringify(WISH_GROUPS),/一夜暴富|破除霉运|职场避小人/);});
test('legacy nested artwork prose is updated without mutating the archived mapping or IDs',()=>{const old={wish_id:'W01',title:'一夜暴富·绿意祈福',reading:{sections:[{body:'一夜暴富，破除霉运'}]}};const copy=wishCopy(old);assert.equal(copy.wish_id,'W01');assert.equal(copy.title,'生活富足·绿意祈福');assert.doesNotMatch(JSON.stringify(copy),/一夜暴富|破除霉运/);assert.match(old.title,/一夜暴富/);});
