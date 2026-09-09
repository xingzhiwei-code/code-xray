# Decision 记录

本文件记录取舍，不记录待办。状态：proposed / accepted / rejected / superseded。accepted 只表示方案被采纳，不表示已经实现或验证。改变已接受决定时新增 ID、说明替代关系和影响，不改写过去。

## D001 — 一个 Engine，四个 Surface

- 状态：accepted；日期：2026-09-08；来源：用户明确约束；checkpoint：r0。
- 决定：通用领域 Protocol 服务 Engine 与 CLI/VSCode/JetBrains/Agent；按 v0.1—v0.4 分阶段独立验证，先实现 CLI。
- 理由：相同证据、规则和学习模型可复用；客户端只承担输入和呈现。
- 放弃选项：四套独立分析实现；CLI 内承载领域核心。
- 影响：T003 定义统一契约；T101/T201/T301 必须验证事实一致性。
- 实现证据：none。

## D002 — cliff 是 v0.1 CLI infrastructure

- 状态：accepted；日期：2026-09-08；来源：用户指定；checkpoint：r0。
- 决定：复用 [xingzhiwei-code/cliff](https://github.com/xingzhiwei-code/cliff) 的真实依赖能力；X-Ray 领域逻辑不进入 cliff。缺少基础能力时用有限 Adapter 或通用改动处理。
- 理由：复用用户已有 CLI 基础设施，同时保持产品独立。
- 放弃选项：新造另一套完整 CLI 框架；未经核实使用猜测的包名/API。
- 影响：T002 必须核实离线、插件加载、依赖来源与分发依据；只读核查见 E002。
- 实现证据：none；E002 不等于集成通过。

## D003 — 确定性事实与证据优先，LLM 可选

- 状态：accepted；日期：2026-09-08；来源：用户明确约束；checkpoint：r0。
- 决定：Git/解析/框架规则产生基线事实；LLM 仅增强解释及条件推断，不能改写事实证据。默认本地、隐私优先，外发按明确配置。
- 理由：保证无密钥/断网可用、可复现、可审查和可替换 provider。
- 代价：有限支持范围需要明确展示，不能用流畅文字掩盖解析限制。
- 影响：T004/T006/T009 与 AC02/AC08/AC09。
- 实现证据：none。

## D004 — Markdown 是开发接力的持久状态

- 状态：accepted；日期：2026-09-08；来源：用户新增要求；checkpoint：r0。
- 决定：固定入口 + CURRENT/HANDOFF + Backlog/Decision/Evidence/Loop Log；checkpoint 有版本、有真实下一步、有验证快照。
- 理由：无需特定模型记忆、聊天平台、IDE 或专属 API，也能跨上下文恢复。
- 代价：每轮需要维护小量状态；多文件一致性按提交标志和恢复协议保障。
- 影响：所有任务；T010 实际演练接力与崩溃恢复。
- 文档检查：E003；真实跨模型接力证据：none。

## D005 — Engine 与解析技术起始方案

- 状态：accepted（r6，按预设接受条件补证据）；日期：2026-09-08（proposed）；提出者：启动包设计；checkpoint：r0→r6。
- 决定：TypeScript Engine/CLI，语言中立 JSON 契约（schema 0.1）；Java 源码解析采用本地 Adapter——`java-parser@3.0.1`（npm，CST）。
- 理由：与 cliff 接入一致；复杂语言解析封装在 Adapter 内，核心契约不暴露 parser 对象。
- 接受证据（r6）：E006（tsc/vitest 契约）、E008（端到端独立消费者）、E009（冻结 oracle 30 案例 precision/recall 100%、未知零泄漏）。架构 §Parser spike 退出条件："若 JavaParser 不满足目标，比较一个替代候选"——目标已满足，故未启动替代候选比较。
- 限制：CST 无类型系统；同名同参数个数重载、Lambda 延迟、外部接收者为 unknown（能力声明 bounds 已列明）。若后续 fixture 显示覆盖不足，按架构 §Parser spike 引入替代候选（如 JVM sidecar）再评估。
- 影响：T005、AC03/AC04；实现证据：E009。

## D008 — 扫描默认纳入未跟踪文件（工作区磁盘现状）

- 状态：accepted；日期：2026-09-08；提出者：20260908-143500-claude（L004）；checkpoint_revision：r5。
- context：前一会话的 workspace-local 默认排除未跟踪文件（需 --include-untracked 显式纳入）。后果：0-commit 仓库（新 clone、解包 fixture、CI 检出）扫描结果为空；用户未提交的 WIP——产品核心价值"理解当前变更"的对象——默认不可见。AC01 要求干净环境首次扫描即有结果。
- options：(a) 维持排除默认（git 视角纯净，但首扫为空）；(b) 默认纳入磁盘现状，--git-tracked-only 提供退出（磁盘视角，符合"当前变更"定位）。
- decision：采用 (b)。隐私不受损：secretPath 名称过滤与 SECRET_FILTER 内容过滤对所有文件生效；hidden 目录（node_modules/target 等）仍排除。
- reason：宪法"帮助理解当前变更"；PRD"未提交与未跟踪内容若被选中必须纳入摘要"——scan 的选择即工作区磁盘现状。
- consequences：diff（T004/T006）需显式 base，不受此默认影响；证据 digest 保证纳入的未跟踪文件内容可追溯；若未来出现基于 git 状态的 scope 细分，--git-tracked-only 已提供语义入口。
- evidence：E008；affects：T004、AC01、AC09。
- supersedes：null（覆盖前一会话未记录的默认行为）。

## D007 — cliff 以 npm tarball 形式 vendored 并施加 4 点通用嵌入补丁

- 状态：accepted；日期：2026-09-08；提出者：20260908-143500-claude；checkpoint_revision：r3。
- context：npm 发布的 @cliffx/{core,ui,test}@0.0.1 因 workspace:* 协议依赖不可安装（EUNSUPPORTEDPROTOCOL，CLIFF_INTEGRATION §4.2 预判）；且发布版 Cli.run 有 4 处与嵌入宿主契约冲突的行为（version 触发 registry 更新请求、无条件读取 cwd/父目录/home 配置与 env、unknown-command 直接 process.exit(1)、命令错误 handleError 走 process.exit(1)）。上一会话的 cliff-adapter 代码与测试已按"打补丁后的 cliff"编写但补丁从未落地（vendor/ 为空）。
- options：(a) 适配到发布版原行为——不可行：env 可覆盖默认值、进程终止与配置注入直接违反 AC09/AC07；(b) 从固定 commit 克隆上游并用 pnpm/tsup 构建——可行但重，且产品只用 dist；(c) vendor npm tarball + 最小通用补丁（CLIFF_INTEGRATION §2 明确许可"有记录的通用基础设施补丁"）。
- decision：采用 (c)。vendor/cliffx-{core,ui,test} 来自 npm registry tarball 0.0.1；补丁仅 4 点：依赖协议重写（file:）、checkUpdates 改为显式 opt-in（默认零网络）、errorMode:'throw' 时错误重抛（宿主拥有退出码）、loadConfig:false 禁用全部隐式配置发现（文件+env）。补丁全文与溯源见 vendor/VENDOR_PATCH.md。
- reason：最小变更面获得可安装制品与嵌入安全契约；保持上游默认行为不变（除 checkUpdates 默认关闭），无 Code X-Ray 领域逻辑进入 cliff（D002 边界）。
- consequences：更换 cliff 版本或上游发布可安装制品时须重跑 tests/cliff-adapter.test.ts 并更新本 Decision 与 VENDOR_PATCH.md；tarball 与固定 commit 的源码级一致性未验证（构建产物无法直接比对），已作为限制记录。
- evidence：E006；affects：T002、T007、AC07、AC09。
- supersedes：null（补充 D002/D005 的实现路径，不替代）。

## D006 — 明确四个版本的完整范围与继承

- 状态：accepted；日期：2026-09-08；checkpoint_revision：r1。
- 来源：用户指出 PRD 未清楚展示版本数量与各版内容，要求补全。
- 决定：在 PRD 开头总览与第 8 节写全四版功能、用户流程、交付范围、不做事项和验收；后续入口任务分别映射 V02/V03/V04。
- 继承：Java/Spring/JPA 分析、学习/债务和离线从 v0.1 开始；IDE 继承业务闭环；v0.3 深化框架理解，规则仍共享；v0.4 接入外部 Agent 修改后审查。
- 区分：Markdown 开发进度接力从首次开发执行；文档 1.1 不表示新增产品版本。
- 影响：PRD、架构阶段摘要、T101/T201/T301 与入口状态同步；不改变 v0.1 AC01—AC12 或 0/10 产品进度。
- 证据：E004 文档修订检查；产品实现证据仍为 none。

新 Decision 按 [RECORD_TEMPLATES](../RECORD_TEMPLATES.md) 追加。用户更新约束时记录对应变更并同步宪法/PRD/Backlog，项目文档不得反过来覆盖用户授权。

## D009 — Developer Profile v1 采用本机全局状态与证据化技能模型

- 状态：accepted；日期：2026-09-09；提出者：用户当前要求；checkpoint_revision：r13。
- context：Knowledge Gap 需要区分“代码所需知识”与“这个开发者当前的知识信号”。现有 Learning State 按工作区记录概念 × 代码位置，不适合作为跨项目画像；但已验证理解必须继续以项目学习事件为准。
- options：(a) 把技能合并进 Learning State——破坏项目状态与开发者状态边界；(b) 只存 beginner/intermediate/advanced 标签——丢失证据与置信度；(c) 开发者级 Profile 独立存储，技能由 level+confidence+evidence 组成，Knowledge Gap 再与项目 Learning State 匹配。
- decision：采用 (c)。存储为用户数据目录 `developer/profile.json`，与 `workspaces/<id>/learning.json` 分离；CLI 提供 profile show/init/update；Engine 侧保留 `knowledgeGaps` 纯计算边界，未来 Surface 只能通过同一协议/Engine 使用。
- reason：满足 local-first、画像与项目状态分离、未知不伪装成熟练度，且不改变既有代码发现与已验证学习事实。
- consequences：profile 是个人建议排序信号，不是能力评分或绩效数据；缺 profile 时 Knowledge Gap 明确显示未评估；后续 VS Code/JetBrains/Agent Surface 不得复制计算逻辑。
- evidence：E016；affects：T011、AC05/AC06/AC09 增强项。
