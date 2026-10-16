import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSession,verifySession,sealJob,openJob,csrfFor} from '../lib/tokens.mjs';
const config={SESSION_SECRET:'test-only-secret'};
test('无状态会话签名防篡改',()=>{const s=createSession(config);assert.equal(verifySession(config,s),s);assert.equal(verifySession(config,s.slice(0,-5)+'other'),null);assert.ok(csrfFor(config,s));});
test('生成记录加密、跨会话不可重放',()=>{const owner=createSession(config),data={owner,expires:Date.now()+10000,mapping:{deity:'萧升'}};const token=sealJob(config,data);assert.ok(!token.includes('萧升'));assert.deepEqual(openJob(config,token,owner),data);assert.throws(()=>openJob(config,token,createSession(config)));assert.throws(()=>openJob(config,token.slice(0,-4)+'xxxx',owner));});
test('过期记录失效',()=>{const owner=createSession(config);assert.throws(()=>openJob(config,sealJob(config,{owner,expires:Date.now()-1}),owner));});
