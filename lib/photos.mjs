import {createHash} from 'node:crypto';
import {AccountError,accountRepository} from './account-store.mjs';
import {newArtworkId,saveArtwork} from './accounts.mjs';
// The browser re-encodes uploads as JPEG, removing EXIF/location metadata.
// Bound both encoded bytes and declared dimensions before any compiler sees the file.
export function validatePhoto(body){
 if(body.type!=='image/jpeg'||typeof body.base64!=='string'||body.base64.length>1048576||(body.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)))throw new AccountError(400,'请通过照片选择器上传 JPEG、PNG 或 WebP 图片。');
 const bytes=Buffer.from(body.base64,'base64');
 if(bytes.length<32||bytes.length>768*1024||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new AccountError(400,'照片格式不完整，请重新选择。');
 let width=0,height=0,scan=false;
 for(let p=2;p<bytes.length-2;){
  if(bytes[p++]!==255)throw new AccountError(400,'照片格式不正确。');
  while(bytes[p]===255)p++;
  const marker=bytes[p++];if(p+2>bytes.length)break;
  const length=bytes.readUInt16BE(p);if(length<2||p+length>bytes.length)throw new AccountError(400,'照片数据不完整。');
  if([0xc0,0xc1,0xc2].includes(marker)&&length>=8){height=bytes.readUInt16BE(p+3);width=bytes.readUInt16BE(p+5);}
  if(marker===0xda){scan=true;break;}p+=length;
 }
 if(!scan||!width||!height||width>1440||height>1440)throw new AccountError(400,'请先在网页中压缩照片后再上传。');
 return {bytes,width,height};
}
export async function uploadPhoto(c,account,body){
 const {bytes,width,height}=validatePhoto(body),id=newArtworkId(),repo=accountRepository(c);
 const title=typeof body.title==='string'?body.title.trim().slice(0,60):'我的照片';
 if(/[\x00-\x1f\x7f]/.test(title))throw new AccountError(400,'请使用普通文字作为照片名称。');
 const key='images/'+account.id+'/'+id,record={id,userId:account.id,source:'upload',date:new Date(Date.now()+8*3600000).toISOString().slice(0,10),createdAt:new Date().toISOString(),status:'complete',image:{key,type:'image/jpeg',size:bytes.length,width,height,sha256:createHash('sha256').update(bytes).digest('hex')},mapping:{title:title||'我的照片',deity:'',wish_id:'',overview:'你上传的个人照片。画屏会转换为六色墨水屏画面；可选择搭配微行动建议。',elements:[],colors:[],blessing:'',important_note:'照片仅保存在你的账户中。',reading:{intro:'个人照片无需祈福画取象解读。',sections:[]}}};
 await repo.putImage(key,bytes);
 try{await saveArtwork(c,account,record);}catch(error){await repo.delete(key).catch(()=>{});throw error;}
 return {item:{id,date:record.date,title:record.mapping.title,source:'upload',status:'complete',image:'/api/account/artworks/'+id+'/image'}};
}
