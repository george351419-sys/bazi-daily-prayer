const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup({user=null,confirm=true,modalFailure=false,loginFailure=false}={}){
 let page;const calls=[],navigation=[],app={ready:Promise.resolve(),globalData:{user,profile:{wishes:['W02'],artStyle:'folk',birthDate:'1990-01-01'}}};
 const api={tab(){},init:async()=>({miniProgram:{wechatLoginEnabled:true}}),request:async(url,body)=>{calls.push(url);return {profile:body};},wechatLogin:async()=>{calls.push('wx.login');if(loginFailure)throw Error('登录暂未完成');return {user:{id:'new',authProvider:'wechat'},profile:app.globalData.profile};},error:(p,e)=>p.setData({error:e.message})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/mine/index.js'),'utf8'),{require:id=>id.endsWith('/api')?api:{observeConnection(){},stopObserving(){}},Page:p=>page=p,getApp:()=>app,clearTimeout(){},wx:{showToast(){},navigateTo:o=>navigation.push(o.url),showModal:o=>{calls.push('consent');assert.ok([...o.confirmText].length<=4);assert.ok([...o.cancelText].length<=4);if(modalFailure)o.fail({});else o.success({confirm});}}});
 page.setData=function(patch){for(const [key,value]of Object.entries(patch)){if(key.startsWith('profile.'))this.data.profile[key.slice(8)]=value;else this.data[key]=value;}};
 page.pollSync=async()=>{};
 const wish=id=>page.wish({currentTarget:{dataset:{id}}});
 const style=id=>page.choose({currentTarget:{dataset:{field:'artStyle',value:id}}});
 return {page,calls,navigation,app,wish,style};
}
test('guest can choose wishes, preview styles and expand optional birthday without login or profile writes',async()=>{
 const {page,calls,wish,style}=setup();await page.onShow();assert.equal(page.data.loginOpen,false);assert.equal(page.data.birthdayOpen,false);assert.deepEqual(calls,[]);
 wish('W20');style('spirit');page.toggleBirthday();assert.equal(page.data.birthdayOpen,true);assert.equal(page.data.profile.artStyle,'spirit');assert.deepEqual(calls,[]);
});
test('generation prompts voluntary login only after wish and style selection; cancellation retains draft across tabs',async()=>{
 const {page,calls,navigation,wish,style}=setup();await page.onShow();await page.generate();assert.match(page.data.error,/祈愿/);wish('W20');await page.generate();assert.match(page.data.error,/画面风格/);style('spirit');await page.generate();assert.equal(page.data.loginOpen,true);assert.deepEqual(calls,[]);assert.deepEqual(navigation,[]);
 page.cancelLogin();page.onHide();await page.onShow();assert.equal(page.data.loginOpen,false);assert.equal(page.data.profile.artStyle,'spirit');assert.deepEqual(Array.from(page.data.profile.wishes),['W20']);assert.deepEqual(calls,[]);
});
test('successful voluntary login continues generation without replacing the draft with saved account preferences',async()=>{
 const {page,calls,navigation,app,wish,style}=setup();await page.onShow();wish('W20');style('spirit');await page.generate();await page.wechatAuth();
 assert.deepEqual(calls,['consent','wx.login']);assert.deepEqual(navigation,['/pages/generation/index']);assert.equal(app.globalData.generationProfile.contentMode,'wish-art');assert.equal(app.globalData.generationProfile.birthDate,'');assert.equal(app.globalData.generationProfile.artStyle,'spirit');assert.deepEqual(Array.from(app.globalData.generationProfile.wishes),['W20']);
});
test('declining consent never calls login or uploads a profile; later retry preserves choices',async()=>{
 const {page,calls,navigation,wish,style}=setup({confirm:false});await page.onShow();wish('W20');style('cute');await page.generate();await page.wechatAuth();assert.deepEqual(calls,['consent']);assert.deepEqual(navigation,[]);assert.equal(page.data.profile.artStyle,'cute');assert.equal(page.consentPending,false);
});
test('failed login and failed consent remain retryable without losing wishes or style',async()=>{
 for(const flags of [{loginFailure:true},{modalFailure:true}]){const {page,navigation,wish,style}=setup(flags);await page.onShow();wish('W20');style('spirit');await page.generate();await page.wechatAuth();assert.equal(page.data.busy,false);assert.equal(page.consentPending,false);assert.equal(page.data.profile.artStyle,'spirit');assert.match(page.data.error,/暂未/);assert.deepEqual(navigation,[]);}
});
test('birthday mode requires an actual time; clearing it enables the non-natal path without fabricated data',async()=>{
 const {page,app,wish,style,navigation}=setup({user:{id:'existing'}});await page.onShow();wish('W20');style('cute');page.field({currentTarget:{dataset:{field:'birthDate'}},detail:{value:'1992-10-17'}});await page.generate();assert.match(page.data.error,/时刻/);assert.deepEqual(navigation,[]);page.clearBirthday();await page.generate();assert.equal(app.globalData.generationProfile.contentMode,'wish-art');assert.equal(app.globalData.generationProfile.birthTime,'');
});
test('optional birthday details survive login and keep the original personalized picture path',async()=>{
 const {page,app,wish,style}=setup();await page.onShow();wish('W20');style('spirit');for(const [field,value]of Object.entries({birthDate:'1992-10-17',birthTime:'22:30',city:'上海'}))page.field({currentTarget:{dataset:{field}},detail:{value}});await page.generate();await page.wechatAuth();assert.equal(app.globalData.generationProfile.birthDate,'1992-10-17');assert.equal(app.globalData.generationProfile.birthTime,'22:30');assert.equal(app.globalData.generationProfile.contentMode,undefined);
});
