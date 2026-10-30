import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
test('a changed server dependency changes the deployed function entry and points at the exact new bundle',async t=>{
 const stage=await mkdtemp(path.join(os.tmpdir(),'prayer-build-regression-'));t.after(()=>rm(stage,{recursive:true,force:true}));
 for(const directory of ['api','lib','rules','public','content','edgeone','scripts','miniprogram']){
  await cp(path.join(root,directory),path.join(stage,directory),{recursive:true,filter:p=>path.basename(p)!=='node_modules'});
 }
 await cp(path.join(root,'package.json'),path.join(stage,'package.json'));
 await symlink(path.join(root,'node_modules'),path.join(stage,'node_modules'),'dir');
 const build=()=>exec(process.execPath,['scripts/build-edgeone.mjs'],{cwd:stage,maxBuffer:1024*1024});
 await build();
 const entry=path.join(stage,'cloud-functions/api/bootstrap.js'),before=await readFile(entry,'utf8');
 const filename=before.match(/handler-([a-f0-9]{16})\.mjs/);assert.ok(filename);
 const bytes=await readFile(path.join(stage,'.edgeone-build',filename[0]));
 assert.equal(filename[1],createHash('sha256').update(bytes).digest('hex').slice(0,16));
 const handler=path.join(stage,'edgeone/handler.mjs'),source=await readFile(handler,'utf8');
 await writeFile(handler,source+"\nexport const BUILD_DEPENDENCY_REGRESSION = 'changed-server-code';\n");
 await build();
 const after=await readFile(entry,'utf8');assert.notEqual(after,before);
 const next=after.match(/handler-([a-f0-9]{16})\.mjs/);assert.ok(next);
 assert.match((await readFile(path.join(stage,'.edgeone-build',next[0]))).toString(),/changed-server-code/);
});
