const {answers}=require('./content');
const actionPlans=require('./action-options');
function searchAnswers(query){const key=String(query||'').normalize('NFKC').trim().toLowerCase().slice(0,120);return key?answers.filter(a=>[a.id,a.text,a.theme,a.tendency,a.phone_detail].join(' ').toLowerCase().includes(key)):[];}
function actionReason(action){
 const text=action.text||'';
 if(/下颌|上下牙/.test(text))return '给自己一个停止用力的小提示，把注意力从眼前的事移回身体，留一刻安静。';
 if(/脚|足|趾|踝/.test(text))return '用一个幅度很小的足部动作，打断长时间保持同一姿势的节奏，把注意力带回双脚与当下。';
 if(/肩|臂|双掌再放下/.test(text))return '借轻柔的肩臂动作暂停手上的事，在这个时段留一点活动和重新安顿的空间。';
 if(/掌|指|手/.test(text))return '用双手完成一件简单的小事，让注意力暂时离开屏幕或思绪，回到眼前可以感受到的动作。';
 return '在这个时段留一个短暂停顿，通过轻柔、容易完成的动作，把注意力带回自己。';
}
function currentActions(status,artwork,now=Date.now()){
 const local=new Date(now+8*3600000),hour=local.getUTCHours(),date=local.toISOString().slice(0,10);
 if(hour<7||hour>=23)return {key:date+'-rest',label:'夜间休息',options:[]};
 const start=7+2*Math.floor((hour-7)/2),label=String(start).padStart(2,'0')+':00–'+String(start+2).padStart(2,'0')+':00';
 const artworkId=artwork?.id||artwork?.artworkId,days=status?.planDays||[],day=days.find(d=>artworkId&&d.artworkId===artworkId)||days.find(d=>d.date===date);
 const action=day?.actions?.find(a=>Number(a.hour)===start);
 const fallback=actionPlans.flat().filter(a=>Number(a.hour)===start),base=fallback.find(a=>a.id===action?.id)||fallback[0];
 const pool=action?[action,...(action.alternatives?.length?action.alternatives:[base,...(base?.alternatives||[])].filter(a=>a&&a.id!==action.id))]:[base,...(base?.alternatives||[])].filter(Boolean);
 const seen=new Set(),options=pool.filter(a=>{if(!a.text||seen.has(a.text))return false;seen.add(a.text);return true;});
 return {key:date+'-'+start+'-'+(day?.artworkId||'sample'),label:(action?.branch? action.branch+'时 · ':'')+label,options:options.map(a=>({...a,reason:actionReason(a)}))};
}
module.exports={currentActions,searchAnswers};
