# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r19 |
| checkpoint_status | complete |
| updated_at | 2026-09-11T10:15+08:00（T201 V03 深化分析内核第一轮） |
| project | Code X-Ray |
| phase | v0.3 JetBrains / 共享深化分析内核 |
| implementation_status | in_progress（T101 交互待重设计；T201 深化分析内核已实现，评估与 JetBrains 壳待做） |
| progress | v0.1 必需任务 10/10 done（T001—T010）；T011 done（Developer Profile v1）；任务非等量 |
| active_task | T201（V03 共享深化分析） |
| active_loop | L019（三类深化规则实现完成，fixture/eval 与 JetBrains 壳待做） |
| next_task | 为 Bean/事务/JPA 三类规则补正例、反例、未知 fixture → 独立评估 → JetBrains 插件壳（需 JDK17/Gradle/网络） |
| session_owner | 20260909-101500-codex |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / 64638e7（V02 范围扫描已提交；T201 深化分析待提交） |
| worktree_state | T201 相关实现/测试/文档改动待提交；GitHub 凭据失效，推送阻塞；node_modules/dist/.idea/.DS_Store 已由 .gitignore 排除 |
| last_product_verification | E016：81/81 测试 + check/build + Developer Profile 二进制 smoke；E017：用户确认各命令功能正确（单人验收） |
| package_evidence | E005—E017 产品证据链完整（…→故障注入+首次提交→Developer Profile v1→用户验收）；E001—E004 文档 |
| blockers | JetBrains 宿主开发受环境阻塞（默认 Java 8、无 Gradle、网络不可用）；V02 交互重设计需求待用户想清楚；GitHub 推送仍因 token invalid 阻塞 |

## 唯一下一步

**T201 已进入共享深化分析**：新增 Bean 候选/注入关系、事务边界、JPA 持久化上下文三类规则，当前 fixture 发现数 15→27，直接改善“扫描不够深”的问题。V02 交互重设计暂挂，等用户想清楚；JetBrains 壳受 JDK/Gradle/网络环境阻塞。

## required_reads

- [项目宪法](../CONSTITUTION.md)、[Loop 协议](../LOOP_PROTOCOL.md)、[接力协议](../HANDOFF_PROTOCOL.md)
- [BACKLOG](BACKLOG.md) 的 T010 与后续 Surface 任务
- [BACKLOG](BACKLOG.md) 的 T011、[DECISIONS](DECISIONS.md) 的 D009（Developer Profile）
- [README.md](../../README.md)（产品使用说明）、[NOTICE.md](../../NOTICE.md)、[SUPPORT.md](../SUPPORT.md)
- 代码：packages/{protocol,engine,analyzer-java,workspace-local,storage-local,learning,developer-profile,explanation-providers}、apps/cli、tests/×12、evals/

## 当前已知事实与限制

- v0.1 功能闭环完整可用：扫描→证据→diff→explain→学习卡→验证→认知债务→二次启动恢复，全部经真实二进制验证；冻结 oracle 上三规则 precision/recall 100%、unknown 零泄漏（独立 Checker 复核）。当前快照含 T011 后共 81/81 测试通过（E016）。
- T011 新增 Developer Profile v1：本机全局角色/技能/证据模型，`xray profile show/init/update`；Knowledge Gap 结合当前代码所需技能、开发者画像与项目学习状态；画像缺失时保持可用并显式“未评估”；不改变代码发现、已验证学习事实或退出码。
- AC12 性能达标（100 文件/20,000 非空行：冷 1.04s/热 0.96s/331.1MiB，macOS arm64）；安装 smoke 通过（含 bin 符号链接 bug 修复）；SNAPSHOT_CHANGED 检测路径已经故障注入测试（E015）。
- T010 验收：用户本人确认各命令功能正确（E017，单人验收）。遗留发布前事项：cliff LICENSE 全文归档、Windows/Linux 未测、真实远端 provider 保持 unverified-remote 禁用、外部 Java 专家 oracle 标注未做。
- 凭据检测/脱敏关键词仅英文（password/secret/api key/token/sk-）——已在 SUPPORT.md 声明。
- 默认离线、隐私优先在所有路径成立（独立 Checker 确认报告无源码/学习状态泄漏、bundle 无多余网络调用点）。

## 继续开发时不要重复

不要重写 PRD/架构文档；不要把磁盘实现当未验证（E005—E016 已覆盖）；不要用 mock cliff 或 mock provider 冒充真实集成；不要把“用户说测试过了”直接写成 AC12 通过；不要未经授权 git commit；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试；未来 Surface 不得复制 profile/gap/debt 计算逻辑。
