import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,calendarFor,validateMapping,STEM_PARTNER} from '../lib/domain.mjs';
import {makeMapping,addClashStem} from './fixtures/selection-mapping.mjs';
import {analyzeMapping} from '../lib/service.mjs';
import {stemResponsePlan,repairHints,mergeSelectionRepair} from '../lib/selection-rationale.mjs';
const input=validateInput({gender:'female',birthDate:'1992-10-17',birthTime:'22:30',calendar:'solar',city:'上海',wishes:['W02']},'2026-10-17'),calendar=calendarFor(input);
function conflict(){
 const m=addClashStem(makeMapping(input,calendar),calendar);m.rationale.foundation.tiaohou_required_stems=['丙'];return m;
}
test('protected incoming stems are excluded before selection; unrelated incoming stems remain candidates',()=>{
 const m=conflict(),plan=stemResponsePlan(m,calendar,STEM_PARTNER);
 const target=plan.targets.find(x=>x.natal_id==='natal.year'&&x.incoming_id==='transit.year');
 assert.equal(target.incoming_stem,'丙');assert.equal(target.status,'skip_for_required_tiaohou');assert.equal(target.response_stem,null);
 assert.ok(plan.targets.some(x=>x.status==='candidate'&&x.response_stem));
 assert.ok(repairHints(m,calendar,STEM_PARTNER).some(x=>x.includes('不能取辛合走丙')&&x.includes('image_prompt')));
 assert.throws(()=>validateMapping(m,input,calendar),e=>e.code==='protected_tiaohou_conflict');
});
test('independent zodiac and stem conflicts are reported together',()=>{
 const m=conflict();m.zodiac=['兔'];m.rationale.zodiac.items=[{animal:'兔',branch:'卯',method:'六合取象',target_ids:['natal.year'],reason:'测试不成立的配对关系',effect:'测试文化意象说明'}];
 assert.throws(()=>validateMapping(m,input,calendar),e=>e.issues.some(x=>x.section==='zodiac')&&e.issues.some(x=>x.code==='protected_tiaohou_conflict'));
});
test('targeted stem repair retains foundation, deity, colors and zodiac while updating affected visual copy',()=>{
 const base=conflict(),candidate=makeMapping(input,calendar);
 candidate.deity='赵公明';candidate.rationale.foundation.tiaohou_required_stems=[];candidate.image_prompt='新的合法画面说明';
 const repaired=mergeSelectionRepair(base,candidate,['stems']);
 assert.deepEqual(repaired.rationale.foundation,base.rationale.foundation);
 assert.equal(repaired.deity,base.deity);assert.equal(repaired.image_prompt,candidate.image_prompt);
 assert.deepEqual(repaired.stem_symbols,[]);assert.doesNotThrow(()=>validateMapping(repaired,input,calendar));
});
test('a protected-stem conflict is repaired without dropping the protection or regenerating validated selections',async()=>{
 let calls=0;
 const result=await analyzeMapping({DEEPSEEK_API_KEY:'test'},input,calendar,[],async(url,init)=>{
  calls++;const request=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(calls===1)return Response.json({choices:[{message:{content:JSON.stringify(conflict())}}]});
  assert.equal(request.validation_issues[0].code,'protected_tiaohou_conflict');
  assert.deepEqual(request.fixed_selection.foundation.tiaohou_required_stems,['丙']);
  assert.ok(request.stem_response_plan.targets.some(x=>x.status==='skip_for_required_tiaohou'));
  assert.match(request.repair_hints.join('\n'),/不能取辛合走丙/);
  const fixed=makeMapping(input,calendar);fixed.rationale.foundation.tiaohou_required_stems=[]; // rejected as a foundation change; base is retained.
  return Response.json({choices:[{message:{content:JSON.stringify(fixed)}}]});
 });
 assert.equal(calls,2);assert.deepEqual(result.stem_symbols,[]);assert.equal(result.deity,'陈九公');
});
test('the final retry still rejects a repeated protected-stem conflict; no invalid mapping is accepted',async()=>{
 let calls=0;
 await assert.rejects(analyzeMapping({DEEPSEEK_API_KEY:'test'},input,calendar,[],async()=>{
  calls++;return Response.json({choices:[{message:{content:JSON.stringify(conflict())}}]});
 }),e=>e.code==='protected_tiaohou_conflict'&&e.analysisValidationFailed);
 assert.equal(calls,3);
});
