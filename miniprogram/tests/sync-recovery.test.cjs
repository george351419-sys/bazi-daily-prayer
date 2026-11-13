const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ArkBLE}=require('../utils/ble');
test('explicit recovery checks the heartbeat route then reconnects saved Wi-Fi once without credential writes',async()=>{
 const client=new ArkBLE(()=>{},()=>{}),commands=[];client.id='device';client.status=true;client.restoreHeartbeatURL=async()=>({result:'clean'});client.ensureCloudAPI=async()=>{};client.write=async ch=>{commands.push(ch);if(ch===0x3a)client.status=true;};await client.recoverSync();assert.equal(commands.filter(ch=>ch===0x38).length,1);assert.ok(!commands.includes(0x32)&&!commands.includes(0x34)&&!commands.includes(0x39));assert.equal(client.status,true);
});
test('recovery stops for an unknown or foreign heartbeat route',async()=>{for(const result of ['foreign','empty','failed']){const client=new ArkBLE(()=>{},()=>{});client.id='device';client.restoreHeartbeatURL=async()=>({result});let writes=0;client.write=async()=>writes++;await assert.rejects(client.recoverSync(),/心跳地址/);assert.equal(writes,0);}});
test('pairing cloud requests use a bounded timeout',async()=>{
 const client=new ArkBLE(()=>{},()=>{});client.id='device';client.ensureCloudAPI=async()=>{};client.readHeartbeatURL=async()=> 'https://playmath.cn/api/v1/device/heartbeat';let timeout;
 await assert.rejects(client.resolveIdentity(async(url,body,options)=>{timeout=options.timeout;throw new Error('simulated network timeout');}),/simulated/);assert.equal(timeout,10000);
});
test('the API forwards a short timeout only to the requested operation',async()=>{
 const calls=[],context={module:{exports:{}},wx:{getStorageSync:()=>'',request:o=>{calls.push(o);o.success({statusCode:200,data:o.url.endsWith('/bootstrap')?{miniProgram:{enabled:true}}:{ok:true},header:{}});}},getApp:()=>({globalData:{}}),console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../utils/api'),'utf8'),context);await context.module.exports.request('/api/account/ritual/device',{beginPairing:true},{timeout:10000});assert.equal(calls[0].timeout,120000);assert.equal(calls[1].timeout,10000);
});
test('a pending Bluetooth identification does not block cloud progress refresh',async()=>{
 let page,requests=0;const status={plan:{contentMode:'photo'}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../pages/network/index.js'),'utf8'),{Page:p=>page=p,require:id=>id.endsWith('/api')?{request:async()=>{requests++;return status;},error(){}}:{},setTimeout:()=>1,clearTimeout(){},console});
 page.active=true;page.run=1;page.data.user={id:'u'};page.setData=patch=>Object.assign(page.data,patch);page.autoBind=()=>new Promise(()=>{});page.connection={acceptStatus(){},planView:()=>({status,syncState:{phase:'waiting'}})};await page.pollSync();assert.equal(requests,1);assert.equal(page.data.status.plan.contentMode,'photo');
});
