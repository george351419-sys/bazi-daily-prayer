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
const STYLE={cute:'采用可爱风，用圆润亲切的人物造型表达温暖的画面气质。',folk:'采用民俗风，注重传统人物形象与衣冠配饰的辨识度。',spirit:'采用灵兽风，以问问兽演绎主题形象，保留主题角色的服饰与配饰。'};
const MOTIFS={莲花:'莲花在传统艺术中常寄托清雅与宁静的愿望。',流云:'流云为画面带来舒展的节奏，也寄托美好的祝愿。',祥云:'祥云是传统吉祥纹样，表达对美好生活的向往。',桂花:'桂花常用于表达美好祝愿与对成长的期盼。'};
function colorNote(hex){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)),[r,g,b]=rgb,light=(Math.max(...rgb)+Math.min(...rgb))/2;if(light>210)return '明亮轻盈的色调，可与主体形成柔和衬托。';if(light<80)return '较深的色调，可增强画面的沉静感与层次。';if(r>b+25)return '偏暖的色调，为画面带来温暖、明快的气质。';if(b>r+25)return '偏冷的色调，为画面带来清爽、安静的气质。';if(g>r+15&&g>b)return '偏绿的色调，为画面带来自然、舒展的气质。';return '柔和协调的色调，用于组织整幅画的色彩节奏。';}
export function artworkExplanation(record){
 const m=record.mapping||{},subject=String(m.deity||'祈愿主题').slice(0,40),symbols=[{name:subject,text:'本幅设计以'+subject+'为主题形象，承载对美好日常的祝愿。'}];
 for(const [name,text]of Object.entries(MOTIFS))if((m.elements||[]).some(e=>String(e.name).includes(name)))symbols.push({name,text});
 for(const animal of m.zodiac||[])if('鼠牛虎兔龙蛇马羊猴鸡狗猪'.includes(animal)&&animal.length===1)symbols.push({name:animal,text:'以生肖动物作为传统文化中的视觉符号，为画面增添亲切的陪伴感。'});
 return {id:record.id,date:record.date,title:wishCopy(record.mapping?.title||'我的祈福画'),
  theme:wishCopy(m.wish_label||'美好日常'),
  composition:[{name:'画面主体',text:'围绕'+subject+'组织视觉中心，以主题形象与周围装饰形成呼应。'},{name:'绘画风格',text:STYLE[m.art_style]||'沿用这幅作品记录的绘画风格，组织主体与背景层次。'}],
  colors:(m.colors||[]).filter(c=>/^#[a-f0-9]{6}$/i.test(c.hex)).map(c=>({name:String(c.name).slice(0,40),hex:c.hex,text:colorNote(c.hex)})),symbols,
  note:'说明依据这幅作品保存的设计要素整理；传统寓意表达祝愿，不作运势或现实结果判断。'};
}
