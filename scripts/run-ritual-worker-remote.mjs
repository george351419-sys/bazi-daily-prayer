import {compactRitualBuild,legacyPhotoIds,stagedRitualBuild} from '../lib/ritual-worker-state.mjs';
import {normalizeArtStyle} from '../lib/art-styles.mjs';
// Long-running remote worker for an HTTPS site connected to the same account store.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {answers} from '../content/ritual-content.mjs';
import {ritualArtworkReady,ritualPublication,ritualPhotoPair} from '../lib/ritual.mjs';
import {stageRitualPackage,commitRitualPackage} from '../lib/ritual-upload.mjs';
import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';
import {personalizeActionOptions} from '../lib/action-personalization.mjs';

const c={...process.env},origin=c.RITUAL_PUBLIC_ORIGIN||c.ARK_PUBLIC_ORIGIN,exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(origin!=='https://playmath.cn'||!c.SESSION_SECRET||typeof c.SESSION_SECRET!=='string'||c.SESSION_SECRET.length<20)throw new Error('Configure RITUAL_PUBLIC_ORIGIN=https://playmath.cn and the production SESSION_SECRET');

async function call(pathname,{method='GET',body}={}){
 const expires=String(Math.floor(Date.now()/1000)+120),raw=body===undefined?'':JSON.stringify(body);
 const response=await fetch(origin+pathname,{method,redirect:'error',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),'X-Ritual-Expires':expires,'X-Ritual-Signature':ritualWorkerSignature(c,method,pathname,raw)},...(body===undefined?{}:{body:raw}),signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw new Error('Ritual worker bridge rejected '+method+' '+pathname+': '+response.status);
 return response;
}
async function snapshot(accountId){return (await call('/api/internal/ritual-worker/accounts/'+accountId)).json();}
async function image(accountId,artworkId,file){const response=await call('/api/internal/ritual-worker/accounts/'+accountId+'/artworks/'+artworkId+'/image');await writeFile(file,Buffer.from(await response.arrayBuffer()),{mode:0o600});}
async function saveBuild(accountId,state,revision){return (await call('/api/internal/ritual-worker/accounts/'+accountId+'/build',{method:'POST',body:{state:compactRitualBuild(state),revision}})).json();}

async function processAccount(accountId,deviceId){
 let state=await snapshot(accountId),plan=state.plan,prior=state.build,tmp,preparedForRetry=null;
 deviceId=state.deviceId;const bindingId=state.bindingId||null;
 if(state.preparation&&!['complete','superseded'].includes(state.preparation.status)){await call('/api/internal/ritual-worker/accounts/'+accountId+'/preparation',{method:'POST',body:{}});return;}
 if(prior?.status==='retrying'&&prior.attemptedRevision===(plan?.revision||plan?.updatedAt)&&Date.parse(prior.nextAttemptAt)>Date.now())return;
 if(!plan){
  const complete=state.records.filter(record=>ritualArtworkReady(record)&&record.source!=='upload'&&normalizeArtStyle(record.mapping?.art_style)===normalizeArtStyle(state.profile?.artStyle));
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),future=complete.filter(record=>record.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const selected=future.length>=2?future.slice(0,2):complete.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2).reverse();
  if(selected.length<2){await saveBuild(accountId,{status:'waiting_for_artworks',note:'Two completed private artworks are required'});return;}
  await call('/api/internal/ritual-worker/accounts/'+accountId+'/plan',{method:'POST',body:{mode:'test',artworkIds:selected.map(record=>record.id)}});
  state=await snapshot(accountId);plan=state.plan;prior=state.build;
 }
 let records=plan.artworkIds.map(id=>state.records.find(record=>record.id===id)).filter(Boolean),startsAt=plan.startsAt;
 if(plan.contentMode==='photo'){
  const pair=ritualPhotoPair(legacyPhotoIds(plan.artworkIds),plan.rotationStartDate,Date.now()),today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  records=pair.artworkIds.map(id=>state.records.find(record=>record.id===id)).filter(Boolean);startsAt=today+'T01:00:00+08:00';
 }
 if(records.length!==2)throw new Error('Ritual plan artwork is missing');
 const actionDays=records.map((record,index)=>personalizeActionOptions(record.mapping)[index]);
 const manifest={...plan,actionVariants:5,artworkLayout:!plan.showActions?'full-frame-v2':plan.contentMode==='photo'?'photo-overlay-balanced-v4':'prayer-overlay-balanced-v4',artworkIds:records.map(record=>record.id),startsAt,anchor:plan.mode==='test'?'first_connection':'absolute',days:records.map((record,index)=>({date:record.date,artworkId:record.id,actions:actionDays[index]}))};
 const signature=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 if(deviceId&&ritualPublication(prior)?.deviceId===deviceId&&ritualPublication(prior)?.bindingId===bindingId&&ritualPublication(prior)?.signature===signature){if(prior.status!=='published')await saveBuild(accountId,{...prior,status:'published',nextAttemptAt:null});return;}
 try{
  let prepared=prior?.prepared?.signature===signature?prior.prepared:null;preparedForRetry=prepared;
  const progress=async(stage,counts=null)=>{
   const result=await saveBuild(accountId,{...prior,status:'preparing',stage,progress:counts,attemptedRevision:plan.revision,stageUpdatedAt:new Date().toISOString()},plan.revision);
   if(result.superseded)throw new Error('Ritual plan superseded');
  };
  if(!prepared){
   await progress('images',{completed:0,total:2});
   tmp=await mkdtemp(path.join(os.tmpdir(),'ritual-remote-'));
   await writeFile(path.join(tmp,'plan.json'),JSON.stringify(manifest),{mode:0o600});
   await writeFile(path.join(tmp,'answers.json'),JSON.stringify({answers}),{mode:0o600});
   for(let index=0;index<2;index++){await image(accountId,records[index].id,path.join(tmp,`day-${index}.png`));await progress('images',{completed:index+1,total:2});}
   await progress('encoding');
   await exec(c.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3',[path.join(root,'tools/build-ritual-package.py'),'--plan',path.join(tmp,'plan.json'),'--images',path.join(tmp,'day-0.png'),path.join(tmp,'day-1.png'),'--answers',path.join(tmp,'answers.json'),...(plan.contentMode==='photo'?['--cache-dir',path.join(c.RITUAL_FRAME_CACHE_DIR||path.join(root,'.runtime','ritual-frame-cache'),accountId)]:[]),'--out',path.join(tmp,'ritual.bin'),...(c.RITUAL_FONT?['--font',c.RITUAL_FONT]:[])],{timeout:120000,maxBuffer:100000});
   const staged=await stageRitualPackage(c,await readFile(path.join(tmp,'ritual.bin')),{onProgress:counts=>progress('uploading',counts)});
   prepared={...staged,signature,manifest,preparedAt:new Date().toISOString()};preparedForRetry=prepared;
   const saved=await saveBuild(accountId,stagedRitualBuild(prior,prepared,{status:'ready',stage:'ready',revision:plan.revision}),plan.revision);
   if(saved.superseded)return;
  }
  if(!deviceId)return;
  const started=await saveBuild(accountId,stagedRitualBuild(prior,prepared,{status:'publishing',stage:'publishing',revision:plan.revision}),plan.revision);
  if(started.superseded)return;
  const result=await commitRitualPackage(c,deviceId,prepared,{beforeCommit:async()=>{const latest=await snapshot(accountId);return latest.deviceId===deviceId&&latest.bindingId===bindingId&&JSON.stringify(latest.plan)===JSON.stringify(plan);}});
  if(result.superseded)return;
  const oldPublication=ritualPublication(prior)||prior?.previousPublication||null,publishedAt=new Date().toISOString();
  const publication={deviceId,bindingId,signature,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt};
  await saveBuild(accountId,{previousPublication:oldPublication?.sha256!==result.sha256?oldPublication:prior?.previousPublication,prepared,publication,signature,status:'published',stage:'ready',stageUpdatedAt:publishedAt,mode:plan.mode,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt,note:'waiting_for_device_storage_receipt'},plan.revision);
  console.log('Two-day ritual package published for '+accountId+'; awaiting device receipt.');
 }catch(error){
  const failures=prior?.attemptedRevision===(plan?.revision||plan?.updatedAt)?(prior.failures||0)+1:1,revision=plan?.revision||plan?.updatedAt,now=Date.now();
  const retry=preparedForRetry?stagedRitualBuild(prior,preparedForRetry,{status:'retrying',stage:'retrying',revision,now}):{...prior,status:'retrying',stage:'retrying',stageUpdatedAt:new Date(now).toISOString()};
  await saveBuild(accountId,{...retry,progress:null,failures,attemptedRevision:revision,lastAttempt:new Date(now).toISOString(),nextAttemptAt:new Date(now+Math.min(900000,15000*2**Math.min(failures-1,6))).toISOString(),note:'Content compiler or device publisher unavailable; previous device cache retained'},plan?.revision).catch(()=>{});
  console.error('Ritual remote compilation deferred: '+(error?.message||String(error)));
 }finally{if(tmp)await rm(tmp,{recursive:true,force:true});}
}

let stop=false;const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop=true;abort.abort();});
const onlyAccount=process.argv.find(arg=>arg.startsWith('--account='))?.slice('--account='.length);
do{
 try{
  const listing=await (await call('/api/internal/ritual-worker/links')).json();
  for(const [accountId,deviceId] of Object.entries(listing.work||listing.links)){
   if(onlyAccount&&accountId!==onlyAccount)continue;
   try{await processAccount(accountId,deviceId);}
   catch(error){console.error('Ritual account deferred for '+accountId+': '+(error?.message||String(error)));}
  }
 }catch(error){console.error('Ritual worker bridge unavailable: '+(error?.message||String(error)));}
 if(stop||process.argv.includes('--once'))break;
 try{await delay(15000,undefined,{signal:abort.signal});}catch{}
}while(!stop);
