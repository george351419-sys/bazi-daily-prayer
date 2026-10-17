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

## 切换 GitHub Pages 的后端

当前目标域名为 `https://playmath.cn`。完成域名绑定及 HTTPS 证书部署后，运行：

```sh
node scripts/switch-edgeone-backend.mjs --apply
```

检查失败不会修改正在使用的后端地址。通过后脚本更新 GitHub 普通变量 `PRAYER_API_BASE`，并触发 Pages 部署。独立的 EdgeOne 页面不需要这一步，始终调用本站 `/api`。

## 用户账户与私有画册

2026-10-17 起，EdgeOne 云函数默认使用 `ACCOUNT_STORAGE=blob`。账户、登录会话、出生资料、愿望偏好、每次排盘和映射快照、用户解读与专业解读，以及生成后的原始图片均存入当前项目的 `prayer-accounts-v1` Blob 命名空间。SDK 在 EdgeOne 运行时自动鉴权，无需再填写数据库或对象存储密钥。使用 `@edgeone/pages-blob@0.0.18` 的强一致读取及 `onlyIfNew` 条件写入保证注册不会覆盖同名账户。

- **必须长期保留 `SESSION_SECRET`**，长度至少 20 位：账户记录和图片由其派生密钥进行 AES-256-GCM 加密，随意更换会使旧数据无法解密。迁移项目时须同时迁移 Blob 数据和原密钥。
- 账号不区分大小写，使用 3–24 位字母、数字或下划线；昵称可为中文；密码 10–128 位。密码与恢复码均存储独立随机盐的 scrypt 哈希。
- 登录采用 30 天 HttpOnly、Secure、SameSite=Lax Cookie；退出立即使对应会话失效。使用恢复码重设密码会轮换恢复码，并使所有旧登录会话失效。
- 生图前必须登录；画面映射先保存，即使图片暂未完成，也可从画册再次打开并继续绘制。图片转存失败时保留上游图片地址以便重试，尽量避免重复生图。
- 图片读取与作品查询均鉴权并按账户目录隔离。列表按创建时间倒序、每页 12 条；历史主尊选择仅使用同一出生资料的实际完成作品，不再信任前端上传的历史。
- 用户修改出生资料不改动旧作品的出生资料、历法、映射或解读快照。当前资料用于下次生成。
- GitHub Pages 镜像会引导账户用户前往正式域名登录，以避免第三方 Cookie 限制；完整账户流程在 `https://playmath.cn` 使用。

本机 `npm start` 默认使用 `.runtime/accounts` 持久化，密钥首次生成于 `.runtime/account-secret`，均被 Git 忽略。此文件存储只用于单机开发；生产使用 EdgeOne Blob。可设置 `ACCOUNT_STORAGE=disabled` 回到游客模式，仅供回滚排查。
