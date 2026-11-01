// One connection for the mini program, shared across tab pages.
const {ArkBLE}=require('./ble');
const {transferStatus,withLiveDownload,withConnection}=require('./transfer-status');
class ScreenConnection{
 constructor(){
  this.listeners=new Set();this.snapshot={bleText:'先唤醒画屏，再搜索蓝牙设备。',paired:false,bleDevices:[],connectedDeviceId:''};
  this.foreground=true;this.allowed=false;this.attempts=0;this.busy=false;this.live=null;this.current=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;
  this.client=new ArkBLE((bleText,paired)=>{
   const lost=this.snapshot.paired&&!paired;
   if(!paired||this.client?.status!==true){this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;}
   this.snapshot={...this.snapshot,bleText,paired,wifiConnected:paired&&this.client?.status===true,receivedAt:Date.now(),connectedDeviceId:paired?this.hardwareId||'':''};
   if(lost){this.live=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;this.reconnect();}
   this.emit();
  },bleDevices=>{this.snapshot={...this.snapshot,bleDevices};this.emit();},value=>{
   this.live={...value,deviceId:this.hardwareId,receivedAt:Date.now()};this.emit();
  });
 }
 emit(){for(const listener of this.listeners)listener(this.snapshot);}
 subscribe(listener){this.listeners.add(listener);listener(this.snapshot);return ()=>this.listeners.delete(listener);}
 stateFor(status,artworkId){return withConnection(withLiveDownload(transferStatus(status,artworkId),status,this.live),status,{...this.snapshot,deviceId:this.hardwareId,syncRequestedAt:this.syncRequestedAt,requestedSha:this.requestedSha});}
 acceptStatus(status){this.current=status;void this.syncPublished().catch(error=>this.notice('自动检查同步暂未成功：'+error.message));}
 notice(bleText){this.snapshot={...this.snapshot,bleText};this.emit();}
 async scan(){this.allowed=false;clearTimeout(this.retryTimer);this.live=null;this.hardwareId='';await this.client.scan();}
 async connect(id){
  if(this.busy)return;
  const device=this.snapshot.bleDevices.find(item=>item.id===id),match=device&&/^FRAMEFILMARK[-_ ]?([a-f0-9]{12})$/i.exec(device.name);
  this.hardwareId=match?match[1].toLowerCase():'';this.target=id;this.allowed=false;clearTimeout(this.retryTimer);this.attempts=0;this.live=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;
  await this.connectTarget();this.allowed=true;this.start();
 }
 async connectTarget(){
  this.busy=true;
  try{await this.client.connect(this.target);if(!this.client.id)return;await this.client.resumeWifi();}
  finally{this.busy=false;}
 }
 reconnect(){
  if(!this.allowed||!this.foreground||!this.target||this.retryTimer||this.attempts>=3)return;
  this.retryTimer=setTimeout(async()=>{
   this.retryTimer=null;this.attempts++;
   try{await this.connectTarget();if(this.client.id){this.attempts=0;await this.syncPublished();}}
   catch(error){this.notice('连接暂未恢复，请唤醒画屏；无需重填 Wi-Fi。'+error.message);this.reconnect();}
  },3000);
 }
 async configure(ssid,password){if(this.busy)throw new Error('画屏正在通信，请稍候。');this.busy=true;try{return await this.client.configure(ssid,password);}finally{this.busy=false;}}
 async syncNow(){if(this.busy)throw new Error('画屏正在通信，请稍候。');this.busy=true;try{const result=await this.client.syncNow();if(this.client.status===true){this.syncRequestedAt=Date.now();this.requestedSha=this.current?.build?.sha256;this.emit();}return result;}finally{this.busy=false;}}
 async syncPublished(){
  const s=this.current,sha=s&&s.build&&s.build.sha256;
  if(this.busy||!this.foreground||!this.client.id||this.client.status!==true||!sha||sha===this.syncSha||s.pendingUpdate||s.build.status!=='published'||!s.device||s.device.id!==this.hardwareId)return;
  await this.syncNow();if(this.client.status===true)this.syncSha=sha;
 }
 async poll(){
  if(!this.foreground||!this.client.id||this.busy)return;
  this.busy=true;
  try{await this.client.write(0x3a,[],this.client.epoch);await this.client.queryDownload();}
  catch(error){this.live=null;this.notice('下载进度暂未读到：'+error.message);}
  finally{this.busy=false;}
  await this.syncPublished().catch(error=>this.notice('自动检查同步暂未成功：'+error.message));
 }
 start(){clearTimeout(this.backgroundTimer);this.foreground=true;if(!this.pollTimer)this.pollTimer=setInterval(()=>void this.poll(),2000);if(!this.client.id)this.reconnect();}
 background(){
  this.foreground=false;clearInterval(this.pollTimer);this.pollTimer=null;clearTimeout(this.retryTimer);this.retryTimer=null;
  // Switching tabs does not call this. Leaving WeChat gets a short return grace period.
  this.backgroundTimer=setTimeout(()=>{this.backgroundTimer=null;void this.client.disconnect();},60000);
 }
 async disconnect(){
  this.allowed=false;this.target=null;this.hardwareId='';this.live=null;this.current=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;
  clearTimeout(this.retryTimer);this.retryTimer=null;clearTimeout(this.backgroundTimer);clearInterval(this.pollTimer);this.pollTimer=null;
  await this.client.disconnect();
 }
}
let shared;
function getScreenConnection(){if(!shared)shared=new ScreenConnection();return shared;}
function observeConnection(page){
 const connection=getScreenConnection();page.connection=connection;page.ble=connection;
 if(page.stopConnection)page.stopConnection();
 page.stopConnection=connection.subscribe(snapshot=>{
  if(!page.active)return;
  const data={...snapshot};if(page.data.status&&!page.preparingPair&&!page.prepareFailure)data.syncState=connection.stateFor(page.data.status,page.generatedArtworkId);
  page.setData(data);
 });
 return connection;
}
function stopObserving(page){if(page.stopConnection)page.stopConnection();page.stopConnection=null;}
module.exports={ScreenConnection,getScreenConnection,observeConnection,stopObserving};
