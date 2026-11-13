import {cachedRitualPackage,uploadCachedRitualPackage,resetRitualUpload,ritualFailure} from '../lib/ritual-package-cache.mjs';
import {compactRitualBuild,legacyPhotoIds,stagedRitualBuild} from '../lib/ritual-worker-state.mjs';
import {normalizeArtStyle} from '../lib/art-styles.mjs';
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
import {configureRitual,ritualArtworkReady,ritualPublication,ritualPhotoPair} from '../lib/ritual.mjs';
import {answers} from '../content/ritual-content.mjs';
import {commitRitualPackage} from '../lib/ritual-upload.mjs';
import {listRitualWork} from '../lib/ritual-worker-bridge.mjs';
import {ritualDeviceForAccount} from '../lib/ritual-device.mjs';
import {personalizeActionOptions} from '../lib/action-personalization.mjs';
const c={...process.env},repo=accountRepository(c),exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!accountsEnabled(c))throw new Error('Configure ACCOUNT_STORAGE in the private worker environment');
let stop=false;const abort=new AbortController();for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stop=true;abort.abort();});
do{
 const links=await listRitualWork(c);
 for(const [id,mac] of Object.entries(links)){
  let tmp,plan,preparedForRetry=null,failureStage='images';try{
   const binding=await ritualDeviceForAccount(c,id),bindingId=binding?.bindingId||null;
   if(mac&&binding?.deviceId!==mac)continue;
   plan=await repo.get('ritual/'+id);
   const prior=await repo.get('ritual-build/'+id);
   if(prior?.status==='retrying'&&prior.attemptedRevision===(plan?.revision||plan?.updatedAt)&&Date.parse(prior.nextAttemptAt)>Date.now())continue;
   if(!plan){
    const currentStyle=normalizeArtStyle((await repo.get('profiles/'+id))?.artStyle);
    const complete=[];let cursor;
    for(let page=0;page<10;page++){const batch=await repo.list({prefix:'artworks/'+id+'/',limit:100,cursor});for(const item of batch.blobs){const r=await repo.get(item.key);if(r?.userId===id&&ritualArtworkReady(r)&&r.source!=='upload'&&normalizeArtStyle(r.mapping?.art_style)===currentStyle)complete.push(r);}if(!batch.cursor)break;cursor=batch.cursor;}
    const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),future=complete.filter(r=>r.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
    const selected=future.length>=2?future.slice(0,2):complete.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2).reverse();
    if(selected.length<2){await repo.put('ritual-build/'+id,{status:'waiting_for_artworks',note:'Two completed private artworks are required for the initial test cache'});continue;}
    await configureRitual(c,{id},{mode:'test',artworkIds:selected.map(r=>r.id)},{onlyIfNew:true});plan=await repo.get('ritual/'+id);
   }
   let records=await Promise.all(plan.artworkIds.map(art=>getArtwork(c,{id},art))),startsAt=plan.startsAt;
   if(plan.contentMode==='photo'){
    const pair=ritualPhotoPair(legacyPhotoIds(plan.artworkIds),plan.rotationStartDate,Date.now()),today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
    records=await Promise.all(pair.artworkIds.map(art=>getArtwork(c,{id},art)));startsAt=today+'T01:00:00+08:00';
   }
   if(records.length!==2)throw new Error('Ritual plan artwork is missing');
   if(plan.mode==='daily'&&plan.contentMode!=='photo'){
    const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10),previous=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10),matching=[];let cursor;
    // Consume the existing daily worker's archived output; never trigger paid generation here.
    for(let page=0;page<10;page++){const batch=await repo.list({prefix:'artworks/'+id+'/',limit:100,cursor});for(const item of batch.blobs){const r=await repo.get(item.key);if(ritualArtworkReady(r)&&[previous,today].includes(r.date)&&r.profileSignature&&r.profileSignature===records[0].profileSignature&&normalizeArtStyle(r.mapping?.art_style)===normalizeArtStyle(records[0].mapping?.art_style))matching.push(r);}if(!batch.cursor)break;cursor=batch.cursor;}
    const pair=[previous,today].map(date=>matching.filter(r=>r.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]);
    if(pair.every(Boolean)){records=pair;startsAt=previous+'T01:00:00+08:00';}
   }
   const personalized=records.map((record,index)=>personalizeActionOptions(record.mapping,9)[index]);
   const manifest={...plan,...(plan.contentMode==='photo'?{photoRenderVersion:'center-cover-v2'}:{}),answerLayout:'centered-reading-v2',actionSlots:9,actionVariants:5,artworkLayout:!plan.showActions?'full-frame-v2':plan.contentMode==='photo'?'photo-overlay-balanced-v4':'prayer-overlay-balanced-v4',artworkIds:records.map(r=>r.id),startsAt,anchor:plan.mode==='test'?'first_connection':'absolute',days:records.map((r,i)=>({date:r.date,artworkId:r.id,actions:personalized[i]}))};
   const signature=createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),state=await repo.get('ritual-build/'+id);
   if(mac&&ritualPublication(state)?.deviceId===mac&&ritualPublication(state)?.bindingId===bindingId&&ritualPublication(state)?.signature===signature){if(state.status!=='published')await repo.put('ritual-build/'+id,{...state,status:'published',nextAttemptAt:null});continue;}
   let prepared=state?.prepared?.signature===signature?state.prepared:null;preparedForRetry=prepared;
   async function save(next){if((await repo.get('ritual/'+id))?.revision!==plan.revision)return false;await repo.put('ritual-build/'+id,next);return true;}
   async function progress(stage,counts=null){if(!await save({...state,status:'preparing',stage,progress:counts,attemptedRevision:plan.revision,stageUpdatedAt:new Date().toISOString()}))throw new Error('Ritual plan superseded');}
   if(!prepared){
    const cacheDir=path.join(c.RITUAL_PACKAGE_CACHE_DIR||path.join(root,'.runtime','ritual-package-cache'),id);
   const bytes=await cachedRitualPackage(cacheDir,signature,async()=>{
    failureStage='images';await progress('images',{completed:0,total:2});
    tmp=await mkdtemp(path.join(os.tmpdir(),'ritual-compile-'));
    await writeFile(path.join(tmp,'plan.json'),JSON.stringify(manifest),{mode:0o600});await writeFile(path.join(tmp,'answers.json'),JSON.stringify({answers}),{mode:0o600});
    for(let i=0;i<2;i++){const image=await privateImage(c,{id},records[i]);await writeFile(path.join(tmp,`day-${i}.png`),image.bytes,{mode:0o600});await progress('images',{completed:i+1,total:2});}
    failureStage='encoding';await progress('encoding');
    await exec(c.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3',[path.join(root,'tools/build-ritual-package.py'),'--plan',path.join(tmp,'plan.json'),'--images',path.join(tmp,'day-0.png'),path.join(tmp,'day-1.png'),'--answers',path.join(tmp,'answers.json'),...(plan.contentMode==='photo'?['--cache-dir',path.join(c.RITUAL_FRAME_CACHE_DIR||path.join(root,'.runtime','ritual-frame-cache'),id)]:[]),'--out',path.join(tmp,'ritual.bin'),...(c.RITUAL_FONT?['--font',c.RITUAL_FONT]:[])],{timeout:120000,maxBuffer:100000});
    return readFile(path.join(tmp,'ritual.bin'));
   });
   failureStage='uploading';const staged=await uploadCachedRitualPackage(c,cacheDir,signature,bytes,{onProgress:counts=>progress('uploading',counts)});
    prepared={...staged,signature,manifest,preparedAt:new Date().toISOString()};preparedForRetry=prepared;
    if(!await save(stagedRitualBuild(state,prepared,{status:'ready',stage:'ready',revision:plan.revision})))continue;
   }
   if(!mac)continue;
   if(!await save(stagedRitualBuild(state,prepared,{status:'publishing',stage:'publishing',revision:plan.revision})))continue;
   failureStage='publishing';const result=await commitRitualPackage(c,mac,prepared,{beforeCommit:async()=>{const latest=await ritualDeviceForAccount(c,id);return latest?.deviceId===mac&&(latest?.bindingId||null)===bindingId&&JSON.stringify(await repo.get('ritual/'+id))===JSON.stringify(plan);}}).catch(error=>{error.packageSignature=signature;throw error;});
   if(result.superseded)continue;
   const oldPublication=ritualPublication(state)||state?.previousPublication||null,publishedAt=new Date().toISOString();
   await save({previousPublication:oldPublication?.sha256!==result.sha256?oldPublication:state?.previousPublication,prepared,publication:{deviceId:mac,bindingId,signature,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt},signature,status:'published',stage:'ready',failure:null,stageUpdatedAt:publishedAt,mode:plan.mode,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt,note:'waiting_for_device_storage_receipt'});
   console.log('Two-day ritual package published; awaiting device receipt.');
  }catch(error){const missingChunks=error.httpStatus===409&&failureStage==='publishing';if(missingChunks){preparedForRetry=null;const signature=error.packageSignature;if(signature)await resetRitualUpload(path.join(c.RITUAL_PACKAGE_CACHE_DIR||path.join(root,'.runtime','ritual-package-cache'),id),signature);}const state=await repo.get('ritual-build/'+id).catch(()=>null),failures=state?.attemptedRevision===(plan?.revision||plan?.updatedAt)?(state?.failures||0)+1:1,revision=plan?.revision||plan?.updatedAt,now=Date.now(),retry=preparedForRetry?stagedRitualBuild(state||{},preparedForRetry,{status:'retrying',stage:'retrying',revision,now}):{...state,status:'retrying',stage:'retrying',stageUpdatedAt:new Date(now).toISOString()};if((await repo.get('ritual/'+id))?.revision===plan?.revision)await repo.put('ritual-build/'+id,{...retry,...(missingChunks?{prepared:null}:{}),progress:null,failures,attemptedRevision:revision,lastAttempt:new Date(now).toISOString(),nextAttemptAt:new Date(now+Math.min(60000,15000*2**Math.min(failures-1,2))).toISOString(),failure:ritualFailure(error,failureStage),note:'Ritual task failed at '+(error.stage||failureStage)}).catch(()=>{});console.error(JSON.stringify({at:new Date().toISOString(),event:'ritual-task-retry',accountId:id,revision,stage:error.stage||failureStage,httpStatus:error.httpStatus||null,error:error.message}));}
  finally{if(tmp)await rm(tmp,{recursive:true,force:true});}
 }
 if(stop||process.argv.includes('--once'))break;
 try{await delay(15000,undefined,{signal:abort.signal});}catch{}
}while(!stop);
