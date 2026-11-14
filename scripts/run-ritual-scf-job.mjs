import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';
import {runCloudTick} from '../lib/ritual-cloud-tick.mjs';

const c={...process.env},mode=c.RITUAL_SCF_MODE||'probe';
if(!['probe','worker','monitor'].includes(mode))throw new Error('Invalid SCF mode');
if(c.RITUAL_WORKER_ACCOUNT&&!/^[a-f0-9]{32}$/.test(c.RITUAL_WORKER_ACCOUNT))throw new Error('Invalid SCF account');
if(c.RITUAL_PUBLIC_ORIGIN!=='https://playmath.cn')throw new Error('Invalid SCF origin');
async function call(pathname,{method='GET',body}={}){
 const raw=body===undefined?'':JSON.stringify(body);
 const response=await fetch(c.RITUAL_PUBLIC_ORIGIN+pathname,{method,redirect:'error',headers:{'Content-Type':'application/json','X-Ritual-Expires':String(Math.floor(Date.now()/1000)+120),'X-Ritual-Signature':ritualWorkerSignature(c,method,pathname,raw)},...(body===undefined?{}:{body:raw}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('SCF bridge status '+response.status);
 return response.json();
}
function child(script,args,env,timeout){
 return new Promise((resolve,reject)=>{
  const proc=spawn(process.execPath,[script,...args],{env,stdio:'inherit',detached:true});let force;
  const stop=()=>{try{process.kill(-proc.pid,'SIGTERM');}catch{}force=setTimeout(()=>{try{process.kill(-proc.pid,'SIGKILL');}catch{}},3000);};
  const timer=setTimeout(stop,timeout);
  proc.on('error',error=>{clearTimeout(timer);clearTimeout(force);reject(error);});
  proc.on('exit',code=>{clearTimeout(timer);clearTimeout(force);code===0?resolve():reject(new Error('SCF child failed'));});
 });
}
const dir=await mkdtemp(path.join(tmpdir(),'ritual-scf-'));
const env={...c,RITUAL_STATE_DIR:dir,RITUAL_PACKAGE_CACHE_DIR:path.join(dir,'packages'),RITUAL_FRAME_CACHE_DIR:path.join(dir,'frames'),RITUAL_MONITOR_REMOTE_STATE:'1',RITUAL_ALERT_PROVIDER:'log',RITUAL_SINGLE_PREPARATION_STEP:'1',RITUAL_WORKER_STRICT_EXIT:'1'};
try{
 if(mode==='monitor'){
  await child('scripts/monitor-ritual-worker.mjs',[],env,240000);
 }else{
  const listing=await call('/api/internal/ritual-worker/links');
  const scheduler=await call('/api/internal/ritual-worker/state/scheduler');
  await call('/api/internal/ritual-worker/state/monitor');
  const entries=Object.entries(listing.work||listing.links||{}).filter(([id])=>!c.RITUAL_WORKER_ACCOUNT||id===c.RITUAL_WORKER_ACCOUNT);
  if(mode==='probe'){
   console.log(JSON.stringify({event:'ritual-scf-probe-passed',accounts:entries.length,mode:'read-only'}));
  }else{
   const results=await runCloudTick({entries,cursor:scheduler.cursor,maxAccounts:Number(c.RITUAL_SCF_MAX_ACCOUNTS||2),
    run:(id,timeout)=>child('scripts/run-ritual-worker-remote.mjs',['--once','--account='+id],env,timeout),
    save:body=>call('/api/internal/ritual-worker/state/scheduler',{method:'POST',body})});
   console.log(JSON.stringify({event:'ritual-scf-tick-complete',results}));
   if(results.some(r=>r.status==='failed'))process.exitCode=1;
  }
 }
}finally{await rm(dir,{recursive:true,force:true});}
