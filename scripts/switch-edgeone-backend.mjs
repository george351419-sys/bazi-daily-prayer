import {spawnSync} from 'node:child_process';
import {RULE_VERSION} from '../lib/domain.mjs';
const target='https://playmath.cn';
const origin='https://george351419-sys.github.io';
// Verify normal HTTPS, provider readiness and browser CORS before changing the live frontend.
try{
 const response=await fetch(target+'/api/bootstrap',{headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('初始化接口返回 HTTP '+response.status);
 const data=await response.json();
 if(!data.ready?.text||!data.ready?.image)throw new Error('EdgeOne 的文案或生图配置尚未就绪');
 if(data.version!==RULE_VERSION)throw new Error('EdgeOne 部署版本尚未更新');
 if(response.headers.get('access-control-allow-origin')!==origin)throw new Error('尚未允许 GitHub Pages 跨域调用');
 console.log('EdgeOne HTTPS、接口、模型配置、版本和跨域检查通过。');
 if(process.argv.includes('--apply')){
  for(const args of [['variable','set','PRAYER_API_BASE','--body',target],['workflow','run','pages.yml']]){
   const result=spawnSync('gh',args,{stdio:'inherit'});
   if(result.status!==0)throw new Error('GitHub 配置或部署触发失败，请检查 gh 登录状态');
  }
  console.log('GitHub Pages 后端已设置为 '+target+'，已触发页面部署。');
 }else console.log('执行 node scripts/switch-edgeone-backend.mjs --apply 可切换并发布前端。');
}catch(error){console.error('尚未切换后端：'+(error.cause?.code||error.message));process.exitCode=1;}
