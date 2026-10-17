import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import onRequest from '../edgeone/handler.mjs';
import {register,login,accountCookie,currentAccount,accountHistory,saveArtwork,profileSignature,newArtworkId,saveProfile} from '../lib/accounts.mjs';
import {validateInput,calendarFor} from '../lib/domain.mjs';
import {makeMapping} from './fixtures/selection-mapping.mjs';
const secret='private-account-test-secret-0123456789',password='Test-only-strong-password!';
const profile={gender:'female',birthDate:'1992-10-17',birthTime:'22:30',city:'上海',calendar:'solar',wishes:['W02','W06']};
async function context(t){const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-account-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:secret,DEEPSEEK_API_KEY:'test-only',ARK_API_KEY:'test-only'};}
test('并发注册同名账号只有一份成功，密码加盐且账户资料密文持久化',async t=>{
 const c=await context(t),body={username:'atomic_user',nickname:'私密昵称',password};
 const results=await Promise.allSettled([register(c,body,'test-client-1'),register(c,body,'test-client-2')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
 const data=results.find(x=>x.status==='fulfilled').value;assert.ok(data.recoveryCode);assert.ok(!JSON.stringify(data.user).includes('Hash'));
 const bytes=await readFile(path.join(c.ACCOUNT_DATA_DIR,'credentials',createHash('sha256').update(body.username).digest('hex')));assert.ok(!bytes.includes(Buffer.from(password)));assert.ok(!bytes.includes(Buffer.from('私密昵称')));
 const again=await login({...c},body,'new-device');assert.equal(again.user.id,data.user.id);assert.equal(again.recoveryCode,undefined);
 assert.match(accountCookie({...c,ACCOUNT_STORAGE:'blob'},data.token),/HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000; Secure/);
});
test('账户接口完成注册、归档、跨设备重登、私有图片读取与账户隔离',async t=>{
 const c=await context(t),origin='https://playmath.cn';let calls=0,providerCalls=0,imageAvailable=true,receivedHistory;
 const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('deepseek.com')){providerCalls++;const body=JSON.parse(JSON.parse(init.body).messages[1].content);receivedHistory=body.history;const m=makeMapping(body.input,body.calendar);m.rationale.deity.history_refs=body.history.map(x=>x.id);m.rationale.deity.diversity_reason=body.history.length?'近期已经使用陈九公，今日仍与主喜用火相合，故延续这一主尊并改变配色层次。':'';return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(m)}}]});}
  if(String(url).includes('volces.com')){providerCalls++;return Response.json({data:[{url:'https://images.example.org/temp-one.jpg'}]});}
  if(String(url)==='https://images.example.org/temp-one.jpg'){if(!imageAvailable)throw new Error('Temporary image expired');return new Response(new Uint8Array([255,216,255,224,1,2,3]),{headers:{'Content-Type':'image/jpeg'}});}
  throw new Error('Unexpected network call');
 };
 async function device(){const bootstrap=await onRequest({request:new Request(origin+'/api/bootstrap'),env:c});const b=await bootstrap.json();return {session:b.sessionToken,csrf:b.csrf,cookie:''};}
 async function request(d,route,body){calls++;const headers={Origin:origin,'X-Session-Token':d.session,'X-CSRF-Token':d.csrf,...(d.cookie?{Cookie:d.cookie}:{})};const response=await onRequest({request:new Request(origin+'/api/'+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env:c});const cookie=response.headers.get('set-cookie');if(cookie)d.cookie=cookie.split(';')[0];return response;}
 const a=await device(),anon=await request(a,'analyze',profile);assert.equal(anon.status,401);assert.equal(providerCalls,0);
 const registered=await request(a,'account/register',{username:'account_a',nickname:'小愿',password});assert.equal(registered.status,200);const registration=await registered.json();const uid=registration.user.id;
 const mappedResponse=await request(a,'analyze',profile);assert.equal(mappedResponse.status,200);const job=await mappedResponse.json();assert.equal(job.status,'mapped');assert.ok(job.archived);assert.deepEqual(receivedHistory,[]);
 const complete=await(await request(a,'jobs/'+job.id+'/image',{jobToken:job.token})).json();assert.equal(complete.status,'complete');assert.match(complete.image,/^\/api\/account\/artworks\//);assert.ok(!JSON.stringify(complete).includes('temp-one'));
 imageAvailable=false;
 const image=await request(a,'account/artworks/'+job.id+'/image');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');assert.deepEqual([...new Uint8Array(await image.arrayBuffer())],[255,216,255,224,1,2,3]);assert.match(image.headers.get('cache-control'),/private/);
 const list=await(await request(a,'account/artworks')).json();assert.equal(list.items[0].id,job.id);assert.equal(list.items[0].wishLabel,'财源广进');
 const b=await device();await request(b,'account/register',{username:'account_b',password});assert.equal((await request(b,'account/artworks/'+job.id)).status,404);assert.equal((await request(b,'account/artworks/'+job.id+'/image')).status,404);const before=providerCalls;assert.equal((await request(b,'jobs/'+job.id+'/image',{jobToken:job.token})).status,400);assert.equal(providerCalls,before);
 await request(a,'account/profile',{...profile,gender:'male',birthDate:'1990-1-1'});const snapshot=await(await request(a,'account/artworks/'+job.id)).json();assert.equal(snapshot.input.gender,'female');assert.equal(snapshot.input.birthDate,'1992-10-17');
 const third=await device();await request(third,'account/login',{username:'account_a',password});const me=await(await request(third,'account/me')).json();assert.equal(me.user.id,uid);assert.equal(me.profile.gender,'male');assert.ok(!JSON.stringify(me).includes('Hash'));
 const fresh=await(await request(third,'account/artworks/'+job.id)).json();assert.equal(fresh.mapping.title,job.mapping.title);assert.equal((await request(third,'jobs/'+job.id+'/image',{jobToken:fresh.token})).status,200);assert.equal(providerCalls,before);
 const historyInput=validateInput(profile),history=await accountHistory(c,{id:uid},historyInput);assert.equal(history.length,1);assert.equal(history[0].deity,'陈九公');assert.deepEqual(await accountHistory(c,{id:uid},validateInput({...profile,gender:'male'})),[]);
 const remapped=await request(third,'analyze',{...profile,history:[{date:'2026-10-01',deity:'伪造历史',wish:'W02'}]});assert.equal(remapped.status,200);assert.equal(receivedHistory.length,1);assert.equal(receivedHistory[0].deity,'陈九公');
 const recoverResponse=await request(a,'account/recover',{username:'account_a',password:'Updated-only-test-password!',recoveryCode:registration.recoveryCode});assert.equal(recoverResponse.status,200);const recovered=await recoverResponse.json();assert.notEqual(recovered.recoveryCode,registration.recoveryCode);assert.equal((await(await request(third,'account/me')).json()).user,null);
 assert.equal((await request(a,'account/recover',{username:'account_a',password,password:'New-test-strong-password!',recoveryCode:registration.recoveryCode})).status,401);
 await request(a,'account/logout',{});assert.equal((await(await request(a,'account/me')).json()).user,null);
 assert.ok(calls>15);
});
test('未登录和跨来源无法读取账户归档，错误密码不创建会话',async t=>{
 const c=await context(t),origin='https://playmath.cn';const b=await(await onRequest({request:new Request(origin+'/api/bootstrap'),env:c})).json();const headers={Origin:origin,'X-Session-Token':b.sessionToken,'X-CSRF-Token':b.csrf};
 const anonymous=await onRequest({request:new Request(origin+'/api/account/artworks',{headers}),env:c});assert.equal(anonymous.status,401);
 const foreign=await onRequest({request:new Request(origin+'/api/account/login',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:'{}'}),env:c});assert.equal(foreign.status,403);
 const wrong=await onRequest({request:new Request(origin+'/api/account/login',{method:'POST',headers,body:JSON.stringify({username:'unknown_account',password})}),env:c});assert.equal(wrong.status,401);assert.equal(wrong.headers.get('set-cookie'),null);
 assert.equal(await currentAccount(c,{headers:{cookie:'prayer_auth=forged'}}),null);
});
