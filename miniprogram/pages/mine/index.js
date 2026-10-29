const api=require('../../utils/api');
const fresh=()=>({gender:'female',birthDate:'',birthTime:'',calendar:'solar',leap:false,city:'',wishes:[]});
Page({
 data:{user:null,error:'',message:'',busy:false,authMode:'login',username:'',password:'',nickname:'',recoveryCode:'',agreed:false,profile:fresh(),groups:[],recovery:'',today:new Date(Date.now()+8*3600000).toISOString().slice(0,10),privacyOpen:false,generation:'',jobReady:false},
 async onShow(){api.tab(this,3);await getApp().ready;const app=getApp();this.setData({user:app.globalData.user,profile:app.globalData.profile||fresh()});try{const b=await api.init();this.groups=b.wishGroups||[];this.decorate();}catch(e){api.error(this,e);}},
 onHide(){this.setData({password:'',recoveryCode:'',recovery:''});},
 decorate(){const selected=this.data.profile.wishes||[];this.setData({groups:(this.groups||[]).map(g=>({name:g.name,items:g.items.map(w=>Object.assign({},w,{selected:selected.indexOf(w.id)>=0}))}))});},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 field(e){this.job=null;this.setData({jobReady:false});this.setData({['profile.'+e.currentTarget.dataset.field]:e.detail.value});},
 choose(e){this.job=null;this.setData({jobReady:false});this.setData({['profile.'+e.currentTarget.dataset.field]:e.currentTarget.dataset.value});},
 agree(e){this.setData({agreed:e.detail.value});},
 leap(e){this.setData({'profile.leap':e.detail.value});},
 wish(e){this.job=null;this.setData({jobReady:false});const id=e.currentTarget.dataset.id,wishes=(this.data.profile.wishes||[]).slice(),i=wishes.indexOf(id);if(i<0)wishes.push(id);else wishes.splice(i,1);this.setData({'profile.wishes':wishes});this.decorate();},
 mode(e){this.setData({authMode:e.currentTarget.dataset.mode,password:'',recoveryCode:'',recovery:'',error:'',message:''});},
 async auth(){if(this.data.busy)return;if(!this.data.agreed){api.error(this,new Error('请先阅读并同意账户与隐私说明。'));return;}this.setData({busy:true,error:'',message:''});try{const d=this.data;const result=await api.request('/api/account/'+d.authMode,{username:d.username,password:d.password,nickname:d.nickname,recoveryCode:d.recoveryCode});const app=getApp();app.globalData.user=result.user;app.globalData.profile=result.profile;this.setData({user:result.user,profile:result.profile||fresh(),recovery:result.recoveryCode||'',message:'已登录，与网页使用同一账户。'});this.decorate();}catch(e){api.error(this,e);}finally{this.setData({password:'',recoveryCode:'',busy:false});}},
 async save(){if(this.data.busy)return;if(!this.data.agreed){api.error(this,new Error('保存生辰前，请先阅读并同意隐私说明。'));return;}const p=this.data.profile;if(!p.birthDate||!p.birthTime||!p.wishes.length){api.error(this,new Error('请填写出生日期、时间，并选择至少一个愿望。'));return;}this.setData({busy:true,error:'',message:''});try{const r=await api.request('/api/account/profile',p);getApp().globalData.profile=r.profile;this.setData({profile:r.profile,message:'生辰与祈愿已保存。'});}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 async generate(){
  if(this.data.busy)return;const p=this.data.profile;
  if(!this.data.agreed||!p.birthDate||!p.birthTime||!p.wishes.length){api.error(this,new Error('请先同意隐私说明，填写生辰并选择心愿。'));return;}
  const user=getApp().globalData.user;if(!user)return;
  this.setData({busy:true,error:'',message:'',generation:this.job?'正在继续绘制…':'正在解析今日祈愿…'});
  try{
   if(!this.job){this.job=await api.request('/api/analyze',p);this.setData({jobReady:true,generation:'解读已归档，正在绘制画面…'});}
   const record=await api.request('/api/jobs/'+this.job.id+'/image',{jobToken:this.job.token});
   if(!getApp().globalData.user||getApp().globalData.user.id!==user.id)return;
   this.job=null;this.setData({jobReady:false,generation:'',message:'今日祈福画已归档。到「画屏」选择两天画面后保存计划。'});
  }catch(e){api.error(this,e);this.setData({generation:'',jobReady:!!this.job});}
  finally{this.setData({busy:false});}
 },
 screen(){wx.switchTab({url:'/pages/screen/index'});},
 async logout(){this.setData({busy:true,error:''});try{await getApp().logout();this.job=null;this.setData({user:null,profile:fresh(),recovery:'',message:'已退出登录。'});this.decorate();}catch(e){api.error(this,e);}finally{this.setData({busy:false});}},
 privacy(){this.setData({privacyOpen:!this.data.privacyOpen});},openPrivacy(){wx.openPrivacyContract({fail:()=>wx.showToast({title:'正式账号需先配置隐私保护指引',icon:'none'})});}
});
