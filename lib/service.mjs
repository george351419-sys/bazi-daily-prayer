import {SYSTEM} from './prompt.mjs';
import {deepseek} from './providers.mjs';
import {validateMapping,WISHES,STEM_PARTNER} from './domain.mjs';
import {evidenceContext} from './selection-rationale.mjs';
import {birthSummary} from './consumer-reading.mjs';
export async function analyzeMapping(config,input,calendar,history=[]){
 const deadline=Date.now()+(Number(config.ANALYSIS_BUDGET_MS)||370000);
 const bounded=()=>({...config,DEEPSEEK_TIMEOUT_MS:Math.max(1,Math.min(Number(config.DEEPSEEK_TIMEOUT_MS)||180000,deadline-Date.now()))});
 const user={calendar,selection_evidence:evidenceContext(calendar,STEM_PARTNER),input,wishes:WISHES.filter(w=>input.wishes.includes(w.id)),history:history.slice(-14)};
 const final='本轮最新文案要求：不要出现“这是传统命理的一种取象参考，不是对现实结果的判断”“并不代表某种具体的收益承诺”“并不表示现实中的问题已经消除，也不构成对任何具体事件的预测”及同义的免责声明或自我否定。直接给出专业、清晰、有依据的取用解释，不虚构收益保证或实盘合化。\n新增产品规则（高于下方旧版参考文档）：出生地留空则按北京时间；填写并识别出生地则按传入calendar.timeCorrection的真太阳时，禁止自行换算或更改四柱。按最新专业解读协议返回rationale，服务端据此生成喜用配色、主尊、生肖和天干的逐项专业解读。必须给具体命理依据和作用，禁止用通用吉祥话代替依据。内部关系ID、F/G/T、枚举表、置信等级、审核项、JSON、历法核验记录只用于后台校验，不得出现在任何用户解读。专业性来自准确而易懂的结论与依据，不能靠展示调试过程。不要重复生成professional或reading，必须完整返回rationale。\n\n最终强约束：W02单尊冷启动时必须按primary_element选择deity：木=萧升，火=陈九公，土=赵公明，金=曹宝，水=姚少司。不能说赵公明适合木却不提供真实轮换理由。保持用户层、全部要素、专业层、生图提示词相同主体。默认单主尊，造像未审不要虚构法器。用户解读重点写开运纳福的文化寓意：根据真实愿望，从迎福纳财、财源汇聚、丰足安稳、贵人相助、事业顺遂、平安守护、良缘和合等角度选择契合的表达。整体先讲这幅图的祈福主题及各元素怎样共同呼应心愿；每个已选要素都讲其吉祥寓意与祝愿。自然使用“寓意”“象征”“寄托”“愿”等词，不承诺现实效果，不给投资、医疗等行为建议。不要把篇幅用来反复讲“不宣称”“不承诺”“没有承诺暴富”“只是装饰”“并非真的”等自我否定或免责声明；用户层与专业解析都不要出现“尚未经人工复核”“未完成人工审核”等工作流提示。置信等级仍保存在内部字段，命理解读自然交代参考前提和适用条件，不输出人工审核或内部流程。普通装饰可讲美好寓意但不得虚构法器、五行补益或神祇职掌。例：福德正神守护生活的丰足，土黄意在厚载积福，暖光寓意迎福纳祥，流云寄托福气相随。不要介绍没画出来的金银或未选生肖，不凭空增加财物。';
 let raw=await deepseek(bounded(),SYSTEM+final,user),mapping;
 try{mapping=validateMapping(raw,input,calendar);}catch(e){raw=await deepseek(bounded(),SYSTEM+final,{...user,previous_output:raw,validation_error:e.message,instruction:'仅修正未通过校验的映射并同步全部相关解读，输出完整JSON，不更改历法，不输出解释性前缀。'});mapping=validateMapping(raw,input,calendar);}
 mapping.wish_label=WISHES.find(w=>w.id===mapping.wish_id).label;
 mapping.birth_summary=birthSummary(calendar);
 return mapping;
}
