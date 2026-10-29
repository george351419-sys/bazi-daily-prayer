import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generationSettings,configureAutomation,openPayload,fenceProfileChange} from '../lib/automation.mjs';
import {saveProfile,saveArtwork,accountHistory,profileSignature} from '../lib/accounts.mjs';
import {validateInput} from '../lib/domain.mjs';
import {runDailyTick} from '../lib/daily-worker.mjs';
const profile={gender:'female',birthDate:'1992-10-17',birthTime:'22:30',city:'上海',calendar:'solar',wishes:['W02']},owner={id:'a'.repeat(32)};
async function context(t){const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-daily-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'test-only-daily-encryption-secret',DEVICE_SERVICE_URL:'http://127.0.0.1:8790',DEVICE_SERVICE_KEY:'k'.repeat(32)};}
test('每日策略从已保存资料建立加密快照，不接受浏览器伪造身份或出生资料',async t=>{
 const c=await context(t);await saveProfile(c,owner,profile);let received;
 await configureAutomation(c,owner,{mode:'daily',updateTime:'07:00',expectedVersion:0,ownerId:'b'.repeat(32),profile:{gender:'male'}},async(url,options)=>{received=JSON.parse(options.body);return Response.json({mode:'daily'});});
 assert.equal(received.ownerId,owner.id);assert.ok(!JSON.stringify(received).includes(profile.birthDate));assert.deepEqual(openPayload(c,received.snapshot).profile.wishes,['W02']);assert.equal(openPayload(c,received.snapshot).profile.gender,'female');assert.equal(received.expectedVersion,0);
 await assert.rejects(()=>configureAutomation(c,owner,{mode:'daily',expectedVersion:0,updateTime:'25:00'}),e=>e.status===400);
});
test('生成指纹区分愿望及模型版本，但忽略资料保存时间',async t=>{
 const c=await context(t),a=generationSettings(c,profile).fingerprint;
 assert.equal(a,generationSettings(c,{...profile,updatedAt:'tomorrow'}).fingerprint);
 assert.notEqual(a,generationSettings(c,{...profile,wishes:['W03']}).fingerprint);
 assert.notEqual(a,generationSettings({...c,ARK_IMAGE_MODEL:'another-model'},profile).fingerprint);
});
test('修改资料先通知队列隔离旧任务，未启用设备服务时不受影响',async t=>{
 const c=await context(t);let calls=0;
 await fenceProfileChange(c,owner,profile,async(url,options)=>{calls++;assert.ok(url.endsWith('/invalidate'));assert.equal(JSON.parse(options.body).ownerId,owner.id);return Response.json({ok:true});});
 await fenceProfileChange({...c,DEVICE_SERVICE_URL:''},owner,profile,()=>{throw new Error('must not connect');});assert.equal(calls,1);
});
test('历史排除未来缓存及未发布自动作品，保留当天手工作品',async t=>{
 const c=await context(t),input=validateInput(profile,'2026-10-24'),signature=profileSignature(input);
 const records=[{date:'2026-10-25',source:'manual'}, {date:'2026-10-23',source:'automatic',publicationState:'generated'}, {date:'2026-10-22',source:'automatic',publicationState:'published'}, {date:'2026-10-24',source:'manual'}];
 for(let i=0;i<records.length;i++)await saveArtwork(c,owner,{...records[i],id:String(i+1).repeat(36),userId:owner.id,status:'complete',profileSignature:signature,mapping:{deity:'陈九公',wish_id:'W02'}});
 assert.deepEqual((await accountHistory(c,owner,input)).map(x=>x.date).sort(),['2026-10-22','2026-10-24']);
});
test('Worker默认不执行付费调用，也不领取任务',async()=>{
 let called=false;await assert.rejects(()=>runDailyTick({}, {fetcher:()=>{called=true;}}),/未启用/);assert.equal(called,false);
});

test('自动任务接口继承登录与CSRF校验，浏览器不能直接领取后台任务',async t=>{
 const c=await context(t),{default:onRequest}=await import('../edgeone/handler.mjs');
 const bootstrap=await(await onRequest({request:new Request('https://playmath.cn/api/bootstrap'),env:c})).json();
 const headers={Origin:'https://playmath.cn','X-Session-Token':bootstrap.sessionToken};
 const anonymous=await onRequest({request:new Request('https://playmath.cn/api/account/automation',{headers}),env:c});assert.equal(anonymous.status,401);
 const noCSRF=await onRequest({request:new Request('https://playmath.cn/api/account/automation',{method:'POST',headers,body:'{}'}),env:c});assert.equal(noCSRF.status,403);
 const claim=await onRequest({request:new Request('https://playmath.cn/api/internal/automation/claim',{method:'POST',headers:{...headers,'X-CSRF-Token':bootstrap.csrf},body:'{}'}),env:c});assert.equal(claim.status,404);
});

test('资料保存先锁定队列，持久化后确认；确认响应丢失可安全重放',async t=>{
 const c=await context(t),{saveProfileSafely}=await import('../lib/automation.mjs'),{getProfile}=await import('../lib/accounts.mjs');let finishes=0;
 const fake=async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.ownerId,owner.id);
  if(url.endsWith('/begin')){assert.equal(await getProfile(c,owner),null);assert.equal(body.profileFingerprint,generationSettings(c,profile).profileFingerprint);return Response.json({token:'e'.repeat(32),revision:1});}
  assert.ok(url.endsWith('/finish'));assert.equal(body.token,'e'.repeat(32));assert.equal((await getProfile(c,owner)).profileRevision,1);if(++finishes===1)throw new Error('Lost completion response');return Response.json({ok:true});
 };
 assert.equal((await saveProfileSafely(c,owner,profile,fake)).birthDate,profile.birthDate);assert.equal(finishes,2);
});

test('账户存储写入失败时撤销保存占用，不确认未写入的资料版本',async t=>{
 const c=await context(t),{saveProfileSafely}=await import('../lib/automation.mjs'),{writeFile}=await import('node:fs/promises');
 const blocked=path.join(c.ACCOUNT_DATA_DIR,'blocked');await writeFile(blocked,'test-only');const routes=[];
 const fake=async(url)=>{routes.push(url.split('/').at(-1));return Response.json(url.endsWith('/begin')?{token:'f'.repeat(32),revision:1}:{ok:true});};
 await assert.rejects(()=>saveProfileSafely({...c,ACCOUNT_DATA_DIR:blocked},owner,profile,fake));
 assert.deepEqual(routes,['begin','abort']);
});
