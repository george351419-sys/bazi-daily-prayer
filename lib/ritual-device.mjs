import {randomBytes} from 'node:crypto';
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

export async function inspectRitualDeviceLinks(c){
 const configured=configuredRitualDeviceLinks(c),repo=accountRepository(c);
 const all=(await allRecords(repo,'ritual-device/')).filter(item=>item.value);
 const records=all.filter(item=>!item.value.unboundAt);
 for(const {value} of all)if(value.unboundAt)delete configured[value.accountId];
 const candidates=new Map(),conflicts=[];
 for(const [accountId,deviceId] of Object.entries(configured))candidates.set(deviceId,new Set([accountId]));
 for(const {key,value:record} of records){
  if(!/^[a-f0-9]{32}$/.test(record.accountId||'')||key!=='ritual-device/'+record.accountId||!DEVICE_ID.test(record.deviceId||''))throw new Error('Invalid stored ritual device binding');
  if(!candidates.has(record.deviceId))candidates.set(record.deviceId,new Set());
  candidates.get(record.deviceId).add(record.accountId);
 }
 const selected=[];
 for(const [deviceId,accounts] of candidates){
  const owner=await repo.get('ritual-device-owner/'+deviceId);
  const currentRecord=records.find(item=>item.value.accountId===owner?.accountId)?.value;
  const generationMatches=!owner?.bindingId||currentRecord?.bindingId===owner.bindingId;
  const validOwner=owner?.deviceId===deviceId&&accounts.has(owner.accountId)&&generationMatches?owner.accountId:null;
  if(owner&&!validOwner){conflicts.push({deviceId,reason:'owner_mismatch'});continue;}
  if(accounts.size>1&&!validOwner){conflicts.push({deviceId,reason:'ambiguous_owner'});continue;}
  selected.push({deviceId,accountId:validOwner||[...accounts][0],reserved:!!validOwner});
 }
 const byAccount=new Map();
 for(const link of selected){
  if(!byAccount.has(link.accountId))byAccount.set(link.accountId,[]);
  byAccount.get(link.accountId).push(link);
 }
 const stored=new Map(records.map(({value})=>[value.accountId,value]));
 const links={};
 for(const [accountId,items] of byAccount){
  const latest=stored.get(accountId);
  if(latest){
   const selected=items.find(item=>item.deviceId===latest.deviceId);
   if(selected)links[accountId]=selected.deviceId;
   continue;
  }
  if(items.length===1){links[accountId]=items[0].deviceId;continue;}
  const reserved=items.filter(item=>item.reserved);
  if(reserved.length===1){links[accountId]=reserved[0].deviceId;for(const item of items)if(item!==reserved[0])conflicts.push({deviceId:item.deviceId,reason:'account_rebound'});}
  else for(const item of items)conflicts.push({deviceId:item.deviceId,reason:'ambiguous_account'});
 }
 return {links,conflicts};
}

export async function listRitualDeviceLinks(c){return (await inspectRitualDeviceLinks(c)).links;}

export async function ritualDeviceForAccount(c,accountId){
 if(!/^[a-f0-9]{32}$/.test(accountId||''))return null;
 const deviceId=(await listRitualDeviceLinks(c))[accountId];
 if(!deviceId)return null;
 const binding=await accountRepository(c).get('ritual-device/'+accountId);
 return binding?.deviceId===deviceId?binding:{accountId,deviceId,createdAt:null,status:'legacy'};
}

// A fresh binding is also a routing generation: reconnecting the same pair
// after another account used the screen must publish the current package again.
export async function bindRitualDevice(c,account,deviceId){
 const id=String(deviceId||'').trim().toLowerCase();
 if(!DEVICE_ID.test(id))throw new AccountError(400,'无法从这台画屏读取有效设备编号，请重新连接后再试。');
 const repo=accountRepository(c),cloud=await ritualCloudDevice(c,id);
 if(!cloud)throw new AccountError(409,'这台画屏尚未在云端预置，暂时不能绑定。请先完成设备云端初始化。');
 const binding={accountId:account.id,deviceId:id,createdAt:new Date().toISOString(),bindingId:randomBytes(16).toString('hex'),status:cloud.enabled?'ready':'disabled'};
 await repo.put('ritual-device/'+account.id,binding);
 await repo.put('ritual-device-owner/'+id,binding);
 return {binding,cloud};
}

export async function unbindRitualDevice(c,account){
 const repo=accountRepository(c),binding=await repo.get('ritual-device/'+account.id);
 if(binding){
  const owner=await repo.get('ritual-device-owner/'+binding.deviceId);
  // Keep a tombstone so a legacy mapping cannot reactivate an older account.
  if(owner?.accountId===account.id)await repo.put('ritual-device-owner/'+binding.deviceId,{deviceId:binding.deviceId,accountId:null,unboundAt:new Date().toISOString()});
  await repo.put('ritual-device/'+account.id,{accountId:account.id,deviceId:null,unboundAt:new Date().toISOString()});
 }
 return {ok:true,removed:!!binding};
}
