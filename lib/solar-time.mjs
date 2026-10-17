import {PLACES} from './data/places.mjs';
const normalize=s=>s.replace(/[\s,，/·]+/g,'');
const short=s=>s.replace(/(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|地区|省|市|区|县)$/,'');
const index=new Map();
for(const place of PLACES){
 const parts=[place.province,place.city,place.area].filter(Boolean);
 const combinations=items=>items.reduce((out,item)=>out.flatMap(prefix=>[...new Set([item,short(item)])].map(part=>prefix+part)),['']);
 const aliases=new Set(combinations(parts));
 if(place.city)for(const alias of combinations(parts.slice(1)))aliases.add(alias);
 if(place.area){aliases.add(place.area);aliases.add(short(place.area));if(place.city){aliases.add(place.city+place.area);aliases.add(short(place.city)+short(place.area));}}
 else{const leaf=place.city||place.province;aliases.add(leaf);aliases.add(short(leaf));}
 for(const alias of aliases){const key=normalize(alias);if(!key)continue;if(!index.has(key))index.set(key,[]);index.get(key).push(place);}
}
export function resolvePlace(city){
 if(!city?.trim())return null;
 const matches=[...new Map((index.get(normalize(city))||[]).map(p=>[p.name,p])).values()];
 if(matches.length===1)return {...matches[0],precision:matches[0].area?'区县中心近似经度':'城市中心近似经度'};
 if(matches.length>1)throw new Error('出生地有重名，请补充省、市或从提示中选择，例如：'+matches.slice(0,3).map(p=>p.name).join('、')+'。');
 throw new Error('暂未识别这个出生地，请填写中国境内城市/区县并从提示中选择；也可留空，按北京时间排盘。');
}
// NOAA equation of time; UTC instant -> apparent minus mean solar time, minutes.
export function equationOfTime(utcDate){
 const t=(utcDate.getTime()/86400000+2440587.5-2451545)/36525,rad=Math.PI/180;
 const l=((280.46646+t*(36000.76983+0.0003032*t))%360)*rad;
 const m=(357.52911+t*(35999.05029-0.0001537*t))*rad;
 const e=0.016708634-t*(0.000042037+0.0000001267*t);
 const mean=23+(26+(21.448-t*(46.815+t*(0.00059-t*0.001813)))/60)/60;
 const obliq=(mean+0.00256*Math.cos((125.04-1934.136*t)*rad))*rad;
 const y=Math.tan(obliq/2)**2;
 return (y*Math.sin(2*l)-2*e*Math.sin(m)+4*e*y*Math.sin(m)*Math.cos(2*l)-0.5*y*y*Math.sin(4*l)-1.25*e*e*Math.sin(2*m))/rad*4;
}
const stamp=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
export function solarTimeFor(civilSolar,place){
 const parts=[civilSolar.getYear(),civilSolar.getMonth()-1,civilSolar.getDay(),civilSolar.getHour(),civilSolar.getMinute(),civilSolar.getSecond()];
 const wall=Date.UTC(...parts),civil=stamp(wall);
 if(!place)return {applied:false,mode:'北京时间',civil,trueSolar:null,offsetSeconds:0,note:'未填写出生地，未校正真太阳时。'};
 const longitudeMinutes=4*(place.longitude-120),equationMinutes=equationOfTime(new Date(wall-8*3600000));
 const offsetSeconds=Math.round((longitudeMinutes+equationMinutes)*60),trueSolar=stamp(wall+offsetSeconds*1000);
 return {applied:true,mode:'真太阳时',civil,trueSolar,offsetSeconds,longitudeMinutes:Number(longitudeMinutes.toFixed(4)),equationMinutes:Number(equationMinutes.toFixed(4)),place:place.name,longitude:place.longitude,precision:place.precision,note:'按'+place.name+'的'+place.precision+'计算，包含经度时差与均时差。'};
}
