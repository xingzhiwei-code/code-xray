# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r29 |
| checkpoint_status | complete |
| updated_at | 2026-09-30T18:45+08:00（T303 done：Developer Context & Relevance Gate v1，E036/D015/L028） |
| project | Code X-Ray |
| phase | v0.4 Agent Integration 完成（T301 done）+ 领域信息架构增强（T302 done）+ 相关性门（T303 done） |
| implementation_status | v0.1 完成；V02/V03 遗留项按 D012 挂起；T301/T302/T303 done；无进行中任务 |
| progress | v0.1 必需任务 10/10 done（T001—T010）；T011 done；T101/T201 in_progress 挂起；T301 done；T302 done；T303 done（计划 Phase 1—8 + DoD 25/25） |
| active_task | 无进行中任务 |
| active_loop | L028（已收口，E036） |
| next_task | 无必需项。可选（按价值排序）：① 宿主内 LLM 自主调用 xray_relevance 实测（Claude Code/Codex，同 E032/E035 模式，需用户环境）；② T303 独立 Checker 复查；③ CLI/VSCode review 视图（复用 renderReviewPresentation）；④ V03-2 评估债回补（D012 挂起项）。审计触发项：D014/D015 revisit_when 满足时按记录补跑 |
| session_owner | 20260930-claude-t303 |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / r29（f37fd16→314bd73→9f04770→f01b5cf→f237682→状态收口提交）；GitHub 推送仍阻塞（token invalid） |
| worktree_state | r29 全部改动已提交；无未跟踪遗留 |
| last_product_verification | E036（T303：verify 0、235/235（26 文件）、oracle 逐字节零回归、bench 达标、真实二进制 Case A—E + skip wire 253B vs scan 17059B=67.4×）；E035（Codex 宿主收口）；E034（T302 Insight Layer） |
| package_evidence | E005—E017 v0.1 产品证据链完整；E019—E026 V02/V03；E027—E033 T301a/b/c/d + V04 映射；E034 T302；E035 Codex 宿主；E036 T303 |
| blockers | JetBrains 壳环境阻塞（挂起）；GitHub 推送 token invalid；宿主 LLM 实测需用户环境；无产品收口阻塞 |

## 唯一下一步

**T301/T302/T303 均已收口（E035/E034/E036），当前无进行中开发任务、无必需下一步。** 若用户提出新需求，按 HANDOFF"第一条可执行动作"的可选项排序执行（宿主 relevance 实测 → 独立 Checker → CLI/VSCode review 视图 → V03-2 评估债）。若未来审计出现 D014（Codex explain/evidence/removed）或 D015（第二语言 analyzer/宿主消费偏差/常量调整）revisit_when 情形，按对应记录补跑，不得以"已 done"抗辩。

## required_reads

- [项目宪法](../CONSTITUTION.md)、[Loop 协议](../LOOP_PROTOCOL.md)、[接力协议](../HANDOFF_PROTOCOL.md)
- T303 相关：[计划文件（docs/plans/CODE_XRAY_T303_DEVELOPER_CONTEXT_RELEVANCE_GATE_V1_PLAN.md）](../plans/CODE_XRAY_T303_DEVELOPER_CONTEXT_RELEVANCE_GATE_V1_PLAN.md)、[DECISIONS D015](DECISIONS.md)、[EVIDENCE E036](EVIDENCE.md)、[E036 转录](../../artifacts/evidence/E036/relevance-gate-transcript.md)
- T302 相关：[实施计划（含实施记录 §27）](../plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md)、[DECISIONS D013](DECISIONS.md)、[EVIDENCE E034](EVIDENCE.md)
- 架构与代码：[ARCHITECTURE §3/§4/§7/§11](../ARCHITECTURE.md)；packages/relevance/{types,rules,engine,service}.ts、packages/developer-profile/{types,engine}.ts（context v2 段）、packages/insights/*、packages/learning/*、packages/storage-local/index.ts（relevance-log）、apps/agent/{host/bridge.ts,host/mcp.ts,tools/index.ts}、apps/cli/index.ts（relevance/profile 命令）、tests/{developer-context,relevance-gate,relevance-service,relevance-cli,agent-relevance,relevance-acceptance}.test.ts

## 当前已知事实与限制

- Relevance Gate 为确定性规则（relevance-rules-v1）：无 LLM/随机/时钟读取（now 注入）；§22 场景表 14/14 有测试；critical 词默认 FULL，唯一降级通道=映射概念全部 verified+小变更+无近期修正；routine-class SKIP 由任务类别驱动，self-reported 技能声明永不单独驱动 SKIP；近期修正（30 天窗口）全局否决 SKIP；未知上下文降级 LIGHT 不降 SKIP。
- Developer Context（developer-context-v1）：同一文件 developer/profile.json 承载 v1|v2；版本化读取+写时升级；迁移幂等、evidence id/kind/summary 全保留；自述 level→self-reported+low，legacyLevel/legacyConfidence 保 T011 knowledgeGaps 逐字段零回归（toLegacyProfileView，测试锁定 deep-equal）。
- SkillAssessment 无任何数值评分字段（§3.3 测试断言）；profileSignal 冻结为 legacy 排序信号，Gate 不消费（D015-2）。
- 被动观察只存聚合计数+首见证据：观察来源=报告事实（java/spring/jpa）与 relevance 调用 changedFiles/projectContext（snapshot 仅收 .java——前端熟悉度只在 gate 被调用时积累，冷启动前期 LIGHT，符合 §12）；存储中不出现文件名/任务原文（测试断言）。
- 决策日志 workspaces/<id>/relevance-log.json（0600、有界 500、任务只存 sha256 指纹、deleteData('relevance'|'all') 可清除）；false-skip 信号=最近一条 skip 决策后分析发现新增风险时追加一次（事实，不推断、不打断流程）。
- 指标：skipRate/falseSkipRate 为事实统计；useful-analysis-rate v1 不估算并显式标注（§24.4 诚实）；token 影响为实测（skip wire 253B vs scan envelope 17059B=67.4×，E036）。
- MCP 工具面 8→9（xray_relevance 列于 capabilities 后）；scan/review_start 描述与 server instructions 已改为"先问门，常规低风险不做完整分析"；tools/list 精确断言已更新。
- 审查关口（gate）语义零变化：partial/unknown/failed ≠ pass；blocking 仅 XRAY_AGENT_GATE=enforce；Insight/Debt v2/analyzer 全部未动（oracle 结果文件逐字节一致）。
- 注入遏制扩展到 relevance 通道：task 文本按封闭词表匹配，reasons/targets 不回显原文（测试锁定）；envelope/错误语义/1MB 上限等契约延续 r26—r28 记录。
- 双宿主实测事实（E032/E035）与 Codex 三坑延续 r28 记录；宿主内 LLM 自主调用 xray_relevance 的真实会话未跑（需用户环境，非阻塞）。

## 继续开发时不要重复

不要重写 PRD/架构文档；不要把 relevance 判定逻辑复制进 MCP tools/bridge/CLI（组合只在 packages/relevance/service.ts，规则只在 packages/relevance/{rules,engine}.ts）；不要在 Gate 里引入 LLM/随机/系统时钟（decideRelevance 必须保持纯函数，确定性有测试）；不要把 self-reported 声明升级为 verified/observed（provenance 只能来自真实证据事件）；不要让 observation 存逐事件证据或文件名（聚合计数是设计，§17）；不要动 toLegacyProfileView 的"仅 legacyLevel 参与"边界（T011 零回归靠它）；不要调 freshness/修正窗口/观察阈值常量而不带测试与记录（D015 revisit_when）；不要让 skip 输出变大或携带完整分析（quiet 契约有 wire 字节断言）；不要把 v0.1 review 记录"迁移"成 0.2（D013）；不要在未跑宿主实测时宣称"宿主 LLM 已自主消费 relevance"；不要重跑 scripts/demo-t303-relevance.mjs 而不注意其覆写 artifacts/evidence/E036/ 转录；不要未经授权 git push；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试；未来 Surface 不得复制 profile/gap/debt/insight/relevance 计算逻辑。
