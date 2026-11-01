import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {accountRepository} from '../lib/account-store.mjs';import {listRitualWork,handleRitualWorkerRequest,ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';
import {ritualStatus} from '../lib/ritual.mjs';import {transferStatus} from '../public/transfer-status.js';
import {commitRitualPackage} from '../lib/ritual-upload.mjs';
test('a device-free plan is queued, visible to the worker, and becomes connectable only after real preparation',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'prebind-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'preparation-test-secret-is-stable',RITUAL_WORKER_REMOTE:'1'},repo=accountRepository(c),id='a'.repeat(32),ids=['b'.repeat(36),'c'.repeat(36)],plan={revision:'revision',artworkIds:ids,mode:'test',startsAt:new Date().toISOString(),contentMode:'prayer'};
 await repo.put('ritual/'+id,plan);
 for(const artworkId of ids)await repo.put('artworks/'+id+'/'+artworkId,{id:artworkId,userId:id,status:'complete',image:{key:'none'},date:'2026-11-01',mapping:{title:'test'}});
 assert.equal((await listRitualWork(c))[id],null);
 let s=await ritualStatus(c,{id});assert.equal(s.preparation.ready,false);assert.equal(transferStatus(s).phase,'preparing');
 await repo.put('ritual-build/'+id,{status:'ready',prepared:{manifest:plan,sha256:'d'.repeat(64),bytes:100,chunks:['e'.repeat(64)]}});
 s=await ritualStatus(c,{id});assert.equal(s.preparation.ready,true);assert.equal(s.pendingUpdate,true);assert.equal(transferStatus(s).phase,'connect');assert.equal(s.build.status,'ready');
 await repo.put('ritual/'+id,{...plan,revision:'new-revision'});s=await ritualStatus(c,{id});assert.equal(s.preparation.ready,false);assert.equal(transferStatus(s).phase,'preparing');
 const pathname='/api/internal/ritual-worker/accounts/'+id+'/build',body={revision:'revision',state:{status:'published'}},headers={'x-ritual-expires':String(Math.floor(Date.now()/1000)+120),'x-ritual-signature':ritualWorkerSignature(c,'POST',pathname,body)};
 assert.equal((await handleRitualWorkerRequest(c,{method:'POST',path:pathname,headers,body})).superseded,true);assert.equal((await repo.get('ritual-build/'+id)).status,'ready');
});
test('preparation shows real chunk progress and photos use the same connection handoff',()=>{
 const result={syncConfigured:false,plan:{contentMode:'photo'},preparation:{ready:false,stage:'uploading',progress:{completed:3,total:4}}};
 assert.equal(transferStatus(result).percent,75);assert.equal(transferStatus(result).preparation,true);
 assert.equal(transferStatus({...result,preparation:{ready:true}}).phase,'connect');
 assert.equal(transferStatus({...result,preparation:{ready:false,stage:'encoding'}}).percent,null);
});
test('a prepared package commits without uploading it again and refuses superseded binding',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true});},c={SESSION_SECRET:'preparation-test-secret-is-stable',RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'},prepared={sha256:'a'.repeat(64),bytes:100,chunks:['b'.repeat(64)]};
 assert.equal((await commitRitualPackage(c,'112233445566',prepared,{fetcher})).sha256,prepared.sha256);assert.equal(calls.length,1);assert.equal(calls[0].type,'ritual_commit');
 assert.equal((await commitRitualPackage(c,'112233445566',prepared,{fetcher,beforeCommit:async()=>false})).superseded,true);assert.equal(calls.length,1);
});
