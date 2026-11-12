const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {currentActions,searchAnswers}=require('../utils/companion');
test('current Shanghai slot uses selected artwork and only its alternatives',()=>{
 const action={hour:9,text:'甲',detail:'说明',alternatives:[{text:'乙',detail:'说明乙'}]};
 const status={planDays:[{artworkId:'a',actions:[{hour:7,text:'旧时辰'},action]},{artworkId:'b',actions:[{hour:9,text:'另一幅'}]}]};
 const value=currentActions(status,{id:'a'},Date.parse('2026-11-12T10:00:00+08:00'));assert.deepEqual(value.options.map(a=>a.text),['甲','乙']);assert.ok(value.label.includes('09:00–11:00'));
 assert.equal(currentActions(status,{id:'a'},Date.parse('2026-11-12T23:00:00+08:00')).options.length,0);
});
test('answer search includes explanation, normalized ID and handles empty results',()=>{assert.equal(searchAnswers('')[0],undefined);assert.equal(searchAnswers('ＯＢ００５')[0].id,'OB005');assert.ok(searchAnswers('可撤回').some(a=>a.id==='OB001'));assert.equal(searchAnswers('不存在的关键词12345').length,0);});
test('companion sections and controls have requested placement',()=>{const read=p=>fs.readFileSync(require.resolve(p),'utf8'),today=read('../pages/today/index.wxml'),mine=read('../pages/mine/index.wxml'),custom=read('../pages/screen/index.wxml');for(const label of ['每天一页','查看祈福图解读','页间一刻','翻一页'])assert.ok(today.includes(label));for(const old of ['复制网页说明链接','管理我的画屏','此刻的小休息','画中寄语'])assert.ok(!today.includes(old));assert.ok(custom.includes('管理我的画屏'));assert.ok(mine.includes('wx:if="{{styleOpen}}"'));assert.ok(!mine.includes('complete-banner'));});
