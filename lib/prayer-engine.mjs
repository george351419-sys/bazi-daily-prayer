import {createHash} from 'node:crypto';
import {WISHES,STEM_PARTNER,DIRECTIONS,VALID_DEITIES,validateMapping,selectionHistory} from './domain.mjs';
import {evidenceContext,hasDefensiveCopy} from './selection-rationale.mjs';
import {branchRelations,allocateBindings,relationKey,BRANCH_POLICY} from './branch-policy.mjs';
import {PRAYER_CATALOG,CATALOG_VERSION} from './prayer-catalog.mjs';
import {deepseek} from './providers.mjs';
import {accountRepository,accountsEnabled} from './account-store.mjs';
import {artDirection,ART_STYLE_VERSION} from './art-styles.mjs';
import {birthSummary} from './consumer-reading.mjs';
export const PRAYER_ENGINE_VERSION='2026-11-01-rules-v2';
const elements=['木','火','土','金','水'],stems='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥',animals='鼠牛虎兔龙蛇马羊猴鸡狗猪';
const stemElement=s=>elements[Math.floor(stems.indexOf(s)/2)];
const motif=Object.fromEntries([...stems].map((s,i)=>[s,['乔木','藤蔓柔枝','日光','灯火','山岩','田园','金属几何纹','珠玉','连续水流','雨露'][i]]));
const palette={木:['绿','#00FF00'],火:['红','#FF0000'],土:['黄','#FFFF00'],金:['白','#FFFFFF'],水:['蓝','#0000FF']};
const source={'natal.year':'原局年支','natal.month':'原局月支','natal.day':'原局日支','natal.hour':'原局时支','transit.luck':'大运','transit.year':'流年','transit.month':'流月','transit.day':'流日'};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const prose=x=>typeof x==='string'&&x.trim().length>=4&&x.length<=2200&&!hasDefensiveCopy(x)&&!/(?:natal\.|transit\.|JSON|F\/G\/T)/.test(x);
const insist=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'rule_assessment_invalid'});};
const memory=new Map();
function storeFor(config){
 if(config.PRAYER_RULE_STORE)return config.PRAYER_RULE_STORE;
 if(config.ENGINE_OWNER_ID&&accountsEnabled(config))return accountRepository(config);
 // Anonymous assessments stay in process, scoped to the browser session by the gateway.
 return {get:async k=>memory.get(k)||null,put:async(k,v)=>{if(memory.size>=256)memory.delete(memory.keys().next().value);memory.set(k,structuredClone(v));}};
}
export function natalFingerprint(input,calendar){return hash([PRAYER_ENGINE_VERSION,input.gender,input.birthDate,input.birthTime,input.calendar,input.leap,input.city,calendar.natal,calendar.calendarVersion,calendar.timeCorrection]);}
function cacheKey(config,kind,signature){return 'prayer-rules/'+hash(config.ENGINE_OWNER_ID||'local')+'/'+PRAYER_ENGINE_VERSION+'/'+kind+'/'+signature;}
async function saveAssessment(store,key,record,validate){
 try{await store.put(key,record,{onlyIfNew:true});return record;}
 catch(error){
  if(error.code!=='PRECONDITION_FAILED')throw error;
  const winner=await store.get(key);insist(winner&&winner.version===record.version&&winner.signature===record.signature,'并发补判档案不一致。');validate(winner);return winner;
 }
}
async function supplement(config,kind,request,validate,fetcher){
 if(!config.DEEPSEEK_API_KEY)throw Object.assign(new Error('规则尚未覆盖本次'+(kind==='foundation'?'原局取用':'有效会合条件')+'，且未配置补判模型。'),{code:'rule_gap_model_unavailable',ruleSection:kind});
 const system='你只补判规则引擎尚未覆盖的命理条件，不选择主尊、生肖、配色或画面，不写生图提示词。历法不得修改。按用户口径扶抑>格局>调候，保留具体干、并用条件、特殊格；不能按五行数量判断旺衰。地支会合先判断有效牵合，不以成员齐全自动认定，不需要一律合化。实际与图像象征模型分开。只返回请求的JSON；依据写中文，不含内部编号、免责声明或现实效果承诺。';
 const deadline=Date.now()+(Number(config.ANALYSIS_BUDGET_MS)||108000);let last;
 for(let attempt=0;attempt<2;attempt++){
  try{const result=await deepseek({...config,DEEPSEEK_TIMEOUT_MS:Math.max(1,Math.min(Number(config.DEEPSEEK_TIMEOUT_MS)||90000,Math.floor((deadline-Date.now())/(2-attempt))))},system,{...request,...(last?{validation_error:last.message}:{})},fetcher);validate(result);return result;}
  catch(error){last=error;if(!error.service&&error.code!=='rule_assessment_invalid')throw error;if(error.service&&!['invalid_json','truncated_output','network_or_timeout'].includes(error.code))throw error;if(Date.now()>=deadline)break;}
 }
 throw last;
}
export function validateFoundation(f,calendar){
 insist(f&&f.day_master===calendar.dayMaster&&f.month_branch===calendar.natal[1][1],'原局日主月令不一致。');
 insist(elements.includes(f.primary_element)&&(!f.secondary_element||elements.includes(f.secondary_element))&&f.primary_element!==f.secondary_element,'主次喜用无效或重复。');
 insist(prose(f.reason)&&prose(f.tiaohou_reason),'取用与调候须有具体中文依据。');
 for(const field of ['tiaohou_required_stems','unmet_tiaohou_stems','protected_stems'])insist(Array.isArray(f[field])&&new Set(f[field]).size===f[field].length&&f[field].every(s=>s.length===1&&stems.includes(s)),field+'须为不重复的具体天干。');
 insist(f.unmet_tiaohou_stems.every(s=>f.tiaohou_required_stems.includes(s)),'未满足调候必须属于已确定调候需求。');
 insist(Array.isArray(f.tiaohou_groups)&&f.tiaohou_groups.every(g=>Array.isArray(g)&&g.length&&g.every(s=>f.tiaohou_required_stems.includes(s))),'调候并用组合无效。');
 return f;
}
async function foundationFor(config,input,calendar,store,fetcher){
 const signature=natalFingerprint(input,calendar),key=cacheKey(config,'foundation',signature),saved=await store.get(key);
 if(saved&&!config.PRAYER_FOUNDATION){insist(saved.signature===signature&&saved.version===PRAYER_ENGINE_VERSION,'取用缓存版本不一致。');validateFoundation(saved.value,calendar);return saved;}
 // No unapproved numeric strength thresholds: use a confirmed internal profile or narrow model supplement.
 const supplied=config.PRAYER_FOUNDATION;
 let value,origin;
 if(supplied){insist(supplied.signature===signature,'指定取用档案不属于本次出生资料。');value=validateFoundation(supplied.value,calendar);origin='confirmed_profile';}
 else{value=await supplement(config,'foundation',{task:'只判断稳定原局，禁止把当前岁运当作原局依据。现有资料没有审定旺衰数值门槛，本次进入未覆盖分支。',natal:calendar.natal,dayMaster:calendar.dayMaster,expected:{day_master:calendar.dayMaster,month_branch:calendar.natal[1][1]},schema:{day_master:'原日干',month_branch:'原月支',primary_element:'五行',secondary_element:'五行或空',reason:'月令、根气、扶抑、格局取舍；不要包含当前日期或岁运',tiaohou_required_stems:['具体干'],unmet_tiaohou_stems:['原局尚未满足的具体干'],tiaohou_groups:[['须并用的具体干']],protected_stems:['不能被象征合走或冲伤的结构关键干'],tiaohou_reason:'原局调候条件和并用依据'}},x=>validateFoundation(x,calendar),fetcher);origin='model_supplement';}
 const record={version:PRAYER_ENGINE_VERSION,signature,origin,value,createdAt:new Date().toISOString()};
 if(supplied){if(saved?.origin==='confirmed_profile'&&hash(saved.value)===hash(value))return saved;await store.put(key,record);return record;}
 return saveAssessment(store,key,record,x=>validateFoundation(x.value,calendar));
}
function candidateSets(){const result=[[]];for(let i=0;i<12;i++){result.push([branches[i]]);for(let j=i+1;j<12;j++)result.push([branches[i],branches[j]]);}return result;}
export function zodiacModels(base){return candidateSets().map(added=>{const instances=[...base,...added.map(b=>({id:'symbolic.'+b,branch:b}))];return {added,instances,relations:branchRelations(instances)};});}
const bindingTypes=BRANCH_POLICY.binding_priority;
async function assessBindings(config,calendar,f,models,store,fetcher){
 const contexts=models.map(m=>({id:m.added.join('')||'actual',added:m.added,relations:m.relations.filter(r=>bindingTypes.includes(r.type))}));
 if(contexts.every(m=>!m.relations.length)&&!calendar.rawStemBindings?.length&&!f.tiaohou_required_stems.length)return {values:[],by_model:Object.fromEntries(contexts.map(m=>[m.id,[]])),origin:'rules',signature:hash([])};
 const catalog=[...new Map(contexts.flatMap(m=>m.relations.map(r=>[relationKey(r),r]))).values()];
 const context={natal:calendar.natal,luck:calendar.luck,year:calendar.year,month:calendar.month,day:calendar.day,foundation:f,stem_bindings:calendar.rawStemBindings||[],models:contexts};
 const signature=hash(context),key=cacheKey(config,'bindings',signature),saved=await store.get(key);
 const validate=data=>{
  insist(Array.isArray(data?.decisions)&&data.decisions.length===contexts.length&&new Set(data.decisions.map(x=>x.model)).size===contexts.length,'会合补判须完整覆盖所有模型且不重复。');
  for(const d of data.decisions){const m=contexts.find(x=>x.id===d.model);insist(m&&Array.isArray(d.effective_keys)&&new Set(d.effective_keys).size===d.effective_keys.length&&d.effective_keys.every(k=>m.relations.some(r=>relationKey(r)===k))&&prose(d.reason),'会合补判须对应本组真实候选并有条件依据。');
   for(const field of ['unfavorable_keys','critical_keys'])insist(Array.isArray(d[field])&&d[field].every(k=>d.effective_keys.includes(k)),'有利性与关键关系须属于本组有效会合。');
  }
  insist(Array.isArray(data.unmet_tiaohou_stems)&&data.unmet_tiaohou_stems.every(s=>f.tiaohou_required_stems.includes(s)),'当日调候缺项须属于稳定调候需求。');
  const stemIds=Array.isArray(data.effective_stem_bindings)?data.effective_stem_bindings.flat():[];
  insist(new Set(stemIds).size===stemIds.length,'实际天干有效五合不能重复占用同一来源天干。');
  insist(Array.isArray(data.effective_stem_bindings)&&data.effective_stem_bindings.every(ids=>Array.isArray(ids)&&ids.length===2&&(calendar.rawStemBindings||[]).some(({a,b})=>ids.includes(a.id)&&ids.includes(b.id)&&new Set(ids).size===2)),'有效天干五合须对应真实实例。');
 };
 const normalize=data=>({...data,values:data.decisions.find(d=>d.model==='actual').effective_keys.map(key=>({key,effective:true,reason:data.decisions.find(d=>d.model==='actual').reason})),by_model:Object.fromEntries(data.decisions.map(d=>[d.model,d.effective_keys]))});
 if(saved){insist(saved.signature===signature,'会合缓存上下文不一致。');validate(saved);return normalize(saved);}
 const data=await supplement(config,'bindings',{task:'逐组判断有效牵合。每组只加入该组added的symbolic实例，其他组不加入；从头判断，不冻结实际盘成员分配。只在effective_keys列出条件成立的关系key，未列出者均视为条件未满足或未能确认。key=type+冒号+排序后的target_ids用逗号连接。同等级竞争由程序保留分支，此处不因竞争否认有效性。每组reason写实际条件与未成立原因；不得仅凭成员齐全认定有效。',natal:context.natal,luck:context.luck,year:context.year,month:context.month,day:context.day,foundation:f,stem_bindings:context.stem_bindings,relation_catalog:catalog.map((r,index)=>({...r,index})),models:contexts.map(m=>({id:m.id,added:m.added,relation_indices:m.relations.map(r=>catalog.findIndex(x=>relationKey(x)===relationKey(r)))})),schema:{decisions:[{model:'输入模型id',effective_indices:[0],unfavorable_indices:[],critical_indices:[],reason:'具体条件依据，简短中文；不确定不列为有效'}],unmet_tiaohou_stems:['考虑当前岁运透藏、损伤与原局后仍未满足的具体干'],effective_stem_bindings:[['真实实例id','真实实例id']]},extra_instruction:'输出用relation_catalog中的index，程序转换为key。unfavorable表示会合对喜用或关键结构不利（含六合），critical表示不可破坏的关键有利关系。不要只凭出现一个字就认定调候满足；天干五合先核有效条件，不能凭配对自动认定。'},wire=>{
  if(Array.isArray(wire?.decisions))for(const d of wire.decisions)for(const field of ['effective','unfavorable','critical']){
   const indices=d[field+'_indices'];insist(Array.isArray(indices)&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<catalog.length),'会合索引无效。');d[field+'_keys']=indices.map(i=>relationKey(catalog[i]));
  }
  validate(wire);
 },fetcher);
 const record={...data,signature,origin:'model_supplement',version:PRAYER_ENGINE_VERSION};return normalize(await saveAssessment(store,key,record,validate));
}
function bindingElement(r){const b=r.branches.join('');for(const [set,e]of [['寅卯辰','木'],['巳午未','火'],['申酉戌','金'],['亥子丑','水'],['亥卯未','木'],['寅午戌','火'],['巳酉丑','金'],['申子辰','水']])if(r.branches.length===3&&[...b].every(x=>set.includes(x)))return e;return null;}
function relationIdentity(r){return relationKey(r);}
export function selectZodiac(models,assessment,foundation){
 const effective=assessment.by_model?.actual||assessment.values.filter(x=>x.effective).map(x=>x.key),baseChoices=allocateBindings(models[0].relations,effective);
 const preferred=[foundation.primary_element,foundation.secondary_element].filter(Boolean),evaluated=[];
 for(const model of models){
  const modelKeys=assessment.by_model?.[model.added.join('')||'actual']||effective;
  const alternatives=allocateBindings(model.relations,modelKeys),outcomes=[];
  for(const base of baseChoices)for(const option of alternatives){
   const oldResidual=new Set(base.residual_relations.map(relationIdentity));
   const newBad=option.residual_relations.filter(r=>!oldResidual.has(relationIdentity(r)));
   const keys=new Set(option.bindings.map(relationKey));
   const baseDecision=assessment.decisions?.find(d=>d.model==='actual');
   const modelDecision=assessment.decisions?.find(d=>d.model===(model.added.join('')||'actual'));
   const lost=base.bindings.some(r=>(preferred.includes(bindingElement(r))||baseDecision?.critical_keys?.includes(relationKey(r)))&&!keys.has(relationKey(r)));
   const addedBindings=option.bindings.filter(r=>r.target_ids.some(id=>id.startsWith('symbolic.')));
   const unfavorable=addedBindings.some(r=>(bindingElement(r)&&!preferred.includes(bindingElement(r)))||modelDecision?.unfavorable_keys?.includes(relationKey(r)));
   const improvement=base.residual_relations.filter(r=>!option.residual_relations.some(x=>relationKey(x)===relationKey(r))).length;
   const useful=addedBindings.filter(r=>preferred.includes(bindingElement(r)));
   outcomes.push({valid:!newBad.length&&!lost&&!unfavorable,improvement,primary:useful.some(r=>bindingElement(r)===foundation.primary_element),secondary:useful.some(r=>bindingElement(r)===foundation.secondary_element),option});
  }
  // Only use improvements true across every unresolved equal-priority allocation.
  const safe=outcomes.every(x=>x.valid),improvement=Math.min(...outcomes.map(x=>x.improvement)),primary=outcomes.every(x=>x.primary),secondary=outcomes.every(x=>x.secondary);
  const commonBindings=outcomes[0].option.bindings.filter(r=>outcomes.every(x=>x.option.bindings.some(t=>relationKey(t)===relationKey(r))));
  const covered=model.added.every(b=>commonBindings.some(r=>r.target_ids.includes('symbolic.'+b)));
  const positive=covered&&(improvement>0||primary||secondary);
  evaluated.push({model,safe,improvement,primary,secondary,positive,outcomes});
 }
 const ranked=evaluated.filter(x=>!x.model.added.length||(x.safe&&x.positive)).sort((a,b)=>b.improvement-a.improvement||Number(b.primary)-Number(a.primary)||Number(b.secondary)-Number(a.secondary)||a.model.added.length-b.model.added.length||a.model.added.join('').localeCompare(b.model.added.join(''),'en'));
 const winner=ranked[0];
 return {added:winner.model.added,relations:winner.model.relations,alternatives:[...new Map(winner.outcomes.map(x=>[hash(x.option),x.option])).values()],baseAlternatives:baseChoices,effective,evaluated:evaluated.map(x=>({added:x.model.added,safe:x.safe,improvement:x.improvement,primary:x.primary,secondary:x.secondary,selected:x===winner}))};
}
function chooseWish(input,history){
 // No approved normalized astrology score: explicit user order and historical rotation are the fallback.
 const stats=id=>history.filter(h=>h.wish===id),last=history.at(-1)?.wish;
 return [...input.wishes].sort((a,b)=>Number(a===last)-Number(b===last)||stats(a).length-stats(b).length||(stats(a).at(-1)?.date||'').localeCompare(stats(b).at(-1)?.date||'')||input.wishes.indexOf(a)-input.wishes.indexOf(b))[0];
}
function chooseDeity(wish,f,history){
 const allowed=PRAYER_CATALOG[wish].filter(x=>VALID_DEITIES.includes(x.name));
 const directionEntries=[f.primary_element,f.secondary_element].filter(Boolean).map((e,i)=>({name:DIRECTIONS[e],affinity:2-i,reason:'按财源广进的五路方位版本，以'+(i?'次':'主')+'喜用'+e+'对应的方位选择本尊。',blessing:'愿你经营有获，财源渐广。'}));
 const pool=wish==='W02'?[...directionEntries,...allowed.filter(x=>!directionEntries.some(d=>d.name===x.name))]:allowed;
 insist(pool.length,'愿望缺少可用主尊资料。');
 const last=history.at(-1)?.deity,identity=n=>n==='送子观音'?'观音':n;
 const count=(n,same)=>history.filter(h=>identity(h.deity)===identity(n)&&(!same||h.wish===wish)).length;
 return [...pool].sort((a,b)=>Number(identity(a.name)===identity(last))-Number(identity(b.name)===identity(last))||(b.affinity||0)-(a.affinity||0)||count(a.name,true)-count(b.name,true)||count(a.name,false)-count(b.name,false)||(history.filter(h=>identity(h.deity)===identity(a.name)).at(-1)?.date||'').localeCompare(history.filter(h=>identity(h.deity)===identity(b.name)).at(-1)?.date||''))[0];
}
export function selectStemSymbols(calendar,f,effectiveBindings=[]){
 const c=evidenceContext(calendar,STEM_PARTNER),protectedSet=new Set([...f.protected_stems,...f.tiaohou_required_stems]),chosen=new Map(),unresolved=[];
 const clash=(a,b)=>['甲庚','乙辛','丙壬','丁癸'].some(pair=>a!==b&&pair.includes(a)&&pair.includes(b));
 const compatible=s=>![...chosen.keys()].some(t=>clash(s,t)||STEM_PARTNER[s]===t)&&!calendar.stems.some(x=>clash(s,x.stem)||(protectedSet.has(x.stem)&&STEM_PARTNER[s]===x.stem));
 for(const target of c.clash_response_options){
  if(effectiveBindings.some(ids=>ids.includes(target.natal_id)||ids.includes(target.incoming_id)))continue;
  if(f.tiaohou_required_stems.includes(target.incoming_stem))continue;
  const s=target.response_stem;
  if(!compatible(s)){unresolved.push(target);continue;}
  const item=chosen.get(s)||{stem:s,motif:motif[s],purpose:'解冲',match_ids:c.stem_match_ids[s],clash_targets:[]};item.clash_targets.push({natal_id:target.natal_id,incoming_id:target.incoming_id});chosen.set(s,item);
 }
  if(!unresolved.length){
  const needed=f.unmet_tiaohou_stems;
  const additions=needed.filter(compatible).filter(s=>!needed.some(t=>t!==s&&(clash(s,t)||STEM_PARTNER[s]===t)));
  for(let pass=0;pass<10;pass++){const remove=additions.filter(s=>f.tiaohou_groups.some(g=>g.includes(s)&&g.some(t=>needed.includes(t)&&!additions.includes(t)&&!chosen.has(t))));if(!remove.length)break;for(const s of remove)additions.splice(additions.indexOf(s),1);}
  // Preserve paired requirements; don't claim an isolated fragment satisfies a necessary combination.
  for(const s of additions){if(f.tiaohou_groups.some(g=>g.includes(s)&&g.some(t=>needed.includes(t)&&!additions.includes(t)&&!chosen.has(t))))continue;
   if(chosen.has(s))chosen.get(s).purpose='解冲兼调候';else chosen.set(s,{stem:s,motif:motif[s],purpose:'调候',match_ids:c.stem_match_ids[s],clash_targets:[]});
  }
 }
 return {items:[...chosen.values()].map(x=>({...x,reason:x.purpose.includes('解冲')?'按来冲干的五合对象选择'+x.stem+'，以'+x.motif+'独立表达对应关系。':'原局调候需要'+x.stem+'，当前透干未提供该项，以'+x.motif+'表达。',effect:'以独立景物承载'+x.purpose+'取象，保持主尊身份与法器。',compatibility:'已核对已有五合对应、调候保护与关键天干，意象不回写实际命盘。'})),unresolved};
}
function compose(input,calendar,history,f,deity,wish,zodiac,stemPlan,assessment){
 const label=WISHES.find(w=>w.id===wish).label,primary=palette[f.primary_element],secondary=f.secondary_element?palette[f.secondary_element]:null;
 const colors=[{name:primary[0],hex:primary[1]},...(secondary?[{name:secondary[0],hex:secondary[1]}]:[])];
 for(const e of ['金'])if(!colors.some(x=>x.name===palette[e][0]))colors.push({name:palette[e][0],hex:palette[e][1]});
 if(colors.length<3)colors.push({name:'黑',hex:'#000000'});
 const colorReasons=colors.map((x,i)=>({name:x.name,element:i===0?f.primary_element:i===1&&secondary?f.secondary_element:'中性',role:i===0?'主色':i===1&&secondary?'辅色':'点缀',reason:i===0?'主喜用'+f.primary_element+'对应'+x.name+'，用于可调整的衣袍与背景主色块。':i===1&&secondary?'次喜用'+f.secondary_element+'对应'+x.name+'，以少量色块辅助主色。':'用于轮廓、留白与层次，作为审美配色。',effect:i===0?'建立清楚的主调，呼应稳定原局取用。':'保持画面层次与主辅比例，固定身色不随配色改变。'}));
 const base=evidenceContext(calendar,STEM_PARTNER),branchName=id=>(source[id]||'画面取象')+(base.branches.find(x=>x.id===id)?.branch||id.slice(-1));
 const names=zodiac.added.map(b=>animals[branches.indexOf(b)]);
 const details=base.branches.map(b=>branchName(b.id)).join('、');
 const emptyReason='逐组比较新增生肖的会合收益与残余冲刑害，未找到在全部相容分配下都有净改善且不破坏喜用关键关系的方案，因此不额外加入生肖。';
 const zodiacItems=zodiac.added.map(b=>{
  const relation=zodiac.alternatives.flatMap(x=>x.bindings).find(r=>r.target_ids.includes('symbolic.'+b));
  const target_ids=relation?.target_ids.filter(id=>!id.startsWith('symbolic.'))||[];
  // Multi-animal completions are recorded explicitly rather than pretending both partners are real branches.
  return {animal:animals[branches.indexOf(b)],branch:b,method:relation?.type+'取象',target_ids,symbolic_target_ids:relation?.target_ids.filter(id=>id.startsWith('symbolic.')&&id!=='symbolic.'+b)||[],reason:'加入'+animals[branches.indexOf(b)]+'以回应'+(relation?.type||'会合')+'取象，经过完整候选组重算与残余冲刑害比较。',effect:'作为次要陪伴呼应'+label+'，与主尊固有坐骑分别呈现。'};
 });
 const supports=calendar.stems.filter(x=>x.id.startsWith('transit.')&&[f.primary_element,f.secondary_element].includes(stemElement(x.stem)));
 const dynamic=supports.length?'当前岁运透干中，'+supports.map(x=>(source[x.id]||'岁运')+'天干'+x.stem).join('、')+'已提供喜用方向的支持，画面不以重复堆叠同类元素为目标。':'当前岁运需结合原局喜用取舍，画面沿用稳定主调，不把单日出现的五行重新指定为原局喜用。';
 const prompt=[deity.name+'为主体，主题为'+label+'。保持该主尊的传统身份、固定身色、服饰、手势和固有配属；不新增未确定的法器，不将喜用色覆盖固定身色。',...colors.map(x=>x.name+' '+x.hex),'额外生肖：'+(names.join('、')||'无')+'；次要陪伴，不作坐骑。','独立天干景物：'+(stemPlan.items.map(x=>x.motif).join('、')||'无')+'。','背景只用疏朗低细节云卷，不增加其他命理景物、动物、文字或日期。',artDirection(input.artStyle)].join('\n');
 const mapping={wish_id:wish,title:label+'·'+primary[0]+'意祈福',deity:deity.name,primary_element:f.primary_element,secondary_element:f.secondary_element||'',rotation_reason:history.length?'在本愿望可用候选中比较近期次数与最近展示，适配优先，再安排轮换。':'',overview:'这幅画以'+deity.name+'呼应你'+label+'的心愿。'+primary[0]+'色建立主调'+(secondary?'，'+secondary[0]+'色辅助衬托':'')+'，主尊、'+(names.length?names.join('与')+'陪伴、':'')+(stemPlan.items.length?stemPlan.items.map(x=>x.motif).join('与')+'景物及':'')+'疏朗流云共同寄托祝愿。'+deity.blessing,blessing:'愿你'+label+'，心有所向，行有所成。',elements:[{name:deity.name,meaning:deity.blessing},...colorReasons.map(x=>({name:x.name+'色',meaning:x.reason})),...zodiacItems.map(x=>({name:x.animal,meaning:x.effect})),...stemPlan.items.map(x=>({name:x.motif,meaning:x.reason}))],colors,zodiac:names,stem_symbols:stemPlan.items.map(({stem,motif})=>({stem,motif})),image_prompt:prompt,rationale:{intro:'以'+label+'为今日主题，沿用原局喜用，以主尊、配色和经筛选的意象共同表达祈愿。',foundation:{...f},colors:colorReasons,deity:{name:deity.name,wish_id:wish,direction:({木:'东方',火:'南方',土:'中央',金:'西方',水:'北方'})[Object.keys(DIRECTIONS).find(k=>DIRECTIONS[k]===deity.name)]||'',reason:deity.reason,effect:deity.blessing,history_refs:history.map(x=>x.id),today_reason:dynamic,diversity_reason:history.length?'已比较近期同愿望与跨愿望使用次数和最近展示；先保持愿望与取用适配，再考虑轮换。':''},zodiac:{items:zodiacItems,effective_bindings:assessment.values.filter(x=>x.effective&&base.branch_relations.some(r=>relationKey(r)===x.key)).map(x=>({...base.branch_relations.find(r=>relationKey(r)===x.key),condition_reason:x.reason})),existing_branch_ids:base.branches.map(x=>x.id),existing_analysis:details+'。先按三会、三合、六合顺序分配已核验的有效会合，再检查残余冲、刑、害；三刑须三支齐全，自刑同支两见，破未启用。',existing_relations:base.branch_relations.map(r=>({...r,interpretation:bindingTypes.includes(r.type)?assessment.values.find(x=>x.key===relationKey(r))?.reason||'只记录成员关系，不直接认定合化。':'此关系按已确定的成立口径记录；冲须在会合分配后检查是否残余，刑害继续保留。'})),reason_if_empty:names.length?'':emptyReason},stems:{items:stemPlan.items,reason_if_empty:stemPlan.unresolved.length?'部分残余天干冲的候选会触及调候或关键用干，保留未解决状态，不另添调候景物冒充已经回应。':'已核对原局与岁运来干、五合对应和现有调候支持，本次没有通过保护条件且需要新增的天干意象。'}}};
 // Actual selections may contain up to ten stem motifs; keep the presentation element list within the established contract.
 if(mapping.elements.length>12)mapping.elements=[...mapping.elements.filter(x=>!stemPlan.items.some(t=>t.motif===x.name)),{name:'天干景物',meaning:stemPlan.items.map(x=>x.motif+'：'+x.reason).join('；')}];
 return mapping;
}
async function generateRuleMappingInternal(config,input,calendar,history=[],fetcher=fetch){
 const started=Date.now(),store=storeFor(config),recent=selectionHistory(history,input.today).filter(x=>x.date<input.today);
 const f=await foundationFor(config,input,calendar,store,fetcher);
 const base=evidenceContext(calendar,STEM_PARTNER),models=zodiacModels(base.branches);
 const remaining=(Number(config.ANALYSIS_BUDGET_MS)||108000)-(Date.now()-started);
 if(remaining<=0)throw Object.assign(new Error('规则补判超过本次计算时限。'),{code:'rule_generation_failed'});
 const assessment=await assessBindings({...config,ANALYSIS_BUDGET_MS:remaining},calendar,f.value,models,store,fetcher);
 const dynamicFoundation={...f.value,unmet_tiaohou_stems:assessment.unmet_tiaohou_stems??f.value.unmet_tiaohou_stems};
 const zodiac=selectZodiac(models,assessment,f.value),stemPlan=selectStemSymbols(calendar,dynamicFoundation,assessment.effective_stem_bindings||[]);
 const wish=chooseWish(input,recent),deity=chooseDeity(wish,f.value,recent);
 const raw=compose(input,calendar,recent,f.value,deity,wish,zodiac,stemPlan,assessment);
 const mapping=validateMapping(raw,input,calendar,recent);
 Object.assign(mapping,{wish_label:WISHES.find(w=>w.id===wish).label,birth_summary:birthSummary(calendar),art_style:input.artStyle||'cute',art_style_version:ART_STYLE_VERSION,engine:{version:PRAYER_ENGINE_VERSION,catalog_version:CATALOG_VERSION,foundation:f,assessment_origin:assessment.origin,assessment_signature:assessment.signature,condition_assessment:assessment,theme_rule:'user_order_history_rotation',zodiac_candidates:zodiac.evaluated,zodiac_allocations:zodiac.alternatives,unresolved_stem_clashes:stemPlan.unresolved},confidence:f.origin==='confirmed_profile'?'confirmed':'provisional'});
 config.ANALYSIS_DIAGNOSTIC?.({outcome:'rules_complete',elapsedMs:Date.now()-started,engineVersion:PRAYER_ENGINE_VERSION});
 return mapping;
}

export async function generateRuleMapping(config,input,calendar,history=[],fetcher=fetch){
 try{return await generateRuleMappingInternal(config,input,calendar,history,fetcher);}
 catch(error){
  const diagnostic={version:PRAYER_ENGINE_VERSION,date:input.today,at:new Date().toISOString(),code:error.code||'rule_generation_failed',section:error.ruleSection||null,issues:error.issues?.map(x=>({section:x.section,code:x.code}))||[],input_signature:natalFingerprint(input,calendar)};
  config.ANALYSIS_DIAGNOSTIC?.({...diagnostic,outcome:'rules_failed'});
  try{await storeFor(config).put(cacheKey(config,'failures',hash([diagnostic,Math.random()])),diagnostic);}catch{/* Preserve the original failure when the diagnostic store itself is unavailable. */}
  if(!error.service&&!error.status&&!error.code)error.code='rule_generation_failed';
  throw error;
 }
}
