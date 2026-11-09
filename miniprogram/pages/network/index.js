const {transferStatus,receiptTime}=require('../../utils/transfer-status');
const api=require('../../utils/api');const {preparePhoto,authorize}=require('../../utils/photos');const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const {syncPrayerPair,syncGeneratedPrayer}=require('../../utils/ritual-sync');
Page({
 data:{releaseVersion:'1.1.12',editingPassword:false,binding:false,bindingError:'',setupExpanded:false,user:null,error:'',message:'',busy:false,contentMode:'prayer',showActions:true,mode:'test',catalog:[],artworks:[],titles:[],choices:[0,0],cursor:null,photoTitle:'',draft:'',bleDevices:[],bleText:'先唤醒画屏，再搜索蓝牙设备。',paired:false,ssid:'',wifiPassword:'',syncConfigured:false,status:null,connectedDeviceId:'',preparing:false},
 diagnostics(){const {bleDiagnostics}=require('../../utils/ble');wx.setClipboardData({data:bleDiagnostics(),success:()=>wx.showToast({title:'连接诊断已复制',icon:'none'})});},
 onLoad(){},
 changePassword(){this.setData({editingPassword:true,wifiPassword:''});},
 toggleSetup(){this.setData({setupExpanded:!this.data.setupExpanded});},
 wish(){wx.switchTab({url:'/pages/mine/index'});},
 async onShow(){this.active=true;observeConnection(this);this.run=(this.run||0)+1;api.tab(this,1);await getApp().ready;if(!this.active)return;this.setData({user:getApp().globalData.user,busy:false});if(this.data.user)this.load();},
 onHide(){clearTimeout(this.syncTimer);this.active=false;this.run++;stopObserving(this);this.photo=null;this.setData({wifiPassword:'',draft:''});},
 onUnload(){this.onHide();},
 async pollSync(){
  clearTimeout(this.syncTimer);if(!this.active||!this.data.user)return;const run=this.run;
  try{await this.autoBind();const status=await api.request('/api/account/ritual');if(!this.active||run!==this.run)return;this.connection.acceptStatus(status);this.setData({status,syncState:this.connection.stateFor(status),syncLastSeen:receiptTime(status.deviceReport?.lastSeen)});}catch(e){if(this.active&&run===this.run)this.setData({syncState:{phase:'unavailable',title:'同步状态暂不可用',detail:'正在重新读取设备回报，请稍候。',step:0}});}
  if(this.active&&run===this.run)this.syncTimer=setTimeout(()=>this.pollSync(),this.data.syncState?.phase==='rendered'?30000:2000);
 },
 async syncNow(){if(!this.data.paired){api.error(this,new Error('请先连接附近画屏蓝牙。'));return;}try{await this.ble.syncNow();this.setData({message:'已请求画屏重新检查内容。下载成功不等于已显示，请看下方同步阶段。'});await this.pollSync();}catch(e){api.error(this,e);}},
 async load(){const run=this.run;try{const results=await Promise.all([api.request('/api/account/ritual'),api.request('/api/account/artworks')]);if(!this.active||run!==this.run)return;const s=results[0],plan=s.plan;this.setData({status:s,syncConfigured:s.syncConfigured===true,catalog:results[1].items.concat((s.plannedDays||[]).filter(x=>!results[1].items.some(y=>y.id===x.artworkId)).map(x=>Object.assign({},x,{id:x.artworkId,status:'complete',image:'/api/account/artworks/'+x.artworkId+'/image'}))),cursor:results[1].cursor,contentMode:plan?plan.contentMode:'prayer',showActions:plan?plan.showActions:true,mode:plan?plan.mode:'test'});this.populate(plan&&plan.artworkIds);void this.pollSync();}catch(e){if(this.active&&run===this.run)api.error(this,e);}},
 populate(ids){const items=this.data.catalog.filter(x=>x.status==='complete'&&x.image&&((x.source==='upload')===(this.data.contentMode==='photo')));const choices=ids?ids.map(id=>Math.max(0,items.findIndex(x=>x.id===id))):[0,this.data.contentMode==='prayer'&&items.length>1?1:0];this.setData({artworks:items,titles:items.map(x=>x.title+' · '+x.date),choices});},
 content(e){this.setData({contentMode:e.currentTarget.dataset.value,showActions:true,error:'',message:''});this.populate();},
 actions(e){this.setData({showActions:e.detail.value});},mode(e){this.setData({mode:e.currentTarget.dataset.value});},choice(e){this.setData({['choices['+e.currentTarget.dataset.day+']']:Number(e.detail.value)});},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 async more(){if(this.data.busy)return;this.setData({busy:true,error:''});try{const selected=this.data.choices.map(i=>this.data.artworks[i]&&this.data.artworks[i].id),r=await api.request('/api/account/artworks?cursor='+encodeURIComponent(this.data.cursor));if(!this.active)return;this.setData({catalog:this.data.catalog.concat(r.items),cursor:r.cursor});this.populate(selected);}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async choosePhoto(){if(this.data.busy)return;this.setData({busy:true,error:'',message:''});try{const photo=await preparePhoto(this);if(!this.active)return;this.photo=photo;this.setData({draft:photo.path});}catch(e){if(this.active&&!/cancel/.test(e.message))api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async upload(){if(!this.photo||this.data.busy)return;const run=this.run;this.setData({busy:true,error:'',message:''});try{const r=await api.request('/api/account/photos',{type:this.photo.type,base64:this.photo.base64,title:this.data.photoTitle||'我的照片'});if(!this.active||run!==this.run)return;this.photo=null;this.setData({catalog:[r.item].concat(this.data.catalog),draft:'',photoTitle:'',message:'照片已保存到账户。请选择两天的画面并保存设置。'});this.populate([r.item.id,r.item.id]);}catch(e){if(this.active&&run===this.run)api.error(this,e);}finally{if(this.active&&run===this.run)this.setData({busy:false});}},
 async save(){if(this.data.busy)return;const d=this.data,ids=d.choices.map(i=>d.artworks[i]&&d.artworks[i].id);if(ids.some(x=>!x)||(d.contentMode==='prayer'&&ids[0]===ids[1])){api.error(this,new Error(d.contentMode==='photo'?'请先上传并选择照片。':'请选择两幅不同的已完成祈福画。'));return;}this.setData({busy:true,error:'',message:''});try{const s=await api.request('/api/account/ritual',{mode:d.mode,contentMode:d.contentMode,showActions:d.contentMode==='prayer'||d.showActions,artworkIds:ids});if(this.active)this.setData({status:s,syncConfigured:s.syncConfigured===true,message:s.syncConfigured?'计划已保存，设备实际显示以回执为准。':'画屏设置已保存；尚未绑定画屏，绑定后才会编译并下发。'});}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async scan(){if(this.data.busy)return;this.setData({busy:true,error:'',bleDevices:[]});try{await authorize();await this.ble.scan();}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async connect(e){if(this.data.busy)return;this.connectionNotice=true;this.setData({busy:true,error:'',message:''});try{await this.ble.connect(e.currentTarget.dataset.id);this.setData({connectedDeviceId:this.connection.snapshot.connectedDeviceId});await this.autoBind();void this.pollSync();}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async wifi(){if(!this.data.paired){api.error(this,new Error('请先连接附近画屏蓝牙。'));return;}if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.ble.configure(this.data.ssid,this.data.wifiPassword);await this.autoBind();void this.pollSync();this.setData({setupExpanded:false,message:''});}catch(e){if(this.active)api.error(this,e);}finally{this.setData({wifiPassword:'',editingPassword:false,busy:false});}},
 async autoBind(){
  const user=getApp().globalData.user;if(!user||!this.data.paired||this.data.binding)return;
  const known=this.connection.snapshot.connectedDeviceId;
  if(known&&this.data.status?.device?.id===known&&this.data.status.device.active)return;
  const key=user.id+':'+this.connection.target+':'+this.connection.client.epoch;
  if(this.bindAttempt===key)return;this.bindAttempt=key;
  const epoch=this.connection.client.epoch;this.connectionNotice=true;this.setData({binding:true,bindingError:'',error:'',message:''});
  try{
   const id=known||await this.connection.resolveIdentity(api.request);
   if(getApp().globalData.user?.id!==user.id||epoch!==this.connection.client.epoch||!this.connection.snapshot.paired)return;
   await api.request('/api/account/ritual/device',{deviceId:id});this.setData({message:'',error:''});
  }catch(e){if(epoch===this.connection.client.epoch&&this.connection.snapshot.paired){this.setData({bindingError:e.message});api.error(this,e);}}
  finally{this.setData({binding:false});}
 },
 async bind(){this.bindAttempt=null;await this.autoBind();await this.pollSync();},
 async unbind(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await api.request('/api/account/ritual/device/unbind',{});await this.load();this.setData({message:'已解除账户绑定。'});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async prepare(){if(this.data.busy)return;if(this.data.contentMode==='photo'){api.error(this,new Error('当前为照片模式，请先切换祈福模式。'));return;}this.setData({busy:true,error:'',message:'正在检查今日与明日画作…'});try{await syncPrayerPair({mode:this.data.mode});await this.load();this.setData({message:'今日与明日内容已准备并保存，设备显示以回执为准。'});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async disconnect(){await this.ble.disconnect();this.setData({wifiPassword:'',connectedDeviceId:'',bleDevices:[]});},login:api.goLogin
});
