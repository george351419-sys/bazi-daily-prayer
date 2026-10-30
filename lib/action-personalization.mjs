import {actionCards} from '../content/action-alternatives.mjs';
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

// Five distinct movements, including the scheduled recommendation. Generic fifth
// option is explicitly a scene fallback, not a claimed meridian/target match.
export function actionOptions(action){return [action,...(action.alternatives||[])];}
export function withActionAlternatives(days){
 return days.map(day=>day.map(action=>{
  const cards=actionCards.filter(c=>c.slot===action.branch||c.id.startsWith('F'));
  const seen=new Set(actionCards.find(c=>c.id===action.id)?.movement_keys||[]);
  const alternatives=[];
  for(const c of cards){
   if(c.id===action.id||c.movement_keys.some(key=>seen.has(key)))continue;
   c.movement_keys.forEach(key=>seen.add(key));
   let text=c.screen_copy.replace(/\{n\}秒/g,'片刻').replace(/\{n\}/g,'几');
   if(c.id==='M09'||c.id==='M28')text=text.replace('掌心轻覆','隔衣轻覆');
   if(c.id==='F23')text='坐稳，双手轻握拳再张开几次';
   if(c.id==='F25')text='坐稳，双肩轻抬再放下几次';
   if(c.id==='F22')text='坐稳，放松下颌，上下牙分开片刻';
   alternatives.push({...action,id:c.id,title:c.title,text,detail:(c.conditions||'坐稳后舒适地轻动双手。')+'；仅作传统主题或日常活动参考，非治疗。',relation_type:c.relation_type||'general_scene_fallback',source:'bazi-micro-actions/catalog.json#'+c.id,movement_keys:c.movement_keys,review_status:c.review_status,number_basis:null});
   if(alternatives.length===4)break;
  }
  if(alternatives.length!==4)throw new Error('Five distinct actions unavailable for '+action.branch);
  return {...action,alternatives};
 }));
}
export function personalizeActionOptions(mapping){
 const days=withActionAlternatives(actionPlans),primary=mapping?.primary_element,secondary=mapping?.secondary_element||primary;
 return days.map((day,di)=>day.map((action,i)=>({...personalize(action,di?secondary:primary,i),alternatives:action.alternatives.map((a,j)=>personalize(a,di?secondary:primary,i+j+1))})));
}
