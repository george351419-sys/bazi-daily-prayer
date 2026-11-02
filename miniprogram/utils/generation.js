const api=require('./api');
let task=null;
const listeners=new Set();
function publish(patch){task={...task,...patch};for(const fn of listeners)fn(task);}
function subscribe(fn){listeners.add(fn);if(task)fn(task);return ()=>listeners.delete(fn);}
function current(){return task&&task.userId===getApp().globalData.user?.id?task:null;}
async function start(profile){
 const userId=getApp().globalData.user?.id;if(!userId)throw new Error('请先登录账户。');
 const key=JSON.stringify(profile);
 if(task?.userId===userId&&task.key===key&&(task.running||task.phase==='complete'))return;
 const previous=task?.userId===userId&&task.key===key?task:null;
 task={userId,key,profile,running:true,phase:'analyzing',text:'正在核对生辰、读懂心愿…',image:'',error:'',job:previous?.job||null};publish({});
 const own=()=>getApp().globalData.user?.id===userId&&task?.key===key&&task?.userId===userId;
 try{
  const saved=await api.request('/api/account/profile',profile);if(!own())return;getApp().globalData.profile=saved.profile;
  if(!task.job){const job=await api.request('/api/analyze',profile);if(!own())return;publish({job});}
  publish({phase:'drawing',text:'解读已归档，正在绘制今日造像…'});
  const record=await api.request('/api/jobs/'+task.job.id+'/image',{jobToken:task.job.token,prepareNext:true});if(!own())return;
  publish({phase:'complete',text:'今日造像已保存，正在载入画面。',record,job:null,preparing:true});
  // Start both immediately. Loading tomorrow must never delay showing today's picture.
  void api.image(record.image||('/api/account/artworks/'+record.id+'/image')).then(image=>{if(own())publish({image,text:'今日造像已完成。'});}).catch(()=>{if(own())publish({imageError:true,text:'今日造像已保存，图片暂未载入，请点击重新载入。'});});
  try{const result=await api.request('/api/account/ritual/prepare',{background:true});if(result.status==='idle')throw new Error('后台任务尚未确认，请重试提交。');if(own())publish({preparing:false,preparation:result.status==='photo'?'画屏当前保留自定义作品轮播。':'后台任务已保存，正在准备明日画作、两天微行动与画屏数据。'});}
  catch(e){if(own())publish({preparing:false,preparationError:e.message});}
 }catch(e){if(own())publish({phase:'failed',error:e.message,text:'本次生成暂未完成，请重试。'});}
 finally{if(own())publish({running:false});}
}
async function reloadImage(){const t=current();if(!t?.record)return;try{const image=await api.image(t.record.image||('/api/account/artworks/'+t.record.id+'/image'));if(task===t)publish({image,imageError:false,text:'今日造像已完成。'});}catch(e){if(task===t)publish({error:e.message});}}
async function retryPreparation(){const t=current();if(!t||t.preparing)return;publish({preparing:true,preparationError:''});try{await api.request('/api/jobs/'+t.record.id+'/image',{jobToken:t.record.token,prepareNext:true});if(task?.key===t.key)publish({preparation:'两日内容计划已保存，后台继续准备画屏数据。'});}catch(e){if(task?.key===t.key)publish({preparationError:e.message});}finally{if(task?.key===t.key)publish({preparing:false});}}
module.exports={start,subscribe,current,reloadImage,retryPreparation};
