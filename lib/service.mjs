import {SYSTEM} from './prompt.mjs';
import {deepseek} from './providers.mjs';
import {validateMapping,WISHES} from './domain.mjs';
export async function analyzeMapping(config,input,calendar,history=[]){
 const deadline=Date.now()+(Number(config.ANALYSIS_BUDGET_MS)||370000);
 const bounded=()=>({...config,DEEPSEEK_TIMEOUT_MS:Math.max(1,Math.min(Number(config.DEEPSEEK_TIMEOUT_MS)||180000,deadline-Date.now()))});
 const user={calendar,input,wishes:WISHES.filter(w=>input.wishes.includes(w.id)),history:history.slice(-14)};
 const final='\n最终强约束：W02单尊冷启动时必须按primary_element选择deity：木=萧升，火=陈九公，土=赵公明，金=曹宝，水=姚少司。不能说赵公明适合木却不提供真实轮换理由。保持用户层、全部要素、专业层、生图提示词相同主体。默认单主尊，造像未审不要虚构法器。用户解读重点写开运纳福的文化寓意：根据真实愿望，从迎福纳财、财源汇聚、丰足安稳、贵人相助、事业顺遂、平安守护、良缘和合等角度选择契合的表达。整体先讲这幅图的祈福主题及各元素怎样共同呼应心愿；每个已选要素都讲其吉祥寓意与祝愿。自然使用“寓意”“象征”“寄托”“愿”等词，不承诺现实效果，不给投资、医疗等行为建议。不要把篇幅用来反复讲“不宣称”“不承诺”“没有承诺暴富”“只是装饰”“并非真的”等自我否定或免责声明；用户层与专业解析都不要出现“尚未经人工复核”“未完成人工审核”等工作流提示。置信等级仍保存在内部字段，专业层如实列出具体取用假设和关系成立条件，不宣称已通过人工审核。普通装饰可讲美好寓意但不得虚构法器、五行补益或神祇职掌。例：福德正神守护生活的丰足，土黄意在厚载积福，暖光寓意迎福纳祥，流云寄托福气相随。不要介绍没画出来的金银或未选生肖，不凭空增加财物。';
 let raw=await deepseek(bounded(),SYSTEM+final,user),mapping;
 try{mapping=validateMapping(raw,input);}catch(e){raw=await deepseek(bounded(),SYSTEM+final,{...user,previous_output:raw,validation_error:e.message,instruction:'仅修正未通过校验的映射并同步全部相关解读，输出完整JSON，不更改历法，不输出解释性前缀。'});mapping=validateMapping(raw,input);}
 mapping.wish_label=WISHES.find(w=>w.id===mapping.wish_id).label;
 mapping.professional+='\n\n历法核验记录：\n'+JSON.stringify(calendar,null,2);
 return mapping;
}
