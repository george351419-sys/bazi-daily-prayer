import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stageRitualPackage,commitRitualPackage} from '../lib/ritual-upload.mjs';
import {cachedRitualPackage,uploadCachedRitualPackage,resetRitualUpload} from '../lib/ritual-package-cache.mjs';
import {packageFixture} from './fixtures/ritual-package.mjs';
import {transferStatus,withConnection} from '../public/transfer-status.js';
const c={SESSION_SECRET:'test-upload-recovery-secret-12345',RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'},wait=async()=>{},hash=b=>createHash('sha256').update(b).digest('hex');
test('transient 502 retries only the failing chunk, and reads response bodies',async()=>{
 const bytes=packageFixture(),counts=new Map();let drained=0,failed=false;
 await stageRitualPackage(c,bytes,{wait,fetcher:async(url,options)=>{const body=JSON.parse(options.body);counts.set(body.sha256,(counts.get(body.sha256)||0)+1);if(!failed){failed=true;return{ok:false,status:502,arrayBuffer:async()=>{drained++;}};}return{ok:true,status:200,arrayBuffer:async()=>{drained++;}};}});
 const first=hash(bytes.subarray(0,65536));let baseline=0;for(let i=0;i<bytes.length;i+=65536)if(hash(bytes.subarray(i,i+65536))===first)baseline++;assert.equal(counts.get(first),baseline+1);assert.equal(drained,Math.ceil(bytes.length/65536)+1);
});
test('permanent authentication errors do not retry',async()=>{
 let calls=0;await assert.rejects(stageRitualPackage(c,packageFixture(),{wait,fetcher:async()=>{calls++;return Response.json({}, {status:403});}}),error=>error.httpStatus===403&&error.retryable===false&&error.stage==='uploading');assert.equal(calls,1);
});
test('compiled bytes and confirmed chunks survive a failed upload and process restart',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-upload-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const signature='a'.repeat(64),fixture=packageFixture();let compiled=0;
 const compile=async()=>{compiled++;return fixture;};const bytes=await cachedRitualPackage(dir,signature,compile);let successful=0,failingHash;
 await assert.rejects(uploadCachedRitualPackage(c,dir,signature,bytes,{wait,fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(successful===2){failingHash=body.sha256;return Response.json({}, {status:502});}successful++;return Response.json({ok:true});}}),error=>error.httpStatus===502);
 const again=await cachedRitualPackage(dir,signature,compile);const sent=[];
 const staged=await uploadCachedRitualPackage(c,dir,signature,again,{wait,fetcher:async(url,options)=>{sent.push(JSON.parse(options.body).sha256);return Response.json({ok:true});}});
 assert.equal(compiled,1);assert.equal(sent.length,Math.ceil(fixture.length/65536)-2);assert.equal(sent[0],failingHash);assert.equal(staged.sha256,hash(fixture));
 await resetRitualUpload(dir,signature);let resent=0;await uploadCachedRitualPackage(c,dir,signature,again,{wait,fetcher:async()=>{resent++;return Response.json({ok:true});}});assert.equal(resent,Math.ceil(fixture.length/65536));
 await writeFile(path.join(dir,signature+'.bin'),'corrupt');await cachedRitualPackage(dir,signature,compile);assert.equal(compiled,2);
});
test('commit rechecks plan and binding before every retry',async()=>{
 let current=true,calls=0,checks=0;const prepared={sha256:'a'.repeat(64),bytes:100,chunks:['b'.repeat(64)]};
 const result=await commitRitualPackage(c,'112233445566',prepared,{wait,beforeCommit:async()=>{checks++;return current;},fetcher:async()=>{calls++;current=false;return Response.json({}, {status:502});}});
 assert.deepEqual(result,{superseded:true});assert.equal(calls,1);assert.equal(checks,2);
});
test('ready content reports upload/publication failure rather than photo preparation or reconnection',()=>{
 for(const stage of ['uploading','publishing']){
  const status={syncConfigured:true,plan:{revision:'new'},preparation:{ready:true},build:{status:'retrying',attemptedRevision:'new',failure:{stage,httpStatus:502}}};
  const state=transferStatus(status);assert.match(state.title,stage==='uploading'?/上传失败/:/发布失败/);assert.equal(state.action,null);assert.match(state.detail,/无需重新上传/);
  assert.equal(withConnection(state,status,{paired:true,wifiConnected:true}).title,state.title);
 }
});
