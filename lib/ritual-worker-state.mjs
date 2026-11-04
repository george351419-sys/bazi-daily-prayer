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

// Older single-photo plans stored the same ID twice for the two-day compiler.
// Normalize only the compiler input; leave the saved plan and revision intact.
export function legacyPhotoIds(ids) {
 return Array.isArray(ids)?[...new Set(ids)]:ids;
}

export async function processRitualAccounts(entries,processAccount,onError) {
 for(const [accountId,deviceId] of entries){
  try{await processAccount(accountId,deviceId);}
  catch(error){await onError(error,accountId);}
 }
}
