import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,calendarFor,validateMapping} from '../lib/domain.mjs';
import {hasDefensiveCopy,evidenceContext} from '../lib/selection-rationale.mjs';
import {STEM_PARTNER} from '../lib/domain.mjs';
import {makeMapping,addClashStem} from './fixtures/selection-mapping.mjs';
const input=validateInput({gender:'female',birthDate:'1992-10-17',birthTime:'22:30',city:'上海',calendar:'solar',wishes:['W02']},'2026-10-17');
const calendar=calendarFor(input),valid=m=>validateMapping(m,input,calendar);
const fresh=()=>makeMapping(input,calendar);
test('用户列出的三类免责声明，在整体、要素与专业取用解释中均拒绝',()=>{
 for(const sentence of ['这是传统命理的一种取象参考，不是对现实结果的判断','并不代表某种具体的收益承诺','并不表示现实中的问题已经消除，也不构成对任何具体事件的预测']){
  assert.ok(hasDefensiveCopy(sentence));
  for(const field of ['overview','element','rationale']){const m=fresh();if(field==='overview')m.overview+=sentence;else if(field==='element')m.elements[0].meaning+=sentence;else m.rationale.colors[0].effect+=sentence;assert.throws(()=>valid(m),/自我否定/);}
 }
});
test('五类专业卡片由已核验依据生成，未选要素不编造，内部依据不返回',()=>{
 const m=valid(fresh());assert.equal(m.reading.sections.length,5);assert.ok(m.professional.includes('橙红（火，主色）'));assert.ok(m.professional.includes('陈九公'));assert.ok(m.professional.includes('不再额外叠加生肖'));assert.equal(m.rationale,undefined);
 assert.ok(!m.professional.includes('natal.'));
});
test('日主月令、主辅五行、色板与主尊方位必须逐项相符',()=>{
 for(const change of [m=>m.rationale.foundation.day_master='甲',m=>m.rationale.foundation.month_branch='子',m=>m.rationale.foundation.primary_element='金',m=>m.rationale.colors.pop(),m=>m.rationale.colors[0].element='水',m=>m.rationale.deity.name='萧升',m=>m.rationale.deity.direction='东方']){const m=fresh();change(m);assert.throws(()=>valid(m),/取用依据校验/);}
});
test('生肖解释必须对应实际生肖和真实六合关系',()=>{
 const m=fresh();m.zodiac=['兔'];m.rationale.zodiac={reason_if_empty:'',items:[{animal:'兔',branch:'卯',method:'六合取象',target_ids:['natal.month'],reason:'卯与月支戌有六合联系，辅喜木与本次木火主题相衔接。',effect:'以柔和兔形承载和合与生发的意象。'}]};
 assert.ok(valid(m).professional.includes('兔（卯，六合取象）'));
 m.rationale.zodiac.items[0].target_ids=['natal.year'];assert.throws(()=>valid(m),/六合配对不成立/);
});
test('新增天干无限份覆盖全部匹配对象，专业文案显示中文来源',()=>{
 const m=addClashStem(fresh(),calendar);const result=valid(m);
 assert.deepEqual(evidenceContext(calendar,STEM_PARTNER).stem_match_ids['辛'],['natal.day','transit.luck','transit.year']);
 assert.ok(result.professional.includes('原局日干丙、大运天干丙、流年天干丙'));assert.ok(!result.professional.includes('transit.'));
 m.rationale.stems.items[0].match_ids.pop();assert.throws(()=>valid(m),/全部已有五合对象/);
});
test('不能合走来冲但为调候所需之干，也不能虚构解冲对象',()=>{
 const m=addClashStem(fresh(),calendar);m.rationale.foundation.tiaohou_required_stems=['丙'];assert.throws(()=>valid(m),/调候所需时应豁免/);
 const wrong=addClashStem(fresh(),calendar);wrong.rationale.stems.items[0].clash_targets=[{natal_id:'natal.month',incoming_id:'transit.year'}];assert.throws(()=>valid(wrong),/相冲在真实排盘中不存在/);
});
test('调候意象必须是所需的具体干，不能只因同五行而替换',()=>{
 const m=addClashStem(fresh(),calendar);const s=m.rationale.stems.items[0];s.purpose='调候';s.clash_targets=[];
 assert.throws(()=>valid(m),/明确所需的具体天干/);
});

test('程序给出解冲方向与日主生克根气，纠错一次覆盖多个矛盾',async()=>{
 const {repairHints}=await import('../lib/selection-rationale.mjs');
 const context=evidenceContext(calendar,STEM_PARTNER);
 const option=context.clash_response_options.find(x=>x.natal_id==='natal.month'&&x.incoming_id==='transit.day');assert.equal(option.incoming_stem,'甲');assert.equal(option.response_stem,'己');
 assert.match(context.natal_stem_roles.find(x=>x.id==='natal.month').relation,/财星.*耗身/);
 assert.match(context.natal_stem_roles.find(x=>x.id==='natal.hour').relation,/食伤.*泄身/);
 assert.ok(context.natal_hidden_stems.find(x=>x.id==='natal.day').same_element_roots.includes('丙'));
 const m=addClashStem(fresh(),calendar);m.rationale.stems.items[0].stem='乙';m.rationale.stems.items[0].purpose='解冲兼调候';m.rationale.stems.items[0].clash_targets=[{natal_id:'natal.month',incoming_id:'transit.day'}];
 const hints=repairHints(m,calendar,STEM_PARTNER);assert.equal(hints.length,2);assert.ok(hints.some(x=>x.includes('取己合甲')));
});
