import {getStore} from '@edgeone/pages-blob';
import {mkdir,readFile,readdir,unlink,open,rename,link} from 'node:fs/promises';
import path from 'node:path';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
export class AccountError extends Error{constructor(status,message){super(message);this.status=status;}}
export const accountsEnabled=c=>['blob','file'].includes(c.ACCOUNT_STORAGE);
const encryptionKey=c=>{if(!c.SESSION_SECRET||c.SESSION_SECRET.length<20)throw new AccountError(503,'账户服务尚未完成配置。');return createHash('sha256').update('prayer-accounts-v1:'+c.SESSION_SECRET).digest();};
export function encryptAccountData(c,bytes){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(c),iv);const data=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);}
export function decryptAccountData(c,bytes){try{const b=Buffer.from(bytes),cipher=createDecipheriv('aes-256-gcm',encryptionKey(c),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]);}catch{throw new AccountError(503,'账户资料暂时无法读取，请稍后再试。');}}
function fileStore(root){
 const resolve=key=>{if(!/^[a-zA-Z0-9_./-]+$/.test(key)||key.includes('..'))throw new Error('Invalid storage key');return path.join(root,key);};
 return {
  async set(key,value,options={}){
   const file=resolve(key),dir=path.dirname(file);await mkdir(dir,{recursive:true,mode:0o700});
   const pending=path.join(dir,'.pending-'+randomBytes(16).toString('hex'));let handle;
   try{
    handle=await open(pending,'wx',0o600);await handle.writeFile(typeof value==='string'?value:Buffer.from(value));await handle.sync();await handle.close();handle=null;
    if(options.onlyIfNew)await link(pending,file);else await rename(pending,file);
    const directory=await open(dir,'r');try{await directory.sync();}finally{await directory.close();}
   }catch(e){if(e.code==='EEXIST')throw Object.assign(new Error('Already exists'),{code:'PRECONDITION_FAILED'});throw e;}
   finally{if(handle)await handle.close();try{await unlink(pending);}catch(e){if(e.code!=='ENOENT')throw e;}}
  },
  async get(key){try{return await readFile(resolve(key));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async delete(key){try{await unlink(resolve(key));}catch(e){if(e.code!=='ENOENT')throw e;}},
  async list({prefix='',limit=50,cursor='' }={}){let keys=[];async function walk(dir,part=''){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const item of entries){if(item.name.startsWith('.pending-'))continue;const key=part+item.name;if(item.isDirectory())await walk(path.join(dir,item.name),key+'/');else keys.push(key);}}await walk(root);keys=keys.filter(k=>k.startsWith(prefix)&&k>cursor).sort();const slice=keys.slice(0,limit);return {blobs:slice.map(key=>({key})),...(keys.length>limit?{cursor:slice.at(-1)}:{})};}
 };
}
let sharedBlobStore;
export function accountStore(c){
 encryptionKey(c);
 if(c.ACCOUNT_STORAGE==='file')return fileStore(path.resolve(c.ACCOUNT_DATA_DIR||'.runtime/accounts'));
 if(c.ACCOUNT_STORAGE==='blob')return sharedBlobStore??=getStore({name:'prayer-accounts-v1',consistency:'strong'});
 throw new AccountError(503,'账户服务尚未开启。');
}
export function accountRepository(c){
 const store=accountStore(c);
 return {
  async get(key){const bytes=await store.get(key,{type:'arrayBuffer',consistency:'strong'});return bytes===null?null:JSON.parse(decryptAccountData(c,bytes).toString());},
  async put(key,value,options={}){const bytes=encryptAccountData(c,Buffer.from(JSON.stringify(value)));await store.set(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),options);},
  async putImage(key,bytes){const encrypted=encryptAccountData(c,bytes);await store.set(key,encrypted.buffer.slice(encrypted.byteOffset,encrypted.byteOffset+encrypted.byteLength));},
  async image(key){const bytes=await store.get(key,{type:'arrayBuffer',consistency:'strong'});return bytes===null?null:decryptAccountData(c,bytes);},
  delete:key=>store.delete(key),
  list:options=>store.list({...options,consistency:'strong',paginate:false})
 };
}
