# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r16 |
| checkpoint_status | complete |
| updated_at | 2026-09-09T11:15+08:00（用户确认功能正确，T010 done） |
| project | Code X-Ray |
| phase | v0.1 CLI 完成，V02 准备就绪 |
| implementation_status | complete（v0.1 必需任务 10/10 done；V02 未开始） |
| progress | v0.1 必需任务 10/10 done（T001—T010）；T011 done（Developer Profile v1）；任务非等量 |
| active_task | 无 |
| active_loop | 无 |
| next_task | T101 V02：创建 VS Code Surface，复用同一 Engine/Profile/Debt，先做安装与环境自检 → 侧栏最小报告 → 证据跳转/解释/学习闭环 |
| session_owner | 20260909-101500-codex |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / 4b1fd41（T011 与状态回填均已提交） |
| worktree_state | 本地领先远端 2 个提交；GitHub 凭据失效，推送阻塞；node_modules/dist/.idea/.DS_Store 已由 .gitignore 排除 |
| last_product_verification | E016：81/81 测试 + check/build + Developer Profile 二进制 smoke；E017：用户确认各命令功能正确（单人验收） |
| package_evidence | E005—E017 产品证据链完整（…→故障注入+首次提交→Developer Profile v1→用户验收）；E001—E004 文档 |
| blockers | GitHub 推送阻塞：本地 main 领先 origin/main 3 个提交（另有本条状态更新待提交），gh token invalid，需重新认证 |

## 唯一下一步

**T010 已完成**：用户本人确认“验证可以了，各个命令功能都正确”（E017），按 D010 以单人验收收口；不得对外声称 4/5 样本调查通过。**下一步：T101 V02 VS Code Surface**。远端推送需先运行 `gh auth login -h github.com`，再 `git push origin main`。

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
