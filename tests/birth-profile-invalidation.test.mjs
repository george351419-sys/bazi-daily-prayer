import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,calendarFor} from '../lib/domain.mjs';
import {analyzeMapping} from '../lib/service.mjs';
import {natalFingerprint} from '../lib/prayer-engine.mjs';
import {generationSettings} from '../lib/automation.mjs';
import {visualMapping} from '../lib/image-reuse.mjs';
const profile={gender:'female',birthDate:'1992-10-17',birthTime:'22:30',calendar:'solar',city:'上海',wishes:['W02']};
const at=raw=>validateInput(raw,'2026-11-01');
test('修改生辰后重新取用并重建颜色、主尊和提示词；旧档案不污染新方案',async()=>{
 const records=new Map();let calls=0;
 const config={ENGINE_OWNER_ID:'birth-update-test',DEEPSEEK_API_KEY:'mock',PRAYER_RULE_STORE:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,structuredClone(v))}};
 const fetcher=async(url,options)=>{calls++;const q=JSON.parse(JSON.parse(options.body).messages[1].content);assert.ok(!q.schema?.decisions);const primary=calls===1?'火':'水';return Response.json({choices:[{message:{content:JSON.stringify({selection_basis:{structure:'special',structure_reason:'测试专用假设档案，仅验证账户与生辰缓存隔离。',strength:'balanced',fuyi_reason:'本测试使用明确假设的扶抑候选，用于生辰档案隔离测试。',pattern_reason:'本测试不增加额外的格局辅助候选。',fuyi_stems:[primary==='火'?'丙':'壬','甲'],pattern_stems:[]},day_master:q.dayMaster,month_branch:q.natal[1][1],primary_element:primary,secondary_element:'木',reason:'测试用模拟取用结论，用于验证不同生辰档案隔离和画面重新计算。',tiaohou_reason:'测试档案无额外调候需求，调候状态由当日透干规则计算。',tiaohou_required_stems:[],unmet_tiaohou_stems:[],tiaohou_groups:[],protected_stems:[]})}}]});};
 const oldInput=at(profile),nextInput=at({...profile,birthDate:'1993-04-03'});
 const old=await analyzeMapping(config,oldInput,calendarFor(oldInput),[],fetcher),next=await analyzeMapping(config,nextInput,calendarFor(nextInput),[],fetcher);
 assert.equal(calls,2);assert.equal(old.primary_element,'火');assert.equal(next.primary_element,'水');assert.equal(old.deity,'陈九公');assert.equal(next.deity,'姚少司');assert.notDeepEqual(old.colors,next.colors);assert.notEqual(old.image_prompt,next.image_prompt);assert.notEqual(visualMapping(old).fingerprint,visualMapping(next).fingerprint);
 assert.notEqual(old.engine.foundation.signature,next.engine.foundation.signature);assert.equal([...records.keys()].filter(k=>k.includes('/foundation/')).length,2);
 const restored=await analyzeMapping({...config,DEEPSEEK_API_KEY:''},oldInput,calendarFor(oldInput),[],()=>{throw Error('原资料只复用自身档案');});assert.equal(restored.primary_element,'火');assert.equal(calls,2);
});
test('性别、日期、时间、历法及出生地变更均隔离原局缓存与每日任务快照',()=>{
 const base=at(profile),signature=natalFingerprint(base,calendarFor(base)),settings=generationSettings({},profile);
 for(const patch of [{gender:'male'},{birthDate:'1993-04-03'},{birthTime:'10:00'},{calendar:'lunar'},{city:'北京'}]){
  const raw={...profile,...patch},changed=at(raw);assert.notEqual(natalFingerprint(changed,calendarFor(changed)),signature,JSON.stringify(patch));assert.notEqual(generationSettings({},raw).profileFingerprint,settings.profileFingerprint);
 }
});
test('不同生辰重新计算后允许相同画面，只有结构化要素一致才有相同图片指纹',()=>{
 const m={wish_id:'W02',deity:'陈九公',primary_element:'火',secondary_element:'木',colors:[{name:'红',hex:'#ff0000'}],zodiac:[],stem_symbols:[],elements:[{name:'陈九公'}]};
 assert.equal(visualMapping(m).fingerprint,visualMapping({...m,overview:'新生辰对应的独立解读'}).fingerprint);
 assert.notEqual(visualMapping(m).fingerprint,visualMapping({...m,primary_element:'水'}).fingerprint);
});
