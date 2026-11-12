const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(require.resolve(path),'utf8');
test('custom sync and connection guidance are gated by an explicit save and settings come last',()=>{
 const screen=read('../pages/screen/index.wxml'),network=read('../pages/network/index.wxml');
 assert.ok(screen.includes('user&&showSyncProgress&&syncState'));
 assert.ok(screen.indexOf('bindtap="savePhoto"')<screen.indexOf('id="photo-sync-progress"'));
 assert.ok(screen.indexOf('id="photo-sync-progress"')<screen.indexOf('class="paper presentation-settings"'));
 assert.ok(screen.includes('wx:if="{{settingsExpanded}}"'));
 assert.equal(network.includes('画屏呈现设置'),false);
 assert.ok(network.indexOf('画面同步进展')>network.indexOf('bindtap="disconnect"'));
 assert.ok(network.indexOf('解除画屏绑定')>network.indexOf('画面同步进展'));
});
function page(){let p;const calls=[];const status={plan:{contentMode:'prayer',mode:'daily',artworkIds:['a','b']},syncConfigured:true};
 vm.runInNewContext(read('../pages/screen/index.js'),{Page:x=>p=x,clearTimeout(){},require:id=>id.endsWith('/api')?{request:async(url,body)=>{calls.push({url,body});return status;},error:(p,e)=>p.setData({error:e.message})}:id.endsWith('/ritual-view')?{rotationIndex:()=>0}:{}});
 p.data={...p.data};p.active=true;p.photoSelection=[];p.setData=patch=>Object.assign(p.data,patch);p.connection={acceptStatus(){},stateFor:()=>({phase:'waiting'}),setContentSaving(){}};p.pollSync=async()=>{};
 return{p,calls};
}
test('presentation settings start collapsed and can save two different prayer artworks',async()=>{
 const {p,calls}=page();assert.equal(p.data.settingsExpanded,false);assert.equal(p.data.showSyncProgress,false);
 p.data.catalog=[{id:'a',title:'甲',status:'complete',image:'/a'},{id:'b',title:'乙',status:'complete',image:'/b'}];p.populatePresentation(['a','b']);p.togglePresentation();assert.equal(p.data.settingsExpanded,true);
 await p.savePresentation();assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0].body.artworkIds),['a','b']);assert.equal(p.data.showSyncProgress,true);
});
test('photo settings save the full rotation rather than silently reducing it to two images',async()=>{
 const {p}=page();p.data.settingsContentMode='photo';p.photoSelection=['a','b','c','d'];let ids;p.savePhoto=async()=>{ids=p.photoSelection.slice();};await p.savePresentation();assert.deepEqual(ids,['a','b','c','d']);
});
