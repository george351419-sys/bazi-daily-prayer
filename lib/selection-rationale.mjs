const STEMS='甲乙丙丁戊己庚辛壬癸';
const BRANCHES='子丑寅卯辰巳午未申酉戌亥',ANIMALS='鼠牛虎兔龙蛇马羊猴鸡狗猪';
const ELEMENTS=['木','火','土','金','水'];
const STEM_ELEMENT=Object.fromEntries([...STEMS].map((s,i)=>[s,['木','火','土','金','水'][Math.floor(i/2)]]));
const HIDDEN={子:'癸',丑:'己癸辛',寅:'甲丙戊',卯:'乙',辰:'戊乙癸',巳:'丙戊庚',午:'丁己',未:'己丁乙',申:'庚壬戊',酉:'辛',戌:'戊辛丁',亥:'壬甲'};
const BRANCH_ELEMENT={子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水'};
const HARMONIES=['子丑','寅亥','卯戌','辰酉','巳申','午未'];
const TRINES=['申子辰','亥卯未','寅午戌','巳酉丑'];
const SEASONS=['寅卯辰','巳午未','申酉戌','亥子丑'];
const DIRECTIONS={木:'东方',火:'南方',土:'中央',金:'西方',水:'北方'};
const SOURCE={'natal.year':'原局年柱','natal.month':'原局月柱','natal.day':'原局日柱','natal.hour':'原局时柱','transit.luck':'大运','transit.year':'流年','transit.month':'流月','transit.day':'流日'};
const text=(v,max=1400)=>typeof v==='string'&&v.trim().length>=4&&v.length<=max;
const requireThat=(condition,message)=>{if(!condition)throw new Error('取用依据校验：'+message);};
const idsEqual=(a,b)=>Array.isArray(a)&&a.length===new Set(a).size&&a.length===b.length&&b.every(x=>a.includes(x));
const realDate=value=>{try{return new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}};
export function prayerHistory(history,today){
 return (Array.isArray(history)?history:[]).filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date<=today&&realDate(x.date)&&typeof x.deity==='string'&&x.deity.length>0&&x.deity.length<=40&&/^W\d{2}$/.test(x.wish)).filter((x,i,all)=>all.findIndex(y=>y.date===x.date&&y.deity===x.deity&&y.wish===x.wish)===i).sort((a,b)=>a.date.localeCompare(b.date)).slice(-14).map((x,i)=>({id:'history.'+i,date:x.date,deity:x.deity,wish:x.wish}));
}
function branchRelations(branches){
 const result=[],add=(type,items)=>result.push({type,target_ids:items.map(x=>x.id),branches:items.map(x=>x.branch)});
 for(let i=0;i<branches.length;i++)for(let j=i+1;j<branches.length;j++){
  const a=branches[i],b=branches[j],items=[a,b];
  for(const [type,pairs]of [['六合',HARMONIES],['六冲',['子午','丑未','寅申','卯酉','辰戌','巳亥']],['六害',['子未','丑午','寅巳','卯辰','申亥','酉戌']],['相刑',['子卯','寅巳','巳申','申寅','丑戌','戌未','未丑']]])if(a.branch!==b.branch&&pairs.some(pair=>pair.includes(a.branch)&&pair.includes(b.branch)))add(type,items);
  if(a.branch===b.branch&&'辰午酉亥'.includes(a.branch))add('自刑',items);
  for(let k=j+1;k<branches.length;k++){
   const tri=[a,b,branches[k]],values=tri.map(x=>x.branch);
   if(new Set(values).size!==3)continue;
   for(const [type,groups]of [['三合',TRINES],['三会',SEASONS]])if(groups.some(group=>values.every(x=>group.includes(x))))add(type,tri);
  }
 }
 return result;
}
export function evidenceContext(calendar,partners){
 const branches=calendar.natal.map((pillar,i)=>({id:['natal.year','natal.month','natal.day','natal.hour'][i],branch:pillar[1]}));
 for(const [id,pillar]of [['luck',calendar.luck],['year',calendar.year],['month',calendar.month],['day',calendar.day]])if(pillar)branches.push({id:'transit.'+id,branch:pillar[1]});
 const clash_response_options=calendar.rawStemClashes.flatMap(({a,b})=>{const natal=a.id.startsWith('natal.')?a:b,incoming=natal===a?b:a;if(!natal.id.startsWith('natal.')||!incoming.id.startsWith('transit.'))return [];return [{natal_id:natal.id,natal_stem:natal.stem,incoming_id:incoming.id,incoming_stem:incoming.stem,response_stem:partners[incoming.stem],rule:`${SOURCE[incoming.id]}${incoming.stem}冲${SOURCE[natal.id]}${natal.stem}，若来干不属本次所需调候，则优先取${partners[incoming.stem]}合${incoming.stem}。`}];});
 const cycle=['木','火','土','金','水'],dayIndex=cycle.indexOf(STEM_ELEMENT[calendar.dayMaster]);
 const roles=['比劫（同类扶助）','食伤（日主所生，泄身）','财星（日主所克，耗身）','官杀（克日主）','印星（生扶日主）'];
 const natal_stem_roles=calendar.stems.filter(x=>x.id.startsWith('natal.')).map(x=>({...x,element:STEM_ELEMENT[x.stem],relation:roles[(cycle.indexOf(STEM_ELEMENT[x.stem])-dayIndex+5)%5]}));
 const natal_hidden_stems=branches.filter(x=>x.id.startsWith('natal.')).map(x=>({...x,hidden_stems:[...HIDDEN[x.branch]],same_element_roots:[...HIDDEN[x.branch]].filter(stem=>STEM_ELEMENT[stem]===STEM_ELEMENT[calendar.dayMaster])}));
 return {branch_relations:branchRelations(branches),natal_stem_roles,natal_hidden_stems,clash_response_options,day_master:calendar.dayMaster,month_branch:calendar.natal[1][1],branches,stem_match_ids:Object.fromEntries([...STEMS].map(stem=>[stem,calendar.stems.filter(s=>s.stem===partners[stem]).map(s=>s.id)])),source_names:SOURCE};
}
export function validateSelectionRationale(mapping,calendar,{partners,deities,history=[]}){
 const r=mapping.rationale,c=evidenceContext(calendar,partners);
 requireThat(r&&text(r.intro,700),'缺少取用解读导语。');
 const f=r.foundation;
 requireThat(f?.day_master===c.day_master&&f.month_branch===c.month_branch,'日主、月令必须与历法一致。');
 requireThat(f.primary_element===mapping.primary_element&&(f.secondary_element||'')===(mapping.secondary_element||''),'解读的主辅喜用必须与主辅色一致。');
 requireThat(text(f.reason,2200)&&text(f.tiaohou_reason,1500),'请解释月令、根气、扶抑与调候取用，不能只报五行名。');
 requireThat(Array.isArray(f.tiaohou_required_stems)&&f.tiaohou_required_stems.every(s=>STEMS.includes(s)&&s.length===1),'调候所需必须列出具体天干。');
 requireThat(Array.isArray(r.colors)&&r.colors.length===mapping.colors.length,'每个已选颜色都需要说明五行、位置、理由和作用。');
 const colorNames=new Set();
 for(const color of r.colors){
  requireThat(mapping.colors.some(x=>x.name===color.name)&&!colorNames.has(color.name),'配色解释必须逐一对应实际色板。');colorNames.add(color.name);
  requireThat([...ELEMENTS,'中性','造像固有色'].includes(color.element)&&['主色','辅色','点缀','造像固有色'].includes(color.role)&&text(color.reason)&&text(color.effect),'颜色须有五行定位、画面角色、取用理由和作用。');
  if(color.role==='主色')requireThat(color.element===mapping.primary_element,'主色必须对应本次主喜用。');
  if(color.role==='辅色'&&color.element!=='中性'&&color.element!=='造像固有色')requireThat([mapping.primary_element,mapping.secondary_element].includes(color.element),'五行辅色须有主辅喜用依据；审美辅色请标中性。');
 }
 requireThat(r.colors.some(x=>x.role==='主色'),'请明确实际使用的主色。');
 const deity=r.deity;
 requireThat(deity?.name===mapping.deity&&deity.wish_id===mapping.wish_id&&text(deity.reason)&&text(deity.effect),'主尊理由必须对应实际主尊与已选主愿。');
 requireThat(text(deity.today_reason),'主尊须结合今日岁运、喜用与愿望说明适配理由。');
 requireThat(idsEqual(deity.history_refs,history.map(x=>x.id)),'主尊历史引用须与实际近期记录完整对应，不能虚构或漏用。');
 if(history.length)requireThat(text(deity.diversity_reason),'有历史时须解释近期多样性与今日延续或轮换的取舍。');
 const fixed=Object.entries(deities).find(([,name])=>name===mapping.deity);
 if(fixed)requireThat(deity.direction===DIRECTIONS[fixed[0]],'五路财神方位必须采用项目固定版本。');
 requireThat(r.zodiac&&Array.isArray(r.zodiac.items)&&idsEqual(r.zodiac.items.map(x=>x.animal),mapping.zodiac),'生肖解释必须与画面选取完全一致。');
 if(!mapping.zodiac.length){
  requireThat(idsEqual(r.zodiac.existing_branch_ids,c.branches.map(x=>x.id))&&text(r.zodiac.existing_analysis),'不加生肖时须分析原局及大运、流年、流月、流日的真实地支组合。');
  requireThat(Array.isArray(r.zodiac.existing_relations),'不加生肖时须列出所分析的已有地支关系，无关系则空。');
  requireThat(!c.branch_relations.length||r.zodiac.existing_relations.length>0,'已有合冲刑害关系时不能只以画面简洁为由略过地支分析。');
  const seen=new Set();
  for(const relation of r.zodiac.existing_relations){
   const key=relation.type+':'+[...(relation.target_ids||[])].sort().join(',');
   requireThat(!seen.has(key)&&c.branch_relations.some(x=>x.type===relation.type&&idsEqual(relation.target_ids,x.target_ids))&&text(relation.interpretation),'已有地支关系须有真实配对及其喜用影响说明，不能虚构合冲刑害。');seen.add(key);
  }
  const zodiacCopy=[r.zodiac.existing_analysis,r.zodiac.reason_if_empty,...r.zodiac.existing_relations.map(x=>x.interpretation)].join('\n');
  requireThat(!/(?:以|用|通过).{0,20}天干.{0,30}(?:回应|缓解|化解|解冲|疏解)/.test(zodiacCopy),'天干五合意象不能替代地支层调整；不加生肖的依据必须独立说明已有地支与新增生肖的收益和代价。');
  requireThat(text(r.zodiac.reason_if_empty)&&/(?:喜用|用神|合|冲|刑|害|调候|生扶|耗泄)/.test(r.zodiac.reason_if_empty),'不加生肖须说明命理上的调整收益与代价，不能仅以视觉简洁作答。');
 }
 const branchById=new Map(c.branches.map(x=>[x.id,x.branch]));
 for(const item of r.zodiac.items){
  const branch=BRANCHES[ANIMALS.indexOf(item.animal)];
  requireThat(item.branch===branch&&text(item.reason)&&text(item.effect),'生肖、地支、取用理由与作用必须对应。');
  requireThat(Array.isArray(item.target_ids)&&item.target_ids.length===new Set(item.target_ids).size&&item.target_ids.every(id=>branchById.has(id)),'生肖关联对象必须来自真实四柱与运年月日。');
  const actual=item.target_ids.map(id=>branchById.get(id));
  if(item.method==='六合取象')requireThat(actual.length===1&&HARMONIES.some(pair=>pair.includes(branch)&&pair.includes(actual[0])&&branch!==actual[0]),'所述六合配对不成立。');
  else if(item.method==='三合取象'||item.method==='三会取象')requireThat(actual.length===2&&new Set([branch,...actual]).size===3&&(item.method==='三合取象'?TRINES:SEASONS).some(group=>[branch,...actual].every(b=>group.includes(b))),'所述三合/三会成员不成立。');
  else if(item.method==='五行取象')requireThat([mapping.primary_element,mapping.secondary_element].includes(BRANCH_ELEMENT[branch]),'生肖本气五行须与本次主辅喜用相符。');
  else requireThat(false,'生肖方法只能是六合取象、三合取象、三会取象或五行取象。');
 }
 requireThat(r.stems&&Array.isArray(r.stems.items)&&idsEqual(r.stems.items.map(x=>x.stem),mapping.stem_symbols.map(x=>x.stem)),'天干解释必须与画面新增天干一一对应。');
 if(!mapping.stem_symbols.length)requireThat(text(r.stems.reason_if_empty),'未加天干意象应说明取舍，不能虚构画外元素。');
 const stemById=new Map(calendar.stems.map(x=>[x.id,x.stem]));
 for(const item of r.stems.items){
  requireThat(mapping.stem_symbols.some(x=>x.stem===item.stem&&x.motif===item.motif)&&text(item.reason)&&text(item.effect)&&text(item.compatibility),'每个天干意象须说明目的、理由、作用与结构相容性。');
  requireThat(['解冲','调候','解冲兼调候'].includes(item.purpose),'天干意象须区分解冲与调候。');
  requireThat(idsEqual(item.match_ids,c.stem_match_ids[item.stem]),'新增天干按无限份规则覆盖全部已有五合对象，不得漏列或虚构。');
  if(item.purpose.includes('调候'))requireThat(f.tiaohou_required_stems.includes(item.stem),'调候意象必须是本次明确所需的具体天干。');
  if(item.purpose.includes('解冲')){
   requireThat(Array.isArray(item.clash_targets)&&item.clash_targets.length>0,'解冲必须有实际的原局受冲与来冲对象。');
   for(const target of item.clash_targets){
    requireThat(target.natal_id?.startsWith('natal.')&&target.incoming_id?.startsWith('transit.'),'须区分原局被冲天干与动态来干。');
    requireThat(calendar.rawStemClashes.some(({a,b})=>[a.id,b.id].includes(target.natal_id)&&[a.id,b.id].includes(target.incoming_id)),'所述天干相冲在真实排盘中不存在。');
    const incoming=stemById.get(target.incoming_id);
    requireThat(partners[incoming]===item.stem,`优先合来冲干：${SOURCE[target.incoming_id]}${incoming}冲原局${stemById.get(target.natal_id)}时，应取${partners[incoming]}合${incoming}，不是${item.stem}合原局干。须重选意象或放弃该方案。`);
    requireThat(!f.tiaohou_required_stems.includes(incoming),'来冲天干为调候所需时应豁免，不能为解冲合走它。');
   }
  }
 }
 return r;
}
const consumerCopy=s=>s.replace(/W\d{2}(?=[\u4e00-\u9fff])/g,'').replace(/冷启动无历史(?:展示)?[，,]?/g,'').replace(/不涉及轮换让位[，,。；]?/g,'').replace(/按新增干无限份(?:规则)?处理/g,'同时回应').replace(/本项目/g,'本次');
export function readingFromRationale(r,calendar,history=[]){
 const stemName=id=>(id.startsWith('natal.')?SOURCE[id].replace('柱','干'):SOURCE[id]+'天干')+calendar.stems.find(x=>x.id===id)?.stem;
 const colors=r.colors.map(c=>`${c.name}（${c.element}，${c.role}）：${c.reason}\n作用：${c.effect}`).join('\n\n');
 const knownBranches=new Map(evidenceContext(calendar,{}).branches.map(x=>[x.id,x.branch]));
 const branchName=id=>SOURCE[id].replace('柱','支')+knownBranches.get(id);
 const existing=!r.zodiac.items.length?[r.zodiac.existing_analysis,...r.zodiac.existing_relations.map(x=>x.target_ids.map(branchName).join('、')+'（'+x.type+'）：'+x.interpretation),'不另加生肖的依据：'+r.zodiac.reason_if_empty].join('\n\n'):'';
 const historyText=history.length?'\n\n近期祈福记录：'+history.map(x=>x.date+' '+x.deity).join('；')+'。\n今日适配：'+r.deity.today_reason+'\n多样性取舍：'+r.deity.diversity_reason:'\n\n今日适配：'+r.deity.today_reason;
 const zodiac=r.zodiac.items.length?r.zodiac.items.map(x=>`${x.animal}（${x.branch}，${x.method}）：${x.reason}\n作用：${x.effect}`).join('\n\n'):existing;
 const stems=r.stems.items.length?r.stems.items.map(x=>`${x.stem} · ${x.motif}（${x.purpose}）：${x.reason}${x.match_ids.length?'\n五合对应：'+x.match_ids.map(stemName).join('、')+'。':''}\n作用：${x.effect}\n搭配依据：${x.compatibility}`).join('\n\n'):r.stems.reason_if_empty;
 return {intro:consumerCopy(r.intro),sections:[{title:'命局与喜用：这次取用的起点',body:r.foundation.reason+'\n\n调候取用：'+r.foundation.tiaohou_reason},{title:'喜用配色：为什么这样搭配',body:colors},{title:'主尊取用：为什么选择'+r.deity.name,body:r.deity.reason+historyText+'\n\n作用：'+r.deity.effect},{title:r.zodiac.items.length?'生肖取用：地支关系与作用':'生肖取舍：今天为何不额外加入',body:zodiac},{title:r.stems.items.length?'天干意象：解冲与调候的安排':'天干取舍：今天为何不额外加入',body:stems}].map(section=>({...section,body:consumerCopy(section.body)}))};
}
export function hasDefensiveCopy(copy){
 return /(?:传统命理|命理|传统文化).{0,18}(?:一种|仅供|只是).{0,12}(?:取象|参考)|仅供参考|(?:并不|不|并非)(?:代表|表示|构成|意味).{0,35}(?:收益承诺|具体收益|现实.{0,10}(?:结果|问题|消除)|具体事件|预测)|不是对现实结果|不构成.{0,15}(?:预测|承诺)|(?:不宣称|不承诺|不保证).{0,20}(?:招财|增产|暴富|现实功效|现实结果|收益|投资|财富|事件)|尚未经人工复核|未完成人工审核/.test(copy);
}

export function repairHints(mapping,calendar,partners){
 const context=evidenceContext(calendar,partners),hints=[];
 const list=mapping?.rationale?.foundation?.tiaohou_required_stems;const required=Array.isArray(list)?list:[];
 const items=mapping?.rationale?.stems?.items;
 for(const item of Array.isArray(items)?items:[]){
  if(!item||typeof item!=='object')continue;
  if(item.purpose?.includes('调候')&&!required.includes(item.stem))hints.push(`此前把${item.stem}写成调候意象，但所列调候天干只有${required.join('、')||'空列表'}。先核定真正需要的具体干，再同步新增意象；不需要则删除该意象及相关画面描述。`);
  for(const target of item.clash_targets||[]){const option=context.clash_response_options.find(x=>x.natal_id===target.natal_id&&x.incoming_id===target.incoming_id);if(option&&option.response_stem!==item.stem)hints.push(option.rule+`此前${item.stem}的方案合错对象，请整体重选。`);}
 }
 return hints;
}
