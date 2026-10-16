import {cp,mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
const backend=process.env.PAGES_API_BASE||'';
if(backend)await writeFile('dist/backend-config.js','window.PRAYER_API_BASE = '+JSON.stringify(new URL(backend).origin)+';\n');
await writeFile('dist/.nojekyll','');console.log('Static HTML ready in dist/');
