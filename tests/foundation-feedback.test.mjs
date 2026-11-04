import test from 'node:test';import assert from 'node:assert/strict';
import {parsePatternDeclaration,patternCheck} from '../lib/foundation-checks.mjs';
import {generateRuleMapping} from '../lib/prayer-engine.mjs';
const c={dayMaster:'壬',natal:['甲戌','丙寅','壬午','辛丑'],stems:[],rawStemClashes:[]};
const input={today:'2026-11-04',wishes:['W01'],artStyle:'cute'};
const first={day_master:'壬',month_branch:'寅',reason:'离线回归检查复判校验反馈。',tiaohou_reason:'寅月壬水采用规则调候候选。',tiaohou_required_stems:['庚','丙','戊'],unmet_tiaohou_stems:['庚','戊'],tiaohou_groups:[],protected_stems:[],selection_basis:{structure:'ordinary',strength:'weak',pattern_name:'食神生财格（普通八格）',pattern_route:'食神生财',pattern_direction:'顺用',fuyi_stems:['庚','辛','壬','癸'],pattern_stems:['辛','庚'],fuyi_reason:'日主偏弱，印比扶身，考虑完整候选。',pattern_reason:'本回归故意用印星救应代替财星，测试纠错反馈。'}};
const corrected={...first,review_reason:'本次将食神生财的财星列为核心，印星支持另列救应。',selection_basis:{...first.selection_basis,pattern_stems:['丙','丁'],pattern_rescue_stems:['辛','庚'],pattern_rescue_reason:'身弱需印星支持，另审印食取舍，不能覆盖生财方向。'}};
const mock=value=>Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
function config(){const records=new Map();return {records,value:{DEEPSEEK_API_KEY:'offline-only',ENGINE_OWNER_ID:'feedback-fixture',PRAYER_RULE_STORE:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,structuredClone(v))}}};}
test('修饰性格局名能识别，不能退回月令本气制造冲突或绕过校验',()=>{
 for(const name of ['食神格','食神生财格（普通八格）','食神生财格 (普通八格)','食神制杀格'])assert.equal(parsePatternDeclaration({pattern_name:name}).pattern,'食神');
 const cal={dayMaster:'庚',natal:['甲子','戊申','庚午','壬辰']};
 const check=patternCheck(cal,{selection_basis:{structure:'ordinary',pattern_name:'食神生财格（普通八格）',pattern_route:'食神生财',pattern_direction:'顺用',pattern_stems:['甲']}});
 assert.equal(check.monthly_main_god,'比肩');assert.equal(check.pattern,'食神');assert.equal(check.pattern_origin,'model_declared');assert.deepEqual(check.conflicts,[]);assert.deepEqual(check.contract.errors,[]);
 assert.equal(patternCheck(c,first).contract.applicable,true);assert.ok(patternCheck(c,first).contract.errors.length);
});
test('类型与说明不能互相矛盾；未知名称须明确类型，不能静默回退',()=>{
 assert.ok(parsePatternDeclaration({pattern_type:'正官',pattern_name:'食神生财格'}).errors.length);
 assert.ok(parsePatternDeclaration({pattern_type:'自造类型',pattern_name:'自造格'}).errors.length);
 assert.ok(parsePatternDeclaration({pattern_name:'模型无法识别的新名称'}).errors.length);
 assert.deepEqual(parsePatternDeclaration({pattern_type:'食神',pattern_name:'食神生财格（普通八格）'}).errors,[]);
 assert.deepEqual(parsePatternDeclaration({structure:'special',pattern_type:'从财',pattern_name:'从财格'}).errors,[]);
});
test('复判的具体约束错误进入现有响应校验重试，纠正后成功且不重新投票旺衰',async()=>{
 const cfg=config(),requests=[];
 const mapping=await generateRuleMapping(cfg.value,input,c,[],async(url,options)=>{
  const q=JSON.parse(JSON.parse(options.body).messages[1].content);requests.push(q);
  return mock(q.validation_error?corrected:q.initial?{...first,review_reason:'本回归第二次仍使用错误的印星核心，等待具体字段校验反馈。'}:first);
 });
 assert.equal(requests.length,3);assert.ok(requests[1].initial);assert.ok(requests[2].initial);assert.match(requests[2].validation_error,/核心.*救应|核心候选缺少财星/);assert.deepEqual(requests[2].initial,requests[1].initial);
 assert.deepEqual(mapping.engine.foundation.value.selection_basis.pattern_stems,['丙','丁']);assert.equal(mapping.engine.foundation.value.selection_basis.strength,'weak');
});
test('修正重试有界，仍错误则停止并保存初判及被拒复判，绝不生成假通过档案',async()=>{
 const cfg=config();let calls=0;
 await assert.rejects(generateRuleMapping(cfg.value,input,c,[],async()=>{calls++;return mock({...first,review_reason:'本回归始终坚持错误字段，检查终止和审计留存。'});}),/核心与救应分离/);
 assert.equal(calls,3);assert.ok(![...cfg.records.keys()].some(k=>k.includes('/foundation/')));
 const failure=[...cfg.records.values()].find(x=>x.foundation_review);assert.ok(failure);assert.deepEqual(failure.foundation_review.initial.selection_basis.pattern_stems,['辛','庚']);assert.deepEqual(failure.foundation_review.rejected_second.selection_basis.pattern_stems,['辛','庚']);assert.ok(failure.foundation_review.initial_checks.conflicts.length);
});
test('失败接口的可见提示带诊断编号，旧小程序只显示error也能定位且不泄露模型原文',async()=>{
 const {handleRequest}=await import('../api/gateway.js'),{createSession,csrfFor}=await import('../lib/tokens.mjs');
 const cfg=config(),settings={...cfg.value,SESSION_SECRET:'feedback-http-local-only-secret'},session=createSession(settings);let status,result;const savedFetch=globalThis.fetch;
 try{globalThis.fetch=async()=>mock({private_model_note:'不得把模型原文直接放进失败页面'});
 await handleRequest({method:'POST',url:'https://playmath.cn/api/analyze',headers:{host:'playmath.cn',origin:'https://playmath.cn','x-session-token':session,'x-csrf-token':csrfFor(settings,session)},query:{route:'analyze'},body:{gender:'female',birthDate:'1990-01-01',birthTime:'12:00',calendar:'solar',wishes:['W01']}},{setHeader(){},status(value){status=value;return this;},json(value){result=value;}},settings);
 }finally{globalThis.fetch=savedFetch;}
 assert.equal(status,503);assert.match(result.diagnosticId,/^[a-f0-9]{16}$/);assert.ok(result.error.includes(result.diagnosticId));assert.ok(!JSON.stringify(result).includes('private_model_note'));assert.ok(!JSON.stringify(result).includes('1990-01-01'));
});
