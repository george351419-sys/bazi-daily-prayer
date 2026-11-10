// ForFilm Ark wire protocol: tools/ForFilm/js/bluetooth.js (GPL-3.0).
// Credentials go directly to the chosen peripheral, never to an HTTP endpoint.
import {renderTransfer,withConnection} from './transfer-status.js?v=20261110-generating-guard-v1';
const SERVICE='00002000-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC='00002001-0000-1000-8000-00805f9b34fb';
const HEARTBEAT_NORMAL='https://playmath.cn/api/v1/device/heartbeat';
const HEARTBEAT_DIRTY_KEY='ark:heartbeat-url-dirty';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function packet(channel,payload=[]){
 const bytes=new Uint8Array(payload.length+4);bytes.set([0x55,channel,payload.length]);bytes.set(payload,3);
 bytes[bytes.length-1]=bytes.slice(0,-1).reduce((sum,n)=>(sum+n)&255,0);return bytes;
}
export function wifiCredentials(ssid,password){
 const encoder=new TextEncoder(),name=encoder.encode(ssid),secret=encoder.encode(password);
 if(!name.length||name.length>32||/[\x00-\x1f\x7f]/.test(ssid))throw new Error('Wi-Fi 名称需要 1–32 个 UTF-8 字节，不能包含控制字符。');
 // The current firmware ignores an empty password; do not pretend open-network setup works.
 if(secret.length<8||secret.length>63||/[\x00-\x1f\x7f]/.test(password))throw new Error('当前画屏支持 8–63 个 UTF-8 字节的 Wi-Fi 密码。');
 return {name,secret};
}
export function arkDeviceId(name){
 const match=/^FRAMEFILMARK-([a-f0-9]{12})$/i.exec(String(name||'').trim());
 return match?match[1].toLowerCase():null;
}
export class ArkNetwork {
 constructor({bluetooth,onState=()=>{},onDownload=()=>{},onOta=()=>{},delay=sleep,timeout=30000}={}){this.bluetooth=bluetooth;this.onState=onState;this.onDownload=onDownload;this.onOta=onOta;this.delay=delay;this.timeout=timeout;this.pendingResponses=new Map();this.epoch=0;}
 trace(stage){this.diagnostics=this.diagnostics||[];this.diagnostics.push({time:new Date().toISOString(),stage});if(this.diagnostics.length>120)this.diagnostics.shift();}
 state(text,connected=false){this.onState({text,connected,paired:!!this.characteristic,deviceName:this.device?.name||null,deviceId:this.deviceId||null,connectionId:this.epoch,savedSSID:this.savedSSID||''});}
 async open(device){
  this.trace(device.gatt.connected?'open:existing-connection-reset':'open:disconnected');
  if(device.gatt.connected)device.gatt.disconnect();
  this.trace('gatt:connect');const server=await device.gatt.connect();this.trace('gatt:connected');const service=await server.getPrimaryService(SERVICE);this.trace('gatt:service');const characteristic=await service.getCharacteristic(CHARACTERISTIC);this.trace('gatt:characteristic');
  return {server,characteristic};
 }
 async connect(knownDevice=null){
  const epoch=++this.epoch;
  if(this.characteristic&&this.listener)this.characteristic.removeEventListener('characteristicvaluechanged',this.listener);
  if(this.device&&this.lost)this.device.removeEventListener('gattserverdisconnected',this.lost);
  this.characteristic=null;this.device=null;this.deviceId=null;this.lastStatus=null;
  this.state('正在扫描画屏…');
  let device;
  try{
   // Must remain directly in the click handler before any await (Web Bluetooth gesture).
   device=knownDevice||await this.bluetooth.requestDevice({filters:[{namePrefix:'FRAMEFILM'}],optionalServices:[SERVICE]});
   if(epoch!==this.epoch)return;
   this.device=device;this.deviceId=null;
   let opened;
   try{opened=await this.open(device);}
   catch(error){
    if(knownDevice||!/GATT operation already in progress/i.test(error?.message||'')||typeof this.bluetooth.getDevices!=='function')throw error;
    const alternatives=(await this.bluetooth.getDevices()).filter(candidate=>candidate!==device&&/^FRAMEFILM/i.test(candidate.name||''));
    for(const candidate of alternatives){
     try{
      opened=await this.open(candidate);device=candidate;this.device=candidate;this.deviceId=null;break;
     }catch{}
    }
    if(!opened)throw error;
   }
   const {characteristic}=opened;
   if(epoch!==this.epoch){device.gatt.disconnect();return;}
   device.addEventListener('gattserverdisconnected',this.lost=()=>{this.trace('native:disconnected');if(epoch===this.epoch)this.disconnect('蓝牙已断开。正在尝试恢复连接；若画屏已休眠，请按键唤醒，无需重新填写 Wi-Fi。');});
   this.characteristic=characteristic;this.listener=event=>{if(epoch===this.epoch&&this.characteristic===characteristic)this.receive(new Uint8Array(event.target.value.buffer,event.target.value.byteOffset,event.target.value.byteLength));};
   characteristic.addEventListener('characteristicvaluechanged',this.listener);this.trace('notify:start');await characteristic.startNotifications();this.trace('notify:ready');
   if(epoch!==this.epoch)return;
   this.trace('saved-ssid:read');this.savedSSID=await this.readSavedSSID().catch(()=>null);
   // 自动归位只针对本次浏览器记下的脏状态；更早版本认主失败留下的残留地址
   // 无标记可依，改由页面上「修复设备心跳地址」按钮按需检查，避免每次连接都多一次读取等待。
   if(this.heartbeatDirty())await this.restoreHeartbeatURL(epoch);
   this.state('蓝牙已连接：'+device.name+'。正在检查画屏已保存的 Wi-Fi。');
  }catch(error){this.trace('connect:failed:'+String(error?.name||'Error'));if(epoch===this.epoch){this.disconnect();throw error;}}
 }
 receive(bytes){
  if(bytes.length!==bytes[2]+4||bytes[0]!==0x55||bytes.slice(0,-1).reduce((s,n)=>(s+n)&255,0)!==bytes.at(-1))return;
  this.trace('notify:'+bytes[1].toString(16).padStart(2,'0')+':'+bytes.length);
  if(this.pendingResponses.has(bytes[1])){const pending=this.pendingResponses.get(bytes[1]);this.pendingResponses.delete(bytes[1]);pending.resolve(bytes.slice(3,-1));}
  if(bytes[1]===0x3f&&this.identityRead&&bytes.length===bytes[2]+4&&bytes[0]===0x55&&bytes.slice(0,-1).reduce((a,b)=>(a+b)&255,0)===bytes.at(-1)){const pending=this.identityRead;this.identityRead=null;pending.resolve(new TextDecoder().decode(bytes.slice(3,-1)).replace(/\0.*$/,''));}
  if(bytes[1]===0x33&&this.ssidRead){const pending=this.ssidRead;this.ssidRead=null;pending.resolve(new TextDecoder().decode(bytes.slice(3,-1)).replace(/\0.*$/,''));}
  if(bytes[1]===0x3d&&bytes[2]===2){const state=bytes[3],progress=bytes[4];this.onDownload({state,progress});if(this.downloadRead){this.downloadRead.resolve({state,progress});this.downloadRead=null;}}
  if(bytes[1]===0x3a&&bytes[2]===1){
   const connected=bytes[3]===1;
   this.trace(connected?'wifi:online':'wifi:offline');
   this.lastStatus=connected;
   if(connected&&this.waiting){this.waiting.resolve();this.waiting=null;}
   this.state(connected?'画屏 Wi-Fi 已连接。':'蓝牙已连接，画屏 Wi-Fi 尚未连接；会尝试使用已保存的网络，首次使用或更换网络时再填写密码。',connected);
  }
 }
 async write(channel,data,epoch=this.epoch,pace=200){
  if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙已断开，请重新连接。');
  const command=channel.toString(16).padStart(2,'0');this.trace('write:'+command+':start');
  const prior=this.bleWrite||Promise.resolve();const write=prior.catch(()=>{}).then(()=>{if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙已断开，请重新连接。');return this.characteristic.writeValue(packet(channel,data));});this.bleWrite=write;await write;await this.delay(pace);
  this.trace('write:'+command+':done');
  if(epoch!==this.epoch)throw new Error('蓝牙已断开，请重新连接。');
 }
 // Serialize whole network operations, not just individual BLE writes. A
 // credential change must not disconnect Wi-Fi during identity authentication.
 networkOperation(operation){
  const epoch=this.epoch,prior=this.networkOperationTail||Promise.resolve();
  const next=prior.catch(()=>{}).then(async()=>{
   if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙已断开，请重新连接。');
   this.networkBusy=true;
   try{return await operation();}finally{this.networkBusy=false;}
  });
  this.networkOperationTail=next;return next;
 }
 async resumeWifi(){return this.networkOperation(()=>this.resumeWifiSession());}
 async resumeWifiSession(){
  // 0x38 uses credentials already held by the peripheral; never read the password.
  await this.write(0x38,[]);
  await this.write(0x3a,[]);
 }
 async ensureWifi(){return this.networkOperation(()=>this.ensureWifiSession());}
 async ensureWifiSession(){
  // ritual.6's 0x38 calls esp_wifi_disconnect() before reconnecting. On an
  // already-online screen, avoid interrupting its Wi-Fi on every BLE attach.
  const status=await this.request(0x3a,[],1500);
  if(status[0]!==1)await this.resumeWifiSession();
 }
 async ensureCloudAPI(){
  const expected='https://playmath.cn';
  const decode=bytes=>new TextDecoder().decode(bytes).replace(/\0.*$/s,'');
  const current=decode(await this.request(0x37,[],2000));
  if(current){
   let url;try{url=new URL(current);}catch{throw new Error('画屏云端 API 地址无效，请先核对设备配置。');}
   if(url.origin!==expected||url.username||url.password)throw new Error('画屏使用其他云端 API，请先核对设备配置。');
   this.trace('cloud-api:verified');return;
  }
  this.trace('cloud-api:missing');
  await this.write(0x36,new TextEncoder().encode(expected));
  if(decode(await this.request(0x37,[],2000))!==expected)throw new Error('画屏云端 API 地址尚未保存，暂未开始身份核验。');
  this.trace('cloud-api:initialized');
 }
 async readHeartbeatURL(){
  const epoch=this.epoch;const read=new Promise((resolve,reject)=>{this.identityRead={resolve,reject};});read.catch(()=>{});
  const timer=setTimeout(()=>{this.identityRead?.reject(new Error('画屏未回复身份通道，请保持唤醒后重试。'));this.identityRead=null;},3000);
  try{await this.write(0x3f,[],epoch);return await read;}finally{clearTimeout(timer);this.identityRead=null;}
 }
 // 认主会把设备云端心跳地址临时改成 ?link=<nonce> 配对地址。若认主中途蓝牙断开，
 // resolveIdentitySession 的 finally 因要求 characteristic 仍在而无法写回，设备会一直
 // 打配对地址：BLE 显示 Wi-Fi 在线，云端却收不到心跳，新内容永远下发不了。
 // 用持久化标记记住这种脏状态，下次连接成功时幂等归位。
 heartbeatDirty(){try{return globalThis.localStorage?.getItem(HEARTBEAT_DIRTY_KEY)==='1';}catch{return false;}}
 markHeartbeatDirty(){try{globalThis.localStorage?.setItem(HEARTBEAT_DIRTY_KEY,'1');}catch{}this.trace('heartbeat-url:dirty');}
 clearHeartbeatDirty(){try{globalThis.localStorage?.removeItem(HEARTBEAT_DIRTY_KEY);}catch{}}
 async restoreHeartbeatURL(epoch=this.epoch){
  try{
   const current=await this.readHeartbeatURL();
   console.warn('[ark][diag] heartbeat URL read:', current, '| dirty-flag:', this.heartbeatDirty());
   if(current===HEARTBEAT_NORMAL){this.clearHeartbeatDirty();this.trace('heartbeat-url:clean');return {result:'clean',url:current};}
   if(!current){this.trace('heartbeat-url:empty');return {result:'empty',url:current};}
   // 只归位本站地址与本站配对 challenge；指向其它云端的设备不擅自改写。
   if(current&&!current.startsWith(HEARTBEAT_NORMAL+'?link=')){this.trace('heartbeat-url:foreign');return {result:'foreign',url:current};}
   await this.write(0x3e,new TextEncoder().encode(HEARTBEAT_NORMAL),epoch);
   this.clearHeartbeatDirty();this.trace('heartbeat-url:restored');return {result:'restored',url:current};
  }catch(error){this.trace('heartbeat-url:restore-failed:'+String(error?.name||'Error'));return {result:'failed',url:null};}
 }
 async resolveIdentity(request){
  return this.networkOperation(async()=>{
   this.identifying=true;this.trace('identity:begin');
   try{const id=await this.resolveIdentitySession(request);this.trace('identity:identified');return id;}
   catch(error){this.trace('identity:failed');throw error;}
   finally{this.identifying=false;}
  });
 }
 async resolveIdentitySession(request){
  await this.ensureCloudAPI();
  const epoch=this.epoch,original=await this.readHeartbeatURL(),normal=HEARTBEAT_NORMAL;
  const priorChallenge=original.startsWith(normal+'?link=')&&/^[a-f0-9]{32}&device_id=$/.test(original.slice((normal+'?link=').length));if(original&&original!==normal&&!priorChallenge)throw new Error('画屏使用了其他云端地址，请先核对设备配置。');
  const challenge=await request('/api/account/ritual/device',{beginPairing:true});
  if(!/^[a-f0-9]{32}$/.test(challenge.nonce||'')||challenge.heartbeatURL!==normal+'?link='+challenge.nonce+'&device_id=')throw new Error('设备识别服务回复无效。');
  let changed=false;
  try{
   changed=true;await this.write(0x3e,new TextEncoder().encode(challenge.heartbeatURL),epoch);await this.ensureWifiSession();
   const end=Date.now()+60000;
   while(Date.now()<end){
    if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙连接已断开，请重新连接画屏。');
    await this.request(0x3a,[],1500);
    const result=await request('/api/account/ritual/device',{pairingNonce:challenge.nonce});
    if(result.diagnostic?.stage){
     this.trace('identity:cloud:'+result.diagnostic.stage);
     const failure={device_unregistered:'画屏已到达云端，但设备尚未预置注册。',device_revoked:'画屏已到达云端，但设备已停用。',auth_missing:'画屏已到达云端，但缺少设备认证密钥。',auth_mismatch:'画屏已到达云端，但设备认证密钥不匹配。',invalid_device_id:'画屏已到达云端，但回报的设备编号无效。'}[result.diagnostic.stage];
     if(failure)throw new Error(failure+'当前账号尚未绑定，未开始内容下载。');
    }
    if(result.status==='identified'&&/^[a-f0-9]{12}$/.test(result.deviceId||''))return result.deviceId;
    await this.delay(2000);
   }
   throw new Error('尚未收到画屏认证回报，请保持画屏唤醒并点击重试关联。');
  }finally{
   if(changed){
    let restored=false;
    if(epoch===this.epoch&&this.characteristic){try{await this.write(0x3e,new TextEncoder().encode(normal),epoch);restored=true;}catch{}}
    // 蓝牙已断开或写回失败：留标记，等下次连接成功后 restoreHeartbeatURL 归位。
    if(restored)this.clearHeartbeatDirty();else this.markHeartbeatDirty();
   }
  }
 }
 async readSavedSSID(){
  if(this.ssidRead)throw new Error('正在读取网络信息，请稍后重试。');
  const epoch=this.epoch;const read=new Promise((resolve,reject)=>{this.ssidRead={resolve,reject};});read.catch(()=>{});
  const timer=setTimeout(()=>{this.ssidRead?.reject(new Error('未读到已保存的网络，请重新连接画屏。'));this.ssidRead=null;},1500);
  try{await this.write(0x33,[],epoch);const ssid=await read;if(epoch!==this.epoch)throw new Error('蓝牙已断开');this.savedSSID=ssid;return ssid;}finally{clearTimeout(timer);this.ssidRead=null;}
 }
 async resumeSaved(ssid){return this.networkOperation(()=>this.resumeSavedSession(ssid));}
 async resumeSavedSession(ssid){
  if(this.configuring)throw new Error('正在连接 Wi-Fi，请稍候。');this.configuring=true;const epoch=this.epoch;
  try{const saved=await this.readSavedSSID();if(!saved||ssid!==saved)throw new Error('这是新的 Wi-Fi，请填写该网络的现有密码。');
   this.lastStatus=null;await this.write(0x30,[1],epoch);await this.write(0x38,[],epoch);const end=Date.now()+this.timeout;
   while(this.lastStatus!==true&&Date.now()<end){await this.write(0x3a,[],epoch);if(this.lastStatus!==true)await this.delay(700);}
   if(this.lastStatus!==true)throw new Error('使用已保存的密码尚未确认联网；请检查网络，密码变更时再填写新密码。');
  }finally{this.configuring=false;}
 }
 async configure(ssid,password){return this.networkOperation(()=>this.configureSession(ssid,password));}
 async configureSession(ssid,password){
  if(!password)return this.resumeSavedSession(ssid);
  if(this.configuring)throw new Error('正在配网，请等待当前操作结束。');
  const {name,secret}=wifiCredentials(ssid,password),epoch=this.epoch;this.configuring=true;
  try{
   this.state('正在通过蓝牙写入 Wi-Fi 设置…');
   // Observe a disconnected state first: an old network must not confirm new credentials.
   this.lastStatus=null;await this.write(0x39,[],epoch);
   const disconnectDeadline=Date.now()+5000;
   while(this.lastStatus!==false&&Date.now()<disconnectDeadline){await this.write(0x3a,[],epoch);if(this.lastStatus!==false)await this.delay(300);}
   if(this.lastStatus!==false)throw new Error('画屏尚未确认断开原 Wi-Fi，请稍后重试。');
   await this.write(0x32,name,epoch);await this.write(0x34,secret,epoch);
   const readback=new Promise((resolve,reject)=>{this.ssidRead={resolve,reject};});readback.catch(()=>{});
   const readTimer=setTimeout(()=>{this.ssidRead?.reject(new Error('尚未确认 Wi-Fi 名称写入，请重试。'));this.ssidRead=null;},3000);
   try{await this.write(0x33,[],epoch);if(await readback!==ssid)throw new Error('画屏保存的 Wi-Fi 名称不一致，请重新配网。');}
   finally{clearTimeout(readTimer);this.ssidRead=null;}
   await this.write(0x30,[1],epoch);
   let done=false;const confirmed=new Promise((resolve,reject)=>{this.waiting={resolve:()=>{done=true;resolve();},reject};});
   // Attach a rejection handler immediately so disconnects during a write are handled.
   confirmed.catch(()=>{});
   const deadline=Date.now()+this.timeout;
   try{
    await this.write(0x38,[],epoch);
    while(!done&&Date.now()<deadline){await this.write(0x3a,[],epoch);if(!done)await this.delay(700);}
    if(!done)throw new Error('尚未收到 Wi-Fi 联网确认。请检查密码、2.4 GHz 网络及画屏电量后重试。');
    await confirmed;this.savedSSID=ssid;
   }finally{this.waiting=null;}
  }finally{secret.fill(0);this.configuring=false;}
 }
 async queryDownload(timeout=3000){
  const epoch=this.epoch;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{if(this.downloadRead?.reject===reject)this.downloadRead=null;reject(new Error('画屏未返回下载状态。'));},timeout);
   this.downloadRead={resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
   this.write(0x3d,[],epoch).catch(error=>{if(this.downloadRead?.reject===reject)this.downloadRead=null;clearTimeout(timer);reject(error);});
  });
 }
 async request(channel,payload=[],timeout=5000){
  const epoch=this.epoch;
  return new Promise((resolve,reject)=>{
   if(this.pendingResponses.has(channel))return reject(new Error('画屏命令仍在处理中。'));
   const timer=setTimeout(()=>{this.pendingResponses.delete(channel);reject(new Error('画屏未返回命令结果。'));},timeout);
   this.pendingResponses.set(channel,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
   this.write(channel,payload,epoch).catch(error=>{this.pendingResponses.delete(channel);clearTimeout(timer);reject(error);});
  });
 }
 async readBuildInfo(){
  const data=await this.request(0x56);
  if(data.length<39||data[0]!==1)throw new Error('设备升级能力信息不完整，请重新连接并读取版本。');
  const fields=new TextDecoder().decode(data.slice(37)).split('\0');
  return {version:fields[0],project:fields[1]||'',otaMax:new DataView(data.buffer,data.byteOffset+1,4).getUint32(0),sha:Array.from(data.slice(5,37)).map(n=>n.toString(16).padStart(2,'0')).join('')};
 }
 async startBleOta(image,sha256){
  const bytes=image instanceof Uint8Array?image:new Uint8Array(image),info=await this.readBuildInfo();
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('固件校验信息无效。');
  if(info.project!=='frame_film_ark'||!info.otaMax||bytes.length>info.otaMax)throw new Error('固件与设备项目或升级分区容量不匹配：文件 '+bytes.length+' 字节，设备容量 '+info.otaMax+' 字节。');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<288||bytes[0]!==0xe9||view.getUint16(12,true)!==9||view.getUint32(32,true)!==0xabcd5432||new TextDecoder().decode(bytes.slice(80,112)).replace(/\0.*$/,'')!=='frame_film_ark')throw new Error('固件不是有效的 ESP32-S3 Ark 应用镜像。');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(digest).map(n=>n.toString(16).padStart(2,'0')).join('')!==sha256)throw new Error('固件 SHA-256 校验失败，未写入画屏。');
  const epoch=this.epoch,head=new Uint8Array(4);new DataView(head.buffer).setUint32(0,bytes.length);
  const barrier=async()=>{const result=await this.request(0x42,[],15000);if(result.length!==5)throw new Error('未收到画屏固件处理确认，已停止发送。');};
  try{
  await this.write(0x10,head,epoch);await barrier();
  let chunks=0;
  for(let offset=0;offset<bytes.length;offset+=192){
   await this.write(0x11,bytes.slice(offset,offset+192),epoch,12);chunks++;
   if(chunks%8===0)await barrier();
   const sent=Math.min(offset+192,bytes.length);this.onOta({transport:'ble',state:2,progress:Math.floor(sent*100/bytes.length),received:sent,total:bytes.length});
  }
  if(chunks%8!==0)await barrier();
  }catch(error){throw new Error('蓝牙升级传输已停止：'+error.message+'。请重启画屏后重新连接再试；未发送固件提交命令。');}
  // Only a complete, drained transfer may request validation and reboot. Never commit on failure.
  try{await this.write(0x13,[],epoch);}catch(error){if(this.characteristic)throw error;}
  return true;
 }
 async startWifiOta(url,size,sha256){
  if(!/^[a-f0-9]{64}$/.test(sha256)||!/^https:\/\/playmath\.cn\//.test(url)||!Number.isSafeInteger(size)||size<1)throw new Error('固件地址或校验信息无效。');
  const decoder=new TextDecoder(),encoder=new TextEncoder();
  const ssid=new TextDecoder().decode(await this.request(0x33)).replace(/\0.*$/,'');
  const passwordBytes=await this.request(0x35),password=decoder.decode(passwordBytes).replace(/\0.*$/,'');
  const head=new Uint8Array(36);new DataView(head.buffer).setUint32(0,size);for(let i=0;i<32;i++)head[4+i]=parseInt(sha256.slice(i*2,i*2+2),16);
  const tail=[...encoder.encode(ssid),0,...passwordBytes,0,...encoder.encode(url),0],payload=new Uint8Array(36+tail.length);payload.set(head);payload.set(tail,36);passwordBytes.fill(0);
  if(!ssid||payload.length>192)throw new Error('设备保存的 Wi‑Fi 信息或固件地址不完整。');
  const accepted=await this.request(0x57,payload,6000);if(accepted[0]!==0)throw new Error('画屏拒绝启动 Wi‑Fi 固件下载，错误码 '+accepted[0]+'。');
  const deadline=Date.now()+140000;let status;
  while(Date.now()<deadline){
   await this.delay(1000);status=await this.request(0x51,[],5000);const [state,progress,error,received,total]=[status[0],status[1],status[2],new DataView(status.buffer,status.byteOffset+3,4).getUint32(0),new DataView(status.buffer,status.byteOffset+7,4).getUint32(0)];
   this.onOta({state,progress,error,received,total});
   if(state===7){const applied=await this.request(0x58,[],6000);if(applied[0]!==0)throw new Error('固件下载完成，但应用新固件失败，错误码 '+applied[0]+'。');return true;}
   if(state===5||state===6)throw new Error('Wi‑Fi 固件下载失败，错误码 '+error+'。');
  }
  throw new Error('等待固件下载完成超时。');
 }
 disconnect(message='蓝牙未连接。请先唤醒画屏，再连接。'){
  if(this.identityRead){this.identityRead.reject(new Error('蓝牙已断开'));this.identityRead=null;}this.epoch++;if(this.waiting){this.waiting.reject(new Error('蓝牙已断开'));this.waiting=null;}
  if(this.ssidRead){this.ssidRead.reject(new Error('蓝牙已断开'));this.ssidRead=null;}
  for(const pending of this.pendingResponses.values())pending.reject(new Error('蓝牙已断开'));this.pendingResponses.clear();
  if(this.characteristic&&this.listener)this.characteristic.removeEventListener('characteristicvaluechanged',this.listener);
  if(this.device){this.device.removeEventListener('gattserverdisconnected',this.lost);if(this.device.gatt.connected)this.device.gatt.disconnect();}
  this.characteristic=null;this.device=null;this.deviceId=null;this.lastStatus=null;this.state(message);
 }
}
export function setupNetwork(){
 const root=document.querySelector('#network-onboarding');if(!root)return;
 const connect=root.querySelector('[data-ble-connect]'),disconnect=root.querySelector('[data-ble-disconnect]'),form=root.querySelector('form'),state=root.querySelector('[role=status]'),send=form.querySelector('button[type=submit]');
 let binding=root.querySelector('#network-device-binding'),bind=root.querySelector('#bind-ark-device'),bindingState=root.querySelector('#network-device-state');
 if(!binding){
  binding=document.createElement('div');binding.id='network-device-binding';binding.className='network-device-binding';binding.hidden=true;
  bindingState=document.createElement('p');bindingState.id='network-device-state';bindingState.setAttribute('role','status');
  bind=document.createElement('button');bind.type='button';bind.id='bind-ark-device';bind.className='secondary';bind.textContent='绑定到当前账户并准备画屏';
  const note=document.createElement('small');note.textContent='绑定后会检查今日与次日两幅祈福画；缺少次日画作时会自动补齐。网页只有收到设备上屏回报后才会展示设备实际画面。';
  binding.append(bindingState,bind,note);state.after(binding);
 }
 const diagnostics=document.createElement('button');diagnostics.type='button';diagnostics.className='text-button ark-diag-button';diagnostics.textContent='复制连接诊断';state.after(diagnostics);diagnostics.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(client.diagnostics||[],null,2));diagnostics.textContent='连接诊断已复制';}catch{diagnostics.textContent='无法复制，请允许剪贴板权限后重试';}});
 let busy=false,connectedDevice=null,downloadTimer=null,downloadBusy=false,announcedDevice=null;
 let reconnectTimer=null,reconnectAttempts=0,reconnectBusy=false,rememberedDevice=null,allowReconnect=false,latestStatus=null,latestTransferState=null,syncSha=null,syncBusy=false,connection=null,syncRequestedAt=null,requestedSha=null,forceSync=false,delivered=null,heartbeatProbe=null;
 const statusDiag=document.createElement('button');statusDiag.type='button';statusDiag.className='text-button ark-diag-button';statusDiag.textContent='复制状态诊断';state.after(statusDiag);statusDiag.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify({status:latestStatus,transfer:latestTransferState,connection,heartbeat:heartbeatProbe},null,2));statusDiag.textContent='状态诊断已复制';}catch{statusDiag.textContent='无法复制，请允许剪贴板权限后重试';}});
 // 设备下载完成后常因 WiFi 抖动/休眠没能把“已存储”回执发回云端，导致网页状态滞后。
 // 送达确认只接受两种真实证据：手机 BLE 观测到设备回报下载完成，或用户亲眼看到新画后手动标记。
 // 按 deviceId + 内容哈希隔离，换设备或生成新内容自动失效；绝不把“设备在线时长”当作送达。
 const DELIVERY_KEY='prayer-ark-delivered-v1';
 function markDelivered(sha,deviceId,evidence,artworkId=null){
  delivered={deliveredAt:Date.now(),targetSha:sha,deviceId,evidence,artworkId:artworkId||null};
  try{localStorage.setItem(DELIVERY_KEY,JSON.stringify(delivered));}catch{}
  announceConnection();
 }
 function clearDelivered(){delivered=null;try{localStorage.removeItem(DELIVERY_KEY);}catch{}}
 try{const saved=JSON.parse(localStorage.getItem(DELIVERY_KEY)||'null');if(saved&&/^[a-f0-9]{12}$/.test(saved.deviceId||'')&&/^[a-f0-9]{64}$/.test(saved.targetSha||''))delivered=saved;}catch{}
 const CONFIRM_LABEL='画屏已显示新画 · 标记完成',CONFIRMED_LABEL='已标记完成 · 点击撤销';
 const confirmBtn=document.createElement('button');confirmBtn.type='button';confirmBtn.className='text-button ark-diag-button';
 confirmBtn.textContent=delivered?CONFIRMED_LABEL:CONFIRM_LABEL;
 confirmBtn.title='亲眼看到画屏已显示新画时点此确认；这是手动标记，不是设备回执。再点一次可撤销，恢复真实状态';
 state.after(confirmBtn);
 confirmBtn.addEventListener('click',()=>{
  // 允许撤销：旧标记会长期把页面伪装成“已完成”，遮住设备真实未下载的证据。
  if(delivered){
   clearDelivered();
   confirmBtn.textContent=CONFIRM_LABEL;
   // 撤销必须广播：主画面区等模块各自持有 connection，只改本模块局部变量
   // 会让它们在下次刷新前继续显示手动标记的伪完成态（无设备回报时间）。
   announceConnection();
   return;
  }
  const sha=latestStatus?.build?.sha256,deviceId=latestStatus?.device?.id||client.deviceId;
  if(!sha||!/^[a-f0-9]{64}$/.test(sha)||!/^[a-f0-9]{12}$/.test(deviceId||'')){confirmBtn.textContent='请先连接画屏并等待内容就绪';return;}
  markDelivered(sha,deviceId,'user-confirmed',latestStatus?.plan?.artworkIds?.[0]||null);
  confirmBtn.textContent=CONFIRMED_LABEL;
 });
 // 重新生成新画（换了生辰/愿望）即视为内容已变：上一幅的送达确认立即失效，
 // 否则旧“✓ 本次同步已完成”会回灌到新画的进度里。delivered 仅按 deviceId+内容哈希隔离，
 // 而 build.sha256 在重新生成后不会立刻变化，所以必须显式清掉并广播。
 document.addEventListener('prayer:generated',()=>{
  if(!delivered)return;
  clearDelivered();
  if(connection)connection={...connection,delivered:null};
  announceConnection();
  confirmBtn.textContent=CONFIRM_LABEL;
 });
 function announceConnection(){connection={paired:!!client.characteristic,deviceId:client.deviceId,wifiConnected:client.lastStatus===true,receivedAt:Date.now(),syncRequestedAt,requestedSha,delivered};document.dispatchEvent(new CustomEvent('prayer:ark-connection',{detail:connection}));if(latestTransferState)renderTransfer(transfer,withConnection(latestTransferState,latestStatus,connection,Date.now(),latestStatus?.plan?.artworkIds?.[0]||null));}
 const networkGrid=root.querySelector('.network-grid');
 function updateConnectionControls(){if(networkGrid)networkGrid.hidden=false;state.hidden=false;binding.hidden=!connectedDevice;}
 updateConnectionControls();
 let editingPassword=false;
 const savedPassword=root.querySelector('[data-saved-wifi-password]'),passwordEntry=root.querySelector('[data-wifi-password-entry]');
 const updatePassword=()=>{const saved=!!client.savedSSID&&form.elements.ssid.value===client.savedSSID&&!editingPassword;if(savedPassword)savedPassword.hidden=!saved;if(passwordEntry)passwordEntry.hidden=saved;};
 const password=form.elements.wifiPassword;
 const transfer=document.createElement('div');transfer.hidden=true;state.after(transfer);
 const firmwareBox=document.createElement('details');firmwareBox.className='firmware-update';
 const firmwareSummary=document.createElement('summary');firmwareSummary.textContent='画屏固件更新';
 const firmwareVersion=document.createElement('p');firmwareVersion.textContent='连接蓝牙后可读取当前固件版本。';
 const firmwareButton=document.createElement('button');firmwareButton.type='button';firmwareButton.className='secondary';firmwareButton.textContent='下载并安装最新固件';firmwareButton.disabled=true;
 const firmwareStatus=document.createElement('p');firmwareStatus.setAttribute('role','status');firmwareStatus.setAttribute('aria-live','polite');
 firmwareBox.append(firmwareSummary,firmwareVersion,firmwareButton,firmwareStatus);

 let buildChecked=false,buildInfoRead=null;
 const client=new ArkNetwork({bluetooth:navigator.bluetooth,onState:status=>{
  if(!status.connected){syncSha=null;syncRequestedAt=null;requestedSha=null;}
  state.textContent=status.text;send.disabled=!status.paired||busy;disconnect.hidden=!status.paired;firmwareButton.disabled=!status.paired||busy;
  connectedDevice=status.paired?{deviceId:status.deviceId,deviceName:status.deviceName,connectionId:status.connectionId,resolveIdentity:async request=>{const id=await client.resolveIdentity(request);client.deviceId=id;client.state('设备身份已核验，正在关联当前账户。',client.lastStatus===true);return id;}}:null;
  bind.disabled=!status.paired;binding.hidden=false;updateConnectionControls();
  if(!status.paired){bindingState.textContent='蓝牙未连接，暂无法认主。请靠近画屏、打开手机蓝牙后重新连接；连上蓝牙后会自动认主，无需手动输入编号。';delete bindingState.dataset.deviceId;delete bindingState.dataset.bindingResult;}
  else if(bindingState.dataset.bindingResult==='ok'||bindingState.dataset.bindingResult==='failed'){/* 认主已有明确结果，保留 account-ui 提示，onState 不覆盖 */}
  else if(status.deviceId&&status.deviceId!=='pending'&&bindingState.dataset.deviceId!==status.deviceId){bindingState.dataset.deviceId=status.deviceId;bindingState.textContent='当前画屏：'+status.deviceName+' · 设备编号 '+status.deviceId;}
  else if(!bindingState.textContent)bindingState.textContent='蓝牙已连接，正在自动认主到当前账户；设备联网后会主动领取内容。';
  const announceKey=status.paired?(status.connected?'online':'paired')+':'+(status.deviceId||'pending'):null;
  if(announceKey!==announcedDevice){announcedDevice=announceKey;if(status.paired)document.dispatchEvent(new CustomEvent('prayer:ark-device',{detail:connectedDevice}));}
  if(status.savedSSID&&!form.elements.ssid.value)form.elements.ssid.value=status.savedSSID;
  password.placeholder='输入该 Wi-Fi 的现有密码';updatePassword();
  form.classList.toggle('network-connected',status.connected);
  if(status.paired&&reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  if(status.paired&&!downloadTimer){downloadTimer=setInterval(pollDownload,2000);}
  else if(!status.paired&&downloadTimer){clearInterval(downloadTimer);downloadTimer=null;}
  if(status.paired&&!buildChecked){buildChecked=true;buildInfoRead=client.readBuildInfo().then(info=>{firmwareVersion.textContent='当前固件：'+(info.version||'未知版本');}).catch(()=>{firmwareVersion.textContent='当前固件版本暂时无法读取。';});}
  announceConnection();
  if(!status.paired){
   buildChecked=false;syncSha=null;
   if(allowReconnect&&!busy&&!reconnectBusy&&rememberedDevice&&!reconnectTimer&&reconnectAttempts<3){
    reconnectTimer=setTimeout(async()=>{
     reconnectTimer=null;reconnectAttempts++;
     busy=true;reconnectBusy=true;
     try{while(downloadBusy)await sleep(25);await client.connect(rememberedDevice);await buildInfoRead;await client.ensureWifi();reconnectAttempts=0;}
     catch(error){state.textContent='连接暂未恢复，请按键唤醒画屏后连接蓝牙；无需重填 Wi-Fi。'+error.message;}
     finally{busy=false;reconnectBusy=false;if(!client.characteristic&&allowReconnect&&reconnectAttempts<3)client.state('蓝牙仍未连接，准备再次尝试。');void syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});}
    },3000);
   }
  }
 },onDownload:next=>{
  document.dispatchEvent(new CustomEvent('prayer:ark-download',{detail:{...next,deviceId:client.deviceId}}));
 },onOta:next=>{
  const labels=['等待开始','连接 Wi‑Fi','下载固件','恢复原 Wi‑Fi','已完成','下载失败','已取消','可应用','正在应用'];
  firmwareStatus.textContent='固件升级：'+(labels[next.state]||'状态未知')+(next.state===2?' '+next.progress+'%':'');
 }});
 // 设备云端无心跳时，最直接的证据是「设备到底往哪个地址打心跳」。连上蓝牙后读 0x3f，
 // 把地址显示出来并写进「复制状态诊断」，避免靠猜。若确认是本站配对地址残留则顺手归位，
 // 指向其它云端时不擅自改写。旧版本认主失败没留自动归位标记，因此需要按需入口。
 const repairBtn=document.createElement('button');repairBtn.type='button';repairBtn.className='text-button ark-diag-button';
 repairBtn.textContent='读取设备心跳地址';repairBtn.title='连接蓝牙后点此读取画屏实际使用的云端心跳地址；地址会显示在下方并写入「复制状态诊断」。仅本站配对地址残留会被归位。';
 state.after(repairBtn);
 const heartbeatInfo=document.createElement('small');heartbeatInfo.className='ark-diag-url';repairBtn.after(heartbeatInfo);
 repairBtn.addEventListener('click',async()=>{
  if(!client.characteristic){repairBtn.textContent='请先连接画屏，再读取心跳地址';return;}
  if(client.identifying||client.networkBusy){repairBtn.textContent='正在处理其它操作，请稍候再试';return;}
  repairBtn.disabled=true;repairBtn.textContent='正在读取心跳地址…';
  try{const probe=await client.restoreHeartbeatURL();
   heartbeatProbe={url:probe.url||null,result:probe.result,normal:HEARTBEAT_NORMAL,checkedAt:new Date().toISOString()};
   heartbeatInfo.textContent=probe.url?'设备心跳地址：'+probe.url:'未读到心跳地址（画屏可能未唤醒或未回复）';
   repairBtn.textContent=({restored:'配对地址已归位 · 请点「复制状态诊断」取证',clean:'心跳地址正常 · 请点「复制状态诊断」取证',foreign:'设备指向其它云端，未改动 · 请点「复制状态诊断」取证',empty:'画屏未回复心跳地址',failed:'读取失败，请唤醒画屏后重试'})[probe.result]||'检查完成';
  }finally{repairBtn.disabled=false;}
 });
 root.append(firmwareBox);
 async function pollDownload(){
  if(!client.characteristic||downloadBusy||busy||client.networkBusy||client.identifying)return;downloadBusy=true;
  try{
   await client.write(0x3a,[]);
   const dl=await client.queryDownload().catch(()=>null);
   // 手机通过蓝牙明确观测到设备回报“下载完成”(state===2) 且目标包对得上：自动确认送达。
   // 不用“设备在线多久”推断送达——在线不等于内容已上屏，避免过度承诺。
   if(dl&&dl.state===2&&latestStatus?.build?.status==='published'&&latestStatus.build.sha256&&latestStatus.build.sha256===requestedSha&&client.deviceId&&!delivered){
    markDelivered(latestStatus.build.sha256,client.deviceId,'ble-download-complete',latestStatus?.plan?.artworkIds?.[0]||null);confirmBtn.textContent=CONFIRMED_LABEL;
   }
  }
  catch(error){if(client.characteristic)state.textContent='正在确认画屏连接状态，请稍候。';document.dispatchEvent(new CustomEvent('prayer:ark-download',{detail:{deviceId:client.deviceId,unavailable:true,error:error.message}}));}
  finally{downloadBusy=false;}
  await syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});
 }
 firmwareButton.textContent='打开固件升级与版本核验';
 firmwareButton.onclick=()=>{location.href='/firmware-upgrade.html?fix=ota-compat-v1';};
 async function syncPublished(force=false){
  if(force)forceSync=true;
  const sha=latestStatus?.build?.sha256;
  if(busy||downloadBusy||syncBusy||client.networkBusy||client.identifying||!client.characteristic||client.lastStatus!==true||!sha||(syncSha===sha&&!forceSync)||latestStatus.pendingUpdate||latestStatus.build.status!=='published'||latestStatus.device?.id!==client.deviceId)return;
  syncBusy=true;try{await client.ensureWifi();if(client.lastStatus===true){syncSha=sha;forceSync=false;requestedSha=sha;syncRequestedAt=Date.now();announceConnection();}}finally{syncBusy=false;}
 }
 document.addEventListener('prayer:transfer-status',event=>{
  latestStatus=event.detail.result;latestTransferState=event.detail.state;updateConnectionControls();
  // 换了内容包或换了画屏，之前的送达确认即失效，避免旧标记冒充新内容已完成。
  if(delivered&&((latestStatus?.build?.sha256&&delivered.targetSha!==latestStatus.build.sha256)||(latestStatus?.device?.id&&delivered.deviceId!==latestStatus.device.id))){console.warn('[ark][diag] delivered cleared — build/device changed',{deliveredTargetSha:delivered?.targetSha,newBuildSha:latestStatus?.build?.sha256,deliveredDevice:delivered?.deviceId,newDevice:latestStatus?.device?.id});clearDelivered();if(connection)connection={...connection,delivered:null};confirmBtn.textContent=CONFIRM_LABEL;}
  renderTransfer(transfer,withConnection(event.detail.state,latestStatus,{...connection,delivered},Date.now(),latestStatus?.plan?.artworkIds?.[0]||null));
  // 顶部常驻回执：完成提示不能只藏在「链接神物」区块里，用户停在任意版块都要看得到。
  const banner=document.getElementById('transfer-complete-banner');
  if(banner){
   const r=latestStatus?.deviceReport,sha=latestStatus?.build?.sha256;
   if(r?.stale)console.warn('[ark][diag] deviceReport STALE — cloud has not received recent heartbeat; targetSha=',r?.targetSha,'| current build sha=',sha);
   // 与 transferStatus 的完成判定保持一致：同包 stored 即使设备深睡变 stale 也算完成；
   // 只认带 completedAt 的真实设备回执，手动标记产生的伪完成态不显示回执横幅。
   const done=['stored','rendered'].includes(event.detail.state?.phase)&&!!sha&&r?.targetSha===sha&&!!event.detail.state?.completedAt&&!latestStatus?.pendingUpdate;
   banner.hidden=!done;
   if(done){
    const stamp=Date.parse(event.detail.state?.completedAt||r?.lastSeen||'');
    banner.textContent='✓ 本次新画已传输完成并存入画屏'+(Number.isFinite(stamp)?' · 设备回报时间 '+new Date(stamp).toLocaleString('zh-CN'):'')+'。网页无需再操作，到画屏按「IMG」→ 确认键查看即可。';
   }
  }
  void syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});
 });
 if(!window.isSecureContext||!navigator.bluetooth){
  connect.disabled=true;state.textContent='此浏览器暂不支持蓝牙配网。请用电脑 Chrome / Edge 或 Android Chrome，在 HTTPS 页面打开；iPhone 请先用支持蓝牙的电脑完成配网。';return;
 }
 document.addEventListener('prayer:ark-sync',async()=>{
  if(!client.characteristic){state.textContent='请先连接附近画屏蓝牙，再点击立即检查同步。';location.hash='network-onboarding';root.scrollIntoView({behavior:'smooth'});return;}
  try{await syncPublished(true);}catch(error){state.textContent='检查同步未启动：'+error.message;}
 });
 connect.onclick=async()=>{busy=true;connect.disabled=true;try{allowReconnect=true;reconnectAttempts=0;clearTimeout(reconnectTimer);reconnectTimer=null;while(downloadBusy)await sleep(25);await client.connect();rememberedDevice=client.device;await buildInfoRead;await client.ensureWifi();await syncPublished();}catch(e){state.textContent=e.name==='NotFoundError'?'已取消设备选择，可以再次连接。':'蓝牙连接失败：'+(e.message||e.name||'未知错误');}finally{busy=false;connect.disabled=false;send.disabled=!client.characteristic;void syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});}};
 disconnect.onclick=()=>{allowReconnect=false;clearTimeout(reconnectTimer);reconnectTimer=null;client.disconnect();};
 bind.onclick=()=>document.dispatchEvent(new CustomEvent('prayer:ark-bind',{detail:connectedDevice}));
 form.elements.ssid.addEventListener('input',()=>{editingPassword=false;password.value='';updatePassword();});
 root.querySelector('[data-change-wifi-password]')?.addEventListener('click',()=>{editingPassword=true;updatePassword();password.focus();});
 form.onsubmit=async event=>{event.preventDefault();busy=true;send.disabled=true;connect.disabled=true;
  for(const control of form.elements)control.disabled=true;
  try{while(downloadBusy)await sleep(25);await client.configure(form.elements.ssid.value,form.elements.wifiPassword.value);}catch(e){state.textContent=e.message;}
  finally{form.elements.wifiPassword.value='';editingPassword=false;updatePassword();for(const control of form.elements)control.disabled=false;busy=false;send.disabled=!client.characteristic;connect.disabled=false;void syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});}
 };
 root.querySelector('[data-show-password]').onchange=event=>{form.elements.wifiPassword.type=event.target.checked?'text':'password';};
 window.addEventListener('pagehide',()=>{form.elements.wifiPassword.value='';allowReconnect=false;clearTimeout(reconnectTimer);client.disconnect();});
}
