# 当前接力单

state_revision: r21
checkpoint_status: complete
from_session: 20260909-101500-codex（L019 T201 V03 深化分析）
to_session: 20260922-claude-v04 / 下一位执行者
active_loop: L020 已收口（T301a done：E027 机器验证 + E028 Claude Code 宿主闭环）
active_task: T301 in_progress（T301a done，T301b ready）；T101/T201 按 D012 挂起
next_task: 开发 T301b Review 会话（ReviewRecord、review_start/finish、explain/summary、gate、幂等/stale 测试）

## 30 秒接手摘要

当前状态：v0.1 完成；V02/V03 遗留项按 D012 挂起。T301a 已收口：apps/agent MCP stdio server（手写 JSON-RPC，零新依赖）+ capabilities/scan/evidence 三工具，npm run verify 全绿（96/96，E027）；用户批准 Claude Code 加载 .mcp.json 后，宿主内 capabilities→scan→evidence 三步闭环实测通过（E028，snapshotId 与契约测试一致）。Codex CLI 已注册但上游代理 502，第二宿主实测归 T301d。下一位直接开发 T301b Review 会话。

## 已交付与未交付

- 已交付（E027/E028，T301a done）：apps/agent/{index.ts,host/{jsonrpc,mcp,bridge}.ts,tools/index.ts}；protocol +Envelope/Gate/okEnvelope/errorEnvelope；scripts/{build,check}-agent.mjs 入 verify 链；tests/agent-mcp.test.ts；.mcp.json；codex 全局注册。分层约束：tools 只依赖 host/bridge.ts（唯一 import engine/storage/learning 的 seam，D011）。
- 未交付（T301b—d）：ReviewRecord 类型与 saveReview/loadReview/findReviewByTargetSnapshot；xray_review_start/xray_review_finish/xray_explain/xray_summary 工具；gate 实体与 enforce 策略；取消/超时/注入正式契约测试与 fixtures/injection-java；Codex 完整闭环；V04-1..4 逐项验收；Stop hook opt-in；README/SUPPORT 文档更新。
- 工作树：r21 已本地提交（用户 2026-09-22 明确指示提交）。GitHub 推送仍因 token invalid 阻塞。
- 最近有效产品测试：E027（verify 0）+ E028（2026-09-22T17:05+08:00，Claude Code 宿主闭环）。

## 第一条可执行动作

T301b（T301a 已收口，无前置动作）：在 packages/protocol/index.ts 增加 ReviewRecord 接口（reviewId='rev_'+sha256(workspaceId+targetSnapshotId+RULE_SET_VERSION).slice(0,32)）；packages/storage-local/index.ts 增加 saveReview/loadReview/findReviewByTargetSnapshot（reviews/<digest>.json + reviews/index.json，复用 atomicWrite/locked/redactReport，DataKind 加 'reviews'）；apps/agent/tools/index.ts 增加 xray_review_start/xray_review_finish（finish 先查 index 幂等复用，读取时 stalePaths 非空 → stale:true + gate 强制 incomplete）；tests/agent-review.test.ts 覆盖幂等（同 targetSnapshotId 两次 finish → 同 reviewId + reused:true）与过期（touch 文件后读取 → stale）。验证：npm run verify 全绿。

## 已知探索结果

- node_modules 无 @modelcontextprotocol/sdk，网络受阻 → 手写 MCP 是既定路线（不要换 SDK）。
- 已知坑（本轮实证）：esbuild banner shebang 与源文件 shebang 重复会导致 dist 语法错误（源文件不写 shebang）；测试客户端读子进程 stdout 必须用 StringDecoder（CJK 多字节跨 chunk 截断产生 mojibake 假差异）；tools/call 未知工具按 MCP 规范是 -32602 而非 -32601。
- claude -p headless 需要登录态；codex exec 依赖 CC Switch 本地代理（127.0.0.1:15721），代理挂时 502。宿主实测要等用户环境就绪。
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

D011（bridge 单 seam，未来拆 engine-host 只动 bridge 层）与 D012（跳过 v0.3 授权，V03-2 债不得在 v0.4 收口时宣称完成）为本阶段依据。gate 默认 report-only，只有 XRAY_AGENT_GATE=enforce 才可阻塞（PRD §8.5-5）——不得反转默认。evidence 是源码进入工具通道的唯一出口，必须保持 source-data 包裹 + 逐行脱敏。首次提交/推送授权范围（正常开发提交）沿用 E015 记录。

## 快照与证据

r21 = E028（Claude Code 宿主闭环）+ T301a done + 本地提交。r20 = E027 + D011/D012 + T301 拆分 + L020。v0.1 证据链 E005—E017 不变。

## 中断点

L020 已完整落盘并经 r21 收口提交。若新会话接手：git log 最新提交即 Loop A + 宿主 smoke；读 AGENTS→START_HERE→本文件，按"第一条可执行动作"直接进入 T301b；Codex 宿主实测等网络恢复，不阻塞开发。
