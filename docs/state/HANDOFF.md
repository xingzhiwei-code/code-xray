# 当前接力单

state_revision: r28
checkpoint_status: complete
from_session: 20260925-claude-t302（L026 T302）
to_session: 20260925-claude-t301d / 下一位执行者
active_loop: L027 已收口（T301d Codex 第二宿主实测，E035/D014）
active_task: 无进行中任务；T301 done（V04-1—V04-4 全部 passed）；T302 done；T101/T201 按 D012 挂起
next_task: 无必需项。可选（按价值排序）：① CLI/VSCode review 视图复用 packages/insights/presentation.ts；② V03-2 评估债回补（D012 挂起项）；③ T101 交互重设计（需用户需求输入）

## 30 秒接手摘要

当前状态：v0.1 完成；V02/V03 遗留项按 D012 挂起；T302（Review Insight Layer v0.2）done（E034，DoD 22/22，独立 Checker 通过）；**T301（v0.4 Agent Integration）本轮收口 done**——Codex 上游代理恢复后（探测 PONG 成功），发现并修复 `~/.codex/config.toml` 注册丢失（重新 `codex mcp add`），发现并绕过 codex exec 审批坑（headless 默认拒绝 MCP 调用，需 `--dangerously-bypass-approvals-and-sandbox`），随后 codex exec 会话内 LLM 自主 MCP 调用完成六步双轮闭环（E035）：基线 `ec46f53e…` 与冻结 fixture/E027/E028/E032 逐字符一致、新 finding `finding_d133fd90…` 与 E032 Claude 宿主同 ID（**跨宿主确定性成立**）、gate 全程 report-only、旧审查 stale+gate 降级 incomplete 诚实返回。V04-1 → passed（双宿主达成；范围备注 D014：Codex 侧快速实测未复跑 explain/evidence、removed 归因、跨会话幂等三个子步骤，均已有同二进制其他证据覆盖，用户授权收口，审计时按 D014 revisit_when 补跑）。V04-1—V04-4 全部 passed，T301/T301d done。本轮零产品代码改动，仅证据与状态落盘。下一位按"第一条可执行动作"执行。

## 已交付与未交付

- 本轮交付（E035/D014，L027）：artifacts/evidence/E035/codex-host-session-transcript.md；EVIDENCE E035；DECISIONS D014；V04_ACCEPTANCE（V04-1 passed + 汇总 + T301 结论 done）；BACKLOG（T301/T301d done + r27/r28 历史行 + T301 扩展字段）；SUPPORT/README（Codex 实测状态 + exec 审批参数注意）；LOOP_LOG L027。
- 未交付（非阻塞可选项）：CLI/VSCode review 视图（渲染器 packages/insights/presentation.ts 已备好复用）；V03-2 评估债（D012 挂起）；T101 交互重设计（需用户需求）；hook 宿主 settings.json 端到端触发（opt-in，用户启用时验证）。
- 工作树：r27 已提交（a1df029→…→7a65cf0→docs/state r27→185246d checker 补记）；r28 为本轮状态/证据/文档提交。GitHub 推送仍因 token invalid 阻塞。
- 最近有效产品测试：E034（2026-09-25，verify 0/158-158 + oracle + bench + before/after 实证）；E035（2026-09-25，Codex 宿主实测，非自动化测试）；E033（hook+Checker）；E032（Claude 宿主闭环）。

## 第一条可执行动作

无必需动作（T301/T302 均 done，V04 全部 passed）。若用户提出新需求按 BACKLOG 可选项排优先级：① CLI/VSCode review 视图（复用 renderReviewPresentation，不在 MCP/bridge 层重实现聚合）；② V03-2 评估债回补（三类深化规则正/负/未知 fixture）；③ T101 交互重设计（先需求梳理）。若未来审计 V04 或 Codex 侧出现 explain/evidence/removed 相关缺陷：按 D014 revisit_when 用 codex exec（带 --dangerously-bypass-approvals-and-sandbox）补跑与 E032 同语义的完整九步并登记新证据。注意：scripts/demo-v04-double-loop.py 重跑会覆写 artifacts/evidence/E031/ 产物，重跑后需 git checkout 恢复或另行归档。

## 已知探索结果

- node_modules 无 @modelcontextprotocol/sdk，网络受阻 → 手写 MCP 是既定路线（不要换 SDK）。
- 已知坑（全部实证）：esbuild banner shebang 与源文件 shebang 重复会导致 dist 语法错误（源文件不写 shebang）；测试客户端读子进程 stdout 必须用 StringDecoder（CJK 多字节跨 chunk 截断产生 mojibake 假差异）；tools/call 未知工具按 MCP 规范是 -32602 而非 -32601；仓库根裸 xray 扫描计数测试（tests/cli.test.ts）与 fixtures/ 树耦合，新增 fixture 必须同步更新计数（本轮 36→38/27→28）。
- claude -p headless 需要登录态；codex exec 依赖 CC Switch 本地代理（127.0.0.1:15721），代理挂时 502（2026-09-25 已恢复并实测）。宿主实测要等用户环境就绪。
- **Codex 宿主三坑（E035 实证）**：① headless `codex exec` 默认审批策略拒绝会话内 MCP 调用（"MCP tool call requires approval, but approval policy is never"），需 `--dangerously-bypass-approvals-and-sandbox`；交互模式当场审批即可。② `~/.codex/config.toml` 的 MCP 注册可能被外部工具（代理切换器等）重写而丢失，实测前先 `codex mcp list` 核对。③ 会话内服务器名被规范化为 `code_xray`（下划线），工具名匹配不受影响。
- **会话中途重建 dist/agent.js 不会更新已加载的宿主 server 进程**——宿主实测必须在 server 重建后的新会话进行（r25 实证：Claude 会话只看到 Loop A 的 3 工具）。
- 双轮闭环提示词顺序坑（E035）：review_start 必须在下一次修改**之前**调用，否则 baseline==target、diff 为空，removed 无法归因（绝对计数仍可见修复）。
- D007（vendor 补丁）/D008（未跟踪默认纳入）/D009（profile 边界）继续有效；D011（进程内 bridge seam）、D012（跳过 v0.3 授权）、D013（Insight Layer/schema 0.2/Debt v2）、D014（V04-1 按 Codex 实测范围收口）。

## 待验证与潜在阻塞

| 项 | 当前状态 | 解除方式 / 可并行工作 |
|---|---|---|
| GitHub 推送 | 本地 main 领先远端多个提交，token invalid | 用户重新认证后 git push origin main |
| VS Code 宿主验证 | VSIX 已构建，CLI 无法写扩展目录 | 授权后安装 VSIX 跑真实宿主 smoke |
| V03-2 评估债 | 按 D012 挂起 | JetBrains 环境解除或用户要求回补时做三类规则正/负/未知 fixture |
| Windows/Linux | 未测 | 有环境时跑 verify+eval+bench |
| Codex 侧完整九步（D014 范围备注） | explain/evidence、removed 归因、跨会话幂等未在 Codex 复跑（同二进制其他证据已覆盖） | 审计 V04 或相关缺陷出现时按 D014 revisit_when 补跑 |

## 下一位必须保留的选择

D011（bridge 单 seam，未来拆 engine-host 只动 bridge 层）、D012（跳过 v0.3 授权，V03-2 债不得在 v0.4 收口时宣称完成）、D013（Insight Layer/schema 0.2/Debt v2：聚合只在 packages/insights，0.1 记录版本化读取不迁移，presentation 不落盘不是事实来源，importance/exposure 常量改动必须带测试，LLM 只能建立在 Insight 结构化层之上）与 D014（V04-1 收口范围以 E035 实测为准，差异书面备注不得隐藏）为本阶段依据。gate 默认 report-only，只有 XRAY_AGENT_GATE=enforce 才可阻塞（PRD §8.5-5）——不得反转默认。evidence 是源码进入工具通道的唯一出口，必须保持 source-data 包裹 + 逐行脱敏（注入遏制测试锁定）。review session 基线缓存含源码明文，是唯一保留源码的本地数据，必须维持 0600/0700 且 deleteData('reviews') 可清除。首次提交/推送授权范围（正常开发提交）沿用 E015 记录。

## 快照与证据

r28 = E035（Codex 第二宿主实测，V04-1 双宿主收口）+ D014 + L027 + V04_ACCEPTANCE 全 passed + BACKLOG T301/T301d done + SUPPORT/README Codex 注意事项。r27 = E034（T302 Review Insight Layer v0.2）+ L026 + D013 + docs/plans 计划文件（含 §27 实施记录）。r26 = E033（hook opt-in + V04 验收映射 + 独立 Checker）+ L025 + V04_ACCEPTANCE.md。r25 = E032（Claude Code 宿主闭环）+ L024 + 提交 5b80594。r24 = E031（双轮闭环演示）+ L023。r23 = E030（T301c 契约加固）+ L022。r22 = E029（T301b Review 会话）+ L021。r21 = E028 + T301a done。r20 = E027 + D011/D012 + T301 拆分 + L020。v0.1 证据链 E005—E017 不变。

## 中断点

L027 已完整落盘（r28，工作树干净、全部已提交）。若新会话接手：读 AGENTS→START_HERE→本文件；T301/T302 均 done，V04-1—V04-4 全部 passed（V04-1 带 D014 范围备注）；无必需下一步，可选项见"第一条可执行动作"；不要把 D014 的范围备注当作已补跑，也不要在未补跑时宣称"九步全量在 Codex 复现"。
