import {AccountError,getArtwork,privateImage} from './accounts.mjs';

export const devicesEnabled=c=>!!c.DEVICE_SERVICE_URL&&typeof c.DEVICE_SERVICE_KEY==='string'&&c.DEVICE_SERVICE_KEY.length>=32;
function serviceOrigin(c){
 if(!devicesEnabled(c))throw new AccountError(503,'设备服务尚未开启。');
 let url;try{url=new URL(c.DEVICE_SERVICE_URL);}catch{throw new AccountError(503,'设备服务配置无效。');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new AccountError(503,'设备服务需要 HTTPS 或本机地址。');
 return url.origin;
}
export async function deviceServiceCall(c,path,body,fetcher=fetch,binary=false){
 const origin=serviceOrigin(c);
 let response;
 try{response=await fetcher(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.DEVICE_SERVICE_KEY,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(75000)});}catch{throw new AccountError(503,'设备服务暂时无法连接，请稍后重试。');}
 if(binary&&response.ok){
  if(response.headers.get('content-type')?.split(';')[0]!=='image/png')throw new AccountError(502,'画屏预览响应异常。');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw new AccountError(502,'画屏预览大小异常。');}chunks.push(Buffer.from(value));}}catch(e){if(e instanceof AccountError)throw e;throw new AccountError(502,'画屏预览读取失败。');}
  const bytes=Buffer.concat(chunks);if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new AccountError(502,'画屏预览格式异常。');
  return bytes;
 }
 let data;try{data=await response.json();}catch{throw new AccountError(502,'设备服务响应异常。');}
 if(!response.ok){
  const status=[400,403,404,409,413,429].includes(response.status)?response.status:503;
  const messages={400:'设备信息或图片格式无效。',403:'绑定码无效，请检查设备信息。',404:'找不到这台设备。',409:'设备已绑定，或请求与当前设备状态不符。',413:'图片大小超出设备处理限制。',429:'设备服务繁忙，请稍后重试。'};
  const error=new AccountError(status,messages[status]||'设备服务暂时不可用。');
  if(status===409&&['revision_conflict','policy_conflict','lease_conflict','profile_conflict'].includes(data.code)){error.message=data.code==='profile_conflict'?'出生资料或愿望正在保存或已变化，请重新保存后启用每日更新。':'设备画面或更新设置已变化，请刷新后重试。';error.code=data.code;}
  throw error;
 }
 return data;
}
export async function listDevices(c,account,fetcher){
 const result=await deviceServiceCall(c,'/internal/devices?ownerId='+encodeURIComponent(account.id),undefined,fetcher);
 if(!Array.isArray(result?.items))throw new AccountError(502,'设备列表响应异常。');
 if(c.ARK_EXISTING_PLAYLIST==='1')result.existingPlaylist={dailyAt:c.ARK_PLAYLIST_DAILY_AT||'01:00',timeZone:'Asia/Shanghai',imageCount:3,testIntervalMinutes:Number(c.ARK_PLAYLIST_TEST_MINUTES)||null};
 return result;
}
export async function claimDevice(c,account,body,fetcher){
 if(!/^[a-zA-Z0-9_-]{8,64}$/.test(body.deviceId||'')||!/^[a-f0-9]{32}$/.test(body.claimCode||'')||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40)throw new AccountError(400,'请填写设备编号、32位绑定码和设备名称。');
 return deviceServiceCall(c,'/internal/claim',{ownerId:account.id,deviceId:body.deviceId,claimCode:body.claimCode,name:body.name.trim()},fetcher);
}
export async function selectDeviceArtwork(c,account,deviceId,body,fetcher){
 if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.requestId!=='string'||!/^[a-f0-9]{32}$/.test(body.requestId))throw new AccountError(400,'请刷新设备列表后重新选择画作。');
 const {items}=await listDevices(c,account,fetcher);
 if(!items.some(d=>d.id===deviceId))throw new AccountError(404,'找不到这台设备。');
 const record=await getArtwork(c,account,body.artworkId);
 if(record.status!=='complete'||!record.image)throw new AccountError(409,'请先完成这幅画的绘制与归档。');
 const image=await privateImage(c,account,record);
 return deviceServiceCall(c,'/internal/select',{ownerId:account.id,deviceId,artworkId:record.id,contentDate:record.date,imageBase64:image.bytes.toString('base64'),expectedRevision:body.expectedRevision,requestId:body.requestId},fetcher);
}
export async function devicePreview(c,account,deviceId,revision,fetcher){
 if(typeof revision!=='string'||!/^\d{1,10}$/.test(revision)||Number(revision)<1)throw new AccountError(400,'预览版本无效。');
 return deviceServiceCall(c,'/internal/devices/'+encodeURIComponent(deviceId)+'/preview?ownerId='+encodeURIComponent(account.id)+'&revision='+revision,undefined,fetcher,true);
}
export const unbindDevice=(c,account,deviceId,fetcher)=>deviceServiceCall(c,'/internal/unbind',{ownerId:account.id,deviceId},fetcher);
