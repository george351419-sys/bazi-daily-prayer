import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for deployment credentials JSON on stdin (input hidden).');
const input=await new Promise(resolve=>{let s='';const on=c=>{s+=c.toString();if(s.includes('\n')){process.stdin.off('data',on);resolve(s.trim());}};process.stdin.on('data',on);});
const credentials=JSON.parse(input);
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
const values={...credentials,SESSION_SECRET:randomBytes(32).toString('hex'),DEEPSEEK_MODEL:'deepseek-flash',ARK_IMAGE_MODEL:'doubao-seedream-5-0-flash-260915',ALLOWED_ORIGINS:'https://george351419-sys.github.io'};
for(const [name,value]of Object.entries(values)){
 const ok=await new Promise(resolve=>{const p=spawn('vercel',['env','add',name,'production','--scope','george351419-4070s-projects','--yes','--force','--sensitive'],{stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);p.stdin.end(value);p.on('close',code=>{if(code)console.log(name+': configuration failed (check Vercel permissions).');resolve(!code);});});
 if(!ok)process.exit(1);console.log(name+': configured');
}
console.log('Runtime values stored in Vercel; no credential file written.');
