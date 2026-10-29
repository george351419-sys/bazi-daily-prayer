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

 test('签名更换轮播仅修改图片列表，保留设备身份和日程，拒绝缺失资产',async()=>{const c=context(),{config}=await setup(c);const playlist=Array(3).fill({sha256:config.playlist[1].sha256});assert.equal((await provision(c,{type:'playlist',deviceId,playlist,tokenHash:'f'.repeat(64),enabled:false})).status,200);const saved=JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId)));assert.deepEqual(saved,{...config,playlist});assert.equal((await provision(c,{type:'playlist',deviceId,playlist:[]})).status,400);assert.equal((await provision(c,{type:'playlist',deviceId,playlist:Array(3).fill({sha256:'f'.repeat(64)})})).status,409);assert.deepEqual(JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId))),saved);});

 test('五张图每五分钟轮播，二十五分钟回到首图且保留鉴权',async()=>{const c=context(),{config}=await setup(c);const assets=[film(0),film(1),film(2),film(3),film(4)];for(const b of assets)assert.equal((await provision(c,{type:'asset',sha256:hash(b),base64:b.toString('base64')})).status,200);const playlist=assets.map(b=>({sha256:hash(b)}));assert.equal((await provision(c,{type:'playlist',deviceId,playlist})).status,200);const saved=JSON.parse(decryptAccountData(env,c.map.get('devices/'+deviceId)));assert.equal(saved.tokenHash,config.tokenHash);for(let i=0;i<=5;i++){const r=await(await invoke(c,hb,{headers:{authorization}},now+i*300000)).json();assert.equal(r.data.commands[0].params.sleep_time,5);assert.equal(r.data.commands[1].params.sha256,playlist[i%5].sha256);}assert.equal((await provision(c,{type:'playlist',deviceId,playlist:[]})).status,400);assert.equal((await provision(c,{type:'playlist',deviceId,playlist:Array(6).fill(playlist[0])})).status,400);});

test('ritual chunks commit atomically, old firmware keeps Film, new firmware receives signed two-day bundle and deduplicates',async()=>{
 const c=context();await setup(c);const bytes=packageFixture(),sha256=hash(bytes),chunks=[];
 assert.equal((await provision(c,{type:'ritual_commit',deviceId,sha256,chunks:['f'.repeat(64)]})).status,409);
 for(let i=0;i<bytes.length;i+=65536){const chunk=bytes.subarray(i,i+65536),h=hash(chunk);assert.equal((await provision(c,{type:'ritual_chunk',sha256:h,base64:chunk.toString('base64')})).status,200);chunks.push(h);}
 assert.equal((await provision(c,{type:'ritual_commit',deviceId,sha256,chunks})).status,200);
 let r=await(await invoke(c,hb,{headers:{authorization}})).json();assert.equal(r.data.commands[1].cmd,'download_film');
 r=await(await invoke(c,hb+'&ritual_v=1',{headers:{authorization}})).json();assert.equal(r.data.commands[0].cmd,'download_ritual');const url=new URL(r.data.commands[0].params.url);
 const downloaded=await invoke(c,url.pathname+url.search);assert.equal(downloaded.status,200);assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())),sha256);
 r=await(await invoke(c,hb+'&ritual_v=1&cloud_stored_sha='+sha256,{headers:{authorization}})).json();assert.deepEqual(r.data.commands.map(c=>c.cmd),['set_config']);
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
 assert.equal(status.report.stored,false);assert.equal(status.report.renderSha,hash(first));assert.equal(status.report.renderReport.day,1);assert.equal(status.report.downloadState,3);assert.equal(status.report.downloadProgress,67);assert.equal(status.mode,'test');assert.equal(status.intervalMinutes,1);
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
