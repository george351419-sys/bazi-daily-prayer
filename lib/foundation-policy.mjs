export const FOUNDATION_POLICY_VERSION='2026-11-03-foundation-fgt-v1';
const STEMS='甲乙丙丁戊己庚辛壬癸',ELEMENTS=['木','火','土','金','水'];
export const elementOf=s=>ELEMENTS[Math.floor(STEMS.indexOf(s)/2)];
const fail=message=>{throw Object.assign(new Error(message),{code:'rule_assessment_invalid',ruleSection:'foundation'});};
const list=(value,name)=>{if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(s=>typeof s!=='string'||s.length!==1||!STEMS.includes(s)))fail(name+'须列出不重复的具体天干。');return value;};
export function foundationAudit(f){
 if(!f)return [];
 const issues=[],basis=f.selection_basis,reason=String(f.reason||''),special=basis?.structure==='special'||(!basis&&/(?:采用|按|属于|已成立)(?:从强|从弱|从财|从杀|专旺|化气|从格)/.test(reason));
 const weak=basis?.strength==='weak'||(!basis&&/身弱|偏弱|较弱/.test(reason));
 if(weak&&!special&&typeof f.day_master==='string'&&f.day_master.length===1&&STEMS.includes(f.day_master)){const index=ELEMENTS.indexOf(elementOf(f.day_master)),allowed=[ELEMENTS[(index+4)%5],ELEMENTS[index]];
  for(const [key,name]of [['primary_element','主喜用'],['secondary_element','次喜用']])if(f[key]&&!allowed.includes(f[key]))issues.push('普通身弱扶抑应先取'+allowed.join('、')+'，归档'+name+'却为'+f[key]+'。');
 }
 for(const match of reason.matchAll(/([木火土金水])为辅/g))if(f.secondary_element&&match[1]!==f.secondary_element)issues.push('依据写'+match[1]+'为辅，但结构化次喜用为'+f.secondary_element+'。');
 return [...new Set(issues)];
}
export function applyFoundationPolicy(f,{required=false}={}){
 const b=f.selection_basis;
 if(!b){if(required)fail('首次原局补判必须分别提供扶抑、格局、调候候选，不能只给主次五行。');const issues=foundationAudit(f);if(issues.length)fail(issues.join(''));return f;}
 if(!['ordinary','special'].includes(b.structure)||!['weak','strong','balanced'].includes(b.strength))fail('须明确普通/特殊格及原局强弱，未确定时不能启动绘图。');
 if(b.structure==='special'&&(typeof b.structure_reason!=='string'||b.structure_reason.trim().length<8))fail('特殊格必须有独立成立依据，不能绕过普通扶抑约束。');
 if(required&&[b.fuyi_reason,b.pattern_reason,f.tiaohou_reason].some(x=>typeof x!=='string'||x.trim().length<4||x.length>350))fail('扶抑、格局、调候须分别给出简短具体依据，各不超过350字。');
 const F=list(b.fuyi_stems,'扶抑候选'),G=list(b.pattern_stems,'格局辅助候选'),T=list(f.tiaohou_required_stems,'调候候选');if(!F.length)fail('扶抑候选未确定，不能凭格局或调候选配色。');
 if(b.structure==='ordinary'&&b.strength==='weak'){
  const own=ELEMENTS.indexOf(elementOf(f.day_master)),allowed=[ELEMENTS[(own+4)%5],ELEMENTS[own]];
  if(F.some(s=>!allowed.includes(elementOf(s))))fail('普通身弱的扶抑候选须先取印比：'+allowed.join('、')+'；格局或调候不能扩充扶抑集合。');
 }
 const groups=Array.isArray(f.tiaohou_groups)?f.tiaohou_groups:[];
 const unmet=Array.isArray(f.unmet_tiaohou_stems)?f.unmet_tiaohou_stems:[];
 if(groups.some(g=>!Array.isArray(g)||g.some(s=>!T.includes(s))))fail('调候并用组合必须来自明确的调候天干。');
 const blockedGroups=groups.filter(g=>g.some(s=>unmet.includes(s)&&!F.includes(s)));
 const effectiveT=T.filter(s=>!blockedGroups.some(g=>g.includes(s)));
 const tier=s=>G.includes(s)&&effectiveT.includes(s)?0:G.includes(s)?1:effectiveT.includes(s)?2:3;
 const ordered=[...F].sort((a,b)=>tier(a)-tier(b)||F.indexOf(a)-F.indexOf(b));
 const rankedElements=[...new Set(ordered.map(elementOf))],primary=rankedElements[0],secondary=rankedElements[1]||'';
 const result={...f,primary_element:primary,secondary_element:secondary,selection_policy:{version:FOUNDATION_POLICY_VERSION,ordered_stems:ordered,tiers:ordered.map(stem=>({stem,tier:tier(stem)})),excluded_stems:[...new Set([...G,...T])].filter(s=>!F.includes(s)),incomplete_tiaohou_groups:blockedGroups}};
 if(b.fuyi_reason&&b.pattern_reason){result.model_reason=f.model_reason||f.reason;result.reason='扶抑：'+b.fuyi_reason+'\n\n格局：'+b.pattern_reason+'\n\n调候：'+f.tiaohou_reason+'\n\n最终取用：先守扶抑候选，再按与格局、调候的共同适配排序，主取'+primary+(secondary?'、次取'+secondary:'；没有独立次喜用，不另造第二项')+'。';}
 const issues=foundationAudit(result);if(issues.length)fail(issues.join(''));
 return result;
}
