// Signed, existing-artwork-only import. Requires the project's stable SESSION_SECRET.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {provisionSignature} from '../lib/ark-cloud.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'.runtime/ark-cloud-upload');
if(!process.env.SESSION_SECRET)throw new Error('Project SESSION_SECRET required; never put it in arguments.');
const origin=new URL(process.argv[2]||'https://playmath.cn');
if(origin.protocol!=='https:')throw new Error('HTTPS required');
const config=JSON.parse(await readFile(path.join(dir,'device.json'),'utf8'));
async function upload(body){
 const raw=JSON.stringify(body),exp=String(Math.floor(Date.now()/1000)+240);
 const url=new URL('/api/ark/provision',origin);for(const [k,v]of origin.searchParams)url.searchParams.set(k,v);
 const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(process.env.SESSION_SECRET,exp,raw)},body:raw,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('Import rejected with HTTP '+response.status);
}
for(const asset of config.playlist){const bytes=await readFile(path.join(dir,asset.sha256+'.film'));await upload({type:'asset',sha256:asset.sha256,base64:bytes.toString('base64')});}
await upload({type:'device',config});
console.log('Imported three private existing-artwork assets and one device into '+origin.origin+'. No model calls.');
