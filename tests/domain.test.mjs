import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateInput,calendarFor,WISHES,buildImagePrompt,STEM_PARTNER,todayShanghai} from '../lib/domain.mjs';
const input={gender:'female',birthDate:'1992-10-17',birthTime:'22:30',calendar:'solar',wishes:['W02'],city:'上海'};
test('历法回归：案例四的四柱、大运与目标日',()=>{const c=calendarFor(validateInput(input,'2026-10-16'));assert.deepEqual(c.natal,['壬申','庚戌','丙寅','己亥']);assert.equal(c.luck,'丙午');assert.equal(c.luckFrom,'2025-12-27 22:30:00');assert.equal(c.day,'癸亥');assert.equal(c.rawStemClashes.length,3);assert.equal(c.rawStemBindings.length,1);});
test('交运具体时刻：交运日中午仍在前运',()=>{assert.equal(calendarFor(validateInput(input,'2025-12-27')).luck,'丁未');assert.equal(calendarFor(validateInput(input,'2025-12-28')).luck,'丙午');});
test('36项愿望ID连续唯一，重复选项去重',()=>{assert.equal(WISHES.length,36);assert.equal(WISHES.at(-1).id,'W36');assert.deepEqual(validateInput({...input,wishes:['W02','W02']}).wishes,['W02']);});
test('无时辰、非法日期、未定义愿望拒绝',()=>{assert.throws(()=>validateInput({...input,birthTime:''}));assert.throws(()=>calendarFor(validateInput({...input,birthDate:'1992-02-30'})));assert.throws(()=>validateInput({...input,wishes:['W99']}));});
test('农历输入与公历输入得到相同四柱',()=>{const c=calendarFor(validateInput({...input,calendar:'lunar',birthDate:'1992-09-22'},'2026-10-16'));assert.deepEqual(c.natal,['壬申','庚戌','丙寅','己亥']);});
test('一个辛取象可覆盖所有丙实例，不按争合排除',()=>{const c=calendarFor(validateInput(input,'2026-10-16'));const targets=c.stems.filter(x=>STEM_PARTNER['辛']===x.stem);assert.deepEqual(targets.map(x=>x.id),['natal.day','transit.luck','transit.year']);});
test('生图仅含选定要素，封装不传原始生辰',()=>{const p=buildImagePrompt({wish_label:'财源广进',deity:'萧升',image_prompt:'青绿云霞',colors:[{name:'青绿',hex:'#286151'}],zodiac:[],stem_symbols:[{stem:'辛',motif:'银白珠饰'}]});assert.ok(p.includes('银白珠饰'));assert.ok(p.includes('无文字'));assert.ok(!p.includes('1992'));assert.ok(!p.includes('22:30'));});

test('上海午夜刷新目标日期，避免跨日仍命中昨日缓存',()=>{assert.equal(todayShanghai(new Date('2026-10-16T15:59:59Z')),'2026-10-16');assert.equal(todayShanghai(new Date('2026-10-16T16:00:00Z')),'2026-10-17');});
