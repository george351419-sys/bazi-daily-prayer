const generation=require('../../utils/generation');
Page({
 data:{phase:'analyzing',text:'正在准备今日造像…',image:'',error:'',preparing:false,savingImage:false,saveError:''},
 onLoad(){const profile=getApp().globalData.generationProfile;if(!profile){wx.navigateBack();return;}void generation.start(profile);},
 onShow(){this.stop=generation.subscribe(task=>{if(task.userId===getApp().globalData.user?.id){const {phase,text,image,error,preparing,preparation,preparationError,imageError}=task;this.setData({phase,text,image,error,preparing,preparation,preparationError,imageError});}});},
 onHide(){this.stop?.();this.stop=null;},onUnload(){this.onHide();},
 retry(){void generation.start(getApp().globalData.generationProfile);},
 reloadImage(){void generation.reloadImage();},retryPreparation(){void generation.retryPreparation();},
 async saveWallpaper(){
  if(!this.data.image||this.data.savingImage)return;
  this.setData({savingImage:true,saveError:''});
  try{
   if(wx.requirePrivacyAuthorize)await new Promise((resolve,reject)=>wx.requirePrivacyAuthorize({success:resolve,fail:reject}));
   await new Promise((resolve,reject)=>wx.saveImageToPhotosAlbum({filePath:this.data.image,success:resolve,fail:reject}));
   wx.showToast({title:'已保存到相册',icon:'success'});
  }catch(e){
   const message=String(e.errMsg||e.message||'保存接口未返回原因');
   this.setData({saveError:'未保存到相册：'+message});
   if(/privacy/i.test(message))wx.showToast({title:'隐私授权未完成，请重试',icon:'none'});
   else if(/auth deny|auth denied|authorize.*fail/i.test(message))wx.showModal({title:'需要相册保存权限',content:'请在设置中允许保存到相册，再点击“保存图片做壁纸”。',confirmText:'去设置',cancelText:'暂不',success:r=>{if(r.confirm)wx.openSetting({});}});
   else wx.showToast({title:/cancel/i.test(message)?'已取消保存':/privacy/i.test(message)?'隐私授权未完成，请重试':'图片暂未保存，请查看原因',icon:'none'});
  }finally{this.setData({savingImage:false});}
 },
 connectScreen(){wx.switchTab({url:'/pages/network/index'});}
});
