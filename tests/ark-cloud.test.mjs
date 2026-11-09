import {publishRitualPackage,ritualDeviceLinks} from '../lib/ritual-upload.mjs';
import {packageFixture} from './fixtures/ritual-package.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleArkCloud,selection,provisionSignature,validateFilm,validateRitual} from '../lib/ark-cloud.mjs';
import {encryptAccountData,decryptAccountData} from '../lib/account-store.mjs';
const secret='ark-cloud-test-secret-'.repeat(3),token='a'.repeat(32),deviceId='f0f5bd7562f4';
const env={SESSION_SECRET:secret,ARK_PUBLIC_ORIGIN:'https://playmath.cn'};
const now=Date.parse('2026-10-27T01:00:00+08:00'),hash=b=>createHash('sha256').update(b).digest('hex');
function film(index){const b=Buffer.alloc(172832,index*17);b.fill(0,0,32);b.writeUInt32LE(172800,0);b.writeUInt16LE(720,4);b.writeUInt16LE(480,6);b[8]=6;Buffer.from([0,255,252,224,3,28]).copy(b,16);return b;}
function context(){const map=new Map(),store={async get(k){return map.has(k)?map.get(k):null;},async set(k,v,o){assert.ok(v instanceof ArrayBuffer,'Blob writes must use supported ArrayBuffer');if(o?.onlyIfNew&&map.has(k))throw Object.assign(new Error('exists'),{code:'PRECONDITION_FAILED'});map.set(k,Buffer.from(v));}};return{map,store};}
const invoke=(c,path,options={},time=now)=>handleArkCloud(new Request('https://playmath.cn'+path,options),env,{store:c.store,now:time});
async function provision(c,body){const raw=JSON.stringify(body),exp=String(Math.floor(now/1000)+120);return invoke(c,'/api/ark/provision',{method:'POST',headers:{'X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(secret,exp,raw)},body:raw});}
async function setup(c){const assets=[film(2),film(3),film(4)];for(const b of assets)assert.equal((await provision(c,{type:'asset',sha256:hash(b),base64:b.toString('base64')})).status,200);const config={deviceId,tokenHash:hash(token),enabled:true,mode:'test',testStart:new Date(now).toISOString(),intervalMinutes:5,dailyAt:'01:00',startDate:'2026-10-27',playlist:assets.map(b=>({sha256:hash(b)}))};assert.equal((await provision(c,{type:'device',config})).status,200);return{assets,config};}
const hb='/api/v1/device/heartbeat?device_id='+deviceId,authorization='Bearer '+token;
test('签名预置、资产加密及重复设备导入保护',async()=>{const c=context(),{config}=await setup(c);assert.equal((await provision(c,{type:'device',config})).status,409);assert.equal((await invoke(c,'/api/ark/provision',{method:'POST',body:'{}'})).status,403);for(const b of c.map.values())assert.ok(!b.includes(Buffer.from(config.tokenHash)));const invalid=film(2);invalid[32]=255;assert.equal((await provision(c,{type:'asset',sha256:hash(invalid),base64:invalid.toString('base64')})).status,400);});
test('心跳只接受Bearer凭据，不接受查询参数代替鉴权',async()=>{const c=context();await setup(c);for(const headers of [{},{authorization:'Bearer '+'b'.repeat(32)},{authorization:'Bearer '+'ø'.repeat(32)}])assert.equal((await invoke(c,hb+'&token='+token,{headers})).status,403);assert.equal((await invoke(c,hb.replace(deviceId,'000000000000'),{headers:{authorization}})).status,403);assert.equal((await invoke(c,hb,{headers:{authorization}})).status,200);});
test('5分钟轮换、同图去重及实际文件下载SHA校验',async()=>{const c=context(),{assets}=await setup(c);const first=await invoke(c,hb,{headers:{authorization}}),data=await first.json();assert.equal(first.headers.get('cache-control'),'no-store');assert.equal(data.data.commands[0].params.sleep_time,5);const p=data.data.commands[1].params,url=new URL(p.url);assert.ok(p.url.length<512);const download=await invoke(c,url.pathname+url.search);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),assets[0]);const same=await(await invoke(c,hb+'&cloud_stored_sha='+p.sha256,{headers:{authorization}},now+299000)).json();assert.equal(same.data.commands.length,1);const next=await(await invoke(c,hb+'&cloud_stored_sha='+p.sha256,{headers:{authorization}},now+300000)).json();assert.notEqual(next.data.commands[1].params.sha256,p.sha256);const report=JSON.parse(decryptAccountData(env,c.map.get('reports/'+deviceId)));assert.equal(report.displayConfirmed,false);});
test('拒绝过期、篡改、跨设备及撤销后的下载',async()=>{const c=context(),{config}=await setup(c);const r=await(await invoke(c,hb,{headers:{authorization}})).json(),url=new URL(r.data.commands[1].params.url),path=url.pathname+url.search;assert.equal((await invoke(c,path,{},now+901000)).status,403);for(const [k,v]of [['sig','0'.repeat(64)],['sha','f'.repeat(64)],['device_id','000000000000'],['exp','invalid']]){const u=new URL(url);u.searchParams.set(k,v);assert.equal((await invoke(c,u.pathname+u.search)).status,403);}config.enabled=false;c.map.set('devices/'+deviceId,encryptAccountData(env,Buffer.from(JSON.stringify(config))));assert.equal((await invoke(c,path)).status,403);assert.equal((await invoke(c,hb,{headers:{authorization}})).status,403);});
test('北京时间01:00每日切换与休眠计算',()=>{const c={mode:'daily',dailyAt:'01:00',startDate:'2026-10-27',playlist:[{sha256:'a'},{sha256:'b'},{sha256:'c'}]},before=selection(c,Date.parse('2026-10-28T00:59:59+08:00')),after=selection(c,Date.parse('2026-10-28T01:00:00+08:00'));assert.equal(before.day,'2026-10-27');assert.equal(before.asset.sha256,'a');assert.equal(after.day,'2026-10-28');assert.equal(after.asset.sha256,'b');assert.equal(after.sleepMinutes,1440);assert.equal(selection(c,Date.parse('2026-10-28T00:00:00+08:00')).sleepMinutes,60);});
test('格式检查、健康检查不泄露密钥',async()=>{assert.throws(()=>validateFilm(Buffer.alloc(32)));const r=await invoke(context(),'/api/ark/health'),text=await r.text();assert.equal(r.status,200);assert.ok(!text.includes(secret));assert.equal(JSON.parse(text).paidModels,false);});


test('云端探测不伪造硬件心跳，签名配置可切回每日模式',async()=>{const c=context();await setup(c);const r=await invoke(c,hb,{headers:{authorization,'X-Ark-Dry-Run':'1'}});assert.equal(r.status,200);assert.equal(c.map.has('reports/'+deviceId),false);assert.equal((await provision(c,{type:'schedule',deviceId,mode:'daily'})).status,200);const status=await(await invoke(c,'/api/ark/status?device_id='+deviceId,{headers:{authorization}})).json();assert.equal(status.mode,'daily');assert.equal(status.dailyAt,'01:00');assert.equal(status.report,null);assert.equal((await provision(c,{type:'schedule',deviceId,mode:'test',testStart:'bad'})).status,400);});


test('云函数Web流无需实现asyncIterator，超大流会中止',async()=>{const c=context();await setup(c);const raw=JSON.stringify({type:'invalid'}),exp=String(Math.floor(now/1000)+120);const r=new Request('https://playmath.cn/api/ark/provision',{method:'POST',headers:{'X-Ark-Expires':exp,'X-Ark-Signature':provisionSignature(secret,exp,raw)},body:raw});const request={url:r.url,method:r.method,headers:Object.fromEntries(r.headers),body:{getReader:()=>r.body.getReader()}};const response=await handleArkCloud(request,env,{store:c.store,now});assert.equal(response.status,400);const huge='x'.repeat(240001),e=new Request(r.url,{method:'POST',headers:r.headers,body:huge});assert.equal((await handleArkCloud(e,env,{store:c.store,now})).status,413);});

 test('签名更换轮播仅修改图片列表，保留设备身份和日程，拒绝缺失资产',async()=>{const c=context(),{config}=await setup(c);const playlist=Array(3).fill({sha256:config.playlist[1].sha256});// playlist 端点只改轮播列表；即便请求体带 tokenHash/enabled 也不得覆盖设备身份与启用状态（安全属性）
 assert.equal((await provision(c,{type:'playlist',deviceId,playlist,tokenHash:'f'.repeat(64),enabled:false})).status,200);const saved=JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId)));assert.deepEqual(saved,{...config,playlist});// 缺失资产拒绝：引用不存在的哈希，配置保持不变
 assert.equal((await provision(c,{type:'playlist',deviceId,playlist:Array(3).fill({sha256:'f'.repeat(64)})})).status,409);assert.deepEqual(JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId))),saved);});

 test('五张图每五分钟轮播，二十五分钟回到首图且保留鉴权',async()=>{const c=context(),{config}=await setup(c);const assets=[film(0),film(1),film(2),film(3),film(4)];for(const b of assets)assert.equal((await provision(c,{type:'asset',sha256:hash(b),base64:b.toString('base64')})).status,200);const playlist=assets.map(b=>({sha256:hash(b)}));assert.equal((await provision(c,{type:'playlist',deviceId,playlist})).status,200);const saved=JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId)));assert.equal(saved.tokenHash,config.tokenHash);for(let i=0;i<=5;i++){const r=await(await invoke(c,hb,{headers:{authorization}},now+i*300000)).json();assert.equal(r.data.commands[0].params.sleep_time,5);assert.equal(r.data.commands[1].params.sha256,playlist[i%5].sha256);}assert.equal((await provision(c,{type:'playlist',deviceId,playlist:[]})).status,200);assert.equal((await provision(c,{type:'playlist',deviceId,playlist:Array(6).fill(playlist[0])})).status,400);});

test('ritual chunks commit atomically, old firmware keeps Film, new firmware receives signed two-day bundle and deduplicates',async()=>{
 const c=context();await setup(c);const bytes=packageFixture(),sha256=hash(bytes),chunks=[];
 assert.equal((await provision(c,{type:'ritual_commit',deviceId,sha256,chunks:['f'.repeat(64)]})).status,409);
 for(let i=0;i<bytes.length;i+=65536){const chunk=bytes.subarray(i,i+65536),h=hash(chunk);assert.equal((await provision(c,{type:'ritual_chunk',sha256:h,base64:chunk.toString('base64')})).status,200);chunks.push(h);}
 assert.equal((await provision(c,{type:'ritual_commit',deviceId,sha256,chunks})).status,200);
 let r=await(await invoke(c,hb,{headers:{authorization}})).json();assert.equal(r.data.commands[1].cmd,'download_film');
 r=await(await invoke(c,hb+'&ritual_v=1',{headers:{authorization}})).json();assert.equal(r.data.commands[0].cmd,'download_ritual');const url=new URL(r.data.commands[0].params.url);
 const downloaded=await invoke(c,url.pathname+url.search);assert.equal(downloaded.status,200);assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())),sha256);
 r=await(await invoke(c,hb+'&ritual_v=1&cloud_stored_sha='+sha256,{headers:{authorization}})).json();assert.deepEqual(r.data.commands.map(c=>c.cmd),['set_config']);
 r=await(await invoke(c,hb+'&ritual_v=1&cloud_stored_sha='+sha256+'&store_seq=9&render_seq=12',{headers:{authorization}})).json();assert.equal(r.data.ack_stored_sha,sha256);assert.equal(r.data.ack_store_seq,9);assert.equal(r.data.ack_render_seq,null);
 r=await(await invoke(c,hb+'&ritual_v=1&cloud_stored_sha='+sha256+'&store_seq=9',{headers:{authorization,'x-ark-dry-run':'1'}})).json();assert.equal(r.data.ack_store_seq,undefined);

 assert.equal((await provision(c,{type:'ritual_commit',deviceId,sha256:'f'.repeat(64),chunks})).status,400);
 assert.equal(JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId))).ritualSha,sha256);
 assert.equal((await provision(c,{type:'ritual_disable',deviceId})).status,200);assert.equal((await invoke(c,url.pathname+url.search)).status,403);
});

test('background publisher stages chunks, stops superseded plans, signs commit and validates account/device mapping',async()=>{
 const c=context();await setup(c);const bytes=packageFixture(),cfg={...env,RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'};
 const fetcher=(url,options)=>handleArkCloud(new Request(url,options),env,{store:c.store,now:Date.now()});
 assert.deepEqual(await publishRitualPackage(cfg,deviceId,bytes,{fetcher,beforeCommit:async()=>false}),{superseded:true});
 assert.equal(JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId))).ritualSha,undefined);
 const result=await publishRitualPackage(cfg,deviceId,bytes,{fetcher});assert.equal(result.sha256,hash(bytes));assert.equal(result.bytes,948608);
 assert.throws(()=>ritualDeviceLinks({RITUAL_DEVICE_LINKS:JSON.stringify({bad:deviceId})}));
 assert.throws(()=>ritualDeviceLinks({RITUAL_DEVICE_LINKS:JSON.stringify({['a'.repeat(32)]:deviceId,['b'.repeat(32)]:deviceId})}));
});

test('replacement reports identify the previous package, and disabling ritual clears the device override before Film download',async()=>{
 const c=context();await setup(c);const first=packageFixture(),second=Buffer.from(first);second[44]=1;
 const cfg={...env,RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'},fetcher=(url,options)=>handleArkCloud(new Request(url,options),env,{store:c.store,now:Date.now()});
 await publishRitualPackage(cfg,deviceId,first,{fetcher});await publishRitualPackage(cfg,deviceId,second,{fetcher});
 const params='&ritual_v=1&ritual_active=1&cloud_stored_sha='+hash(first)+'&ritual_render=1&ritual_day=1&ritual_action=3&ritual_answer=0&ritual_started_at='+String(Math.floor(now/1000)-10)+'&download_state=3&download_progress=67';
 await invoke(c,hb+params,{headers:{authorization}});
 let status=await(await invoke(c,'/api/ark/status?device_id='+deviceId,{headers:{authorization}})).json();
 assert.equal(status.report.stored,false);assert.equal(status.report.renderSha,hash(first));assert.equal(status.report.renderReport.day,1);assert.equal(status.report.downloadState,3);assert.equal(status.report.downloadProgress,67);assert.equal(status.mode,'test');assert.equal(status.intervalMinutes,2);
 await provision(c,{type:'ritual_disable',deviceId});
 const result=await(await invoke(c,hb+params,{headers:{authorization}})).json();assert.equal(result.data.commands[0].cmd,'disable_ritual');assert.ok(result.data.commands.some(c=>c.cmd==='download_film'));
 const legacy=await(await invoke(c,hb,{headers:{authorization}})).json();assert.ok(!legacy.data.commands.some(c=>c.cmd==='disable_ritual'));
});

test('v2 photo packets are delivered only to compatible firmware; old firmware retains its screen',async()=>{
 const c=context();await setup(c);const bytes=packageFixture();bytes.writeUInt32LE(2,36);bytes.writeUInt32LE(3,60);validateRitual(bytes);
 const bad=Buffer.from(bytes);bad.writeUInt32LE(7,60);assert.throws(()=>validateRitual(bad));
 await publishRitualPackage({SESSION_SECRET:secret,RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'},deviceId,bytes,{fetcher:(url,options)=>handleArkCloud(new Request(url,options),env,{store:c.store,now:Date.now()})});
 const old=await(await invoke(c,hb+'&ritual_v=1&ritual_active=1',{headers:{authorization}})).json();assert.equal(old.data.firmware_update_required,true);assert.ok(!old.data.commands.some(c=>['download_film','download_ritual','disable_ritual'].includes(c.cmd)));
 const current=await(await invoke(c,hb+'&ritual_v=2',{headers:{authorization}})).json();assert.equal(current.data.firmware_update_required,false);assert.equal(current.data.commands[0].cmd,'download_ritual');
});

test('BLE pairing authenticates via one-time nonce (not Bearer), is scoped to its account, and expires safely',async()=>{
 const {beginDevicePairing,pairedDeviceIdentity}=await import('../lib/ark-cloud.mjs');const c=context();await setup(c);const account='1'.repeat(32),challenge=await beginDevicePairing(env,account,{store:c.store,now});
 assert.ok(Buffer.byteLength(challenge.heartbeatURL)+4<=125);assert.equal((await pairedDeviceIdentity(env,account,challenge.nonce,{store:c.store,now})).status,'waiting');
 const legacy=challenge.heartbeatURL+'?device_id='+deviceId+'&ritual_v=3';
 // 配对模式靠一次性 nonce 认证，不要求设备 Bearer 令牌：回拨即完成配对（无论是否带 Bearer）
 const response=await handleArkCloud(new Request(legacy),env,{store:c.store,now});assert.equal(response.status,200);
 assert.deepEqual(await pairedDeviceIdentity(env,account,challenge.nonce,{store:c.store,now}),{status:'identified',deviceId});
 await assert.rejects(pairedDeviceIdentity(env,'2'.repeat(32),challenge.nonce,{store:c.store,now}));await assert.rejects(pairedDeviceIdentity(env,account,challenge.nonce,{store:c.store,now:now+90001}));
 // 日常心跳（非配对）仍强制 Bearer：无令牌被拒，且不泄露凭据
 for(const headers of [{},{authorization:'Bearer '+'b'.repeat(32)}])assert.equal((await invoke(c,hb,{headers})).status,403);
 // 配对过期后设备正常心跳（带 Bearer）不受影响
 assert.equal((await invoke(c,hb,{headers:{authorization}},now+90001)).status,200);
});

test('v4 reading packages never reach v1–v3 firmware; v4 downloads exact SHA',async()=>{
 const c=context();await setup(c);
 const legacy=packageFixture(),answer=64+2*172832+80*7680,b=Buffer.alloc(answer+100*6300);legacy.copy(b,0,0,64+2*172832);
 b.writeUInt32LE(b.length,8);b.writeUInt32LE(answer,32);b.writeUInt32LE(4,36);
 for(let a=0;a<100;a++){const off=answer+a*6300;b.writeUInt32LE(300,off);for(let i=0;i<150;i++){b[off+4+i*2]=255;b[off+5+i*2]=0;}}
 await publishRitualPackage({SESSION_SECRET:secret,RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'},deviceId,b,{fetcher:(url,options)=>handleArkCloud(new Request(url,options),env,{store:c.store,now:Date.now()})});
 for(const v of [1,2,3]){
  const old=await(await invoke(c,hb+'&ritual_v='+v+'&ritual_active=1',{headers:{authorization}})).json();
  assert.equal(old.data.firmware_update_required,true);assert.ok(!old.data.commands.some(c=>['download_film','download_ritual','disable_ritual'].includes(c.cmd)));
 }
 const result=await(await invoke(c,hb+'&ritual_v=4',{headers:{authorization}})).json();assert.equal(result.data.firmware_update_required,false);
 const command=result.data.commands.find(c=>c.cmd==='download_ritual');assert.equal(command.params.sha256,hash(b));
 const url=new URL(command.params.url);const downloaded=await invoke(c,url.pathname+url.search);assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())),hash(b));
});

import {packageZiFixture} from './fixtures/ritual-zi-package.mjs';
test('v5 nine-slot package gates v1–v4 and accepts Zi variant44 report only for v5',async()=>{
 const c=context();await setup(c);const b=packageZiFixture();
 await publishRitualPackage({SESSION_SECRET:secret,RITUAL_PUBLIC_ORIGIN:'https://playmath.cn'},deviceId,b,{fetcher:(url,options)=>handleArkCloud(new Request(url,options),env,{store:c.store,now:Date.now()})});
 for(const v of [1,2,3,4]){const result=await(await invoke(c,hb+'&ritual_v='+v+'&ritual_active=1',{headers:{authorization}})).json();assert.equal(result.data.firmware_update_required,true);assert.ok(!result.data.commands.some(c=>['download_ritual','disable_ritual','download_film'].includes(c.cmd)));}
 const query='&ritual_v=5&cloud_stored_sha='+hash(b)+'&ritual_render=1&ritual_day=1&ritual_action=44&ritual_answer=-1';
 await invoke(c,hb+query,{headers:{authorization}});
 const report=JSON.parse(decryptAccountData(env,c.map.get('reports/'+deviceId)));assert.equal(report.renderReport.action,44);
 await invoke(c,hb+query.replace('ritual_action=44','ritual_action=45'),{headers:{authorization}});
 assert.equal(JSON.parse(decryptAccountData(env,c.map.get('reports/'+deviceId))).renderReport,null);
});

test('pairing diagnostics expose rejection stage only to the challenge owner, never credentials or unverified IDs',async()=>{
 const {beginDevicePairing,pairedDeviceIdentity}=await import('../lib/ark-cloud.mjs'),c=context();await setup(c);
 const account='1'.repeat(32),challenge=await beginDevicePairing(env,account,{store:c.store,now});
 assert.equal((await pairedDeviceIdentity(env,account,challenge.nonce,{store:c.store,now})).diagnostic.stage,'not_received');
 // 日常心跳（非配对）无令牌/错误令牌被拒，且不泄露凭据
 const daily='https://playmath.cn/api/v1/device/heartbeat?device_id='+deviceId;
 for(const [headers] of [[{}],[{authorization:'Bearer '+'b'.repeat(32)}]]){
  const r=await handleArkCloud(new Request(daily,{headers}),env,{store:c.store,now});
  assert.equal(r.status,403);const text=JSON.stringify(await r.json());assert.equal(text.includes(deviceId),false);assert.equal(text.includes(token),false);
 }
 // 配对模式下未注册设备：自动预置（auto-provision），不再拒绝 device_unregistered；配对凭证仍写入
 const unknown=challenge.heartbeatURL+'?device_id=112233445566';
 assert.equal((await handleArkCloud(new Request(unknown),env,{store:c.store,now})).status,200);
 assert.equal(c.map.has('devices/112233445566'),true);
 assert.equal(c.map.has('pairing-proof/'+challenge.nonce),true);
 await assert.rejects(pairedDeviceIdentity(env,'2'.repeat(32),challenge.nonce,{store:c.store,now}));
});

test('心跳拒绝留下脱敏诊断并随账户状态返回，正常心跳不额外写存储',async()=>{
 const {linkedRitualReportForDevice}=await import('../lib/ark-cloud.mjs'),c=context();await setup(c);
 // 云端探测（dry-run）不得留下任何痕迹
 assert.equal((await invoke(c,hb,{headers:{authorization,'X-Ark-Dry-Run':'1'}})).status,200);
 assert.equal(c.map.has('heartbeat-diagnostic/'+deviceId),false);
 // 缺凭据 / 凭据不匹配 → 403 且各自留痕，据此可区分「来过但被拒」与「从未到达」
 for(const headers of [{},{authorization:'Bearer '+'b'.repeat(32)}])assert.equal((await invoke(c,hb,{headers})).status,403);
 const diag=JSON.parse(decryptAccountData(env,c.map.get('heartbeat-diagnostic/'+deviceId)));
 assert.equal(diag.total,2);
 assert.equal(diag.stages.auth_missing.count,1);
 assert.equal(diag.stages.auth_mismatch.count,1);
 assert.equal(diag.last.status,403);
 assert.equal(diag.last.pairing,false);
 const stored=JSON.stringify(diag);
 for(const leak of [token,'Bearer','token='])assert.ok(!stored.includes(leak),'诊断不得记录 '+leak);
 // 正常心跳只写 reports/，不追加诊断，避免每 10 秒两次额外 KV 操作
 assert.equal((await invoke(c,hb,{headers:{authorization}})).status,200);
 assert.equal(JSON.parse(decryptAccountData(env,c.map.get('heartbeat-diagnostic/'+deviceId))).total,2);
 // 账户状态通道把诊断带出来，「复制状态诊断」即可取证
 const cfg=JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId)));
 cfg.ritualSha='c'.repeat(64);
 c.map.set('devices/'+deviceId,encryptAccountData(env,Buffer.from(JSON.stringify(cfg))));
 const report=await linkedRitualReportForDevice({...env,RITUAL_CLOUD_STORE:c.store},{id:'a'.repeat(32)},deviceId);
 assert.equal(report.heartbeatDiagnostic.total,2);
 assert.equal(report.heartbeatDiagnostic.last.stage,'auth_mismatch');
});

test('自动预置的无令牌设备心跳不再被 403 卡死，能领到下载指令；带令牌设备不受影响',async()=>{
 const {beginDevicePairing}=await import('../lib/ark-cloud.mjs'),c=context();
 const account='3'.repeat(32),challenge=await beginDevicePairing(env,account,{store:c.store,now});
 // 配对回拨：固件没走过出厂 provision，不带 Bearer → 自动建设备且 tokenHash=null
 const legacy=challenge.heartbeatURL+'?device_id='+deviceId+'&ritual_v=3';
 assert.equal((await handleArkCloud(new Request(legacy),env,{store:c.store,now})).status,200);
 const saved=JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId)));
 assert.equal(saved.tokenHash,null);
 // 模拟 ritual_commit 把仪式内容写进设备配置
 saved.ritualSha='d'.repeat(64);saved.ritualMeta={mode:'daily',answerCount:100,startEpoch:0,protocol:3};
 c.map.set('devices/'+deviceId,encryptAccountData(env,Buffer.from(JSON.stringify(saved))));
 // 日常心跳：固件只能发空 Bearer / 不带 Authorization，过去一律 403、lastSeen 冻结
 for(const headers of [{},{authorization:'Bearer '}]){
  const response=await invoke(c,hb+'&ritual_v=3',{headers});
  assert.equal(response.status,200);
  assert.equal((await response.json()).data.commands[0].cmd,'download_ritual');
 }
 // 放行后必须真正写回执，账户状态才会推进
 assert.ok(c.map.has('reports/'+deviceId));
 assert.equal(JSON.parse(decryptAccountData(env,c.map.get('reports/'+deviceId))).targetSha,'d'.repeat(64));
 // 带 tokenHash 的常规设备仍严格执行 Bearer 校验，不得被放宽
 const other=context();await setup(other);
 for(const headers of [{},{authorization:'Bearer '+'b'.repeat(32)}])assert.equal((await invoke(other,hb,{headers})).status,403);
 assert.equal((await invoke(other,hb,{headers:{authorization}})).status,200);
});
