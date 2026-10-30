import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import onRequest from '../edgeone/handler.mjs';
import {getArtwork,saveArtwork,newArtworkId} from '../lib/accounts.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {validatePhoto} from '../lib/photos.mjs';
import {configureRitual,ritualStatus,ritualPhotoPair} from '../lib/ritual.mjs';
const jpeg=await readFile(new URL('./fixtures/photo-upload.jpg',import.meta.url));
const payload={type:'image/jpeg',base64:jpeg.toString('base64'),title:'一家人的周末'};
async function context(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-photos-'));t.after(()=>rm(dir,{recursive:true,force:true}));const mail=[];
 const env={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'photo-test-secret-only-123456789',MAIL_TRANSPORT:async m=>mail.push(m)};
 const bootstrap=await(await onRequest({request:new Request('https://playmath.cn/api/bootstrap'),env})).json();let cookie='';
 async function request(route,body,csrf=bootstrap.csrf){const response=await onRequest({env,request:new Request('https://playmath.cn/api/'+route,{method:body?'POST':'GET',headers:{Origin:'https://playmath.cn','X-Session-Token':bootstrap.sessionToken,'X-CSRF-Token':csrf,Cookie:cookie},body:body?JSON.stringify(body):undefined})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;}

 const registered=await(await request('account/register',{username:'photos_test',password:'Photo-test-password!'})).json();
 return {env,request,account:registered.user};
}
test('photo upload is private, authenticated, bounded and reusable in photo-only or action modes',async t=>{
 const {env,request,account}=await context(t);
 assert.equal((await request('account/photos',payload,'wrong')).status,403);
 const response=await request('account/photos',payload);assert.equal(response.status,201);const {item}=await response.json();assert.equal(item.source,'upload');
 const image=await request('account/artworks/'+item.id+'/image');assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),jpeg);assert.match(image.headers.get('cache-control'),/private/);
 const list=await(await request('account/artworks')).json();assert.equal(list.items[0].source,'upload');
 const photo=await request('account/ritual',{mode:'test',contentMode:'photo',showActions:false,artworkIds:[item.id]});assert.equal(photo.status,200);let result=await photo.json();assert.equal(result.action,null);assert.equal(result.displayPlan.showActions,false);assert.equal(result.artwork.source,'upload');
 await configureRitual(env,account,{mode:'test',contentMode:'photo',showActions:true,artworkIds:[item.id]});result=await ritualStatus(env,account);assert.ok(result.action);assert.equal(result.plan.contentMode,'photo');assert.equal(result.plan.mode,'daily');
 await assert.rejects(getArtwork(env,{id:'f'.repeat(32)},item.id),e=>e.status===404);
 assert.equal((await request('account/ritual',{mode:'test',contentMode:'prayer',showActions:true,artworkIds:[item.id,item.id]})).status,400);
 const raw=await readFile(path.join(env.ACCOUNT_DATA_DIR,'images',account.id,item.id));assert.ok(!raw.includes(jpeg));
 await request('account/logout',{});assert.equal((await request('account/photos',payload)).status,401);
});
test('photo rotation keeps an ordered list of at most six and loops daily',async t=>{
 const {env,account}=await context(t),photos=[];
 for(let i=0;i<7;i++){const id=newArtworkId();photos.push(id);await saveArtwork(env,account,{id,userId:account.id,status:'complete',date:'2026-10-29',source:'upload',image:{key:'dummy/'+id},mapping:{title:'照片 '+i}});}
 const plan=(await configureRitual(env,account,{contentMode:'photo',showActions:true,artworkIds:photos.slice(0,6)})).plan;
 assert.deepEqual(plan.artworkIds,photos.slice(0,6));assert.equal(plan.rotationStartDate,new Date(Date.now()+7*3600000).toISOString().slice(0,10));
 await assert.rejects(()=>configureRitual(env,account,{contentMode:'photo',showActions:true,artworkIds:photos}),e=>e.status===400);
 await assert.rejects(()=>configureRitual(env,account,{contentMode:'photo',showActions:true,artworkIds:[photos[0],photos[0]]}),e=>e.status===400);
 const pair=ritualPhotoPair(photos.slice(0,6),'2026-10-29',Date.parse('2026-11-01T12:00:00+08:00'));
 assert.equal(pair.dayIndex,3);assert.deepEqual(pair.artworkIds,[photos[3],photos[4]]);
});
test('photo mode rejects generated pictures and prayer mode permits hiding actions',async t=>{
 const {env,account}=await context(t),ids=[];
 for(let i=0;i<2;i++){const id=newArtworkId();ids.push(id);await saveArtwork(env,account,{id,userId:account.id,status:'complete',date:'2026-10-29',image:{key:'dummy'},mapping:{title:'祈福画'}});}
 await assert.rejects(configureRitual(env,account,{mode:'test',contentMode:'photo',showActions:true,artworkIds:ids}),e=>e.status===400);
 const result=await configureRitual(env,account,{mode:'test',contentMode:'prayer',showActions:false,artworkIds:ids});assert.equal(result.plan.showActions,false);assert.equal(result.action,null);
 await assert.rejects(configureRitual(env,account,{mode:'test',contentMode:'photo',showActions:'false',artworkIds:ids}),e=>e.status===400);
});
test('upload validates JPEG dimensions and structure; the larger body limit is scoped to photos',async t=>{
 const {request}=await context(t);assert.equal(validatePhoto(payload).width,48);
 for(const body of [{...payload,type:'image/svg+xml'}, {...payload,base64:Buffer.from('<svg/>').toString('base64')},{...payload,base64:jpeg.subarray(0,-2).toString('base64')},{...payload,base64:'A'.repeat(1048580)}])assert.throws(()=>validatePhoto(body));
 assert.equal((await request('account/photos',{...payload,title:'a\0b'})).status,400);
 assert.equal((await request('account/photos',{...payload,base64:'A'.repeat(1100000)})).status,413);
 assert.equal((await request('account/profile',{padding:'x'.repeat(150000)})).status,413);
});
