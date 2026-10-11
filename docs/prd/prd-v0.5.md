# Code X-Ray v0.5 PRD

版本：v0.5（定稿后冻结，不回写；落盘 `docs/prd/prd-v0.5.md`）
日期：2026-10-11
目标：修复 dogfood 发现的问题 + Surface 聚焦。**不写新功能、不新增规则、不新增 MCP 工具、不新增 CLI 命令。**

背景：2026-10-11 实机 dogfood（spring-petclinic，50 文件）发现 P0 构建缺陷、doctor 诚实自检缺失、测试文件噪音、relevance 误判、文档滞后等问题（详见 `~/workspace/code-xray-dogfood/体验报告-2026-10-11.md`，报告已同步给本任务）。同时确定 Surface 策略：MCP agent 为主，CLI 降级为薄壳，删除 VSCode 插件。

## 0. 非目标与禁区

- 不新增规则 / MCP 工具 / CLI 命令；不改规则语义。
- `evals/` 冻结 oracle 只读：改动后 `npx tsx evals/run.ts` 结果必须与基线一致（precision/recall 100%，unknown 零泄漏）。
- `vendor/` 仍为禁区：A1 优选不碰 `vendor/` 的方案；如方案必须动 `vendor/`（如提交 dist），在 dry-run 阶段单独列出，等用户确认后再动。
- `fixtures/`、`artifacts/` 不碰。

## 1. A 部分：修复项

### A1（P0）：fresh clone 可构建

- 问题：`vendor/cliffx-*/dist/` 被 gitignore 忽略从未提交，新 clone `npm run build` 报 `Could not resolve "@cliffx/core"`。
- 要求：fresh clone + `npm install` + `npm run build` 一次通过。
- 方案（agent 二选一，PRD 不锁死）：(a) 构建产物 dist 提交进 git（调整 gitignore）；(b) prebuild 脚本自动拉取/构建 vendor dist。**关键约束**：VENDOR_PATCH.md 的 4 处嵌入补丁在新流程下必须真实应用——不允许出现 dogfood 中的"无补丁构建却通过"情况。
- 验收（AC1）：删掉 node_modules 与 dist 后完整重走安装构建流程，一次通过；且构建产物含补丁（由 AC2 验证）。

### A2（P0）：doctor 诚实自检

- 问题：`xray doctor` 的"含嵌入补丁"是写死文案，无法验证（dogfood 中无补丁构建也显示含补丁，违反诚实条款）。
- 要求：doctor 必须**真实检测**补丁是否应用（如检查补丁标记文件、dist 内容特征等，方式 agent 定），检测到输出"含嵌入补丁（已验证）"，检测不到输出"未验证"，**不许写死**。
- 验收（AC2）：补丁构建 vs 无补丁构建下 doctor 输出必须不同。

### A3（P1）：scan 默认排除测试文件

- 问题：测试文件（`VetControllerTests.java` 等）的 MockMvc 写法被标成生产风险，误导新手；且污染 debt 绑定。
- 要求：scan 默认排除测试路径（`*/test/*`、`*/tests/*`、`*Test(s).java`、`IT.java` 等常规形态）；新增 `--include-tests` 显式打开。
- 验收（AC3）：petclinic 上 findings 从 9 降到 6（去掉 3 条测试相关的）；`--include-tests` 恢复 9 条；`xray debt` 绑定明细无测试符号。

### A4（P1）：README 规则数同步 + 实现→文档同步机制

- 问题：实现已有 6 条规则（doctor 输出），README"三条规则"章节还停留在 v0.1。
- 要求：README 规则表更新为 6 条（名称与 `doctor` 输出一致）；建立同步机制：`npm run verify` 中加一条"规则数一致性检查"（实现规则列表 vs 文档规则表），不一致则 verify 失败。
- 验收（AC4）：README 规则表 6 条与 doctor 一致；故意改错一处时 verify 能抓出来（抽查逻辑即可）。

### A5（P1）：relevance 关键词上下文加权

- 问题：`relevance --task "修改登录页面的按钮文案"` 因"登录"命中 auth 关键词返回 LIGHT，应为 SKIP，违反"常规低风险任务不打扰"承诺。
- 要求：关键词命中结合上下文加权——task 描述明确指向前端/文案/样式、且无后端变更信号时，auth/payment 等关键词降权。**保持确定性规则，不引入 LLM**；"自述技能永远不会直接驱动 SKIP"的诚实条款保留。
- 验收（AC5）：上述文案任务 → SKIP；现有 relevance 相关测试无退化（全过）；高风险任务（如"新增支付接口"）仍为 FULL/LIGHT。

### A6（P2）：explain 术语人话解释 + learn 联动

- 问题：`explain` 的"下一步"假设读者懂 JPA（如"记录 SQL/LazyInitializationException"），对"前端学后端"用户断层。
- 要求：下一步中首次出现的领域术语（如 LazyInitializationException、持久化上下文、N+1）附一句人话解释（一句话，不展开）；explain 输出末尾加 learn 联动提示（如"不懂持久化上下文？运行 `xray learn <编号>` 生成学习卡"）。
- 验收（AC6）：`explain 1` 输出含术语解释句与 learn 联动句；解释句与概念定义一致（不瞎编）。

### A7（P2）：开箱小毛病

- `./dist/cli.js --help` 应输出 usage 而不是 `Unknown command: --help`。
- 首次运行 `mkdir ~/.local/share/code-xray` 用 recursive，父目录不存在不崩。
- 验收（AC7）：删掉 `~/.local/share/code-xray` 后跑 `--help` 与裸 `scan`，均正常。

## 2. B 部分：Surface 聚焦

### B1：删除 VSCode 插件

- 删除：`apps/vscode/`、`scripts/build-vscode.mjs`、`scripts/check-vscode.mjs`；`package.json` scripts 去掉 vscode 相关命令；README 去掉 vscode 相关描述；全仓库 grep `vscode` 清残留引用（历史 CHANGELOG 提及除外）。
- 验收（AC8）：上述文件已删；grep 无残留；`npm run verify` 通过；构建产物无 vscode 相关。

### B2：CLI 降级为薄壳（frozen）

- 不删除 `apps/cli/`；冻结：不再新增 CLI 命令、不做交互优化。
- 在 `docs/architecture.md` 新增一节"Surface 策略"：MCP agent 为主 surface（投入方向）；CLI 为薄壳——调试/演示/CI 入口，frozen；VSCode/IDEA 插件已移除，不再维护。
- 验收（AC9）：architecture.md 有 Surface 策略节，描述与 `apps/` 实际目录一致（仅 agent、cli）。

### B3：IDEA 插件确认

- `apps/` 下无 IDEA 插件代码。全仓库 grep（`*.iml`、intellij 插件描述文件、`idea` 相关构建脚本）确认不存在；如存在，一并删除并在交付清单中报告。
- 验收（AC10）：grep 无 IDEA 插件残留（或报告删除清单）。

## 3. 执行步骤

1. dry-run：输出变更清单（删哪些文件、改哪些文件；A1 如动 `vendor/` 单独列出等确认）。
2. 按 A1→A7、B1→B3 顺序执行。
3. 全仓库交叉引用检查（vscode、残留的旧文档引用等）。
4. `npm run verify` 通过；`npx tsx evals/run.ts` 与基线一致。
5. 交付后在 `development-milestones.md` 追加 v0.5 一行（版本/日期/目标/关键交付/验收结论/遗留待办）。
6. 本 PRD 定稿文件落盘 `docs/prd/prd-v0.5.md`（内容与本文件一致）。
7. 单 commit 提交（若过大可拆 A/B 两个），message 规范如 `docs+feat: v0.5 ...`，body 列关键变更。

## 4. 验收标准（yiyi 按以下逐项核对）

- [ ] AC1：fresh 流程（删 node_modules/dist 重装）构建一次通过
- [ ] AC2：补丁构建 vs 无补丁构建，doctor 补丁声明输出不同
- [ ] AC3：petclinic findings 9→6；`--include-tests` 恢复 9 条；debt 无测试符号
- [ ] AC4：README 6 条规则与 doctor 一致；verify 有规则数一致性检查且通过
- [ ] AC5：文案任务 → SKIP；relevance 测试无退化；高风险任务仍 FULL/LIGHT
- [ ] AC6：explain 1 含术语人话解释句 + learn 联动提示
- [ ] AC7：`--help` 可用；删数据目录后裸跑正常
- [ ] AC8：vscode 相关文件已删；grep 无残留；verify 通过
- [ ] AC9：architecture.md 有 Surface 策略节，与 apps/ 实际一致
- [ ] AC10：evals/run.ts 与基线一致；verify 通过；milestones 已追加 v0.5；PRD 已落盘 docs/prd/prd-v0.5.md

## 5. 风险

- R1：A1 改构建流程可能破坏现有开发环境——改前记录当前可构建状态，改后对比，`npm run verify` 为准。
- R2：`vendor/` 禁区延续——A1 方案动 `vendor/` 需 dry-run 单独列出等确认，不许先斩后奏。
- R3：B1 删除后如有外部引用（如 README 徽章/链接），一并清理，grep 覆盖。
