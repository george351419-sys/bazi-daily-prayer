export const FOUNDATION_POLICY_VERSION='2026-11-04-foundation-fgt-v6';
const STEMS='甲乙丙丁戊己庚辛壬癸',ELEMENTS=['木','火','土','金','水'];
export const elementOf=s=>ELEMENTS[Math.floor(STEMS.indexOf(s)/2)];
const fail=message=>{throw Object.assign(new Error(message),{code:'rule_assessment_invalid',ruleSection:'foundation'});};
const list=(value,name)=>{if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(s=>typeof s!=='string'||s.length!==1||!STEMS.includes(s)))fail(name+'须列出不重复的具体天干。');return value;};
export function foundationAudit(f){
 if(!f)return [];
 const issues=[],basis=f.selection_basis,reason=String(f.reason||''),special=basis?.structure==='special'||(!basis&&/(?:采用|按|属于|已成立)(?:从强|从弱|从财|从杀|专旺|化气|从格)/.test(reason));
 const weak=basis?.strength==='weak'||(!basis&&/身弱|偏弱|较弱/.test(reason));
 if(weak&&!special&&!basis&&typeof f.day_master==='string'&&f.day_master.length===1&&STEMS.includes(f.day_master)){const index=ELEMENTS.indexOf(elementOf(f.day_master)),allowed=[ELEMENTS[(index+4)%5],ELEMENTS[index]];
  for(const [key,name]of [['primary_element','主喜用'],['secondary_element','次喜用']])if(f[key]&&!allowed.includes(f[key]))issues.push('普通身弱扶抑应先取'+allowed.join('、')+'，归档'+name+'却为'+f[key]+'。');
 }
 if(!basis)for(const match of reason.matchAll(/([木火土金水])为辅/g))if(f.secondary_element&&match[1]!==f.secondary_element)issues.push('依据写'+match[1]+'为辅，但结构化次喜用为'+f.secondary_element+'。');
 return [...new Set(issues)];
}
export function applyFoundationPolicy(f,{required=false}={}){
 const b=f.selection_basis;
 if(!b){if(required)fail('首次原局补判必须分别提供扶抑、格局、调候候选，不能只给主次五行。');const issues=foundationAudit(f);if(issues.length)fail(issues.join(''));return f;}
 if(!['ordinary','special'].includes(b.structure)||!['weak','strong','balanced'].includes(b.strength))fail('须明确普通/特殊格及原局强弱，未确定时不能启动绘图。');
 if(b.structure==='special'&&(typeof b.structure_reason!=='string'||b.structure_reason.trim().length<8))fail('特殊格必须有独立成立依据，不能绕过普通扶抑约束。');
 if(required&&[b.fuyi_reason,b.pattern_reason,f.tiaohou_reason].some(x=>typeof x!=='string'||x.trim().length<4||x.length>350))fail('扶抑、格局、调候须分别给出简短具体依据，各不超过350字。');
 if(b.fuyi_exclusions!==undefined&&(!Array.isArray(b.fuyi_exclusions)||b.fuyi_exclusions.some(x=>!x||typeof x.stem!=='string'||x.stem.length!==1||!STEMS.includes(x.stem)||typeof x.reason!=='string'||x.reason.length>350)))fail('fuyi_exclusions须逐项提供天干stem和具体排除理由reason，各不超过350字。');
 const F=list(b.fuyi_stems,'扶抑候选'),G=list(b.pattern_stems,'格局辅助候选'),T=list(f.tiaohou_required_stems,'调候候选');if(!F.length&&!G.length&&!T.length)fail('三法候选均为空，不能生成喜用。');
 if(b.structure==='ordinary'&&b.strength==='weak'){
  const own=ELEMENTS.indexOf(elementOf(f.day_master)),allowed=[ELEMENTS[(own+4)%5],ELEMENTS[own]];
  if(F.some(s=>!allowed.includes(elementOf(s))))fail('普通身弱的扶抑候选须先取印比：'+allowed.join('、')+'；格局或调候不能扩充扶抑集合。');
 }
 const groups=Array.isArray(f.tiaohou_groups)?f.tiaohou_groups:[];
 const unmet=Array.isArray(f.unmet_tiaohou_stems)?f.unmet_tiaohou_stems:[];
 if(groups.some(g=>!Array.isArray(g)||g.some(s=>!T.includes(s))))fail('调候并用组合必须来自明确的调候天干。');
 // Climate pair fulfilment constrains adding motifs, not membership of the natal T set.
 const incompleteGroups=groups.filter(g=>g.some(s=>unmet.includes(s)));
 const tiers=[F.filter(s=>G.includes(s)&&T.includes(s)),F.filter(s=>G.includes(s)),F.filter(s=>T.includes(s)),T.filter(s=>G.includes(s)),F,G,T];
 const labels=['扶抑、格局、调候三者交集','扶抑∩格局','扶抑∩调候','调候∩格局','扶抑','格局','调候'];
 const ordered=[...new Set(tiers.flat())],tier=stem=>tiers.findIndex(g=>g.includes(stem));
 const rankedElements=[...new Set(ordered.map(elementOf))],selected=rankedElements.slice(0,3),[primary,secondary='',tertiary='']=selected;
 const supplements=selected.map(element=>{const stem=ordered.find(s=>elementOf(s)===element);return {stem,element,method:labels[tier(stem)],tier:tier(stem)};}).filter(x=>x.tier>=4).map(({tier,...item})=>item);
 const fallback=tiers.slice(0,4).every(g=>!g.length);
 const fuyiPool=b.structure==='ordinary'&&b.strength==='weak'?[...STEMS].filter(s=>[elementOf(f.day_master),ELEMENTS[(ELEMENTS.indexOf(elementOf(f.day_master))+4)%5]].includes(elementOf(s))):[];
 const result={...f,fuyi_pool:fuyiPool,primary_element:primary,secondary_element:secondary,tertiary_element:tertiary,ranked_elements:rankedElements,favorable_elements:selected,selection_policy:{version:FOUNDATION_POLICY_VERSION,ordered_stems:ordered,element_order:rankedElements,selected_elements:selected,supplements,supplement_used:supplements.length>0,fallback_used:fallback,fallback_order:fallback?['扶抑','格局','调候']:[],intersections:tiers.slice(0,4).map((stems,i)=>({source:labels[i],stems})),tiers:ordered.map(stem=>({stem,tier:tier(stem),source:labels[tier(stem)]})),excluded_stems:[],incomplete_tiaohou_groups:incompleteGroups}};
 if(b.fuyi_reason&&b.pattern_reason){
  result.model_reason=f.model_reason||f.reason;
  const selection=(fallback?'交集均为空，回退扶抑→格局→调候；':'')+'主取'+primary+(secondary?'、次取'+secondary:'')+(tertiary?'、第三取'+tertiary:'；现有有效候选不足三种五行，暂缺'+(secondary?'第三喜用':'次喜用和第三喜用'))+'。';
  result.reason=[
   '候选来源：'+(f.assessment_source?.label||'已保存的取用档案；首次无确认档案时由模型补判')+'。',
   '候选取用：扶抑为'+(F.join('、')||'无')+'；格局为'+(G.join('、')||'无')+'；调候为'+(T.join('、')||'无')+'。',
   ...(fuyiPool.length?['印比基础候选：'+fuyiPool.join('、')+'，未取的干需另列具体排除依据。']:[]),
   ...((b.fuyi_exclusions||[]).filter(x=>typeof x?.reason==='string'&&!F.includes(x.stem)).length?['扶抑排除：'+b.fuyi_exclusions.filter(x=>typeof x?.reason==='string'&&!F.includes(x.stem)).map(x=>x.stem+'，'+x.reason).join('；')+'。']:[]),
   '扶抑：'+b.fuyi_reason,'格局：'+b.pattern_reason,'调候：'+f.tiaohou_reason,
   '取用优先级：先看三者交集，再依次看扶抑与格局、扶抑与调候、调候与格局，最后看单独扶抑、格局、调候。',
   '天干取用排序：'+ordered.join('、')+'。',
   '喜用五行排序：'+rankedElements.join('、')+'。同一五行只占一个顺位。',
   '最终取用：'+selection,
   ...(incompleteGroups.length?['调候并用状态：'+incompleteGroups.map(g=>g.join('、')).join('；')+'在原局尚有缺项；此状态不改变上面的候选交集，是否添加景物另行核查。']:[])
  ].join('\n\n');
 }
 const review=result.cross_check;if(review){const names={weak:'偏弱',strong:'偏强',balanced:'中和'};result.reason+='\n\n复核：'+(review.status==='confirmed_premise'?'本次采用已确认的用户前提。':review.status==='agreed'?'格局方向及数值强弱的基础校验未提示差异。':'触发复判的差异为'+review.initial_checks.conflicts.map(x=>x.section==='pattern'?'格局顺逆用方向':x.section==='fuyi_coverage'?'扶抑候选完整性':'原局强弱').join('、')+'。数值校验为'+names[review.initial_checks.strength.strength]+'，模型初判为'+names[review.initial.selection_basis.strength]+'；已反馈具体差异，最终采用模型第二次结论'+names[result.selection_basis.strength]+'。复判依据：'+result.review_reason.replace(/。$/,'')+'。'+(review.final_checks.conflicts.length?'仍有校验差异，已保留记录。':''));}
 const issues=foundationAudit(result);if(issues.length)fail(issues.join(''));
 return result;
}
