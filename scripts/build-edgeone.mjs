import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {SYSTEM} from '../lib/prompt.mjs';
// Inline rules at build time: server runtime must never depend on source paths.
await rm('cloud-functions',{recursive:true,force:true});
await mkdir('cloud-functions/api/jobs/[id]',{recursive:true});
await mkdir('cloud-functions/api/account/artworks/[id]',{recursive:true});
await mkdir('cloud-functions/api/account/devices/[id]',{recursive:true});
await mkdir('cloud-functions/api/account/automation',{recursive:true});
await writeFile('cloud-functions/api/account/automation/retry.js',`import handler from '../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await rm('.edgeone-build',{recursive:true,force:true});
await mkdir('.edgeone-build',{recursive:true});
await build({entryPoints:['edgeone/handler.mjs'],outfile:'.edgeone-build/handler.mjs',bundle:true,platform:'node',target:'node20',format:'esm',plugins:[{name:'inline-prayer-rules',setup(b){b.onLoad({filter:/lib\/prompt\.mjs$/},()=>({contents:'export const SYSTEM = '+JSON.stringify(SYSTEM)+';',loader:'js'}));}}]});
for(const [file,relative] of [['bootstrap.js','../../.edgeone-build/handler.mjs'],['analyze.js','../../.edgeone-build/handler.mjs'],['jobs/[id]/image.js','../../../../.edgeone-build/handler.mjs']])await writeFile('cloud-functions/api/'+file,`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);
for(const file of ['photos','ritual','answers','register','login','recover','logout','me','profile','artworks','devices','automation'])await writeFile('cloud-functions/api/account/'+file+'.js',`import handler from '../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await writeFile('cloud-functions/api/account/artworks/[id].js',`import handler from '../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await writeFile('cloud-functions/api/account/artworks/[id]/image.js',`import handler from '../../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await mkdir('cloud-functions/api/account/ritual/device',{recursive:true});
for(const file of ['device','prepare'])await writeFile('cloud-functions/api/account/ritual/'+file+'.js',`import handler from '../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await writeFile('cloud-functions/api/account/ritual/device/unbind.js',`import handler from '../../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
for(const file of ['internal/ritual-worker/links.js','internal/ritual-worker/accounts/[accountId].js','internal/ritual-worker/accounts/[accountId]/plan.js','internal/ritual-worker/accounts/[accountId]/build.js','internal/ritual-worker/accounts/[accountId]/artworks/[artworkId]/image.js']){
 const output='cloud-functions/api/'+file,relative=path.relative(path.dirname(output),'.edgeone-build/handler.mjs').replaceAll('\\','/');
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);
}
for(const file of ['claim','[id]/artwork','[id]/unbind','[id]/preview']){const relative=file.includes('/')?'../../../../../.edgeone-build/handler.mjs':'../../../../.edgeone-build/handler.mjs';await writeFile('cloud-functions/api/account/devices/'+file+'.js',`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);}
await import('./build-static.mjs');
await writeFile('dist/backend-config.js',"window.PRAYER_API_BASE = '';\nwindow.PRAYER_API_MODE = 'same-origin';\n");
console.log('EdgeOne Node functions ready; API uses this site’s origin.');

// Device endpoints use device credentials, independently from browser sessions/CSRF.
await build({entryPoints:['edgeone/ark-handler.mjs'],outfile:'.edgeone-build/ark-handler.mjs',bundle:true,platform:'node',target:'node20',format:'esm'});
for(const [file,relative] of [['v1/device/heartbeat.js','../../../../.edgeone-build/ark-handler.mjs'],['ark/health.js','../../../.edgeone-build/ark-handler.mjs'],['ark/status.js','../../../.edgeone-build/ark-handler.mjs'],['ark/provision.js','../../../.edgeone-build/ark-handler.mjs'],['ark/assets/today.js','../../../../.edgeone-build/ark-handler.mjs']]){
 await mkdir('cloud-functions/api/'+file.slice(0,file.lastIndexOf('/')),{recursive:true});
 await writeFile('cloud-functions/api/'+file,`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);
}

for(const file of ['photos','ritual','answers'])await writeFile('cloud-functions/api/account/'+file+'.js',`import handler from '../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);


// Include bundled dependency changes in each function entry's source identity.
// Some incremental builders cache the thin entry independently of generated imports.
const versioned = {};
for (const name of ['handler','ark-handler']) {
 const bytes=await readFile('.edgeone-build/'+name+'.mjs');
 const digest=createHash('sha256').update(bytes).digest('hex').slice(0,16);
 versioned[name]=name+'-'+digest+'.mjs';
 await writeFile('.edgeone-build/'+versioned[name],bytes);
}
async function stampEntries(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory()){await stampEntries(file);continue;}
  if(!entry.name.endsWith('.js'))continue;
  let text=await readFile(file,'utf8');
  for(const [name,target] of Object.entries(versioned))text=text.replaceAll('.edgeone-build/'+name+'.mjs','.edgeone-build/'+target);
  await writeFile(file,text);
 }
}
await stampEntries('cloud-functions');
console.log('Function entries reference content-addressed server bundles.');
