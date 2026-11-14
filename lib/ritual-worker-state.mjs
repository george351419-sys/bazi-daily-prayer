// Keep complete published actions for previews and device receipts, but avoid
// sending duplicate manifests through the bounded internal JSON endpoint.
export function compactRitualBuild(state) {
 const result={...state};
 if(result.publication)delete result.manifest;
 if(result.prepared?.manifest){
  const {days,...manifest}=result.prepared.manifest;
  result.prepared={...result.prepared,manifest};
 }
 return result;
}

// Once bytes are staged, the top-level publication must describe only the
// package committed to the device cloud. Preserve the previous publication
// separately so an interrupted commit cannot make its old SHA look current.
export function stagedRitualBuild(prior, prepared, {status='ready',stage='ready',revision,now=Date.now()}={}) {
 const publication=prior?.publication||(prior?.manifest&&prior?.sha256?{
  manifest:prior.manifest,sha256:prior.sha256,publishedAt:prior.publishedAt,
  bytes:prior.bytes,signature:prior.signature,deviceId:prior.deviceId,bindingId:prior.bindingId
 }:null);
 const result={...prior,previousPublication:publication||prior?.previousPublication||null,prepared,
  status,stage,progress:null,attemptedRevision:revision||prior?.attemptedRevision||null,
  stageUpdatedAt:new Date(now).toISOString()};
 for(const key of ['publication','manifest','sha256','bytes','publishedAt','signature','mode','note','nextAttemptAt','failure'])delete result[key];
 return result;
}

// Older single-photo plans stored the same ID twice for the two-day compiler.
// Normalize only the compiler input; leave the saved plan and revision intact.
export function legacyPhotoIds(ids) {
 return Array.isArray(ids)?[...new Set(ids)]:ids;
}

export async function processRitualAccounts(entries,processAccount,onError,{concurrency=1}={}) {
 const queue=Array.from(entries);let cursor=0;
 const work=async()=>{while(cursor<queue.length){const [accountId,deviceId]=queue[cursor++];try{await processAccount(accountId,deviceId);}catch(error){await onError(error,accountId);}}};
 await Promise.all(Array.from({length:Math.min(queue.length,Math.max(1,Math.min(3,concurrency)))},work));
}

// Compact API snapshots omit prepared.manifest.days. Restore the freshly
// recomputed exact manifest before resuming a commit after a cold start.
export function resumePreparedRitual(prior,signature,manifest){
 return prior?.prepared?.signature===signature?{...prior.prepared,manifest}:null;
}
