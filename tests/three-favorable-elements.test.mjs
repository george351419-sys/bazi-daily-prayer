import test from 'node:test';import assert from 'node:assert/strict';
import {applyFoundationPolicy} from '../lib/foundation-policy.mjs';import {fuyiCoverageCheck} from '../lib/foundation-checks.mjs';import {reviewFoundation} from '../lib/foundation-review.mjs';import {generateRuleMapping} from '../lib/prayer-engine.mjs';import {buildImagePrompt,validateInput,calendarFor,validateMapping} from '../lib/domain.mjs';import {visualMapping} from '../lib/image-reuse.mjs';import {makeMapping} from './fixtures/selection-mapping.mjs';
const ids=['natal.year','natal.month','natal.day','natal.hour','transit.luck','transit.year','transit.month','transit.day'],pillars=['甲戌','丙寅','壬午','辛丑','甲申','丙午','戊戌','壬午'];
const c={dayMaster:'壬',natal:pillars.slice(0,4),luck:pillars[4],year:pillars[5],month:pillars[6],day:pillars[7],stems:pillars.map((p,i)=>({id:ids[i],stem:p[0]})),rawStemClashes:[]};
const f={day_master:'壬',month_branch:'寅',reason:'本回归使用明确的身弱印比候选测试。',tiaohou_reason:'寅月壬水测试候选庚丙戊。',tiaohou_required_stems:['庚','丙','戊'],unmet_tiaohou_stems:['庚','戊'],tiaohou_groups:[],protected_stems:[],selection_basis:{structure:'ordinary',strength:'weak',fuyi_stems:['辛','壬','癸'],pattern_stems:['辛','壬'],fuyi_reason:'身弱以印比为候选，本回归检查庚的遗漏。',pattern_reason:'本回归采用印比候选检验复判与七档排序。'}};
test('七档全部按规定顺序生效，排序天干后再映射五行去重',()=>{
 const r=applyFoundationPolicy({...f,tiaohou_required_stems:['辛','壬','甲','癸'],selection_basis:{...f.selection_basis,strength:'balanced',fuyi_stems:['戊','丙','辛','壬'],pattern_stems:['丙','辛','甲','庚']}});
 assert.deepEqual(r.selection_policy.ordered_stems,['辛','丙','壬','甲','戊','庚','癸']);assert.deepEqual(r.selection_policy.tiers.map(x=>x.tier),[0,1,2,3,4,5,6]);assert.deepEqual(r.ranked_elements,['金','火','水','木','土']);assert.deepEqual(r.favorable_elements,['金','火','水']);assert.equal(r.tertiary_element,'水');
});
test('截图中的三组候选按新规则得到金、水、火，不以白黑中性填第三项',()=>{
 const r=applyFoundationPolicy(f);assert.deepEqual(r.selection_policy.ordered_stems,['辛','壬','癸','庚','丙','戊']);assert.deepEqual(r.favorable_elements,['金','水','火']);
 const complete=applyFoundationPolicy({...f,selection_basis:{...f.selection_basis,fuyi_stems:['庚','辛','壬','癸']}});assert.deepEqual(complete.favorable_elements,['金','水','火']);
});
test('普通身弱须考虑印比四干，不能单凭庚未透就排除',()=>{
 const check=fuyiCoverageCheck(c,f);assert.deepEqual(check.expected_stems,['庚','辛','壬','癸']);assert.deepEqual(check.unexplained,['庚']);
 const absent={...f,selection_basis:{...f.selection_basis,pattern_stems:['丙','丁'],fuyi_exclusions:[{stem:'庚',reason:'庚金在原局没有透出，所以本次不予考虑。'}]}};assert.deepEqual(fuyiCoverageCheck(c,absent).unexplained,['庚']);
});
test('具体格局排除理由可保留，遗漏且无理由的第二次输出不能冒充复判完成',async()=>{
 const second={...f,review_reason:'复核后保留辛印扶身路线，并明确列出庚未纳入的结构依据。',selection_basis:{...f.selection_basis,pattern_stems:['丙','丁'],fuyi_exclusions:[{stem:'庚',reason:'本回归采用辛正印救应的假设路线，庚偏印涉及食神取用，另行排除并保留依据。'}]}};
 let calls=0;const reviewed=await reviewFoundation(c,f,async()=>{calls++;return second;});assert.equal(calls,1);assert.ok(reviewed.cross_check.initial_checks.conflicts.some(x=>x.section==='fuyi_coverage'));assert.deepEqual(reviewed.selection_basis.fuyi_stems,['辛','壬','癸']);assert.equal(reviewed.cross_check.final_checks.fuyi.unexplained.length,0);
 await assert.rejects(reviewFoundation(c,f,async()=>({...f,review_reason:'本次仍维持原来的判断，需要有完整记录。',selection_basis:{...f.selection_basis,pattern_stems:['丙','丁']}})),/漏列印比候选庚/);
});
test('补齐庚后的三项喜用贯穿映射、点缀说明、实际提示词和图片复用标识',async()=>{
 let calls=0;const records=new Map(),config={DEEPSEEK_API_KEY:'offline-test-only',ENGINE_OWNER_ID:'three-element-regression',PRAYER_RULE_STORE:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,structuredClone(v))}};
 const mapping=await generateRuleMapping(config,{today:'2026-11-04',wishes:['W01'],artStyle:'cute'},c,[],async(url,options)=>{
  calls++;const q=JSON.parse(JSON.parse(options.body).messages[1].content);const value=q.initial?{...f,review_reason:'复核后把庚偏印加入扶抑候选，不再只看已透天干。',selection_basis:{...f.selection_basis,fuyi_stems:['庚','辛','壬','癸'],pattern_stems:['丙','丁'],pattern_rescue_stems:['辛','壬'],pattern_rescue_reason:'印比另列用于身弱支持，不替代食神生财方向。'}}:f;
  return Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
 });
 assert.equal(calls,2);assert.deepEqual(mapping.favorable_elements,['金','火','水']);assert.equal(mapping.tertiary_element,'水');assert.deepEqual(mapping.colors.map(x=>x.name),['白','红','蓝']);assert.match(mapping.reading.sections[1].body,/第三喜用五行为水/);assert.doesNotMatch(mapping.reading.sections[1].body,/中性|审美配色/);assert.match(mapping.image_prompt,/点缀：蓝.*第3喜用水/);assert.match(buildImagePrompt(mapping),/第三喜用水仅作少量点缀/);
 assert.equal(visualMapping(mapping).content.tertiaryElement,'水');assert.notEqual(visualMapping(mapping).fingerprint,visualMapping({...mapping,tertiary_element:'土'}).fingerprint);
});
test('第三喜用点缀色不能被声明为中性替代',()=>{
 const input=validateInput({gender:'female',birthDate:'1992-10-17',birthTime:'22:30',calendar:'solar',wishes:['W02']},'2026-11-04'),cal=calendarFor(input),m=makeMapping(input,cal);
 m.tertiary_element='土';m.rationale.foundation.tertiary_element='土';m.colors.push({name:'黄',hex:'#FFFF00'});const third={name:'黄',element:'中性',role:'点缀',reason:'本测试故意用中性色冒充第三喜用。',effect:'测试第三喜用点缀色校验。'};m.rationale.colors.push(third);assert.throws(()=>validateMapping(m,input,cal),/点缀色必须对应第三喜用五行/);
});
test('有效候选仅两种五行时明确第三缺项，不制造额外五行',()=>{
 const r=applyFoundationPolicy({...f,tiaohou_required_stems:['辛'],selection_basis:{...f.selection_basis,fuyi_stems:['庚','辛','壬','癸'],pattern_stems:['辛']}});assert.deepEqual(r.favorable_elements,['金','水']);assert.equal(r.tertiary_element,'');assert.match(r.reason,/不足三种五行/);
});

test('不能把白色谎标成土点缀来绕过第三喜用配色校验',()=>{
 const input=validateInput({gender:'female',birthDate:'1992-10-17',birthTime:'22:30',calendar:'solar',wishes:['W02']},'2026-11-04'),cal=calendarFor(input),m=makeMapping(input,cal);
 m.tertiary_element='土';m.rationale.foundation.tertiary_element='土';m.colors.push({name:'白',hex:'#FFFFFF'});m.rationale.colors.push({name:'白',element:'土',role:'点缀',reason:'本测试把白色错误标注为土。',effect:'验证色值与第三喜用同时一致。'});assert.throws(()=>validateMapping(m,input,cal),/点缀色与第三喜用的参考色不符/);
});

test('局部扶抑的辅助用字不会覆盖七档全局喜用五行顺序',()=>{
 const r=applyFoundationPolicy({...f,tiaohou_required_stems:['庚','丙'],selection_basis:{...f.selection_basis,fuyi_stems:['庚','辛','壬','癸'],pattern_stems:['庚','丙'],fuyi_reason:'本例扶抑先印后比，水为辅；最终顺位另由三法交集排序。'}});
 assert.deepEqual(r.favorable_elements,['金','火','水']);assert.equal(r.tertiary_element,'水');
});
