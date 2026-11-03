import {branchRelations,allocateBindings,relationKey,BRANCH_POLICY} from './branch-policy.mjs';
const SOURCES={'natal.year':'原局年','natal.month':'原局月','natal.day':'原局日','natal.hour':'原局时','transit.luck':'大运','transit.year':'流年','transit.month':'流月','transit.day':'流日'};
const PARTNER={甲:'己',己:'甲',乙:'庚',庚:'乙',丙:'辛',辛:'丙',丁:'壬',壬:'丁',戊:'癸',癸:'戊'};
const ORDER='子丑寅卯辰巳午未申酉戌亥';
const unique=xs=>[...new Set(xs)];
const label=(x,kind)=>(SOURCES[x.id]||x.id)+(x.id.startsWith('natal.')?kind:'')+(x.branch||x.stem);
export function relationSnapshot(calendar){
 const branches=(calendar.natal||[]).map((p,i)=>({id:['natal.year','natal.month','natal.day','natal.hour'][i],branch:p[1]}));
 for(const [id,p]of [['luck',calendar.luck],['year',calendar.year],['month',calendar.month],['day',calendar.day]])if(p)branches.push({id:'transit.'+id,branch:p[1]});
 const rs=branchRelations(branches),effective=rs.filter(r=>BRANCH_POLICY.binding_priority.includes(r.type));
 const allocated=allocateBindings(rs,effective.map(relationKey))[0];
 const stems=calendar.stems||[],bindings=[],raw=[];
 for(let i=0;i<stems.length;i++)for(let j=i+1;j<stems.length;j++){
  const a=stems[i],b=stems[j],r={target_ids:[a.id,b.id],stems:[a.stem,b.stem]};
  if(PARTNER[a.stem]===b.stem)bindings.push(r);
  if(['甲庚','乙辛','丙壬','丁癸'].some(pair=>a.stem!==b.stem&&pair.includes(a.stem)&&pair.includes(b.stem)))raw.push(r);
 }
 const used=new Set(bindings.flatMap(r=>r.target_ids));
 return {policy_version:BRANCH_POLICY.version,branches:{instances:branches,...allocated},stems:{instances:stems,bindings,suppressed_clashes:raw.filter(r=>r.target_ids.some(id=>used.has(id))),residual_clashes:raw.filter(r=>!r.target_ids.some(id=>used.has(id)))}};
}
function branchGroups(relations,instances){
 const map=new Map(instances.map(x=>[x.id,x])),groups=new Map();
 for(const r of relations){const key=[...r.branches].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b)).join('')+r.type;groups.set(key,unique([...(groups.get(key)||[]),...r.target_ids]));}
 return [...groups].map(([key,ids])=>key+'（'+ids.map(id=>label(map.get(id)||{id},'支')).join('、')+'）').join('；');
}
export function branchExplanation(snapshot,decision){
 const b=snapshot.branches;
 const concise=decision.lastIndexOf('新增生肖')>=0?decision.slice(decision.lastIndexOf('新增生肖')):decision.lastIndexOf('没有剩余冲刑害')>=0?decision.slice(decision.lastIndexOf('没有剩余冲刑害')):decision.replace(/^不另加生肖的依据：/,'');
 const released=branchGroups([...(b.suppressed_clashes||[]),...(b.suppressed_punishments||[])],b.instances);
 return '地支：'+b.instances.map(x=>label(x,'支')).join('、')+'。\n\n有效合：'+(branchGroups(b.effective_bindings||b.bindings||[],b.instances)||'无')+'。\n\n合后检查：'+(released?'因具体成员参与有效合，已解除'+released+'；':'')+'剩余冲刑害：'+(branchGroups(b.residual_relations||[],b.instances)||'无')+'。\n\n生肖处理：'+concise;
}
export function stemExplanation(snapshot,decision){
 const s=snapshot.stems,map=new Map(s.instances.map(x=>[x.id,x]));
 const pair=(r,verb)=>r.target_ids.map(id=>label(map.get(id)||{id},'干')).join(verb);
 return '天干：'+s.instances.map(x=>label(x,'干')).join('、')+'。\n\n有效五合：'+(s.bindings.map(r=>pair(r,'与')+'五合').join('；')||'无')+'。\n\n合后检查：'+(s.suppressed_clashes.length?'以下冲至少一端已参与五合，不再作为剩余冲：'+s.suppressed_clashes.map(r=>pair(r,'冲')).join('；')+'。':'')+'剩余天干冲：'+(s.residual_clashes.map(r=>pair(r,'冲')).join('；')||'无')+'。\n\n取象处理：'+(s.residual_clashes.length?'上列剩余冲尚未全部解除；以下为本次景物候选的取舍。':'')+decision;
}
