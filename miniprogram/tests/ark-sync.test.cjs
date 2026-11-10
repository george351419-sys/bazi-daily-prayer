const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');

function fakeBle(){
 const writes=[];const store=new Map();
 const wx={
  openBluetoothAdapter:o=>o.success(),closeBluetoothAdapter:o=>o.success(),closeBLEConnection:o=>o.success(),
  createBLEConnection:o=>o.success(),onBLECharacteristicValueChange(){},onBLEConnectionStateChange(){},
  getBLEDeviceServices:o=>o.success({services:[{uuid:'00002000-0000-1000-8000-00805f9b34fb'}]}),
  getBLEDeviceCharacteristics:o=>o.success({characteristics:[{uuid:'00002001-0000-1000-8000-00805f9b34fb',properties:{write:true,notify:true}}]}),
  notifyBLECharacteristicValueChange:o=>o.success(),
  getStorageSync:k=>store.get(k)||'',setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k)
 };
 const context={module:{exports:{}},wx,Uint8Array,Map,Date,Error,Promise,JSON,String,console,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/ble.js'),'utf8'),context);
 return {...context.module.exports,writes};
}

test('an interrupted identification leaves a dirty heartbeat flag that the next repair puts back',async()=>{
 const {ArkBLE,packet,utf8,decode}=fakeBle();
 const normal='https://playmath.cn/api/v1/device/heartbeat',nonce='c'.repeat(32),pairing=normal+'?link='+nonce+'&device_id=';
 const client=new ArkBLE(()=>{},()=>{});
 client.id='ios-uuid';
 let heartbeat=normal,breakWriteBack=false;const writes=[];
 client.write=async(ch,body=[])=>{writes.push({ch,body});
  if(ch===0x3f)client.receive(packet(ch,utf8(heartbeat)));
  if(ch===0x3e&&breakWriteBack&&writes.filter(w=>w.ch===0x3e).length===2)throw Error('蓝牙已断开');
 };
 // 认主途中蓝牙断开：配对地址写不回去，画屏会一直打配对地址，云端再也收不到心跳。
 breakWriteBack=true;
 await assert.rejects(client.resolveIdentity(async(path,body)=>{if(body.beginPairing)return {nonce,heartbeatURL:pairing};throw Error('云端不可用');}),/云端不可用/);
 assert.equal(client.heartbeatDirty(),true,'认主中断必须留下脏标记，否则内容永远下发不了');
 // 设备仍指向配对地址：下一次连接后的幂等归位要把它写回本站心跳地址。
 heartbeat=pairing;breakWriteBack=false;
 const probe=await client.restoreHeartbeatURL();
 assert.equal(probe.result,'restored');
 assert.equal(client.heartbeatDirty(),false);
 assert.equal(decode(writes.at(-1).body),normal);
});

test('a heartbeat address pointing at another cloud is reported but never rewritten',async()=>{
 const {ArkBLE,packet,utf8}=fakeBle();
 const client=new ArkBLE(()=>{},()=>{});
 client.id='ios-uuid';const writes=[];
 client.write=async(ch,body=[])=>{writes.push({ch,body});if(ch===0x3f)client.receive(packet(ch,utf8('https://other.example/api/v1/device/heartbeat')));};
 const probe=await client.restoreHeartbeatURL();
 assert.equal(probe.result,'foreign');
 assert.equal(writes.filter(w=>w.ch===0x3e).length,0,'指向其它云端的设备不得擅自改写');
});

test('the mini program locks the transfer card to "new picture generating" while a new picture is drawn',()=>{
 const {getScreenConnection}=require('../utils/screen-connection');
 const connection=getScreenConnection();
 const old={syncConfigured:true,plan:{artworkIds:['old'],contentMode:'prayer'},build:{status:'published',sha256:'old-sha'},device:{id:'aabbccddeeff'},deviceReport:{targetSha:'old-sha',stored:true,renderReport:{day:0},stale:true}};
 connection.current=old;
 const generating=connection.stateFor(old,'old',true);
 assert.equal(generating.phase,'generating');
 assert.match(generating.title,/新画正在生成/);
 assert.doesNotMatch(generating.title,/传输完成/);
 assert.equal(generating.completedAt,undefined,'生成中不得带旧画的回执时间');
 assert.equal(connection.stateFor(old,'old',false).phase,'stored','生成结束后回到真实判定');
});

test('a manual delivery confirmation is stored, can be undone, and is dropped when the plan switches to another picture',()=>{
 const {getScreenConnection}=require('../utils/screen-connection');
 const connection=getScreenConnection();
 const sha='a'.repeat(64),device='b'.repeat(12);
 const status={syncConfigured:true,plan:{artworkIds:['art-1'],contentMode:'prayer'},build:{status:'published',sha256:sha},device:{id:device},deviceReport:{stale:true,targetSha:sha}};
 connection.markDelivered(sha,device,'user-confirmed','art-1');
 assert.ok(connection.delivered);
 const state=connection.stateFor(status,'art-1');
 assert.equal(state.phase,'stored');
 assert.equal(state.completedAt,undefined,'手动标记是伪完成态，不得伪造设备回报时间');
 connection.clearDelivered();
 assert.equal(connection.delivered,null);
 assert.notEqual(connection.stateFor(status,'art-1').phase,'stored','撤销后回到设备真实回执状态');
 // 换生辰/愿望重新生成：计划换成另一幅画后，旧确认必须立即失效。
 connection.markDelivered(sha,device,'user-confirmed','art-1');
 connection.acceptStatus({...status,plan:{artworkIds:['art-2'],contentMode:'prayer'}});
 assert.equal(connection.delivered,null);
});

test('the connection evidence is zeroed when the link drops so the card never claims a live connection',()=>{
 const {getScreenConnection}=require('../utils/screen-connection');
 const connection=getScreenConnection();
 connection.client.id='screen';connection.client.lastContactAt=Date.now();
 connection.client.state('蓝牙已断开',false);
 assert.equal(connection.snapshot.paired,false);
 assert.equal(connection.snapshot.receivedAt,0,'断链后证据必须归零，不能沿用旧时间');
});

test('a delivered confirmation from another picture or another screen never fakes completion',()=>{
 const {getScreenConnection}=require('../utils/screen-connection');
 const connection=getScreenConnection();
 const sha='a'.repeat(64),device='b'.repeat(12);
 const status={syncConfigured:true,plan:{artworkIds:['art-1'],contentMode:'prayer'},build:{status:'published',sha256:sha},device:{id:device},deviceReport:{stale:true,targetSha:sha}};
 connection.markDelivered(sha,device,'user-confirmed','art-1');
 assert.notEqual(connection.stateFor(status,'art-2').phase,'stored','送达确认锁定到当前画作');
 connection.markDelivered(sha,'c'.repeat(12),'user-confirmed','art-1');
 assert.notEqual(connection.stateFor(status,'art-1').phase,'stored','别的画屏的确认不得冒充');
});
