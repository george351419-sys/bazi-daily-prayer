import {createHash} from 'node:crypto';
import {provisionSignature,validateRitual} from './ark-cloud.mjs';
import {configuredRitualDeviceLinks} from './ritual-device.mjs';
async function provision(c,body,fetcher){
 if(!c.SESSION_SECRET||c.RITUAL_PUBLIC_ORIGIN!=='https://playmath.cn')throw new Error('Configure SESSION_SECRET and RITUAL_PUBLIC_ORIGIN=https://playmath.cn');
 const raw=JSON.stringify(body),exp=String(Math.floor(Date.now()/1000)+240),response=await fetcher(c.RITUAL_PUBLIC_ORIGIN+'/api/ark/provision',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(c.SESSION_SECRET,exp,raw)},body:raw,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('Ritual provision rejected: '+response.status);
}
export async function stageRitualPackage(c,bytes,{fetcher=fetch,onProgress=async()=>{}}={}){
 validateRitual(bytes);const hash=b=>createHash('sha256').update(b).digest('hex'),chunks=[],total=Math.ceil(bytes.length/65536);
 await onProgress({completed:0,total});
 for(let i=0;i<bytes.length;i+=65536){const chunk=bytes.subarray(i,i+65536),sha256=hash(chunk);await provision(c,{type:'ritual_chunk',sha256,base64:chunk.toString('base64')},fetcher);chunks.push(sha256);await onProgress({completed:chunks.length,total});}
 return {sha256:hash(bytes),bytes:bytes.length,chunks};
}
export async function commitRitualPackage(c,deviceId,prepared,{fetcher=fetch,beforeCommit=async()=>true}={}){
 if(!/^[a-f0-9]{12}$/.test(deviceId)||!prepared?.chunks?.length||!/^[a-f0-9]{64}$/.test(prepared.sha256))throw new Error('Invalid device identity or prepared ritual package');
 if(!await beforeCommit())return {superseded:true};
 await provision(c,{type:'ritual_commit',deviceId,sha256:prepared.sha256,chunks:prepared.chunks},fetcher);
 return {sha256:prepared.sha256,bytes:prepared.bytes};
}
export async function publishRitualPackage(c,deviceId,bytes,{fetcher=fetch,beforeCommit=async()=>true}={}){
 if(!/^[a-f0-9]{12}$/.test(deviceId))throw new Error('Invalid device identity');
 const prepared=await stageRitualPackage(c,bytes,{fetcher});return commitRitualPackage(c,deviceId,prepared,{fetcher,beforeCommit});
}
export function ritualDeviceLinks(c){return configuredRitualDeviceLinks(c);}
