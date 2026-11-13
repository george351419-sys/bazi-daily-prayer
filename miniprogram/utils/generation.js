const api=require('./api');
let task=null;
const listeners=new Set();
function publish(patch){task={...task,...patch};for(const fn of listeners)fn(task);}
function subscribe(fn){listeners.add(fn);if(task)fn(task);return ()=>listeners.delete(fn);}
function current(){return task&&task.userId===getApp().globalData.user?.id?task:null;}
// 生成新画期间：后端 plan/build/deviceReport 还是上一幅画的快照，完成态必须压住，
// 否则上一幅的"传输完成"会串台到正在生成的新画上（与网页端 prayer:generating 同款机制）。
function setGenerating(value){try{getApp().globalData.generating=!!value;}catch{}}
function profileKey(profile){const result={};for(const key of Object.keys(profile).sort())result[key]=key==='wishes'&&Array.isArray(profile[key])?[...new Set(profile[key])].sort():profile[key];return JSON.stringify(result);}
async function start(profile,{requestId=null,force=false}={}){
 const userId=getApp().globalData.user?.id;if(!userId)throw new Error('请先登录账户。');
 const key=profileKey(profile),date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 if(task?.userId===userId&&task.key===key&&task.date===date&&(task.running||(!force&&task.phase==='complete')))return;
 const previous=!force&&task?.userId===userId&&task.key===key&&task.date===date?task:null;
 task={userId,key,date,requestId,profile,running:true,phase:'analyzing',text:'正在整理祈愿与画风…',image:'',error:'',job:previous?.job||null};publish({});
 setGenerating(true);
 const runToken={};task.runToken=runToken;
 const own=()=>getApp().globalData.user?.id===userId&&task?.runToken===runToken;
 try{
  const saved=await api.request('/api/account/profile',profile);if(!own())return;getApp().globalData.profile=saved.profile;
  if(!task.job){const job=await api.request('/api/analyze',profile);if(!own())return;publish({job});}
  publish({phase:'drawing',text:'画面方案已保存，正在绘制今日造像…'});
  const record=await api.request('/api/jobs/'+task.job.id+'/image',{jobToken:task.job.token,prepareNext:true});if(!own())return;
  publish({phase:'complete',text:'今日造像已保存，正在载入画面。',record,job:null,preparing:true,requiresSwitch:null});
  setGenerating(false);
  // Start both immediately. Loading tomorrow must never delay showing today's picture.
  void api.image(record.image||('/api/account/artworks/'+record.id+'/image')).then(image=>{if(own())publish({image,text:'今日造像已完成。'});}).catch(()=>{if(own())publish({imageError:true,text:'今日造像已保存，图片暂未载入，请点击重新载入。'});});
  try{const result=await api.request('/api/account/ritual/prepare',{background:true});if(!own())return;if(result.status==='idle')throw new Error('后台任务尚未确认，请重试提交。');if(result.status==='photo'){publish({preparing:false,requiresSwitch:true,preparation:'画屏当前播放自定义照片。切换后才会同步这幅祈福图。'});}else{setPending(task);publish({preparing:false,requiresSwitch:false,preparation:'后台正在准备画屏内容。'});}}
  catch(e){if(own())publish({preparing:false,preparationError:e.message});}
 }catch(e){if(own())publish({phase:'failed',error:e.message,text:'本次生成暂未完成，请重试。'});}
 finally{if(own())publish({running:false});if(own())setGenerating(false);}
}
async function reloadImage(){const t=current();if(!t?.record)return;try{const image=await api.image(t.record.image||('/api/account/artworks/'+t.record.id+'/image'));if(task===t)publish({image,imageError:false,text:'今日造像已完成。'});}catch(e){if(task===t)publish({error:e.message});}}
function setPending(t){const record=t.record;getApp().globalData.pendingPrayerArtwork={userId:t.userId,id:record.id,date:record.date,image:record.image||('/api/account/artworks/'+record.id+'/image'),title:record.mapping?.title||''};}
async function activatePrayer(){const t=current();if(!t?.record||t.preparing)return false;publish({preparing:true,preparationError:''});try{const result=await api.request('/api/account/ritual/prepare',{background:true,activatePrayer:true,artworkId:t.record.id});if(task?.runToken!==t.runToken)return false;if(['photo','idle','superseded'].includes(result.status))throw new Error('切换尚未成功，请重试。');setPending(t);publish({requiresSwitch:false,preparation:'已确认切换为这幅祈福图，后台正在准备同步内容。'});return true;}catch(e){if(task?.runToken===t.runToken)publish({preparationError:e.message});return false;}finally{if(task?.runToken===t.runToken)publish({preparing:false});}}
async function refreshMode(){const t=current();if(t?.phase!=='complete'||t.preparing)return;try{const status=await api.request('/api/account/ritual');if(task?.runToken!==t.runToken)return;const pending=getApp().globalData.pendingPrayerArtwork;publish({requiresSwitch:status.plan?.contentMode==='photo'&&pending?.id!==t.record.id});}catch(e){if(task?.runToken===t.runToken)publish({preparationError:'暂未确认画屏模式，请稍后重试。'});return false;}}
async function retryPreparation(){const t=current();if(!t||t.preparing)return;if(t.requiresSwitch)return;publish({preparing:true,preparationError:''});try{await api.request('/api/jobs/'+t.record.id+'/image',{jobToken:t.record.token,prepareNext:true});if(task?.runToken!==t.runToken)return;const result=await api.request('/api/account/ritual/prepare',{background:true});if(task?.runToken!==t.runToken)return;if(result.status==='photo'){publish({requiresSwitch:true});return;}if(result.status==='idle')throw new Error('后台任务尚未确认，请重试提交。');setPending(t);publish({requiresSwitch:false,preparation:'两日内容计划已保存，后台继续准备画屏数据。'});}catch(e){if(task?.runToken===t.runToken)publish({preparationError:e.message});}finally{if(task?.runToken===t.runToken)publish({preparing:false});}}
module.exports={start,subscribe,current,reloadImage,retryPreparation,activatePrayer,refreshMode};
