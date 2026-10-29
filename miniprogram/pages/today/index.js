const api=require('../../utils/api');
Page({
 data:{loading:true,error:'',user:null,status:null,image:'',sample:true,expanded:false,date:'',readings:[]},
 onShow(){this.active=true;this.run=(this.run||0)+1;api.tab(this,0);this.refresh();},
 onHide(){this.active=false;this.run++;clearTimeout(this.timer);},onUnload(){this.onHide();},
 async refresh(){const run=this.run;clearTimeout(this.timer);this.setData({error:'',date:new Date(Date.now()+8*3600000).toISOString().slice(0,10).replace(/-/g,' . ')});try{const app=getApp();await app.ready;if(!this.active||run!==this.run)return;const user=app.globalData.user;this.setData({user});if(!user){this.setData({sample:true,status:null,image:'/assets/prayer-example.jpg',loading:false});return;}const status=await api.request('/api/account/ritual');if(!this.active||run!==this.run)return;const mapping=(status.artwork&&status.artwork.mapping)||{};this.setData({sample:false,status,image:'',loading:false,readings:(mapping.reading&&mapping.reading.sections)||[],intro:(mapping.reading&&mapping.reading.intro)||mapping.overview||''});if(status.artwork){const image=await api.image(status.artwork.image);if(this.active&&run===this.run)this.setData({image});}}catch(e){if(this.active&&run===this.run){api.error(this,e);this.setData({loading:false});}}finally{if(this.active&&run===this.run&&getApp().globalData.user)this.timer=setTimeout(()=>this.refresh(),30000);}},
 open(){if(this.data.sample)this.login();else this.screen();},
 expand(){this.setData({expanded:!this.data.expanded});},login:api.goLogin,screen(){wx.switchTab({url:'/pages/screen/index'});},answers(){wx.switchTab({url:'/pages/answers/index'});}
});
