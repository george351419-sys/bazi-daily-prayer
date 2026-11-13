const {openArtworkExplanation}=require('../../utils/artwork-link');
const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const api=require('../../utils/api');
const {currentActions,searchAnswers}=require('../../utils/companion');
const {shanghaiDate,todayArtwork}=require('../../utils/today-artwork');
Page({
 data:{loading:true,error:'',user:null,status:null,image:'',sample:true,date:'',artworkTitle:'',artworkId:'',actionOptions:[],actionIndex:0,currentAction:null,actionSlot:'',answerQuery:'',answerItems:[],answerOpened:''},
 onShow(){this.active=true;observeConnection(this);api.tab(this,2);void this.refresh();},
 onHide(){this.active=false;stopObserving(this);this.run=(this.run||0)+1;clearTimeout(this.timer);},onUnload(){this.onHide();},
 async refresh(){
  const run=this.run=(this.run||0)+1,today=shanghaiDate();clearTimeout(this.timer);
  // Never leave yesterday's picture visible while today's request is in flight.
  if(this.contentDate!==today){this.contentDate=today;this.artworkImageKey='';this.setData({image:'',status:null,artworkTitle:'',artworkId:''});}
  this.setData({error:'',date:today.replace(/-/g,' . ')});this.updateActions(this.data.status);
  const own=()=>this.active&&run===this.run&&today===shanghaiDate();
  try{
   const app=getApp();await app.ready;if(!own())return;
   const user=app.globalData.user;
   if(!user){this.updateActions(null);this.artworkImageKey='';this.setData({user,sample:true,status:null,image:'/assets/prayer-example.jpg',loading:false,artworkTitle:'',artworkId:''});return;}
   let status=await api.request('/api/account/ritual');if(!own())return;if(this.connection.acceptStatus(status)===false)status=this.connection.current||status;
   const pending=app.globalData.pendingPrayerArtwork;
   let artwork=pending?.userId===user.id&&pending.date===today?pending:todayArtwork(status,today);
   if(!artwork){const gallery=await api.request('/api/account/artworks');if(!own())return;artwork=(gallery.items||[]).find(item=>item.date===today&&item.status==='complete'&&item.source!=='upload'&&item.image)||null;}
   this.updateActions(status,artwork);
   const imagePath=artwork?.image||'',cached=imagePath===this.artworkImageKey?this.data.image:'';
   if(!imagePath)this.artworkImageKey='';
   this.setData({user,sample:false,status,image:cached,loading:false,artworkTitle:artwork?.title||'',artworkId:artwork?.id||artwork?.artworkId||''});
   if(imagePath&&!cached){const image=await api.image(imagePath);if(!own())return;this.artworkImageKey=imagePath;this.setData({image});}
  }catch(e){if(own()){api.error(this,e);this.setData({loading:false});}}
  finally{if(this.active&&run===this.run)this.timer=setTimeout(()=>this.refresh(),30000);}
 },
 updateActions(status,artwork){const value=currentActions(status,artwork);const same=this.actionKey===value.key;this.actionKey=value.key;const actionIndex=same?Math.min(this.data.actionIndex,value.options.length-1):0;this.setData({actionOptions:value.options,actionSlot:value.label,actionIndex:Math.max(0,actionIndex),currentAction:value.options[Math.max(0,actionIndex)]||null});},
 nextAction(){const key=this.actionKey;this.updateActions(this.data.status,{id:this.data.artworkId});if(key!==this.actionKey)return;const options=this.data.actionOptions;if(options.length<2)return;const actionIndex=(this.data.actionIndex+1)%options.length;this.setData({actionIndex,currentAction:options[actionIndex]});},
 searchAnswers(e){const answerQuery=e.detail.value;this.setData({answerQuery,answerItems:searchAnswers(answerQuery),answerOpened:''});},
 expandAnswer(e){const id=e.currentTarget.dataset.id;this.setData({answerOpened:this.data.answerOpened===id?'':id});},
 explanation(){return openArtworkExplanation(this);},
 open(){if(this.data.sample)this.login();else this.screen();},
 login:api.goLogin,screen(){wx.switchTab({url:'/pages/screen/index'});}
});
