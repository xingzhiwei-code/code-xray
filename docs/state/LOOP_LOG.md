# Loop Log

追加记录每轮目标、变化、验证、检查、反思与下一步。日志记录事实，不替代 BACKLOG 的任务状态。历史更正采用新增记录。

## BOOTSTRAP — 文档初始化

- checkpoint_revision：r0；checkpoint_status：completed。
- 日期：2026-09-08。
- 目标：交付模型无关产品启动包和持久接力机制。
- 产品 Task：none；没有开始 T001。
- 来源核对：用户当前要求与引用对话；cliff 只读源码考察。
- 产物：根目录入口、产品规范、开发协议、初始状态与记录机制。
- 验证：E001/E002/E003；均不是产品功能测试。
- 反思：默认离线要求需覆盖 CLI infrastructure 的隐含行为；状态必须区分文档交付与产品实现。
- 下一步：T001 核实目标仓库，建立首个实际开发 checkpoint。

## L011 — 故障注入测试收敛 + 首次提交推送（用户授权）

- checkpoint_revision：r12；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标：完成 T010 遗留的 SNAPSHOT_CHANGED 确定性测试；执行用户授权的首次 git 提交与推送。
- 变更：tests/snapshot-change.test.ts（FileHandle 原型注入 mid-read 变化；先以独立 tsx 脚本诊断真实契约——单文件变化降级为可见 reason + 报告 partial，而非取消扫描——再按契约断言）；.gitignore 增 .idea/；状态文件本条。
- 验证（E015）：75/75 测试（10 文件）、check 0 错误、build、eval exit 0；提交/推送命令实测。
- 用户授权：本轮明确指示提交到 github.com/xingzhiwei-code/code-xray——此为 HANDOFF/CURRENT 中登记的 Human Gate 之一（发布操作）的解除。
- 任务状态：T010 仍 in_progress——发布操作已执行，**AC12 真实用户试用仍未执行**（唯一剩余项）。
- outcome：done（本 Loop）。
- 下一步：用户试用（3 分钟无指导 scan→explain→learn）→ E017 → T010 done；或开始 V02（T101）。
- checkpoint completion：completed（r12，本 checkpoint 由首次 git commit 承载）。

## L012 — Developer Profile v1 与个性化知识缺口

- checkpoint_revision：r13；checkpoint_status：preparing。
- 日期：2026-09-09；session：20260909-101500-codex。
- 目标：按用户要求实现 Developer Knowledge Profile / Developer Intelligence 的 v0.1 可落地能力，并保持一个 Engine、多个 Surface 的边界。
- 变更：新增 `packages/developer-profile`（level+confidence+evidence 模型、Knowledge Gap 计算）；LocalStore 增开发者级 `developer/profile.json`；CLI 新增 `profile show/init/update`；scan 结合画像与项目学习状态计算缺口（诊断可用 XRAY_PROFILE_DIAGNOSTICS=1 打开）；debt 输出声明画像参与个人建议；README/SUPPORT/ARCHITECTURE/BACKLOG/DECISIONS/EVIDENCE 同步。
- 验证（E016）：check 0；81/81 tests；build 0；真实二进制 profile 初始化/更新/show；scan JSON 解析与画像信号 smoke。
- 检查（self-separated）：(1) 画像与项目 learning 状态分离并在测试中断言；(2) 无 profile 时不猜技能，priority=null 且原因可见；(3) verified learning 仍由项目事件驱动，profile 不能自动升级；(4) CLI 只做参数与展示，计算在 developer-profile/learning 领域层；(5) 默认不写项目目录、不进 Git，数据在用户数据目录。
- outcome：done（T011）。v0.1 T010 的 AC12 真实用户试用 Human Gate 仍保留。
- 下一步：等待用户试用（scan→explain→learn）；如进入 V02，VS Code Surface 必须调用同一 Engine/Profile/Debt 逻辑。
- checkpoint completion：completed（r13）。

## L013 — 用户试用报告登记

- checkpoint_revision：r14；checkpoint_status：preparing。
- 日期：2026-09-09；session：20260909-101500-codex。
- 目标：登记用户报告的试用事实，并核对 AC12 是否可判定。
- 变更：仅状态文件（EVIDENCE E017、BACKLOG T010、CURRENT、HANDOFF）。
- 事实：用户报告“已经测试过了”。未提供试用人数、是否 3 分钟内完成 scan→explain→learn、是否到达证据查看或失败点。
- 判定：T010/AC12 保持 in_progress；不能把用户一句话报告直接升级为 4/5 验收通过。
- Evidence：E017（result=blocked，user-reported）。
- outcome：blocked（AC12 结果信息不足）。
- 下一步：用户补充“几人测试、几人完成、是否到达证据查看”后更新 E017；若 ≥4/5 达成则 T010 → done，否则记录失败点并进入修复。
- checkpoint completion：completed（r14）。

## L014 — 本地提交与推送尝试

- checkpoint_revision：r15；checkpoint_status：preparing。
- 日期：2026-09-09；session：20260909-101500-codex。
- 目标：按用户要求提交 Developer Profile 与状态记录，并推送远端。
- 验证：`npm run verify` 通过（check 0、81/81 tests、build 0）；`git diff --check` 无输出。
- 变更/提交：bd26abe `feat: add developer profile and personalized knowledge gaps`；4b1fd41 `state: record developer profile checkpoint`。
- 阻塞：`git push origin main` 失败（无法读取 GitHub 用户名，非交互环境）；`gh auth status` 显示 xingzhiwei-code token invalid。
- 下一步：用户运行 `gh auth login -h github.com` 重新认证后，执行 `git push origin main`。
- outcome：done（本地提交）/ blocked（远端推送）。
- checkpoint completion：completed（r15）。

## L015 — 用户验收确认与 T010 收口

- checkpoint_revision：r16；checkpoint_status：preparing。
- 日期：2026-09-09；session：20260909-101500-codex。
- 目标：登记用户对各命令功能的确认，并完成 T010 判定。
- 事实：用户明确回复“验证可以了，各个命令功能都正确”。
- 判定：E017 更新为 passed（用户单人验收）；新增 D010，说明以用户本人确认收口 T010/AC12，不冒称 4/5 样本调查。T010 → done，v0.1 必需任务 10/10 done，T101/V02 解锁。
- 遗留：GitHub 凭据仍失效，本地提交尚未推送；发布前事项（cliff LICENSE、跨平台、真实远端 provider）保留。
- outcome：done（T010/v0.1）。
- 下一步：用户重新认证 GitHub 后推送；随后 T101 V02 VS Code Surface。
- checkpoint completion：completed（r16）。

## L016 — T101 VS Code 第一轮纵向切片

- checkpoint_revision：r17；checkpoint_status：preparing。
- 日期：2026-09-09；session：20260909-101500-codex。
- 目标：创建 VS Code Surface 的第一轮纵向路径：扫描 → 侧栏 findings → 证据跳转/解释 → 标记学习状态；保存后扫描默认关闭，未保存缓冲区显式提示。
- 变更：新增 apps/vscode 扩展、VS Code 1.135 类型声明、bundle 脚本；扩展直接调用 `analyze`、`LocalStore`、`syncBindings`、`applyEvent`，未复制规则或债务公式。
- 验证（E019）：TypeScript 检查 0；`npm run build:vscode` 0；VSIX 打包成功。真实宿主安装被沙箱 EPERM 阻塞（无法写 `~/.vscode/extensions` 与 Code 日志），激活/交互未验证。
- outcome：continue/blocked（实现已写，真实宿主验证待权限）。
- 下一步：授权 VS Code CLI 写扩展目录或由用户在宿主终端安装 VSIX，随后完成真实 VS Code smoke；再做 Hover/CodeLens、Diff 与完整学习/债务面板。
- checkpoint completion：preparing（r17）。

## L017 — T101 范围感知扫描

- checkpoint_revision：r18；checkpoint_status：preparing。
- 日期：2026-09-10；session：20260909-101500-codex。
- 目标：按用户要求实现 selected 范围、uncommitted 范围、无范围不扫描三种语义，并保持逻辑在共享 Engine/Workspace 层。
- 变更：`AnalyzeRequest.scope` 增加 `selected|uncommitted`；workspace 层校验范围边界并过滤文件；uncommitted 使用 hardened Git status；VS Code active editor 文件作为 selected，否则退回 uncommitted，并捕获 `INVALID_SCOPE` 提示用户。
- 验证（E023）：VS Code tsc 0；workspace 23/23；build:vscode 0；VSIX 重新打包。
- outcome：continue（Explorer 文件夹/多选接入与宿主验证待做）。
- 下一步：接入 Explorer selection 或提供文件/文件夹选择器；用户重装 VSIX 验证 selected/uncommitted/no-scope 三种路径。
- checkpoint completion：preparing（r18）。

## L018 — T101 Explorer 选择范围接入

- checkpoint_revision：r18；checkpoint_status：preparing。
- 日期：2026-09-10；session：20260909-101500-codex。
- 目标：让用户能从 VS Code Explorer 直接选择文件/文件夹（含多选）并只扫描选择范围。
- 变更：新增 `codeXray.scanSelection` 命令与 `explorer/context` 菜单；解析 command URI 参数，过滤 file scheme 和 workspace 内路径；执行后清空临时选择；无 Explorer 参数时沿用 active editor/uncommitted。
- 验证（E024）：VS Code tsc 0；86/86 tests；build:vscode 0；VSIX manifest 确认 scanSelection 与 explorer/context。
- outcome：continue（待用户在真实宿主验证四种路径）。
- 下一步：用户重装 VSIX，分别验证 Explorer 单选文件/文件夹、多选、active editor、uncommitted/no-scope；结果记 E025。
- checkpoint completion：preparing（r18）。

## L021 — T301b Review 会话：修改后审查、幂等、过期降级与 gate（Loop B）

- checkpoint_revision：r22；checkpoint_status：completed。
- 日期：2026-09-23；session：20260922-claude-v04。
- 目标：交付 v0.4 核心用户价值——Agent 一轮修改后自动得到结构化审查（PRD §8.5-3/4/5/7），审查记录稳定 ID、幂等、可跨宿主恢复、过期不冒充。
- 起始快照：main@edf61f3（r21，工作树干净）。
- 计划：protocol 加 ReviewRecord/ReviewSession 家族；engine 加 analyzeWithBaseline（复用私有 buildDiff，不复制 diff 逻辑）；storage 加 reviews 命名空间 + session 缓存；bridge 实现 startReview/finishReview/readReview/computeGate/staleness 降级；tools 加 5 个（review_start/review_finish/review_read/explain/summary）；测试抽共享 spawn helper。
- 变更：如上（详见 E029 subject_snapshot）。关键语义：reviewId=sha256(workspaceId+targetSnapshotId+ruleSetVersion) 内容寻址→幂等；stale 在读取时计算并把 gate 降级 incomplete，不落盘；gate blocking 仅 XRAY_AGENT_GATE=enforce；session 基线含源码明文缓存（0600 私有目录，deleteData 可清）。
- 验证（E029）：npm run verify 退出 0（105/105，14 文件）；agent-review 9 用例全过；dist/agent.js 二进制 smoke：修改→finish gate=needs_human、再 finish reused:true 同 reviewId。
- 检查（self-separated）：(1) diff/规则/债务全部复用 Engine 与 learning 包，bridge 无计算逻辑复制（D001/D009/D011 边界保持）；(2) 测试抓到一个真实缺陷——review_read 未应用 stale 降级，已修复（withStaleness 统一入口）；(3) 幂等由内容寻址 reviewId + snapshot 索引保证，不依赖时间戳；(4) pass 仅在 complete+零新增/持续+零未知时出现，且 reasons 声明零发现不等于没有问题；(5) explain/summary 只读，不改学习状态。
- outcome：done（T301b 机器验证收口；宿主内双轮 review 闭环归 T301d）。
- 反思：把 staleness 做成读取时计算而非落盘字段是对的——落盘会引入"何时失效"的第二真相源；内容寻址 ID 让幂等免费获得。
- 下一步：T301c 契约加固——notifications/cancelled 与 timeoutMs 的正式契约测试、fixtures/injection-java 注入 fixture（恶意注释只出现在 evidence content，不进 gate/summary/suggestedChecks）、消息上限、隐私矩阵复测（session 源码缓存的边界与 deleteData 清除）。预期 npm run verify 全绿。
- checkpoint completion：completed（r22，本记录与 E029/BACKLOG/CURRENT/HANDOFF 同轮落盘）。

## L020 — T301a Agent Surface：MCP stdio server 最小端到端（Loop A）

- checkpoint_revision：r21；checkpoint_status：completed。
- 日期：2026-09-22；session：20260922-claude-v04。
- 目标：按用户指示（D012）跳过 v0.3 剩余项启动 v0.4；交付 MCP stdio server + capabilities/scan/evidence 三工具最小端到端，双宿主可加载。
- 起始快照：main@18f80b0，工作树干净（r19）。
- 计划：protocol 加 Envelope/Gate；apps/agent 分层（jsonrpc 协议层/mcp 会话层/bridge 领域 seam/tools）；构建照 vscode 模式（build-agent/check-agent 入 verify 链）；spawn 真实进程的 NDJSON 契约测试；.mcp.json + codex mcp add 双宿主注册。
- 变更：新增 apps/agent/**（6 文件）、scripts/{build,check}-agent.mjs、tests/agent-mcp.test.ts、.mcp.json；packages/protocol/index.ts +Envelope/Gate/okEnvelope/errorEnvelope；package.json scripts。修复：源文件 shebang 与 esbuild banner 重复导致 dist 语法错误（已知坑再现，移除源 shebang）；tools/call 未知工具按 MCP 规范用 -32602；测试客户端用 StringDecoder 处理 CJK 跨 chunk 截断。
- 验证（E027）：npm run verify 退出 0（96/96 tests，13 文件）；手工 NDJSON smoke 全通过；claude mcp list 显示 code-xray（待批准）；codex mcp list 显示 enabled。
- 检查（self-separated）：(1) tools 层不 import engine/storage，仅经 bridge——Surface 边界保持（D001/D009/D011）；(2) 域错误与协议错误分离，partial/failed 不会被包装成 ok；(3) evidence 逐行 hasSecret 脱敏 + source-data notice + 工作区边界检查；(4) 零新依赖、零网络（手写 JSON-RPC）；(5) 确定性：跨进程同快照 scan 深度相等（analysisId/savedTo 除外）。
- outcome：done（T301a：E027 机器验证 + 用户批准后 E028 Claude Code 宿主内 capabilities→scan→evidence 闭环实测通过，snapshotId 与契约测试一致；Codex 上游 502 归 T301d）。r21 本地提交（用户授权）。
- 反思：手写 MCP 的关键风险在握手字段与错误码语义，spawn 真实进程的契约测试能一次锁定；esbuild banner+shebang 坑第二次出现，已在新 build 脚本注释外再次实证。
- 下一步：T301b——protocol 加 ReviewRecord；storage-local 加 saveReview/loadReview/findReviewByTargetSnapshot；tools 加 xray_review_start/xray_review_finish/xray_explain/xray_summary；gate 默认 report-only；测试覆盖幂等（同 targetSnapshotId → 同 reviewId + reused）与过期（stalePaths → stale+incomplete）。预期 npm run verify 全绿。
- checkpoint completion：completed（r20，本记录与 E027/D011/D012/BACKLOG/CURRENT/HANDOFF 同轮落盘）。

## L019 — T201 V03 共享深化分析第一轮

- checkpoint_revision：r19；checkpoint_status：preparing。
- 日期：2026-09-11；session：20260909-101500-codex。
- 目标：响应“扫描结果不够深”，先落地 PRD V03 的三类共享深化分析，而不先做被环境阻塞的 JetBrains 壳。
- 变更：新增 `SPRING_BEAN_CANDIDATE`、`TRANSACTION_BOUNDARY`、`JPA_PERSISTENCE_CONTEXT`；新增三张学习卡和 Developer Profile 技能映射；能力声明补充静态候选边界；更新测试期望。
- 验证（E026）：`npm run verify` 0；86/86 tests；fixture 发现数 15→27（Bean 1、事务边界 7、持久化上下文 4）。
- 阻塞：JetBrains 插件壳需要 JDK17/Gradle/网络，当前 Java 8、无 Gradle、网络不可用；V02 交互重设计需求待用户想清楚。
- outcome：continue（共享内核已实现，独立 eval 与 JetBrains 壳待做）。
- 下一步：补三类规则正/负/未知 fixture 与评估；环境解除后建 JetBrains 插件壳。
- checkpoint completion：preparing（r19）。

## L010 — T010 发布准备：材料、基准、安装 smoke、独立检查与接力演练

- checkpoint_revision：r11；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：AC01—AC12 机器可验项全部完成并映射（E014）；独立检查与接力演练。
- 变更：
  1. 发布材料：README.md（安装/命令/三规则/隐私/限制）、NOTICE.md（vendored cliff MIT 归属与 LICENSE 缺失声明、依赖许可表）、docs/SUPPORT.md（FAQ/退出码/已知限制）。
  2. evals/bench.ts：确定性生成 100 文件/20,000 非空行 fixture，spawnSync + /usr/bin/time -l 测冷/热/峰值内存。
  3. 安装 smoke 抓到并修复真实 bug：bin 符号链接下入口守卫失效（process.argv[1] 为 symlink 路径 vs import.meta.url 真实路径永不匹配→二进制静默空跑）——realpathSync 解析。
  4. 独立检查：新上下文子 Agent 完成接力演练六问 + Checker 必答 a—g，结论"有保留通过"（技术侧全部确认；保留=状态文件漂移/专项缺失/文案项）。
  5. 按 Checker 发现修复：HANDOFF/CURRENT 全文重写（本 r11）；tests/storage.test.ts 补 5 用例（CORRUPT/VERSION/LOCKED/redactReport/deleteData）；usage() 补 learn/debt/path-vs-cwd 语义；SUPPORT.md 增中文凭据关键词限制。
  6. 发现并记录：redactReport/hasSecret 凭据关键词仅英文——设计边界如实入 SUPPORT 限制。
- 验证（E014）：73/73 测试、check 0、build；基准冷 1.04s/热 0.96s/331.1MiB（100 文件/20,000 行，全部达标）；安装 smoke（pack→干净目录 install→.bin/xray doctor+scan 内置 fixture 全通）；bundle 静态审查（fetch 仅 provider 路径、零 node:http/https/net）。
- 任务判定：T010 保持 in_progress——除 AC12"真实用户试用（≥4/5 名用户无指导 3 分钟完成）"外全部完成；用户试用需真人（Human Gate：未招募不得宣称通过）。v0.1 进度 9/10 done + T010 in_progress（仅剩用户试用与发布操作授权）。
- outcome：done（本 Loop 机器可验范围）；Human Gate：用户试用 + git commit 授权。
- 下一步：用户侧——招募/亲自执行 3 分钟无指导试用（scan→explain→learn），结果记入 E015 后 T010 转 done；或授权 git commit 固化 v0.1 快照。
- checkpoint completion：completed（r11）。

## L009 — T009 可选 LLM 增强：端口、最小外发与回退

- checkpoint_revision：r10；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：AC08（可替换 provider 契约、未配置/超时/不可达/无效响应均保留主链路、增强不改写确定性事实）与 AC02/AC09 相关子项（最小外发、默认禁用）。
- 变更：
  1. 新建 packages/explanation-providers/index.ts：ExplanationProvider 端口（stub 证本地契约 / unverified-remote 禁用待实测）；enhanceFinding（AbortSignal.timeout、SyntaxError→invalid-structure、TypeError→unreachable、AbortError/TimeoutError→timeout）；FORBIDDEN_KEYS 拒绝 provider 伪造 evidence/path/line/digest/finding（增强只能加文本不能造事实）；enhanceInputFrom（最小外发：概念+卡片四段+标题+前提/未知，无源码/路径/digest）；createStubProvider（脚本化测试替身）；createHttpProvider（OpenAI 兼容，未实测禁用）；providerFromEnv（三 env 显式开启，缺一不可）。
  2. CLI：explain --enhance（未配置→stderr 提示+确定性输出原样；配置→stderr 声明外发范围→失败回退提示"主链路不受影响"；成功→标注 provider 的增强段落+"非确定性事实"免责行，永不写回保存的报告）；doctor 增 provider 状态行（未配置/已配置未实测）。
  3. tests/provider.test.ts：8 用例（结构化通过/JSON 字符串解析/无 text 与空 text 与非 JSON 拒绝/伪造证据字段拒绝/超时回退/不可达分类/其他错误分类/最小外发序列化断言无 path-digest-src/port 可替换性/默认禁用矩阵）。
- 验证（E013）：check 0 错误；vitest 68/68；真实二进制三级路径——未配置（提示+输出不变）、配置不可达地址（外发范围声明→unreachable→回退、确定性输出完整）、doctor 状态行。
- Checker 视角（self-separated）：AC08 逐项（契约可替换✓[两个 stub 同端口]、未配置/超时/不可达/无效响应保留主链路✓、增强不改写事实✓[enhancement 仅显示层，报告对象只读]、真实远端未验已标注✓）；AC09（默认零外发✓[E006/E008 二进制无网络+本 Loop 未配置路径]、启用后展示发送范围✓、最小上下文✓）。
- 任务判定：T009 done——真实 provider 无凭据未做受控 smoke，按 BACKLOG 原文保持未启用（unverified-remote），不阻塞离线产品验证；离线 baseline 已由 E006—E012 证明。
- outcome：done（本 Loop）。v0.1 进度 9/10。
- 下一步：L010 = T010（发布准备：AC01—AC12 映射与残余项、性能基准（100 文件/2 万行 fixture）、README/NOTICE/docs/SUPPORT、安装 smoke、接力演练、独立检查补齐）。
- checkpoint completion：completed（r10）。

## L008 — T008 Contextual Learning 与 Cognitive Debt 闭环

- checkpoint_revision：r9；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：AC05（四段学习卡+当前代码引用+短验证，无 LLM 可用，浏览≠掌握，自述≠验证）、AC06（透明债务模型可手工复算，未知/未评估可见，可更正/忽略/恢复/删除）、AC09（本地学习数据生命周期）。
- 变更：
  1. 新建 packages/learning/engine.ts：syncBindings（按 conceptId+symbol 稳定绑定 ID；重复扫描零重复；代码变化→stale+previousStatus 保留；finding 消失→stale（未再出现）+association inferred；ignored 永不回流）；applyEvent（view 只加 views；set-status/answer/ignore/restore/rebind/delete；ignored 需先 restore；答对→verified、答错→记录 failed 状态不变）；三概念确定性学习卡（what/whyHere/hiddenMechanisms/whatIfRemoved+单选验证题+rationale+官方文档来源）；debtSummary（priority=impact×gap×evidenceStrength，公式/含义/范围/去重全部可读，未评估/未知/已忽略单列计数，忽略项排除并注明原因）。
  2. types.ts：EventBase 移除输入侧 eventId（记录时生成）。
  3. CLI：learn 命令（列表按债务排序/学习卡/answer/status/ignore/restore/rebind/delete 子命令）；debt 命令（透明模型+明细）；scan 保存后同步学习绑定；human 摘要增"知识缺口 top concept"提示。
- 验证（E012）：check 0 错误；vitest 60/60（learning.test.ts 11 用例：绑定创建/零重复/stale 两种成因/ignored 不回流/view 不升级/答对答错/状态机全集/重启恢复/删除持久性/债务手工复算 2×1×1=2.0 与 2×0.6×1=1.2/verified 优先级归零仍列示；cli-surface 增真实 CLI 学习闭环）。真实二进制 AC01 全链路：scan→learn 列表→学习卡→答错（failed 记录+rationale）→答对（verified）→再扫描（verified 保留、15 绑定不变、债务 30→28 精确 -2.0）→二次进程恢复。
- 遇到并修复：EventBase 输入侧要求 eventId 的类型设计错误；测试两处逻辑错误（stale 用例改错文件路径、delete 用例未持久化即断言）。
- Checker 视角（self-separated）：AC05 逐项对照（四段✓/代码引用✓/短验证✓/无 LLM✓/浏览≠掌握✓[view 只加 views]/自述≠验证✓[self-reported 与 verified 分离]）；AC06 逐项（因子可见✓/手工复算✓[测试断言具体数值]/未知未评估单列✓/更正-忽略-恢复-删除✓/无能力排名✓[含义声明]）；AC09（本地持久化✓/重启恢复✓/不重复累加✓/排除不回流✓）。
- 任务判定：T008 done——v0.1 用户闭环（扫描→证据→学习→债务→恢复）完整可用。
- outcome：done（本 Loop）。v0.1 进度 8/10。
- 下一步：L009 = T009（可选 LLM 增强：provider Adapter 接口、显式开启+最小外发、结构校验/EvidenceRef 校验/超时回退，默认禁用、无凭据完整 baseline；真实 provider 标记实测状态）。
- checkpoint completion：completed（r9）。

## L007 — T007 CLI 纵向打磨：换行/取消/explain/进度

- checkpoint_revision：r8；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：AC07/AC12 表面项——NO_COLOR、60/80/120 列 CJK 换行、键盘取消、空/partial 文案、explain 基线、长扫描进度。
- 变更：
  1. apps/cli：CJK 显示宽度 + token 感知换行（空格优先断行保路径完整、行首缩进保留、超宽 token 硬断）；全部 human 输出行经宽度约束（COLUMNS env 或 stdout.columns，默认 80）；零文件目录的可行动文案；explain 命令（列表 + 单条详情：证据 path:line-range/前提/未知/下一步/conceptId，与 JSON 共享同一报告对象）；长扫描（≥100 文件）stderr 进度行（stdout JSON 纯净保持）。
  2. analyzer-java：onProgress 回调 + 每 50 文件 setImmediate 让出事件循环（信号可处理 + 进度及时 flush——原实现为同步 CPU 突发，SIGINT 排队到循环结束、stderr 进度整体缓冲）。
  3. engine：progressGuard——经进度回调检查 AbortSignal 抛 CANCELLED(130)（analyzer 保持 signal 无感知）；baseline 分析同样受守卫。
  4. tests/cli-surface.test.ts：6 用例——60 列无 ANSI 且最长行 ≤60；80/120 列约束；空目录文案；explain 列表/详情/无报告/非法编号（退出 2）；SIGINT 真实子进程测试（等待 stderr 进度标记后 kill——确定性，非定时竞态）断言 130 + 取消消息。
- 验证（E011）：check 0 错误；vitest 48/48；build 后真实二进制——COLUMNS=60 NO_COLOR=1 运行逐行 ≤60 显示宽度、路径完整、缩进保留、零 ANSI；explain 列表 + explain 1 详情输出完整上下文（证据 4 处可回源含跨文件 Repository 声明）；退出码 0。
- 修复过程中确认的两个真实缺陷：(a) 解析循环不让出事件循环导致取消不可达（已修）；(b) 早期换行实现在 token 中间硬断且丢失行首缩进（已重写）。
- ux_review（self-separated）：首屏层级=版本行→计数摘要→top-3（编号/标题/规则/位置行）→下一步缩进行→保存说明；60 列下无截断无滚动错位；空目录与取消路径均有可行动文案。
- 任务判定：T007 done——真实 cliff 调用 Engine、scan/explain/diff/doctor 四命令基线、人类/JSON 共享事实、错误/空/partial/取消文案、NO_COLOR/列宽/CI 非 TTY、无 ANSI JSON、交互与功能证据齐备；学习/债务按 BACKLOG 归 T008。
- outcome：done（本 Loop）。v0.1 进度 7/10（T001—T007）。
- 下一步：L008 = T008（Contextual Learning 与 Cognitive Debt：学习卡、learn/debt 命令、本地状态生命周期）。
- checkpoint completion：completed（r8）。

## L006 — T004 ChangeSet 边界/隐私矩阵 + diff 接线（T006 一并达成）

- checkpoint_revision：r7；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：验证 workspace 层全部边界与隐私行为（AC01/AC02/AC09 的 T004 部分）；显式 base diff 接线进 engine/CLI（AC04）。
- 变更：
  1. 新建 tests/workspace.test.ts：18 用例矩阵——非 Git 目录 scan（gitHead null）、INVALID_PATH、二进制（NUL 字节）、非 UTF-8、单文件大小限制（含 INVALID_LIMIT 边界 0/10001）、文件数上限、符号链接（文件+目录+指向树外）、敏感文件名排除（.env/credentials/pem/Secrets.java）、SECRET_FILTER 内容过滤且 reason 不泄漏内容、exclude glob 与 .gitignore、未跟踪默认纳入/显式排除、git 记录且不修改被分析项目（status 前后一致）、NOT_GIT/INVALID_BASE/GIT_ERROR、baseline blob 读取+隐私过滤+解析 SHA 记录、stalePaths（内容变化/删除）、不可读目录降级为 reason。
  2. 透明度修复：敏感文件名排除从静默 continue 改为 .java 文件产生 SENSITIVE_PATH reason；基线循环同样产生 BASE_EXCLUDED reason（AC02 覆盖缺口可见）。
  3. engine 增 diff：request.base → snapshotBaseline + 双侧分析 → DiffSummary（added/modified/deleted 按路径+digest；new/continuing/removed findings 按 ruleId@symbol 确定性对照，仅归因变更文件；基线解析失败/解析器版本差异/规则版本差异记入 limitations）；报告 snapshot 记录 gitBase。
  4. CLI 增 --base <git-ref>（拒绝注入式 base）与 human 变更摘要输出。
  5. tests/engine.test.ts 增 3 用例：diff 确定性（新增文件→新 finding）、持续/移除对照（修改文件→持续 finding、删除文件→removed finding）、非 Git 拒绝 diff 但 scan 可用。
- 验证（E010）：check 0 错误；vitest 42/42；build 通过；真实二进制 diff 演示（临时 git 仓库：用户修改 OrderService 加入循环仓储调用 + 新增 OrderRepository → `xray scan . --base HEAD` 输出"新增 1 文件、修改 1 文件；新增 1 finding（JPA_CALL_IN_LOOP）、持续 1 finding（TX 基线已有）、移除 0"，退出 0）。
- 遇到并修复：测试源码意外嵌入原始 NUL 字节（改显式 Buffer 构造）；baseline 测试的凭据内容不匹配 hasSecret 正则（password = "值" 需带引号）；敏感名称排除静默无 reason（产品透明度缺陷，已修）。
- Checker 视角（self-separated）：逐条对照 BACKLOG T004 验证矩阵——无变更✓（未变更文件不进 diff）、非 Git✓、未跟踪✓、删除✓、重命名=删除+新增（语义保留）✓、二进制✓、编码✓、大文件✓、不安全路径✓（符号链接+注入式 base）、扫描中变化=限制（SNAPSHOT_CHANGED 竞态无法确定性单测，代码路径已审查，记入 E010 limitations）、私密输入不进 reason 消息✓（断言 not.toContain）、Git 不可用仅限制 diff✓、不修改被分析项目✓、不依赖云✓。
- 任务判定：T004 done。T006 一并评估达成——规则 evals（E009）、静态路径（flows observed/unresolved+证据回源，engine test）、变更摘要（human diff 摘要+确定性）、正负 fixture harness（evals/run.ts）、结果顺序稳定（确定性测试）、unknown/partial 显式、assumptions/uncertainties 分离——依赖 T004/T005 均 done；学习关联失效归 T008（BACKLOG 原文明确）。
- outcome：done（本 Loop）。v0.1 进度 6/10（T001—T006）。
- 下一步：L007 = T007（CLI 纵向打磨：NO_COLOR/60 列/键盘中断实测、explain 命令、人工首屏层级检查）。
- checkpoint completion：completed（r7）。

## L005 — 规则评估 harness + 能力声明（T002/T003/T005 收尾）

- checkpoint_revision：r6；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：对照冻结 oracle 产出正式 precision/recall/unknown 数（AC03 核心证据）；补齐 T003 能力声明交付项。
- 变更：
  1. 新建 evals/run.ts：30 案例映射（镜像 oracle.md 冻结表）、按证据路径归因 finding、AC03 计分规则（未知单列不计分母、unknown 泄漏即失败、unknown 不可见即失败）、markdown 报告落盘 evals/results/java-oracle-v1.md、阈值不符退出 1。
  2. protocol 增 Capabilities/LanguageCapability 类型；engine 导出 capabilities 常量（仅 java、6 条 bounds、3 规则、analyzer 版本）。
  3. engine.test.ts 增能力声明断言（java-only、规则完备、bounds ≥4）。
- 验证（E009）：`npx tsx evals/run.ts` 退出 0——TX_SELF_INVOCATION/JPA_CALL_IN_LOOP/WEB_ENTITY_RELATION 各 TP=4 FP=0 FN=0（precision/recall 均 100%，已知分母 8）；12 负例全 correct-negative；6 unknown 全 unknown-clean（零 finding + unknown 类诊断可见）；demo/orders 与 support 文件不计分。check 0 错误、21/21 测试、build 通过。
- Checker 视角（self-separated）：逐案核对 oracle 表格 ID 与 fixture 文件一一对应；确认无 unknown 案例以 finding 形式泄漏（AC03 边界）；确认负例覆盖了字符串/注释、影子参数、同名注解、外部接收者等误报向量；报告含"不外推"限制声明。
- 任务状态判定：T005 done（能力矩阵可读、正/负/未知场景真实验证、未运行被扫描项目任何构建、java-parser 满足目标故无需替代候选比较——D005 据此补证据）；T003 done（协议+能力声明+独立消费者验证齐备）；T002 done（真实 cliff 冒烟证据 E006/E008 + D007 差距处理 Decision + 许可材料状态明确：清单声明 MIT、无 LICENSE 文件、T010 NOTICE 处理；键盘取消实测归 T007）。
- outcome：done（本 Loop）。v0.1 进度 4/10（T001/T002/T003/T005）。
- 下一步：L006 = T004（ChangeSet 与隐私验证：workspace-local 边界/快照变化/敏感路径/staged-未跟踪矩阵 + snapshotBaseline diff 接线进 engine/CLI）。
- checkpoint completion：completed（r6）。

## L004 — Engine facade + CLI 入口：端到端 scan（T003 收尾 / T007 最小闭环）

- checkpoint_revision：r5；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：真实 CLI 二进制在订单 fixture 上产出协议合法、含证据的报告（AC01 最小闭环 / AC02 证据 / AC07 最小表面 / AC10 分离）。
- 变更：
  1. 新建 packages/engine/index.ts：analyze(request) → snapshotWorkspace → analyzeJava → 组装 AnalysisReport → assertReport；覆盖/限制/摘要确定性生成；不依赖 cliff（AC10）。
  2. 新建 apps/cli/index.ts：scan/doctor 命令、参数校验、human 摘要（top-3 有界 + 下一步）、--format json 纯净 stdout、退出码契约、SIGINT→AbortController、空 argv ≡ scan .、本地保存（默认开，--no-save 关）。
  3. protocol：Finding 增 uncertainties（AC02 前提/未知分开）；FlowEdge.to/reason 改可选（未解析边无目标）。
  4. analyzer：finding() 增 symbol（挂载方法签名）。
  5. 产品行为变更（D008）：workspace 默认纳入未跟踪文件（原为默认排除）；原 --include-untracked 改为 --git-tracked-only 选择性排除。
  6. storage-local：dataDir 前缀 canonicalize 一次（接受 OS 级符号链接如 /var、/tmp），store 内部仍强制无符号链接（安全边界保留）。
  7. build.mjs：banner 增 #!/usr/bin/env node。
  8. 新测试：tests/engine.test.ts（独立消费者视角 5 用例：协议合法/确定性/证据锚定/partial 诚实性/类型化错误）、tests/cli.test.ts（真实 cliff dispatch 5 用例：JSON 纯净/human 有界/空 argv/退出码/doctor）。
- 验证（E008）：check 0 错误；vitest 20/20；build 产 3 入口；真实二进制——human 扫描 36 文件 15 findings top-3、管道 JSON 连续 3 次稳定解析（120KB）、退出码 0/2/1、fixture 目录内 doctor 恢复最近报告。
- 真实入口验证抓出并修复 4 个测试未覆盖缺陷：(a) dist/cli.js 缺 shebang（shell 报语法错）；(b) process.exit 在管道 stdout 异步刷新前终止 → 120KB JSON 按 64KB 管道缓冲随机截断（两次失败位置漂移 67954→59759 定位）→ 入口等待 stdout 排水后再 exit；(c) macOS tmpdir 位于 /var 符号链接下被 ensureDir 祖先级符号链接检查误拒 → 重设计为信任前缀+store 内部强制；(d) 测试 captureStd 展开 copies 返回陈旧空串（spy 改 live getter）。
- check_mode：self-separated；Checker 视角：AC02 逐 finding 断言 assumptions/uncertainties 非空+证据 digest 与快照一致（engine.test）；AC07 JSON 纯净（stderr 0 字节实测）；AC10 engine 测试不 import cliff/analyzer 内部。
- outcome：done（本 Loop）。T003 的"Engine 可由独立消费者调用"已验证（engine.test.ts 仅 import engine+protocol）。T007 仍 planned——TTY/NO_COLOR/列宽/键盘中断实测、explain/diff 命令未做。
- 下一步：L005 规则评估 harness 对照 oracle 30 案例产出正式 precision/recall/unknown 数。
- checkpoint completion：completed（r5）。

## L003 — 构建 java-spring-jpa fixture（T005 输入）

- checkpoint_revision：r4；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：oracle 30 案例 + 订单 demo 落盘并可被 analyzer 全量解析（T005 前置；AC03 输入集）。
- 变更：新建 36 个 Java 文件——demo/tx 10 例（tx-unqualified/this/fqn/two-args 正；no-annotation/other-receiver/custom-annotation/string-comment 负；star-import/overload 未知）、demo/loop 10 例（for/while/do/this 正；outside/plain-type/string/shadowed 负；external/lambda 未知）、demo/web 10 例（direct/list/response/controller-body 正；dto/no-relation/no-mapping/html 负；external/star-entity 未知）、demo/support/Transactional.java（同名非 Spring 注解）、demo/orders 5 文件（Order/OrderItem/OrderRepository/OrderService/OrderController 订单主场景）。每文件头注释标注 oracle 案例 ID 与预期标签。
- 验证：analyzer 冒烟（E007）——36/36 解析成功、0 解析错误；15 findings 恰好为每规则 4 正例 + demo 触发 1，负例与未知例 0 finding。
- 遇到的问题：无。
- check_mode：self-separated；Checker 视角：15 findings 逐一对照 oracle 表格的 30 案例 ID，无超出预期的 finding 产出文件；demo/orders 的 3 findings 属预期主场景。
- outcome：done（本 Loop）；正式 precision/recall 数字由 L005 eval harness 产出。
- 下一步：L004 创建 packages/engine/index.ts 与 apps/cli/index.ts，打通 scan 端到端。
- checkpoint completion：completed（r4）。

## L002 — 修复验证基线（T001 收尾 + T002 适配层验证）

- checkpoint_revision：r3；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标/AC：`npm run check` 与 `npm test` 全绿（T001 完成条件）；真实 cliff 适配层 spike 验证（T002/AC07/AC09 部分）。
- 起始快照：r2（check/test 全红，见 E005）。
- 变更：
  1. tests/protocol.test.ts:5 修复多余右括号（上一会话遗留语法错误）。
  2. vendor/ 落地 @cliffx/core@0.0.1、@cliffx/ui@0.0.1、@cliffx/test@0.0.1（npm registry tarball），按 CLIFF_INTEGRATION §4.2 预案重写 workspace:* 依赖并施加 4 点通用嵌入补丁（checkUpdates 默认关、errorMode:'throw'、loadConfig:false 禁用隐式发现、unknown-command 重抛）；见 vendor/VENDOR_PATCH.md 与 D007。
  3. package.json 增加两个 file: 依赖；npm install 成功。
  4. tests/cliff-adapter.test.ts 适配 vitest 5（describe 默认文件内串行，移除 .sequential）与上游 register() 非泛型签名（显式 CommandDef 断言）。
- 验证：`npm run check` 退出 0；`npx vitest run` 2 文件 10 测试全过（protocol 5 + cliff-adapter 5，后者为真实 vendored cliff 集成测试：零网络（fetch/http/https/socket 全部拒绝且未调用）、无 process.exit/stderr 写入、不执行被扫描仓库的 commands/plugins/config 模块、不继承父目录 .xray.json 与 XRAY_OFFLINE env、参数边界保留）。证据 E006。
- 遇到的问题：直接安装 npm 发布包失败（EUNSUPPORTEDPROTOCOL workspace:*）——正是 CLIFF_INTEGRATION §4.2 预判的失败模式；发布版 0.0.1 的 CliOptions 无 checkUpdates/loadConfig/errorMode（上一会话注释所称 vendor patch 从未落地），dist 实查确认 4 处行为冲突后按预案补丁。
- check_mode：self-separated；Checker 复查：测试断言与 AC07/AC09 要求逐条对照（零网络=AC09 默认无外连；无 exit=AC07 退出码契约前提；配置不继承=AC09 安全配置来源）。单 Agent 限制已记录。
- outcome：done（本 Loop）；T001 → done；T002 适配层子项完成，CLI 表面验证（TTY/NO_COLOR/列宽/取消/JSON）留待 T007。
- 下一步：L003 构建 fixtures/java-spring-jpa（oracle 30 案例 + 订单 demo）。
- checkpoint completion：completed（r3）。

## L001 — 恢复：状态与代码现实对齐（recovery）

- checkpoint_revision：r2；checkpoint_status：preparing。
- 日期：2026-09-08；session：20260908-143500-claude。
- 目标：磁盘存在未记录实现而状态声称 not_started，按接力协议 §6 执行不一致恢复，先对齐再继续。
- 起始快照：r1（not_started）；实际磁盘：Git 分支 main、0 commit、全部未跟踪；已有 packages/protocol、analyzer-java、learning、storage-local、workspace-local、apps/cli/cliff-adapter、tests×2、evals/java/oracle.md、scripts/build.mjs、package.json；fixtures 目录树存在但 0 文件；vendor/ 与 artifacts/evidence/ 为空。
- 实测验证状态：`npm run check` 失败（tests/protocol.test.ts 第 5 行语法错误）；`npx vitest run` 2 文件全失败（同一语法错误 + @cliffx/core、@cliffx/test 未安装）；`npm run build` 未运行（build.mjs 引用的 apps/cli/index.ts 与 packages/engine/index.ts 不存在）。
- 关键发现：@cliffx/core@0.0.1 与 @cliffx/test@0.0.1 已在 npm 发布，repository 指向 github.com/xingzhiwei-code/cliff，与 E002 固定 commit 仓库一致（2026-09-08 npm view 实查）。
- 变更：本轮仅状态文件（CURRENT/HANDOFF/BACKLOG/EVIDENCE/本文件）；不改动产品代码。上一会话工作归属：无记录，按磁盘事实登记为 in_progress。
- Evidence：E005（仓库现实核查）。
- check_mode：self-separated；无独立 Checker 可用（单 Agent 环境）。
- outcome：continue——恢复完成后立即接续 L002（修复验证基线）。
- 下一步：修复 protocol.test.ts 语法错误、安装固定版本 @cliffx 依赖、跑通 check+test，作为 T001 完成证据。
- checkpoint completion：completed（r2 写入完成，见 CURRENT）。

## 后续追加规则

第一轮实现使用 L001；先写 Loop 目标与起始快照，执行后补齐结果并形成 checkpoint。失败、取消、未运行均如实记录；不能只留成功记录。长日志可分卷，入口只保留最近关键内容与归档链接。

## DOC-REV-01 — 补齐四个版本规划

- checkpoint_revision：r1；checkpoint_status：preparing。
- 日期：2026-09-08；产品 Task：none；没有开始 T001。
- 用户反馈：无法从 PRD 清楚找到版本数量及每版内容。
- 修改：PRD 文档版本 1.1，新增开头总览和第 8 节四版详细范围；同步架构、后续入口任务、README 与固定状态。
- Decision/Evidence：D006/E004。
- 已完成/未完成：规划已补全；产品仍未实现。
- 下一步：T001 仓库基线，产品实现 Loop 仍从 L001 开始。
- 写入尝试：一次批量编辑在读取脚本文本时因编码错误退出，未改动文件；随后用文件补丁完成同步，没有产品行为受影响。
- checkpoint completion：completed；r1 的文档/编号/任务依赖/状态/归档检查通过，更新本记录后重建文件摘要和 ZIP。产品进度不变。
