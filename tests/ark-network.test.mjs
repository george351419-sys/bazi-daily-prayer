import test from 'node:test';
import assert from 'node:assert/strict';
import {ArkNetwork,packet,wifiCredentials,arkDeviceId} from '../public/ark-network.js';
function peripheral({status=true,fail=false,wrongSSID=false,busyConnects=0,onWrite=()=>{}}={}){
 const writes=[],listeners=new Map(),deviceListeners=new Map();let online=false,ssid=[],connectCalls=0;
 const characteristic={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),async startNotifications(){},async writeValue(bytes){
  writes.push([...bytes]);onWrite(bytes);if(fail&&bytes[1]===0x34)throw new Error('write failed');
  if(bytes[1]===0x32)ssid=[...bytes.slice(3,-1)];
  if(bytes[1]===0x33){const reply=packet(0x33,wrongSSID?new TextEncoder().encode('old-network'):ssid);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
  if(bytes[1]===0x39)online=false;if(bytes[1]===0x38)online=status;
 if(bytes[1]===0x3a){const reply=packet(0x3a,[+online]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x3d){const reply=packet(0x3d,[1,42]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x35){const reply=packet(0x35,new TextEncoder().encode('test-password'));listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x56){const info=new Uint8Array(37+16);info[0]=1;info.set(new TextEncoder().encode('3.2.5-ritual.3\0'),37);const reply=packet(0x56,info);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 if(bytes[1]===0x51){const status=packet(0x51,[7,100,0,0,0,0,10,0,0,0,10]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(status.buffer)}});}
 if(bytes[1]===0x57||bytes[1]===0x58){const reply=packet(bytes[1],[0]);listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(reply.buffer)}});}
 }};
 const device={name:'FRAMEFILMARK-TEST',addEventListener:(key,fn)=>deviceListeners.set(key,fn),removeEventListener:key=>deviceListeners.delete(key),gatt:{connected:false,async connect(){connectCalls++;if(connectCalls<=busyConnects){this.connected=true;throw new DOMException('GATT operation already in progress','NetworkError');}this.connected=true;return this;},async getPrimaryService(){return {async getCharacteristic(){return characteristic;}};},disconnect(){this.connected=false;deviceListeners.get('gattserverdisconnected')?.();}}};
 return {writes,device,get connectCalls(){return connectCalls;},bluetooth:{async requestDevice(options){assert.equal(options.filters[0].namePrefix,'FRAMEFILMARK');return device;}}};
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
 const channels=p.writes.map(p=>p[1]);assert.deepEqual(channels,[0x3a,0x39,0x3a,0x32,0x34,0x33,0x30,0x38,0x3a]);
 assert.equal(states.at(-1).connected,true);assert.equal(new TextDecoder().decode(Uint8Array.from(p.writes[3].slice(3,-1))),'家里的网');
 for(const bytes of p.writes)assert.equal(bytes.at(-1),bytes.slice(0,-1).reduce((s,n)=>(s+n)&255,0));
 client.disconnect();assert.equal(p.device.gatt.connected,false);
});
test('a device connected during selection is reused instead of reconnecting',async()=>{
 const p=peripheral(),client=new ArkNetwork({bluetooth:p.bluetooth,onState:()=>{},delay:async()=>{}});p.device.gatt.connected=true;
 await client.connect();assert.equal(p.connectCalls,0);assert.equal(p.device.gatt.connected,true);assert.equal(client.characteristic!==null,true);client.disconnect();
});
test('a pending system pairing is awaited without issuing another GATT connection',async()=>{
 const p=peripheral({busyConnects:2}),states=[],client=new ArkNetwork({bluetooth:p.bluetooth,onState:s=>states.push(s),delay:async()=>{}});
 await client.connect();assert.equal(p.connectCalls,1);assert.equal(client.characteristic!==null,true);assert.ok(states.some(s=>s.text==='Chrome 正在完成系统蓝牙配对，等待画屏连接…'));client.disconnect();
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
