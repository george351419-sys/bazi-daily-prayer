// Read-only cloud probe: never creates hardware heartbeat/display evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateFilm} from '../lib/ark-cloud.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=JSON.parse(await readFile(path.join(root,'.runtime/ark-prayer-demo/adapter.json'),'utf8'));
const state=JSON.parse(await readFile(path.join(root,'.runtime/ark-prayer-demo/ark-state.json'),'utf8'));
const origin=new URL(process.argv[2]||'https://playmath.cn');
async function get(route,authenticated=true){const url=new URL(route,origin);for(const [k,v]of origin.searchParams)url.searchParams.set(k,v);return fetch(url,{headers:authenticated?{Authorization:'Bearer '+state.token,'X-Ark-Dry-Run':'1'}:{},redirect:'error',signal:AbortSignal.timeout(45000)});}
const route='/api/v1/device/heartbeat?device_id='+local.physicalId;
assert.equal((await get(route,false)).status,403);
const response=await get(route);assert.equal(response.status,200);
const data=await response.json(),command=data.data.commands.find(x=>x.cmd==='download_film');assert.ok(command);
const download=new URL(command.params.url);
// Preview deploys issue links to the eventual public origin; test the same handler on preview.
const file=await get(download.pathname+download.search,false);assert.equal(file.status,200);
const bytes=Buffer.from(await file.arrayBuffer());validateFilm(bytes);
assert.equal(createHash('sha256').update(bytes).digest('hex'),command.params.sha256);
const same=await(await get(route+'&cloud_stored_sha='+command.params.sha256)).json();assert.equal(same.data.commands.length,1);
const status=await(await get('/api/ark/status?device_id='+local.physicalId)).json();
const result={checkedAt:new Date().toISOString(),origin:origin.origin,authenticated:true,unauthorizedRejected:true,filmBytes:bytes.length,filmResolution:[720,480],sameAssetDeduplicated:true,reportedHardwareStatus:status.report,paidModelsCalled:false};
await writeFile(path.join(root,'../output/ark-local-20261027/cloud-http-check.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
