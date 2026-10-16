import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBackend,EDGEONE_BACKEND} from '../public/backend-routing.js';
const old='https://bazi-daily-prayer.vercel.app';
test('EdgeOne 页面忽略旧配置和已保存的 Vercel 地址，始终使用本站接口',()=>{
 for(const hostname of ['playmath.cn','www.playmath.cn','bazi-daily-prayer-test.edgeone.cool'])assert.equal(resolveBackend({hostname,configured:old,saved:old}),'');
});
test('GitHub Pages 和旧 Vercel 入口即使读到缓存配置仍连接 EdgeOne',()=>{
 for(const hostname of ['george351419-sys.github.io','bazi-daily-prayer.vercel.app'])assert.equal(resolveBackend({hostname,configured:old,saved:old}),EDGEONE_BACKEND);
});
test('本机打开页面时，旧 Vercel 保存项也会迁移，正常本机后端不受影响',()=>{
 assert.equal(resolveBackend({hostname:'localhost',saved:old}),EDGEONE_BACKEND);
 assert.equal(resolveBackend({hostname:'localhost'}),'');
 assert.equal(resolveBackend({hostname:'localhost',configured:'http://localhost:8787'}),'http://localhost:8787');
});
