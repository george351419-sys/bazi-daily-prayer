// Install a coherent transport/cache/worker update; never read or replace worker.env.
import {readFile,writeFile,mkdir,rename,rm,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.resolve(process.argv.find(a=>a.startsWith('--runtime='))?.slice(10)||'/Users/bessie/ritual-worker-runtime/命理唐卡/daily-prayer-web');
await access(path.join(runtime,'worker.env'));
const files=['lib/ritual-upload.mjs','lib/ritual-package-cache.mjs','lib/ritual-worker-state.mjs','scripts/run-ritual-worker-remote.mjs','scripts/run-ritual-worker.mjs'];
const changes=[];
for(const file of files){
 const next=await readFile(path.join(source,file)),target=path.join(runtime,file);let old=null;
 try{old=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
 execFileSync(process.execPath,['--check','--input-type=module'],{input:next,stdio:'pipe'});
 if(!old||!old.equals(next))changes.push({file,target,old,next});
}
if(process.argv.includes('--check')){console.log('Upload recovery preflight passed: '+changes.map(c=>c.file).join(', '));process.exit(0);}
const backup=path.join(runtime,'.runtime','upload-recovery-backups',Date.now()+'-'+randomBytes(3).toString('hex'));
await mkdir(backup,{recursive:true,mode:0o700});
for(const c of changes)if(c.old){const file=path.join(backup,c.file);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,c.old,{mode:0o600});}
try{
 for(const c of changes){await mkdir(path.dirname(c.target),{recursive:true});const tmp=c.target+'.recovery-tmp';await writeFile(tmp,c.next,{mode:0o600});await rename(tmp,c.target);}
 execFileSync(process.execPath,['--input-type=module','-e','await import("./lib/ritual-package-cache.mjs"); await import("./lib/ritual-worker-state.mjs");'],{cwd:runtime,stdio:'pipe'});
}catch(error){for(const c of changes){if(c.old)await writeFile(c.target,c.old);else await rm(c.target,{force:true});}throw error;}
if(!process.argv.includes('--no-restart'))execFileSync('launchctl',['kickstart','-k','gui/'+process.getuid()+'/com.playmath.ritual-worker'],{stdio:'inherit'});
console.log('Upload recovery installed; '+(process.argv.includes('--no-restart')?'restart skipped':'Worker restart requested')+'. Backup: '+backup);
