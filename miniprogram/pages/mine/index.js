const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const {receiptTime}=require('../../utils/transfer-status');
const api=require('../../utils/api');
const {syncGeneratedPrayer}=require('../../utils/ritual-sync');
const WISH_GROUPS=[{"name":"生活丰足","items":[{"id":"W01","label":"生活富足"},{"id":"W02","label":"财源广进"},{"id":"W03","label":"生意兴旺"},{"id":"W04","label":"债务结清"},{"id":"W05","label":"投资顺利"},{"id":"W06","label":"衣食无忧"}]},{"name":"事业向前","items":[{"id":"W07","label":"上岸考编"},{"id":"W08","label":"面试顺利"},{"id":"W09","label":"升职加薪"},{"id":"W10","label":"创业顺利"},{"id":"W11","label":"同事相处融洽"},{"id":"W12","label":"步步向前"}]},{"name":"学业精进","items":[{"id":"W13","label":"金榜题名"},{"id":"W14","label":"考试顺利"},{"id":"W15","label":"考研考证顺利"},{"id":"W16","label":"学业进步"},{"id":"W17","label":"论文顺利"}]},{"name":"健康平安","items":[{"id":"W18","label":"身体康健"},{"id":"W19","label":"早日康复"},{"id":"W20","label":"家人安康"},{"id":"W21","label":"老人长寿"},{"id":"W22","label":"生活平安"},{"id":"W23","label":"出入平安"}]},{"name":"情感家庭","items":[{"id":"W24","label":"遇见良缘"},{"id":"W25","label":"脱单"},{"id":"W26","label":"婚姻和睦"},{"id":"W27","label":"珍惜真诚关系"},{"id":"W28","label":"迎接新生命"},{"id":"W29","label":"家庭和顺"}]},{"name":"人际相伴","items":[{"id":"W30","label":"遇见同行伙伴"},{"id":"W31","label":"减少口舌矛盾"},{"id":"W32","label":"修复亲友或亲子关系"}]},{"name":"心境迎新","items":[{"id":"W33","label":"迎接新生活"},{"id":"W34","label":"重拾好心情"},{"id":"W35","label":"内心安宁"},{"id":"W36","label":"放下执念"}]}];
const fresh=()=>({gender:'female',birthDate:'',birthTime:'',calendar:'solar',leap:false,city:'',wishes:[],artStyle:'cute'});
const restoredProfile=value=>{const result=fresh();for(const key of Object.keys(result))if(value&&value[key]!==undefined)result[key]=value[key];result.wishes=Array.isArray(result.wishes)?result.wishes.slice():[];if(!['cute','folk','spirit'].includes(result.artStyle))result.artStyle='cute';return result;};
Page({
 data:{artStyles:[{id:'cute',label:'可爱风',description:'Q版神仙，圆润喜庆'},{id:'spirit',label:'灵兽风',description:'问问兽演绎，保留神像配饰'},{id:'folk',label:'民俗风',description:'传统神像，庄重亲切'}],birthdayOpen:false,loginOpen:false,user:null,error:'',message:'',busy:false,authMode:'wechat',username:'',password:'',nicknameDraft:'',agreed:false,profile:fresh(),groups:WISH_GROUPS,today:new Date(Date.now()+8*3600000).toISOString().slice(0,10),profileCollapsed:false,styleSelected:false,privacyOpen:false,generation:'',generationPhase:'',generatedImage:'',profileSaved:false,jobReady:false,wechatEnabled:false},
 previewArtStyle(e){const id=e.currentTarget.dataset.id;if(!['folk','cute','spirit'].includes(id))return;wx.previewImage({current:'/assets/prayer-styles/'+id+'.jpg',urls:['/assets/prayer-styles/'+id+'.jpg']});},
 async onShow(){
  this.active=true;observeConnection(this);this.groups=WISH_GROUPS;this.decorate();
  api.tab(this,0);await getApp().ready;
  const app=getApp();
  this.restorePreferences(app.globalData.user,app.globalData.profile);
  this.setData({user:app.globalData.user,profileCollapsed:false,nicknameDraft:(app.globalData.user&&app.globalData.user.nickname)||''});
  try{const b=await api.init();this.setData({wechatEnabled:!!(b.miniProgram&&b.miniProgram.wechatLoginEnabled)});this.decorate();if(this.data.user)void this.pollSync();}catch(e){api.error(this,e);}
 },
 onHide(){this.draft=JSON.parse(JSON.stringify(this.data.profile));this.active=false;this.syncTurn=(this.syncTurn||0)+1;clearTimeout(this.syncTimer);stopObserving(this);this.setData({password:''});},
 onUnload(){this.onHide();},
 async pollSync(){
  clearTimeout(this.syncTimer);if(!this.active||!getApp().globalData.user)return;
  const userId=getApp().globalData.user.id,turn=this.syncTurn=(this.syncTurn||0)+1;
  try{const status=await api.request('/api/account/ritual');if(!this.active||turn!==this.syncTurn||getApp().globalData.user?.id!==userId)return;this.connection.acceptStatus(status);if(status.preparation?.ready&&(!this.generatedArtworkId||status.plan?.artworkIds?.includes(this.generatedArtworkId)))this.prepareFailure=null;this.setData({status,syncLastSeen:receiptTime(status.deviceReport?.lastSeen),prepareFailed:!!this.prepareFailure,syncState:this.prepareFailure?{phase:'retrying',title:'画屏内容准备暂未完成',detail:this.prepareFailure,step:0,percent:null}:this.preparingPair?{phase:'preparing',title:'正在补齐两日画作',detail:'祈福图已完成，正在准备画屏内容；暂不需要连接设备。',step:0,percent:null}:this.connection.stateFor(status)});}
  catch(e){if(this.active&&turn===this.syncTurn)this.setData({syncState:{phase:'unavailable',title:'同步状态暂不可用',detail:e.message,step:0,percent:null}});}
  if(this.active&&turn===this.syncTurn&&getApp().globalData.user?.id===userId)this.syncTimer=setTimeout(()=>this.pollSync(),this.data.syncState?.phase==='rendered'?30000:2000);
 },
 restorePreferences(user,saved,{preserveGuest=false}={}){
  const owner=user?.id||'guest',changed=this.profileOwner!==undefined&&this.profileOwner!==owner;
  const keep=!!this.profileEdited&&(!changed||(this.profileOwner==='guest'&&preserveGuest));
  const profile=restoredProfile(keep?(this.draft||this.data.profile):user&&saved?saved:changed?fresh():this.draft||this.data.profile);
  const styleSelected=keep?this.data.styleSelected:!!(user&&saved)||(!changed&&this.data.styleSelected);
  if(!keep){this.draft=null;this.profileEdited=false;}
  this.profileOwner=owner;this.setData({profile,styleSelected,profileSaved:!!(user&&saved&&!keep)});this.decorate();
 },
 markProfileEdited(){this.profileEdited=true;this.draft=null;},
 decorate(){const selected=this.data.profile.wishes||[];this.setData({groups:(this.groups||[]).map(g=>({name:g.name,items:g.items.map(w=>Object.assign({},w,{selected:selected.indexOf(w.id)>=0}))}))});},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 field(e){this.markProfileEdited();this.job=null;this.setData({jobReady:false,profileSaved:false});this.setData({['profile.'+e.currentTarget.dataset.field]:e.detail.value});},
 choose(e){this.markProfileEdited();const {field,value}=e.currentTarget.dataset;if(field==='artStyle'){this.job=null;this.setData({'profile.artStyle':value,styleSelected:true,jobReady:false});return;}this.job=null;this.setData({jobReady:false,profileSaved:false});this.setData({['profile.'+field]:value});},
 editProfile(){this.setData({profileCollapsed:false,profileSaved:false});},
 agree(e){this.setData({agreed:e.detail.value});},
 leap(e){this.markProfileEdited();this.job=null;this.setData({'profile.leap':e.detail.value,profileSaved:false,jobReady:false});},
 wish(e){this.markProfileEdited();this.job=null;this.setData({jobReady:false,profileSaved:false});const id=e.currentTarget.dataset.id,wishes=(this.data.profile.wishes||[]).slice(),i=wishes.indexOf(id);if(i<0)wishes.push(id);else wishes.splice(i,1);this.setData({'profile.wishes':wishes});this.decorate();},
 legacy(){this.setData({authMode:this.data.authMode==='legacy'?'wechat':'legacy',password:'',error:'',message:''});},
 accept(data,message){
  const app=getApp();
  app.globalData.user=data.user;app.globalData.profile=data.profile||null;
  this.restorePreferences(data.user,data.profile,{preserveGuest:true});
  this.job=null;this.setData({user:data.user,loginOpen:false,nicknameDraft:data.user.nickname||'',message,generation:'',jobReady:false});
  this.decorate();void this.pollSync();
 },
 async wechatAuth(){
  if(this.data.busy)return;
  if(!await this.confirmPrivacy())return;
  this.setData({busy:true,error:'',message:''});
  try{const data=await api.wechatLogin();this.accept(data,data.user.authProvider==='wechat'?'已通过微信建立账户。':'已通过绑定的微信登录。');}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
  if(this.pendingGeneration&&this.data.user)await this.generate();
 },
 async auth(){
  if(this.data.busy)return;
  if(!await this.confirmPrivacy())return;
  this.setData({busy:true,error:'',message:''});
  try{const data=await api.request('/api/account/login',{username:this.data.username,password:this.data.password});this.accept(data,'已登录已有账户。');}
  catch(e){api.error(this,e);}
  finally{this.setData({password:'',busy:false});}
  if(this.pendingGeneration&&this.data.user)await this.generate();
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
 toggleBirthday(){this.setData({birthdayOpen:!this.data.birthdayOpen});},
 cancelLogin(){this.pendingGeneration=false;this.setData({loginOpen:false,password:'',message:'已保留祈愿和画风，可继续浏览。'});},
 async generate(){
  if(this.data.busy)return;
  const profile=JSON.parse(JSON.stringify(this.data.profile));
  if(!profile.wishes.length){api.error(this,new Error('请先选择至少一个祈愿。'));return;}
  if(!this.data.styleSelected){api.error(this,new Error('请先选择画面风格。'));return;}
  if(profile.birthDate&&!profile.birthTime){this.setData({birthdayOpen:true});api.error(this,new Error('使用生日个性化时，请补充时刻；也可清除生日，直接按祈愿生成。'));return;}
  if(!profile.birthDate){profile.contentMode='wish-art';profile.birthTime='';profile.city='';}
  else delete profile.contentMode;
  this.draft=JSON.parse(JSON.stringify(this.data.profile));
  if(!this.data.user){this.pendingGeneration=true;this.setData({loginOpen:true,error:''},()=>{if(wx.pageScrollTo)wx.pageScrollTo({selector:'#generation-login',duration:200});});return;}
  if(!await this.confirmPrivacy())return;
  this.pendingGeneration=false;
  getApp().globalData.generationProfile=profile;
  wx.navigateTo({url:'/pages/generation/index'});
 },
 clearBirthday(){this.markProfileEdited();this.setData({'profile.birthDate':'','profile.birthTime':'','profile.city':''});},
 async confirmPrivacy(){
  if(this.data.agreed)return true;
  if(this.consentPending)return false;
  this.consentPending=true;
  try{const result=await new Promise(resolve=>wx.showModal({title:'账户与隐私说明',content:'所选祈愿、画风及自愿填写的生日纪念资料用于生成个性化祈福画；画作与照片保存在你的私有账户。登录会话保存在本机，退出后清除。Wi-Fi 密码仅通过蓝牙发送给所选设备，不上传后台。是否同意并继续？',confirmText:'同意继续',cancelText:'暂不同意',success:resolve,fail:()=>{const message='隐私确认暂未打开，请再次点击保存重试。';api.error(this,new Error(message));wx.showToast({title:message,icon:'none'});resolve({confirm:false});}}));if(result.confirm)this.setData({agreed:true});return !!result.confirm;}finally{this.consentPending=false;}
 },
 async retryPreparation(){if(this.data.busy)return;this.setData({busy:true});this.prepareFailure=null;this.preparingPair=true;try{await syncGeneratedPrayer();}catch(e){this.prepareFailure=e.message;}finally{this.preparingPair=false;this.setData({busy:false});void this.pollSync();}},
 async syncNow(){try{await this.connection.syncNow();await this.pollSync();}catch(e){api.error(this,e);}},
 connectScreen(){wx.switchTab({url:'/pages/network/index'});},
 screen(){wx.switchTab({url:'/pages/screen/index'});},
 companion(){wx.switchTab({url:'/pages/today/index'});},
 async logout(){
  this.setData({busy:true,error:''});
  try{await getApp().logout();this.draft=null;this.profileEdited=false;this.profileOwner='guest';this.job=null;this.setData({user:null,status:null,syncState:null,profileSaved:false,profileCollapsed:false,styleSelected:false,generatedImage:'',generation:'',generationPhase:'',agreed:false,profile:fresh(),nicknameDraft:'',message:'已退出登录。',authMode:'wechat'});this.decorate();}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 privacy(){this.setData({privacyOpen:!this.data.privacyOpen});},
 openPrivacy(){wx.openPrivacyContract({fail:()=>wx.showToast({title:'正式账号需先配置隐私保护指引',icon:'none'})});}
});
