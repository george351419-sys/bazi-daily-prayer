import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import onRequest from '../edgeone/handler.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {saveArtwork,newArtworkId} from '../lib/accounts.mjs';
import {ritualWorkerSignature} from '../lib/ritual-worker-bridge.mjs';

const origin='https://playmath.cn';
function signed(c,pathname,{method='GET',body}={}){
 const expires=String(Math.floor(Date.now()/1000)+120),raw=body===undefined?'':JSON.stringify(body);
 return new Request(origin+pathname,{method,headers:{'X-Ritual-Expires':expires,'X-Ritual-Signature':ritualWorkerSignature(c,method,pathname,raw),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:raw})});
}

test('remote ritual worker bridge is HMAC-only and exposes account snapshots without browser sessions',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-worker-bridge-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'ritual-worker-bridge-test-secret',RITUAL_WORKER_REMOTE:'1'},account={id:'5'.repeat(32)},device='112233445566',id=newArtworkId(),repo=accountRepository(c);
 await repo.put('ritual-device/'+account.id,{accountId:account.id,deviceId:device,status:'ready',createdAt:new Date().toISOString()});
 const image=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
 await repo.putImage('images/'+account.id+'/'+id,image);
 await saveArtwork(c,account,{id,userId:account.id,date:'2026-10-29',createdAt:new Date().toISOString(),status:'complete',image:{key:'images/'+account.id+'/'+id,type:'image/png'},mapping:{title:'测试画作'}});
 const unsigned=await onRequest({request:new Request(origin+'/api/internal/ritual-worker/links'),env:c});assert.equal(unsigned.status,403);
 const links=await onRequest({request:signed(c,'/api/internal/ritual-worker/links'),env:c});assert.equal(links.status,200);assert.deepEqual((await links.json()).links,{[account.id]:device});
 const snapshot=await onRequest({request:signed(c,'/api/internal/ritual-worker/accounts/'+account.id),env:c});assert.equal(snapshot.status,200);const state=await snapshot.json();assert.equal(state.deviceId,device);assert.equal(state.records[0].id,id);
 const asset=await onRequest({request:signed(c,'/api/internal/ritual-worker/accounts/'+account.id+'/artworks/'+id+'/image'),env:c});assert.equal(asset.status,200);assert.deepEqual(Buffer.from(await asset.arrayBuffer()),image);
 const body={state:{status:'published',sha256:'a'.repeat(64)}};
 assert.equal((await onRequest({request:signed(c,'/api/internal/ritual-worker/accounts/'+account.id+'/build',{method:'POST',body}),env:c})).status,200);
 assert.equal((await repo.get('ritual-build/'+account.id)).status,'published');
 const good=signed(c,'/api/internal/ritual-worker/accounts/'+account.id),headers=Object.fromEntries(good.headers),tampered=new Request(good.url,{headers:{...headers,'X-Ritual-Signature':'0'.repeat(64)}});
 assert.equal((await onRequest({request:tampered,env:c})).status,403);
});
