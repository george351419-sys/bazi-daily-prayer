import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ritualWorkerAlerts,reconcileAlerts,createAlertSender,saveAlertState,loadAlertState} from '../lib/ritual-worker-alerts.mjs';
import {profileSignature} from '../lib/accounts.mjs';
import {validateInput,WISH_GROUPS} from '../lib/domain.mjs';
const now=Date.parse('2026-11-14T02:00:00+08:00'),sha='a'.repeat(64);
function state(){
 const profile={gender:'female',birthDate:'1990-01-01',birthTime:'12:00',calendar:'solar',wishes:[WISH_GROUPS[0].items[0].id],artStyle:'cute'};
 return {accountId:'a'.repeat(32),deviceId:'112233445566',profile,plan:{mode:'daily',contentMode:'prayer',revision:'r1'},records:[{date:'2026-11-15',status:'complete',image:true,profileSignature:profileSignature(validateInput(profile,'2026-11-14'))}],build:{status:'published',publication:{sha256:sha,publishedAt:'2026-11-14T01:05:00+08:00',manifest:{days:[{date:'2026-11-14'},{date:'2026-11-15'}]}}},deviceReport:{stored:true,targetSha:sha,lastSeen:'2026-11-14T01:10:00+08:00'}};
}
test('healthy current two-day package has no alert; missing tomorrow respects 01:00 and preparation grace',()=>{
 const s=state();assert.deepEqual(ritualWorkerAlerts(s,{now}),[]);
 s.records=[];
 assert.deepEqual(ritualWorkerAlerts(s,{now:Date.parse('2026-11-14T01:29:59+08:00')}),[]);
 assert.equal(ritualWorkerAlerts(s,{now})[0].kind,'tomorrow_not_ready');
 // Before 01:00, the required next day remains the 14th.
 s.records=[{...state().records[0],date:'2026-11-14'}];s.build.publication.manifest.days=[{date:'2026-11-13'},{date:'2026-11-14'}];
 assert.deepEqual(ritualWorkerAlerts(s,{now:Date.parse('2026-11-14T00:59:00+08:00')}),[]);
});
test('an obsolete published package is not proof of current publication and old receipts cannot acknowledge a new SHA',()=>{
 const s=state();s.build.publication.manifest.days=[{date:'2026-11-13'},{date:'2026-11-14'}];
 assert.equal(ritualWorkerAlerts(s,{now})[0].kind,'publication_failed');
 s.build.publication.manifest.days=state().build.publication.manifest.days;s.deviceReport.targetSha='b'.repeat(64);
 assert.equal(ritualWorkerAlerts(s,{now})[0].kind,'device_unconfirmed');
 s.deviceReport.targetSha=sha;s.deviceReport.lastSeen='2026-11-14T01:00:00+08:00';
 assert.equal(ritualWorkerAlerts(s,{now})[0].kind,'device_unconfirmed');
});
test('photo, test and unbound accounts do not generate daily delivery incidents',()=>{
 for(const modify of [s=>s.deviceId=null,s=>s.plan.mode='test',s=>s.plan.contentMode='photo']){
  const s=state();s.records=[];modify(s);assert.deepEqual(ritualWorkerAlerts(s,{now}),[]);
 }
});
test('durable notification deduplication survives restart, retries delivery failure, and sends recovery once',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-alerts-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'alerts.json');
 const issue={key:'a:missing',kind:'tomorrow_not_ready',message:'missing'},sent=[];
 let saved=await reconcileAlerts({},[issue],{now,send:async()=>{throw Error('offline');}});assert.equal(saved[issue.key].lastSent,null);
 saved=await reconcileAlerts(saved,[issue],{now:now+1,send:async i=>sent.push(i)});await saveAlertState(file,saved);
 saved=await reconcileAlerts(await loadAlertState(file),[issue],{now:now+2,send:async i=>sent.push(i)});assert.equal(sent.length,1);
 saved=await reconcileAlerts(saved,[],{now:now+3,send:async()=>{throw Error('offline');}});assert.ok(saved[issue.key]);
 saved=await reconcileAlerts(saved,[],{now:now+4,send:async i=>sent.push(i)});assert.deepEqual(saved,{});assert.equal(sent[1].recovered,true);
});
test('publication retry timestamps cannot postpone a persistent failure forever',async()=>{
 const s=state();s.build.status='retrying';s.build.failure={stage:'uploading'};s.build.stageUpdatedAt=new Date(now).toISOString();
 const issues=ritualWorkerAlerts(s,{now}),sent=[];
 let saved=await reconcileAlerts({},issues,{now,send:async i=>sent.push(i)});assert.equal(sent.length,0);
 saved=await reconcileAlerts(saved,ritualWorkerAlerts(s,{now:now+21*60000}),{now:now+21*60000,send:async i=>sent.push(i)});assert.equal(sent.length,1);
 assert.ok(saved[issues[0].key].lastSent);
});
test('HTTP 200 bot rejection remains a delivery failure and webhook secrets are not exposed',async()=>{
 const c={RITUAL_ALERT_PROVIDER:'wecom',RITUAL_ALERT_WEBHOOK:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=PRIVATE'};
 const send=createAlertSender(c,{fetcher:async()=>({ok:true,json:async()=>({errcode:93000})})});
 await assert.rejects(send({kind:'test',message:'check'}),error=>error.message==='Alert delivery failed'&&!error.message.includes('PRIVATE'));
 let body;
 await createAlertSender({...c,RITUAL_ALERT_PROVIDER:'feishu',RITUAL_ALERT_WEBHOOK:'https://open.feishu.cn/open-apis/bot/v2/hook/PRIVATE'},{fetcher:async(u,o)=>{body=JSON.parse(o.body);return {ok:true,json:async()=>({code:0})};}})({kind:'test',message:'check'});
 assert.equal(body.msg_type,'text');
});
