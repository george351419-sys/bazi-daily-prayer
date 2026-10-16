import {SYSTEM} from './prompt.mjs';
import {deepseek} from './providers.mjs';
import {validateMapping,WISHES} from './domain.mjs';
export async function analyzeMapping(config,input,calendar,history=[]){
 const user={calendar,input,wishes:WISHES.filter(w=>input.wishes.includes(w.id)),history:history.slice(-14)};
 const final='\n最终强约束：W02单尊冷启动时必须按primary_element选择deity：木=萧升，火=陈九公，土=赵公明，金=曹宝，水=姚少司。不能说赵公明适合木却不提供真实轮换理由。保持用户层、全部要素、专业层、生图提示词相同主体。默认单主尊，造像未审不要虚构法器。';
 let raw=await deepseek(config,SYSTEM+final,user),mapping;
 try{mapping=validateMapping(raw,input);}catch(e){raw=await deepseek(config,SYSTEM+final,{...user,previous_output:raw,validation_error:e.message,instruction:'仅修正未通过校验的映射并同步全部相关解读，输出完整JSON，不更改历法，不输出解释性前缀。'});mapping=validateMapping(raw,input);}
 mapping.wish_label=WISHES.find(w=>w.id===mapping.wish_id).label;
 mapping.professional+='\n\n历法核验记录：\n'+JSON.stringify(calendar,null,2)+'\n\n本结果由DeepSeek按项目规则初判，未完成人工造像或命理审核。';
 return mapping;
}
