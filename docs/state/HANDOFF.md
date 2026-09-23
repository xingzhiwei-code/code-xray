# 当前接力单

state_revision: r26
checkpoint_status: complete
from_session: 20260909-101500-codex（L019 T201 V03 深化分析）
to_session: 20260922-claude-v04 / 下一位执行者
active_loop: L025 已收口（hook opt-in + V04 验收映射 + 独立 Checker，E033）
active_task: T301 in_progress（T301a/b/c done；T301d 仅剩 Codex 第二宿主实测，用户指示搁置）；T101/T201 按 D012 挂起
next_task: Codex 上游恢复后 codex exec 双轮闭环（V04-1 收口唯一缺口）→ 更新 V04_ACCEPTANCE → T301 done

## 30 秒接手摘要

当前状态：v0.1 完成；V02/V03 遗留项按 D012 挂起。T301a/b/c 已收口、T301d 仅剩一项：MCP server 8 工具（capabilities/scan/evidence/review_start/review_finish/review_read/explain/summary），完整修改后审查闭环——内容寻址 ReviewRecord（幂等 reused、跨进程恢复、读取时 stale 降级 incomplete）、gate 默认 report-only（XRAY_AGENT_GATE=enforce 才 blocking）；契约加固——取消/超时/1MB 上限/注入遏制（fixtures/injection-java，恶意文本仅 evidence source-data 出口）/session 缓存 0600 与 deleteData 清除。verify 0（119/119，16 文件），冻结 oracle eval 100%。T301d 已交付：双轮闭环演示 13/13（E031）+ Claude Code 宿主内 LLM 自主调用九步闭环（E032，V04-1 单宿主收口）+ Stop hook opt-in（E033，4 契约用例）+ V04_ACCEPTANCE 验收映射（V04-2/3/4 passed、V04-1 open）+ 独立 Checker"有保留通过"且发现全部闭环 + README/SUPPORT 文档。**唯一剩余：Codex 第二宿主实测（上游代理 502，用户指示搁置）——V04-1 双宿主硬条件，T301 在此之前不得 done。**下一位按"第一条可执行动作"执行。

## 已交付与未交付

- 已交付（E027—E030，T301a/b/c done）：apps/agent/**（index + host/{jsonrpc,mcp,bridge} + tools）；protocol +Envelope/Gate/ReviewRecord 家族；engine +analyzeWithBaseline（复用 buildDiff）；storage +reviews/review-sessions 命名空间（deleteData 覆盖）；scripts/{build,check}-agent.mjs 入 verify 链；tests/agent-{helpers.ts,mcp,review,contract}.test.ts（29 用例）；fixtures/injection-java；.mcp.json；codex 全局注册。分层约束：tools 只依赖 host/bridge.ts（D011）。
- 未交付（T301d 仅剩一项）：Codex 第二宿主实测（上游 502，V04-1 双宿主硬条件，用户指示搁置）。已交付：E031 演示 + E032 Claude 宿主九步闭环 + E033 hook opt-in（脚本+4 契约用例）/V04_ACCEPTANCE 映射（V04-2/3/4 passed）/独立 Checker"有保留通过"且发现闭环 + README/SUPPORT 文档。
- 工作树：r21—r25 已提交（edf61f3/c2eec3a/2e1204a/23ad4b3/5b80594）；r26（hook+映射+Checker+状态）改动待提交。GitHub 推送仍因 token invalid 阻塞。
- 最近有效产品测试：E033（2026-09-23T19:45+08:00，verify 0（119/119）+ hook 四路径 + 独立 Checker）+ E032（宿主闭环）+ E031（演示 13/13）。

## 第一条可执行动作

T301d 唯一剩余项（用户指示搁置中，勿提前宣称完成）：Codex 上游代理恢复后（探测：`codex exec "reply PONG" --skip-git-repo-check` 返回 PONG 而非 502），用 codex exec 对 /tmp 工作副本执行与 E032 同语义的双轮闭环（~/.codex/config.toml 已注册 code-xray；流程：review_start→修改→review_finish→explain/evidence→再修改→重扫→旧审查 stale），登记证据（E034 起），把 docs/state/V04_ACCEPTANCE.md 的 V04-1 更新为 passed，T301/T301d 方可 done。等待期间无阻塞开发项；可选：V03-2 评估债回补（三类深化规则正/负/未知 fixture）或 T101 交互重设计（需用户需求输入）。注意：scripts/demo-v04-double-loop.py 重跑会覆写 artifacts/evidence/E031/ 产物（Checker 发现的副作用），重跑后需 git checkout 恢复或另行归档。

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

r26 = E033（hook opt-in + V04 验收映射 + 独立 Checker）+ L025 + V04_ACCEPTANCE.md。r25 = E032（Claude Code 宿主闭环，V04-1 单宿主收口）+ L024 + 提交 5b80594。r24 = E031（双轮闭环演示）+ L023 + README/SUPPORT Agent Surface 文档 + 提交 23ad4b3。r23 = E030（T301c 契约加固）+ L022 + 提交 2e1204a。r22 = E029（T301b Review 会话）+ L021 + 提交 c2eec3a。r21 = E028（Claude Code 宿主闭环）+ T301a done + 提交 edf61f3。r20 = E027 + D011/D012 + T301 拆分 + L020。v0.1 证据链 E005—E017 不变。

## 中断点

L025 已完整落盘（r26）。若新会话接手：先核对 git status（r26 改动可能未提交）与 E033 subject_snapshot；读 AGENTS→START_HERE→本文件与 docs/state/V04_ACCEPTANCE.md；T301d 仅剩 Codex 实测（搁置中），不要提前把 T301 标 done；等待期间可选 V03-2 评估债或 T101 需求梳理。
