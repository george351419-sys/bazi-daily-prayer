function call(name,options){return new Promise((resolve,reject)=>wx[name](Object.assign({},options,{success:resolve,fail:e=>reject(new Error(e.errMsg||'照片处理未完成'))})));}
async function authorize(){if(wx.requirePrivacyAuthorize)await call('requirePrivacyAuthorize',{});}

async function processPhoto(page,input){
 const info=await call('getImageInfo',{src:input});
 const scale=Math.min(1,1440/Math.max(info.width,info.height)),width=Math.max(1,Math.round(info.width*scale)),height=Math.max(1,Math.round(info.height*scale));
 // 2D Canvas redraw removes the original EXIF and applies the decoded orientation.
 const canvas=await new Promise((resolve,reject)=>page.createSelectorQuery().select('#photo-canvas').fields({node:true,size:true}).exec(items=>items[0]&&items[0].node?resolve(items[0].node):reject(new Error('照片画布尚未准备好，请重试'))));
 canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,width,height);
 const image=canvas.createImage();
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('无法解码照片'));image.src=input;});
 context.drawImage(image,0,0,width,height);
 for(const quality of [.85,.7,.55,.4]){
  const exported=await call('canvasToTempFilePath',{canvas,x:0,y:0,width,height,destWidth:width,destHeight:height,fileType:'jpg',quality});
  const fs=wx.getFileSystemManager(),stat=await new Promise((resolve,reject)=>fs.getFileInfo({filePath:exported.tempFilePath,success:resolve,fail:reject}));
  if(stat.size<=768*1024){
   const base64=await new Promise((resolve,reject)=>fs.readFile({filePath:exported.tempFilePath,encoding:'base64',success:r=>resolve(r.data),fail:reject}));
   return {path:exported.tempFilePath,type:'image/jpeg',base64,width,height};
  }
 }
 throw new Error('照片仍超过 768 KB，请换一张较小的照片。');
}

async function preparePhotos(page,count=1){
 await authorize();
 const chosen=await call('chooseMedia',{count:Math.max(1,Math.min(9,Number(count)||1)),mediaType:['image'],sourceType:['album','camera'],sizeType:['original']});
 const photos=[];
 for(const file of chosen.tempFiles||[])photos.push(await processPhoto(page,file.tempFilePath));
 if(!photos.length)throw new Error('未选择照片');
 return photos;
}

async function preparePhoto(page){const photos=await preparePhotos(page,1);return photos[0];}
module.exports={preparePhoto,preparePhotos,authorize};
