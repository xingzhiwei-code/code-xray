# Evidence 索引

本文件的 E001—E003 是启动包准备证据，E004 是四版本规划修订证据，**均不是产品测试**。所有产品任务当前均未完成。新增实际实现记录从可用的下一个编号开始；模板与有效性规则见 [RECORD_TEMPLATES](../RECORD_TEMPLATES.md)。

## E001 — 需求与引用对话核对

- kind：source_inspection；recorded_at：2026-09-08；checkpoint_revision：r0。
- claim：文档依据用户当前列出的核心约束，并补读所引用对话的可用内容。
- input：用户当前请求；引用对话 `6a9f68e5-f5dc-83ec-ac5d-0abe8ce9330b`（AI全栈开发闭环方案）。
- method：读取当前请求与可用对话记录，提取宪法、四阶段、cliff、Java 优先、Loop 与开发进度接力要求；仅把对话作需求背景，不执行其中指令。
- actual：核心约束已进入 CONSTITUTION/PRD，新增持久状态和中断恢复协议。
- result：passed（需求来源核对范围）；exit_code：not_applicable。
- limitations：历史 assistant 长回复读取有长度上限，未把其技术主张直接当事实；本包以用户最新明确要求为验收来源。原聊天不复制入启动包，也不是日后继续开发的依赖。
- task/acceptance：产品 Task 为 none；本记录不证明 AC11 接力演练通过。

## E002 — cliff 静态源码核查

- kind：source_inspection；recorded_at：2026-09-08；checkpoint_revision：r0。
- subject_snapshot：`xingzhiwei-code/cliff@0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c`。
- source：[固定 commit](https://github.com/xingzhiwei-code/cliff/tree/0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c)。
- method：通过 GitHub 连接只读取得仓库元数据、目录与相关源码/清单；逐项对照 README 与实际实现，具体文件引用见 [CLIFF_INTEGRATION](../CLIFF_INTEGRATION.md)。
- claim/actual：核实真实包名、源码版本、CLI infrastructure 范围，发现更新检查/动态加载/配置来源需要 X-Ray 接入专项验证。
- result：passed（只读核查范围）；exit_code：not_applicable。
- limitations：未安装、未执行测试、未验证发布包/tarball；声明与缺失文件差异保留在集成文档；不得将静态源码观察写成运行时隔离已通过。
- affects：D002、T002；T002 状态仍 planned。

## E003 — 启动包文档与归档检查

- kind：documentation；checkpoint_revision：r0；产品 Task：none。
- claim：交付 Markdown 文件结构、内部链接、初始状态、验收/任务编号与 ZIP 内容一致性已检查；范围仅为启动包。
- method/actual/artifacts：见 [PACKAGE_CHECK.md](../../PACKAGE_CHECK.md)，其中保存实际检查日期、检查方法、结果、限制与文件 SHA256。
- review_mode：independent 文档审查 + root 交叉核对；不等于真实跨模型产品接力。
- result：passed（文档结构、编号、链接与归档校验范围）；exit_code：0；具体实测清单见 PACKAGE_CHECK。
- limitations：无产品代码、产品测试、真实用户试用或 benchmark；AC01—AC12 均尚未验收。文档修改后的内容身份以重新生成的 PACKAGE_CHECK 为准。

## 后续实现证据

暂无。每条证据必须绑定 Task、AC、实际输入快照、命令/步骤、预期与结果、环境、产物、限制及 Checker。失败/阻塞/未运行也必须记录；禁止把文档里的目标数字或示例输出登记为实测。

## E005 — 仓库现实核查（不一致恢复）

- kind：source_inspection；recorded_at：2026-09-08T14:38:34+08:00；checkpoint_revision：r2。
- claim：启动包状态（not_started）与磁盘不符；本记录登记实际仓库、代码与验证状态，不证明任何产品能力。
- task：T001（进行中的基线核实）；acceptance：AC11（状态与仓库一致性）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized（Git 仓库已 init，main 分支 0 commit，全部文件未跟踪）；关键未跟踪实现内容 hash（sha256 前 16 位）：packages/protocol/index.ts=50fd0b37112fd485、packages/analyzer-java/index.ts=726f7c70952eda30、apps/cli/cliff-adapter.ts=8bd5de7a6170ce7a。
- environment：macOS（Darwin 24.3.0）、Node v22.14.0、npm 10.9.2、git 2.39.5 (Apple Git)。
- working_directory：仓库根。
- invocation：`git log --oneline`（fatal：无 commit）；`git status --short`（全部 untracked）；`npm run check`；`npx vitest run`；`npm view @cliffx/core versions repository`；`npm view @cliffx/test version`；`find fixtures -type f`（空）。
- expected：状态文件与磁盘一致；实际发现漂移。
- actual：tsc 报 tests/protocol.test.ts 3 个语法错误（5:120 等）；vitest 2 文件失败（同一错误；cliff-adapter.test.ts 因 @cliffx 未安装无法解析）；@cliffx/core@0.0.1/@cliffx/test@0.0.1 已发布且 repository 与固定 commit 仓库一致；fixtures/java-spring-jpa 目录树存在但 0 文件；build.mjs 引用的 apps/cli/index.ts、packages/engine/index.ts 不存在；package.json 未声明 @cliffx 依赖；package.json files 引用的 README.md、NOTICE.md、docs/SUPPORT.md 不存在。
- exit_code：check=2、vitest=1（失败本身是本记录的实测事实）。
- result：passed（核查范围：漂移已如实登记）；产品验证：failed。
- artifacts：无独立产物（命令输出已摘录）。
- limitations：静态核查 + 命令实测；未运行 build；未审查未跟踪实现代码的正确性（后续 Loop 处理）；npm 元数据不证明 tarball 内容与固定 commit 一致，安装时需复核。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E006 — 验证基线全绿 + 真实 cliff 适配层集成测试

- kind：test；recorded_at：2026-09-08T14:52+08:00；checkpoint_revision：r3。
- claim：仓库最小检查全绿；vendored cliff 通过适配层契约测试（零网络、零宿主终止、零仓库代码执行、零隐式配置继承）。
- task：T001（完成）、T002（适配层子项）；acceptance：AC11（T001 基线）、AC09/AC07（T002 相关子项，非完整验收）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized（仍 0 commit）；相关未跟踪文件 sha256 前 16 位：vendor/cliffx-core/dist/index.js=00517abc34e2bbef、index.d.ts=2093b24c4160abcb、tests/protocol.test.ts=dfa9f36e1166f675、tests/cliff-adapter.test.ts=5143f3b2446aaa95、package.json=cc044bc1f1a82cc4；vendor/cliffx-ui、vendor/cliffx-test 为 npm 原样 + 依赖重写。
- environment：macOS（Darwin 24.3.0）、Node v22.14.0、npm 10.9.2、vitest 5.0.0、tsc（typescript 7.0.2）。
- working_directory：仓库根。
- invocation：`npm install`（成功）；`npm run check`；`npx vitest run`。
- expected：check 退出 0 无错误；vitest 2 文件 10 测试全过；cliff-adapter 测试在网络全拒绝（fetch/http.request/https.request/net.Socket.connect 均替换为抛错）下 dispatch/version/help/test-harness 运行不触发任何网络调用；process.exit 与 stderr 写入不被 cliff 调用；被扫描目录中的恶意 commands/plugins/xray.config.js 不执行；父目录 .xray.json 与 XRAY_OFFLINE env 不影响解析选项。
- actual：全部符合——check 退出 0；Tests 10 passed (10)；5 个 cliff-adapter 用例逐一通过（含 `existsSync(marker)===false`、`options.toEqual({offline:true})`、`config.toEqual({})`、exit/stderr 未调用断言）。
- exit_code：check=0、vitest=0。
- result：passed。
- artifacts：无独立文件（vitest 摘要为准）；vendor 补丁说明见 vendor/VENDOR_PATCH.md。
- limitations：(1) 适配层级验证，非完整 CLI 表面——TTY/NO_COLOR/60 列/键盘中断/退出码契约/JSON stdout 纯净度属 T007 未验；(2) cliff tarball 与固定 commit 的源码级一致性未做（dist 为构建产物，需上游构建才能比对；已记录 registry provenance）；(3) cliff 分发许可材料（LICENSE 文件不存在于 tarball，清单声明 MIT）仍未收齐，发布前需 NOTICE 处理；(4) protocol 测试覆盖 schema/引用校验，"Engine 可被独立消费者调用"待 engine 存在后验证。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E007 — fixture 冒烟：oracle 30 案例 + demo 全量解析与命中

- kind：test；recorded_at：2026-09-08T15:05+08:00；checkpoint_revision：r4。
- claim：36 个 fixture 文件全部被 analyzer 解析；15 个 findings 恰为每规则 4 个正例 + demo 场景 1 个，12 负例与 6 未知例均未产生 finding（冒烟级一致性；正式 precision/recall 由 L005 产出）。
- task：T005（fixture 输入）；acceptance：AC03 输入集就绪（非完整 AC03 验收）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；untracked：fixtures/java-spring-jpa/src/main/java/demo/ 共 36 文件（tx 10、loop 10、web 10、support 1、orders 5）。
- environment：macOS、Node v22.14.0、tsx 4.20.6、java-parser 3.0.1。
- invocation：`npx tsx /tmp/fixture-smoke.mts`（脚本：collect 36 文件 → analyzeJava → 打印 analyzed/failed/findings/parse errors）。
- expected：36/36 analyzed、0 failed、0 JAVA_PARSE_ERROR；JPA_CALL_IN_LOOP ∈ {LoopForCase, LoopWhileCase, LoopDoCase, LoopThisCase, OrderService}；TX_SELF_INVOCATION ∈ {TxUnqualifiedCase, TxThisCase, TxFqnCase, TxTwoArgsCase, OrderService}；WEB_ENTITY_RELATION ∈ {WebDirectCase, WebListCase, WebResponseCase, WebControllerBodyCase, OrderController}；其余 0 finding。
- actual：与预期完全一致（15 findings，逐条路径核对）。
- exit_code：0。
- result：passed。
- artifacts：无独立文件留存（一次性冒烟脚本 /tmp/fixture-smoke.mts；正式 harness 见 L005）。
- limitations：冒烟仅核对 finding 集合成员；未断言未知例的诊断输出存在性（L005 补）；未运行 AC12 性能场景（100 文件/2 万行属 T010）。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E008 — 端到端 CLI 真实入口验证（engine + build + 二进制）

- kind：test；recorded_at：2026-09-08T15:30+08:00；checkpoint_revision：r5。
- claim：真实构建的 CLI 二进制在订单 fixture 上完成 scan→报告→保存→恢复闭环；JSON 输出纯净且管道下稳定；退出码契约成立；Engine 可被独立消费者调用。
- task：T003（收尾）、T007（最小闭环子项）；acceptance：AC01（最小闭环）、AC02（证据锚定）、AC07（子项）、AC10（分离）、AC08（确定性）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；新增/变更：packages/engine/index.ts、apps/cli/index.ts、tests/engine.test.ts、tests/cli.test.ts、scripts/build.mjs（shebang）、packages/protocol（Finding.uncertainties、FlowEdge 可选字段）、packages/analyzer-java（symbol）、packages/workspace-local（未跟踪默认纳入）、packages/storage-local（符号链接边界重设计）。
- environment：macOS（Darwin 24.3.0）、Node v22.14.0、esbuild 0.28.2、vitest 5.0.0。
- invocation：`npm run check`；`npx vitest run`；`npm run build`；`./dist/cli.js scan fixtures/java-spring-jpa`（human）；`./dist/cli.js scan fixtures/java-spring-jpa --format json 2>/dev/null | python3 -m json.tool`×3；`./dist/cli.js doctor`；`./dist/cli.js scan /no/such/dir`；`./dist/cli.js frobnicate`；`(cd fixtures/java-spring-jpa && ../../dist/cli.js doctor | grep 最近报告)`。
- expected：check 0 错误；20/20 测试过；human 输出 top-3 有界无 ANSI；管道 JSON 120KB 完整解析连续 3 次；stderr 于 JSON 模式 0 字节；退出码 0/2/1；doctor 在 fixture 目录内显示已保存报告。
- actual：全部符合。修复过程中确认的缺陷与修复：shebang 缺失、管道截断（stdout 排水等待）、/var 符号链接误拒（前缀 canonicalize）、测试 capture 陈旧快照。
- exit_code：check=0、vitest=0（20/20）、build=0、binary scan=0、json 管道=0×3、bad path=2、unknown command=1。
- result：passed。
- artifacts：dist/{cli.js,engine.js,protocol.js}（构建产物，gitignore 排除）；报告 JSON 未留存（可用命令复现）。
- limitations：(1) TTY 交互、NO_COLOR、60 列换行、Ctrl-C 实测、网络拦截进程级验证属 T007/T010 未做；(2) 未测 Windows/Linux；(3) doctor 的"最近报告"按 cwd 工作区隔离（预期行为）；(4) diff/explain 命令未实现（T004/T006/T008 范围）。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E009 — 规则正式评估：冻结 oracle 100% 通过 + 能力声明

- kind：eval；recorded_at：2026-09-08T15:33+08:00；checkpoint_revision：r6。
- claim：在冻结 oracle v1（30 案例）上，三规则 precision/recall 均 100%（已知分母每规则 8），未知案例零泄漏且全部可见报告；能力声明如实（仅 java、有界）。
- task：T005（完成）、T006（evals 子项）、T002（收尾确认）；acceptance：AC03（正式数字，不外推）、AC02（unknown 可见性）、AC10（能力声明）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；输入 fixtures/java-spring-jpa 36 文件（L003 交付，未变更）；evals/run.ts 新增；protocol/engine 能力声明新增。
- environment：macOS、Node v22.14.0、tsx 4.20.6、java-parser 3.0.1。
- invocation：`npx tsx evals/run.ts`（含完整逐案表输出，报告落盘）。
- expected：每规则 TP=4/FP=0/FN=0；12 负例 correct-negative；6 unknown 全部 unknown-clean（无 finding 且诊断含 UNKNOWN/UNRESOLVED）；退出码 0（阈值 precision≥90%、recall≥80%）。
- actual：与预期完全一致；退出码 0；evals/results/java-oracle-v1.md 已写入。21/21 单测与 build 同轮全绿。
- exit_code：0。
- result：passed。
- artifacts：evals/results/java-oracle-v1.md（入库）。
- limitations：oracle 标注由实现 Agent 独立制定（oracle.md 已声明），发布前 Checker 须独立复核标签（AC03"标注专家/人工依据"）；结果不外推任意真实项目；TP/FP/FN 是规则触发对照冻结标签，非运行时缺陷证明；能力声明 bounds 覆盖主要边界，非穷尽。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：E007（冒烟级一致性由本条正式 eval 取代精度结论；E007 保留为 fixture 交付证据）。

## E010 — T004 边界/隐私矩阵 + 显式 base diff 端到端

- kind：test；recorded_at：2026-09-08T15:50+08:00；checkpoint_revision：r7。
- claim：workspace 层 18 项边界/隐私用例全过；diff 三类语义（新增/持续/移除）经单测与真实二进制验证；diff 全程不修改被分析项目、不执行其代码、零网络。
- task：T004（done）、T006（规则/路径/摘要子项）；acceptance：AC01、AC02（覆盖可见性）、AC04（显式基线/不猜基线/陈旧证据）、AC09（本地隐私子项）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；变更：tests/workspace.test.ts（新增 18 用例）、packages/workspace-local（SENSITIVE_PATH/BASE_EXCLUDED 透明度 + untracked 语义已随 D008）、packages/engine（buildDiff）、apps/cli（--base + 变更摘要）、tests/engine.test.ts（+3 diff 用例）。
- environment：macOS（Darwin 24.3.0）、Node v22.14.0、git 2.39.5、vitest 5.0.0。
- invocation：`npm run check`；`npx vitest run`；`npm run build`；临时 git 仓库中 `dist/cli.js scan . --base HEAD`（base: OrderService 无循环调用版本；working tree: 加入 orderRepository.save 循环 + 新增 OrderRepository.java）。
- expected：矩阵用例全部通过；diff 输出 added=[OrderRepository.java]、modified=[OrderService.java]、newFindingIds=1（JPA_CALL_IN_LOOP）、continuingFindingIds=1（TX 基线已有）、removed=0；退出 0；git status 前后一致。
- actual：全部符合；42/42 测试；真实二进制输出与预期逐项一致（E010 演示记录于 LOOP_LOG L006）。
- exit_code：check=0、vitest=0、binary=0。
- result：passed。
- artifacts：无独立文件（测试即产物；演示命令可从 LOOP_LOG 复现）。
- limitations：(1) SNAPSHOT_CHANGED（读取期间文件变化）为竞态路径，无法确定性单测——代码路径（stat 前后比对+realpath 校验）已经 self-separated 审查，注入式故障测试留待 T010 混沌检查；(2) staged-only 状态（git index 与 HEAD/worktree 三态差异）未单独用例——v0.1 语义为"工作区磁盘现状 vs 显式 base"，符合 D008 与架构 §4；(3) Windows/Linux 未测。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E011 — T007 CLI 表面契约：列宽/NO_COLOR/取消/explain/进度

- kind：test + ux_review；recorded_at：2026-09-08T16:10+08:00；checkpoint_revision：r8。
- claim：human 输出在 60/80/120 显示列内换行（CJK 宽度感知、路径不断裂）；零 ANSI（NO_COLOR 天然满足）；SIGINT 中断长扫描退出 130 并提示取消；explain 与 JSON 共享同一报告事实；长扫描 stderr 进度且 stdout JSON 纯净。
- task：T007（done）、T012 相关子项（进度与取消）；acceptance：AC07、AC12（进度/取消子项）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；变更：apps/cli/index.ts（wrapLine/terminalWidth/explain/进度/空目录文案）、packages/analyzer-java/index.ts（onProgress+让出）、packages/engine/index.ts（progressGuard）、tests/cli-surface.test.ts（6 用例）。
- environment：macOS、Node v22.14.0、vitest 5.0.0、真实二进制 dist/cli.js。
- invocation：`npm run check`；`npx vitest run`（48/48）；`npm run build`；`COLUMNS=60 NO_COLOR=1 ./dist/cli.js scan fixtures/java-spring-jpa`；fixture 目录内 `../../dist/cli.js explain` 与 `explain 1`；SIGINT 子进程测试（等待 stderr 进度标记后 kill）。
- expected：60 列运行最长行 ≤60 显示宽度、无 ESC 序列、路径 token 完整；explain 详情含证据/前提/未知/下一步/conceptId；SIGINT 退出 130 + stderr 含"取消"；48/48 测试。
- actual：全部符合（60 列输出逐行核对；explain 1 展示 4 处证据含跨文件 Repository 声明；SIGINT 测试确定性通过）。
- exit_code：check=0、vitest=0、60 列运行=0、explain=0、SIGINT 测试通过。
- result：passed。
- artifacts：无独立文件（输出已摘录 LOOP_LOG；命令可复现）。
- limitations：ux_review 为 self-separated（单 Agent）；未在真实 60 列物理终端目测（按显示宽度数学断言）；键盘取消仅在 macOS 实测；交互式 TTY 特性（spinner 等）v0.1 未使用（非目标）。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E012 — T008 学习/债务闭环：生命周期测试 + AC01 真实二进制全链路

- kind：test + ux_review；recorded_at：2026-09-08T16:35+08:00；checkpoint_revision：r9。
- claim：学习绑定生命周期完整正确（创建/去重/stale/忽略不回流/状态机/验证问答/持久化恢复/删除），认知债务模型透明且可手工复算；AC01 用户闭环在真实二进制上端到端成立。
- task：T008（done）；acceptance：AC05、AC06、AC09（本地学习数据子项）、AC01（闭环演示，非"干净环境安装"全项）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；新增 packages/learning/engine.ts、tests/learning.test.ts；变更 packages/learning/types.ts（EventBase）、apps/cli/index.ts（learn/debt/scan 同步/知识缺口提示）、tests/cli-surface.test.ts（+1 闭环用例）。
- environment：macOS、Node v22.14.0、vitest 5.0.0、真实二进制 dist/cli.js。
- invocation：`npx vitest run`（60/60）；二进制序列：scan→debt（30）→learn 1 answer a（verified）→rescan→learn 列表（15 条不变、verified 保留）→debt（28）→doctor 恢复。
- expected：60/60；verified 状态在再扫描后保留且绑定不重复；债务精确下降 2.0（medium 2 × verified 0 × direct 1.0）；二次进程读取同一数据目录恢复全部状态。
- actual：全部符合（债务 30→28；"15. [已验证理解]"；doctor 显示最近报告）。
- exit_code：vitest=0、二进制各步=0。
- result：passed。
- artifacts：无独立文件（输出摘录 LOOP_LOG；命令可复现）。
- limitations：AC01 的"干净环境按安装说明运行"与"断网条件"未在本条完整复演（依赖 T010 的安装 smoke 与网络拦截进程级测试）；学习卡内容为确定性模板（LLM 增强属 T009）；open 回答/自由文本路径 v0.1 未提供（协议含 closed question）。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E013 — T009 provider 契约、最小外发与回退

- kind：test；recorded_at：2026-09-08T16:50+08:00；checkpoint_revision：r10。
- claim：provider 端口契约经可替换双 stub 验证；结构校验拒绝无 text/非 JSON/伪造证据字段的响应；超时/不可达/其他错误分类正确且回退不触碰确定性输出；默认禁用需三个显式 env；外发上下文序列化后不含源码/路径/digest。
- task：T009（done）；acceptance：AC08、AC02/AC09 子项。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；新增 packages/explanation-providers/index.ts、tests/provider.test.ts；变更 apps/cli/index.ts（--enhance、doctor provider 行）。
- environment：macOS、Node v22.14.0、vitest 5.0.0、真实二进制。
- invocation：`npx vitest run`（68/68）；二进制：explain 1 --enhance（未配置）；XRAY_PROVIDER_URL=http://127.0.0.1:1 …（不可达）；doctor。
- expected：未配置→提示+确定性输出不变；不可达→外发范围声明→unreachable→回退提示"主链路不受影响"；doctor 显示 provider 状态；68/68。
- actual：全部符合。
- exit_code：vitest=0；二进制各路径=0。
- result：passed。
- artifacts：无独立文件。
- limitations：真实远端 provider 未做受控 smoke（无凭据/授权）——按 T009 Done 原文保持未启用（unverified-remote），发布启用前需真实 smoke；提示注入对抗仅以 FORBIDDEN_KEYS 结构拒绝实现（provider 返回的"指令"只会成为被拒绝或展示的文本，不进入执行路径——未做对抗性语料专项，T010 可补）。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：null。

## E014 — T010 发布准备：AC 映射、性能基准、安装 smoke、独立检查与接力演练

- kind：test + benchmark + handoff；recorded_at：2026-09-08T17:10+08:00；checkpoint_revision：r11。
- claim：v0.1 除"真实用户试用"外的全部可机器验证验收项完成并有证据；独立 Checker（新上下文子 Agent）结论"有保留通过"，保留项（状态文件漂移）在本 checkpoint 内修复。
- task：T010；acceptance：AC01—AC12 映射（见下表）。
- operator：20260908-143500-claude。
- subject_snapshot：base_commit：not_initialized；本轮新增：README.md、NOTICE.md、docs/SUPPORT.md、evals/bench.ts、tests/storage.test.ts；变更：apps/cli/index.ts（realpathSync 入口修复 + usage 补 learn/debt/path-vs-cwd 语义）。
- environment：macOS（Darwin 24.3.0，Apple M 系列）、Node v22.14.0、npm 10.9.2、git 2.39.5。

### AC01—AC12 映射（一行一项）

| AC | 结论 | 依据与边界 |
|---|---|---|
| AC01 首次离线扫描闭环 | 通过（机器可验部分） | E012 二进制全链路（scan→学习→验证→再扫描→恢复）+ E014 安装 smoke（干净目录 npm install→scan→doctor）；"断网条件"以 E006 四 API 拦截测试 + bundle 静态审查（仅 provider 路径 2 处 fetch、零 node:http/https/net）覆盖；进程级断网隔离在 macOS 无无 root 手段（限制） |
| AC02 证据与断言 | 通过 | E008/E009：digest 绑定断言、assumptions/uncertainties 分离、零发现≠安全文案、版本可追溯（provenance）、unknown 显式单列；stale 由 E010 stalePaths 用例覆盖 |
| AC03 有界 Java 规则 | 通过（含独立复核） | E009：30 冻结案例 precision/recall 100%、unknown 零泄漏单列；独立 Checker 抽查全部 6 个 unknown 案例源码与标注一致、harness 为真实计算；oracle 标注为实现者制定（oracle.md 声明），外部专家标注未做（限制） |
| AC04 静态路径与变更 | 通过 | E010：flows observed/unresolved+证据回源（Checker 逐行核实含跨文件）、显式 base 记录 SHA、不猜基线（INVALID_BASE/NOT_GIT）、删除/重命名语义、陈旧证据 stalePaths；学习关联失效 E012 |
| AC05 上下文学习 | 通过 | E012：四段卡+代码引用+确定性单选验证、无 LLM 可用、view 不升级状态、self-reported≠verified |
| AC06 认知债务 | 通过 | E012：公式/因子/权重/去重可见、测试手工复算 2×1×1 与 2×0.6×1、未评估/未知单列、更正/忽略/恢复/删除、无能力排名声明 |
| AC07 cliff 与 CLI 体验 | 通过 | E006 真实 cliff 集成（零网络/零 exit/零仓库代码执行/零配置继承）+ E008/E011：空 argv≡scan .、top-3 有界、partial/取消文案、非 TTY 无询问、JSON stdout 纯净（stderr 0 字节实测）、NO_COLOR、60/80/120 列 CJK、退出码契约 |
| AC08 确定性与降级 | 通过 | E008 normalizedReport 双跑相等；E013 未配置/超时/不可达/无效响应/伪造事实全回退矩阵、增强永不写回报告、双 stub 可替换契约 |
| AC09 本地隐私 | 通过 | E006 四 API 拒绝下运行+不执行项目插件/命令；E010 敏感名称/内容过滤+reason 不泄漏内容+不修改被扫描项目；E012/E014（storage 测试）个人状态独立存储+损坏/版本不静默重置+redactReport 落盘脱敏实测；E013 最小外发+显式开启 |
| AC10 分离架构 | 通过（独立确认） | E008 engine 独立消费者测试（仅 import engine+protocol）；Checker grep 确认 packages/ 零 cliff 引用、同 fixture 人类/JSON 共源 |
| AC11 Loop 与接力 | 通过（演练部分） | L001—L010 全程 checkpoint；E005 真实不一致恢复；E014 独立 Checker 新上下文完成六问接力演练+最小步骤（check 0）；Checker 指出的状态漂移于 r11 修复（本条即修复记录） |
| AC12 发布评估 | 性能与安装通过；用户试用未通过 | 基准（100 文件/20,000 非空行确定性生成）：冷 1.04s（≤10s）、热 0.96s（≤3s）、峰值 331.1 MiB（≤512MiB）；安装 smoke（npm pack→干净目录 install→bin 运行）通过并修复 bin 符号链接 bug；**真实用户试用 ≥4/5 未招募——未通过，不得宣称**（Human Gate） |

### 独立检查与接力演练（E014 内嵌）

- 检查者：独立上下文子 Agent（未参与开发、未读本会话）；review_mode：independent（新上下文，非 self-separated）。
- 结果：**有保留通过**。技术侧全部确认（四命令 0 退出、68/68→本轮 73/73、eval 独立复核含全部 6 unknown 案例、证据逐行核实、cliff 隔离、无源码/学习状态泄漏、四 API 网络断言）。保留项与处置：(1) HANDOFF/CURRENT 正文漂移→r11 修复；(2) 检查期间并发交付未入状态→E014/r11 补记（本条）；(3) storage 专项缺失→本轮补齐（tests/storage.test.ts 5 用例：CORRUPT 拒绝重置且原文件保留、VERSION 拒绝、LOCKED 超时+恢复说明、redactReport 落盘脱敏、deleteData 分类删除）；(4) usage 未列 learn/debt→已修；(5) path-vs-cwd 键语义→usage 文档化；(6) 中文凭据关键词不在过滤范围→SUPPORT.md 限制声明。
- 接力演练六问由 Checker 仅读固定入口正确回答（阶段 9/10、活动任务 T010、最近验证 E013、未完成清单、坑清单），并实跑 npm run check 退出 0。
- invocation：Checker 报告全文存于会话任务输出（摘要如上）；`npx tsx evals/bench.ts`（冷/热/内存）；`npm pack` + 干净目录 `npm install <tgz>` + `.bin/xray doctor/scan`；`npx vitest run` 73/73。
- limitations：真实用户试用未招募（AC12 明示不得宣称通过）；oracle 标签独立复核≠外部 Java 专家标注；SNAPSHOT_CHANGED 混沌检查仍未做（T010 遗留，见 BACKLOG）；Windows/Linux 未测；cliff LICENSE 全文需发布前归档；tarball↔commit 源码一致性未验证。
- supersedes：null。

## E015 — SNAPSHOT_CHANGED 故障注入测试 + 首次提交授权执行

- kind：test + handoff；recorded_at：2026-09-08T17:40+08:00；checkpoint_revision：r12。
- claim：SNAPSHOT_CHANGED 检测路径经确定性故障注入验证（不再仅靠代码审查）；用户授权后将 v0.1 快照首次提交并推送至 github.com/xingzhiwei-code/code-xray。
- task：T010（遗留项收敛 + 发布操作）；acceptance：AC02（快照一致性/覆盖可见）、AC12（发布操作授权执行）。
- operator：20260908-143500-claude；授权：用户本轮明确指示"提交到 https://github.com/xingzhiwei-code/code-xray"。
- subject_snapshot：tests/snapshot-change.test.ts（新增 2 用例）；.gitignore（+.idea/）；首次提交 9a38288（89 文件、10582 行插入）包含全部实现/文档/状态；提交前隐私抽查确认暂存内容无真实密钥（仅 hasSecret 检测正则与 fixture 假凭据字面量）、排除项（node_modules/dist/.idea/.DS_Store/*.tgz/.xray/artifacts/tmp）全部生效。
- environment：macOS、Node v22.14.0、vitest 5.0.0、git 2.39.5、gh CLI（github.com 账号 xingzhiwei-code）。
- invocation：`npx vitest run`（75/75）；`npm run check`（0 错误）；`npm run build`；`npx tsx evals/run.ts`（exit 0）；`git add -A && git commit`；`git remote add origin … && git push -u origin main`。
- expected：故障注入用例证明——文件在读取中变化时：该文件被拒绝并产生可见 SNAPSHOT_CHANGED reason（message 含"重新扫描"）、扫描继续（其余文件正常）、半旧半新内容绝不进入快照（断言 both contents absent）、磁盘保留新内容（证明故障真实触发）；未武装时基线扫描不受影响。提交内容排除 node_modules/dist/.idea/.DS_Store/个人数据；推送成功。
- actual：故障注入前先用独立 tsx 脚本诊断，发现真实契约优于原预期（单文件 mid-read 变化降级为可见 reason 而非取消整次扫描；报告因 GAP_CODES 含 SNAPSHOT_CHANGED 转 partial）——测试改为断言该契约，全部通过。提交与推送实测：commit 9a38288302bd562a734e63474694cdacb1b0586b（89 文件、10582 行），git push -u origin main 成功创建远端 main 分支，工作树清洁。
- exit_code：vitest=0（75/75）、check=0、eval=0、commit=0、push=0。
- result：passed。
- artifacts：无独立文件。
- limitations：故障注入覆盖 readFile 期间变化的检测路径；open 前/realpath 竞态窗口仍属代码审查范围；AC12 用户试用仍未执行（Human Gate 保留）。
- review_mode：self-separated；checker：20260908-143500-claude。
- supersedes：E010 中"SNAPSHOT_CHANGED 竞态无法确定性单测"的限制由本条部分解除（readFile 窗口已覆盖）。

## E004 — 四版本规划补全与同步检查

- kind：documentation；recorded_at：2026-09-08；checkpoint_revision：r1。
- claim：PRD 已明确共四个产品版本，并逐一列明功能、用户流程、交付范围与独立验收；架构、Backlog 和固定入口同步。
- 来源：用户本轮指出版本规划不清楚；D006 记录解释与范围。
- method：逐节核对 PRD 与后续任务，独立文档检查继承关系、能力一致性条件及产品接入/开发接力区别；重跑 Markdown/任务/版本编号/状态/ZIP 校验。
- actual：独立 PRD 复核未发现新增阻断性矛盾；自动检查详见 [PACKAGE_CHECK](../../PACKAGE_CHECK.md)；产品状态仍 not_started，T001 仍为下一步。
- result：passed（仅文档范围）；检查退出码 0；18 份文件、12 个 v0.1 AC 和 12 个后续版本验收编号有效，状态 r1 一致，ZIP 与独立文件字节一致；无产品测试结论。
- review_mode：independent 对本次 PRD 范围的只读复核 + root 跨文件检查。
- limitations：版本规划不是实现能力；V02/V03/V04 全部待验收。E003 保留为初次包检查历史，当前文件摘要以 E004 对应清单为准。

## E016 — Developer Profile v1 与个性化 Knowledge Gap

- kind：test + binary smoke；recorded_at：2026-09-09T10:30+08:00；checkpoint_revision：r13。
- claim：Developer Profile v1 数据模型、本机全局持久化、CLI onboarding/查看/更新、画像化 Knowledge Gap 与 Cognitive Debt 声明接入全部实现并通过当前快照验证。
- task：T011；acceptance：AC05/AC06/AC09 增强项（不改变 v0.1 原验收边界）。
- operator：20260909-101500-codex。
- subject_snapshot：base_commit：df10a87d8e14aed365781d86258a0363b1117c07；新增 packages/developer-profile/{types.ts,engine.ts}、tests/{developer-profile.test.ts,profile-cli.test.ts}；变更 apps/cli/index.ts、packages/learning/engine.ts、packages/storage-local/index.ts、README.md、docs/SUPPORT.md、docs/ARCHITECTURE.md、状态文档。
- environment：macOS（Darwin 24.3.0）、Node v22.14.0、npm 10.9.2、vitest 5.0.0、TypeScript 7.0.2。
- invocation：`npm run check`；`npm test`；`npm run build`；真实二进制 profile show/init、XRAY_PROFILE_DIAGNOSTICS=1 scan、JSON stdout 解析。本轮补跑最终快照：check/test/build 与二进制默认摘要均通过。
- expected：类型检查 0 错误；测试全过且包含 profile 模型/持久化/画像化缺口/CLI 生命周期/默认摘要画像提示；JSON stdout 保持纯净；无 profile 时显示未评估；有 Spring 画像时 spring 概念显示画像信号、JPA 显示缺少技能；profile 文件位于 `developer/profile.json` 且项目 learning 状态保持分离。
- actual：check 0；81/81 tests passed（12 files）；build 0；二进制 smoke 全部符合。注意：`npx tsx evals/run.ts` 在沙箱 IPC listen EPERM 下无法运行，改用 `npm run build` + 真实 dist CLI 验证；本轮未修改 Java 规则，冻结 oracle 不受影响。
- exit_code：check=0、test=0、build=0、profile CLI=0、scan=0。
- result：passed。
- limitations：profile CLI 一次仅更新一个技能（最小 onboarding 形态）；画像不能自动升级学习状态；真实跨 Surface 复用需到 V02/V03/V04 验收；未做 Windows/Linux。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E022 — T101 用户宿主截图：激活、活动栏图标与空状态正常

- kind：ux_review；recorded_at：2026-09-09T16:40+08:00；checkpoint_revision：r17。
- claim：用户在本机 VS Code 1.135 中确认扩展已激活：活动栏出现 Code X-Ray 容器且 `$(search)` 图标渲染；Findings 视图显示空状态提示。此为用户提供的宿主证据。
- task：T101；acceptance：V02-4 安装/激活子项。
- operator：用户（截图）；记录：20260909-101500-codex。
- subject_snapshot：用户粘贴截图（活动栏放大镜图标高亮 + "Code X-Ray: Findings / No report yet. Run Code X-Ray: Scan Workspace."）。
- environment：用户本机 VS Code（深色主题）。
- invocation：用户点击活动栏 Code X-Ray 并截图。
- expected：容器与视图可见、空状态文案可读、图标可见。
- actual：与预期一致；截图同时确认空状态可被误解为"没有功能"，因此同轮补 E021 的空状态可点击动作与视图扫描按钮。
- exit_code：not_applicable。
- result：passed（激活/图标/视图渲染子项，来源：用户提供）。
- limitations：截图未覆盖扫描、findings、证据跳转与学习闭环；这些仍待用户重装新 VSIX 后验证。
- review_mode：user-reported；checker：20260909-101500-codex。
- supersedes：null。

## E023 — T101 范围感知扫描实现

- kind：test + build；recorded_at：2026-09-10T19:35+08:00；checkpoint_revision：r18。
- claim：共享 Engine/Workspace 层支持显式 selected 与 uncommitted 扫描范围；VS Code 扫描优先使用当前 active editor 文件作为 selected 范围，否则退回 uncommitted 范围，均无时用 typed error 阻止扫描。
- task：T101；acceptance：V02-1/V02-3/V02-4 的范围语义子项。
- operator：20260909-101500-codex。
- subject_snapshot：packages/protocol/index.ts（AnalyzeScope）；packages/workspace-local/index.ts（scope 过滤与 git status）；apps/vscode/extension.ts（active editor scope + INVALID_SCOPE 提示）；tests/workspace.test.ts（+5 用例）。
- environment：macOS、Node v22.14.0、TypeScript 7.0.2、vitest 5.0.0、esbuild 0.28.2。
- invocation：`cd apps/vscode && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit`；`npx vitest run tests/workspace.test.ts`；`npm run build:vscode`；重新打包 VSIX。
- expected：selected 文件/文件夹只扫描范围内 `.java`；uncommitted 只包含 modified/staged/untracked 的 `.java`；无范围且无未提交 Java 时 `INVALID_SCOPE` exitCode=2；范围越界/绝对路径/traversal 拒绝；VS Code 捕获 `INVALID_SCOPE` 并提示用户选择文件或文件夹。
- actual：VS Code 类型检查 0；workspace 23/23 tests；build 0；VSIX 重新打包成功。
- exit_code：tsc=0、vitest=0、build=0、pack=0。
- result：passed（机器验证范围）。
- limitations：VS Code 侧当前只读取 active editor 文件，尚未接入 Explorer 多选 TreeView/API；用户需在宿主重装 VSIX 后验证三种交互路径。git status 解析覆盖常规与 rename 目标，复杂 submodule/ignored 状态未测。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E024 — T101 Explorer 选择范围接入

- kind：test + build；recorded_at：2026-09-10T19:45+08:00；checkpoint_revision：r18。
- claim：VS Code Explorer 右键菜单可将当前选择的文件/文件夹（含多选 URI 参数）作为 selected scope 扫描；Findings 视图/命令面板无 Explorer 选择时沿用 active editor 或 uncommitted 规则。
- task：T101；acceptance：V02-1/V02-3/V02-4 的范围交互子项。
- operator：20260909-101500-codex。
- subject_snapshot：apps/vscode/package.json（新增 `codeXray.scanSelection` 与 `explorer/context` 菜单）；apps/vscode/extension.ts（URI 参数解析、selected scope、执行后清空）。
- environment：macOS、Node v22.14.0、TypeScript 7.0.2、vitest 5.0.0、esbuild 0.28.2。
- invocation：`cd apps/vscode && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit`；`npm test`；`npm run build:vscode`；重新打包 VSIX 并检查 manifest。
- expected：Explorer 单选/多选文件或文件夹触发 selected 扫描；URI 必须 file scheme 且位于第一个 workspace folder 内；无 Explorer 选择时仍走 active editor/uncommitted；无范围且无未提交更改提示用户。
- actual：VS Code tsc 0；86/86 tests；build 0；VSIX 内确认 `scanSelection` 与 `explorer/context`。
- exit_code：tsc=0、test=0、build=0、pack=0。
- result：passed（构建与包检查；宿主交互待用户验证）。
- limitations：未在真实宿主自动点击 Explorer 菜单；多选参数行为依赖 VS Code command URI 传参契约，需要用户安装新 VSIX 验证。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E025 — T101 范围扫描最终验证

- kind：test + build；recorded_at：2026-09-10T19:57+08:00；checkpoint_revision：r18。
- claim：范围感知扫描、Explorer 选择接入与统一 verify 流程在当前快照全部通过。
- task：T101；acceptance：V02-1/V02-3/V02-4 机器可验子项。
- operator：20260909-101500-codex。
- subject_snapshot：packages/{protocol,workspace-local}、apps/vscode、tests/workspace.test.ts、scripts/{check-cli,check-vscode,build-vscode}.mjs、package.json、tsconfig.json。
- environment：macOS、Node v22.14.0、TypeScript 7.0.2、vitest 5.0.0、esbuild 0.28.2。
- invocation：`npm run verify`。
- expected：CLI/Engine 类型检查、VS Code 类型检查、测试、CLI build、VS Code build 全部通过。
- actual：`npm run verify` 退出 0；86/86 tests 通过；CLI 与 VS Code bundle 均构建成功。
- exit_code：0。
- result：passed。
- limitations：Explorer 单选/多选与 no-scope 提示仍需用户在真实宿主重装 VSIX 后验证。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E026 — T201 V03 共享深化分析第一轮

- kind：test + build；recorded_at：2026-09-11T10:15+08:00；checkpoint_revision：r19。
- claim：共享 Java Analyzer 新增 Bean 候选/注入关系、事务边界、JPA 持久化上下文三类静态深化规则，并同步学习卡、Developer Profile 映射和能力边界；JetBrains 壳尚未实现。
- task：T201；acceptance：V03-2 的 Engine 子项（非完整 V03 验收）。
- operator：20260909-101500-codex。
- subject_snapshot：packages/analyzer-java/index.ts（3 个新规则）；packages/learning/{types.ts,engine.ts}（3 张学习卡）；packages/developer-profile/engine.ts（技能映射）；packages/engine/index.ts（能力边界）；tests/{engine,cli,developer-profile}.test.ts。
- environment：macOS、Node v22.14.0、TypeScript 7.0.2、vitest 5.0.0、esbuild 0.28.2。
- invocation：`npm run verify`。
- expected：类型检查、测试、CLI build、VS Code build 全绿；新增规则公开在能力声明中；输出明确为静态候选与验证建议，不宣称运行时事实。
- actual：verify 退出 0；86/86 tests；fixture 报告发现数 15→27（新增 Bean 1、事务边界 7、持久化上下文 4）。
- exit_code：0。
- result：passed（共享分析内核机器验证）。
- limitations：三类规则尚无独立正/负/未知 fixture 与冻结评估；未接入 JetBrains PSI；本机默认 Java 8、无 Gradle、网络不可用，IntelliJ 插件壳被环境阻塞。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E021 — T101 侧栏可用性第二轮：空状态动作、视图扫描按钮、saved report 恢复与 stale 守卫

- kind：test；recorded_at：2026-09-09T16:40+08:00；checkpoint_revision：r17。
- claim：VS Code 侧栏空状态提供可点击的扫描入口；视图标题提供扫描按钮；激活时自动恢复 CLI/上次会话保存的报告，并在磁盘内容与报告快照不一致时隐藏旧位置（stale 守卫），避免把磁盘旧行号套到新内容（PRD V02-7）。
- task：T101；acceptance：V02-1/V02-3/V02-4 子项。
- operator：20260909-101500-codex。
- subject_snapshot：apps/vscode/extension.ts（restoreSaved/stalePaths/action 节点）、apps/vscode/package.json（view/title 菜单 + 命令图标）；apps/vscode/dist、code-xray-vscode.vsix 重建。
- environment：macOS、Node v22.14.0、esbuild 0.28.2、TypeScript 7.0.2。
- invocation：`tsc -p apps/vscode/tsconfig.json --noEmit`；`npm run build:vscode`；重新打包 VSIX；`unzip -p` 校验包内 manifest 含 `view/title` 与 `$(refresh)`。
- expected：空状态两节点（说明 + Scan workspace now）；视图标题导航按钮触发扫描；saved report 恢复且 stale 时只显示重扫入口，不渲染可跳转位置。
- actual：类型检查 0；构建 0；包校验通过。stale 判定复用 workspace-local `stalePaths`（与 CLI/Engine 同一 digest 口径）。
- exit_code：tsc=0、build=0、pack=0。
- result：passed（构建与包检查；宿主内交互仍需重装 VSIX 目测）。
- limitations：未做宿主内截图/自动化点击验证；恢复逻辑只在激活时读一次，扫描后以新报告为准。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E017 — 用户报告已试用

- kind：ux_review；recorded_at：2026-09-09T10:50+08:00；checkpoint_revision：r14。
- claim：用户在当前会话中确认“验证可以了，各个命令功能都正确”。本条记录用户单人验收通过，不冒称 4/5 样本调查。
- task：T010；acceptance：AC12（用户试用子项，部分）。
- operator：用户。
- subject_snapshot：当前工作树（T011 相关改动未提交）；本条不涉及代码变更。
- environment：用户本地环境（未提供具体命令、时长或样本数）。
- invocation：用户报告。
- expected：用户确认命令功能正确。
- actual：用户确认验证可以了，各个命令功能都正确。
- exit_code：not_applicable。
- result：passed（用户单人验收）。
- limitations：这是用户单人确认，不是 4/5 样本调查；不能外推为多用户统计结论。
- review_mode：user-reported；checker：not_applicable。
- supersedes：null。

## E018 — Developer Profile 提交与推送尝试

- kind：handoff；recorded_at：2026-09-09T11:00+08:00；checkpoint_revision：r15。
- claim：用户要求的本地 Git 提交已完成；推送因 GitHub 凭据失效未完成。
- task：T011 / T010；acceptance：AC11（开发接力状态）。
- operator：20260909-101500-codex；授权：用户本轮明确要求“先把代码提交 git 上”。
- subject_snapshot：npm run verify 通过（check 0、81/81 tests、build 0）；提交前 git diff --check 无输出。
- environment：macOS、Node v22.14.0、npm 10.9.2、git 2.39.5、gh CLI（账号 xingzhiwei-code）。
- invocation：`npm run verify`；`git diff --check`；`git add -A`；`git commit -m "feat: add developer profile and personalized knowledge gaps"`；`git add -A`；`git commit -m "state: record developer profile checkpoint"`；`git push origin main`；`gh auth status`。
- expected：验证通过后功能与状态进入本地 Git 历史，并推送到 origin/main。
- actual：提交完成：bd26abe（功能，16 文件 +674/-38）、4b1fd41（状态回填）。推送失败：`fatal: could not read Username for 'https://github.com': Device not configured`；`gh auth status` 显示 xingzhiwei-code 的 token invalid。
- exit_code：verify=0、commit×2=0、push=128、gh_auth=1。
- result：passed（本地提交范围）/ blocked（远端推送）。
- limitations：远端 GitHub 未更新；重新认证后可执行 `git push origin main`。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E019 — T101 VS Code 第一轮实现检查

- kind：source_inspection + build；recorded_at：2026-09-09T15:45+08:00；checkpoint_revision：r17。
- claim：T101 第一轮 VS Code Surface 实现已写并通过类型检查与 bundle 构建；尚未完成真实 VS Code 宿主安装/激活/交互验证。
- task：T101；acceptance：V02-1/V02-4 的实现前置，不宣称通过。
- operator：20260909-101500-codex。
- subject_snapshot：新增 apps/vscode/{package.json,tsconfig.json,extension.ts,vscode.d.ts,vscode-actual.d.ts,assets/activity.svg}、scripts/build-vscode.mjs；变更 package.json、.gitignore。基线 HEAD 344e2f5。
- environment：macOS、Node v22.14.0、TypeScript 7.0.2、esbuild 0.28.2、VS Code 1.135.0（官方本机 API 声明用于类型检查）。
- invocation：`cd apps/vscode && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit`；`npm run build:vscode`；打包 `code-xray-vscode.vsix`。
- expected：扩展只复用 Engine/Storage/Learning；提供 Scan Workspace、Findings 树、证据跳转、解释弹窗、Mark As Learning、未保存缓冲区提示；保存后扫描默认关闭；类型检查与构建通过。
- actual：TypeScript 检查通过；esbuild 产出 `apps/vscode/dist/extension.js`（CJS，external vscode）与 VSIX。真实安装失败：沙箱拒绝 VS Code CLI 写 `~/.vscode/extensions/.obsolete` 与 Code 日志目录（EPERM），因此未激活验证。
- exit_code：tsc=0、build=0、vsix_pack=0、code_install=1（EPERM）。
- result：blocked（真实宿主验证）。
- limitations：未验证扩展激活、命令注册、Tree UI、证据定位、学习状态写入；未验证安装/卸载/禁用；未做截图或宿主日志；`@vscode/test-electron` 依赖因网络 ENOTFOUND 未安装。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E020 — T101 活动栏图标修复

- kind：test；recorded_at：2026-09-09T16:20+08:00；checkpoint_revision：r17。
- claim：VS Code 活动栏容器使用内置 `$(search)` 主题图标，替代不易被宿主渲染的自定义 SVG；扩展重新构建并打包。
- task：T101；acceptance：V02-1 UI 可用性子项。
- operator：20260909-101500-codex。
- subject_snapshot：apps/vscode/package.json（activitybar icon 改为 `$(search)`）；apps/vscode/dist/package.json；code-xray-vscode.vsix。
- environment：macOS、Node v22.14.0、esbuild 0.28.2、VS Code 1.135.0。
- invocation：`tsc -p apps/vscode/tsconfig.json --noEmit`；`npm run build:vscode`；重新打包 VSIX；检查包内 manifest。
- expected：使用 VS Code 官方主题图标语法，随 light/dark/high-contrast 自动着色；扩展仍可构建。
- actual：类型检查 0；构建 0；VSIX 内 `extension/package.json` 确认 `icon: "$(search)"`。
- exit_code：tsc=0、build=0、pack=0。
- result：passed（构建与包检查；用户重装后仍需目测活动栏）。
- limitations：未在宿主内截图确认；需要用户重新安装 VSIX 并 Reload Window。
- review_mode：self-separated；checker：20260909-101500-codex。
- supersedes：null。

## E027 — T301a Agent Surface MCP stdio server 第一轮（Loop A）

- kind：test + build + source_inspection；recorded_at：2026-09-22T16:30+08:00；checkpoint_revision：r20。
- claim：新增 apps/agent（手写 JSON-RPC 2.0 + NDJSON 的 MCP stdio server，协议版本 2025-06-18/回退 2024-11-05，零新依赖），提供 xray_capabilities/xray_scan/xray_evidence 三工具，全部返回产品 envelope（schemaVersion/status/data|error）；域失败走 isError envelope，协议失败走 JSON-RPC 错误码；证据回源包裹为 source-data 且逐行脱敏；跨进程同快照确定性成立。Claude Code 与 Codex CLI 均已注册该 server，但两宿主的 LLM 闭环实测分别被"待交互批准"与"上游代理 502"阻塞。
- task：T301（T301a）；acceptance：V04-1（单宿主工具链部分）、V04-2 部分（错误/协议契约）、V04-4 部分（evidence 数据边界与脱敏）。
- operator：20260922-claude-v04。
- subject_snapshot：apps/agent/{index.ts,host/jsonrpc.ts,host/mcp.ts,host/bridge.ts,tools/index.ts,tsconfig.json}；packages/protocol/index.ts（+Envelope/Gate/okEnvelope/errorEnvelope）；scripts/{build-agent.mjs,check-agent.mjs}；package.json（check/verify 链 + dev:agent）；tests/agent-mcp.test.ts（10 用例）；.mcp.json；Codex 全局 config.toml（codex mcp add code-xray）。
- environment：macOS arm64、Node v22.14.0、TypeScript 7.0.2、vitest 5.0.0、esbuild 0.28.2、claude CLI 与 codex CLI 均在 PATH。
- invocation：`npm run verify`；手工 NDJSON smoke（initialize/tools/list/tools/call capabilities/scan/evidence/bogus method）；`claude mcp list`；`codex mcp add code-xray -- node dist/agent.js && codex mcp list`；`claude -p`（headless）与 `codex exec`（LLM 闭环尝试）。
- expected：check（cli+vscode+agent）0 错误；96/96 测试通过（含 agent-mcp 10 用例：握手返回 2025-06-18 与 serverInfo；tools/list 恰为三工具；capabilities 报告 gatePolicy=report-only 与 java bounds；scan 冻结 fixture 27 findings、findingsTruncated=true、snapshotId 为 64hex；evidence 回源 OrderService.java:29 带 source-data notice、stale=false、行数与 range 一致；未知工具 -32602、未知方法 -32601、坏 JSON -32700 id=null；缺 path 为 INVALID_ARGUMENT envelope 而非协议错误；stderr 无源码；两个独立进程同快照 scan 结果除 analysisId/savedTo 外深度相等）；build:agent 产出可执行 dist/agent.js；宿主 CLI 能发现 server。
- actual：verify 退出 0，96/96 tests（13 文件），dist/agent.js 构建并可运行；手工 smoke 输出与预期一致（握手/tools list/capabilities/scan 27 findings/evidence 回源行 29 orderRepository.save(order)）；`claude mcp list` 显示 code-xray "Pending approval"；`codex mcp list` 显示 code-xray enabled。headless 宿主闭环未完成：`claude -p` 报 "Not logged in"；`codex exec` 报 CC Switch 本地代理 502（上游 127.0.0.1:15721 连接失败）。
- exit_code：verify=0；claude mcp list=0；codex mcp add=0；claude -p=阻塞（未登录）；codex exec=502（上游代理失败）。
- result：passed（机器可验部分：契约/确定性/构建/宿主注册）；blocked（双宿主 LLM 闭环实测——V04-1 收口条件未达成，保持 in_progress）。
- limitations：未在真实宿主会话内完成"修改→分析→读证据→再修改→重扫"（V04-1 留待 T301d）；取消/超时/注入 fixture 契约归 T301c；review 会话与 gate 归 T301b；structuredContent 字段按 MCP 2025-06-18 提供但未对旧宿主降级验证；scan 进度通知（notifications/progress）未实现。
- review_mode：self-separated；checker：20260922-claude-v04。
- supersedes：null。

## E028 — T301a Claude Code 真实宿主闭环 smoke（用户批准后）

- kind：test；recorded_at：2026-09-22T17:05+08:00；checkpoint_revision：r21。
- claim：用户在交互 Claude Code 会话批准 .mcp.json 中的 code-xray server 后，真实宿主内完成 capabilities→scan→evidence 三步闭环：MCP 握手加载成功（server instructions 出现在宿主系统提示）、xray_capabilities 返回 gatePolicy=report-only 与 java 能力边界、xray_scan 对冻结 fixture 返回 ok envelope（36 文件解析、27 findings、findingsTruncated=true、status=complete、snapshotId=ec46f53e…5317 与 E027 跨进程确定性测试值一致）、xray_evidence 按 evidenceId 回源 OrderService.java:29（source-data notice、stale=false、行内容与 CLI 时代 oracle 一致）。
- task：T301（T301a）；acceptance：V04-1 单宿主（Claude Code）"分析→读取证据"子项；V04-4 宿主通道数据边界子项。
- operator：20260922-claude-v04（宿主会话内真实工具调用，用户在场批准）。
- subject_snapshot：dist/agent.js（build-agent 产物，与 E027 同一构建）；.mcp.json；fixtures/java-spring-jpa（冻结，未改动）。
- environment：macOS arm64、Node v22.14.0、Claude Code 交互会话（宿主经 .mcp.json 以 stdio 启动 node dist/agent.js）。
- invocation：宿主内依次调用 mcp__code-xray__xray_capabilities、xray_scan{path=fixtures/java-spring-jpa}、xray_evidence{evidenceId=ev_5ad60533fadc19fddd1e, analysisId=fa8be088-…}。
- expected：三步全部 status=ok；scan 结果与 E027 契约测试断言一致（27 findings、同 snapshotId）；evidence 返回 source-data 包裹与真实源码行。
- actual：与预期完全一致；scan 报告已存入 LocalStore（analysisId fa8be088-2f23-4c89-b884-f580c8dedcaa）；coverage.unknown=38 条原因全部可见，无伪装完整。
- exit_code：not_applicable（宿主内工具调用）。
- result：passed（Claude Code 单宿主工具闭环）。
- limitations：未覆盖"修改→再扫"完整 V04-1 双轮流程（归 T301d）；Codex CLI 宿主仍被上游代理 502 阻塞；review/gate 工具未实现（T301b）。
- review_mode：self-separated；checker：20260922-claude-v04。
- supersedes：null。

## E029 — T301b Review 会话：修改后审查、幂等、过期降级与 gate（Loop B）

- kind：test + build；recorded_at：2026-09-23T09:55+08:00；checkpoint_revision：r22。
- claim：Agent Surface 新增修改后审查闭环：xray_review_start 捕获改动前基线（磁盘现状含未提交内容，快照 manifest + 源码缓存入本地私有存储）；xray_review_finish 经 Engine 新 facade analyzeWithBaseline 复用同一 buildDiff 生成结构化审查（变化摘要/路径影响/新增持续移除风险/证据引用/未知覆盖/建议验证/概念/债务变化）；reviewId 内容寻址（workspaceId+targetSnapshotId+ruleSetVersion），同快照重复触发幂等复用（reused:true），新改动产生新 reviewId；xray_review_read 跨进程恢复记录，读取时按 stalePaths 重算过期并把 gate 降级为 incomplete（旧结论不冒充新改动，读取时计算不落盘）；gate 默认 report-only，XRAY_AGENT_GATE=enforce 时非 pass 才 blocking，complete+零发现才 pass 且声明"零发现不等于没有问题"；xray_explain/xray_summary 复用 learning/debtSummary/knowledgeGaps，Agent 不改学习状态。
- task：T301（T301b）；acceptance：V04-1（审查输出结构）、V04-3（报告标识/快照核对/过期/跨进程恢复）、V04-2 部分（幂等/域错误）、V04-4 部分（gate 仅显式启用才阻塞）。
- operator：20260922-claude-v04。
- subject_snapshot：packages/protocol/index.ts（+ReviewRecord/ReviewSession/ReviewOutput/ReviewVersions/ReviewDebtDelta，AnalyzeRequest+onBaseline 内部钩子）；packages/engine/index.ts（+analyzeWithBaseline，复用私有 buildDiff）；packages/storage-local/index.ts（+saveReview/loadReview/findReviewByTargetSnapshot/saveSession/loadSession，DataKind+'reviews'，deleteData 覆盖 reviews/review-sessions）；apps/agent/host/bridge.ts（startReview/finishReview/readReview/computeGate/explainFinding/summarize/staleness 降级）；apps/agent/tools/index.ts（+5 工具，共 8）；apps/agent/host/mcp.ts（instructions 更新）；tests/agent-helpers.ts（共享 spawn 客户端）；tests/agent-review.test.ts（9 用例）；tests/agent-mcp.test.ts（改用 helper）。
- environment：macOS arm64、Node v22.14.0、TypeScript 7.0.2、vitest 5.0.0、esbuild 0.28.2。
- invocation：`npm run verify`；`npm run build:agent` + 真实 dist/agent.js NDJSON smoke（start→改文件→finish→再 finish）。
- expected：verify 全绿（105/105，14 文件）；review 测试覆盖：基线捕获（fileCount/ snapshotId）、修改后 finish 返回结构化 record（added 含新文件、newFindingIds>0、gate=needs_human、blocking=false、debtDelta.modelVersion=debt-model-v1）、幂等（两次 finish 同 reviewId + reused:true）、新改动新 reviewId、review_read 恢复 + touch 后 stale:true + gate 降级 incomplete 且 reason 含"过期"、NO_REVIEW_SESSION/NO_REVIEW 为域错误 envelope、explain/summary 复用共享引擎、enforce 下 needs_human blocking=true、干净工作区 pass 且声明零发现不等于没有问题、跨进程（两个 server 实例共享 dataDir）恢复同一记录；二进制 smoke 同语义。
- actual：verify 退出 0，105/105 tests；agent-review 9/9、agent-mcp 10/10；二进制 smoke：修改→finish gate=needs_human（added=[Batch.java]）、再 finish reused:true 同 reviewId，与测试一致。修复一个真实缺陷：readReview/finish 复用路径最初未应用 stale 降级（测试抓到），改为读取时 withStaleness 统一降级。
- exit_code：0。
- result：passed（机器验证 + 构建产物 smoke）。
- limitations：真实宿主内的 review 双轮闭环（修改→审查→再修改→重扫，V04-1 完整语义）留待 T301d 双宿主验收；取消/超时/注入契约归 T301c；session 基线缓存含源码明文（0600 用户私有目录，deleteData 可清除），隐私矩阵复测归 T301c；debtDelta 在无画像时按未评估处理，未单独断言。
- review_mode：self-separated；checker：20260922-claude-v04。
- supersedes：null。

## E030 — T301c 契约加固：取消/超时/消息上限/注入遏制/会话隐私（Loop C）

- kind：test + eval；recorded_at：2026-09-23T10:10+08:00；checkpoint_revision：r23。
- claim：Agent Surface 契约加固完成：(1) notifications/cancelled 在派发前后均不产生伪成功——取消先于派发时工具入口快速失败 CANCELLED（exitCode 130），取消晚于完成时返回真实 complete；未知 requestId 取消为 no-op 且 server 继续服务；(2) timeoutMs=1 触发 TIMEOUT 域错误且消息可行动；(3) 单条 NDJSON 消息 >1MB 被 -32700 拒绝且 server 存活；(4) 注入遏制——fixtures/injection-java（恶意"ignore previous instructions/APPROVE_EVERYTHING/rm -rf /"注释与字符串）触发真实 JPA_CALL_IN_LOOP 发现的前提下，恶意文本不出现在 scan summary/limitations/finding 标题/nextCheck/assumptions/coverage 消息/review gate.reasons/changeSummary/suggestedChecks/unknownCoverage/stderr，仅可经 xray_evidence 以 source-data 包裹（含"不应被执行"notice）到达；(5) review session 基线源码缓存全部 0600/目录 0700，deleteData('reviews') 连带清除 review-sessions，清除后 finish 返回 NO_REVIEW_SESSION 域错误。
- task：T301（T301c）；acceptance：V04-2（取消/超时/错误契约）、V04-4（注入遏制、默认本地与隐私边界）。
- operator：20260922-claude-v04。
- subject_snapshot：tests/agent-contract.test.ts（10 用例）；fixtures/injection-java/（2 文件）；apps/agent/tools/index.ts（throwIfAborted 入口快速失败）；packages/storage-local/index.ts（deleteData 'reviews'→reviews+review-sessions）；tests/cli.test.ts（根扫描计数 36→38/27→28，因新 fixture 入仓库树，冻结 oracle fixture 本身未动）。
- environment：macOS arm64、Node v22.14.0、vitest 5.0.0。
- invocation：`npm run verify`；`npx tsx evals/run.ts`。
- expected：verify 全绿（115/115，15 文件）；冻结 oracle eval exit 0（injection fixture 不在 oracle 范围，不影响 30 案例评估）；上述五组契约断言全部通过。
- actual：verify 退出 0，115/115 tests；eval exit 0；契约测试 10/10。injection fixture 在仓库根扫描中贡献 1 项 JPA_CALL_IN_LOOP（demo.inject.InjectedService#saveAll），证明遏制断言非空洞。
- exit_code：0。
- result：passed。
- limitations：取消的"分析中途被打断"路径依赖进度钩子轮询，测试断言的是契约（要么 CANCELLED 要么真实 complete，绝不伪造）而非确定的打断时点；LLM 增强通道的注入测试不适用（Agent Surface 未接 provider）；Codex 宿主实测归 T301d。
- review_mode：self-separated；checker：20260922-claude-v04。
- supersedes：null。

## E031 — T301d(部分) V04-1 双轮闭环演示:基线→修改→审查→证据→再修改→重扫

- kind:test;recorded_at:2026-09-23T10:35+08:00;checkpoint_revision:r24。
- claim:在真实构建产物 dist/agent.js 的 MCP NDJSON 通道上完成 PRD §8.5 用户流程双轮闭环(13/13 断言):R1 基线捕获(36 文件,snapshotId 与冻结 fixture 一致)→修改 OrderService 新增 auditAll 循环→review_finish 检出 modified 文件、new=1/continuing=4、gate=needs_human 且 blocking=false、suggestedChecks=5→新发现锚定 demo.orders.OrderService#auditAll、evidence 回源 OrderService.java:35 source-data→重复 finish 幂等 reused=true 同 reviewId;R2 再修改(saveAll 替换循环)→新 reviewId、removed=5/new=0(风险移除被检出)→旧审查 review_read 返回 stale=true + gate 降级 incomplete + stalePaths 指向被改文件;debt 摘要 modelVersion=debt-model-v1 复用共享引擎。
- task:T301(T301d 部分);acceptance:V04-1(单宿主工具链双轮闭环语义)、V04-3(报告标识/基线目标快照/过期/持久恢复)。
- operator:20260922-claude-v04。
- subject_snapshot:scripts/demo-v04-double-loop.py(可重跑演示脚本);dist/agent.js(build-agent 产物);artifacts/evidence/E031/{checks.json,v04-double-loop-transcript.ndjson}(完整 NDJSON 转录与断言结果);fixtures/java-spring-jpa(只读源)/tmp 工作副本(已清理)。
- environment:macOS arm64、Node v22.14.0、python3(仅测试驱动)。
- invocation:`npm run build:agent && python3 scripts/demo-v04-double-loop.py`。
- expected:13 项断言全过、exit 0;审查结论与改动一一对应;旧审查不冒充新改动。
- actual:13/13 passed,exit 0;transcript 与 checks 已存 artifacts/evidence/E031/。
- exit_code:0。
- result:passed(工具链双轮闭环,经真实构建产物的 MCP 通道)。
- limitations:本证据是脚本驱动的 MCP 客户端闭环,不是 LLM 宿主会话内的自主调用;V04-1 要求的"两个不同宿主(Claude Code + Codex)实测"仍未收口——当前会话加载的 server 进程是 Loop A 构建(仅 3 工具),review 工具需宿主重启后加载;Codex 上游代理 502。Stop hook opt-in 未实现。
- review_mode:self-separated;checker:20260922-claude-v04。
- supersedes:null。

## E032 — T301d Claude Code 宿主内自主调用双轮 review 闭环(V04-1 单宿主收口)

- kind:test;recorded_at:2026-09-23T11:20+08:00;checkpoint_revision:r25。
- claim:用户重启 Claude Code 会话加载 8 工具版 dist/agent.js 后,宿主 LLM 会话内自主完成 PRD §8.5 完整用户流程:review_start(基线 ec46f53e… 与冻结 fixture 一致)→修改 OrderService 新增 auditAll 循环→review_finish(reviewId rev_8a5d684b…,modified 检出、new=1 锚定 auditAll、gate needs_human 非阻塞、debtDelta 0→56)→explain(前提/未知/学习卡,只读)→evidence(source-data 回源循环体 34-36 行)→再修改(saveAll 修复 + restockOne 自调用)→重新 start/finish(JPA_CALL_IN_LOOP 6→5 修复生效、TX_SELF_INVOCATION 5→6 新风险检出、debtDelta 56→56.46 对应新绑定)→review_read 旧审查(stale=true、gate 降级 incomplete、reason 明示"结论不代表当前代码")→跨会话重复 finish(不同 sessionId、同一目标快照 → 同一 reviewId reused=true,内容寻址幂等成立)。
- task:T301(T301d);acceptance:V04-1(Claude Code 宿主"修改→分析→读取证据→再修改→重扫")、V04-3(报告标识/快照核对/过期/持久恢复,不依赖聊天记忆)、V04-2 部分(unknown 显式、不伪装通过)、V04-4 部分(gate report-only 全程 blocking=false)。
- operator:20260922-claude-v04(宿主会话内 LLM 自主调用,用户在场并重启会话)。
- subject_snapshot:dist/agent.js(2e1204a 后构建,与 E030/E031 同一代码);/tmp/xray-v04-host(36 文件工作副本);artifacts/evidence/E032/host-session-transcript.md(调用序列与关键返回摘要)。
- environment:macOS arm64、Node v22.14.0、Claude Code 交互会话(.mcp.json stdio 加载)、默认 LocalStore(~/Library/Application Support/code-xray)。
- invocation:宿主内依次调用 xray_review_start → (修改) → xray_review_finish → xray_explain → xray_evidence → (再修改) → xray_review_start/finish → xray_review_read → 跨会话 xray_review_finish。
- expected:与 E031 脚本演示同语义的全部断言在宿主自主调用下成立。
- actual:全部成立(详见 artifacts/evidence/E032/host-session-transcript.md 九步序列);无一处 partial/unknown 被包装为通过;gate 全程 report-only。
- exit_code:not_applicable(宿主内工具调用)。
- result:passed(Claude Code 单宿主 V04-1 闭环)。
- limitations:V04-1 要求"两个不同宿主"——Codex CLI 仍被上游代理 502 阻塞,双宿主收口条件未达成;Stop hook 自动触发未实现(本轮为显式调用);转录为摘要级(完整返回在会话记录,关键 ID/数值已摘录)。
- review_mode:self-separated;checker:20260922-claude-v04。
- supersedes:null。

## E033 — T301d Stop hook opt-in(scripts/agent-review-hook.mjs)+ 契约测试 + 独立 Checker 复查

- kind:test + ux_review(独立 Checker);recorded_at:2026-09-23T19:45+08:00;checkpoint_revision:r26。
- claim:(1) 交付 opt-in 宿主 hook(scripts/agent-review-hook.mjs):走 CLI 同一 Engine(scan --base,XRAY_HOOK_BASE='' 可关基线),report-only 默认永 exit 0 只输出诚实摘要(含"未知不等于无风险"与 analysisId 指针);仅 XRAY_AGENT_GATE=enforce 时非 pass 关口 exit 2;分析失败/输出不可解析明示"审查未完成…请勿视为审查通过",绝不伪装;README 声明 opt-in 默认不启用。(2) tests/agent-hook.test.ts 4 契约用例锁定上述语义;verify 119/119(16 文件)。(3) 独立 Checker(全新上下文 general-purpose agent)复查 V04 验收映射与实现:总结论"有保留通过"——架构边界/gate 默认/注入遏制/隐私/hook 行为/状态一致性全部 ✓,发现 1 高 2 低问题:V04_ACCEPTANCE 引用当时尚不存在的 E033 且 hook 无契约测试(高)、CURRENT git head 滞后一轮(低)、demo 脚本重跑覆写 E031 产物(Checker 已 git checkout 恢复,说明级)。
- task:T301(T301d);acceptance:V04-2(自动触发子项:opt-in hook 契约测试)、V04-4(gate 仅启用范围生效的 hook 侧)。
- operator:20260922-claude-v04(实现)+ 独立 Checker agent(复查,a6d4c51477b6d8c58)。
- subject_snapshot:scripts/agent-review-hook.mjs;tests/agent-hook.test.ts;README.md(hook opt-in 段);docs/state/V04_ACCEPTANCE.md;修复按 Checker 发现落盘(本条 E033 补写、V04_ACCEPTANCE 自动触发行改引 E033+测试、CURRENT head 更新)。
- environment:macOS arm64、Node v22.14.0、vitest 5.0.0。
- invocation:`npm run verify`;`npx vitest run tests/agent-hook.test.ts`;手工四路径实测(fixture report-only=0/enforce=2、坏路径 0+2、干净目录 enforce=0)。
- expected:hook 四路径语义正确;119/119;Checker 发现的"高"问题在本轮闭环(E033 存在 + 契约测试落地 + 验收映射改引真实证据)。
- actual:与预期一致;Checker 总结论"有保留通过",其唯一高级别发现(E033 缺失/hook 无测试)已按建议补齐后本条成立。
- exit_code:0。
- result:passed(hook opt-in 交付与契约化;独立 Checker 复查完成且发现已处置)。
- limitations:hook 在真实宿主 settings.json 的端到端触发未配置实测(opt-in 交付边界,用户启用时验证);Codex 第二宿主实测仍搁置(V04-1 open);demo 脚本重跑会覆写 E031 产物——已在 HANDOFF 记录该副作用,验收以已提交快照为准。
- review_mode:independent(全新上下文 Checker);checker:general-purpose agent a6d4c51477b6d8c58。
- supersedes:null。

## E034 — T302 Review Insight Layer v0.2：概念聚合 + Review schema 0.2 + Cognitive Debt v2

- kind:test;recorded_at:2026-09-25T18:00+08:00;checkpoint_revision:r27。
- claim:按 docs/plans/CODE_XRAY_REVIEW_INSIGHT_LAYER_V0.2_PLAN.md Phase 1—9 完整执行并回写实施记录/DoD。(1) Phase 1 先在改造前固化 v0.1 旧问题基线（tests/fixtures/review-insight-v0.1-before.json：12 findings→12 条 suggestedChecks（其中 10 条 nextCheck 文本全同）+ debt-model-v1 线性 24.0；tests/insight-baseline.test.ts P1—P4 断言）。(2) 新增共享领域包 packages/insights：buildReviewInsights（同 concept N findings→1 Insight，findingIds/evidenceIds/symbols 全保留）、buildReviewRecord/computeGate 自 bridge 迁入（adapter 零聚合）、renderReviewPresentation（纯函数确定性渲染）；learning 新增 ConceptKnowledgeState + CONCEPT_STATUS_PRECEDENCE（显式顺序无关聚合，Case 3/12）+ getConceptContent（公开概念元数据，不含 question/answer）。(3) Review schema 0.1→0.2：overview/insights/resolvedInsights/coverageSummary 为主要消费面，v0.1 字段 deprecated 保留，suggestedChecks 升级为每 Insight 一条主检查（insightId 关联），resolved 证据显式 evidenceScope='baseline'，ajv reviewRecordSchema + assertReviewRecord（结构+钻取完整性+overview 一致性），存量 0.1 记录版本化读取原样返回不回填。(4) Cognitive Debt v2：conceptDebt = impact×gap×evidenceStrength×exposureFactor，exposureFactor=1+min(0.5, log2(n)×0.15)（1→1.00/2→1.15/5→1.35/≥10→1.50 封顶，常量具名导出并随报告透明输出）；同概念 10 处=3.0 而非 20.0（Case 4）；同一 review before/after 恒同模型（Case 13）；学习状态存储格式不变、无数据迁移；binding 明细保留 bindingItems 钻取。(5) gate 语义零变化（partial/unknown/failed≠pass、blocking 仅 enforce、幂等/stale 保持），headline 概念化并保留 finding 计数 detail（Case 8/9/10 测试）。(6) 注入遏制契约扩展到 insights/resolvedInsights/overview/coverageSummary/presentation 通道。
- 验证：npm run verify exit 0（check:cli/vscode/agent 三路 tsc + vitest 158/158（20 文件）+ build + build:vscode + build:agent）；npx tsx evals/run.ts 冻结 oracle 通过（analyzer 零改动、precision/recall 无退化、unknown 零泄漏）；npx tsx evals/bench.ts cold 0.90s（≤10s）/hot 0.84s（≤3s）/peak 335.5MiB（≤512MiB）AC12 通过。同场景 before/after 实证（tests/fixtures/review-insight-v0.2-after.json）：事实零变化（newFindingIds 与 v0.1 逐项相等）、suggestedChecks 12→3、债务 24.0→7.0、gate 措辞概念化（"3 个新的风险概念（12 个具体代码位置）"）；§23 验收 e2e（真实 MCP 管线，tests/review-acceptance.test.ts）：5 raw findings→1 actionable insight（1 new+2 continuing 聚合）+2 resolved insights（baseline scope）+untouched 文件 finding 诚实排除+1 条主检查+幂等重放 presentation 逐字节一致。
- task:T302;acceptance:计划 §28 DoD 22/22 勾选（含证据指针）；AC05/AC06 债务透明性增强；V04-2/3/4 工具契约保持（agent-review/contract 全绿）。
- operator:20260925-claude-t302。
- subject_snapshot:main 提交链 a1df029→77c4701→31f76a0→630f57d→43771bb→3ff36ee→7a65cf0→(docs/state r27 提交)；tests/fixtures/review-insight-v0.{1-before,2-after}.json。
- environment:macOS arm64、Node v22.14.0、vitest 5.0.0、默认离线。
- invocation:npm run verify; npx tsx evals/run.ts; npx tsx evals/bench.ts; npx tsx scripts/capture-insight-baseline.ts [out]。
- expected:计划 §19 Case 1—13 全部有测试且通过；verify/eval/bench 全绿；before/after 证明重复信息显著减少。
- actual:与预期一致；新增 33 用例 + 更新既有断言，158/158 零失败；DoD 22/22。
- exit_code:0。
- result:passed。
- limitations:Insight 仅覆盖触达变更文件的 finding（§17 事实层保持不动）；resolved 证据属基线快照、xray_evidence 无法按目标报告回源；occurrence-increase 型升级不做推断（当前 diff 事实不足）；analyzer severity 全 medium 使 importance 区分度受限；CLI/VSCode review 视图未做（渲染器已备好复用）；Codex 宿主实测仍属 T301d 搁置项，与本条无关。
- review_mode:self → independent（补记）;checker:独立 Checker agent（全新上下文，aeb1d212b47641936）;supersedes:null。
- checker_addendum（2026-09-25）：独立 Checker 复查结论**通过**——§21 十二条禁止项全部遵守（analyzer diff 为空、insights 无 LLM/随机/时钟/网络、adapter 零聚合、unknown≠pass、presentation 不落盘）；DoD 抽查 9 项均有代码/测试证据；before/after fixture 真实性核对通过（newFindingIds 12 项逐项相等、checks 12→3、debt 24→7）；6 个目标测试文件独立实测 59/59 通过；§27 实施记录抽查 5 条与实现一致。低级别备注 2 条：①全量 verify/bench 未由 Checker 复跑——已在其复查后独立重跑确认（npm run verify exit 0、158/158（20 文件）、oracle 通过，本次补记时实测）；②exposure 的 occurrence 代理含 stale 绑定——计划 §27.9-4 已诚实披露，非缺陷。零中/高级别发现。

## E035 — T301d Codex CLI 第二宿主实测：会话内自主调用双轮 review 闭环（V04-1 双宿主收口）

- kind:test;recorded_at:2026-09-25T18:59+08:00;checkpoint_revision:r28。
- claim:Codex 上游代理恢复（探测 `codex exec "reply PONG" --skip-git-repo-check` 返回 PONG）后,发现并修复 `~/.codex/config.toml` 中 code-xray 注册丢失（期间配置被外部重写,重新 `codex mcp add` → enabled）;发现并绕过 headless 审批坑（默认 exec 拒绝会话内 MCP 调用:"approval policy is never",需 `--dangerously-bypass-approvals-and-sandbox`）。随后 codex exec 会话内 LLM 自主经 MCP 工具完成双轮闭环(与 E032 同语义,范围差异见 limitations):review_start(基线 `ec46f53e147569cb702932eeb600a82c6f3f508c762074c99c2a945ea1953d17` 与冻结 fixture/E027/E028/E032 逐字符一致,36 文件)→修改 OrderService 新增 auditAll 循环→review_finish(R1=`rev_abc7b15ebc0ef642470a9bb7fd9d02be`,new=1 即 `finding_d133fd902f20b89fe741`——与 E032 Claude 宿主同一 finding ID,JPA_CALL_IN_LOOP 锚定 auditAll,归入 Insight `ins_7315294b…` 概念 jpa.query-amplification,gate=needs_human 非阻塞 report-only,debt 0→15.62 v2)→再修改 saveAll 修复→重新 start/finish(R2=`rev_dee81835…`,JPA_CALL_IN_LOOP 6→5、总 findings 28→27、debt 15.62→14.59;diff 计数为 0 系提示词使 S2 基线捕获于修改之后,baseline==target,宿主 LLM 主动指出)→review_read(R1)返回 stale=true、stalePaths 指向被改文件、gate 降级 incomplete、reason 明示"结论不代表当前代码"。跨宿主确定性成立(同基线 snapshotId、同 finding ID)。
- task:T301(T301d);acceptance:V04-1(Codex 第二宿主"修改→分析→再修改→重扫"实测,双宿主硬条件达成)、V04-3 部分(标识/快照核对/过期/持久恢复)、V04-2 部分(过期语义诚实不伪装)、V04-4 部分(gate 全程 report-only)。
- operator:20260925-claude-t301d(codex exec 宿主内 LLM 自主调用,用户在场并授权收口范围)。
- subject_snapshot:base_commit=185246d(r27 链头,工作树干净);dist/agent.js sha256=38ed0f1406b6d1d23f3b8a550882e72391098774dfdc14e1d6081f93a613eca9(r27 源码构建,无源码新于产物);/tmp/xray-v04-codex(36 文件工作副本,OrderService.java 初始 sha256=b23f786cec19cc60d46bd5f76b7a268db5c541d6c9b0741146dc86da3d016987,实测后已清理);~/.codex/config.toml(code-xray 注册条目)。
- environment:macOS arm64、Node v22.14.0、codex-cli 0.155.1、CC Switch 本地代理(127.0.0.1:15721,已恢复)、`--dangerously-bypass-approvals-and-sandbox --skip-git-repo-check`、默认 LocalStore(~/Library/Application Support/code-xray,与 E032 同一数据目录)。
- invocation:`codex exec "reply PONG" --skip-git-repo-check`;`codex mcp add code-xray -- node <repo>/dist/agent.js && codex mcp list`;`codex exec --dangerously-bypass-approvals-and-sandbox "…xray_capabilities…"`;`codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -o /tmp/e035-quick-last.md "…六步双轮闭环…"`(工作目录 /tmp/xray-v04-codex)。
- expected:上游探测返回 PONG;注册后 enabled;会话内 MCP 调用成功且 capabilities status=ok;双轮闭环各步返回与 E031/E032 同语义断言一致(基线 snapshotId 与冻结值一致、新 finding 锚定 auditAll、gate needs_human 非阻塞、修复后计数下降、旧审查 stale+incomplete);无一处 partial/unknown/过期被包装为通过。
- actual:全部成立(详见 artifacts/evidence/E035/codex-host-session-transcript.md 前置探测+六步序列);跨宿主确定性额外成立(ec46f53e… 基线与 finding_d133fd90… 两宿主逐字符一致);第二轮 diff 计数为 0 的原因被宿主 LLM 如实指出(基线捕获顺序),未伪装成 removed 检出。
- exit_code:not_applicable(宿主内工具调用);codex exec 进程均正常结束。
- result:passed(Codex 第二宿主 V04-1 闭环;双宿主硬条件达成)。
- limitations:explain/evidence 未在本 Codex 会话内复跑("读取证据"子步骤由 E032 宿主实测+E027/E030 同一二进制契约测试覆盖);removed 归因未在 Codex 侧演示(E031 断言+E032 步骤 7 覆盖,本轮经绝对计数可见修复);跨会话幂等未在 Codex 复跑(E029/E032 步骤 9 覆盖,本轮 review_read reused=true 佐证);用户明确指示不再补跑、按本次实测范围收口(D014);转录为摘要级(完整返回在 codex 会话记录);codex exec 依赖 bypass 审批参数与 CC Switch 代理存活。
- review_mode:self-separated;checker:20260925-claude-t301d。
- artifacts:artifacts/evidence/E035/codex-host-session-transcript.md(sha256=326676c380dae3909cf9a924e7a2086cd842fa42a42f6c662a6de334e4e5b433)。
- supersedes:null。
