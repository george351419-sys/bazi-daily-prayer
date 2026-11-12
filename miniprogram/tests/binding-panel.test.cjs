const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(require.resolve(p),'utf8');
function page(){let p;vm.runInNewContext(read('../pages/network/index.js'),{Page:x=>p=x,require:()=>({}),console});p.data={...p.data};p.setData=data=>Object.assign(p.data,data);return p;}
function expanded(p){return !p.data.syncConfigured||p.data.binding||p.data.bindingExpanded;}
test('unbound panel remains open, bound panel starts collapsed and allows manual inspection',()=>{
 const p=page();assert.equal(expanded(p),true);p.toggleBindingPanel();assert.equal(expanded(p),true);
 p.data.syncConfigured=true;assert.equal(expanded(p),false);p.toggleBindingPanel();assert.equal(expanded(p),true);p.toggleBindingPanel();assert.equal(expanded(p),false);
 p.data.binding=true;assert.equal(expanded(p),true);p.toggleBindingPanel();assert.equal(expanded(p),true);p.data.binding=false;assert.equal(expanded(p),false);
 p.data.syncConfigured=false;assert.equal(expanded(p),true);
 const template=read('../pages/network/index.wxml');assert.ok(template.includes('wx:if="{{!syncConfigured||binding||bindingExpanded}}"'));assert.ok(template.includes('正在自动绑定画屏'));assert.ok(template.indexOf('class="paper binding-panel"')>template.indexOf('画面同步进展'));assert.ok(template.includes('bindtap="unbind"'));assert.ok(template.includes('wx:elif="{{bindingError}}"'));assert.ok(!template.includes('class="paper unbind-panel"'));
});
test('completed generation hides both success panels and copy link while retaining failure recovery',()=>{
 const template=read('../pages/generation/index.wxml');assert.ok(!template.includes('复制网页说明链接'));assert.ok(!template.includes('画作已生成 · 连接与准备同时进行'));assert.ok(template.includes('wx:if="{{phase!==\'complete\'}}" class="paper" role="status"'));assert.ok(template.includes('bindtap="retryPreparation"'));assert.ok(template.includes('bindtap="reloadImage"'));assert.ok(template.includes('bindtap="saveWallpaper"'));
});
