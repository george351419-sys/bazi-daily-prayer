const api=require('../../utils/api');
const {preparePhotos,authorize}=require('../../utils/photos');
const {ArkBLE}=require('../../utils/ble');
const {rotationIndex}=require('../../utils/ritual-view');
const {syncPrayerPair,syncGeneratedPrayer}=require('../../utils/ritual-sync');

Page({
 data:{
  user:null,error:'',message:'',busy:false,photoMode:false,showActions:true,maxPhotos:6,photoSelection:[],rotationPosition:0,
  photoItems:[],availablePhotos:[],catalog:[],cursor:null,status:null,syncConfigured:false,preparing:false,
  bleDevices:[],bleText:'先唤醒画屏，再搜索蓝牙设备。',paired:false,ssid:'',wifiPassword:'',connectedDeviceId:''
 },
 onLoad(){this.ble=new ArkBLE((bleText,paired)=>{if(this.active)this.setData({bleText,paired});},bleDevices=>{if(this.active)this.setData({bleDevices});});},
 async onShow(){this.active=true;this.run=(this.run||0)+1;api.tab(this,3);await getApp().ready;if(!this.active)return;this.setData({user:getApp().globalData.user,busy:false});if(this.data.user)await this.load();},
 onHide(){this.active=false;this.run++;this.setData({wifiPassword:'',paired:false,connectedDeviceId:'',bleDevices:[],bleText:'蓝牙未连接。'});this.ble.disconnect();},
 onUnload(){this.onHide();},
 async load(){
  const run=this.run;
  try{
   const results=await Promise.all([api.request('/api/account/ritual'),api.request('/api/account/artworks')]);
   if(!this.active||run!==this.run)return;
   const status=results[0],plan=status.plan;
   const catalog=results[1].items.concat((status.plannedDays||[]).filter(item=>!results[1].items.some(existing=>existing.id===item.artworkId)).map(item=>Object.assign({},item,{id:item.artworkId,status:'complete',image:'/api/account/artworks/'+item.artworkId+'/image'})));
   this.photoSelection=plan&&plan.contentMode==='photo'?plan.artworkIds.slice(0,6):[];
   this.rotationStartDate=plan&&plan.rotationStartDate||'';
   const rotationPosition=rotationIndex(this.rotationStartDate,this.photoSelection.length);
   this.setData({status,syncConfigured:status.syncConfigured===true,catalog,cursor:results[1].cursor||null,photoMode:plan&&plan.contentMode==='photo',showActions:plan?plan.showActions!==false:true,rotationPosition});
   this.rebuildPhotos();
   await this.hydratePhotos(run);
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
  const catalog=this.data.catalog.slice();
  let changed=false;
  for(const item of uploads){
   try{const preview=await api.image(item.image);if(!this.active||run!==this.run)return;const index=catalog.findIndex(entry=>entry.id===item.id);if(index<0)continue;catalog[index]=Object.assign({},catalog[index],{preview});changed=true;}catch{}
  }
  if(changed){this.setData({catalog});this.rebuildPhotos();}
 },
 addPhoto(e){if(this.photoSelection.length>=this.data.maxPhotos)return api.error(this,new Error('轮播最多保存 6 张图片。'));const id=e.currentTarget.dataset.id;if(!id||this.photoSelection.includes(id))return;this.photoSelection.push(id);this.setData({message:''});this.rebuildPhotos();},
 removePhoto(e){const id=e.currentTarget.dataset.id;this.photoSelection=this.photoSelection.filter(item=>item!==id);this.rebuildPhotos();},
 movePhoto(e){const id=e.currentTarget.dataset.id,direction=e.currentTarget.dataset.direction,index=this.photoSelection.indexOf(id),target=direction==='up'?index-1:index+1;if(index<0||target<0||target>=this.photoSelection.length)return;[this.photoSelection[index],this.photoSelection[target]]=[this.photoSelection[target],this.photoSelection[index]];this.rebuildPhotos();},
 actions(e){this.setData({showActions:e.detail.value});},
 async choosePhotos(){
  if(this.data.busy)return;
  const remaining=this.data.maxPhotos-this.photoSelection.length;
  if(remaining<=0){api.error(this,new Error('轮播已满 6 张，请先移除一张再上传。'));return;}
  this.setData({busy:true,error:'',message:'正在准备图片…'});
  try{
   const photos=await preparePhotos(this,remaining);
   for(const [index,photo] of photos.entries()){
    if(!this.active)return;
    this.setData({message:'正在上传第 '+(index+1)+' / '+photos.length+' 张…'});
    const result=await api.request('/api/account/photos',{type:photo.type,base64:photo.base64,title:'我的图片 '+(index+1)});
    if(!this.active)return;
    this.setData({catalog:[Object.assign({},result.item,{preview:photo.path})].concat(this.data.catalog)});this.photoSelection.push(result.item.id);
   }
   this.rebuildPhotos();await this.hydratePhotos(this.run);this.setData({message:'图片已上传并加入轮播。调整顺序后点击“确认切换”或“保存并更新内容”。'});
  }catch(e){if(this.active&&!/cancel/.test(e.message))api.error(this,e);}
  finally{if(this.active)this.setData({busy:false});}
 },
 async savePhoto(){
  if(this.data.busy)return;
  const ids=this.photoSelection.slice();
  if(!ids.length){api.error(this,new Error('请先上传并选择至少一张自己的图片。'));return;}
  this.setData({busy:true,error:'',message:this.data.photoMode?'正在保存并更新轮播…':'正在切换为我的作品…'});
  try{const status=await api.request('/api/account/ritual',{mode:'daily',contentMode:'photo',showActions:this.data.showActions,artworkIds:ids});if(!this.active)return;this.rotationStartDate=status.plan&&status.plan.rotationStartDate||this.rotationStartDate;this.setData({status,photoMode:true,rotationPosition:rotationIndex(this.rotationStartDate,ids.length),syncConfigured:status.syncConfigured===true,message:status.syncConfigured?'已保存并交给画框同步；实际显示以设备回执为准。':'已保存到账户；绑定画屏后才会编译并下发。'});}
  catch(e){if(this.active)api.error(this,e);}
  finally{if(this.active)this.setData({busy:false});}
 },
 async switchPrayer(){
  if(this.data.busy)return;
  this.setData({busy:true,error:'',message:'正在准备今日与明日祈福图…'});
  try{
   const {status}=await syncPrayerPair({mode:'daily'});
   if(!this.active)return;
   this.photoSelection=[];this.rotationStartDate='';this.setData({status,photoMode:false,rotationPosition:0,syncConfigured:status.syncConfigured===true,message:'已切换回祈福图；等待画框领取并回报。'});this.rebuildPhotos();
  }catch(e){if(this.active)api.error(this,e);}
  finally{if(this.active)this.setData({busy:false});}
 },
 async more(){if(this.data.busy||!this.data.cursor)return;this.setData({busy:true,error:''});try{const page=await api.request('/api/account/artworks?cursor='+encodeURIComponent(this.data.cursor));if(!this.active)return;this.setData({catalog:this.data.catalog.concat(page.items),cursor:page.cursor||null});this.rebuildPhotos();await this.hydratePhotos(this.run);}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async scan(){if(this.data.busy)return;this.setData({busy:true,error:'',bleDevices:[]});try{await authorize();await this.ble.scan();}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async connect(e){if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.ble.connect(e.currentTarget.dataset.id);const device=this.data.bleDevices.find(item=>item.id===e.currentTarget.dataset.id),match=device&&device.name.match(/^FRAMEFILMARK[-_ ]?([a-f0-9]{12})$/i);this.setData({connectedDeviceId:match?match[1].toLowerCase():''});}catch(e){if(this.active)api.error(this,e);}finally{if(this.active)this.setData({busy:false});}},
 async wifi(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await this.ble.configure(this.data.ssid,this.data.wifiPassword);}catch(e){if(this.active)api.error(this,e);}finally{this.setData({wifiPassword:'',busy:false});}},
 async bind(){if(this.data.busy||!this.data.connectedDeviceId||!this.data.paired)return;this.setData({busy:true,error:''});try{await api.request('/api/account/ritual/device',{deviceId:this.data.connectedDeviceId});await this.load();let message='画屏已绑定到账户；完成今日祈福画后会准备两日内容。';try{const synced=await syncGeneratedPrayer();if(synced.needed)message=synced.reason==='ready'?'画屏已绑定，两日祈福内容已准备；设备联网后领取并回报。':'画屏已绑定；内容会按当前模式同步。';}catch(e){message='画屏已绑定；两日内容暂未就绪：'+e.message;}this.setData({message});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async unbind(){if(this.data.busy)return;this.setData({busy:true,error:''});try{await api.request('/api/account/ritual/device/unbind',{});await this.load();this.setData({message:'已解除本账户与画屏的关联。'});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async disconnect(){await this.ble.disconnect();this.setData({wifiPassword:'',connectedDeviceId:'',bleDevices:[]});},
 login:api.goLogin
});
