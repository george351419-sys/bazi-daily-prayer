import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ArkNetwork,packet,wifiCredentials,arkDeviceId} from '../public/ark-network.js';
function peripheral({status=true,fail=false,wrongSSID=false,capacity=1945600,badBarrier=false,onWrite=()=>{},apiURL='https://playmath.cn',dropAPI=false,heartbeatURL}={}){
 const writes=[],listeners=new Map(),deviceListeners=new Map();let online=false,ssid=[],connectCalls=0,disconnectCalls=0,hbURL=heartbeatURL;
 const characteristic={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),async startNotifications(){},async writeValue(bytes){
  writes.push([...bytes]);onWrite(bytes);if(fail&&bytes[1]===0x34)throw new Error('write failed');
  if(bytes[1]===0x3e)hbURL=new TextDecoder().decode(bytes.slice(3,-1));
  if(bytes[1]===0x3f&&hbURL!==undefined){const reply=packet(0x3f,new TextEncoder().encode(hbURL));listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
  if(bytes[1]===0x36&&!dropAPI)apiURL=new TextDecoder().decode(bytes.slice(3,-1));
  if(bytes[1]===0x37){const reply=packet(0x37,new TextEncoder().encode(apiURL));listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
  if(bytes[1]===0x32)ssid=[...bytes.slice(3,-1)];
  if(bytes[1]===0x33){const reply=packet(0x33,wrongSSID?new TextEncoder().encode('old-network'):ssid);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
  if(bytes[1]===0x39)online=false;if(bytes[1]===0x38)online=status;
 if(bytes[1]===0x3a){const reply=packet(0x3a,[+online]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x3d){const reply=packet(0x3d,[1,42]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x35){const reply=packet(0x35,new TextEncoder().encode('test-password'));listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x42){const reply=packet(0x42,badBarrier?[]:[0,2,208,1,224]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x56){const info=new Uint8Array(80);info[0]=1;new DataView(info.buffer).setUint32(1,capacity);info.set(new TextEncoder().encode('3.2.5-ritual.3\0frame_film_ark\0'),37);const reply=packet(0x56,info);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x51){const status=packet(0x51,[7,100,0,0,0,0,10,0,0,0,10]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(status.buffer)}});}
 if(bytes[1]===0x57||bytes[1]===0x58){const reply=packet(bytes[1],[0]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 }};
 const device={name:'FRAMEFILMARK-TEST',addEventListener:(key,fn)=>deviceListeners.set(key,fn),removeEventListener:key=>deviceListeners.delete(key),gatt:{connected:false,async connect(){connectCalls++;this.connected=true;return this;},async getPrimaryService(){return {async getCharacteristic(){return characteristic;}};},disconnect(){disconnectCalls++;this.connected=false;deviceListeners.get('gattserverdisconnected')?.();}}};
 return {writes,device,get connectCalls(){return connectCalls;},get disconnectCalls(){return disconnectCalls;},get heartbeatURL(){return hbURL;},bluetooth:{async requestDevice(options){assert.equal(options.filters[0].namePrefix,'FRAMEFILM');return device;}}};
}
test('Wi-Fi UTF-8 validation rejects truncation, open passwords and control characters',()=>{
 assert.throws(()=>wifiCredentials('中'.repeat(11),'12345678'));
 assert.throws(()=>wifiCredentials('home',''));assert.throws(()=>wifiCredentials('home','1234567\0'));
 assert.equal(new TextDecoder().decode(wifiCredentials('家里的网','password').name),'家里的网');
});
test('binding identity comes only from the normalized Ark BLE name',()=>{
 assert.equal(arkDeviceId('FRAMEFILMARK-F0F5BD7562F4'),'f0f5bd7562f4');
 assert.equal(arkDeviceId('FRAMEFILMARK-TEST'),null);
 assert.equal(arkDeviceId('OTHER-F0F5BD7562F4'),null);
});
test('ForFilm protocol preserves UTF-8 credentials and waits for device network confirmation',async()=>{
 const p=peripheral(),states=[],client=new ArkNetwork({bluetooth:p.bluetooth,onState:s=>states.push(s),delay:async()=>{}});
 await client.connect();assert.equal(states.at(-1).connected,false);
 await client.configure('家里的网','test-password');
 const channels=p.writes.map(p=>p[1]);assert.deepEqual(channels,[0x33,0x39,0x3a,0x32,0x34,0x33,0x30,0x38,0x3a]);
 assert.equal(states.at(-1).connected,true);assert.equal(new TextDecoder().decode(Uint8Array.from(p.writes[3].slice(3,-1))),'家里的网');
 for(const bytes of p.writes)assert.equal(bytes.at(-1),bytes.slice(0,-1).reduce((s,n)=>(s+n)&255,0));
 client.disconnect();assert.equal(p.device.gatt.connected,false);
});
test('an already connected device follows ForFilm disconnect then reconnect sequence',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,onState:()=>{},delay:async()=>{}});p.device.gatt.connected=true;
 await client.connect();assert.equal(p.disconnectCalls,1);assert.equal(p.connectCalls,1);assert.equal(p.device.gatt.connected,true);assert.equal(client.characteristic!==null,true);client.disconnect();
});
test('a busy stale duplicate falls back to the other authorized screen',async()=>{
 const characteristic={addEventListener(){},removeEventListener(){},async startNotifications(){},async writeValue(){}};
 const makeDevice=(name,busy)=>{let connected=false;return {name,addEventListener(){},removeEventListener(){},gatt:{get connected(){return connected;},async connect(){if(busy)throw new DOMException('GATT operation already in progress','NetworkError');connected=true;return this;},async getPrimaryService(){return {async getCharacteristic(){return characteristic;}};},disconnect(){connected=false;}}}};
 const stale=makeDevice('FRAMEFILMARK-Elink',true),active=makeDevice('FRAMEFILMARK-Elink',false);
 const bluetooth={async requestDevice(){return stale;},async getDevices(){return [stale,active];}};
 const client=new ArkNetwork({bluetooth,onState:()=>{},delay:async()=>{}});await client.connect();assert.equal(client.device,active);assert.equal(active.gatt.connected,true);client.disconnect();
});
test('download progress is read over the existing BLE connection',async()=>{
 const p=peripheral(),downloads=[],client=new ArkNetwork({bluetooth:p.bluetooth,onDownload:s=>downloads.push(s),delay:async()=>{}});
 await client.connect();const state=await client.queryDownload();assert.deepEqual(state,{state:1,progress:42});assert.deepEqual(downloads,[{state:1,progress:42}]);assert.equal(p.writes.at(-1)[1],0x3d);client.disconnect();
});
test('Wi-Fi OTA reuses the saved credentials without exposing them to the page',async()=>{
 const p=peripheral(),updates=[],client=new ArkNetwork({bluetooth:p.bluetooth,onOta:s=>updates.push(s),delay:async()=>{}});
 await client.connect();await client.configure('home','test-password');assert.equal((await client.readBuildInfo()).version,'3.2.5-ritual.3');
 assert.equal(await client.startWifiOta('https://playmath.cn/firmware/frame_film_ark.bin',10,'a'.repeat(64)),true);
 const start=p.writes.find(bytes=>bytes[1]===0x57),payload=Uint8Array.from(start.slice(3,-1));
 assert.equal(new DataView(payload.buffer,payload.byteOffset,4).getUint32(0),10);assert.ok(new TextDecoder().decode(payload.slice(36)).includes('home\0test-password\0https://playmath.cn/firmware/frame_film_ark.bin\0'));
 assert.ok(p.writes.some(bytes=>bytes[1]===0x58));assert.deepEqual(updates.at(-1),{state:7,progress:100,error:0,received:10,total:10});client.disconnect();
});
test('write failure never reports Wi-Fi success and releases configuration lock',async()=>{
 const p=peripheral({fail:true}),states=[],client=new ArkNetwork({bluetooth:p.bluetooth,onState:s=>states.push(s),delay:async()=>{}});
 await client.connect();await assert.rejects(client.configure('home','test-password'),/write failed/);
 assert.equal(client.configuring,false);assert.equal(states.some(s=>s.connected),false);client.disconnect();
});
test('a malformed or wrong checksum notification cannot confirm Wi-Fi',()=>{
 const states=[],client=new ArkNetwork({onState:s=>states.push(s)}),reply=packet(0x3a,[1]);reply[4]^=1;
 client.receive(reply);client.receive(new Uint8Array([0x55,0x3a,1]));assert.equal(states.length,0);
});
test('missing network confirmation times out, retaining a usable BLE connection',async()=>{
 const p=peripheral({status:false}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{},timeout:1});await client.connect();
 await assert.rejects(client.configure('home','test-password'),/尚未收到/);assert.equal(client.configuring,false);assert.ok(client.characteristic);client.disconnect();
});
test('a silently dropped SSID write cannot be treated as successful setup',async()=>{
 const p=peripheral({wrongSSID:true}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();
 await assert.rejects(client.configure('home','test-password'),/不一致/);assert.equal(p.writes.some(p=>p[1]===0x38),false);client.disconnect();
});
test('disconnect during credential transfer cancels remaining writes',async()=>{
 let client;const p=peripheral({onWrite:bytes=>{if(bytes[1]===0x34)client.disconnect();}});client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();
 await assert.rejects(client.configure('home','test-password'),/断开/);assert.equal(client.configuring,false);assert.equal(p.writes.some(p=>p[1]===0x38),false);
});

function otaImage(){const b=new Uint8Array(1920);b[0]=0xe9;new DataView(b.buffer).setUint16(12,9,true);new DataView(b.buffer).setUint32(32,0xabcd5432,true);b.set(new TextEncoder().encode('frame_film_ark'),80);return b;}
const imageHash=b=>createHash('sha256').update(b).digest('hex');
test('BLE upgrade validates image, uses bounded chunks and processing barriers before commit',async()=>{
 const p=peripheral(),updates=[],client=new ArkNetwork({bluetooth:p.bluetooth,onOta:s=>updates.push(s),delay:async()=>{}});await client.connect();const b=otaImage();
 assert.equal(await client.startBleOta(b,imageHash(b)),true);
 assert.equal(p.writes[0][1],0x33);const channels=p.writes.slice(1).map(b=>b[1]);assert.equal(channels[0],0x56);assert.equal(channels[1],0x10);assert.equal(channels[2],0x42);assert.equal(channels.at(-2),0x42);assert.equal(channels.at(-1),0x13);
 assert.equal(channels.filter(c=>c===0x11).length,10);assert.equal(channels.filter(c=>c===0x42).length,4);
 const data=p.writes.filter(b=>b[1]===0x11).flatMap(b=>b.slice(3,-1));assert.deepEqual(data,[...b]);assert.equal(updates.at(-1).progress,100);client.disconnect();
});
test('corrupt downloaded firmware cannot start a BLE write',async()=>{const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();await assert.rejects(client.startBleOta(otaImage(),'a'.repeat(64)),/校验失败/);assert.equal(p.writes.some(b=>b[1]===0x10),false);client.disconnect();});
test('actual device capacity and project are read and checked before erase',async()=>{const p=peripheral({capacity:512}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();assert.equal((await client.readBuildInfo()).project,'frame_film_ark');assert.equal((await client.readBuildInfo()).otaMax,512);const b=otaImage();await assert.rejects(client.startBleOta(b,imageHash(b)),/容量不匹配/);assert.equal(p.writes.some(b=>b[1]===0x10),false);client.disconnect();});
test('a failed processing barrier never commits or continues firmware data',async()=>{const p=peripheral({badBarrier:true}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();const b=otaImage();await assert.rejects(client.startBleOta(b,imageHash(b)),/处理确认/);assert.equal(p.writes.some(b=>b[1]===0x11||b[1]===0x13),false);client.disconnect();});
test('a failed data transfer is never followed by the firmware commit command',async()=>{let count=0;const p=peripheral({onWrite:b=>{if(b[1]===0x11&&++count===3)throw Error('write failed');}}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();const b=otaImage();await assert.rejects(client.startBleOta(b,imageHash(b)),/write failed/);assert.equal(p.writes.some(b=>b[1]===0x13),false);client.disconnect();});

test('reconnecting the same authorized screen resumes saved Wi-Fi without credential writes or a picker',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});
 await client.connect();await client.configure('home','test-password');client.disconnect();p.writes.length=0;
 client.bluetooth.requestDevice=()=>{throw new Error('unexpected device picker');};
 await client.connect(p.device);await client.resumeWifi();
 assert.deepEqual(p.writes.map(bytes=>bytes[1]),[0x33,0x38,0x3a]);assert.equal(client.lastStatus,true);client.disconnect();
});

test('BLE attach leaves an already-online ritual screen Wi-Fi untouched',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});
 await client.connect();await client.configure('home','test-password');client.disconnect();p.writes.length=0;
 await client.connect(p.device);await client.ensureWifi();
 assert.deepEqual(p.writes.map(bytes=>bytes[1]),[0x33,0x3a]);assert.equal(client.lastStatus,true);client.disconnect();
});

test('BLE attach reconnects saved Wi-Fi only when the screen is offline',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});
 await client.connect();p.writes.length=0;await client.ensureWifi();
 assert.deepEqual(p.writes.map(bytes=>bytes[1]),[0x3a,0x38,0x3a]);assert.equal(client.lastStatus,true);client.disconnect();
});

test('custom BLE names resolve a cloud-authenticated device identity and restore heartbeat settings',async()=>{
 const client=new ArkNetwork({delay:async()=>{}}),normal='https://playmath.cn/api/v1/device/heartbeat',nonce='d'.repeat(32),writes=[];client.characteristic={};client.device={name:'FRAMEFILMARK-Elink'};client.request=async ch=>ch===0x37?new TextEncoder().encode('https://playmath.cn'):new Uint8Array([1]);
 client.write=async(ch,body=[])=>{writes.push({ch,body});if(ch===0x3f)client.receive(packet(ch,new TextEncoder().encode(normal)));};
 const id=await client.resolveIdentity(async(path,body)=>body.beginPairing?{nonce,heartbeatURL:normal+'?link='+nonce+'&device_id='}:{status:'identified',deviceId:'112233445566'});assert.equal(id,'112233445566');assert.equal(new TextDecoder().decode(writes.at(-1).body),normal);assert.equal(client.identifying,false);
});

test('Wi-Fi configuration cannot interrupt the authenticated identity heartbeat',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});
 await client.connect();client.readHeartbeatURL=async()=>'https://playmath.cn/api/v1/device/heartbeat';
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),nonce='d'.repeat(32);
 const identity=client.resolveIdentity(async(path,body)=>{
  if(body.beginPairing)return {nonce,heartbeatURL:'https://playmath.cn/api/v1/device/heartbeat?link='+nonce+'&device_id='};
  entered();await gate;return {status:'identified',deviceId:'112233445566'};
 });
 await started;
 const configure=client.configure('home','test-password');
 await Promise.resolve();assert.equal(p.writes.some(bytes=>bytes[1]===0x39),false);
 release();assert.equal(await identity,'112233445566');await configure;
 const channels=p.writes.map(bytes=>bytes[1]);assert.ok(channels.lastIndexOf(0x3e)<channels.indexOf(0x39));
 assert.equal(client.lastStatus,true);assert.equal(client.networkBusy,false);client.disconnect();
});

test('disconnect cancels queued Wi-Fi work before credentials can reach another connection',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const pending=client.networkOperation(async()=>{entered();await gate;});await started;
 const configure=client.configure('home','test-password');const rejected=assert.rejects(configure,/蓝牙已断开/);
 client.disconnect();release();await pending;await rejected;
 assert.equal(p.writes.some(bytes=>[0x32,0x34,0x39].includes(bytes[1])),false);
});

test('online identity polling preserves Wi-Fi and never sends a reconnect or credential command',async()=>{
 const p=peripheral(),states=[],client=new ArkNetwork({bluetooth:p.bluetooth,onState:s=>states.push(s),delay:async()=>{}});
 await client.connect();await client.configure('home','test-password');p.writes.length=0;states.length=0;
 const normal='https://playmath.cn/api/v1/device/heartbeat',nonce='e'.repeat(32);client.readHeartbeatURL=async()=>normal;
 let polls=0;
 const id=await client.resolveIdentity(async(path,body)=>body.beginPairing?{nonce,heartbeatURL:normal+'?link='+nonce+'&device_id='}:++polls<3?{status:'waiting'}:{status:'identified',deviceId:'112233445566'});
 assert.equal(id,'112233445566');assert.equal(polls,3);
 const channels=p.writes.map(bytes=>bytes[1]);
 assert.equal(channels.some(ch=>[0x30,0x32,0x34,0x35,0x38,0x39].includes(ch)),false);
 assert.ok(channels.filter(ch=>ch===0x3a).length>=3);
 assert.equal(states.some(s=>!s.connected),false);
 assert.equal(new TextDecoder().decode(Uint8Array.from(p.writes.at(-1).slice(3,-1))),normal);
 client.disconnect();
});

test('offline identity reconnects at most once then polls without restarting Wi-Fi',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();p.writes.length=0;
 const normal='https://playmath.cn/api/v1/device/heartbeat',nonce='f'.repeat(32);client.readHeartbeatURL=async()=>normal;
 let polls=0;await client.resolveIdentity(async(path,body)=>body.beginPairing?{nonce,heartbeatURL:normal+'?link='+nonce+'&device_id='}:++polls<3?{status:'waiting'}:{status:'identified',deviceId:'112233445566'});
 assert.equal(p.writes.filter(bytes=>bytes[1]===0x38).length,1);
 assert.equal(client.lastStatus,true);client.disconnect();
});

test('an empty cloud API is initialized and read back before starting authenticated pairing',async()=>{
 const p=peripheral({apiURL:''}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();p.writes.length=0;
 await client.ensureCloudAPI();
 assert.deepEqual(p.writes.map(b=>b[1]),[0x37,0x36,0x37]);
 assert.equal(new TextDecoder().decode(Uint8Array.from(p.writes[1].slice(3,-1))),'https://playmath.cn');
 assert.ok(client.diagnostics.some(e=>e.stage==='cloud-api:initialized'));client.disconnect();
});
test('failed cloud API readback stops before pairing and never modifies Wi-Fi credentials',async()=>{
 const p=peripheral({apiURL:'',dropAPI:true}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();p.writes.length=0;
 let calls=0;await assert.rejects(client.resolveIdentity(async()=>{calls++;}),/API 地址尚未保存/);
 assert.equal(calls,0);assert.deepEqual(p.writes.map(b=>b[1]),[0x37,0x36,0x37]);assert.equal(client.identifying,false);client.disconnect();
});
test('an existing cloud origin is preserved and a foreign origin cannot be silently replaced',async()=>{
 for(const origin of ['https://playmath.cn/api/ark/assets/today','https://other.example/api']){
  const p=peripheral({apiURL:origin}),client=new ArkNetwork({bluetooth:p.bluetooth,delay:async()=>{}});await client.connect();p.writes.length=0;
  if(origin.startsWith('https://playmath.cn/'))await client.ensureCloudAPI();else await assert.rejects(client.ensureCloudAPI(),/其他云端 API/);
  assert.deepEqual(p.writes.map(b=>b[1]),[0x37]);client.disconnect();
 }
});
const NORMAL_HEARTBEAT='https://playmath.cn/api/v1/device/heartbeat';
function withStorage(t){
 const store=new Map(),original=globalThis.localStorage;
 globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 t.after(()=>{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;});
}
test('认主失败遗留的配对心跳地址在下次连接时归位',async t=>{
 withStorage(t);const nonce='a'.repeat(32);
 const p=peripheral({heartbeatURL:NORMAL_HEARTBEAT+'?link='+nonce+'&device_id='});
 const client=new ArkNetwork({bluetooth:p.bluetooth,onState:()=>{},delay:async()=>{}});
 client.markHeartbeatDirty();assert.equal(client.heartbeatDirty(),true);
 await client.connect();
 assert.equal(p.heartbeatURL,NORMAL_HEARTBEAT);
 assert.equal(client.heartbeatDirty(),false);
 assert.equal(p.writes.filter(b=>b[1]===0x3e).length,1);
 assert.ok(client.diagnostics.some(e=>e.stage==='heartbeat-url:restored'));
 client.disconnect();
});
test('心跳地址本来就正常时归位检查不产生多余写入',async t=>{
 withStorage(t);
 const p=peripheral({heartbeatURL:NORMAL_HEARTBEAT});
 const client=new ArkNetwork({bluetooth:p.bluetooth,onState:()=>{},delay:async()=>{}});
 client.markHeartbeatDirty();await client.connect();
 assert.equal(p.writes.some(b=>b[1]===0x3e),false);
 assert.equal(client.heartbeatDirty(),false);
 assert.ok(client.diagnostics.some(e=>e.stage==='heartbeat-url:clean'));
 client.disconnect();
});
test('指向其它云端的画屏不会被擅自改写',async t=>{
 withStorage(t);const foreign='https://other.example/api/v1/device/heartbeat';
 const p=peripheral({heartbeatURL:foreign});
 const client=new ArkNetwork({bluetooth:p.bluetooth,onState:()=>{},delay:async()=>{}});
 client.markHeartbeatDirty();await client.connect();
 assert.equal(p.heartbeatURL,foreign);
 assert.equal(p.writes.some(b=>b[1]===0x3e),false);
 assert.equal(client.heartbeatDirty(),true);
 assert.ok(client.diagnostics.some(e=>e.stage==='heartbeat-url:foreign'));
 client.disconnect();
});
test('写入成功即刷新在线接触证据，静默设备不回包也能续期，校验失败的包不得冒充在线',async()=>{
 let t=1000;const clock=()=>t;
 // 静默设备：writeValue 成功但从不 notify——这正是"绿条已连接、卡片却误判证据过期"的场景。
 const client=new ArkNetwork({now:clock,delay:async()=>{}});
 client.epoch=1;client.characteristic={writeValue:async()=>{}};
 assert.equal(client.lastContactAt,0,'连接前没有在线证据');
 t=2500;await client.write(0x3a,[]);
 assert.equal(client.lastContactAt,2500,'写入成功即记录接触，不依赖设备回包');
 t=9999;const bad=packet(0x3a,[1]);bad[4]^=1;client.receive(bad);
 assert.equal(client.lastContactAt,2500,'校验失败的包不得刷新证据');
 t=11000;client.receive(packet(0x3a,[1]));
 assert.equal(client.lastContactAt,11000,'有效回包同样刷新接触证据');
});

test('processing barrier waits for write completion even when notification arrives first',async()=>{
 const client=new ArkNetwork({delay:async()=>{}});client.epoch=1;let release;
 client.write=async channel=>{client.pendingResponses.get(channel).resolve(new Uint8Array(5));await new Promise(resolve=>release=resolve);};
 let finished=false;const pending=client.request(0x42).then(()=>finished=true);await Promise.resolve();await Promise.resolve();assert.equal(finished,false);release();await pending;assert.equal(finished,true);
});
test('a write failure after an early barrier reply still rejects the barrier',async()=>{
 const client=new ArkNetwork({delay:async()=>{}});client.write=async channel=>{client.pendingResponses.get(channel).resolve(new Uint8Array(5));throw Error('write did not settle');};await assert.rejects(client.request(0x42),/did not settle/);
});

test('an early reply cannot hide a stuck barrier write timeout',async()=>{
 const client=new ArkNetwork({delay:async()=>{}});client.write=async channel=>{client.pendingResponses.get(channel).resolve(new Uint8Array(5));await new Promise(()=>{});};await assert.rejects(client.request(0x42,[],10),/超时/);assert.equal(client.pendingResponses.size,0);
});
