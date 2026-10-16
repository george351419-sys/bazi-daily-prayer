if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for Ark credential on stdin (hidden).');
const key=await new Promise(resolve=>{let s='';const on=c=>{s+=c.toString();if(s.includes('\n')){process.stdin.off('data',on);resolve(s.trim());}};process.stdin.on('data',on);});
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
for(const suffix of ['models']){
 const r=await fetch('https://ark.cn-beijing.volces.com/api/v3/'+suffix,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)});let d;try{d=await r.json();}catch{console.log('status',r.status,'non-JSON');continue;}
 console.log(JSON.stringify({status:r.status,code:d.error?.code,message:d.error?.message,models:d.data?.map(x=>x.id)}));
}
