const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const api=require('../../utils/api');
const {syncGeneratedPrayer}=require('../../utils/ritual-sync');
const fresh=()=>({gender:'female',birthDate:'',birthTime:'',calendar:'solar',leap:false,city:'',wishes:[],artStyle:'cute'});
Page({
 data:{artStyles:[{id:'cute',label:'可爱风',description:'Q版神仙，圆润喜庆'},{id:'spirit',label:'灵兽风',description:'问问兽演绎，保留神像配饰'},{id:'folk',label:'民俗风',description:'传统神像，庄重亲切'}],user:null,error:'',message:'',busy:false,authMode:'wechat',username:'',password:'',nicknameDraft:'',agreed:false,profile:fresh(),groups:[],today:new Date(Date.now()+8*3600000).toISOString().slice(0,10),profileCollapsed:false,styleSelected:false,privacyOpen:false,generation:'',generationPhase:'',generatedImage:'',profileSaved:false,jobReady:false,wechatEnabled:false},
 previewArtStyle(e){const id=e.currentTarget.dataset.id;if(!['folk','cute','spirit'].includes(id))return;wx.previewImage({current:'/assets/prayer-styles/'+id+'.jpg',urls:['/assets/prayer-styles/'+id+'.jpg']});},
 async onShow(){
  this.active=true;observeConnection(this);
  api.tab(this,0);await getApp().ready;
  const app=getApp();
  this.setData({user:app.globalData.user,profile:app.globalData.profile||fresh(),profileSaved:!!app.globalData.profile?.birthDate,profileCollapsed:!!app.globalData.profile?.birthDate,nicknameDraft:(app.globalData.user&&app.globalData.user.nickname)||''});
  try{const b=await api.init();this.groups=b.wishGroups||[];this.setData({wechatEnabled:!!(b.miniProgram&&b.miniProgram.wechatLoginEnabled)});this.decorate();if(this.data.user)void this.pollSync();}catch(e){api.error(this,e);}
 },
 onHide(){this.active=false;this.syncTurn=(this.syncTurn||0)+1;clearTimeout(this.syncTimer);stopObserving(this);this.setData({password:''});},
 onUnload(){this.onHide();},
 async pollSync(){
  clearTimeout(this.syncTimer);if(!this.active||!getApp().globalData.user)return;
  const userId=getApp().globalData.user.id,turn=this.syncTurn=(this.syncTurn||0)+1;
  try{const status=await api.request('/api/account/ritual');if(!this.active||turn!==this.syncTurn||getApp().globalData.user?.id!==userId)return;this.connection.acceptStatus(status);if(status.preparation?.ready&&(!this.generatedArtworkId||status.plan?.artworkIds?.includes(this.generatedArtworkId)))this.prepareFailure=null;this.setData({status,prepareFailed:!!this.prepareFailure,syncState:this.prepareFailure?{phase:'retrying',title:'画屏内容准备暂未完成',detail:this.prepareFailure,step:0,percent:null}:this.preparingPair?{phase:'preparing',title:'正在补齐两日画作',detail:'祈福图已完成，正在准备画屏内容；暂不需要连接设备。',step:0,percent:null}:this.connection.stateFor(status,this.generatedArtworkId)});}
  catch(e){if(this.active&&turn===this.syncTurn)this.setData({syncState:{phase:'unavailable',title:'同步状态暂不可用',detail:e.message,step:0,percent:null}});}
  if(this.active&&turn===this.syncTurn&&getApp().globalData.user?.id===userId)this.syncTimer=setTimeout(()=>this.pollSync(),this.data.syncState?.phase==='rendered'?30000:2000);
 },
 decorate(){const selected=this.data.profile.wishes||[];this.setData({groups:(this.groups||[]).map(g=>({name:g.name,items:g.items.map(w=>Object.assign({},w,{selected:selected.indexOf(w.id)>=0}))}))});},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 field(e){this.job=null;this.setData({jobReady:false,profileSaved:false,styleSelected:false});this.setData({['profile.'+e.currentTarget.dataset.field]:e.detail.value});},
 choose(e){const {field,value}=e.currentTarget.dataset;if(field==='artStyle'){if(!this.data.profileSaved)return;this.job=null;this.setData({'profile.artStyle':value,styleSelected:true,jobReady:false});return;}this.job=null;this.setData({jobReady:false,profileSaved:false,styleSelected:false});this.setData({['profile.'+field]:value});},
 editProfile(){this.setData({profileCollapsed:false,profileSaved:false,styleSelected:false});},
 agree(e){this.setData({agreed:e.detail.value});},
 leap(e){this.job=null;this.setData({'profile.leap':e.detail.value,profileSaved:false,jobReady:false});},
 wish(e){this.job=null;this.setData({jobReady:false,profileSaved:false,styleSelected:false});const id=e.currentTarget.dataset.id,wishes=(this.data.profile.wishes||[]).slice(),i=wishes.indexOf(id);if(i<0)wishes.push(id);else wishes.splice(i,1);this.setData({'profile.wishes':wishes});this.decorate();},
 legacy(){this.setData({authMode:this.data.authMode==='legacy'?'wechat':'legacy',password:'',error:'',message:''});},
 accept(data,message){
  const app=getApp();
  app.globalData.user=data.user;app.globalData.profile=data.profile||fresh();
  this.job=null;this.setData({user:data.user,profile:data.profile||fresh(),nicknameDraft:data.user.nickname||'',message,generation:'',jobReady:false});
  this.decorate();void this.pollSync();
 },
 async wechatAuth(){
  if(this.data.busy)return;
  if(!await this.confirmPrivacy())return;
  this.setData({busy:true,error:'',message:''});
  try{const data=await api.wechatLogin();this.accept(data,data.user.authProvider==='wechat'?'已通过微信建立账户。':'已通过绑定的微信登录。');}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async auth(){
  if(this.data.busy)return;
  if(!await this.confirmPrivacy())return;
  this.setData({busy:true,error:'',message:''});
  try{const data=await api.request('/api/account/login',{username:this.data.username,password:this.data.password});this.accept(data,'已登录已有账户。');}
  catch(e){api.error(this,e);}
  finally{this.setData({password:'',busy:false});}
 },
 async saveNickname(){
  if(this.data.busy)return;
  const nickname=String(this.data.nicknameDraft||'').trim();
  if(!nickname){api.error(this,new Error('请填写昵称。'));return;}
  this.setData({busy:true,error:'',message:''});
  try{const data=await api.request('/api/account/nickname',{nickname});getApp().globalData.user=data.user;this.setData({user:data.user,message:'昵称已更新。'});}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async bindWechat(){
  if(this.data.busy)return;
  this.setData({busy:true,error:'',message:''});
  try{
   const data=await api.bindWechat();
   getApp().globalData.user=data.user;this.setData({user:data.user,message:'微信已绑定，之后可以一键登录。'});
  }catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async save(){
  if(this.data.busy)return;
  const p=this.data.profile;
  if(!p.birthDate||!p.birthTime||!p.wishes?.length){const message='请填写出生日期、时间，并选择至少一个愿望。';api.error(this,new Error(message));wx.showToast({title:message,icon:'none'});return;}
  if(!await this.confirmPrivacy())return;
  if(this.data.busy)return;
  this.setData({busy:true,error:'',message:''});
  try{const r=await api.request('/api/account/profile',p);getApp().globalData.profile=r.profile;this.setData({profile:r.profile,profileSaved:true,profileCollapsed:true,styleSelected:false,message:'生辰与心愿已保存，请选择画面风格。'});}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async generate(){
  if(this.data.busy)return;
  if(!this.data.profileSaved){api.error(this,new Error('请先保存生辰与心愿，再生成今日造像。'));return;}
  if(!this.data.styleSelected){api.error(this,new Error('请选择画面风格，再生成今日造像。'));return;}
  getApp().globalData.generationProfile=JSON.parse(JSON.stringify(this.data.profile));
  wx.navigateTo({url:'/pages/generation/index'});
 },
 async confirmPrivacy(){
  if(this.consentPending)return false;
  this.consentPending=true;
  try{const result=await new Promise(resolve=>wx.showModal({title:'账户与隐私说明',content:'生辰、城市与心愿用于保存个人资料、生成造像与解读；画作与照片保存在你的私有账户。登录会话保存在本机，退出后清除。Wi-Fi 密码仅通过蓝牙发送给所选设备，不上传后台。是否同意并继续？',confirmText:'同意继续',cancelText:'暂不同意',success:resolve,fail:()=>{const message='隐私确认暂未打开，请再次点击保存重试。';api.error(this,new Error(message));wx.showToast({title:message,icon:'none'});resolve({confirm:false});}}));if(result.confirm)this.setData({agreed:true});return !!result.confirm;}finally{this.consentPending=false;}
 },
 async retryPreparation(){if(this.data.busy)return;this.setData({busy:true});this.prepareFailure=null;this.preparingPair=true;try{await syncGeneratedPrayer();}catch(e){this.prepareFailure=e.message;}finally{this.preparingPair=false;this.setData({busy:false});void this.pollSync();}},
 async syncNow(){try{await this.connection.syncNow();await this.pollSync();}catch(e){api.error(this,e);}},
 connectScreen(){wx.switchTab({url:'/pages/network/index'});},
 screen(){wx.switchTab({url:'/pages/screen/index'});},
 companion(){wx.switchTab({url:'/pages/today/index'});},
 async logout(){
  this.setData({busy:true,error:''});
  try{await getApp().logout();this.job=null;this.setData({user:null,status:null,syncState:null,profileSaved:false,profileCollapsed:false,styleSelected:false,generatedImage:'',generation:'',generationPhase:'',agreed:false,profile:fresh(),nicknameDraft:'',message:'已退出登录。',authMode:'wechat'});this.decorate();}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 privacy(){this.setData({privacyOpen:!this.data.privacyOpen});},
 openPrivacy(){wx.openPrivacyContract({fail:()=>wx.showToast({title:'正式账号需先配置隐私保护指引',icon:'none'})});}
});
