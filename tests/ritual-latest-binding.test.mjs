import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {encryptAccountData,accountRepository} from '../lib/account-store.mjs';
import {bindRitualDevice,ritualDeviceForAccount,listRitualDeviceLinks,unbindRitualDevice} from '../lib/ritual-device.mjs';

test('latest account and latest device win without reviving old routes',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-latest-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const a={id:'1'.repeat(32)},b={id:'2'.repeat(32)},x='112233445566',y='aabbccddeeff',store=new Map();
 const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'latest-routing-test-secret-123456',RITUAL_DEVICE_LINKS:JSON.stringify({[a.id]:x}),RITUAL_CLOUD_STORE:{async get(k){return store.get(k)||null;}}};
 for(const id of [x,y])store.set('devices/'+id,encryptAccountData(c,Buffer.from(JSON.stringify({deviceId:id,tokenHash:'a'.repeat(64),enabled:true,mode:'daily',dailyAt:'01:00',startDate:'2026-10-29',playlist:[{sha256:'b'.repeat(64)}]}))));
 const first=(await bindRitualDevice(c,a,x)).binding;
 await bindRitualDevice(c,a,y);
 assert.deepEqual(await listRitualDeviceLinks(c),{[a.id]:y});
 await bindRitualDevice(c,b,y);
 assert.equal(await ritualDeviceForAccount(c,a.id),null);
 assert.deepEqual(await listRitualDeviceLinks(c),{[b.id]:y});
 // The old worker's commit guard must fail after takeover, including A -> B -> A.
 const again=(await bindRitualDevice(c,a,y)).binding;
 assert.notEqual(again.bindingId,first.bindingId);
 assert.deepEqual(await listRitualDeviceLinks(c),{[a.id]:y});
 const previousGeneration=again.bindingId;
 await bindRitualDevice(c,b,y);
 const reclaimed=(await bindRitualDevice(c,a,y)).binding;
 assert.notEqual(reclaimed.bindingId,previousGeneration);
 assert.deepEqual(await listRitualDeviceLinks(c),{[a.id]:y});
 await unbindRitualDevice(c,b);
 assert.deepEqual(await listRitualDeviceLinks(c),{[a.id]:y});
 await unbindRitualDevice(c,a);
 assert.deepEqual(await listRitualDeviceLinks(c),{});
 assert.equal(await ritualDeviceForAccount(c,a.id),null);
});

test('an interrupted account/device write never selects a mismatched binding generation',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-generation-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'latest-routing-test-secret-123456'},repo=accountRepository(c),accountId='1'.repeat(32),deviceId='112233445566';
 await repo.put('ritual-device/'+accountId,{accountId,deviceId,bindingId:'new'});
 await repo.put('ritual-device-owner/'+deviceId,{accountId,deviceId,bindingId:'old'});
 assert.deepEqual(await listRitualDeviceLinks(c),{});
 await repo.put('ritual-device-owner/'+deviceId,{accountId,deviceId,bindingId:'new'});
 assert.deepEqual(await listRitualDeviceLinks(c),{[accountId]:deviceId});
});
