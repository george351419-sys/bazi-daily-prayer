// Real offline compiler check; no model calls and no cloud publication.
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {answers} from '../content/ritual-content.mjs';
import {personalizeActionOptions} from '../lib/action-personalization.mjs';
import {validateRitual} from '../lib/ark-cloud.mjs';
const python=process.env.PRAYER_TEST_PYTHON,font=process.env.RITUAL_FONT,encoder=process.env.RITUAL_ENCODER_ROOT;
if(!python||!font||!encoder)throw new Error('Configure Python, Chinese font and encoder');
await access(font);
const dir=await mkdtemp(path.join(tmpdir(),'ritual-server-check-')),exec=promisify(execFile);
try{
 const plan={mode:'daily',contentMode:'prayer',startsAt:'2026-11-14T01:00:00+08:00',showActions:true,actionSlots:9,actionVariants:5,answerLayout:'centered-reading-v2',days:personalizeActionOptions(null,9).map(actions=>({actions}))};
 await writeFile(path.join(dir,'plan.json'),JSON.stringify(plan));await writeFile(path.join(dir,'answers.json'),JSON.stringify({answers}));
 const source=path.join(dir,'image.png');
 await exec(python,['-c','from PIL import Image; import sys; Image.new("RGB",(480,720),(180,190,160)).save(sys.argv[1])',source]);
 await exec(python,['tools/build-ritual-package.py','--encoder-root',encoder,'--plan',path.join(dir,'plan.json'),'--images',source,source,'--answers',path.join(dir,'answers.json'),'--font',font,'--out',path.join(dir,'ritual.bin')],{timeout:180000,maxBuffer:100000});
 const bytes=await readFile(path.join(dir,'ritual.bin'));validateRitual(bytes);
 if(bytes.readUInt32LE(36)!==5||(bytes.readUInt32LE(32)-bytes.readUInt32LE(28))/7680!==90)throw new Error('Invalid v5 action package');
 console.log(JSON.stringify({event:'ritual-server-preflight-passed',protocol:5,strips:90,answers:answers.length,bytes:bytes.length}));
}finally{await rm(dir,{recursive:true,force:true});}
