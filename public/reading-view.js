export function renderConsumerReading(container,mapping){
 container.replaceChildren();
 const facts=mapping.birth_summary;
 if(facts){
  const section=document.createElement('section');section.className='birth-summary';
  const heading=document.createElement('h4');heading.textContent='你的生辰底色';section.append(heading);
  const pillars=document.createElement('dl');pillars.className='pillar-grid';
  facts.pillars.forEach((pillar,i)=>{const cell=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');label.textContent=['年柱','月柱','日柱','时柱'][i];value.textContent=pillar;cell.append(label,value);pillars.append(cell);});section.append(pillars);
  const time=document.createElement('p');time.className='time-basis';time.textContent=facts.solar_time?`出生时间 ${facts.recorded_time}（北京时间） → 真太阳时 ${facts.solar_time}`:`出生时间 ${facts.recorded_time} · 按北京时间排盘`;
  const note=document.createElement('p');note.className='reading-caption';note.textContent=facts.correction_note;section.append(time,note);container.append(section);
 }
 if(mapping.reading){
  const intro=document.createElement('p');intro.className='reading-intro';intro.textContent=mapping.reading.intro;container.append(intro);
  mapping.reading.sections.forEach((item,i)=>{const card=document.createElement('section');card.className='insight-card';const label=document.createElement('span');label.className='insight-number';label.textContent=String(i+1).padStart(2,'0');const title=document.createElement('h4');title.textContent=item.title;const body=document.createElement('p');body.textContent=item.body;card.append(label,title,body);container.append(card);});
 }else{const text=document.createElement('p');text.textContent='这份画作来自旧版解读。重新生成后，可查看新版的生辰与画面解析。';container.append(text);}
}
export function consumerReadingMarkdown(mapping){
 const facts=mapping.birth_summary;const lines=[];
 if(facts){lines.push('生辰四柱：'+facts.pillars.join(' · '),facts.solar_time?'真太阳时：'+facts.solar_time:'排盘时间：'+facts.recorded_time+'（北京时间）',facts.correction_note);}
 if(mapping.reading)lines.push(mapping.reading.intro,...mapping.reading.sections.map(s=>'### '+s.title+'\n\n'+s.body));
 return lines.join('\n\n');
}
