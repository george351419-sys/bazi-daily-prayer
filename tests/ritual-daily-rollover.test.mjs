import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ensureDailyRitualPreparation,advanceRitualPreparation} from '../lib/ritual-preparation.mjs';
import {accountRepository} from '../lib/account-store.mjs';
import {profileSignature,saveArtwork} from '../lib/accounts.mjs';
import {validateInput,WISH_GROUPS} from '../lib/domain.mjs';
async function setup(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'daily-rollover-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'daily-rollover-test-secret-12345'},a={id:'a'.repeat(32)},repo=accountRepository(c);
 const profile={gender:'female',birthDate:'1990-01-01',birthTime:'12:00',calendar:'solar',wishes:[WISH_GROUPS[0].items[0].id],artStyle:'cute'};
 await repo.put('profiles/'+a.id,profile);
 for(const [i,date] of ['2026-11-13','2026-11-14'].entries())await saveArtwork(c,a,{id:String(i+1).repeat(36),userId:a.id,date,status:'complete',image:{key:'test'},profileSignature:profileSignature(validateInput(profile,date))});
 const plan={mode:'daily',contentMode:'prayer',revision:'old',artworkIds:['1'.repeat(36),'2'.repeat(36)]};await repo.put('ritual/'+a.id,plan);
 return {c,a,repo,plan};
}
const at=s=>Date.parse('2026-11-14T'+s+'+08:00');
test('01:00 rolls to the existing second frame and repeated polls preserve the same durable task',async t=>{
 const {c,a,repo}=await setup(t);
 assert.equal((await ensureDailyRitualPreparation(c,a,{now:at('00:59:59')})).status,'covered');
 const task=await ensureDailyRitualPreparation(c,a,{now:at('01:00:00')});assert.equal(task.artworkId,'2'.repeat(36));assert.equal(task.date,'2026-11-14');
 assert.equal((await ensureDailyRitualPreparation(c,a,{now:at('10:00:00')})).id,task.id);
 assert.equal((await repo.get('ritual/'+a.id)).revision,'old','queueing never claims publication');
});
test('restart catches up after the boundary and a later user selection blocks automatic configuration',async t=>{
 const {c,a,repo,plan}=await setup(t);await ensureDailyRitualPreparation(c,a,{now:at('10:00:00')});
 await repo.put('ritual/'+a.id,{...plan,revision:'user-selection'});
 let calls=0;assert.equal((await advanceRitualPreparation(c,a,{prepare:async()=>{calls++;}})).status,'superseded');assert.equal(calls,0);
});
test('photo and test plans never start automatic paid preparation',async t=>{
 const {c,a,repo,plan}=await setup(t);
 for(const change of [{contentMode:'photo'},{mode:'test'}]){await repo.put('ritual/'+a.id,{...plan,...change});assert.equal((await ensureDailyRitualPreparation(c,a,{now:at('10:00:00')})).status,'ineligible');}
 assert.equal(await repo.get('ritual-preparation/'+a.id),null);
});
test('long outages do not silently recycle expired images',async t=>{
 const {c,a}=await setup(t);assert.equal((await ensureDailyRitualPreparation(c,a,{now:Date.parse('2026-11-17T10:00:00+08:00')})).status,'missing_current_day');
});
