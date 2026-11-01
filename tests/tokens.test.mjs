import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSession,verifySession,sealJob,openJob,csrfFor} from '../lib/tokens.mjs';
const config={SESSION_SECRET:'test-only-secret'};
test('无状态会话签名防篡改',()=>{const s=createSession(config);assert.equal(verifySession(config,s),s);assert.equal(verifySession(config,s.slice(0,-5)+'other'),null);assert.ok(csrfFor(config,s));});
test('生成记录加密、跨会话不可重放',()=>{const owner=createSession(config),data={owner,expires:Date.now()+10000,mapping:{deity:'萧升'}};const token=sealJob(config,data);assert.ok(!token.includes('萧升'));assert.deepEqual(openJob(config,token,owner),data);assert.throws(()=>openJob(config,token,createSession(config)));assert.throws(()=>openJob(config,token.slice(0,-4)+'xxxx',owner));});
test('过期记录失效',()=>{const owner=createSession(config);assert.throws(()=>openJob(config,sealJob(config,{owner,expires:Date.now()-1}),owner));});

test('账户生图凭证不随方案诊断增大，且保持账户隔离',()=>{
 const owner='account:'+ 'a'.repeat(32),id='b'.repeat(36);
 const mapping={deity:'文昌',engine:{diagnostics:'诊断'.repeat(300000)},branch_analysis:{alternatives:'分配'.repeat(300000)}};
 const token=sealJob(config,{id,owner,accountId:'a'.repeat(32),mapping,expires:Date.now()+10000});
 assert.ok(Buffer.byteLength(JSON.stringify({jobToken:token}))<1024);
 const opened=openJob(config,token,owner);assert.equal(opened.id,id);assert.equal(opened.mapping,undefined);
 assert.throws(()=>openJob(config,token,'account:'+ 'c'.repeat(32)));
});
test('游客生图凭证剔除内部审计，保留绘图和解读',()=>{
 const owner=createSession(config),mapping={deity:'文昌',image_prompt:'文昌主尊',colors:[{name:'红',hex:'#FF0000'}],engine:{diagnostics:'记录'.repeat(300000)},branch_analysis:{alternatives:'记录'.repeat(300000)}};
 const token=sealJob(config,{id:'b'.repeat(36),owner,mapping,expires:Date.now()+10000});
 assert.ok(Buffer.byteLength(JSON.stringify({jobToken:token}))<128*1024);
 const job=openJob(config,token,owner);assert.equal(job.mapping.image_prompt,mapping.image_prompt);assert.deepEqual(job.mapping.colors,mapping.colors);assert.equal(job.mapping.engine,undefined);assert.equal(job.mapping.branch_analysis,undefined);
});
