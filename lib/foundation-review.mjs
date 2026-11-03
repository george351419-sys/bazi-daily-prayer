import {foundationChecks,CHECK_VERSION} from './foundation-checks.mjs';
export async function reviewFoundation(calendar,first,reconsider,{confirmed=false,reuseRecordedReview=false}={}){
 if(reuseRecordedReview&&first.cross_check?.version===CHECK_VERSION&&['agreed','model_second_retained','model_second_agreed','confirmed_premise'].includes(first.cross_check.status))return first;
 const initialChecks=foundationChecks(calendar,first);
 if(confirmed)return {...first,cross_check:{version:CHECK_VERSION,status:'confirmed_premise',model_calls:0,initial_checks:initialChecks,decision:'用户确认前提优先；数值检查不触发模型改写。'}};
 if(!initialChecks.conflicts.length)return {...first,cross_check:{version:CHECK_VERSION,status:'agreed',model_calls:1,initial:first,initial_checks:initialChecks,decision:'规则校验与模型初判一致，采用初判。'}};
 const second=await reconsider({initial:first,checks:initialChecks,instruction:'请根据列出的顺逆用与数值强弱差异重新判断原局。规则仅作辅助，不要求迎合分数；若维持原判断，须给出具体的月令、根气、格局成败救应或例外依据。返回完整档案，补充review_reason。无论是否改变，第二次合法输出作为最终模型结论，不再因相同冲突重复请求。'});
 if(typeof second?.review_reason!=='string'||second.review_reason.trim().length<4||second.review_reason.length>350)throw Object.assign(new Error('复判须提供具体依据，不能省略review_reason。'),{code:'rule_assessment_invalid',ruleSection:'foundation'});
 const finalChecks=foundationChecks(calendar,second);
 return {...second,assessment_source:{kind:'model_reconsidered',label:'模型经规则差异复判后的第二次结论'},cross_check:{version:CHECK_VERSION,status:finalChecks.conflicts.length?'model_second_retained':'model_second_agreed',model_calls:2,initial:first,initial_checks:initialChecks,second,final_checks:finalChecks,decision:'以模型第二次输出为最终结论；剩余差异保留，不再强制改成规则结论。'}};
}
