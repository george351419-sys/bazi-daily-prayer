// One bounded SCF invocation. Cloud checkpoints, not /tmp, determine progress.
export function rotateWorkerAccounts(entries,cursor){
 const sorted=[...entries].sort(([a],[b])=>a.localeCompare(b));
 const index=cursor?sorted.findIndex(([id])=>id>cursor):0;
 const start=index<0?0:index;
 return [...sorted.slice(start),...sorted.slice(0,start)];
}
export async function runCloudTick({entries,cursor,maxAccounts=2,budgetMs=720000,now=Date.now,run,save}){
 if(!Number.isInteger(maxAccounts)||maxAccounts<1||maxAccounts>20||budgetMs<30000)throw new Error('Invalid cloud tick limits');
 const deadline=now()+budgetMs,results=[];
 for(const [accountId] of rotateWorkerAccounts(entries,cursor)){
  const remaining=deadline-now();
  if(results.length>=maxAccounts||remaining<30000)break;
  let status='complete';
  try{await run(accountId,Math.min(330000,remaining-10000));}catch{status='failed';}
  // Save after every account so a timeout cannot permanently starve later work.
  await save({cursor:accountId,lastRun:status});
  results.push({accountId,status});
 }
 return results;
}
