import {visualMapping,indexArtworkImage} from './image-reuse.mjs';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {accountRepository,accountsEnabled,AccountError} from './account-store.mjs';
import {validateInput,calendarFor,WISHES} from './domain.mjs';
const scrypt=promisify(scryptCallback),TTL=30*86400000;
const digest=s=>createHash('sha256').update(s).digest('hex');
const loginName=value=>{const name=String(value||'').trim().normalize('NFKC').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(name))throw new AccountError(400,'账号请使用 3–24 位字母、数字或下划线。');return name;};
function password(value){if(typeof value!=='string'||value.length<10||value.length>128)throw new AccountError(400,'密码请设置为 10–128 位字符。');return value;}
async function hash(value){const salt=randomBytes(16),key=await scrypt(value,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});return salt.toString('hex')+':'+key.toString('hex');}
async function matches(value,stored){const [salt,key]=String(stored||'').split(':');if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{64}$/.test(key||''))return false;const actual=await scrypt(value,Buffer.from(salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(actual,Buffer.from(key,'hex'));}
const credentialsKey=username=>'credentials/'+digest(username);
const profileKey=id=>'profiles/'+id;
const sessionKey=token=>'sessions/'+digest(token);
export const userView=c=>({id:c.id,username:c.username,nickname:c.nickname,createdAt:c.createdAt,email:c.emailVerified?c.email:null,emailVerified:!!c.emailVerified,authProvider:c.authProvider||'password',wechatBound:!!c.wechat});
export const accountCookieName=c=>c.ACCOUNT_STORAGE==='file'?'prayer_auth':'__Host-prayer_auth';
export function accountCookie(c,token,clear=false){return `${accountCookieName(c)}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear?0:TTL/1000}${c.ACCOUNT_STORAGE==='file'?'':'; Secure'}`;}
function cookieToken(c,req){const item=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(accountCookieName(c)+'='));const token=item?.slice(accountCookieName(c).length+1);return /^[a-f0-9]{64}$/.test(token||'')?token:null;}
export async function currentAccount(c,req){
 const headerToken=String(req.headers['x-account-token']||'').trim();
 const token=/^[a-f0-9]{64}$/.test(headerToken)?headerToken:cookieToken(c,req);if(!token)return null;
 const repo=accountRepository(c),session=await repo.get(sessionKey(token));if(!session||session.expires<Date.now())return null;
 const credentials=await repo.get(credentialsKey(session.username));if(!credentials||credentials.id!==session.userId||credentials.version!==session.version)return null;
 return {...userView(credentials),token,credentials};
}
export async function requireAccount(c,req){const account=await currentAccount(c,req);if(!account)throw new AccountError(401,'请先登录，再为你保存和绘制祈福画。');return account;}
async function newSession(c,credentials){const token=randomBytes(32).toString('hex');await accountRepository(c).put(sessionKey(token),{userId:credentials.id,username:credentials.username,version:credentials.version,expires:Date.now()+TTL});return token;}
export const createAccountSession=(c,credentials)=>newSession(c,credentials);
async function throttle(c,scope,limit,windowMs){
 const repo=accountRepository(c),bucket=Math.floor(Date.now()/windowMs),prefix='attempts/'+digest(scope)+'/'+bucket+'/';
 const {blobs}=await repo.list({prefix,limit:limit+1});if(blobs.length>=limit)throw new AccountError(429,'尝试次数较多，请稍后再试。');
 await repo.put(prefix+randomBytes(12).toString('hex'),{expires:(bucket+1)*windowMs});
}
export async function register(c,body,client){
 const username=loginName(body.username),secret=password(body.password),nickname=String(body.nickname||username).trim().slice(0,30)||username;
 await throttle(c,'register:'+client,8,3600000);
 const recoveryCode=randomBytes(18).toString('hex'),credentials={id:randomBytes(16).toString('hex'),username,nickname,passwordHash:await hash(secret),recoveryHash:await hash(recoveryCode),version:1,createdAt:new Date().toISOString()};
 try{await accountRepository(c).put(credentialsKey(username),credentials,{onlyIfNew:true});}catch(e){if(e.code==='PRECONDITION_FAILED')throw new AccountError(409,'这个账号已有人使用，请换一个。');throw e;}
 const token=await newSession(c,credentials);return {user:userView(credentials),token,recoveryCode,profile:null};
}
export async function login(c,body,client){
 const username=loginName(body.username),secret=typeof body.password==='string'&&body.password.length<=128?body.password:'';
 await throttle(c,'login-user:'+username,20,900000);await throttle(c,'login-client:'+client,60,900000);
 const repo=accountRepository(c),credentials=await repo.get(credentialsKey(username));
 const match=await matches(secret,credentials?.passwordHash||'00000000000000000000000000000000:'+ '00'.repeat(32));
 if(!credentials||!match)throw new AccountError(401,'账号或密码不正确。');
 return {user:userView(credentials),token:await newSession(c,credentials),profile:await repo.get(profileKey(credentials.id))};
}
export async function logout(c,account){if(account)await accountRepository(c).delete(sessionKey(account.token));}
export async function saveNickname(c,account,value){
 const nickname=String(value||'').normalize('NFKC').trim().slice(0,30);
 if(nickname.length<1||nickname.length>30)throw new AccountError(400,'昵称请填写 1–30 个字符。');
 const credentials={...account.credentials,nickname};await accountRepository(c).put(credentialsKey(credentials.username),credentials);
 return userView(credentials);
}
export async function recover(c,body,client){
 const username=loginName(body.username),newPassword=password(body.password),code=String(body.recoveryCode||'').trim().toLowerCase().replace(/[ -]/g,'');
 await throttle(c,'recover:'+username,6,3600000);await throttle(c,'recover-client:'+client,12,3600000);
 const repo=accountRepository(c),credentials=await repo.get(credentialsKey(username));
 if(!credentials||!await matches(code,credentials.recoveryHash))throw new AccountError(401,'账号或恢复码不正确。');
 const recoveryCode=randomBytes(18).toString('hex');credentials.passwordHash=await hash(newPassword);credentials.recoveryHash=await hash(recoveryCode);credentials.version++;
 await repo.put(credentialsKey(username),credentials);return {user:userView(credentials),token:await newSession(c,credentials),profile:await repo.get(profileKey(credentials.id)),recoveryCode};
}
export async function getProfile(c,account){return accountRepository(c).get(profileKey(account.id));}
export async function saveProfile(c,account,raw,{profileRevision}={}){const input=validateInput(raw);calendarFor(input);const profile={gender:input.gender,birthDate:input.birthDate,birthTime:input.birthTime,calendar:input.calendar,leap:input.leap,city:input.city,wishes:input.wishes,artStyle:input.artStyle,updatedAt:new Date().toISOString(),...(Number.isSafeInteger(profileRevision)?{profileRevision}:{})};await accountRepository(c).put(profileKey(account.id),profile);return profile;}
export function profileSignature(input){return digest(JSON.stringify([input.gender,input.birthDate,input.birthTime,input.calendar,!!input.leap,input.place?.longitude??'',input.place?.latitude??'']));}
export const newArtworkId=()=> (0xffffffffffff-Date.now()).toString(16).padStart(12,'0')+randomBytes(12).toString('hex');
const artworkKey=(account,id)=>'artworks/'+account.id+'/'+id;
export async function saveArtwork(c,account,record){const visual=visualMapping(record.mapping);if(visual&&(!record.visualMapping||!record.image))record.visualMapping=visual;await accountRepository(c).put(artworkKey(account,record.id),record);await indexArtworkImage(c,account,record);}
export async function getArtwork(c,account,id){if(!/^[a-f0-9]{36}$/.test(id))throw new AccountError(404,'找不到这幅作品。');const record=await accountRepository(c).get(artworkKey(account,id));if(!record||record.userId!==account.id)throw new AccountError(404,'找不到这幅作品。');return record;}
export async function listArtworks(c,account,cursor=''){
 const prefix='artworks/'+account.id+'/';if(cursor&&(!cursor.startsWith(prefix)||cursor.length>160))throw new AccountError(400,'翻页信息无效。');
 const repo=accountRepository(c),page=await repo.list({prefix,limit:12,cursor});const records=await Promise.all(page.blobs.map(x=>repo.get(x.key)));
 return {items:records.filter(x=>x&&x.userId===account.id).map(x=>({id:x.id,date:x.date,createdAt:x.createdAt,source:x.source||'generated',title:x.mapping.title,deity:x.mapping.deity,wishLabel:WISHES.find(w=>w.id===x.mapping.wish_id)?.label||'',status:x.status,managedAutomatically:x.source==='automatic',imageReuse:x.imageReuse?{sourceArtworkId:x.imageReuse.sourceArtworkId,sourceDate:x.imageReuse.sourceDate}:null,image:x.image?'/api/account/artworks/'+x.id+'/image':null})),cursor:page.cursor||null};
}
export async function accountHistory(c,account,input){
 const repo=accountRepository(c),history=[];let cursor;const signature=profileSignature(input);
 for(let page=0;page<4&&history.length<14;page++){
  const result=await repo.list({prefix:'artworks/'+account.id+'/',limit:25,cursor});const records=await Promise.all(result.blobs.map(x=>repo.get(x.key)));
  for(const record of records)if(record?.status==='complete'&&record.profileSignature===signature&&record.date<=input.today&&(record.source!=='automatic'||record.publicationState==='published'))history.push({date:record.date,deity:record.mapping.deity,wish:record.mapping.wish_id});
  if(!result.cursor)break;cursor=result.cursor;
 }
 return history.slice(0,14).reverse();
}
export async function persistImage(c,account,record,url,fetcher=fetch){
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error'});const type=response.headers.get('content-type')?.split(';')[0];
 if(!response.ok||!['image/png','image/jpeg','image/webp'].includes(type))throw new AccountError(502,'画面已绘制，归档暂未完成，请稍后重试保存。');
 const reader=response.body.getReader(),chunks=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>12*1024*1024){await reader.cancel();throw new AccountError(502,'画作体积超过归档限制，请重新绘制。');}chunks.push(Buffer.from(value));}
 const key='images/'+account.id+'/'+record.id;await accountRepository(c).putImage(key,Buffer.concat(chunks));record.image={key,type,size:length,sha256:createHash('sha256').update(Buffer.concat(chunks)).digest('hex')};record.status='complete';delete record.pendingImageURL;delete record.pendingImageExpires;await saveArtwork(c,account,record);
 return '/api/account/artworks/'+record.id+'/image';
}
export async function privateImage(c,account,record){if(!record.image)throw new AccountError(404,'这幅作品的图片尚未完成。');const bytes=await accountRepository(c).image(record.image.key);if(!bytes)throw new AccountError(404,'暂时找不到图片，请稍后再试。');return {bytes,type:record.image.type};}
export {accountsEnabled,AccountError};
