import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../public/firmware-upgrade.html',import.meta.url),'utf8');
const source=html.split('<script type="module">')[1].split('</script>')[0].replace(/^import .*?;\n/,'');
const target={version:'3.2.5-ritual.5',file:'frame_film_ark-3.2.5-ritual.5.bin',bytes:1927936,sha256:'a'.repeat(64),elfSha256:'b'.repeat(64)};
const old={version:'3.2.5-ritual.3',sha:'f6aff2f33116c98fbdcc5a12b00bca057776f6a33b32821995f4e65497b57f92'};
async function setup(initial=old,connectionError){
 const elements=new Map();const document={querySelector(key){if(!elements.has(key))elements.set(key,{disabled:false,textContent:'',className:''});return elements.get(key);}};
 let info={...initial},starts=0;
 class Network {
  constructor(options){this.options=options;this.device={name:'FRAMEFILMARK-Elink'};}
  async connect(){if(connectionError)throw Error(connectionError);this.characteristic={};this.options.onState({paired:true,text:'connected'});}
  async readBuildInfo(){return {...info};}
  async startWifiOta(url,size,sha){assert.equal(url,'https://playmath.cn/firmware/'+target.file);assert.equal(size,target.bytes);assert.equal(sha,target.sha256);starts++;info={version:target.version,sha:target.elfSha256};return true;}
  disconnect(){this.characteristic=null;this.options.onState({paired:false,text:'disconnected'});}
 }
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('document','navigator','fetch','ArkNetwork','setTimeout',source)(document,{bluetooth:{}},async()=>({ok:true,json:async()=>target}),Network,fn=>{fn();return 1;});
 return {elements,starts:()=>starts};
}
test('one connect click starts OTA and verifies the reboot without a second click',async()=>{const x=await setup();await x.elements.get('#connect').onclick();assert.equal(x.starts(),1);assert.match(x.elements.get('#state').textContent,/升级成功并已核验/);});
test('already-running target does not rewrite firmware',async()=>{const x=await setup({version:target.version,sha:target.elfSha256});await x.elements.get('#connect').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/无须重复升级/);});
test('unexpected old fingerprint cannot initiate an update',async()=>{const x=await setup({...old,sha:'c'.repeat(64)});await x.elements.get('#connect').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/升级起点不同/);});
test('unreachable device never receives an OTA command',async()=>{const x=await setup(old,'Bluetooth Device is no longer in range.');await x.elements.get('#connect').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/no longer in range/);});
