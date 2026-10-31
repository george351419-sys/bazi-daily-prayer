const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('style selection clears prior job and preview does not change selection',()=>{
 let page,preview;vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../pages/mine/index.js'),'utf8'),{require:()=>({}),Page:p=>page=p,wx:{previewImage:options=>preview=options}});
 page.setData=function(patch){for(const [key,value] of Object.entries(patch)){if(key.startsWith('profile.'))this.data.profile[key.slice(8)]=value;else this.data[key]=value;}};
 page.job={id:'old'};page.choose({currentTarget:{dataset:{field:'artStyle',value:'spirit'}}});assert.equal(page.data.profile.artStyle,'spirit');assert.equal(page.job,null);assert.equal(page.data.jobReady,false);
 page.previewArtStyle({currentTarget:{dataset:{id:'cute'}}});assert.equal(preview.current,'/assets/prayer-styles/cute.jpg');assert.equal(page.data.profile.artStyle,'spirit');
 for(const style of page.data.artStyles)assert.ok(fs.existsSync(require('node:path').join(__dirname,'../assets/prayer-styles',style.id+'.jpg')));
});
