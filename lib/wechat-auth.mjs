import {createHash,randomBytes} from 'node:crypto';
import {accountRepository,AccountError} from './account-store.mjs';
import {createAccountSession,getProfile,userView} from './accounts.mjs';

const APP_ID=/^wx[a-f0-9]{16}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const credentialsKey=username=>'credentials/'+digest(username);
const identityKey=(appId,openid)=>'wechat-identities/'+digest('wechat-v1:'+appId+':'+openid);

function secretMap(config){
 const raw=String(config.WECHAT_MINIPROGRAM_SECRETS||'').trim();
 if(!raw)return {};
 let parsed;
 try{parsed=JSON.parse(raw);}catch{throw new AccountError(503,'微信小程序登录配置格式不正确。');}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new AccountError(503,'微信小程序登录配置格式不正确。');
 const methods=Object.fromEntries(Object.entries(parsed).filter(([appId,secret])=>APP_ID.test(appId)&&typeof secret==='string'&&secret.length>=20&&secret.length<=128));
 const fallback=config.MINIPROGRAM_APP_SECRET;
 if(typeof fallback==='string'&&fallback.length>=20&&fallback.length<=128)for(const appId of String(config.MINIPROGRAM_APP_IDS||'').split(',').map(x=>x.trim()).filter(x=>APP_ID.test(x)))methods[appId]??=fallback;
 return methods;
}

export function wechatLoginReady(config){
 try{
  const methods=secretMap(config);
  return String(config.MINIPROGRAM_APP_IDS||'').split(',').map(x=>x.trim()).some(appId=>APP_ID.test(appId)&&!!methods[appId]);
 }catch{return false;}
}

function appSecret(config,appId){
 if(!APP_ID.test(appId||''))throw new AccountError(403,'微信小程序身份无效。');
 const secret=secretMap(config)[appId];
 if(!secret)throw new AccountError(503,'微信小程序登录尚未配置 AppSecret。');
 return secret;
}

export async function exchangeWechatCode(config,{appId,code},fetcher=fetch){
 const secret=appSecret(config,appId),value=String(code||'').trim();
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new AccountError(400,'微信登录凭证无效，请重新点击登录。');
 const url=new URL('https://api.weixin.qq.com/sns/jscode2session');
 url.searchParams.set('appid',appId);
 url.searchParams.set('secret',secret);
 url.searchParams.set('js_code',value);
 url.searchParams.set('grant_type','authorization_code');
 let response,payload;
 try{
  response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
  payload=await response.json();
 }catch{throw new AccountError(502,'微信登录暂时无法连接，请稍后重试。');}
 if(!response.ok||!payload||typeof payload!=='object')throw new AccountError(502,'微信登录响应异常，请稍后重试。');
 if(payload.errcode||!payload.openid){
  const errcode=Number(payload.errcode);
  if([40029,40163].includes(errcode))throw new AccountError(401,'微信登录凭证已失效，请重新点击登录。');
  if(errcode===40226)throw new AccountError(403,'当前微信账号暂时无法登录，请稍后再试。');
  if(errcode===45011)throw new AccountError(429,'微信登录请求较多，请稍后再试。');
  throw new AccountError(502,'微信登录未能完成，请稍后重试。');
 }
 if(typeof payload.openid!=='string'||payload.openid.length>128)throw new AccountError(502,'微信登录响应异常，请稍后重试。');
 return {openid:payload.openid,unionid:typeof payload.unionid==='string'&&payload.unionid.length<=128?payload.unionid:null};
}

async function credentialsForIdentity(repo,key){
 const index=await repo.get(key);
 if(!index)return null;
 const credentials=await repo.get(credentialsKey(index.username));
 if(!credentials||credentials.id!==index.userId)throw new AccountError(503,'微信账户资料暂时无法读取，请稍后重试。');
 return credentials;
}

export async function wechatLogin(config,{appId,code},fetcher=fetch){
 const identity=await exchangeWechatCode(config,{appId,code},fetcher);
 const repo=accountRepository(config),key=identityKey(appId,identity.openid);
 let credentials=await credentialsForIdentity(repo,key);
 if(!credentials){
  const candidate={
   id:randomBytes(16).toString('hex'),
   username:'wx_'+randomBytes(10).toString('hex'),
   nickname:'微信用户',
   authProvider:'wechat',
   wechat:{appId,openidHash:digest(appId+':'+identity.openid),...(identity.unionid?{unionidHash:digest(identity.unionid)}:{})},
   version:1,
   createdAt:new Date().toISOString()
  };
  await repo.put(credentialsKey(candidate.username),candidate,{onlyIfNew:true});
  try{
   await repo.put(key,{userId:candidate.id,username:candidate.username,createdAt:candidate.createdAt},{onlyIfNew:true});
   credentials=candidate;
  }catch(error){
   if(error.code!=='PRECONDITION_FAILED'&&error.status!==412){
    await repo.delete(credentialsKey(candidate.username)).catch(()=>{});
    throw error;
   }
   await repo.delete(credentialsKey(candidate.username)).catch(()=>{});
   credentials=await credentialsForIdentity(repo,key);
   if(!credentials)throw new AccountError(503,'微信账户建立未完成，请重试。');
  }
 }
 return {user:userView(credentials),token:await createAccountSession(config,credentials),profile:await getProfile(config,{id:credentials.id})};
}

export async function bindWechatIdentity(config,account,{appId,code},fetcher=fetch){
 const identity=await exchangeWechatCode(config,{appId,code},fetcher);
 const repo=accountRepository(config),key=identityKey(appId,identity.openid);
 const existing=await repo.get(key);
 if(existing&&existing.userId!==account.id)throw new AccountError(409,'这个微信账号已经绑定了其他账户。');
 let created=false;
 if(!existing){
  try{
   await repo.put(key,{userId:account.id,username:account.credentials.username,createdAt:new Date().toISOString()},{onlyIfNew:true});
   created=true;
  }catch(error){
   if(error.code!=='PRECONDITION_FAILED'&&error.status!==412)throw error;
   const winner=await repo.get(key);
   if(winner?.userId!==account.id)throw new AccountError(409,'这个微信账号已经绑定了其他账户。');
  }
 }
 const credentials={
  ...account.credentials,
  wechat:{appId,openidHash:digest(appId+':'+identity.openid),...(identity.unionid?{unionidHash:digest(identity.unionid)}:{})}
 };
 try{await repo.put(credentialsKey(credentials.username),credentials);}
 catch(error){if(created)await repo.delete(key).catch(()=>{});throw error;}
 return {user:userView(credentials),profile:await getProfile(config,account)};
}
