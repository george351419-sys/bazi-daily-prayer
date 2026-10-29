// Explicit signed deployment tool. Does not replace credentials or grant account ownership.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {provisionSignature,validateRitual} from '../lib/ark-cloud.mjs';
const [file,deviceId,base='https://playmath.cn']=process.argv.slice(2);
if(!file||!/^[a-f0-9]{12}$/.test(deviceId||'')||!process.env.SESSION_SECRET)throw new Error('Usage: SESSION_SECRET=… node scripts/upload-ritual.mjs package.bin deviceMac [https origin]');
const origin=new URL(base);if(origin.protocol!=='https:')throw new Error('HTTPS required');
const bytes=await readFile(file);validateRitual(bytes);const hash=b=>createHash('sha256').update(b).digest('hex');
async function send(body){const raw=JSON.stringify(body),exp=String(Math.floor(Date.now()/1000)+240),response=await fetch(new URL('/api/ark/provision',origin),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(process.env.SESSION_SECRET,exp,raw)},body:raw,signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error('Ritual provision failed: '+response.status);}
const chunks=[];for(let i=0;i<bytes.length;i+=65536){const chunk=bytes.subarray(i,i+65536),sha256=hash(chunk);await send({type:'ritual_chunk',sha256,base64:chunk.toString('base64')});chunks.push(sha256);}
await send({type:'ritual_commit',deviceId,sha256:hash(bytes),chunks});console.log('Ritual package published; storage receipt and physical display acceptance are still required.');
