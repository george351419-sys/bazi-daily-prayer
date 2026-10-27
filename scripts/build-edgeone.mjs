import {build} from 'esbuild';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {SYSTEM} from '../lib/prompt.mjs';
// Inline rules at build time: server runtime must never depend on source paths.
await rm('cloud-functions',{recursive:true,force:true});
await mkdir('cloud-functions/api/jobs/[id]',{recursive:true});
await mkdir('cloud-functions/api/account/artworks/[id]',{recursive:true});
await mkdir('.edgeone-build',{recursive:true});
await build({entryPoints:['edgeone/handler.mjs'],outfile:'.edgeone-build/handler.mjs',bundle:true,platform:'node',target:'node20',format:'esm',plugins:[{name:'inline-prayer-rules',setup(b){b.onLoad({filter:/lib\/prompt\.mjs$/},()=>({contents:'export const SYSTEM = '+JSON.stringify(SYSTEM)+';',loader:'js'}));}}]});
for(const [file,relative] of [['bootstrap.js','../../.edgeone-build/handler.mjs'],['analyze.js','../../.edgeone-build/handler.mjs'],['jobs/[id]/image.js','../../../../.edgeone-build/handler.mjs']])await writeFile('cloud-functions/api/'+file,`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);
for(const file of ['register','login','recover','logout','me','profile','artworks'])await writeFile('cloud-functions/api/account/'+file+'.js',`import handler from '../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await writeFile('cloud-functions/api/account/artworks/[id].js',`import handler from '../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await writeFile('cloud-functions/api/account/artworks/[id]/image.js',`import handler from '../../../../../.edgeone-build/handler.mjs';\nexport default async function onRequest(context){return handler(context); }\n`);
await import('./build-static.mjs');
await writeFile('dist/backend-config.js',"window.PRAYER_API_BASE = '';\nwindow.PRAYER_API_MODE = 'same-origin';\n");
console.log('EdgeOne Node functions ready; API uses this site’s origin.');

// Device endpoints use device credentials, independently from browser sessions/CSRF.
await build({entryPoints:['edgeone/ark-handler.mjs'],outfile:'.edgeone-build/ark-handler.mjs',bundle:true,platform:'node',target:'node20',format:'esm'});
for(const [file,relative] of [['v1/device/heartbeat.js','../../../../.edgeone-build/ark-handler.mjs'],['ark/health.js','../../../.edgeone-build/ark-handler.mjs'],['ark/status.js','../../../.edgeone-build/ark-handler.mjs'],['ark/provision.js','../../../.edgeone-build/ark-handler.mjs'],['ark/assets/today.film.js','../../../../.edgeone-build/ark-handler.mjs']]){
 await mkdir('cloud-functions/api/'+file.slice(0,file.lastIndexOf('/')),{recursive:true});
 await writeFile('cloud-functions/api/'+file,`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);
}
