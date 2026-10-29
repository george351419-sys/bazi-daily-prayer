// Referer only identifies an allowed client; account/session/CSRF checks remain mandatory.
export function allowedMiniProgram(req,config){
 const ids=String(config.MINIPROGRAM_APP_IDS||'').split(',').map(s=>s.trim()).filter(s=>/^wx[a-f0-9]{16}$/.test(s));
 if(!ids.length)return false;
 const value=req.headers.referer||req.headers.referrer;
 if(typeof value!=='string')return false;
 try{const url=new URL(value);if(url.origin!=='https://servicewechat.com'||url.username||url.password||url.search||url.hash)return false;const match=url.pathname.match(/^\/(wx[a-f0-9]{16})\/(?:devtools|0|[1-9]\d*)\/page-frame\.html$/);return !!match&&ids.includes(match[1]);}catch{return false;}
}
