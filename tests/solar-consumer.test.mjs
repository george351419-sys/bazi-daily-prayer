import {makeMapping} from './fixtures/selection-mapping.mjs';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {validateInput,calendarFor,Solar,validateMapping} from '../lib/domain.mjs';
import {resolvePlace,equationOfTime} from '../lib/solar-time.mjs';
import {normalizeBirthDate,daysInPicker} from '../public/date-input.js';
import {birthSummary} from '../lib/consumer-reading.mjs';
import {consumerReadingMarkdown} from '../public/reading-view.js';
const profile={gender:'female',birthDate:'1992-10-17',birthTime:'22:30',wishes:['W02'],calendar:'solar',city:''};
const calendar=overrides=>calendarFor(validateInput({...profile,...overrides},'2026-10-17'));
test('生日简写规范化，保留非法日期的真实校验，滚动选择处理闰年',()=>{
 assert.equal(normalizeBirthDate(' 1990-1-1 '),'1990-01-01');
 assert.equal(validateInput({...profile,birthDate:'1990-1-1'}).birthDate,'1990-01-01');
 assert.equal(daysInPicker(2000,2,'solar'),29);assert.equal(daysInPicker(1900,2,'solar'),28);assert.equal(daysInPicker(1990,2,'lunar'),30);
 assert.throws(()=>calendar({birthDate:'1990-2-30'}),/不存在/);assert.throws(()=>normalizeBirthDate('1990-13-1'));
});
test('出生地留空不校正，上海填写后包含经度与均时差',()=>{
 const blank=calendar({city:'  '}),shanghai=calendar({city:'上海'});
 assert.equal(blank.timeCorrection.applied,false);assert.equal(blank.timeCorrection.offsetSeconds,0);assert.equal(blank.timeCorrection.civil,'1992-10-17 22:30:00');
 assert.equal(shanghai.timeCorrection.applied,true);assert.equal(shanghai.timeCorrection.trueSolar,'1992-10-17 22:50:39');
 assert.ok(shanghai.timeCorrection.equationMinutes>14);assert.ok(shanghai.timeCorrection.longitudeMinutes>5);
 assert.ok(Math.abs(equationOfTime(new Date('2024-11-03T04:00:00Z'))-16.49)<0.15);
});
test('离线地名允许简写与完整区县，重名或未知地名不能猜坐标',()=>{
 assert.equal(resolvePlace('上海浦东新区').name,'上海市浦东新区');
 assert.equal(resolvePlace('广东深圳').name,'广东省深圳市');
 assert.throws(()=>resolvePlace('朝阳'),/重名/);assert.throws(()=>resolvePlace('广东'),/暂未识别/);assert.throws(()=>resolvePlace('巴黎'),/暂未识别/);
});
test('西部真太阳时可跨日、跨时辰；用户不能注入伪造坐标',()=>{
 const c=calendar({city:'乌鲁木齐市',birthTime:'01:00'});
 assert.ok(c.timeCorrection.trueSolar.startsWith('1992-10-16'));
 const [date,time]=c.timeCorrection.trueSolar.split(' ');
 assert.deepEqual(c.natal,calendar({birthDate:date,birthTime:time.slice(0,5),city:''}).natal);
 const trusted=calendarFor(validateInput({...profile,city:'上海',place:{longitude:0},longitude:0}));
 assert.ok(trusted.timeCorrection.longitude>121);
});
test('节气附近日时校正不改变出生绝对时刻所属的年柱月柱或起运',()=>{
 const original=calendar({birthDate:'2024-2-4',birthTime:'16:30'});
 const corrected=calendar({birthDate:'2024-2-4',birthTime:'16:30',city:'上海'});
 assert.equal(original.natal[0],'甲辰');assert.deepEqual(corrected.natal.slice(0,2),original.natal.slice(0,2));assert.equal(corrected.firstLuck,original.firstLuck);
 assert.ok(corrected.timeCorrection.trueSolar<'2024-02-04 16:26:00');
});
test('农历先转公历再校正，与同一公历出生时刻完全一致',()=>{
 const a=calendar({city:'上海'}),b=calendar({city:'上海',calendar:'lunar',birthDate:'1992-9-22'});
 assert.deepEqual(b.natal,a.natal);assert.deepEqual(b.timeCorrection,a.timeCorrection);
});
function mapping(){return makeMapping(profile);}

test('用户解读和导出不包含内部过程，真实时间信息由历法生成',()=>{
 const raw=mapping();raw.internal_analysis='后台记录';const m=validateMapping(raw,validateInput(profile));assert.equal(m.internal_analysis,undefined);m.birth_summary=birthSummary(calendar({city:'上海'}));
 assert.ok(!m.professional.includes('natal.day'));assert.ok(!m.professional.includes('JSON'));
 const text=consumerReadingMarkdown(m);assert.ok(text.includes('1992-10-17 22:50:39'));assert.ok(text.includes('喜用配色'));assert.ok(!text.includes('natal.day'));
 const bad=mapping();bad.rationale.foundation.reason='内部校验：natal.day 与 transit.year';assert.throws(()=>validateMapping(bad,validateInput(profile)),/内部编号/);
});

test('浏览器日期 pattern 兼容 Unicode v 模式并允许单数字月日',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const pattern=html.match(/name="birthDate"[^>]*pattern="([^"]+)"/)[1];
 const regex=new RegExp('^(?:'+pattern+')$','v');
 assert.ok(regex.test('1990-1-1'));assert.ok(regex.test('1990/01/01'));assert.ok(!regex.test('90-1-1'));
});
