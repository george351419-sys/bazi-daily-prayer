import test from 'node:test';import assert from 'node:assert/strict';
import {reviewFoundation} from '../lib/foundation-review.mjs';import {strengthCheck,patternCheck} from '../lib/foundation-checks.mjs';import {applyFoundationPolicy} from '../lib/foundation-policy.mjs';import {tiaohouRule,withTiaohouRule} from '../lib/tiaohou-rules.mjs';
const c={dayMaster:'己',natal:['庚午','戊寅','己酉','壬申']};
const f={day_master:'己',month_branch:'寅',reason:'测试本次命例的明确前提。',tiaohou_reason:'测试规则候选，丙癸调候。',tiaohou_required_stems:['丙','癸'],unmet_tiaohou_stems:['丙','癸'],tiaohou_groups:[],protected_stems:[],selection_basis:{structure:'ordinary',strength:'weak',fuyi_reason:'本测试以印比候选验证集合运算。',pattern_reason:'本测试以印化官候选验证复核。',fuyi_stems:['丙','丁','戊','己'],pattern_stems:['丙']}};
test('three empty intersections fall back F then G then T; same-element duplicates do not consume slots',()=>{
 const r=applyFoundationPolicy({...f,selection_basis:{...f.selection_basis,fuyi_stems:['丙','丁'],pattern_stems:['庚']},tiaohou_required_stems:['壬']});
 assert.equal(r.primary_element,'火');assert.equal(r.secondary_element,'金');assert.equal(r.selection_policy.fallback_used,true);assert.match(r.reason,/回退扶抑→格局→调候/);
 const g=applyFoundationPolicy({...f,selection_basis:{...f.selection_basis,fuyi_stems:[],pattern_stems:['庚']},tiaohou_required_stems:['壬']});assert.equal(g.primary_element,'金');assert.equal(g.secondary_element,'水');
});
test('one nonempty intersection does not trigger the all-empty fallback',()=>{const r=applyFoundationPolicy(f);assert.equal(r.selection_policy.fallback_used,false);assert.equal(r.secondary_element,'');});
test('all 120 stem-month cells return typed, source-attributed baseline candidates',()=>{
 for(const dayMaster of '甲乙丙丁戊己庚辛壬癸')for(const month of '寅卯辰巳午未申酉戌亥子丑'){
  const r=tiaohouRule({dayMaster,natal:['甲子','甲'+month,dayMaster+'子','甲子']});assert.ok(r.stems.length);assert.ok(r.stems.every(x=>'甲乙丙丁戊己庚辛壬癸'.includes(x)&&x.length===1));assert.ok(r.source.includes('oldid=2294674'));assert.equal(new Set(r.stems).size,r.stems.length);
 }
 assert.deepEqual(tiaohouRule(c).stems,['丙','癸']);
});
test('solar-term branch uses actual birth input, never current transit month or calendar midpoint',()=>{
 const calendar={dayMaster:'乙',natal:['甲子','乙酉','乙丑','甲子']};
 const a=tiaohouRule(calendar,{birthDate:'2024-09-21',birthTime:'12:00',calendar:'solar'}),b=tiaohouRule(calendar,{birthDate:'2024-09-24',birthTime:'12:00',calendar:'solar'});
 assert.deepEqual(a.stems,['癸']);assert.deepEqual(b.stems,['丙','癸']);assert.equal(b.birth_previous_term,'秋分');
});
test('rule-mapped T replaces a model hallucination without promoting branch symbols into stems',()=>{const r=withTiaohouRule({...f,tiaohou_required_stems:['甲']},c);assert.deepEqual(r.tiaohou_required_stems,['丙','癸']);assert.ok(r.tiaohou_rule);});
test('numeric score is natal-only and retains its source, component entries and thresholds',()=>{
 const a=strengthCheck(c),b=strengthCheck({...c,year:'甲子',month:'甲子',day:'甲子',luck:'甲子'});assert.deepEqual(a,b);assert.ok(a.entries.length>4);assert.equal(a.strength,'balanced');assert.equal(a.help_score,8);assert.equal(a.drain_score,6);assert.ok(a.source.includes('/blob/'));assert.ok(a.limitations.length);
});
test('官顺用印、伤官逆用印 pass the direction check; 七杀直接取财 triggers review',()=>{
 assert.equal(patternCheck(c,f).conflicts.length,0);
 const bad=patternCheck(c,{selection_basis:{pattern_name:'七杀格',pattern_stems:['壬']}});assert.equal(bad.direction,'逆用');assert.equal(bad.conflicts.length,1);
 const inverse=patternCheck(c,{selection_basis:{pattern_name:'伤官格',pattern_stems:['丙']}});assert.equal(inverse.conflicts.length,0);
});
test('agreement makes no reflection call',async()=>{let calls=0;const r=await reviewFoundation(c,{...f,selection_basis:{...f.selection_basis,strength:'balanced'}},()=>{calls++;});assert.equal(calls,0);assert.equal(r.cross_check.status,'agreed');});
test('model second output stays authoritative even when it insists against the numerical checker',async()=>{
 let calls=0;const first={...f,selection_basis:{...f.selection_basis,strength:'strong'}};
 const r=await reviewFoundation(c,first,async({checks})=>{calls++;assert.ok(checks.conflicts.some(x=>x.section==='strength'));return {...first,review_reason:'复核月令根气及具体成格路线后仍维持初判，不把等权计数当作最终结论。'};});
 assert.equal(calls,1);assert.equal(r.selection_basis.strength,'strong');assert.equal(r.cross_check.status,'model_second_retained');assert.equal(r.cross_check.initial.selection_basis.strength,'strong');assert.equal(r.cross_check.final_checks.strength.strength,'balanced');
 const cached=await reviewFoundation(c,r,()=>{throw Error('缓存不得反复复判');},{reuseRecordedReview:true});assert.deepEqual(cached,r);
});
test('a correcting second judgement is retained with both drafts and no third semantic pass',async()=>{
 const first={...f,selection_basis:{...f.selection_basis,strength:'strong'}};let calls=0;
 const r=await reviewFoundation(c,first,async()=>{calls++;return {...f,selection_basis:{...f.selection_basis,strength:'balanced'},review_reason:'复核月令、根气及透藏后改判为中和，保留两次结论用于核对。'};});assert.equal(calls,1);assert.equal(r.cross_check.status,'model_second_agreed');assert.equal(r.selection_basis.strength,'balanced');
});
test('confirmed premise stays authoritative and failed reflection cannot masquerade as completed review',async()=>{
 const first={...f,selection_basis:{...f.selection_basis,strength:'strong'}};
 const r=await reviewFoundation(c,first,()=>{throw Error('不得改写确认前提');},{confirmed:true});assert.equal(r.cross_check.status,'confirmed_premise');
 await assert.rejects(reviewFoundation(c,first,async()=>({...first})),/复判须提供/);
 await assert.rejects(reviewFoundation(c,first,async()=>{throw Error('复判服务不可用');}),/复判服务不可用/);
});
