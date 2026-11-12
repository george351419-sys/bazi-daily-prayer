const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const root=path.join(__dirname,'..'),app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));let bytes=0,files=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['tests','scripts','docs','review'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else{const data=fs.readFileSync(p);bytes+=data.length;files++;if(p.endsWith('.json'))JSON.parse(data);if(p.endsWith('.js'))new vm.Script(data.toString(),{filename:p});}}}walk(root);
for(const page of app.pages)for(const ext of ['js','json','wxml','wxss'])if(!fs.existsSync(path.join(root,page+'.'+ext)))throw Error('Missing '+page+'.'+ext);
for(const page of app.pages){const s=fs.readFileSync(path.join(root,page+'.wxml'),'utf8');const js=fs.readFileSync(path.join(root,page+'.js'),'utf8');for(const m of s.matchAll(/bind(?:tap|input|change|submit)="([A-Za-z][\w]*)"/g))if(!js.includes(m[1]+':')&&!js.includes(m[1]+'('))throw Error('Missing event '+page+':'+m[1]);}

// Validate the files that will actually ship, not only the source tree.
const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'))),ignored=project.packOptions?.ignore||[];
const isIgnored=file=>{const name=path.relative(root,file).split(path.sep).join('/');return ignored.some(rule=>rule.type==='file'?name===rule.value:rule.type==='folder'&&(name===rule.value||name.startsWith(rule.value+'/')));};
function checkPackagedImports(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(isIgnored(file))continue;if(entry.isDirectory()){checkPackagedImports(file);continue;}if(!file.endsWith('.js'))continue;for(const match of fs.readFileSync(file,'utf8').matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){const target=path.resolve(path.dirname(file),match[1]+(path.extname(match[1])?'':'.js'));if(!fs.existsSync(target)||isIgnored(target))throw Error('Packaged dependency missing: '+path.relative(root,file)+' -> '+match[1]);}}}
checkPackagedImports(root);

if(bytes>2*1024*1024)throw Error('Main package exceeds 2MiB');console.log(JSON.stringify({syntax:'pass',routes:app.pages.length,files,bytes,appid:JSON.parse(fs.readFileSync(path.join(root,'project.config.json'))).appid,realWechatCompile:'requires DevTools login and formal AppID'}));
