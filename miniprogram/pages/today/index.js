const {observeConnection,stopObserving}=require('../../utils/screen-connection');
const api=require('../../utils/api');
const {daysFor,progress}=require('../../utils/ritual-view');
Page({
 data:{loading:true,error:'',user:null,status:null,image:'',sample:true,date:'',readings:[],days:[],allActions:false,progress:'',overview:'',elements:[],blessing:'',artworkTitle:'',currentAnswer:null,answerNo:null,answerSource:'',drawing:false},
 onShow(){this.active=true;observeConnection(this);this.run=(this.run||0)+1;api.tab(this,2);this.refresh();},
 onHide(){this.active=false;stopObserving(this);this.run++;clearTimeout(this.timer);},onUnload(){this.onHide();},
 async refresh(){
  const run=this.run;
  clearTimeout(this.timer);
  this.previews=this.previews||new Map();
  this.setData({error:'',date:new Date(Date.now()+8*3600000).toISOString().slice(0,10).replace(/-/g,' . ')});
  try{
   const app=getApp();
   await app.ready;
   if(!this.active||run!==this.run)return;
   const user=app.globalData.user;
   if(!user){this.previews.clear();this.artworkImageKey='';this.manualAnswer=null;this.setData({user,sample:true,status:null,days:[],progress:'',image:'/assets/prayer-example.jpg',loading:false,readings:[],overview:'',elements:[],blessing:'',artworkTitle:'',currentAnswer:null,answerNo:null,answerSource:''});return;}
   const status=await api.request('/api/account/ritual');
   if(!this.active||run!==this.run)return;
   this.connection.acceptStatus(status);
   const days=daysFor(status).map(day=>{const preview=day.image&&this.previews.get(day.image);return preview?Object.assign({},day,{preview}):day;});
   const artworkPath=status.artwork&&status.artwork.image||'';
   const cachedImage=artworkPath&&artworkPath===this.artworkImageKey?this.data.image:'';

   if(!artworkPath)this.artworkImageKey='';
   this.setData({user,sample:false,status,days,syncState:this.connection.stateFor(status),progress:progress(status),image:cachedImage,loading:false,readings:[],intro:'',overview:'',elements:[],blessing:'',artworkTitle:(status.artwork&&status.artwork.title)||'',currentAnswer:null,answerNo:null,answerSource:''});
   let previewsChanged=false;
   for(const day of days){
    if(!day.image||day.preview)continue;
    try{const preview=await api.image(day.image);if(!this.active||run!==this.run)return;this.previews.set(day.image,preview);day.preview=preview;previewsChanged=true;}catch{}
   }
   if(previewsChanged)this.setData({days});
   if(artworkPath&&!cachedImage){
    try{const image=await api.image(artworkPath);if(!this.active||run!==this.run)return;this.artworkImageKey=artworkPath;this.setData({image});}catch{}
   }
  }catch(e){if(this.active&&run===this.run){api.error(this,e);this.setData({loading:false});}}
  finally{if(this.active&&run===this.run&&getApp().globalData.user)this.timer=setTimeout(()=>this.refresh(),this.data.syncState?.phase==='rendered'?30000:5000);}
 },
 open(){if(this.data.sample)this.login();else this.screen();},
 login:api.goLogin,screen(){wx.switchTab({url:'/pages/screen/index'});}
});
