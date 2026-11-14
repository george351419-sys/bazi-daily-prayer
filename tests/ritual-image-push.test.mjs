import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const exec=promisify(execFile),script=fileURLToPath(new URL('../scripts/push-ritual-image.sh',import.meta.url));
async function setup(t,failures,badDigest=false){
 const dir=await mkdtemp(path.join(os.tmpdir(),'image-push-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(path.join(dir,'timeout'),'#!/bin/sh\nshift 3\nexec "$@"\n',{mode:0o755});
 await writeFile(path.join(dir,'sleep'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 await writeFile(path.join(dir,'docker'),`#!/usr/bin/env node
 const fs=require('node:fs'),args=process.argv.slice(2),counter=process.env.MOCK_COUNTER;
 if(args[0]==='push'){let count=0;try{count=Number(fs.readFileSync(counter,'utf8'));}catch{}fs.writeFileSync(counter,String(count+1));process.exit(count<Number(process.env.MOCK_FAILURES)?1:0);}
 if(args[0]==='image'&&args[1]==='inspect'){console.log(JSON.stringify([process.env.IMAGE_REPOSITORY+'@'+(process.env.MOCK_BAD==='1'?'invalid':'sha256:'+'a'.repeat(64))]));process.exit(0);}
 process.exit(2);
`,{mode:0o755});
 return {dir,env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,IMAGE_REPOSITORY:'ccr.ccs.tencentyun.com/bazi-prayer-worker/ritual-worker',IMAGE_TAG:'ccr.ccs.tencentyun.com/bazi-prayer-worker/ritual-worker:commit',GITHUB_OUTPUT:path.join(dir,'output'),MOCK_COUNTER:path.join(dir,'counter'),MOCK_FAILURES:String(failures),MOCK_BAD:badDigest?'1':'0'}};
}
test('upload retries the existing image after a network failure and records the uploaded registry digest',async t=>{
 const {dir,env}=await setup(t,1);await exec('bash',[script],{env});assert.equal(await readFile(path.join(dir,'counter'),'utf8'),'2');assert.equal((await readFile(env.GITHUB_OUTPUT,'utf8')).trim(),'digest=sha256:'+'a'.repeat(64));
});
test('persistent upload failure is bounded to two attempts and never writes a success digest',async t=>{
 const {dir,env}=await setup(t,10);await assert.rejects(exec('bash',[script],{env}));assert.equal(await readFile(path.join(dir,'counter'),'utf8'),'2');await assert.rejects(readFile(env.GITHUB_OUTPUT),{code:'ENOENT'});
});
test('an image config ID or malformed digest cannot masquerade as a published manifest',async t=>{
 const {dir,env}=await setup(t,0,true);await assert.rejects(exec('bash',[script],{env}),error=>error.stderr.includes('Uploaded manifest digest is missing'));assert.equal(await readFile(path.join(dir,'counter'),'utf8'),'1');await assert.rejects(readFile(env.GITHUB_OUTPUT),{code:'ENOENT'});
});
