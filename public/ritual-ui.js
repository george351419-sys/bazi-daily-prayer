import {transferStatus,renderTransfer} from './transfer-status.js?v=20261030-followup-v1';
import {renderConsumerReading,consumerReadingMarkdown} from './reading-view.js';
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
 function answerNumber(answer){const match=/(\d+)\s*$/.exec(answer?.id||'');return match?Number(match[1]):null;}
 function answerLabel(answer){if(!answer)return '';const number=answerNumber(answer);return answer.id+(number?` · 第 ${number} 数`:'');}
 function actionNote(action){const detail=String(action?.detail||'').replace('当前未确认喜用数字','动作重复次数尚未个性化');const basis=action?.number_basis?`次数取象：${action.number_basis.element}河图数 ${action.number_basis.number}。`:'';return [detail,basis].filter(Boolean).join(' ');}
 function readingMarkdown(mapping,date,title){const lines=[];if(date||title)lines.push('# '+[date,title].filter(Boolean).join(' · '));if(!mapping)return lines.join('\n');if(mapping.overview)lines.push(mapping.overview);if(mapping.elements?.length)lines.push(...mapping.elements.map(item=>'**'+item.name+'**\n'+item.meaning));if(mapping.blessing)lines.push(mapping.blessing);if(mapping.reading){lines.push('## 生辰与画面解析');lines.push(consumerReadingMarkdown(mapping));}return lines.join('\n\n');}
 function renderArtworkReading(container,mapping,{photo,date,title}){
  container.replaceChildren();container.className='reading ritual-reading-copy';
  if(photo){const copy=node('p','这是你放进私人画册的日常一帧。照片模式不进入命理取象，也不改变今日造像原有的解读。');copy.className='reading-intro';container.append(copy);return;}
  if(!mapping){const copy=node('p','这幅画暂时没有可读取的画面文字。重新生成后，可在这里查看完整解读。');copy.className='reading-intro';container.append(copy);return;}
  if(mapping.overview){const overview=node('p',mapping.overview);overview.className='reading-overview';container.append(overview);}
  if(mapping.colors?.length){const palette=node('div');palette.className='palette';for(const color of mapping.colors){const item=node('span');item.className='swatch';const dot=node('i');dot.style.backgroundColor=color.hex;item.append(dot,document.createTextNode(color.name));palette.append(item);}container.append(palette);}
  if(mapping.elements?.length){container.append(node('h4','画中每一份心意'));const list=node('div');for(const [index,element] of mapping.elements.entries()){const row=node('div');row.className='element-item';const number=node('span',String(index+1).padStart(2,'0'));number.className='element-index';const box=node('div');box.append(node('h5',element.name),node('p',element.meaning));row.append(number,box);list.append(row);}container.append(list);}
  if(mapping.blessing){const blessing=node('blockquote',mapping.blessing);container.append(blessing);}
  if(mapping.reading){container.append(node('h4','生辰与画面解析'));const caption=node('p','这是一份传统取象解释，读到这里就好；不必把它当成对现实结果的保证。');caption.className='reading-caption';const copy=node('div');copy.className='consumer-reading';renderConsumerReading(copy,mapping);container.append(caption,copy);}
  if(mapping.reading||mapping.overview){const row=node('div');row.className='ritual-reading-actions';const download=node('button','保存画面解读 ↗');download.type='button';download.className='text-button';download.onclick=()=>{const text=readingMarkdown(mapping,date,title);const link=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'})),anchor=document.createElement('a');anchor.href=link;anchor.download='今日造像解读-'+(date||'')+'.md';anchor.click();setTimeout(()=>URL.revokeObjectURL(link),1000);};row.append(download);container.append(row);}
 }
 let transferPending=false,active=false,epoch=0,lifecycle=0,timer=null,url=null,imagePath=null,artworks=null,answers=null,dirty=false,saving=false,uploading=false,preparing=false,draftURL=null,cursor=null,failures=0,shell=null,renderedKey=null,searchTurn=0,searchTimer=null,latestGenerated=null;
 function pause(){active=false;epoch++;clearTimeout(timer);timer=null;}
 function reset(){pause();lifecycle++;searchTurn++;clearTimeout(searchTimer);if(url)URL.revokeObjectURL(url);if(draftURL)URL.revokeObjectURL(draftURL);draftURL=null;url=null;imagePath=null;artworks=null;answers=null;cursor=null;dirty=false;saving=false;uploading=false;preparing=false;failures=0;shell?.settings.remove();shell=null;renderedKey=null;latestGenerated=null;host.replaceChildren();host.hidden=true;const transfer=document.querySelector('#artwork-transfer');if(transfer){transfer.replaceChildren();transfer.hidden=true;}}
 function alive(life){return life===lifecycle&&!!getUser();}
 function schedule(result){if(!active)return;clearTimeout(timer);const next=Date.parse(result?.scheduledPosition?.nextAt||result?.position?.nextAt);timer=setTimeout(refresh,Number.isFinite(next)?Math.max(1000,Math.min(latestGenerated&&transferPending?5000:30000,next-Date.now()+200)):(latestGenerated&&transferPending?5000:30000));}
 function ensureShell(){
  if(shell)return;
  const transfer=node('div');transfer.setAttribute('role','status');transfer.setAttribute('aria-live','polite');
  const title=node('h4','解读陪伴 · 今日三读'),status=node('p'),report=node('p'),current=node('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const shortcuts=node('nav');shortcuts.className='ritual-shortcuts';shortcuts.setAttribute('aria-label','画屏功能');
  const settings=node('details');settings.id='ritual-settings';settings.append(node('summary','画屏呈现设置'));const form=node('form');form.className='ritual-form';
  const choicesBox=node('div');choicesBox.className='ritual-choices';form.append(choicesBox);
  const contentLabel=node('fieldset'),contentMode=node('select');contentLabel.className='screen-mode-picker';contentLabel.append(node('legend','选择呈现方式'));contentMode.hidden=true;
  for(const [value,text] of [['prayer','祈福图'],['photo','自己的照片']]){const option=node('option',text);option.value=value;contentMode.append(option);}contentLabel.append(contentMode);
  const modeOptions=node('div');modeOptions.className='screen-mode-options';
  const modeRadios=[['prayer','祈福画','使用已生成的专属祈福画'],['photo','自己的照片 / 画作','上传喜欢的照片或手绘作品']].map(([value,title,hint])=>{
   const label=node('label'),radio=node('input'),copy=node('span');radio.type='radio';radio.name='screen-content';radio.value=value;radio.checked=value==='prayer';
   copy.append(node('strong',title),node('small',hint));label.append(radio,copy);modeOptions.append(label);
   radio.addEventListener('change',()=>{if(radio.checked){contentMode.value=value;contentMode.dispatchEvent(new Event('change',{bubbles:true}));}});
   return radio;
  });
  contentLabel.append(modeOptions);choicesBox.append(contentLabel);
  const actionLabel=node('label');actionLabel.className='photo-action-toggle';const showActions=node('input');showActions.type='checkbox';showActions.checked=true;actionLabel.append(showActions,document.createTextNode('在画面下方显示微行动建议（可选）'));choicesBox.append(actionLabel);
  const labels=[],selects=[0,1].map((_,i)=>{const dayName=i===0?'今日':'明日';const label=node('label'),caption=node('span'),select=node('select');select.setAttribute('aria-label',dayName+'画面');select.required=true;label.append(caption,select);labels.push(caption);choicesBox.append(label);return select;});
  const uploadBox=node('div');uploadBox.className='photo-upload';const fileLabel=node('label','选择自己的照片'),file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.setAttribute('aria-label','选择自己的照片');fileLabel.append(file);const photoLabel=node('label','照片名称'),photoTitle=node('input');photoTitle.maxLength=60;photoTitle.placeholder='例如：一家人的周末';photoLabel.append(photoTitle);const upload=node('button','上传到账户');upload.type='button';upload.className='secondary';const uploadState=node('p'),draft=node('img');draft.hidden=true;draft.className='photo-draft';draft.alt='上传照片预览';uploadState.setAttribute('role','status');uploadBox.append(fileLabel,photoLabel,upload,draft,uploadState,node('small','上传时保留完整构图，并移除照片位置信息。六色墨水屏会与原照片存在色彩差异。'));form.append(uploadBox);
  const more=node('button','载入更多画作与照片');more.type='button';more.className='text-button';more.hidden=true;form.append(more);
  const mode=node('select');mode.setAttribute('aria-label','播放方式');for(const [value,text] of [['daily','日常：01:00 换画，每两小时换动作'],['test','测试：每 2 分钟换动作，两天循环']]){const option=node('option',text);option.value=value;mode.append(option);}
  const settingsState=node('p');settingsState.setAttribute('role','status');settingsState.setAttribute('aria-live','polite');
  const submit=node('button','保存并同步到画屏');submit.type='submit';submit.className='primary';const deliveryNote=node('small','设备下次联网时领取新内容；网页保存成功不代表设备已完成显示。');form.append(mode,submit,deliveryNote,settingsState);settings.append(form);
  function populate(result){
   for(const radio of modeRadios)radio.checked=radio.value===contentMode.value;
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
  const picture=node('section');picture.id='ritual-picture';picture.className='ritual-companion-block';
  const pictureHead=node('div');pictureHead.className='ritual-block-heading';const pictureKicker=node('span','01 / PICTURE READING');pictureKicker.className='eyebrow';pictureHead.append(pictureKicker,node('h5','画面解读'),node('p','先看画里有什么，再读它为什么落在今天。'));
  const pictureBody=node('div');pictureBody.className='ritual-reading-body';picture.append(pictureHead,pictureBody);
  const actions=node('section');actions.id='ritual-actions';actions.className='ritual-companion-block';
  const actionHead=node('div');actionHead.className='ritual-block-heading';const actionKicker=node('span','02 / MICRO ACTION READING');actionKicker.className='eyebrow';actionHead.append(actionKicker,node('h5','微行动解读'),node('p','从一幅画，走到身体能做的一件小事；不追求完成，只求此刻舒服。'));
  const actionList=node('div');actionList.className='ritual-action-list';actions.append(actionHead,actionList);
  const answer=node('section');answer.id='ritual-answers';answer.className='ritual-companion-block';
  const answerHead=node('div');answerHead.className='ritual-block-heading';const answerKicker=node('span','03 / ANSWER NUMBER READING');answerKicker.className='eyebrow';answerHead.append(answerKicker,node('h5','答案之数解读'),node('p','把画屏上的答案留在这里，保留编号、短句，也给自己一点慢慢理解的时间。'));
  const answerLatest=node('div');answerLatest.className='ritual-answer-latest';
  const book=node('details');book.className='ritual-answer-book';book.append(node('summary','展开 100 条答案与解读'));
  const search=node('input');search.type='search';search.maxLength=120;search.placeholder='输入编号、短句或关键词，例如 OB005、事业';search.setAttribute('aria-label','搜索答案之数');
  const count=node('p','正在载入答案库…'),list=node('div');count.setAttribute('role','status');
  function find(){
   if(!answers)return;const q=search.value.normalize('NFKC').trim().toLowerCase(),items=answers.filter(a=>!q||[a.id,a.text,a.theme,a.tendency,a.phone_detail].some(v=>String(v||'').toLowerCase().includes(q)));
   const open=new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.answer));list.replaceChildren();count.textContent=items.length+' 条回答';
   for(const a of items){const item=node('details');item.dataset.answer=a.id;item.open=open.has(a.id);item.append(node('summary',answerLabel(a)+' · '+a.text),node('p',a.phone_detail),node('small',a.theme+' · '+a.tendency+' · '+a.review_status));list.append(item);}
  }
  search.oninput=find;book.append(search,count,list);answer.append(answerHead,answerLatest,book);
  for(const [label,target] of [['画面解读',picture],['微行动解读',actions],['答案之数解读',answer],['上传照片 · 选择模式',settings]]){const button=node('button',label);button.type='button';button.className='secondary';button.onclick=()=>{if(target.tagName==='DETAILS')target.open=true;if(target===settings)location.hash='custom';if(target===answer)book.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});if(target===answer)search.focus();};shortcuts.append(button);}
  host.append(title,transfer,status,report,shortcuts,current,picture,actions,answer);
  host.append(settings);
  shell={transfer,status,settingsState,report,current,settings,form,deliveryNote,selects,mode,submit,contentMode,showActions,populate,book,search,count,find,actionList,pictureBody,answerLatest};
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
  shell.current.replaceChildren();
  const planned=previewDays[0];
  const artwork=planned?{id:planned.artworkId,title:planned.title,date:planned.date,source:planned.source,image:planned.image,mapping:planned.mapping||result.artwork?.mapping}:result.artwork;
  const preview=currentActionFor(result,previewDays),reportedCurrent=result.displaySource==='device_report'&&!result.pendingUpdate&&!result.deviceReport?.stale&&result.artwork?.id===planned?.artworkId;
  const action=reportedCurrent?result.action:(preview.action||result.action);
  if(!artwork){shell.current.append(node('p',result.position?.expired?'两天内容已用完，等待新画作。':'准备好两幅画作后，可以开始两天体验。'));renderArtworkReading(shell.pictureBody,null,{photo:false,date:'',title:''});updateAnswer(result);return;}
  const photo=result.plan?.contentMode==='photo',showActions=result.plan?.showActions!==false;
  const row=node('article');row.className='ritual-current'+(photo?' ritual-photo':'');
  const visual=node('div');visual.className='ritual-artwork';const image=node('img');image.alt=artwork.title;if(url&&imagePath===artwork.image)image.src=url;visual.append(image);
  if(result.answer){const answerScreen=node('div');answerScreen.className='ritual-answer';answerScreen.append(node('small',answerLabel(result.answer)+' · 答案之数'),node('strong',result.answer.text));visual.replaceChildren(answerScreen);}
  const copy=node('div');copy.className='ritual-artwork-copy';copy.append(node('small','今日造像 · '+artwork.date),node('h5',artwork.title));
  if(action&&showActions){const actionBox=node('div');actionBox.className='ritual-artwork-action';actionBox.append(node('strong',action.branch+'时 · '+action.title),node('p',action.text),node('small',action.detail+(action.number_basis?' · 次数或时长按'+action.number_basis.element+'的河图数取'+action.number_basis.number:'')));copy.append(actionBox);}
  const jump=node('button','读画面解读 ↓');jump.type='button';jump.className='text-button';jump.onclick=()=>shell.pictureBody.scrollIntoView({behavior:'smooth',block:'start'});copy.append(jump);row.append(visual,copy);
  shell.current.append(row);
  renderArtworkReading(shell.pictureBody,artwork.mapping,{photo,date:artwork.date,title:artwork.title});updateAnswer(result);
  if(!result.answer&&!image.src){const life=lifecycle,path=artwork.image;void fetchImage(path).then(next=>{
   if(!alive(life)||!image.isConnected){URL.revokeObjectURL(next);return;}if(url)URL.revokeObjectURL(url);url=next;imagePath=path;image.src=next;
  }).catch(()=>{if(alive(life)&&image.isConnected){image.alt='画作预览暂不可用';renderedKey=null;}});}
 }
 function updateAnswer(result){
  const host=shell.answerLatest;host.replaceChildren();
  if(result.answer){const card=node('article');card.className='ritual-answer-card';card.append(node('small',answerLabel(result.answer)+' · 答案之数'),node('strong',result.answer.text),node('p',result.answer.phone_detail),node('small',[result.answer.theme,result.answer.tendency].filter(Boolean).join(' · ')));host.append(card);return;}
  const empty=node('div');empty.className='ritual-answer-empty';empty.append(node('p','画屏上键抽到的答案，会在这里保留编号与解释。'),node('small','也可以展开下方答案库，按编号、短句或关键词查找。'));host.append(empty);
 }
 function updateActions(result){
  const list=shell.actionList;list.replaceChildren();
  const days=result.planDays?.length?result.planDays:(result.days?.length?result.days:[{title:'通用参考',actions:result.actionGuide||[]}]);
  if(!days[0].actions?.length){list.append(node('p','微行动建议正在准备中。'));return;}
  const preview=currentActionFor(result,days),currentAction=preview.action;
  if(currentAction){
   const card=node('article');card.className='ritual-action-card current ritual-current-action';
   const hour=Number(currentAction.hour),range=Number.isFinite(hour)?String(hour).padStart(2,'0')+':00–'+String(hour+2).padStart(2,'0')+':00':'';
   card.append(node('strong','当前时辰 · '+currentAction.branch+'时 · '+range+' · '+currentAction.title),node('p',currentAction.text),node('small','行动解读 · '+actionNote(currentAction)));
   list.append(card);
  }else list.append(node('p','当前时段没有新增动作建议，夜间请好好休息。'));
  const all=node('details');all.className='ritual-all-actions';all.append(node('summary','展开今日与明日全部时辰建议'));
  for(const [dayIndex,day] of days.entries()){
   const section=node('section');section.className='ritual-action-day';section.append(node('h6',(dayIndex===0?'今日':'明日')+' · '+day.title));
   for(const [index,action] of (day.actions||[]).entries()){
    const item=node('article');item.className='ritual-action-card';if(dayIndex===0&&index===preview.index)item.classList.add('current');
    const hour=Number(action.hour),range=Number.isFinite(hour)?String(hour).padStart(2,'0')+':00–'+String(hour+2).padStart(2,'0')+':00':'';
    item.append(node('strong',action.branch+'时 · '+range+' · '+action.title),node('p',action.text),node('small','行动解读 · '+actionNote(action)));
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
   if(!answers){const page=await request('/api/account/answers');if(turn!==epoch||!alive(life))return;answers=page.items||[];shell.find();}
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
