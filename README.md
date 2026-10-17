# 今日祈愿 · 生辰造像馆

根据性别、生辰、出生地和多选祈福项，生成每日祈福画与两层解读。温暖手绘动画风，方形无字画面。

## 结构

- `public/`：无框架 HTML/CSS/JavaScript，部署至 GitHub Pages。
- `api/gateway.js`：Vercel Node.js 后端，调用 DeepSeek 与火山方舟豆包 Seedream。
- `lib/domain.mjs`：真实历法计算、字段校验、十干关系配对与生图封装。
- `rules/`：本项目的取象、主尊、配色、天干与生肖规则。
- `server.mjs`：本机开发服务器。

## 本机运行

需要 Node.js 24。

```sh
npm ci
cp .env.example .env.local
# 在 .env.local 中自行填入密钥，仅限服务端，切勿提交
npm start
```

访问终端显示的 `http://127.0.0.1:8787`。本机服务默认只监听回环地址。也支持 `node server.mjs --credentials-stdin`，以隐藏输入将凭据仅传入进程内存。

```sh
npm test
```

## EdgeOne Pages（当前迁移目标）

后端已适配 EdgeOne 云函数，项目绑定 `playmath.cn`。部署步骤见 [EDGEONE部署.md](EDGEONE部署.md)。EdgeOne 托管的页面使用本站 `/api`；GitHub Pages 的独立后端地址由仓库普通变量 `PRAYER_API_BASE` 控制。

域名 HTTPS 配置完成后，运行 `node scripts/switch-edgeone-backend.mjs --apply`。脚本先验证 HTTPS、接口版本、模型配置和跨域，通过后才更新 GitHub 变量并触发页面部署。检查未通过时保留当前后端地址。

## GitHub Pages + Vercel（原部署方案）

1. 将项目关联到 Vercel 的 `bazi-daily-prayer`。
2. 在 Vercel 的 Production 环境设置：
   - `DEEPSEEK_API_KEY`：DeepSeek 密钥。
   - `ARK_API_KEY`：火山方舟密钥。
   - `DEEPSEEK_MODEL`：默认 `deepseek-flash`，可换为账号支持的模型。
   - `ARK_IMAGE_MODEL`：默认 `doubao-seedream-5-0-flash-260915`（本账号已真实验证），可换为已开通模型/接入点。5.0 Flash/Pro 不发送旧版组图参数。
   - `SESSION_SECRET`：随机高强度服务端加密密钥，保持稳定；轮换后旧会话失效。
   - `ALLOWED_ORIGINS`：允许连接的前端 origin，默认 `https://george351419-sys.github.io`。
3. Vercel 部署使用仓库内 `vercel.json`，API 最大时长配置 300 秒。
4. GitHub 仓库设置 Pages 来源为 GitHub Actions。
5. 设置 GitHub **普通变量** `PRAYER_API_BASE` 为已验证的 Vercel 生产 origin（不是 Key）。推送 main 自动部署。

生产凭据只放服务端平台的环境变量（EdgeOne 或 Vercel）；GitHub Pages、源码、构建产物都不含 API 密钥。后端返回的会话令牌与生成记录是签名/加密令牌，不是上游密钥。生产采用无状态 API，避免依赖可能随实例消失的进程内任务表。生成记录加密并绑定会话，24小时后失效。

## 行为与限制

- 排盘使用 `lunar-javascript`，历法与文案模型分开：模型不得自行改四柱、大运或岁月日。
- 当前支持北京时间输入、中国境内、1900年以后出生；公历/农历及闰月均支持。出生地留空则不校正真太阳时；填写并唯一匹配城市/区县时，按中心近似经度加经度时差与 NOAA 均时差，校正日柱/时柱。年/月柱的节气判断和起运按出生的绝对时刻计算，避免把校正后的钟面时间误当成北京时间。地名重名或未识别会提示补充，不猜测坐标。中国历史夏令时范围仍提示人工核验。
- 每日按上海当地中午评估，不加流时。交运按实际起运时刻比较。
- 36个愿望可多选，每日选一个主要愿望；用户解读包含整体画面与每个主要要素；折叠区采用生辰四柱、时间口径和3至5段白话命理解读卡片，不展示内部校验记录或原始 JSON。生日支持 `1990-1-1` 文本输入和年月日滚动选择。
- 喜用等解释是 DeepSeek 按规则的初判，不是已完成的确定性旺衰引擎。未审定条件必须记录。
- 天干新增象征干默认无限份，五合匹配可复用；不把该规则扩展到地支，也不把图案写回真实命盘。
- 输入到 DeepSeek 仅用于用户请求的排盘解读；豆包只收到画面要素，不收到完整出生资料。
- 本机同日结果在服务进程及当前浏览器会话复用；生产在当前浏览器会话复用当天结果、记录少量主尊历史，关闭会话、换设备或清理存储后不保证保留。生产图片由豆包返回临时 URL，建议及时下载；本项目未接入长期对象存储。
- 模型或密钥权限失败会显示真实错误，不用示例图冒充生成结果。生图失败保留解读，可单独重试。
- 暂无账户体系、人工造像审核、生成图自动视觉验收、电子墨水量化或实机验收。

接口依据：[DeepSeek](https://api-docs.deepseek.com/api/create-chat-completion/)、[火山方舟 Seedream](https://docs.volcengine.com/docs/ark/seedream-4-0-5-0?lang=zh)。

城市坐标及许可证见 [third_party/NOTICES.md](third_party/NOTICES.md)。中心经度是城市/区县级近似值，不代表具体出生医院经度。
