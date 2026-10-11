# Code X-Ray v0.7 PRD（版本冻结）

## 版本信息

- 版本：v0.7
- 主题："讲懂"打磨——链路精度 + 评估覆盖
- 日期：2026-10-11
- 状态：已冻结（yiyi 撰写，用户确认）
- 前置：v0.6 已收版（commit 26370621）；遗留 R5/R6/R7；R4（公司项目两周 dogfood）进行中

## 0. 背景与目标

v0.6 上线了 9 环链路摘要，实测发现三个精度问题（R5/R6/R7）；冻结评估集仍只覆盖最初 3 条规则，v0.6 的新能力没有任何冻结评估保护。

v0.7 不做新功能，只做两件事：**把链路打磨准，把评估补齐**。TypeScript 明确不在本迭代（v0.8 候选，见 ADR-005）。

## M1 — R5：debt 输出"链路出现 N 次"（v0.6 AC3 缺口）

- `xray debt` 概念明细每条加一句："该概念在你的链路摘要里出现过 N 次"；N=0 时写"尚未在链路摘要里出现过"。
- 数据来源：link summary 已映射的 conceptId（v0.6 M2/M3 已有映射，如 return 环→entity-boundary）。
- debt 公式不动，只加呈现。

## M2 — R6：链路摘要收窄到真正的变更入口

- 现状：`scan --base` 对变更文件内全部入口出摘要（1 个方法变更 → 8 条摘要，噪音大）。
- 改为：只对 diff hunk 实际触及的方法出摘要。新增方法（全行新增）→ 出；方法体/签名被 hunk 触及 → 出；同文件未变更方法 → 不出。
- 实现提示：entry 方法的行区间与 diff hunks 取交集。
- CLI 输出头与 MCP `xray_review_finish` presentation 同步新数量。

## M3 — R7：⑤数据触及计入懒加载集合访问

- 现状：⑤只计 Repository 调用（如 `findById`）。
- 改为：实体上的集合/关系访问（如 `owner.getPets()`）计为"读"，并标注"懒加载集合访问：潜在 N+1 / LazyInitializationException 检查点"。
- 启发式：接收者为 JPA 实体类型、返回集合类型的方法调用；不确定的标 unknown，不瞎编。

## M4 — 评估集补全：后 3 条规则的冻结案例

- 为 SPRING_BEAN_CANDIDATE、TRANSACTION_BOUNDARY、JPA_PERSISTENCE_CONTEXT 各补 ≥10 个 frozen oracle cases（对标前 3 条规则每条 10 个）。
- **冻结红线**：现有冻结文件一律不动（`evals/results/` 下已有文件、`oracle.md` 前 30 案例保持字节一致）；新增案例以追加方式加入，结果基线重新冻结并记录新 SHA。
- 目标：precision/recall 100%、unknown 零泄漏；达不到就如实报告，不硬凑。

## 非目标

- TypeScript / tree-sitter（v0.8 候选，见 ADR-005）
- debt 公式、concept 三态、学习流程的任何改动
- 新增规则；不修规则本身（M4 若发现规则误报，先如实记录，不在本迭代修，避免 scope creep）

## 验收标准（AC1–AC6）

- [ ] AC1：`npm run verify` 通过（已知：root 环境下 `tests/workspace.test.ts` 有 1 个 chmod 相关失败属环境 artifact，非回归）；`npx tsx evals/run.ts` 新旧基线一致，旧 30 案例结果 SHA 不变
- [ ] AC2（R5）：`xray debt` 概念明细含"链路出现 N 次"句式；N=0 时有对应文案
- [ ] AC3（R6）：合成变更（1 个方法新增）只出 1 条入口摘要；同文件未变更方法不出摘要（回归测试覆盖）
- [ ] AC4（R7）：`owner.getPets()` 类懒加载访问计入⑤数据触及（读），带潜在风险标注；不确定的标 unknown
- [ ] AC5（评估）：后 3 条规则各 ≥10 新 frozen cases；precision/recall 100%、unknown 零泄漏（如实报告）
- [ ] AC6：milestones v0.6 行遗留待办更新（R5/R6/R7 关闭）+ v0.7 行追加；PRD 落盘 `docs/prd/prd-v0.7.md`；ADR-005 落盘；commit message 规范

## 遗留与风险

- R4（公司项目两周 dogfood）进行中，可能带回新的链路精度问题 → 进 v0.8。
- T010（cliff tarball 缺 LICENSE 全文）延续，分发前处理。
