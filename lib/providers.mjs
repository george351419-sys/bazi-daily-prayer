export class ProviderError extends Error{constructor(service,status,code){super(service+'服务暂不可用');this.service=service;this.status=status;this.code=code;}}
export async function callJSON(url,key,body,service,timeout=180000,fetcher=fetch){
 let response;
 try{response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});}catch{throw new ProviderError(service,0,'network_or_timeout');}
 let data;try{data=await response.json();}catch{throw new ProviderError(service,response.status,'invalid_response');}
 if(!response.ok)throw new ProviderError(service,response.status,String(data?.error?.code||'upstream_error').slice(0,100));
 return data;
}
export async function deepseek(config,system,user,fetcher=fetch){
 const data=await callJSON('https://api.deepseek.com/chat/completions',config.DEEPSEEK_API_KEY,{model:config.DEEPSEEK_MODEL||'deepseek-flash',messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}],response_format:{type:'json_object'},thinking:{type:'disabled'},temperature:0.35,max_tokens:10000,stream:false},'DeepSeek',180000,fetcher);
 const choice=data.choices?.[0];if(choice?.finish_reason==='length')throw new ProviderError('DeepSeek',200,'truncated_output');
 try{return JSON.parse(choice.message.content);}catch{throw new ProviderError('DeepSeek',200,'invalid_json');}
}
export async function doubao(config,prompt,fetcher=fetch,urlOnly=false){
 const data=await callJSON('https://ark.cn-beijing.volces.com/api/v3/images/generations',config.ARK_API_KEY,{model:config.ARK_IMAGE_MODEL||'doubao-seedream-4-5-251128',prompt,size:'2048x2048',response_format:'url',watermark:false,stream:false,sequential_image_generation:'disabled'},'豆包',240000,fetcher);
 const item=data.data?.[0];
 if(!item?.url)throw new ProviderError('豆包',200,'missing_image_url');
 let url;try{url=new URL(item.url);}catch{throw new ProviderError('豆包',200,'invalid_image_url');}
 if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':'))throw new ProviderError('豆包',200,'invalid_image_url');
 if(urlOnly)return {url:url.href};
 let image;try{image=await fetcher(url,{signal:AbortSignal.timeout(60000),redirect:'error'});}catch{throw new ProviderError('豆包',0,'image_download_failed');}
 if(!image.ok)throw new ProviderError('豆包',image.status,'image_download_failed');
 const type=image.headers.get('content-type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(type))throw new ProviderError('豆包',200,'invalid_image_type');
 const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length>25*1024*1024)throw new ProviderError('豆包',200,'image_too_large');
 return {bytes,type};
}
export function publicProviderError(e){
 if(!(e instanceof ProviderError))return '处理失败，请稍后重试。';
 if(e.status===401||e.status===403)return e.service+'鉴权失败，请检查服务端 API Key、模型开通权限及接入点配置。';
 if(e.status===402)return e.service+'余额不足，请充值后重试。';
 if(e.status===429)return e.service+'请求繁忙或额度受限，请稍后重试。';
 if(e.status===404)return e.service+'模型不可用，请检查服务端模型 ID 或接入点。';
 return e.service+'请求未完成（'+(e.status||'网络超时')+'），请重试；已完成的解读会保留。';
}
