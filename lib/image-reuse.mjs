import {createHash} from 'node:crypto';
import {accountRepository,AccountError} from './account-store.mjs';

// Structured visual identity. Dates, readings and prose prompts intentionally do not
// require a new image when the same fixed-style composition can serve the mapping.
export const IMAGE_MAPPING_VERSION='prayer-square-warm-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/gu,' '):'';
const uniqueSorted=items=>[...new Set(items)].sort();
const validHeader=(bytes,type)=>type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):type==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
export function visualMapping(mapping){
 if(!mapping||!text(mapping.wish_id)||!text(mapping.deity)||!['木','火','土','金','水'].includes(mapping.primary_element)||!Array.isArray(mapping.colors)||!mapping.colors.length||!Array.isArray(mapping.zodiac)||!Array.isArray(mapping.stem_symbols)||!Array.isArray(mapping.elements))return null;
 const colors=mapping.colors.map(c=>({name:text(c.name),hex:text(c.hex).toLowerCase()}));
 const stems=mapping.stem_symbols.map(s=>({stem:text(s.stem),motif:text(s.motif)}));
 if(colors.some(c=>!c.name||!/^#[a-f0-9]{6}$/.test(c.hex))||stems.some(s=>!s.stem||!s.motif)||mapping.elements.some(e=>!text(e.name))||mapping.zodiac.some(z=>!text(z)))return null;
 const content={version:IMAGE_MAPPING_VERSION,wishId:text(mapping.wish_id),primaryElement:mapping.primary_element,secondaryElement:text(mapping.secondary_element),deity:text(mapping.deity),colors:uniqueSorted(colors.map(c=>JSON.stringify(c))).map(c=>JSON.parse(c)),zodiac:uniqueSorted(mapping.zodiac.map(text)),stems:uniqueSorted(stems.map(s=>JSON.stringify(s))).map(s=>JSON.parse(s)),elements:uniqueSorted(mapping.elements.map(e=>text(e.name)))};
 return {version:IMAGE_MAPPING_VERSION,fingerprint:hash(JSON.stringify(content)),content};
}
const artworkPrefix=account=>'artworks/'+account.id+'/';
const indexPrefix=(account,fingerprint='')=>'image-mappings/'+account.id+'/'+IMAGE_MAPPING_VERSION+'/'+(fingerprint?fingerprint+'/':'');
export async function indexArtworkImage(c,account,record){
 if(!/^[a-f0-9]{36}$/.test(record.id||'')||record.userId!==account.id||record.status!=='complete'||!record.image||record.imageReuse)return;
 if(record.visualMapping?.version&&record.visualMapping.version!==IMAGE_MAPPING_VERSION)return;
 const visual=visualMapping(record.mapping);if(!visual)return;
 // Store immutable per-artwork entries; concurrent completions do not overwrite a shared list.
 await accountRepository(c).put(indexPrefix(account,visual.fingerprint)+record.id,{artworkId:record.id});
}
async function migrateIndex(c,account){
 const repo=accountRepository(c),key='image-mapping-migrations/'+account.id+'/'+IMAGE_MAPPING_VERSION;
 const migration=await repo.get(key);if(migration?.completedAt)return;
 let cursor=migration?.cursor;
 do{
  const page=await repo.list({prefix:artworkPrefix(account),limit:50,cursor});
  for(const item of page.blobs){const record=await repo.get(item.key);if(record)await indexArtworkImage(c,account,record);}
  cursor=page.cursor;
  await repo.put(key,cursor?{cursor}:{completedAt:new Date().toISOString()});
 }while(cursor);
}
export async function findReusableImage(c,account,record){
 const visual=visualMapping(record.mapping);record.visualMapping=visual;
 if(!visual)return null;
 await migrateIndex(c,account);
 const repo=accountRepository(c);let cursor;
 do{
  const page=await repo.list({prefix:indexPrefix(account,visual.fingerprint),limit:25,cursor});
  for(const item of page.blobs){
   const entry=await repo.get(item.key);if(!/^[a-f0-9]{36}$/.test(entry?.artworkId||'')||entry.artworkId===record.id)continue;
   const source=await repo.get(artworkPrefix(account)+entry.artworkId);
   if(!source||source.userId!==account.id||source.status!=='complete'||!source.image||!/^\d{4}-\d{2}-\d{2}$/.test(source.date||'')||source.date>record.date||visualMapping(source.mapping)?.fingerprint!==visual.fingerprint)continue;
   if(source.visualMapping?.version&&source.visualMapping.version!==IMAGE_MAPPING_VERSION)continue;
   if(!['image/png','image/jpeg','image/webp'].includes(source.image.type)||typeof source.image.key!=='string'||!source.image.key.startsWith('images/'+account.id+'/'))continue;
   const bytes=await repo.image(source.image.key);if(!bytes?.length||bytes.length>12*1024*1024||!validHeader(bytes,source.image.type))continue;
   const sha256=hash(bytes);if(source.image.sha256&&source.image.sha256!==sha256)continue;
   return {source,image:{...source.image,sha256,size:bytes.length},fingerprint:visual.fingerprint};
  }
  cursor=page.cursor;
 }while(cursor);
 return null;
}
export async function reuseArchivedImage(c,account,record,match){
 const fingerprint=visualMapping(record.mapping)?.fingerprint;
 if(record.userId!==account.id||match.source.userId!==account.id||!match.image.key.startsWith('images/'+account.id+'/')||!fingerprint||fingerprint!==match.fingerprint||visualMapping(match.source.mapping)?.fingerprint!==fingerprint)throw new AccountError(409,'这张历史图片不符合当前账户或画面映射。');
 record.visualMapping=visualMapping(record.mapping);
 record.image={...match.image};record.status='complete';
 record.imageReuse={sourceArtworkId:match.source.id,sourceDate:match.source.date,originalArtworkId:match.source.imageReuse?.originalArtworkId||match.source.id,originalDate:match.source.imageReuse?.originalDate||match.source.date,fingerprint:match.fingerprint,reusedAt:new Date().toISOString()};
 delete record.pendingImageURL;delete record.pendingImageExpires;
 // The original encrypted image object is shared; today's analysis and record remain independent.
 await accountRepository(c).put(artworkPrefix(account)+record.id,record);
 await indexArtworkImage(c,account,record);
 return '/api/account/artworks/'+record.id+'/image';
}
