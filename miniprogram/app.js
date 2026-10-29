const api = require('./utils/api');
App({
 globalData:{user:null,profile:null},
 onLaunch(){this.ready=this.restore();},
 async restore(){try{const data=await api.request('/api/account/me');this.globalData.user=data.user;this.globalData.profile=data.profile;}catch(e){this.globalData.user=null;}},
 async logout(){await api.request('/api/account/logout',{});api.clear();this.globalData.user=null;this.globalData.profile=null;}
});
