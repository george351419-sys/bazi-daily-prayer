import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import onRequest from '../edgeone/handler.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {bindWechatIdentity,wechatLogin,wechatLoginReady} from '../lib/wechat-auth.mjs';

const appId='wx0123456789abcdef',secret='wechat-test-secret-0123456789abcdef';
async function context(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-wechat-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'wechat-account-test-secret-123456789',MINIPROGRAM_APP_IDS:appId,WECHAT_MINIPROGRAM_SECRETS:JSON.stringify({[appId]:secret})};
}
const exchange=(openid='openid-one')=>async url=>{
 assert.equal(url.origin,'https://api.weixin.qq.com');assert.equal(url.pathname,'/sns/jscode2session');
 assert.equal(url.searchParams.get('appid'),appId);assert.equal(url.searchParams.get('secret'),secret);
 assert.equal(url.searchParams.get('grant_type'),'authorization_code');
 return Response.json({openid,unionid:'union-'+openid,session_key:'must-not-be-stored'});
};

test('WeChat login creates an email-free account and reuses the same identity',async t=>{
 const c=await context(t),fetcher=exchange();
 assert.equal(wechatLoginReady(c),true);
 const first=await wechatLogin(c,{appId,code:'code-one'},fetcher);
 const second=await wechatLogin(c,{appId,code:'code-two'},fetcher);
 assert.equal(first.user.id,second.user.id);
 assert.equal(first.user.authProvider,'wechat');
 assert.equal(first.user.email,null);
 assert.equal(first.user.wechatBound,true);
 assert.ok(!JSON.stringify(first.user).includes('openid-one'));
 assert.notEqual(first.token,second.token);
});

test('different WeChat identities create isolated accounts and invalid codes never create users',async t=>{
 const c=await context(t);
 const one=await wechatLogin(c,{appId,code:'code-one'},exchange('openid-one'));
 const two=await wechatLogin(c,{appId,code:'code-two'},exchange('openid-two'));
 assert.notEqual(one.user.id,two.user.id);
 const failed=async()=>Response.json({errcode:40029,errmsg:'invalid code'});
 await assert.rejects(()=>wechatLogin(c,{appId,code:'expired'},failed),error=>error.status===401&&/重新点击/.test(error.message));
});

test('a legacy account can explicitly bind WeChat and then use one-click login',async t=>{
 const c=await context(t),repo=accountRepository(c),username='legacy_user';
 const credentials={id:'a'.repeat(32),username,nickname:'旧账户',passwordHash:'unused-for-wechat-bind',version:1,createdAt:new Date().toISOString()};
 await repo.put('credentials/'+createHash('sha256').update(username).digest('hex'),credentials);
 const bound=await bindWechatIdentity(c,{id:credentials.id,credentials},{appId,code:'bind-code'},exchange('bound-openid'));
 assert.equal(bound.user.id,credentials.id);
 assert.equal(bound.user.wechatBound,true);
 const logged=await wechatLogin(c,{appId,code:'login-code'},exchange('bound-openid'));
 assert.equal(logged.user.id,credentials.id);
 assert.equal(logged.user.authProvider,'password');
});

test('mini-program route exchanges code, sets account cookie, and never exposes AppSecret',async t=>{
 const c=await context(t),referer='https://servicewechat.com/'+appId+'/devtools/page-frame.html';
 const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
 const request=async(route,body,extra={})=>onRequest({env:c,request:new Request('https://playmath.cn/api/'+route,{method:body?'POST':'GET',headers:{referer,'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined})});
 const bootstrap=await(await request('bootstrap')).json();
 assert.equal(bootstrap.miniProgram.wechatLoginEnabled,true);
 assert.ok(!JSON.stringify(bootstrap).includes(secret));
 const secure={'X-Session-Token':bootstrap.sessionToken,'X-CSRF-Token':bootstrap.csrf};
 globalThis.fetch=exchange('route-openid');
 const login=await request('account/wechat-login',{code:'route-code'},secure);
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const body=await login.json();
 assert.equal(body.user.authProvider,'wechat');
 assert.match(body.accountToken,/^[a-f0-9]{64}$/);
 assert.match(cookie,/^prayer_auth=/);
 const apiHeaders={...secure,'X-Account-Token':body.accountToken};
 const me=await(await request('account/me',null,apiHeaders)).json();
 assert.equal(me.user.id,body.user.id);
 const nickname=await(await request('account/nickname',{nickname:'小程序昵称'},apiHeaders)).json();
 assert.equal(nickname.user.nickname,'小程序昵称');
 assert.equal((await request('account/wechat-login',{code:'foreign'},{...secure,referer:'https://servicewechat.com/wxffffffffffffffff/0/page-frame.html'})).status,403);
 assert.ok(!JSON.stringify({bootstrap,body,me,nickname}).includes(secret));
});
