import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../public/firmware-upgrade.html',import.meta.url),'utf8');
const source=html.split('<script type="module">')[1].split('</script>')[0].replace(/^\s*import [^\n]+\n/,'');
const target={version:'3.2.5-ritual.9',file:'frame_film_ark-3.2.5-ritual.9.bin',bytes:1929760,sha256:'a'.repeat(64),elfSha256:'b'.repeat(64)};
const old={version:'3.2.5-ritual.3',sha:'f6aff2f33116c98fbdcc5a12b00bca057776f6a33b32821995f4e65497b57f92'};
async function setup(initial=old,connectionError){
 const elements=new Map();const document={querySelector(key){if(!elements.has(key))elements.set(key,{disabled:false,textContent:'',className:'',value:''});return elements.get(key);}};
 let info={...initial},starts=0,wifiStarts=0,configured=[];
 class Network {
  constructor(options){this.options=options;this.device={name:'FRAMEFILMARK-Elink'};}
  async connect(){const error=Array.isArray(connectionError)?connectionError.shift():connectionError;if(error)throw Error(error);this.characteristic={};this.options.onState({paired:true,text:'connected'});}
  async configure(ssid,password){configured.push({ssid,password});if(password==='bad-password')throw Error('密码错误');}
  async readBuildInfo(){return {otaMax:1945600,project:'frame_film_ark',...info};}
  async startWifiOta(){wifiStarts++;throw Error('画屏拒绝启动 Wi-Fi 固件下载，错误码 2。');}
  async startBleOta(image,sha){assert.equal(image.length,target.bytes);assert.equal(sha,target.sha256);starts++;info={version:target.version,sha:target.elfSha256};return true;}
  disconnect(){this.characteristic=null;this.options.onState({paired:false,text:'disconnected'});}
 }
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('document','navigator','fetch','ArkNetwork','setTimeout','window',source)(document,{bluetooth:{}},async()=>({ok:true,json:async()=>target,arrayBuffer:async()=>new ArrayBuffer(target.bytes)}),Network,fn=>{fn();return 1;},{addEventListener(){}});
 return {elements,configured,starts:()=>starts,wifiStarts:()=>wifiStarts};
}
test('connecting only pairs; an explicit upgrade click starts and verifies BLE OTA',async()=>{const x=await setup();await x.elements.get('#connect').onclick();assert.equal(x.starts(),0);assert.equal(x.elements.get('#configure').disabled,false);await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),1);assert.match(x.elements.get('#state').textContent,/升级成功并已核验/);});
test('already-running target does not rewrite firmware',async()=>{const x=await setup({version:target.version,sha:target.elfSha256});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/无须重复升级/);});
test('unexpected old fingerprint cannot initiate an update',async()=>{const x=await setup({...old,sha:'c'.repeat(64)});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/升级起点不同/);});
test('unreachable device never receives an OTA command',async()=>{const x=await setup(old,'Bluetooth Device is no longer in range.');await x.elements.get('#connect').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/no longer in range/);});

test('a sleeping device can reconnect and wait for explicit upgrade',async()=>{const x=await setup(old,['Bluetooth Device is no longer in range.','Bluetooth Device is no longer in range.',null]);await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),1);assert.match(x.elements.get('#state').textContent,/升级成功并已核验/);});

test('verified ritual.5 can upgrade directly to ritual.8',async()=>{const x=await setup({version:'3.2.5-ritual.5',sha:'59972da4d66db28b4d2d60929026e0304e1599e9408e65db8678b1a23aa2b69b'});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),1);});

test('Wi-Fi form writes credentials over BLE, clears password and does not auto-upgrade',async()=>{
 const x=await setup();assert.equal(x.elements.get('#configure').disabled,true);await x.elements.get('#connect').onclick();
 x.elements.get('#ssid').value='Home24';x.elements.get('#password').value='test-password';
 await x.elements.get('#wifi').onsubmit({preventDefault(){}});
 assert.deepEqual(x.configured,[{ssid:'Home24',password:'test-password'}]);assert.equal(x.elements.get('#password').value,'');assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/已确认连接 Wi-Fi/);
});
test('Wi-Fi failures clear credentials and retain a retryable form',async()=>{
 const x=await setup();await x.elements.get('#connect').onclick();x.elements.get('#ssid').value='Home24';x.elements.get('#password').value='bad-password';
 await x.elements.get('#wifi').onsubmit({preventDefault(){}});assert.equal(x.elements.get('#password').value,'');assert.equal(x.elements.get('#configure').disabled,false);assert.match(x.elements.get('#state').textContent,/密码错误/);assert.equal(x.starts(),0);
});

test('device partition too small is diagnosed before firmware transfer',async()=>{const x=await setup({...old,otaMax:1024});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),0);assert.match(x.elements.get('#state').textContent,/容量不匹配/);});

test('known legacy firmware rejecting HTTPS OTA always uses BLE and never calls its Wi-Fi OTA entry',async()=>{
 for(const initial of [old,{version:'3.2.5-ritual.5',sha:'59972da4d66db28b4d2d60929026e0304e1599e9408e65db8678b1a23aa2b69b'}]){
  const x=await setup(initial);await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();
  assert.equal(x.wifiStarts(),0,initial.version+' must not enter the incompatible Wi-Fi OTA path');assert.equal(x.starts(),1);assert.match(x.elements.get('#state').textContent,/升级成功并已核验/);
 }
});

test('verified ritual.6 upgrades to ritual.8 through BLE without Wi-Fi OTA',async()=>{const x=await setup({version:'3.2.5-ritual.6',sha:'e22776bd34de9bb23da9a8f8c942ede949cbdefa1e9eeac507bd80d0eec8fb1c'});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),1);assert.equal(x.wifiStarts(),0);assert.match(x.elements.get('#state').textContent,/3.2.5-ritual.9/);});

test('reported factory 3.2.5 build upgrades through BLE and is verified after reboot',async()=>{const x=await setup({version:'3.2.5',sha:'de9eb5af62fe38e54fa90a15472bb49f4dbbaac35a59f1d0321a536885041469'});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),1);assert.equal(x.wifiStarts(),0);assert.match(x.elements.get('#state').textContent,/升级成功并已核验/);});
test('unrecognised factory 3.2.5 fingerprint is still blocked before firmware writes',async()=>{const x=await setup({version:'3.2.5',sha:'f'.repeat(64)});await x.elements.get('#connect').onclick();await x.elements.get('#upgrade').onclick();assert.equal(x.starts(),0);assert.equal(x.wifiStarts(),0);assert.match(x.elements.get('#state').textContent,/升级起点不同/);});

test("verified ritual.8 upgrades to ritual.9 through BLE",async()=>{const s=await setup({version:"3.2.5-ritual.8",sha:"d3f136ce612ab59d1617a08d36a065c0c04d921030eaaa445930cacfe2c5a584"});await s.elements.get("#connect").onclick();await s.elements.get("#upgrade").onclick();assert.equal(s.starts(),1);});
