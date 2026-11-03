import {createHash} from 'node:crypto';
// A user-specified case premise, not a general classifier for weak earth charts.
const CASE_ID='user-case-20261103-jitu-01';
const NATAL_HASH='270101b9162d4ccc0c31243650a029b51faa22807a61f082773e21190dd3b9fb';
export function confirmedFoundationCase(calendar){
 if(calendar.dayMaster!=='己'||calendar.natal?.[1]?.[1]!=='寅'||createHash('sha256').update(calendar.natal.join(' ')).digest('hex')!==NATAL_HASH)return null;
 const visible=calendar.natal.map(p=>p[0]);
 return {day_master:'己',month_branch:'寅',primary_element:'火',secondary_element:'',reason:'本命例采用用户明确给定的普通身弱、印化官路线，以三组候选求交集，不另由模型扩充候选。',assessment_source:{id:CASE_ID,kind:'user_case_premise',label:'用户在2026-11-03本次对话指定的命例前提，非程序自动旺衰判断'},selection_basis:{structure:'ordinary',strength:'weak',structure_reason:'',fuyi_stems:['丙','丁','戊','己'],pattern_stems:['丙'],fuyi_reason:'按用户给定的身弱印比前提，扶抑候选为丙丁火、戊己土。',pattern_reason:'本命例按用户给定的印化官路线，格局候选限定丙火，不自动扩成丙丁火。'},tiaohou_required_stems:['丙','癸'],unmet_tiaohou_stems:['丙','癸'].filter(s=>!visible.includes(s)),tiaohou_groups:[['丙','癸']],protected_stems:['戊','丙'],tiaohou_reason:'本命例按用户给定的丙火、癸水调候候选；并用能否落实单独核查，不能删除集合中的丙。'};
}
