# Code X-Ray — T303 Developer Context & Relevance Gate v1

> **交付对象：Claude Code**
>
> 本文档是 Code X-Ray 下一阶段的直接执行计划。请先阅读整个文档，再检查当前仓库实际实现，以仓库现状为准落地；不要凭本文档假设不存在的文件、模块或 API。
>
> **核心目标：让 Code X-Ray 越来越懂“什么时候应该介入”，而不是让它参与每一次 Coding。**
>
> **用户体验（UX）是一等公民。** 如果技术上正确，却让用户感觉工具一直在打扰、变慢、频繁询问，仍视为未完成。

---

## 1. 背景

Code X-Ray 当前已经作为 MCP 接入 Claude Code / Codex，并具备：

```text
Evidence → Finding → Concept → Insight → Human / Agent Presentation
```

T302 已完成 Review Insight Layer，使原始 Finding 能够聚合为更高质量的 ReviewInsight。

但现在还有一个更基础的问题：

> **Code X-Ray 不应该默认参与每一次 AI Coding。**

例如用户让 Claude Code：

```text
给 React Button 增加 loading 状态
```

这是典型低风险、常规前端任务。

如果流程变成：

```text
Claude Code → Code X-Ray → 分析 → 返回 → Claude Code
```

即使最终没有任何有价值的信息，也会增加：

- MCP tool call
- Agent context
- Token 消耗
- Claude 阅读成本
- 用户等待时间
- 工具噪声

因此 T303 建立：

```text
Current Task
+
Project Context
+
Developer Context
+
Knowledge State
+
Change Risk
        ↓
Relevance Gate
        ↓
SKIP / LIGHT / FULL
```

---

# 2. 产品目标

T303 完成后，Code X-Ray 应该表现为：

> **需要我的时候，我认真工作；不需要我的时候，我安静消失。**

### 普通任务

```text
用户：把 Button 增加 loading 状态。
Claude：直接开发。
Code X-Ray：SKIP
```

用户不应该被迫看到复杂 X-Ray 过程。

### 有一定风险的任务

```text
用户：给 React 页面增加权限控制。

Code X-Ray：LIGHT

只检查：
- authorization boundary
- existing auth abstraction
- relevant symbols
```

不要扫描整个仓库。

### 高风险任务

```text
用户：修改订单支付状态流转。

Code X-Ray：FULL

重点：
- transaction boundary
- idempotency
- state transition
- consistency
- historical risk
```

---

# 3. 核心原则

## 3.1 不要为了“更智能”而增加 Token

Relevance Gate 必须 **deterministic-first**。

禁止在 Code X-Ray 内部增加 LLM 来判断：

> “这次要不要调用 X-Ray？”

否则会变成：

```text
为了节省 Token
→ 先调用 LLM
→ 判断是否省 Token
```

本末倒置。

---

## 3.2 用户画像不是事实

用户第一次说：

```text
我是高级 Java 工程师。
```

只能记录：

```text
source = self-reported
```

不能直接变成：

```text
Java = trusted
Java = SKIP
```

Code X-Ray 必须通过长期观察逐渐建立可靠的 Developer Context。

---

## 3.3 不做能力评分

禁止：

```text
React = 92
Java = 85
Spring = 78
```

也不要把 `level × confidence` 当能力分数。

应该表达：

```text
React
source: observed
confidence: high
freshness: fresh
evidenceCount: 37
```

语义是：

> 系统有充分证据认为用户近期长期使用 React。

不是：

> 系统认为用户 React 能力是 93 分。

---

## 3.4 Skill ≠ Knowledge

例如：

```text
React
```

只是宽泛技能。

真正影响 Review 的可能是：

```text
react.hooks
react.state-management
react.rendering
react.concurrent-update
```

T303 不扩展新的 Semantic Ontology，但必须正确连接现有 T302 Concept Knowledge State。

---

## 3.5 Unknown ≠ 不会

如果没有证据：

```text
knowledge = unknown
```

不能解释成：

```text
user does not know
```

而是：

> 当前没有足够证据。

---

# 4. T303 Domain Model

建议将现有 DeveloperProfile 演进为：

```text
DeveloperContext
├── Identity
├── Roles
├── Skills
├── Domains
├── Preferences
├── Observations
├── Evidence
└── Knowledge State References
```

建议核心模型类似：

```ts
type DeveloperContext = {
  schemaVersion: string;
  identity?: DeveloperIdentity;
  roles: DeveloperRole[];
  skills: SkillAssessment[];
  domains: DomainAssessment[];
  preferences: DeveloperPreference[];
  observations: DeveloperObservation[];
  evidence: KnowledgeEvidence[];
  updatedAt: string;
};
```

具体字段必须以当前仓库现有模型为基础设计，不要机械照抄本文。

---

# 5. Evidence Provenance

至少支持：

```ts
type EvidenceSource =
  | "self-reported"
  | "observed"
  | "inferred"
  | "verified"
  | "unknown";
```

- `self-reported`：用户主动声明，可信度较低。
- `observed`：来自真实项目 / Coding 行为，是长期 Context 的核心来源。
- `inferred`：系统推断，必须明确标记，不能伪装成事实。
- `verified`：用户通过明确行为 / 检查 / 学习验证确认。
- `unknown`：证据不足。

---

# 6. Freshness

Developer Context 必须支持新鲜度。

例如：

```text
React
observed: yesterday
```

和：

```text
React
observed: 18 months ago
```

不能完全等价。

第一版至少提供：

```text
fresh
aging
stale
```

如果当前仓库已经存在类似语义，应优先复用。

T303 不要求复杂机器学习或复杂时间衰减模型。

---

# 7. 与 T302 Knowledge State 的边界

这是本阶段必须明确的架构边界。

```text
Developer Context
       │
       ├── Role
       ├── Skill
       ├── Domain
       ├── Preference
       └── Evidence
               │
               ▼
      Developer Knowledge
               │
               ▼
       Concept Knowledge State
               │
               ▼
          Knowledge Gap
               │
               ▼
         ReviewInsight
```

不要在 DeveloperContext 里复制：

```text
knowsTransaction = true
```

之类的概念知识系统。

T302 已经有 Concept Knowledge State，T303 应该复用。

---

# 8. Relevance Gate

建立确定性的 Relevance Gate：

```ts
shouldAnalyze(input): RelevanceDecision
```

输出：

```ts
type RelevanceDecision =
  | {
      decision: "skip";
      reasons: string[];
    }
  | {
      decision: "light";
      reasons: string[];
      targets: AnalysisTarget[];
    }
  | {
      decision: "full";
      reasons: string[];
      targets?: AnalysisTarget[];
    };
```

实际 API 名称可根据仓库现有架构调整。

---

# 9. SKIP

典型条件：

```text
低风险
+
常规任务
+
开发者有较强 observed familiarity
+
没有明显高风险概念
+
没有历史风险信号
```

例如：

- React Button
- CSS 调整
- 普通 UI
- 简单表单
- 普通 TypeScript 类型修改
- 常规组件重构

输出：

```json
{
  "decision": "skip"
}
```

**SKIP 的语义不是“代码一定正确”。**

而是：

> 这次任务不值得消耗 X-Ray 分析成本。

---

# 10. LIGHT

典型场景：

```text
任务相关
+
风险中等
+
可以缩小分析范围
```

例如：

```text
React 页面增加权限控制
```

只检查：

```text
authorization boundary
existing auth abstraction
relevant symbols
```

不要扫描整个项目。

---

# 11. FULL

进入 FULL 的典型条件：

### 高风险领域

```text
payment
transaction
security
authentication
authorization
concurrency
distributed-system
data-consistency
migration
```

### 知识状态未知

例如：

```text
transaction-boundary
knowledge = unassessed
```

### 影响范围大

例如：

- 修改核心 domain
- 修改公共 API
- 修改共享基础设施
- 跨多个 module
- 大规模 migration

### 历史风险

如果历史 Evidence 表明某概念过去频繁产生问题，可以提高分析级别。

---

# 12. Relevance Gate 安全原则

不要让单一弱证据直接决定：

```text
SKIP
```

例如：

```text
self-reported:
“我很熟 React”
```

不能直接：

```text
React → SKIP
```

应该综合：

```text
Developer Context
+
Evidence Provenance
+
Freshness
+
Current Task
+
Project Context
+
Change Risk
+
Knowledge State
```

---

# 13. Dynamic Exemption

长期运行后，可以形成：

```text
Developer
  ↓
Repeated observed familiarity
  ↓
Low risk
  ↓
Stable history
  ↓
Default exemption
```

例如：

```text
frontend/react/*
frontend/typescript/*
```

默认不进行深度 X-Ray。

但这不是永久白名单。

如果出现：

```text
React
+
WebSocket
+
concurrency
```

仍然可以：

```text
LIGHT / FULL
```

即：

> 熟悉技术 ≠ 熟悉当前问题。

---

# 14. MCP 交互设计

建议增加明确的 relevance 能力，例如：

```text
review_relevance
```

输入：

```ts
{
  task,
  changedFiles,
  projectContext
}
```

输出：

```ts
{
  decision: "skip" | "light" | "full",
  reasons: string[],
  targets?: AnalysisTarget[]
}
```

但必须先检查当前 MCP API 是否已有类似能力。

**不要为了 T303 重复造 API。**

---

# 15. 最重要的 UX 原则

## 15.1 默认安静

对于 SKIP：

不要让 Claude / 用户看到一大段：

```text
Code X-Ray skipped because...
```

如果 Agent workflow 可以直接跳过，就直接跳过。

---

## 15.2 不打断开发流程

禁止正常 Coding 路径出现：

```text
请输入你的技术水平
请选择你的 React 熟练度
请确认你是否了解 transaction
```

---

## 15.3 Onboarding 最小化

首次运行：

```text
Welcome to Code X-Ray

Tell us your role (optional):
> Frontend Developer

[Enter to skip]
```

角色也必须允许跳过。

不要强制填写完整 Profile。

---

## 15.4 允许自然修正

用户可以随时表达：

```text
其实我不太熟 Spring Transaction。
```

系统应记录：

```text
Correction Evidence
```

而不是覆盖历史 Evidence。

---

## 15.5 不让用户感觉被“画像”

不要频繁告诉用户：

```text
我们观察到你最近使用 React 37 次。
```

这会产生监控感。

用户真正需要的是：

> 工具越来越懂我，但不会一直提醒我它在观察我。

---

# 16. Human UX 与 Agent UX 分离

### Agent UX

保持极简：

```text
SKIP
```

或者：

```text
LIGHT
targets:
- authorization boundary
```

或者：

```text
FULL
targets:
- transaction boundary
- idempotency
```

### Human UX

只有用户主动询问或 debug 时才展示详细理由：

```text
Why was this skipped?

- routine frontend change
- strong observed familiarity
- low change risk
- no relevant historical risk
```

建议未来提供：

```text
xray explain relevance
```

或等价诊断能力。

---

# 17. Passive Context Growth

不要依赖一次性 Profile Questionnaire。

改成：

```text
Coding Event
    ↓
Observation
    ↓
Evidence
    ↓
Developer Context
```

例如长期观察：

```text
30 个 React 项目变更
20 个 TypeScript 变更
15 个 Next.js 变更
```

逐步形成：

```text
React       observed / high
TypeScript  observed / high
Next.js     observed / medium-high
```

只记录对 Context 有价值的结构化信息，不记录完整源码行为日志。

---

# 18. Explicit Correction

支持：

```text
用户：
我其实不熟 Spring Transaction。
```

记录：

```text
source = self-reported
type = correction
```

并保留历史 Evidence。

最终状态由 Evidence 聚合产生。

不要直接：

```text
delete old knowledge
```

---

# 19. Migration

将：

```text
developer-profile-v1
```

迁移为：

```text
developer-context-v1
```

旧字段：

```text
role
skill
level
confidence
evidence
```

应尽量保留，但重新定义语义。

例如旧：

```text
level = expert
```

如果只是用户填写，应迁移为：

```text
source = self-reported
confidence = low
```

如果旧 Evidence 已经能够证明 observed / verified，则按照真实 provenance 迁移。

**不要伪造 provenance。**

---

# 20. Privacy / Local-first

Developer Context 是用户工作上下文。

T303 必须：

- 默认本地保存
- 不上传用户画像
- 不上传完整源码
- 不建立远程用户画像数据库
- 不为了 Context 引入云端 AI
- 遵循当前项目已有隐私边界

---

# 21. 与 T302 集成

最终：

```text
Developer Context
       ↓
Knowledge State
       ↓
Knowledge Gap
       ↓
ReviewInsight
       ↓
Human / Agent Presentation
```

必须保证：

- 不破坏现有 Insight Aggregator
- 不破坏 Cognitive Debt
- 不重复实现 Knowledge State
- 不让 MCP 自己维护另一套 Knowledge 逻辑

---

# 22. Testing

至少覆盖：

| Scenario | Expected |
|---|---|
| React Button | SKIP |
| CSS modification | SKIP |
| TypeScript type rename | SKIP / LIGHT |
| React auth change | LIGHT |
| New library integration | LIGHT |
| Payment change | FULL |
| Transaction change | FULL |
| Unknown architecture | LIGHT / FULL |
| High-impact shared module | FULL |
| Stale knowledge | LIGHT / FULL |
| Self-reported only | 不能直接 SKIP |
| Explicit user correction | Context 更新 |
| Long-term observed familiarity | 可产生 SKIP |
| Familiar technology + high-risk concept | 不得盲目 SKIP |

---

# 23. E2E Acceptance

## Case A — Frontend routine

```text
Developer:
Frontend

Task:
给 React Button 增加 loading
```

Expected：

```text
SKIP
```

并且：

- 不运行完整 X-Ray
- 不产生大量 MCP 输出
- Claude 可以直接继续开发
- 用户无额外交互

---

## Case B — Frontend authorization

```text
Task:
给 React 页面增加权限控制
```

Expected：

```text
LIGHT
```

Targets：

```text
authorization boundary
auth abstraction
relevant symbols
```

---

## Case C — Payment

```text
Task:
修改订单支付状态流转
```

Expected：

```text
FULL
```

---

## Case D — Self-report only

```text
User:
我是 Spring 专家。
```

Expected：

```text
Spring:
source = self-reported
```

不得直接形成高可信 SKIP。

---

## Case E — Correction

```text
User:
其实我不熟 Spring Transaction。
```

Expected：

- 记录 correction evidence
- 后续相关任务不因为旧 profile 直接 SKIP
- 保留历史 Evidence
- 最终状态可追溯

---

# 24. Metrics

T303 必须建立基础指标。

## 24.1 Skip Rate

```text
SKIP / Total Relevant Decisions
```

## 24.2 Avoided Analysis

```text
Potential Full Analysis - Actual Full Analysis
```

## 24.3 False Skip Rate

被 SKIP 后发现存在重要问题的比例。

这是核心安全指标。

## 24.4 Useful Analysis Rate

```text
Useful LIGHT/FULL / All LIGHT/FULL
```

## 24.5 Token / Context Savings

对比：

```text
没有 Relevance Gate
```

与：

```text
有 Relevance Gate
```

的实际 Agent tool-call / context 成本。

目标不是追求某个固定百分比，而是通过真实 E2E 数据证明：

> 常规低风险任务不会因为 Code X-Ray 被额外分析而产生明显成本。

---

# 25. Implementation Phases

## Phase 0 — Repository Audit

先检查：

- 当前 DeveloperProfile 实现
- CLI onboarding
- Profile persistence
- MCP tools
- Review flow
- Knowledge State
- Knowledge Gap
- Insight Aggregator
- 当前测试
- 当前 E2E fixture

输出：

```text
现状 → 目标架构
```

不要未经检查直接重构。

---

## Phase 1 — Domain Boundary

建立 / 调整：

```text
DeveloperContext
DeveloperObservation
KnowledgeEvidence
SkillAssessment
```

明确：

```text
Developer Context
vs
Concept Knowledge State
```

要求：

- 不复制 T302 Knowledge State
- 不增加能力评分
- 保留现有数据兼容性
- 模型语义清晰
- 所有状态有 provenance

---

## Phase 2 — Provenance + Freshness

实现：

```text
self-reported
observed
inferred
verified
unknown
```

以及：

```text
fresh
aging
stale
```

要求：

- provenance 可追溯
- freshness 可计算
- 不把 unknown 当作不会
- 不把 self-reported 当作 verified

---

## Phase 3 — Migration

实现：

```text
developer-profile-v1
        ↓
developer-context-v1
```

要求：

- 可升级
- 可重复执行
- 不丢失旧 Evidence
- 不伪造来源
- 有 migration tests
- 老版本数据可以正常读取

---

## Phase 4 — Passive Observation

建立：

```text
Coding Event
↓
Observation
↓
Evidence
↓
Context Projection
```

注意：

**只采集 Relevance Gate 真正需要的数据。**

不要建立完整的用户行为追踪系统。

优先观察：

- 技术栈
- 项目领域
- 重复使用的技术
- 与高风险概念相关的真实开发行为
- 用户显式修正
- 明确验证结果

---

## Phase 5 — Relevance Gate

实现：

```text
SKIP
LIGHT
FULL
```

第一版优先：

```text
Rule-based
+
Explainable
+
Deterministic
```

不要引入：

```text
LLM
Machine Learning
Remote Ranking Service
```

---

## Phase 6 — MCP Integration

将 Gate 接入 Claude Code / Codex workflow。

目标：

```text
普通任务 → SKIP
中等任务 → LIGHT
高风险任务 → FULL
```

同时确保：

> MCP tool description 本身不要诱导 Agent 在所有任务中调用完整 X-Ray。

需要重新审查工具描述，让 Agent 清楚知道：

```text
Use Code X-Ray when analysis is relevant.
Do not invoke full analysis for routine low-risk changes.
```

具体 wording 以实际 MCP contract 为准。

---

## Phase 7 — T302 Integration

接入：

```text
Developer Context
↓
Knowledge State
↓
Knowledge Gap
↓
ReviewInsight
```

重点：

- Context 为 Knowledge Gap 提供信号
- Knowledge State 提供概念级真实状态
- ReviewInsight 消费最终结果
- 不重复计算同一个知识状态

---

## Phase 8 — UX / E2E Hardening

重点验证：

- 是否打扰用户
- 是否增加不必要交互
- 是否产生大量 MCP 输出
- 是否让 Agent 感觉变慢
- 是否出现错误 SKIP
- 是否出现过度 FULL
- 是否能够解释决策
- 是否能自然恢复错误判断

---

# 26. Definition of Done

以下全部满足才算完成：

- [ ] Developer Profile v1 已迁移
- [ ] Self-reported 不再被视为事实
- [ ] Evidence provenance 完整
- [ ] Freshness 可用
- [ ] Developer Context 与 Knowledge State 边界明确
- [ ] 首次 onboarding 可跳过
- [ ] 支持被动积累 Context
- [ ] 支持用户显式修正
- [ ] Relevance Gate 已实现
- [ ] SKIP / LIGHT / FULL 均有测试
- [ ] Gate 不依赖 LLM
- [ ] MCP 可以利用 Gate
- [ ] 普通前端任务可以 SKIP
- [ ] 高风险任务可以 FULL
- [ ] T302 Insight Layer 不被破坏
- [ ] 有 E2E evidence
- [ ] 有 Skip Rate / False Skip / Token Saving 指标
- [ ] 默认 local-first
- [ ] 无能力评分
- [ ] 无强制 Profile Questionnaire
- [ ] 正常 Coding 流程无额外交互
- [ ] SKIP 默认安静
- [ ] LIGHT 只提供必要信息
- [ ] FULL 才提供完整分析
- [ ] 用户能够主动解释 / 调试 Relevance 决策

---

# 27. 明确禁止的过度设计

T303 不做：

```text
❌ Code X-Ray 内置 LLM
❌ AI competency score
❌ 完整 Web Profile UI
❌ 云端用户画像
❌ Semantic Skill Ontology
❌ 大规模 Skill 自动聚类
❌ 重做 T302 Insight Aggregator
❌ 重做 Cognitive Debt
❌ 复杂机器学习 Relevance Model
❌ 复杂用户行为追踪
❌ 强制 onboarding
```

---

# 28. Claude Code 执行要求

执行本计划时遵循：

### 1. 先审计，再修改

先检查当前仓库真实实现。

不要根据本文档猜文件路径。

### 2. 优先复用现有 Domain

尤其是：

```text
T302 Concept Knowledge State
ReviewInsight
Cognitive Debt
```

不要平行建立第二套体系。

### 3. 小步提交

建议：

```text
Phase 1 commit
Phase 2 commit
Phase 3 commit
...
```

每个 commit 保持可验证。

### 4. 每阶段运行测试

至少：

```text
unit
integration
E2E
```

### 5. 不因为测试方便而牺牲 UX

如果某个设计：

```text
技术上简单
```

但：

```text
用户体验变差
```

不要直接采用。

### 6. 不要为了满足本文档而过度重构

如果当前仓库已经有等价能力：

> 优先复用、迁移和收敛，而不是重新创建。

---

# 29. 最终产品形态

Code X-Ray 最终应该从：

```text
“一个会分析代码的 MCP”
```

进化成：

```text
“一个知道什么时候应该分析代码的 Agent Infrastructure”
```

最终体验：

```text
                  Claude Code
                       │
                       ▼
              ┌─────────────────┐
              │ Relevance Gate  │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
        SKIP         LIGHT         FULL
          │            │            │
          │            ▼            ▼
          │       Targeted       Full X-Ray
          │         X-Ray            │
          │            │             │
          └────────────┴─────────────┘
                       │
                       ▼
                 Insight Layer
                       │
              ┌────────┴────────┐
              ↓                 ↓
            Agent             Human
```

Gate 的输入：

```text
Developer Context
+
Project Context
+
Current Task
+
Change Risk
+
Knowledge State
+
Historical Evidence
```

最终形成 Code X-Ray 的核心行为：

> **低价值任务不打扰。**
>
> **中等风险任务精准介入。**
>
> **高风险任务认真分析。**
>
> **用户不需要理解内部机制，也不需要不断填写画像。**
>
> **系统通过长期真实使用逐渐理解开发者，而不是一开始假装“知道用户是谁”。**

---

# 30. Claude Code 开始执行前的最终检查

执行前请回答：

```text
1. 当前 DeveloperProfile 在哪里？
2. 当前 onboarding 在哪里？
3. 当前 Knowledge State 在哪里？
4. 当前 MCP tool 定义在哪里？
5. 当前 Review / Insight flow 在哪里？
6. 哪些部分可以复用？
7. 哪些地方存在重复模型？
8. 如何最小化改动实现 T303？
9. 当前 MCP 调用链中，哪些路径可能导致不必要的 Token 消耗？
10. 如何保证 SKIP 对用户完全无感？
```

然后再开始实施。

不要先写代码再解释架构。

先给出：

```text
Repository Audit
→ Proposed Change Set
→ Implementation Plan
→ Tests
→ Implementation
→ E2E Evidence
```

最终报告必须包含：

```text
Changed Files
Architecture Changes
Migration Result
Relevance Decision Examples
Test Results
E2E Results
UX Validation
Token / Tool-call Impact
Known Limitations
```

---

# 31. 最高优先级 UX 验收标准

这是本计划的硬性要求。

## 31.1 用户不应该因为 Code X-Ray 感觉 Claude Code 变慢

如果：

```text
普通前端任务
```

触发了大量：

```text
MCP call
+
扫描
+
Finding
+
Insight
```

即使功能正确，也视为 UX failure。

---

## 31.2 用户不应该被迫维护自己的画像

不能要求用户：

```text
填写技能
修改技能等级
定期更新技能
确认知识状态
```

系统应该尽可能自己学习。

---

## 31.3 用户不应该被“监控感”包围

默认不要展示：

```text
我们观察到你最近写了 47 次 React。
```

而应该让用户直接获得更好的体验：

```text
普通 React 任务 → 安静通过
高风险任务 → 在需要的时候介入
```

---

## 31.4 错误判断必须可恢复

如果 Code X-Ray：

```text
SKIP
```

但后来发现应该分析：

- 不应该让整个系统进入错误状态
- 应记录用于后续改进的 Evidence
- 下一次相似任务可以提高分析级别

如果频繁：

```text
FULL
```

但用户一直不需要：

也应该能够逐渐降低干预。

---

## 31.5 用户控制权必须保留

未来应该允许用户表达：

```text
这类任务以后不用检查。
```

或者：

```text
这类任务以后都检查。
```

第一版不需要做完整 UI，但应该在 Domain Model 中为 preference / correction 预留能力。

---

# 32. T303 的最终成功标准

不要用：

```text
“我们新增了多少代码”
“我们新增了多少 Profile 字段”
“我们新增了多少规则”
```

判断 T303 成功。

真正应该看：

```text
Claude Code 普通开发
        ↓
Code X-Ray 是否足够安静？
        ↓
高价值任务
        ↓
Code X-Ray 是否及时介入？
        ↓
介入后
        ↓
Insight 是否足够少、准、有行动价值？
```

最终目标：

> **让 Code X-Ray 成为 Claude Code 背后一个“几乎感觉不到，但关键时刻非常有用”的智能代码基础设施。**
