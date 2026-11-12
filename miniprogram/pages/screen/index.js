const {transferStatus,receiptTime}=require('../../utils/transfer-status');
const api=require('../../utils/api');
const {preparePhotos,authorize}=require('../../utils/photos');
const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const {rotationIndex}=require('../../utils/ritual-view');
const {syncPrayerPair,syncGeneratedPrayer}=require('../../utils/ritual-sync');

Page({
 syncPhotos:true,
 data:{
  user:null,error:'',message:'',busy:false,showSyncProgress:false,settingsExpanded:false,settingsContentMode:'prayer',settingsMode:'daily',settingsArtworks:[],settingsTitles:[],settingsChoices:[0,1],photosDirty:false,photoMode:false,showActions:true,maxPhotos:6,photoSelection:[],rotationPosition:0,
  photoItems:[],availablePhotos:[],catalog:[],cursor:null,status:null,syncConfigured:false,preparing:false,
  bleDevices:[],bleText:'先唤醒画屏，再搜索蓝牙设备。',paired:false,ssid:'',wifiPassword:'',connectedDeviceId:''
 },
 onLoad(){this.photoSelection=[];},
 async onShow(){this.active=true;observeConnection(this);if(this.pickingPhotos){api.tab(this,3);return;}this.run=(this.run||0)+1;api.tab(this,3);await getApp().ready;if(!this.active)return;const user=getApp().globalData.user;if(this.draftOwner!==user?.id){this.photoSelection=[];this.setData({photosDirty:false,showSyncProgress:false,catalog:[],photoItems:[],availablePhotos:[]});}this.draftOwner=user?.id;this.setData({user,busy:false,message:'',error:'',settingsExpanded:false});if(this.data.user)await this.load();},
 onHide(){clearTimeout(this.syncTimer);stopObserving(this);if(this.pickingPhotos)return;this.active=false;this.run++;stopObserving(this);this.photo=null;this.setData({wifiPassword:'',draft:''});},
 onUnload(){this.pickingPhotos=false;this.onHide();},
 async pollSync(){
  clearTimeout(this.syncTimer);if(!this.active||!this.data.user)return;if(this.savingContent)return;const run=this.run,version=this.contentVersion||0;
  try{const status=await api.request('/api/account/ritual');if(!this.active||run!==this.run||version!==(this.contentVersion||0))return;this.connection.acceptStatus(status);this.setData({status,syncState:this.connection.stateFor(status,null),syncLastSeen:receiptTime(status.deviceReport?.lastSeen)});}catch(e){if(this.active&&run===this.run&&version===(this.contentVersion||0))this.setData({syncState:{phase:'unavailable',title:'同步状态暂不可用',detail:'正在重新读取设备回报，请稍候。',step:0}});}
  if(this.active&&run===this.run)this.syncTimer=setTimeout(()=>this.pollSync(),this.data.syncState?.phase==='rendered'?30000:2000);
 },
 async syncNow(){if(this.data.checkingSync||this.data.busy||this.data.binding)return;if(!this.data.paired){api.error(this,new Error('请先连接附近画屏蓝牙。'));return;}this.setData({checkingSync:true,error:''});try{await this.ble.syncNow();this.setData({message:'已确认画屏联网，等待设备下一次自动检查；本次操作不会主动断开 Wi-Fi。'});await this.pollSync();}catch(e){api.error(this,e);}finally{this.setData({checkingSync:false});}},
 async load(){
  const run=this.run;
  try{
   const results=await Promise.all([api.request('/api/account/ritual'),api.request('/api/account/artworks')]);
   if(!this.active||run!==this.run)return;
   const status=results[0],plan=status.plan;
   const catalog=results[1].items.concat((status.plannedDays||[]).filter(item=>!results[1].items.some(existing=>existing.id===item.artworkId)).map(item=>Object.assign({},item,{id:item.artworkId,status:'complete',image:'/api/account/artworks/'+item.artworkId+'/image'})));
   if(!this.data.photosDirty)this.photoSelection=plan&&plan.contentMode==='photo'?plan.artworkIds.slice(0,6):[];
   this.rotationStartDate=plan&&plan.rotationStartDate||'';
   const rotationPosition=rotationIndex(this.rotationStartDate,this.photoSelection.length);
   const merged=new Map(catalog.map(item=>[item.id,item]));if(this.data.photosDirty)for(const item of this.data.catalog)merged.set(item.id,Object.assign({},merged.get(item.id),item));
   this.setData({status,syncConfigured:status.syncConfigured===true,catalog:Array.from(merged.values()),cursor:results[1].cursor||null,photoMode:plan&&plan.contentMode==='photo',showActions:this.data.photosDirty?this.data.showActions:plan?plan.showActions!==false:true,rotationPosition});
   this.setData({settingsContentMode:plan?.contentMode||'prayer',settingsMode:plan?.mode||'daily'});this.populatePresentation(plan?.artworkIds);
   this.rebuildPhotos();
   await this.hydratePhotos(run);void this.pollSync();
  }catch(e){if(this.active&&run===this.run)api.error(this,e);}
 },
 rebuildPhotos(){
  const uploads=this.data.catalog.filter(item=>item.status==='complete'&&item.source==='upload'&&item.image);
  const byId=new Map(uploads.map(item=>[item.id,item]));
  this.photoSelection=this.photoSelection.filter(id=>byId.has(id)).slice(0,this.data.maxPhotos);
  const photoItems=this.photoSelection.map((id,index)=>Object.assign({},byId.get(id),{position:index+1}));
  const availablePhotos=uploads.filter(item=>!this.photoSelection.includes(item.id));
  const rotationPosition=rotationIndex(this.rotationStartDate,photoItems.length);
  this.setData({photoSelection:this.photoSelection.slice(),photoItems,availablePhotos,rotationPosition});
 },
 async hydratePhotos(run){
  const uploads=this.data.catalog.filter(item=>item.status==='complete'&&item.source==='upload'&&!item.preview&&item.image);
  for(const item of uploads){
   try{
    const preview=await api.image(item.image);if(!this.active||run!==this.run)return;
    // Merge just this preview into the latest list; never restore an old catalog snapshot.
    const catalog=this.data.catalog.map(entry=>entry.id===item.id&&entry.image===item.image?Object.assign({},entry,{preview}):entry);
    this.setData({catalog});this.rebuildPhotos();
   }catch{}
  }
 },
 addPhoto(e){if(this.data.busy)return;if(this.photoSelection.length>=this.data.maxPhotos)return api.error(this,new Error('轮播最多保存 6 张图片。'));const id=e.currentTarget.dataset.id;if(!id||this.photoSelection.includes(id))return;this.photoSelection.push(id);this.setData({message:'轮播已修改，保存后同步到画屏。',photosDirty:true,showSyncProgress:false});this.rebuildPhotos();},
 removePhoto(e){if(this.data.busy)return;const id=e.currentTarget.dataset.id;this.photoSelection=this.photoSelection.filter(item=>item!==id);this.setData({photosDirty:true,showSyncProgress:false,message:'已从轮播移除，保存后同步到画屏。'});this.rebuildPhotos();},
 movePhoto(e){if(this.data.busy)return;const id=e.currentTarget.dataset.id,direction=e.currentTarget.dataset.direction,index=this.photoSelection.indexOf(id),target=direction==='up'?index-1:index+1;if(index<0||target<0||target>=this.photoSelection.length)return;[this.photoSelection[index],this.photoSelection[target]]=[this.photoSelection[target],this.photoSelection[index]];this.setData({photosDirty:true,showSyncProgress:false});this.rebuildPhotos();},
 actions(e){if(this.data.busy)return;this.setData({showActions:e.detail.value,photosDirty:true,showSyncProgress:false});},
 async choosePhotos(){
  if(this.data.busy)return;
  const remaining=this.data.maxPhotos-this.photoSelection.length;
  if(remaining<=0){api.error(this,new Error('轮播已满 6 张，请先移除一张再上传。'));return;}
  this.pickingPhotos=true;this.setData({busy:true,error:'',message:'正在准备图片…'});
  try{
   const photos=await preparePhotos(this,remaining);
   for(const [index,photo] of photos.entries()){
    if(!this.active)return;
    this.setData({message:'正在上传第 '+(index+1)+' / '+photos.length+' 张…'});
    const result=await api.request('/api/account/photos',{type:photo.type,base64:photo.base64,title:'我的图片 '+(index+1)});
    if(!this.active)return;
    this.setData({catalog:[Object.assign({},result.item,{preview:photo.path})].concat(this.data.catalog),photosDirty:true,showSyncProgress:false});this.photoSelection.push(result.item.id);this.rebuildPhotos();
   }
   this.rebuildPhotos();await this.hydratePhotos(this.run);this.setData({message:'图片已上传并加入轮播。调整顺序后点击“确认切换”或“保存并更新内容”。'});
  }catch(e){if(this.active&&!/cancel/.test(e.message))api.error(this,e);}
  finally{this.pickingPhotos=false;if(this.active){this.setData({busy:false});void this.pollSync();}}
 },
 async savePhoto(){
  if(this.data.busy)return;
  const ids=this.photoSelection.slice();
  if(!ids.length){api.error(this,new Error('请先上传并选择至少一张自己的图片。'));return;}
  this.beginContentSave();
  this.connection?.setContentSaving?.(true);
  this.setData({busy:true,error:'',message:this.data.photoMode?'正在保存并更新轮播…':'正在切换为我的作品…'});
  try{const status=await api.request('/api/account/ritual',{mode:'daily',contentMode:'photo',showActions:this.data.showActions,artworkIds:ids});this.connection.acceptStatus(status);if(!this.active)return;this.rotationStartDate=status.plan&&status.plan.rotationStartDate||this.rotationStartDate;this.setData({status,photoMode:true,settingsContentMode:'photo',photosDirty:false,rotationPosition:rotationIndex(this.rotationStartDate,ids.length),syncConfigured:status.syncConfigured===true,syncState:this.connection.stateFor(status,null),message:'照片计划已保存，正在准备画屏内容。可在上方查看进度；尚未连接时，请先到「链接神物」连接画屏。'});}
  catch(e){if(this.active){this.setData({showSyncProgress:false});api.error(this,e);}}
  finally{this.savingContent=false;this.connection?.setContentSaving?.(false);if(this.active){this.setData({busy:false});void this.pollSync();}}
 },
 async switchPrayer(){
  if(this.data.busy)return;
  this.beginContentSave();
  this.connection?.setContentSaving?.(true);
  this.setData({busy:true,error:'',message:'正在准备今日与明日祈福图…'});
  try{
   const {status}=await syncPrayerPair({mode:'daily'});
   this.connection.acceptStatus(status);if(!this.active)return;
   this.photoSelection=[];this.rotationStartDate='';this.setData({status,photoMode:false,settingsContentMode:'prayer',photosDirty:false,rotationPosition:0,syncConfigured:status.syncConfigured===true,message:'已切换回祈福图；等待画框领取并回报。'});this.rebuildPhotos();
  }catch(e){if(this.active){this.setData({showSyncProgress:false});api.error(this,e);}}
  finally{this.savingContent=false;this.connection?.setContentSaving?.(false);if(this.active){this.setData({busy:false});void this.pollSync();}}
 },
 beginContentSave(){this.savingContent=true;this.contentVersion=(this.contentVersion||0)+1;clearTimeout(this.syncTimer);this.setData({showSyncProgress:true,syncState:{phase:'preparing',title:'正在保存并准备画屏内容',detail:'保存后会继续显示同步进度与连接引导。',step:0,percent:null}},()=>{if(typeof wx!=='undefined'&&wx.pageScrollTo)wx.pageScrollTo({selector:'#photo-sync-progress',duration:200});});},
 togglePresentation(){this.setData({settingsExpanded:!this.data.settingsExpanded});},
 populatePresentation(ids){
  const prior=ids||this.data.settingsChoices.map(i=>this.data.settingsArtworks[i]?.id),items=this.data.catalog.filter(item=>item.status==='complete'&&item.image&&item.source!=='upload');
  const pick=(id,day)=>{const index=items.findIndex(item=>item.id===id);return index>=0?index:day===1&&items.length>1?1:0;};
  this.setData({settingsArtworks:items,settingsTitles:items.map(item=>item.title+' · '+(item.date||'')),settingsChoices:[pick(prior[0],0),pick(prior[1],1)]});
 },
 presentationContent(e){if(this.data.busy)return;this.setData({settingsContentMode:e.detail.value});this.populatePresentation();},
 presentationMode(e){if(!this.data.busy)this.setData({settingsMode:e.detail.value});},
 presentationChoice(e){if(this.data.busy)return;const choices=this.data.settingsChoices.slice();choices[Number(e.currentTarget.dataset.day)]=Number(e.detail.value);this.setData({settingsChoices:choices});},
 async preparePresentation(){
  if(this.data.busy)return;const run=this.run;this.setData({busy:true,error:'',message:'正在准备今日与明日画作…'});
  try{
   const {preparePrayerPair}=require('../../utils/ritual-sync');const prepared=await preparePrayerPair(this.data.settingsMode);if(!this.active||run!==this.run)return;
   const [status,page]=await Promise.all([api.request('/api/account/ritual'),api.request('/api/account/artworks')]);if(!this.active||run!==this.run)return;
   const planned=(status.plannedDays||[]).map(item=>Object.assign({},item,{id:item.artworkId,status:'complete',image:'/api/account/artworks/'+item.artworkId+'/image'}));
   const catalog=new Map(this.data.catalog.concat(planned,page.items).map(item=>[item.id,item]));this.setData({catalog:Array.from(catalog.values()),cursor:page.cursor||null,message:'画作已准备，请确认选择后保存。'});this.populatePresentation(prepared.artworkIds);
  }catch(e){if(this.active&&run===this.run)api.error(this,e);}finally{if(this.active&&run===this.run)this.setData({busy:false});}
 },
 async savePresentation(){
  if(this.data.busy)return;if(this.data.settingsContentMode==='photo')return this.savePhoto();
  const ids=this.data.settingsChoices.map(index=>this.data.settingsArtworks[index]?.id);
  if(!ids[0]||!ids[1]||ids[0]===ids[1])return api.error(this,new Error('请选择两幅不同的已完成祈福画。'));
  this.beginContentSave();this.connection?.setContentSaving?.(true);this.setData({busy:true,error:''});
  try{const status=await api.request('/api/account/ritual',{mode:this.data.settingsMode,contentMode:'prayer',showActions:this.data.showActions,artworkIds:ids});this.connection.acceptStatus(status);if(!this.active)return;this.photoSelection=[];this.setData({status,photoMode:false,settingsContentMode:'prayer',photosDirty:false,syncConfigured:status.syncConfigured===true,syncState:this.connection.stateFor(status,null),message:'画屏呈现设置已保存。'});this.rebuildPhotos();}
  catch(e){if(this.active){this.setData({showSyncProgress:false});api.error(this,e);}}finally{this.savingContent=false;this.connection?.setContentSaving?.(false);if(this.active){this.setData({busy:false});void this.pollSync();}}
 },
 async more(){if(this.data.busy||!this.data.cursor)return;this.setData({busy:true,error:''});try{const page=await api.request('/api/account/artworks?cursor='+encodeURIComponent(this.data.cursor));if(!this.active)return;this.setData({catalog:this.data.catalog.concat(page.items),cursor:page.cursor||null});this.rebuildPhotos();this.populatePresentation();await this.hydratePhotos(this.run);}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async scan(){if(this.data.busy)return;this.setData({busy:true,error:'',bleDevices:[]});try{await authorize();await this.ble.scan();}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async connect(e){if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.ble.connect(e.currentTarget.dataset.id);const device=this.data.bleDevices.find(item=>item.id===e.currentTarget.dataset.id),match=device&&device.name.match(/^FRAMEFILMARK[-_ ]?([a-f0-9]{12})$/i);this.setData({connectedDeviceId:match?match[1].toLowerCase():''});}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async wifi(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.ble.configure(this.data.ssid,this.data.wifiPassword);}catch(e){if(this.active)api.error(this,e);}finally{this.setData({wifiPassword:'',busy:false});}},
 async bind(){
  if(this.data.busy||!this.data.connectedDeviceId||!this.data.paired)return;
  this.setData({busy:true,error:''});
  try{await api.request('/api/account/ritual/device',{deviceId:this.data.connectedDeviceId});await this.load();this.setData({message:'画屏已绑定。已准备的内容会直接下发；若还没有画作，请先去许愿池生成。'});}
  catch(e){api.error(this,e);}finally{this.setData({busy:false});}
 },
 async unbind(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await api.request('/api/account/ritual/device/unbind',{});await this.load();this.setData({message:'已解除本账户与画屏的关联。'});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async disconnect(){await this.ble.disconnect();this.setData({wifiPassword:'',connectedDeviceId:'',bleDevices:[]});},
 connectScreen(){wx.switchTab({url:'/pages/network/index'});},
 login:api.goLogin
});
