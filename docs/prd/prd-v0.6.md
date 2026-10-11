# Code X-Ray v0.6 PRD

版本：v0.6（定稿后冻结，不回写；落盘 `docs/prd/prd-v0.6.md`）
日期：2026-10-11
主题：**"讲懂"地基**。M1 引擎抽象 → M2 链路摘要 9 环 → M3 学习闭环接链路。

背景：v0.5 收版后确立立项之本（见 `docs/vision.md`）——"AI 负责写，人负责懂；我们让'懂'变便宜。"为 AI 时代被迫全栈的工程师（前端转全栈、单语言后端写多语言）解决"写得出、跑得通，看不懂"的问题。优先级重排："讲懂"变主角，"找坑"变配角；多语言变必经之路；explain/learn 变主角。

## 0. 非目标与禁区

- 不新增 pitfall 规则；6 条旧规则原样保留（降为"风险视角"），不改语义。
- 不新增 Surface；MCP 9 工具不增不减（M2 的链路摘要复用 `xray_review_finish` 的 presentation，加可选字段，不破坏 schema 0.2）。
- `evals/` 冻结文件只读；改完 `npx tsx evals/run.ts` 与基线一致。
- `vendor/`、`fixtures/`、`artifacts/` 不碰。

## 1. M1：引擎抽象（无用户可见变化）

- 现状：`packages/analyzer-java` 被 engine 直接依赖，写死 Java。
- 要求：新增 `packages/analyzer`（或同等）定义 `Analyzer` 接口——`parse(file)→CST`、`query` 等统一方法；`packages/analyzer-java` 改为实现该接口；engine facade 改为依赖接口。接口设计兼容未来 tree-sitter 接入（本迭代不引入 tree-sitter，不换 java-parser，零行为变化）。
- ADR-004（引擎抽象）已由 yiyi 撰写，随本 PRD 交付，agent 原样落盘 `docs/decisions/ADR-004-engine-abstraction.md`，不再另写。
- 验收（AC1）：`npm run verify` 通过；`npx tsx evals/run.ts` 与基线一致；engine 内无对 analyzer-java 的直接 import（grep 验证）。

## 2. M2：链路摘要 9 环（第一个"讲懂"能力，Java 先行）

- 输入：`scan --base <ref>` 的变更文件集合；先做**单入口链路**（一个变更入口一条链），跨入口聚合后置。
- 输出：对每个变更入口，按以下 9 环输出摘要（顺序即阅读顺序）：
  1. 入口：哪个 HTTP 接口 / `@Scheduled` / MQ listener 被触发
  2. 参数与校验：入参、validation 注解（对应调用方"要传什么"）
  3. 调用链：方法调用序列 A→B→C（跨文件）
  4. 分支与异常路径：关键 if/else、throw、谁接住（`@ExceptionHandler`）
  5. 数据触及：**读/写区分**——Repository 方法 → 表/实体，读和写分别列
  6. 副作用：MQ 发送、外部 HTTP 调用、Redis/缓存写入（线性读代码最容易漏的一环）
  7. 事务边界：`@Transactional` 位置、包裹的是哪几步、是否原子
  8. 返回：DTO 还是实体（对应调用方"拿到什么"）
  9. 为什么这样写：**只做推测，必须显式标"推测/unknown"**，不瞎编
- 诚实要求：每环带证据回源（path:line）；调用链在无类型系统约束下精度有限——接口/虚方法/反射/动态代理一律标 unknown，**验收只要求"确定的链准确、不确定的标出"，不要求全覆盖**。
- 呈现：CLI `scan` 人类可读输出新增"链路摘要"节；MCP `xray_review_finish` 的 presentation 加入链路摘要（schema 加可选字段）。
- 概念锚点（为 M3 准备）：每环涉及的概念带 `conceptId` + 当前学习三态。
- 验收（AC2）：在 petclinic（必要时加 fixtures 构造案例）上跑出链路摘要；人工抽查 3 条链路——确定的环准确、不确定的环已标 unknown；无 unknown 泄漏（标了 unknown 的不计入正确宣称）。

## 3. M3：学习闭环接链路（最小版）

- 链路摘要的每环概念可直接认领：`xray learn` 支持从链路的 `conceptId` 生成学习卡（链路输出给出可执行的认领命令）。
- `verified` 仍只能经 CLI 显式事件标记（红线不变：Agent 不能替用户确认掌握）。
- `xray debt` 输出加一句"该概念在你的链路摘要里出现过 N 次"（债务从分数仪表盘变为链路覆盖率视角）；debt 公式本身不动。
- 验收（AC3）：走一遍"链路→认领学习卡→学习→verified"闭环；debt 输出含链路出现次数。

## 4. 文档（本迭代同步）

- `docs/vision.md` 落盘（全文见 §6，agent 原样写入）。
- `docs/decisions/` 落盘 ADR-001~004（随本 PRD 交付，agent 原样写入，不再另写）。
- README 第一句话更新为新定位："AI 负责写，人负责懂——帮 AI 时代的工程师看懂 AI 写的代码（本地优先，当前支持 Java）"，原"Java 代码理解工具"表述替换。
- `docs/architecture.md` 更新：引擎分层图体现 Analyzer 接口；Surface 策略节不变。
- 交付后 `development-milestones.md` 追加 v0.6 一行。

## 5. 执行步骤

1. dry-run：输出变更清单。
2. 按 M1 → M2 → M3 顺序执行（M2 依赖 M1 的接口；M3 依赖 M2 的 conceptId）。
3. `npm run verify` 通过；`npx tsx evals/run.ts` 与基线一致；全仓库交叉引用检查。
4. 步骤 4 的文档同步。
5. 单 commit（过大可按 M1/M2/M3 拆三个），message 规范，body 列关键变更。

## 6. docs/vision.md 全文（agent 原样落盘）

```markdown
# Code X-Ray 立项之本（Vision）

## 一句话
AI 负责写，人负责懂；我们让"懂"变便宜。

## 问题
AI 时代，转全栈已是必然。前端能用 AI 写后端代码，后端也要开始写别的语言。
人能用 AI 写出代码，能测试它跑通，但本质上还是不懂——"写得出、跑得通，看不懂"。
这是我们要解决的问题，为包括创始人在内的这群人。

## 不做什么
- 不替人写代码（那是 Coding Agent 的事）。
- 不替人下"有没有 bug"的结论（测试的事；我们只给检查点）。
- 不瞎编：不懂就说不懂。帮人理解的工具一旦瞎编，比不帮更害人。
- 不碰用户代码隐私：本地优先，默认离线零外发。

## 怎么做（优先级）
1. 讲懂 > 找坑：先回答"这段代码干了什么"，再顺带指出"哪里值得检查"。
2. 证据回源：讲的每句话都能一点回到代码行号。
3. 语言无关：Java 只是起点，引擎为多语言而建。
4. 学习是链路的副作用：在理解代码的过程中学，而不是先学再理解。

## 成功标准
让一个人花 10 分钟看懂原来要 2 小时才能看懂的 AI 生成代码。
（不是"不用看就懂"——理解这件事，工具只能把成本降到最低。）
```

## 7. 验收标准（yiyi 逐项核对）

- [ ] AC1：verify 通过；evals 与基线一致；engine 无对 analyzer-java 的直接 import；ADR 已落盘
- [ ] AC2：链路摘要 9 环可跑通；抽查 3 条链路——确定的准确、不确定的已标 unknown；schema 0.2 未破坏（旧字段行为不变）
- [ ] AC3：链路→学习卡→verified 闭环走通；debt 输出含链路出现次数；verified 仍需 CLI 显式标记
- [ ] AC4：`docs/vision.md` 与 §6 全文一致；`docs/decisions/` 下 ADR-001~004 与交付一致；README 第一句话已更新；architecture 引擎分层图已更新
- [ ] AC5：milestones 已追加 v0.6；PRD 已落盘 `docs/prd/prd-v0.6.md`；commit message 规范

## 8. 风险

- R1：调用链精度天花板（无类型系统）——验收口径已收敛为"确定的准确、不确定的标出"，不追求全覆盖。
- R2：M1 重构零行为变化——evals + verify 双保险；M2 建在新接口上，如接口不稳先回滚 M1。
- R3：scope 膨胀——"为什么这样写"只做推测+unknown，不做意图深挖；多语言本迭代只做接口，不接 tree-sitter。
- R4：v0.6 交付后，用户在公司主要项目真实跑两周验证"讲没讲懂"；personal-language-agent（全 AI 项目，TypeScript）记为多语言 dogfood 候选，等 TS 支持后再用。
