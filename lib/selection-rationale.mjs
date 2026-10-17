const STEMS='甲乙丙丁戊己庚辛壬癸';
const BRANCHES='子丑寅卯辰巳午未申酉戌亥',ANIMALS='鼠牛虎兔龙蛇马羊猴鸡狗猪';
const ELEMENTS=['木','火','土','金','水'];
const BRANCH_ELEMENT={子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水'};
const HARMONIES=['子丑','寅亥','卯戌','辰酉','巳申','午未'];
const TRINES=['申子辰','亥卯未','寅午戌','巳酉丑'];
const SEASONS=['寅卯辰','巳午未','申酉戌','亥子丑'];
const DIRECTIONS={木:'东方',火:'南方',土:'中央',金:'西方',水:'北方'};
const SOURCE={'natal.year':'原局年柱','natal.month':'原局月柱','natal.day':'原局日柱','natal.hour':'原局时柱','transit.luck':'大运','transit.year':'流年','transit.month':'流月','transit.day':'流日'};
const text=(v,max=1400)=>typeof v==='string'&&v.trim().length>=4&&v.length<=max;
const requireThat=(condition,message)=>{if(!condition)throw new Error('取用依据校验：'+message);};
const idsEqual=(a,b)=>Array.isArray(a)&&a.length===new Set(a).size&&a.length===b.length&&b.every(x=>a.includes(x));
export function evidenceContext(calendar,partners){
 const branches=calendar.natal.map((pillar,i)=>({id:['natal.year','natal.month','natal.day','natal.hour'][i],branch:pillar[1]}));
 for(const [id,pillar]of [['luck',calendar.luck],['year',calendar.year],['month',calendar.month],['day',calendar.day]])if(pillar)branches.push({id:'transit.'+id,branch:pillar[1]});
 return {day_master:calendar.dayMaster,month_branch:calendar.natal[1][1],branches,stem_match_ids:Object.fromEntries([...STEMS].map(stem=>[stem,calendar.stems.filter(s=>s.stem===partners[stem]).map(s=>s.id)])),source_names:SOURCE};
}
export function validateSelectionRationale(mapping,calendar,{partners,deities}){
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
 const fixed=Object.entries(deities).find(([,name])=>name===mapping.deity);
 if(fixed)requireThat(deity.direction===DIRECTIONS[fixed[0]],'五路财神方位必须采用项目固定版本。');
 requireThat(r.zodiac&&Array.isArray(r.zodiac.items)&&idsEqual(r.zodiac.items.map(x=>x.animal),mapping.zodiac),'生肖解释必须与画面选取完全一致。');
 if(!mapping.zodiac.length)requireThat(text(r.zodiac.reason_if_empty),'未选生肖也应说明具体取舍。');
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
    requireThat(partners[incoming]===item.stem,'优先合来冲干，不能把受保护的原局干当作来冲干。');
    requireThat(!f.tiaohou_required_stems.includes(incoming),'来冲天干为调候所需时应豁免，不能为解冲合走它。');
   }
  }
 }
 return r;
}
export function readingFromRationale(r,calendar){
 const stemName=id=>(id.startsWith('natal.')?SOURCE[id].replace('柱','干'):SOURCE[id]+'天干')+calendar.stems.find(x=>x.id===id)?.stem;
 const colors=r.colors.map(c=>`${c.name}（${c.element}，${c.role}）：${c.reason}\n作用：${c.effect}`).join('\n\n');
 const zodiac=r.zodiac.items.length?r.zodiac.items.map(x=>`${x.animal}（${x.branch}，${x.method}）：${x.reason}\n作用：${x.effect}`).join('\n\n'):r.zodiac.reason_if_empty;
 const stems=r.stems.items.length?r.stems.items.map(x=>`${x.stem} · ${x.motif}（${x.purpose}）：${x.reason}${x.match_ids.length?'\n五合对应：'+x.match_ids.map(stemName).join('、')+'。':''}\n作用：${x.effect}\n搭配依据：${x.compatibility}`).join('\n\n'):r.stems.reason_if_empty;
 return {intro:r.intro,sections:[{title:'命局与喜用：这次取用的起点',body:r.foundation.reason+'\n\n调候取用：'+r.foundation.tiaohou_reason},{title:'喜用配色：为什么这样搭配',body:colors},{title:'主尊取用：为什么选择'+r.deity.name,body:r.deity.reason+'\n\n作用：'+r.deity.effect},{title:r.zodiac.items.length?'生肖取用：地支关系与作用':'生肖取舍：今天为何不额外加入',body:zodiac},{title:r.stems.items.length?'天干意象：解冲与调候的安排':'天干取舍：今天为何不额外加入',body:stems}]};
}
export function hasDefensiveCopy(copy){
 return /(?:传统命理|命理|传统文化).{0,18}(?:一种|仅供|只是).{0,12}(?:取象|参考)|仅供参考|(?:并不|不|并非)(?:代表|表示|构成|意味).{0,35}(?:收益承诺|具体收益|现实.{0,10}(?:结果|问题|消除)|具体事件|预测)|不是对现实结果|不构成.{0,15}(?:预测|承诺)|(?:不宣称|不承诺|不保证).{0,20}(?:招财|增产|暴富|现实功效|现实结果|收益|投资|财富|事件)|尚未经人工复核|未完成人工审核/.test(copy);
}
