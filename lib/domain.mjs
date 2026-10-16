import lunar from 'lunar-javascript';
export const {Solar,Lunar}=lunar;
export const RULE_VERSION='2026-10-16-unlimited-stems-v3';
export const WISH_GROUPS=[
 ['财运丰足',['一夜暴富','财源广进','生意兴旺','债务结清','投资顺利','衣食无忧']],
 ['事业向前',['上岸考编','面试拿 offer','升职加薪','创业顺利','职场避小人','步步高升']],
 ['学业精进',['金榜题名','逢考必过','考研考证上岸','学业进步','论文顺利']],
 ['健康平安',['身体康健','早日康复','家人安康','老人长寿','消灾避祸','出入平安']],
 ['姻缘家庭',['遇正缘','脱单','婚姻和睦','远离烂桃花','求子好孕','家庭和顺']],
 ['人际相伴',['贵人扶持','化解口舌矛盾','修复亲友或亲子关系']],
 ['心境迎新',['时来运转','破除霉运','内心安宁','放下执念']]
].map(([name,items],i,all)=>({name,items:items.map((label,j)=>({id:'W'+String(all.slice(0,i).reduce((n,x)=>n+x[1].length,0)+j+1).padStart(2,'0'),label}))}));
export const WISHES=WISH_GROUPS.flatMap(x=>x.items);
export const DIRECTIONS={木:'萧升',火:'陈九公',土:'赵公明',金:'曹宝',水:'姚少司'};
export const VALID_DEITIES=['刘海','赵公明','五路财神','范蠡','福德正神','天官','药师佛','关公','文殊','文昌','魁星','禄星','普贤','王灵官','和合二仙','保生大帝','观音','白度母','寿星','无量寿佛','尊胜佛母','水官','妈祖','月老','注生娘娘','送子观音','金花娘娘','布袋和尚',...Object.values(DIRECTIONS)];
export const STEM_PARTNER={甲:'己',己:'甲',乙:'庚',庚:'乙',丙:'辛',辛:'丙',丁:'壬',壬:'丁',戊:'癸',癸:'戊'};
export const CLASHES=['甲庚','乙辛','丙壬','丁癸'];
export function todayShanghai(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function validateInput(raw,today=todayShanghai()){
 if(!raw||!['female','male'].includes(raw.gender))throw new Error('请选择性别。');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.birthDate||'')||!/^\d{2}:\d{2}$/.test(raw.birthTime||''))throw new Error('请填写完整出生日期和时间。');
 const [y,m,d]=raw.birthDate.split('-').map(Number),[h,min]=raw.birthTime.split(':').map(Number);
 if(y<1900||y>Number(today.slice(0,4))||m<1||m>12||d<1||d>31||h>23||min>59)throw new Error('出生日期或时间超出范围。');
 if(!['solar','lunar'].includes(raw.calendar||'solar'))throw new Error('历法无效。');
 const wishes=[...new Set(raw.wishes||[])];
 if(!wishes.length||wishes.length>36||wishes.some(id=>!WISHES.some(w=>w.id===id)))throw new Error('请至少选择一个有效祈福项。');
 const city=typeof raw.city==='string'?raw.city.trim().slice(0,60):'';
 return {gender:raw.gender,birthDate:raw.birthDate,birthTime:raw.birthTime,calendar:raw.calendar||'solar',leap:!!raw.leap,city:city||'未填写（北京时间）',wishes,today,timezone:'Asia/Shanghai'};
}
export function calendarFor(input){
 const [y,m,d]=input.birthDate.split('-').map(Number),[h,min]=input.birthTime.split(':').map(Number);
 let solar;
 if(input.calendar==='lunar')solar=Lunar.fromYmdHms(y,input.leap?-m:m,d,h,min,0).getSolar();
 else {
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('出生日期不存在，请重新填写。');
  solar=Solar.fromYmdHms(y,m,d,h,min,0);
 }
 if(solar.toYmd()>input.today)throw new Error('出生日期不能晚于今天。');
 const [sy,sm,sd]=solar.toYmd().split('-').map(Number);
 const dst={1986:['05-04','09-14'],1987:['04-12','09-13'],1988:['04-17','09-11'],1989:['04-16','09-17'],1990:['04-15','09-16'],1991:['04-14','09-15']}[sy];
 // Historical DST transition hours require review rather than silently changing pillars.
 if(dst){const md=solar.toYmd().slice(5);if(md>=dst[0]&&md<=dst[1])throw new Error('这一天处于中国历史夏令时校正范围，请先换算为北京时间标准时后，再在后续专业版中核验。本版暂不自动处理该边界。');}
 const ec=solar.getLunar().getEightChar();ec.setSect(2);
 const natal=[ec.getYear(),ec.getMonth(),ec.getDay(),ec.getTime()];
 const yun=ec.getYun(input.gender==='male'?1:0,1),start=yun.getStartSolar();
 const target=Solar.fromYmdHms(...input.today.split('-').map(Number),12,0,0);
 const t=target.getLunar().getEightChar();t.setSect(2);
 let luck=null,from=null,to=null;
 for(const dy of yun.getDaYun(12)){
  if(!dy.getGanZhi())continue;
  const shift=10*(dy.getIndex()-1),s=start.nextYear(shift),e=start.nextYear(shift+10);
  if(target.toYmdHms()>=s.toYmdHms()&&target.toYmdHms()<e.toYmdHms()){luck=dy.getGanZhi();from=s.toYmdHms();to=e.toYmdHms();break;}
 }
 const stems=natal.map((p,i)=>({id:['natal.year','natal.month','natal.day','natal.hour'][i],stem:p[0]}));
 for(const [id,p]of [['luck',luck],['year',t.getYear()],['month',t.getMonth()],['day',t.getDay()]])if(p)stems.push({id:'transit.'+id,stem:p[0]});
 const clashes=[],bindings=[];
 for(let i=0;i<stems.length;i++)for(let j=i+1;j<stems.length;j++){
  const a=stems[i],b=stems[j];if(CLASHES.some(x=>x.includes(a.stem)&&x.includes(b.stem)&&a.stem!==b.stem)&&(a.id.startsWith('natal')||b.id.startsWith('natal')))clashes.push({a,b});
  if(STEM_PARTNER[a.stem]===b.stem)bindings.push({a,b});
 }
 return {natal,dayMaster:natal[2][0],luck,luckFrom:from,luckTo:to,firstLuck:start.toYmdHms(),forward:yun.isForward(),year:t.getYear(),month:t.getMonth(),day:t.getDay(),stems,rawStemClashes:clashes,rawStemBindings:bindings,calendarVersion:'lunar-javascript-1.7.7',evaluationTime:input.today+' 12:00:00 +08:00',conventions:'北京时间；公历/农历输入；不校正真太阳时；sect=2晚子时日柱按当天；节气换月、立春换年；初交运口径sect=1；无流时；关系表仅表示配对，不自动认定有效合化'};
}
const str=(x,max=2000)=>typeof x==='string'&&x.trim()&&x.length<=max;
export function validateMapping(m,input){
 if(!m||!input.wishes.includes(m.wish_id))throw new Error('文案模型选取了未勾选愿望，请重新解析。');
 if(!str(m.deity,40)||!VALID_DEITIES.includes(m.deity))throw new Error('主尊未通过内容库校验，请重新解析。');
 if(!str(m.title,60)||!str(m.overview,2500)||!str(m.blessing,150)||!str(m.professional,18000)||!str(m.image_prompt,7000))throw new Error('文案字段缺失或超出范围，请重新解析。');
 if(!['木','火','土','金','水'].includes(m.primary_element))throw new Error('文案未提供有效主色方向。');
 if(!Array.isArray(m.elements)||m.elements.length<3||m.elements.length>12||m.elements.some(e=>!str(e.name,60)||!str(e.meaning,1500)))throw new Error('画面要素解读不完整，请重新解析。');
 if(Array.isArray(m.colors))m.colors=m.colors.map(c=>({...c,hex:typeof c.hex==='string'?c.hex.trim():c.hex}));
 if(!Array.isArray(m.colors)||m.colors.length<2||m.colors.length>12||m.colors.some(c=>!str(c.name,40)||!/^#[\da-fA-F]{6}$/.test(c.hex)))throw new Error('配色色板格式错误。');
 if(!Array.isArray(m.zodiac)||m.zodiac.some(z=>!'鼠牛虎兔龙蛇马羊猴鸡狗猪'.includes(z)||z.length!==1)||m.zodiac.length>3)throw new Error('生肖方案格式错误。');
 if(!Array.isArray(m.stem_symbols)||m.stem_symbols.length>10||m.stem_symbols.some(x=>!STEM_PARTNER[x.stem]||!str(x.motif,150)))throw new Error('天干取象格式错误。');
 if(m.wish_id==='W02'&&Object.values(DIRECTIONS).includes(m.deity)&&m.deity!==DIRECTIONS[m.primary_element]&&!str(m.rotation_reason,500))throw new Error('方位主尊与喜用不符且没有轮换理由。');
 return {...m,confidence:'provisional',important_note:'本次喜用与关系取象由模型按项目规则初判，尚未经人工复核。画面表达祝愿。'};
}
export function buildImagePrompt(m){return `生成一张方形、无文字的平面祈福画概念图。温暖的日本手绘动画电影氛围，柔和自然光，细腻手绘背景，舒展空间，宁静温柔，主尊庄重；不是人物收藏卡，不加卡牌边框。\n今日愿望：${m.wish_label}。中心主体：${m.deity}。${m.image_prompt}\n选定配色：${m.colors.map(c=>c.name+' '+c.hex).join('、')}。生肖仅限：${m.zodiac.length?m.zodiac.join('、')+'，次要位置、Q版可爱': '无；禁止添加任何生肖动物'}。额外天干意象仅限：${m.stem_symbols.length?m.stem_symbols.map(x=>x.stem+'：'+x.motif).join('；'):'无，不擅加树木、河流、太阳、灯火等元素'}。固定坐骑与主尊法器按经核对造像保留，未知不要虚构。无其他主尊、无伪经文、无咒语、无功效标签、无日期、无文字、无水印、无硬件样机。不得在画面写出出生资料。`;}
