// Isolated Ark existing-artwork cloud trial. No model calls, workers or SQL state.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {getStore} from '@edgeone/pages-blob';
import {encryptAccountData,decryptAccountData} from './account-store.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=/^[a-f0-9]{64}$/,idPattern=/^[a-f0-9]{12}$/;
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const mac=(secret,text)=>createHmac('sha256',secret).update('ark-cloud-v1|'+text).digest('hex');
export function validateFilm(data){
 if(data.length!==172832||data.readUInt32LE(0)!==172800||data.readUInt16LE(4)!==720||data.readUInt16LE(6)!==480||data[8]!==6||!data.subarray(9,16).equals(Buffer.alloc(7))||!data.subarray(16,32).equals(Buffer.from([0,255,252,224,3,28,...Array(10).fill(0)])))throw new Error('Invalid Ark film');
 for(const pixel of data.subarray(32))if((pixel>>4)>5||(pixel&15)>5)throw new Error('Invalid pixels');
}
export function validateRitual(bytes){
 if(bytes.length<64||bytes.length>1600000||bytes.subarray(0,8).toString('binary')!=='RITUAL1\0')throw new Error('Invalid ritual magic');
 const count=bytes.readUInt32LE(20),film=64,strip=film+2*172832,answer=strip+16*(bytes.readUInt32LE(36)===3?5:1)*7680;
 if(bytes.readUInt32LE(8)!==bytes.length||(bytes.readUInt32LE(12)<1700000000&&!(bytes.readUInt32LE(12)===0&&bytes.readUInt32LE(16)===1&&bytes.readUInt32LE(40)===1))||bytes.readUInt32LE(16)>1||count<1||count>100||bytes.readUInt32LE(24)!==film||bytes.readUInt32LE(28)!==strip||bytes.readUInt32LE(32)!==answer||!((bytes.readUInt32LE(36)===1&&bytes.readUInt32LE(60)===0)||(bytes.readUInt32LE(36)===2&&[2,3].includes(bytes.readUInt32LE(60)))||(bytes.readUInt32LE(36)===3&&[0,2,3].includes(bytes.readUInt32LE(60))))||bytes.length!==answer+count*4800)throw new Error('Invalid ritual layout');
 const start=bytes.readUInt32LE(12),mode=bytes.readUInt32LE(16),anchorMode=bytes.readUInt32LE(40);
 if(anchorMode>1||(anchorMode===1&&(mode!==1||start!==0||bytes.subarray(44,60).every(v=>v===0)))||(mode===0&&(start+28800)%86400!==3600))throw new Error('Invalid ritual clock');
 validateFilm(bytes.subarray(64,64+172832));validateFilm(bytes.subarray(64+172832,64+2*172832));
}
function renderReport(params,now,answerCount=100){
 const day=params.get('ritual_day'),action=params.get('ritual_action'),answer=params.get('ritual_answer'),started=params.get('ritual_started_at');
 if(params.get('ritual_render')!=='1'||!/^[01]$/.test(day||'')||!/^(?:-1|[0-9]|[1-3][0-9])$/.test(action||'')||!/^(?:-1|[0-9]|[1-9][0-9])$/.test(answer||'')||Number(answer)>=answerCount)return null;
 const epoch=/^\d{10}$/.test(started||'')?Number(started):null;
 return {day:Number(day),action:Number(action),answer:Number(answer),startedAt:epoch>=1700000000&&epoch*1000<=now+300000?epoch:null,meaning:'driver_returned_without_physical_screen_verification'};
}
export function selection(config,now){
 const date=new Date(now),local=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const part=type=>local.find(x=>x.type===type).value;
 let day=`${part('year')}-${part('month')}-${part('day')}`;
 let slot;
 if(config.mode==='test')slot=Math.max(0,Math.floor((now-Date.parse(config.testStart))/(config.intervalMinutes*60000)));
 else{
  const [h,m]=config.dailyAt.split(':').map(Number);
  const midnight=Date.parse(day+'T00:00:00+08:00');
  if(Number(part('hour'))*60+Number(part('minute'))<h*60+m)day=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  slot=Math.floor((Date.parse(day+'T00:00:00+08:00')-Date.parse(config.startDate+'T00:00:00+08:00'))/86400000);
 }
 const asset=config.playlist[((slot%config.playlist.length)+config.playlist.length)%config.playlist.length];
 const next=Date.parse(day+'T'+config.dailyAt+':00+08:00')+86400000;
 return {asset,day,slot,sleepMinutes:config.mode==='test'?config.intervalMinutes:Math.max(5,Math.min(2880,Math.ceil((next-now)/60000)))};
}
export function validateConfig(c){
 if(c?.ritualSha!==undefined&&!hex.test(c.ritualSha))throw new Error('Invalid ritual hash');
 if(!c||!idPattern.test(c.deviceId)||!hex.test(c.tokenHash)||!['test','daily'].includes(c.mode)||c.dailyAt!=='01:00'||!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)||!Number.isFinite(Date.parse(c.startDate+'T00:00:00+08:00'))||!Array.isArray(c.playlist)||(c.playlist.length<1||c.playlist.length>5)||c.playlist.some(a=>!hex.test(a.sha256))||typeof c.enabled!=='boolean')throw new Error('Invalid trial config');
 if(c.mode==='test'&&(!Number.isFinite(Date.parse(c.testStart))||c.intervalMinutes!==5))throw new Error('Invalid test schedule');
}
function storage(env,store){
 const sdk=store||getStore({name:'prayer-ark-trial-v1',consistency:'strong'});
 return {async get(key){const data=await sdk.get(key,{type:'arrayBuffer',consistency:'strong'});return data===null?null:decryptAccountData(env,Buffer.from(data));},async put(key,bytes,options){const data=encryptAccountData(env,bytes);return sdk.set(key,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),options);}};
}
export async function handleArkCloud(request,env,{store,now=Date.now()}={}){
 const url=new URL(request.url),path=url.pathname;
 const allowed=['/api/v1/device/heartbeat','/api/ark/assets/today','/api/ark/provision','/api/ark/health','/api/ark/status'];
 if(!allowed.includes(path))return json(404,{error:'Not found'});
 if(typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<20)return json(503,{error:'Cloud configuration unavailable'});
 if(path==='/api/ark/health')return json(200,{service:'ark-existing-artwork',version:1,paidModels:false});
 let phase='storage-init';
 try{
  const headers=new Headers(request.headers);
  const db=storage(env,store);
  if(path==='/api/ark/provision'){
   if(request.method!=='POST')return json(405,{error:'Method not allowed'});
   phase='provision-headers';
   const expires=headers.get('x-ark-expires')||'';
   if(!/^\d+$/.test(expires)||Number(expires)*1000<now||Number(expires)*1000>now+300000)return json(403,{error:'Invalid provisioning request'});
   phase='provision-body';
   const chunks=[];let count=0;
   const reader=request.body?.getReader?.();
   if(reader){for(;;){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>240000){await reader.cancel();return json(413,{error:'Payload too large'});}chunks.push(Buffer.from(value));}}
   else{const length=headers.get('content-length')||'';if(!/^\d+$/.test(length)||Number(length)>240000)return json(413,{error:'Payload too large'});const text=await request.text();if(Buffer.byteLength(text)>240000)return json(413,{error:'Payload too large'});chunks.push(Buffer.from(text));}
   phase='provision-auth';
   const raw=Buffer.concat(chunks),expected=mac(env.SESSION_SECRET,`provision|${expires}|${sha(raw)}`);
   if(!equal(headers.get('x-ark-signature'),expected))return json(403,{error:'Invalid provisioning request'});
   let body;try{body=JSON.parse(raw);}catch{return json(400,{error:'Invalid JSON'});}
   if(body.type==='ritual_chunk'){
    const bytes=Buffer.from(body.base64||'','base64');
    if(bytes.length<1||bytes.length>65536||!hex.test(body.sha256)||sha(bytes)!==body.sha256)return json(400,{error:'Invalid ritual chunk'});
    await db.put('ritual-chunks/'+body.sha256,bytes);
   }else if(body.type==='ritual_commit'){
    if(!idPattern.test(body.deviceId)||!hex.test(body.sha256)||!Array.isArray(body.chunks)||body.chunks.length<1||body.chunks.length>25||body.chunks.some(h=>!hex.test(h)))return json(400,{error:'Invalid ritual commit'});
    const previous=await db.get('devices/'+body.deviceId);if(!previous)return json(404,{error:'Device unavailable'});
    const chunks=[];let total=0;for(const hash of body.chunks){const b=await db.get('ritual-chunks/'+hash);if(!b||sha(b)!==hash)return json(409,{error:'Upload all chunks first'});total+=b.length;if(total>1600000)return json(400,{error:'Ritual too large'});chunks.push(b);}
    const bytes=Buffer.concat(chunks);try{validateRitual(bytes);}catch{return json(400,{error:'Invalid ritual'});}
    if(sha(bytes)!==body.sha256)return json(400,{error:'Invalid ritual hash'});
    await db.put('assets/'+body.sha256,bytes);
    const config=JSON.parse(previous);if(config.ritualSha&&config.ritualSha!==body.sha256){config.previousRitualSha=config.ritualSha;config.previousRitualMeta=config.ritualMeta;}config.ritualSha=body.sha256;config.ritualMeta={mode:bytes.readUInt32LE(16)?'test':'daily',answerCount:bytes.readUInt32LE(20),startEpoch:bytes.readUInt32LE(12),protocol:bytes.readUInt32LE(36)};await db.put('devices/'+body.deviceId,Buffer.from(JSON.stringify(config)));
   }else if(body.type==='ritual_disable'){
    if(!idPattern.test(body.deviceId))return json(400,{error:'Invalid device'});const previous=await db.get('devices/'+body.deviceId);if(!previous)return json(404,{error:'Device unavailable'});const config=JSON.parse(previous);delete config.ritualSha;delete config.ritualMeta;delete config.previousRitualSha;delete config.previousRitualMeta;await db.put('devices/'+body.deviceId,Buffer.from(JSON.stringify(config)));
   }else if(body.type==='asset'){
    const bytes=Buffer.from(body.base64||'','base64');
    try{validateFilm(bytes);}catch{return json(400,{error:'Invalid film'});}
    if(sha(bytes)!==body.sha256)return json(400,{error:'Invalid asset hash'});
    phase='asset-write';
    await db.put('assets/'+body.sha256,bytes);
   }else if(body.type==='device'){
    try{validateConfig(body.config);}catch{return json(400,{error:'Invalid device configuration'});}
    for(const a of body.config.playlist){const bytes=await db.get('assets/'+a.sha256);if(!bytes||sha(bytes)!==a.sha256)return json(409,{error:'Upload all assets first'});}
    // Device credentials and ownership cannot be silently replaced by a repeated import.
    try{await db.put('devices/'+body.config.deviceId,Buffer.from(JSON.stringify(body.config)),{onlyIfNew:true});}
    catch(error){if(error.code==='PRECONDITION_FAILED'||error.status===412)return json(409,{error:'Device already provisioned'});throw error;}
   }else if(body.type==='playlist'){
    if(!idPattern.test(body.deviceId))return json(400,{error:'Invalid playlist'});
    const previous=await db.get('devices/'+body.deviceId);if(!previous)return json(404,{error:'Device unavailable'});
    const config=JSON.parse(previous);config.playlist=body.playlist;
    try{validateConfig(config);}catch{return json(400,{error:'Invalid playlist'});}
    for(const a of config.playlist){const bytes=await db.get('assets/'+a.sha256);if(!bytes||sha(bytes)!==a.sha256)return json(409,{error:'Upload all assets first'});}
    await db.put('devices/'+body.deviceId,Buffer.from(JSON.stringify(config)));
   }else if(body.type==='schedule'){
    if(!idPattern.test(body.deviceId)||!['daily','test'].includes(body.mode))return json(400,{error:'Invalid schedule'});
    const previous=await db.get('devices/'+body.deviceId);if(!previous)return json(404,{error:'Device unavailable'});
    const config=JSON.parse(previous);config.mode=body.mode;config.dailyAt='01:00';
    if(body.mode==='test'){config.intervalMinutes=5;config.testStart=body.testStart;}
    try{validateConfig(config);}catch{return json(400,{error:'Invalid schedule'});}
    await db.put('devices/'+body.deviceId,Buffer.from(JSON.stringify(config)));
   }else return json(400,{error:'Invalid import type'});
   return json(200,{ok:true});
  }
  if(request.method!=='GET')return json(405,{error:'Method not allowed'});
  const deviceId=url.searchParams.get('device_id')||'';
  if(!idPattern.test(deviceId))return json(403,{error:'Device authentication required'});
  const saved=await db.get('devices/'+deviceId);
  if(!saved)return json(403,{error:'Device authentication required'});
  const config=JSON.parse(saved);validateConfig(config);
  if(!config.enabled)return json(403,{error:'Device revoked'});
  if(path==='/api/v1/device/heartbeat'||path==='/api/ark/status'){
   const bearer=headers.get('authorization')||'';
   if(!/^Bearer [a-f0-9]{32}$/.test(bearer)||!equal(sha(bearer.slice(7)),config.tokenHash))return json(403,{error:'Device authentication required'});
   if(path==='/api/ark/status'){const report=await db.get('reports/'+deviceId);return json(200,{mode:config.ritualMeta?.mode||config.mode,contentType:config.ritualSha?'ritual-v'+(config.ritualMeta?.protocol||1):'film',dailyAt:config.dailyAt,intervalMinutes:config.ritualSha?(config.ritualMeta?.mode==='test'?2:null):config.mode==='test'?config.intervalMinutes:null,report:report?JSON.parse(report):null});}
   if(config.ritualSha&&['1','2','3'].includes(url.searchParams.get('ritual_v'))){
    const compatible=Number(url.searchParams.get('ritual_v'))>=(config.ritualMeta?.protocol||1);
    const hash=config.ritualSha,stored=equal(url.searchParams.get('cloud_stored_sha'),hash);
    const commands=[];
    if(!stored&&compatible){if(env.ARK_PUBLIC_ORIGIN!=='https://playmath.cn')return json(503,{error:'Public device origin unavailable'});const exp=String(Math.floor(now/1000)+900),sig=mac(env.SESSION_SECRET,`asset|${deviceId}|${hash}|${exp}`),q=new URLSearchParams({device_id:deviceId,sha:hash,exp,sig});commands.push({cmd:'download_ritual',params:{url:env.ARK_PUBLIC_ORIGIN+'/api/ark/assets/today?'+q,sha256:hash}});}
    commands.push({cmd:'set_config',params:{sleep_mode:1,sleep_auto:1,sleep_time:2}});
    const cached=url.searchParams.get('cloud_stored_sha');
    const canReport=stored||cached===config.previousRitualSha;
    const rendered=canReport?renderReport(url.searchParams,now,stored?config.ritualMeta?.answerCount:config.previousRitualMeta?.answerCount):null;
    const downloadState=/^[0-3]$/.test(url.searchParams.get('download_state')||'')?Number(url.searchParams.get('download_state')):null;
    const downloadProgress=/^\d{1,3}$/.test(url.searchParams.get('download_progress')||'')?Math.min(100,Number(url.searchParams.get('download_progress'))):null;
    if(headers.get('x-ark-dry-run')!=='1')await db.put('reports/'+deviceId,Buffer.from(JSON.stringify({lastSeen:new Date(now).toISOString(),targetSha:hash,stored,displayConfirmed:false,contentType:'ritual-v'+(config.ritualMeta?.protocol||1),firmwareUpdateRequired:!compatible,renderSha:rendered?cached:null,renderReport:rendered,downloadState,downloadProgress})));
    return json(200,{data:{cloud_local_sync:true,commands,firmware_update_required:!compatible,heartbeat_interval:10}});
   }
   const target=selection(config,now),stored=equal(url.searchParams.get('cloud_stored_sha'),target.asset.sha256);
   const commands=[{cmd:'set_config',params:{sleep_mode:1,sleep_auto:1,sleep_time:target.sleepMinutes}}];
   if(['1','2','3'].includes(url.searchParams.get('ritual_v'))&&url.searchParams.get('ritual_active')==='1')commands.unshift({cmd:'disable_ritual'});
   if(!stored){const exp=String(Math.floor(now/1000)+900),hash=target.asset.sha256,signature=mac(env.SESSION_SECRET,`asset|${deviceId}|${hash}|${exp}`);
    // Use configured public origin, never trust forwarded Host headers for signed URLs.
    if(env.ARK_PUBLIC_ORIGIN!=='https://playmath.cn')return json(503,{error:'Public device origin unavailable'});
    const query=new URLSearchParams({device_id:deviceId,sha:hash,exp,sig:signature});
    commands.push({cmd:'download_film',params:{url:env.ARK_PUBLIC_ORIGIN+'/api/ark/assets/today?'+query,sha256:hash}});
   }
   if(headers.get('x-ark-dry-run')!=='1')await db.put('reports/'+deviceId,Buffer.from(JSON.stringify({lastSeen:new Date(now).toISOString(),targetSha:target.asset.sha256,contentDate:target.day,stored,displayConfirmed:false})));
   return json(200,{data:{cloud_local_sync:true,commands,heartbeat_interval:10}});
  }
  const hash=url.searchParams.get('sha')||'',exp=url.searchParams.get('exp')||'',sig=url.searchParams.get('sig')||'';
  if(!hex.test(hash)||!/^\d+$/.test(exp)||Number(exp)*1000<now||Number(exp)*1000>now+910000||!(config.playlist.some(a=>a.sha256===hash)||config.ritualSha===hash)||!equal(sig,mac(env.SESSION_SECRET,`asset|${deviceId}|${hash}|${exp}`)))return json(403,{error:'Invalid download link'});
  const bytes=await db.get('assets/'+hash);
  if(!bytes||sha(bytes)!==hash)return json(503,{error:'Asset unavailable'});
  if(hash===config.ritualSha)validateRitual(bytes);else validateFilm(bytes);
  return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){const candidate=String(error?.code||error?.name||'UNKNOWN');const code=/^[A-Z_a-z0-9]{1,40}$/.test(candidate)?candidate:'UNKNOWN';return json(503,{error:'Ark cloud service unavailable',code,phase});}
}
export function provisionSignature(secret,expires,raw){return mac(secret,`provision|${expires}|${sha(raw)}`);}

export async function linkedRitualReport(env,account){
 return linkedRitualReportForDevice(env,account,ritualCloudLink(env,account));
}
export async function ritualCloudDevice(env,deviceId,store){
 if(!idPattern.test(deviceId||''))return null;
 const db=storage(env,store||env.RITUAL_CLOUD_STORE),raw=await db.get('devices/'+deviceId);if(!raw)return null;
 const config=JSON.parse(raw);validateConfig(config);
 return {deviceId:config.deviceId,enabled:!!config.enabled,contentType:config.ritualSha?'ritual-v'+(config.ritualMeta?.protocol||1):'film'};
}
export function ritualCloudLink(env,account){
 try{const id=JSON.parse(env.RITUAL_DEVICE_LINKS||'{}')[account.id];return idPattern.test(id||'')?id:null;}catch{return null;}
}
export async function linkedRitualReportForDevice(env,account,deviceId){
 const id=deviceId;
 if(!idPattern.test(id||''))return null;
 const db=storage(env,env.RITUAL_CLOUD_STORE),raw=await db.get('devices/'+id);if(!raw)return null;
 const config=JSON.parse(raw);validateConfig(config);if(!config.enabled||!config.ritualSha)return null;
 const report=await db.get('reports/'+id);return report?JSON.parse(report):null;
}
