const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {shanghaiDate,todayArtwork}=require('../utils/today-artwork');
test('Shanghai midnight changes the displayed date, independently of the device 01:00 schedule',()=>{assert.equal(shanghaiDate(Date.parse('2026-11-03T15:59:59Z')),'2026-11-03');assert.equal(shanghaiDate(Date.parse('2026-11-03T16:00:00Z')),'2026-11-04');});
test('today selection prefers current planned content over stale receipt and never substitutes tomorrow',()=>{const status={artwork:{date:'2026-11-02',image:'old'},planDays:[{date:'2026-11-04',image:'tomorrow'},{date:'2026-11-03',image:'today'}]};assert.equal(todayArtwork(status,'2026-11-03').image,'today');assert.equal(todayArtwork(status,'2026-11-05'),null);});
test('companion fetches only today image and renders no two-day plan',async()=>{
 let page;const paths=[],today=shanghaiDate(),status={artwork:{date:'2000-01-01',image:'old'},planDays:[{date:today,image:'today-image',title:'生活富足'},{date:'2099-01-01',image:'tomorrow-image'}]},app={ready:Promise.resolve(),globalData:{user:{id:'u'}}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../pages/today/index.js'),'utf8'),{Page:p=>page=p,require:id=>id.includes('today-artwork')?{shanghaiDate,todayArtwork}:id.includes('screen-connection')?{}:{request:async()=>status,image:async p=>{paths.push(p);return '/tmp/today.jpg';}},getApp:()=>app,setTimeout:()=>1,clearTimeout(){}});
 page.active=true;page.connection={acceptStatus(){}};page.setData=p=>Object.assign(page.data,p);await page.refresh();assert.deepEqual(paths,['today-image']);assert.equal(page.data.image,'/tmp/today.jpg');assert.equal(page.data.artworkTitle,'生活富足');
 const template=fs.readFileSync(require('node:path').join(__dirname,'../pages/today/index.wxml'),'utf8');assert.doesNotMatch(template,/day-previews|status.notice|status.deviceReport|\{\{progress\}\}/);
});
