import {randomBytes,createHash} from 'node:crypto';
import {WISH_GROUPS,RULE_VERSION,validateInput,calendarFor,buildImagePrompt,todayShanghai} from '../lib/domain.mjs';
import {analyzeMapping} from '../lib/service.mjs';
import {createSession,verifySession,csrfFor,sealJob,openJob} from '../lib/tokens.mjs';
import {doubao,publicProviderError} from '../lib/providers.mjs';
const config=process.env;
const rate=new Map();
const send=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
 const origin=req.headers.origin;
 const allowed=(config.ALLOWED_ORIGINS||'https://george351419-sys.github.io').split(',').map(x=>x.trim());
 const own='https://'+req.headers.host;
 if(origin&&origin!==own&&!allowed.includes(origin))return send(res,403,{error:'此页面尚未获准连接后端。'});
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Session-Token, X-CSRF-Token');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS')return res.status(204).end();
 const route=String(req.query.route||new URL(req.url,'http://localhost').pathname.replace(/^\/api\//,'')).replace(/^\//,'');
 let session=verifySession(config,req.headers['x-session-token']);
 try{
  if(route==='bootstrap'&&req.method==='GET'){
   session=session||createSession(config);return send(res,200,{csrf:csrfFor(config,session),sessionToken:session,date:todayShanghai(),wishGroups:WISH_GROUPS,ready:{text:!!config.DEEPSEEK_API_KEY,image:!!config.ARK_API_KEY},version:RULE_VERSION});
  }
  if(!session)return send(res,403,{error:'页面会话已更新，请刷新重试。'});
  if(req.method==='POST'&&req.headers['x-csrf-token']!==csrfFor(config,session))return send(res,403,{error:'页面会话校验失败，请刷新重试。'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(route==='analyze'&&req.method==='POST'){
   if(!config.DEEPSEEK_API_KEY)return send(res,503,{error:'服务端尚未配置 DeepSeek API Key。'});
   const input=validateInput(body),id=randomBytes(18).toString('hex');
   const rateId=createHash('sha256').update(session).digest('hex');if(Date.now()-(rate.get(rateId)||0)<3000)return send(res,429,{error:'请稍候再提交。'});rate.set(rateId,Date.now());
   const calendar=calendarFor(input),history=Array.isArray(body.history)?body.history.slice(-14).map(x=>({date:String(x.date).slice(0,10),deity:String(x.deity).slice(0,40),wish:String(x.wish).slice(0,3)})):[];
   const mapping=await analyzeMapping(config,input,calendar,history);
   const job={id,owner:session,date:input.today,mapping,expires:Date.now()+86400000};
   return send(res,200,{id,status:'mapped',phase:'解读已完成',date:input.today,calendar,mapping,token:sealJob(config,job),error:null,image:null});
  }
  const image=route.match(/^jobs\/([a-f0-9]{36})\/image$/);
  if(image&&req.method==='POST'){
   if(!config.ARK_API_KEY)return send(res,503,{error:'服务端尚未配置豆包 API Key。'});
   const job=openJob(config,body.jobToken,session);if(job.id!==image[1])throw new Error('生成记录不匹配。');
   // Return URL directly so the browser can show the image without Vercel's response-size limit.
   const result=await doubao(config,buildImagePrompt(job.mapping),fetch,true);
   return send(res,200,{id:job.id,status:'complete',phase:'今日祈福画已完成',date:job.date,mapping:job.mapping,token:body.jobToken,error:null,image:result.url});
  }
  return send(res,404,{error:'接口不存在。'});
 }catch(e){const err=e.service?publicProviderError(e):String(e.message).slice(0,180);return send(res,e.service?502:400,{error:err});}
}
