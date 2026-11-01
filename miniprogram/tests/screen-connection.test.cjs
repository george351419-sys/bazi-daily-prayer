const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function session(){
 const timers=new Map(),intervals=new Map();let sequence=0;
 class BLE{
  constructor(state,found,download){this.state=state;this.found=found;this.download=download;this.commands=[];this.epoch=0;}
  async connect(id){this.id=id;this.state('蓝牙已连接',true);}
  async resumeWifi(){this.commands.push('resume-saved-wifi');this.status=true;this.state('Wi-Fi 已连接',true);}
  async syncNow(){this.commands.push('check-sync');}
  async write(channel){this.commands.push(channel);}
  async queryDownload(){this.download({state:1,progress:57});}
  async configure(){this.commands.push('configure');}
  async disconnect(){this.id=null;this.state('蓝牙未连接',false);}
 }
 const context={module:{exports:{}},require:name=>name==='./ble'?{ArkBLE:BLE}:require('../utils/transfer-status'),Date,Set,Error,console,setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{const id=++sequence;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../utils/screen-connection.js'),'utf8'),context);
 return {...context.module.exports,timers,intervals};
}
const ready=()=>({syncConfigured:true,pendingUpdate:false,device:{id:'aabbccddeeff'},plan:{contentMode:'prayer',artworkIds:['today','tomorrow']},build:{status:'published',sha256:'new',publishedAt:new Date().toISOString()},deviceReport:{targetSha:'new',lastSeen:new Date().toISOString(),downloadState:1,downloadProgress:10,stale:false}});
async function connected(env){const connection=env.getScreenConnection();connection.client.found([{id:'native-id',name:'FRAMEFILMARK-aabbccddeeff'}]);await connection.connect('native-id');return connection;}
test('tab changes retain one BLE session and both pages receive the same device percentage',async()=>{
 const env=session(),c=await connected(env),status=ready();
 const page=()=>({active:true,data:{status},setData(next){Object.assign(this.data,next);}});
 const network=page();env.observeConnection(network);network.active=false;env.stopObserving(network);
 const mine=page();env.observeConnection(mine);assert.equal(network.ble,mine.ble);assert.equal(c.client.id,'native-id');
 await c.poll();assert.equal(mine.data.syncState.percent,57);assert.equal(mine.data.paired,true);
 network.active=true;env.observeConnection(network);assert.equal(network.data.syncState.percent,57);
 assert.equal(c.client.commands.includes('configure'),false);assert.equal(c.client.commands[0],'resume-saved-wifi');
});
test('new published content triggers a single check, with no action on a mismatched screen or unfinished build',async()=>{
 const env=session(),c=await connected(env),s=ready();
 c.current={...s,pendingUpdate:true};await c.syncPublished();c.current={...s,device:{id:'other'}};await c.syncPublished();
 assert.equal(c.client.commands.includes('check-sync'),false);
 c.current=s;await c.syncPublished();await c.syncPublished();assert.equal(c.client.commands.filter(v=>v==='check-sync').length,1);
 c.current={...s,build:{...s.build,sha256:'newer'}};await c.syncPublished();assert.equal(c.client.commands.filter(v=>v==='check-sync').length,2);
});
test('app background pauses polling, a short return preserves BLE, and expiry releases the connection',async()=>{
 const env=session(),c=await connected(env);c.background();assert.equal(env.intervals.size,0);assert.equal(c.client.id,'native-id');
 c.start();assert.equal(env.timers.size,0);assert.equal(c.client.id,'native-id');
 c.background();const pending=[...env.timers.values()].find(t=>t.ms===60000);assert.ok(pending);pending.fn();assert.equal(c.client.id,null);
 c.start();assert.ok([...env.timers.values()].some(t=>t.ms===3000));
});
test('explicit disconnect cancels reconnect and clears old content and progress',async()=>{
 const env=session(),c=await connected(env);c.current=ready();await c.poll();await c.disconnect();assert.equal(c.allowed,false);assert.equal(c.live,null);assert.equal(c.current,null);assert.equal(c.snapshot.paired,false);assert.equal(env.intervals.size,0);assert.equal(env.timers.size,0);
});
test('stale BLE progress and replies from another device cannot replace current cloud state',()=>{
 const {transferStatus,withLiveDownload}=require('../utils/transfer-status'),s=ready(),state=transferStatus(s),live={deviceId:s.device.id,state:1,progress:57,receivedAt:Date.now()};
 assert.equal(withLiveDownload(state,s,live).percent,57);
 assert.equal(withLiveDownload(state,s,{...live,deviceId:'other'}),state);
 assert.equal(withLiveDownload(state,s,{...live,receivedAt:Date.now()-7000}),state);
 assert.equal(withLiveDownload(state,{...s,pendingUpdate:true},live),state);
});
test('BLE download query validates protocol replies and rejects malformed data',async()=>{
 const {ArkBLE,packet}=require('../utils/ble'),updates=[],client=new ArkBLE(()=>{},()=>{},value=>updates.push(value));
 client.id='device';client.write=async channel=>{const malformed=packet(channel,[1,99]);malformed[malformed.length-1]^=1;client.receive(malformed);client.receive(packet(channel,[1,57]));};
 assert.deepEqual(await client.queryDownload(),{state:1,progress:57});assert.deepEqual(updates,[{state:1,progress:57}]);
});
test('page hide handlers unsubscribe without closing the shared Bluetooth adapter',()=>{
 for(const name of ['network','screen','mine']){
  let definition,disconnected=false,unsubscribed=false;
  const context={Page:value=>definition=value,require:name=>name.includes('screen-connection')?{observeConnection(){},stopObserving(){unsubscribed=true;}}:name.includes('api')?{}:name.includes('ritual-sync')?{}:name.includes('photos')?{}:name.includes('transfer-status')?{}:{},Date,clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages',name,'index.js'),'utf8'),context);
  const page={active:true,run:0,setData(){},ble:{disconnect(){disconnected=true;}}};definition.onHide.call(page);
  assert.equal(disconnected,false,name);assert.equal(unsubscribed,true,name);assert.equal(page.active,false,name);
 }
});
test('an unexpected connection loss reconnects only the same screen using saved network settings',async()=>{
 const env=session(),c=await connected(env);c.client.id=null;c.client.state('断开',false);
 const retry=[...env.timers.values()].find(t=>t.ms===3000);assert.ok(retry);await retry.fn();
 assert.equal(c.client.id,'native-id');assert.equal(c.snapshot.connectedDeviceId,'aabbccddeeff');
 assert.equal(c.client.commands.filter(v=>v==='resume-saved-wifi').length,2);assert.equal(c.client.commands.includes('configure'),false);
});
test('automatic sync waits for Wi-Fi confirmation instead of consuming the request while offline',async()=>{
 const env=session(),c=await connected(env);c.current=ready();c.client.status=false;
 await c.syncPublished();assert.equal(c.syncSha,null);assert.equal(c.client.commands.includes('check-sync'),false);
 c.client.status=true;c.client.state('Wi-Fi 已连接',true);await c.syncPublished();
 assert.equal(c.syncSha,'new');assert.equal(c.client.commands.filter(v=>v==='check-sync').length,1);assert.equal(c.stateFor({...ready(),deviceReport:null}).phase,'syncing');
});
