// FrameFilm Ark command protocol; ported from public/ark-network.js (ForFilm GPL-3.0).
const SERVICE='00002000-0000-1000-8000-00805f9b34fb',CHAR='00002001-0000-1000-8000-00805f9b34fb';
const HEARTBEAT_NORMAL='https://playmath.cn/api/v1/device/heartbeat';
const HEARTBEAT_DIRTY_KEY='screen-heartbeat-url-dirty';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// 小程序没有 localStorage：用 wx.setStorageSync 持久化；无 wx 的测试环境退回内存。
const memory=new Map();
const storage={
 get(key){try{const value=wx.getStorageSync(key);return value===undefined||value===null?'':value;}catch{return memory.get(key)||'';}},
 set(key,value){try{wx.setStorageSync(key,value);}catch{memory.set(key,value);}},
 remove(key){try{wx.removeStorageSync(key);}catch{memory.delete(key);}}
};
const events=[];function trace(stage,detail=''){events.push({time:new Date().toISOString(),stage,detail});if(events.length>80)events.shift();storage.set('screen-ble-diagnostics',events);}
function call(api,args){trace(api+':start');return new Promise((resolve,reject)=>wx[api](Object.assign({},args,{success:r=>{trace(api+':ok');resolve(r);},fail:e=>{trace(api+':fail',String(e.errCode||'')+' '+String(e.errMsg||'').replace(/[a-f0-9]{2}(?::[a-f0-9]{2}){5}/ig,'[device]'));reject(Object.assign(new Error(e.errMsg||'蓝牙操作未完成'),{errCode:e.errCode,stage:api}));}})));}
function utf8(text){const bytes=[];for(const char of text){let n=char.codePointAt(0);if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|(n>>6),128|(n&63));else if(n<65536)bytes.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else bytes.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}return new Uint8Array(bytes);}
function decode(bytes){let encoded='';for(const b of bytes)encoded+='%'+b.toString(16).padStart(2,'0');return decodeURIComponent(encoded).replace(/\0.*$/,'');}
function packet(ch,payload){payload=payload||[];const b=new Uint8Array(payload.length+4);b.set([0x55,ch,payload.length]);b.set(payload,3);b[b.length-1]=b.slice(0,-1).reduce((a,v)=>(a+v)&255,0);return b;}
function credentials(ssid,password){const name=utf8(ssid),secret=utf8(password);if(!name.length||name.length>32||/[\x00-\x1f\x7f]/.test(ssid))throw new Error('Wi-Fi 名称需为 1–32 个 UTF-8 字节。');if(secret.length<8||secret.length>63||/[\x00-\x1f\x7f]/.test(password))throw new Error('请核对该 Wi-Fi 的现有密码后重试。');return {name,secret};}
class ArkBLE{
 constructor(state,found,download=()=>{}){this.download=download;this.state=state;this.found=found;this.epoch=0;this.maxWrite=20;this.devices=new Map();this.lastContactAt=0;this.onValue=e=>{if(this.service&&this.char&&e.deviceId===this.id&&e.serviceId.toLowerCase()===this.service.toLowerCase()&&e.characteristicId.toLowerCase()===this.char.toLowerCase())this.receive(new Uint8Array(e.value));};this.onConnection=e=>{trace('native-connection',e.connected?'connected':'disconnected');if(e.deviceId===this.attemptId&&!this.id&&!e.connected){this.attemptDisconnected=true;return;}if(e.deviceId===this.id&&!e.connected){this.epoch++;this.id=null;this.status=null;this.lastContactAt=0;if(this.identityRead){this.identityRead.reject(new Error('蓝牙已断开'));this.identityRead=null;}if(this.downloadRead){this.downloadRead.reject(new Error('蓝牙已断开'));this.downloadRead=null;}this.state('蓝牙已断开，正在尝试恢复；若画屏已休眠，请按键唤醒，无需重新填写 Wi-Fi。',false);}};}
 async listen(){
  await call('openBluetoothAdapter',{});
  if(!this.listening){wx.onBLECharacteristicValueChange(this.onValue);wx.onBLEConnectionStateChange(this.onConnection);this.listening=true;}
 }
 async scan(){if(this.scanning)return;await this.disconnect();await this.listen();this.devices.clear();this.listener=e=>{for(const d of e.devices||[]){if((d.name||d.localName||'').startsWith('FRAMEFILMARK'))this.devices.set(d.deviceId,{id:d.deviceId,name:d.name||d.localName,localName:d.localName||'',rssi:d.RSSI});}this.found(Array.from(this.devices.values()));};wx.onBluetoothDeviceFound(this.listener);await call('startBluetoothDevicesDiscovery',{allowDuplicatesKey:false});this.scanning=true;this.state('正在寻找画屏，请确认设备已唤醒。',false);this.scanTimer=setTimeout(()=>{this.stopScan();if(!this.id)this.state('搜索已结束。未找到时，请唤醒画屏并重新搜索。',false);},15000);}
 async stopScan(){clearTimeout(this.scanTimer);if(this.scanning){this.scanning=false;await call('stopBluetoothDevicesDiscovery',{}).catch(()=>{});}if(this.listener){wx.offBluetoothDeviceFound(this.listener);this.listener=null;}}
 async closeHandle(id){if(id)await call('closeBLEConnection',{deviceId:id}).catch(()=>{});}
  async connect(id){
   if(this.connecting)throw new Error('正在连接画屏，请稍候。');
   const previousId=this.id;this.id=null;this.attemptId=null;this.connecting=true;this.status=null;this.service=null;this.char=null;this.lastContactAt=0;
   const epoch=++this.epoch;
  const check=()=>{if(epoch!==this.epoch)throw new Error('连接已取消或断开，请唤醒画屏后重试。');};
  try{
   await this.stopScan();await this.listen();await pause(350);check();
   // Close the native handle even if createBLEConnection failed before this.id existed.
   if(previousId&&previousId!==id)await this.closeHandle(previousId);await this.closeHandle(id);await pause(350);check();this.attemptId=id;
   for(let attempt=0;attempt<2;attempt++){
    this.state(attempt?'正在清理蓝牙连接后重试…':'正在连接所选画屏…',false);
    try{this.attemptId=id;this.attemptDisconnected=false;await call('createBLEConnection',{deviceId:id,timeout:15000});if(this.attemptDisconnected)throw Object.assign(new Error('蓝牙在建立连接时断开。'),{errCode:10003});break;}
    catch(e){this.attemptId=null;await this.closeHandle(id);check();if(attempt||!(/status[:：]\s*133/i.test(e.message)||e.errCode===10003))throw e;await pause(1000);check();}
   }
   check();this.id=id;
   const services=await call('getBLEDeviceServices',{deviceId:id});check();
   const svc=services.services.find(s=>s.uuid.toLowerCase()===SERVICE);if(!svc)throw new Error('这台设备不支持当前配网协议。');this.service=svc.uuid;
   const chars=await call('getBLEDeviceCharacteristics',{deviceId:id,serviceId:this.service});check();
   const char=chars.characteristics.find(c=>c.uuid.toLowerCase()===CHAR);if(!char||!char.properties.write||(!char.properties.notify&&!char.properties.indicate))throw new Error('画屏配网通道不完整。');this.char=char.uuid;
   await call('notifyBLECharacteristicValueChange',{deviceId:id,serviceId:this.service,characteristicId:this.char,state:true});check();await pause(300);
   if(wx.setBLEMTU)await call('setBLEMTU',{deviceId:id,mtu:128}).catch(()=>{});check();
   this.maxWrite=20;if(wx.getBLEMTU){const mtu=await call('getBLEMTU',{deviceId:id,writeType:'write'}).catch(()=>null);check();if(mtu&&mtu.mtu)this.maxWrite=mtu.mtu-3;}
   await pause(300);check();await this.write(0x3a,[],epoch);check();
   this.state('蓝牙已连接，正在检查画屏已保存的 Wi-Fi。',true);
   // 认主中断后画屏心跳地址可能残留本站配对地址：有脏标记时连接成功即幂等归位，
   // 否则设备会一直打配对地址——BLE 显示在线，云端却收不到心跳，新内容永远下发不了。
   if(this.heartbeatDirty())await this.restoreHeartbeatURL(epoch);
  }catch(e){
   this.id=null;this.status=null;this.service=null;this.char=null;this.attemptId=null;
   await this.closeHandle(id);this.state('蓝牙未连接。请唤醒画屏后重试；若其他手机或网页正在连接，请先在那边断开。',false);
   if(/status[:：]\s*133/i.test(e.message))e.message='手机蓝牙连接未建立（系统状态 133）。已清理连接并重试，仍未成功；请唤醒画屏，并断开其他手机或网页对它的连接后重试。';
   throw e;
  }finally{this.attemptId=null;this.connecting=false;}
 }
 async write(ch,data,epoch){const b=packet(ch,data);if(epoch!==this.epoch||!this.id)throw new Error('蓝牙已断开，请重新连接。');if(b.length>this.maxWrite)throw new Error('当前蓝牙连接可写长度不足，请重新连接以协商 MTU；本固件不支持拆分配网指令。');const command=ch.toString(16).padStart(2,'0');trace('write:'+command+':start');await call('writeBLECharacteristicValue',{deviceId:this.id,serviceId:this.service,characteristicId:this.char,value:b.buffer,writeType:'write'});await pause(200);if(epoch!==this.epoch)throw new Error('蓝牙已断开');trace('write:'+command+':done');// 写入成功同样证明链路存活（部分设备只在状态变化时上报 0x3a，不会每次查询都 notify）。
  this.lastContactAt=Date.now();}
 receive(b){if(!this.id)return;if(b.length<4||b[0]!==0x55||b.length!==b[2]+4||b.slice(0,-1).reduce((s,x)=>(s+x)&255,0)!==b[b.length-1])return;// 收到校验通过的设备回包 = 链路仍存活的地面真相，记录接触时间供 UI 续期在线证据。
  this.lastContactAt=Date.now();trace('notify:'+b[1].toString(16).padStart(2,'0')+':'+b.length);if(b[1]===0x3f&&this.identityRead){const reader=this.identityRead;this.identityRead=null;try{reader.resolve(decode(b.slice(3,-1)));}catch{reader.reject(new Error('画屏身份通道回复无效'));}}if(b[1]===0x3a&&b[2]===1){this.status=b[3]===1;this.state(this.status?'画屏已确认 Wi-Fi 联网。':'蓝牙已连接，Wi-Fi 尚未连接。',true);}if(b[1]===0x3d&&b[2]===2){const value={state:b[3],progress:b[4]};this.download(value);if(this.downloadRead){this.downloadRead.resolve(value);this.downloadRead=null;}}if(b[1]===0x33){try{this.ssid=decode(b.slice(3,-1));}catch{this.ssid=null;}}}
 async readHeartbeatURL(){
  const epoch=this.epoch;const read=new Promise((resolve,reject)=>{this.identityRead={resolve,reject};});read.catch(()=>{});
  const timer=setTimeout(()=>{this.identityRead?.reject(new Error('画屏未回复身份通道，请保持唤醒后重试。'));this.identityRead=null;},3000);
  try{await this.write(0x3f,[],epoch);return await read;}finally{clearTimeout(timer);this.identityRead=null;}
 }
 // 认主会把设备云端心跳地址临时改成 ?link=<nonce> 配对地址。若认主中途蓝牙断开，
 // resolveIdentity 的 finally 因要求连接仍在而无法写回，设备会一直打配对地址：
 // BLE 显示 Wi-Fi 在线，云端却收不到心跳，新内容永远下发不了。用持久化标记记住
 // 这种脏状态，下次连接成功时幂等归位（与网页端 ark-network.js 同款机制）。
 heartbeatDirty(){return storage.get(HEARTBEAT_DIRTY_KEY)==='1';}
 markHeartbeatDirty(){storage.set(HEARTBEAT_DIRTY_KEY,'1');trace('heartbeat-url:dirty');}
 clearHeartbeatDirty(){storage.remove(HEARTBEAT_DIRTY_KEY);}
 async restoreHeartbeatURL(epoch=this.epoch){
  try{
   const current=await this.readHeartbeatURL();
   trace('heartbeat-url:read');
   if(current===HEARTBEAT_NORMAL){this.clearHeartbeatDirty();trace('heartbeat-url:clean');return {result:'clean',url:current};}
   if(!current){trace('heartbeat-url:empty');return {result:'empty',url:current};}
   // 只归位本站地址与本站配对 challenge；指向其它云端的设备不擅自改写。
   if(current&&!current.startsWith(HEARTBEAT_NORMAL+'?link=')){trace('heartbeat-url:foreign');return {result:'foreign',url:current};}
   await this.write(0x3e,utf8(HEARTBEAT_NORMAL),epoch);
   this.clearHeartbeatDirty();trace('heartbeat-url:restored');return {result:'restored',url:current};
  }catch(error){trace('heartbeat-url:restore-failed:'+String((error&&error.message)||'Error'));return {result:'failed',url:null};}
 }
 async resolveIdentity(request){
  trace('identity:begin');
  const epoch=this.epoch,original=await this.readHeartbeatURL(),normal=HEARTBEAT_NORMAL;
  const priorChallenge=original.startsWith(normal+'?link=')&&/^[a-f0-9]{32}&device_id=$/.test(original.slice((normal+'?link=').length));if(original&&original!==normal&&!priorChallenge)throw new Error('画屏使用了其他云端地址，请先核对设备配置。');
  const challenge=await request('/api/account/ritual/device',{beginPairing:true},{timeout:10000});
  if(!/^[a-f0-9]{32}$/.test(challenge.nonce||'')||challenge.heartbeatURL!==normal+'?link='+challenge.nonce+'&device_id=')throw new Error('设备识别服务回复无效。');
  let changed=false;
  try{
   changed=true;await this.write(0x3e,utf8(challenge.heartbeatURL),epoch);await this.resumeWifi();
   const end=Date.now()+60000;
   while(Date.now()<end){
    if(epoch!==this.epoch||!this.id)throw new Error('蓝牙连接已断开，请重新连接画屏。');
    const result=await request('/api/account/ritual/device',{pairingNonce:challenge.nonce},{timeout:10000});
    if(result.status==='identified'&&/^[a-f0-9]{12}$/.test(result.deviceId||''))return result.deviceId;
    await pause(2000);
   }
   throw new Error('尚未收到画屏认证回报，请保持画屏唤醒并点击重试关联。');
  }catch(error){trace('identity:failed');throw error;}
  finally{
   if(changed){
    let restored=false;
    if(epoch===this.epoch&&this.id){try{await this.write(0x3e,utf8(normal),epoch);restored=true;}catch{}}
    // 蓝牙已断开或写回失败：留标记，等下次连接成功后 restoreHeartbeatURL 归位。
    if(restored)this.clearHeartbeatDirty();else this.markHeartbeatDirty();
   }
  }
 }
 async readSavedSSID(){
  const epoch=this.epoch;this.ssid=null;await this.write(0x33,[],epoch);const end=Date.now()+1500;
  while(this.ssid===null&&Date.now()<end){if(epoch!==this.epoch)throw new Error('蓝牙已断开');await pause(100);}
  if(this.ssid===null)throw new Error('未读到画屏保存的网络，请重新连接。');return this.ssid;
 }
 async resumeSaved(ssid){
  if(this.busy)throw new Error('正在连接 Wi-Fi，请稍候。');this.busy=true;const epoch=this.epoch;
  try{const saved=await this.readSavedSSID();if(!saved||saved!==ssid)throw new Error('这是新的 Wi-Fi，请填写该网络的现有密码。');this.status=null;await this.write(0x30,[1],epoch);await this.resumeWifi();const end=Date.now()+30000;
   while(this.status!==true&&Date.now()<end){await this.write(0x3a,[],epoch);if(this.status!==true)await pause(700);}
   if(this.status!==true)throw new Error('使用已保存的密码尚未确认联网；请检查网络，密码变更时再填写新密码。');
  }finally{this.busy=false;}
 }
 async configure(ssid,password){if(!password)return this.resumeSaved(ssid);if(this.busy)throw new Error('正在配网，请稍候。');const {name,secret}=credentials(ssid,password),epoch=this.epoch;this.busy=true;try{if(Math.max(name.length,secret.length)+4>this.maxWrite)throw new Error('蓝牙 MTU 不足以发送当前 Wi-Fi 设置，请重新连接后重试。');this.status=null;await this.write(0x39,[],epoch);let end=Date.now()+5000;while(this.status!==false&&Date.now()<end){await this.write(0x3a,[],epoch);await pause(300);}if(this.status!==false)throw new Error('画屏尚未确认断开原 Wi-Fi，请重试。');await this.write(0x32,name,epoch);await this.write(0x34,secret,epoch);this.ssid=null;await this.write(0x33,[],epoch);end=Date.now()+3000;while(this.ssid===null&&Date.now()<end){await pause(100);if(epoch!==this.epoch)throw new Error('蓝牙已断开');}if(this.ssid!==ssid)throw new Error('画屏保存的 Wi-Fi 名称与输入不一致，请重试。');await this.write(0x30,[1],epoch);await this.write(0x38,[],epoch);end=Date.now()+30000;while(this.status!==true&&Date.now()<end){await this.write(0x3a,[],epoch);await pause(700);}if(this.status!==true)throw new Error('未收到 Wi-Fi 联网确认，请检查密码与 2.4 GHz 网络。');this.state('设备已确认 Wi-Fi 联网；内容下载和显示需等待设备回执。',true);}finally{secret.fill(0);this.busy=false;}}
 async queryDownload(timeout=3000){
  if(this.downloadRead)throw new Error('正在读取下载进度。');
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.downloadRead=null;reject(new Error('画屏未返回下载进度。'));},timeout);
   this.downloadRead={resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
   this.write(0x3d,[],this.epoch).catch(error=>{if(this.downloadRead){this.downloadRead.reject(error);this.downloadRead=null;}});
  });
 }
 async resumeWifi(){await this.write(0x38,[],this.epoch);await this.write(0x3a,[],this.epoch);}
 async ensureWifi(){
  // ritual.6 reconnects the Wi-Fi radio on 0x38, even when it is online.
  this.status=null;await this.write(0x3a,[],this.epoch);
  if(this.status!==true)await this.resumeWifi();
 }
 async recoverSync(){
  if(!this.id)throw new Error('请先连接画屏蓝牙。');
  const epoch=this.epoch,probe=await this.restoreHeartbeatURL(epoch);
  if(!['clean','restored'].includes(probe.result))throw new Error('未能确认画屏心跳地址，请先读取设备心跳地址并发送诊断。');
  if(this.ensureCloudAPI)await this.ensureCloudAPI();
  trace('sync:recover-network');this.status=null;await this.resumeWifi();
  const end=Date.now()+30000;
  while(this.status!==true&&Date.now()<end){if(epoch!==this.epoch||!this.id)throw new Error('蓝牙连接已改变，请重试。');await this.write(0x3a,[],epoch);if(this.status!==true)await pause(700);}
  if(this.status!==true)throw new Error('画屏尚未确认重新联网，请检查 Wi-Fi 后重试。');
  trace('sync:recovery-online');this.state('画屏已重新联网，正在等待新内容的云端回报。',true);
 }
 async syncNow(){if(!this.id)throw new Error('请先连接画屏蓝牙。');await this.resumeWifi();if(!this.id)throw new Error('蓝牙已断开');this.state('已请求检查云端更新；等待内容保存回执后，可在画屏选择“画面”并按确认键进入。需要 ritual.6 固件。',true);}
 async disconnect(){if(this.identityRead){this.identityRead.reject(new Error('蓝牙已断开'));this.identityRead=null;}this.status=null;this.epoch++;if(this.downloadRead){this.downloadRead.reject(new Error('蓝牙已断开'));this.downloadRead=null;}await this.stopScan();const id=this.id||this.attemptId;this.id=null;this.attemptId=null;if(id)await call('closeBLEConnection',{deviceId:id}).catch(()=>{});if(wx.offBLECharacteristicValueChange)wx.offBLECharacteristicValueChange(this.onValue);if(wx.offBLEConnectionStateChange)wx.offBLEConnectionStateChange(this.onConnection);this.listening=false;await call('closeBluetoothAdapter',{}).catch(()=>{});this.state('蓝牙未连接。',false);}
}
module.exports={bleDiagnostics:()=>JSON.stringify(events,null,2),ArkBLE,packet,utf8,decode,credentials,storage};
