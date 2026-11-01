# 项目修改约束

## 画屏固件升级：先读历史事故，再修改

修改固件、BLE / Wi-Fi OTA、固件清单、升级网页或相关发布流程之前，必须阅读 [固件 OTA 事故复盘](docs/FIRMWARE-OTA-LESSONS.md)，以文末最新约束为准。

已知 ritual.3 / ritual.5 的旧 Wi-Fi OTA 入口拒绝 HTTPS 并返回错误码 2。不得再次给旧设备发布仅调用该入口的升级页面；不得把它归因为 Wi-Fi 密码错误并让用户反复配网。当前兼容路径是 HTTPS 下载校验后 BLE 传输，重启后核验目标版本和 ELF 指纹。

每次修改升级流程必须运行 `node --test tests/ark-network.test.mjs tests/firmware-upgrade-page.test.mjs`，保留旧固件返回错误码 2 的用例。必须区分代码/模拟测试通过、网页发布完成、实体设备升级验收；不得用前两者代替后者。
