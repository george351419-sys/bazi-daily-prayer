// Isolated content compiler/uploader. No model calls. Run one instance per account store.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {accountRepository,accountsEnabled} from '../lib/account-store.mjs';
import {getArtwork,privateImage} from '../lib/accounts.mjs';
import {configureRitual,ritualArtworkReady,ritualPublication} from '../lib/ritual.mjs';
import {answers} from '../content/ritual-content.mjs';
import {publishRitualPackage} from '../lib/ritual-upload.mjs';
import {listRitualDeviceLinks} from '../lib/ritual-device.mjs';
import {personalizeActionPlans} from '../lib/action-personalization.mjs';
const c={...process.env},repo=accountRepository(c),exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!accountsEnabled(c))throw new Error('Configure ACCOUNT_STORAGE in the private worker environment');
let stop=false;const abort=new AbortController();for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stop=true;abort.abort();});
do{
 const links=await listRitualDeviceLinks(c);
 for(const [id,mac] of Object.entries(links)){
  let tmp,plan;try{
   plan=await repo.get('ritual/'+id);
   const prior=await repo.get('ritual-build/'+id);
   if(prior?.status==='retrying'&&prior.attemptedRevision===(plan?.revision||plan?.updatedAt)&&Date.parse(prior.nextAttemptAt)>Date.now())continue;
   if(!plan){
    const complete=[];let cursor;
    for(let page=0;page<10;page++){const batch=await repo.list({prefix:'artworks/'+id+'/',limit:100,cursor});for(const item of batch.blobs){const r=await repo.get(item.key);if(r?.userId===id&&ritualArtworkReady(r)&&r.source!=='upload')complete.push(r);}if(!batch.cursor)break;cursor=batch.cursor;}
    const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),future=complete.filter(r=>r.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
    const selected=future.length>=2?future.slice(0,2):complete.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2).reverse();
    if(selected.length<2){await repo.put('ritual-build/'+id,{status:'waiting_for_artworks',note:'Two completed private artworks are required for the initial test cache'});continue;}
    await configureRitual(c,{id},{mode:'test',artworkIds:selected.map(r=>r.id)},{onlyIfNew:true});plan=await repo.get('ritual/'+id);
   }
   let records=await Promise.all(plan.artworkIds.map(art=>getArtwork(c,{id},art))),startsAt=plan.startsAt;
   if(plan.mode==='daily'&&plan.contentMode!=='photo'){
    const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10),previous=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10),matching=[];let cursor;
    // Consume the existing daily worker's archived output; never trigger paid generation here.
    for(let page=0;page<10;page++){const batch=await repo.list({prefix:'artworks/'+id+'/',limit:100,cursor});for(const item of batch.blobs){const r=await repo.get(item.key);if(ritualArtworkReady(r)&&[previous,today].includes(r.date)&&r.profileSignature&&r.profileSignature===records[0].profileSignature)matching.push(r);}if(!batch.cursor)break;cursor=batch.cursor;}
    const pair=[previous,today].map(date=>matching.filter(r=>r.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]);
    if(pair.every(Boolean)){records=pair;startsAt=previous+'T01:00:00+08:00';}
   }
   if(plan.mode==='daily'&&plan.contentMode==='photo')startsAt=new Date(Date.now()+7*3600000).toISOString().slice(0,10)+'T01:00:00+08:00';
   const personalized=records.map((record,index)=>personalizeActionPlans(record.mapping)[index]);
   const manifest={...plan,artworkLayout:!plan.showActions?'full-frame-v2':plan.contentMode==='photo'?'photo-v2':'scroll-v2',artworkIds:records.map(r=>r.id),startsAt,anchor:plan.mode==='test'?'first_connection':'absolute',days:records.map((r,i)=>({date:r.date,artworkId:r.id,actions:personalized[i]}))};
   const signature=createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),state=await repo.get('ritual-build/'+id);
   if(ritualPublication(state)?.signature===signature){if(state.status!=='published')await repo.put('ritual-build/'+id,{...state,status:'published',nextAttemptAt:null});continue;}
   tmp=await mkdtemp(path.join(os.tmpdir(),'ritual-compile-'));
   await writeFile(path.join(tmp,'plan.json'),JSON.stringify(manifest),{mode:0o600});await writeFile(path.join(tmp,'answers.json'),JSON.stringify({answers}),{mode:0o600});
   for(let i=0;i<2;i++){const image=await privateImage(c,{id},records[i]);await writeFile(path.join(tmp,`day-${i}.png`),image.bytes,{mode:0o600});}
   await exec(c.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3',[path.join(root,'tools/build-ritual-package.py'),'--plan',path.join(tmp,'plan.json'),'--images',path.join(tmp,'day-0.png'),path.join(tmp,'day-1.png'),'--answers',path.join(tmp,'answers.json'),'--out',path.join(tmp,'ritual.bin'),...(c.RITUAL_FONT?['--font',c.RITUAL_FONT]:[])],{timeout:120000,maxBuffer:100000});
   const result=await publishRitualPackage(c,mac,await readFile(path.join(tmp,'ritual.bin')),{beforeCommit:async()=>JSON.stringify(await repo.get('ritual/'+id))===JSON.stringify(plan)});
   if(result.superseded)continue;
   await repo.put('ritual-build/'+id,{previousPublication:ritualPublication(state)?.sha256!==result.sha256?ritualPublication(state):state?.previousPublication,publication:{signature,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt:new Date().toISOString()},signature,status:'published',mode:plan.mode,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt:new Date().toISOString(),note:'waiting_for_device_storage_receipt'});
   console.log('Two-day ritual package published; awaiting device receipt.');
  }catch{const state=await repo.get('ritual-build/'+id).catch(()=>null),failures=state?.attemptedRevision===(plan?.revision||plan?.updatedAt)?(state?.failures||0)+1:1;await repo.put('ritual-build/'+id,{...state,status:'retrying',failures,attemptedRevision:plan?.revision||plan?.updatedAt,lastAttempt:new Date().toISOString(),nextAttemptAt:new Date(Date.now()+Math.min(900000,15000*2**Math.min(failures-1,6))).toISOString(),note:'Content compiler or device service unavailable; previous device cache retained'}).catch(()=>{});console.error('Ritual compilation/publication deferred; retrying later.');}
  finally{if(tmp)await rm(tmp,{recursive:true,force:true});}
 }
 if(stop||process.argv.includes('--once'))break;
 try{await delay(15000,undefined,{signal:abort.signal});}catch{}
}while(!stop);
