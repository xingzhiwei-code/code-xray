# Code X-Ray Agent 入口

## 入口指针

先读 [README](README.md) 了解产品、运行方式与当前能力；再读 [docs/prd/](docs/prd/) 下最新版本 PRD 与 [docs/architecture.md](docs/architecture.md) 了解范围与架构现状。开工前先 `git status` 确认工作区状态。

## Loop Engineering 退役声明

Loop Engineering 协议及 `docs/state/` 滚动状态机制（CURRENT / HANDOFF / BACKLOG / EVIDENCE / LOOP_LOG 等）已退役。**禁止**再创建或更新任何 `state/` 类滚动文件。迭代状态只记录在根目录 [development-milestones.md](development-milestones.md)。

## 迭代工作流三件套

1. PRD 定稿冻结。
2. 按 PRD 开工。
3. 交付后在 [development-milestones.md](development-milestones.md) 追加一行，必要时新增 ADR 到 [docs/decisions/](docs/decisions/)。

无 PRD 不开工。

## 诚实条款

- 证据回源：每条结论绑定 `path:line` 与源码快照 digest；无定位信息的结论必须显示缺失原因，不伪造行号。
- unknown 显式报告，且不计入正确率。
- 零发现不等于安全。
- 默认离线、零外发、零遥测。
- 不执行被扫描项目的任何命令、插件或构建。

## 禁区指针

- `evals/` 为冻结评估基线，不可修改。
- `vendor/` 许可相关见 [NOTICE.md](NOTICE.md)。
