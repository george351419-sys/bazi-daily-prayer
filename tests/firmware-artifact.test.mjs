import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
test('ritual.8升级包与源码包均匹配清单，且应用不超出现有OTA分区',async()=>{
 const base=new URL('../public/firmware/',import.meta.url),m=JSON.parse(await readFile(new URL('ritual-8.json',base),'utf8'));
 const b=await readFile(new URL(m.file,base));assert.equal(m.version,'3.2.5-ritual.8');assert.equal(b.length,m.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),m.sha256);assert.ok(b.length<=1945600);assert.equal(m.partitionLayoutChanged,false);assert.match(m.elfSha256,/^[a-f0-9]{64}$/);
 assert.equal(createHash('sha256').update(await readFile(new URL(m.sourceFile,base))).digest('hex'),m.sourceSha256);
});
