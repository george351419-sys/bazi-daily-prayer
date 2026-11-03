import test from 'node:test';import assert from 'node:assert/strict';
import {applyFoundationPolicy} from '../lib/foundation-policy.mjs';import {confirmedFoundationCase} from '../lib/foundation-cases.mjs';import {relationSnapshot} from '../lib/relation-explanation.mjs';import {compactArchivedSection,artworkFoundationIssues} from '../lib/reading-display.mjs';import {PRAYER_CATALOG} from '../lib/prayer-catalog.mjs';
const ids=['natal.year','natal.month','natal.day','natal.hour','transit.luck','transit.year','transit.month','transit.day'],pillars=['庚午','戊寅','己酉','壬申','辛巳','丙午','戊戌','甲午'];
const c={dayMaster:'己',natal:pillars.slice(0,4),luck:pillars[4],year:pillars[5],month:pillars[6],day:pillars[7],stems:pillars.map((p,i)=>({id:ids[i],stem:p[0]}))};
test('命例交集丙火后跳过丁火，从扶抑补戊土且说明不用花括号',()=>{
 const r=applyFoundationPolicy(confirmedFoundationCase(c));assert.equal(r.primary_element,'火');assert.equal(r.secondary_element,'土');assert.deepEqual(r.selection_policy.supplements,[{stem:'戊',element:'土',method:'扶抑'},{stem:'癸',element:'水',method:'调候'}]);assert.doesNotMatch(r.reason,/[{}]/);
});
test('三法仅一种五行时不会制造第二喜用',()=>{
 const f=confirmedFoundationCase(c);f.selection_basis.fuyi_stems=['丙','丁'];f.selection_basis.pattern_stems=['丙'];f.tiaohou_required_stems=['丙'];f.unmet_tiaohou_stems=['丙'];f.tiaohou_groups=[];
 const r=applyFoundationPolicy(f);assert.equal(r.primary_element,'火');assert.equal(r.secondary_element,'');
});
test('主尊目录与旧作品渲染均不再输出暴富速度或投资获利免责句',()=>{
 for(const entry of Object.values(PRAYER_CATALOG).flat())assert.doesNotMatch(entry.reason,/不推[导到]|不承诺必过|非现代录用保证/);
 const result=compactArchivedSection({mapping:{}},{title:'主尊取用：刘海',body:'以戏金蟾的招财趣味承接财喜愿望，不推导暴富速度。 依据 S02。'});
 assert.equal(result.body,'以戏金蟾的招财趣味承接财喜愿望。');
 const f=compactArchivedSection({mapping:{}},{title:'命局与喜用',body:'扶抑={丙、丁、戊、己}；格局={丙}；调候={丙、癸}。'});assert.doesNotMatch(f.body,/[{}]/);assert.match(f.body,/扶抑为/);
});
test('已保存长说明也按短格式渲染，不反复列每一个成员来源',()=>{
 const snapshot=relationSnapshot(c),record={calendar:c,mapping:{zodiac:[],engine:{relation_snapshot:snapshot}}};
 const result=compactArchivedSection(record,{title:'生肖取舍',body:'地支：原局年支午、原局月支寅。\n\n生肖处理：没有剩余冲刑害需要回应，因此不额外添加生肖。'});
 assert.match(result.body,/原局地支：午、寅、酉、申/);assert.match(result.body,/大运、流年、流月、流日地支：巳、午、戌、午/);assert.doesNotMatch(result.body,/原局年支|原局月支|（/);assert.match(result.body,/剩余冲刑害：无/);assert.ok(result.body.length<300);
});
test('旧规则害的记录不被排版清理冒充为新规则已解，仍标记为旧作品',()=>{
 const snapshot=relationSnapshot(c);snapshot.policy_version='2026-11-03-v3';snapshot.branches.residual_relations=[...snapshot.branches.suppressed_harms];snapshot.branches.suppressed_harms=[];
 const record={calendar:c,mapping:{zodiac:[],engine:{relation_snapshot:snapshot},branch_analysis:{policy_version:'2026-11-03-v3'}}};
 const result=compactArchivedSection(record,{title:'生肖取舍',body:'新增生肖尚未找到安全方案。'});assert.match(result.body,/剩余冲刑害：寅巳六害/);assert.ok(artworkFoundationIssues(record).some(x=>x.includes('旧版地支规则')));
});
