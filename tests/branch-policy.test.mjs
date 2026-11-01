import test from 'node:test';
import assert from 'node:assert/strict';
import {branchRelations,allocateBindings,relationKey} from '../lib/branch-policy.mjs';
const branches=s=>[...s].map((branch,i)=>({id:'b'+i,branch}));
test('三刑须三支齐全；子卯与同支两见自刑独立保留；不启用破',()=>{
 for(const s of ['寅巳','巳申','寅申','丑戌','戌未','丑未'])assert.ok(!branchRelations(branches(s)).some(r=>r.type==='相刑'));
 for(const s of ['寅巳申','丑戌未'])assert.equal(branchRelations(branches(s)).filter(r=>r.type==='相刑').length,1);
 assert.equal(branchRelations(branches('子卯')).filter(r=>r.type==='相刑').length,1);
 for(const b of '辰午酉亥'){assert.ok(!branchRelations(branches(b)).some(r=>r.type==='自刑'));assert.equal(branchRelations(branches(b+b)).filter(r=>r.type==='自刑').length,1);}
 assert.ok(!branchRelations(branches('子丑寅卯辰巳午未申酉戌亥')).some(r=>r.type==='破'));
});
test('有效关系按三会、三合、六合分配；未验证关系不占用',()=>{
 const rs=branchRelations(branches('寅卯辰亥未戌'));
 const all=rs.filter(r=>['三会','三合','六合'].includes(r.type));
 const choices=allocateBindings(rs,all.map(relationKey));
 assert.ok(choices.every(c=>c.bindings.some(r=>r.type==='三会')));
 assert.ok(choices.every(c=>!c.bindings.some(r=>r.type==='三合')));
 const trine=all.find(r=>r.type==='三合');
 assert.ok(allocateBindings(rs,[relationKey(trine)])[0].bindings.some(r=>r.type==='三合'));
 assert.equal(allocateBindings(rs)[0].bindings.length,0);
});
test('重复地支按来源分配，同等级竞争保留分支，合不删除刑害',()=>{
 const rs=branchRelations(branches('卯戌戌酉子'));
 const harmonies=rs.filter(r=>r.type==='六合');
 const choices=allocateBindings(rs,harmonies.map(relationKey));
 assert.equal(choices.length,2);
 for(const c of choices){assert.equal(c.bindings.length,1);assert.equal(c.suppressed_clashes.length,1);assert.ok(c.residual_relations.some(r=>r.type==='相刑'));assert.ok(c.residual_relations.some(r=>r.type==='六害'));}
 const repeated=branchRelations(branches('卯卯戌戌'));
 assert.ok(allocateBindings(repeated,repeated.filter(r=>r.type==='六合').map(relationKey)).every(c=>c.bindings.length===2));
});
