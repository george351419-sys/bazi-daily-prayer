import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import handler from '../edgeone/handler.mjs';import {allowedMiniProgram} from '../lib/miniprogram-access.mjs';
const appid='wx0123456789abcdef',config={MINIPROGRAM_APP_IDS:appid};
test('mini program identity is denied by default, exact configured HTTPS referer only',()=>{
 const allowed='https://servicewechat.com/'+appid+'/0/page-frame.html';assert.equal(allowedMiniProgram({headers:{referer:allowed}},config),true);assert.equal(allowedMiniProgram({headers:{referer:allowed}},{}),false);
 for(const referer of ['https://servicewechat.com.evil.example/'+appid+'/0/page-frame.html','http://servicewechat.com/'+appid+'/0/page-frame.html',allowed+'?appid='+appid,'https://servicewechat.com/wxffffffffffffffff/0/page-frame.html','https://evil@servicewechat.com/'+appid+'/0/page-frame.html','https://servicewechat.com/'+appid+'/../0/page-frame.html'])assert.equal(allowedMiniProgram({headers:{referer}},config),false);
});
test('mini native writes still require valid session, csrf, account; browser login preserved',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-mini-'));t.after(()=>rm(dir,{recursive:true,force:true}));const env={...config,ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'miniprogram-test-secret-123456789'};
 const headers={referer:'https://servicewechat.com/'+appid+'/devtools/page-frame.html','Content-Type':'application/json'};const request=async(route,body,extra={})=>handler({env,request:new Request('https://playmath.cn/api/'+route,{method:body?'POST':'GET',headers:{...headers,...extra},body:body?JSON.stringify(body):undefined})});
 const b=await(await request('bootstrap')).json();assert.equal(b.miniProgram.enabled,true);const secure={'X-Session-Token':b.sessionToken,'X-CSRF-Token':b.csrf};
 assert.equal((await request('account/login',{username:'mini_test',password:'Mini-test-password!'})).status,403);
 assert.equal((await request('account/register',{username:'mini_test',password:'Mini-test-password!'},{...secure,'X-CSRF-Token':'bad'})).status,403);
 const reg=await request('account/register',{username:'mini_test',password:'Mini-test-password!'},secure);assert.equal(reg.status,200);const cookie=reg.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('account/ritual',null,secure)).status,401);
 assert.equal((await request('account/ritual',null,{...secure,Cookie:cookie})).status,200);
 assert.equal((await request('account/login',{username:'mini_test',password:'Mini-test-password!'},{...secure,referer:'https://servicewechat.com/wxffffffffffffffff/0/page-frame.html'})).status,403);
 assert.equal((await request('account/login',{username:'mini_test',password:'Mini-test-password!'},{...secure,referer:'',Origin:'https://playmath.cn'})).status,200);
 assert.equal((await request('account/login',{username:'mini_test',password:'Mini-test-password!'},{...secure,Origin:'https://evil.example'})).status,403);
});
