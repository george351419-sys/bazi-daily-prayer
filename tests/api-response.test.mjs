import test from 'node:test';
import assert from 'node:assert/strict';
import {readAPIResponse} from '../public/api-response.js';
test('HTML gateway timeout names the failed stage instead of claiming wrong backend address',async()=>{
 await assert.rejects(readAPIResponse(new Response('<html>Gateway Timeout</html>',{status:504}),'/api/analyze'),e=>e.status===504&&e.code==='gateway_timeout'&&e.message.includes('生辰解读请求超时'));
});
test('JSON errors preserve conflict codes and successful objects pass through',async()=>{
 await assert.rejects(readAPIResponse(Response.json({error:'资料已更新',code:'profile_conflict'},{status:409}),'/api/account/profile'),e=>e.status===409&&e.code==='profile_conflict');
 assert.deepEqual(await readAPIResponse(Response.json({status:'mapped'}),'/api/analyze'),{status:'mapped'});
 await assert.rejects(readAPIResponse(Response.json(null),'/api/analyze'),/格式异常/);
});
