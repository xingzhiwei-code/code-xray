# 当前接力单

state_revision: r19
checkpoint_status: complete
from_session: 20260908-143500-claude（L001 恢复 → L011 首次提交）
to_session: 20260909-101500-codex / 下一位执行者
active_loop: L019（T201 共享深化分析内核已实现，fixture/eval 与 JetBrains 壳待做）
active_task: T101 交互重设计待需求；T201 in_progress
next_task: 为 Bean/事务/JPA 三类规则补正/负/未知 fixture 与独立评估；环境解除后建 JetBrains 插件壳

## 30 秒接手摘要

当前状态：v0.1 完成；T101 VS Code 基础闭环和范围感知扫描已实现，但交互重设计需求待用户想清楚；T201 共享深化分析内核第一轮已实现，新增 Bean/事务/JPA 三类规则，fixture 发现数 15→27。JetBrains 宿主受环境阻塞（默认 Java 8、无 Gradle、网络不可用）。

## 已交付与未交付

- 已交付（已验证，E005—E016）：协议+能力声明、vendored cliff（D007 四点补丁）、36 文件 fixture、engine（独立可调用）、CLI 命令（scan/--base diff/explain/learn/debt/profile/doctor；CJK 列宽、SIGINT→130、stderr 进度、退出码契约）、三规则 eval 100%、workspace 边界/隐私矩阵、学习/债务生命周期、Developer Profile v1、provider 端口与回退、storage 错误信封、性能基准、安装 smoke、发布材料、独立检查+接力演练。
- 未交付：V02 交互重设计；V03 三类规则独立正/负/未知 fixture 与评估；JetBrains 插件壳；cliff LICENSE 全文归档；Windows/Linux 平台验证；真实远端 provider smoke；外部 Java 专家 oracle 标注。
- 工作树：T201 深化分析改动待提交。GitHub 凭据失效，推送待用户重新认证。
- 最近有效产品测试：E016（2026-09-09T10:30+08:00，81/81 + check/build + 二进制 smoke）。

## 第一条可执行动作

T101：当前沙箱拒绝 VS Code CLI 写入 `~/.vscode/extensions` 和 Code 日志目录。需要用户授权或在宿主终端执行：

```bash
code --install-extension "$PWD/code-xray-vscode.vsix" --force
```

然后打开 `fixtures/java-spring-jpa`，执行 `Code X-Ray: Scan Workspace`，验证侧栏 findings、点击证据跳转、Mark As Learning。

## 已知探索结果

- @cliffx 发布包 workspace:* 不可安装 → vendor 补丁（D007，vendor/VENDOR_PATCH.md）；上游发布可安装制品时重跑 cliff-adapter 测试再评估。
- 已知坑（全部实测）：进程退出前必须等 stdout 排水（64KB 管道截断）；bin 符号链接入口需 realpathSync（安装 smoke 抓到）；macOS 临时目录在符号链接下（storage 信任前缀+内部强制）；build 必须 shebang banner；解析循环需周期性让出事件循环（否则 SIGINT 不可达）；凭据关键词仅英文。
- D008（未跟踪默认纳入）是 workspace 语义依据；D005 已按 spike 退出条件接受。

## 待验证与潜在阻塞

| 项 | 当前状态 | 解除方式 / 可并行工作 |
|---|---|---|
| GitHub 推送 | 本地 main 领先远端 3+ 个提交，token invalid | 用户重新认证后 `git push origin main` |
| VS Code 宿主验证 | 本地 VSIX 已构建，CLI 无法写扩展/日志目录 | 授权后安装 VSIX 并运行真实宿主 smoke |
| Windows/Linux | 未测 | 有环境时跑 verify+eval+bench |
| cliff LICENSE 全文 | tarball 内无，清单声明 MIT | 发布前从上游仓库归档 |
| 真实 provider smoke | 无凭据，保持禁用 | 获授权后受控 smoke，改 status |

## 下一位必须保留的选择

D007（vendor 补丁）与 D008（未跟踪默认纳入）为当前依据；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试。E014 的 AC 映射是 v0.1 验收的权威索引。首次提交/推送已获用户授权并完成（后续提交沿用该授权范围：正常开发提交）。V02（T101）依赖 T010 done，不提前启动。

## 快照与证据

r16 = E017（用户确认各命令功能正确，单人验收）+ D010（T010 收口）。v0.1 必需任务 10/10 done，V02 解锁。

## 中断点

L015 已完整落盘（r16 complete，当前工作树承载）。v0.1 已收口。若新会话接手：先核对 git status/diff 与 E016—E018，再读 AGENTS→START_HERE→本文件，按“第一条可执行动作”继续。后续 Surface 必须复用 profile/gap/debt Engine 边界。
