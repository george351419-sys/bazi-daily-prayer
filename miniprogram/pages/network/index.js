const {transferStatus,receiptTime}=require('../../utils/transfer-status');
const api=require('../../utils/api');const {preparePhoto,authorize}=require('../../utils/photos');const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const {syncPrayerPair,syncGeneratedPrayer}=require('../../utils/ritual-sync');
Page({
 data:{releaseVersion:'1.1.27',editingPassword:false,binding:false,bindingError:'',setupExpanded:false,user:null,error:'',message:'',diagnosticText:'',diagnosticReportId:'',sendingDiagnostic:false,busy:false,contentMode:'prayer',showActions:true,mode:'test',catalog:[],artworks:[],titles:[],choices:[0,0],cursor:null,photoTitle:'',draft:'',bleDevices:[],bleText:'先唤醒画屏，再搜索蓝牙设备。',paired:false,ssid:'',wifiPassword:'',syncConfigured:false,status:null,connectedDeviceId:'',preparing:false,heartbeatUrl:'',heartbeatText:'',delivered:null},
 copyDiagnostic(title,payload){this.setData({diagnosticText:payload});wx.setClipboardData({data:payload,success:()=>wx.showToast({title:title+'已复制，下方也可长按选择',icon:'none'}),fail:()=>wx.showToast({title:'复制失败，请长按下方诊断文本',icon:'none'})});},
 diagnostics(){const {bleDiagnostics}=require('../../utils/ble');this.copyDiagnostic('连接诊断',bleDiagnostics());},
 statusDiagnostics(){const snapshot=this.connection.snapshot,payload=JSON.stringify({status:this.data.status,syncState:this.data.syncState,connection:{paired:snapshot.paired,deviceId:snapshot.connectedDeviceId,wifiConnected:snapshot.wifiConnected,receivedAt:snapshot.receivedAt,delivered:this.connection.delivered},heartbeat:this.heartbeatProbe},null,2);this.copyDiagnostic('状态诊断',payload);},
 async sendDiagnostic(){if(this.data.sendingDiagnostic)return;const s=this.data.status||{},d=s.deviceReport||{},snapshot=this.connection.snapshot;let bleEvents=[];try{bleEvents=JSON.parse(require('../../utils/ble').bleDiagnostics()).slice(-30);}catch{}this.setData({sendingDiagnostic:true,error:'',diagnosticReportId:''});try{const r=await api.request('/api/account/ritual/diagnostic',{preparation:s.preparation||null,build:s.build?{status:s.build.status||null,sha256:s.build.sha256||null,publishedAt:s.build.publishedAt||null,note:s.build.note||null,nextAttemptAt:s.build.nextAttemptAt||null,artworkIds:s.build.artworkIds||[],mode:s.build.mode||null,contentMode:s.build.contentMode||null,startsAt:s.build.startsAt||null}:null,plan:s.plan?{mode:s.plan.mode||null,contentMode:s.plan.contentMode||null,artworkIds:s.plan.artworkIds||[],revision:s.plan.revision||null}:null,plannedDays:(s.plannedDays||[]).map(item=>({artworkId:item.artworkId,date:item.date||null})),displayPlan:s.displayPlan?{mode:s.displayPlan.mode||null,contentMode:s.displayPlan.contentMode||null,artworkIds:s.displayPlan.artworkIds||[],startsAt:s.displayPlan.startsAt||null,displaySource:s.displaySource||null,dayIndex:s.position?.dayIndex??null,artworkId:s.displayPlan.artworkIds?.[s.position?.dayIndex]||null}:null,deviceReport:{lastSeen:d.lastSeen||null,firmwareVersion:d.firmwareVersion||null,targetSha:d.targetSha||null,stored:!!d.stored,renderedCurrent:!!d.renderedCurrent,downloadState:d.downloadState??null,downloadProgress:d.downloadProgress??null,renderReport:d.renderReport||null,renderStage:d.renderStage||null,heartbeatDiagnostic:d.heartbeatDiagnostic||null},connection:{paired:!!snapshot.paired,wifiConnected:!!snapshot.wifiConnected,apiURL:this.connection.client.apiURL||null,bleEvents,receivedAt:snapshot.receivedAt||null},heartbeat:{result:this.heartbeatProbe?.result||null,normal:this.heartbeatProbe?.url==='https://playmath.cn/api/v1/device/heartbeat'}});this.setData({diagnosticReportId:r.reportId,message:'诊断已发送，报告编号 2 小时内有效。'});}catch(e){api.error(this,e);}finally{this.setData({sendingDiagnostic:false});}},
 async heartbeatAddress(){
  if(!this.data.paired){this.setData({error:'请先连接画屏蓝牙，再读取心跳地址。'});return;}
  if(this.data.binding){this.setData({error:'正在认主，请稍候再读取心跳地址。'});return;}
  this.setData({busy:true,error:''});
  try{
   // 设备云端无心跳时，最直接的证据是「设备到底往哪个地址打心跳」。
   // 连上蓝牙后读 0x3f：若确认是本站配对地址残留则顺手归位，指向其它云端时不擅自改写。
   const probe=await this.ble.client.restoreHeartbeatURL();
   this.heartbeatProbe={url:probe.url||null,result:probe.result,normal:'https://playmath.cn/api/v1/device/heartbeat',checkedAt:new Date().toISOString()};
   this.setData({heartbeatUrl:probe.url||'',heartbeatText:({restored:'配对地址已归位 · 请复制状态诊断取证',clean:'心跳地址正常 · 请复制状态诊断取证',foreign:'设备指向其它云端，未改动 · 请复制状态诊断取证',empty:'画屏未回复心跳地址',failed:'读取失败，请唤醒画屏后重试'})[probe.result]||'检查完成'});
  }catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async toggleDelivered(){
  // 手动标记是用户亲眼看到新画后的确认，不是设备回执；再点一次撤销，恢复真实状态。
  if(this.connection.delivered){this.connection.clearDelivered();this.setData({message:'已撤销手动标记，回到设备真实回执状态。'});return;}
  const status=this.data.status,sha=status?.build?.sha256,deviceId=this.connection.snapshot.connectedDeviceId||status?.device?.id;
  if(!sha||!/^[a-f0-9]{64}$/.test(sha)||!/^[a-f0-9]{12}$/.test(deviceId||'')){this.setData({error:'请先连接画屏并等待内容就绪，再标记完成。'});return;}
  this.connection.markDelivered(sha,deviceId,'user-confirmed',status?.plan?.artworkIds?.[0]||null);
  this.setData({message:'已作本机手动标记；这不会替画屏向后台发送刷新回执。再次点击可撤销。'});
 },
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
 populate(ids){const items=this.data.catalog.filter(x=>x.status==='complete'&&x.image&&((x.source==='upload')===(this.data.contentMode==='photo')));
  // 找不到对应画作时不要静默落到第一项：那会让用户以为选的还是原本那幅，实际换了内容。
  // 回退到默认下标，并由 save() 以实际选中的 id 为准，保证「显示的」与「保存的」始终一致。
  const pick=(wanted,day)=>{const i=wanted?items.findIndex(x=>x.id===wanted):-1;if(i>=0)return i;return day===1&&this.data.contentMode==='prayer'&&items.length>1?1:0;};
  const choices=ids&&ids.length?[pick(ids[0],0),pick(ids[1],1)]:[0,this.data.contentMode==='prayer'&&items.length>1?1:0];
  this.setData({artworks:items,titles:items.map(x=>x.title+' · '+x.date),choices});},
 content(e){const dataset=(e&&e.currentTarget&&e.currentTarget.dataset)||{};const value=dataset.value!==undefined?dataset.value:(e&&e.detail?e.detail.value:'');if(!value)return;this.setData({contentMode:value,error:'',message:''});this.populate();},
 actions(e){this.setData({showActions:!!(e&&e.detail&&e.detail.value)});},mode(e){const dataset=(e&&e.currentTarget&&e.currentTarget.dataset)||{};const value=dataset.value!==undefined?dataset.value:(e&&e.detail?e.detail.value:'');if(!value)return;this.setData({mode:value});},choice(e){const dataset=(e&&e.currentTarget&&e.currentTarget.dataset)||{};const day=dataset.day!==undefined?Number(dataset.day):0;const index=Number(e&&e.detail?e.detail.value:0);if(!Number.isInteger(index)||index<0)return;this.setData({['choices['+day+']']:index});},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 async more(){if(this.data.busy)return;this.setData({busy:true,error:''});try{const selected=this.data.choices.map(i=>this.data.artworks[i]&&this.data.artworks[i].id),r=await api.request('/api/account/artworks?cursor='+encodeURIComponent(this.data.cursor));if(!this.active)return;this.setData({catalog:this.data.catalog.concat(r.items),cursor:r.cursor});this.populate(selected);}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async choosePhoto(){if(this.data.busy)return;this.setData({busy:true,error:'',message:''});try{const photo=await preparePhoto(this);if(!this.active)return;this.photo=photo;this.setData({draft:photo.path});}catch(e){if(this.active&&!/cancel/.test(e.message))api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async upload(){if(!this.photo||this.data.busy)return;const run=this.run;this.setData({busy:true,error:'',message:''});try{const r=await api.request('/api/account/photos',{type:this.photo.type,base64:this.photo.base64,title:this.data.photoTitle||'我的照片'});if(!this.active||run!==this.run)return;this.photo=null;this.setData({catalog:[r.item].concat(this.data.catalog),draft:'',photoTitle:'',message:'照片已保存到账户。请选择两天的画面并保存设置。'});this.populate([r.item.id,r.item.id]);}catch(e){if(this.active&&run===this.run)api.error(this,e);}finally{if(this.active&&run===this.run)this.setData({busy:false});}},
 async save(){if(this.data.busy)return;const d=this.data;
  // 后端要求：祈福模式必须两幅不同；照片模式要 1–6 张互不重复的照片。
  // 照片模式允许两天选同一张（画屏会循环播放），但提交给后端的清单必须去重，
  // 否则 configureRitual 会以「请选择 1–6 张不同的已上传作品」拒绝整个请求。
  const picked=d.choices.map(i=>d.artworks[i]&&d.artworks[i].id);
  const ids=d.contentMode==='photo'?[...new Set(picked.filter(Boolean))]:picked;
  if(!ids.length||ids.some(x=>!x)||(d.contentMode==='prayer'&&ids[0]===ids[1])){api.error(this,new Error(d.contentMode==='photo'?'请先上传并选择照片。':'请选择两幅不同的已完成祈福画。'));return;}
  this.connection?.setContentSaving?.(true);this.setData({busy:true,error:'',message:''});
  try{const s=await api.request('/api/account/ritual',{mode:d.mode,contentMode:d.contentMode,showActions:d.showActions,artworkIds:ids});this.connection?.acceptStatus?.(s);if(this.active)this.setData({status:s,syncConfigured:s.syncConfigured===true,message:s.syncConfigured?'计划已保存，设备实际显示以回执为准。':'画屏设置已保存；尚未绑定画屏，绑定后才会编译并下发。'});}catch(e){if(this.active)api.error(this,e);}finally{this.connection?.setContentSaving?.(false);if(this.active)this.setData({busy:false});}},
 async scan(){if(this.data.busy)return;this.setData({busy:true,error:'',bleDevices:[]});try{await authorize();await this.ble.scan();}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async connect(e){if(this.data.busy)return;this.connectionNotice=true;this.setData({busy:true,error:'',message:''});try{await this.ble.connect(e.currentTarget.dataset.id);this.setData({connectedDeviceId:this.connection.snapshot.connectedDeviceId});await this.autoBind();void this.pollSync();}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async wifi(){if(!this.data.paired){api.error(this,new Error('请先连接附近画屏蓝牙。'));return;}if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.ble.configure(this.data.ssid,this.data.wifiPassword);await this.autoBind();void this.pollSync();this.setData({setupExpanded:false,message:''});}catch(e){if(this.active)api.error(this,e);}finally{this.setData({wifiPassword:'',editingPassword:false,busy:false});}},
 async autoBind(){
  const user=getApp().globalData.user;if(!user||!this.data.paired||this.data.binding)return;
  const known=this.connection.snapshot.connectedDeviceId;
  // 账号已绑定这块画屏：不再重复认主。认主会把设备心跳地址临时改成配对 challenge、
  // 占住整条 BLE 队列，重开小程序又走一遍会让页面长时间卡在「正在认主…」。
  const bound=this.data.status;
  if(known&&bound?.syncConfigured===true&&bound?.device?.id===known&&bound.device.active)return;
  const key=user.id+':'+this.connection.target+':'+this.connection.client.epoch;
  if(this.bindAttempt===key)return;this.bindAttempt=key;
  const epoch=this.connection.client.epoch;this.connectionNotice=true;this.setData({binding:true,bindingError:'',error:'',message:''});
  let timer=null;
  const work=(async()=>{
   const id=known||await this.connection.resolveIdentity(api.request);
   if(getApp().globalData.user?.id!==user.id||epoch!==this.connection.client.epoch||!this.connection.snapshot.paired)return;
   await api.request('/api/account/ritual/device',{deviceId:id});this.setData({message:'',error:''});
  })();
  // 认主整体加兜底超时：resolveIdentity 内部 60s 轮询只在能跑到循环判断时才生效，
  // 一旦卡在某个 await（BLE 队列、挂起的请求）就会无限显示「正在认主…」。
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('认主超时：画屏未在限定时间内回报，请保持画屏唤醒后点「认主并关联账户」重试。')),75000);});
  try{await Promise.race([work,deadline]);}
  catch(e){if(epoch===this.connection.client.epoch&&this.connection.snapshot.paired){this.setData({bindingError:e.message});api.error(this,e);}}
  finally{clearTimeout(timer);this.setData({binding:false});}
 },
 async bind(){this.bindAttempt=null;await this.autoBind();await this.pollSync();},
 async unbind(){
  if(this.data.busy)return;
  // 解绑不可逆：画屏会失去本账户归属、需重新认主。必须二次确认，不能一点就掉。
  const confirmed=await new Promise(resolve=>wx.showModal({title:'停用并解除绑定',content:'解除后这台画屏不再归属你的账户，画屏保留原有画面，重新使用需再次认主关联。确定要停用并解除绑定吗？',confirmText:'确定停用',cancelText:'再想想',success:r=>resolve(!!r.confirm),fail:()=>resolve(false)}));
  if(!confirmed)return;
  this.setData({busy:true,error:''});
  try{const result=await api.request('/api/account/ritual/device/unbind',{});await this.load();this.setData({message:result&&result.removed?'已停用并解除绑定，这台画屏不再归属你的账户。':'当前没有绑定中的画屏。'});}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async prepare(){if(this.data.busy)return;if(this.data.contentMode==='photo'){api.error(this,new Error('当前为照片模式，请先切换祈福模式。'));return;}this.setData({busy:true,error:'',message:'正在检查今日与明日画作…'});try{await syncPrayerPair({mode:this.data.mode});await this.load();this.setData({message:'今日与明日内容已准备并保存，设备显示以回执为准。'});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async disconnect(){await this.ble.disconnect();this.setData({wifiPassword:'',connectedDeviceId:'',bleDevices:[]});},login:api.goLogin
});
