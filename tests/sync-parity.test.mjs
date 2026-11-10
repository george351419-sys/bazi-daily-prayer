import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {transferStatus,withConnection,withLiveDownload} from '../public/transfer-status.js';
const mini=createRequire(import.meta.url)('../miniprogram/utils/transfer-status.js');
test('网页与小程序使用一致的下载、保存、可进入画面及刷新判定',()=>{
 const base={syncConfigured:true,plan:{artworkIds:['today'],contentMode:'prayer'},build:{status:'published',sha256:'current',publishedAt:'2026-11-01T00:00:00Z'}};
 const reports=[null,{targetSha:'current',lastSeen:'2026-11-01T00:01:00Z',downloadState:1,downloadProgress:40},{targetSha:'current',downloadState:2,lastSeen:'2026-11-01T00:01:00Z'},{targetSha:'current',stored:true,stale:true},{targetSha:'current',stored:true,renderedCurrent:true,renderReport:{day:0},stale:true},{targetSha:'old',stored:true,renderReport:{day:0},stale:true}];
 for(const deviceReport of reports)assert.deepEqual(mini.transferStatus({...base,deviceReport},'today'),transferStatus({...base,deviceReport},'today'));
});
test('网页与小程序在"正在生成新画"时对旧画完成态的压制一致',()=>{
 const now=Date.now();
 const oldDrawing={syncConfigured:true,plan:{artworkIds:['old'],contentMode:'prayer'},device:{id:'screen'},build:{status:'published',sha256:'old-sha',publishedAt:'2026-11-01T00:00:00Z'},deviceReport:{targetSha:'old-sha',stored:true,renderReport:{day:0},stale:true,lastSeen:'2026-11-01T00:01:00Z'}};
 const delivered={deliveredAt:now,targetSha:'old-sha',deviceId:'screen',evidence:'user-confirmed',artworkId:'old'};
 const connection={paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered};
 for(const generating of [true,false]){
  const a=transferStatus(oldDrawing,'old',generating),b=mini.transferStatus(oldDrawing,'old',generating);
  assert.deepEqual(b,a);
  assert.deepEqual(mini.withConnection(b,oldDrawing,connection,now,'old'),withConnection(a,oldDrawing,connection,now,'old'));
 }
});
test('网页与小程序对 BLE 下载完成及手机确认送达的判定一致',()=>{
 const now=Date.now(),base={syncConfigured:true,plan:{artworkIds:['today'],contentMode:'prayer'},device:{id:'screen'},build:{status:'published',sha256:'current',publishedAt:'2026-11-01T00:00:00Z'}};
 const reports=[{targetSha:'current',lastSeen:'2026-11-01T00:01:00Z'},{targetSha:'current',stale:true,lastSeen:'2026-11-01T00:01:00Z'},null];
 const connections=[
  {paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered:{deliveredAt:now,targetSha:'current',deviceId:'screen',evidence:'user-confirmed'}},
  {paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,delivered:{deliveredAt:now,targetSha:'old',deviceId:'screen'}},
  {paired:true,deviceId:'screen',wifiConnected:true,receivedAt:now,syncRequestedAt:now-21000,requestedSha:'current'},
 ];
 for(const deviceReport of reports){
  const status={...base,deviceReport},state=transferStatus(status,'today');
  for(const live of [{deviceId:'screen',state:2,receivedAt:now},{deviceId:'screen',state:1,progress:50,receivedAt:now}]){
   assert.deepEqual(mini.withLiveDownload(state,status,live,now),withLiveDownload(state,status,live,now));
  }
  for(const connection of connections)assert.deepEqual(mini.withConnection(state,status,connection,now),withConnection(state,status,connection,now));
 }
});
