import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHmac} from 'node:crypto';
import {WISH_GROUPS,WISHES,RULE_VERSION,validateInput,calendarFor,validateMapping,buildImagePrompt,todayShanghai} from './lib/domain.mjs';
import {doubao,publicProviderError} from './lib/providers.mjs';
import {analyzeMapping} from './lib/service.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const config={...process.env};
if(process.argv.includes('--credentials-stdin')){
 if(process.stdin.isTTY)process.stdin.setRawMode(true);
 process.stdout.write('Ready for credentials JSON on stdin (input hidden).\n');
 const line=await new Promise(resolve=>{let text='';const onData=c=>{text+=c.toString();if(text.includes('\n')){process.stdin.off('data',onData);resolve(text.trim());}};process.stdin.on('data',onData);});
 try{Object.assign(config,JSON.parse(line));}catch{console.error('Invalid credential input');process.exit(1);}
 if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
}
const serverSalt=randomBytes(32),sessions=new Map(),jobs=new Map(),cache=new Map(),images=new Map();
await mkdir(path.join(ROOT,'.runtime/images'),{recursive:true});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function session(req,res){const sid=req.headers['x-session-token']||req.headers.cookie?.match(/(?:^|; )prayer_session=([a-f0-9]{48})/)?.[1];if(sid&&sessions.has(sid))return sessions.get(sid);const id=randomBytes(24).toString('hex'),s={id,csrf:randomBytes(24).toString('hex'),history:[],lastRequest:0};sessions.set(id,s);res.setHeader('Set-Cookie',`prayer_session=${id}; HttpOnly; SameSite=Strict; Path=/`);return s;}
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(Buffer.byteLength(b)>16000)throw new Error('提交内容过大。');}try{return JSON.parse(b);}catch{throw new Error('请求格式错误。');}}
function exposed(job){return {id:job.id,status:job.status,phase:job.phase,mapping:job.mapping||null,calendar:job.calendar||null,error:job.error||null,image:job.image?'/api/image/'+job.id:null,date:job.input.today,cached:!!job.cached};}
async function analyze(job,s){try{job.phase='正在核对四柱与运年月日';job.calendar=calendarFor(job.input);job.phase='正在为你的心愿选择主题、主尊与画面要素';job.mapping=await analyzeMapping(config,job.input,job.calendar,s.history);job.phase='解读已完成';job.status='mapped';}catch(e){job.status='analysis_failed';job.phase='解析未完成';job.error=publicProviderError(e);if(!(e.service))job.error=e.message;}}
async function generate(job,s){try{job.status='generating';job.phase='正在绘制你的今日祈福画，通常需要几十秒';job.error=null;const image=await doubao(config,buildImagePrompt(job.mapping));const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[image.type],filename=path.join(ROOT,'.runtime/images',job.id+'.'+ext);await writeFile(filename,image.bytes,{mode:0o600});images.set(job.id,{filename,type:image.type,owner:s.id});job.image=true;job.status='complete';job.phase='今日祈福画已完成';s.history.push({date:job.input.today,deity:job.mapping.deity,wish:job.mapping.wish_id});}catch(e){job.status='image_failed';job.phase='画面暂未生成，解读已保留';job.error=publicProviderError(e);}}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
 const url=new URL(req.url,'http://localhost');
 try{
  if(!['GET','POST'].includes(req.method))return json(res,405,{error:'请求方式不支持。'});
  const s=session(req,res);
  if(req.method==='POST'){
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'请求来源无效。'});
   if(req.headers['x-csrf-token']!==s.csrf)return json(res,403,{error:'页面会话已更新，请刷新重试。'});
  }
  if(url.pathname==='/api/bootstrap')return json(res,200,{csrf:s.csrf,sessionToken:s.id,date:todayShanghai(),wishGroups:WISH_GROUPS,ready:{text:!!config.DEEPSEEK_API_KEY,image:!!config.ARK_API_KEY},version:RULE_VERSION});
  if(url.pathname==='/api/analyze'&&req.method==='POST'){
   if(!config.DEEPSEEK_API_KEY)return json(res,503,{error:'请先在服务端配置 DeepSeek API Key。'});
   const input=validateInput(await body(req));
   const hash=createHmac('sha256',serverSalt).update(s.id+JSON.stringify({...input,wishes:[...input.wishes].sort(),version:RULE_VERSION})).digest('hex');
   const prior=cache.get(hash);if(prior&&jobs.get(prior)?.status!=='analysis_failed'){const j=jobs.get(prior);return json(res,200,{...exposed(j),cached:true});}
   if(Date.now()-s.lastRequest<3000)return json(res,429,{error:'请稍候再提交。'});s.lastRequest=Date.now();
   const id=randomBytes(18).toString('hex'),job={id,input,status:'analyzing',phase:'正在准备你的今日祈福画',owner:s.id};jobs.set(id,job);cache.set(hash,id);void analyze(job,s);return json(res,202,exposed(job));
  }
  const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{36})(\/image)?$/);
  if(match){const job=jobs.get(match[1]);if(!job||job.owner!==s.id)return json(res,404,{error:'找不到这次生成记录。'});
   if(req.method==='POST'&&match[2]){
    if(!config.ARK_API_KEY)return json(res,503,{error:'请先在服务端配置豆包 API Key。'});
    if(['mapped','image_failed'].includes(job.status)){void generate(job,s);return json(res,202,exposed(job));}
    if(['complete','generating'].includes(job.status))return json(res,200,exposed(job));
    return json(res,409,{error:'请先完成文案解析。'});
   }
   return json(res,200,exposed(job));
  }
  const imageMatch=url.pathname.match(/^\/api\/image\/([a-f0-9]{36})$/);
  if(imageMatch){const im=images.get(imageMatch[1]);if(!im||im.owner!==s.id)return json(res,404,{error:'图片不存在或不属于当前会话。'});const bytes=await readFile(im.filename);res.writeHead(200,{'Content-Type':im.type,'Cache-Control':'private, max-age=86400',...(url.searchParams.has('download')?{'Content-Disposition':'attachment; filename="daily-prayer.'+im.filename.split('.').pop()+'"'}:{})});return res.end(bytes);}
  if(url.pathname.startsWith('/api/'))return json(res,404,{error:'接口不存在。'});
  const allowed={'/':'index.html','/backend-config.js':'backend-config.js','/wishes.js':'wishes.js','/app.js':'app.js','/backend-routing.js':'backend-routing.js','/style.css':'style.css','/assets/prayer-example.png':'assets/prayer-example.png'};
  const filename=allowed[url.pathname];if(!filename)return json(res,404,{error:'页面不存在。'});
  const bytes=await readFile(path.join(ROOT,'public',filename));res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
 }catch(e){json(res,400,{error:e.service?publicProviderError(e):String(e.message).slice(0,180)});}
});
const port=Number(config.PORT||8787);server.listen(port,'127.0.0.1',()=>console.log(`今日祈愿 · http://127.0.0.1:${port}`));
