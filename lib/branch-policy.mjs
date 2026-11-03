// Product policy confirmed on 2026-11-03. Complete membership establishes a binding, without adjacency requirements.
export const BRANCH_POLICY_VERSION='2026-11-03-v3';
export const BRANCH_POLICY={version:BRANCH_POLICY_VERSION,binding_priority:['三会','三合','六合'],three_punishments_require_all:true,self_punishment_min_instances:2,break_enabled:false,membership_is_effective:true,any_binding_suppresses_clash:true,any_binding_suppresses_punishment:true};
export function branchRelations(branches){
 const result=[],add=(type,items)=>result.push({type,target_ids:items.map(x=>x.id),branches:items.map(x=>x.branch)});
 for(let i=0;i<branches.length;i++)for(let j=i+1;j<branches.length;j++){
  const a=branches[i],b=branches[j],items=[a,b];
  for(const [type,pairs] of [['六合',['子丑','寅亥','卯戌','辰酉','巳申','午未']],['六冲',['子午','丑未','寅申','卯酉','辰戌','巳亥']],['六害',['子未','丑午','寅巳','卯辰','申亥','酉戌']],['相刑',['子卯']]])if(a.branch!==b.branch&&pairs.some(pair=>pair.includes(a.branch)&&pair.includes(b.branch)))add(type,items);
  if(a.branch===b.branch&&'辰午酉亥'.includes(a.branch))add('自刑',items);
  for(let k=j+1;k<branches.length;k++){
   const tri=[a,b,branches[k]],values=tri.map(x=>x.branch);
   if(new Set(values).size!==3)continue;
   for(const [type,groups] of [['三合',['申子辰','亥卯未','寅午戌','巳酉丑']],['三会',['寅卯辰','巳午未','申酉戌','亥子丑']],['相刑',['寅巳申','丑戌未']]])if(groups.some(group=>values.every(x=>group.includes(x))))add(type,tri);
  }
 }
 return result;
}
export const relationKey=r=>r.type+':'+[...r.target_ids].sort().join(',');
// Caller supplies the bindings to allocate; complete membership is valid under the current policy.
// Enumerate equal-priority alternatives instead of silently resolving them by array order.
export function allocateBindings(relations,effectiveKeys=[]){
 const eligible=relations.filter(r=>BRANCH_POLICY.binding_priority.includes(r.type)&&effectiveKeys.includes(relationKey(r)));
 let choices=[[]];
 for(const type of BRANCH_POLICY.binding_priority){
  choices=choices.flatMap(chosen=>{
   const used=new Set(chosen.flatMap(r=>r.target_ids));
   const candidates=eligible.filter(r=>r.type===type&&!r.target_ids.some(id=>used.has(id)));
   let groups=[[]];
   for(const r of candidates)groups=groups.flatMap(g=>g.some(x=>x.target_ids.some(id=>r.target_ids.includes(id)))?[g]:[g,[...g,r]]);
   // Keep inclusion-maximal compatible groups; choosing fewer can be valid when members overlap.
   groups=groups.filter(g=>!candidates.some(r=>!g.includes(r)&&!g.some(x=>x.target_ids.some(id=>r.target_ids.includes(id)))));
   return groups.map(g=>[...chosen,...g]);
  });
 }
 return choices.map(bindings=>{
  const used=new Set(eligible.flatMap(r=>r.target_ids));
  return {bindings,effective_bindings:eligible,suppressed_punishments:relations.filter(r=>['相刑','自刑'].includes(r.type)&&r.target_ids.some(id=>used.has(id))),suppressed_clashes:relations.filter(r=>r.type==='六冲'&&r.target_ids.some(id=>used.has(id))),residual_relations:relations.filter(r=>!BRANCH_POLICY.binding_priority.includes(r.type)&&!(['六冲','相刑','自刑'].includes(r.type)&&r.target_ids.some(id=>used.has(id))))};
 });
}
