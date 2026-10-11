# ADR-001：Surface 聚焦

- 日期：2026-10-11
- 状态：已采纳（v0.5 已执行）

## 背景

项目有四个 surface（CLI、VSCode 插件、IDEA 插件、MCP），单人 + AI 团队维护成本高；产品的差异化能力（relevance gate、双循环审查、report-only gate）全部在 agent 主循环里。

## 决策

- **MCP agent 为主 surface**，持续投入。
- **CLI 降级为薄壳（frozen）**：保留现有命令（scan/explain/learn/debt/doctor/relevance），仅作调试/演示/CI 入口，不再新增命令、不做交互优化。
- **删除 VSCode 插件**：`apps/vscode/` 及 `scripts/build-vscode.mjs`、`scripts/check-vscode.mjs` 一并删除。
- IDEA 插件无代码，不处理。

## 理由

- VSCode 插件是维护黑洞（VSCode API 年年变），且与"agent 原生"定位最冲突。
- CLI 不能删：它是调试引擎的唯一趁手工具（dogfood 全靠它），是开源 30 秒 demo 的获客入口，且是 learn/debt/profile 的人类输入通道——"Agent 不能替用户确认知识掌握"红线要求学习状态变更只能经 CLI/IDE 显式事件。

## 后果

- `apps/` 仅保留 `agent`、`cli` 两个目录。
- 后续 surface 相关投入只进 `apps/agent`。
