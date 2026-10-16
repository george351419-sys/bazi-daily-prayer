import {createHmac,createHash,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
const key=c=>createHash('sha256').update(c.SESSION_SECRET||c.DEEPSEEK_API_KEY||'unconfigured').digest();
const mac=(c,s)=>createHmac('sha256',key(c)).update(s).digest('base64url');
const equal=(a,b)=>{try{return timingSafeEqual(Buffer.from(a),Buffer.from(b));}catch{return false;}};
export function createSession(c){const id=randomBytes(24).toString('hex');return id+'.'+mac(c,id);}
export function verifySession(c,token){const [id,sig]=String(token||'').split('.');return /^[a-f0-9]{48}$/.test(id)&&equal(sig||'',mac(c,id))?token:null;}
export const csrfFor=(c,token)=>mac(c,'csrf:'+token);
export function sealJob(c,data){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(c),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
export function openJob(c,token,owner){if(typeof token!=='string'||token.length>220000)throw new Error('生成记录无效，请重新提交。');try{const b=Buffer.from(token,'base64url'),d=createDecipheriv('aes-256-gcm',key(c),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));const job=JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());if(job.owner!==owner||job.expires<Date.now())throw new Error();return job;}catch{throw new Error('生成记录已失效，请重新提交。');}}
