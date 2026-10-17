export function readingText(reading){return [reading.intro,...reading.sections.map(s=>s.title+'\n'+s.body)].join('\n\n');}
export function birthSummary(calendar){
 const t=calendar.timeCorrection;
 return {pillars:calendar.natal,time_basis:t?.applied?'真太阳时':'北京时间',recorded_time:t?.civil||'',solar_time:t?.trueSolar||null,place:t?.place||'未填写',correction_note:t?.note||'未校正真太阳时。',offset_minutes:t?.applied?Math.round(t.offsetSeconds/6)/10:0};
}
