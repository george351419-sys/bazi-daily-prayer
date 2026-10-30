# 微信小程序开发验收 · 2026-10-29

## 2026-10-31 更新

- 微信开发者工具登录态有效，正式 AppID `wx67be26840ab16898` 已完成真实编译，五个路由均可编译打开；模拟器首屏、许愿池、解读陪伴、自定义和答案之书已逐页检查。
- 小程序单测 13 项通过；服务端完整测试 149 项通过。主包脚本检查 393137 字节；微信上传包体 403560 字节。
- 已上传开发版本 `1.0.1`，微信返回包体 403560 字节。该版本尚未在公众平台设为体验版，也尚未提交审核。
- 开发者工具实测 `wx.request` 已可访问 `https://playmath.cn/api/bootstrap` 与 `/api/account/me` 并返回 200，确认微信后台 request/downloadFile 合法域名已生效。
- EdgeOne 已配置正式 AppID 与该 AppID 的 AppSecret，包含微信登录接口的最新服务端版本已部署。普通浏览器请求不带微信 Referer，因此 bootstrap 中 `miniProgram.enabled=false` 属于预期；带微信 Referer 时已返回 `enabled=true`、`wechatLoginEnabled=true`。仍需用真机完成微信登录验收。
- 本轮优化：网络错误改为可行动提示；解读页刷新从 30 秒延长到 60 秒并缓存已下载图片；照片轮播按上海时间 01:00 切换；缩略图批量加载并复用刚上传的本地文件。

- 设计：使用腾讯官方 ui-design、miniprogram-development skills；五路由原生 WXML/WXSS/JS，纸本画册风格。
- 当前源码：daily-prayer-web/miniprogram；API 固定 HTTPS playmath.cn。默认微信一键登录，由服务端交换 `wx.login` code 并建立免邮箱账户；已有网页账户保留低调入口。
- 已发布设计预览：https://playmath.cn/miniprogram/ 。该预览只使用浏览器内示例数据，照片不发往后台，不控制真实设备。
- Git 发布提交：35c247b097758b0ff8573592ac17275ddec96bc2；GitHub 构建 40825663568 成功。
- 微信登录增加服务端身份交换、身份复用、旧账户绑定、会话 cookie、昵称更新与跨 AppID 拒绝测试；画屏增加多账户关联与单一下发账户切换测试。
- 路由/JS/JSON/主包体积检查通过，约 351 KiB；此检查不等于微信官方编译。
- 浏览器验收：四个底部页面与答案页切换、OB005 检索与解读展开、随机翻页、微信登录、自定义上传入口、空轮播状态、微行动开关、确认切换按钮状态和生辰愿望保存均已检查。1–6 张顺序约束、每日取图与切回祈福图请求链路由契约/集成测试覆盖；文件选择和真机触摸排序仍需微信真机验收。
- 手机尺寸 390×844：没有横向溢出；答案翻页正常；页面错误日志为空。
- 线上是否开放微信登录取决于 EdgeOne 的 `MINIPROGRAM_APP_IDS` 与 `WECHAT_MINIPROGRAM_SECRETS`；未配置 AppSecret 时客户端显示明确提示，不会伪造 `wx.login` 成功。
- 未消耗付费模型额度，未刷写固件，未伪造硬件完成回执。

## 正式发布还缺什么

小程序 AppID、开发者登录、合法域名、AppSecret 与最新服务端部署已完成。仍需核对主体/隐私指引/备案/类目和必要资质，并完成 iOS/Android 真机 BLE/照片与微信登录验收；之后由管理员设为体验版、提交审核与发布。

既有 EdgeOne 内容编译和设备自动下发仍未接通。原生配网成功与账户计划保存都不代表设备已收到新图；UI 已明确标注。

## 开发工具

已校验腾讯官方 Electron Nightly 2.02.2610272 安装包（Apple 公证、Tencent Developer ID Installer 签名）。工具使用微信自带 wechatide-skill 0.3.14；后续安装诊断和登录状态以实际工具返回为准。

安装诊断结果：compatible=true，version=2.02.2610272；/usr/local/bin/wechatide 软链已就绪。2026-10-31 的 check_wechatide_status 返回 loginExpired=false、versionRelation=equal；已完成真实编译与开发版本 `1.0.1` 上传。

正确新版下载入口来自微信官方 Skills.html → log#nightly（Electron Nightly 2.02.2607032+）；旧 miniprogram-development skill 的 nightly_backup.html 指向旧 NW.js 构建。本次已修正安装为 Electron Nightly，不以旧版安装成功代替自动化就绪。
