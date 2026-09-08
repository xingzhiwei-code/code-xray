# 当前接力单

state_revision: r12
checkpoint_status: complete
from_session: 20260908-143500-claude（L001 恢复 → L011 首次提交）
to_session: 20260908-143500-claude / 下一位执行者
active_loop: 无（Human Gate：仅剩用户试用）
active_task: T010 in_progress（机器可验项 100% 完成；仅剩 AC12 真人试用与发布操作授权）
next_task: 用户试用 → E016 → T010 done；或开始 V02（T101）

## 30 秒接手摘要

v0.1 功能完备：9/10 done + T010 仅剩用户试用；已首次提交并推送至 github.com/xingzhiwei-code/code-xray（r12）。完整闭环（scan→证据→--base diff→explain→学习卡→验证→认知债务→二次启动恢复）经真实二进制与 73/73 测试验证；冻结 oracle 三规则 precision/recall 100%（独立 Checker 新上下文复核"有保留通过"，保留项已在 r11 修复）；AC12 性能达标（100 文件/20,000 行：冷 1.04s/热 0.96s/331.1MiB）；安装 smoke 通过。发布材料（README/NOTICE/SUPPORT）就绪。**剩余唯一功能项 = AC12 用户试用（≥4/5 无指导 3 分钟）——未执行不得宣称通过。** 提交/推送已由用户授权并完成。

## 已交付与未交付

- 已交付（已验证，E005—E014）：协议+能力声明、vendored cliff（D007 四点补丁）、36 文件 fixture、engine（独立可调用）、CLI 六命令（scan/--base diff/explain/learn/debt/doctor；CJK 列宽、SIGINT→130、stderr 进度、退出码契约）、三规则 eval 100%（E009+独立复核）、workspace 边界/隐私矩阵 18 用例、学习/债务生命周期（verified 跨扫描保留、债务手工复算）、provider 端口与回退（默认禁用、最小外发）、storage 错误信封 5 用例（损坏/版本/锁/脱敏/删除）、性能基准、安装 smoke、发布材料、独立检查+接力演练。
- 未交付：AC12 真实用户试用（Human Gate）；SNAPSHOT_CHANGED 混沌检查（竞态无法确定性单测，代码已审查）；cliff LICENSE 全文归档（tarball 无，清单声明 MIT）；Windows/Linux 平台验证；真实远端 provider smoke（保持 unverified-remote 禁用）；外部 Java 专家 oracle 标注（独立 Checker 已复核标签-源码一致性）；V02/V03/V04（T101/T201/T301 planned）。
- 工作树：首次提交后应清洁（.gitignore 排除 node_modules/dist/.idea/.DS_Store/*.tgz/.xray/artifacts/tmp）；状态文件 r12 已完成写入。
- 最近有效产品测试：E015（2026-09-08T17:40+08:00，75/75 + 提交推送）。

## 第一条可执行动作

等待用户：3 分钟无指导试用（仅凭 README 完成 scan→explain→learn）→ 结果记 E016 → T010 done。可选后续：V02（T101）、Windows/Linux 验证、cliff LICENSE 归档、真实 provider smoke（获授权后）。

## 已知探索结果

- @cliffx 发布包 workspace:* 不可安装 → vendor 补丁（D007，vendor/VENDOR_PATCH.md）；上游发布可安装制品时重跑 cliff-adapter 测试再评估。
- 已知坑（全部实测）：进程退出前必须等 stdout 排水（64KB 管道截断）；bin 符号链接入口需 realpathSync（安装 smoke 抓到）；macOS 临时目录在符号链接下（storage 信任前缀+内部强制）；build 必须 shebang banner；解析循环需周期性让出事件循环（否则 SIGINT 不可达）；凭据关键词仅英文。
- D008（未跟踪默认纳入）是 workspace 语义依据；D005 已按 spike 退出条件接受。

## 待验证与潜在阻塞

| 项 | 当前状态 | 解除方式 / 可并行工作 |
|---|---|---|
| AC12 用户试用 | 未执行（Human Gate） | 用户执行 → E016 |
| Windows/Linux | 未测 | 有环境时跑 verify+eval+bench |
| cliff LICENSE 全文 | tarball 内无，清单声明 MIT | 发布前从上游仓库归档 |
| 真实 provider smoke | 无凭据，保持禁用 | 获授权后受控 smoke，改 status |

## 下一位必须保留的选择

D007（vendor 补丁）与 D008（未跟踪默认纳入）为当前依据；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试。E014 的 AC 映射是 v0.1 验收的权威索引。首次提交/推送已获用户授权并完成（后续提交沿用该授权范围：正常开发提交）。V02（T101）依赖 T010 done，不提前启动。

## 快照与证据

r12 = E015（故障注入测试 + 首次提交推送，由 git commit 承载）。产品证据链：E005→…→E014→E015。下一条从 E016 分配（用户试用）。

## 中断点

L011 已完整落盘（r12 complete，随首次提交入库）。无未完成代码变更。唯一开放项为 AC12 用户试用（需真人）。若新会话接手：git log 查提交历史，读 AGENTS→START_HERE→本文件，按"第一条可执行动作"继续。
