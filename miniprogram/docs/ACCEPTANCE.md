# 微信小程序开发验收 · 2026-10-29

- 设计：使用腾讯官方 ui-design、miniprogram-development skills；四页原生 WXML/WXSS/JS，纸本画册风格。
- 当前源码：daily-prayer-web/miniprogram；API 固定 HTTPS playmath.cn。首版沿用既有账户，不伪造微信授权登录。
- 已发布设计预览：https://playmath.cn/miniprogram/ 。该预览只使用浏览器内示例数据，照片不发往后台，不控制真实设备。
- Git 发布提交：35c247b097758b0ff8573592ac17275ddec96bc2；GitHub 构建 40825663568 成功。
- 发布分支后台测试 102 项通过；本地工作分支（含既有邮箱功能）109 项通过；小程序侧 6 项通过。
- 路由/JS/JSON/主包体积检查通过，约 351 KiB；此检查不等于微信官方编译。
- 浏览器验收：四页切换、OB005 检索与解读展开、随机翻页、照片选择与本地 Canvas 重绘、照片动作关闭、计划保存、生辰愿望保存、生成演示入口均通过。
- 手机尺寸 390×844：没有横向溢出；答案翻页正常；页面错误日志为空。
- 线上 HTTP 检查：设计预览 200；bootstrap 的 miniProgram.enabled=false（未配置 AppID，符合预期）。内置浏览器访问公网预览有超时，因此交互截图取自相同源码的本机预览。
- 未消耗付费模型额度，未刷写固件，未伪造硬件完成回执。

## 正式发布还缺什么

用户确认尚未注册小程序账号。需用户完成主体注册、获取 AppID、管理员扫码；配置合法域名、隐私指引/主体与联系渠道、备案及业务实际类目和必要资质。之后才能完成微信官方编译、iOS/Android 真机 BLE/照片验收、上传体验版、提交审核与发布。

既有 EdgeOne 内容编译和设备自动下发仍未接通。原生配网成功与账户计划保存都不代表设备已收到新图；UI 已明确标注。

## 开发工具

已校验腾讯官方 Electron Nightly 2.02.2610272 安装包（Apple 公证、Tencent Developer ID Installer 签名）。工具使用微信自带 wechatide-skill 0.3.14；后续安装诊断和登录状态以实际工具返回为准。

安装诊断结果：compatible=true，version=2.02.2610272；/usr/local/bin/wechatide 软链已就绪。check_wechatide_status 返回 CONNECT_ERROR / wait WechatIDE authorization timeout，未取得已登录或已授权的状态。未继续编译、预览上传或微信发布。

正确新版下载入口来自微信官方 Skills.html → log#nightly（Electron Nightly 2.02.2607032+）；旧 miniprogram-development skill 的 nightly_backup.html 指向旧 NW.js 构建。本次已修正安装为 Electron Nightly，不以旧版安装成功代替自动化就绪。
