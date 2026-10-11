# Code X-Ray 开发里程碑

迭代状态只记录在本文件，不维护 `state/` 类滚动文件。交付后才追加一行。

| 版本 | 日期 | 目标 | 关键交付 | 验收结论 | 遗留待办 |
|---|---|---|---|---|---|
| doc-restructure | 2026-10-11 | 退役 Loop Engineering 文档体系，对齐 personal-language-agent 文档范式 | 新版 AGENTS.md、docs/architecture.md、docs/prd/prd-v0.4.md、docs/decisions/README.md；删除 state/plans/loop 相关文档 | `npm run verify` 通过 | T010：cliff tarball 缺 LICENSE 全文，分发前需在上游仓库确认许可全文并补充归档（NOTICE.md 亦有记载） |
| v0.5 | 2026-10-11 | 修复 dogfood 问题 + Surface 聚焦 | fresh clone 可构建（scripts/vendor-prebuild.mjs + postinstall，4 处嵌入补丁真实应用）；doctor 诚实自检补丁标记；scan 默认排除测试文件（--include-tests 打开）；README/architecture 规则表同步 6 条 + verify 规则数一致性检查；relevance UI 上下文关键词降权（auth/payment/refund）；explain 术语人话解释 + learn 联动；删除 VSCode 插件；CLI 薄壳 frozen（architecture Surface 策略节） | `npm run verify` 通过；`npx tsx evals/run.ts` 与基线一致（precision/recall 100%、unknown 零泄漏） | T010 延续：cliff tarball 缺 LICENSE 全文，分发前需在上游仓库确认许可全文并补充归档（NOTICE.md 亦有记载） |
| v0.6 | 2026-10-11 | "讲懂"地基：M1 引擎抽象 → M2 链路摘要 9 环 → M3 学习闭环接链路 | M1 新增 `packages/analyzer` Analyzer 接口 + 语言注册表，engine 改依赖接口（零行为变化）；M2 新增 `packages/links` 构建每条变更入口的 9 环链路摘要（入口/参数校验/调用链/分支异常/数据读触读写/副作用/事务边界/返回/为什么），CLI scan 与 MCP review presentation 呈现，schema 加可选字段；M3 `xray learn --concept` 从链路认领概念级学习卡、`xray debt` 增加链路出现次数；`docs/vision.md` 落盘 + README 新定位 + architecture 引擎分层更新 | `npm run verify` 通过；`npx tsx evals/run.ts` 与基线一致（precision/recall 100%、unknown 零泄漏）；新增 tests/links.test.ts 覆盖 9 环/跨文件链路/读写区分/认领 | R4：交付后需在用户真实项目跑两周验证"讲没讲懂"；personal-language-agent（TS）记为多语言 dogfood 候选（等 TS 支持）；多语言本迭代只做接口未接 tree-sitter；"为什么这样写"仅推测、意图仍 unknown |
