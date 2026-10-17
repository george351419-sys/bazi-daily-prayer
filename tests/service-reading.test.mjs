import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMapping} from '../lib/service.mjs';
import {validateInput,calendarFor} from '../lib/domain.mjs';
import {makeMapping} from './fixtures/selection-mapping.mjs';
const input=validateInput({gender:'female',birthDate:'1992-10-17',birthTime:'22:30',city:'上海',calendar:'solar',wishes:['W02']},'2026-10-17'),calendar=calendarFor(input);
test('模型首次输出非法JSON时，在总预算内重试完整结构并返回用户解读',async()=>{
 let calls=0;const mapping=makeMapping(input,calendar);
 const result=await analyzeMapping({DEEPSEEK_API_KEY:'test-only'},input,calendar,[],async(url,init)=>{
  calls++;const body=JSON.parse(init.body);if(calls===2){const request=JSON.parse(body.messages[1].content);assert.ok(!('previous_output' in request));assert.ok(request.selection_evidence.clash_response_options.length);}
  return Response.json({choices:[{finish_reason:'stop',message:{content:calls===1?'not JSON':JSON.stringify(mapping)}}]});
 });
 assert.equal(calls,2);assert.equal(result.reading.sections.length,5);assert.ok(!result.professional.includes('JSON'));assert.equal(result.birth_summary.time_basis,'真太阳时');
});
