import test from 'node:test';import assert from 'node:assert/strict';
import {relationSnapshot,branchExplanation,stemExplanation} from '../lib/relation-explanation.mjs';
import {confirmedFoundationCase} from '../lib/foundation-cases.mjs';
import {generateRuleMapping} from '../lib/prayer-engine.mjs';
const ids=['natal.year','natal.month','natal.day','natal.hour','transit.luck','transit.year','transit.month','transit.day'];
const pillars=['庚午','戊寅','己酉','壬申','辛巳','丙午','戊戌','辛巳'];
const calendar={dayMaster:'己',natal:pillars.slice(0,4),luck:pillars[4],year:pillars[5],month:pillars[6],day:pillars[7],stems:pillars.map((p,i)=>({id:ids[i],stem:p[0]})),rawStemClashes:[{a:{id:'natal.hour',stem:'壬'},b:{id:'transit.year',stem:'丙'}}]};
test('地支按来源列全，再列合，再列剩余；解除刑不隐去仍剩余的害',()=>{
 const snapshot=relationSnapshot(calendar),text=branchExplanation(snapshot,'仍有未解除的害，已比较安全生肖候选。');
 for(const branch of snapshot.branches.instances)assert.ok(text.includes(branch.branch));
 assert.ok(text.indexOf('地支：')<text.indexOf('有效合：'));assert.ok(text.indexOf('有效合：')<text.indexOf('合后检查：'));assert.ok(text.indexOf('合后检查：')<text.indexOf('生肖处理：'));
 assert.match(text,/寅午戌三合/);assert.match(text,/申酉戌三会/);assert.match(text,/午午自刑/);assert.match(text,/剩余冲刑害：.*寅巳六害/);
});
test('天干先列八个来源和丙辛五合，再列丙壬冲已抑制，任一端参与合即可',()=>{
 const snapshot=relationSnapshot(calendar),text=stemExplanation(snapshot,'不添加映射物。');
 assert.equal(snapshot.stems.instances.length,8);assert.equal(snapshot.stems.residual_clashes.length,0);assert.ok(snapshot.stems.suppressed_clashes.length);
 assert.match(text,/流年丙与流日辛五合|流日辛与流年丙五合/);
 assert.ok(text.indexOf('天干：')<text.indexOf('有效五合：'));assert.ok(text.indexOf('有效五合：')<text.indexOf('合后检查：'));assert.match(text,/至少一端/);assert.match(text,/剩余天干冲：无/);
});
test('无合时如实保留未解冲，不能说没有问题',()=>{
 const snapshot=relationSnapshot({...calendar,stems:[{id:'natal.year',stem:'甲'},{id:'transit.day',stem:'庚'}]});
 assert.equal(snapshot.stems.residual_clashes.length,1);assert.match(stemExplanation(snapshot,'候选仍须检查。'),/剩余天干冲：原局年干甲冲流日庚/);
});
test('命例前提只匹配本次四柱，不推广成所有寅月己土的自动算法',()=>{
 const f=confirmedFoundationCase(calendar);assert.deepEqual(f.selection_basis.pattern_stems,['丙']);assert.equal(f.assessment_source.kind,'user_case_premise');assert.equal(confirmedFoundationCase({...calendar,natal:['甲午',...calendar.natal.slice(1)]}),null);
});
test('已指定命例无需模型，新生成方案和网页均保存有序解释及来源',async()=>{
 const mapping=await generateRuleMapping({}, {today:'2026-11-03',wishes:['W01'],artStyle:'cute'},calendar,[],()=>{throw Error('不应调用模型');});
 assert.deepEqual(mapping.engine.foundation.value.selection_policy.intersections.map(x=>x.stems),[['丙'],['丙'],['丙']]);
 assert.equal(mapping.engine.foundation.origin,'confirmed_profile');assert.ok(mapping.reading.sections[3].body.startsWith('地支：'));assert.ok(mapping.reading.sections[4].body.startsWith('天干：'));assert.match(mapping.reading.sections[0].body,/本次对话指定的命例前提/);
});
