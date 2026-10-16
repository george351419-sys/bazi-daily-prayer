export const EDGEONE_BACKEND='https://playmath.cn';
export function isLegacyBackend(value){
 try{const host=new URL(value).hostname;return host==='bazi-daily-prayer.vercel.app'||(host.startsWith('bazi-daily-prayer-')&&host.endsWith('.vercel.app'));}catch{return false;}
}
export function resolveBackend({hostname,mode='',configured='',saved=''}){
 if(hostname==='playmath.cn'||hostname==='www.playmath.cn'||(hostname.startsWith('bazi-daily-prayer-')&&hostname.endsWith('.edgeone.cool')))return '';
 if(hostname==='george351419-sys.github.io'||isLegacyBackend('https://'+hostname))return EDGEONE_BACKEND;
 if(mode==='same-origin')return '';
 const value=(configured||saved||'').replace(/\/$/,'');
 return isLegacyBackend(value)?EDGEONE_BACKEND:value;
}
