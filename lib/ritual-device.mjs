import {AccountError,accountRepository} from './account-store.mjs';
import {ritualCloudDevice} from './ark-cloud.mjs';

const DEVICE_ID=/^[a-f0-9]{12}$/;

export function configuredRitualDeviceLinks(c={}){
 const raw=JSON.parse(c.RITUAL_DEVICE_LINKS||'{}');
 if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new Error('Invalid ritual account/device mapping');
 const links={};
 for(const [accountId,deviceId] of Object.entries(raw)){
  if(!/^[a-f0-9]{32}$/.test(accountId)||!DEVICE_ID.test(deviceId))throw new Error('Invalid ritual account/device mapping');
  if(Object.values(links).includes(deviceId))throw new Error('A ritual device cannot belong to more than one account');
  links[accountId]=deviceId;
 }
 return links;
}

async function allRecords(repo,prefix){
 const items=[];let cursor;
 for(let page=0;page<100;page++){
  const batch=await repo.list({prefix,limit:100,cursor});
  for(const blob of batch.blobs)items.push({key:blob.key,value:await repo.get(blob.key)});
  if(!batch.cursor)return items;
  cursor=batch.cursor;
 }
 throw new Error('Ritual binding index is too large to scan');
}

export async function listRitualDeviceLinks(c){
 const links=configuredRitualDeviceLinks(c),repo=accountRepository(c);
 const records=(await allRecords(repo,'ritual-device/')).filter(item=>item.value);
 const seen=new Set();
 for(const {key,value:record} of records){
  if(!/^[a-f0-9]{32}$/.test(record.accountId||'')||key!=='ritual-device/'+record.accountId||!DEVICE_ID.test(record.deviceId||''))throw new Error('Invalid stored ritual device binding');
  if(seen.has(record.deviceId))throw new Error('Stored ritual device binding is ambiguous');
  seen.add(record.deviceId);
  const previous=links[record.accountId];
  if(previous&&previous!==record.deviceId)throw new Error('Conflicting ritual device bindings');
  links[record.accountId]=record.deviceId;
 }
 if(new Set(Object.values(links)).size!==Object.values(links).length)throw new Error('A ritual device cannot belong to more than one account');
 return links;
}

export async function ritualDeviceForAccount(c,accountId){
 if(!/^[a-f0-9]{32}$/.test(accountId||''))return null;
 const repo=accountRepository(c),binding=await repo.get('ritual-device/'+accountId);
 if(binding?.accountId===accountId&&DEVICE_ID.test(binding.deviceId||''))return binding;
 const legacy=configuredRitualDeviceLinks(c)[accountId];
 return legacy?{accountId,deviceId:legacy,createdAt:null,status:'legacy'}:null;
}

export async function bindRitualDevice(c,account,deviceId){
 const id=String(deviceId||'').trim().toLowerCase();
 if(!DEVICE_ID.test(id))throw new AccountError(400,'无法从这台画屏读取有效设备编号，请重新连接后再试。');
 const existingLink=Object.entries(configuredRitualDeviceLinks(c)).find(([,value])=>value===id);
 if(existingLink&&existingLink[0]!==account.id)throw new AccountError(409,'这台画屏已经绑定其他账户，请先解除原绑定。');
 const repo=accountRepository(c),cloud=await ritualCloudDevice(c,id);
 if(!cloud)throw new AccountError(409,'这台画屏尚未在云端预置，暂时不能绑定。请先完成设备云端初始化。');

 let binding=await repo.get('ritual-device/'+account.id);
 if(binding?.deviceId===id)return {binding,cloud};
 if(binding&&binding.deviceId!==id)throw new AccountError(409,'你的账户已经绑定了另一台画屏。请先解除原设备。');

 const reservationKey='ritual-device-owner/'+id,now=new Date().toISOString();
 const reservation={accountId:account.id,deviceId:id,createdAt:now};
 try{
  await repo.put(reservationKey,reservation,{onlyIfNew:true});
 }catch(error){
  if(error.code!=='PRECONDITION_FAILED'&&error.status!==412)throw error;
  const owner=await repo.get(reservationKey);
  if(owner?.accountId!==account.id)throw new AccountError(409,'这台画屏已经绑定其他账户，请先解除原绑定。');
 }

 binding={...reservation,status:cloud.enabled?'ready':'disabled'};
 try{
  await repo.put('ritual-device/'+account.id,binding);
 }catch(error){
  try{await repo.delete(reservationKey);}catch{}
  throw error;
 }
 return {binding,cloud};
}

export async function unbindRitualDevice(c,account){
 const repo=accountRepository(c),binding=await repo.get('ritual-device/'+account.id);
 if(binding){
  const owner=await repo.get('ritual-device-owner/'+binding.deviceId);
  if(owner?.accountId===account.id)await repo.delete('ritual-device-owner/'+binding.deviceId);
  await repo.delete('ritual-device/'+account.id);
 }
 return {ok:true,removed:!!binding};
}
