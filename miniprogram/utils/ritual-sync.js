const api=require('./api');

const sameIds=(one,two)=>Array.isArray(one)&&Array.isArray(two)&&one.length===two.length&&one.every((id,index)=>id===two[index]);

async function preparePrayerPair(mode='daily',request=api.request){
 let prepared=await request('/api/account/ritual/prepare',{mode});
 if(prepared.job){
  await request('/api/jobs/'+prepared.job.id+'/image',{jobToken:prepared.job.token});
  prepared=await request('/api/account/ritual/prepare',{mode});
 }
 if(prepared.status!=='ready'||!Array.isArray(prepared.artworkIds)||prepared.artworkIds.length!==2)throw new Error('今日与明日祈福画尚未准备好。');
 return prepared;
}

async function syncPrayerPair({mode='daily',request=api.request}={}){
 const prepared=await preparePrayerPair(mode,request);
 let status=await request('/api/account/ritual');
 if(!sameIds(status.plan&&status.plan.artworkIds,prepared.artworkIds))status=await request('/api/account/ritual',{mode,contentMode:'prayer',showActions:true,artworkIds:prepared.artworkIds});
 return {prepared,status};
}

async function syncGeneratedPrayer({request=api.request}={}){
 const current=await request('/api/account/ritual');
 if(!current.syncConfigured)return {status:current,needed:false,reason:'unbound'};
 if(current.plan&&current.plan.contentMode==='photo')return {status:current,needed:false,reason:'photo'};
 const mode=current.plan&&current.plan.mode==='test'?'test':'daily',synced=await syncPrayerPair({mode,request});
 return {...synced,needed:true,reason:'ready'};
}

module.exports={preparePrayerPair,syncPrayerPair,syncGeneratedPrayer,sameIds};
