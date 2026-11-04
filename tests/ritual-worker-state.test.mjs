import test from 'node:test';
import assert from 'node:assert/strict';
import {compactRitualBuild,legacyPhotoIds,processRitualAccounts} from '../lib/ritual-worker-state.mjs';
import {ritualPublication} from '../lib/ritual.mjs';

test('large legacy build stays below the gateway limit while preserving both device publications',()=>{
 const manifest={revision:'revision',mode:'daily',artworkIds:['a','b'],days:[{actions:[{text:'祈'.repeat(14000)}]}]};
 const publication={manifest,sha256:'a'.repeat(64),signature:'signature'};
 const state={manifest,publication,previousPublication:{...publication,sha256:'b'.repeat(64)},prepared:{manifest,signature:'signature',chunks:['c'.repeat(64)]},status:'ready'};
 assert.ok(Buffer.byteLength(JSON.stringify({state}))>128*1024);
 const compact=compactRitualBuild(state);
 assert.ok(Buffer.byteLength(JSON.stringify({state:compact,revision:'revision'}))<128*1024);
 assert.deepEqual(ritualPublication(compact),publication);
 assert.deepEqual(compact.previousPublication,state.previousPublication);
 assert.deepEqual(compact.prepared.manifest.artworkIds,['a','b']);
 assert.equal(compact.prepared.manifest.revision,'revision');
 assert.deepEqual(compact.prepared.chunks,state.prepared.chunks);
 assert.ok(state.prepared.manifest.days);
 assert.deepEqual(compactRitualBuild(compact),compact);
 assert.deepEqual(compactRitualBuild({manifest,sha256:'legacy'}),{manifest,sha256:'legacy'});
});

test('legacy single-photo plans compile as two days without changing saved IDs',()=>{
 const ids=['photo','photo'];
 assert.deepEqual(legacyPhotoIds(ids),['photo']);
 assert.deepEqual(ids,['photo','photo']);
 assert.deepEqual(legacyPhotoIds(['one','two','one']),['one','two']);
});

test('one invalid account cannot starve later accounts',async()=>{
 const seen=[],errors=[];
 await processRitualAccounts([['bad','one'],['good','two']],async(id,device)=>{
  if(id==='bad')throw new Error('invalid plan');
  seen.push([id,device]);
 },(error,id)=>errors.push([id,error.message]));
 assert.deepEqual(seen,[['good','two']]);
 assert.deepEqual(errors,[['bad','invalid plan']]);
});
