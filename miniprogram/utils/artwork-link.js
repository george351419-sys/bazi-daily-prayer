const api=require('./api');
async function openArtworkExplanation(page,copyOnly=false){
 if(page.data.openingExplanation)return;
 const id=page.data.artworkId;if(!/^[a-f0-9]{36}$/.test(id||'')){api.error(page,new Error('请先载入这幅画，再查看说明。'));return;}
 page.setData({openingExplanation:true,error:''});
 try{const link=await api.request('/api/account/artworks/'+id+'/view-link',{});if(!/^https:\/\/playmath\.cn\/artwork\.html#view=[a-f0-9]{64}$/.test(link.url))throw Error('画作说明链接无效，请重试。');if(copyOnly){wx.setClipboardData({data:link.url,success:()=>wx.showModal({title:'链接已复制',content:'请在浏览器中粘贴打开。此链接仅能查看这幅作品，10分钟后失效，请勿转发。',showCancel:false})});}else{getApp().globalData.artworkWebLink=link.url;wx.navigateTo({url:'/pages/artwork-web/index'});}}
 catch(e){api.error(page,e);}finally{page.setData({openingExplanation:false});}
}
module.exports={openArtworkExplanation,copyArtworkExplanation:page=>openArtworkExplanation(page,true)};
