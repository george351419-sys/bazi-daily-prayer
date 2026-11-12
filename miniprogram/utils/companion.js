const {answers,actionPlans}=require('./content');
function searchAnswers(query){const key=String(query||'').normalize('NFKC').trim().toLowerCase().slice(0,120);return key?answers.filter(a=>[a.id,a.text,a.theme,a.tendency,a.phone_detail].join(' ').toLowerCase().includes(key)):[];}
function currentActions(status,artwork,now=Date.now()){
 const local=new Date(now+8*3600000),hour=local.getUTCHours(),date=local.toISOString().slice(0,10);
 if(hour<7||hour>=23)return {key:date+'-rest',label:'夜间休息',options:[]};
 const start=7+2*Math.floor((hour-7)/2),label=String(start).padStart(2,'0')+':00–'+String(start+2).padStart(2,'0')+':00';
 const artworkId=artwork?.id||artwork?.artworkId,days=status?.planDays||[],day=days.find(d=>artworkId&&d.artworkId===artworkId)||days.find(d=>d.date===date);
 const action=day?.actions?.find(a=>Number(a.hour)===start);
 const pool=action?[action,...(action.alternatives||[])]:actionPlans.flat().filter(a=>Number(a.hour)===start);
 const seen=new Set(),options=pool.filter(a=>{if(!a.text||seen.has(a.text))return false;seen.add(a.text);return true;});
 return {key:date+'-'+start+'-'+(day?.artworkId||'sample'),label:(action?.branch? action.branch+'时 · ':'')+label,options};
}
module.exports={currentActions,searchAnswers};
