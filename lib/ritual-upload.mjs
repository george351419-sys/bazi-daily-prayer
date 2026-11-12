import {createHash} from 'node:crypto';
import {provisionSignature,validateRitual} from './ark-cloud.mjs';
import {configuredRitualDeviceLinks} from './ritual-device.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function provision(c,body,fetcher,{wait=pause,beforeAttempt=async()=>true}={}){
 if(!c.SESSION_SECRET||c.RITUAL_PUBLIC_ORIGIN!=='https://playmath.cn')throw new Error('Configure SESSION_SECRET and RITUAL_PUBLIC_ORIGIN=https://playmath.cn');
 for(let attempt=0;attempt<3;attempt++){
  try{
   if(!await beforeAttempt())return false;
   const raw=JSON.stringify(body),exp=String(Math.floor(Date.now()/1000)+240),response=await fetcher(c.RITUAL_PUBLIC_ORIGIN+'/api/ark/provision',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(c.SESSION_SECRET,exp,raw)},body:raw,signal:AbortSignal.timeout(45000)});
   // Drain responses so transient failures do not leave HTTP connections occupied.
   await response.arrayBuffer?.();
   if(!response.ok){const error=new Error('Ritual provision rejected: '+response.status);error.httpStatus=response.status;throw error;}
   return true;
  }catch(error){
   error.stage=body.type==='ritual_commit'?'publishing':'uploading';
   error.retryable=[408,429,500,502,503,504].includes(error.httpStatus)||['TypeError','TimeoutError','AbortError'].includes(error.name);
   if(!error.retryable||attempt===2)throw error;
   await wait(attempt===0?1000:3000);
  }
 }
}
export async function stageRitualPackage(c,bytes,{fetcher=fetch,onProgress=async()=>{},resume=null,onCheckpoint=async()=>{},wait=pause}={}){
 validateRitual(bytes);const hash=b=>createHash('sha256').update(b).digest('hex'),chunks=[],total=Math.ceil(bytes.length/65536);
 const sha256=hash(bytes),prior=resume?.sha256===sha256&&resume.bytes===bytes.length&&Array.isArray(resume.chunks)?resume.chunks:[];
 for(let i=0;i<prior.length&&i<total;i++){const expected=hash(bytes.subarray(i*65536,(i+1)*65536));if(prior[i]!==expected)break;chunks.push(expected);}
 await onProgress({completed:chunks.length,total});
 for(let i=chunks.length*65536;i<bytes.length;i+=65536){
  const chunk=bytes.subarray(i,i+65536),chunkSha=hash(chunk);await provision(c,{type:'ritual_chunk',sha256:chunkSha,base64:chunk.toString('base64')},fetcher,{wait});chunks.push(chunkSha);
  await onCheckpoint({sha256,bytes:bytes.length,chunks:chunks.slice()});await onProgress({completed:chunks.length,total});
 }
 return {sha256:hash(bytes),bytes:bytes.length,chunks};
}
export async function commitRitualPackage(c,deviceId,prepared,{fetcher=fetch,beforeCommit=async()=>true,wait=pause}={}){
 if(!/^[a-f0-9]{12}$/.test(deviceId)||!prepared?.chunks?.length||!/^[a-f0-9]{64}$/.test(prepared.sha256))throw new Error('Invalid device identity or prepared ritual package');
 const committed=await provision(c,{type:'ritual_commit',deviceId,sha256:prepared.sha256,chunks:prepared.chunks},fetcher,{wait,beforeAttempt:beforeCommit});
 if(!committed)return {superseded:true};
 return {sha256:prepared.sha256,bytes:prepared.bytes};
}
export async function publishRitualPackage(c,deviceId,bytes,{fetcher=fetch,beforeCommit=async()=>true}={}){
 if(!/^[a-f0-9]{12}$/.test(deviceId))throw new Error('Invalid device identity');
 const prepared=await stageRitualPackage(c,bytes,{fetcher});return commitRitualPackage(c,deviceId,prepared,{fetcher,beforeCommit});
}
export function ritualDeviceLinks(c){return configuredRitualDeviceLinks(c);}
