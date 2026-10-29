import {findReusableImage,reuseArchivedImage} from './image-reuse.mjs';
import {createHash} from 'node:crypto';
import {deviceServiceCall,listDevices} from './devices.mjs';
import {openPayload,sealPayload,generationSettings} from './automation.mjs';
import {validateInput,calendarFor,buildImagePrompt} from './domain.mjs';
import {analyzeMapping} from './service.mjs';
import {doubao} from './providers.mjs';
import {saveArtwork,getArtwork,accountHistory,profileSignature,persistImage,privateImage} from './accounts.mjs';

// The clock and due date come from the queue server, never from a browser or worker arguments.
export async function runDailyTick(config,{fetcher=fetch,analyze=analyzeMapping,generate=doubao,archive=persistImage,allowPaid=false}={}){
 if(!allowPaid)throw new Error('后台生成未启用；需显式授权付费调用，或使用独立假模型测试。');
 const call=(path,body)=>deviceServiceCall(config,'/internal/automation/'+path,body,fetcher);
 const {job}=await call('claim',{});if(!job)return {idle:true};
 const account={id:job.ownerId};let payload={};
 const transition=body=>call('transition',{id:job.id,lease:job.lease,...body});
 const checkpoint=async stage=>{await transition({action:'checkpoint',stage,payload:sealPayload(config,payload)});job.stage=stage;};
 try{
  payload=job.payload?openPayload(config,job.payload):{};
  const settings=openPayload(config,job.snapshot);
  if(generationSettings(config,settings.profile).fingerprint!==job.fingerprint)throw new Error('worker_configuration_changed');
  if(job.stage==='queued'){
   await transition({action:'begin_analysis'});
   const input=validateInput(settings.profile,job.contentDate),calendar=calendarFor(input);
   const usage=[];
   const mapping=await analyze({...config,BEFORE_TEXT_CALL:async()=>{const gate=await transition({action:'begin_text'});if(!gate.ok)throw new Error('text_quota');},PROVIDER_USAGE:event=>usage.push(event)},input,calendar,await accountHistory(config,account,input),fetcher);
   // Stable across process restarts, sorted by content date in the existing gallery.
   const id=(0xffffffffffff-Date.parse(job.contentDate+'T00:00:00+08:00')).toString(16).padStart(12,'0')+job.id.slice(0,24);
   payload={record:{id,userId:account.id,date:job.contentDate,createdAt:new Date().toISOString(),input,calendar,mapping,profileSignature:profileSignature(input),status:'mapped',image:null,source:'automatic',publicationState:'generated',generation:{jobId:job.id,fingerprint:job.fingerprint,versions:settings.versions},providerUsage:usage},deliveries:{}};
   await checkpoint('mapped');
  }
  if(job.stage==='mapped'){
   await saveArtwork(config,account,payload.record);
   const match=await findReusableImage(config,account,payload.record);
   if(match){
    await transition({action:'begin_reuse',sourceArtworkId:match.source.id});
    await reuseArchivedImage(config,account,payload.record,match);
   }else{
    const reservation=await transition({action:'begin_image'});if(!reservation.ok)return {id:job.id,status:'quota'};
    const result=await generate(config,buildImagePrompt(payload.record.mapping),fetcher,true);
    payload.record.pendingImageURL=result.url;payload.record.pendingImageExpires=Date.now()+23*3600000;
    if(result.provider)payload.record.providerUsage.push(result.provider);
   }
   // Commit the returned URL before archiving so an archive failure never regenerates a paid image.
   await checkpoint('image_ready');
  }
  if(job.stage==='image_ready'){
   let existing;try{existing=await getArtwork(config,account,payload.record.id);}catch(e){if(e.status!==404)throw e;}
   if(existing?.image){payload.record=existing;}
   else{
    if(payload.record.pendingImageExpires<Date.now())throw new Error('archive_url_expired');
    await archive(config,account,payload.record,payload.record.pendingImageURL,fetcher);
   }
   await checkpoint('archived');
  }
  if(job.stage==='archived'){
   const image=await privateImage(config,account,payload.record);
   const active=new Set((await listDevices(config,account,fetcher)).items.map(d=>d.id));
   if(!job.targets.some(target=>active.has(target.id)))throw new Error('no_active_targets');
   for(const target of job.targets){
    if(!active.has(target.id))continue;
    await transition({action:'renew'});
    const requestId=createHash('sha256').update(job.id+'|'+target.id+'|'+job.policyVersion).digest('hex').slice(0,32);
    const result=await deviceServiceCall(config,'/internal/select',{ownerId:account.id,deviceId:target.id,artworkId:payload.record.id,contentDate:job.contentDate,imageBase64:image.bytes.toString('base64'),expectedRevision:target.expectedRevision,requestId,automation:{id:job.id,lease:job.lease}},fetcher);
    payload.deliveries[target.id]=result.revision;
   }
   payload.record.publicationState='published';payload.record.publishedAt=new Date().toISOString();
   payload.record.deliveries=payload.deliveries;await saveArtwork(config,account,payload.record);
   await checkpoint('complete');
  }
  return {id:job.id,status:'complete',artworkId:payload.record.id,imageReused:!!payload.record.imageReuse};
 }catch(error){
  // Never expose provider diagnostics, birth details, image URLs, tokens, or encrypted payloads in logs.
  try{await transition({action:'fail'});}catch{}
  return {id:job.id,status:'interrupted',reason:['policy_conflict','lease_conflict','revision_conflict'].includes(error.code)?error.code:'stage_failed'};
 }
}
