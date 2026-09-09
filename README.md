# Code X-Ray

本地优先的 Java 代码理解工具：帮助依赖 AI 开发的工程师理解**当前变更**、静态可见的调用路径、潜在风险与自己的知识缺口。默认完全离线；结论可回源到代码证据；学习与认知债务状态保存在本机。

## 安装与运行

要求：Node.js ≥ 22.12、git（diff 功能需要）。

```bash
npm install          # 安装依赖（vendored cliff 见 NOTICE.md）
npm run build        # 构建 dist/cli.js
./dist/cli.js scan fixtures/java-spring-jpa   # 试运行（内置示例项目）
```

常用命令：

```bash
xray                       # 等价于 xray scan .
xray scan <路径>           # 扫描并输出有证据的摘要（默认含未跟踪文件）
xray scan <路径> --base HEAD   # 对照 Git 基线的变更摘要（新增/持续/移除发现）
xray scan <路径> --format json # 结构化完整报告（stdout 纯净 JSON，stderr 分离）
xray explain [编号]        # 单条发现的完整上下文：证据/前提/未知/下一步
xray learn [编号] [子命令] # 学习卡与知识状态（status/answer/ignore/restore/rebind/delete）
xray debt                  # 透明的认知债务模型（因子/权重/去重全部可见）
xray profile [show|init|update] # 本机开发者画像（角色/语言/框架/工程能力）
xray doctor                # 环境与本地数据状态
```

无参数、无 API key、断网状态下以上离线功能全部可用。

## 三条规则（v0.1）

| 规则 | 触发形态 | 输出语义 |
|---|---|---|
| TX_SELF_INVOCATION | 同类内部调用本类 @Transactional 方法 | 代理边界检查点——不宣称事务必然失效 |
| JPA_CALL_IN_LOOP | 循环体内调用 Spring Data Repository 方法 | 查询放大形态——不宣称已确认 N+1 |
| WEB_ENTITY_RELATION | Web 端点声明返回带关系的 JPA 实体 | 序列化边界检查点——不宣称信息泄露 |

每条 finding 都带：可回源证据（path:line 与快照 digest 绑定）、成立前提（assumptions）、未知项（uncertainties）、下一步检查建议。**零发现不等于安全**；unknown 一律显式报告，不计入正确率。

在冻结评估集上（`evals/java/oracle.md`，30 案例）三条规则 precision/recall 均 100%，unknown 案例零泄漏（`evals/results/java-oracle-v1.md`）。该结果不外推到任意真实项目。

## 隐私

- 默认零外发、零遥测、无账号、无模型密钥（集成测试断言网络全拒绝下运行）。
- 不执行被扫描项目的任何命令/插件/构建；敏感文件名与疑似凭据内容自动排除且排除原因可见。
- 本地数据（报告/学习状态）保存在用户数据目录，按工作区隔离，可删除。
- 开发者画像保存在用户数据目录的 `developer/profile.json`，与项目学习状态分离；默认不写入项目、不进入 Git。
- LLM 增强解释仅在显式设置 `XRAY_PROVIDER_URL/KEY/MODEL` 时启用；启用后仅发送概念与确定性卡片内容，**不发送源码、路径或证据**；任何失败自动回退到确定性输出。

## 支持范围与限制

- 仅分析 `.java` 源码（CST 语法级，无类型系统）：顶层 class/interface；record/enum/嵌套类不做框架规则。
- 注解需显式 import 或全限定名解析；通配导入、同名重载、Lambda 延迟执行、外部接收者一律标记 unknown，不猜测。
- diff 需要显式 `--base`；非 Git 目录 scan 可用、diff 不可用。
- 完整能力矩阵见 `xray scan --format json` 的 provenance/limitations 与引擎 `capabilities` 导出；支持说明见 [docs/SUPPORT.md](docs/SUPPORT.md)。

## 开发

本项目按 Loop Engineering 协议开发：状态与证据在 `docs/state/`，入口见 [AGENTS.md](AGENTS.md) 与 [docs/START_HERE.md](docs/START_HERE.md)。

```bash
npm run verify    # check + test + build
npx tsx evals/run.ts   # 规则评估（冻结 oracle）
npx tsx evals/bench.ts # AC12 性能基准
```
