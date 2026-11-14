import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';
const c={...process.env};
async function call(path){
 const response=await fetch('https://playmath.cn'+path,{headers:{'X-Ritual-Expires':String(Math.floor(Date.now()/1000)+120),'X-Ritual-Signature':ritualWorkerSignature(c,'GET',path)},redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('Cloud state status '+response.status);return response.json();
}
const scheduler=await call('/api/internal/ritual-worker/state/scheduler'),monitor=await call('/api/internal/ritual-worker/state/monitor');
console.log(JSON.stringify({scheduler,monitor},null,2));
if(c.RITUAL_WORKER_ACCOUNT){
 if(!/^[a-f0-9]{32}$/.test(c.RITUAL_WORKER_ACCOUNT))throw new Error('Invalid account');
 const s=await call('/api/internal/ritual-worker/accounts/'+c.RITUAL_WORKER_ACCOUNT),p=s.build?.publication;
 console.log(JSON.stringify({plan:s.plan,preparation:s.preparation?.status,build:s.build?.status,publication:{sha256:p?.sha256,dates:p?.manifest?.days?.map(d=>d.date),publishedAt:p?.publishedAt},deviceReport:{targetSha:s.deviceReport?.targetSha,stored:s.deviceReport?.stored,lastSeen:s.deviceReport?.lastSeen}},null,2));
}
