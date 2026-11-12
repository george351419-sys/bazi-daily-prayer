const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ScreenConnection}=require('../utils/screen-connection');
test('custom photo page gets connection guidance instead of prayer-only photo state',()=>{
 const c=new ScreenConnection();
 const status={syncConfigured:true,plan:{contentMode:'photo',artworkIds:['photo']},preparation:{ready:true},build:{status:'published',sha256:'a'.repeat(64)},device:{id:'112233445566'}};
 assert.notEqual(c.stateFor(status,null,false).phase,'photo');
 assert.equal(c.stateFor(status,'prayer',false).phase,'photo');
});
test('saving photos immediately accepts the new status and starts polling',async()=>{
 let page,polls=0,accepted;
 const status={syncConfigured:true,plan:{contentMode:'photo',artworkIds:['photo'],rotationStartDate:'2026-11-12'}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../pages/screen/index.js'),'utf8'),{Page:p=>page=p,clearTimeout(){},require:id=>id.endsWith('/api')?{request:async()=>status,error:(_,e)=>{throw e;}}:id.endsWith('/ritual-view')?{rotationIndex:()=>0}:{},console});
 page.data={...page.data};page.active=true;page.photoSelection=['photo'];page.setData=patch=>Object.assign(page.data,patch);
 page.connection={acceptStatus:s=>accepted=s,stateFor:(s,id)=>{assert.equal(id,null);return{phase:'preparing'};}};page.pollSync=async()=>{polls++;};
 await page.savePhoto();assert.equal(accepted,status);assert.equal(polls,1);assert.equal(page.data.syncState.phase,'preparing');assert.equal(page.data.busy,false);
});
