import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
async function fixture(t,{broken=false}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'install-recovery-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of ['lib','scripts'])await mkdir(path.join(root,dir));
 await writeFile(path.join(root,'worker.env'),'KEEP_PRIVATE_CONFIGURATION');await writeFile(path.join(root,'package.json'),' {"type":"module"}');
 await writeFile(path.join(root,'lib/ark-cloud.mjs'),broken?'export const broken=true;':'export const provisionSignature=()=>"";export const validateRitual=()=>{};');
 await writeFile(path.join(root,'lib/ritual-device.mjs'),'export const configuredRitualDeviceLinks=()=>({});');
 await writeFile(path.join(root,'scripts/run-ritual-worker-remote.mjs'),'// previous runtime worker\n');
 const run=(...args)=>execFileSync(process.execPath,['scripts/install-ritual-upload-recovery.mjs','--runtime='+root,...args],{encoding:'utf8',stdio:'pipe'});
 return{root,run};
}
test('coherent recovery installer backs up files, preserves configuration and can be repeated',async t=>{
 const {root,run}=await fixture(t);run('--check');assert.equal(await readFile(path.join(root,'scripts/run-ritual-worker-remote.mjs'),'utf8'),'// previous runtime worker\n');
 run('--no-restart');assert.match(await readFile(path.join(root,'scripts/run-ritual-worker-remote.mjs'),'utf8'),/uploadCachedRitualPackage/);
 assert.equal(await readFile(path.join(root,'worker.env'),'utf8'),'KEEP_PRIVATE_CONFIGURATION');
 const [backup]=await readdir(path.join(root,'.runtime/upload-recovery-backups'));
 assert.equal(await readFile(path.join(root,'.runtime/upload-recovery-backups',backup,'scripts/run-ritual-worker-remote.mjs'),'utf8'),'// previous runtime worker\n');run('--no-restart');
});
test('failed import validation restores previous runtime files',async t=>{
 const {root,run}=await fixture(t,{broken:true});assert.throws(()=>run('--no-restart'));
 assert.equal(await readFile(path.join(root,'scripts/run-ritual-worker-remote.mjs'),'utf8'),'// previous runtime worker\n');await assert.rejects(access(path.join(root,'lib/ritual-package-cache.mjs')));
});
