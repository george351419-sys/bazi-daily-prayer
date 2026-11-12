import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {answers,actionPlans} from '../content/ritual-content.mjs';
const exec=promisify(execFile);
test('cached conversion produces exactly the same device package as uncached conversion',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ritual-frame-cache-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 if(!existsSync('../FrameFilm/prayer-service/prayer_device/core.py')){t.skip('Real encoder is supplied by the private worker runtime');return;}
 const python=process.env.PRAYER_TEST_PYTHON||(existsSync('/opt/homebrew/bin/python3')?'/opt/homebrew/bin/python3':'python3'),font=process.env.RITUAL_FONT||'/System/Library/Fonts/Supplemental/Songti.ttc';
 const plan={mode:'daily',contentMode:'photo',showActions:false,startsAt:'2026-11-12T01:00:00+08:00',days:actionPlans.map(actions=>({actions}))};
 await writeFile(path.join(dir,'plan.json'),JSON.stringify(plan));await writeFile(path.join(dir,'answers.json'),JSON.stringify({answers}));
 const args=['tools/build-ritual-package.py','--plan',path.join(dir,'plan.json'),'--answers',path.join(dir,'answers.json'),'--images','tests/fixtures/photo-upload.jpg','tests/fixtures/photo-upload.jpg','--font',font];
 await exec(python,[...args,'--out',path.join(dir,'uncached.bin')],{timeout:120000});
 const first=await exec(python,[...args,'--cache-dir',path.join(dir,'cache'),'--out',path.join(dir,'first.bin')],{timeout:120000});
 const second=await exec(python,[...args,'--cache-dir',path.join(dir,'cache'),'--out',path.join(dir,'second.bin')],{timeout:120000});
 const stats=result=>JSON.parse(result.stdout.split('\n').find(line=>line.includes('"event": "frame-cache"')));
 assert.equal(stats(first).hits,1,'same photo for two days is converted once');assert.equal(stats(second).hits,2);
 assert.deepEqual(await readFile(path.join(dir,'first.bin')),await readFile(path.join(dir,'uncached.bin')));
 assert.deepEqual(await readFile(path.join(dir,'second.bin')),await readFile(path.join(dir,'uncached.bin')));
});
