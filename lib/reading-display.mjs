import {cleanDeityCopy} from './prayer-catalog.mjs';
import {relationSnapshot,branchExplanation,stemExplanation} from './relation-explanation.mjs';
import {confirmedFoundationCase} from './foundation-cases.mjs';
import {BRANCH_POLICY_VERSION} from './branch-policy.mjs';
import {foundationAudit,applyFoundationPolicy} from './foundation-policy.mjs';
const STEMS='甲乙丙丁戊己庚辛壬癸',BRANCHES='子丑寅卯辰巳午未申酉戌亥',ANIMALS='鼠牛虎兔龙蛇马羊猴鸡狗猪';
const PARTNER={甲:'己',己:'甲',乙:'庚',庚:'乙',丙:'辛',辛:'丙',丁:'壬',壬:'丁',戊:'癸',癸:'戊'};
const MOTIF={甲:'乔木',乙:'藤蔓柔枝',丙:'日光',丁:'灯火',戊:'山岩',己:'田园',庚:'金属几何纹',辛:'珠玉',壬:'连续水流',癸:'雨露'};
const SOURCE={'natal.year':'原局年','natal.month':'原局月','natal.day':'原局日','natal.hour':'原局时','transit.luck':'大运','transit.year':'流年','transit.month':'流月','transit.day':'流日'};
const brief=r=>(r.type==='自刑'?[...(r.branches||[])]:[...new Set(r.branches||[])]).sort((a,b)=>BRANCHES.indexOf(a)-BRANCHES.indexOf(b)).join('')+r.type;
export function archivedFoundation(record){const m=record.mapping||{};return m.engine?.foundation?.value||m.rationale?.foundation||{day_master:record.calendar?.dayMaster||m.birth_summary?.pillars?.[2]?.[0],primary_element:m.primary_element,secondary_element:m.secondary_element,reason:m.reading?.sections?.find(s=>/命局|生辰/.test(s.title||''))?.body||''};}
export function artworkFoundationIssues(record){
 const m=record.mapping||{};if(m.content_mode==='wish-art'||record.source==='upload')return [];
 const f=archivedFoundation(record),issues=foundationAudit(f);
 const confirmed=record.calendar?.natal?confirmedFoundationCase(record.calendar):null;
 if(confirmed&&f.selection_basis&&JSON.stringify([f.selection_basis.fuyi_stems,f.selection_basis.pattern_stems,f.tiaohou_required_stems])!==JSON.stringify([confirmed.selection_basis.fuyi_stems,confirmed.selection_basis.pattern_stems,confirmed.tiaohou_required_stems]))issues.push('这幅旧画的三法候选与本次用户指定命例前提不同，请重新计算方案。');
 if(m.branch_analysis?.policy_version&&m.branch_analysis.policy_version!==BRANCH_POLICY_VERSION)issues.push('这幅作品使用旧版地支规则，尚未采用本次确认的有效合解冲刑害口径。');
 if(f.primary_element&&m.primary_element!==f.primary_element)issues.push('画面主色取向与归档原局主喜用不一致。');
 if((m.secondary_element||'')!==(f.secondary_element||''))issues.push('画面辅色取向与归档原局次喜用不一致。');
 if(f.selection_basis)try{const expected=applyFoundationPolicy(f);if(m.primary_element!==expected.primary_element||(m.secondary_element||'')!==expected.secondary_element)issues.push('当前主辅色未遵循交集优先、不足时按扶抑、格局、调候补足主次的排序。');}catch(e){issues.push(e.message);}
 return [...new Set(issues)];
}
function zodiacText(record,fallback){
 const m=record.mapping||{},allocations=m.engine?.zodiac_allocations||m.branch_analysis?.alternatives||[];
 if(!Array.isArray(allocations)||!allocations.length)return fallback.split('不另加生肖的依据：').at(-1).trim();
 const relations=allocations.flatMap(x=>x.bindings||[]);
 if(m.zodiac?.length){return m.zodiac.map(animal=>{const branch=BRANCHES[ANIMALS.indexOf(animal)],relation=relations.find(r=>r.target_ids?.includes('symbolic.'+branch));return relation?'取'+animal+'（'+branch+'）与'+relation.branches.filter(b=>b!==branch).join('、')+'组成'+brief(relation)+'。':animal+'：'+fallback;}).join('\n');}
 const existing=[...new Set(allocations.flatMap(x=>x.effective_bindings||x.bindings||[]).map(brief))],residual=[...new Set(allocations.flatMap(a=>a.residual_relations||[]).map(brief))];
 const released=[...new Set(allocations.flatMap(x=>x.suppressed_punishments||[]).map(brief))];
 return (existing.length?'已有'+existing.slice(0,3).join('、')+'，无需再补这些组合的成员。':'当前没有需要补足的既有会合。')+(released.length?'参与有效合的具体地支已解除涉及它们的'+released.join('、')+'。':'')+(residual.length?'仍有'+residual.slice(0,2).join('、')+'尚未解除；本次新增生肖未找到能改善这些关系、同时不新增刑害或破坏有利合的组合，因此不添加。':'没有剩余冲刑害需要回应，因此不添加生肖。');
}
function stemText(record,fallback){
 const m=record.mapping||{};if(m.stem_symbols?.length)return fallback;
 if(m.engine?.stem_decisions?.none_reason)return m.engine.stem_decisions.none_reason;
 const f=archivedFoundation(record),visible=record.calendar?.stems||[],blocked=m.engine?.unresolved_stem_clashes||[];
 const clashes=(a,b)=>a!==b&&['甲庚','乙辛','丙壬','丁癸'].some(pair=>pair.includes(a)&&pair.includes(b));
 const result=blocked.map(target=>{const s=target.response_stem,reasons=[];for(const item of visible){const name=(SOURCE[item.id]||'归档')+'干'+item.stem;if(clashes(s,item.stem))reasons.push('会冲'+name);if(PARTNER[s]===item.stem&&[...(f.protected_stems||[]),...(f.tiaohou_required_stems||[])].includes(item.stem))reasons.push('会合住'+name+'，而'+item.stem+((f.tiaohou_required_stems||[]).includes(item.stem)?'是所需调候用干':'是结构关键用干'));}return reasons.length?'来干'+target.incoming_stem+'冲原局'+target.natal_stem+'，候选'+s+'（'+MOTIF[s]+'）本可合'+target.incoming_stem+'；但'+reasons.join('；')+'，所以不添加。':'';}).filter(Boolean);
 if(result.length)return [...new Set(result)].join('\n');
 if(/没有通过保护条件|候选会触及调候或关键用干/.test(fallback))return '这幅旧作品未保存具体排除项，无法可靠说明是哪一项条件阻止了添加。请用修正后的规则重新生成方案。';
 return fallback;
}
export function compactArchivedSection(record,section){
 const m=record.mapping||{},calendar=record.calendar;
 const snapshot=m.engine?.relation_snapshot||(calendar?.natal?.length===4&&Array.isArray(calendar.stems)&&m.branch_analysis?.policy_version===BRANCH_POLICY_VERSION?relationSnapshot(calendar):null);
 if(/生肖/.test(section.title)){
  const decision=section.body.includes('\n\n生肖处理：')?section.body.split('\n\n生肖处理：').at(-1):zodiacText(record,section.body);
  return {...section,body:snapshot?branchExplanation(snapshot,decision,{hasZodiac:!!m.zodiac?.length}):decision};
 }
 if(/天干/.test(section.title))return {...section,body:section.body.startsWith('天干：')?section.body:snapshot?stemExplanation(snapshot,stemText(record,section.body)):stemText(record,section.body)};
 if(/命局|生辰/.test(section.title))return {...section,body:section.body.split('\n\n调候取用：')[0].replace(/(扶抑|格局|调候)=\{([^}]*)\}/g,'$1为$2').replace(/[{}]/g,'')};
 if(/主尊/.test(section.title))return {...section,body:cleanDeityCopy(section.body)};
 return {...section,body:section.body.replace(/依据\s*S\d+[。]?/g,'')};
}
