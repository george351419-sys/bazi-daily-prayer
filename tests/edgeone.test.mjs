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

test('EdgeOne 内部转发域名与公网域名不同时，允许真实站点来源及预检',async()=>{
 for(const origin of ['https://playmath.cn','https://www.playmath.cn','https://george351419-sys.github.io']){
  const request=new Request('https://internal-runtime.example/api/bootstrap',{headers:{Origin:origin}});
  const response=await onRequest({request,env:{...env,ALLOWED_ORIGINS:'https://george351419-sys.github.io'}});
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),origin);
  const preflight=await onRequest({request:new Request('https://internal-runtime.example/api/analyze',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}}),env});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 }
});
test('公网来源 POST 通过来源和会话校验，仍正常校验业务输入',async()=>{
 const origin='https://playmath.cn';
 const bootstrap=await onRequest({request:new Request('https://internal-runtime.example/api/bootstrap',{headers:{Origin:origin}}),env});
 const session=await bootstrap.json();
 const response=await onRequest({request:new Request('https://internal-runtime.example/api/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Session-Token':session.sessionToken,'X-CSRF-Token':session.csrf},body:'{}'}),env});
 assert.equal(response.status,400);assert.equal(response.headers.get('access-control-allow-origin'),origin);
 assert.notEqual((await response.json()).error,'此页面尚未获准连接后端。');
});
test('相似但不属于本站的来源仍拒绝，拒绝响应不缓存',async()=>{
 const response=await invoke('/api/bootstrap',{headers:{Origin:'https://playmath.cn.attacker.example'}});
 assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
});
