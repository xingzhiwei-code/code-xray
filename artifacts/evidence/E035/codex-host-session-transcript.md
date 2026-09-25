# E035 宿主实测转录摘要 — Codex CLI 会话内自主调用(2026-09-25T18:35—18:58+08:00)

宿主:Codex CLI(codex-cli 0.155.1,`~/.codex/config.toml` 注册 code-xray → dist/agent.js,会话内服务器名被规范化为 `code_xray`)。
工作区:/tmp/xray-v04-codex(fixtures/java-spring-jpa 的 36 文件副本,实测后已清理)。
调用方:codex exec 会话内 LLM 自主 MCP 工具调用(非脚本驱动);操作者在本会话外驱动并核对返回。

## 前置:环境探测与注册修复

1. 上游探测:`codex exec "reply PONG" --skip-git-repo-check` → 返回 PONG(CC Switch 本地代理 127.0.0.1:15721 已恢复,此前 502 阻塞解除)。
2. **发现注册丢失**:`~/.codex/config.toml` 中 code-xray 条目不存在(E030 时注册过,期间配置被外部重写;`codex mcp list` 仅剩 codegraph/node_repl/computer-use)。重新执行 `codex mcp add code-xray -- node <repo>/dist/agent.js` → enabled。
3. **发现审批策略坑**:默认 `codex exec` 下会话内 MCP 调用被拒——"MCP tool call requires approval, but approval policy is never";加 `--dangerously-bypass-approvals-and-sandbox` 后,会话内真实 MCP 调用 `xray_capabilities` 成功:status=ok、engineVersion=0.1.0、protocolVersion 2025-06-18(回退 2024-11-05)、gatePolicy=report-only、6 规则齐全。

## 双轮闭环调用序列与关键返回(与 E032 同语义,范围差异见"限制")

1. `xray_review_start{path}` → sessionId S1=`revs_2d503b0f7f71efb17e4fba63e339d1c3`, baselineSnapshotId=`ec46f53e147569cb702932eeb600a82c6f3f508c762074c99c2a945ea1953d17`(**与冻结 fixture/E027/E028/E032 逐字符一致——跨宿主确定性成立**), fileCount=36, gitHead=null。
2. 修改 OrderService.java:在 `openOrders()` 前插入 `auditAll(List<Order>)`,循环内 `orderRepository.save(order)`(33-37 行)。
3. `xray_review_finish{S1}` → reviewId R1=`rev_abc7b15ebc0ef642470a9bb7fd9d02be`, analysisId=`24c1de3f-783c-472c-8a70-32fbb2e4766d`;filesChanged=1、new=1、continuing=4、resolved=0;新 finding=`finding_d133fd902f20b89fe741`(JPA_CALL_IN_LOOP, `demo.orders.OrderService#auditAll(List<Order>)`——**与 E032 Claude 宿主同一 finding ID**),归属新 Insight `ins_7315294b265bc19fc8986cb669c5d9a6`(概念 `jpa.query-amplification`, importance=high);gate=needs_human、blocking=false、gatePolicy=report-only;debt 0→15.62(debt-model-v2)。
4. 再修改:auditAll 循环体替换为 `orderRepository.saveAll(orders)`。
5. `xray_review_start` → S2=`revs_7d7ab76a1872b503395e8b797dfa0d35`(baseline=`c57deea8…`);`xray_review_finish{S2}` → reviewId R2=`rev_dee81835273ff239aae43e1f988143fc`, analysisId=`ff24fd41-8397-4970-b8f5-79e8ada7ab76`;new/continuing/removed 均 0——**因提示词顺序使 S2 基线在第 4 步修改之后捕获,baseline==target(c57deea8 两侧相同),diff 为空**;修复效果仍可见于绝对计数:JPA_CALL_IN_LOOP 6→5、总 findings 28→27、debt 15.62→14.59(-1.03)。宿主 LLM 主动指出了该顺序问题("To get the removal attributed, the review_start has to precede the edit")。
6. `xray_review_read{R1}` → reused=true, **stale=true**, stalePaths=[`src/main/java/demo/orders/OrderService.java`], gate 由 needs_human 降级 **incomplete**, blocking=false, 新 reason:"审查已过期:目标快照后 1 个文件发生变化(src/main/java/demo/orders/OrderService.java);结论不代表当前代码。" 记录的 insights/计数保持不变(不冒充新结论)。

## 断言结论

- V04-1(Codex 侧):修改→分析→再修改→重扫→旧审查过期 的完整闭环在 Codex 宿主 LLM 会话内成立,全部经会话内 MCP 工具调用完成。
- 跨宿主确定性:同一 fixture 基线 snapshotId(ec46f53e…)与同一修改产生的 finding ID(finding_d133fd90…)在 Claude Code(E032)与 Codex(本轮)两宿主逐字符一致。
- V04-3(部分):reviewId/基线/目标快照可核对;代码再变更后旧审查明确过期且 gate 降级;记录持久于默认 LocalStore(~/Library/Application Support/code-xray),不依赖聊天记忆。
- V04-2(部分):gate reason 诚实陈述过期语义,未伪装通过;V04-4(部分):gate 全程 report-only(blocking=false)。

## 限制(如实记录,收口范围经用户授权,见 D014)

- `xray_explain`/`xray_evidence` 未在本 Codex 会话内复跑("读取证据"子步骤由 E032 Claude 宿主实测 + E027/E030 对同一 dist/agent.js 的契约测试覆盖;本会话已验证同一 MCP 通道可用)。
- removed 归因未在 Codex 侧演示(第 5 步 diff 为空,系提示词顺序所致而非工具缺陷;removed 归因由 E031 断言 13/13 与 E032 步骤 7 覆盖,修复效果本轮经绝对计数可见)。
- 跨会话幂等(不同 session 收敛同 reviewId)未在 Codex 复跑(E029 契约测试 + E032 步骤 9 覆盖;本轮 review_read 返回 reused=true 佐证内容寻址复用)。
- 用户 2026-09-25 明确指示:快速验证已通过,不再补跑,直接按本次实测范围文档收口(D014)。
- 转录为摘要级(完整工具返回在 codex 会话记录);codex exec 需 `--dangerously-bypass-approvals-and-sandbox` 才能进行会话内 MCP 调用(headless 无法弹审批)。
- review 数据存储于默认 LocalStore,非临时目录;/tmp/xray-v04-codex 工作副本实测后已清理。
