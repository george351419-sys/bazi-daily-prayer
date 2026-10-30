import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import onRequest from '../edgeone/handler.mjs';
test('both supported EdgeOne config formats reserve 120 seconds and model work leaves a response margin',async()=>{
 const config=JSON.parse(await readFile(new URL('../edgeone.json',import.meta.url),'utf8'));
 assert.equal(config.nodeFunctionsConfig.maxDuration,120);
 assert.equal(config.cloudFunctions.nodejs.maxDuration,120);
 const handler=await readFile(new URL('../edgeone/handler.mjs',import.meta.url),'utf8');
 const budget=Number(handler.match(/ANALYSIS_BUDGET_MS:'(\d+)'/)[1]);
 assert.ok(budget<=config.nodeFunctionsConfig.maxDuration*1000-20000);
});
test('API responses include an opaque request ID without echoing request credentials',async()=>{
 const response=await onRequest({request:new Request('https://playmath.cn/api/bootstrap'),env:{SESSION_SECRET:'test-secret-that-is-long-enough'}});
 assert.equal(response.status,200);assert.match(response.headers.get('x-prayer-request-id'),/^[a-f0-9-]{36}$/);
 assert.ok(!response.headers.get('x-prayer-request-id').includes('secret'));
});
