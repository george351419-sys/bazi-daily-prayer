const generation=require('../../utils/generation');
Page({
 data:{phase:'analyzing',text:'正在准备今日造像…',image:'',error:'',preparing:false},
 onLoad(){const profile=getApp().globalData.generationProfile;if(!profile){wx.navigateBack();return;}void generation.start(profile);},
 onShow(){this.stop=generation.subscribe(task=>{if(task.userId===getApp().globalData.user?.id){const {phase,text,image,error,preparing,preparation,preparationError,imageError}=task;this.setData({phase,text,image,error,preparing,preparation,preparationError,imageError});}});},
 onHide(){this.stop?.();this.stop=null;},onUnload(){this.onHide();},
 retry(){void generation.start(getApp().globalData.generationProfile);},
 reloadImage(){void generation.reloadImage();},retryPreparation(){void generation.retryPreparation();},
 connectScreen(){wx.switchTab({url:'/pages/network/index'});}
});
