const api = require('./utils/api');
const {getScreenConnection}=require('./utils/screen-connection');
App({
 globalData:{user:null,profile:null},
 onShow(){getScreenConnection().start();},
 onHide(){getScreenConnection().background();},
 onLaunch(){this.ready=this.restore();},
 async restore(){try{const data=await api.request('/api/account/me');this.globalData.user=data.user;this.globalData.profile=data.profile;}catch(e){this.globalData.user=null;}},
 async logout(){await getScreenConnection().disconnect();await api.request('/api/account/logout',{});api.clear();this.globalData.user=null;this.globalData.profile=null;}
});
