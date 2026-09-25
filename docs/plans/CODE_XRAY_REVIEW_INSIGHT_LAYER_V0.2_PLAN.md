# Code X-Ray --- Review Insight Layer v0.2 实施计划

> **文档用途**：本文件是可直接交给 Claude Code 执行的工程实施计划，也是
> Code X-Ray 项目后续需要长期保留的设计与实施记录。
>
> **建议项目内保存路径**：`docs/plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md`
>
> 如果项目已有 ADR / RFC / plans / design-docs
> 等既定目录规范，优先遵循项目现有约定，但**必须将本文件保存进项目仓库并纳入版本控制**。

------------------------------------------------------------------------

## 0. Claude Code 执行要求

在开始修改代码前：

1.  完整阅读本计划，不要只根据标题或局部 TODO 开始编码。
2.  阅读项目现有 `README`、`ARCHITECTURE`、`PRD`、相关 ADR / design
    docs，以及 Review / Learning / Developer Profile / Protocol / Engine
    / MCP 相关实现。
3.  先验证本文描述与当前分支代码是否一致；如果代码已经发生演进，以当前实现为事实来源，并在本文件的"实施记录"中记录差异。
4.  将本 Markdown 文件保存到项目中。建议路径：
    `docs/plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md`
5.  按本文 Phase 1 → Phase 9
    顺序实施，不要跳过"先建立失败测试/fixture"直接重构。
6.  本轮重点是**信息架构和领域模型重构**，不是增加更多 Java
    Rule，也不是接入 LLM。
7.  完成后必须回写本文件末尾的"实施记录"，包括：
    -   实际修改文件；
    -   实际架构决策；
    -   protocol 变化；
    -   debt v1 → v2 变化；
    -   测试结果；
    -   before / after 示例；
    -   与原计划的偏差；
    -   遗留问题。
8.  保留本文件，不要在任务完成后删除；它应成为项目长期设计记录。

------------------------------------------------------------------------

# 1. 背景

当前 `xray_review_start → xray_review_finish` 已经可以对 Agent
修改前后的代码进行确定性静态分析和
diff，但实际使用中存在明显的信息质量问题：

1.  同一知识概念在多个 symbol / finding 上重复出现；
2.  Finding、Knowledge Gap、Learning Binding、Cognitive Debt
    的粒度混杂；
3.  `review_finish` 基本按 Finding 输出 suggested checks，导致大量重复；
4.  new finding 与 continuing finding 在主要输出中的权重过于接近；
5.  Cognitive Debt 当前按 binding 线性累计，同一 concept
    多处出现会造成"同一个知识缺口被重复计分"的感受；
6.  MCP 返回的数据机器可读，但不够适合 Claude Code / Codex
    直接向用户呈现；
7.  当前尚未接入 LLM，本次改造必须保持 deterministic /
    offline-first，不允许用 LLM 掩盖信息架构问题。

本次目标不是增加更多 Java Rule，而是在 Finding 之上增加真正的：

> **Insight Aggregation Layer**

目标数据流：

``` text
Raw Findings
    ↓
Concept Aggregation
    ↓
Knowledge State
    ↓
Change Attribution
    ↓
Priority
    ↓
Actionable Insights
```

------------------------------------------------------------------------

# 2. 当前问题与根因

## 2.1 Learning Binding 的粒度不等于用户知识粒度

当前 Learning Binding 基本采用：

``` text
conceptId + codeRef
```

作为绑定粒度。

这对于记录"某个知识概念在哪段代码出现""代码是否变化""该位置的历史状态"是合理的。

例如：

``` text
spring.transaction-proxy
├── OrderService.create()
├── OrderService.update()
└── OrderService.delete()
```

这些应该保留为三个 Binding。

问题在于：上层 Review / Cognitive Debt 如果直接把每个 Binding
当成一个独立知识缺口，就会产生：

``` text
同一个知识不会一次
→ 因为代码里出现 10 次
→ 被表现成不会 10 次
```

这是概念层和代码关联层混在一起造成的。

正确模型应该是：

``` text
ConceptKnowledgeState
        │
        ├──────────────┐
        ↓              ↓
    Binding A       Binding B
        ↓              ↓
    Finding A       Finding B
        ↓              ↓
    Evidence        Evidence
```

原则：

-   **Concept 管"用户对这个知识理解到什么程度"**
-   **Binding 管"这个知识与哪些具体代码有关"**
-   **Finding 管"Analyzer 在某个代码位置检测到了什么规则实例"**
-   **Evidence 管"这个 Finding 的可追溯事实证据"**

不要为了去重直接删除 Binding。

------------------------------------------------------------------------

## 2.2 Review 当前仍然接近 Finding Dump

当前 Review 的主要结构是从 changed findings 直接生成：

``` text
new findings
+
continuing findings
        ↓
evidenceRefs
suggestedChecks
conceptRefs
```

如果同一个 concept 对应 8 个 Finding，就可能产生 8 个近似 suggested
check。

技术上正确，产品上噪声过大。

目标应该从：

``` text
1 Finding → 1 suggestedCheck
```

变成：

``` text
N Findings
    ↓
1 Concept Insight
    ↓
1 Primary Next Action
```

所有 Finding / Evidence 继续保留，用于 drill-down。

------------------------------------------------------------------------

## 2.3 New 与 Continuing 的用户价值没有拉开

Review 的核心问题应该是：

> **这一轮 Agent 修改真正带来了什么新的东西？**

而不是重新陈述整个项目已有风险。

默认优先级应体现：

``` text
NEW / REGRESSION
★★★★★

CHANGED / ESCALATED
★★★★

CONTINUING + TOUCHED
★★

EXISTING UNCHANGED
默认不进入首屏
```

注意：这是展示和排序语义，不允许伪造 Analyzer 没有证明的 regression /
escalation。

如果当前事实模型只能可靠区分 `new / continuing / removed`，第一版
Insight 先严格使用这些事实，不要猜测"恶化"。

------------------------------------------------------------------------

## 2.4 Concept 已经存在，但没有真正成为 Review 的核心单位

当前 Finding 已经有：

``` ts
conceptId
```

Review 也已经能够生成 concept refs。

说明底层模型已经具备重构条件。

本轮不要推翻 Analyzer，而应该补上中间层：

``` text
Finding[]
   ↓
Concept Group
   ↓
Knowledge State
   ↓
ReviewInsight
```

------------------------------------------------------------------------

## 2.5 Knowledge Gap 已经接近 concept-level，但缺少本轮变化语义

Developer Profile / Knowledge Gap 已经能够按 concept 聚合用户技能与
learning status。

但它主要回答：

> 这个知识点与用户画像之间有什么缺口？

它没有完整回答：

> 这个知识点对"本轮修改"来说，是新增、持续还是已经解决？

因此需要组合：

``` text
Knowledge Gap
+
Review Diff
+
Learning State
=
Review Insight
```

------------------------------------------------------------------------

## 2.6 Cognitive Debt 需要从 Binding Debt 升级为 Concept Debt

当前按 Binding 线性累计容易造成：

``` text
一个知识点出现 1 次 → debt 3
一个知识点出现 10 次 → debt 30
```

但 Cognitive Debt 的产品语义应该更接近：

> 尚未验证理解所对应的条件性风险敞口。

代码出现次数应该影响风险暴露，但不能线性等同于"不会多少次"。

因此需要 Cognitive Debt v2。

------------------------------------------------------------------------

# 3. 架构原则

保持现有底层事实链路：

``` text
Analyzer
→ Evidence
→ Finding
→ Diff
```

新增：

``` text
Finding + Diff
→ Concept Aggregation
→ Knowledge State
→ Change Attribution
→ Priority
→ ReviewInsight
→ ReviewPresentation
```

必须遵守：

-   Evidence 是事实来源；
-   Finding 保持 rule + symbol 粒度；
-   不删除 assumptions / uncertainties / nextCheck；
-   Insight 只能聚合已有确定性数据；
-   不得制造 Analyzer 没有证明的运行时事实；
-   unknown 不得转化为 pass；
-   所有 Insight 必须可以 drill-down 回 findingIds / evidenceIds；
-   不引入 LLM；
-   默认离线；
-   不破坏现有 CLI / VSCode / MCP 的共享 Engine 边界；
-   domain aggregation 不得塞进 MCP adapter；
-   presentation 不得成为新的事实来源。

------------------------------------------------------------------------

# 4. 新增 ReviewInsight Domain Model

在合适的 shared domain package 中新增：

``` ts
interface ReviewInsight {
  id: string;

  conceptId: string;
  title: string;

  changeType:
    | 'new'
    | 'continuing'
    | 'resolved';

  importance:
    | 'critical'
    | 'high'
    | 'medium'
    | 'low';

  knowledgeStatus:
    | 'new-to-user'
    | 'unassessed'
    | 'learning'
    | 'known'
    | 'stale';

  summary: string;
  whyItMatters: string;
  nextAction: string;

  severity: 'high' | 'medium' | 'low';

  occurrenceCount: number;
  newOccurrenceCount: number;
  continuingOccurrenceCount: number;
  resolvedOccurrenceCount: number;

  findingIds: string[];
  evidenceIds: string[];
  symbols: string[];

  primaryFindingId?: string;
  primaryEvidenceId?: string;
}
```

字段命名可以根据项目现有 protocol conventions 调整，但必须保留上述语义。

## 4.1 Insight ID

Insight ID 必须 deterministic。

建议至少基于：

``` text
workspace / review context
+
conceptId
+
change classification
+
rule-set relevant version
```

具体实现需结合现有 Review ID / snapshot identity 设计。

不得使用随机 ID 导致同一 review 重读时 Insight identity 漂移。

------------------------------------------------------------------------

# 5. 实现 Insight Aggregator

建议新增纯 deterministic domain service，例如：

``` text
packages/insights/
  engine.ts
  types.ts
```

或遵循当前 architecture 的等价位置。

提供类似：

``` ts
buildReviewInsights({
  report,
  learningStateBefore,
  learningStateAfter,
  developerProfile
})
```

不要在 MCP adapter 内实现业务聚合。

------------------------------------------------------------------------

## 5.1 聚合规则

首先按照：

``` text
conceptId
```

聚合 changed findings。

同一 concept 下：

-   多个 finding 不生成多个顶层 Insight；
-   findingIds 全部保留；
-   evidenceIds 去重；
-   symbols 去重；
-   occurrenceCount 表示当前相关 occurrence 数；
-   new / continuing / resolved 分别统计。

例如：

``` text
Finding A
concept=spring.transaction-proxy
symbol=OrderService.create

Finding B
concept=spring.transaction-proxy
symbol=OrderService.update

Finding C
concept=spring.transaction-proxy
symbol=OrderService.delete
```

顶层只生成：

``` text
1 ReviewInsight
```

并保留：

``` text
occurrenceCount = 3
symbols = [...]
findingIds = [...]
evidenceIds = [...]
```

------------------------------------------------------------------------

# 6. Change Attribution

Review 的核心必须回答：

> 本轮 Agent 修改真正改变了什么？

对于同一 concept，如果同时存在 new + continuing：

``` text
changeType = new
```

同时保留：

``` text
newOccurrenceCount
continuingOccurrenceCount
```

如果只有 continuing：

``` text
changeType = continuing
```

如果该 concept 的相关 Finding 在目标快照中消失：

``` text
changeType = resolved
```

注意 resolved insight 的 evidence 可能来自 baseline finding；protocol
必须明确证据属于 baseline 还是 target，避免调用方误解。

------------------------------------------------------------------------

## 6.1 排序规则

排序至少考虑：

1.  `new` 优先于 `continuing`；
2.  severity；
3.  knowledge gap / knowledge status；
4.  occurrence / exposure；
5.  stable deterministic tie breaker。

不要依赖对象遍历顺序。

如果需要 `importance`，必须定义透明、可测试的 deterministic 计算规则。

------------------------------------------------------------------------

# 7. Concept-level Knowledge State

现有 LearningBinding 继续保持：

``` text
conceptId + codeRef
```

用于保存：

-   具体代码位置；
-   evidence；
-   fingerprint；
-   stale；
-   历史；
-   verification。

新增 concept-level 聚合状态，例如：

``` ts
interface ConceptKnowledgeState {
  conceptId: string;
  status: LearningStatus;
  bindingIds: string[];
  activeBindingCount: number;
  verifiedBindingCount: number;
  staleBindingCount: number;
  occurrenceCount: number;
}
```

或者功能等价设计。

必须明确区分：

``` text
Concept = 用户需要理解的知识
Binding = Concept 在代码中的一次具体关联
Finding = Analyzer 检测出的规则实例
Evidence = Finding 的事实证据
```

------------------------------------------------------------------------

# 8. Knowledge Status 映射

ReviewInsight 至少区分：

``` text
new-to-user
unassessed
learning
known
stale
```

建议：

``` text
verified / self-reported → known
learning / to-learn     → learning
unassessed              → unassessed
stale                   → stale
```

`new-to-user` 只能在能够确定：

``` text
此前不存在该 concept 的有效 learning/history
+
本轮第一次出现
```

时使用。

证据不足时不要猜，使用：

``` text
unassessed
```

------------------------------------------------------------------------

## 8.1 多 Binding 状态冲突

必须为同一 concept 下多个 Binding 状态定义明确聚合规则。

例如：

``` text
Binding A = verified
Binding B = stale
Binding C = unassessed
```

不能依赖数组顺序。

需要：

-   明确 precedence；
-   写单元测试；
-   在代码注释 / architecture doc 中解释原因。

注意不要简单地因为出现一个新 Binding 就把整个 Concept 从 `known` 降成
`unassessed`。

用户"理解某个知识"与"该知识在新代码位置的适用性需要确认"是两个不同维度。

如有必要，可以将 concept knowledge 与 occurrence applicability
分开表达。

------------------------------------------------------------------------

# 9. Deterministic Concept Content

本轮不接 LLM。

复用当前 learning cards / concept content，但不要让 presentation layer
直接依赖私有常量。

抽出公开 concept metadata，例如：

``` ts
getConceptContent(conceptId)
```

提供：

``` text
title
what
whyItMatters
nextAction template
```

ReviewInsight 的：

``` text
title
summary
whyItMatters
nextAction
```

全部从：

``` text
Concept metadata
+
Finding
+
Diff
+
Knowledge state
```

确定性生成。

禁止生成 Analyzer 未证明的具体运行时结论。

------------------------------------------------------------------------

# 10. Primary Finding / Primary Evidence

每个 Insight 默认只选择：

``` text
1 个 primaryFinding
1 个 primaryEvidence
```

用于首屏。

建议选择顺序：

``` text
new finding
>
higher severity
>
stable deterministic order
```

其余全部保留：

``` text
findingIds
evidenceIds
symbols
```

目标：

> 首屏看一件事，需要时再展开全部证据。

------------------------------------------------------------------------

# 11. ReviewOutput v0.2

保留向后兼容字段时可以暂时 coexist，但新增结构化 Insight 输出。

建议：

``` ts
interface ReviewOutput {
  overview: {
    filesChanged: number;

    newInsightCount: number;
    continuingInsightCount: number;
    resolvedInsightCount: number;

    newFindingCount: number;
    continuingFindingCount: number;
    resolvedFindingCount: number;
  };

  insights: ReviewInsight[];
  resolvedInsights: ReviewInsight[];

  coverageSummary: {
    status: 'complete' | 'partial' | 'failed' | 'cancelled';
    unknownCount: number;
    reasons: unknown[];
  };

  debtDelta: ReviewDebtDelta;

  // migration period:
  // existing raw/detail fields may temporarily remain
}
```

最终目标：

MCP consumer 不应该再必须通过：

``` text
findingIds
conceptRefs
suggestedChecks
```

自行重建用户语义。

------------------------------------------------------------------------

# 12. Continuing Finding 降噪

默认 presentation：

## NEW INSIGHTS

完整展示。

## CONTINUING INSIGHTS

默认摘要 / 折叠。

例如：

``` text
6 个已有风险仍然存在，涉及 2 个知识概念。
```

除非满足 deterministic escalation condition，例如：

-   severity high；
-   knowledge status stale；
-   occurrence 明确增加；
-   其他已经有事实支持的 escalation。

否则不要逐条占据首屏。

注意：

如果当前 diff 无法可靠判断 occurrence increase，不要自行推断。

------------------------------------------------------------------------

# 13. 重新设计 Suggested Checks

当前思路：

``` text
1 Finding → 1 suggestedCheck
```

改为：

``` text
1 Insight → 1 primary nextAction
```

例如 8 个：

``` text
JPA_CALL_IN_LOOP
```

不要生成 8 条几乎一样的 check。

应该生成：

``` text
JPA 循环查询放大

本轮涉及 8 个位置，其中 2 个新增。

优先检查：
OrderService.xxx()

其余位置通过 evidence drill-down 查看。
```

Raw Finding 的 `nextCheck` 继续保留。

------------------------------------------------------------------------

# 14. Cognitive Debt v2

当前 Debt 按 Binding 线性累加。

改为 concept-level debt。

目标语义：

``` text
用户不会一个 Concept
≠
代码出现 N 次就不会 N 次
```

建议模型：

``` text
conceptDebt =
impact
× knowledgeGap
× evidenceStrength
× exposureFactor
```

其中：

``` text
impact = concept 下最高 severity 对应值
```

`exposureFactor` 非线性增长，例如：

``` ts
1 + min(MAX_EXPOSURE_BONUS, Math.log2(activeOccurrences) * K)
```

具体 K 和 cap 必须：

-   常量化；
-   有语义化名称；
-   在 debt report 中透明输出；
-   有单元测试；
-   不允许隐藏 magic number。

例如概念上：

``` text
1 occurrence  → 1.00
2             → ~1.15
5             → ~1.35
20            → capped value
```

具体参数由实现阶段结合现有 debt scale
确定，但必须记录在本文件实施记录中。

------------------------------------------------------------------------

## 14.1 Debt v2 输出

Debt report 至少显示：

``` text
conceptId
occurrenceCount
impact
gap
evidenceStrength
exposureFactor
priority
```

更新：

``` text
modelVersion = debt-model-v2
```

并保留透明公式和解释。

------------------------------------------------------------------------

## 14.2 Debt Migration

必须评估：

-   现有本地状态是否需要 migration；
-   历史 debt 数值是否需要兼容；
-   API consumer 是否依赖 `items` 当前按 binding 输出；
-   是否保留 binding-level details 作为 drill-down；
-   ReviewDebtDelta 的 before/after 是否必须在同一 modelVersion 下计算。

禁止：

``` text
before 使用 debt-model-v1
after 使用 debt-model-v2
```

然后直接计算 delta。

同一 Review 的 before / after 必须使用同一模型版本。

------------------------------------------------------------------------

# 15. Human-Friendly Review Presentation

增加 deterministic renderer 或统一 presentation model。

不要让 MCP、CLI、VSCode 各自重新发明 Insight 文案逻辑。

目标首屏：

``` text
Code X-Ray Review

本轮修改
──────────────────────
4 个文件发生变化
新增 1 个风险概念
2 个已有风险概念持续存在
2 个历史风险概念已解决

需要关注
──────────────────────

① Spring 事务代理边界

状态：本轮新增
重要性：HIGH
知识状态：尚未评估

本轮发现：
1 个新增位置
3 个已有相关位置

主要位置：
OrderService.createOrder()

为什么值得关注：
同类内部调用 @Transactional 方法不会经过
Spring AOP 代理，事务语义取决于实际调用入口。

建议确认：
确认 createOrder() → saveOrder()
是否经过 Spring Proxy。

[可展开查看全部 Finding / Evidence]

──────────────────────

其他信息

✓ 2 个历史风险概念已消失
• 2 个已有风险概念没有新的 occurrence
• 3 个区域存在静态分析 unknown

认知变化

新增知识点：1
已掌握知识再次出现：2

Cognitive Debt
12.0 → 13.0 (+1.0)
```

不要让首屏展示全部：

``` text
assumptions
uncertainties
evidence
raw finding IDs
```

这些通过详细字段、`xray_explain`、`xray_evidence` 等继续访问。

------------------------------------------------------------------------

# 16. Gate 语义

Gate 必须继续严格遵守：

``` text
partial != pass
unknown != pass
failed != pass
```

不要因为 Insight 聚合而丢失 coverage uncertainty。

Gate reason 可以从 Finding 数量升级为更符合人类认知的 Insight 数量。

例如旧输出：

``` text
8 项新增、12 项持续风险需要人工检查
```

新输出：

``` text
本轮产生 2 个新的风险概念（8 个具体代码位置），
另有 3 个已有风险概念持续存在。
```

Finding 数量继续作为 detail 保留。

------------------------------------------------------------------------

# 17. Finding Diff 暂时不要随意修改

现有 Finding 跨快照 identity / diff 属于事实层。

如果当前实现采用类似：

``` text
ruleId + symbol
```

作为 finding identity，并只对 changed files 触达的 Finding 计算 new /
continuing / removed，本轮默认保持该事实语义。

本次主要根因在：

``` text
Finding
→ Review
```

之间缺少 Concept / Insight 聚合，而不是底层 diff 一定错误。

只有在新增测试明确证明 Finding identity 本身存在 bug
时，才单独修改，并在实施记录中说明。

------------------------------------------------------------------------

# 18. Protocol / Schema Strategy

评估：

``` text
Review schema 0.1 → 0.2
```

如果改变已有字段语义，必须升级 schema。

优先原则：

1.  不偷偷改变已有字段语义；
2.  migration period 可以保留 legacy fields；
3.  新 consumer 优先使用 `overview + insights`；
4.  legacy fields 标记 deprecated；
5.  schema validation 必须覆盖新结构；
6.  stored ReviewRecord 的读取兼容策略必须明确。

如果旧 review 仍然需要可读：

-   明确 v0.1 reader；
-   或 migration-on-read；
-   或明确不迁移并提供版本化读取行为。

不要让已有本地 review 数据无提示损坏。

------------------------------------------------------------------------

# 19. 测试要求

必须先增加 fixture / test 复现旧问题，再实施重构。

## Case 1：同 Concept 多 Finding

输入：

``` text
同 concept
10 findings
```

期望：

``` text
1 Insight
10 occurrences
```

------------------------------------------------------------------------

## Case 2：New + Continuing 混合

输入：

``` text
同 concept
2 new
5 continuing
```

期望：

``` text
1 Insight
changeType = new
newOccurrenceCount = 2
continuingOccurrenceCount = 5
```

------------------------------------------------------------------------

## Case 3：已掌握 Concept 在新位置再次出现

用户此前：

``` text
verified
```

本轮新位置再次出现。

期望：

``` text
knowledgeStatus = known
```

不能重新包装成"用户第一次不会这个知识"。

------------------------------------------------------------------------

## Case 4：Debt 非线性

同一 concept 出现 10 次。

期望：

Debt 不允许线性变成单次 occurrence 的 10 倍。

同时验证 exposure factor 的公式和 cap。

------------------------------------------------------------------------

## Case 5：不同 Concept

输入：

``` text
Concept A
Concept B
```

期望：

``` text
2 Insights
```

------------------------------------------------------------------------

## Case 6：只有 Continuing Finding

Review 首屏不得产生大量重复 suggested checks。

期望：

-   顶层按 concept 聚合；
-   continuing 默认摘要；
-   raw details 仍可 drill-down。

------------------------------------------------------------------------

## Case 7：Resolved Findings

必须进入：

``` text
resolvedInsights
```

或功能等价的 resolved summary。

------------------------------------------------------------------------

## Case 8：Unknown / Partial

聚合后仍必须：

``` text
gate != pass
```

并保留 coverage reasons。

------------------------------------------------------------------------

## Case 9：Review Idempotency

同 snapshot 重复：

``` text
xray_review_finish
```

期望：

``` text
reviewId identical
reused = true
```

------------------------------------------------------------------------

## Case 10：Stale Review

代码变化后读取旧 review。

期望：

``` text
stale = true
gate = incomplete
```

------------------------------------------------------------------------

## Case 11：Deterministic Ordering

相同输入运行多次：

``` text
insights order
primaryFinding
primaryEvidence
importance
nextAction
```

必须稳定。

------------------------------------------------------------------------

## Case 12：Concept Knowledge 多 Binding 冲突

例如：

``` text
verified
stale
unassessed
```

验证 concept-level 状态聚合符合明确规则，不依赖数组顺序。

------------------------------------------------------------------------

## Case 13：Debt Model Version Consistency

Review before / after 必须使用相同：

``` text
debt-model-v2
```

并正确计算 delta。

------------------------------------------------------------------------

# 20. 兼容性要求

不要破坏：

-   `xray_scan`
-   `xray_explain`
-   `xray_evidence`
-   `xray_review_start`
-   `xray_review_finish`
-   `xray_review_read`
-   `xray_summary`
-   CLI learning 状态
-   VSCode learning 状态
-   review idempotency
-   stale detection
-   report-only / enforce gate
-   offline guarantee
-   privacy boundary
-   prompt injection boundary
-   Evidence / Finding 可追溯性

------------------------------------------------------------------------

# 21. 本轮明确禁止

1.  不接 LLM；
2.  不新增 Java Rule；
3.  不为了 UX 删除 Evidence / Finding；
4.  不让 MCP adapter 承担 domain aggregation；
5.  不通过 Prompt 解决重复问题；
6.  不把 unknown 包装成 certainty；
7.  不让 verified knowledge
    因为换了代码位置就自动变成"用户不会这个知识"；
8.  不让 occurrence 数量线性等于知识债务；
9.  不使用随机排序；
10. 不为了改动小而继续维持 Finding → UI 的直接映射；
11. 不在没有 migration 策略时偷偷改变 persisted schema；
12. 不把 human-friendly renderer 变成新的事实判断层。

------------------------------------------------------------------------

# 22. 实施顺序

## Phase 1 --- 建立 Baseline Tests / Fixtures

先复现当前问题：

``` text
同 concept 多 findings
→ 多条重复 suggested checks
→ debt 线性增长
```

保存 before snapshot / fixture output。

**Phase 1 未完成前不要开始核心重构。**

------------------------------------------------------------------------

## Phase 2 --- Concept-level Knowledge State

实现：

``` text
ConceptKnowledgeState
```

明确：

``` text
Concept
Binding
Finding
Evidence
```

四层职责。

补齐状态聚合测试。

------------------------------------------------------------------------

## Phase 3 --- Insight Aggregator

实现：

``` text
Finding + Diff + Knowledge
→ ReviewInsight[]
```

完成：

-   concept aggregation；
-   change attribution；
-   deterministic sorting；
-   primary finding/evidence；
-   knowledge status；
-   deterministic content。

------------------------------------------------------------------------

## Phase 4 --- Review Protocol v0.2

加入：

``` text
overview
insights
resolvedInsights
coverageSummary
```

制定 v0.1 compatibility / migration strategy。

更新 schema validation。

------------------------------------------------------------------------

## Phase 5 --- ReviewRecord Integration

将 `buildReviewRecord` 从：

``` text
Finding → ReviewOutput
```

改成：

``` text
Finding
→ Insight Aggregator
→ ReviewOutput
```

MCP adapter 只做协议适配，不承载 aggregation domain rules。

------------------------------------------------------------------------

## Phase 6 --- Cognitive Debt v2

从：

``` text
Binding Debt
```

升级：

``` text
Concept Debt
```

加入非线性 exposure。

更新：

``` text
modelVersion = debt-model-v2
```

完成 migration / compatibility。

------------------------------------------------------------------------

## Phase 7 --- Human-Friendly Deterministic Presentation

实现统一 renderer / presentation model。

至少覆盖：

``` text
review_finish
review_read
```

并评估 CLI / VSCode 复用。

------------------------------------------------------------------------

## Phase 8 --- Documentation

更新：

-   README；
-   ARCHITECTURE；
-   PRD；
-   protocol docs；
-   MCP tool description；
-   learning / debt docs；
-   必要 ADR。

并保留本计划文件。

------------------------------------------------------------------------

## Phase 9 --- Full Verification

运行项目当前正式验证命令。

如果项目当前仍使用：

``` bash
npm run verify
npx tsx evals/run.ts
npx tsx evals/bench.ts
```

则全部执行。

如果命令已经变化，以当前 package scripts / CI
为准，并在实施记录中写明实际命令。

必须保证：

-   analyzer precision / recall 不因本轮重构退化；
-   existing tests 通过；
-   new tests 通过；
-   protocol validation 通过；
-   review idempotency 通过；
-   stale behavior 通过。

------------------------------------------------------------------------

# 23. 验收目标

最重要的产品指标：

``` text
23 raw findings
→
4 concepts
→
1 new actionable insight
+ 2 continuing summaries
+ 1 resolved insight
```

用户不应该被迫阅读 23 条重复信息。

同时必须保证：

``` text
任何 Insight
→ findingIds
→ evidenceIds
→ source
```

完整可追溯。

------------------------------------------------------------------------

# 24. Before / After 验收示例

## Before

``` text
Finding 1: Spring transaction proxy...
Suggested check: verify transaction proxy...

Finding 2: Spring transaction proxy...
Suggested check: verify transaction proxy...

Finding 3: Spring transaction proxy...
Suggested check: verify transaction proxy...

Finding 4: JPA loop query...
Suggested check: verify DB calls...

Finding 5: JPA loop query...
Suggested check: verify DB calls...
```

用户必须自己判断：

``` text
5 Findings
其实只有 2 件事
```

------------------------------------------------------------------------

## After

``` text
Code X-Ray Review

本轮修改
- 4 个文件变化
- 1 个新风险概念
- 1 个已有风险概念持续存在
- 1 个历史风险概念已解决

需要关注

1. Spring 事务代理边界
   状态：本轮新增
   重要性：HIGH
   知识状态：尚未评估

   1 个新增位置，2 个已有相关位置。

   主要位置：
   OrderService.createOrder()

   为什么值得关注：
   ...

   建议确认：
   ...

已有风险摘要
- JPA 查询放大仍存在，共 5 个相关位置；本轮无新的知识概念。

已解决
- 1 个历史风险概念不再出现。

Coverage
- 3 个 unknown 区域，结论范围受限。

Cognitive Debt
12.0 → 13.0 (+1.0)
```

------------------------------------------------------------------------

# 25. 最终设计原则

Code X-Ray 的价值不是：

> 告诉用户扫描到了多少 Finding。

而是：

> **在保持证据严谨、可追溯、确定性的前提下，告诉用户这一轮 AI
> 修改中真正有什么新的事情值得知道。**

最终层级：

``` text
Level 0 — Raw Evidence
Level 1 — Finding
Level 2 — Concept
Level 3 — Insight
Level 4 — Human / Agent Presentation
```

LLM 将来只能建立在这套结构化事实层之上。

不要用 LLM 替代这次信息架构重构。

------------------------------------------------------------------------

# 26. Claude Code 完成任务后的强制交付内容

实现完成后，不要只回复"done"。

必须输出：

1.  **根因总结**
2.  **实际修改文件清单**
3.  **新的完整数据流**
4.  **Concept / Binding / Finding / Evidence / Insight 的最终职责**
5.  **Protocol v0.1 → v0.2 的变化**
6.  **Cognitive Debt v1 → v2 的变化**
7.  **所有新增/修改测试及结果**
8.  **真实 fixture 的 before / after `review_finish` 对比**
9.  **兼容性验证结果**
10. **仍然存在的限制**
11. **下一阶段建议**
12. **本计划文件最终保存路径**
13. **本计划文件已更新的实施记录**

------------------------------------------------------------------------

# 27. 实施记录（由 Claude Code 在完成后回写）

> 不要删除本章节。实施过程中持续更新。

## 27.1 状态

``` text
Status: COMPLETE（Phase 1—9 全部完成）
Started At: 2026-09-25
Completed At: 2026-09-25
Implementer: Claude Code（session 20260925-claude-t302）
Branch / Commit: main；a1df029（计划+Phase1 基线）→ 77c4701（Phase2）→ 31f76a0（Phase3）→ 630f57d（Phase4+5）→ 43771bb（Phase6）→ 3ff36ee（Phase7）→ 7a65cf0（验收/前后证据）→ 本次文档与状态回写提交
```

## 27.2 实际修改文件

``` text
新增：
  docs/plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md   # 本文件（纳入版本控制）
  packages/insights/types.ts                               # 聚合服务输入/输出契约
  packages/insights/engine.ts                              # Insight Aggregator（纯确定性）
  packages/insights/review.ts                              # buildReviewRecord + computeGate（自 bridge 迁入的领域装配）
  packages/insights/presentation.ts                        # renderReviewPresentation（统一渲染器）
  scripts/capture-insight-baseline.ts                      # 基线/after 捕获脚本（可复现）
  tests/fixtures/review-insight-v0.1-before.json           # v0.1 基线证据（Phase 1，改造前捕获）
  tests/fixtures/review-insight-v0.2-after.json            # 同场景 v0.2 after 证据
  tests/insight-baseline.test.ts                           # 旧问题固化 + before/after 对比断言
  tests/insights.test.ts                                   # 聚合器单测（Case 1/2/3/5/7/11/12 + importance/primary）
  tests/review-presentation.test.ts                        # presentation + Case 6/8 + v0.1 版本化渲染
  tests/review-acceptance.test.ts                          # §23 验收端到端（真实 MCP 管线）
修改：
  packages/protocol/index.ts      # ReviewInsight/ReviewOverview/ReviewCoverageSummary；ReviewOutput v0.2；
                                  # ReviewRecord 0.2 + ReviewRecordV01 + StoredReviewRecord；REVIEW_SCHEMA_VERSION；
                                  # reviewRecordSchema(ajv) + assertReviewRecord；ReviewDebtDelta +conceptsBefore/After
  packages/learning/types.ts      # ConceptKnowledgeState；DebtSummary v2（ConceptDebtItem + BindingDebtItem）
  packages/learning/engine.ts     # CONCEPT_STATUS_PRECEDENCE（显式常量+注释）；conceptKnowledgeStates()；
                                  # getConceptContent()（公开概念元数据，不含 question/answer）；
                                  # debtSummary() 升级为 debt-model-v2；EXPOSURE_K/MAX_EXPOSURE_BONUS/exposureFactor()
  apps/agent/host/bridge.ts       # buildReviewRecord/computeGate 迁出至 packages/insights；finishReview 传入
                                  # learningStateBefore/After 与 gateBlocking；read/finish 返回 presentation；
                                  # StoredReviewRecord 版本化读取
  apps/agent/tools/index.ts       # review_finish/review_read 工具描述更新（insights/presentation/版本化读取）
  apps/cli/index.ts               # xray debt 概念级渲染 + 暴露因子/样本；sortedBindings 走 bindingItems（概念优先序）
  tests/agent-review.test.ts      # schema 0.2、insights/overview/coverageSummary、suggestedChecks=insight 数、
                                  # debt-model-v2、presentation、Case 9/10/13 断言
  tests/agent-contract.test.ts    # 注入遏制扩展至 insights/resolvedInsights/overview/coverageSummary/presentation 通道
  tests/learning.test.ts          # Phase 2 概念状态测试（Case 3/12）+ 债务 v2 重写（Case 4、全 ignored 排除、verified=0）
  tests/developer-profile.test.ts # items→bindingItems 钻取适配
  docs/ARCHITECTURE.md            # §3 +packages/insights；§4 +Review Insight Layer 层级与约束
  README.md / docs/SUPPORT.md     # review 0.2 输出面与 debt v2 描述
  docs/state/DECISIONS.md         # D013（Insight Layer + schema 0.2 + Debt v2 决策全记录）
  docs/state/BACKLOG.md           # T302 登记与完成
  docs/state/{CURRENT,HANDOFF,EVIDENCE,LOOP_LOG}.md  # r27 状态、E034、L026
```

## 27.3 最终架构决策

``` text
1. 四层职责（§2.1/§7）落地：Concept=ConceptKnowledgeState（learning 包，状态聚合 precedence 显式常量化：
   stale > verified > self-reported > learning > to-learn > unassessed，与数组顺序无关）；Binding 保留
   conceptId+codeRef 粒度永不合并；Finding/Evidence 事实层未动（§17 遵守：buildDiff/finding identity 零改动）。
2. 聚合在共享领域包 packages/insights（纯函数、无 I/O/时钟/随机/LLM）；bridge 仅编排与策略注入
   （gateBlocking）；MCP tools 层零领域逻辑（D009/D011 边界不变）。
3. importance 透明加分制：score = severity(high3/medium2/low1) + changeType(new2/continuing1/resolved0)
   + knowledgeStatus(new-to-user2/unassessed1/stale1/learning0/known0)；阈值 critical≥7、high≥5、medium≥3。
   CRITICAL 只能由 high severity 触达（与 §15 示例"新增+medium+未评估=HIGH"一致）。权重/阈值导出且有单测。
4. 排序（§6.1）：changeType → importance → severity → knowledgeStatus → occurrenceCount desc → conceptId（稳定 tie break）。
5. Insight ID = ins_ + sha256(reviewId|conceptId|ruleSetVersion)[:32]；reviewId 本身内容寻址
   （workspaceId+targetSnapshotId+ruleSetVersion）→ 同一 review 重读 identity 零漂移（§4.1）。
6. resolved Insight 的 findingIds/evidenceIds 显式 evidenceScope='baseline'（§6）；活跃 Insight 强制 'target'
   （assertReviewRecord 校验）。
7. presentation 是 record 的纯函数渲染（读取时生成、不落盘、不是事实来源，§21-12）；v0.1 旧记录渲染为
   明确标记的 legacy 版式，绝不回填未计算过的 Insight（§18 选项三：版本化读取）。
8. gate：状态机语义零变化（partial/unknown/failed ≠ pass；blocking 仅 enforce）；headline reason 升级为
   概念措辞并保留 finding 计数为 detail（§16）。
9. 记录装配经 assertReviewRecord（ajv 结构 + 钻取完整性 + overview 一致性 + evidenceScope 语义）后才落盘。
```

## 27.4 与原计划的差异

``` text
1. 计划 §5 建议 packages/insights/{engine,types}.ts——实际另增 review.ts（记录装配+gate）与 presentation.ts；
   ReviewInsight 等 wire 类型定义在 packages/protocol（协议是 wire 契约的既有归属），insights/types.ts 只放
   聚合服务 I/O 契约。类型定义与聚合器同在 Phase 3 落地（阶段是工作顺序，不是提交切分）。
2. buildReviewInsights 签名未接收 developerProfile：knowledgeStatus 完全由 learning state + 本轮历史决定；
   profile 仅服务 knowledgeGaps（xray_summary kind=profile），避免画像影响 review 确定性结论。计划签名是
   "类似"示例，属允许调整范围。
3. getConceptContent 对未知 conceptId 返回 null 并诚实降级（title=conceptId、"内容库未覆盖"文案），不抛错——
   与 knowledgeGaps 的 throw 不同，理由：review 是全量装配路径，未来新规则缺卡不应炸掉整个审查。
4. occurrenceCount = 变更范围内 new+continuing occurrence 数；未触达变更文件的同概念 finding 不进入 review
   diff（§17 保持既有事实语义），e2e 测试显式断言该诚实边界（untouched 文件的 finding 不在 insight 中）。
5. importance 的 continuing 权重取 1（计划未给数值），阈值经校准使 §15 示例成立；全部常量化+单测。
6. Debt v2 参数定为 EXPOSURE_K=0.15、MAX_EXPOSURE_BONUS=0.5：曲线 1→1.00、2→1.15、5→1.35、10→1.50、
   20→1.50（封顶），与 §14 示例数值吻合。
7. §8.1 "concept knowledge 与 occurrence applicability 分开表达"通过 ConceptKnowledgeState 的
   verifiedBindingCount/staleBindingCount 计数实现（stale 优先 surfacing 复核需求，verified 掌握度仍可见），
   未拆成两个独立状态字段。
8. PRD 未修改：§8.5-4 验收要素（变化摘要/路径影响/新增持续移除/证据/未知覆盖/建议验证/概念/债务变化）
   在 v0.2 全部保留（legacy 字段 + 概念级结构化增强），属信息架构增强而非验收变化，记录于 D013。
9. Phase 9 命令与计划一致：npm run verify + npx tsx evals/run.ts + npx tsx evals/bench.ts。
```

## 27.5 Protocol 变化

``` text
Review schema 0.1 → 0.2（REVIEW_SCHEMA_VERSION='0.2'；AnalysisReport schema 0.1 未动）：
新增：
  ReviewInsight { id, conceptId, title, changeType(new|continuing|resolved), importance(critical|high|medium|low),
    knowledgeStatus(new-to-user|unassessed|learning|known|stale), summary, whyItMatters, nextAction, severity,
    occurrenceCount, newOccurrenceCount, continuingOccurrenceCount, resolvedOccurrenceCount,
    findingIds, evidenceIds, symbols, primaryFindingId?, primaryEvidenceId?, evidenceScope(target|baseline) }
  ReviewOverview { filesChanged, newInsightCount, continuingInsightCount, resolvedInsightCount,
    newFindingCount, continuingFindingCount, resolvedFindingCount }
  ReviewCoverageSummary { status, unknownCount, reasons: Diagnostic[] }
  ReviewOutput v0.2 = { overview, insights, resolvedInsights, coverageSummary } + 全部 v0.1 legacy 字段
    （deprecated 标注，migration period 共存）；debtDelta 增 conceptsBefore/conceptsAfter。
语义升级（随 schema 版本显式进行，非偷改）：
  suggestedChecks：v0.1 每 Finding 一条 → v0.2 每 Insight 一条主检查（增 insightId 关联；nextCheck 仍为
  Analyzer 原文，Raw Finding.nextCheck 在 report 中继续保留）。
校验：
  reviewRecordSchema（ajv 2020-12）+ assertReviewRecord：结构 + 语义不变量（findingIds 非空、occurrenceCount
  一致、primaryFindingId ∈ findingIds、活跃 Insight 引用必须在 diff 内、resolved 必须 evidenceScope=baseline
  且引用 removed 集合、overview 与列表一致、suggestedChecks 必须挂活跃 Insight）。
兼容（§18 选项三：版本化读取）：
  ReviewRecordV01 类型保留；StoredReviewRecord = 0.1 | 0.2 联合；review_read/reused 路径原样返回旧记录，
  presentation 标记"schema 0.1 · 旧版记录"；不迁移、不回填、不损坏既有本地数据。
```

## 27.6 Cognitive Debt v2 最终公式

``` text
modelVersion = debt-model-v2（概念级）
conceptDebt = impact × gap × evidenceStrength × exposureFactor
  impact           = 概念内活跃绑定的最高 severity（high=3 / medium=2 / low=1）
  gap              = GAP[概念级聚合状态]（unassessed 1.0、to-learn 0.8、learning 0.6、self-reported 0.4、
                     stale 0.9、verified 0、ignored 0；precedence 见 27.3-1）
  evidenceStrength = 概念内最强关联（direct=1.0 / inferred=0.7 / unknown=0.4）
  exposureFactor   = 1 + min(MAX_EXPOSURE_BONUS, log2(max(1,occurrences)) × EXPOSURE_K)
                     EXPOSURE_K = 0.15，MAX_EXPOSURE_BONUS = 0.5（具名导出常量，随报告输出 formula+samples）
                     样本：1→1.00、2→1.15、5→1.35、10→1.50、20→1.50（封顶）
排除与钻取：全 ignored 概念 priority=null + exclusionReason；binding 明细保留为 bindingItems（v1 形状，
  单绑定线性参考值，不计入 total）；total = Σ 概念 priority（2 位舍入）。
效果实证（同场景 before/after）：12 绑定 v1 total=24.0（线性 12×2.0）→ v2 total=7.0
  （jpa 概念 2×1×1×1.5=3.0 + 两个 tx 概念各 2.0）。10 处同概念 = 3.0，绝非 20.0（Case 4）。
迁移：学习状态存储格式未变（无数据迁移）；debt 为即时计算，review before/after 恒同模型版本（Case 13）；
  存量 review 记录中的 v1 数值按 0.1 版本化读取原样保留，跨模型版本数值不可直接比较（modelVersion 可辨）。
```

## 27.7 测试结果

``` text
Phase 1 基线（改造前捕获，永久固化）：
  tests/fixtures/review-insight-v0.1-before.json + tests/insight-baseline.test.ts（P1—P4 旧问题断言，5 用例）
新增测试（33 用例）：
  tests/insights.test.ts（14）：Case 1/2/3/5/7/11/12、primary finding、importance 打分、new-to-user 证据门槛、
    无 diff 不归因、去重排序、未知概念诚实降级、insight id 确定性
  tests/review-presentation.test.ts（9）：Case 6（continuing 折叠为一行摘要+钻取保留）、Case 8（partial/unknown
    聚合后 gate ≠ pass、blocking 仅 enforce）、升级展示（high/stale）、首屏纪律（无 assumptions/uncertainties/
    raw finding id）、渲染确定性、v0.1 legacy 版本化渲染
  tests/review-acceptance.test.ts（1，e2e 真实 MCP 管线）：§23 验收形状——5 raw findings → 1 actionable insight
    （1 new + 2 continuing 聚合）+ 2 resolved insights（baseline scope）+ untouched 文件 finding 诚实排除 +
    1 条主检查 + Case 9 幂等（reused、presentation 逐字节相同）+ debt v2 concepts 0→1
  tests/insight-baseline.test.ts 追加 after 对比（4）：同场景 12 findings → 3 insights/3 checks/debt 7.0/概念化 gate 措辞
更新测试：
  tests/learning.test.ts（15）：Phase 2 概念状态（Case 3/12，含顺序无关性）+ 债务 v2 重写（Case 4 非线性与
    封顶、全 ignored 排除、verified=0 仍列出、常量透明）
  tests/agent-review.test.ts：schema 0.2、insights/overview/coverageSummary/suggestedChecks=insights 数、
    debt-model-v2 + conceptsAfter、presentation（finish 与 read 逐字节一致）、Case 9/10 保持
  tests/agent-contract.test.ts：注入遏制扩展到 insights/resolvedInsights/overview/coverageSummary/presentation
  tests/developer-profile.test.ts：bindingItems 钻取适配
最终结果（Phase 9，2026-09-25）：
  npm run verify → exit 0（check:cli/check:vscode/check:agent 三路 tsc + vitest 158/158（20 文件）+
    build + build:vscode + build:agent 全部成功）
  npx tsx evals/run.ts → 冻结 oracle 通过（precision/recall 达标，unknown 零泄漏——analyzer 未动，无退化）
  npx tsx evals/bench.ts → cold 0.90s（≤10s）、hot 0.84s（≤3s）、peak 335.5 MiB（≤512 MiB），AC12 通过
独立 Checker（全新上下文 agent，项目惯例参照 E033）复查结论：**通过**——§21 十二条禁止项全部遵守；
  DoD 抽查 9 项均有代码/测试证据；before/after fixture 真实性核对通过；6 个目标测试文件独立实测 59/59；
  §27 实施记录抽查 5 条与实现一致；零中/高级别发现。低级别备注 2 条均已处置：全量 verify 于复查后重跑
  确认（exit 0、158/158、oracle 通过）；stale 暴露代理为 §27.9-4 已披露限制。详见 docs/state/EVIDENCE.md E034。
```

## 27.8 Before / After

``` text
同一场景（Phase 1 基线工作区：同 concept 10 个 JPA_CALL_IN_LOOP + 1 TX_SELF_INVOCATION + 1 TRANSACTION_BOUNDARY；
两份 fixture 均为真实管线捕获，仅易变标识符替换为占位符）：

Before（tests/fixtures/review-insight-v0.1-before.json，v0.1）：
  12 findings → suggestedChecks 12 条（其中 10 条 nextCheck 文本完全相同）
  conceptRefs 只是 id 列表；无 overview/insights/coverageSummary/presentation
  debt：debt-model-v1，12 绑定线性 = 24.0
  gate reason："12 项新增、0 项持续风险需要人工检查（含证据与验证建议）。"

After（tests/fixtures/review-insight-v0.2-after.json，v0.2）：
  同 12 findings（事实零变化，newFindingIds 逐项相等）→ 3 个 Insight：
    jpa.query-amplification：occurrenceCount=10、1 条 nextAction（"优先检查 BatchService.processN…其余 9 个
    位置经 findingIds/evidenceIds 钻取"）、importance HIGH、knowledgeStatus new-to-user
  suggestedChecks 3 条（每 Insight 一条主检查，insightId 关联）
  debt：debt-model-v2 = 7.0（jpa 概念 3.0（暴露 1.5 封顶）+ tx 两概念各 2.0）；conceptsAfter=3
  gate reason："本轮产生 3 个新的风险概念（12 个具体代码位置）…"
  + overview / coverageSummary / presentation 首屏（"新增 3 个风险概念…"、①②③ 分节、钻取提示）

端到端验收（tests/review-acceptance.test.ts，§23 目标形状）：
  5 raw findings → 1 new actionable insight（聚合 1 new + 2 continuing）+ 2 resolved insights +
  untouched 文件 finding 排除 + 幂等重放 presentation 逐字节一致。
重复信息削减：用户首屏从 12 条近似检查 → 3 个概念级行动项（-75%）；同概念 10 处从 10 条重复 → 1 条主行动。
```

## 27.9 已知限制

``` text
1. Insight 覆盖范围 = diff 事实层（仅触达变更文件的 finding 参与 new/continuing 分类，§17 保持不动）；
   未触碰文件中的同概念存量风险不进入本轮 review 首屏（诚实边界，有 e2e 断言）。
2. resolved Insight 的证据属于基线快照：xray_evidence 按目标报告回源，无法读取已消失 finding 的源码摘录；
   presentation 与 nextAction 已显式提示。
3. occurrence 增加型升级（§12）未实现推断：continuing Insight 按定义无新增 occurrence，当前 diff 事实
   不足以可靠判断"存量概念 occurrence 变多"，按计划要求不自行推断。
4. exposure 的 occurrence 代理 = 非 ignored 绑定数（含 stale）；finding 已消失的位置在用户处理
   （复核/ignore/delete）前仍计入暴露——保守且透明，但可能高估已修复代码的暴露。
5. analyzer 当前所有规则 severity=medium，importance 的区分度主要来自 changeType/knowledgeStatus；
   规则 severity 精细化后无需改动 insight 层。
6. CLI/VSCode 尚无 review 视图；presentation 渲染器已在共享包中备好复用（本轮仅 MCP finish/read 输出）。
7. v0.1 存量 review 记录永久可读但无 insights（版本化读取）；同一快照的旧记录幂等复用时返回 0.1 原样。
8. knowledgeStatus 依赖本机 learning state；清空学习数据后 new-to-user 判定退化为"本轮事实"。
```

## 27.10 下一阶段

``` text
1. T301d 收口（独立于本轮）：Codex 上游恢复后双宿主实测 → V04-1 passed。
2. LLM 增强只能建立在 Insight 结构化事实层之上（§25）：为 insight 生成类比/解释增强时，输入用
   ReviewInsight + concept metadata，输出标注非确定性，不改变 facts/gate。
3. CLI/VSCode review 视图：复用 renderReviewPresentation（xray review <path> / VSCode 面板），
   同时评估 CLI 侧 gate policy 语义。
4. severity 精细化（规则级 high/low 校准）→ importance/排序自动受益；配合 V03-2 独立评估债一起做。
5. 观察 debt v2 实际使用反馈后再调 EXPOSURE_K/MAX_EXPOSURE_BONUS（改动需带测试与记录，D013 revisit_when）。
6. 若未来第二宿主进程需要共享 review 装配，packages/insights 已可按 D011 路径拆 engine-host。
```

------------------------------------------------------------------------

# 28. Definition of Done

只有同时满足以下条件，本任务才算完成：

-   [x] 本计划文件已保存进 code-xray 项目并纳入版本控制；（docs/plans/…，commit a1df029）
-   [x] 已有 failing/baseline fixture 证明旧版重复问题；（tests/fixtures/review-insight-v0.1-before.json + tests/insight-baseline.test.ts P1—P4）
-   [x] Concept-level Knowledge State 已实现；（packages/learning conceptKnowledgeStates + ConceptKnowledgeState）
-   [x] ReviewInsight domain model 已实现；（packages/protocol ReviewInsight + packages/insights）
-   [x] Insight Aggregator 已实现且不位于 MCP adapter；（packages/insights/engine.ts；tools/bridge 零聚合逻辑）
-   [x] 同 concept 多 Finding 能聚合为一个 Insight；（Case 1 单测 + e2e + after fixture：10 occurrences/1 insight）
-   [x] new / continuing / resolved 有明确语义；（changeType + evidenceScope=baseline 显式标注 + assertReviewRecord 强制）
-   [x] verified concept 在新位置出现不会被错误包装成"第一次不会"；（Case 3：knowledgeStatus=known，测试通过）
-   [x] suggested checks 已提升为 Insight-level next action；（每 Insight 一条主检查 + nextAction；12→3 实证）
-   [x] Cognitive Debt v2 已切换为 concept-level + 非线性 exposure；（debt-model-v2；Case 4：10 处 = 3.0 ≠ 20.0）
-   [x] Debt before / after 使用同一 modelVersion；（Case 13：单一函数即时计算 + agent-review 断言 v2）
-   [x] Review protocol migration / compatibility 策略已实现；（schema 0.2 + StoredReviewRecord 版本化读取 + legacy presentation 标记；无静默损坏）
-   [x] unknown / partial 不会被聚合逻辑错误转为 pass；（Case 8 三用例：partial→incomplete、unknown→needs_human、blocking 仅 enforce）
-   [x] review idempotency 保持；（Case 9：reused=true、reviewId/presentation 逐字节一致）
-   [x] stale review behavior 保持；（Case 10：stale=true、gate 降级 incomplete，原测试未改动仍通过）
-   [x] deterministic ordering 有测试；（Case 11：输入乱序 3 次运行 JSON 全等 + presentation 双渲染全等）
-   [x] human-friendly review presentation 已实现；（packages/insights/presentation.ts；finish/read 均返回；首屏纪律有测试）
-   [x] Raw Finding / Evidence 仍可完整 drill-down；（findingIds/evidenceIds/symbols 全保留 + legacy 字段 + xray_explain/xray_evidence 未动）
-   [x] 现有 verify / eval / bench 通过；（verify exit 0，158/158；oracle 通过；bench cold 0.90s/hot 0.84s/peak 335.5MiB）
-   [x] README / ARCHITECTURE / PRD / protocol docs 已按实际需要更新；（README/ARCHITECTURE/SUPPORT/工具描述/D013 已更新；PRD 无需改动的理由见 27.4-8）
-   [x] 本文"实施记录"已由 Claude Code 回写；（本章 27.1—27.10）
-   [x] 提供真实 before / after 结果，证明重复信息显著减少。（27.8：同场景 12 checks→3、debt 24.0→7.0、首屏重复 -75%）
