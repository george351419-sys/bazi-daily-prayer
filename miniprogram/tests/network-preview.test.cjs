const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {prayerPreview}=require('../utils/prayer-preview');
test('preview follows requested prayer dates, excludes uploads and never shows the old device receipt',()=>{
 const now=Date.parse('2026-11-13T12:00:00+08:00'),status={plan:{contentMode:'prayer'},planDays:[{date:'2026-11-13',image:'B'},{date:'2026-11-14',image:'tomorrow'}],artwork:{date:'2026-11-13',image:'old-A'}};
 assert.equal(prayerPreview(status,[],0,now).artwork.image,'B');assert.equal(prayerPreview(status,[],1,now).artwork.image,'tomorrow');
 const catalog=[{date:'2026-11-13',source:'upload',image:'photo',createdAt:'z'},{date:'2026-11-13',status:'complete',image:'old-prayer',createdAt:'a'},{date:'2026-11-13',status:'complete',image:'new-prayer',createdAt:'b'}];
 assert.equal(prayerPreview({plan:{contentMode:'photo'},planDays:[catalog[0]]},catalog,0,now).artwork.image,'new-prayer');assert.equal(prayerPreview(status,[],1,Date.parse('2026-11-13T16:00:00Z')).artwork,null);
});
function page(api){let p;const app={globalData:{user:{id:'u'}}};vm.runInNewContext(fs.readFileSync(require.resolve('../pages/network/index.js'),'utf8'),{Page:x=>p=x,require:id=>id.endsWith('/prayer-preview')?{prayerPreview}:id.endsWith('/api')?api:{},getApp:()=>app,Map,console});p.data={...p.data,user:app.globalData.user};p.setData=patch=>Object.assign(p.data,patch);p.active=true;return {p,app};}
test('late today image cannot replace tomorrow after switching or reopen a collapsed preview',async()=>{
 let resolveToday;const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),tomorrow=new Date(Date.now()+8*3600000+86400000).toISOString().slice(0,10);
 const {p}=page({image:async path=>path==='today'?new Promise(resolve=>resolveToday=resolve):'local-tomorrow'});p.connection={current:{plan:{contentMode:'prayer'},planDays:[{date:today,image:'today'},{date:tomorrow,image:'tomorrow'}]}};assert.equal(p.data.previewExpanded,false);assert.equal(p.data.diagnosticsExpanded,false);
 p.data.previewExpanded=true;const pending=p.loadPrayerPreview();p.data.previewDay=1;await p.loadPrayerPreview();assert.equal(p.data.previewImage,'local-tomorrow');resolveToday('local-today');await pending;assert.equal(p.data.previewImage,'local-tomorrow');
 p.togglePreview();assert.equal(p.data.previewExpanded,false);assert.equal(p.data.previewLoading,false);
});
test('diagnostics and preview panels have the requested order and collapsed bodies',()=>{
 const s=fs.readFileSync(require.resolve('../pages/network/index.wxml'),'utf8');assert.ok(s.indexOf('先让它连上网络')<s.indexOf('链接诊断'));assert.ok(s.indexOf('链接诊断')<s.indexOf('画面同步进展'));assert.ok(s.indexOf('画面同步进展')<s.indexOf('画作预览'));assert.ok(s.indexOf('画作预览')<s.indexOf('class="paper binding-panel"'));assert.ok(s.includes('wx:if="{{diagnosticsExpanded}}"'));assert.ok(s.includes('wx:if="{{previewExpanded}}"'));
 const panel=s.slice(s.indexOf('class="paper diagnostics-panel"'),s.indexOf('class="paper sync-panel"'));for(const action of ['diagnostics','statusDiagnostics','sendDiagnostic','heartbeatAddress'])assert.ok(panel.includes('bindtap="'+action+'"'));
});
