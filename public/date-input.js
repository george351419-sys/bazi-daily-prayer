export function normalizeBirthDate(value){
 const match=String(value||'').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
 if(!match)throw new Error('请填写出生日期，例如 1990-1-1。');
 const [year,month,day]=match.slice(1).map(Number);
 if(year<1900||month<1||month>12||day<1||day>31)throw new Error('出生日期超出范围，请重新填写。');
 return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function daysInPicker(year,month,calendar){return calendar==='lunar'?30:new Date(Date.UTC(year,month,0)).getUTCDate();}
