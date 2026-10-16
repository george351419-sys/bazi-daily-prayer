import test from 'node:test';
import assert from 'node:assert/strict';
import onRequest from '../edgeone/handler.mjs';
const origin='https://example.edgeone.cool';
const env={SESSION_SECRET:'test-session-secret-edgeone',DEEPSEEK_API_KEY:'test-private-key',ARK_API_KEY:'test-private-image-key'};
const invoke=(path,options={},settings=env)=>onRequest({request:new Request(origin+path,options),env:settings});
test('EdgeOne 从 context.env 读取配置，响应不泄露密钥',async()=>{
 const response=await invoke('/api/bootstrap');const text=await response.text(),data=JSON.parse(text);
 assert.equal(response.status,200);assert.deepEqual(data.ready,{text:true,image:true});assert.ok(data.sessionToken);assert.ok(!text.includes(env.DEEPSEEK_API_KEY));assert.equal(response.headers.get('cache-control'),'no-store');
});
test('EdgeOne 拒绝无会话或跨来源的写入',async()=>{
 const response=await invoke('/api/analyze',{method:'POST',body:'{}'});assert.equal(response.status,403);
 const foreign=await invoke('/api/bootstrap',{headers:{Origin:'https://untrusted.example'}});assert.equal(foreign.status,403);
});
test('EdgeOne 会话在独立调用间有效，错误请求不调用模型',async()=>{
 const data=await(await invoke('/api/bootstrap')).json();
 const headers={'X-Session-Token':data.sessionToken,'X-CSRF-Token':data.csrf};
 const invalid=await invoke('/api/analyze',{method:'POST',headers,body:'{broken'});assert.equal(invalid.status,400);
 const large=await invoke('/api/analyze',{method:'POST',headers,body:JSON.stringify({text:'x'.repeat(140000)})});assert.equal(large.status,413);
 const missing=await invoke('/api/unknown',{method:'POST',headers,body:'{}'});assert.equal(missing.status,404);
});
