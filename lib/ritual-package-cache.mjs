import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {validateRitual} from './ark-cloud.mjs';
import {stageRitualPackage} from './ritual-upload.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function atomic(file,data){
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+randomBytes(5).toString('hex');
 try{await writeFile(tmp,data,{mode:0o600});await rename(tmp,file);}finally{await rm(tmp,{force:true});}
}
export async function cachedRitualPackage(dir,signature,compile){
 if(!/^[a-f0-9]{64}$/.test(signature))throw new Error('Invalid compilation signature');
 const file=path.join(dir,signature+'.bin');
 try{const saved=await readFile(file),bytes=saved.subarray(64);if(saved.subarray(0,64).toString()===sha(bytes)){validateRitual(bytes);return bytes;}}catch{}
 const bytes=await compile();validateRitual(bytes);await atomic(file,Buffer.concat([Buffer.from(sha(bytes)),bytes]));return bytes;
}
export async function uploadCachedRitualPackage(c,dir,signature,bytes,options={}){
 const file=path.join(dir,signature+'.upload.json');let resume;
 try{resume=JSON.parse(await readFile(file,'utf8'));}catch{}
 return stageRitualPackage(c,bytes,{...options,resume,onCheckpoint:checkpoint=>atomic(file,JSON.stringify(checkpoint))});
}
export function ritualFailure(error,stage){
 return {stage:error?.stage||stage||'encoding',httpStatus:Number.isInteger(error?.httpStatus)?error.httpStatus:null,retryable:error?.retryable!==false};
}
export async function resetRitualUpload(dir,signature){await rm(path.join(dir,signature+'.upload.json'),{force:true});}
