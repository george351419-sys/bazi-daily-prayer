import {createHash} from 'node:crypto';
import {deviceServiceCall,devicesEnabled} from './devices.mjs';
import {getProfile,saveProfile,AccountError} from './accounts.mjs';
import {encryptAccountData,decryptAccountData} from './account-store.mjs';
import {validateInput,calendarFor,RULE_VERSION} from './domain.mjs';
import {SYSTEM} from './prompt.mjs';

export const WORKFLOW_VERSION='daily-art-styles-v2';
export const sealPayload=(c,value)=>encryptAccountData(c,Buffer.from(JSON.stringify(value))).toString('base64');
export const openPayload=(c,value)=>JSON.parse(decryptAccountData(c,Buffer.from(value,'base64')).toString());
export function generationSettings(c,raw){
 const input=validateInput(raw);calendarFor(input);
 const profile={gender:input.gender,birthDate:input.birthDate,birthTime:input.birthTime,calendar:input.calendar,leap:input.leap,city:input.city,wishes:input.wishes,artStyle:input.artStyle};
 const versions={workflow:WORKFLOW_VERSION,rule:RULE_VERSION,prompt:createHash('sha256').update(SYSTEM).digest('hex'),textModel:c.DEEPSEEK_MODEL||'deepseek-flash',imageModel:c.ARK_IMAGE_MODEL||'doubao-seedream-5-0-flash-260915'};
 const fingerprint=createHash('sha256').update(JSON.stringify({profile,versions})).digest('hex');
 return {profile,versions,fingerprint,profileFingerprint:createHash('sha256').update(JSON.stringify(profile)).digest('hex')};
}
export const automationStatus=(c,account,fetcher)=>deviceServiceCall(c,'/internal/automation/status?ownerId='+encodeURIComponent(account.id),undefined,fetcher);
export async function configureAutomation(c,account,body,fetcher){
 if(!['fixed','daily','paused'].includes(body.mode)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.updateTime||''))throw new AccountError(400,'请刷新后选择更新模式和时间。');
 let settings;
 if(body.mode==='daily'){
  const profile=await getProfile(c,account);if(!profile)throw new AccountError(409,'请先保存出生资料与愿望。');
  settings=generationSettings(c,profile);
 }
 return deviceServiceCall(c,'/internal/automation/policy',{ownerId:account.id,mode:body.mode,expectedVersion:body.expectedVersion,updateTime:body.updateTime,...(settings?{fingerprint:settings.fingerprint,profileFingerprint:settings.profileFingerprint,snapshot:sealPayload(c,settings)}:{})},fetcher);
}
// Keep configuration blocked until the account write is durably acknowledged.
// A stale read after another profile save is rejected by its profile fingerprint.
export async function saveProfileSafely(c,account,raw,fetcher){
 if(!devicesEnabled(c))return saveProfile(c,account,raw);
 const settings=generationSettings(c,raw);
 const edit=await deviceServiceCall(c,'/internal/automation/profile/begin',{ownerId:account.id,fingerprint:settings.fingerprint,profileFingerprint:settings.profileFingerprint},fetcher);
 if(!/^[a-f0-9]{32}$/.test(edit?.token||'')||!Number.isSafeInteger(edit.revision))throw new AccountError(502,'资料保存服务响应异常。');
 let profile;
 try{profile=await saveProfile(c,account,settings.profile,{profileRevision:edit.revision});}
 catch(error){try{await deviceServiceCall(c,'/internal/automation/profile/abort',{ownerId:account.id,token:edit.token},fetcher);}catch{}throw error;}
 const finish=()=>deviceServiceCall(c,'/internal/automation/profile/finish',{ownerId:account.id,token:edit.token},fetcher);
 try{await finish();}catch(error){if(error.status!==503)throw error;await finish();}
 return profile;
}
// Fence running tasks before changing account preferences. Resuming requires a fresh saved snapshot.
export async function fenceProfileChange(c,account,raw,fetcher){
 if(!devicesEnabled(c))return;
 const settings=generationSettings(c,raw);
 await deviceServiceCall(c,'/internal/automation/invalidate',{ownerId:account.id,fingerprint:settings.fingerprint},fetcher);
}

export function retryAutomation(c,account,body,fetcher){
 if(!/^[a-f0-9]{64}$/.test(body.jobId||'')||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw new AccountError(400,'任务或设置版本无效。');
 return deviceServiceCall(c,'/internal/automation/retry',{ownerId:account.id,jobId:body.jobId,expectedVersion:body.expectedVersion},fetcher);
}
