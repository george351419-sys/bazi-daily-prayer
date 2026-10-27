// Change only the isolated trial's schedule; no redeploy or paid models.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {provisionSignature} from '../lib/ark-cloud.mjs';
const mode=process.argv[2];if(!['test','daily'].includes(mode))throw new Error('Usage: test|daily');
if(!process.env.SESSION_SECRET)throw new Error('Project SESSION_SECRET required');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(path.join(root,'.runtime/ark-cloud-upload/device.json'),'utf8'));
const raw=JSON.stringify({type:'schedule',deviceId:config.deviceId,mode,testStart:new Date().toISOString()});
const expires=String(Math.floor(Date.now()/1000)+240);
const response=await fetch('https://playmath.cn/api/ark/provision',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Ark-Expires':expires,'X-Ark-Signature':provisionSignature(process.env.SESSION_SECRET,expires,raw)},body:raw,signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error('Schedule update failed: HTTP '+response.status);
console.log(mode==='daily'?'Cloud trial: daily at 01:00 Asia/Shanghai.':'Cloud trial: existing-artwork targets every 5 minutes.');
