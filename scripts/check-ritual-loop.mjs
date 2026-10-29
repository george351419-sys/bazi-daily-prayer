// Isolated compiler -> signed cloud -> heartbeat -> download integration. No live network or accounts.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {accountRepository,decryptAccountData} from '../lib/account-store.mjs';
import {saveArtwork,newArtworkId} from '../lib/accounts.mjs';
import {uploadPhoto} from '../lib/photos.mjs';
import {configureRitual} from '../lib/ritual.mjs';
import {handleArkCloud,provisionSignature,validateRitual} from '../lib/ark-cloud.mjs';
const tmp=await mkdtemp(path.join(os.tmpdir(),'ritual-loop-')),secret=randomBytes(32).toString('hex'),account={id:randomBytes(16).toString('hex')},deviceId='112233445566',token='c'.repeat(32),hash=b=>createHash('sha256').update(b).digest('hex');
const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:path.join(tmp,'accounts'),SESSION_SECRET:secret,RITUAL_DEVICE_LINKS:JSON.stringify({[account.id]:deviceId}),RITUAL_PUBLIC_ORIGIN:'https://playmath.cn',PRAYER_TEST_PYTHON:process.env.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3'};
const env={SESSION_SECRET:secret,ARK_PUBLIC_ORIGIN:'https://playmath.cn'},map=new Map(),store={async get(k){return map.get(k)||null;},async set(k,value,options){if(options?.onlyIfNew&&map.has(k))throw Object.assign(new Error('exists'),{code:'PRECONDITION_FAILED'});map.set(k,Buffer.from(value));}};
let calls=0,blockUploads=false;const fetcher=(url,options)=>{assert.equal(new URL(url).origin,'https://playmath.cn');calls++;if(blockUploads&&new URL(url).pathname==='/api/ark/provision')return Promise.resolve(Response.json({error:'isolated outage'},{status:503}));return handleArkCloud(new Request(url,options),env,{store});};
async function provision(body){const raw=JSON.stringify(body),exp=String(Math.floor(Date.now()/1000)+120);const r=await fetcher('https://playmath.cn/api/ark/provision',{method:'POST',headers:{'X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(secret,exp,raw)},body:raw});assert.equal(r.status,200);}
const originalFetch=globalThis.fetch,oldEnv={...process.env},oldArgs=[...process.argv];
try{
 const repo=accountRepository(c),ids=[];
 await promisify(execFile)(c.PRAYER_TEST_PYTHON,['-c',"from PIL import Image; import sys; Image.new('RGB',(480,720),'red').save(sys.argv[1]); Image.new('RGB',(480,720),'blue').save(sys.argv[2])",path.join(tmp,'one.png'),path.join(tmp,'two.png')]);
 for(const [i,file] of ['one.png','two.png'].entries()){
  const id=newArtworkId(),key='images/'+account.id+'/'+id;ids.push(id);await repo.putImage(key,await readFile(path.join(tmp,file)));await saveArtwork(c,account,{id,userId:account.id,date:'2026-10-'+(29+i),status:'complete',image:{key,type:'image/png'},mapping:{title:'隔离测试图 '+i},createdAt:new Date().toISOString()});
 }
 const film=Buffer.alloc(172832,0x11);film.fill(0,0,32);film.writeUInt32LE(172800,0);film.writeUInt16LE(720,4);film.writeUInt16LE(480,6);film[8]=6;Buffer.from([0,255,252,224,3,28]).copy(film,16);
 await provision({type:'asset',sha256:hash(film),base64:film.toString('base64')});
 await provision({type:'device',config:{deviceId,tokenHash:hash(token),enabled:true,mode:'daily',dailyAt:'01:00',startDate:'2026-10-29',playlist:[{sha256:hash(film)}]}});
 // First linked account starts the two-day test automatically, without a manual plan. 
 Object.assign(process.env,c);process.argv.push('--once');globalThis.fetch=fetcher;
 await import('./run-ritual-worker.mjs?isolated=1');
 assert.equal((await repo.get('ritual/'+account.id)).mode,'test');
 const build=await repo.get('ritual-build/'+account.id);assert.equal(build.status,'published');assert.equal(build.bytes,948608);
 const configured=JSON.parse(decryptAccountData(env,map.get('devices/'+deviceId)));assert.equal(configured.ritualSha,build.sha256);
 const heartbeat=await fetcher('https://playmath.cn/api/v1/device/heartbeat?device_id='+deviceId+'&ritual_v=1',{headers:{authorization:'Bearer '+token}});const body=await heartbeat.json();assert.equal(body.data.commands[0].cmd,'download_ritual');
 const response=await fetcher(body.data.commands[0].params.url),downloaded=Buffer.from(await response.arrayBuffer());validateRitual(downloaded);assert.equal(hash(downloaded),build.sha256);assert.equal(downloaded.readUInt32LE(12),0,'first successful device installation anchors the test');
 const before=calls;await import('./run-ritual-worker.mjs?isolated=2');assert.equal(calls,before,'unchanged plan does not re-upload');
 // A failed replacement retains the published package metadata and backs off.
 await configureRitual(c,account,{mode:'test',artworkIds:[...ids].reverse()});blockUploads=true;
 await import('./run-ritual-worker.mjs?isolated=3');
 const retry=await repo.get('ritual-build/'+account.id);assert.equal(retry.status,'retrying');assert.equal(retry.publication.sha256,build.sha256);assert.ok(Date.parse(retry.nextAttemptAt)>Date.now());
 const duringBackoff=calls;await import('./run-ritual-worker.mjs?isolated=4');assert.equal(calls,duringBackoff);
 // A fresh user revision is not trapped in a previous revision's retry delay.
 await configureRitual(c,account,{mode:'test',artworkIds:ids});blockUploads=false;
 await import('./run-ritual-worker.mjs?isolated=5');
 const replacement=await repo.get('ritual-build/'+account.id);assert.equal(replacement.status,'published');assert.equal(replacement.previousPublication.sha256,build.sha256);assert.notEqual(replacement.publication.sha256,build.sha256);
 const photo=await uploadPhoto(c,account,{type:'image/jpeg',title:'Uploaded test photo',base64:(await readFile(new URL('../tests/fixtures/photo-upload.jpg',import.meta.url))).toString('base64')});
 for(const showActions of [false,true]){
  await configureRitual(c,account,{mode:'test',contentMode:'photo',showActions,artworkIds:[photo.item.id,photo.item.id]});
  await import('./run-ritual-worker.mjs?photo='+showActions);
  const built=await repo.get('ritual-build/'+account.id);assert.equal(built.status,'published');assert.equal(built.publication.manifest.contentMode,'photo');
  const hb=await fetcher('https://playmath.cn/api/v1/device/heartbeat?device_id='+deviceId+'&ritual_v=2',{headers:{authorization:'Bearer '+token}}),reply=await hb.json();
  const asset=await fetcher(reply.data.commands[0].params.url),packet=Buffer.from(await asset.arrayBuffer());validateRitual(packet);assert.equal(packet.readUInt32LE(36),2);assert.equal(packet.readUInt32LE(60),showActions?2:3);
 }
 await configureRitual(c,account,{mode:'test',contentMode:'prayer',showActions:false,artworkIds:ids});
 await import('./run-ritual-worker.mjs?prayer=no-actions');
 const prayerBuild=await repo.get('ritual-build/'+account.id);assert.equal(prayerBuild.status,'published');
 const prayerHeartbeat=await fetcher('https://playmath.cn/api/v1/device/heartbeat?device_id='+deviceId+'&ritual_v=2',{headers:{authorization:'Bearer '+token}});
 const prayerReply=await prayerHeartbeat.json(),prayerPacket=Buffer.from(await(await fetcher(prayerReply.data.commands[0].params.url)).arrayBuffer());
 validateRitual(prayerPacket);assert.equal(prayerPacket.readUInt32LE(36),2);assert.equal(prayerPacket.readUInt32LE(60),3);
 console.log('PASS: private account plan -> real Python six-colour compiler -> signed chunk publication -> compatible heartbeat -> exact download; unchanged plan deduplicates. Failure preserves publication, retry backs off, a new revision bypasses backoff. No live requests.');
}finally{
 globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);process.argv.splice(0,process.argv.length,...oldArgs);await rm(tmp,{recursive:true,force:true});
}
