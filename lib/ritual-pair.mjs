import {createHash} from 'node:crypto';
import {AccountError,accountRepository} from './account-store.mjs';
import {accountHistory,getArtwork,getProfile,profileSignature,saveArtwork} from './accounts.mjs';
import {calendarFor,validateInput} from './domain.mjs';
import {analyzeMapping} from './service.mjs';
import {configureRitual,ritualArtworkReady} from './ritual.mjs';
import {sealJob} from './tokens.mjs';

const DAY=86400000;
const dateOnly=now=>new Date(now+7*3600000).toISOString().slice(0,10);
const nextDate=date=>new Date(Date.parse(date+'T00:00:00Z')+DAY).toISOString().slice(0,10);

async function prayerArtworks(c,account,signature){
 const repo=accountRepository(c),items=[];let cursor;
 for(let page=0;page<10;page++){
  const batch=await repo.list({prefix:'artworks/'+account.id+'/',limit:100,cursor});
  for(const blob of batch.blobs){
   const record=await repo.get(blob.key);
   if(record?.userId===account.id&&record.profileSignature===signature&&ritualArtworkReady(record)&&record.source!=='upload')items.push(record);
  }
  if(!batch.cursor)break;
  cursor=batch.cursor;
 }
 return items.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

export async function prepareRitualPair(c,account,{mode='daily',now=Date.now(),analyze=analyzeMapping}={}){
 if(!['test','daily'].includes(mode))throw new AccountError(400,'播放方式无效。');
 const repo=accountRepository(c),existingPlan=await repo.get('ritual/'+account.id),profile=await getProfile(c,account);
 if(!profile)throw new AccountError(409,'请先保存出生资料和祈福愿望。');
 const today=dateOnly(now),input=validateInput(profile,today),signature=profileSignature(input);
 const records=await prayerArtworks(c,account,signature),todayRecord=records.find(item=>item.date===today);
 if(!todayRecord)throw new AccountError(409,'请先完成今天的祈福画，再准备画屏的两天内容。');
 const target=nextDate(today);
 let record=records.find(item=>item.date===target)||null;
 if(!record){
  const id=createHash('sha256').update(['ritual-pair-v2',account.id,target,signature].join('|')).digest('hex').slice(0,36);
  try{record=await getArtwork(c,account,id);}catch(error){if(error.status!==404)throw error;}
  if(!record){
   if(!c.DEEPSEEK_API_KEY)throw new AccountError(503,'服务端尚未配置文案模型，暂时不能准备次日祈福画。');
   const nextInput=validateInput(profile,target),calendar=calendarFor(nextInput);
   const mapping=await analyze(c,nextInput,calendar,await accountHistory(c,account,nextInput));
   record={id,userId:account.id,date:target,createdAt:new Date(now).toISOString(),input:nextInput,calendar,mapping,profileSignature:signature,status:'mapped',image:null,source:'ritual-pair'};
   await saveArtwork(c,account,record);
  }
 }

 const pair=[todayRecord,record].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 if(pair.length===2&&pair.every(ritualArtworkReady)){
  let shouldConfigure=!existingPlan;
  if(existingPlan?.contentMode==='prayer'){
   const existing=await Promise.all(existingPlan.artworkIds.map(id=>getArtwork(c,account,id)));
   shouldConfigure=existing.some(item=>item.date!==today&&item.date!==target);
  }
  if(shouldConfigure)await configureRitual(c,account,{mode:existingPlan?.mode||mode,contentMode:'prayer',showActions:true,artworkIds:pair.map(item=>item.id)},{onlyIfNew:!existingPlan});
 }
 if(record&&!ritualArtworkReady(record)){
  return {status:'mapped',record,jobToken:sealJob(c,{id:record.id,owner:'account:'+account.id,accountId:account.id,mapping:record.mapping,expires:now+86400000})};
 }
 return {status:'ready',artworkIds:pair.map(item=>item.id)};
}
