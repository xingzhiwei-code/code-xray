# 支持说明（SUPPORT）

Code X-Ray v0.1 · 2026-09-08

## 环境要求

- Node.js ≥ 22.12（基准在 v22.14.0 / macOS arm64 实测）
- Git（`scan --base` 的 diff 对照需要；无 Git 时 scan 正常、diff 返回 NOT_GIT）
- 可选 LLM 增强：OpenAI 兼容端点（默认禁用）

## 常见问题

**扫描结果显示 0 个文件**
确认目录含 `.java` 文件；`node_modules/target/build/dist` 等目录与 `.gitignore` 规则默认排除；敏感文件名（.env、*credentials*、*.pem 等）与疑似凭据内容自动排除——排除原因在 `--format json` 的 `coverage.reasons` 中可见。

**为什么有的调用显示 unknown？**
CST 分析不做类型解析。同名同参数个数重载、Lambda/方法引用的延迟执行、外部或复杂接收者的调用目标无法唯一确定时，Code X-Ray 显式标记 unknown 并给出原因，而不是猜测。这是设计约束，不是缺陷。

**diff 提示 NOT_GIT**
`--base` 需要在 Git 仓库内使用；普通目录请直接 scan。

**JSON 输出和人类输出看到的不一致？**
两者来自同一份报告对象（同一次扫描的同一快照）；人类输出是有界摘要（top-3），完整列表与证据以 `--format json` 为准。

**学习状态保存在哪里？**
用户数据目录（macOS: ~/Library/Application Support/code-xray；或 XRAY_DATA_DIR 指定目录），按工作区路径隔离。报告与学习状态不进入被扫描项目、不进入版本控制。

**开发者画像和学习状态有什么区别？**
开发者画像是本机全局的 `developer/profile.json`，记录角色、语言/框架/工程技能、confidence 与证据来源；项目学习状态按工作区保存，记录"概念 × 当前代码位置"的学习进度。Knowledge Gap 会同时读取两者：画像缺失时显示"未评估"，不把未知当作零或高熟练度。

**如何删除本地数据？**
删除对应工作区子目录，或删除整个数据目录。开发者画像在 `developer/profile.json`。被扫描项目本身不会被修改。

## 命令退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 未知命令 / 意外错误 |
| 2 | 参数或路径无效（含 diff 基线无效、非 Git 目录用 diff） |
| 3 | 文件级限制（超大/二进制/编码/快照变化） |
| 130 | 用户取消（Ctrl-C） |

## Agent Surface（MCP，v0.4）

- 接入：`npm run build:agent` 产出 `dist/agent.js`；Claude Code 用项目 `.mcp.json` 或 `claude mcp add`，Codex CLI 用 `codex mcp add`（均为本地 stdio，零网络）。
- 工具：`xray_capabilities / xray_scan / xray_evidence / xray_review_start / xray_review_finish / xray_review_read / xray_explain / xray_summary`；全部返回 `{schemaVersion:'0.1',status:'ok'|'error',...}` envelope。
- 修改后审查：修改前 `xray_review_start`（记录基线，含未提交内容），修改后 `xray_review_finish`（结构化审查 + gate）。reviewId 内容寻址、重复触发幂等（`reused:true`）；代码再变更后旧审查读取时 `stale:true` 且 gate 降级 `incomplete`。Review schema 0.2（T302）：`output.overview/insights/resolvedInsights/coverageSummary` 为主要消费面（概念级聚合、每 Insight 一个主行动建议、findingIds/evidenceIds 钻取），v0.1 字段保留为 deprecated 明细；结果附确定性 `presentation` 首屏文本；存量 0.1 记录版本化读取、原样返回并明确标记，不做静默迁移。债务为 `debt-model-v2`（概念级 + 非线性暴露），同一审查 before/after 恒用同一模型版本。
- gate 策略：默认 `report-only`（永不阻塞）；仅 `XRAY_AGENT_GATE=enforce` 时非 pass 关口携带 `blocking:true`。partial/failed/unknown 不会包装成 pass。
- 出错语义:域错误在 envelope（`status:'error'` + code/exitCode，MCP `isError:true`）；协议错误走 JSON-RPC 错误码（-32700 坏 JSON、-32601 未知方法、-32602 未知工具/坏参数）。取消（notifications/cancelled）返回 CANCELLED（130 语义），绝不返回伪造 complete。单条消息上限 1MB。
- 隐私:源码只经 `xray_evidence` 进入工具通道（source-data 包裹 + 逐行脱敏）；恶意源码文本不进入摘要/gate/建议（注入遏制测试锁定）。审查会话基线缓存含源码明文，存用户数据目录 `workspaces/<id>/review-sessions/`（0600/0700），随 `deleteData('reviews'|'all')` 清除。
- 限制：宿主自动触发（Claude Code Stop/PostToolUse hook）为 opt-in 规划项，当前版本需 Agent 显式调用工具；Codex CLI 宿主完整闭环实测待其上游可用后补记；`xray_review_finish` 的 base 参数走 git 基线时会话基线缓存不参与对比。

## 已知限制

- 仅 Java `.java` 顶层 class/interface；record/enum/嵌套/匿名类不做框架规则（相关调用不并入确定路径）。
- 注解需显式 import/FQN；通配导入按 unknown 处理。
- 凭据检测/脱敏的关键词模式为英文（password/secret/api key/token 与 sk- 前缀）；非英文关键词的凭据样式不在自动过滤范围。
- 重命名在 diff 中表现为删除+新增（证据坐标按原路径保留语义）。
- 读取期间文件变化的竞态（SNAPSHOT_CHANGED）有检测与拒绝逻辑，但无确定性测试（发布检查记录为限制）。
- 性能基准（100 文件/2 万非空行）：冷 1.04s、热 0.96s、峰值 331 MiB（macOS arm64 / Node 22.14；其他平台未测）。
- 真实远端 LLM provider 未做受控 smoke，保持禁用（unverified-remote）。

## 反馈与开发接力

开发状态、证据与下一步见 [docs/START_HERE.md](START_HERE.md) 固定入口；本文件描述"应当怎样"，以仓库与可复现命令为准。
