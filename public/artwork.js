let token=new URLSearchParams(location.hash.slice(1)).get('view')||'';
const $=id=>document.getElementById(id);let imageURL='',running=false;
function paragraph(parent,name,text){const box=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=name;p.textContent=text;box.append(h,p);parent.append(box);}
async function load(){
 if(running)return;running=true;$('retry').hidden=true;$('artwork').hidden=true;$('state').textContent='正在读取生图前保存的解读…';
 try{
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('请在小程序中打开具体画作的“查看网页说明”，或粘贴完整的说明链接。');
  const boot=await fetch('/api/bootstrap',{credentials:'omit',cache:'no-store'});if(!boot.ok)throw Error('服务暂不可用，请稍后重试。');const session=await boot.json();
  const headers={'X-Session-Token':session.sessionToken,'X-Artwork-View-Token':token};
  const response=await fetch('/api/artwork-view',{headers,credentials:'omit',cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'这幅画的说明暂不可用。');
  const a=data.artwork;$('title').textContent=a.title;$('date').textContent=a.date;$('theme').textContent='这幅画的祈愿：'+a.theme;$('note').textContent=a.note;
  $('birth-context').textContent=a.birthContext||(a.mode==='wish-art'?'本幅作品未使用生辰。':'此作品没有保存四柱摘要。');
  $('overview').textContent=[a.intro,a.overview].filter(Boolean).join('\n\n');
  $('selection-summary').textContent='主色取向：'+(a.primaryElement||'未设置')+'；辅色取向：'+(a.secondaryElement||'未设置独立次喜用')+'；点缀色取向：'+(a.tertiaryElement||'未设置独立第三喜用')+'。\n主尊：'+(a.deity||'未记录')+'。\n生肖：'+(a.zodiac.length?a.zodiac.join('、'):'未额外添加')+'。\n天干映射物：'+(a.stemSymbols.length?a.stemSymbols.map(s=>s.stem+' · '+s.motif).join('；'):'未额外添加')+'。';
  $('consistency-warning').hidden=!a.consistencyIssues?.length;$('consistency-text').textContent=(a.consistencyIssues||[]).join('\n')+'\n下方保留的是这幅旧画的归档方案，不能把旧图改写成新配色。请使用修正规则重新生成画作。';
  $('basis').replaceChildren();$('colors').replaceChildren();
  for(const item of a.sections){const section=document.createElement('section');paragraph(section,item.title,item.body);$('basis').append(section);}
  $('professional-section').hidden=!a.archivedProfessional;$('professional').textContent=a.archivedProfessional;
  for(const color of a.colors){const row=document.createElement('div'),swatch=document.createElement('span'),copy=document.createElement('div'),name=document.createElement('strong'),hex=document.createElement('p');row.className='color';swatch.className='swatch';swatch.setAttribute('aria-hidden','true');if(/^#[a-f0-9]{6}$/i.test(color.hex))swatch.style.backgroundColor=color.hex;name.textContent=color.name;hex.textContent=color.hex;copy.append(name,hex);row.append(swatch,copy);$('colors').append(row);}
  $('artwork').hidden=false;$('state').textContent='生图前保存的解读已载入，正在载入作品图片…';
  const image=await fetch('/api/artwork-view/image',{headers,credentials:'omit',cache:'no-store'});if(!image.ok)throw Error('作品图片暂未载入，请重试。');
  if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(await image.blob());$('image').src=imageURL;$('image').alt=a.title;$('artwork').hidden=false;$('state').textContent='本链接仅供查看这一幅作品，有效期为生成后 10 分钟。请勿转发私人作品链接。';
 }catch(e){$('state').textContent=e.message;$('retry').hidden=false;}
 finally{running=false;}
}
$('retry').addEventListener('click',load);void load();

window.addEventListener('hashchange',()=>location.reload());
