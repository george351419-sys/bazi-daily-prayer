// Numerical cross-check adapted independently from a published counting algorithm.
// This is a heuristic comparator, not an authoritative or scientifically validated classifier.
export const CHECK_VERSION='2026-11-04-crosscheck-v2';
const S='甲乙丙丁戊己庚辛壬癸',E=['木','火','土','金','水'];
export const HIDDEN={子:'癸',丑:'己癸辛',寅:'甲丙戊',卯:'乙',辰:'戊乙癸',巳:'丙庚戊',午:'丁己',未:'己丁乙',申:'庚壬戊',酉:'辛',戌:'戊辛丁',亥:'壬甲'};
const MONTHS='寅卯辰巳午未申酉戌亥子丑';
const STATUS={木:'旺旺相休休囚死死囚相相囚',火:'相相休旺旺相囚囚死囚死休',土:'死囚旺相相旺相相旺死囚旺',金:'囚死死囚囚死旺旺相相相相',水:'休休囚死死囚相相死旺旺相'};
const element=s=>Math.floor(S.indexOf(s)/2),unique=xs=>[...new Set(xs)];
export function tenGod(dm,s){const delta=(element(s)-element(dm)+5)%5,same=S.indexOf(dm)%2===S.indexOf(s)%2;return [['比肩','劫财'],['食神','伤官'],['偏财','正财'],['七杀','正官'],['偏印','正印']][delta][same?0:1];}
export function strengthCheck(calendar){
 const own=element(calendar.dayMaster),entries=calendar.natal.flatMap((p,i)=>[...p[0],...HIDDEN[p[1]]].map((stem,j)=>({pillar:i,kind:j?'hidden':'visible',stem,god:tenGod(calendar.dayMaster,stem)})));
 let help=entries.filter(x=>['比肩','劫财','偏印','正印'].includes(x.god)).length,drain=entries.length-help;
 const set=new Set(calendar.natal.map(p=>p[1])),bonuses=[];
 for(const [members,e]of [['寅午戌',1],['申子辰',4],['巳酉丑',3],['亥卯未',0],['寅卯辰',0],['巳午未',1],['申酉戌',3],['亥子丑',4]]){
  const count=[...members].filter(b=>set.has(b)).length;let h=0,d=0;
  if(count===3){if(e===own||(e+1)%5===own)h=3;else if((e+2)%5===own)d=3;else if((own+2)%5===e)d=2;}
  else if(count===2){if(e===own||(e+1)%5===own)h=1;else if((e+2)%5===own)d=1;}
  if(h||d){help+=h;drain+=d;bonuses.push({members,present:count,help:h,drain:d});}
 }
 const monthStatus=STATUS[E[own]][MONTHS.indexOf(calendar.natal[1][1])],deqi=['旺','相'].includes(monthStatus);
 const strength=(monthStatus==='旺'&&help>=drain)||(deqi&&help>drain)?'strong':!deqi&&drain>help+1?'weak':'balanced';
 return {version:CHECK_VERSION,method:'published-counting-comparator',source:'https://github.com/Sudo-Biao/Chinese-Metaphysics-Platform/blob/e1b96e0193a2aec44929df442924e9a4aba45418/core/bazi/analyzer.py',scope:'natal_only',month_status:monthStatus,help_score:help,drain_score:drain,strength,entries,bonuses,limitations:['透干与藏干等权，包含日干自身；未量化位置、根气深浅及合化。','半合/半会仅属外部算法计分，不写入本产品有效地支关系。','分数只触发复判，不覆盖模型第二次结论。']};
}
const PATTERN_POLICY={正财:['食神','正官'],偏财:['食神','正官'],正官:['正财','偏财','正印','偏印'],正印:['正官','七杀','比肩','劫财'],偏印:['正官','七杀','比肩','劫财'],食神:['比肩','劫财','正财','偏财'],阳刃:['正官','七杀'],七杀:['食神'],伤官:['正印','偏印','正财','偏财'],劫财:['正官','七杀','食神','伤官','正财','偏财'],比肩:['正官','七杀','食神','伤官','正财','偏财']};
export function patternCheck(calendar,f){
 const monthly=tenGod(calendar.dayMaster,HIDDEN[calendar.natal[1][1]][0]);
 const declared=typeof f.selection_basis?.pattern_name==='string'?f.selection_basis.pattern_name.replace(/格$/,''):'';
 const alias={月劫:'劫财',建禄:'比肩'}[declared]||declared;
 const pattern=PATTERN_POLICY[alias]?alias:monthly;
 const allowed=PATTERN_POLICY[pattern],gods=(f.selection_basis?.pattern_stems||[]).map(stem=>({stem,god:tenGod(calendar.dayMaster,stem)}));
 const direction=['阳刃','七杀','伤官','劫财','比肩'].includes(pattern)?'逆用':'顺用';
 const conflicts=gods.filter(x=>!allowed.includes(x.god));
 if(f.selection_basis?.pattern_direction&&f.selection_basis.pattern_direction!==direction)conflicts.push({reason:'模型写'+f.selection_basis.pattern_direction+'，该格局按基础顺逆用检查应为'+direction});
 return {version:CHECK_VERSION,source:'https://www.donglishuzhai.net/chapter/3721.html',pattern,monthly_main_god:monthly,pattern_origin:declared&&PATTERN_POLICY[alias]?'model_declared':'month_main_god_proxy',direction,allowed_gods:allowed,candidates:gods,conflicts,limitation:'仅核对顺逆用的大方向；月令本气是候选入口，透干取格、印重用财、杀印相生等例外由模型复判，不据此直接断格。'};
}
export function fuyiCoverageCheck(calendar,f){
 const b=f.selection_basis;
 if(!S.includes(calendar.dayMaster)||b?.structure!=='ordinary'||b.strength!=='weak')return {applicable:false,expected_stems:[],missing:[],exclusions:[],unexplained:[]};
 const own=element(calendar.dayMaster),expected=[...S].filter(s=>[own,(own+4)%5].includes(element(s))),chosen=b.fuyi_stems||[];
 const exclusions=Array.isArray(b.fuyi_exclusions)?b.fuyi_exclusions.filter(x=>x&&expected.includes(x.stem)&&!chosen.includes(x.stem)&&typeof x.reason==='string'&&x.reason.trim().length>=8):[];
 const missing=expected.filter(s=>!chosen.includes(s));
 // A stem's absence in the natal visible stems is not by itself a reason to exclude it.
 const sufficient=x=>!/(?:未透|未出现|原局无|不在原局|没有透出)/.test(x.reason)||/(?:合|冲|格局|夺食|破印|寒|燥|结构)/.test(x.reason);
 const unexplained=missing.filter(stem=>!exclusions.some(x=>x.stem===stem&&sufficient(x)));
 return {applicable:true,expected_stems:expected,missing,exclusions,unexplained};
}
export function foundationChecks(calendar,f){
 const strength=strengthCheck(calendar),pattern=patternCheck(calendar,f),fuyi=fuyiCoverageCheck(calendar,f),conflicts=[];
 if(f.selection_basis&&strength.strength!==f.selection_basis.strength)conflicts.push({section:'strength',model:f.selection_basis.strength,rule:strength.strength,reason:'原局数值校验与初判强弱不同，请核对月令、根气、透藏及特殊格，不能只按数量改判。'});
 if(pattern.conflicts.length)conflicts.push({section:'pattern',reason:'格局候选存在顺逆用方向差异：'+pattern.conflicts.map(x=>x.reason||x.stem+'为'+x.god).join('、')+'；请核对是否有成败救应或特殊路线。'});
 if(fuyi.unexplained.length)conflicts.push({section:'fuyi_coverage',reason:'普通身弱印比基础候选为'+fuyi.expected_stems.join('、')+'；其中'+fuyi.unexplained.join('、')+'未纳入且没有逐项排除理由。请补齐或在fuyi_exclusions逐项说明具体结构原因，不能只因未透干而排除。'});
 return {version:CHECK_VERSION,strength,pattern,fuyi,conflicts};
}
