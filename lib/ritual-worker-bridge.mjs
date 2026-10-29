import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AccountError,accountRepository} from './account-store.mjs';
import {getArtwork,getProfile,privateImage} from './accounts.mjs';
import {configureRitual} from './ritual.mjs';
import {listRitualDeviceLinks} from './ritual-device.mjs';

const ACCOUNT=/^[a-f0-9]{32}$/,ARTWORK=/^[a-f0-9]{36}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const bodyText=body=>typeof body==='string'?body:body==null?'':JSON.stringify(body);

export function ritualWorkerSignature(c,method,path,body=''){
 if(typeof c.SESSION_SECRET!=='string'||c.SESSION_SECRET.length<20)throw new AccountError(503,'内部 Worker 鉴权尚未配置。');
 return createHmac('sha256',c.SESSION_SECRET).update(['ritual-worker-v1',method,path,digest(bodyText(body))].join('|')).digest('hex');
}
function same(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const one=Buffer.from(a),two=Buffer.from(b);return one.length===two.length&&timingSafeEqual(one,two);}

async function recordsFor(repo,accountId){
 const items=[];let cursor;
 for(let page=0;page<20;page++){
  const batch=await repo.list({prefix:'artworks/'+accountId+'/',limit:100,cursor});
  for(const blob of batch.blobs){const record=await repo.get(blob.key);if(record?.userId===accountId)items.push({id:record.id,date:record.date,createdAt:record.createdAt,source:record.source||'generated',status:record.status,profileSignature:record.profileSignature,image:!!record.image,publicationState:record.publicationState||null});}
  if(!batch.cursor)break;
  cursor=batch.cursor;
 }
 return items;
}

export async function handleRitualWorkerRequest(c,{method,path,headers={},body={}}){
 if(c.RITUAL_WORKER_REMOTE!=='1')throw new AccountError(404,'内部 Worker 服务未开启。');
 if(typeof body==='string'){try{body=body?JSON.parse(body):{};}catch{throw new AccountError(400,'Worker 请求格式错误。');}}
 const expires=String(headers['x-ritual-expires']||'');
 if(!/^\d+$/.test(expires)||Number(expires)*1000<Date.now()-30000||Number(expires)*1000>Date.now()+300000)throw new AccountError(403,'Worker 请求已失效。');
 const expected=ritualWorkerSignature(c,method,path,method==='GET'?'':body);
 if(!same(headers['x-ritual-signature'],expected))throw new AccountError(403,'Worker 鉴权失败。');
 if(path==='/api/internal/ritual-worker/links'&&method==='GET')return {links:await listRitualDeviceLinks(c)};
 const root=path.match(/^\/api\/internal\/ritual-worker\/accounts\/([a-f0-9]{32})(?:\/(.*))?$/);
 if(!root||!ACCOUNT.test(root[1]))throw new AccountError(404,'Worker 接口不存在。');
 const account={id:root[1]},tail=root[2]||'',repo=accountRepository(c);
 if(!tail&&method==='GET'){
  const links=await listRitualDeviceLinks(c);if(!links[account.id])throw new AccountError(404,'账户没有绑定画屏。');
  return {accountId:account.id,deviceId:links[account.id],plan:await repo.get('ritual/'+account.id),build:await repo.get('ritual-build/'+account.id),profile:await getProfile(c,account),records:await recordsFor(repo,account.id)};
 }
 if(tail==='plan'&&method==='POST'){
  if(!Array.isArray(body.artworkIds)||body.artworkIds.length!==2)throw new AccountError(400,'Worker 画作参数无效。');
  return configureRitual(c,account,{mode:body.mode,contentMode:'prayer',showActions:true,artworkIds:body.artworkIds},{onlyIfNew:true});
 }
 if(tail==='build'&&method==='POST'){
  if(!body.state||typeof body.state!=='object'||Array.isArray(body.state))throw new AccountError(400,'Worker 构建状态无效。');
  await repo.put('ritual-build/'+account.id,body.state);
  return {ok:true};
 }
 const image=tail.match(/^artworks\/([a-f0-9]{36})\/image$/);
 if(image&&method==='GET'){
  if(!ARTWORK.test(image[1]))throw new AccountError(404,'画作不存在。');
  const record=await getArtwork(c,account,image[1]),source=await privateImage(c,account,record);
  return {bytes:source.bytes,contentType:source.type};
 }
 throw new AccountError(404,'Worker 接口不存在。');
}
