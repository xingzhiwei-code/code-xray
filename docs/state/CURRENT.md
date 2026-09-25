# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r28 |
| checkpoint_status | complete |
| updated_at | 2026-09-25T19:05+08:00（T301 收口 done：Codex 第二宿主实测，E035/D014） |
| project | Code X-Ray |
| phase | v0.4 Agent Integration 完成（T301 done，V04-1—V04-4 全部 passed）+ 领域信息架构增强（T302 done） |
| implementation_status | v0.1 完成；V02/V03 遗留项按 D012 挂起；v0.4 T301/T302 done；无进行中任务 |
| progress | v0.1 必需任务 10/10 done（T001—T010）；T011 done；T101/T201 in_progress 挂起；T301 done（T301a/b/c/d 全 done）；T302 done（计划 Phase 1—9 + DoD 22/22） |
| active_task | 无进行中任务 |
| active_loop | L027（已收口，E035） |
| next_task | 无必需项。可选（按价值排序）：① CLI/VSCode review 视图（复用 packages/insights/presentation.ts 的 renderReviewPresentation）；② V03-2 评估债回补（D012 挂起项）；③ T101 交互重设计（需用户需求输入）。审计触发项：D014 revisit_when 满足时补跑 Codex 完整九步 |
| session_owner | 20260925-claude-t301d |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / r28（185246d 之上：docs/state+evidence r28 收口提交）；GitHub 推送仍阻塞（token invalid） |
| worktree_state | r28 全部改动已提交；无未跟踪遗留 |
| last_product_verification | E035（Codex CLI 宿主内 LLM 自主 MCP 调用六步双轮闭环：基线 ec46f53e… 跨宿主逐字符一致、finding_d133fd90… 与 E032 同 ID、gate report-only、旧审查 stale+incomplete）；E034（T302：verify 0，158/158（20 文件），oracle/bench 通过，checks 12→3、debt 24.0→7.0）；E033（hook opt-in + 独立 Checker）；E032（Claude 宿主闭环） |
| package_evidence | E005—E017 v0.1 产品证据链完整；E019—E026 V02/V03；E027—E033 T301a/b/c/d + V04 映射；E034 T302；E035 Codex 宿主收口 |
| blockers | JetBrains 壳环境阻塞（挂起）；GitHub 推送 token invalid；无产品收口阻塞 |

## 唯一下一步

**T301 已收口（E035/D014，V04-1—V04-4 全部 passed），T302 已收口（E034），当前无进行中开发任务、无必需下一步。** 若用户提出新需求，按 HANDOFF"第一条可执行动作"的可选项排序执行（CLI/VSCode review 视图 → V03-2 评估债 → T101 需求梳理）。若未来审计 V04 或 Codex 侧出现 explain/evidence/removed 相关缺陷，按 D014 revisit_when 补跑完整九步（codex exec 需 `--dangerously-bypass-approvals-and-sandbox`），不得以"V04-1 passed"抗辩。

## required_reads

- [项目宪法](../CONSTITUTION.md)、[Loop 协议](../LOOP_PROTOCOL.md)、[接力协议](../HANDOFF_PROTOCOL.md)
- T301 收口相关：[V04_ACCEPTANCE](V04_ACCEPTANCE.md)（V04-1 范围备注）、[DECISIONS D014](DECISIONS.md)、[EVIDENCE E035](EVIDENCE.md)、[E035 转录](../../artifacts/evidence/E035/codex-host-session-transcript.md)
- T302 相关：[实施计划（含实施记录 §27）](../plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md)、[DECISIONS D013](DECISIONS.md)、[EVIDENCE E034](EVIDENCE.md)
- 架构与代码：[ARCHITECTURE §3/§4/§7/§11](../ARCHITECTURE.md)；packages/insights/{types,engine,review,presentation}.ts、packages/protocol/index.ts（Review 0.2 + assertReviewRecord）、packages/learning/{types,engine}.ts（ConceptKnowledgeState + debt v2）、apps/agent/host/bridge.ts、apps/cli/index.ts（debt 渲染）、tests/{insight-baseline,insights,review-presentation,review-acceptance,agent-review,agent-contract,learning}.test.ts

## 当前已知事实与限制

- 双宿主实测均成立：Claude Code（E032 九步）与 Codex CLI（E035 六步）；跨宿主确定性直接证明——同一 fixture 基线 snapshotId（ec46f53e…）与同一修改的 finding ID（finding_d133fd90…）两宿主逐字符一致。
- V04-1 的 passed 带 D014 书面范围备注：Codex 侧未复跑 explain/evidence、removed 归因、跨会话幂等三个子步骤（同二进制其他证据覆盖）；备注不是缺陷隐藏，审计时按 revisit_when 补跑。
- Codex 宿主环境事实：headless `codex exec` 需 `--dangerously-bypass-approvals-and-sandbox` 才能调用 MCP 工具；`~/.codex/config.toml` 注册可能被外部工具重写丢失（用 `codex mcp list` 核对）；会话内服务器名规范化为 `code_xray`；依赖 CC Switch 本地代理（127.0.0.1:15721）存活。
- Review 输出为 schema 0.2：output.overview/insights/resolvedInsights/coverageSummary 是主要消费面；v0.1 字段保留为 deprecated 钻取明细；suggestedChecks 每 Insight 一条（insightId 关联）；结果附确定性 presentation（读取时渲染，不落盘）。
- 存量 0.1 review 记录版本化读取：原样返回 + legacy presentation 标记，不迁移、不回填 Insight；同快照幂等复用旧记录同样原样返回。
- Cognitive Debt 为 debt-model-v2（概念级 + 非线性暴露：exposureFactor=1+min(0.5, log2(n)×0.15)）；学习状态存储格式未变（无数据迁移）；v1/v2 总数值跨版本不可直接比较（modelVersion 可辨）。
- 概念状态聚合 precedence：stale > verified > self-reported > learning > to-learn > unassessed（顺序无关、有测试）；verified 概念在新位置再现保持 known（Case 3）；new-to-user 仅在"此前无绑定 + 本轮新增"时使用。
- Insight 覆盖范围 = diff 事实层（仅触达变更文件的 finding）；resolved 证据 evidenceScope='baseline'，不能经 xray_evidence 在目标报告回源；occurrence-increase 升级不做推断（事实不足）。
- gate 语义零变化：partial/unknown/failed ≠ pass；blocking 仅 XRAY_AGENT_GATE=enforce；幂等 reused/stale 降级行为与 r26 一致，全部有测试。
- analyzer 未动（冻结 oracle eval 通过，precision/recall 无退化）；所有规则 severity 仍为 medium——importance 区分度主要来自 changeType/knowledgeStatus。
- Agent Surface 其余事实（8 工具、envelope、注入遏制、隐私边界、离线保证）延续 r26/r27 记录；注入遏制契约已扩展到 insights/presentation 通道。

## 继续开发时不要重复

不要重写 PRD/架构文档；不要把 v0.1 记录"迁移"成 0.2（版本化读取是决策，D013）；不要在 MCP tools/bridge 层重新实现聚合、gate 或债务公式（领域在 packages/insights 与 packages/learning）；不要让 presentation 落盘或成为事实来源；不要调 importance/exposure 常量而不带测试与记录；不要用 LLM 替代确定性 Insight 内容（增强只能建立在结构化层上，D013 revisit_when）；不要把 occurrence 数量当线性债务回退；不要动 buildDiff/finding identity（§17 事实层）；不要在未补跑 Codex 完整九步时宣称"九步全量在 Codex 复现"（D014 范围备注）；不要重跑 scripts/demo-v04-double-loop.py 而不恢复 E031 产物；不要未经授权 git push；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试；未来 Surface 不得复制 profile/gap/debt/insight 计算逻辑。
