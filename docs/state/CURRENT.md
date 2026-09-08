# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r12 |
| checkpoint_status | complete |
| updated_at | 2026-09-08T17:40+08:00（L011 故障注入测试 + 首次提交推送执行） |
| project | Code X-Ray |
| phase | v0.1 CLI / 功能完备，待用户试用与发布授权 |
| implementation_status | in_progress（仅 T010 的用户试用与发布操作） |
| progress | v0.1 必需任务 9/10 done（T001—T009）；T010 in_progress（机器可验项全部完成，仅剩真人试用）；任务非等量 |
| active_task | T010（Human Gate：仅剩 AC12 用户试用） |
| active_loop | 无（等待用户试用） |
| next_task | 用户执行 3 分钟无指导试用（scan→explain→learn）→ E016 → T010 done |
| session_owner | 20260908-143500-claude |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / 首次提交（本 r12 checkpoint 的内容；SHA 见 git log，远端 origin=github.com/xingzhiwei-code/code-xray） |
| worktree_state | 首次提交后应清洁；node_modules/dist/.idea/.DS_Store 已由 .gitignore 排除 |
| last_product_verification | E015：75/75 测试（含 SNAPSHOT_CHANGED 故障注入）+ 全套验证绿 + 首次提交推送（2026-09-08T17:40+08:00） |
| package_evidence | E005—E015 产品证据链完整（…→发布映射+独立检查→故障注入+首次提交）；E001—E004 文档 |
| blockers | Human Gate（仅剩一项）：AC12 真实用户试用未执行；git commit 已授权并完成 |

## 唯一下一步

**唯一剩余验收**：AC12 真实用户试用——3 分钟无指导（仅凭 README）完成 `xray scan <项目>` → `xray explain 1` → `xray learn`，是否到达证据查看（目标 ≥4/5）。结果记 E016 后 T010 → done，v0.1 收官。之后可选：开始 V02（T101 VS Code）。SNAPSHOT_CHANGED 故障注入测试已完成（E015）。

## required_reads

- [项目宪法](../CONSTITUTION.md)、[Loop 协议](../LOOP_PROTOCOL.md)、[接力协议](../HANDOFF_PROTOCOL.md)
- [BACKLOG](BACKLOG.md) 的 T010 与后续 Surface 任务
- [README.md](../../README.md)（产品使用说明）、[NOTICE.md](../../NOTICE.md)、[SUPPORT.md](../SUPPORT.md)
- 代码：packages/{protocol,engine,analyzer-java,workspace-local,storage-local,learning,explanation-providers}、apps/cli、tests/×9、evals/

## 当前已知事实与限制

- v0.1 功能闭环完整可用：扫描→证据→diff→explain→学习卡→验证→认知债务→二次启动恢复，全部经真实二进制与 75 项测试验证；冻结 oracle 上三规则 precision/recall 100%、unknown 零泄漏（独立 Checker 复核）。
- AC12 性能达标（100 文件/20,000 非空行：冷 1.04s/热 0.96s/331.1MiB，macOS arm64）；安装 smoke 通过（含 bin 符号链接 bug 修复）；SNAPSHOT_CHANGED 检测路径已经故障注入测试（E015）。
- T010 遗留（不阻塞试用）：真实用户试用未执行（Human Gate）；cliff LICENSE 全文需发布前归档；Windows/Linux 未测；真实远端 provider 保持 unverified-remote 禁用；oracle 标签为实现者制定（独立 Checker 已复核标签-源码一致性，外部专家标注未做）。
- 凭据检测/脱敏关键词仅英文（password/secret/api key/token/sk-）——已在 SUPPORT.md 声明。
- 默认离线、隐私优先在所有路径成立（独立 Checker 确认报告无源码/学习状态泄漏、bundle 无多余网络调用点）。

## 继续开发时不要重复

不要重写 PRD/架构文档；不要把磁盘实现当未验证（E005—E014 已覆盖）；不要用 mock cliff 或 mock provider 冒充真实集成；不要在未招募用户时宣称 AC12 试用通过；不要未经授权 git commit；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试。
