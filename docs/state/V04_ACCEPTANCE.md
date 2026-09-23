# V04 验收映射（T301 / PRD §8.5）

制作：2026-09-23（r26 轮）；制作依据：PRD §8.5 验收原文 + E027—E033 证据链；独立 Checker 复查结论"有保留通过"，其唯一高级别发现（自动触发子项当时缺 E033 与契约测试）已在 r26 补齐闭环。
规则：每项列出"验收原文要点 → 证据 → 状态"；有缺口不得标 passed。状态汇总见文末。

## V04-1 — 两个不同宿主实测"修改→分析→读取证据→再修改→重扫"；相同输入与能力的确定性结果一致，差异只来自允许变化的表达/宿主行为

| 子项 | 证据 | 状态 |
|---|---|---|
| Claude Code 宿主内 LLM 自主调用完成九步双轮闭环（基线→修改 auditAll→审查 new=1→explain→evidence 回源→再修改 saveAll+restockOne→重扫 JPA_CALL_IN_LOOP 6→5 / TX_SELF_INVOCATION 5→6→旧审查 stale→跨会话幂等同 reviewId） | E032（artifacts/evidence/E032/host-session-transcript.md） | passed |
| 工具链双轮闭环语义在真实构建产物 dist/agent.js 上 13/13 断言（含 removed 检出、幂等 reused、stale+incomplete 降级） | E031（artifacts/evidence/E031/） | passed |
| 确定性：同快照跨进程 scan 结果除 analysisId/savedTo 外深度相等；宿主内 snapshotId 与契约测试一致（ec46f53e…） | E027（tests/agent-mcp.test.ts determinism 用例）、E028、E032 步骤 1 | passed |
| **第二个宿主（Codex CLI）实测同一闭环** | 无——Codex 上游代理 502（CC Switch→127.0.0.1:15721），server 已注册 enabled 但 LLM 会话无法建立 | **open（用户决定搁置，T301 收口硬条件）** |

**V04-1 整体：open**（单宿主 passed；"两个不同宿主"未达成）。

## V04-2 — 初次启用、自动触发、重复请求、取消、超时、工具错误与不完整覆盖有契约测试；partial/failed/unknown 不被包装成审查通过

| 子项 | 证据 | 状态 |
|---|---|---|
| 初次启用（initialize 握手、协议版本协商、serverInfo、instructions） | E027 契约测试 | passed |
| 重复请求（同目标快照幂等 reused:true；不同会话收敛同 reviewId） | E029 契约测试 + E032 步骤 9 | passed |
| 取消（派发前 CANCELLED 130 语义；未知 requestId no-op；取消不返回 complete） | E030 契约测试 | passed |
| 超时（timeoutMs→TIMEOUT 域错误，消息可行动） | E030 契约测试 | passed |
| 工具错误（域错误 envelope+isError / 协议错误 JSON-RPC 码 -32700/-32601/-32602 分离；坏 JSON id=null；消息上限 1MB） | E027/E030 契约测试 | passed |
| 不完整覆盖（partial→gate incomplete；unknown 显式列出；39 项 unknown 在宿主实测中未伪装） | E029（computeGate）、E032 步骤 3/7 | passed |
| 自动触发（hook opt-in：report-only 永 exit 0；enforce 才 exit 2；失败明示"结论不可用"） | E033（hook 双模式四路径实测 + tests/agent-hook.test.ts 4 契约用例 + 独立 Checker 复查） | passed（opt-in 语义受测；宿主 settings.json 端到端触发留用户启用时验证，已在文档声明） |

**V04-2 整体：passed**（契约测试层面完整，含 hook 4 用例；hook 在真实宿主 settings.json 的端到端触发未配置实测——opt-in 交付边界已在文档声明）。

## V04-3 — 报告标识、基线和目标快照可核对；代码变更后旧审查明确过期；换宿主可根据持久记录重新获取报告，不依赖私有聊天记忆

| 子项 | 证据 | 状态 |
|---|---|---|
| 稳定标识（reviewId 内容寻址 sha256(workspaceId+targetSnapshotId+ruleSetVersion)；analysisId/snapshotId/versions 全记录） | E029 设计+测试、E032 转录 | passed |
| 基线/目标快照可核对（baseline.snapshotId 与 review_start 返回一致；target.files 全 manifest digest） | E032 步骤 1/3 | passed |
| 旧审查过期（再变更后 review_read → stale:true + stalePaths + gate 降级 incomplete + reason 明示"结论不代表当前代码"；读取时计算不落盘） | E029 契约测试 + E031 + E032 步骤 8 | passed |
| 跨进程/换宿主恢复（两个 server 实例共享 dataDir，review_read 恢复同一记录；不依赖聊天记忆） | E029（cross-process 用例）、E032 步骤 9 | passed |

**V04-3 整体：passed**。

## V04-4 — 默认本地与权限约束有效；恶意源码不变成工具指令；可配置的流程关口只在用户启用范围内生效；现有三个 Surface 的相关回归通过

| 子项 | 证据 | 状态 |
|---|---|---|
| 默认本地（零网络零新依赖手写 MCP；数据入用户目录 0600/0700；stderr 无源码） | E027/E030 契约测试 | passed |
| 注入遏制（fixtures/injection-java 恶意文本触发真实 finding 前提下，8 个指令邻近通道 + stderr 逐一断言不含 marker；唯一出口 evidence source-data 包裹） | E030 契约测试 | passed |
| session 源码缓存隐私（0600/0700 递归断言；deleteData('reviews') 连带清除；清除后明确 NO_REVIEW_SESSION） | E030 契约测试 | passed |
| gate 只在启用范围生效（默认 report-only blocking=false 全程；XRAY_AGENT_GATE=enforce 才 blocking:true；hook enforce exit 2） | E029/E030 契约测试 + E032 全程 + E033 hook 实测 | passed |
| 现有 Surface 回归（verify 全链 115/115：CLI 81+、VS Code 类型/构建、engine/protocol/storage/learning/profile 全部测试） | E030（verify 0） | passed |

**V04-4 整体：passed**。

## 汇总

| 验收 | 状态 |
|---|---|
| V04-1 | **open**——唯一缺口：Codex 第二宿主实测（用户 2026-09-23 决定搁置；环境恢复后按 HANDOFF"第一条可执行动作"补做） |
| V04-2 | passed |
| V04-3 | passed |
| V04-4 | passed |

**T301 结论：不得 done**（V04-1 双宿主硬条件未达成）。其余全部验收项已有证据且无 unresolved failure；Codex 实测是唯一剩余缺口，解除方式为环境恢复后执行 HANDOFF 记录的既定流程。
