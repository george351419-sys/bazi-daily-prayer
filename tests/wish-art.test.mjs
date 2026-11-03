import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateInput,calendarFor,buildImagePrompt} from '../lib/domain.mjs';
import {analyzeMapping} from '../lib/service.mjs';
import {saveProfile,getProfile,profileSignature} from '../lib/accounts.mjs';
import {generationSettings} from '../lib/automation.mjs';
const raw={contentMode:'wish-art',wishes:['W20','W35'],artStyle:'spirit'};
test('omitting birthday produces a genuine non-natal picture without a chart or provider analysis',async()=>{
 const input=validateInput(raw,'2026-11-02'),calendar=calendarFor(input);assert.equal(input.birthDate,'');assert.equal(input.birthTime,'');assert.equal(calendar.natal,undefined);
 const mapping=await analyzeMapping({PRAYER_ENGINE:'legacy'},input,calendar,[],()=>{throw Error('No paid analysis expected');});assert.equal(mapping.content_mode,'wish-art');assert.equal(mapping.primary_element,'');assert.deepEqual(mapping.reading.sections,[]);assert.equal(mapping.professional,'');assert.match(buildImagePrompt(mapping),/家人安康/);assert.match(buildImagePrompt(mapping),/问问兽/);
});
test('explicit non-natal mode rejects hidden birth data and invalid wishes',()=>{
 assert.throws(()=>validateInput({...raw,birthDate:'1992-10-17'}));assert.throws(()=>validateInput({...raw,wishes:[]}));assert.throws(()=>validateInput({...raw,wishes:['W99']}));
});
test('saved profile and automation snapshot preserve non-natal mode for subsequent days',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'wish-art-'));t.after(()=>rm(dir,{recursive:true,force:true}));const c={ACCOUNT_STORAGE:'file',ACCOUNT_DATA_DIR:dir,SESSION_SECRET:'wish-art-test-secret-long-enough'},account={id:'a'.repeat(32)};
 await saveProfile(c,account,raw);const saved=await getProfile(c,account);assert.equal(saved.contentMode,'wish-art');assert.equal(saved.birthDate,'');const settings=generationSettings(c,saved);assert.equal(settings.profile.contentMode,'wish-art');const tomorrow=validateInput(settings.profile,'2026-11-03');assert.equal(calendarFor(tomorrow).natal,undefined);assert.equal(profileSignature(tomorrow),profileSignature(validateInput(raw,'2026-11-02')));
});
