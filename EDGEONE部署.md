# EdgeOne Pages 部署

连接现有 GitHub 仓库的 main 分支，项目根目录保持 `./`。仓库的 `edgeone.json` 自动设置：

- 安装命令：`npm ci`
- 构建命令：`npm run build:edgeone`
- 输出目录：`dist`
- 构建 Node.js：22.11.0
- Node 云函数时限：120 秒

在项目设置的环境变量中配置 `DEEPSEEK_API_KEY`、`ARK_API_KEY`、随机的 `SESSION_SECRET`，以及 `DEEPSEEK_MODEL=deepseek-flash`、`ARK_IMAGE_MODEL=doubao-seedream-5-0-flash-260915`。变更环境变量后需重新部署。不要把密钥放入 HTML、GitHub 变量或公开仓库。

构建将规则打包到服务端，生成 `cloud-functions/api` 路由；静态页面调用本站 `/api`，不再依赖 Vercel。已有 Vercel 和 GitHub Pages 构建保持兼容。

预览链接含 `eo_token` 和 `eo_time` 时，页面只将鉴权参数附加到本站 API 请求，不传给外部服务。预览链接失效时从控制台重新获取。稳定公开访问请按 EdgeOne 控制台指引绑定域名。

验证：打开页面，应显示“服务已连接”；输入资料后先获得解读，再生成图片。上游调用在函数时限前中止，超时可重试；已经完成的解读会保留。
