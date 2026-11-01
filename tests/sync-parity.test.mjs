import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {transferStatus} from '../public/transfer-status.js';
const mini=createRequire(import.meta.url)('../miniprogram/utils/transfer-status.js');
test('网页与小程序使用一致的下载、保存、可进入画面及刷新判定',()=>{
 const base={syncConfigured:true,plan:{artworkIds:['today'],contentMode:'prayer'},build:{status:'published',sha256:'current',publishedAt:'2026-11-01T00:00:00Z'}};
 const reports=[null,{targetSha:'current',lastSeen:'2026-11-01T00:01:00Z',downloadState:1,downloadProgress:40},{targetSha:'current',downloadState:2,lastSeen:'2026-11-01T00:01:00Z'},{targetSha:'current',stored:true,stale:true},{targetSha:'current',stored:true,renderedCurrent:true,renderReport:{day:0},stale:true},{targetSha:'old',stored:true,renderReport:{day:0},stale:true}];
 for(const deviceReport of reports)assert.deepEqual(mini.transferStatus({...base,deviceReport},'today'),transferStatus({...base,deviceReport},'today'));
});
