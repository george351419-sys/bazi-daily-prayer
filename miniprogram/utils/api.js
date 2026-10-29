const BASE='https://playmath.cn';
const KEY='prayer-mini-auth-v1';
let bootstrap=null,booting=null,epoch=0;
function raw(path,method,data,extra){return new Promise((resolve,reject)=>{wx.request({url:BASE+path,method,data,header:Object.assign({'Content-Type':'application/json'},extra),timeout:120000,success:resolve,fail:()=>reject(new Error('网络连接未完成，请稍后重试。'))});});}
function authHeaders(){const cookie=wx.getStorageSync(KEY)||'';return cookie?{Cookie:cookie}:{};}
async function init(){if(bootstrap)return bootstrap;if(booting)return booting;const run=epoch;booting=raw('/api/bootstrap','GET',null,{}).then(r=>{if(r.statusCode!==200)throw new Error('服务暂不可用。');if(run===epoch)bootstrap=r.data;return r.data;}).finally(()=>{if(run===epoch)booting=null;});return booting;}
function capture(response){const values=response.cookies||[];const h=response.header||{};for(const key of Object.keys(h))if(key.toLowerCase()==='set-cookie')values.push(h[key]);for(const value of values){const match=String(value).match(/(?:^|[,;]\s*)((?:__Host-)?prayer_auth)=([a-f0-9]{64})(?:;|$)/);if(match)wx.setStorageSync(KEY,match[1]+'='+match[2]);}}
async function request(path,body){const run=epoch,b=await init();if(body!==undefined&&!(b.miniProgram&&b.miniProgram.enabled))throw new Error('小程序尚未配置正式 AppID，账户写入暂未开放；请先在网页使用。');const r=await raw(path,body===undefined?'GET':'POST',body,Object.assign(authHeaders(),{'X-Session-Token':b.sessionToken,'X-CSRF-Token':b.csrf}));if(run!==epoch)throw new Error('账户已切换，请重试。');if(r.statusCode<200||r.statusCode>=300){if(r.statusCode===401){wx.removeStorageSync(KEY);const app=getApp();app.globalData.user=null;app.globalData.profile=null;}throw new Error((r.data&&r.data.error)||'服务暂未完成，请稍后重试。');}capture(r);return r.data;}
async function image(path){if(!/^\/api\/account\/artworks\/[a-f0-9]{36}\/image$/.test(path))throw new Error('图片路径无效');const b=await init();return new Promise((resolve,reject)=>{wx.downloadFile({url:BASE+path,header:Object.assign(authHeaders(),{'X-Session-Token':b.sessionToken}),success:r=>r.statusCode===200?resolve(r.tempFilePath):reject(new Error('照片暂时无法载入')),fail:()=>reject(new Error('图片下载未完成'))});});}
function clear(){epoch++;bootstrap=null;booting=null;wx.removeStorageSync(KEY);}
function goLogin(){wx.switchTab({url:'/pages/mine/index'});}
function tab(page,index){if(page.getTabBar&&page.getTabBar())page.getTabBar().setData({selected:index});}
function error(page,e){page.setData({error:e.message||'操作未完成，请重试。'});}
module.exports={request,image,init,clear,goLogin,tab,error,BASE};
