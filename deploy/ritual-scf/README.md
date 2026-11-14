# 从 Mac Worker 迁移到腾讯云 SCF

## 最终结构

EdgeOne继续运行账户、生图准备、计划、设备回报和加密Blob数据。SCF通过现有HMAC接口推进任务、编译两日v5包、发布，并运行独立巡检。电脑不参与正式调度。SCF用Job镜像，进程完成一次有界任务后退出，不是常驻Docker服务。

告警按用户选择仅记录，不发企业微信/飞书消息。SCF标准输出记录事件，EdgeOne的加密存储同时保留活跃事件和最近200条告警/恢复记录。触发器整个停用时，函数自身无法运行并记录告警；如以后要覆盖该情况，应另外配置腾讯云平台监控或外部巡检。

## 第一步：发布 EdgeOne 后端

先将本次补丁提交GitHub，等待既有EdgeOne自动部署成功。新版本增加以下仅HMAC可读写的内部接口：

- `/api/internal/ritual-worker/state/scheduler`：调度游标及上次执行时间。
- `/api/internal/ritual-worker/state/monitor`：告警状态、最后巡检时间及历史。

不能在浏览器直接打开来判断可用性，匿名403是预期。SCF的probe会用已有生产SESSION_SECRET验证。

## 第二步：创建腾讯云私有镜像仓库

在腾讯云容器镜像服务TCR控制台准备一个私有仓库，记下完整仓库名（不含tag），例如 `ccr.ccs.tencentyun.com/你的命名空间/ritual-worker`。仓库和后续SCF函数必须在同一地域。已有仓库可复用，不需要购买独立服务器。具体计费和套餐以你账号控制台为准，本脚本不自动开通付费资源。

在GitHub仓库 Settings → Secrets and variables → Actions 添加：

- `TCR_USERNAME`：镜像仓库登录用户名。
- `TCR_PASSWORD`：镜像仓库登录密码/token。

这是镜像仓库登录凭据，不是生图密钥、SESSION_SECRET或腾讯云账号主密钥。不要把凭据写进代码或工作流输入框。

## 第三步：在云端构建镜像

GitHub仓库 Actions → **Build Tencent SCF ritual image** → Run workflow，填写上一步的完整仓库名。

流程会在Linux x86构建，执行单元回归测试，再真实生成一个v5包（90条动作位图、100个答案）。编码器、中文字体、函数缺失或排版溢出会阻止构建和推送。成功后工作流Summary输出含提交SHA及digest的不可变镜像地址。复制这个地址，两个SCF函数使用相同镜像。

这样只需要电脑发起部署操作，正式执行和之后的镜像构建均不依赖电脑开机。

## 第四步：在SCF控制台创建两个Job镜像函数

控制台：https://console.cloud.tencent.com/scf/list

创建时选择：**使用容器镜像创建 → Job镜像**（不是Web Server；Job无需监听9000端口）。镜像选取第三步成功输出的地址。函数Command/CMD保持镜像默认；它执行 `node scripts/run-ritual-scf-job.mjs`。

| 项目 | 编译调度函数 | 独立巡检函数 |
|---|---|---|
| 名称 | ritual-cloud-worker | ritual-cloud-monitor |
| 地域 | 与镜像仓库相同 | 与镜像仓库相同 |
| 内存 | 1024MB | 1024MB（初始保守配置） |
| 执行超时 | 900秒 | 300秒 |
| 初始化超时 | 120秒 | 120秒 |
| 公网访问 | 开启（需要访问playmath.cn） | 开启 |
| 最大独占配额 | 1024MB，即同内存规格下最多1个并发 | 1024MB，即最多1个并发 |
| 初始RITUAL_SCF_MODE | probe | probe |

不能只设“单实例并发1”：那不限制平台同时创建多个实例。必须把整个函数的最大独占内存配额限制为一个实例规格，防止同一个游标被并行消费。不要开启预置并发，当前无需常驻实例。

SCF日志启用CLS（由控制台选择或自动创建），方便保留执行失败和只读探测日志。

两个函数均配置 `worker.env.example` 中的环境变量。SESSION_SECRET从现有EdgeOne生产环境复制相同值；不要改动原站点的密钥，不要发送到聊天。镜像已包含Python、编码器和Linux中文字体，无需额外设置Mac路径。

此时先不要创建/启用定时触发器。分别运行一次测试，事件填 `{}` 即可，Job不依赖事件正文。必须看到：

```
{"event":"ritual-scf-probe-passed",...,"mode":"read-only"}
```

probe只读访问，不生图、不发布，可以和本机Worker同时测试。若403，检查密钥及EdgeOne的RITUAL_WORKER_REMOTE=1；若404，先检查第一步是否部署了新内部接口。不要为了探测而删除已有计划或设备绑定。

## 第五步：切换生产

只有Linux镜像构建成功、两个probe调用通过，才在Mac执行：

```sh
launchctl bootout "gui/$(id -u)/com.playmath.ritual-worker"
```

确认本机旧Worker进程已退出；如旧请求尚在执行，等它结束后再启动云端写任务。首次切换时不要同时运行两套Worker。

1. 在SCF中将编译函数的 `RITUAL_SCF_MODE` 改为 `worker`；巡检函数改为 `monitor`。
2. 编译函数先手动测试一次，看见 `ritual-scf-tick-complete`；巡检测试一次，看见 `ritual-monitor-complete`。进程启动日志不等于内容已发布。
3. 分别创建**定时触发器**，选择自定义Cron。推荐编译每分钟：`0 */1 * * * * *`；巡检每五分钟：`0 */5 * * * * *`。这是SCF七段Cron，不是EdgeOne五段Cron。按控制台选项确认时区；日期判断由代码统一按北京时间计算。
4. 两个函数的最大并发均为1。执行超过一分钟时，下一次触发可能被节流；现有持久游标会在后续成功触发时续跑，不能提高并发绕过限制。

编译每次最多处理2个账户，每个账户只推进一个生图准备阶段；保存云端游标后退出。冷启动丢弃/tmp不会丢失生图任务和已保存的发布准备状态。临时上传缓存丢失时允许重新上传分块，不把本机文件当作发布成功证据。

## 第六步：验收电脑已退出生产链路

先断开Mac Worker，确认至少两个独立定时调用成功，然后核对目标账户：

- 计划日期覆盖当天和次日，次日画作确实完整。
- 新包发布成功，记录新SHA。
- 设备唤醒联网后，上报同SHA的stored=true，且lastSeen不早于发布；物理屏幕显示需另行验收。
- 巡检日志/持久告警状态更新；模拟错误、恢复各记录一次，反复巡检不产生重复首次告警。
- 下一次北京时间01:00后，云端自行补齐新的次日内容。完成这个跨日验收，才可以宣称长期自动补齐已验收。

主机不会再需要运行任何launchctl/终端。下一日是内容准备的目标日期，01:00是触发检查的时间，不是承诺生图瞬时完成。

## 查看云端状态与回滚

日志：SCF函数详情 → 日志查询。查询密久状态可运行仓库脚本 `node --env-file=你的私有配置文件 scripts/inspect-ritual-cloud.mjs`，它仅输出游标时间、告警和所选账户的两日日期及回报摘要，不打印密钥。

遇到问题：先禁用两个SCF触发器，等正在执行的实例结束，确认无云端写任务后，在Mac恢复：

```sh
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.playmath.ritual-worker.plist"
```

保留EdgeOne内的任务、包和绑定，不清空存储。不同时运行云端与本机两个写入者。镜像回滚使用上一稳定提交SHA/digest。

## 官方依据

- Job镜像/无服务器任务：https://cloud.tencent.com/document/product/583/138985
- 镜像数据字段（Job ImagePort=-1）：https://cloud.tencent.com/document/api/583/17244
- 超时900秒等配额：https://cloud.tencent.com/document/product/583/11637
- 函数最大独占配额：https://cloud.tencent.com.cn/document/api/583/51245
- 定时触发器Cron：https://intl.cloud.tencent.com/zh/document/product/583/9708
