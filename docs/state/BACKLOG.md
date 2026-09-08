# Backlog：任务状态的唯一来源

当前 revision：r11（r10 L009；r11 L010 发布准备：AC01—AC12 机器可验项全映射 E014、独立检查有保留通过并修复保留项）。v0.1 必需任务 9/10 done（T001—T009）；T010 in_progress——仅剩 AC12 真实用户试用（Human Gate）与发布操作授权。拆分任务须保留原 ID、依赖和 AC 追踪。

状态与更新规则见 [HANDOFF_PROTOCOL](../HANDOFF_PROTOCOL.md)，验收原文见 [PRD](../PRD.md)。单个任务只负责其交付范围内的 AC 子项，并在 Evidence 写明覆盖边界；完整 AC 的跨任务汇总由 T010 验收。不得将下游能力作为上游任务的隐含完成条件。

## v0.1 执行队列

| ID | 任务 | 状态 | 依赖 | AC | 优先级 |
|---|---|---|---|---|---|
| T001 | 目标仓库与开发基线、首个恢复 checkpoint | done | 无 | AC11 | P0 |
| T002 | cliff 真实依赖与离线 CLI 接入 spike | done | T001 | AC07、AC09、AC10 | P0 |
| T003 | Protocol、Engine Interface 与领域证据契约 | done | T001 | AC02、AC10 | P0 |
| T004 | Git ChangeSet、文件边界与离线隐私基线 | done | T003 | AC01、AC02、AC09 | P0 |
| T005 | Java/Spring/JPA 结构分析与 parser 能力评估 | done | T003 | AC03、AC04 | P0 |
| T006 | 有界风险规则、静态路径、变更摘要与首批 evals | done | T004、T005 | AC02、AC03、AC04 | P0 |
| T007 | cliff CLI 纵向用户路径与交互打磨 | done | T002、T006 | AC01、AC07、AC10 | P0 |
| T008 | Contextual Learning、个人状态与 Cognitive Debt | done | T007 | AC05、AC06、AC09 | P0 |
| T009 | 可选 LLM 增强、最小外发与失败回退 | done | T008 | AC02、AC08、AC09 | P0 |
| T010 | 整体验收、实用评估、接力演练与发布准备 | in_progress | T007、T008、T009 | AC01—AC12 | P0 |

依赖允许并行：T002 与 T003；T004 与 T005。早期可做草图和 fixture 验证，但不能越过未完成依赖宣称下游 done。T007 可先跑通最小摘要再在 T008 中扩展学习/债务；T008 完成后才具备完整 v0.1 用户闭环。不得把 T007 的中间结果当最终发布。

## 任务完成条件

### T001 — 仓库与恢复基线

- 价值：新 Agent 能定位正确项目并开始改动。
- 输入：本包与目标目录；先读 CURRENT 的 required_reads。
- 交付：真实仓库/环境记录；适配或创建最小骨架；保留已有规则与用户变更；首个 owner/session/checkpoint。
- 验证：确认 Git 根目录不是意外父仓库，检查文件链接、状态一致性与可用工具；运行骨架中实际存在的最小检查。不存在的命令记未配置，不编造测试。
- Done：基线足以开展 T002/T003，Evidence 记录实际输出；若工具不可用，登记局部阻塞。

### T002 — cliff 接入 spike

- 输入：[CLIFF_INTEGRATION](../CLIFF_INTEGRATION.md) 与锁定源码。
- 交付：可复现安装来源、版本/commit、依赖锁文件；真实 cliff 入口的最小运行；cliff 仅限 Surface。
- 验证：默认零网络请求、非 TTY 不等待输入、stdout/stderr、取消、错误退出、配置优先级和安全配置来源；不从被扫描项目执行插件或配置代码。确认包产物可用及分发授权依据。
- Done：真实 smoke 证据与差距处理 Decision；不得用 mock cliff 通过其集成验收。

### T003 — 统一领域契约

- 交付：版本化且语言中立的 Protocol；分析请求、结果、EvidenceRef、错误/partial、能力声明；Engine 不依赖 CLI。
- 验证：schema 正反例、序列化、无效引用拒绝；Engine 可由独立消费者调用；CLI/IDE 类型不渗入领域契约。
- Done：AC02/AC10 对应契约通过，重要选型记录 Decision。未来 Surface 可以复用，但不提前实现所有 transport。

### T004 — ChangeSet 与隐私

- 交付：显式 diff 范围、目标快照、staged/working tree、证据定位、敏感路径/越界/符号链接限制、默认本地处理。
- 验证：无变更、非 Git 目录、未跟踪、删除、重命名、二进制、编码/大文件、不安全路径和扫描过程中变化；私密输入不得进入日志/发送队列。Git 不可用只限制 diff，目录 scan 仍可使用。
- Done：ChangeSet/排除/partial 可追溯，不修改被分析项目，不依赖云服务。

### T005 — Java 结构与框架 Adapter

- 交付：parser 候选与比较证据；声明的 Java/Spring/JPA 版本/语法能力矩阵；symbol、annotation、静态调用边和未解析原因。
- 验证：真实订单 fixture 的正/负/未知场景；不运行被扫描仓库 Maven/Gradle 或任意代码来偷取解析结果。
- Done：有界覆盖与限制可读；classpath 不足、反射/代理/动态调用不被伪造为已解析。其他语言明确 unsupported。

### T006 — 规则、路径、语义摘要

- 交付：PRD 要求的有界规则与对应机制解释；静态路径；基于确定性证据的变更摘要；正/负 fixture eval harness。
- 验证：每条规则检查已声明前提、反例与禁止误报；稳定引用；不把“不知道幂等配置”说成“确定无幂等”；结果顺序与标识稳定。
- Done：AC02—AC04 中本任务负责的规则/路径/摘要子项通过；学习关联失效由 T008 验证。支持范围之外显示 unknown/partial，未通过的必要规则不得悄悄删掉。

### T007 — CLI 用户闭环

- 交付：真实 cliff 调用 Engine；`xray` 默认摘要与 scan/explain/diff/doctor 基线；人类结果与结构化输出共享事实。
- 验证：真实入口端到端、错误/空/partial、NO_COLOR、60/80/120 列、ASCII fallback、键盘取消、CI/non-TTY、无 ANSI 的 JSON；人工检查首屏层级。
- Done：可从修改 fixture 得到有证据的简洁结果，交互证据与功能证据均存在。学习/债务由 T008 补齐。

### T008 — 学习与债务闭环

- 交付：explain 完整上下文说明、learn/debt；本地知识记录、显式反馈、可更正/关闭/删除；版本化透明债务模型。
- 验证：阅读不自动等于掌握；重复扫描不重复累加债务；更新/撤销/删除后重启仍正确；排除路径不回流；无 profile 时不猜测能力。
- Done：AC05/AC06 与 AC09 的本地学习数据生命周期子项通过，T007 的默认报告补充 top concept 和下一步；远端增强相关隐私子项由 T009 完成。

### T009 — 可选增强

- 交付：provider Adapter；显式开启及最小外发；结构校验、EvidenceRef 校验、超时/失败回退；无凭据完整 baseline。
- 验证：断网/无密钥/超时/限流/错误结构/虚构事实/提示注入；默认零外发；启用后展示发送范围并严格执行排除。
- Done：AC08 与相关 AC02/AC09 通过。stub 只证明本地契约；真实 provider 集成必须单独标记实测状态，发布启用的 provider 需要真实受控 smoke；不可获得授权时该 provider 保持未启用，不阻塞离线产品验证。

### T010 — v0.1 发布准备

- 交付：PRD 全 AC 映射，冻结 fixture/评估配置，安装说明、局限和可复现验证；更新所有状态。
- 验证：PRD 阶段闸门；新环境安装 smoke；确定性/误报/覆盖分母/性能记录；真实用户任务观察；独立 check；跨上下文接力和中断恢复演练。
- Done：必需验收没有 unresolved failure，产品和开发接力各有证据；所有已宣称能力匹配支持矩阵。发布操作按已有授权执行，未授权仅停在发布准备状态。

## 后续 Surface（不计入 v0.1 分母）

| ID | 阶段与交付 | 状态 | 依赖 | 独立退出条件 |
|---|---|---|---|---|
| T101 | v0.2 VS Code：侧栏、Hover/CodeLens、选中解释、Diff 审查与完整学习/债务闭环 | planned | T010 | PRD 第 8.3 节 V02-1—V02-4；继承 v0.1，同快照/能力结果一致，真实编辑器生命周期验收 |
| T201 | v0.3 JetBrains：完整 IDE 闭环、PSI 事实补充及 Bean/事务/JPA 三类深化 | planned | T101 | PRD 第 8.4 节 V03-1—V03-4；三类深化有正反未知案例；增强事实注明来源，规则留在 Engine |
| T301 | v0.4 Agent：两宿主接入、修改后审查、证据读取、可配置关口与报告恢复 | planned | T201 | PRD 第 8.5 节 V04-1—V04-4；实测基线→改动→审查→修正→再验，未知/失败不伪装通过 |

修改阶段顺序或压缩范围需要记录 Decision；阶段完成不自动代表后续阶段可用。

## 状态变更记录

- r0：按用户请求初始化；任务均未实现。下一位从 T001 开始，产品证据从现有最大编号后分配。
- r1：按用户反馈补全 PRD 四版本范围，并将后续入口任务映射到 V02/V03/V04；只修改规划，产品状态仍为 0/10 done。详见 D006/E004。
- r2：不一致恢复。磁盘存在未记录实现（protocol/analyzer-java/workspace-local/storage-local/learning/cliff-adapter + 测试 + oracle），验证当前失败（E005）；T002/T003/T005 按磁盘事实登记 in_progress，T001 一并 in_progress（骨架已存在但基线检查未通过）。T004 的 workspace-local/storage-local 实现也已存在但按依赖顺序保持 planned，待其依赖验证后一并评估。
- r3：L002 完成——绿基线（check+test 全过，E006）；T001 → done。T002 适配层 spike 验证完成（vendored cliff + D007 补丁，零网络/零 exit/零仓库代码执行/零配置继承）；剩余 T002 项（CLI 表面 TTY/NO_COLOR/取消/JSON/退出码）与 T007 合并验证。T003 协议测试过但"Engine 独立可调用"待 engine 落地。
- r4：L003 完成——fixture 输入集就绪（36 文件：oracle 30 案例 + 自定义注解支持 + 订单 demo 5 文件），analyzer 冒烟一致（E007）；T005 保持 in_progress 待 L005 正式 eval。
- r5：L004 完成——engine facade + CLI 入口端到端（E008）；真实入口验证修复 4 个缺陷（shebang/管道截断/符号链接边界/测试快照）；D008 未跟踪默认纳入。
- r6：L005 完成——正式 eval 100% 通过（E009）+ 能力声明交付。T002 done（真实 cliff 冒烟 + D007 + 许可状态明确；键盘取消归 T007、LICENSE 文件归 T010）；T003 done（协议/能力声明/独立消费者/无 Surface 渗入全验证）；T005 done（正负未知场景实测、未运行被扫描项目构建、bounds 可读；D005 按 spike 退出条件接受）。T004 → ready（磁盘实现存在待验证 + diff 接线）。
- r7：L006 完成——workspace 18 用例边界/隐私矩阵全过（E010，含敏感名称排除透明度修复）+ 显式 base diff 接线（新增/持续/移除三类语义单测与真实二进制验证）。T004 done；T006 一并评估达成（规则 evals E009 + 静态路径 + 变更摘要 + harness + 确定性 + unknown/partial 显式，学习关联失效按 BACKLOG 原文归 T008）。T007 → ready。
- r8：L007 完成——T007 done（E011：CJK 换行 60/80/120、零 ANSI、SIGINT→130 确定性、explain 与 JSON 共享事实、长扫描 stderr 进度、空目录文案；修复解析循环不让出事件循环导致取消不可达的真实缺陷）。T008 → ready。
- r9：L008 完成——T008 done（E012：绑定生命周期 11 用例 + 真实二进制 AC01 闭环——verified 跨扫描保留、债务 30→28 精确复算、二次进程恢复）。T009 → ready。
- r10：L009 完成——T009 done（E013：provider 契约 8 用例 + 二进制三级路径；真实远端未 smoke 保持 unverified-remote 禁用）。T010 → ready。
- r11：L010 完成——T010 机器可验项全done：AC01—AC12 映射（E014）、性能基准（冷 1.04s/热 0.96s/331.1MiB 达标）、安装 smoke（修复 bin 符号链接 bug）、README/NOTICE/SUPPORT、独立 Checker（新上下文）"有保留通过" + 接力演练六问、按发现修复（storage 5 用例/usage/文档）。**T010 保持 in_progress：AC12 用户试用未招募（Human Gate）**；遗留 SNAPSHOT_CHANGED 混沌、LICENSE 归档、跨平台。

## 活动任务扩展字段

### T005 — Java/Spring/JPA 结构分析（done）

- owner：20260908-143500-claude；session：20260908-143500-claude；完成：2026-09-08T15:33+08:00。
- 相关路径：packages/analyzer-java/、fixtures/java-spring-jpa/、evals/java/oracle.md、evals/run.ts、evals/results/java-oracle-v1.md。
- 完成依据：E009 正式 eval（30 案例全过：precision/recall 100%、unknown 零泄漏且可见）；capabilities.bounds 列明语法/注解/重载/延迟/包装边界；全程未运行被扫描项目 Maven/Gradle；非 java 语言 unsupported（capabilities 仅声明 java）。D005 按架构 spike 退出条件接受。
- 限制：oracle 标注为实现 Agent 独立制定（oracle.md 已声明），发布前需 Checker 独立复核（T010）。
- evidence：E007、E009；最后 revision：r6。

### T004 — Git ChangeSet、文件边界与离线隐私基线（done）

- owner：20260908-143500-claude；session：20260908-143500-claude；完成：2026-09-08T15:50+08:00。
- 相关路径：packages/workspace-local/、packages/engine/index.ts（buildDiff）、apps/cli/index.ts（--base）、tests/workspace.test.ts、tests/engine.test.ts。
- 完成依据：E010（18 用例矩阵 + diff 三类语义 + 真实二进制演示 + 不修改被分析项目断言）。
- 限制：SNAPSHOT_CHANGED 竞态路径无法确定性单测（代码已审查，T010 混沌检查补）；Windows/Linux 未测。
- evidence：E010；最后 revision：r7。

### T007 — cliff CLI 纵向用户路径与交互打磨（done）

- owner：20260908-143500-claude；完成：2026-09-08T16:10+08:00。
- 完成依据：E011——四命令基线（scan/explain/diff/doctor）经真实 cliff dispatch 与真实二进制验证；NO_COLOR/列宽/取消/非 TTY/JSON 纯净/退出码契约；首屏层级 ux_review（self-separated）。
- 交付边界：学习/债务命令归 T008；TTY 富交互（spinner/表格）v0.1 未启用（保持非 TTY 安全的最小表面）。
- evidence：E006、E008、E010、E011；最后 revision：r8。

### T006 — 有界风险规则、静态路径、变更摘要与首批 evals（done）

- owner：20260908-143500-claude；完成：2026-09-08T15:50+08:00。
- 完成依据：规则与禁止误报（E009 冻结 oracle 100%，unknown 单列）；静态路径（flows observed/unresolved + 证据回源 + 稳定标识，E008/E010 engine 测试）；变更摘要（--base 确定性 diff + human 摘要，E010）；eval harness（evals/run.ts + results/java-oracle-v1.md）；确定性（normalizedReport 相等测试）；unknown/partial 显式（capabilities.bounds + report.limitations + unknown 诊断）。
- 边界：学习关联失效归 T008（BACKLOG 原文）；"不把不知道说成确定"由 assumptions/uncertainties 结构分离保证。
- evidence：E007—E010；最后 revision：r7。

### T001 — 目标仓库与开发基线（done）

- owner：20260908-143500-claude；session：20260908-143500-claude；开始：2026-09-08T14:38+08:00；完成：2026-09-08T14:52+08:00。
- 相关路径：仓库根（Git main、0 commit、全未跟踪）；package.json、tsconfig.json、scripts/build.mjs、vendor/、docs/ 全套。
- scope：真实环境记录（Node 22.14.0/npm 10.9.2/git 2.39.5/macOS）、骨架适配、恢复 checkpoint、绿基线。
- decisions：D004、D007；evidence：E005、E006。
- 完成依据：check+test 全绿（E006）；基线足以开展 T002/T003（BACKLOG T001 Done 条件满足）。
- 最后 revision：r3。
