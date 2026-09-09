# 当前接力单

state_revision: r14
checkpoint_status: complete
from_session: 20260908-143500-claude（L001 恢复 → L011 首次提交）
to_session: 20260909-101500-codex / 下一位执行者
active_loop: 无（L012 已完成；AC12 结果信息待确认）
active_task: T010 in_progress（机器可验项 100% 完成；用户已报告试用，结果细节不足）
next_task: 确认试用人数与完成结果 → 更新 E017 → 判定 T010

## 30 秒接手摘要

v0.1 功能完备：9/10 done + T010 仅剩 AC12 结果确认。完整闭环（scan→证据→--base diff→explain→学习卡→验证→认知债务→二次启动恢复）经真实二进制验证；冻结 oracle 三规则 precision/recall 100%；AC12 性能达标；安装 smoke 通过。r13 新增 T011 Developer Profile v1（本机全局画像 + 画像化 Knowledge Gap + CLI profile 命令），E016 81/81 测试与二进制 smoke 通过。用户已报告“测试过了”（E017），但当前缺少样本数、完成结果与是否到达证据查看；**不能据此宣称 AC12 通过。**

## 已交付与未交付

- 已交付（已验证，E005—E016）：协议+能力声明、vendored cliff（D007 四点补丁）、36 文件 fixture、engine（独立可调用）、CLI 命令（scan/--base diff/explain/learn/debt/profile/doctor；CJK 列宽、SIGINT→130、stderr 进度、退出码契约）、三规则 eval 100%、workspace 边界/隐私矩阵、学习/债务生命周期、Developer Profile v1、provider 端口与回退、storage 错误信封、性能基准、安装 smoke、发布材料、独立检查+接力演练。
- 未交付：AC12 试用结果细节（4/5 样本与证据查看完成情况）；cliff LICENSE 全文归档（tarball 无，清单声明 MIT）；Windows/Linux 平台验证；真实远端 provider smoke（保持 unverified-remote 禁用）；外部 Java 专家 oracle 标注（独立 Checker 已复核标签-源码一致性）；V02/V03/V04（T101/T201/T301 planned）。
- 工作树：功能提交 bd26abe、状态提交 4b1fd41 均已完成；本地领先 origin/main 2 个提交。GitHub 凭据失效，`git push origin main` 因无法读取用户名失败（gh auth status 显示 token invalid），推送待用户重新认证。
- 最近有效产品测试：E016（2026-09-09T10:30+08:00，81/81 + check/build + 二进制 smoke）。

## 第一条可执行动作

等待用户补充：几人完成 scan→explain→learn，几人在 3 分钟内到达证据查看；结果更新 E017 后判定 T010。若 ≥4/5 达成则 T010 → done；否则记录失败点并修复。

## 已知探索结果

- @cliffx 发布包 workspace:* 不可安装 → vendor 补丁（D007，vendor/VENDOR_PATCH.md）；上游发布可安装制品时重跑 cliff-adapter 测试再评估。
- 已知坑（全部实测）：进程退出前必须等 stdout 排水（64KB 管道截断）；bin 符号链接入口需 realpathSync（安装 smoke 抓到）；macOS 临时目录在符号链接下（storage 信任前缀+内部强制）；build 必须 shebang banner；解析循环需周期性让出事件循环（否则 SIGINT 不可达）；凭据关键词仅英文。
- D008（未跟踪默认纳入）是 workspace 语义依据；D005 已按 spike 退出条件接受。

## 待验证与潜在阻塞

| 项 | 当前状态 | 解除方式 / 可并行工作 |
|---|---|---|
| AC12 用户试用 | 用户报告已试用，结果细节不足 | 补充人数与完成结果 → 更新 E017 |
| Windows/Linux | 未测 | 有环境时跑 verify+eval+bench |
| cliff LICENSE 全文 | tarball 内无，清单声明 MIT | 发布前从上游仓库归档 |
| 真实 provider smoke | 无凭据，保持禁用 | 获授权后受控 smoke，改 status |

## 下一位必须保留的选择

D007（vendor 补丁）与 D008（未跟踪默认纳入）为当前依据；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试。E014 的 AC 映射是 v0.1 验收的权威索引。首次提交/推送已获用户授权并完成（后续提交沿用该授权范围：正常开发提交）。V02（T101）依赖 T010 done，不提前启动。

## 快照与证据

r14 = E017（用户报告已试用，结果细节不足）。产品证据链：E005→…→E015→E016→E017。更新 E017 后判定 T010。

## 中断点

L012 已完整落盘（r13 complete，当前工作树承载）。无未完成代码变更。唯一开放项为 AC12 试用结果细节。若新会话接手：先核对 git status/diff 与 E016/E017，再读 AGENTS→START_HERE→本文件，按“第一条可执行动作”继续。后续 Surface 必须复用 profile/gap/debt Engine 边界。
