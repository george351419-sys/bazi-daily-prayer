import {normalizeBirthDate,daysInPicker} from './date-input.js?v=20261017-solar';
import {PLACE_NAMES} from './place-names.js?v=20261017-solar';
export function setupBirthInputs(form){
 const dialog=document.querySelector('#birth-picker'),year=document.querySelector('#birth-year'),month=document.querySelector('#birth-month'),day=document.querySelector('#birth-day');
 const options=(select,values,suffix)=>{select.replaceChildren(...values.map(n=>{const option=document.createElement('option');option.value=n;option.textContent=n+suffix;return option;}));};
 const refreshDays=()=>{const previous=Number(day.value)||1;options(day,Array.from({length:daysInPicker(Number(year.value),Number(month.value),form.calendar.value)},(_,i)=>i+1),'日');day.value=Math.min(previous,day.options.length);};
 document.querySelector('#open-birth-picker').onclick=()=>{
  let parts;try{parts=normalizeBirthDate(form.birthDate.value).split('-').map(Number);}catch{parts=[1990,1,1];}
  const maximum=Number(form.birthDate.dataset.maxYear)||new Date().getFullYear();
  options(year,Array.from({length:maximum-1899},(_,i)=>maximum-i),'年');options(month,Array.from({length:12},(_,i)=>i+1),'月');
  year.value=Math.max(1900,Math.min(maximum,parts[0]));month.value=parts[1];refreshDays();day.value=Math.min(parts[2],day.options.length);
  document.querySelector('#picker-calendar-label').textContent=form.calendar.value==='lunar'?'选择农历生日；闰月请在表单中勾选':'选择公历生日';
  dialog.showModal();
 };
 year.onchange=refreshDays;month.onchange=refreshDays;
 for(const select of [year,month,day])select.addEventListener('wheel',event=>{event.preventDefault();select.selectedIndex=Math.max(0,Math.min(select.options.length-1,select.selectedIndex+Math.sign(event.deltaY)));select.dispatchEvent(new Event('change'));},{passive:false});
 document.querySelector('#confirm-birth-picker').onclick=()=>{form.birthDate.value=normalizeBirthDate(`${year.value}-${month.value}-${day.value}`);dialog.close();form.birthDate.dispatchEvent(new Event('change',{bubbles:true}));};
 document.querySelector('#cancel-birth-picker').onclick=()=>dialog.close();
 form.birthDate.addEventListener('blur',()=>{if(!form.birthDate.value.trim())return;try{form.birthDate.value=normalizeBirthDate(form.birthDate.value);form.birthDate.setCustomValidity('');}catch(e){form.birthDate.setCustomValidity(e.message);}});
 form.birthDate.addEventListener('input',()=>form.birthDate.setCustomValidity(''));
 const list=document.querySelector('#birthplace-options'),note=document.querySelector('#time-basis-note');
 form.city.addEventListener('input',()=>{
  const term=form.city.value.trim();list.replaceChildren();
  if(term)for(const name of PLACE_NAMES.filter(name=>name.includes(term)||name.replace(/[省市区县]/g,'').includes(term)).slice(0,20)){const option=document.createElement('option');option.value=name;list.append(option);}
  note.textContent=term?'将按所填城市或区县中心的近似经度，结合均时差校正真太阳时。':'未填写出生地：按北京时间排盘，不校正真太阳时。';
 });
}
