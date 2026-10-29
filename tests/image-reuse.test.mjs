import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {visualMapping,findReusableImage,reuseArchivedImage} from '../lib/image-reuse.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {saveArtwork,getArtwork,privateImage} from '../lib/accounts.mjs';
const owner={id:'a'.repeat(32)},other={id:'b'.repeat(32)};
const mapping=()=>({wish_id:'W02',deity:'陈九公',primary_element:'火',secondary_element:'木',colors:[{name:'橙红',hex:'#FA6240'},{name:'青绿',hex:'#36845A'}],zodiac:['兔','狗'],stem_symbols:[{stem:'辛',motif:'晶莹珠饰'},{stem:'乙',motif:'柔枝'}],elements:[{name:'陈九公',meaning:'旧解读'},{name:'橙红'},{name:'青绿'}],image_prompt:'旧日期的构图描述',overview:'旧日解读',title:'旧作品'});
async function context(t){const dir=await mkdtemp(path.join(os.tmpdir(),'prayer-reuse-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'test-only-image-reuse-encryption-key'};}
async function source(c,account=owner,id='c'.repeat(36),m=mapping()){
 const bytes=await readFile(new URL('../public/assets/prayer-example.png',import.meta.url)),key='images/'+account.id+'/'+id;
 await accountRepository(c).putImage(key,bytes);
 const record={id,userId:account.id,date:'2026-10-01',status:'complete',mapping:m,image:{key,type:'image/png',sha256:createHash('sha256').update(bytes).digest('hex')}};
 await saveArtwork(c,account,record);return record;
}
const target=()=>({id:'d'.repeat(36),userId:owner.id,date:'2026-10-25',status:'mapped',mapping:mapping()});
test('相同画面映射忽略解读/日期措辞和集合顺序，喜用主尊生肖天干配色变化不能混用',()=>{
 const a=mapping(),b=mapping();b.overview='今日独立解读';b.image_prompt='今日重新措辞的构图';b.title='新标题';b.colors.reverse();b.zodiac.reverse();b.stem_symbols.reverse();b.elements.reverse();b.elements[0].meaning='新解释';
 assert.equal(visualMapping(a).fingerprint,visualMapping(b).fingerprint);
 for(const change of [m=>m.primary_element='土',m=>m.secondary_element='水',m=>m.deity='赵公明',m=>m.wish_id='W03',m=>m.zodiac.push('牛'),m=>m.stem_symbols[0].motif='银铃',m=>m.stem_symbols[0].stem='壬',m=>m.colors[0].hex='#000000',m=>m.elements.push({name:'新法器'})]){const c=mapping();change(c);assert.notEqual(visualMapping(a).fingerprint,visualMapping(c).fingerprint);}
 assert.equal(visualMapping({title:'不完整映射'}),null);
});
test('当天记录保存独立映射和解读，只共享本人已归档图片并记录来源',async t=>{
 const c=await context(t),old=await source(c),today=target();today.mapping.overview='今天的新解读';today.mapping.image_prompt='措辞不同仍沿用结构化映射';
 await saveArtwork(c,owner,today);const match=await findReusableImage(c,owner,today);assert.equal(match.source.id,old.id);
 await reuseArchivedImage(c,owner,today,match);
 const saved=await getArtwork(c,owner,today.id);assert.equal(saved.mapping.overview,'今天的新解读');assert.equal(saved.date,'2026-10-25');assert.equal(saved.imageReuse.sourceDate,'2026-10-01');assert.equal(saved.image.key,old.image.key);assert.ok(saved.visualMapping.fingerprint);assert.deepEqual((await privateImage(c,owner,saved)).bytes,(await privateImage(c,owner,old)).bytes);
 assert.equal(await findReusableImage(c,other,{...target(),userId:other.id}),null);
});
test('旧画册无需指纹也可迁移索引，检索不局限于近期十四天',async t=>{
 const c=await context(t),old=await source(c);
 // Simulate a legacy record and missing index, created before this feature existed.
 const repo=accountRepository(c);for(const item of (await repo.list({prefix:'image-mappings/'})).blobs)await repo.delete(item.key);
 delete old.visualMapping;await repo.put('artworks/'+owner.id+'/'+old.id,old);
 for(let i=0;i<30;i++){const id=i.toString(16).padStart(36,'0'),m=mapping();m.deity='其他主尊'+i;await saveArtwork(c,owner,{id,userId:owner.id,date:'2026-10-20',status:'complete',mapping:m});}
 assert.equal((await findReusableImage(c,owner,target())).source.id,old.id);
});
test('未来日期、缺失或校验不符的图片不能复用',async t=>{
 const c=await context(t),old=await source(c),repo=accountRepository(c);
 old.date='2026-12-01';await saveArtwork(c,owner,old);assert.equal(await findReusableImage(c,owner,target()),null);
 old.date='2026-10-01';await saveArtwork(c,owner,old);await repo.putImage(old.image.key,Buffer.from('corrupt'));assert.equal(await findReusableImage(c,owner,target()),null);
 await repo.delete(old.image.key);assert.equal(await findReusableImage(c,owner,target()),null);
});

test('显式旧画风版本不与当前版本混用',async t=>{
 const c=await context(t),old=await source(c);old.visualMapping={version:'different-style-v0',fingerprint:'old'};
 await accountRepository(c).put('artworks/'+owner.id+'/'+old.id,old);
 assert.equal(await findReusableImage(c,owner,target()),null);
});

test('复用提交再次校验归属，不能把他人图片引用写入本账户',async t=>{
 const c=await context(t);await source(c);const match=await findReusableImage(c,owner,target());
 await assert.rejects(()=>reuseArchivedImage(c,other,{...target(),userId:other.id},match),e=>e.status===409);
});
