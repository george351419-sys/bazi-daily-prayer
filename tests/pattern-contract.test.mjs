import test from 'node:test';import assert from 'node:assert/strict';
import {foundationChecks,patternCheck} from '../lib/foundation-checks.mjs';
import {reviewFoundation} from '../lib/foundation-review.mjs';
import {applyFoundationPolicy} from '../lib/foundation-policy.mjs';
import {artworkFoundationIssues} from '../lib/reading-display.mjs';
const c={dayMaster:'壬',natal:['甲戌','丙寅','壬午','辛丑']};
const f={day_master:'壬',month_branch:'寅',reason:'本用例核对食神顺用与扶抑分离。',tiaohou_reason:'寅月壬水按调候表核对候选。',tiaohou_required_stems:['庚','丙','戊'],unmet_tiaohou_stems:['庚','戊'],tiaohou_groups:[],protected_stems:[],selection_basis:{structure:'ordinary',strength:'weak',pattern_name:'食神格',pattern_direction:'顺用',pattern_route:'食神生财',fuyi_stems:['辛','壬','癸','庚'],pattern_stems:['辛','庚'],fuyi_reason:'日主偏弱，扶抑完整考虑印比。',pattern_reason:'食神生财但身弱，以印星救应。'}};
const corrected={...f,review_reason:'生财路线的财星列为核心候选，身弱印比另列救应，不混入格局交集。',selection_basis:{...f.selection_basis,pattern_stems:['丙','丁'],pattern_reason:'食神生财，壬水以丙丁财星承接食神。',pattern_rescue_stems:['辛','庚'],pattern_rescue_reason:'身弱仍须印比生扶，印对食神的影响另行核对。'}};
test('截图的辛庚候选会明确触发核心方向缺财与印星混入冲突',()=>{
 const check=foundationChecks(c,f);assert.ok(check.conflicts.some(x=>x.section==='pattern_contract'));assert.deepEqual(check.pattern.contract.rule_candidates,['丙','丁']);assert.ok(check.pattern.contract.errors.some(x=>x.includes('缺少财星')));assert.equal(check.pattern.conflicts.length,2);
});
test('第二次仍把印星当食神生财核心，即使有长篇理由也不能归档',async()=>{
 await assert.rejects(reviewFoundation(c,f,async()=>({...f,review_reason:'日主身弱，需要印星救应，复判后仍坚持以辛庚代替财星作为格局方向。'})),/复判仍违反格局核心与救应分离约束/);
});
test('修正后的两轮草稿及冲突被保留，救应不进入七档格局集合',async()=>{
 let calls=0;const r=await reviewFoundation(c,f,async({checks})=>{calls++;assert.ok(checks.conflicts.some(x=>x.section==='pattern_contract'));return corrected;});
 assert.equal(calls,1);assert.equal(r.cross_check.status,'model_second_agreed');assert.deepEqual(r.cross_check.initial.selection_basis.pattern_stems,['辛','庚']);assert.deepEqual(r.cross_check.second.selection_basis.pattern_stems,['丙','丁']);assert.deepEqual(r.cross_check.final_checks.pattern.contract.errors,[]);
 const ranked=applyFoundationPolicy(r);assert.deepEqual(ranked.selection_policy.intersections[0].stems,[]);assert.deepEqual(ranked.selection_policy.intersections[3].stems,['丙']);assert.deepEqual(ranked.favorable_elements,['金','火','水']);assert.match(ranked.reason,/格局救应：辛、庚/);assert.match(ranked.reason,/救应不单独并入格局交集候选/);
});
test('无财星的空核心也触发冲突；只有生财叙述不能抵消结构化错误',()=>{
 const check=patternCheck(c,{...f,selection_basis:{...f.selection_basis,pattern_stems:[],pattern_reason:'食神生财，喜财星流通。'}});assert.ok(check.contract.errors.some(x=>x.includes('缺少财星')));
});
test('没有原局七杀不能以制杀或弃食为名绕过财星方向',()=>{
 const noKill={...c,natal:['甲子','丙寅','壬午','辛卯']}; // 寅中戊仍为七杀，改用卯月食神声明只验证缺杀条件。
 noKill.natal[1]='乙卯';
 for(const route of ['食神制杀','弃食就杀印']){const r=patternCheck(noKill,{...f,selection_basis:{...f.selection_basis,pattern_route:route,pattern_route_reason:'复核后本命例希望切换到其他格局路线。',pattern_stems:route==='食神制杀'?['甲']:['辛']}});assert.ok(r.contract.errors.some(x=>x.includes('原局有七杀')));}
});
test('其他食神路线保留明确分支，须有原局条件及独立依据',()=>{
 const control=patternCheck(c,{...f,selection_basis:{...f.selection_basis,pattern_route:'食神制杀',pattern_stems:['甲'],pattern_route_reason:'原局戌寅藏戊七杀，明确用甲食神制戊杀，另核制化轻重。'}});assert.deepEqual(control.contract.errors,[]);
 const abandon=patternCheck(c,{...f,selection_basis:{...f.selection_basis,pattern_route:'弃食就杀印',pattern_stems:['辛'],pattern_route_reason:'原局有戊杀与辛印，放弃生财而就杀印路线，另审食神与印的取舍。'}});assert.deepEqual(abandon.contract.errors,[]);
 const insufficient=patternCheck(c,{...f,selection_basis:{...f.selection_basis,pattern_route:'弃食就杀印'}});assert.ok(insufficient.contract.errors.some(x=>x.includes('独立的路线成立依据')));
});
test('救应字段必须有具体理由，旧版错误复核标记不能直接命中缓存',async()=>{
 const invalid={...corrected,selection_basis:{...corrected.selection_basis,pattern_rescue_reason:''}};assert.ok(patternCheck(c,invalid).contract.errors.length);
 const cached={...f,cross_check:{version:'2026-11-04-crosscheck-v3',status:'model_second_retained'}};let calls=0;await reviewFoundation(c,cached,async()=>{calls++;return corrected;},{reuseRecordedReview:true});assert.equal(calls,1);
});
test('旧作品只标明归档方向问题，不把旧图冒充新方案',()=>{
 const record={calendar:c,mapping:{primary_element:'金',secondary_element:'水',rationale:{foundation:f}}};assert.ok(artworkFoundationIssues(record).some(x=>x.includes('归档格局方向与救应混用')));assert.deepEqual(record.mapping.rationale.foundation.selection_basis.pattern_stems,['辛','庚']);
});
test('各日主的食神生财方向均按十神映射到财星，不写死为火',()=>{
 for(const dm of '甲乙丙丁戊己庚辛壬癸'){
  const cal={dayMaster:dm,natal:['甲子','丙寅',dm+'午','辛丑']};
  const check=patternCheck(cal,{selection_basis:{structure:'ordinary',pattern_name:'食神格',pattern_stems:[]}}).contract;
  assert.equal(check.rule_candidates.length,2);
  const valid=patternCheck(cal,{selection_basis:{structure:'ordinary',pattern_name:'食神格',pattern_stems:check.rule_candidates}});
  assert.deepEqual(valid.contract.errors,[]);assert.ok(valid.candidates.every(x=>['正财','偏财'].includes(x.god)));
 }
});
test('旧v6缓存中的印星核心需重新校验，不能直接重排为新档案',async()=>{
 const {generateRuleMapping}=await import('../lib/prayer-engine.mjs');
 const records=new Map(),config={DEEPSEEK_API_KEY:'offline-only',ENGINE_OWNER_ID:'pattern-migration-test',PRAYER_RULE_STORE:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,structuredClone(v))}},input={today:'2026-11-04',wishes:['W01'],artStyle:'cute'};
 const mock=value=>Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
 await generateRuleMapping(config,input,{...c,stems:[],rawStemClashes:[]},[],async()=>mock(corrected));
 const [key,record]=[...records].find(([k])=>k.includes('/foundation/'));
 records.clear();records.set(key.replace('foundation-fgt-v7','foundation-fgt-v6'),{...record,version:'2026-11-04-foundation-fgt-v6',value:{...f,review_reason:'旧版复判仍以印星救应替代格局生财方向。',cross_check:{version:'2026-11-04-crosscheck-v2',status:'model_second_retained',initial:f,second:f,initial_checks:foundationChecks(c,f),final_checks:foundationChecks(c,f)}}});
 let calls=0;const result=await generateRuleMapping(config,input,{...c,stems:[],rawStemClashes:[]},[],async(url,options)=>{calls++;const req=JSON.parse(JSON.parse(options.body).messages[1].content);assert.ok(req.checks.conflicts.some(x=>x.section==='pattern_contract'));return mock(corrected);});
 assert.equal(calls,1);assert.equal(result.engine.foundation.migratedFrom,'2026-11-04-foundation-fgt-v6');assert.deepEqual(result.engine.foundation.value.selection_basis.pattern_stems,['丙','丁']);assert.deepEqual(result.engine.foundation.value.cross_check.initial.selection_basis.pattern_stems,['辛','庚']);
});
