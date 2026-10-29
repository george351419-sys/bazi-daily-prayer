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
import {ritualArtworkReady,ritualPublication} from '../lib/ritual.mjs';
import {publishRitualPackage} from '../lib/ritual-upload.mjs';
import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';
import {personalizeActionPlans} from '../lib/action-personalization.mjs';

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
async function saveBuild(accountId,state){await call('/api/internal/ritual-worker/accounts/'+accountId+'/build',{method:'POST',body:{state}});}

async function processAccount(accountId,deviceId){
 let state=await snapshot(accountId),plan=state.plan,prior=state.build,tmp;
 if(prior?.status==='retrying'&&prior.attemptedRevision===(plan?.revision||plan?.updatedAt)&&Date.parse(prior.nextAttemptAt)>Date.now())return;
 if(!plan){
  const complete=state.records.filter(record=>ritualArtworkReady(record)&&record.source!=='upload');
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),future=complete.filter(record=>record.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const selected=future.length>=2?future.slice(0,2):complete.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2).reverse();
  if(selected.length<2){await saveBuild(accountId,{status:'waiting_for_artworks',note:'Two completed private artworks are required'});return;}
  await call('/api/internal/ritual-worker/accounts/'+accountId+'/plan',{method:'POST',body:{mode:'test',artworkIds:selected.map(record=>record.id)}});
  state=await snapshot(accountId);plan=state.plan;prior=state.build;
 }
 let records=plan.artworkIds.map(id=>state.records.find(record=>record.id===id)).filter(Boolean),startsAt=plan.startsAt;
 if(records.length!==2)throw new Error('Ritual plan artwork is missing');
 if(plan.mode==='daily'&&plan.contentMode!=='photo'){
  const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10),previous=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const matching=state.records.filter(record=>ritualArtworkReady(record)&&[previous,today].includes(record.date)&&record.profileSignature===records[0].profileSignature);
  const pair=[previous,today].map(date=>matching.filter(record=>record.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]);
  if(pair.every(Boolean)){records=pair;startsAt=previous+'T01:00:00+08:00';}
 }
 if(plan.mode==='daily'&&plan.contentMode==='photo')startsAt=new Date(Date.now()+7*3600000).toISOString().slice(0,10)+'T01:00:00+08:00';
 const actionDays=records.map((record,index)=>personalizeActionPlans(record.mapping)[index]);
 const manifest={...plan,artworkLayout:!plan.showActions?'full-frame-v2':plan.contentMode==='photo'?'photo-v2':'scroll-v2',artworkIds:records.map(record=>record.id),startsAt,anchor:plan.mode==='test'?'first_connection':'absolute',days:records.map((record,index)=>({date:record.date,artworkId:record.id,actions:actionDays[index]}))};
 const signature=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 if(ritualPublication(prior)?.signature===signature){if(prior.status!=='published')await saveBuild(accountId,{...prior,status:'published',nextAttemptAt:null});return;}
 try{
  tmp=await mkdtemp(path.join(os.tmpdir(),'ritual-remote-'));
  await writeFile(path.join(tmp,'plan.json'),JSON.stringify(manifest),{mode:0o600});
  await writeFile(path.join(tmp,'answers.json'),JSON.stringify({answers}),{mode:0o600});
  for(let index=0;index<2;index++)await image(accountId,records[index].id,path.join(tmp,`day-${index}.png`));
  await exec(c.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3',[path.join(root,'tools/build-ritual-package.py'),'--plan',path.join(tmp,'plan.json'),'--images',path.join(tmp,'day-0.png'),path.join(tmp,'day-1.png'),'--answers',path.join(tmp,'answers.json'),'--out',path.join(tmp,'ritual.bin'),...(c.RITUAL_FONT?['--font',c.RITUAL_FONT]:[])],{timeout:120000,maxBuffer:100000});
  const result=await publishRitualPackage(c,deviceId,await readFile(path.join(tmp,'ritual.bin')),{beforeCommit:async()=>JSON.stringify((await snapshot(accountId)).plan)===JSON.stringify(plan)});
  if(result.superseded)return;
  const publication={signature,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt:new Date().toISOString()};
  await saveBuild(accountId,{previousPublication:ritualPublication(prior)?.sha256!==result.sha256?ritualPublication(prior):prior?.previousPublication,publication,signature,status:'published',mode:plan.mode,manifest,sha256:result.sha256,bytes:result.bytes,publishedAt:publication.publishedAt,note:'waiting_for_device_storage_receipt'});
  console.log('Two-day ritual package published for '+accountId+'; awaiting device receipt.');
 }catch(error){
  const failures=prior?.attemptedRevision===(plan?.revision||plan?.updatedAt)?(prior.failures||0)+1:1;
  await saveBuild(accountId,{...prior,status:'retrying',failures,attemptedRevision:plan?.revision||plan?.updatedAt,lastAttempt:new Date().toISOString(),nextAttemptAt:new Date(Date.now()+Math.min(900000,15000*2**Math.min(failures-1,6))).toISOString(),note:'Content compiler or device publisher unavailable; previous device cache retained'}).catch(()=>{});
  console.error('Ritual remote compilation deferred; retrying later.');
 }finally{if(tmp)await rm(tmp,{recursive:true,force:true});}
}

let stop=false;const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop=true;abort.abort();});
do{
 try{
  const {links}=await (await call('/api/internal/ritual-worker/links')).json();
  for(const [accountId,deviceId] of Object.entries(links))await processAccount(accountId,deviceId);
 }catch{console.error('Ritual worker bridge unavailable; retrying later.');}
 if(stop||process.argv.includes('--once'))break;
 try{await delay(15000,undefined,{signal:abort.signal});}catch{}
}while(!stop);
