// FrameFilm Ark command protocol; ported from public/ark-network.js (ForFilm GPL-3.0).
const SERVICE='00002000-0000-1000-8000-00805f9b34fb',CHAR='00002001-0000-1000-8000-00805f9b34fb';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(api,args){return new Promise((resolve,reject)=>wx[api](Object.assign({},args,{success:resolve,fail:e=>reject(new Error(e.errMsg||'蓝牙操作未完成'))})));}
function utf8(text){const bytes=[];for(const char of text){let n=char.codePointAt(0);if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|(n>>6),128|(n&63));else if(n<65536)bytes.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else bytes.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}return new Uint8Array(bytes);}
function decode(bytes){let encoded='';for(const b of bytes)encoded+='%'+b.toString(16).padStart(2,'0');return decodeURIComponent(encoded).replace(/\0.*$/,'');}
function packet(ch,payload){payload=payload||[];const b=new Uint8Array(payload.length+4);b.set([0x55,ch,payload.length]);b.set(payload,3);b[b.length-1]=b.slice(0,-1).reduce((a,v)=>(a+v)&255,0);return b;}
function credentials(ssid,password){const name=utf8(ssid),secret=utf8(password);if(!name.length||name.length>32||/[\x00-\x1f\x7f]/.test(ssid))throw new Error('Wi-Fi 名称需为 1–32 个 UTF-8 字节。');if(secret.length<8||secret.length>63||/[\x00-\x1f\x7f]/.test(password))throw new Error('请核对该 Wi-Fi 的现有密码后重试。');return {name,secret};}
class ArkBLE{
 constructor(state,found,download=()=>{}){this.download=download;this.state=state;this.found=found;this.epoch=0;this.maxWrite=20;this.devices=new Map();this.onValue=e=>{if(this.service&&this.char&&e.deviceId===this.id&&e.serviceId.toLowerCase()===this.service.toLowerCase()&&e.characteristicId.toLowerCase()===this.char.toLowerCase())this.receive(new Uint8Array(e.value));};this.onConnection=e=>{if(e.deviceId===this.id&&!e.connected){this.epoch++;this.id=null;if(this.downloadRead){this.downloadRead.reject(new Error('蓝牙已断开'));this.downloadRead=null;}this.state('蓝牙已断开，正在尝试恢复；若画屏已休眠，请按键唤醒，无需重新填写 Wi-Fi。',false);}};}
 async listen(){
  await call('openBluetoothAdapter',{});
  if(!this.listening){wx.onBLECharacteristicValueChange(this.onValue);wx.onBLEConnectionStateChange(this.onConnection);this.listening=true;}
 }
 async scan(){if(this.scanning)return;await this.disconnect();await this.listen();this.devices.clear();this.listener=e=>{for(const d of e.devices||[]){if((d.name||d.localName||'').startsWith('FRAMEFILMARK'))this.devices.set(d.deviceId,{id:d.deviceId,name:d.name||d.localName,localName:d.localName||'',rssi:d.RSSI});}this.found(Array.from(this.devices.values()));};wx.onBluetoothDeviceFound(this.listener);await call('startBluetoothDevicesDiscovery',{allowDuplicatesKey:false});this.scanning=true;this.state('正在寻找画屏，请确认设备已唤醒。',false);this.scanTimer=setTimeout(()=>{this.stopScan();if(!this.id)this.state('搜索已结束。未找到时，请唤醒画屏并重新搜索。',false);},15000);}
 async stopScan(){clearTimeout(this.scanTimer);if(this.scanning){this.scanning=false;await call('stopBluetoothDevicesDiscovery',{}).catch(()=>{});}if(this.listener){wx.offBluetoothDeviceFound(this.listener);this.listener=null;}}
 async connect(id){if(this.connecting)return;this.status=null;this.connecting=true;await this.stopScan();const epoch=this.epoch;this.state('正在连接所选画屏…',false);try{await this.listen();await call('createBLEConnection',{deviceId:id,timeout:15000});if(epoch!==this.epoch){await call('closeBLEConnection',{deviceId:id}).catch(()=>{});return;}this.id=id;const services=await call('getBLEDeviceServices',{deviceId:id});const svc=services.services.find(s=>s.uuid.toLowerCase()===SERVICE);if(!svc)throw new Error('这台设备不支持当前配网协议。');this.service=svc.uuid;const chars=await call('getBLEDeviceCharacteristics',{deviceId:id,serviceId:this.service});const char=chars.characteristics.find(c=>c.uuid.toLowerCase()===CHAR);if(!char||!char.properties.write||(!char.properties.notify&&!char.properties.indicate))throw new Error('画屏配网通道不完整。');this.char=char.uuid;await call('notifyBLECharacteristicValueChange',{deviceId:id,serviceId:this.service,characteristicId:this.char,state:true});if(wx.setBLEMTU)await call('setBLEMTU',{deviceId:id,mtu:128}).catch(()=>{});this.maxWrite=20;if(wx.getBLEMTU){const mtu=await call('getBLEMTU',{deviceId:id,writeType:'write'}).catch(()=>null);if(mtu&&mtu.mtu)this.maxWrite=mtu.mtu-3;}this.state('蓝牙已连接，正在检查画屏已保存的 Wi-Fi。',true);await this.write(0x3a,[],epoch);}catch(e){await this.disconnect();throw e;}finally{this.connecting=false;}}
 async write(ch,data,epoch){const b=packet(ch,data);if(epoch!==this.epoch||!this.id)throw new Error('蓝牙已断开，请重新连接。');if(b.length>this.maxWrite)throw new Error('当前蓝牙连接可写长度不足，请重新连接以协商 MTU；本固件不支持拆分配网指令。');await call('writeBLECharacteristicValue',{deviceId:this.id,serviceId:this.service,characteristicId:this.char,value:b.buffer,writeType:'write'});await pause(200);if(epoch!==this.epoch)throw new Error('蓝牙已断开');}
 receive(b){if(b.length<4||b[0]!==0x55||b.length!==b[2]+4||b.slice(0,-1).reduce((s,x)=>(s+x)&255,0)!==b[b.length-1])return;if(b[1]===0x3f&&this.identityRead){const reader=this.identityRead;this.identityRead=null;try{reader.resolve(decode(b.slice(3,-1)));}catch{reader.reject(new Error('画屏身份通道回复无效'));}}if(b[1]===0x3a&&b[2]===1){this.status=b[3]===1;this.state(this.status?'画屏已确认 Wi-Fi 联网。':'蓝牙已连接，Wi-Fi 尚未连接。',true);}if(b[1]===0x3d&&b[2]===2){const value={state:b[3],progress:b[4]};this.download(value);if(this.downloadRead){this.downloadRead.resolve(value);this.downloadRead=null;}}if(b[1]===0x33){try{this.ssid=decode(b.slice(3,-1));}catch{this.ssid=null;}}}
 async readHeartbeatURL(){
  const epoch=this.epoch;const read=new Promise((resolve,reject)=>{this.identityRead={resolve,reject};});read.catch(()=>{});
  const timer=setTimeout(()=>{this.identityRead?.reject(new Error('画屏未回复身份通道，请保持唤醒后重试。'));this.identityRead=null;},3000);
  try{await this.write(0x3f,[],epoch);return await read;}finally{clearTimeout(timer);this.identityRead=null;}
 }
 async resolveIdentity(request){
  const epoch=this.epoch,original=await this.readHeartbeatURL(),normal='https://playmath.cn/api/v1/device/heartbeat';
  const priorChallenge=original.startsWith(normal+'?link=')&&/^[a-f0-9]{32}&device_id=$/.test(original.slice((normal+'?link=').length));if(original&&original!==normal&&!priorChallenge)throw new Error('画屏使用了其他云端地址，请先核对设备配置。');
  const challenge=await request('/api/account/ritual/device',{beginPairing:true});
  if(!/^[a-f0-9]{32}$/.test(challenge.nonce||'')||challenge.heartbeatURL!==normal+'?link='+challenge.nonce+'&device_id=')throw new Error('设备识别服务回复无效。');
  let changed=false;
  try{
   changed=true;await this.write(0x3e,utf8(challenge.heartbeatURL),epoch);await this.resumeWifi();
   const end=Date.now()+60000;
   while(Date.now()<end){
    if(epoch!==this.epoch||!this.id)throw new Error('蓝牙连接已断开，请重新连接画屏。');
    const result=await request('/api/account/ritual/device',{pairingNonce:challenge.nonce});
    if(result.status==='identified'&&/^[a-f0-9]{12}$/.test(result.deviceId||''))return result.deviceId;
    await pause(2000);
   }
   throw new Error('尚未收到画屏认证回报，请保持画屏唤醒并点击重试关联。');
  }finally{if(changed&&epoch===this.epoch&&this.id)await this.write(0x3e,utf8(normal),epoch);}
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
 async syncNow(){if(!this.id)throw new Error('请先连接画屏蓝牙。');await this.resumeWifi();this.state('已请求检查云端更新；等待内容保存回执后，可在画屏选择“画面”并按确认键进入。需要 ritual.6 固件。',true);}
 async disconnect(){if(this.identityRead){this.identityRead.reject(new Error('蓝牙已断开'));this.identityRead=null;}this.status=null;this.epoch++;if(this.downloadRead){this.downloadRead.reject(new Error('蓝牙已断开'));this.downloadRead=null;}await this.stopScan();const id=this.id;this.id=null;if(id)await call('closeBLEConnection',{deviceId:id}).catch(()=>{});if(wx.offBLECharacteristicValueChange)wx.offBLECharacteristicValueChange(this.onValue);if(wx.offBLEConnectionStateChange)wx.offBLEConnectionStateChange(this.onConnection);this.listening=false;await call('closeBluetoothAdapter',{}).catch(()=>{});this.state('蓝牙未连接。',false);}
}
module.exports={ArkBLE,packet,utf8,decode,credentials};
