import {createHash,createHmac} from 'node:crypto';
import {AccountError} from './account-store.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
export const mailReady=c=>typeof c.MAIL_TRANSPORT==='function'||!!(c.TENCENT_SES_SECRET_ID&&c.TENCENT_SES_SECRET_KEY&&/^[1-9]\d*$/.test(String(c.TENCENT_SES_TEMPLATE_ID||''))&&c.MAIL_FROM);
export async function sendAccountMail(c,{email,code,purpose},fetcher=fetch){
 if(!mailReady(c))throw new AccountError(503,'邮箱验证服务正在配置，请稍后再试。');
 const subject='生辰造像馆｜'+({register:'注册验证码',reset:'重设密码验证码',bind:'绑定邮箱验证码'}[purpose]||'邮箱验证码');
 if(typeof c.MAIL_TRANSPORT==='function'){await c.MAIL_TRANSPORT({email,code,purpose,subject});return;}
 const host='ses.tencentcloudapi.com',timestamp=Math.floor(Date.now()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10),scope=date+'/ses/tc3_request';
 const body=JSON.stringify({FromEmailAddress:c.MAIL_FROM,Destination:[email],Subject:subject,Template:{TemplateID:Number(c.TENCENT_SES_TEMPLATE_ID),TemplateData:JSON.stringify({code})}});
 const canonical='POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:'+host+'\n\ncontent-type;host\n'+sha(body);
 const toSign='TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+sha(canonical);
 const key=hmac(hmac(hmac('TC3'+c.TENCENT_SES_SECRET_KEY,date),'ses'),'tc3_request'),signature=createHmac('sha256',key).update(toSign).digest('hex');
 const headers={'Content-Type':'application/json; charset=utf-8',Host:host,'X-TC-Action':'SendEmail','X-TC-Version':'2020-10-02','X-TC-Region':c.TENCENT_SES_REGION||'ap-guangzhou','X-TC-Timestamp':String(timestamp),Authorization:'TC3-HMAC-SHA256 Credential='+c.TENCENT_SES_SECRET_ID+'/'+scope+', SignedHeaders=content-type;host, Signature='+signature};
 if(c.TENCENT_SES_SESSION_TOKEN)headers['X-TC-Token']=c.TENCENT_SES_SESSION_TOKEN;
 try{const response=await fetcher('https://'+host,{method:'POST',headers,body,signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok||data.Response?.Error||!data.Response?.MessageId)throw new Error('mail-rejected');}
 catch{throw new AccountError(503,'验证码邮件暂未发送成功，请稍后再试。');}
}
