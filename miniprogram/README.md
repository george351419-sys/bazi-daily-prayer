# 今日祈愿 · 微信小程序

原生四页 WXML/WXSS/JavaScript 项目，设计说明在 docs/DESIGN.md。线上网页仍在 https://playmath.cn。设计预览在 https://playmath.cn/miniprogram/，仅用本地示例数据，不代表微信发布或真实设备同步。

## 当前交付

今日图文与行动、账户画面解读、原生蓝牙搜索/连接/配网、照片 Canvas 重绘上传、祈福/照片两种模式、个人照片动作开关、两日测试/日常计划、100 条答案随机翻页和检索、生辰/愿望编辑、今日祈福画解析与绘制入口、沿用现有账户登录/注册/恢复。

后端沿用 EdgeOne，不开通 CloudBase、不改变既有账户密钥。微信请求保持 session + CSRF + 账户 cookie 鉴权。允许的小程序客户端必须通过 MINIPROGRAM_APP_IDS 显式配置，按微信 Referer 精确匹配。当前没有正式 AppID，默认拒绝小程序账户写入；touristappid 仅供本地项目占位，不能上传正式体验版。

## 验证

在此目录运行 `npm test`、`npm run check`；无需安装小程序端依赖。仓库根目录运行 `node --test tests/miniprogram-access.test.mjs` 验证原生请求与原网页登录隔离。

`check` 是语法/路由/体积检查，不能冒充微信编译。浏览器预览由 scripts/build-miniprogram-review.mjs 从同一份原生页面源码生成，只覆盖通用页面行为；BLE、手机 Canvas 解码方向、系统隐私授权、真机上传与包编译必须用微信 Nightly/真机验收。

## 正式发布前待完成

1. 在微信公众平台注册小程序、确认实际经营主体与类目。若未来在小程序销售实体画屏或线下服务，应先核对主体和支付资格；本版没有支付功能。不要为赶进度随意选择主体。
2. 获得正式 AppID 后配置 project.config.json；EdgeOne 新增 MINIPROGRAM_APP_IDS=真实 AppID。不要更换 SESSION_SECRET。AppSecret 不应放到源码或聊天中；当前账户密码方案不需要 AppSecret。
3. 用户在微信 Nightly 扫码登录，并具备该小程序开发者权限。自动化入口按安装版本的内置 skill 与 wechatide --help 执行，不能猜测命令。
4. 微信后台配置 request/downloadFile 合法域名 https://playmath.cn。照片通过 wx.request 的 JSON 上传，不使用第三方域名。保持域名校验，不能通过 urlCheck=false 假装生产通过。
5. 填齐运营主体、隐私联系渠道和隐私保护指引；声明相册/相机、蓝牙、本地存储、生辰/城市/愿望数据用途。按平台要求完成备案、服务类目与必要资质。宗教造像、八字/祈福解读等内容须按实际业务核验；不能保证审核通过，也不能把改文案当成规避审核。
6. 真机检查 iOS/Android 相册方向、JPEG 1440 上限、768 KiB、EXIF 去除、中文 SSID、MTU、写入/读回确认、断网重试与断开清理；无真实回执不得显示设备同步成功。
7. 完成 EdgeOne 自动内容编译和设备下发适配。现阶段保存计划仅保存在账户中，这个既有缺口不会因改成小程序自动消失。
8. 上传体验版 → 管理员体验验收 → 提交微信审核 → 审核通过后发布。目前没有账号，尚未执行这几个步骤。

本项目没有注册微信账号、代替用户接受协议、申请付费服务或变更生产密钥。后续注册/认证与管理员扫码需用户本人完成。
