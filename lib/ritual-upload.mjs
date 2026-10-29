import {createHash} from 'node:crypto';
import {provisionSignature,validateRitual} from './ark-cloud.mjs';
export async function publishRitualPackage(c,deviceId,bytes,{fetcher=fetch,beforeCommit=async()=>true}={}){
 if(!/^[a-f0-9]{12}$/.test(deviceId)||!c.SESSION_SECRET||c.RITUAL_PUBLIC_ORIGIN!=='https://playmath.cn')throw new Error('Configure device identity, SESSION_SECRET and RITUAL_PUBLIC_ORIGIN=https://playmath.cn');
 validateRitual(bytes);const hash=b=>createHash('sha256').update(b).digest('hex');
 async function send(body){const raw=JSON.stringify(body),exp=String(Math.floor(Date.now()/1000)+240),response=await fetcher(c.RITUAL_PUBLIC_ORIGIN+'/api/ark/provision',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(c.SESSION_SECRET,exp,raw)},body:raw,signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error('Ritual provision rejected: '+response.status);}
 const chunks=[];for(let i=0;i<bytes.length;i+=65536){const chunk=bytes.subarray(i,i+65536),sha256=hash(chunk);await send({type:'ritual_chunk',sha256,base64:chunk.toString('base64')});chunks.push(sha256);}
 if(!await beforeCommit())return {superseded:true};
 const sha256=hash(bytes);await send({type:'ritual_commit',deviceId,sha256,chunks});return {sha256,bytes:bytes.length};
}
export function ritualDeviceLinks(c){
 const links=JSON.parse(c.RITUAL_DEVICE_LINKS||'{}');if(!links||Array.isArray(links)||typeof links!=='object'||Object.entries(links).some(([user,mac])=>!/^[a-f0-9]{32}$/.test(user)||!/^[a-f0-9]{12}$/.test(mac))||new Set(Object.values(links)).size!==Object.values(links).length)throw new Error('Invalid ritual account/device mapping');return links;
}
