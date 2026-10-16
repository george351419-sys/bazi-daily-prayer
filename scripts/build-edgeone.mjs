import {build} from 'esbuild';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {SYSTEM} from '../lib/prompt.mjs';
// Inline rules at build time: server runtime must never depend on source paths.
await rm('cloud-functions',{recursive:true,force:true});
await mkdir('cloud-functions/api/jobs/[id]',{recursive:true});
await mkdir('.edgeone-build',{recursive:true});
await build({entryPoints:['edgeone/handler.mjs'],outfile:'.edgeone-build/handler.mjs',bundle:true,platform:'node',target:'node20',format:'esm',plugins:[{name:'inline-prayer-rules',setup(b){b.onLoad({filter:/lib\/prompt\.mjs$/},()=>({contents:'export const SYSTEM = '+JSON.stringify(SYSTEM)+';',loader:'js'}));}}]});
for(const [file,relative] of [['bootstrap.js','../../.edgeone-build/handler.mjs'],['analyze.js','../../.edgeone-build/handler.mjs'],['jobs/[id]/image.js','../../../../.edgeone-build/handler.mjs']])await writeFile('cloud-functions/api/'+file,`import handler from '${relative}';\nexport default async function onRequest(context){return handler(context); }\n`);
await import('./build-static.mjs');
await writeFile('dist/backend-config.js',"window.PRAYER_API_BASE = '';\nwindow.PRAYER_API_MODE = 'same-origin';\n");
console.log('EdgeOne Node functions ready; API uses this site’s origin.');
