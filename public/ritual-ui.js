import {transferStatus,renderTransfer} from './transfer-status.js?v=20261030-followup-v1';
import {renderConsumerReading} from './reading-view.js';
import {preparePhoto} from './photo-upload.js';
export function setupRitual({request,fetchImage,getUser}){
 const host=document.createElement('section');host.className='ritual-section';host.hidden=true;
 const destination=document.querySelector('#ritual-home-content');
 if(destination)destination.append(host);else document.querySelector('#artwork-grid').before(host);
 const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const numberSets={水:[1,6],火:[2,7],木:[3,8],金:[4,9],土:[5,10]};
 function personalizeActions(actions,mapping,dayIndex){
  const element=dayIndex?mapping?.secondary_element||mapping?.primary_element:mapping?.primary_element;
  const numbers=numberSets[element]||[];if(!numbers.length)return actions;
  return actions.map((action,index)=>{
   const number=numbers[index%numbers.length];let text=action.text;
   for(const [pattern,unit] of [[/几次/g,'次'],[/几轮/g,'轮'],[/几回/g,'回'],[/几下/g,'下'],[/几步/g,'步'],[/几个/g,'个'],[/片刻/g,'秒']])text=text.replace(pattern,number+unit);
   return {...action,text,detail:String(action.detail||'').replace('当前未确认喜用数字，不套用命理次数。','本次按'+element+'的河图数取'+number+'，仅作传统数字取象；动作以舒适为准。'),number_basis:{system:'河图生成数',element,number}};
  });
 }
 let transferPending=false,active=false,epoch=0,lifecycle=0,timer=null,url=null,imagePath=null,artworks=null,dirty=false,saving=false,uploading=false,preparing=false,draftURL=null,cursor=null,failures=0,shell=null,renderedKey=null,searchTurn=0,searchTimer=null,latestGenerated=null;
 function pause(){active=false;epoch++;clearTimeout(timer);timer=null;}
 function reset(){pause();lifecycle++;searchTurn++;clearTimeout(searchTimer);if(url)URL.revokeObjectURL(url);if(draftURL)URL.revokeObjectURL(draftURL);draftURL=null;url=null;imagePath=null;artworks=null;cursor=null;dirty=false;saving=false;uploading=false;preparing=false;failures=0;shell?.settings.remove();shell=null;renderedKey=null;latestGenerated=null;host.replaceChildren();host.hidden=true;const transfer=document.querySelector('#artwork-transfer');if(transfer){transfer.replaceChildren();transfer.hidden=true;}}
 function alive(life){return life===lifecycle&&!!getUser();}
 function schedule(result){if(!active)return;clearTimeout(timer);const next=Date.parse(result?.scheduledPosition?.nextAt||result?.position?.nextAt);timer=setTimeout(refresh,Number.isFinite(next)?Math.max(1000,Math.min(latestGenerated&&transferPending?5000:30000,next-Date.now()+200)):(latestGenerated&&transferPending?5000:30000));}
 function ensureShell(){
  if(shell)return;
  const transfer=node('div');transfer.setAttribute('role','status');transfer.setAttribute('aria-live','polite');
  const title=node('h4','一日祈愿 · 此刻行动'),status=node('p'),report=node('p'),current=node('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const shortcuts=node('nav');shortcuts.className='ritual-shortcuts';shortcuts.setAttribute('aria-label','画屏功能');
  const settings=node('details');settings.id='ritual-settings';settings.append(node('summary','选择画屏模式 · 上传我的照片'));const form=node('form');form.className='ritual-form';
  const choicesBox=node('div');choicesBox.className='ritual-choices';form.append(choicesBox);
  const contentLabel=node('label','画屏呈现方式'),contentMode=node('select');contentMode.setAttribute('aria-label','画屏呈现方式');
  for(const [value,text] of [['prayer','祈福图'],['photo','自己的照片']]){const option=node('option',text);option.value=value;contentMode.append(option);}contentLabel.append(contentMode);choicesBox.append(contentLabel);
  const actionLabel=node('label');actionLabel.className='photo-action-toggle';const showActions=node('input');showActions.type='checkbox';showActions.checked=true;actionLabel.append(showActions,document.createTextNode('在画面下方显示微行动建议（可选）'));choicesBox.append(actionLabel);
  const labels=[],selects=[0,1].map((_,i)=>{const dayName=i===0?'今日':'明日';const label=node('label'),caption=node('span'),select=node('select');select.setAttribute('aria-label',dayName+'画面');select.required=true;label.append(caption,select);labels.push(caption);choicesBox.append(label);return select;});
  const uploadBox=node('div');uploadBox.className='photo-upload';const fileLabel=node('label','选择自己的照片'),file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.setAttribute('aria-label','选择自己的照片');fileLabel.append(file);const photoLabel=node('label','照片名称'),photoTitle=node('input');photoTitle.maxLength=60;photoTitle.placeholder='例如：一家人的周末';photoLabel.append(photoTitle);const upload=node('button','上传到账户');upload.type='button';upload.className='secondary';const uploadState=node('p'),draft=node('img');draft.hidden=true;draft.className='photo-draft';draft.alt='上传照片预览';uploadState.setAttribute('role','status');uploadBox.append(fileLabel,photoLabel,upload,draft,uploadState,node('small','上传时保留完整构图，并移除照片位置信息。六色墨水屏会与原照片存在色彩差异。'));form.append(uploadBox);
  const more=node('button','载入更多画作与照片');more.type='button';more.className='text-button';more.hidden=true;form.append(more);
  const mode=node('select');mode.setAttribute('aria-label','播放方式');for(const [value,text] of [['daily','日常：01:00 换画，每两小时换动作'],['test','测试：每 2 分钟换动作，两天循环']]){const option=node('option',text);option.value=value;mode.append(option);}
  const settingsState=node('p');settingsState.setAttribute('role','status');settingsState.setAttribute('aria-live','polite');
  const submit=node('button','保存并同步到画屏');submit.type='submit';submit.className='primary';const deliveryNote=node('small','设备下次联网时领取新内容；网页保存成功不代表设备已完成显示。');form.append(mode,submit,deliveryNote,settingsState);settings.append(form);
  function populate(result){
   const photo=contentMode.value==='photo';form.classList.toggle('photo-settings',photo);uploadBox.hidden=!photo;
   const choices=new Map((artworks||[]).filter(a=>a.status==='complete').map(a=>[a.id,a]));
   for(const a of result?.plannedDays||[])choices.set(a.artworkId,{id:a.artworkId,...a});
   for(const [i,select] of selects.entries()){
    const previous=select.value;labels[i].textContent=(i===0?'今日':'明日')+(photo?'照片':'祈福画面');select.replaceChildren();
    for(const a of choices.values())if((a.source==='upload')===photo){const option=node('option',a.date+' · '+a.title);option.value=a.id;select.append(option);}
    const requested=result?.plan?.artworkIds[i];if(requested&&[...select.options].some(o=>o.value===requested))select.value=requested;else if(previous&&[...select.options].some(o=>o.value===previous))select.value=previous;else if(!photo&&i&&select.options.length>1)select.selectedIndex=1;
   }
   more.hidden=!cursor;
  }
  contentMode.onchange=()=>{dirty=true;populate();};
  more.onclick=async()=>{const life=lifecycle;if(!cursor)return;more.disabled=true;try{const page=await request('/api/account/artworks?cursor='+encodeURIComponent(cursor));if(!alive(life))return;artworks.push(...page.items);cursor=page.cursor||null;populate();}catch(e){if(alive(life))status.textContent=e.message;}finally{if(alive(life))more.disabled=false;}};
  upload.onclick=async()=>{
   if(uploading||saving)return;const life=lifecycle,selectedFile=file.files[0],selectedTitle=photoTitle.value||selectedFile?.name.replace(/\.[^.]+$/,'');uploading=true;for(const control of form.elements)control.disabled=true;uploadState.textContent='正在压缩照片…';
   try{
    const prepared=await preparePhoto(selectedFile);if(!alive(life))return;
    uploadState.textContent='正在上传到账户…';const result=await request('/api/account/photos',{type:prepared.type,base64:prepared.base64,title:selectedTitle});if(!alive(life))return;
    if(draftURL)URL.revokeObjectURL(draftURL);draftURL=URL.createObjectURL(prepared.blob);draft.src=draftURL;draft.hidden=false;
    artworks=[result.item,...(artworks||[])];dirty=true;populate();selects.forEach(select=>{select.value=result.item.id;});file.value='';uploadState.textContent='照片已保存。两天可以使用同一张照片；点击「保存并同步到画屏」应用。';
   }catch(error){if(alive(life))uploadState.textContent=error.message;}
   finally{if(alive(life)){uploading=false;for(const control of form.elements)control.disabled=false;if(active)schedule();}}
  };
  form.addEventListener('change',()=>{dirty=true;});
  form.onsubmit=async event=>{
   event.preventDefault();if(saving||uploading)return;const life=lifecycle;saving=true;clearTimeout(timer);for(const control of form.elements)control.disabled=true;
   try{await request('/api/account/ritual',{contentMode:contentMode.value,showActions:showActions.checked,mode:mode.value,artworkIds:selects.map(s=>s.value)});if(alive(life)){dirty=false;saving=false;if(active)await refresh();}}
   catch(error){if(alive(life)){status.textContent=error.message;settingsState.textContent=error.message;schedule();}}
   finally{if(alive(life)){saving=false;for(const control of form.elements)control.disabled=false;}}
  };
  const actions=node('section');actions.id='ritual-actions';actions.className='ritual-actions';actions.append(node('h5','八个时辰的微行动与解读'));const actionList=node('div');actionList.className='ritual-action-list';actions.append(actionList);
  const book=node('section');book.id='ritual-answers';book.append(node('h5','答案之书 · 搜索回答与解读'));const search=node('input');search.type='search';search.maxLength=120;search.placeholder='输入关键词或编号，例如事业、OB001';search.setAttribute('aria-label','搜索答案之书');
  const count=node('p','输入关键词后查看回答。'),list=node('div');count.setAttribute('role','status');
  async function find(){
   const q=search.value.normalize('NFKC').trim();const turn=++searchTurn;clearTimeout(searchTimer);list.replaceChildren();
   if(!q){count.textContent='输入关键词后查看回答。';return;}
   count.textContent='正在搜索…';
   searchTimer=setTimeout(async()=>{
    try{const data=await request('/api/account/answers?q='+encodeURIComponent(q));if(turn!==searchTurn||!alive(lifecycle))return;
     const items=data.items||[];let index=0;count.textContent=items.length?`找到 ${items.length} 条，逐条查看。`:'没有找到相关回答。';
     function show(){const a=items[index];list.replaceChildren();if(!a)return;const card=node('article');card.className='ritual-answer-card';card.append(node('small',a.id+' · '+a.theme+' · '+a.tendency),node('h5',a.text),node('p',a.phone_detail));list.append(card);if(items.length>1){const pager=node('div');pager.className='ritual-answer-pager';const previous=node('button','上一条'),next=node('button','下一条');previous.type=next.type='button';previous.disabled=index===0;next.disabled=index===items.length-1;previous.onclick=()=>{index--;show();};next.onclick=()=>{index++;show();};pager.append(previous,node('span',`${index+1} / ${items.length}`),next);list.append(pager);}}
     show();
    }catch(error){if(turn===searchTurn&&alive(lifecycle))count.textContent=error.message;}
   },250);
  }
  search.oninput=find;book.append(search,count,list);
  for(const [label,target] of [['查看八时辰建议',actions],['搜索答案之书',book],['上传照片 · 选择模式',settings]]){const button=node('button',label);button.type='button';button.className='secondary';button.onclick=()=>{if(target.tagName==='DETAILS')target.open=true;if(target===settings)location.hash='custom';target.scrollIntoView({behavior:'smooth',block:'start'});if(target===book)search.focus();};shortcuts.append(button);}
  host.append(title,transfer,status,report,shortcuts,current,actions,book);
  const custom=document.querySelector('#custom-content');if(custom){settings.open=true;custom.append(settings);}else host.append(settings);
  shell={transfer,status,settingsState,report,current,settings,form,deliveryNote,selects,mode,submit,contentMode,showActions,populate,book,search,count,find,actionList};
 }
 function updateSettings(result){
  if(dirty||saving)return;
  for(const a of result.plannedDays||[])if(artworks&&!artworks.some(item=>item.id===a.artworkId))artworks.push({id:a.artworkId,status:'complete',...a});
  shell.contentMode.value=result.plan?.contentMode||'prayer';shell.showActions.checked=result.plan?.showActions!==false;shell.populate(result);
  shell.mode.value=result.plan?.mode||'daily';
 }
 function currentActionFor(result,days){
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const index=hour>=7&&hour<23?Math.floor((hour-7)/2):null;
  return {day:days?.[0],action:index===null?null:days?.[0]?.actions?.[index],index};
 }
 function updateContent(result){
  const previewDays=result.planDays?.length?result.planDays:(result.days||[]);
  const key=JSON.stringify([result.artwork,result.action,result.answer,result.displaySource,result.pendingUpdate,result.displayPlan?.contentMode,result.displayPlan?.showActions,previewDays.map(day=>[day.artworkId,day.image,day.title])]);
  if(key===renderedKey)return;renderedKey=key;
  const mappingOpen=!!shell.current.querySelector('[data-prayer-reading][open]');shell.current.replaceChildren();
  const planned=previewDays[0];
  const artwork=planned?{id:planned.artworkId,title:planned.title,date:planned.date,source:planned.source,image:planned.image,mapping:planned.mapping||result.artwork?.mapping}:result.artwork;
  const preview=currentActionFor(result,previewDays),reportedCurrent=result.displaySource==='device_report'&&!result.pendingUpdate&&!result.deviceReport?.stale&&result.artwork?.id===planned?.artworkId;
  const action=reportedCurrent?result.action:(preview.action||result.action);
  if(!artwork){shell.current.append(node('p',result.position?.expired?'两天内容已用完，等待新画作。':'准备好两幅画作后，可以开始两天体验。'));return;}
  const photo=result.plan?.contentMode==='photo',showActions=result.plan?.showActions!==false;
  const row=node('article');row.className='ritual-current'+(photo?' ritual-photo':'');
  const visual=node('div');visual.className='ritual-artwork';const image=node('img');image.alt=artwork.title;if(url&&imagePath===artwork.image)image.src=url;visual.append(image);
  if(result.answer){const answerScreen=node('div');answerScreen.className='ritual-answer';answerScreen.append(node('small',result.answer.id+' · 答案之书'),node('strong',result.answer.text));visual.replaceChildren(answerScreen);}
  const copy=node('div');copy.className='ritual-artwork-copy';copy.append(node('small','今日祈福画面 · '+artwork.date),node('h5',artwork.title));
  if(action&&showActions){const actionBox=node('div');actionBox.className='ritual-artwork-action';actionBox.append(node('strong',action.branch+'时 · '+action.title),node('p',action.text),node('small',action.detail+(action.number_basis?' · 次数或时长按'+action.number_basis.element+'的河图数取'+action.number_basis.number:'')));copy.append(actionBox);}
  if(result.answer){const answer=node('details');answer.open=true;answer.append(node('summary',result.answer.id+' · '+result.answer.text),node('p',result.answer.phone_detail));copy.append(answer);}
  const mapping=node('details');mapping.dataset.prayerReading='';mapping.open=mappingOpen;mapping.append(node('summary',photo?'查看照片说明':'查看祈福画面解读'));const reading=node('div');renderConsumerReading(reading,artwork.mapping);mapping.append(reading);copy.append(mapping);row.append(visual,copy);
  const previews=node('section');previews.className='ritual-day-previews';
  for(const [index,day] of previewDays.slice(0,2).entries()){
   const figure=node('figure');figure.className='ritual-day-preview';const thumb=node('img');thumb.alt=(index===0?'今日':'明日')+'祈福画面：'+day.title;thumb.loading='lazy';thumb.src=day.image;const caption=node('figcaption');caption.append(node('strong',(index===0?'今日':'明日')+'祈福画面'),node('span',day.date+' · '+day.title));figure.append(thumb,caption);previews.append(figure);
  }
  if(previews.children.length)shell.current.append(row,previews);else shell.current.append(row);
  if(!result.answer&&!image.src){const life=lifecycle,path=artwork.image;void fetchImage(path).then(next=>{
   if(!alive(life)||!image.isConnected){URL.revokeObjectURL(next);return;}if(url)URL.revokeObjectURL(url);url=next;imagePath=path;image.src=next;
  }).catch(()=>{if(alive(life)&&image.isConnected){image.alt='画作预览暂不可用';renderedKey=null;}});}
 }
 function updateActions(result){
  const list=shell.actionList;list.replaceChildren();
  const days=result.planDays?.length?result.planDays:(result.days?.length?result.days:[{title:'通用参考',actions:result.actionGuide||[]}]);
  if(!days[0].actions?.length){list.append(node('p','微行动建议正在准备中。'));return;}
  const preview=currentActionFor(result,days),currentAction=preview.action;
  if(currentAction){
   const card=node('article');card.className='ritual-action-card current ritual-current-action';
   const hour=Number(currentAction.hour),range=Number.isFinite(hour)?String(hour).padStart(2,'0')+':00–'+String(hour+2).padStart(2,'0')+':00':'';
   card.append(node('strong','当前时辰 · '+currentAction.branch+'时 · '+range+' · '+currentAction.title),node('p',currentAction.text),node('small',currentAction.detail||''));
   list.append(card);
  }else list.append(node('p','当前时段没有新增动作建议，夜间请好好休息。'));
  const all=node('details');all.className='ritual-all-actions';all.append(node('summary','展开今日与明日全部 16 条时辰建议'));
  for(const [dayIndex,day] of days.entries()){
   const section=node('section');section.className='ritual-action-day';section.append(node('h6',(dayIndex===0?'今日':'明日')+' · '+day.title));
   for(const [index,action] of (day.actions||[]).entries()){
    const item=node('article');item.className='ritual-action-card';if(dayIndex===0&&index===preview.index)item.classList.add('current');
    const hour=Number(action.hour),range=Number.isFinite(hour)?String(hour).padStart(2,'0')+':00–'+String(hour+2).padStart(2,'0')+':00':'';
    item.append(node('strong',action.branch+'时 · '+range+' · '+action.title),node('p',action.text),node('small',String(action.detail||'').replace('当前未确认喜用数字','动作重复次数尚未个性化')));
    if(action.alternatives?.length){const options=node('details');options.append(node('summary','画屏下键 · 轮换本时辰5条建议'));for(const [i,option] of [action,...action.alternatives].entries()){options.append(node('p',(i+1)+'/5 · '+option.title+'：'+option.text),node('small',option.detail||''));}item.append(options);}
    section.append(item);
   }
   all.append(section);
  }
  list.append(all);
 }
 function updateTransfer(result,override){
  const state=override||transferStatus(result,latestGenerated?.id);
  transferPending=!['rendered','unbound','photo','firmware'].includes(state.phase);
  if(shell)renderTransfer(shell.transfer,state);
  const besideImage=document.querySelector('#artwork-transfer');
  if(besideImage&&(latestGenerated||!besideImage.hidden))renderTransfer(besideImage,state);
 }
 async function refresh(){
  if(saving||uploading)return;active=true;const turn=++epoch,life=lifecycle;clearTimeout(timer);if(!getUser()){reset();return;}
  ensureShell();host.hidden=false;
  try{
   const result=await request('/api/account/ritual');if(turn!==epoch||!alive(life))return;failures=0;
   updateTransfer(result);
   const r=result.deviceReport;
   shell.submit.textContent=result.syncConfigured===false?'保存画屏设置':'保存并同步到画屏';
   shell.deliveryNote.textContent=result.syncConfigured===false?'内容保存到你的账户；请先通过蓝牙连接并绑定画屏，自动同步才会启用。':'设备下次联网时领取新内容；网页保存成功不代表设备已完成显示。';
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const generated=latestGenerated?.status==='complete'&&latestGenerated.date===today?latestGenerated:null;
   const planDays=result.planDays?.length?result.planDays:result.days||[];
   const effective=generated?{...result,planDays:planDays.map((day,index)=>index===0?{...day,title:generated.mapping.title,artworkId:generated.id,image:generated.image,mapping:generated.mapping,actions:personalizeActions(day.actions||[],generated.mapping,0)}:day)}:result;
   shell.status.textContent=(result.notice||'选两幅已有画作，开始两天体验。')+(generated&&result.plan?.artworkIds?.[0]!==generated.id?' 网页已显示刚完成的今日画；设备仍在领取上一版两日内容。':'');
   shell.settingsState.textContent=shell.status.textContent;
   shell.report.textContent=r?'设备最近联网：'+new Date(r.lastSeen).toLocaleString('zh-CN')+(r.stale?'（回报较早，设备可能离线）':'')+'；'+(r.renderReport?'最近上屏请求：第 '+(r.renderReport.day+1)+' 天'+(r.answerId?' · '+r.answerId:r.renderReport.action>=0?' · 第 '+(r.renderReport.action%8+1)+' 时段 · 备选 '+(Math.floor(r.renderReport.action/8)+1):' · 祈福图')+(r.showingPrevious?'（新内容仍在同步）':''):'尚未收到当前内容的上屏回报')+'。实屏效果待验收。':'';
   updateContent(effective);updateActions(effective);schedule(effective);
   if(!artworks){const page=await request('/api/account/artworks');if(turn!==epoch||!alive(life))return;artworks=page.items;cursor=page.cursor||null;}
   updateSettings(result);
  }catch(error){if(turn===epoch&&alive(life)){shell.status.textContent=error.message;shell.settingsState.textContent=error.message;updateTransfer(null,{phase:'unavailable',title:'同步状态暂不可用',detail:'正在重新连接，请稍后查看。',step:0,percent:null});timer=setTimeout(refresh,Math.min(60000,5000*2**Math.min(failures++,4)));}}
 }
 async function prepare(){
  if(preparing||!getUser())return false;
  let status;try{status=await request('/api/account/ritual');updateTransfer(status);}catch{updateTransfer(null,{phase:'unavailable',title:'暂时无法准备传输',detail:'请检查网络，稍后重新查看同步状态。',step:0,percent:null});return false;}
  if(!status.syncConfigured)return false;
  ensureShell();host.hidden=false;preparing=true;shell.status.textContent='正在检查两日画作；缺少次日画作时会为你补齐。';
  if(status.plan?.contentMode==='photo'){
   shell.status.textContent='当前使用你的照片计划，不会自动替换为次日祈福画。需要祈福模式时请在上方手动切换。';
   preparing=false;return false;
  }
  try{
   let prepared=await request('/api/account/ritual/prepare',{mode:shell.mode.value||status.plan?.mode||'daily'});
   if(prepared.job){
    shell.status.textContent='次日祈福画正在绘制，完成后会编译并下发两天内容。';
    await request('/api/jobs/'+prepared.job.id+'/image',{jobToken:prepared.job.token});
    prepared=await request('/api/account/ritual/prepare',{mode:shell.mode.value||status.plan?.mode||'daily'});
   }
   await refresh();
   shell.status.textContent='两日祈福内容已提交后台；设备联网领取并回报后才能显示设备实际画面。';
   return true;
  }catch(error){if(shell)shell.status.textContent='两日内容准备暂未完成：'+error.message;updateTransfer(null,{phase:'retrying',title:'画屏内容准备暂未完成',detail:error.message,step:0,percent:null});return false;}
  finally{preparing=false;}
 }
 async function bindDevice(deviceId){
  if(!getUser())return {needsLogin:true};
  const result=await request('/api/account/ritual/device',{deviceId});
  await refresh();
  await prepare();
  return result;
 }
 function showGeneratedArtwork(job){
  if(!getUser()||job?.status!=='complete'||!job.image||!job.mapping)return;
  latestGenerated=job;renderedKey=null;updateTransfer();if(active)void refresh();
 }
 return {refresh,reset,pause,prepare,bindDevice,showGeneratedArtwork};
}
