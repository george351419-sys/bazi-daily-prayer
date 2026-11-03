import {randomBytes,createHash} from 'node:crypto';
import {accountRepository,AccountError} from './account-store.mjs';
import {getArtwork,currentAccount} from './accounts.mjs';
import {wishCopy} from './wish-copy.mjs';
const key=token=>'artwork-views/'+createHash('sha256').update(token).digest('hex');
const TTL=10*60*1000;
export async function createArtworkView(c,account,id,now=Date.now()){
 const record=await getArtwork(c,account,id);
 if(record.status!=='complete'||!record.image)throw new AccountError(409,'请先完成并保存这幅画作。');
 const token=randomBytes(32).toString('hex'),expiresAt=now+TTL;
 await accountRepository(c).put(key(token),{accountId:account.id,sessionToken:account.token,artworkId:id,expiresAt});
 return {url:'https://playmath.cn/artwork.html#view='+token,expiresAt};
}
export async function readArtworkView(c,token,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(token||''))throw new AccountError(401,'请从小程序重新打开这幅画的说明。');
 const grant=await accountRepository(c).get(key(token));
 if(!grant||grant.expiresAt<=now)throw new AccountError(401,'链接已过期，请从小程序重新打开。');
 const account=await currentAccount(c,{headers:{'x-account-token':grant.sessionToken}});
 if(!account||account.id!==grant.accountId)throw new AccountError(401,'登录已失效，请从小程序重新打开。');
 return {account,record:await getArtwork(c,account,grant.artworkId),expiresAt:grant.expiresAt};
}
const TOPICS=[
 {key:'foundation',title:'生辰与喜用：这幅画的取用起点',match:/命局|生辰|取用.*起点/},
 {key:'colors',title:'主、次色调：为什么这样搭配',match:/配色|色调/},
 {key:'deity',title:'主尊：为什么选择这位主尊',match:/主尊/},
 {key:'zodiac',title:'生肖：为什么选择或不添加',match:/生肖/},
 {key:'stems',title:'天干映射物：为什么有或没有',match:/天干/}
];
export function artworkExplanation(record){
 const m=record.mapping||{},withoutBirth=m.content_mode==='wish-art'||record.input?.contentMode==='wish-art';
 const saved=(Array.isArray(m.reading?.sections)?m.reading.sections:[]).filter(s=>s&&typeof s.title==='string'&&typeof s.body==='string'&&s.body.trim());
 const sections=TOPICS.map(topic=>{
  const section=saved.find(s=>typeof s.title==='string'&&topic.match.test(s.title)&&typeof s.body==='string'&&s.body.trim());
  return {key:topic.key,title:section?.title||topic.title,body:section?.body||(withoutBirth?'本幅作品生成时未使用生辰，未进行该项命理取用，不编造个人喜用或关系依据。':'这幅作品没有保存本项的分项依据，无法用通用说明或当前排盘补写当时的选择理由。'+(m.professional?'请参阅下方保存的完整解读。':'')),available:!!section};
 });
 const summary=m.birth_summary&&typeof m.birth_summary==='object'?m.birth_summary:record.calendar||{};
 const pillars=Array.isArray(summary.pillars)?summary.pillars:Array.isArray(summary.natal)?summary.natal:[];
 return wishCopy({id:record.id,date:record.date,title:m.title||'我的祈福画',theme:m.wish_label||'美好日常',
  mode:withoutBirth?'wish-art':'birth-prayer',overview:m.overview||'',intro:m.reading?.intro||'',
  birthContext:pillars.length?'生成时采用的四柱：'+pillars.join('、')+'。'+(summary.time_basis?'用时依据：'+summary.time_basis+'。':''):'',
  primaryElement:m.primary_element||'',secondaryElement:m.secondary_element||'',deity:m.deity||'',
  zodiac:Array.isArray(m.zodiac)?m.zodiac:[],stemSymbols:Array.isArray(m.stem_symbols)?m.stem_symbols.map(s=>({stem:s.stem,motif:s.motif})):[],
  composition:[],symbols:[],sections,archivedProfessional:!saved.length&&typeof m.professional==='string'?m.professional:'',
  colors:(m.colors||[]).filter(c=>/^#[a-f0-9]{6}$/i.test(c.hex)).map(c=>({name:String(c.name).slice(0,40),hex:c.hex})),
  note:'以上解读来自这幅作品生成时保存的生辰与祈愿取用依据，以作品日期为准，不按查看日重算。'+(withoutBirth?'本幅作品未使用生辰，不能视作个人八字解读。':'传统取象用于寄托祈愿，不保证现实结果。')});
}
