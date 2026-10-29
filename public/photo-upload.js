// Decode locally and re-encode pixels, so EXIF/GPS metadata is not uploaded.
export async function preparePhoto(file){
 if(!file||!file.type.startsWith('image/'))throw new Error('请选择一张照片。');
 if(file.size>20*1024*1024)throw new Error('原照片请控制在 20 MB 内。');
 let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('无法读取这张照片，请改用 JPEG、PNG 或 WebP 格式。');}
 try{
  const scale=Math.min(1,1440/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let blob;
  for(const quality of [.86,.7,.52,.35]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=768*1024)break;}
  if(!blob||blob.size>768*1024)throw new Error('这张照片压缩后仍较大，请换一张较小的图片。');
  const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let p=0;p<bytes.length;p+=8192)text+=String.fromCharCode(...bytes.subarray(p,p+8192));
  return {blob,base64:btoa(text),type:'image/jpeg',width:canvas.width,height:canvas.height};
 }finally{bitmap.close();}
}
