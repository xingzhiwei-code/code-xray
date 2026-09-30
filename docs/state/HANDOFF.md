# 当前接力单

state_revision: r29
checkpoint_status: complete
from_session: 20260930-claude-t303（L028 T303）
to_session: 下一位执行者
active_loop: L028 已收口（T303 Developer Context & Relevance Gate v1，E036/D015）
active_task: 无进行中任务；T301/T302/T303 done；T101/T201 按 D012 挂起
next_task: 无必需项。可选（按价值排序）：① 宿主内 LLM 自主调用 xray_relevance 实测；② T303 独立 Checker 复查；③ CLI/VSCode review 视图；④ V03-2 评估债回补

## 30 秒接手摘要

当前状态：v0.1 完成；V02/V03 遗留项按 D012 挂起；T302 done（E034）；T301 done（E035/D014）；**T303（用户提供计划驱动）本轮 done**——按 §30 先审计后实施，4 个产品提交小步推进：developer-profile 包原地演进为 developer-context-v1（provenance 5 值/freshness 30-180 天/迁移幂等且 evidence 全保留/自述 level→self-reported+low/correction 保留历史/preference 预留；toLegacyProfileView 使 T011 knowledgeGaps 对 v1 数据 deep-equal 零回归）；新领域包 packages/relevance（decideRelevance 纯函数，relevance-rules-v1，注入 now，无 LLM/随机；§22 场景表 14/14 测试；critical→FULL 唯一降级通道=概念全 verified+小变更+无近期修正；routine-class SKIP 由任务类别驱动；修正 30 天窗口全局否决 SKIP）；service.ts 单组合（观察聚合/决策日志/false-skip 事实信号/指标），bridge 与 CLI 零逻辑复制；MCP 第 9 工具 xray_relevance（skip envelope 实测 253B、quiet:true）+ scan/review_start/instructions 改为"先问门"；CLI xray relevance（--task/--files/--explain/--stats）+ profile correct/prefer；真实二进制演示 Case A—E 全过（E036：skip vs scan wire 67.4×、自述专家不 skip、修正后 3 条证据保留）。verify 0、235/235（26 文件，新增 69 用例）、oracle 逐字节零回归、bench 达标。期间修复一个真实缺陷（[null,at].sort() 把 lastObservedAt 置 null→freshness 假 stale）。零 T302/analyzer/审查关口语义改动。下一位按"第一条可执行动作"执行。

## 已交付与未交付

- 本轮交付（E036/D015，L028）：packages/developer-profile context v2 段；packages/relevance/{types,rules,engine,service}.ts；storage relevance-log（0600/有界 500/deleteData 'relevance'）；apps/agent xray_relevance + 描述/instructions + summarize kind=relevance + runScan/finishReview 观察与 false-skip 接线；apps/cli relevance/profile correct/prefer/上下文措辞；tests 6 新文件（developer-context/relevance-gate/relevance-service/relevance-cli/agent-relevance/relevance-acceptance）+ agent-mcp/profile-cli 断言更新；scripts/demo-t303-relevance.mjs；artifacts/evidence/E036/；README/SUPPORT/ARCHITECTURE/计划入库。
- 未交付（非阻塞可选项）：宿主内 LLM 自主调用 xray_relevance 实测（需 Claude Code/Codex 会话环境）；T303 独立 Checker 复查；CLI/VSCode review 视图（渲染器已备好）；V03-2 评估债（D012 挂起）；preference 管理 UI（§31.5 仅域模型+CLI）；hook（agent-review-hook.mjs）未接 relevance 前置判定（hook 是显式 opt-in 全量审查路径，语义上不过门——如需可加 XRAY_HOOK_GATE 选项，先立任务）。
- 工作树：r29 提交链 314bd73（Phase 1—3）→9f04770（Phase 5）→f01b5cf（Phase 4/6/7）→f237682（Phase 8+E036）→本状态收口提交。GitHub 推送仍因 token invalid 阻塞。
- 最近有效产品测试：E036（2026-09-30，verify 0/235-235 + oracle + bench + 二进制演示）；E035（2026-09-25，Codex 宿主）；E034（2026-09-25，T302）。

## 第一条可执行动作

无必需动作（T301/T302/T303 均 done）。若用户提出新需求按可选项排优先级：① 宿主 relevance 实测——Claude Code 会话内让 LLM 对"React Button loading"类任务自主调用 xray_relevance 并验证 skip 后不再 scan（同 E032 九步模式；注意会话中途重建 dist/agent.js 不会热更新已加载 server，必须新会话）；② 独立 Checker 复查 T303（最小输入：计划 §22/§23/§26 + f37fd16..HEAD diff + E036 + 测试）；③ CLI/VSCode review 视图（复用 renderReviewPresentation，不在 Surface 重实现聚合）；④ V03-2 评估债回补。审计触发：D014 revisit_when → Codex 补跑完整九步（--dangerously-bypass-approvals-and-sandbox）；D015 revisit_when → 第二语言 analyzer/宿主消费偏差/常量调整时重审 Gate 语义。注意：scripts/demo-t303-relevance.mjs 重跑会覆写 artifacts/evidence/E036/ 转录，重跑后需 git checkout 恢复或另行归档；scripts/demo-v04-double-loop.py 同理会覆写 E031 产物。

## 已知探索结果

- node_modules 无 @modelcontextprotocol/sdk，网络受阻 → 手写 MCP 是既定路线（不要换 SDK）。
- 已知坑（全部实证）：esbuild banner shebang 与源文件 shebang 重复会导致 dist 语法错误（源文件不写 shebang）；测试客户端读子进程 stdout 必须用 StringDecoder（CJK 跨 chunk 截断产生 mojibake 假差异）；tools/call 未知工具按 MCP 规范是 -32602；仓库根裸 xray 扫描计数测试（tests/cli.test.ts 38/27）与 fixtures/ 树耦合——**只耦合 .java**（snapshot 仅收 .java），新增非 Java fixture 不影响计数（T303 实证：未新增 fixture，计数未变）；`[null, iso].sort()` 会把 null 排到 ISO 字符串后（String(null)='null'>'2026…'），聚合 lastObservedAt 前必须先 filter Boolean（本轮真实缺陷）；vitest 同文件内用例按声明顺序共享 AgentProcess dataDir——全局性状态（如修正否决 SKIP）的测试必须排在最后（acceptance Case E 位置已固化）。
- relevance 语义边界：前端技术的 observed 熟悉度只能来自 xray_relevance 调用的 changedFiles/projectContext（snapshot 仅 .java）——冷启动前期为 LIGHT，属设计而非缺陷（§12 保守方向）；analyzableByEngine=false 的语言（py/go 等）无风险词时按"引擎无可分析内容"处理并显式 limitation。
- claude -p headless 需要登录态；codex exec 依赖 CC Switch 本地代理（127.0.0.1:15721）与 --dangerously-bypass-approvals-and-sandbox；Codex 注册可能被外部工具重写丢失（codex mcp list 核对）。
- 会话中途重建 dist/agent.js 不会更新已加载的宿主 server 进程——宿主实测必须在 server 重建后的新会话进行（r25 实证）。
- 双轮闭环提示词顺序坑（E035）：review_start 必须在下一次修改之前调用。
- D007/D008/D009 继续有效；D011（bridge 单 seam）、D012（跳过 v0.3 授权）、D013（Insight Layer/schema 0.2/Debt v2）、D014（V04-1 范围备注）、D015（T303 架构边界：context v2/gate 纯函数/service 单组合/legacy view/指标诚实）。

## 待验证与潜在阻塞

| 项 | 当前状态 | 解除方式 / 可并行工作 |
|---|---|---|
| 宿主 LLM 自主调用 xray_relevance | 未实测（MCP 通道已由 spawn 真实 server 的契约/验收测试覆盖） | 用户环境就绪时按 E032/E035 模式跑会话实测并登记新证据 |
| GitHub 推送 | 本地 main 领先远端多个提交，token invalid | 用户重新认证后 git push origin main |
| VS Code 宿主验证 | VSIX 已构建，CLI 无法写扩展目录 | 授权后安装 VSIX 跑真实宿主 smoke |
| V03-2 评估债 | 按 D012 挂起 | JetBrains 环境解除或用户要求回补时做三类规则正/负/未知 fixture |
| Windows/Linux | 未测 | 有环境时跑 verify+eval+bench |
| Codex 侧完整九步（D014 范围备注） | explain/evidence、removed 归因、跨会话幂等未在 Codex 复跑 | 审计 V04 或相关缺陷出现时按 D014 revisit_when 补跑 |
| T303 独立 Checker | 未跑（self-separated） | 收口后按惯例可补独立复查（最小输入见"第一条可执行动作"②） |

## 下一位必须保留的选择

D011（bridge 单 seam）、D012（跳过 v0.3 授权）、D013（Insight Layer/schema 0.2/Debt v2）、D014（V04-1 收口范围以 E035 为准）与 **D015（T303：Gate 纯函数无 LLM/时钟注入；规则与常量只在 packages/relevance；Surface 组合只在 service.ts；self-reported 永不单独驱动 SKIP；修正窗口全局否决 SKIP；toLegacyProfileView 是 T011 零回归的唯一桥，不得让 observation-only 技能伪造 level；观察只存聚合；日志不存任务原文）** 为本阶段依据。审查关口默认 report-only，只有 XRAY_AGENT_GATE=enforce 才可阻塞（PRD §8.5-5）——不得反转默认。evidence 是源码进入工具通道的唯一出口（source-data 包裹+逐行脱敏）；relevance 通道 task 文本不回显是同级注入遏制契约（测试锁定）。review session 基线缓存含源码明文，维持 0600/0700 且 deleteData('reviews') 可清除；relevance-log 随 deleteData('relevance'|'all') 清除。首次提交/推送授权范围（正常开发提交）沿用 E015 记录。

## 快照与证据

r29 = E036（T303 全链路 + 真实二进制 Case A—E + 67.4× wire 实测）+ D015 + L028 + BACKLOG T303 done（DoD 25/25 映射）+ README/SUPPORT/ARCHITECTURE 更新 + 计划文件入库。r28 = E035（Codex 第二宿主）+ D014 + L027。r27 = E034（T302）+ L026 + D013。r26 = E033（hook opt-in + Checker）+ L025。r25 = E032（Claude 宿主闭环）+ L024。r24 = E031（双轮闭环演示）+ L023。v0.1 证据链 E005—E017 不变。

## 中断点

L028 已完整落盘（r29，工作树干净、全部已提交）。若新会话接手：读 AGENTS→START_HERE→本文件；T301/T302/T303 均 done；无必需下一步，可选项见"第一条可执行动作"；不要把 D014/D015 的范围备注与 revisit_when 当作已完成；不要在未跑宿主实测时宣称"宿主 LLM 已自主消费 relevance 门"。
