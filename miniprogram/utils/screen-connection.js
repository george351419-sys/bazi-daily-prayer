const {SyncIdleRelease}=require('./sync-idle');
// One connection for the mini program, shared across tab pages.
const {ArkBLE}=require('./ble');
const {transferStatus,withLiveDownload,withConnection}=require('./transfer-status');
const DELIVERY_KEY='prayer-mini-delivered-v1';
// 小程序没有 localStorage：用 wx.setStorageSync 持久化；无 wx 的测试环境退回内存。
const memory=new Map();
const store={
 get(key){try{const value=wx.getStorageSync(key);return value===undefined||value===null?'':value;}catch{return memory.get(key)||'';}},
 set(key,value){try{wx.setStorageSync(key,value);}catch{memory.set(key,value);}},
 remove(key){try{wx.removeStorageSync(key);}catch{memory.delete(key);}}
};
// 生成新画期间：后端 plan/build/deviceReport 还是上一幅画的快照，完成态必须压住。
function generationFlag(){try{return !!getApp().globalData.generating;}catch{return false;}}
class ScreenConnection{
 constructor(){
  this.listeners=new Set();this.snapshot={bleText:'先唤醒画屏，再搜索蓝牙设备。',paired:false,bleDevices:[],connectedDeviceId:'',receivedAt:0,delivered:null};
  this.foreground=true;this.allowed=false;this.attempts=0;this.busy=false;this.live=null;this.current=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;
  this.delivered=this.loadDelivered();
  this.idleRelease=new SyncIdleRelease({setTimer:setTimeout,clearTimer:clearTimeout,read:()=>({status:this.current,connection:{...this.snapshot,deviceId:this.hardwareId,delivered:this.delivered,generating:generationFlag(),busy:this.busy,blocked:this.recovering||this.contentSaving}}),release:async()=>{await this.disconnect();this.notice('内容已保存，已自动断开蓝牙以节省电量；查看画面无需保持连接。');}});
  this.client=new ArkBLE((bleText,paired)=>{
   paired=!!paired&&!!this.client?.id;
   const lost=this.snapshot.paired&&!paired;
   if(!paired||this.client?.status!==true){this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;}
   // 连接证据时间取"最近一次成功 BLE 往返"(lastContactAt)，不是"上次状态文本变化"。
   // 断链时证据归零，不沿用旧值——否则重连后 6 秒内没有新往返时，会误显示"已联网正在检查"。
   const receivedAt=paired?(this.client.lastContactAt||0):0;
   this.snapshot={...this.snapshot,bleText,paired,wifiConnected:paired&&this.client?.status===true,receivedAt,connectedDeviceId:paired?this.hardwareId||'':''};
   if(!paired){this.snapshot.savedSSID=null;}
   if(lost){this.live=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;this.reconnect();}
   this.emit();
  },bleDevices=>{this.snapshot={...this.snapshot,bleDevices};this.emit();},value=>{
   this.live={...value,deviceId:this.hardwareId,receivedAt:Date.now()};this.emit();
   // 手机通过蓝牙明确观测到设备回报"下载完成"：自动确认送达（与网页端同一判据）。
   this.confirmDelivered(value);
  });
 }
 emit(){this.idleRelease?.update();for(const listener of this.listeners)listener(this.snapshot);}
 subscribe(listener){this.listeners.add(listener);listener(this.snapshot);return ()=>this.listeners.delete(listener);}
 // 送达确认只接受两种真实证据：BLE 观测到设备回报下载完成，或用户亲眼看到新画后手动标记。
 // 按 deviceId + 内容哈希隔离；换设备或换内容自动失效；绝不把"设备在线时长"当作送达。
 loadDelivered(){try{const saved=JSON.parse(store.get(DELIVERY_KEY)||'null');if(saved&&/^[a-f0-9]{12}$/.test(saved.deviceId||'')&&/^[a-f0-9]{64}$/.test(saved.targetSha||''))return saved;}catch{}return null;}
 markDelivered(sha,deviceId,evidence,artworkId=null){this.delivered={deliveredAt:Date.now(),targetSha:sha,deviceId,evidence,artworkId:artworkId||null};store.set(DELIVERY_KEY,JSON.stringify(this.delivered));this.snapshot={...this.snapshot,delivered:this.delivered};this.emit();}
 clearDelivered(){if(!this.delivered)return;this.delivered=null;store.remove(DELIVERY_KEY);this.snapshot={...this.snapshot,delivered:null};this.emit();}
 confirmDelivered(live){
  if(!live||live.state!==2||this.delivered)return;
  const status=this.current,sha=status&&status.build&&status.build.sha256,deviceId=this.hardwareId;
  if(!sha||!deviceId||status.build.status!=='published')return;
  // 不用"设备在线多久"推断送达——在线不等于内容已上屏，避免过度承诺。
  if(!this.requestedSha||sha!==this.requestedSha)return;
  if(status.device&&status.device.id&&status.device.id!==deviceId)return;
  this.markDelivered(sha,deviceId,'ble-download-complete',status.plan?.artworkIds?.[0]||null);
 }
 stateFor(status,artworkId,isGenerating){
  // 送达确认锁定到"当前这幅画"：网页端用 plan.artworkIds[0] 标识当前画作，
  // 小程序端沿用同一判据，换生辰/愿望重新生成后上一幅的确认不得回灌。
  const current=artworkId||status?.plan?.artworkIds?.[0]||null;
  const flag=isGenerating??generationFlag();
  // 生成新画期间只吃"新画生成中"，不吃任何旧画的下载进度与完成态。
  const target=artworkId===null?null:current;
  const base=flag?transferStatus(status,target,true):withLiveDownload(transferStatus(status,target),status,this.live);
  return withConnection(base,status,{...this.snapshot,deviceId:this.hardwareId,syncRequestedAt:this.syncRequestedAt,requestedSha:this.requestedSha,delivered:this.delivered},Date.now(),current);
 }
 acceptStatus(status){
  this.current=status;this.idleRelease.update();
  // 换了内容包、换了画屏，或计划换成了另一幅画：旧送达确认立即失效，
  // 否则旧"✓ 本次同步已完成"会冒充新内容已完成。
  const planned=status?.plan?.artworkIds?.[0]||null;
  if(this.delivered&&((status?.build?.sha256&&this.delivered.targetSha!==status.build.sha256)||(status?.device?.id&&this.delivered.deviceId!==status.device.id)||(planned&&this.delivered.artworkId&&this.delivered.artworkId!==planned)))this.clearDelivered();
  void this.syncPublished().catch(error=>this.notice('自动检查同步暂未成功：'+error.message));
 }
 setContentSaving(value){this.contentSaving=value;this.idleRelease.update();}
 notice(bleText){this.snapshot={...this.snapshot,bleText};this.emit();}
 async scan(){this.idleRelease.cancel();this.allowed=false;clearTimeout(this.retryTimer);this.retryTimer=null;this.live=null;this.hardwareId='';await this.client.scan();}
 async connect(id){
  this.idleRelease.cancel();
  const device=this.snapshot.bleDevices.find(item=>item.id===id),match=device&&[device.name,device.localName].map(name=>/^FRAMEFILMARK[-_ ]?([a-f0-9]{12})$/i.exec(String(name||'').trim())).find(Boolean);
  this.hardwareId=this.client.resolveIdentity?'':match?match[1].toLowerCase():'';this.target=id;this.allowed=false;clearTimeout(this.retryTimer);this.retryTimer=null;this.attempts=0;this.live=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;
  await this.connectTarget();this.allowed=true;this.start();
 }
 async connectTarget(){
  return this.serial(async()=>{this.recovering=true;try{await this.client.connect(this.target);if(!this.client.id)return;if(this.client.readSavedSSID){const savedSSID=await this.client.readSavedSSID().catch(()=>null);this.snapshot={...this.snapshot,savedSSID};this.emit();}await this.client.ensureWifi();}finally{this.recovering=false;}});
 }
 reconnect(){
  if(this.recovering||!this.allowed||!this.foreground||!this.target||this.retryTimer||this.attempts>=3)return;
  this.retryTimer=setTimeout(async()=>{
   this.retryTimer=null;this.attempts++;
   try{await this.connectTarget();if(this.client.id){this.attempts=0;await this.syncPublished();}}
   catch(error){this.notice('连接暂未恢复，请唤醒画屏；无需重填 Wi-Fi。'+error.message);this.reconnect();}
  },3000);
 }
 async serial(action){
  this.pending=(this.pending||0)+1;
  const previous=this.operation||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{this.busy=true;try{return await action();}finally{this.pending--;this.busy=this.pending>0;}});
  this.operation=task;return task;
 }
 async resolveIdentity(request){
  const epoch=this.client.epoch,id=await this.serial(()=>this.client.resolveIdentity(request));
  if(epoch!==this.client.epoch||!this.snapshot.paired)throw new Error('设备连接已改变，请重试。');
  this.hardwareId=id;this.snapshot={...this.snapshot,connectedDeviceId:id};this.emit();return id;
 }
 async configure(ssid,password){return this.serial(async()=>{const result=await this.client.configure(ssid,password);this.snapshot={...this.snapshot,savedSSID:ssid};this.emit();return result;});}
 async syncNow(){return this.serial(async()=>{const result=await this.client.syncNow();if(this.client.status===true){this.syncRequestedAt=Date.now();this.requestedSha=this.current?.build?.sha256;this.emit();}return result;});}
 async syncPublished(){
  const s=this.current,sha=s&&s.build&&s.build.sha256;
  if(this.busy||!this.foreground||!this.client.id||this.client.status!==true||!sha||sha===this.syncSha||s.pendingUpdate||s.build.status!=='published'||!s.device||s.device.id!==this.hardwareId)return;
  await this.syncNow();if(this.client.status===true)this.syncSha=sha;
 }
 async poll(){
  if(!this.foreground||!this.client.id||this.busy)return;
  try{
   await this.serial(async()=>{await this.client.write(0x3a,[],this.client.epoch);await this.client.queryDownload();});
   // 每 2 秒成功的 BLE 往返是链路存活证据。同步刷新 snapshot.receivedAt，
   // 让 stateFor→withConnection 稳定显示「画屏已联网 · 正在检查」，而不是 6 秒无
   // 连接状态变化就误退回「等待检查 / 去链接神物」。真断链时 write 抛错，走 catch，
   // 证据自然过期、照常退回等待——与网页端 ark-network.js 的 lastContactAt 机制对齐。
   this.snapshot={...this.snapshot,receivedAt:this.client.lastContactAt||Date.now()};this.emit();
  }
  catch(error){this.live=null;this.notice('下载进度暂未读到：'+error.message);}
  await this.syncPublished().catch(error=>this.notice('自动检查同步暂未成功：'+error.message));
 }
 start(){clearTimeout(this.backgroundTimer);this.foreground=true;if(!this.pollTimer)this.pollTimer=setInterval(()=>void this.poll(),2000);if(!this.client.id)this.reconnect();}
 background(){
  this.foreground=false;clearInterval(this.pollTimer);this.pollTimer=null;clearTimeout(this.retryTimer);this.retryTimer=null;
  // Switching tabs does not call this. Leaving WeChat gets a short return grace period.
  this.backgroundTimer=setTimeout(()=>{this.backgroundTimer=null;void this.client.disconnect();},60000);
 }
 async disconnect(){
  this.idleRelease.cancel();this.allowed=false;this.target=null;this.hardwareId='';this.live=null;this.current=null;this.syncSha=null;this.syncRequestedAt=null;this.requestedSha=null;
  this.snapshot={...this.snapshot,receivedAt:0,paired:false,wifiConnected:false,connectedDeviceId:''};
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
  const data={...snapshot};const changed=page.data.paired!==snapshot.paired||page.data.wifiConnected!==snapshot.wifiConnected;if(changed||page.connectionNotice){data.message='';data.error='';page.connectionNotice=false;}if(!snapshot.paired){data.binding=false;data.bindingError='';}if(snapshot.savedSSID&&!page.data.ssid)data.ssid=snapshot.savedSSID;if(page.data.status&&!page.preparingPair&&!page.prepareFailure&&!page.savingContent)data.syncState=connection.stateFor(page.data.status,page.syncPhotos?null:page.generatedArtworkId);
  page.setData(data);
 });
 return connection;
}
function stopObserving(page){if(page.stopConnection)page.stopConnection();page.stopConnection=null;}
module.exports={ScreenConnection,getScreenConnection,observeConnection,stopObserving};
