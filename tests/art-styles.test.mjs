import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,buildImagePrompt} from '../lib/domain.mjs';
import {visualMapping} from '../lib/image-reuse.mjs';
import {generationSettings} from '../lib/automation.mjs';
import {doubao} from '../lib/providers.mjs';
const input={gender:'male',birthDate:'1990-02-13',birthTime:'16:00',wishes:['W01']};
const mapping={wish_id:'W01',wish_label:'一夜暴富',deity:'刘海',primary_element:'火',secondary_element:'土',colors:[{name:'朱红',hex:'#c74032'}],zodiac:[],stem_symbols:[],elements:[{name:'钱串'}],image_prompt:'保留钱串及三足金蟾'};
test('输入默认可爱风，拒绝未知风格，三种风格分别保存',()=>{
 assert.equal(validateInput(input).artStyle,'cute');
 for(const artStyle of ['folk','cute','spirit'])assert.equal(validateInput({...input,artStyle}).artStyle,artStyle);
 assert.throws(()=>validateInput({...input,artStyle:'other'}),/风格/);
});
test('相同画面不同风格不复用；底部留位写入提示词',()=>{
 const fingerprints=['folk','cute','spirit'].map(art_style=>visualMapping({...mapping,art_style}).fingerprint);
 assert.equal(new Set(fingerprints).size,3);
 assert.notEqual(visualMapping(mapping).fingerprint,visualMapping({...mapping,art_style_version:'new'}).fingerprint);
 for(const art_style of ['folk','cute','spirit']){const prompt=buildImagePrompt({...mapping,art_style});assert.ok(prompt.startsWith('[PRAYER_STYLE:'+art_style+']'));assert.match(prompt,/720×480/);assert.match(prompt,/底部/);}
});
test('每日自动生成快照和配置指纹包含风格',()=>{
 const a=generationSettings({}, {...input,artStyle:'cute'}),b=generationSettings({}, {...input,artStyle:'spirit'});
 assert.equal(a.profile.artStyle,'cute');assert.notEqual(a.fingerprint,b.fingerprint);assert.notEqual(a.profileFingerprint,b.profileFingerprint);
});
test('灵兽风向图片模型传原创形象参考，其他风格不传',async()=>{
 for(const art_style of ['folk','cute','spirit'])await doubao({ARK_API_KEY:'fake'},buildImagePrompt({...mapping,art_style}),async(url,init)=>{
  const request=JSON.parse(init.body);assert.equal(request.size,'2496x1664');
  if(art_style==='spirit')assert.match(request.image,/^data:image\/jpeg;base64,/);else assert.equal(request.image,undefined);
  return Response.json({data:[{url:'https://cdn.example.com/illustration.png'}]});
 },true);
});
