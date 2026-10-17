export function setupAccounts({request,apiURL,fetchImage,getInput,onProfile,onUserChange,onOpenArtwork,isBusy}){
 const $=s=>document.querySelector(s),auth=$('#auth-dialog'),panel=$('#account-dialog');let enabled=false,mailEnabled=false,user=null,profile=null,mode='login',afterLogin=null,cursor=null,urls=[],challenge=null,countdownTimer=null;
 const text=(s,v)=>{$(s).textContent=v||'';},visible=(s,v)=>{$(s).hidden=!v;};
 const crossOrigin=()=>new URL(apiURL('/api/bootstrap')).origin!==location.origin;
 function resetCode(){challenge=null;$('#auth-code').value='';clearInterval(countdownTimer);countdownTimer=null;$('#send-email-code').disabled=!mailEnabled;text('#send-email-code','发送验证码');visible('#email-code-state',false);}
 function setMode(next){
  mode=next;$('#auth-form').reset();resetCode();visible('#auth-error',false);
  text('#auth-title',next==='register'?'用邮箱开启你的祈愿画册':next==='recover'?'通过邮箱重设密码':next==='bind'?'为账户绑定验证邮箱':'欢迎回到生辰造像馆');
  const isLogin=next==='login';text('#auth-identity-label',isLogin?'邮箱或原账号':'邮箱');$('#auth-identity').type=isLogin?'text':'email';$('#auth-identity').autocomplete=isLogin?'username':'email';$('#auth-identity').placeholder=isLogin?'邮箱，或此前注册的账号':'name@example.com';
  visible('#auth-nickname-field',next==='register');visible('#auth-code-field',!isLogin);$('#auth-code').required=!isLogin;
  $('#auth-password').autocomplete=next==='register'||next==='recover'?'new-password':'current-password';text('#auth-password-label',next==='recover'?'新密码':next==='bind'?'当前账户密码':'密码');
  text('#auth-submit',next==='register'?'验证邮箱并注册':next==='recover'?'验证邮箱并重设密码':next==='bind'?'验证并绑定邮箱':'登录我的账户');$('#auth-submit').disabled=!isLogin&&!mailEnabled;
  visible('#email-service-note',!mailEnabled);visible('#auth-tabs',next!=='bind');
  for(const tab of document.querySelectorAll('[data-auth-mode]')){tab.classList.toggle('active',tab.dataset.authMode===next);tab.setAttribute('aria-selected',String(tab.dataset.authMode===next));}
 }
 function paint(){
  visible('#account-guide',enabled&&!user);visible('#save-profile',enabled&&!!user);text('#account-open',user?user.nickname+' · 我的画册':'登录 / 注册');text('#profile-state',user?'已登录 '+(user.email||'@'+user.username)+' · 本次作品将自动保存到你的账户':'邮箱注册后自动保存生辰、愿望、画作和完整解读。');
  if(user){text('#account-name',user.nickname);text('#account-username',user.email||'@'+user.username);text('#account-email-state',user.emailVerified?'已验证邮箱，可用于登录和找回密码':'尚未绑定邮箱，绑定后可通过邮件找回密码。');visible('#bind-email',!user.emailVerified);$('#bind-email').disabled=!mailEnabled;text('#account-profile',profile?`${profile.gender==='female'?'女':'男'} · ${profile.calendar==='lunar'?'农历':'公历'} ${profile.birthDate} ${profile.birthTime}${profile.city?' · '+profile.city:''}`:'尚未填写出生资料');}
 }
 async function accept(data){const oldId=user?.id;user=data.user;profile=data.profile;if(oldId!==user?.id)onUserChange(user);if(profile)onProfile(profile);paint();}
 function finish(){if(auth.open)auth.close();const callback=afterLogin;afterLogin=null;if(callback)callback();}
 function open(next='login',callback=null){if(!enabled){text('#profile-state','账户服务正在连接，请稍后再试。');return;}afterLogin=callback;if(crossOrigin()){location.assign(new URL(apiURL('/')).origin+'/#create');return;}setMode(next);if(!auth.open)auth.showModal();$('#auth-identity').focus();}
 $('#account-open').onclick=()=>user?openPanel():open('login');$('#register-guide').onclick=()=>open('register');$('#close-auth').onclick=()=>{afterLogin=null;resetCode();$('#auth-password').value='';auth.close();};$('#close-account').onclick=()=>panel.close();
 document.querySelectorAll('[data-auth-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.authMode));
 $('#auth-identity').addEventListener('input',resetCode);
 $('#send-email-code').onclick=async()=>{
  if(!$('#auth-identity').reportValidity())return;
  if(mode==='bind'&&!$('#auth-password').reportValidity())return;
  const email=$('#auth-identity').value.trim(),sentMode=mode,purpose=mode==='recover'?'reset':mode;
  $('#send-email-code').disabled=true;visible('#auth-error',false);
  try{const data=await request('/api/account/email-code',{email,purpose,...(purpose==='bind'?{password:$('#auth-password').value}:{})});if(mode!==sentMode||$('#auth-identity').value.trim()!==email)return;challenge=data.challengeId;text('#email-code-state',data.message+' 验证码 10 分钟内有效。');visible('#email-code-state',true);let left=data.retryAfter||60;text('#send-email-code',left+' 秒后重发');clearInterval(countdownTimer);countdownTimer=setInterval(()=>{left--;text('#send-email-code',left>0?left+' 秒后重发':'重新发送');if(left<=0){clearInterval(countdownTimer);countdownTimer=null;$('#send-email-code').disabled=!mailEnabled;}},1000);$('#auth-code').focus();}
  catch(e){text('#auth-error',e.message);visible('#auth-error',true);$('#send-email-code').disabled=!mailEnabled;}
 };
 $('#auth-form').onsubmit=async event=>{
  event.preventDefault();const button=$('#auth-submit');if(mode!=='login'&&!challenge){text('#auth-error','请先获取邮箱验证码。');visible('#auth-error',true);return;}button.disabled=true;visible('#auth-error',false);
  try{const data=await request('/api/account/'+(mode==='bind'?'bind-email':mode),{...(mode==='login'?{username:$('#auth-identity').value}:{email:$('#auth-identity').value,challengeId:challenge,code:$('#auth-code').value}),password:$('#auth-password').value,nickname:$('#auth-nickname').value});$('#auth-password').value='';resetCode();await accept(data);finish();}
  catch(e){text('#auth-error',e.message);visible('#auth-error',true);}finally{button.disabled=mode!=='login'&&!mailEnabled;}
 };
 $('#bind-email').onclick=()=>{panel.close();open('bind',()=>openPanel());};
 $('#save-profile').onclick=async()=>{if(!user){open('login');return;}try{const data=await request('/api/account/profile',getInput());profile=data.profile;paint();text('#profile-state','出生资料与祈福愿望已保存到你的账户。');}catch(e){text('#profile-state',e.message);}};
 $('#edit-account-profile').onclick=()=>{panel.close();$('#create').scrollIntoView({behavior:'smooth'});document.querySelector('[name=birthDate]').focus();};
 $('#account-logout').onclick=async()=>{if(isBusy())return;try{await request('/api/account/logout',{});user=null;profile=null;cursor=null;for(const url of urls)URL.revokeObjectURL(url);urls=[];$('#artwork-grid').replaceChildren();onUserChange(null);onProfile(null);paint();panel.close();}catch(e){text('#gallery-state',e.message);}};
 async function gallery(more=false){text('#gallery-state','正在载入你的祈福画册…');$('#gallery-more').disabled=true;try{const data=await request('/api/account/artworks'+(more&&cursor?'?cursor='+encodeURIComponent(cursor):''));if(!more){for(const url of urls)URL.revokeObjectURL(url);urls=[];$('#artwork-grid').replaceChildren();}cursor=data.cursor;for(const record of data.items){const card=document.createElement('button');card.type='button';card.className='artwork-card';const visual=document.createElement('div');visual.className='artwork-thumb';visual.textContent=record.image?'正在载入…':'✧ 解读已保存';const title=document.createElement('strong');title.textContent=record.title;const meta=document.createElement('small');meta.textContent=record.date+' · '+record.wishLabel;const label=document.createElement('span');label.textContent=record.status==='complete'?'查看画作与解读 ↗':'查看解读 · 继续绘制 ↗';card.append(visual,meta,title,label);card.onclick=async()=>{if(isBusy())return;card.disabled=true;try{const job=await request('/api/account/artworks/'+record.id);panel.close();await onOpenArtwork(job);}catch(e){text('#gallery-state',e.message);}finally{card.disabled=false;}};$('#artwork-grid').append(card);if(record.image)void fetchImage(record.image).then(url=>{if(!card.isConnected){URL.revokeObjectURL(url);return;}urls.push(url);const image=document.createElement('img');image.src=url;image.alt=record.title;image.loading='lazy';visual.replaceChildren(image);}).catch(()=>{visual.textContent='点击查看画作';});}text('#gallery-state',$('#artwork-grid').children.length?'画作与解读仅在你的账户中可见。':'还没有作品。填好资料，让第一份心愿在这里留下来。');visible('#gallery-more',!!cursor);}catch(e){text('#gallery-state',e.message);}finally{$('#gallery-more').disabled=false;}}
 async function openPanel(){paint();if(!panel.open)panel.showModal();await gallery();}
 $('#gallery-more').onclick=()=>gallery(true);
 return {get user(){return user;},get enabled(){return enabled;},async initialize(bootstrap){enabled=!!bootstrap.accounts?.enabled;mailEnabled=!!bootstrap.accounts?.emailEnabled;visible('#account-open',enabled);paint();if(!enabled)return;try{await accept(await request('/api/account/me'));}catch(e){text('#profile-state',e.message);}},require(callback){if(user)return true;open('register',callback);return false;},refresh(){if(panel.open)void gallery();}};
}
