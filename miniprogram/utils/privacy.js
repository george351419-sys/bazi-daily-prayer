let installed=false,active=null,pending=[];
function install(){if(installed||!wx.onNeedPrivacyAuthorization)return;installed=true;wx.onNeedPrivacyAuthorization(resolve=>{pending.push(resolve);if(active)active(true);else finish(false);});}
function finish(agree){const list=pending;pending=[];if(active)active(false);for(const resolve of list)resolve(agree?{event:'agree',buttonId:'agree-privacy'}:{event:'disagree'});}
function attach(handler){install();active=handler;if(pending.length)handler(true);return ()=>{if(active===handler){finish(false);active=null;}};}
module.exports={attach,finish};
