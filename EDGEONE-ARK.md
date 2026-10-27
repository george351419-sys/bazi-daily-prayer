# EdgeOne Ark 已有画作取图试验

独立设备试验：三份预先转换的720×480六色film，设备通过HTTPS主动领取。没有常驻Worker，不调用分析或生图模型。测试模式目标每5分钟换画；每日模式以北京时间01:00为日期切换边界。实际显示还受设备唤醒、网络与刷屏耗时影响。

## 存储与接口

使用单独的 `prayer-ark-trial-v1` Blob 命名空间，资产、设备配置及联网记录均用项目现有稳定 `SESSION_SECRET` 派生密钥加密。资产以SHA256寻址，配置读取使用强一致模式。此试验不迁移正式账号、付费队列或SQLite数据库。

- `GET /api/ark/health`：接口健康状态，不含设备数据或凭据。
- `GET /api/v1/device/heartbeat`：必须携带设备Bearer令牌；查询参数token不能代替鉴权。
- `GET /api/ark/assets/today.film`：15分钟有效的设备/资产绑定签名链接，仍检查设备是否启用。
- `GET /api/ark/status`：需设备Bearer令牌，只读目标设置和最近保存SHA。
- `POST /api/ark/provision`：管理员HMAC签名的资产导入、首次设备预置及模式切换。签名覆盖正文哈希及最多5分钟的有效期；重复导入不能覆盖设备凭据。

设备身份不能仅通过MAC或IP自动创建。已有本地测试设备通过受保护的运维导入保留其令牌，云端只保存令牌哈希。正式用户自助绑定与转赠流程不属于此试验。

## 部署

保留项目原 `SESSION_SECRET`，新增 `ARK_PUBLIC_ORIGIN=https://playmath.cn`。只允许此固定域名生成下载地址。独立云函数处理设备请求，不依赖浏览器Cookie或CSRF会话。

```sh
npm test
npm run build:edgeone
```

现有项目为GitHub集成，使用其Git发布流程。新设备入口与原网站入口分别打包。初次发布从已核对的线上提交构建，避免携带本机其他未上线功能。

将精确准备好的三份film及 `device.json` 放入被Git忽略的 `.runtime/ark-cloud-upload` 后，用项目安全导出的环境文件运行：

```sh
node --env-file=.runtime/ark-edgeone-cloud.env scripts/upload-ark-cloud.mjs
node scripts/check-ark-cloud.mjs
node --env-file=.runtime/ark-edgeone-cloud.env scripts/set-ark-cloud-mode.mjs daily
```

首次导入不要重复覆盖设备。`set-ark-cloud-mode.mjs test` 可恢复5分钟测试；模式切换不需要重新部署。检查脚本带只读探测标记，不写硬件心跳，不伪造显示回执。

## 配套固件与验收

配套云固件需启用HTTPS根证书校验、冷启动校时、Bearer鉴权及禁止下载重定向。本机已编译的 `3.2.5-cloud.1` 仅信任playmath.cn当前使用的DigiCert Global Root G2证书链；域名或证书签发链变化时需重新验证适配，不能关闭证书校验。

用原APP升级后将设备API改为 `https://playmath.cn`，原SSID和密码不变。必须实机验收：公网下载、保存、刷新、连续换图、断网恢复及关电脑后继续更新。云端stored仅代表设备报告文件SHA，不代表光学显示确认。设备实际刷屏与续航不能由软件测试替代。

回退可将设备API改回原局域网地址。服务器部署回退不应删除此试验Blob或更换SESSION_SECRET；正式画册使用原有独立命名空间。
