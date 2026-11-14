import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runCloudTick,rotateWorkerAccounts} from '../lib/ritual-cloud-tick.mjs';
import {workerControl} from '../lib/ritual-worker-control.mjs';
import onRequest from '../edgeone/handler.mjs';
import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';

test('bounded cloud invocations rotate durably across successes and failures without starving later accounts',async()=>{
 const entries=[['c',null],['a',null],['b',null]],runs=[],saved=[];
 const first=await runCloudTick({entries,maxAccounts:2,run:async id=>{runs.push(id);if(id==='a')throw Error('temporary');},save:async value=>saved.push(value)});
 assert.deepEqual(runs,['a','b']);assert.equal(first[0].status,'failed');assert.equal(saved.at(-1).cursor,'b');
 runs.length=0;
 await runCloudTick({entries,cursor:saved.at(-1).cursor,maxAccounts:2,run:async id=>runs.push(id),save:async()=>{}});
 assert.deepEqual(runs,['c','a']);assert.deepEqual(rotateWorkerAccounts(entries,'deleted'),[['a',null],['b',null],['c',null]]);
});
test('cloud invocation stops before starting work without enough execution time',async()=>{
 let clock=0,calls=0;
 const results=await runCloudTick({entries:[['a'],['b']],budgetMs:60000,now:()=>clock,run:async(id,timeout)=>{assert.equal(timeout,50000);calls++;clock+=40000;},save:async()=>{}});
 assert.equal(calls,1);assert.equal(results.length,1);
});
async function setup(t){const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-cloud-control-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'cloud-control-test-secret-at-least-20',RITUAL_WORKER_REMOTE:'1'};}
test('cloud incident state and recovery history survive fresh function processes, are bounded, and reject invalid writes',async t=>{
 const c=await setup(t),issue={key:'08:missing',kind:'tomorrow_not_ready',accountId:'0'.repeat(32),message:'missing',firstSeen:123,lastSent:456};
 await workerControl(c,'monitor','POST',{active:{[issue.key]:issue},events:[issue]});
 let saved=await workerControl({...c},'monitor','GET');assert.equal(saved.active[issue.key].firstSeen,123);
 for(let i=0;i<5;i++)await workerControl(c,'monitor','POST',{active:{},events:Array.from({length:50},()=>({...issue,recovered:true}))});
 saved=await workerControl(c,'monitor','GET');assert.deepEqual(saved.active,{});assert.equal(saved.events.length,200);assert.equal(saved.events.at(-1).recovered,true);
 await assert.rejects(workerControl(c,'monitor','POST',{active:{bad:issue}}),/标识不一致/);
 await workerControl(c,'scheduler','POST',{cursor:'a'.repeat(32)});assert.equal((await workerControl(c,'scheduler','GET')).cursor,'a'.repeat(32));
});
test('cloud control routes require Worker HMAC and cannot be written as anonymous cron endpoints',async t=>{
 const c=await setup(t),pathname='/api/internal/ritual-worker/state/scheduler',url='https://playmath.cn'+pathname;
 assert.equal((await onRequest({request:new Request(url),env:c})).status,403);
 const body=JSON.stringify({cursor:'b'.repeat(32)}),headers={'Content-Type':'application/json','X-Ritual-Expires':String(Math.floor(Date.now()/1000)+120),'X-Ritual-Signature':ritualWorkerSignature(c,'POST',pathname,body)};
 const response=await onRequest({request:new Request(url,{method:'POST',headers,body}),env:c});assert.equal(response.status,200);
 assert.equal((await workerControl(c,'scheduler','GET')).cursor,'b'.repeat(32));
});

test('a cold-start commit restores full two-day metadata stripped from compact checkpoints',async()=>{
 const {resumePreparedRitual,compactRitualBuild}=await import('../lib/ritual-worker-state.mjs');
 const manifest={days:[{date:'2026-11-14',actions:[{text:'action'}]},{date:'2026-11-15'}]},prior=compactRitualBuild({prepared:{signature:'same',manifest,chunks:['chunk'],sha256:'sha'}});
 assert.equal(prior.prepared.manifest.days,undefined);
 assert.deepEqual(resumePreparedRitual(prior,'same',manifest).manifest.days,manifest.days);
 assert.equal(resumePreparedRitual(prior,'different',manifest),null);
});
