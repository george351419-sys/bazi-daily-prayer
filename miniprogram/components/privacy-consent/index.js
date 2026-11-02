const privacy=require('../../utils/privacy');
Component({
 data:{open:false,contractName:'小程序隐私保护指引',contractError:''},
 lifetimes:{attached(){this.activate();},detached(){this.release?.();}},
 pageLifetimes:{show(){this.activate();},hide(){this.release?.();this.release=null;}},
 methods:{
  activate(){this.release?.();this.release=privacy.attach(open=>{this.setData({open});if(open&&wx.getPrivacySetting)wx.getPrivacySetting({success:r=>this.setData({contractName:r.privacyContractName||'小程序隐私保护指引'})});});},
  agree(){privacy.finish(true);},reject(){privacy.finish(false);},
  contract(){wx.openPrivacyContract({fail:()=>this.setData({contractError:'隐私指引暂未打开，请稍后重试。'})});}
 }
});
