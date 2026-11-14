import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ritualArtworkReady,ritualPublication} from './ritual.mjs';
import {profileSignature} from './accounts.mjs';
import {validateInput} from './domain.mjs';

const MINUTE=60000;
export function ritualWorkerAlerts(state,{now=Date.now(),preparationGraceMinutes=30,publicationGraceMinutes=20,receiptGraceMinutes=30}={}){
 if(!state.deviceId||state.plan?.mode!=='daily'||state.plan.contentMode!=='prayer')return [];
 const today=new Date(now+7*3600000).toISOString().slice(0,10);
 const tomorrow=new Date(Date.parse(today+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const boundary=Date.parse(today+'T01:00:00+08:00');
 const accountId=state.accountId,alerts=[],build=state.build,publication=ritualPublication(build);
 const issue=(kind,identity,message)=>alerts.push({key:[accountId,kind,identity].join(':'),kind,accountId,deviceId:state.deviceId,message,...(kind==='publication_failed'?{delayMs:publicationGraceMinutes*MINUTE}:{})});
 let signature;
 if(state.profile)signature=profileSignature(validateInput(state.profile,today));
 const ready=!!signature&&(state.records||[]).some(r=>r.date===tomorrow&&r.profileSignature===signature&&ritualArtworkReady(r));
 const days=publication?.manifest?.days||[];
 const publishedTomorrow=days.some(d=>d.date===tomorrow)&&days.some(d=>d.date===today);
 if(now>=boundary+preparationGraceMinutes*MINUTE&&!ready)issue('tomorrow_not_ready',tomorrow,`${tomorrow} 次日祈福画尚未就绪，准备状态：${state.preparation?.status||'none'}`);
  const failure=build?.failure||['retrying','failed'].includes(build?.status);
 if(failure)
  issue('publication_failed',state.plan.revision||today,`内容发布持续失败，阶段：${build.failure?.stage||build.stage||build.status}`);
 else if(ready&&!publishedTomorrow&&now>=boundary+(preparationGraceMinutes+publicationGraceMinutes)*MINUTE)
  issue('publication_failed',today,`${today}／${tomorrow} 两日内容已具备次日画作，但尚未发布当前两日包，构建状态：${build?.status||'none'}`);
 const publishedAt=Date.parse(publication?.publishedAt||'');
 const report=state.deviceReport;
 const stored=publication?.sha256&&report?.targetSha===publication.sha256&&report.stored===true&&Date.parse(report.lastSeen)>=publishedAt;
 if(publication?.sha256&&Number.isFinite(publishedAt)&&now-publishedAt>=receiptGraceMinutes*MINUTE&&!stored)
  issue('device_unconfirmed',publication.sha256,`内容包发布超过 ${receiptGraceMinutes} 分钟，未收到该包保存回报；设备最后回报：${report?.lastSeen||'无'}；请检查唤醒和联网状态。`);
 return alerts;
}

export async function loadAlertState(file){
 try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}
}
export async function saveAlertState(file,state){
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temp=file+'.'+randomBytes(5).toString('hex');
 await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,file);
}
// Deliver before recording success: failures remain pending on the next poll.
export async function reconcileAlerts(previous,issues,{now=Date.now(),repeatMs=6*3600000,send=async()=>{}}={}){
 const next={...previous},active=new Map(issues.map(issue=>[issue.key,issue]));
 for(const issue of issues){
  const old=previous[issue.key];
  const since=old?.firstSeen||now;
  const firstObserved=old?.observedAt||now;
  const grace=issue.delayMs||0;
  if(now-since<grace){next[issue.key]={...issue,firstSeen:since,observedAt:firstObserved,lastSent:old?.lastSent||null};continue;}
  if(!old?.lastSent||now-old.lastSent>=repeatMs){
   try{await send({...issue,recovered:false,firstSeen:since});next[issue.key]={...issue,firstSeen:since,observedAt:firstObserved,lastSent:now};}
   catch{next[issue.key]={...issue,firstSeen:since,observedAt:firstObserved,lastSent:old?.lastSent||null};}
  }
 }
 for(const [key,old] of Object.entries(previous)){
  if(active.has(key))continue;
  if(old.lastSent){try{await send({...old,recovered:true});}catch{continue;}}
  delete next[key];
 }
 return next;
}

export function alertText(issue){return `[画屏${issue.recovered?'告警恢复':'告警'}] ${issue.kind}\n账户：${issue.accountId||'worker'}\n设备：${issue.deviceId||'无'}\n${issue.message}`;}
export function createAlertSender(c,{fetcher=fetch,log=console.log}={}){
 const provider=c.RITUAL_ALERT_PROVIDER||'log';
 if(!['log','wecom','feishu'].includes(provider))throw new Error('Invalid RITUAL_ALERT_PROVIDER');
 let url;
 if(provider!=='log'){
  url=new URL(c.RITUAL_ALERT_WEBHOOK||'');
  const expected=provider==='wecom'?'qyapi.weixin.qq.com':'open.feishu.cn';
  if(url.protocol!=='https:'||url.hostname!==expected)throw new Error('Alert webhook must use the provider HTTPS host');
 }
 return async issue=>{
  const text=alertText(issue);
  if(provider==='log'){log(JSON.stringify({event:'ritual-alert',...issue}));return;}
  const body=provider==='wecom'?{msgtype:'text',text:{content:text}}:{msg_type:'text',content:{text}};
  try{
   const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('http');
   const result=await response.json();
   if(provider==='wecom'?result.errcode!==0:result.code!==0&&result.StatusCode!==0)throw new Error('provider');
  }catch{throw new Error('Alert delivery failed');}
 };
}
