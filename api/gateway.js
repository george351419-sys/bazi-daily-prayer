import {allowedMiniProgram} from '../lib/miniprogram-access.mjs';
import {uploadPhoto} from '../lib/photos.mjs';
import {ritualStatus,configureRitual,searchAnswers} from '../lib/ritual.mjs';
import {bindRitualDevice,unbindRitualDevice} from '../lib/ritual-device.mjs';
import {prepareRitualPair} from '../lib/ritual-pair.mjs';
import {handleRitualWorkerRequest} from '../lib/ritual-worker-bridge.mjs';
import {findReusableImage,reuseArchivedImage,indexArtworkImage} from '../lib/image-reuse.mjs';
import {automationStatus,configureAutomation,saveProfileSafely,retryAutomation} from '../lib/automation.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {WISH_GROUPS,RULE_VERSION,validateInput,calendarFor,buildImagePrompt,todayShanghai} from '../lib/domain.mjs';
import {analyzeMapping} from '../lib/service.mjs';
import {createSession,verifySession,csrfFor,sealJob,openJob} from '../lib/tokens.mjs';
import {doubao,publicProviderError} from '../lib/providers.mjs';
import {devicesEnabled,listDevices,claimDevice,selectDeviceArtwork,unbindDevice,devicePreview} from '../lib/devices.mjs';
import {accountsEnabled,AccountError,userView,accountCookie,register,login,recover,logout,currentAccount,requireAccount,getProfile,newArtworkId,saveArtwork,getArtwork,listArtworks,accountHistory,profileSignature,persistImage,privateImage} from '../lib/accounts.mjs';
const rate=new Map();
const accountJob=(c,account,record)=>({id:record.id,source:record.source||'generated',status:record.status==='complete'?'complete':'mapped',phase:record.status==='complete'?'已从画册载入':record.source==='automatic'?'每日画作正在后台准备':'解读已归档，待绘制画面',date:record.date,createdAt:record.createdAt,input:record.input,calendar:record.calendar,mapping:record.mapping,image:record.image?'/api/account/artworks/'+record.id+'/image':null,token:sealJob(c,{id:record.id,owner:'account:'+account.id,accountId:account.id,mapping:record.mapping,expires:Date.now()+86400000}),error:null,archived:true,managedAutomatically:record.source==='automatic',imageReuse:record.imageReuse?{sourceArtworkId:record.imageReuse.sourceArtworkId,sourceDate:record.imageReuse.sourceDate}:null});

const send=(res,status,data)=>res.status(status).json(data);
export default function handler(req,res){return handleRequest(req,res,process.env);}
export async function handleRequest(req,res,config){
 const startedAt=Date.now(),origin=req.headers.origin,miniProgram=allowedMiniProgram(req,config);
 // EdgeOne may reconstruct request.url with an internal host; trust our explicit public origins.
 const allowed=new Set(['https://playmath.cn','https://www.playmath.cn','https://george351419-sys.github.io',...(config.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)]);
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
 const own=(/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(req.headers.host||'')?'http://':'https://')+req.headers.host;
 if(origin&&origin!==own&&!allowed.has(origin)&&!(miniProgram&&origin==='https://servicewechat.com'))return send(res,403,{error:'此页面尚未获准连接后端。'});
 if(origin){res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Session-Token, X-CSRF-Token');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS')return res.status(204).end();
 const route=String(req.query.route||new URL(req.url,'http://localhost').pathname.replace(/^\/api\//,'')).replace(/^\//,'');
  if(route.startsWith('internal/ritual-worker/')){
   try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const result=await handleRitualWorkerRequest(config,{method:req.method,path:pathname,headers:req.headers,body:req.body});
    if(result.bytes){res.setHeader('Content-Type',result.contentType||'application/octet-stream');return res.status(200).end(result.bytes);}
    return send(res,200,result);
   }catch(error){return send(res,error instanceof AccountError?error.status:503,{error:error instanceof AccountError?error.message:'内部 Worker 服务暂时不可用。'});}
  }
 let session=verifySession(config,req.headers['x-session-token']);
 try{
  if(route==='bootstrap'&&req.method==='GET'){
   session=session||createSession(config);return send(res,200,{csrf:csrfFor(config,session),sessionToken:session,date:todayShanghai(),wishGroups:WISH_GROUPS,ready:{text:!!config.DEEPSEEK_API_KEY,image:!!config.ARK_API_KEY},version:RULE_VERSION,accounts:{enabled:accountsEnabled(config),emailEnabled:false},devices:{enabled:accountsEnabled(config)&&devicesEnabled(config)},miniProgram:{enabled:miniProgram}});
  }
  if(!session)return send(res,403,{error:'页面会话已更新，请刷新重试。'});
  if(req.method==='POST'&&req.headers['x-csrf-token']!==csrfFor(config,session))return send(res,403,{error:'页面会话校验失败，请刷新重试。'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const accountMode=accountsEnabled(config);
  if(accountMode&&req.method==='POST'&&!origin&&!miniProgram)return send(res,403,{error:'请从祈福网站提交账户请求。'});
  if(route.startsWith('account/')){
   if(!accountMode)throw new AccountError(503,'账户服务尚未开启。');
   const client=String(req.headers['eo-connecting-ip']||req.headers['x-real-ip']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,80);
   if(['account/register','account/login','account/recover'].includes(route)&&req.method==='POST'){
    const result=await ({'account/register':register,'account/login':login,'account/recover':recover}[route])(config,body,client);
    res.setHeader('Set-Cookie',accountCookie(config,result.token));return send(res,200,{user:result.user,profile:result.profile,recoveryCode:result.recoveryCode});
   }
   if(route==='account/me'&&req.method==='GET'){const account=await currentAccount(config,req);return send(res,200,{user:account?userView(account):null,profile:account?await getProfile(config,account):null});}
   if(route==='account/logout'&&req.method==='POST'){await logout(config,await currentAccount(config,req));res.setHeader('Set-Cookie',accountCookie(config,'',true));return send(res,200,{ok:true});}
   const account=await requireAccount(config,req);
   if(route==='account/photos'&&req.method==='POST')return send(res,201,await uploadPhoto(config,account,body));
   if(route==='account/ritual'&&req.method==='GET')return send(res,200,await ritualStatus(config,account));
   if(route==='account/ritual'&&req.method==='POST')return send(res,200,await configureRitual(config,account,body));
   if(route==='account/ritual/device'&&req.method==='POST'){const result=await bindRitualDevice(config,account,body.deviceId);return send(res,200,{ok:true,device:{id:result.binding.deviceId,status:result.binding.status},ritual:await ritualStatus(config,account)});}
   if(route==='account/ritual/device/unbind'&&req.method==='POST')return send(res,200,{...await unbindRitualDevice(config,account),ritual:await ritualStatus(config,account)});
   if(route==='account/ritual/prepare'&&req.method==='POST'){
    const prepared=await prepareRitualPair(config,account,{mode:body.mode});
    return send(res,200,{status:prepared.status,artworkIds:prepared.artworkIds||null,job:prepared.record?accountJob(config,account,prepared.record):null});
   }
   if(route==='account/answers'&&req.method==='GET'){
    const query=new URL(req.url,'http://localhost').searchParams.get('q')?.trim();
    return send(res,200,{items:query?searchAnswers(query):[]});
   }
   if(route==='account/automation/retry'&&req.method==='POST')return send(res,200,await retryAutomation(config,account,body));
   if(route==='account/automation'&&req.method==='GET')return send(res,200,await automationStatus(config,account));
   if(route==='account/automation'&&req.method==='POST')return send(res,200,await configureAutomation(config,account,body));
   if(route==='account/devices'&&req.method==='GET')return send(res,200,await listDevices(config,account));
   if(route==='account/devices/claim'&&req.method==='POST')return send(res,200,await claimDevice(config,account,body));
   const devicePreviewRoute=route.match(/^account\/devices\/([a-zA-Z0-9_-]{8,64})\/preview$/);
   if(devicePreviewRoute&&req.method==='GET'){const bytes=await devicePreview(config,account,devicePreviewRoute[1],new URL(req.url,'http://localhost').searchParams.get('revision'));res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','private, no-store');res.setHeader('Cross-Origin-Resource-Policy','same-site');return res.status(200).end(bytes);}
   const deviceRoute=route.match(/^account\/devices\/([a-zA-Z0-9_-]{8,64})\/(artwork|unbind)$/);
   if(deviceRoute&&req.method==='POST')return send(res,200,await (deviceRoute[2]==='artwork'?selectDeviceArtwork(config,account,deviceRoute[1],body):unbindDevice(config,account,deviceRoute[1])));
   if(route==='account/profile'&&req.method==='POST'){return send(res,200,{profile:await saveProfileSafely(config,account,body)});}
   if(route==='account/artworks'&&req.method==='GET')return send(res,200,await listArtworks(config,account,new URL(req.url,'http://localhost').searchParams.get('cursor')||''));
   const saved=route.match(/^account\/artworks\/([a-f0-9]{36})(\/image)?$/);
   if(saved&&req.method==='GET'){
    const record=await getArtwork(config,account,saved[1]);
    if(saved[2]){const image=await privateImage(config,account,record);res.setHeader('Content-Type',image.type);res.setHeader('Cache-Control','private, no-store');res.setHeader('Cross-Origin-Resource-Policy','same-site');return res.status(200).end(image.bytes);}
    return send(res,200,accountJob(config,account,record));
   }
   return send(res,404,{error:'账户接口不存在。'});
  }
  if(route==='analyze'&&req.method==='POST'){
   if(!config.DEEPSEEK_API_KEY)return send(res,503,{error:'服务端尚未配置 DeepSeek API Key。'});
   const input=validateInput(body),account=accountMode?await requireAccount(config,req):null,id=account?newArtworkId():randomBytes(18).toString('hex');
   const rateId=createHash('sha256').update(session).digest('hex');if(Date.now()-(rate.get(rateId)||0)<3000)return send(res,429,{error:'请稍候再提交。'});rate.set(rateId,Date.now());
   if(account)await saveProfileSafely(config,account,input);
   const calendar=calendarFor(input),history=account?await accountHistory(config,account,input):Array.isArray(body.history)?body.history.slice(-14).map(x=>({date:String(x.date).slice(0,10),deity:String(x.deity).slice(0,40),wish:String(x.wish).slice(0,3)})):[];
   const analysisConfig=account?{...config,ANALYSIS_BUDGET_MS:Math.max(1000,(Number(config.ANALYSIS_BUDGET_MS)||108000)-(Date.now()-startedAt)-5000)}:config;
   const mapping=await analyzeMapping(analysisConfig,input,calendar,history);
   if(account){const record={id,userId:account.id,date:input.today,createdAt:new Date().toISOString(),input,calendar,mapping,profileSignature:profileSignature(input),status:'mapped',image:null};await saveArtwork(config,account,record);return send(res,200,accountJob(config,account,record));}
   const job={id,owner:session,date:input.today,mapping,expires:Date.now()+86400000};
   return send(res,200,{id,status:'mapped',phase:'解读已完成',date:input.today,calendar,mapping,token:sealJob(config,job),error:null,image:null});
  }
  const image=route.match(/^jobs\/([a-f0-9]{36})\/image$/);
  if(image&&req.method==='POST'){
   const account=accountMode?await requireAccount(config,req):null;
   const job=openJob(config,body.jobToken,account?'account:'+account.id:session);if(job.id!==image[1])throw new Error('生成记录不匹配。');
   if(account){
    const record=await getArtwork(config,account,job.id);if(record.image){await indexArtworkImage(config,account,record);return send(res,200,accountJob(config,account,record));}
    if(record.source==='automatic')throw new AccountError(409,'这幅每日画作由后台处理，请在我的画屏中查看进度；归档或发布失败时可在该处重试。');
    if(!record.pendingImageURL||record.pendingImageExpires<Date.now()){
     const match=await findReusableImage(config,account,record);
     if(match){await reuseArchivedImage(config,account,record,match);return send(res,200,accountJob(config,account,record));}
     if(!config.ARK_API_KEY)return send(res,503,{error:'服务端尚未配置豆包 API Key。'});
     const result=await doubao({...config,ARK_TIMEOUT_MS:'85000'},buildImagePrompt(record.mapping),fetch,true);record.pendingImageURL=result.url;record.pendingImageExpires=Date.now()+23*3600000;await saveArtwork(config,account,record);
    }
    await persistImage(config,account,record,record.pendingImageURL);return send(res,200,accountJob(config,account,record));
   }
   // Return URL directly so the browser can show the image without Vercel's response-size limit.
   if(!config.ARK_API_KEY)return send(res,503,{error:'服务端尚未配置豆包 API Key。'});
   const result=await doubao(config,buildImagePrompt(job.mapping),fetch,true);
   return send(res,200,{id:job.id,status:'complete',phase:'今日祈福画已完成',date:job.date,mapping:job.mapping,token:body.jobToken,error:null,image:result.url});
  }
  return send(res,404,{error:'接口不存在。'});
 }catch(e){if(e.analysisValidationFailed)return send(res,503,{error:'祈福方案还未通过一致性检查，未启动绘图。请稍后重试，无需修改出生资料。',code:'analysis_validation_failed'});if(e instanceof AccountError)return send(res,e.status,{error:e.message,...(['revision_conflict','policy_conflict','profile_conflict'].includes(e.code)?{code:e.code}:{})});if(['MISSING_ENVIRONMENT','MISSING_PROJECT_ID','CREDENTIAL_ERROR','COS_ERROR','QUOTA_EXCEEDED','RATE_LIMITED'].includes(e.code)){console.warn('Account storage unavailable:',e.code);return send(res,503,{error:'账户存储暂时不可用，请稍后再试。'});}const err=e.service?publicProviderError(e):String(e.message).slice(0,180);return send(res,e.service?502:400,{error:err});}
}
