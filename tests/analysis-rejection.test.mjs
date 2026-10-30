import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../api/gateway.js';
import {createSession,csrfFor} from '../lib/tokens.mjs';
test('exhausted analysis validation returns an actionable stage error and never calls the image provider',async t=>{
 const config={SESSION_SECRET:'test-only-analysis-rejection-secret',DEEPSEEK_API_KEY:'test-only',ANALYSIS_BUDGET_MS:3000};
 const session=createSession(config);let calls=0,status,data;
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async url=>{assert.match(String(url),/api\.deepseek\.com/);calls++;return Response.json({choices:[{message:{content:JSON.stringify({wish_id:'W99'})}}]});};
 const req={method:'POST',url:'https://playmath.cn/api/analyze',headers:{host:'playmath.cn',origin:'https://playmath.cn','x-session-token':session,'x-csrf-token':csrfFor(config,session)},query:{route:'analyze'},body:{gender:'female',birthDate:'1992-10-17',birthTime:'22:30',calendar:'solar',wishes:['W02']}};
 await handleRequest(req,{setHeader(){},status(value){status=value;return this;},json(value){data=value;}},config);
 assert.equal(calls,3);assert.equal(status,503);assert.equal(data.code,'analysis_validation_failed');
 assert.match(data.error,/未启动绘图/);assert.doesNotMatch(data.error,/取用依据校验|W99/);
});
