# 当前接力单

state_revision: r24
checkpoint_status: complete
from_session: 20260909-101500-codex（L019 T201 V03 深化分析）
to_session: 20260922-claude-v04 / 下一位执行者
active_loop: L023 已收口（T301d 第一轮：双轮闭环演示 13/13 + 文档，E031）
active_task: T301 in_progress（T301a/b/c done；T301d in_progress，剩宿主实测/hook/独立 Checker）；T101/T201 按 D012 挂起
next_task: 用户重启 Claude Code 会话后宿主内实测 review 闭环；Codex 恢复后同流程；Stop hook opt-in + V04 映射 + 独立 Checker

## 30 秒接手摘要

当前状态：v0.1 完成；V02/V03 遗留项按 D012 挂起。T301a/b/c 已收口：MCP server 8 工具（capabilities/scan/evidence/review_start/review_finish/review_read/explain/summary），完整修改后审查闭环——内容寻址 ReviewRecord（幂等 reused、跨进程恢复、读取时 stale 降级 incomplete）、gate 默认 report-only（XRAY_AGENT_GATE=enforce 才 blocking）；契约加固——取消/超时/1MB 上限/注入遏制（fixtures/injection-java，恶意文本仅 evidence source-data 出口）/session 缓存 0600 与 deleteData 清除。verify 0（115/115，15 文件），冻结 oracle eval 100%。T301d 第一轮完成：工具链双轮闭环演示 13/13（E031）+ README/SUPPORT Agent Surface 文档；剩余宿主 LLM 会话实测——Claude Code 需重启会话加载 8 工具版 server（当前会话仍是 Loop A 的 3 工具），Codex 上游代理 502。下一位按"第一条可执行动作"做 T301d 收尾。

## 已交付与未交付

- 已交付（E027—E030，T301a/b/c done）：apps/agent/**（index + host/{jsonrpc,mcp,bridge} + tools）；protocol +Envelope/Gate/ReviewRecord 家族；engine +analyzeWithBaseline（复用 buildDiff）；storage +reviews/review-sessions 命名空间（deleteData 覆盖）；scripts/{build,check}-agent.mjs 入 verify 链；tests/agent-{helpers.ts,mcp,review,contract}.test.ts（29 用例）；fixtures/injection-java；.mcp.json；codex 全局注册。分层约束：tools 只依赖 host/bridge.ts（D011）。
- 未交付（T301d 剩余）：宿主 LLM 会话内自主调用实测（Claude Code 需重启加载 8 工具版 server；Codex 待上游 502 恢复）；Stop hook opt-in；V04-1..4 验收映射 + 独立 Checker。已交付：双轮闭环演示（E031，13/13）+ README/SUPPORT Agent Surface 文档。
- 工作树：r21—r23 已提交（edf61f3/c2eec3a/2e1204a）；r24（演示脚本+文档+状态）改动待提交。GitHub 推送仍因 token invalid 阻塞。
- 最近有效产品测试：E031（2026-09-23T10:35+08:00，双轮闭环演示 13/13）+ E030（verify 0，115/115）。

## 第一条可执行动作

T301d 收尾（按序）：(1) **用户重启 Claude Code 会话**（当前会话 server 进程是 Loop A 构建仅 3 工具；重启后 .mcp.json 加载 8 工具版 dist/agent.js），在宿主内对 /tmp 工作副本自主执行 review_start→修改→review_finish→evidence→再改→重新 start/finish，断言与 E031 演示同语义，记录证据（宿主内自主调用，V04-1 Claude 侧）；(2) Codex 上游代理恢复后 `codex exec` 重复同流程（V04-1 第二宿主，收口必要条件）；(3) 设计 Stop hook opt-in（Claude Code hooks 配置示例 + 文档，默认不启用）；(4) 按 PRD §8.5 做 V04-1..4 逐项验收映射表，独立 Checker（新上下文）复查。全部通过前 T301 不得 done。可重跑演示：`npm run build:agent && python3 scripts/demo-v04-double-loop.py`。

## 已知探索结果

- node_modules 无 @modelcontextprotocol/sdk，网络受阻 → 手写 MCP 是既定路线（不要换 SDK）。
- 已知坑（全部实证）：esbuild banner shebang 与源文件 shebang 重复会导致 dist 语法错误（源文件不写 shebang）；测试客户端读子进程 stdout 必须用 StringDecoder（CJK 多字节跨 chunk 截断产生 mojibake 假差异）；tools/call 未知工具按 MCP 规范是 -32602 而非 -32601；仓库根裸 xray 扫描计数测试（tests/cli.test.ts）与 fixtures/ 树耦合，新增 fixture 必须同步更新计数（本轮 36→38/27→28）。
- claude -p headless 需要登录态；codex exec 依赖 CC Switch 本地代理（127.0.0.1:15721），代理挂时 502。宿主实测要等用户环境就绪。
- **会话中途重建 dist/agent.js 不会更新已加载的宿主 server 进程**——宿主实测必须在 server 重建后的新会话进行（本轮实证：Claude 会话只看到 Loop A 的 3 工具）。
- D007（vendor 补丁）/D008（未跟踪默认纳入）/D009（profile 边界）继续有效；新增 D011（进程内 bridge seam）、D012（跳过 v0.3 授权）。

## 待验证与潜在阻塞

| 项 | 当前状态 | 解除方式 / 可并行工作 |
|---|---|---|
| Codex CLI 宿主闭环 | server 已注册 enabled，上游代理 502 | 网络/代理恢复后 codex exec 实测完整闭环（T301d） |
| GitHub 推送 | 本地 main 领先远端多个提交，token invalid | 用户重新认证后 git push origin main |
| VS Code 宿主验证 | VSIX 已构建，CLI 无法写扩展目录 | 授权后安装 VSIX 跑真实宿主 smoke |
| V03-2 评估债 | 按 D012 挂起 | JetBrains 环境解除或用户要求回补时做三类规则正/负/未知 fixture |
| Windows/Linux | 未测 | 有环境时跑 verify+eval+bench |

## 下一位必须保留的选择

D011（bridge 单 seam，未来拆 engine-host 只动 bridge 层）与 D012（跳过 v0.3 授权，V03-2 债不得在 v0.4 收口时宣称完成）为本阶段依据。gate 默认 report-only，只有 XRAY_AGENT_GATE=enforce 才可阻塞（PRD §8.5-5）——不得反转默认。evidence 是源码进入工具通道的唯一出口，必须保持 source-data 包裹 + 逐行脱敏（注入遏制测试锁定）。review session 基线缓存含源码明文，是唯一保留源码的本地数据，必须维持 0600/0700 且 deleteData('reviews') 可清除。首次提交/推送授权范围（正常开发提交）沿用 E015 记录。

## 快照与证据

r24 = E031（双轮闭环演示）+ L023 + README/SUPPORT Agent Surface 文档。r23 = E030（T301c 契约加固）+ L022 + 提交 2e1204a。r22 = E029（T301b Review 会话）+ L021 + 提交 c2eec3a。r21 = E028（Claude Code 宿主闭环）+ T301a done + 提交 edf61f3。r20 = E027 + D011/D012 + T301 拆分 + L020。v0.1 证据链 E005—E017 不变。

## 中断点

L023 已完整落盘（r24）。若新会话接手：先核对 git status（r24 改动可能未提交）与 E031 subject_snapshot；读 AGENTS→START_HERE→本文件，按"第一条可执行动作"做 T301d 收尾；宿主实测依赖用户重启会话/Codex 网络，等待期间无阻塞的独立工作只剩 Stop hook 设计草稿。
