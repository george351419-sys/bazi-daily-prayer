import {handleRequest} from '../api/gateway.js';
// EdgeOne Node functions receive a Web Request and environment per invocation.
export default async function onRequest({request,env={}}){
 const config={...process.env,...env,DEEPSEEK_TIMEOUT_MS:'100000',ARK_TIMEOUT_MS:'105000',ANALYSIS_BUDGET_MS:'108000'};
 const url=new URL(request.url),headers=Object.fromEntries(request.headers);
 headers.host=url.host;
 let body;
 if(request.method==='POST'){
  const text=await request.text();
  if(Buffer.byteLength(text)>128*1024)return Response.json({error:'提交内容过长。'},{status:413});
  try{body=JSON.parse(text);}catch{return Response.json({error:'提交内容格式不正确。'},{status:400});}
 }
 const req={method:request.method,url:request.url,headers,body,query:{route:url.pathname.replace(/^\/api\//,'')}};
 const outputHeaders=new Headers();let status=200,result;
 const res={setHeader(k,v){outputHeaders.set(k,v);},status(code){status=code;return this;},json(data){outputHeaders.set('Content-Type','application/json; charset=utf-8');result=JSON.stringify(data);},end(){result=null;}};
 await handleRequest(req,res,config);
 return new Response(result,{status,headers:outputHeaders});
}
