// ForFilm Ark wire protocol: tools/ForFilm/js/bluetooth.js (GPL-3.0).
// Credentials go directly to the chosen peripheral, never to an HTTP endpoint.
import {renderTransfer,withConnection} from './transfer-status.js?v=20261101-connected-sync-v2';
const SERVICE='00002000-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC='00002001-0000-1000-8000-00805f9b34fb';
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
 trace(stage){this.diagnostics=this.diagnostics||[];this.diagnostics.push({time:new Date().toISOString(),stage});if(this.diagnostics.length>80)this.diagnostics.shift();}
 state(text,connected=false){this.onState({text,connected,paired:!!this.characteristic,deviceName:this.device?.name||null,deviceId:this.deviceId||null,savedSSID:this.savedSSID||''});}
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
   this.state('蓝牙已连接：'+device.name+'。正在检查画屏已保存的 Wi-Fi。');
  }catch(error){this.trace('connect:failed:'+String(error?.name||'Error'));if(epoch===this.epoch){this.disconnect();throw error;}}
 }
 receive(bytes){
  if(bytes.length!==bytes[2]+4||bytes[0]!==0x55||bytes.slice(0,-1).reduce((s,n)=>(s+n)&255,0)!==bytes.at(-1))return;
  if(this.pendingResponses.has(bytes[1])){const pending=this.pendingResponses.get(bytes[1]);this.pendingResponses.delete(bytes[1]);pending.resolve(bytes.slice(3,-1));}
  if(bytes[1]===0x3f&&this.identityRead&&bytes.length===bytes[2]+4&&bytes[0]===0x55&&bytes.slice(0,-1).reduce((a,b)=>(a+b)&255,0)===bytes.at(-1)){const pending=this.identityRead;this.identityRead=null;pending.resolve(new TextDecoder().decode(bytes.slice(3,-1)).replace(/\0.*$/,''));}
  if(bytes[1]===0x33&&this.ssidRead){const pending=this.ssidRead;this.ssidRead=null;pending.resolve(new TextDecoder().decode(bytes.slice(3,-1)).replace(/\0.*$/,''));}
  if(bytes[1]===0x3d&&bytes[2]===2){const state=bytes[3],progress=bytes[4];this.onDownload({state,progress});if(this.downloadRead){this.downloadRead.resolve({state,progress});this.downloadRead=null;}}
  if(bytes[1]===0x3a&&bytes[2]===1){
   const connected=bytes[3]===1;
   this.lastStatus=connected;
   if(connected&&this.waiting){this.waiting.resolve();this.waiting=null;}
   this.state(connected?'画屏 Wi-Fi 已连接。':'蓝牙已连接，画屏 Wi-Fi 尚未连接；会尝试使用已保存的网络，首次使用或更换网络时再填写密码。',connected);
  }
 }
 async write(channel,data,epoch=this.epoch,pace=200){
  if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙已断开，请重新连接。');
  const prior=this.bleWrite||Promise.resolve();const write=prior.catch(()=>{}).then(()=>{if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙已断开，请重新连接。');return this.characteristic.writeValue(packet(channel,data));});this.bleWrite=write;await write;await this.delay(pace);
  if(epoch!==this.epoch)throw new Error('蓝牙已断开，请重新连接。');
 }
 async resumeWifi(){
  // 0x38 uses credentials already held by the peripheral; never read the password.
  await this.write(0x38,[]);
  await this.write(0x3a,[]);
 }
 async readHeartbeatURL(){
  const epoch=this.epoch;const read=new Promise((resolve,reject)=>{this.identityRead={resolve,reject};});read.catch(()=>{});
  const timer=setTimeout(()=>{this.identityRead?.reject(new Error('画屏未回复身份通道，请保持唤醒后重试。'));this.identityRead=null;},3000);
  try{await this.write(0x3f,[],epoch);return await read;}finally{clearTimeout(timer);this.identityRead=null;}
 }
 async resolveIdentity(request){
  if(this.identifying)throw new Error('正在核验设备身份，请稍候。');
  while(this.configuring)await this.delay(25);
  this.identifying=true;
  try{return await this.resolveIdentitySession(request);}finally{this.identifying=false;}
 }
 async resolveIdentitySession(request){
  const epoch=this.epoch,original=await this.readHeartbeatURL(),normal='https://playmath.cn/api/v1/device/heartbeat';
  const priorChallenge=original.startsWith(normal+'?link=')&&/^[a-f0-9]{32}&device_id=$/.test(original.slice((normal+'?link=').length));if(original&&original!==normal&&!priorChallenge)throw new Error('画屏使用了其他云端地址，请先核对设备配置。');
  const challenge=await request('/api/account/ritual/device',{beginPairing:true});
  if(!/^[a-f0-9]{32}$/.test(challenge.nonce||'')||challenge.heartbeatURL!==normal+'?link='+challenge.nonce+'&device_id=')throw new Error('设备识别服务回复无效。');
  let changed=false;
  try{
   changed=true;await this.write(0x3e,new TextEncoder().encode(challenge.heartbeatURL),epoch);await this.resumeWifi();
   const end=Date.now()+60000;
   while(Date.now()<end){
    if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙连接已断开，请重新连接画屏。');
    const result=await request('/api/account/ritual/device',{pairingNonce:challenge.nonce});
    if(result.status==='identified'&&/^[a-f0-9]{12}$/.test(result.deviceId||''))return result.deviceId;
    await this.delay(2000);
   }
   throw new Error('尚未收到画屏认证回报，请保持画屏唤醒并点击重试关联。');
  }finally{if(changed&&epoch===this.epoch&&this.characteristic)await this.write(0x3e,new TextEncoder().encode(normal),epoch);}
 }
 async readSavedSSID(){
  if(this.ssidRead)throw new Error('正在读取网络信息，请稍后重试。');
  const epoch=this.epoch;const read=new Promise((resolve,reject)=>{this.ssidRead={resolve,reject};});read.catch(()=>{});
  const timer=setTimeout(()=>{this.ssidRead?.reject(new Error('未读到已保存的网络，请重新连接画屏。'));this.ssidRead=null;},1500);
  try{await this.write(0x33,[],epoch);const ssid=await read;if(epoch!==this.epoch)throw new Error('蓝牙已断开');this.savedSSID=ssid;return ssid;}finally{clearTimeout(timer);this.ssidRead=null;}
 }
 async resumeSaved(ssid){
  if(this.configuring)throw new Error('正在连接 Wi-Fi，请稍候。');this.configuring=true;const epoch=this.epoch;
  try{const saved=await this.readSavedSSID();if(!saved||ssid!==saved)throw new Error('这是新的 Wi-Fi，请填写该网络的现有密码。');
   this.lastStatus=null;await this.write(0x30,[1],epoch);await this.write(0x38,[],epoch);const end=Date.now()+this.timeout;
   while(this.lastStatus!==true&&Date.now()<end){await this.write(0x3a,[],epoch);if(this.lastStatus!==true)await this.delay(700);}
   if(this.lastStatus!==true)throw new Error('使用已保存的密码尚未确认联网；请检查网络，密码变更时再填写新密码。');
  }finally{this.configuring=false;}
 }
 async configure(ssid,password){
  if(!password)return this.resumeSaved(ssid);
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
 const diagnostics=document.createElement('button');diagnostics.type='button';diagnostics.className='text-button';diagnostics.textContent='复制连接诊断';state.after(diagnostics);diagnostics.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(client.diagnostics||[],null,2));diagnostics.textContent='连接诊断已复制';}catch{diagnostics.textContent='无法复制，请允许剪贴板权限后重试';}});
 let busy=false,connectedDevice=null,downloadTimer=null,downloadBusy=false,announcedDevice=null;
 let reconnectTimer=null,reconnectAttempts=0,reconnectBusy=false,rememberedDevice=null,allowReconnect=false,latestStatus=null,latestTransferState=null,syncSha=null,syncBusy=false,connection=null,syncRequestedAt=null,requestedSha=null,forceSync=false;
 function announceConnection(){connection={paired:!!client.characteristic,deviceId:client.deviceId,wifiConnected:client.lastStatus===true,receivedAt:Date.now(),syncRequestedAt,requestedSha};document.dispatchEvent(new CustomEvent('prayer:ark-connection',{detail:connection}));if(latestTransferState)renderTransfer(transfer,withConnection(latestTransferState,latestStatus,connection));}
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
  connectedDevice=status.paired?{deviceId:status.deviceId,deviceName:status.deviceName,resolveIdentity:async request=>{const id=await client.resolveIdentity(request);client.deviceId=id;client.state('设备身份已核验，正在关联当前账户。',client.lastStatus===true);return id;}}:null;
  binding.hidden=!status.paired;bind.disabled=!status.paired;updateConnectionControls();
  if(status.deviceId)bindingState.textContent='当前画屏：'+status.deviceName+' · 设备编号 '+status.deviceId;
  else if(status.paired)bindingState.textContent='设备联网后会通过认证心跳核验身份，并自动关联当前账户。';
  const announceKey=status.paired?(status.connected?'online':'paired')+':'+(status.deviceId||'pending'):null;
  if(announceKey!==announcedDevice){announcedDevice=announceKey;if(!status.paired||status.connected)document.dispatchEvent(new CustomEvent('prayer:ark-device',{detail:connectedDevice}));}
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
     try{while(downloadBusy)await sleep(25);await client.connect(rememberedDevice);await buildInfoRead;await client.resumeWifi();reconnectAttempts=0;}
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
 root.append(firmwareBox);
 async function pollDownload(){
  if(!client.characteristic||downloadBusy||busy||client.identifying)return;downloadBusy=true;
  try{await client.write(0x3a,[]);await client.queryDownload();}
  catch(error){if(client.characteristic)state.textContent='正在确认画屏连接状态，请稍候。';document.dispatchEvent(new CustomEvent('prayer:ark-download',{detail:{deviceId:client.deviceId,unavailable:true,error:error.message}}));}
  finally{downloadBusy=false;}
  await syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});
 }
 firmwareButton.textContent='打开固件升级与版本核验';
 firmwareButton.onclick=()=>{location.href='/firmware-upgrade.html?fix=ota-compat-v1';};
 async function syncPublished(force=false){
  if(force)forceSync=true;
  const sha=latestStatus?.build?.sha256;
  if(busy||downloadBusy||syncBusy||client.identifying||!client.characteristic||client.lastStatus!==true||!sha||(syncSha===sha&&!forceSync)||latestStatus.pendingUpdate||latestStatus.build.status!=='published'||latestStatus.device?.id!==client.deviceId)return;
  syncBusy=true;try{await client.resumeWifi();if(client.lastStatus===true){syncSha=sha;forceSync=false;requestedSha=sha;syncRequestedAt=Date.now();announceConnection();}}finally{syncBusy=false;}
 }
 document.addEventListener('prayer:transfer-status',event=>{
  latestStatus=event.detail.result;latestTransferState=event.detail.state;updateConnectionControls();
  renderTransfer(transfer,withConnection(event.detail.state,latestStatus,connection));
  void syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});
 });
 if(!window.isSecureContext||!navigator.bluetooth){
  connect.disabled=true;state.textContent='此浏览器暂不支持蓝牙配网。请用电脑 Chrome / Edge 或 Android Chrome，在 HTTPS 页面打开；iPhone 请先用支持蓝牙的电脑完成配网。';return;
 }
 document.addEventListener('prayer:ark-sync',async()=>{
  if(!client.characteristic){state.textContent='请先连接附近画屏蓝牙，再点击立即检查同步。';location.hash='network-onboarding';root.scrollIntoView({behavior:'smooth'});return;}
  try{await syncPublished(true);}catch(error){state.textContent='检查同步未启动：'+error.message;}
 });
 connect.onclick=async()=>{busy=true;connect.disabled=true;try{allowReconnect=true;reconnectAttempts=0;clearTimeout(reconnectTimer);reconnectTimer=null;while(downloadBusy)await sleep(25);await client.connect();rememberedDevice=client.device;await buildInfoRead;await client.resumeWifi();await syncPublished();}catch(e){state.textContent=e.name==='NotFoundError'?'已取消设备选择，可以再次连接。':'蓝牙连接失败：'+(e.message||e.name||'未知错误');}finally{busy=false;connect.disabled=false;send.disabled=!client.characteristic;void syncPublished().catch(error=>{state.textContent='自动检查同步暂未成功：'+error.message;});}};
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
