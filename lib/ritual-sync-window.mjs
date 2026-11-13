// Provisional defaults, based on observed 7–9 minute preparation, not a measured percentile.
export function ritualSyncWindow(task,plan,build,now=Date.now(),storedSha=null){
 const current=!!plan&&build?.status==='published'&&(build?.publication?.manifest||build?.manifest)?.revision===plan.revision;
 const publishedSha=build?.publication?.sha256||build?.sha256||build?.publication?.manifest?.sha256||build?.manifest?.sha256;
 const pending=!!task&&!['complete','superseded'].includes(task.status)||!!plan&&(!current||!publishedSha||storedSha!==publishedSha);
 if(!pending)return {sync_wait_pending:false};
 const started=Date.parse(task?.createdAt||plan?.updatedAt||'');
 const remaining=Number.isFinite(started)?Math.ceil((started+420000-now)/1000):420;
 const delay=remaining<=0?300:Math.max(60,Math.min(420,remaining));
 return {sync_wait_pending:true,sync_wait_seconds:delay,sync_window_seconds:180,sync_wait_id:String(task?.id||plan?.revision||'pending').slice(0,64)};
}
