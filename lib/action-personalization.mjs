import {actionPlans} from '../content/ritual-content.mjs';

const NUMBERS={水:[1,6],火:[2,7],木:[3,8],金:[4,9],土:[5,10]};
const UNITS=[[/几次/g,'次'],[/几轮/g,'轮'],[/几回/g,'回'],[/几下/g,'下'],[/几步/g,'步'],[/几个/g,'个'],[/片刻/g,'秒']];

function personalize(action,element,index){
 const numbers=NUMBERS[element]||[],number=numbers[index%numbers.length];
 if(!number)return {...action,number_basis:null};
 let text=action.text;
 for(const [pattern,unit] of UNITS)text=text.replace(pattern,number+unit);
 const detail=String(action.detail||'').replace('当前未确认喜用数字，不套用命理次数。','本次按'+element+'的河图数取'+number+'，仅作传统数字取象；动作以舒适为准。');
 return {...action,text,detail,number_basis:{system:'河图生成数',element,number,slot:index%2?'second':'first'}};
}

export function personalizeActionPlans(mapping,base=actionPlans){
 if(!mapping?.primary_element)return base;
 const primary=mapping.primary_element,secondary=mapping.secondary_element||primary;
 return base.map((day,dayIndex)=>day.map((action,index)=>personalize(action,dayIndex===0?primary:secondary,index)));
}
