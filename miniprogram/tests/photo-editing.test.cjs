const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const photo=id=>({id,title:id,source:'upload',status:'complete',image:'/images/'+id});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function setup({request,image,preparePhotos}={}){
 let page;const user={id:'user'};let loads=0;
 const connection={acceptStatus(){},stateFor(){return{phase:'waiting'};},setContentSaving(){}};
 const api={request:request||(async url=>url.includes('artworks')?{items:[photo('old')]}:{plan:{contentMode:'photo',artworkIds:['old'],showActions:true},syncConfigured:true}),image:image||(async p=>'/preview'+p),error:(p,e)=>p.setData({error:e.message}),tab(){}};
 const context={Page:p=>page=p,getApp:()=>({ready:Promise.resolve(),globalData:{user}}),setTimeout:()=>1,clearTimeout(){},require:id=>{
  if(id.endsWith('/api'))return api;
  if(id.endsWith('/photos'))return{preparePhotos,authorize:async()=>{}};
  if(id.endsWith('/screen-connection'))return{observeConnection:p=>{p.connection=connection;},stopObserving(){}};
  if(id.endsWith('/ritual-view'))return{rotationIndex:()=>0};
  if(id.endsWith('/transfer-status'))return{receiptTime:()=>'',transferStatus:()=>({})};
  return{};
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../pages/screen/index.js'),'utf8'),context);
 page.data={...page.data,catalog:[photo('old')],user};page.setData=patch=>Object.assign(page.data,patch);page.photoSelection=['old'];page.active=true;page.run=1;page.draftOwner=user.id;page.connection=connection;page.rebuildPhotos();page.pollSync=async()=>{};
 return{page,api,connection};
}
const event=id=>({currentTarget:{dataset:{id}}});
test('old preview request cannot delete a newly uploaded photo from the current catalog',async()=>{
 const wait=deferred(),{page}=setup({image:()=>wait.promise});
 const pending=page.hydratePhotos(page.run);
 page.data.catalog.unshift({...photo('new'),preview:'/new'});page.photoSelection.push('new');page.data.photosDirty=true;page.rebuildPhotos();
 wait.resolve('/old-preview');await pending;
 assert.deepEqual(Array.from(page.data.photoItems,x=>x.id),['old','new']);assert.equal(page.data.photoItems[0].preview,'/old-preview');
});
test('preview completion never restores a removed photo or an older order',async()=>{
 const wait=deferred(),{page}=setup({image:()=>wait.promise});
 page.data.catalog.push({...photo('second'),preview:'/second'});page.photoSelection.push('second');page.rebuildPhotos();
 const pending=page.hydratePhotos(page.run);page.removePhoto(event('old'));wait.resolve('/old-preview');await pending;
 assert.deepEqual(Array.from(page.data.photoItems,x=>x.id),['second']);assert.equal(page.data.photosDirty,true);
});
test('native album hide/show preserves edited selection and upload appends the new image',async()=>{
 const wait=deferred(),{page}=setup({preparePhotos:()=>wait.promise,request:async()=>({item:photo('new')})});
 page.removePhoto(event('old'));let loads=0;page.load=async()=>loads++;
 const pending=page.choosePhotos();page.onHide();await page.onShow();
 assert.equal(loads,0);assert.equal(page.data.busy,true);
 wait.resolve([{path:'/new',type:'image/jpeg',base64:'AAA'}]);await pending;
 assert.deepEqual(Array.from(page.data.photoItems,x=>x.id),['new']);assert.equal(page.data.photosDirty,true);assert.equal(page.data.busy,false);
});
test('reopening custom page retains unsaved edits while saved settings still describe the old plan',async()=>{
 const {page}=setup();page.removePhoto(event('old'));page.data.catalog.unshift({...photo('new'),preview:'/new'});page.photoSelection.push('new');page.rebuildPhotos();
 page.onHide();await page.onShow();
 assert.deepEqual(Array.from(page.data.photoItems,x=>x.id),['new']);assert.equal(page.data.photosDirty,true);
});
test('a delayed initial settings response cannot overwrite edits made while it was loading',async()=>{
 const wait=deferred(),{page}=setup({request:url=>url.includes('artworks')?Promise.resolve({items:[photo('old')]}):wait.promise});
 const pending=page.load();page.removePhoto(event('old'));page.data.catalog.unshift({...photo('new'),preview:'/new'});page.photoSelection.push('new');page.rebuildPhotos();
 wait.resolve({plan:{contentMode:'photo',artworkIds:['old'],showActions:true},syncConfigured:true});await pending;
 assert.deepEqual(Array.from(page.data.photoItems,x=>x.id),['new']);
});
