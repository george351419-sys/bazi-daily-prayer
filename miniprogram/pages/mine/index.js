const api=require('../../utils/api');
const {syncGeneratedPrayer}=require('../../utils/ritual-sync');
const fresh=()=>({gender:'female',birthDate:'',birthTime:'',calendar:'solar',leap:false,city:'',wishes:[]});
Page({
 data:{user:null,error:'',message:'',busy:false,authMode:'wechat',username:'',password:'',nicknameDraft:'',agreed:false,profile:fresh(),groups:[],today:new Date(Date.now()+8*3600000).toISOString().slice(0,10),privacyOpen:false,generation:'',jobReady:false,wechatEnabled:false},
 async onShow(){
  api.tab(this,1);await getApp().ready;
  const app=getApp();
  this.setData({user:app.globalData.user,profile:app.globalData.profile||fresh(),nicknameDraft:(app.globalData.user&&app.globalData.user.nickname)||''});
  try{const b=await api.init();this.groups=b.wishGroups||[];this.setData({wechatEnabled:!!(b.miniProgram&&b.miniProgram.wechatLoginEnabled)});this.decorate();}catch(e){api.error(this,e);}
 },
 onHide(){this.setData({password:''});},
 decorate(){const selected=this.data.profile.wishes||[];this.setData({groups:(this.groups||[]).map(g=>({name:g.name,items:g.items.map(w=>Object.assign({},w,{selected:selected.indexOf(w.id)>=0}))}))});},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 field(e){this.job=null;this.setData({jobReady:false});this.setData({['profile.'+e.currentTarget.dataset.field]:e.detail.value});},
 choose(e){this.job=null;this.setData({jobReady:false});this.setData({['profile.'+e.currentTarget.dataset.field]:e.currentTarget.dataset.value});},
 agree(e){this.setData({agreed:e.detail.value});},
 leap(e){this.setData({'profile.leap':e.detail.value});},
 wish(e){this.job=null;this.setData({jobReady:false});const id=e.currentTarget.dataset.id,wishes=(this.data.profile.wishes||[]).slice(),i=wishes.indexOf(id);if(i<0)wishes.push(id);else wishes.splice(i,1);this.setData({'profile.wishes':wishes});this.decorate();},
 legacy(){this.setData({authMode:this.data.authMode==='legacy'?'wechat':'legacy',password:'',error:'',message:''});},
 accept(data,message){
  const app=getApp();
  app.globalData.user=data.user;app.globalData.profile=data.profile||fresh();
  this.job=null;this.setData({user:data.user,profile:data.profile||fresh(),nicknameDraft:data.user.nickname||'',message,generation:'',jobReady:false});
  this.decorate();
 },
 async wechatAuth(){
  if(this.data.busy)return;
  if(!this.data.agreed){api.error(this,new Error('请先阅读并同意账户与隐私说明。'));return;}
  this.setData({busy:true,error:'',message:''});
  try{const data=await api.wechatLogin();this.accept(data,data.user.authProvider==='wechat'?'已通过微信建立账户。':'已通过绑定的微信登录。');}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async auth(){
  if(this.data.busy)return;
  if(!this.data.agreed){api.error(this,new Error('请先阅读并同意账户与隐私说明。'));return;}
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
  if(!this.data.agreed){api.error(this,new Error('保存生辰前，请先阅读并同意隐私说明。'));return;}
  const p=this.data.profile;
  if(!p.birthDate||!p.birthTime||!p.wishes.length){api.error(this,new Error('请填写出生日期、时间，并选择至少一个愿望。'));return;}
  this.setData({busy:true,error:'',message:''});
  try{const r=await api.request('/api/account/profile',p);getApp().globalData.profile=r.profile;this.setData({profile:r.profile,message:'生辰与祈愿已保存。'});}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 async generate(){
  if(this.data.busy)return;
  const p=this.data.profile;
  if(!this.data.agreed||!p.birthDate||!p.birthTime||!p.wishes.length){api.error(this,new Error('请先同意隐私说明，填写生辰并选择心愿。'));return;}
  const user=getApp().globalData.user;if(!user)return;
  this.setData({busy:true,error:'',message:'',generation:this.job?'正在继续绘制…':'正在解析今日祈愿…'});
  try{
   if(!this.job){this.job=await api.request('/api/analyze',p);this.setData({jobReady:true,generation:'解读已归档，正在绘制画面…'});}
   const record=await api.request('/api/jobs/'+this.job.id+'/image',{jobToken:this.job.token});
   if(!getApp().globalData.user||getApp().globalData.user.id!==user.id)return;
   this.job=null;this.setData({jobReady:false,generation:'',message:'今日祈福画已归档。到「解读陪伴」查看画面解读、微行动与答案之数。'});
   try{
    const synced=await syncGeneratedPrayer();
    if(!getApp().globalData.user||getApp().globalData.user.id!==user.id)return;
    const message=synced.reason==='ready'?'今日祈福画已归档，画屏两日计划已更新；画屏联网后会领取并显示。到「解读陪伴」查看画面解读、微行动与答案之数。':synced.reason==='photo'?'今日祈福画已归档；画屏当前使用作品轮播，未自动替换。可到「自定义」手动切换回祈福图。':'今日祈福画已归档；尚未绑定画屏，绑定后才会编译并下发。';
    this.setData({message});
   }catch(e){if(getApp().globalData.user&&getApp().globalData.user.id===user.id)this.setData({message:'今日祈福画已归档；两日画屏同步暂未完成：'+e.message});}
  }catch(e){api.error(this,e);this.setData({generation:'',jobReady:!!this.job});}
  finally{this.setData({busy:false});}
 },
 screen(){wx.switchTab({url:'/pages/screen/index'});},
 companion(){wx.switchTab({url:'/pages/today/index'});},
 async logout(){
  this.setData({busy:true,error:''});
  try{await getApp().logout();this.job=null;this.setData({user:null,profile:fresh(),nicknameDraft:'',message:'已退出登录。',authMode:'wechat'});this.decorate();}
  catch(e){api.error(this,e);}
  finally{this.setData({busy:false});}
 },
 privacy(){this.setData({privacyOpen:!this.data.privacyOpen});},
 openPrivacy(){wx.openPrivacyContract({fail:()=>wx.showToast({title:'正式账号需先配置隐私保护指引',icon:'none'})});}
});
