let installed=false,active=null,pending=[];
function install(){if(installed||!wx.onNeedPrivacyAuthorization)return;installed=true;wx.onNeedPrivacyAuthorization(resolve=>{pending.push(resolve);if(active)active(true);else finish(false);});}
function finish(agree){const list=pending;pending=[];if(active)active(false);for(const resolve of list)resolve(agree?{event:'agree',buttonId:'agree-privacy'}:{event:'disagree'});}
function attach(handler){install();active=handler;if(pending.length)handler(true);return ()=>{if(active===handler){finish(false);active=null;}};}
module.exports={attach,finish};
function confirm(){install();return new Promise((resolve,reject)=>{if(!active){reject(new Error('隐私确认界面尚未就绪，请重新进入当前页面。'));return;}pending.push(value=>value.event==='agree'?resolve():reject(Object.assign(new Error('你尚未同意隐私指引，图片未保存。'),{cancelled:true})));active(true);});}
async function authorize(){
 install();
 if(wx.getPrivacySetting){const setting=await new Promise((resolve,reject)=>wx.getPrivacySetting({success:resolve,fail:reject}));if(setting.needAuthorization)await confirm();}
 if(!wx.requirePrivacyAuthorize)return;
 try{await new Promise((resolve,reject)=>wx.requirePrivacyAuthorize({success:resolve,fail:reject}));}
 catch(e){if(e.cancelled)throw e;if(!/privacy/i.test(e.errMsg||e.message||''))throw e;await confirm();await new Promise((resolve,reject)=>wx.requirePrivacyAuthorize({success:resolve,fail:reject}));}
}
module.exports.confirm=confirm;module.exports.authorize=authorize;
