export function setupDevices({request,fetchImage,getUser}){
 const root=document.querySelector('#device-section');
 const list=document.querySelector('#device-list');
 const state=document.querySelector('#device-state');
 const form=document.querySelector('#device-claim-form');
 const more=document.querySelector('#device-more-artworks');
 const policyForm=document.querySelector('#daily-policy-form'),policyState=document.querySelector('#daily-policy-state'),jobList=document.querySelector('#daily-job-list');
 let policy=null,policyBusy=false,existingPlaylist=null;
 let enabled=false,epoch=0,lifecycle=0,devices=[],cursor=null,catalogLoaded=false,urls=[];
 const artworks=new Map(),choices=new Map(),pending=new Map(),busy=new Set();
 const stageLabel={empty:'选择一幅画开始',pending:'等待下次同步',downloaded:'已下载，等待保存',stored:'已保存，等待显示确认',displayed:'已确认完成'};
 const current=()=>({userId:getUser()?.id,lifecycle});
 const valid=context=>context.userId===getUser()?.id&&context.lifecycle===lifecycle;
 function releasePreviews(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
 function reset(){policy=null;existingPlaylist=null;policyForm.reset();policyState.textContent='';jobList.replaceChildren();epoch++;lifecycle++;releasePreviews();list.replaceChildren();state.textContent='';form.reset();devices=[];cursor=null;catalogLoaded=false;artworks.clear();choices.clear();pending.clear();busy.clear();more.hidden=true;root.hidden=!enabled||!getUser();}
 function titleFor(id,date){return artworks.get(id)?.title||(date?date+' 的画作':'尚未确认');}
 function render(){
  releasePreviews();list.replaceChildren();
  const context=current();
  for(const device of devices){
   const card=document.createElement('article');card.className='device-card';
   const title=document.createElement('strong');title.textContent=device.name;
   const badge=document.createElement('span');badge.className='device-badge';badge.textContent=device.kind==='simulator'?'模拟画屏':device.kind==='ark'?'Ark 画屏':'画屏';
   const progress=document.createElement('p');progress.className='device-progress';progress.textContent=device.kind==='simulator'&&device.stage==='displayed'?'模拟器已完成同步流程':stageLabel[device.stage]||'状态待确认';
   const target=document.createElement('p');target.textContent='目标画面：'+(device.artworkId?titleFor(device.artworkId,device.contentDate):'尚未选择');
   const reported=document.createElement('p');reported.textContent=(device.kind==='simulator'?'最近模拟完成：':'最近确认显示：')+(device.confirmedDisplay?titleFor(device.confirmedDisplay.artworkId,device.confirmedDisplay.contentDate):'尚未收到完成回执');
   if(device.confirmedDisplay&&device.confirmedDisplay.revision!==device.desiredRevision)reported.className='device-previous';
   const sync=document.createElement('small');sync.textContent=device.lastSyncAt?'最近联网：'+new Date(device.lastSyncAt*1000).toLocaleString('zh-CN'):'等待首次联网';
   card.append(title,badge,progress,target,reported,sync);
   if(device.desiredRevision){
    const figure=document.createElement('figure');figure.className='device-preview';
    const caption=document.createElement('figcaption');caption.textContent='目标画面六色预览 · 实屏效果待验收';figure.append(caption);card.append(figure);
    void fetchImage('/api/account/devices/'+device.id+'/preview?revision='+device.desiredRevision).then(url=>{
     if(!valid(context)||!card.isConnected){URL.revokeObjectURL(url);return;}
     urls.push(url);const image=document.createElement('img');image.src=url;image.alt='目标画面的六色转换预览';figure.prepend(image);
    }).catch(()=>{if(valid(context)&&card.isConnected)caption.textContent='预览暂未载入，可刷新状态重试。';});
   }
   const label=document.createElement('label');label.textContent='换一幅画';
   const select=document.createElement('select');select.setAttribute('aria-label',device.name+'的画作');
   const selected=choices.get(device.id)||device.artworkId;
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='从已完成的画册作品中选择';select.append(placeholder);
   for(const artwork of [...artworks.values()].sort((a,b)=>a.id.localeCompare(b.id)))if(artwork.status==='complete'){
    const option=document.createElement('option');option.value=artwork.id;option.textContent=artwork.date+' · '+artwork.title;select.append(option);
   }
   if(selected&&!Array.from(select.options).some(o=>o.value===selected)){
    const option=document.createElement('option');option.value=selected;option.textContent='当前选择 · '+titleFor(selected,device.contentDate);select.append(option);
   }
   select.value=selected||'';label.append(select);
   const send=document.createElement('button');send.type='button';send.className='secondary';
   const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='停用并解除绑定';
   function controls(){const working=busy.has(device.id);send.disabled=working||!select.value;select.disabled=working;remove.disabled=working;send.textContent=working?'正在准备…':'更新画屏';}
   select.onchange=()=>{choices.set(device.id,select.value);controls();};controls();
   send.onclick=async()=>{
    if(busy.has(device.id)||!select.value)return;
    const artworkId=select.value;let command=pending.get(device.id);
    if(!command||command.artworkId!==artworkId){command={artworkId,expectedRevision:device.desiredRevision,requestId:crypto.randomUUID().replaceAll('-','')};pending.set(device.id,command);}
    busy.add(device.id);controls();state.textContent='正在准备屏幕画面…';let notice;
    try{
     const result=await request('/api/account/devices/'+device.id+'/artwork',command);
     if(!valid(context))return;
     pending.delete(device.id);choices.delete(device.id);
     notice=result.reused?'这幅画已是当前目标，无需重复生成或刷新。':result.replayed?'此前操作已确认，列表显示当前目标。':'画面已准备好，将在下次联网同步时领取。';
    }catch(e){
     if(!valid(context))return;
     if(e.code==='revision_conflict'){pending.delete(device.id);choices.delete(device.id);notice='画面已在其他页面更新，已刷新状态，请重新选择。';}
     else notice=e.message;
    }finally{if(valid(context)){busy.delete(device.id);await refresh();if(valid(context))state.textContent=notice||'请查看当前同步状态。';}}
   };
   remove.onclick=async()=>{
    if(busy.has(device.id)||!window.confirm('此操作会停用设备凭据并清除服务端的设备画面，重新使用需重新初始化。已下载到离线设备的内容不会立即擦除。继续吗？'))return;
    busy.add(device.id);controls();let notice;
    try{await request('/api/account/devices/'+device.id+'/unbind',{});notice='设备已停用，旧凭据已失效。';}
    catch(e){notice=e.message;}
    finally{if(valid(context)){busy.delete(device.id);await refresh();if(valid(context))state.textContent=notice;}}
   };
   const details=document.createElement('details');details.className='device-technical';const summary=document.createElement('summary');summary.textContent='设备信息';const text=document.createElement('p');text.textContent=device.id+' · 目标版本 '+device.desiredRevision+(device.confirmedDisplay?' · 确认版本 '+device.confirmedDisplay.revision:'');details.append(summary,text);
   if(existingPlaylist){const note=document.createElement('p');note.textContent='已有画作按日轮换中，无需手动更新。';card.append(note,remove,details);}else card.append(label,send,remove,details);list.append(card);
  }
  more.hidden=!cursor;
 }
 async function refresh(){
  const turn=++epoch,context=current();root.hidden=!enabled||!context.userId;if(root.hidden)return;
  state.textContent='正在载入设备…';
  try{
   const [result,page,daily]=await Promise.all([request('/api/account/devices'),request('/api/account/artworks'),request('/api/account/automation')]);
   if(turn!==epoch||!valid(context))return;
   existingPlaylist=result.existingPlaylist||null;policy=daily;renderPolicy();devices=result.items;for(const record of page.items)artworks.set(record.id,record);
   if(!catalogLoaded){cursor=page.cursor||null;catalogLoaded=true;}
   render();state.textContent=devices.length?'画面在下一次联网时同步；休眠或断网时保留原画面。':'尚未绑定设备。';
  }catch(e){if(turn===epoch&&valid(context))state.textContent=e.message;}
 }

 function renderPolicy(){
  if(!policy)return;
  for(const control of policyForm.elements)control.disabled=!!existingPlaylist;
  if(existingPlaylist){policyState.textContent=(existingPlaylist.testIntervalMinutes?'已有画作测试：目标每 '+existingPlaylist.testIntervalMinutes+' 分钟切换下一幅；需固件支持，联网和刷屏会增加实际间隔。':'已有画作：每天北京时间 '+existingPlaylist.dailyAt+' 轮换下一幅。')+'共 '+existingPlaylist.imageCount+' 幅循环播放，不调用分析或生图模型。正式每日时间为 '+existingPlaylist.dailyAt+'。';jobList.replaceChildren();return;}
  policyForm.elements.mode.value=policy.mode;policyForm.elements.updateTime.value=policy.updateTime;
  const modes={fixed:'当前保持固定画面',daily:'每日自动更新已设置',paused:'自动更新已暂停'};
  policyState.textContent=(policy.profileSavePending?'出生资料保存尚未完成，请重新保存后启用每日更新。':'')+(policy.workerOnline?'后台更新服务在线。':'后台更新服务尚未就绪，自动任务将等待服务恢复。')+modes[policy.mode]+(policy.pendingToday?'；今日更新等待后台处理':'')+(policy.nextRunAt?'；下一次常规更新时间：'+new Date(policy.nextRunAt*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'')+'。今日生图调用已预留 '+policy.imageCallsToday+' / '+policy.dailyImageLimit+' 次。';
  const statuses={ready:'等待后台处理',running:'后台处理中',complete:'作品已发布，等待画屏联网领取',cancelled:'旧任务已取消',failed:'重试次数已用完',uncertain:'生图结果待核查，已停止自动重试',quota:'已达到生成额度'};
  const stages={queued:'分析',mapped:'绘图',image_ready:'归档',archived:'发布',complete:'完成'};
  jobList.replaceChildren();
  for(const job of policy.jobs.slice(0,3)){const line=document.createElement('p');line.className='field-hint';line.textContent=job.contentDate+' · '+(statuses[job.status]||'待确认')+' · '+(stages[job.stage]||'')+(job.imageReusedFrom&&['image_ready','archived','complete'].includes(job.stage)?' · 已复用历史图片':'');jobList.append(line);
   if(job.canRetry){
    const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent='重试归档与发布';
    retry.onclick=async()=>{const context=current();retry.disabled=true;try{await request('/api/account/automation/retry',{jobId:job.id,expectedVersion:policy.version});if(valid(context))await refresh();}catch(e){if(valid(context))policyState.textContent=e.message;}finally{retry.disabled=false;}};
    jobList.append(retry);
   }
  }
 }
 policyForm.onsubmit=async event=>{
  event.preventDefault();if(!policy||policyBusy)return;
  const context=current(),button=policyForm.querySelector('button[type=submit]');policyBusy=true;button.disabled=true;
  try{const settings=Object.fromEntries(new FormData(policyForm));await request('/api/account/automation',{...settings,expectedVersion:policy.version});if(valid(context))await refresh();}
  catch(e){if(valid(context)){if(['policy_conflict','profile_conflict'].includes(e.code))await refresh();policyState.textContent=e.message;}}
  finally{policyBusy=false;button.disabled=false;}
 };
 more.onclick=async()=>{
  if(!cursor)return;const context=current(),at=cursor;more.disabled=true;
  try{const page=await request('/api/account/artworks?cursor='+encodeURIComponent(at));if(!valid(context)||cursor!==at)return;for(const record of page.items)artworks.set(record.id,record);cursor=page.cursor||null;render();}
  catch(e){if(valid(context))state.textContent=e.message;}
  finally{more.disabled=false;}
 };
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button[type=submit]'),context=current();button.disabled=true;state.textContent='正在核验设备…';
  try{await request('/api/account/devices/claim',Object.fromEntries(new FormData(form)));if(!valid(context))return;form.reset();await refresh();}
  catch(e){if(valid(context))state.textContent=e.message;}
  finally{button.disabled=false;}
 };
 document.querySelector('#device-refresh').onclick=()=>refresh();
 return {initialize(bootstrap){enabled=!!bootstrap.devices?.enabled;reset();},reset,refresh};
}
