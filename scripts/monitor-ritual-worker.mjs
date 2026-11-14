import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';
import {ritualWorkerAlerts,loadAlertState,saveAlertState,reconcileAlerts,createAlertSender} from '../lib/ritual-worker-alerts.mjs';

const c={...process.env},root=path.resolve(c.RITUAL_STATE_DIR||'.runtime/worker');
const stateFile=path.join(root,'alerts.json');
const origin=c.RITUAL_PUBLIC_ORIGIN||'https://playmath.cn';
if(origin!=='https://playmath.cn')throw new Error('Invalid Worker origin');
const minutes=(key,fallback)=>{const value=Number(c[key]||fallback);if(!Number.isFinite(value)||value<1)throw new Error('Invalid monitor interval: '+key);return value;};
const options={preparationGraceMinutes:minutes('RITUAL_PREPARATION_GRACE_MINUTES',30),publicationGraceMinutes:minutes('RITUAL_PUBLICATION_GRACE_MINUTES',20),receiptGraceMinutes:minutes('RITUAL_RECEIPT_GRACE_MINUTES',30)};
async function call(pathname,{method='GET',body}={}){
 const raw=body===undefined?'':JSON.stringify(body);
 const response=await fetch(origin+pathname,{method,...(body===undefined?{}:{body:raw}),redirect:'error',headers:{'Content-Type':'application/json','X-Ritual-Expires':String(Math.floor(Date.now()/1000)+120),'X-Ritual-Signature':ritualWorkerSignature(c,method,pathname,raw)},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('Monitor bridge status '+response.status);
 return response.json();
}
const remote=c.RITUAL_MONITOR_REMOTE_STATE==='1';
const previous=remote?((await call('/api/internal/ritual-worker/state/monitor')).active||{}):await loadAlertState(stateFile),issues=[],events=[];
let healthy=true;
if(remote){
 const scheduler=await call('/api/internal/ritual-worker/state/scheduler');
 if(!scheduler.lastTickAt||Date.now()-Date.parse(scheduler.lastTickAt)>20*60000){healthy=false;issues.push({key:'worker:stalled',kind:'worker_stalled',message:'云端调度超过20分钟未完成账户检查，请检查SCF定时触发器、并发额度和执行日志。'});}
}
if(!remote)try{
 const heartbeat=JSON.parse(await readFile(path.join(root,'heartbeat.json'),'utf8'));
 if(Date.now()-Date.parse(heartbeat.at)>20*60000)throw new Error('stale');
}catch{healthy=false;issues.push({key:'worker:stalled',kind:'worker_stalled',message:'Worker 超过20分钟没有推进；请检查服务、网络和日志。'});}
try{
 const listing=await call('/api/internal/ritual-worker/links');
 // Only bound accounts need device delivery monitoring. Dormant test accounts
 // must not flood notifications or delay the monitor.
 const entries=Object.entries(listing.work||listing.links||{}).filter(([id,device])=>!!device&&(!c.RITUAL_WORKER_ACCOUNT||id===c.RITUAL_WORKER_ACCOUNT));
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,entries.length)},async()=>{
  while(cursor<entries.length){
   const [id]=entries[cursor++];
   try{
    const state=await call('/api/internal/ritual-worker/accounts/'+id);
    issues.push(...ritualWorkerAlerts(state,options));
   }catch{
    healthy=false;
    // A failed query is unknown, not recovery of previous incidents.
    issues.push(...Object.values(previous).filter(old=>old.accountId===id&&old.kind!=='account_query_failed'));
    issues.push({key:id+':query',kind:'account_query_failed',accountId:id,message:'无法读取账户计划和设备回报，请检查 API。'});
   }
  }
 }));
}catch{
 healthy=false;issues.push(...Object.values(previous).filter(old=>old.accountId));
 issues.push({key:'worker:bridge',kind:'bridge_unavailable',message:'独立巡检无法连接画屏后台。'});
}
const send=createAlertSender(c);
const next=await reconcileAlerts(previous,issues,{repeatMs:minutes('RITUAL_ALERT_REPEAT_MINUTES',360)*60000,send:async issue=>{
 try{await send(issue);events.push(issue);}catch{healthy=false;console.error(JSON.stringify({event:'ritual-alert-delivery-failed',kind:issue.kind}));throw new Error('delivery');}
}});
if(remote)await call('/api/internal/ritual-worker/state/monitor',{method:'POST',body:{active:next,events}});
else await saveAlertState(stateFile,next);
console.log(JSON.stringify({event:'ritual-monitor-complete',at:new Date().toISOString(),active:Object.keys(next).length,healthy,provider:c.RITUAL_ALERT_PROVIDER||'log'}));
// Configure an external dead-man monitor to catch whole-host outages. The URL
// is a secret and is never written to logs.
if(healthy&&c.RITUAL_MONITOR_PING_URL){
 const url=new URL(c.RITUAL_MONITOR_PING_URL);if(url.protocol!=='https:')throw new Error('Monitor ping must use HTTPS');
 try{const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});await response.arrayBuffer();if(!response.ok)throw new Error('ping');}
 catch{console.error('External monitor ping failed');process.exitCode=1;}
}
