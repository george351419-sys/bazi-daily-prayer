import index from '../rules/tiaohou-index.json' with {type:'json'};
import lunar from 'lunar-javascript';
export const TIAOHOU_VERSION=index.version;
export function tiaohouRule(calendar,input={}){
 const row=index.entries.find(x=>x.day_master===calendar.dayMaster&&x.month_branch===calendar.natal[1][1]);
 if(!row)return null;
 let term=null;
 if(input.birthDate&&input.birthTime){
  const [y,m,d]=input.birthDate.split('-').map(Number),[h,min]=input.birthTime.split(':').map(Number);
  const birth=input.calendar==='lunar'?lunar.Lunar.fromYmdHms(y,input.leap?-m:m,d,h,min,0):lunar.Solar.fromYmdHms(y,m,d,h,min,0).getLunar();
  term=birth.getPrevJieQi().getName();
 }
 let stems=[...row.stems],stage='基础候选',uncovered=false;
 const natalBranches=new Set(calendar.natal.map(p=>p[1]));
 const complete=group=>[...group].every(b=>natalBranches.has(b));
 if(row.day_master==='丁'&&row.month_branch==='午'){if(complete('寅午戌')||complete('巳午未')){stems=['庚','壬'];stage='原局火组合成员齐全支路';}else if(calendar.natal.some(p=>[p[0],...({子:'癸',丑:'己癸辛',辰:'戊乙癸',申:'庚壬戊',亥:'壬甲'}[p[1]]||'')].some(s=>'壬癸'.includes(s)))){stems=['甲','庚'];stage='无完整火组合、原局有水支路';}else{uncovered=true;stage='原局条件支路尚未编码完整';}}
 if(row.day_master==='丁'&&row.month_branch==='辰'&&(complete('亥卯未')||complete('寅卯辰'))){stems=['庚','甲'];stage='原局木组合成员齐全，先庚后甲';}
 if(row.day_master==='乙'&&row.month_branch==='酉'&&term){stems=term==='秋分'?['丙','癸']:['癸'];stage=term==='秋分'?'秋分后':'白露后、秋分前';}
 if(row.day_master==='乙'&&row.month_branch==='午'&&term){stems=term==='夏至'?['丙','癸']:['癸'];stage=term==='夏至'?'夏至后':'芒种后、夏至前';}
 if(row.day_master==='癸'&&row.month_branch==='辰'&&term){stems=term==='谷雨'?['辛','甲']:['丙'];stage=term==='谷雨'?'谷雨后':'清明后、谷雨前';}
 return {uncovered_condition:uncovered,version:TIAOHOU_VERSION,day_master:row.day_master,month_branch:row.month_branch,stems,stage,birth_previous_term:term,source:index.source,review_note:row.review_note,coverage:'baseline_index_with_explicit_solar_term_branches',conditions_pending:row.conditions_pending,limitation:'基础映射由规则给出；过旺过弱、从格、水源及未编码数量条件仍须结合全局复核，不能把基础表当作全部古籍推断。'};
}
export function withTiaohouRule(f,calendar,input){
 const rule=tiaohouRule(calendar,input);if(!rule)return f;
 const visible=calendar.natal.map(p=>p[0]),stems=rule.uncovered_condition?f.tiaohou_required_stems:rule.stems;
 if(!Array.isArray(stems))return f;
 const fixedGroups=({'辛午':[['壬','己']],'壬子':[['戊','丙']],'癸戌':[['辛','甲']],'丁巳':[['甲','庚']]}[calendar.dayMaster+calendar.natal[1][1]]||[]);
 return {...f,tiaohou_required_stems:stems,unmet_tiaohou_stems:stems.filter(s=>!visible.includes(s)),tiaohou_groups:[...fixedGroups,...(f.tiaohou_groups||[])].filter(g=>g.every(s=>stems.includes(s))),tiaohou_reason:(rule.uncovered_condition?'本项条件支路未完整编码，保留模型的有条件候选，不冒称规则已判定。':'')+'按《穷通宝鉴》日干与节气月基础索引，'+calendar.natal[1][1]+'月'+calendar.dayMaster+'日的'+rule.stage+'为'+stems.join('、')+'。具体支路仍按全局复核，不将缺项从候选集合删除。',tiaohou_rule:rule};
}
