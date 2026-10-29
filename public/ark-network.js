// ForFilm Ark wire protocol: tools/ForFilm/js/bluetooth.js (GPL-3.0).
// Credentials go directly to the chosen peripheral, never to an HTTP endpoint.
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
 constructor({bluetooth,onState=()=>{},onDownload=()=>{},delay=sleep,timeout=30000}={}){this.bluetooth=bluetooth;this.onState=onState;this.onDownload=onDownload;this.delay=delay;this.timeout=timeout;this.epoch=0;}
 state(text,connected=false){this.onState({text,connected,paired:!!this.characteristic,deviceName:this.device?.name||null,deviceId:this.deviceId||null});}
 async connect(){
  this.disconnect();const epoch=this.epoch;this.state('请选择名称以 FRAMEFILMARK 开头的画屏…');
  let device;
  try{
   // Must remain directly in the click handler before any await (Web Bluetooth gesture).
   device=await this.bluetooth.requestDevice({filters:[{namePrefix:'FRAMEFILMARK'}],optionalServices:[SERVICE]});
   if(epoch!==this.epoch)return;
   this.device=device;this.deviceId=arkDeviceId(device.name);device.addEventListener('gattserverdisconnected',this.lost=()=>{if(epoch===this.epoch)this.disconnect('蓝牙已断开。画屏休眠时会断开，可唤醒后重新连接。');});
   const server=await device.gatt.connect(),service=await server.getPrimaryService(SERVICE),characteristic=await service.getCharacteristic(CHARACTERISTIC);
   if(epoch!==this.epoch){device.gatt.disconnect();return;}
   this.characteristic=characteristic;this.listener=event=>{if(epoch===this.epoch&&this.characteristic===characteristic)this.receive(new Uint8Array(event.target.value.buffer,event.target.value.byteOffset,event.target.value.byteLength));};
   characteristic.addEventListener('characteristicvaluechanged',this.listener);await characteristic.startNotifications();
   if(epoch!==this.epoch)return;
   this.state('蓝牙已连接：'+device.name+'。请输入画屏要连接的 2.4 GHz Wi-Fi。');
   await this.write(0x3a,[],epoch);
  }catch(error){if(epoch===this.epoch){this.disconnect();throw error;}}
 }
 receive(bytes){
  if(bytes.length!==bytes[2]+4||bytes[0]!==0x55||bytes.slice(0,-1).reduce((s,n)=>(s+n)&255,0)!==bytes.at(-1))return;
  if(bytes[1]===0x33&&this.ssidRead){const pending=this.ssidRead;this.ssidRead=null;pending.resolve(new TextDecoder().decode(bytes.slice(3,-1)).replace(/\0.*$/,''));}
  if(bytes[1]===0x3d&&bytes[2]===2){const state=bytes[3],progress=bytes[4];this.onDownload({state,progress});if(this.downloadRead){this.downloadRead.resolve({state,progress});this.downloadRead=null;}}
  if(bytes[1]===0x3a&&bytes[2]===1){
   const connected=bytes[3]===1;
   this.lastStatus=connected;
   if(connected&&this.waiting){this.waiting.resolve();this.waiting=null;}
   this.state(connected?'画屏已确认连接 Wi-Fi。内容下载与显示进度请查看下方「我的画屏」。':'蓝牙已连接，画屏 Wi-Fi 尚未连接。',connected);
  }
 }
 async write(channel,data,epoch=this.epoch){
  if(epoch!==this.epoch||!this.characteristic)throw new Error('蓝牙已断开，请重新连接。');
  await this.characteristic.writeValue(packet(channel,data));await this.delay(200);
  if(epoch!==this.epoch)throw new Error('蓝牙已断开，请重新连接。');
 }
 async configure(ssid,password){
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
    await confirmed;
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
 disconnect(message='蓝牙未连接。请先唤醒画屏，再连接。'){
  this.epoch++;if(this.waiting){this.waiting.reject(new Error('蓝牙已断开'));this.waiting=null;}
  if(this.ssidRead){this.ssidRead.reject(new Error('蓝牙已断开'));this.ssidRead=null;}
  if(this.characteristic&&this.listener)this.characteristic.removeEventListener('characteristicvaluechanged',this.listener);
  if(this.device){this.device.removeEventListener('gattserverdisconnected',this.lost);if(this.device.gatt.connected)this.device.gatt.disconnect();}
  this.characteristic=null;this.device=null;this.deviceId=null;this.state(message);
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
 let busy=false,connectedDevice=null,downloadTimer=null,downloadBusy=false;
 const password=form.elements.wifiPassword;
 const downloadState=document.createElement('p');downloadState.className='network-state download-state';downloadState.hidden=true;downloadState.setAttribute('role','status');
 const client=new ArkNetwork({bluetooth:navigator.bluetooth,onState:status=>{
  state.textContent=status.text;send.disabled=!status.paired||busy;disconnect.hidden=!status.paired;
  connectedDevice=status.deviceId?{deviceId:status.deviceId,deviceName:status.deviceName}:null;
  binding.hidden=!status.deviceId;bind.disabled=!status.deviceId;
  if(status.deviceId)bindingState.textContent='当前画屏：'+status.deviceName+' · 设备编号 '+status.deviceId;
  else if(status.paired)bindingState.textContent='这台画屏的名称中没有可用的设备编号，暂时无法绑定。';
  window.dispatchEvent(new CustomEvent('prayer:ark-device',{detail:connectedDevice}));
  password.placeholder=status.connected?'••••••••（密码已保存在画屏）':'输入 Wi-Fi 密码';
  form.classList.toggle('network-connected',status.connected);
  if(status.connected&&!downloadTimer){void pollDownload();downloadTimer=setInterval(pollDownload,2000);}
  else if(!status.connected&&downloadTimer){clearInterval(downloadTimer);downloadTimer=null;}
 },onDownload:next=>{
  const labels=['尚未开始下载','正在下载','内容已保存','下载失败'];
  downloadState.hidden=false;downloadState.textContent='内容下载：'+(labels[next.state]||'状态未知')+(next.state===1?' '+next.progress+'%':'');
 }});
 state.after(downloadState);
 async function pollDownload(){if(!client.characteristic||downloadBusy)return;downloadBusy=true;try{await client.queryDownload();}catch{if(!downloadState.hidden)downloadState.textContent='内容下载：暂时无法读取设备进度。';}finally{downloadBusy=false;}}
 if(!window.isSecureContext||!navigator.bluetooth){
  connect.disabled=true;state.textContent='此浏览器暂不支持蓝牙配网。请用电脑 Chrome / Edge 或 Android Chrome，在 HTTPS 页面打开；iPhone 请先用支持蓝牙的电脑完成配网。';return;
 }
 connect.onclick=async()=>{connect.disabled=true;try{await client.connect();}catch(e){state.textContent=e.name==='NotFoundError'?'已取消设备选择，可以再次连接。':e.message;}finally{connect.disabled=false;}};
 disconnect.onclick=()=>client.disconnect();
 bind.onclick=()=>window.dispatchEvent(new CustomEvent('prayer:ark-bind',{detail:connectedDevice}));
 form.onsubmit=async event=>{event.preventDefault();busy=true;send.disabled=true;connect.disabled=true;
  for(const control of form.elements)control.disabled=true;
  try{await client.configure(form.elements.ssid.value,form.elements.wifiPassword.value);}catch(e){state.textContent=e.message;}
  finally{form.elements.wifiPassword.value='';for(const control of form.elements)control.disabled=false;busy=false;send.disabled=!client.characteristic;connect.disabled=false;}
 };
 root.querySelector('[data-show-password]').onchange=event=>{form.elements.wifiPassword.type=event.target.checked?'text':'password';};
 window.addEventListener('pagehide',()=>{form.elements.wifiPassword.value='';client.disconnect();});
}
