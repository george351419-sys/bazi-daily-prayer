# 今日祈愿 · 微信小程序

原生五路由 WXML/WXSS/JavaScript 项目，设计说明在 docs/DESIGN.md。线上网页仍在 https://playmath.cn。设计预览在 https://playmath.cn/miniprogram/，仅用本地示例数据，不代表微信发布或真实设备同步。

## 当前交付

重新生成祈福画后自动更新已绑定画屏的两日计划、今日图文与行动、微信一键登录、账户昵称与画面解读、原生蓝牙搜索/连接/配网、照片 Canvas 多选重绘上传、最多 6 张有序每日轮播、个人照片动作开关、祈福/照片模式切换、100 条答案随机翻页和检索、生辰/愿望编辑、今日祈福画解析与绘制入口。已有网页账户仍可登录并主动绑定微信。

后端沿用 EdgeOne，不开通 CloudBase、不改变既有账户密钥。微信请求保持 session + CSRF + 账户 cookie 鉴权。`wx.login` 的临时 code 只发往服务端，由服务端使用 AppSecret 换取 `openid`；小程序包内不包含 AppSecret。允许的小程序客户端必须通过 `MINIPROGRAM_APP_IDS` 显式配置，按微信 Referer 精确匹配。

一台画屏可关联多个微信账户，但只有一个当前下发账户。切换时需重新连接附近蓝牙画屏并确认；账户之间的生辰、愿望、照片和画作不会串用。

## 验证

在此目录运行 `npm test`、`npm run check`；无需安装小程序端依赖。仓库根目录运行 `node --test tests/miniprogram-access.test.mjs` 验证原生请求与原网页登录隔离。

`check` 是语法/路由/体积检查，不能冒充微信编译。浏览器预览由 scripts/build-miniprogram-review.mjs 从同一份原生页面源码生成，只覆盖通用页面行为；BLE、手机 Canvas 解码方向、系统隐私授权、真机上传与包编译必须用微信 Nightly/真机验收。

2026-10-31 已在微信开发者工具使用正式 AppID `wx67be26840ab16898` 完成真实编译，逐页检查首屏与答案页，并在无 console 异常的情况下上传开发版本 `1.0.0`（394002 字节）。上传成功不等于已设为体验版，也不等于已通过审核。

## 正式发布前待完成

1. 确认实际经营主体、服务类目、备案与必要资质。若未来在小程序销售实体画屏或线下服务，应先核对主体和支付资格；本版没有支付功能。不要为赶进度随意选择主体。
2. EdgeOne 已配置 `MINIPROGRAM_APP_IDS=wx67be26840ab16898`，但尚未配置对应的 `WECHAT_MINIPROGRAM_SECRETS`，因此微信一键登录仍不可用。只在服务端环境变量填写 AppSecret；不要更换 `SESSION_SECRET`，也不要把 AppSecret 写进源码、项目配置或聊天。线上还需部署包含 `/api/account/wechat-login` 的最新服务端版本。
3. 已完成：微信开发者工具登录、正式 AppID 真实编译和开发版本 `1.0.0` 上传。仍需由管理员在公众平台把该版本设为体验版并添加体验成员。
4. 微信后台尚未配置 request/downloadFile 合法域名 `https://playmath.cn`；开发者工具实测错误为 `request:fail url not in domain list`。照片通过 wx.request 的 JSON 上传，不使用第三方域名。保持域名校验，不能通过 urlCheck=false 假装生产通过。
5. 填齐运营主体、隐私联系渠道和隐私保护指引；声明相册/相机、蓝牙、本地存储、生辰/城市/愿望数据用途。按平台要求完成备案、服务类目与必要资质。宗教造像、八字/祈福解读等内容须按实际业务核验；不能保证审核通过，也不能把改文案当成规避审核。
6. 真机检查 iOS/Android 相册方向、JPEG 1440 上限、768 KiB、EXIF 去除、中文 SSID、MTU、写入/读回确认、断网重试与断开清理；无真实回执不得显示设备同步成功。
7. 完成 EdgeOne 自动内容编译和设备下发适配。现阶段保存计划仅保存在账户中，这个既有缺口不会因改成小程序自动消失。
8. 开发版本已上传；还需要“设为体验版 → 管理员体验验收 → 提交微信审核 → 审核通过后发布”。目前尚未选择体验版、提交审核或发布。

本项目没有注册微信账号、代替用户接受协议、申请付费服务或变更生产密钥。后续注册/认证与管理员扫码需用户本人完成。

## 本机工具就绪情况

已安装官方 Electron Nightly 2.02.2610272，腾讯签名与 Apple 公证校验通过，安装诊断 compatible=true，wechatide 入口可用。微信自带 wechatide-skill 0.3.14 已导入项目技能目录；当前开发者工具登录态有效，已具备编译与上传能力。真实编译、逐页模拟器检查和 `1.0.0` 上传均已完成。新版工具请按 https://developers.weixin.qq.com/miniprogram/dev/devtools/log.html#nightly 获取，旧备用页不含新版自动化入口。
