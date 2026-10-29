import {SYSTEM} from './prompt.mjs';
import {deepseek} from './providers.mjs';
import {validateMapping,WISHES,STEM_PARTNER,selectionHistory} from './domain.mjs';
import {evidenceContext,repairHints} from './selection-rationale.mjs';
import {birthSummary} from './consumer-reading.mjs';
export async function analyzeMapping(config,input,calendar,history=[],fetcher=fetch){
 const deadline=Date.now()+(Number(config.ANALYSIS_BUDGET_MS)||370000);
 // Give each validation attempt a real slice of the EdgeOne request instead of letting the first model call consume the entire budget.
 const bounded=attempt=>({...config,DEEPSEEK_TIMEOUT_MS:Math.max(1,Math.min(Number(config.DEEPSEEK_TIMEOUT_MS)||180000,Math.floor(Math.max(0,deadline-Date.now())/(3-attempt))))});
 const recent=selectionHistory(history,input.today);
 const user={calendar,selection_evidence:evidenceContext(calendar,STEM_PARTNER),input,wishes:WISHES.filter(w=>input.wishes.includes(w.id)),history:recent};
 const final='新增取用要求：主尊须返回today_reason、history_refs、diversity_reason。history_refs完整引用本次history中全部真实记录的id，有历史时结合近期同愿望优先、跨愿望兼顾的使用次数和最近使用时间，说明今天延续还是轮换及其理由；不能为避免重复牺牲今日愿望、喜用和岁运的适配。无历史时不虚构曾经使用。生肖为空时，必须返回existing_branch_ids（全部selection_evidence.branches的id）、existing_analysis、existing_relations（从branch_relations选真实type和target_ids，加interpretation）。先说明四柱与大运、年月日已有地支、关键合冲刑害，再说明这些关系对今日喜用的作用、为什么新增生肖无必要或会引入新冲刑害、争用已合地支或使喜用失衡。天干五合只回应天干层，不能把天干珠玉、田园等意象作为不加生肖或已处理地支冲刑害的理由。若地支残余关系保留，应独立解释新增生肖为何难以改善而不带来更大取用代价。不能只说不想画动物、简洁或突出主尊；也不能无依据地说现有地支已完美平衡或所有相冲已经化解。branch_relations只是关系成员证据，不能据此跳过月令、合化条件与有限地支资源，也不能把同一支同时认定为多组合已成立。只在用户解释中用中文来源和地支，不显示id。\n本轮最新文案要求：不要出现“这是传统命理的一种取象参考，不是对现实结果的判断”“并不代表某种具体的收益承诺”“并不表示现实中的问题已经消除，也不构成对任何具体事件的预测”及同义的免责声明或自我否定。直接给出专业、清晰、有依据的取用解释，不虚构收益保证或实盘合化。\n新增产品规则（高于下方旧版参考文档）：出生地留空则按北京时间；填写并识别出生地则按传入calendar.timeCorrection的真太阳时，禁止自行换算或更改四柱。按最新专业解读协议返回rationale，服务端据此生成喜用配色、主尊、生肖和天干的逐项专业解读。必须给具体命理依据和作用，禁止用通用吉祥话代替依据。日主的生克、根气直接参照selection_evidence.natal_stem_roles及natal_hidden_stems；不能把财星耗身、食伤泄身误说成扶身，成格利用须另有理由。也须解释岁运已带来的支持如何影响画面取舍，不机械说喜火就越多越好。天干解冲只从selection_evidence.clash_response_options中的response_stem选择，并先检查来干的调候豁免；不要合错原局受保护对象。内部关系ID、F/G/T、枚举表、置信等级、审核项、JSON、历法核验记录只用于后台校验，不得出现在任何用户解读。专业性来自准确而易懂的结论与依据，不能靠展示调试过程。不要重复生成professional或reading，必须完整返回rationale。\n\n最终强约束：W02单尊冷启动时必须按primary_element选择deity：木=萧升，火=陈九公，土=赵公明，金=曹宝，水=姚少司。不能说赵公明适合木却不提供真实轮换理由。保持用户层、全部要素、专业层、生图提示词相同主体。默认单主尊，造像未审不要虚构法器。用户解读重点写开运纳福的文化寓意：根据真实愿望，从迎福纳财、财源汇聚、丰足安稳、贵人相助、事业顺遂、平安守护、良缘和合等角度选择契合的表达。整体先讲这幅图的祈福主题及各元素怎样共同呼应心愿；每个已选要素都讲其吉祥寓意与祝愿。自然使用“寓意”“象征”“寄托”“愿”等词，不承诺现实效果，不给投资、医疗等行为建议。不要把篇幅用来反复讲“不宣称”“不承诺”“没有承诺暴富”“只是装饰”“并非真的”等自我否定或免责声明；用户层与专业解析都不要出现“尚未经人工复核”“未完成人工审核”等工作流提示。置信等级仍保存在内部字段，命理解读自然交代参考前提和适用条件，不输出人工审核或内部流程。普通装饰可讲美好寓意但不得虚构法器、五行补益或神祇职掌。例：福德正神守护生活的丰足，土黄意在厚载积福，暖光寓意迎福纳祥，流云寄托福气相随。不要介绍没画出来的金银或未选生肖，不凭空增加财物。';
 const stemContract=user.selection_evidence.clash_response_options.map(x=>x.rule).join('\n');
 const colorContract='颜色角色契约：恰好一种颜色标为“主色”，其element必须等于primary_element。标为“辅色”的颜色若承担五行作用，element只能是primary_element或secondary_element；secondary_element为空时，只能仍标主喜用。黑、白、台座、留白、轮廓、层次等审美或造像用色一律标element="中性"、role="点缀"（固定身色可标“造像固有色”），不得标成其他五行的辅色。';
 const system=SYSTEM+final+'\n'+colorContract+'\n本次排盘解冲候选（仅按来冲干选择，所需调候来干豁免）：\n'+stemContract+'\n颜色校验：主色属主喜用；五行辅色仅能属主/辅喜用。非喜用的台座、留白或造像颜色应明确作为点缀或造像固有色，不把审美配色写成新的喜用。';
 let raw,mapping,request=user;const errors=[];
 for(let attempt=0;attempt<3;attempt++){
  try{raw=await deepseek(bounded(attempt),system,request,fetcher);mapping=validateMapping(raw,input,calendar,recent);break;}
  catch(e){
   if(attempt===2||deadline-Date.now()<100||(e.service&&!['invalid_json','truncated_output','network_or_timeout'].includes(e.code)))throw e;
   errors.push(e.message);
   const issues=errors.join('\n');
   const zodiac= /天干五合意象不能替代地支层调整/.test(issues)?'本轮必须单独重写 rationale.zodiac.existing_analysis、existing_relations[].interpretation 与 reason_if_empty。不得出现“以/用/通过……天干……回应/缓解/化解/解冲/疏解”的句式；直接用真实六合、六冲、六害、相刑、三合、三会、地支五行、喜用以及新增生肖会争用合支或带来新冲刑害来说明取舍。天干内容只放在 rationale.stems。':'';
   const colors= /五行辅色须有主辅喜用依据/.test(issues)?'本轮必须逐一修正 rationale.colors。role=主色 的颜色 element 必须等于 primary_element；role=辅色 时，若它承担五行生扶，element 必须等于 primary_element 或 secondary_element。仅为画面层次、台座、留白、轮廓或审美需要加入、并不对应主辅喜用的颜色，必须设 element=\"中性\" 且 role=\"点缀\"，不能标成辅色。':'';
   request={...user,validation_errors:[...errors],validation_error:e.message,repair_hints:repairHints(raw,calendar,STEM_PARTNER),instruction:colors+zodiac+'此前方案未通过校验。按真实排盘和selection_evidence中的clash_response_options重新选取所有要素，整体重写rationale与image_prompt，只输出一个完整合法的JSON对象。分清来冲干和被冲干；所有调候新增干必须属于本次明确所需列表。无合格附加意象时不添加并说明具体取舍，不能为了沿用旧方案写出相互矛盾的解释。'};
  }
 }
 mapping.wish_label=WISHES.find(w=>w.id===mapping.wish_id).label;
 mapping.birth_summary=birthSummary(calendar);
 return mapping;
}
