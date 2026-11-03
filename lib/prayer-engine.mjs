import {relationSnapshot,branchExplanation,stemExplanation} from './relation-explanation.mjs';
import {confirmedFoundationCase} from './foundation-cases.mjs';
import {applyFoundationPolicy,FOUNDATION_POLICY_VERSION} from './foundation-policy.mjs';
import {createHash} from 'node:crypto';
import {WISHES,STEM_PARTNER,DIRECTIONS,VALID_DEITIES,validateMapping,selectionHistory} from './domain.mjs';
import {evidenceContext,hasDefensiveCopy} from './selection-rationale.mjs';
import {branchRelations,allocateBindings,relationKey,BRANCH_POLICY} from './branch-policy.mjs';
import {PRAYER_CATALOG,CATALOG_VERSION} from './prayer-catalog.mjs';
import {deepseek} from './providers.mjs';
import {accountRepository,accountsEnabled} from './account-store.mjs';
import {artDirection,ART_STYLE_VERSION} from './art-styles.mjs';
import {birthSummary} from './consumer-reading.mjs';
export const PRAYER_ENGINE_VERSION='2026-11-03-rules-v7';
// Dynamic rule upgrades must not invalidate a validated stable natal profile.
const FOUNDATION_VERSION='2026-11-01-rules-v2';
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
export function natalFingerprint(input,calendar){return hash([FOUNDATION_VERSION,input.gender,input.birthDate,input.birthTime,input.calendar,input.leap,input.city,calendar.natal,calendar.calendarVersion,calendar.timeCorrection]);}
function cacheKey(config,kind,signature,version=PRAYER_ENGINE_VERSION){return 'prayer-rules/'+hash(config.ENGINE_OWNER_ID||'local')+'/'+version+'/'+kind+'/'+signature;}
async function saveAssessment(store,key,record,validate){
 try{await store.put(key,record,{onlyIfNew:true});return record;}
 catch(error){
  if(error.code!=='PRECONDITION_FAILED')throw error;
  const winner=await store.get(key);insist(winner&&winner.version===record.version&&winner.signature===record.signature,'并发补判档案不一致。');validate(winner);return winner;
 }
}
async function supplement(config,kind,request,validate,fetcher){
 if(!config.DEEPSEEK_API_KEY)throw Object.assign(new Error('规则尚未覆盖本次'+(kind==='foundation'?'原局取用':'有效会合条件')+'，且未配置补判模型。'),{code:'rule_gap_model_unavailable',ruleSection:kind});
 const system='所有天干字段只允许甲乙丙丁戊己庚辛壬癸单字，严禁把子丑寅卯辰巳午未申酉戌亥等地支填入天干数组。你只补判规则引擎尚未覆盖的命理条件，不选择主尊、生肖、配色或画面，不写生图提示词。历法不得修改。按用户口径扶抑>格局>调候，保留具体干、并用条件、特殊格；不能按五行数量判断旺衰。每日会合有效性由程序按用户已确认的成员齐全规则处理，不属于本次原局取用任务。实际与图像象征模型分开。只返回请求的JSON；依据写中文，不含内部编号、免责声明或现实效果承诺。';
 const deadline=Date.now()+(Number(config.ANALYSIS_BUDGET_MS)||108000);let last;
 for(let attempt=0;attempt<2;attempt++){
  try{const result=await deepseek({...config,DEEPSEEK_TIMEOUT_MS:Math.max(1,Math.min(Number(config.DEEPSEEK_TIMEOUT_MS)||90000,Math.floor((deadline-Date.now())/(2-attempt))))},system,{...(typeof request==='function'?request():request),...(last?{validation_error:last.message}:{})},fetcher);await validate(result);return result;}
  catch(error){last=error;if(!error.service&&error.code!=='rule_assessment_invalid')throw error;if(error.service&&!['invalid_json','truncated_output','network_or_timeout'].includes(error.code))throw error;if(Date.now()>=deadline)break;}
 }
 throw last;
}
export function validateFoundation(f,calendar,{required=false}={}){
 insist(f&&f.day_master===calendar.dayMaster&&f.month_branch===calendar.natal[1][1],'原局日主月令不一致。');
 f=applyFoundationPolicy(f,{required});
 insist(elements.includes(f.primary_element)&&(!f.secondary_element||elements.includes(f.secondary_element))&&f.primary_element!==f.secondary_element,'主次喜用无效或重复。');
 insist(prose(f.reason)&&prose(f.tiaohou_reason),'取用与调候须有具体中文依据。');
 for(const field of ['tiaohou_required_stems','unmet_tiaohou_stems','protected_stems'])insist(Array.isArray(f[field])&&new Set(f[field]).size===f[field].length&&f[field].every(s=>s.length===1&&stems.includes(s)),field+'须为不重复的具体天干，只允许甲乙丙丁戊己庚辛壬癸；收到：'+JSON.stringify(f[field]));
 insist(f.unmet_tiaohou_stems.every(s=>f.tiaohou_required_stems.includes(s)),'未满足调候必须属于已确定调候需求。');
 insist(Array.isArray(f.tiaohou_groups)&&f.tiaohou_groups.every(g=>Array.isArray(g)&&g.length&&g.every(s=>f.tiaohou_required_stems.includes(s))),'调候并用组合无效。');
 return applyFoundationPolicy(f,{required});
}
async function foundationFor(config,input,calendar,store,fetcher){
 const signature=natalFingerprint(input,calendar),key=cacheKey(config,'foundation',signature,FOUNDATION_POLICY_VERSION),saved=await store.get(key);
 if(saved&&!config.PRAYER_FOUNDATION){insist(saved.signature===signature&&saved.version===FOUNDATION_POLICY_VERSION,'取用缓存版本不一致。');validateFoundation(saved.value,calendar,{required:saved.origin==='model_supplement'});return saved;}
 if(!config.PRAYER_FOUNDATION){
  const confirmed=confirmedFoundationCase(calendar);
  if(confirmed){const record={version:FOUNDATION_POLICY_VERSION,signature,origin:'confirmed_profile',value:validateFoundation(confirmed,calendar),createdAt:new Date().toISOString()};await store.put(key,record);return record;}
 }
 // Re-rank the saved method sets without asking a model to reassess natal strength.
 if(!config.PRAYER_FOUNDATION){
  const prior=await store.get(cacheKey(config,'foundation',signature,'2026-11-03-foundation-fgt-v2'))||await store.get(cacheKey(config,'foundation',signature,'2026-11-03-foundation-fgt-v1'));
  if(prior?.signature===signature&&prior.value?.selection_basis){
   const value=validateFoundation(prior.value,calendar,{required:prior.origin==='model_supplement'});
   const migrated={...prior,version:FOUNDATION_POLICY_VERSION,value,migratedFrom:prior.version};
   await store.put(key,migrated);return migrated;
  }
 }
 // No unapproved numeric strength thresholds: use a confirmed internal profile or narrow model supplement.
 const supplied=config.PRAYER_FOUNDATION;
 const previous=await store.get(cacheKey(config,'foundation',signature,FOUNDATION_VERSION));
 const previousWeak=previous?.signature===signature&&previous.value?.day_master===calendar.dayMaster&&new RegExp(calendar.dayMaster+'[木火土金水]?(?:日主)?(?:偏弱|身弱|较弱)').test(previous.value?.reason||'');
 const validateSupplement=x=>{const result=validateFoundation({...x,assessment_source:{kind:'model_supplement',label:'首次原局候选由模型补判，交集与关系由程序计算'}},calendar,{required:true});insist(!previousWeak||(result.selection_basis.structure==='ordinary'&&result.selection_basis.strength==='weak'),'旧档案已记录普通身弱路线；补齐方法候选时不能未经确认改变强弱路线。');return result;};
 let value,origin;
 if(supplied){insist(supplied.signature===signature,'指定取用档案不属于本次出生资料。');value=validateFoundation(supplied.value,calendar);origin='confirmed_profile';}
 else{value=await supplement(config,'foundation',{task:'只判断稳定原局，禁止把当前岁运当作原局依据。现有资料没有审定旺衰数值门槛，本次进入未覆盖分支。',natal:calendar.natal,dayMaster:calendar.dayMaster,stem_field_constraints:{fields:['tiaohou_required_stems','unmet_tiaohou_stems','protected_stems','tiaohou_groups每项'],allowed_values:[...stems],forbidden_values:[...branches],instruction:'这些字段只接受天干；需要保护地支时在reason说明，不得放进天干数组。'},previous_strength_constraint:previousWeak?'旧原局记录为普通身弱；本次只补齐扶抑、格局、调候候选，不未经确认改成身强或特殊格。':null,expected:{day_master:calendar.dayMaster,month_branch:calendar.natal[1][1]},schema:{selection_basis:{structure:'ordinary或special，特殊格须单独证明',structure_reason:'特殊格成立依据；普通格可空',strength:'weak或strong或balanced',fuyi_reason:'50至120字，说明旺衰与扶抑需要，不把格局或调候的用字当扶抑候选',pattern_reason:'50至120字，独立说明成格救应，不将格局集合强行限制为扶抑集合',fuyi_stems:['仅扶抑可用的具体天干，按扶抑需要强度排序；普通身弱限印比'],pattern_stems:['成格相神或救应的具体天干，不是直接把月令立格之神列入']},day_master:'原日干',month_branch:'原月支',primary_element:'兼容字段，最终由程序按F交G、F交T、G交T的顺序去重后取前两种五行',secondary_element:'兼容字段，G交T允许在扶抑集合外入选',reason:'月令、根气、扶抑、格局取舍；不要包含当前日期或岁运',tiaohou_required_stems:['具体干'],unmet_tiaohou_stems:['原局尚未满足的具体干'],tiaohou_groups:[['须并用的具体干']],protected_stems:['不能被象征合走或冲伤的结构关键干'],tiaohou_reason:'50至120字说明原局调候条件与并用依据，不重复扶抑段落'}},validateSupplement,fetcher);value=validateSupplement(value);origin='model_supplement';}
 const record={version:FOUNDATION_POLICY_VERSION,signature,origin,value,createdAt:new Date().toISOString()};
 if(supplied){if(saved?.origin==='confirmed_profile'&&hash(saved.value)===hash(value))return saved;await store.put(key,record);return record;}
 return saveAssessment(store,key,record,x=>validateFoundation(x.value,calendar));
}
function candidateSets(){const result=[[]];for(let i=0;i<12;i++){result.push([branches[i]]);for(let j=i+1;j<12;j++)result.push([branches[i],branches[j]]);}return result;}
export function zodiacModels(base){return candidateSets().map(added=>{const instances=[...base,...added.map(b=>({id:'symbolic.'+b,branch:b}))];return {added,instances,relations:branchRelations(instances)};});}
const bindingTypes=BRANCH_POLICY.binding_priority;
// 合只解除涉及有效成员实例的冲、刑、自刑；六害保留。
export function viableZodiacModels(models){
 const residual=m=>allocateBindings(m.relations,m.relations.filter(r=>bindingTypes.includes(r.type)).map(relationKey))[0].residual_relations;
 const baseBad=new Set(residual(models[0]).map(relationKey));
 return models.filter(m=>!m.added.length||(!residual(m).some(r=>!baseBad.has(relationKey(r)))&&m.added.every(b=>m.relations.some(r=>bindingTypes.includes(r.type)&&r.target_ids.includes('symbolic.'+b)))));
}
async function atStage(stage,action){try{return await action();}catch(error){error.ruleSection=stage;throw error;}}
// User-confirmed policy: membership is sufficient for binding, without adjacency checks.
export function assessDailyConditions(calendar,f,models){
 const preferred=[f.primary_element,f.secondary_element].filter(Boolean);
 const decisions=models.map(m=>{
  const relations=m.relations.filter(r=>bindingTypes.includes(r.type));
  return {model:m.added.join('')||'actual',effective_keys:relations.map(relationKey),
   unfavorable_keys:relations.filter(r=>bindingElement(r)&&!preferred.includes(bindingElement(r))).map(relationKey),
   critical_keys:relations.filter(r=>preferred.includes(bindingElement(r))).map(relationKey),
   reason:'按已确认规则，三会、三合、六合成员齐全即有效牵合，不要求相邻；三会三合按目标五行判断喜用，六合不预设合化五行。',origin:'rules'};
 });
 const visible=calendar.stems||[],effective_stem_bindings=[];
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)if(STEM_PARTNER[visible[i].stem]===visible[j].stem)effective_stem_bindings.push([visible[i].id,visible[j].id]);
 const unmet_tiaohou_stems=f.tiaohou_required_stems.filter(s=>!visible.some(x=>x.stem===s));
 const actual=decisions.find(d=>d.model==='actual');
 return {version:PRAYER_ENGINE_VERSION,origin:'rules',signature:hash({version:PRAYER_ENGINE_VERSION,calendar,foundation:f,decisions}),decisions,
  values:actual.effective_keys.map(key=>({key,effective:true,reason:actual.reason})),by_model:Object.fromEntries(decisions.map(d=>[d.model,d.effective_keys])),
  effective_stem_bindings,unmet_tiaohou_stems,
  tiaohou_presence:f.tiaohou_required_stems.map(stem=>({stem,visible_ids:visible.filter(x=>x.stem===stem).map(x=>x.id),satisfied:!unmet_tiaohou_stems.includes(stem)}))};
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
  const positive=covered&&improvement>0;
  evaluated.push({model,safe,improvement,primary,secondary,positive,covered,outcomes});
 }
 const ranked=evaluated.filter(x=>!x.model.added.length||(x.safe&&x.positive)).sort((a,b)=>b.improvement-a.improvement||Number(b.primary)-Number(a.primary)||Number(b.secondary)-Number(a.secondary)||a.model.added.length-b.model.added.length||a.model.added.join('').localeCompare(b.model.added.join(''),'en'));
 const winner=ranked[0];
 return {added:winner.model.added,relations:winner.model.relations,alternatives:[...new Map(winner.outcomes.map(x=>[hash(x.option),x.option])).values()],baseAlternatives:baseChoices,effective,evaluated:evaluated.map(x=>({added:x.model.added,safe:x.safe,improvement:x.improvement,primary:x.primary,secondary:x.secondary,covered:x.covered,positive:x.positive,selected:x===winner}))};
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
 const c=evidenceContext(calendar,STEM_PARTNER),protectedSet=new Set([...f.protected_stems,...f.tiaohou_required_stems]),chosen=new Map(),unresolved=[],skipped=[],rejected=[];
 const clash=(a,b)=>['甲庚','乙辛','丙壬','丁癸'].some(pair=>a!==b&&pair.includes(a)&&pair.includes(b));
 const name=x=>(source[x.id]||'原局').replace('支','干')+x.stem;
 const conflicts=s=>[
  ...[...chosen.keys()].filter(t=>clash(s,t)||STEM_PARTNER[s]===t).map(t=>'新增'+s+'与已选'+t+(clash(s,t)?'相冲':'五合牵合')+'，不能同时加入'),
  ...calendar.stems.filter(x=>clash(s,x.stem)).map(x=>'新增'+s+'会冲'+name(x)),
  ...calendar.stems.filter(x=>protectedSet.has(x.stem)&&STEM_PARTNER[s]===x.stem).map(x=>'新增'+s+'会合住'+name(x)+'，而'+x.stem+(f.tiaohou_required_stems.includes(x.stem)?'是本次所需调候用干':'是需要保留的结构关键干'))
 ];
 const compatible=s=>!conflicts(s).length;
 for(const target of c.clash_response_options){
  const context=target.incoming_stem+'冲原局'+target.natal_stem;
  if(effectiveBindings.some(ids=>ids.includes(target.natal_id)||ids.includes(target.incoming_id))){skipped.push(context+'至少一端已有天干五合牵合，不再另添解冲意象');continue;}
  if(f.tiaohou_required_stems.includes(target.incoming_stem)){skipped.push('来干'+target.incoming_stem+'是本次所需调候用干，不能为回应'+context+'而将它合走');continue;}
  const candidate=target.response_stem,reasons=conflicts(candidate);
  if(reasons.length){unresolved.push({...target,reasons});continue;}
  const item=chosen.get(candidate)||{stem:candidate,motif:motif[candidate],purpose:'解冲',match_ids:c.stem_match_ids[candidate],clash_targets:[]};item.clash_targets.push({natal_id:target.natal_id,incoming_id:target.incoming_id});chosen.set(candidate,item);
 }
 if(!unresolved.length){
  const needed=f.unmet_tiaohou_stems;
  const additions=needed.filter(stem=>{const reasons=conflicts(stem);if(reasons.length)rejected.push('调候候选'+stem+'不加入：'+reasons.join('；'));return !reasons.length;}).filter(stem=>{
   const pairs=needed.filter(t=>t!==stem&&(clash(stem,t)||STEM_PARTNER[stem]===t));if(pairs.length)rejected.push('调候候选'+stem+'与并用候选'+pairs.join('、')+'存在相冲或五合牵合，不能同时补入');return !pairs.length;
  });
  for(let pass=0;pass<10;pass++){
   const remove=additions.filter(stem=>f.tiaohou_groups.some(g=>g.includes(stem)&&g.some(t=>needed.includes(t)&&!additions.includes(t)&&!chosen.has(t))));if(!remove.length)break;
   for(const stem of remove){const missing=f.tiaohou_groups.filter(g=>g.includes(stem)).flat().filter(t=>needed.includes(t)&&!additions.includes(t)&&!chosen.has(t));rejected.push('调候候选'+stem+'需与'+[...new Set(missing)].join('、')+'并用，但配套用干不能同时加入，不单独补一半');additions.splice(additions.indexOf(stem),1);}
  }
  for(const stem of additions){if(chosen.has(stem))chosen.get(stem).purpose='解冲兼调候';else chosen.set(stem,{stem,motif:motif[stem],purpose:'调候',match_ids:c.stem_match_ids[stem],clash_targets:[]});}
 }
 const blocked=unresolved.map(t=>'来干'+t.incoming_stem+'冲原局'+t.natal_stem+'，原可选'+t.response_stem+'（'+motif[t.response_stem]+'）合'+t.incoming_stem+'；但'+t.reasons.join('；')+'，所以不加这项');
 const none_reason=[...new Set([...blocked,...skipped,...rejected])].join('。')||(f.tiaohou_required_stems.length?'本次所需'+f.tiaohou_required_stems.join('、')+'已在原局或岁运透出，且没有仍需新增意象回应的天干冲，因此不添加天干映射物。':'没有需要新增意象回应的天干冲，也没有尚缺的调候用干，因此不添加天干映射物。');
 return {items:[...chosen.values()].map(x=>({...x,reason:x.purpose.includes('解冲')?x.clash_targets.map(t=>{const natal=calendar.stems.find(s=>s.id===t.natal_id),incoming=calendar.stems.find(s=>s.id===t.incoming_id);return name(incoming)+'冲'+name(natal)+'，取'+x.stem+'（'+x.motif+'）合'+incoming.stem+'，保留原局'+natal.stem;}).join('；'):'尚缺调候用干'+x.stem+'，以'+x.motif+'作独立映射'+(f.tiaohou_groups.some(g=>g.includes(x.stem))?'，配套用干也已同时核对':''),effect:'以独立景物承载'+x.purpose+'取象，保持主尊身份与法器。',compatibility:'未引入新天干冲，未合走需要保留的调候或结构用干。'})),unresolved,skipped,rejected,none_reason};
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
 const brief=r=>(r.type==='自刑'?[...r.branches]:[...new Set(r.branches)]).sort((a,b)=>branches.indexOf(a)-branches.indexOf(b)).join('')+r.type;
 const existing=[...new Set(zodiac.baseAlternatives.flatMap(x=>x.effective_bindings||x.bindings).map(brief))];
 const residual=[...new Set(zodiac.baseAlternatives.flatMap(x=>x.residual_relations).map(brief))];
 const released=[...new Set(zodiac.baseAlternatives.flatMap(x=>x.suppressed_punishments||[]).map(brief))];
 const emptyReason=(existing.length?'已有'+existing.slice(0,3).join('、')+'，这些组合无需再补成员。':'当前没有需要补足的既有会合。')+(released.length?'参与这些有效合的具体地支已解除涉及它们的'+released.join('、')+'。':'')+(residual.length?'尚未解除'+residual.slice(0,2).join('、')+'；新增生肖没有同时改善这些关系且不引入新刑害或损失既有有利合的方案，因此不额外添加。':'没有剩余冲刑害需要回应，因此不额外添加生肖。');
 const zodiacItems=zodiac.added.map(b=>{
  const relation=zodiac.alternatives.flatMap(x=>x.bindings).find(r=>r.target_ids.includes('symbolic.'+b));
  const target_ids=relation?.target_ids.filter(id=>!id.startsWith('symbolic.'))||[];
  // Multi-animal completions are recorded explicitly rather than pretending both partners are real branches.
  return {animal:animals[branches.indexOf(b)],branch:b,method:relation?.type+'取象',target_ids,symbolic_target_ids:relation?.target_ids.filter(id=>id.startsWith('symbolic.')&&id!=='symbolic.'+b)||[],reason:'取'+animals[branches.indexOf(b)]+'（'+b+'）与'+target_ids.map(branchName).concat((relation?.target_ids||[]).filter(id=>id.startsWith('symbolic.')&&id!=='symbolic.'+b).map(id=>'另配生肖'+animals[branches.indexOf(id.slice(-1))]+'（'+id.slice(-1)+'）')).join('、')+'组成'+brief(relation)+'，'+(bindingElement(relation)?'呼应喜用'+bindingElement(relation)+'；':'牵合对应地支；')+'不新增冲刑害，也不拆开已有有利组合。',effect:'作为次要陪伴呼应'+label+'，与主尊固有坐骑分别呈现。'};
 });
 const supports=calendar.stems.filter(x=>x.id.startsWith('transit.')&&[f.primary_element,f.secondary_element].includes(stemElement(x.stem)));
 const dynamic=supports.length?'当前岁运透干中，'+supports.map(x=>(source[x.id]||'岁运')+'天干'+x.stem).join('、')+'已提供喜用方向的支持，画面不以重复堆叠同类元素为目标。':'当前岁运需结合原局喜用取舍，画面沿用稳定主调，不把单日出现的五行重新指定为原局喜用。';
 const prompt=[deity.name+'为主体，主题为'+label+'。保持该主尊的传统身份、固定身色、服饰、手势和固有配属；不新增未确定的法器，不将喜用色覆盖固定身色。',...colors.map(x=>x.name+' '+x.hex),'额外生肖：'+(names.join('、')||'无')+'；次要陪伴，不作坐骑。','独立天干景物：'+(stemPlan.items.map(x=>x.motif).join('、')||'无')+'。','背景只用疏朗低细节云卷，不增加其他命理景物、动物、文字或日期。',artDirection(input.artStyle)].join('\n');
 const mapping={wish_id:wish,title:label+'·'+primary[0]+'意祈福',deity:deity.name,primary_element:f.primary_element,secondary_element:f.secondary_element||'',rotation_reason:history.length?'在本愿望可用候选中比较近期次数与最近展示，适配优先，再安排轮换。':'',overview:'这幅画以'+deity.name+'呼应你'+label+'的心愿。'+primary[0]+'色建立主调'+(secondary?'，'+secondary[0]+'色辅助衬托':'')+'，主尊、'+(names.length?names.join('与')+'陪伴、':'')+(stemPlan.items.length?stemPlan.items.map(x=>x.motif).join('与')+'景物及':'')+'疏朗流云共同寄托祝愿。'+deity.blessing,blessing:'愿你'+label+'，心有所向，行有所成。',elements:[{name:deity.name,meaning:deity.blessing},...colorReasons.map(x=>({name:x.name+'色',meaning:x.reason})),...zodiacItems.map(x=>({name:x.animal,meaning:x.effect})),...stemPlan.items.map(x=>({name:x.motif,meaning:x.reason}))],colors,zodiac:names,stem_symbols:stemPlan.items.map(({stem,motif})=>({stem,motif})),image_prompt:prompt,rationale:{intro:'以'+label+'为今日主题，沿用原局喜用，以主尊、配色和经筛选的意象共同表达祈愿。',foundation:{...f},colors:colorReasons,deity:{name:deity.name,wish_id:wish,direction:({木:'东方',火:'南方',土:'中央',金:'西方',水:'北方'})[Object.keys(DIRECTIONS).find(k=>DIRECTIONS[k]===deity.name)]||'',reason:deity.reason,effect:deity.blessing,history_refs:history.map(x=>x.id),today_reason:dynamic,diversity_reason:history.length?'已比较近期同愿望与跨愿望使用次数和最近展示；先保持愿望与取用适配，再考虑轮换。':''},zodiac:{items:zodiacItems,effective_bindings:assessment.values.filter(x=>x.effective&&base.branch_relations.some(r=>relationKey(r)===x.key)).map(x=>({...base.branch_relations.find(r=>relationKey(r)===x.key),condition_reason:x.reason})),existing_branch_ids:base.branches.map(x=>x.id),existing_analysis:details+'。成员齐全即按有效牵合处理，凡能参与会合的地支不再论冲；三会、三合、六合按优先级分配，参与有效合的具体实例解除涉及它的刑和自刑，其他刑害保留；三刑须三支齐全，自刑同支两见，破未启用。',existing_relations:base.branch_relations.map(r=>({...r,interpretation:bindingTypes.includes(r.type)?assessment.values.find(x=>x.key===relationKey(r))?.reason||'只记录成员关系，不直接认定合化。':'此关系按已确定的成立口径记录；冲、刑及自刑须核对是否涉及有效合成员，六害保留。'})),reason_if_empty:names.length?'':emptyReason},stems:{items:stemPlan.items,reason_if_empty:stemPlan.none_reason}}};
 // Actual selections may contain up to ten stem motifs; keep the presentation element list within the established contract.
 if(mapping.elements.length>12)mapping.elements=[...mapping.elements.filter(x=>!stemPlan.items.some(t=>t.motif===x.name)),{name:'天干景物',meaning:stemPlan.items.map(x=>x.motif+'：'+x.reason).join('；')}];
 return mapping;
}
async function generateRuleMappingInternal(config,input,calendar,history=[],fetcher=fetch){
 const started=Date.now(),store=storeFor(config),recent=selectionHistory(history,input.today).filter(x=>x.date<input.today);
 const f=await atStage('foundation',()=>foundationFor(config,input,calendar,store,fetcher));
 const mappingSignature=hash({input,calendar,foundation:{value:f.value,origin:f.origin},recent,artVersion:ART_STYLE_VERSION,catalogVersion:CATALOG_VERSION});
 const mappingKey=cacheKey(config,'mapping',mappingSignature),cachedMapping=await store.get(mappingKey);
 if(cachedMapping?.signature===mappingSignature&&cachedMapping.version===PRAYER_ENGINE_VERSION)return structuredClone(cachedMapping.value);
 const base=evidenceContext(calendar,STEM_PARTNER),models=zodiacModels(base.branches);
 const remaining=(Number(config.ANALYSIS_BUDGET_MS)||108000)-(Date.now()-started);
 if(remaining<=0)throw Object.assign(new Error('规则补判超过本次计算时限。'),{code:'rule_generation_failed'});
 const assessment=await atStage('bindings',()=>assessDailyConditions(calendar,f.value,models));
 const dynamicFoundation={...f.value,unmet_tiaohou_stems:assessment.unmet_tiaohou_stems??f.value.unmet_tiaohou_stems};
 const zodiac=selectZodiac(models,assessment,f.value),stemPlan=selectStemSymbols(calendar,dynamicFoundation,assessment.effective_stem_bindings||[]);
 const wish=chooseWish(input,recent),deity=chooseDeity(wish,f.value,recent);
 const raw=compose(input,calendar,recent,f.value,deity,wish,zodiac,stemPlan,assessment);
 const mapping=await atStage('composition',()=>validateMapping(raw,input,calendar,recent));
 const snapshot=relationSnapshot(calendar);
 for(const section of mapping.reading.sections){if(/生肖/.test(section.title))section.body=branchExplanation(snapshot,section.body);if(/天干/.test(section.title))section.body=stemExplanation(snapshot,section.body);}
 mapping.professional=mapping.reading.sections.map(s=>s.title+'\n'+s.body).join('\n\n');
 Object.assign(mapping,{wish_label:WISHES.find(w=>w.id===wish).label,birth_summary:birthSummary(calendar),art_style:input.artStyle||'cute',art_style_version:ART_STYLE_VERSION,engine:{version:PRAYER_ENGINE_VERSION,catalog_version:CATALOG_VERSION,foundation:f,assessment_origin:assessment.origin,assessment_signature:assessment.signature,condition_assessment:assessment,theme_rule:'user_order_history_rotation',zodiac_candidates:zodiac.evaluated,zodiac_allocations:zodiac.alternatives,relation_snapshot:snapshot,unresolved_stem_clashes:stemPlan.unresolved,stem_decisions:{skipped:stemPlan.skipped,rejected:stemPlan.rejected,none_reason:stemPlan.none_reason}},confidence:f.origin==='confirmed_profile'?'confirmed':'provisional'});
 await store.put(mappingKey,{signature:mappingSignature,version:PRAYER_ENGINE_VERSION,value:mapping});
 config.ANALYSIS_DIAGNOSTIC?.({outcome:'rules_complete',elapsedMs:Date.now()-started,engineVersion:PRAYER_ENGINE_VERSION,assessmentOrigin:assessment.origin,candidateCount:models.length,ruleDecisionCount:assessment.decisions?.filter(d=>d.origin==='rules').length||0});
 return mapping;
}

export async function generateRuleMapping(config,input,calendar,history=[],fetcher=fetch){
 try{return await generateRuleMappingInternal(config,input,calendar,history,fetcher);}
 catch(error){
  const diagnostic={id:hash([Date.now(),Math.random()]).slice(0,16),pendingModels:error.pendingModels||[],completedModels:error.completedModels||0,dailyStemsPending:error.dailyStemsPending??null,version:PRAYER_ENGINE_VERSION,date:input.today,at:new Date().toISOString(),code:error.code||'rule_generation_failed',section:error.ruleSection||null,reason:String(error.message||'').slice(0,300),issues:error.issues?.map(x=>({section:x.section,code:x.code}))||[],input_signature:natalFingerprint(input,calendar)};
  error.diagnosticId=diagnostic.id;
  config.ANALYSIS_DIAGNOSTIC?.({...diagnostic,outcome:'rules_failed'});
  try{await storeFor(config).put(cacheKey(config,'failures',hash([diagnostic,Math.random()])),diagnostic);}catch{/* Preserve the original failure when the diagnostic store itself is unavailable. */}
  if(!error.service&&!error.status&&!error.code)error.code='rule_generation_failed';
  throw error;
 }
}
