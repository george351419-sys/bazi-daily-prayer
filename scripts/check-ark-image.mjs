import fs from 'node:fs';import {buildImagePrompt} from '../lib/domain.mjs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);console.log('Ready for Ark credential on stdin (hidden).');
const key=await new Promise(resolve=>{let s='';const on=c=>{s+=c.toString();if(s.includes('\n')){process.stdin.off('data',on);resolve(s.trim());}};process.stdin.on('data',on);});if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
const {mapping}=JSON.parse(fs.readFileSync('.runtime/prod-analysis.json'));
for(const model of (process.argv.length>2?process.argv.slice(2):['doubao-seedream-4-5-251128','doubao-seedream-4-0-250828'])){
 const options={model,prompt:buildImagePrompt(mapping),size:'2048x2048',response_format:'url',watermark:false};
 if(!/seedream-5-0-(flash|pro)/.test(model)){options.stream=false;options.sequential_image_generation='disabled';}
 const response=await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(options),signal:AbortSignal.timeout(240000)});
 const d=await response.json();console.log(JSON.stringify({model,status:response.status,code:d.error?.code,message:String(d.error?.message||'').replaceAll(key,'[redacted]'),hasImage:!!d.data?.[0]?.url}));
 if(response.ok&&d.data?.[0]?.url){fs.writeFileSync('.runtime/ark-direct-image.json',JSON.stringify({model,...d}));break;}
 if(![404,403,400].includes(response.status))break;
}
