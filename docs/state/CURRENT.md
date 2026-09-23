# 当前开发状态

| 字段 | 值 |
|---|---|
| state_schema_version | 1 |
| state_revision | r24 |
| checkpoint_status | complete |
| updated_at | 2026-09-23T10:40+08:00（L023 T301d 第一轮：双轮闭环演示 + 文档） |
| project | Code X-Ray |
| phase | v0.4 Agent Integration（v0.2/v0.3 遗留项按 D012 挂起） |
| implementation_status | in_progress（T301a/b/c done；T301d in_progress——演示/文档 done，双宿主 LLM 实测待做） |
| progress | v0.1 必需任务 10/10 done（T001—T010）；T011 done；T101/T201 in_progress 挂起；T301 in_progress（T301a/b/c done，T301d 进行中） |
| active_task | T301（v0.4 Agent Integration，子任务 T301a） |
| active_loop | L023（已收口）；T301d 收尾待宿主环境 |
| next_task | 用户重启 Claude Code 会话（加载 8 工具 server）后宿主内实测 review 闭环并记录；Codex 恢复后同流程；Stop hook opt-in + V04 验收映射 + 独立 Checker |
| session_owner | 20260922-claude-v04 |
| repo_path | /Users/01443732/Documents/Codex/2026-09-08/referenced-chatgpt-conversation-this-is-an/outputs/code-xray |
| git_branch / head | main / 2e1204a（r23）；r24（演示+文档）改动待提交 |
| worktree_state | r24 改动待提交；GitHub 凭据失效，推送仍阻塞 |
| last_product_verification | E031（双轮闭环演示 13/13，真实 dist/agent.js MCP 通道）；E030（verify 0，115/115）；E027—E029 |
| package_evidence | E005—E017 v0.1 产品证据链完整；E019—E026 V02/V03 进行中；E027—E031 T301a/b/c/d1 |
| blockers | Codex CLI 上游代理 502（第二宿主实测归 T301d）；JetBrains 壳环境阻塞（挂起）；GitHub 推送 token invalid |

## 唯一下一步

**T301d 收尾（依赖宿主环境）**：工具链双轮闭环已在真实 dist/agent.js 的 MCP 通道上 13/13 断言通过（E031：基线→修改→审查→证据→再修改→重扫、幂等 reused、旧审查 stale+incomplete、removed 检出），README/SUPPORT Agent Surface 文档已交付。剩余：(1) **用户重启 Claude Code 会话**——当前会话加载的 server 是 Loop A 构建（仅 3 工具），重启后宿主内自主跑一轮 review 闭环并记录证据；(2) Codex 上游代理恢复后重复同流程（第二宿主，V04-1 收口条件）；(3) Stop hook opt-in 设计（宿主策略，显式启用）；(4) V04-1..4 逐项验收映射 + 独立 Checker（新上下文）复查。全部完成前 T301 不得 done。

## required_reads

- [项目宪法](../CONSTITUTION.md)、[Loop 协议](../LOOP_PROTOCOL.md)、[接力协议](../HANDOFF_PROTOCOL.md)
- [PRD 第 8.5 节](../PRD.md)（V04-1—V04-4 验收原文）、[ARCHITECTURE §3/§7/§11](../ARCHITECTURE.md)（Surface 边界、stdio bridge、envelope 与退出码契约）
- [DECISIONS](DECISIONS.md) 的 D009/D011/D012；[BACKLOG](BACKLOG.md) 的 T301 拆分表与 T301 扩展字段
- 代码：apps/agent/{index.ts,host/{jsonrpc,mcp,bridge}.ts,tools/index.ts}、packages/{protocol,engine,storage-local,workspace-local,learning,developer-profile}、tests/agent-mcp.test.ts、scripts/{build,check}-agent.mjs、.mcp.json

## 当前已知事实与限制

- v0.1 CLI 闭环完整可用（E005—E017）；VS Code 基础闭环已实现、真实宿主验证被沙箱阻塞（E019/E025）；V03 三类深化规则已实现但 V03-2 独立评估未做（E026），按 D012 挂起。
- Agent Surface（T301a done，E027/E028）：MCP 2025-06-18（回退 2024-11-05）stdio server；三工具全部返回 envelope{schemaVersion,status,data|error}；域失败 isError=true、协议失败 JSON-RPC 错误码（未知工具 -32602、未知方法 -32601、坏 JSON -32700）；evidence 回源带 source-data notice、逐行 hasSecret 脱敏、工作区边界与 200 行上限；gatePolicy 默认 report-only（XRAY_AGENT_GATE=enforce 才可能阻塞——gate 实体在 T301b 落地）。
- 双进程同快照 scan 结果除 analysisId/savedTo 外深度相等；冻结 fixture 27 findings 断言已入契约测试；E028 宿主内 scan 的 snapshotId 与契约测试值一致（ec46f53e…5317）。
- Review 会话（T301b done，E029）：8 工具（capabilities/scan/evidence/review_start/review_finish/review_read/explain/summary）；reviewId 内容寻址（workspaceId+targetSnapshotId+ruleSetVersion），幂等复用 reused:true；stale 读取时计算并降级 gate=incomplete（不落盘）；engine 新增 analyzeWithBaseline 复用同一 buildDiff；session 基线含源码缓存（0600 私有目录，deleteData 'reviews'/'all' 可清）。
- 取消（notifications/cancelled→AbortController）与 timeoutMs 代码路径已实现，正式契约测试与注入 fixture 归 T301c；Codex 完整闭环与 V04-1 双轮验收归 T301d。
- 宿主接入现状：Claude Code 已由用户批准并在宿主内完成三工具闭环实测（E028）；Codex CLI 已全局注册（enabled），LLM 闭环被上游代理 502 阻塞，归 T301d。
- 默认离线、零新依赖在手写 MCP 实现下继续成立；stderr 无源码内容已有测试断言。

## 继续开发时不要重复

不要重写 PRD/架构文档；不要把 E027 已验证的契约当未实现；不要用 MCP SDK 替换手写实现（node_modules 无 SDK、网络受阻，且零依赖是隐私基线的一部分）；不要在 tools 层直接 import engine/storage（必须经 host/bridge.ts，D011）；不要让 gate 默认阻塞（PRD §8.5-5：仅显式配置后 finding 才影响流程）；不要把宿主 tool-call 格式渗入 protocol 包（ARCHITECTURE §7）；不要未经授权 git commit；修改 vendor/ 必须同步 VENDOR_PATCH.md 并重跑 cliff-adapter 测试；未来 Surface 不得复制 profile/gap/debt 计算逻辑。
