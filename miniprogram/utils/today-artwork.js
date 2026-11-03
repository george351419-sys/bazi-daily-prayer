function shanghaiDate(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(0,10);}
function todayArtwork(status,today){
 const candidates=[...(status.planDays||[]),status.artwork,...(status.days||[])];
 return candidates.find(item=>item&&item.date===today&&item.image)||null;
}
module.exports={shanghaiDate,todayArtwork};
