import test from 'node:test';
import assert from 'node:assert/strict';
import {transferStatus} from '../public/transfer-status.js';
const ready={syncConfigured:true,plan:{artworkIds:['new','tomorrow'],contentMode:'prayer'},pendingUpdate:false,build:{status:'published',publishedAt:'2026-10-30T05:00:00Z'},deviceReport:{lastSeen:'2026-10-30T05:01:00Z',stale:false,stored:false}};
test('new picture waits for its own plan rather than accepting an old completion',()=>{
 assert.equal(transferStatus({...ready,plan:{artworkIds:['old']},deviceReport:{...ready.deviceReport,stored:true,renderReport:{day:0}}},'new').phase,'preparing');
});
test('download uses the real reported percentage, not fabricated phase percentages',()=>{
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:1,downloadProgress:43}},'new').percent,43);
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:1}},'new').percent,null);
});
test('stored and refreshed are separate states; older screen report cannot complete refresh',()=>{
 const stored={...ready,deviceReport:{...ready.deviceReport,stored:true}};
 assert.equal(transferStatus(stored,'new').phase,'stored');
 assert.equal(transferStatus({...stored,deviceReport:{...stored.deviceReport,renderReport:{day:0}}},'new').phase,'rendered');
 assert.equal(transferStatus({...stored,deviceReport:{...stored.deviceReport,renderReport:{day:0},showingPrevious:true}},'new').phase,'stored');
});
test('old or stale reports never finish a new transfer',()=>{
 for(const report of [{lastSeen:'2026-10-30T04:59:00Z'},{stale:true}]){
  assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,stored:true,renderReport:{day:0},...report}},'new').phase,'waiting');
 }
});
test('unbound, photo mode, firmware mismatch and retry states tell the next action',()=>{
 assert.equal(transferStatus({syncConfigured:false},'new').phase,'unbound');
 assert.equal(transferStatus({...ready,plan:{contentMode:'photo'}},'new').phase,'photo');
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,firmwareUpdateRequired:true}},'new').phase,'firmware');
 assert.equal(transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:3}},'new').phase,'retrying');
 assert.equal(transferStatus({...ready,pendingUpdate:true,deviceReport:{...ready.deviceReport,stored:true,renderReport:{day:0}}},'new').phase,'preparing');
});

test('下载完成和回执未完整上报不再显示等待领取',()=>{
 const completed=transferStatus({...ready,deviceReport:{...ready.deviceReport,downloadState:2}},'new');assert.equal(completed.phase,'confirming');assert.match(completed.title,/下载完成/);
 const idle=transferStatus(ready,'new');assert.equal(idle.phase,'confirming');assert.doesNotMatch(idle.title,/等待画屏领取/);
});
test('当前包刷新回执不依赖另一次保存标记，其他包回执不可冒充成功',()=>{
 const current={...ready,build:{...ready.build,sha256:'new-sha'},deviceReport:{...ready.deviceReport,targetSha:'new-sha',stored:false,renderedCurrent:true,renderReport:{day:0}}};
 assert.equal(transferStatus(current,'new').phase,'rendered');
 const previous={...current,deviceReport:{...current.deviceReport,targetSha:'old-sha',stored:true,renderedCurrent:false,downloadState:2}};
 assert.equal(transferStatus(previous,'new').phase,'confirming');
});
test('当前包的保存和刷新凭据在休眠后仍有效，但不套用到新包',()=>{
 const asleep={...ready,build:{...ready.build,sha256:'current'},deviceReport:{...ready.deviceReport,stale:true,targetSha:'current',stored:true}};
 assert.equal(transferStatus(asleep,'new').phase,'stored');
 assert.equal(transferStatus(asleep,'new').completedAt,ready.deviceReport.lastSeen,'深睡变 stale 后完成态仍带真实回执时间');
 assert.match(transferStatus(asleep,'new').detail,/确认/);
 assert.equal(transferStatus({...asleep,deviceReport:{...asleep.deviceReport,renderedCurrent:true,renderReport:{day:0}}},'new').phase,'rendered');
 assert.equal(transferStatus({...asleep,build:{...asleep.build,sha256:'next'}},'new').phase,'waiting');
});

test('live BLE progress requires a fresh matching device and published package',async()=>{
 const {withLiveDownload}=await import('../public/transfer-status.js');
 const result={...ready,device:{id:'screen'},deviceReport:{...ready.deviceReport,targetSha:'current'},build:{...ready.build,sha256:'current'}};
 const state=transferStatus(result),live={deviceId:'screen',state:1,progress:42,receivedAt:Date.now()};
 assert.equal(withLiveDownload(state,result,live).percent,42);
 assert.equal(withLiveDownload(state,{...result,pendingUpdate:true},live),state);
 assert.equal(withLiveDownload(state,result,{...live,deviceId:'other'}),state);
 assert.equal(withLiveDownload(state,result,{...live,receivedAt:Date.now()-10000}),state);
 assert.equal(withLiveDownload(state,{...result,deviceReport:{...result.deviceReport,targetSha:'old'}},live),state);
 assert.equal(withLiveDownload(state,{...result,deviceReport:{...result.deviceReport,stale:true}},live),state);
});
test('live Wi-Fi confirmation replaces stale-cloud connection instructions without claiming download success',async()=>{
 const {withConnection,transferAction}=await import('../public/transfer-status.js');
 const now=Date.now(),result={...ready,device:{id:'screen'},build:{...ready.build,sha256:'current'},deviceReport:{...ready.deviceReport,stale:true,targetSha:'old'}};
 const state=transferStatus(result),connection={paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,requestedSha:'current',syncRequestedAt:now};
 const checking=withConnection(state,result,connection,now);
 assert.equal(checking.phase,'syncing');assert.equal(checking.step,1);assert.equal(transferAction(checking),null);assert.doesNotMatch(checking.detail,/请唤醒|重新连接/);
 const delayed=withConnection(state,result,{...connection,syncRequestedAt:now-21000},now);assert.equal(transferAction(delayed),'check');
 assert.equal(transferAction(withConnection(state,result,{...connection,paired:false},now)),'connect');
 assert.equal(withConnection(state,result,{...connection,deviceId:'other'},now).phase,'waiting');
 assert.equal(withConnection(state,result,{...connection,receivedAt:now-7000},now).phase,'waiting');
 const preparing=transferStatus({...result,pendingUpdate:true});assert.equal(transferAction(withConnection(preparing,{...result,pendingUpdate:true},connection,now)),null);
 const stored=transferStatus({...result,deviceReport:{...ready.deviceReport,stored:true,targetSha:'current'}});assert.equal(withConnection(stored,result,connection,now).phase,'stored');
});
test('持续 BLE 往返让等待态稳定显示为已联网正在检查，而非退回「去链接神物」',async()=>{
 const {withConnection,transferAction}=await import('../public/transfer-status.js');
 const now=Date.now();
 // 云端回执陈旧 → transferStatus 落在 S15「等待最新设备检查」(phase=waiting)
 const result={...ready,device:{id:'screen'},build:{...ready.build,sha256:'current'},deviceReport:{...ready.deviceReport,stale:true,targetSha:'old'}};
 const base=transferStatus(result);assert.equal(base.phase,'waiting');
 // 证据过期（6 秒以上无 BLE 往返）→ 退回 waiting +「去链接神物」，这是被修复的错误画面
 const stale=withConnection(base,result,{paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now-7000},now);
 assert.equal(stale.phase,'waiting');assert.equal(transferAction(stale),'connect');
 // 每 2 秒 BLE 轮询续期后证据新鲜 → 稳定显示「画屏已联网 · 正在检查新内容」，不再误导重新配网
 const fresh=withConnection(base,result,{paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now},now);
 assert.equal(fresh.phase,'syncing');assert.match(fresh.title,/画屏已联网/);assert.equal(transferAction(fresh),null);
 // 设备确实断开(paired=false)时仍应退回「去链接」，修复不得掩盖真实断链
 assert.equal(transferAction(withConnection(base,result,{paired:false,receivedAt:now},now)),'connect');
});
test('手机确认送达覆盖陈旧回执，但内容或设备不符不得冒充完成',async()=>{
 const {withConnection,transferAction}=await import('../public/transfer-status.js');
 const now=Date.now(),result={...ready,device:{id:'screen'},build:{...ready.build,sha256:'current'},deviceReport:{...ready.deviceReport,stale:true,targetSha:'current'}};
 const state=transferStatus(result);
 const base={paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,requestedSha:'current',syncRequestedAt:now-21000};
 const delivered={deliveredAt:now,targetSha:'current',deviceId:'screen',evidence:'user-confirmed'};
 const done=withConnection(state,result,{...base,delivered},now);
 assert.equal(done.phase,'stored');assert.equal(done.step,4);assert.equal(transferAction(done),null);
 assert.equal(done.completedAt,undefined,'手动标记是伪完成态，不得伪造设备回报时间');
 assert.equal(withConnection(state,result,{...base,delivered:{...delivered,targetSha:'old'}},now).phase,'syncing');
 assert.equal(withConnection(state,result,{...base,delivered:{...delivered,deviceId:'other'}},now).phase,'syncing');
 // 蓝牙已断开或连接信息过期，也不得抹掉用户亲眼确认过的送达结果。
 assert.equal(withConnection(state,result,{paired:false,receivedAt:now-7000,delivered},now).phase,'stored');
});
test('送达确认锁定到具体画作：换生辰/愿望重新生成后旧完成态不得回灌',async()=>{
 const {withConnection}=await import('../public/transfer-status.js');
 const now=Date.now(),result={...ready,device:{id:'screen'},build:{...ready.build,sha256:'current'},deviceReport:{...ready.deviceReport,stale:true,targetSha:'current'}};
 const state=transferStatus(result),delivered={deliveredAt:now,targetSha:'current',deviceId:'screen',evidence:'user-confirmed',artworkId:'old'};
 // 没有新画上下文时仍按原逻辑保留送达确认
 assert.equal(withConnection(state,result,{paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered},now).phase,'stored');
 // 新生成的画（artworkId=new）与送达确认归属的画（old）不同 → 旧“✓ 本次同步已完成”失效
 assert.equal(withConnection(state,result,{paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered},now,'new').phase,'syncing');
 // 送达确认归属同一幅画时仍生效
 assert.equal(withConnection(state,result,{paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered:{...delivered,artworkId:'new'}},now,'new').phase,'stored');
});
test('BLE 观测到设备回报下载完成时不继续显示百分比进度',async()=>{
 const {withLiveDownload}=await import('../public/transfer-status.js');
 const result={...ready,device:{id:'screen'},deviceReport:{...ready.deviceReport,targetSha:'current'},build:{...ready.build,sha256:'current'}};
 const state=transferStatus(result),live={deviceId:'screen',state:2,receivedAt:Date.now()};
 assert.match(withLiveDownload(state,result,live).title,/下载完成/);
 assert.equal(withLiveDownload(state,result,live).percent,null);
});
test('传输完成必须明确告知用户：文案说完成、四步全亮、带设备回执时间',()=>{
 const done=transferStatus({...ready,deviceReport:{...ready.deviceReport,stored:true}},'new');
 assert.equal(done.phase,'stored');
 assert.match(done.title,/传输完成/);
 assert.match(done.detail,/无需再操作/);
 assert.equal(done.step,4,'完成态四步应全部点亮');
 assert.equal(done.completedAt,ready.deviceReport.lastSeen);
 const refreshed=transferStatus({...ready,deviceReport:{...ready.deviceReport,stored:true,renderedCurrent:true,renderReport:{day:0}}},'new');
 assert.equal(refreshed.step,4);
 assert.match(refreshed.title,/完成/);
 // 未完成态不能被误标为完成
 const waiting=transferStatus(ready,'new');
 assert.equal(waiting.phase,'confirming');
 assert.equal(waiting.completedAt,undefined);
 assert.ok(waiting.step<4);
});
test('重连翻新 bindingId 令 pendingUpdate 翻转时，已发布内容不再回退到 S11 下发态',()=>{
 // 后端 current 依赖 published.bindingId===binding.bindingId；重新绑定会翻新 bindingId 令
 // pendingUpdate=!current 翻 true，但此刻 build 早已 published、内容其实就绪。
 // 旧逻辑把它打回 S11「正在安排下发」，与 S15「等待检查」来回跳。
 const reconnect={...ready,preparation:{ready:true},pendingUpdate:true,build:{...ready.build,sha256:'cur'},deviceReport:{lastSeen:'2026-10-30T04:59:00Z',stale:false,stored:false,targetSha:'cur'}};
 const stale=transferStatus(reconnect,'new');
 assert.equal(stale.phase,'waiting','心跳未更新也停在等待检查，不回退下发态');
 assert.match(stale.title,/等待最新设备检查/);
 // 心跳已新鲜但仍无存储/刷新回执：应落到确认/等待，绝不是回到「正在安排下发」。
 const fresh=transferStatus({...reconnect,deviceReport:{...reconnect.deviceReport,lastSeen:'2026-10-30T05:01:00Z'}},'new');
 assert.notEqual(fresh.phase,'publishing','心跳新鲜也不该倒退回下发态');
 assert.ok(['confirming','waiting','downloading'].includes(fresh.phase));
});
test('build 真的还没发布时，pendingUpdate 仍显示准备态（稳定化不放宽真实等待）',()=>{
 assert.equal(transferStatus({...ready,pendingUpdate:true,build:{status:'preparing'}},'new').phase,'preparing');
 assert.equal(transferStatus({...ready,preparation:{ready:false,stage:'queued'},pendingUpdate:true,build:{status:'preparing'}},'new').phase,'preparing');
});
test('正在生成新画时压住上一幅画的完成态，绝不串台显示旧画的传输完成',async()=>{
 const {withConnection}=await import('../public/transfer-status.js');
 const now=Date.now();
 // 后端此刻仍是上一幅画的快照：plan 含旧画、旧包已 stored、甚至手机有旧画送达确认。
 const oldDrawing={...ready,device:{id:'screen'},plan:{artworkIds:['old'],contentMode:'prayer'},build:{...ready.build,sha256:'old-sha'},deviceReport:{...ready.deviceReport,targetSha:'old-sha',stored:true,renderReport:{day:0},stale:true}};
 const delivered={deliveredAt:now,targetSha:'old-sha',deviceId:'screen',evidence:'user-confirmed',artworkId:'old'};
 const connection={paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered};
 // 不带 generating：旧画的完成态确实会显示（这是"上一幅"的真实状态）。
 assert.equal(withConnection(transferStatus(oldDrawing,'old'),oldDrawing,connection,now,'old').phase,'stored');
 // 带 generating：生成新画的整个窗口内一律"新画生成中"，旧的 stored / delivered 全被压住。
 const generating=withConnection(transferStatus(oldDrawing,'old',true),oldDrawing,connection,now,'old');
 assert.equal(generating.phase,'generating');
 assert.match(generating.title,/新画正在生成/);
 assert.doesNotMatch(generating.title,/传输完成/);
 assert.equal(generating.completedAt,undefined,'生成中不得带旧画的回执时间');
 assert.ok(generating.step<4,'生成中不得点亮完成步骤');
 // 生成结束后（第三参回落 false）恢复真实判定：此刻若后端已切到新画计划，才按新画走。
 assert.equal(withConnection(transferStatus(oldDrawing,'old',false),oldDrawing,connection,now,'old').phase,'stored');
});
test('三份状态文案副本保持一致，且完成态不说「现在可以进入」这种待办口吻',async()=>{
 const {readFileSync}=await import('node:fs');
 const copy=JSON.parse(readFileSync(new URL('../content/transfer-copy.json',import.meta.url),'utf8'));
 for(const rel of ['../public/transfer-status.js','../miniprogram/utils/transfer-status.js']){
  const source=readFileSync(new URL(rel,import.meta.url),'utf8');
  for(const id of ['S19','S20','S21','S22','S23','S26']){
   const title=copy[id].title,detail=copy[id].detail;
   assert.ok(source.includes(title),rel+' 缺少 '+id+' 标题');
   assert.ok(source.includes(detail),rel+' 缺少 '+id+' 说明');
  }
 }
 for(const id of ['S20','S22'])assert.match(copy[id].title,/传输完成/);
 assert.doesNotMatch(copy.S26.title,/传输完成|同步已完成/,'生成中文案不得出现完成态措辞');
});
test('完成态渲染带完成徽标、回执时间，且只点亮真实完成的三步',async()=>{
 const {renderTransfer}=await import('../public/transfer-status.js');
 const nodes=[];
 const create=tag=>{const n={tag,children:[],attrs:{},classList:{add(){},toggle(c,on){n.complete=!!on;}},dataset:{},textContent:'',hidden:true,
  append(...c){n.children.push(...c);},prepend(...c){n.children.unshift(...c);},replaceChildren(){n.children=[];},
  setAttribute(k,v){n.attrs[k]=v;}};nodes.push(n);return n;};
 globalThis.document={createElement:create};
 const host=create('div');
 try{
  const state=transferStatus({...ready,deviceReport:{...ready.deviceReport,stored:true}},'new');
  renderTransfer(host,state);
  assert.equal(host.dataset.complete,'true');
  assert.equal(host.hidden,false);
  assert.equal(nodes.some(n=>n.className==='transfer-complete-badge'&&n.textContent.includes('已完成')),true);
  assert.equal(nodes.some(n=>n.className==='transfer-complete-note'&&n.textContent.includes('设备回报时间')),true);
  const labels=nodes.filter(n=>n.tag==='li');
  assert.equal(labels.length,3,'完成态只展示已真实发生的三步');
  assert.equal(labels.every(n=>n.complete),true);
  assert.equal(labels.some(n=>n.attrs['aria-current']),false,'完成态不应再标记进行中');
 }finally{delete globalThis.document;}
});
