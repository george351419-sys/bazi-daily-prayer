function prayerPreview(status,catalog,day=0,now=Date.now()){
 const date=new Date(now+8*3600000+day*86400000).toISOString().slice(0,10);
 const valid=item=>item&&item.date===date&&item.source!=='upload'&&item.image&&(item.status===undefined||item.status==='complete');
 const planned=status?.plan?.contentMode==='prayer'?(status.planDays||[]).find(valid):null;
 const available=(catalog||[]).filter(valid).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 return {date,artwork:planned||available[0]||null};
}
module.exports={prayerPreview};
