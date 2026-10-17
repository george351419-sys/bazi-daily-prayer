import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,scryptSync} from 'node:crypto';
import {requestEmailCode,register,login,recover,bindEmail,currentAccount,normalizeEmail,accountCookie} from '../lib/accounts.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {sendAccountMail,mailReady} from '../lib/account-mail.mjs';
const password='Mail-account-test-password!',hash=s=>createHash('sha256').update(s).digest('hex');
async function setup(t){const dir=await mkdtemp(path.join(tmpdir(),'prayer-mail-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const mailbox=[];return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'secret-email-test-0123456789012345',MAIL_TRANSPORT:async m=>{mailbox.push(m);},mailbox};}
const challengeBody=(c,result,email)=>({email,code:c.mailbox.at(-1).code,challengeId:result.challengeId,password});
async function clearCooldown(c,email){const repo=accountRepository(c),minute=Math.floor(Date.now()/60000);for(const m of [minute,minute-1])await repo.delete('mail-cooldown/'+hash(email)+'/'+m);}
test('验证邮件通过腾讯云 SES 模板接口发送，不包含密码或生辰，也不泄露上游错误',async()=>{
 const c={TENCENT_SES_SECRET_ID:'test-secret-id',TENCENT_SES_SECRET_KEY:'private-not-in-body',TENCENT_SES_TEMPLATE_ID:'1234',TENCENT_SES_REGION:'ap-hongkong',MAIL_FROM:'生辰造像馆 <noreply@mail.playmath.cn>'};assert.ok(mailReady(c));
 await sendAccountMail(c,{email:'tester@example.com',purpose:'reset',code:'123456'},async(url,init)=>{assert.equal(url,'https://ses.tencentcloudapi.com');assert.equal(init.headers['X-TC-Action'],'SendEmail');assert.equal(init.headers['X-TC-Region'],'ap-hongkong');assert.match(init.headers.Authorization,/TC3-HMAC-SHA256 Credential=test-secret-id/);assert.ok(!init.body.includes(c.TENCENT_SES_SECRET_KEY));const body=JSON.parse(init.body);assert.deepEqual(body.Destination,['tester@example.com']);assert.deepEqual(JSON.parse(body.Template.TemplateData),{code:'123456'});return Response.json({Response:{MessageId:'test-message'}});});
 await assert.rejects(sendAccountMail(c,{email:'tester@example.com',purpose:'register',code:'123456'},async()=>Response.json({Response:{Error:{Code:'AuthFailure',Message:c.TENCENT_SES_SECRET_KEY}}})),e=>e.status===503&&!e.message.includes(c.TENCENT_SES_SECRET_KEY));
 assert.equal(mailReady({}),false);
});
test('验证码用途、邮箱、有效期、单次使用和失败次数均受约束',async t=>{
 const c=await setup(t),repo=accountRepository(c),email='secure@example.com',sent=await requestEmailCode(c,{email,purpose:'register'},'test');const body=challengeBody(c,sent,email);
 assert.ok(!JSON.stringify(sent).includes(body.code));assert.equal(sent.expiresIn,600);assert.equal(normalizeEmail(' Secure@EXAMPLE.COM '),email);assert.throws(()=>normalizeEmail('bad\r\n@example.com'));
 await assert.rejects(requestEmailCode(c,{email,purpose:'register'},'test'),e=>e.status===429);
 await assert.rejects(register(c,{...body,email:'other@example.com'},'test'),/验证码/);
 await assert.rejects(recover(c,body,'test'),/验证码/);
 const challenge=await repo.get('email-challenges/'+sent.challengeId);challenge.expires=Date.now()-1;await repo.put('email-challenges/'+sent.challengeId,challenge);await assert.rejects(register(c,body,'test'),/验证码/);
 challenge.expires=Date.now()+600000;await repo.put('email-challenges/'+sent.challengeId,challenge);
 const results=await Promise.allSettled([register(c,body,'test-one'),register(c,body,'test-two')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/验证码已使用/);
 await assert.rejects(register(c,body,'test-three'),e=>e.status===429);
});
test('未知邮箱找回返回统一文案，不向浏览器或无关邮箱暴露验证码',async t=>{
 const c=await setup(t),result=await requestEmailCode(c,{email:'unknown@example.com',purpose:'reset'},'test');assert.ok(result.challengeId);assert.equal(c.mailbox.length,0);assert.match(result.message,/如果此邮箱已注册/);await assert.rejects(recover(c,{email:'unknown@example.com',code:'000000',challengeId:result.challengeId,password},'test'),/验证码/);
});
test('旧账户需当前密码与邮箱验证码才能绑定，保留原账户ID并停用恢复码路径',async t=>{
 const c=await setup(t),repo=accountRepository(c),salt=Buffer.alloc(16,8),key=scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 const old={id:'a'.repeat(32),username:'legacy_user',nickname:'原有用户',passwordHash:salt.toString('hex')+':'+key.toString('hex'),recoveryHash:'old-code-hash',version:1,createdAt:new Date().toISOString()};
 await repo.put('credentials/'+hash(old.username),old);await repo.put('profiles/'+old.id,{birthDate:'1992-10-17',gender:'female'});
 const signed=await login(c,{username:old.username,password},'test');const oldCookie=accountCookie(c,signed.token).split(';')[0],account=await currentAccount(c,{headers:{cookie:oldCookie}});
 await assert.rejects(requestEmailCode(c,{email:'bound@example.com',purpose:'bind',password:'incorrect'},'test',account),e=>e.status===401);
 const sent=await requestEmailCode(c,{email:'bound@example.com',purpose:'bind',password},'test',account),body=challengeBody(c,sent,'bound@example.com');
 // A previous partial write may have reserved this email for the same account.
 await repo.put('emails/'+hash('bound@example.com'),{username:old.username,userId:old.id},{onlyIfNew:true});
 const result=await bindEmail(c,account,body);assert.equal(result.user.id,old.id);assert.equal(result.profile.birthDate,'1992-10-17');assert.equal(result.user.email,'bound@example.com');assert.equal(await currentAccount(c,{headers:{cookie:oldCookie}}),null);
 assert.equal((await login(c,{email:'BOUND@example.com',password},'test')).user.id,old.id);
 assert.equal((await repo.get('credentials/'+hash(old.username))).recoveryHash,undefined);
 await assert.rejects(recover(c,{username:old.username,password,recoveryCode:'old-code'},'test'),/邮箱/);
 await clearCooldown(c,'bound@example.com');const reset=await requestEmailCode(c,{email:'bound@example.com',purpose:'reset'},'test');const restored=await recover(c,{...challengeBody(c,reset,'bound@example.com'),password:'Replacement-mail-password!'},'test');assert.equal(restored.user.id,old.id);assert.equal(restored.profile.birthDate,'1992-10-17');
});
