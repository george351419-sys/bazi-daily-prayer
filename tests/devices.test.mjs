import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {claimDevice,listDevices,selectDeviceArtwork,devicePreview} from '../lib/devices.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {saveArtwork} from '../lib/accounts.mjs';
import onRequest from '../edgeone/handler.mjs';
const owner={id:'a'.repeat(32)},deviceId='prayer-device-test',artworkId='c'.repeat(36);
async function context(t){const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-devices-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'test-only-secret-for-devices-2026',DEVICE_SERVICE_URL:'http://127.0.0.1:8790',DEVICE_SERVICE_KEY:'test-device-service-key-'+'k'.repeat(32)};}
test('设备绑定采用服务端账户身份，密钥不返回浏览器且拒绝不安全地址',async t=>{
 const c=await context(t);let received;
 const fake=async(url,options)=>{received={url,options,body:JSON.parse(options.body)};return Response.json({ok:true});};
 assert.deepEqual(await claimDevice(c,owner,{deviceId,claimCode:'a'.repeat(32),name:'画屏',ownerId:'b'.repeat(32)},fake),{ok:true});
 assert.equal(received.body.ownerId,owner.id);assert.equal(received.options.redirect,'error');assert.equal(received.options.headers.Authorization,'Bearer '+c.DEVICE_SERVICE_KEY);
 for(const url of ['http://remote.example','https://user:password@example.org'])await assert.rejects(()=>listDevices({...c,DEVICE_SERVICE_URL:url},owner,fake),e=>e.status===503);
 const bootstrap=await onRequest({request:new Request('https://playmath.cn/api/bootstrap'),env:c});const text=await bootstrap.text();assert.equal(JSON.parse(text).devices.enabled,true);assert.ok(!text.includes(c.DEVICE_SERVICE_KEY));assert.ok(!text.includes(c.DEVICE_SERVICE_URL));
 const unauthorized=await onRequest({request:new Request('https://playmath.cn/api/account/devices'),env:c});assert.equal(unauthorized.status,403);
});
test('只能选择本人已归档作品，读取私图前校验设备归属',async t=>{
 const c=await context(t);let selected=0;
 await accountRepository(c).putImage('images/'+owner.id+'/'+artworkId,Buffer.from('private-image-test'));
 await saveArtwork(c,owner,{id:artworkId,userId:owner.id,date:'2026-10-24',status:'complete',image:{key:'images/'+owner.id+'/'+artworkId}});
 const fake=async(url,options)=>{if(url.includes('/internal/devices'))return Response.json({items:[{id:deviceId}]});selected++;const body=JSON.parse(options.body);assert.equal(body.ownerId,owner.id);assert.equal(body.artworkId,artworkId);assert.equal(Buffer.from(body.imageBase64,'base64').toString(),'private-image-test');return Response.json({ok:true,revision:1});};
 assert.equal((await selectDeviceArtwork(c,owner,deviceId,{artworkId,expectedRevision:0,requestId:'e'.repeat(32)},fake)).revision,1);
 await assert.rejects(()=>selectDeviceArtwork(c,{id:'b'.repeat(32)},deviceId,{artworkId,expectedRevision:0,requestId:'e'.repeat(32)},fake),e=>e.status===404);
 await assert.rejects(()=>selectDeviceArtwork(c,owner,'prayer-other-device',{artworkId,expectedRevision:0,requestId:'e'.repeat(32)},fake),e=>e.status===404);assert.equal(selected,1);
 await saveArtwork(c,owner,{id:artworkId,userId:owner.id,date:'2026-10-24',status:'mapped'});
 await assert.rejects(()=>selectDeviceArtwork(c,owner,deviceId,{artworkId,expectedRevision:0,requestId:'e'.repeat(32)},fake),e=>e.status===409);
});
test('设备服务故障与鉴权错误不泄露上游诊断和凭据',async t=>{
 const c=await context(t);
 await assert.rejects(()=>listDevices(c,owner,async()=>{throw new Error(c.DEVICE_SERVICE_KEY);}),e=>e.status===503&&!e.message.includes(c.DEVICE_SERVICE_KEY));
 await assert.rejects(()=>listDevices(c,owner,async()=>Response.json({error:c.DEVICE_SERVICE_KEY},{status:401})),e=>e.status===503&&!e.message.includes(c.DEVICE_SERVICE_KEY));
});
test('选画携带预期版本和幂等请求号，版本冲突保留明确错误码',async t=>{
 const c=await context(t);
 await accountRepository(c).putImage('image-test',Buffer.from('private-image-test'));
 await saveArtwork(c,owner,{id:artworkId,userId:owner.id,date:'2026-10-24',status:'complete',image:{key:'image-test'}});
 const fake=async(url,options)=>{if(url.includes('/internal/devices?'))return Response.json({items:[{id:deviceId}]});const body=JSON.parse(options.body);assert.equal(body.expectedRevision,4);assert.equal(body.requestId,'f'.repeat(32));return Response.json({error:'private diagnostic',code:'revision_conflict'},{status:409});};
 await assert.rejects(()=>selectDeviceArtwork(c,owner,deviceId,{artworkId,expectedRevision:4,requestId:'f'.repeat(32)},fake),e=>e.status===409&&e.code==='revision_conflict'&&!e.message.includes('private diagnostic'));
 await assert.rejects(()=>selectDeviceArtwork(c,owner,deviceId,{artworkId},fake),e=>e.status===400);
});
test('预览绑定账户和具体版本，错误类型或上游HTML不能作为图片返回',async t=>{
 const c=await context(t),png=Buffer.from([137,80,78,71,13,10,26,10,1]);
 const fake=async url=>{assert.ok(url.includes('ownerId='+owner.id));assert.ok(url.endsWith('revision=2'));return new Response(png,{headers:{'Content-Type':'image/png'}});};
 assert.deepEqual(await devicePreview(c,owner,deviceId,'2',fake),png);
 await assert.rejects(()=>devicePreview(c,owner,deviceId,'0',fake),e=>e.status===400);
 await assert.rejects(()=>devicePreview(c,owner,deviceId,'2',async()=>new Response('<html>error</html>',{headers:{'Content-Type':'image/png'}})),e=>e.status===502);
 await assert.rejects(()=>devicePreview(c,owner,deviceId,'2',async()=>new Response('error',{headers:{'Content-Type':'text/html'}})),e=>e.status===502);
});
