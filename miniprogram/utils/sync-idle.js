// Only package-specific device evidence can start the post-transfer grace period.
function deliveredPackageKey(status,connection={}){
 const sha=status?.build?.sha256,device=status?.device?.id;
 if(!connection.paired||connection.deviceId!==device||!sha||status.build.status!=='published'||connection.generating)return null;
 const report=status.deviceReport,receipt=connection.delivered;
 const cloud=(!status.pendingUpdate||status.preparation?.ready===true)&&report?.targetSha===sha&&(report.stored||report.renderedCurrent);
 const ble=!status.pendingUpdate&&receipt?.evidence==='ble-download-complete'&&receipt.targetSha===sha&&receipt.deviceId===device;
 if(!cloud&&!ble)return null;
 return JSON.stringify([device,sha,status.plan?.revision,status.plan?.artworkIds]);
}
class SyncIdleRelease{
 constructor({read,release,delay=30000,setTimer=setTimeout,clearTimer=clearTimeout}){Object.assign(this,{read,release,delay,setTimer,clearTimer});this.timer=null;this.key=null;}
 cancel(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.key=null;}
 update(){
  const {status,connection}=this.read(),key=deliveredPackageKey(status,connection);
  if(!key||connection.blocked){this.cancel();return;}
  if(key===this.key)return;
  this.cancel();this.key=key;this.timer=this.setTimer(()=>this.finish(key),this.delay);
 }
 finish(key){
  this.timer=null;
  const {status,connection}=this.read();
  if(key!==this.key||deliveredPackageKey(status,connection)!==key||connection.blocked){this.cancel();return;}
  if(connection.busy){this.timer=this.setTimer(()=>this.finish(key),1000);return;}
  this.key=null;void Promise.resolve().then(()=>this.release()).catch(()=>{});
 }
}

module.exports={deliveredPackageKey,SyncIdleRelease};
