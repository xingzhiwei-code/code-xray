# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r27 |
| checkpoint_status | complete |
| updated_at | 2026-09-25T18:10+08:00（T302 Review Insight Layer v0.2 完成，E034） |
| project | Code X-Ray |
| phase | v0.4 Agent Integration 收口期 + 领域信息架构增强（T302 done；T301d 仅剩 Codex 实测，用户指示搁置） |
| implementation_status | in_progress（T302 done；T301a/b/c done；T301d 仅剩 Codex 第二宿主实测——搁置） |
| progress | v0.1 必需任务 10/10 done（T001—T010）；T011 done；T101/T201 in_progress 挂起；T301 in_progress；T302 done（计划 Phase 1—9 + DoD 22/22） |
| active_task | 无进行中任务（T302 已收口；T301d 等待 Codex 上游恢复） |
| active_loop | L026（已收口，E034） |
| next_task | Codex 上游恢复后 codex exec 双轮闭环（V04-1 收口唯一缺口）→ 更新 V04_ACCEPTANCE → T301 done；等待期间可选项：独立 Checker 复查 T302 变更集 / CLI·VSCode review 视图（复用 renderReviewPresentation）/ V03-2 评估债回补 / T101 交互重设计需求 |
| session_owner | 20260925-claude-t302 |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / r27 提交链（a1df029→77c4701→31f76a0→630f57d→43771bb→3ff36ee→7a65cf0→docs/state r27）；GitHub 推送仍阻塞（token invalid） |
| worktree_state | r27 全部改动已提交；无未跟踪遗留 |
| last_product_verification | E034（T302：verify 0，158/158（20 文件），oracle 通过，bench cold 0.90s/hot 0.84s/peak 335.5MiB；before/after checks 12→3、debt 24.0→7.0）；E033（hook opt-in + 独立 Checker）；E032（宿主闭环） |
| package_evidence | E005—E017 v0.1 产品证据链完整；E019—E026 V02/V03 进行中；E027—E033 T301a/b/c/d + V04_ACCEPTANCE 映射；E034 T302 |
| blockers | Codex CLI 上游代理 502（V04-1 唯一缺口，用户指示搁置）；JetBrains 壳环境阻塞（挂起）；GitHub 推送 token invalid |

## 唯一下一步

**T302 已收口（E034），当前无进行中开发任务。** 主线等待项不变：Codex 上游代理恢复后（探测：`codex exec "reply PONG" --skip-git-repo-check`），按 HANDOFF 流程执行 T301d 双轮闭环 → V04-1 passed → T301 done。等待期间可选（按价值排序）：① 独立 Checker（全新上下文）复查 T302 变更集（对照计划 §21 禁止项与 §28 DoD）；② CLI/VSCode review 视图复用 packages/insights/presentation.ts；③ V03-2 评估债回补（D012 挂起项）；④ T101 交互重设计（待用户需求）。

## required_reads

- [项目宪法](../CONSTITUTION.md)、[Loop 协议](../LOOP_PROTOCOL.md)、[接力协议](../HANDOFF_PROTOCOL.md)
- T302 相关：[实施计划（含实施记录 §27）](../plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md)、[DECISIONS D013](DECISIONS.md)、[EVIDENCE E034](EVIDENCE.md)
- T301d 相关：[PRD 第 8.5 节](../PRD.md)（V04-1—V04-4）、[V04_ACCEPTANCE](V04_ACCEPTANCE.md)、[ARCHITECTURE §3/§4/§7/§11](../ARCHITECTURE.md)
- 代码：packages/insights/{types,engine,review,presentation}.ts、packages/protocol/index.ts（Review 0.2 + assertReviewRecord）、packages/learning/{types,engine}.ts（ConceptKnowledgeState + debt v2）、apps/agent/host/bridge.ts、apps/cli/index.ts（debt 渲染）、tests/{insight-baseline,insights,review-presentation,review-acceptance,agent-review,agent-contract,learning}.test.ts

## 当前已知事实与限制

- Review 输出为 schema 0.2：output.overview/insights/resolvedInsights/coverageSummary 是主要消费面；v0.1 字段保留为 deprecated 钻取明细；suggestedChecks 每 Insight 一条（insightId 关联）；结果附确定性 presentation（读取时渲染，不落盘）。
- 存量 0.1 review 记录版本化读取：原样返回 + legacy presentation 标记，不迁移、不回填 Insight；同快照幂等复用旧记录同样原样返回。
- Cognitive Debt 为 debt-model-v2（概念级 + 非线性暴露：exposureFactor=1+min(0.5, log2(n)×0.15)）；学习状态存储格式未变（无数据迁移）；v1/v2 总数值跨版本不可直接比较（modelVersion 可辨）。
- 概念状态聚合 precedence：stale > verified > self-reported > learning > to-learn > unassessed（顺序无关、有测试）；verified 概念在新位置再现保持 known（Case 3）；new-to-user 仅在"此前无绑定 + 本轮新增"时使用。
- Insight 覆盖范围 = diff 事实层（仅触达变更文件的 finding）；resolved 证据 evidenceScope='baseline'，不能经 xray_evidence 在目标报告回源；occurrence-increase 升级不做推断（事实不足）。
- gate 语义零变化：partial/unknown/failed ≠ pass；blocking 仅 XRAY_AGENT_GATE=enforce；幂等 reused/stale 降级行为与 r26 一致，全部有测试。
- analyzer 未动（冻结 oracle eval 通过，precision/recall 无退化）；所有规则 severity 仍为 medium——importance 区分度主要来自 changeType/knowledgeStatus。
- Agent Surface 其余事实（8 工具、envelope、注入遏制、隐私边界、离线保证）延续 r26 记录；注入遏制契约已扩展到 insights/presentation 通道。

## 继续开发时不要重复

不要重写 PRD/架构文档；不要把 v0.1 记录"迁移"成 0.2（版本化读取是决策，D013）；不要在 MCP tools/bridge 层重新实现聚合、gate 或债务公式（领域在 packages/insights 与 packages/learning）；不要让 presentation 落盘或成为事实来源；不要调 importance/exposure 常量而不带测试与记录；不要用 LLM 替代确定性 Insight 内容（增强只能建立在结构化层上，D013 revisit_when）；不要把 occurrence 数量当线性债务回退；不要动 buildDiff/finding identity（§17 事实层）；不要未经授权 git push；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试；未来 Surface 不得复制 profile/gap/debt/insight 计算逻辑。
