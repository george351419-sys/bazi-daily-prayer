import {AccountError,accountRepository} from './account-store.mjs';

const KEY=/^[a-z0-9][a-z0-9_:-]{0,180}$/;
const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):null;
function incident(item){
 if(!item||typeof item!=='object'||!KEY.test(item.key||'')||!KEY.test(item.kind||''))throw new AccountError(400,'Worker 告警格式无效。');
 return {key:item.key,kind:item.kind,accountId:text(item.accountId,32),deviceId:text(item.deviceId,12),message:text(item.message),firstSeen:Number(item.firstSeen)||null,lastSent:Number(item.lastSent)||null,observedAt:Number(item.observedAt)||null,...(item.recovered===true?{recovered:true}:{})};
}
export async function workerControl(c,name,method,body={}){
 const repo=accountRepository(c),key='ritual-worker-control/'+name;
 if(method==='GET')return await repo.get(key)||{};
 if(method!=='POST')throw new AccountError(405,'Worker 状态请求方法无效。');
 const now=new Date().toISOString();
 if(name==='scheduler'){
  const cursor=text(body.cursor,32);
  if(cursor&&!/^[a-f0-9]{32}$/.test(cursor))throw new AccountError(400,'调度游标无效。');
  const state={cursor,lastTickAt:now,lastRun:body.lastRun==='failed'?'failed':'complete'};
  await repo.put(key,state);return {ok:true};
 }
 if(name!=='monitor')throw new AccountError(404,'Worker 状态不存在。');
 if(!body.active||typeof body.active!=='object'||Array.isArray(body.active)||Object.keys(body.active).length>200)throw new AccountError(400,'Worker 告警状态无效。');
 const active={};
 for(const [id,value] of Object.entries(body.active)){const item=incident(value);if(id!==item.key)throw new AccountError(400,'Worker 告警标识不一致。');active[id]=item;}
 const events=(Array.isArray(body.events)?body.events:[]).slice(0,50).map(item=>({...incident(item),at:now}));
 const old=await repo.get(key)||{};
 await repo.put(key,{active,events:[...(old.events||[]),...events].slice(-200),lastTickAt:now});
 return {ok:true};
}
