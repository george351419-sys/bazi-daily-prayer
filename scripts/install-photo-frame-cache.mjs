// Update only the photo compiler and cache arguments; preserve newer runtime worker logic.
import {readFile,writeFile,mkdir,rename,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.resolve(process.argv.find(a=>a.startsWith('--runtime='))?.slice(10)||'/Users/bessie/ritual-worker-runtime/命理唐卡/daily-prayer-web');
const checking=process.argv.includes('--check');
await access(path.join(runtime,'worker.env')); // Existence only: never read configuration secrets.
const changes=[];
for(const [file,account] of [['scripts/run-ritual-worker-remote.mjs','accountId'],['scripts/run-ritual-worker.mjs','id']]){
 const target=path.join(runtime,file);let old;
 try{old=await readFile(target,'utf8');}catch(error){if(error.code==='ENOENT'&&account==='id')continue;throw error;}
 let next=old;
 if(!old.includes("'--cache-dir'")){
  const needle="'--answers',path.join(tmp,'answers.json'),'--out'";
  if(old.split(needle).length!==2)throw new Error('Cannot safely patch '+file+'; runtime format differs. No files changed.');
  next=old.replace(needle,"'--answers',path.join(tmp,'answers.json'),...(plan.contentMode==='photo'?['--cache-dir',path.join(c.RITUAL_FRAME_CACHE_DIR||path.join(root,'.runtime','ritual-frame-cache'),"+account+")]:[]),'--out'");
 }else if(!old.includes('RITUAL_FRAME_CACHE_DIR'))throw new Error('Unknown existing cache configuration in '+file+'; no files changed.');
 next=next.replace("photoRenderVersion:'center-cover-v2'","photoRenderVersion:'source-only-center-v3'");
 if(!next.includes("photoRenderVersion:'source-only-center-v3'")){
  const marker='const manifest={...plan,';
  if(next.includes('photoRenderVersion')||next.split(marker).length!==2)throw new Error('Cannot safely update photo render version in '+file+'; no files changed.');
  next=next.replace(marker,"const manifest={...plan,...(plan.contentMode==='photo'?{photoRenderVersion:'source-only-center-v3'}:{}),");
 }
 execFileSync(process.execPath,['--check','--input-type=module'],{input:next,stdio:['pipe','pipe','pipe']});
 if(next!==old)changes.push({file,target,old:Buffer.from(old),next:Buffer.from(next)});
}
for(const file of ['tools/build-ritual-package.py','tools/ritual_frame_cache.py']){
 const next=await readFile(path.join(source,file)),target=path.join(runtime,file);let old=null;
 try{old=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
 execFileSync(process.env.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3',['-c','import sys; compile(sys.stdin.read(), "photo-cache", "exec")'],{input:next,stdio:['pipe','pipe','pipe']});
 if(!old||!old.equals(next))changes.push({file,target,old,next});
}
if(checking){console.log('Worker preflight passed. Files to update: '+changes.map(c=>c.file).join(', '));process.exit(0);}
const backup=path.join(runtime,'.runtime','cache-install-backups',String(Date.now()));
await mkdir(backup,{recursive:true,mode:0o700});
for(const change of changes)if(change.old){const dest=path.join(backup,change.file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,change.old,{mode:0o600});}
try{
 for(const change of changes){await mkdir(path.dirname(change.target),{recursive:true});const temp=change.target+'.photo-cache-tmp';await writeFile(temp,change.next,{mode:0o600});await rename(temp,change.target);}
 // Import without starting the worker or reading worker.env.
 execFileSync(process.env.PRAYER_TEST_PYTHON||'/opt/homebrew/bin/python3',['-c','import sys; sys.path.insert(0,sys.argv[1]); import ritual_frame_cache',path.join(runtime,'tools')],{cwd:runtime,stdio:'pipe'});
}catch(error){
 for(const change of changes){if(change.old)await writeFile(change.target,change.old);else await rm(change.target,{force:true});}
 throw error;
}
if(!process.argv.includes('--no-restart'))execFileSync('launchctl',['kickstart','-k','gui/'+process.getuid()+'/com.playmath.ritual-worker'],{stdio:'inherit'});
console.log('Photo cache installed. '+(process.argv.includes('--no-restart')?'Restart skipped.':'Worker restart requested.')+' Backup: '+backup);
