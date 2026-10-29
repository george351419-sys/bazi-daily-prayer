import {setTimeout as delay} from 'node:timers/promises';
import {runDailyTick} from '../lib/daily-worker.mjs';
import {devicesEnabled} from '../lib/devices.mjs';
import {accountsEnabled} from '../lib/accounts.mjs';
const config={...process.env};
if(config.PRAYER_WORKER_ALLOW_PAID!=='1'||!config.DEEPSEEK_API_KEY||!config.ARK_API_KEY||!config.SESSION_SECRET||!accountsEnabled(config)||!devicesEnabled(config)){
 console.error('Worker未启动：需配置账户存储、稳定SESSION_SECRET、设备服务和模型凭据，并显式设置PRAYER_WORKER_ALLOW_PAID=1。');process.exitCode=1;
}else{
 let stop=false;const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop=true;abort.abort();});
 do{
  try{const result=await runDailyTick(config,{allowPaid:true});if(!result.idle)console.log(JSON.stringify(result));}
  catch{console.error('每日Worker暂时无法连接服务，将退避重试。');}
  if(stop||process.argv.includes('--once'))break;
  try{await delay(15000,undefined,{signal:abort.signal});}catch{}
 }while(!stop);
}
