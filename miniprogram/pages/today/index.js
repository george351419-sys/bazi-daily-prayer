const api=require('../../utils/api');
const {answers}=require('../../utils/content');
const {daysFor,progress}=require('../../utils/ritual-view');
function answerNumber(answer){const match=/(\d+)\s*$/.exec((answer&&answer.id)||'');return match?Number(match[1]):null;}
Page({
 data:{loading:true,error:'',user:null,status:null,image:'',sample:true,date:'',readings:[],days:[],allActions:false,progress:'',overview:'',elements:[],blessing:'',artworkTitle:'',currentAnswer:null,answerNo:null,answerSource:'',drawing:false},
 onShow(){this.active=true;this.run=(this.run||0)+1;api.tab(this,2);this.refresh();},
 onHide(){this.active=false;this.run++;clearTimeout(this.timer);},onUnload(){this.onHide();},
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
   const days=daysFor(status).map(day=>{const preview=day.image&&this.previews.get(day.image);return preview?Object.assign({},day,{preview}):day;});
   const mapping=(status.artwork&&status.artwork.mapping)||{};
   const reading=mapping.reading||{};
   const artworkPath=status.artwork&&status.artwork.image||'';
   const cachedImage=artworkPath&&artworkPath===this.artworkImageKey?this.data.image:'';
   const currentAnswer=status.answer||this.manualAnswer||null;
   if(!artworkPath)this.artworkImageKey='';
   this.setData({user,sample:false,status,days,progress:progress(status),image:cachedImage,loading:false,readings:reading.sections||[],intro:reading.intro||mapping.overview||'',overview:mapping.overview||'',elements:Array.isArray(mapping.elements)?mapping.elements:[],blessing:mapping.blessing||'',artworkTitle:(status.artwork&&status.artwork.title)||'',currentAnswer,answerNo:answerNumber(currentAnswer),answerSource:status.answer?'device':this.manualAnswer?'phone':''});
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
  finally{if(this.active&&run===this.run&&getApp().globalData.user)this.timer=setTimeout(()=>this.refresh(),60000);}
 },
 drawAnswer(){
  if(this.data.drawing)return;
  this.setData({drawing:true});
  wx.getRandomValues({length:4,success:result=>{
   let index=new DataView(result.randomValues).getUint32(0)%answers.length;
   if(answers.length>1&&this.data.currentAnswer&&answers[index].id===this.data.currentAnswer.id)index=(index+1)%answers.length;
   const answer=answers[index];this.manualAnswer=answer;this.setData({currentAnswer:answer,answerNo:answerNumber(answer),answerSource:'phone'});
  },fail:()=>wx.showToast({title:'本次翻页未完成，请重试',icon:'none'}),complete:()=>this.setData({drawing:false})});
 },
 open(){if(this.data.sample)this.login();else this.screen();},
 toggleActions(){this.setData({allActions:!this.data.allActions});},
 login:api.goLogin,screen(){wx.switchTab({url:'/pages/screen/index'});},answers(){wx.navigateTo({url:'/pages/answers/index'});}
});
