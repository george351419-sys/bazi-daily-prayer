import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {handleRequest} from './api/gateway.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const config={...process.env,ACCOUNT_STORAGE:process.env.ACCOUNT_STORAGE||'file',ACCOUNT_DATA_DIR:process.env.ACCOUNT_DATA_DIR||path.join(ROOT,'.runtime/accounts')};
if(process.argv.includes('--credentials-stdin')){
 if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdout.write('Ready for credentials JSON on stdin (input hidden).\n');
 const line=await new Promise(resolve=>{let text='';const onData=chunk=>{text+=chunk.toString();if(text.includes('\n')){process.stdin.off('data',onData);resolve(text.trim());}};process.stdin.on('data',onData);});
 try{Object.assign(config,JSON.parse(line));}catch{console.error('Invalid credential input');process.exit(1);}if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
}
await mkdir(path.join(ROOT,'.runtime'),{recursive:true});
if(!config.SESSION_SECRET){const secretFile=path.join(ROOT,'.runtime/account-secret');try{config.SESSION_SECRET=(await readFile(secretFile,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;config.SESSION_SECRET=randomBytes(32).toString('hex');await writeFile(secretFile,config.SESSION_SECRET,{mode:0o600,flag:'wx'});}}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp'};
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
 const url=new URL(req.url,'http://localhost');
 try{
  if(url.pathname.startsWith('/api/')){
   let body='';if(req.method==='POST'){for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>128*1024){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'提交内容过长。'}));return;}}}
   const adapter={setHeader:(key,value)=>res.setHeader(key,value),status(code){res.statusCode=code;return this;},json(data){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));},end:bytes=>res.end(bytes)};
   await handleRequest({method:req.method,url:req.url,headers:req.headers,body:body||undefined,query:{route:url.pathname.slice(5)}},adapter,config);return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const publicRoot=path.join(ROOT,'public'),file=path.resolve(publicRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname))),type=types[path.extname(file)];
  if(!type||!file.startsWith(publicRoot+path.sep)){res.writeHead(404);res.end();return;}
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(bytes);
 }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'服务暂时无法处理请求，请稍后再试。'}));}
});
const port=Number(config.PORT||8787);server.listen(port,'127.0.0.1',()=>console.log('今日祈愿 · http://127.0.0.1:'+port));
