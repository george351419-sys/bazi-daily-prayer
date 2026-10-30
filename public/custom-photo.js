import {preparePhoto} from './photo-upload.js';

export function setupCustomPhoto({request,fetchImage,getUser}){
 const root=document.querySelector('#custom-content');
 if(!root)return {refresh(){},reset(){}};
 const description=document.querySelector('#custom .section-top p');if(description)description.textContent='先上传自己的图片，再安排每日轮播；是否附加微行动也由你决定。';
 const node=(tag,text)=>{const item=document.createElement(tag);if(text)item.textContent=text;return item;};
 let mode='prayer',rotationStart='',position=0,showActions=true,selected=[],artworks=[],cursor=null,busy=false,message='',rootPlan=null,urls=new Map();

 function clearUrls(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
 function reset(){mode='prayer';rotationStart='';position=0;showActions=true;selected=[];artworks=[];cursor=null;busy=false;message='';rootPlan=null;clearUrls();root.replaceChildren();}
 function photoPosition(plan){
  const ids=plan?.artworkIds||[];if(plan?.contentMode!=='photo'||!ids.length)return 0;
  const start=/^\d{4}-\d{2}-\d{2}$/.test(plan.rotationStartDate||'')?Date.parse(plan.rotationStartDate+'T00:00:00Z'):NaN;
  const today=Date.parse(new Date(Date.now()+7*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  return Number.isFinite(start)?Math.max(0,Math.floor((today-start)/86400000))%ids.length:0;
 }
 function preview(item,image){
  if(!item?.image){image.alt='图片预览暂不可用';return;}
  const cached=urls.get(item.id);if(cached){image.src=cached;return;}
  void fetchImage(item.image).then(url=>{
   if(!getUser()){URL.revokeObjectURL(url);return;}
   const previous=urls.get(item.id);if(previous)URL.revokeObjectURL(previous);urls.set(item.id,url);image.src=url;
  }).catch(()=>{image.alt='图片预览暂不可用';});
 }
 function card(item,index){
  const article=node('article');article.className='photo-rotation-card';
  const visual=node('div');visual.className='photo-rotation-visual';const image=node('img');image.alt=item.title||'我的图片';visual.append(image,node('span',String(index+1).padStart(2,'0')));preview(item,image);
  const copy=node('div');copy.className='photo-rotation-copy';copy.append(node('strong',item.title||'我的图片'),node('small',index===position?'今天显示':'第 '+(index+1)+' 个轮播位置'));
  const controls=node('div');controls.className='photo-order-actions';
  const up=node('button','↑'),down=node('button','↓'),remove=node('button','移除');up.type=down.type=remove.type='button';up.title='上移';down.title='下移';remove.className='text-button';up.disabled=busy||index===0;down.disabled=busy||index===selected.length-1;remove.disabled=busy;
  up.onclick=()=>{if(index<1)return;[selected[index-1],selected[index]]=[selected[index],selected[index-1]];message='顺序已调整，保存后生效。';render();};
  down.onclick=()=>{if(index>=selected.length-1)return;[selected[index+1],selected[index]]=[selected[index],selected[index+1]];message='顺序已调整，保存后生效。';render();};
  remove.onclick=()=>{selected=selected.filter(id=>id!==item.id);message='已从轮播移除；账户原图仍保留。';render();};
  controls.append(up,down,remove);article.append(visual,copy,controls);return article;
 }
 function render(){
  if(!getUser()){root.replaceChildren();return;}
  const uploads=artworks.filter(item=>item.status==='complete'&&item.source==='upload'),byId=new Map(uploads.map(item=>[item.id,item]));
  selected=selected.filter(id=>byId.has(id)).slice(0,6);
  root.replaceChildren();
  const settings=node('section');settings.id='ritual-settings';settings.className='custom-photo-settings';
  const heading=node('div');heading.className='custom-photo-heading';const copy=node('div');const kicker=node('span','YOUR OWN FRAMES');kicker.className='eyebrow';copy.append(kicker,node('h4','把自己的作品放进画框'));const badge=node('span',mode==='photo'?'当前播放：我的作品 · 今天第 '+(position+1)+' 张':'当前播放：祈福图');badge.className='mode-badge';heading.append(copy,badge);settings.append(heading,node('p','先上传自己的图片，再安排每日轮播。最多 6 张，每天北京时间 01:00 换一张，循环播放。'));
  const form=node('form');form.className='custom-photo-form';
  const uploadBox=node('section');uploadBox.className='photo-upload';const file=node('input');file.type='file';file.multiple=true;file.accept='image/jpeg,image/png,image/webp';file.disabled=busy||selected.length>=6;const choose=node('button','从相册选择 / 拍照');choose.type='button';choose.className='primary';choose.disabled=busy||selected.length>=6;const uploadState=node('p',message);uploadBox.append(node('h5','01 / 上传自己的图片'),node('p','可一次多选；上传后会自动加入下方轮播。'),file,choose,uploadState,node('small','保留完整构图并移除照片位置信息。六色墨水屏会与原图存在色彩差异。'));form.append(uploadBox);
  const rotation=node('section');rotation.className='photo-rotation';rotation.append(node('h5','02 / 安排每日轮播'),node('p',selected.length?'共 '+selected.length+' 张，每天 01:00 换下一张，最后一张之后回到第一张。':'每日只显示一张，最后一张之后回到第一张。'));const grid=node('div');grid.className='photo-rotation-grid';if(!selected.length)grid.append(node('p','还没有选入轮播。上传图片后会自动加入，最多 6 张。'));for(const [index,id] of selected.entries())grid.append(card(byId.get(id),index));rotation.append(grid);form.append(rotation);
  const available=uploads.filter(item=>!selected.includes(item.id));const availableBox=node('section');availableBox.className='photo-available';availableBox.hidden=!available.length&&!cursor;availableBox.append(node('h5','账户里的其他图片'));const availableGrid=node('div');availableGrid.className='photo-available-grid';
  for(const item of available){const button=node('button');button.type='button';button.className='photo-available-card';button.disabled=busy||selected.length>=6;const image=node('img');preview(item,image);const label=node('span');label.append(node('strong',item.title||'我的图片'),node('small','加入轮播'));button.append(image,label);button.onclick=()=>{selected.push(item.id);message='已加入轮播，保存后生效。';render();};availableGrid.append(button);}
  availableBox.append(availableGrid);form.append(availableBox);
  if(cursor){const more=node('button','载入更多图片');more.type='button';more.className='text-button';more.disabled=busy;more.onclick=()=>void loadArtworks(true);form.append(more);}
  const actions=node('label');actions.className='photo-action-toggle';const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=showActions;checkbox.disabled=busy;checkbox.onchange=()=>{showActions=checkbox.checked;message='微行动设置已修改，保存后生效。';};actions.append(checkbox,document.createTextNode('附加呈现微行动建议'));form.append(actions);
  const state=node('p',message);state.setAttribute('role','status');
  const buttons=node('div');buttons.className='custom-photo-actions';const save=node('button',mode==='photo'?'保存并更新内容':'确认切换为自己作品');save.type='submit';save.className='primary';save.disabled=busy||!selected.length;buttons.append(save);
  if(mode==='photo'){const back=node('button','切换回祈福图');back.type='button';back.className='secondary';back.disabled=busy;back.onclick=()=>void switchToPrayer();buttons.append(back);}
  form.append(state,buttons,node('small','确认后会保存账户内容并交给画框同步；实际显示以设备回执为准。'));
  choose.onclick=()=>void uploadFiles(file);
  form.onsubmit=event=>{event.preventDefault();void savePlan();};
  settings.append(form);root.append(settings);
 }
 async function uploadFiles(file){
  if(busy||!getUser())return;const files=[...file.files],room=6-selected.length;if(!files.length){message='请先选择图片。';render();return;}if(room<1){message='轮播已满 6 张，请先移除一张再添加。';render();return;}
  busy=true;message='正在处理图片…';render();
  try{
   for(const [index,selectedFile] of files.slice(0,room).entries()){
    message='正在处理第 '+(index+1)+' / '+Math.min(files.length,room)+' 张…';render();
    const prepared=await preparePhoto(selectedFile),result=await request('/api/account/photos',{type:prepared.type,base64:prepared.base64,title:selectedFile.name.replace(/\.[^.]+$/,'').slice(0,60)||'我的图片'});
    artworks=[result.item,...artworks];selected.push(result.item.id);
   }
   message='图片已上传并加入轮播；调整顺序后保存。';
  }catch(error){message=error.message;}
  finally{busy=false;render();}
 }
 async function loadArtworks(more=false){
  if(busy)return;busy=true;if(more)render();
  try{const page=await request('/api/account/artworks'+(more&&cursor?'?cursor='+encodeURIComponent(cursor):''));artworks=more?artworks.concat(page.items):page.items;cursor=page.cursor||null;}
  catch(error){message=error.message;}
  finally{busy=false;render();}
 }
 async function refresh(){
  if(!getUser()){reset();return;}
  busy=true;message='正在读取画屏设置…';render();
  try{
   const [status,page]=await Promise.all([request('/api/account/ritual'),request('/api/account/artworks')]);
   rootPlan=status.plan||null;mode=rootPlan?.contentMode==='photo'?'photo':'prayer';selected=mode==='photo'?(rootPlan.artworkIds||[]).slice(0,6):[];rotationStart=rootPlan?.rotationStartDate||'';position=photoPosition(rootPlan);showActions=rootPlan?.showActions!==false;artworks=page.items;cursor=page.cursor||null;message='';
  }catch(error){message=error.message;}
  finally{busy=false;render();}
 }
 async function savePlan(){
  if(busy||!getUser())return;if(!selected.length){message='请先上传并选择至少一张自己的图片。';render();return;}
  busy=true;message=mode==='photo'?'正在保存并更新轮播…':'正在切换为我的作品…';render();
  try{const status=await request('/api/account/ritual',{mode:'daily',contentMode:'photo',showActions,artworkIds:selected.slice()});rootPlan=status.plan||rootPlan;mode='photo';position=photoPosition(rootPlan);message=status.syncConfigured?'已保存并交给画框同步；实际显示以设备回执为准。':'已保存到账户；绑定画屏后才会编译并下发。';}
  catch(error){message=error.message;}
  finally{busy=false;render();}
 }
 async function switchToPrayer(){
  if(busy||!getUser())return;busy=true;message='正在准备今日与明日祈福图…';render();
  try{
   let prepared=await request('/api/account/ritual/prepare',{mode:'daily'});
   if(prepared.job){message='次日祈福画正在绘制；完成后会自动切回祈福图。';render();await request('/api/jobs/'+prepared.job.id+'/image',{jobToken:prepared.job.token});prepared=await request('/api/account/ritual/prepare',{mode:'daily'});}
   if(prepared.status!=='ready'||!Array.isArray(prepared.artworkIds))throw new Error('今日与明日祈福画尚未准备好。');
   await request('/api/account/ritual',{mode:'daily',contentMode:'prayer',showActions:true,artworkIds:prepared.artworkIds});
   mode='prayer';selected=[];message='已切换回祈福图；等待画框领取并回报。';
  }catch(error){message='切换回祈福图未完成：'+error.message;}
  finally{busy=false;render();}
 }
 return {refresh,reset};
}
