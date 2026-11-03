import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {analyzeMapping} from '../lib/service.mjs';
import {validateInput,calendarFor,WISHES} from '../lib/domain.mjs';
import {generateRuleMapping,assessDailyConditions,natalFingerprint,selectStemSymbols,zodiacModels,viableZodiacModels,selectZodiac,validateFoundation,PRAYER_ENGINE_VERSION} from '../lib/prayer-engine.mjs';
import {relationKey} from '../lib/branch-policy.mjs';
import {PRAYER_CATALOG} from '../lib/prayer-catalog.mjs';
import {buildImagePrompt} from '../lib/domain.mjs';
const profile={gender:'female',birthDate:'1992-10-17',birthTime:'22:30',city:'上海',calendar:'solar',wishes:['W02']};
const input=validateInput(profile,'2026-11-01'),calendar=calendarFor(input);
const supplementFoundation=value=>({...value,selection_basis:{structure:'ordinary',strength:'weak',fuyi_reason:value.reason,pattern_reason:'本回归使用已确认的格局辅助候选，不增加其他候选。',fuyi_stems:value.primary_element==='木'?['甲','丙']:['丙','甲'],pattern_stems:['丙','甲']}});
const foundation={day_master:calendar.dayMaster,month_branch:calendar.natal[1][1],primary_element:'火',secondary_element:'木',reason:'本测试以既定火主木辅档案为前提，原局取用与每日动态分开保存。',tiaohou_reason:'具体调候按已确认档案安排，本例不额外增加未确认的景物。',tiaohou_required_stems:[],unmet_tiaohou_stems:[],tiaohou_groups:[],protected_stems:[]};
function fixture(){const records=new Map();let calls=0;const config={ENGINE_OWNER_ID:'test-account',PRAYER_RULE_STORE:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,structuredClone(v))},DEEPSEEK_API_KEY:'test'};const fetcher=async(url,options)=>{calls++;const request=JSON.parse(JSON.parse(options.body).messages[1].content);const result=request.schema?.decisions?{unmet_tiaohou_stems:[],effective_stem_bindings:[],decisions:request.models.map(m=>({model:m.id,effective_indices:[],unfavorable_indices:[],critical_indices:[],reason:'本测试未确认有效牵合条件，成员关系不自动当作已成局。'}))}:supplementFoundation(foundation);return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};};return {config,fetcher,records,get calls(){return calls;}};}
test('默认入口由规则组装完整方案；首次只判断原局，随后断网复用',async()=>{
 const f=fixture();const first=await analyzeMapping(f.config,input,calendar,[],f.fetcher);
 assert.equal(first.engine.version,PRAYER_ENGINE_VERSION);assert.equal(first.deity,'陈九公');assert.equal(first.engine.zodiac_candidates.length,79);assert.equal(f.calls,1);
 const second=await analyzeMapping({...f.config,DEEPSEEK_API_KEY:''},input,calendar,[],()=>{throw Error('must not call');});
 assert.deepEqual(second,first);assert.ok(second.professional);assert.equal(second.reading.sections.length,5);assert.ok(!second.image_prompt.includes(profile.birthDate));
 assert.ok([...f.records.values()].some(x=>x.origin==='model_supplement'));
});
test('36愿望均从资料库生成；三种画风共享相同选择，仅变画法',async()=>{
 const f=fixture();await analyzeMapping(f.config,input,calendar,[],f.fetcher);
 for(const wish of WISHES){const i={...input,wishes:[wish.id]};const m=await generateRuleMapping(f.config,i,calendar,[],f.fetcher);assert.equal(m.wish_id,wish.id);assert.ok(PRAYER_CATALOG[wish.id].some(x=>x.name===m.deity)||wish.id==='W02');}
 const images=[];for(const style of ['cute','spirit','folk']){const m=await analyzeMapping(f.config,{...input,artStyle:style},calendar,[],f.fetcher);images.push(m);assert.ok(buildImagePrompt(m).includes(m.deity));}
 assert.deepEqual(images.map(m=>m.zodiac),[[],[],[]]);assert.equal(new Set(images.map(m=>m.deity)).size,1);
});
test('缓存按账号、出生资料与动态状态隔离；失败不保存有效档案',async()=>{
 const f=fixture();await analyzeMapping(f.config,input,calendar,[],f.fetcher);const previous=f.calls;
 await analyzeMapping({...f.config,ENGINE_OWNER_ID:'other'},input,calendar,[],f.fetcher);assert.equal(f.calls,previous+1);
 const bad=fixture();await assert.rejects(analyzeMapping(bad.config,input,calendar,[],async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:'{}'}}]})})),/日主月令/);assert.ok(![...bad.records.keys()].some(k=>k.includes('/foundation/')));assert.ok([...bad.records.keys()].some(k=>k.includes('/failures/')));
 await assert.rejects(analyzeMapping({...fixture().config,DEEPSEEK_API_KEY:''},input,calendar),e=>e.code==='rule_gap_model_unavailable');
});
test('真实文件仓库可跨调用实例读取补判档案，出生变更不复用旧档案',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-rule-test-'));
 try{const f=fixture();const config={...f.config,PRAYER_RULE_STORE:undefined,ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'rule-test-secret-at-least-20-chars'};
  await analyzeMapping(config,input,calendar,[],f.fetcher);
  await analyzeMapping({...config,DEEPSEEK_API_KEY:''},input,calendar,[],()=>{throw Error('network');});
  const changed=validateInput({...profile,birthTime:'21:00'},input.today);
  assert.notEqual(natalFingerprint(input,calendar),natalFingerprint(changed,calendarFor(changed)));
  await assert.rejects(analyzeMapping({...config,DEEPSEEK_API_KEY:''},changed,calendarFor(changed)),e=>e.code==='rule_gap_model_unavailable');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('生肖枚举重算并以整组为单位比较，合不消除刑害',()=>{
 const base=[... '寅午'].map((branch,i)=>({id:'natal.'+i,branch})),models=zodiacModels(base);
 const values=[];for(const m of models)for(const r of m.relations)if(r.type==='三合'&&r.branches.includes('戌'))values.push({key:relationKey(r),effective:true});
 const selected=selectZodiac(models,{values},foundation);assert.deepEqual(selected.added,['戌']);assert.ok(selected.evaluated.length===79);
});
test('天干调候豁免与关键用干保护；不能解决的冲明确保留',()=>{
 const c={...calendar,stems:[{id:'natal.year',stem:'壬'},{id:'transit.year',stem:'丙'}],rawStemClashes:[{a:{id:'natal.year',stem:'壬'},b:{id:'transit.year',stem:'丙'}}]};
 assert.equal(selectStemSymbols(c,{...foundation,tiaohou_required_stems:['丙']}).items.length,0);
 const plan=selectStemSymbols(c,{...foundation,protected_stems:['丙']});assert.equal(plan.items.length,0);assert.equal(plan.unresolved.length,1);
});
test('资料库暂停关联没有重新入池',()=>{
 for(const [id,name]of [['W07','关公'],['W09','范蠡'],['W12','魁星'],['W16','魁星'],['W28','和合二仙'],['W20','妈祖']])assert.ok(!PRAYER_CATALOG[id].some(x=>x.name===name));
});
test('跨日保留稳定取用，动态条件由规则更新；同愿望轮换不虚构历史',async()=>{
 const f=fixture();const today=await analyzeMapping(f.config,input,calendar,[],f.fetcher);
 const nextInput={...input,today:'2026-11-02'},nextCalendar=calendarFor(nextInput);
 const next=await analyzeMapping(f.config,nextInput,nextCalendar,[{date:input.today,deity:today.deity,wish:'W02'}],f.fetcher);
 assert.equal(f.calls,1);assert.deepEqual(next.engine.foundation,today.engine.foundation);assert.equal(next.primary_element,today.primary_element);assert.notEqual(next.deity,today.deity);assert.ok(next.rotation_reason);
});
test('双生肖共同补全三合通过实际成员和象征成员分离校验',async()=>{
 const f=fixture();f.fetcher=async(url,options)=>{const q=JSON.parse(JSON.parse(options.body).messages[1].content);if(!q.schema?.decisions)return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(supplementFoundation(foundation))}}]})};
 const decisions=q.models.map(m=>({model:m.id,effective_indices:m.relation_indices.filter(i=>q.relation_catalog[i].type==='三合'&&q.relation_catalog[i].branches.every(b=>'寅午戌'.includes(b))),unfavorable_indices:[],critical_indices:[],reason:'本测试的火三合满足已给定的有效牵合条件，按主喜火方向比较候选。'}));
 return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({decisions,unmet_tiaohou_stems:[],effective_stem_bindings:[]})}}]})};};
 const c={...calendar,natal:['甲寅','乙卯','丙卯','丁卯'],dayMaster:'丙',luck:null,year:'乙卯',month:'乙卯',day:'乙卯',stems:[],rawStemClashes:[],rawStemBindings:[]};
 const custom={...foundation,day_master:'丙',month_branch:'卯'};
 const config={...f.config,PRAYER_FOUNDATION:{signature:natalFingerprint(input,c),value:custom}};
 const mapping=await analyzeMapping(config,input,c,[],f.fetcher);assert.deepEqual(new Set(mapping.zodiac),new Set(['马','狗']));assert.ok(mapping.professional.includes('三合取象'));
});
test('新的天干意象不能引入新冲，并用调候不能只补一半',()=>{
 const c={...calendar,stems:[{id:'natal.year',stem:'壬'},{id:'natal.month',stem:'乙'},{id:'transit.year',stem:'丙'}],rawStemClashes:[{a:{id:'natal.year',stem:'壬'},b:{id:'transit.year',stem:'丙'}}]};
 const plan=selectStemSymbols(c,foundation);assert.equal(plan.items.length,0);assert.equal(plan.unresolved.length,1);
 const paired=selectStemSymbols({...c,rawStemClashes:[]},{...foundation,tiaohou_required_stems:['甲','庚'],unmet_tiaohou_stems:['甲','庚'],tiaohou_groups:[['甲','庚']]});assert.equal(paired.items.length,0);
});
test('默认HTTP入口接通规则生成，缺补判配置时返回明确阶段错误',async t=>{
 const {handleRequest}=await import('../api/gateway.js');const {createSession,csrfFor}=await import('../lib/tokens.mjs');
 const config={SESSION_SECRET:'default-rule-engine-http-test-secret'},session=createSession(config);let status,data;
 const request={method:'POST',url:'https://playmath.cn/api/analyze',headers:{host:'playmath.cn',origin:'https://playmath.cn','x-session-token':session,'x-csrf-token':csrfFor(config,session)},query:{route:'analyze'},body:profile};
 await handleRequest(request,{setHeader(){},status(value){status=value;return this;},json(value){data=value;}},config);
 assert.equal(status,503);assert.equal(data.code,'rule_gap_model_unavailable');assert.match(data.error,/未启动绘图/);
});
test('已确认的新取用覆盖旧模型档案，并在后续调用保存生效',async()=>{
 const f=fixture();await analyzeMapping(f.config,input,calendar,[],f.fetcher);
 const replacement={...foundation,primary_element:'木',secondary_element:'火'};
 const changed=await analyzeMapping({...f.config,PRAYER_FOUNDATION:{signature:natalFingerprint(input,calendar),value:replacement}},input,calendar,[],f.fetcher);
 assert.equal(changed.primary_element,'木');assert.equal(changed.confidence,'confirmed');
 const cached=await analyzeMapping({...f.config,DEEPSEEK_API_KEY:''},input,calendar,[],()=>{throw Error('network');});assert.equal(cached.primary_element,'木');
});
test('配额门禁失败不再次请求模型',async()=>{
 const f=fixture();let gates=0;
 await assert.rejects(analyzeMapping({...f.config,BEFORE_TEXT_CALL:()=>{gates++;throw Error('text_quota');}},input,calendar,[],f.fetcher),/text_quota/);
 assert.equal(gates,1);assert.equal(f.calls,0);
});
test('同一天已经生成的主尊记录不改变当天的初始方案',async()=>{
 const f=fixture();const first=await analyzeMapping(f.config,input,calendar,[],f.fetcher);
 const again=await analyzeMapping(f.config,input,calendar,[{date:input.today,deity:first.deity,wish:first.wish_id}],f.fetcher);
 assert.equal(again.deity,first.deity);assert.equal(again.wish_id,first.wish_id);
});

test('先剔除必定新增刑害的候选，但不以原始冲提前淘汰可能有效的合',()=>{
 const models=zodiacModels([{id:'natal.month',branch:'寅'},{id:'natal.day',branch:'午'}]);const viable=viableZodiacModels(models);
 assert.ok(viable.length<models.length);assert.equal(viable[0].added.length,0);
 assert.ok(viable.some(m=>m.added.join('')==='戌'));
 assert.ok(!viable.some(m=>m.added.includes('巳'))); // 寅巳害不可由会合自动删除
});
test('失败记录保存阶段与具体条件，失败结果不冒充有效档案',async()=>{
 const f=fixture();await assert.rejects(analyzeMapping(f.config,input,calendar,[],async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:'{}'}}]})})),e=>e.ruleSection==='foundation');
 const failure=[...f.records.values()].find(x=>x.reason);assert.equal(failure.section,'foundation');assert.match(failure.reason,/日主月令/);
});

test('模型把地支放进天干保护字段时明确指出字段与允许值，不能自动猜测转换',()=>{
 assert.throws(()=>validateFoundation({...foundation,protected_stems:['申','己']},calendar),e=>/protected_stems/.test(e.message)&&/甲乙丙丁戊己庚辛壬癸/.test(e.message)&&/申/.test(e.message));
});

test('同日完整方案从仓库复用，修改返回对象不污染缓存',async()=>{
 const f=fixture();const first=await analyzeMapping(f.config,input,calendar,[],f.fetcher);const original=first.deity;first.deity='外部修改';
 const result=await analyzeMapping(f.config,input,calendar,[],()=>{throw Error('不得重复请求模型');});assert.equal(result.deity,original);assert.ok([...f.records.keys()].some(k=>k.includes('/mapping/')));
});
test('原局档案保持独立版本，每日规则更新不重判取用',async()=>{
 const f=fixture();await analyzeMapping(f.config,input,calendar,[],f.fetcher);
 const entry=[...f.records.entries()].find(([key])=>key.includes('/foundation/'));
 assert.ok(entry[0].includes('/2026-11-03-foundation-fgt-v1/'));assert.equal(entry[1].version,'2026-11-03-foundation-fgt-v1');assert.equal(PRAYER_ENGINE_VERSION,'2026-11-03-rules-v5');
});
test('已确认原局在无模型密钥时跨日生成全部条件与画面',async()=>{
 const f=fixture();let calls=0;
 for(const date of ['2026-11-01','2026-11-02','2026-11-03']){
  const i={...input,today:date},c=calendarFor(i),config={...f.config,DEEPSEEK_API_KEY:'',PRAYER_FOUNDATION:{signature:natalFingerprint(i,c),value:foundation}};
  const mapping=await analyzeMapping(config,i,c,[],()=>{calls++;throw Error('当日条件不得调用模型');});
  assert.equal(mapping.engine.assessment_origin,'rules');assert.equal(mapping.engine.condition_assessment.decisions.length,79);assert.ok(mapping.image_prompt);
 }
 assert.equal(calls,0);
});
const conditionFixture=(branchText,visible=[],f=foundation)=>{
 const models=zodiacModels([...branchText].map((branch,i)=>({id:'natal.'+i,branch})));
 const c={...calendar,stems:visible};return {models,c,assessment:assessDailyConditions(c,f,models)};
};
test('隔柱三会三合六合成员齐全即有效；六合无目标五行和利弊标签',()=>{
 const {models,assessment}=conditionFixture('寅卯辰午戌亥');const actual=assessment.decisions[0];
 for(const type of ['三会','三合','六合'])assert.ok(models[0].relations.some(r=>r.type===type&&actual.effective_keys.includes(relationKey(r))));
 for(const r of models[0].relations.filter(r=>r.type==='六合')){assert.ok(!actual.unfavorable_keys.includes(relationKey(r)));assert.ok(!actual.critical_keys.includes(relationKey(r)));}
});
test('三会三合按目标五行判断，全部有利关系受保护',()=>{
 const {models,assessment}=conditionFixture('寅午戌申子辰');const actual=assessment.decisions[0];
 const fire=models[0].relations.find(r=>r.type==='三合'&&r.branches.includes('寅')),water=models[0].relations.find(r=>r.type==='三合'&&r.branches.includes('申'));
 assert.ok(actual.critical_keys.includes(relationKey(fire)));assert.ok(!actual.unfavorable_keys.includes(relationKey(fire)));assert.ok(actual.unfavorable_keys.includes(relationKey(water)));
});
test('真实天干五合不论相邻与争合，同一实例可参与多组',()=>{
 const visible=[{id:'natal.year',stem:'甲'},{id:'natal.month',stem:'丙'},{id:'natal.day',stem:'己'},{id:'transit.year',stem:'己'}];
 const {assessment}=conditionFixture('寅午',visible);assert.deepEqual(assessment.effective_stem_bindings,[['natal.year','natal.day'],['natal.year','transit.year']]);
 const c={...calendar,stems:[...visible,{id:'transit.day',stem:'庚'}],rawStemClashes:[{a:visible[0],b:{id:'transit.day',stem:'庚'}}]};
 assert.equal(selectStemSymbols(c,foundation,assessment.effective_stem_bindings).items.length,0);
});
test('调候只认具体透干，藏干不计；被合或冲的透干仍满足',()=>{
 const f={...foundation,tiaohou_required_stems:['丙','丁'],unmet_tiaohou_stems:['丙','丁'],tiaohou_groups:[['丙','丁']]};
 const visible=[{id:'natal.year',stem:'丙'},{id:'transit.year',stem:'辛'},{id:'transit.day',stem:'壬'}];
 const {assessment}=conditionFixture('寅午戌',visible,f);assert.deepEqual(assessment.unmet_tiaohou_stems,['丁']);assert.deepEqual(assessment.tiaohou_presence[0].visible_ids,['natal.year']);
 const hiddenOnly=conditionFixture('寅午戌',[],f).assessment;assert.deepEqual(hiddenOnly.unmet_tiaohou_stems,['丙','丁']);
});
test('HTTP入口有可靠原局档案且无模型密钥时完成映射，不再出现当日补判错误',async()=>{
 const {handleRequest}=await import('../api/gateway.js');const {createSession,csrfFor}=await import('../lib/tokens.mjs');
 const i=validateInput(profile),c=calendarFor(i),config={SESSION_SECRET:'confirmed-daily-rules-http-test-secret',PRAYER_FOUNDATION:{signature:natalFingerprint(i,c),value:foundation}},session=createSession(config);let status,data;
 await handleRequest({method:'POST',url:'https://playmath.cn/api/analyze',headers:{host:'playmath.cn',origin:'https://playmath.cn','x-session-token':session,'x-csrf-token':csrfFor(config,session)},query:{route:'analyze'},body:profile},{setHeader(){},status(value){status=value;return this;},json(value){data=value;}},config);
 assert.equal(status,200);assert.equal(data.status,'mapped');assert.equal(data.mapping.engine.assessment_origin,'rules');assert.ok(data.token);
});
