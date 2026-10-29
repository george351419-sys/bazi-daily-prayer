import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {accountRepository,encryptAccountData} from '../lib/account-store.mjs';
import {saveArtwork,newArtworkId} from '../lib/accounts.mjs';
import {configureRitual,ritualStatus,ritualPosition,actionPlans} from '../lib/ritual.mjs';
async function setup(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-status-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const account={id:randomBytes(16).toString('hex')},device='112233445566',map=new Map();
 const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'ritual-status-test-secret-123456789',RITUAL_DEVICE_LINKS:JSON.stringify({[account.id]:device}),RITUAL_CLOUD_STORE:{async get(key){return map.get(key)||null;}}};
 const repo=accountRepository(c),ids=[];
 for(let i=0;i<4;i++){const id=newArtworkId();ids.push(id);await saveArtwork(c,account,{id,userId:account.id,date:'2026-10-'+(25+i),status:'complete',image:{key:'test/'+id},mapping:{title:'祈福画 '+i}});}
 const cloud=(key,data)=>map.set(key,encryptAccountData(c,Buffer.from(JSON.stringify(data))));
 cloud('devices/'+device,{deviceId:device,tokenHash:'a'.repeat(64),mode:'daily',dailyAt:'01:00',startDate:'2026-10-29',playlist:[{sha256:'b'.repeat(64)}],enabled:true,ritualSha:'c'.repeat(64)});
 return {c,repo,account,device,ids,cloud};
}
function manifest(plan,ids){return {...plan,artworkIds:ids,days:ids.map((id,i)=>({artworkId:id,actions:actionPlans[i].map(a=>({...a,text:'包内动作：'+a.text}))}))};}
test('a newly saved plan never relabels the previous package render report',async t=>{
 const {c,repo,account,device,ids,cloud}=await setup(t);
 const first=(await configureRitual(c,account,{mode:'test',artworkIds:ids.slice(0,2)})).plan,old=manifest(first,ids.slice(0,2));
 await repo.put('ritual-build/'+account.id,{status:'retrying',manifest:old,sha256:'c'.repeat(64)});
 const now=Date.now();cloud('reports/'+device,{targetSha:'c'.repeat(64),stored:true,lastSeen:new Date(now).toISOString(),renderReport:{day:1,action:3,answer:0,startedAt:Math.floor(now/1000)-120}});
 const requested=(await configureRitual(c,account,{mode:'test',artworkIds:ids.slice(2)})).plan;
 const result=await ritualStatus(c,account,now);
 assert.equal(result.plan.revision,requested.revision);assert.equal(result.artwork.id,ids[1]);assert.equal(result.displaySource,'device_report');assert.equal(result.pendingUpdate,true);assert.equal(result.answer.id,'OB001');assert.match(result.action.text,/^包内动作/);
 assert.equal(result.scheduledPosition.actionIndex,1,'schedule uses the device installation clock');assert.deepEqual(result.plannedDays.map(d=>d.artworkId),ids.slice(2));
});
test('a previous package remains identifiable while a new package is downloading',async t=>{
 const {c,repo,account,device,ids,cloud}=await setup(t);
 const plan=(await configureRitual(c,account,{mode:'test',artworkIds:ids.slice(0,2)})).plan,old=manifest(plan,ids.slice(0,2));
 const next=(await configureRitual(c,account,{mode:'test',artworkIds:ids.slice(2)})).plan,fresh=manifest(next,ids.slice(2));
 await repo.put('ritual-build/'+account.id,{status:'published',publication:{manifest:fresh,sha256:'c'.repeat(64)},previousPublication:{manifest:old,sha256:'d'.repeat(64)}});
 cloud('reports/'+device,{targetSha:'c'.repeat(64),stored:false,renderSha:'d'.repeat(64),lastSeen:new Date().toISOString(),renderReport:{day:0,action:2,answer:-1}});
 const result=await ritualStatus(c,account);assert.equal(result.artwork.id,ids[0]);assert.equal(result.deviceReport.showingPrevious,true);assert.deepEqual(result.plan.artworkIds,ids.slice(2));
});
test('unknown package reports are ignored, daily preview expires, and pending auto artworks cannot be chosen',async t=>{
 const {c,repo,account,device,ids,cloud}=await setup(t);
 await configureRitual(c,account,{mode:'daily',artworkIds:ids.slice(0,2)});
 cloud('reports/'+device,{targetSha:'f'.repeat(64),stored:true,lastSeen:new Date().toISOString(),renderReport:{day:0,action:0,answer:0}});
 assert.equal((await ritualStatus(c,account)).displaySource,'schedule_preview');
 const record=await repo.get('artworks/'+account.id+'/'+ids[0]);await saveArtwork(c,account,{...record,source:'automatic',publicationState:'pending'});
 await assert.rejects(configureRitual(c,account,{mode:'test',artworkIds:ids.slice(0,2)}),e=>e.status===400);
 const initial=await repo.get('ritual/'+account.id);await configureRitual(c,account,{mode:'test',artworkIds:ids.slice(2)},{onlyIfNew:true});assert.deepEqual(await repo.get('ritual/'+account.id),initial);
 const expired=ritualPosition({mode:'daily',startsAt:'2026-10-29T01:00:00+08:00'},Date.parse('2026-10-31T12:00:00+08:00'));assert.equal(expired.actionIndex,null);assert.equal(expired.expired,true);
});
