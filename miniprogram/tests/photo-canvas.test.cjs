const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('photo export uses matching layout, backing and source dimensions for wide and tall originals',async()=>{
 for(const [width,height] of [[1200,600],[600,1200]]){
  const exports=[];const draws=[];let layout={};
  const canvas={getContext:()=>({fillRect(){},drawImage(...args){draws.push(args);}}),createImage:()=>({set src(value){this.onload();}})};
  const page={setData(data,done){layout=data;done();},createSelectorQuery:()=>({select:()=>({fields:()=>({exec(fn){assert.equal(layout.photoCanvasWidth,width);assert.equal(layout.photoCanvasHeight,height);fn([{node:canvas,width,height}]);}})})})};
  const context={module:{exports:{}},wx:{requirePrivacyAuthorize:o=>o.success(),chooseMedia:o=>o.success({tempFiles:[{tempFilePath:'/original'}]}),getImageInfo:o=>o.success({width,height}),canvasToTempFilePath:o=>{exports.push(o);o.success({tempFilePath:'/prepared'});},getFileSystemManager:()=>({getFileInfo:o=>o.success({size:100}),readFile:o=>o.success({data:'base64'})})}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/photos.js'),'utf8'),context);
  const result=await context.module.exports.preparePhotos(page,1);
  assert.equal(canvas.width,width);assert.equal(canvas.height,height);
  assert.equal(exports[0].width,width);assert.equal(exports[0].height,height);assert.equal(exports[0].destWidth,width);assert.equal(exports[0].destHeight,height);
  assert.deepEqual(draws[0].slice(1),[0,0,width,height]);assert.equal(result[0].path,'/prepared');
 }
});
