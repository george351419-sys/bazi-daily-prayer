import {artworkFoundationIssues} from './reading-display.mjs';
import {randomBytes} from 'node:crypto';
import {accountRepository} from './account-store.mjs';
import {getArtwork,getProfile,profileSignature,persistImage,saveArtwork} from './accounts.mjs';
import {prepareRitualPair} from './ritual-pair.mjs';
import {validateInput,buildImagePrompt} from './domain.mjs';
import {doubao} from './providers.mjs';
import {findReusableImage,reuseArchivedImage} from './image-reuse.mjs';

export async function enqueueRitualPreparation(c,account,record,{activatePrayer=false}={}){
 if(!record.image||record.source==='upload'||record.source==='ritual-pair')return;
 const repo=accountRepository(c),key='ritual-preparation/'+account.id,old=await repo.get(key);
 const plan=await repo.get('ritual/'+account.id);
 if(!activatePrayer&&old?.activatePrayer&&!['complete','superseded'].includes(old.status))return old;
 if(plan?.contentMode==='photo'&&!activatePrayer)return {status:'photo'};
 if(old?.artworkId===record.id&&(!activatePrayer||(old.activatePrayer&&old.previousRevision===(plan?.revision||null))||(plan?.contentMode==='prayer'&&plan.artworkIds?.includes(record.id)))&&old.status!=='superseded')return old;
 const task={id:randomBytes(16).toString('hex'),artworkId:record.id,date:record.date,signature:record.profileSignature,...(activatePrayer?{activatePrayer:true,previousRevision:plan?.revision||null}:{}),status:'queued',createdAt:new Date().toISOString()};
 await repo.put(key,task);return task;
}
export async function advanceRitualPreparation(c,account,{prepare=prepareRitualPair,generate=doubao,archive=persistImage}={}){
 const repo=accountRepository(c),key='ritual-preparation/'+account.id,task=await repo.get(key);
 if(!task||['complete','superseded'].includes(task.status))return {status:task?.status||'idle'};
 if(Date.parse(task.nextAttemptAt)>Date.now())return {status:'waiting'};
 const lockKey='ritual-preparation-lock/'+account.id,old=await repo.get(lockKey);
 if(old&&Date.parse(old.expires)>Date.now())return {status:'busy'};
 if(old)await repo.delete(lockKey);
 const lock={id:randomBytes(16).toString('hex'),expires:new Date(Date.now()+180000).toISOString()};
 try{await repo.put(lockKey,lock,{onlyIfNew:true});}catch(e){if(e.code==='PRECONDITION_FAILED'||e.status===412||e.statusCode===412)return {status:'busy'};throw e;}
 const current=async()=> (await repo.get(key))?.id===task.id;
 const selected=async()=>await current()&&(!task.activatePrayer||((await repo.get('ritual/'+account.id))?.revision||null)===task.previousRevision);
 try{
  const profile=await getProfile(c,account);
  if(!await selected()||((await repo.get('ritual/'+account.id))?.contentMode==='photo'&&!task.activatePrayer)||!profile||profileSignature(validateInput(profile,task.date))!==task.signature){if(await current())await repo.put(key,{...task,status:'superseded'});return {status:'superseded'};}
  if(!task.jobId){
   const result=await prepare({...c,ANALYSIS_BUDGET_MS:80000},account,{canConfigure:selected});
   if(!await current())return {status:'superseded'};
   if(result.status==='superseded'){if(await current())await repo.put(key,{...task,status:'superseded'});return result;}
   if(result.status==='ready'){await repo.put(key,{...task,status:'complete'});return {status:'complete'};}
   await repo.put(key,{...task,status:'drawing',jobId:result.record.id});return {status:'drawing'};
  }
  const record=await getArtwork(c,account,task.jobId);
  if(artworkFoundationIssues(record).length)throw new Error('旧画作取用依据不一致，请先重新生成今天的画作，未启动后续绘图。');
  if(!record.image){
   const match=await findReusableImage(c,account,record);
   if(match)await reuseArchivedImage(c,account,record,match);
   else{
    if(!record.pendingImageURL||record.pendingImageExpires<Date.now()){
     const result=await generate({...c,ARK_TIMEOUT_MS:'80000'},buildImagePrompt(record.mapping),fetch,true);
     record.pendingImageURL=result.url;record.pendingImageExpires=Date.now()+23*3600000;
     await saveArtwork(c,account,record);
    }
    await archive(c,account,record,record.pendingImageURL);
   }
   if(await current())await repo.put(key,{...task,status:'planning'});return {status:'planning'};
  }
  const result=await prepare({...c,ANALYSIS_BUDGET_MS:80000},account,{canConfigure:selected});
  if(result.status==='superseded'){if(await current())await repo.put(key,{...task,status:'superseded'});return result;}
  if(await current())await repo.put(key,{...task,status:result.status==='ready'?'complete':'drawing',nextAttemptAt:null});
  return {status:result.status==='ready'?'complete':'drawing'};
 }catch(e){if(await current())await repo.put(key,{...task,status:'retrying',nextAttemptAt:new Date(Date.now()+60000).toISOString()});throw e;}
 finally{if((await repo.get(lockKey))?.id===lock.id)await repo.delete(lockKey);}
}
