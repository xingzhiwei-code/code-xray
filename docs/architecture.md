# 架构现状快照

Code X-Ray 是本地优先的 Java 代码理解工具：一个 Engine 服务多个 Surface，分析、规则、学习、债务与相关性判定都在 Engine 域内，Surface 只做适配与呈现。本文是当前实现快照，不含历史规划。

## 1. 引擎分层

```text
apps/（Surface，只做适配与呈现）
  cli         CLI 入口（cliff 驱动的命令 + 终端 presenter）
  agent       MCP server（本地 stdio，零网络）
  vscode      VS Code 扩展
        │ 通过 protocol + engine facade 调用
packages/engine            facade：analyze / analyzeWithBaseline / capabilities、规则调度、报告装配
        │ 通过各自 ports 调用
packages/
  protocol                 canonical schema（JSON Schema 校验，版本化）
  analyzer-java            Java CST 分析器（语法级，无类型系统）
  workspace-local          受限文件读取、内容摘要、Git baseline
  storage-local            本地持久化、迁移、缓存
  learning                 学习卡与知识状态
  insights                 Review Insight Layer：概念聚合、审查装配、gate、presentation
  relevance                Relevance Gate：确定性 SKIP/LIGHT/FULL 判定
  developer-profile        本机开发者画像
  explanation-providers    可选 LLM 增强（默认禁用）
```

强制依赖方向：Surface → facade / Protocol；Engine → 自研 ports；infrastructure 实现 ports。Engine 与 Protocol 不得 import cliff、VS Code API 或 provider SDK。

## 2. 三条规则

| 规则 | 触发形态 | 输出语义 |
|---|---|---|
| TX_SELF_INVOCATION | 同类内部调用本类 @Transactional 方法 | 代理边界检查点——不宣称事务必然失效 |
| JPA_CALL_IN_LOOP | 循环体内调用 Spring Data Repository 方法 | 查询放大形态——不宣称已确认 N+1 |
| WEB_ENTITY_RELATION | Web 端点声明返回带关系的 JPA 实体 | 序列化边界检查点——不宣称信息泄露 |

每条 finding 带可回源证据（path:line + 快照 digest）、成立前提、未知项与下一步检查建议。

## 3. MCP 工具（v0.4，9 个）

全部返回 `{schemaVersion,status,data|error}` envelope。

| 工具 | 用途 |
|---|---|
| `xray_capabilities` | 协议/引擎/规则版本、支持语言与静态分析边界 |
| `xray_relevance` | 确定性相关性门（无 LLM）：返回 skip/light/full |
| `xray_scan` | 分析工作区（可带 git base），报告按 analysisId 追溯 |
| `xray_evidence` | 按 evidenceId 回源读取源码片段（逐行脱敏） |
| `xray_review_start` | 修改前记录基线（含未提交内容） |
| `xray_review_finish` | 修改后生成结构化审查（schema 0.2） |
| `xray_review_read` | 按 reviewId 跨会话/跨宿主恢复审查记录 |
| `xray_explain` | 单条发现的前提/未知/下一步/学习卡状态（只读） |
| `xray_summary` | learning / debt / profile / relevance 摘要（只读） |

## 4. cliff 集成边界

- cliff 仅用于 CLI 表面（命令注册/解析/UI）；领域逻辑不进入 cliff，cliff 类型不进入领域协议。
- 复用边界：`cliff command/parser/UI → CLI adapter + presenter → Protocol / Engine facade → analysis/evidence/learning/debt`。
- 默认零外发：不向 cliff 传 version 触发更新检查，不扫描被分析仓库的 plugin/config；配置用 Code X-Ray 自己经 schema 校验的 JSON。
- 许可状态：tarball 缺独立 LICENSE 全文，分发前需在上游仓库确认（见 NOTICE.md 与 development-milestones.md 的 T010）。

## 5. 能力边界

- 仅分析 `.java` 源码（CST 语法级，无类型系统）：顶层 class/interface；record/enum/嵌套类不做框架规则。
- 注解需显式 import 或全限定名解析；通配导入、同名重载、Lambda 延迟执行、外部接收者一律标 unknown。
- diff 需要显式 `--base`；非 Git 目录 scan 可用、diff 不可用。
- 静态分析不宣称已证明完整运行行为；`complete` 只表示在声明输入与支持范围内完成分析。
- 完整能力矩阵见 `xray scan --format json` 的 provenance/limitations 与引擎 capabilities 导出；支持说明见 [docs/SUPPORT.md](SUPPORT.md)。
