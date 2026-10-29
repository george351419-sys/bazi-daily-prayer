import {randomBytes} from 'node:crypto';
import {linkedRitualReportForDevice} from './ark-cloud.mjs';
import {answers,actionSlots,actionPlans} from '../content/ritual-content.mjs';
import {accountRepository,AccountError} from './account-store.mjs';
import {getArtwork} from './accounts.mjs';
import {ritualDeviceForAccount} from './ritual-device.mjs';
export {answers,actionSlots,actionPlans};
const DAY=86400000;
export const ritualArtworkReady=record=>record?.status==='complete'&&!!record.image&&(record.source!=='automatic'||record.publicationState==='published');
export function ritualPosition(plan,now=Date.now()){
 const start=Date.parse(plan.startsAt);
 if(!Number.isFinite(start)||!['test','daily'].includes(plan.mode)||!Number.isFinite(now))throw new Error('Invalid ritual schedule');
 if(plan.mode==='test'){
  const step=Math.max(0,Math.floor((now-start)/120000));
  return {dayIndex:Math.floor(step/8)%2,actionIndex:step%8,nextAt:new Date(now<start?start:start+(step+1)*120000).toISOString(),cycle:Math.floor(step/16)};
 }
 const local=new Date(now+8*3600000),date=local.toISOString().slice(0,10),hour=local.getUTCHours();
 const boundary=Date.parse(date+'T01:00:00+08:00');
 const contentStart=now<boundary?boundary-DAY:boundary;
 const index=Math.floor((contentStart-start)/DAY);
 const nextHour=hour<7?7:hour<23?7+2*(Math.floor((hour-7)/2)+1):25;
 const next=Date.parse(date+'T00:00:00+08:00')+nextHour*3600000;
 const expired=index>1,notStarted=now<start;
 return {dayIndex:Math.max(0,index),actionIndex:!expired&&!notStarted&&hour>=7&&hour<23?Math.floor((hour-7)/2):null,nextAt:new Date(Math.min(next,contentStart+DAY)).toISOString(),contentDate:new Date(contentStart+8*3600000).toISOString().slice(0,10),expired,notStarted};
}
export function searchAnswers(query=''){
 const q=String(query).normalize('NFKC').trim().toLowerCase().slice(0,120);
 return answers.filter(a=>!q||[a.id,a.text,a.theme,a.tendency,a.phone_detail].some(v=>v.toLowerCase().includes(q)));
}
export async function configureRitual(c,account,body,{onlyIfNew=false}={}){
 const contentMode=body.contentMode??'prayer',showActions=body.showActions??true;
 if(!['prayer','photo'].includes(contentMode)||typeof showActions!=='boolean')throw new AccountError(400,'请选择祈福图或个人照片，并设置是否显示微行动。');
 if(!['test','daily'].includes(body.mode)||!Array.isArray(body.artworkIds)||body.artworkIds.length!==2||(contentMode==='prayer'&&new Set(body.artworkIds).size!==2))throw new AccountError(400,contentMode==='photo'?'请选择已上传的照片。':'请选择两幅不同的已完成画作。');
 const records=await Promise.all(body.artworkIds.map(id=>getArtwork(c,account,id)));
 if(records.some(r=>!ritualArtworkReady(r)))throw new AccountError(400,'请先完成两幅画作；自动生成的作品需完成发布。');
 if(records.some(r=>(r.source==='upload')!==(contentMode==='photo')))throw new AccountError(400,'祈福模式请选择祈福画；个人照片模式请选择自己上传的照片。');
 const now=Date.now(),date=new Date(now+7*3600000).toISOString().slice(0,10);
 const plan={version:1,revision:randomBytes(16).toString('hex'),contentMode,showActions,mode:body.mode,startsAt:body.mode==='test'?new Date(now).toISOString():date+'T01:00:00+08:00',artworkIds:body.artworkIds,updatedAt:new Date(now).toISOString(),deviceState:'not_provisioned'};
 try{await accountRepository(c).put('ritual/'+account.id,plan,onlyIfNew?{onlyIfNew:true}:{});}catch(error){if(!onlyIfNew||error.code!=='PRECONDITION_FAILED')throw error;}
 return ritualStatus(c,account);
}
const samePlan=(a,b)=>a?.revision&&b?.revision?a.revision===b.revision:a?.updatedAt===b?.updatedAt&&a?.startsAt===b?.startsAt&&a?.mode===b?.mode&&JSON.stringify(a?.artworkIds)===JSON.stringify(b?.artworkIds);
export function ritualPublication(build){return build?.publication||(build?.manifest&&build?.sha256?{manifest:build.manifest,sha256:build.sha256,publishedAt:build.publishedAt,bytes:build.bytes,signature:build.signature}:null);}
export async function ritualStatus(c,account,now=Date.now()){
 const binding=await ritualDeviceForAccount(c,account.id),syncConfigured=!!binding;
 const repo=accountRepository(c),plan=await repo.get('ritual/'+account.id),build=await repo.get('ritual-build/'+account.id);
 if(!plan)return {syncConfigured,device:binding?{id:binding.deviceId,status:binding.status||'ready'}:null,plan:null,build:build?{status:build.status,note:build.note}:null,answersCount:answers.length,actionGuide:actionSlots};
 const published=ritualPublication(build),current=published&&samePlan(published.manifest,plan);
 let report=null;try{report=await linkedRitualReportForDevice(c,account,binding?.deviceId);}catch{}
 const reportPublication=[published,build?.previousPublication].find(p=>p&&p.sha256===(report?.renderSha||report?.targetSha));
 const candidate=reportPublication&&report?.renderReport?report.renderReport:null;
 const reported=candidate&&[0,1].includes(candidate.day)&&Number.isInteger(candidate.action)&&candidate.action>=-1&&candidate.action<8&&Number.isInteger(candidate.answer)&&candidate.answer>=-1&&candidate.answer<answers.length?candidate:null;
 // A new requested plan must never relabel an old package's screen report.
 const displayPlan=reported?reportPublication.manifest:current?published.manifest:plan;
 const anchored=displayPlan.mode==='test'&&reported?.startedAt>=1700000000&&reported.startedAt*1000<=now+300000?{...displayPlan,startsAt:new Date(reported.startedAt*1000).toISOString()}:displayPlan;
 const scheduledPosition=ritualPosition(anchored,now);
 const position=reported?{...scheduledPosition,dayIndex:reported.day,actionIndex:reported.action>=0?reported.action:null}:{...scheduledPosition,dayIndex:displayPlan.contentMode==='photo'?Math.min(1,scheduledPosition.dayIndex):scheduledPosition.dayIndex};
 if(displayPlan.showActions===false)position.actionIndex=null;
 const available=position.dayIndex>=0&&position.dayIndex<2;
 const records=await Promise.all(displayPlan.artworkIds.map(id=>getArtwork(c,account,id)));
 const requestedRecords=JSON.stringify(plan.artworkIds)===JSON.stringify(displayPlan.artworkIds)?records:await Promise.all(plan.artworkIds.map(id=>getArtwork(c,account,id)));
 const days=records.map((r,i)=>({artworkId:r.id,date:r.date,title:r.mapping.title,source:r.source||'generated',actions:displayPlan.days?.[i]?.actions?.length===8?displayPlan.days[i].actions:actionPlans[i]}));
 const record=available?records[position.dayIndex]:null,asOf=reported?report.lastSeen:null;
 return {syncConfigured,device:binding?{id:binding.deviceId,status:binding.status||'ready'}:null,plan,displayPlan,displaySource:reported?'device_report':'schedule_preview',pendingUpdate:!current,deviceReport:report?{lastSeen:report.lastSeen,firmwareUpdateRequired:!!report.firmwareUpdateRequired,stored:report.stored,showingPrevious:reported&&reportPublication.sha256!==published?.sha256,renderReport:reported,answerId:reported?.answer>=0?answers[reported.answer]?.id:null,stale:now-Date.parse(report.lastSeen)>(displayPlan.mode==='test'?5*60000:3*3600000)}:null,build:build?{status:build.status,publishedAt:published?.publishedAt,bytes:published?.bytes,note:build.note,nextAttemptAt:build.nextAttemptAt}:null,position,scheduledPosition,asOf,available,displayConfirmed:false,notice:reported?'依据设备最近的上屏回报展示主图和动作；请留意最近联网时间。':available?'网页计划预览；设备实际呈现以设备回执为准。':'两天内容已用完，等待后台生成新内容；设备保留最后画面。',artwork:record?{id:record.id,title:record.mapping.title,date:record.date,source:record.source||'generated',image:'/api/account/artworks/'+record.id+'/image',mapping:record.mapping}:null,action:available&&position.actionIndex!==null?days[position.dayIndex].actions[position.actionIndex]:null,answer:reported?.answer>=0?answers[reported.answer]:null,days,plannedDays:requestedRecords.map(r=>({artworkId:r.id,date:r.date,title:r.mapping.title,source:r.source||'generated'})),answersCount:answers.length,actionGuide:actionSlots};
}
