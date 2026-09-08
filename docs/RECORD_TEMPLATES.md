# 记录模板与证据机制

以下代码块是待复制的模板，不是已完成的记录。占位值在实际执行时替换；不得把模板中的字段值当作实测结果。

## 1. Task

```yaml
task_id: Txxx
title: 具体用户行为或必要能力
status: in_progress
owner: session-id
dependencies: [Txxx]
acceptance: [ACxx]
scope: 涉及哪些行为和路径
non_goals: 本轮明确不覆盖的内容
decisions: [Dxxx]
evidence: []
blocked_reason: null
unblock_action: null
checkpoint_revision: rN
```

## 2. Decision

```yaml
decision_id: Dxxx
status: proposed
date: ISO-8601
context: 具体问题及不可忽略的约束
options: 主要候选及取舍
decision: 采用的方案
reason: 选择依据
consequences: 代价、迁移和维护影响
evidence: [Exxx]
affects: [Txxx, ACxx]
supersedes: null
revisit_when: 新证据出现的条件
checkpoint_revision: rN
```

## 3. Evidence

两类 Evidence 必须分开：

- **产品证据**：分析结果中的代码引用/规则/推断依据，由 Engine 输出；Schema 见架构。
- **开发证据**：本项目为什么可以宣称某任务通过，由本文件规则与 EVIDENCE 索引记录。

```yaml
evidence_id: Exxx
kind: test | eval | ux_review | source_inspection | benchmark | handoff | documentation
claim: 本次记录支持的具体且有限的结论
task: Txxx
acceptance: [ACxx]
recorded_at: ISO-8601（含时区）
operator: session-id
subject_snapshot:
  base_commit: 实际SHA或not_initialized
  tracked_diff_sha256: 实际差异摘要或not_applicable
  untracked_manifest: 实际相关路径及内容hash
  relevant_inputs: 代码/fixture/配置/依赖锁文件的hash
environment: OS、运行时、依赖版本、必要且不含秘密的配置
working_directory: 仓库相对路径
invocation: 真实执行命令或可重做的人工步骤
expected: 改动前确定的预期与禁止出现的结果
actual: 实测摘要
exit_code: 实际值；非命令检查填not_applicable
result: passed | failed | blocked | not_run | cancelled
artifacts: 仓库相对产物路径及sha256
limitations: 没覆盖什么、环境差异、真实provider是否运行
review_mode: independent | self-separated | not_applicable
checker: reviewer/session或not_applicable
supersedes: null
checkpoint_revision: rN
```

输入快照只覆盖被验证的代码与输入，排除本轮状态文档自身，避免“写 Evidence 导致自己的 hash 失效”的循环。仅记录 git HEAD 不够：dirty diff 与相关未跟踪文件也必须可追溯。源码敏感时不直接附入报告，可记录本地受控产物和摘要；分享前明确脱敏。SHA256 证明内容身份，不能单独证明逻辑正确。

产物建议放入未来项目的 `artifacts/evidence/Exxx/`，保留脱敏日志、预期/实际比较、fixture manifest、终端转录或截图。产物是否提交按内容敏感性决定；跨机器未携带的文件必须登记 unavailable。截图仅证明呈现，不能单独证明分析正确；命令退出 0 也不能替代结果断言。

若检查只看输出、不运行命令，写清检查步骤、文件快照和检查者；不用虚构 exit_code。若日志过长可保存摘要和原始文件 hash，不在 CURRENT 填满日志。

EVIDENCE 记录不删除；发现错误、证据过期或结果被推翻时新增记录引用 supersedes，并在原条目标注“已更正，见 Exxx”。发布时按当前相关快照重新判定有效性。

## 4. Loop

```yaml
loop_id: Lxxx
task_id: Txxx
session: session-id
goal: 一个明确可验收目标
acceptance: [ACxx]
starting_snapshot: 代码/输入快照
plan: 最小实现、反例、验证和回退方式
changes: 实际行为和文件
evidence: [Exxx]
check_mode: independent | self-separated
check_result: 发现与解决状态
outcome: done | continue | blocked
reflection: 得到的新证据与修正
next_action: 对哪个文件或输入做哪个具体动作，预期得到什么
checkpoint_revision: rN
checkpoint_status: preparing | completed | recovery_required
```

## 5. CURRENT 与 HANDOFF 的必填差异

CURRENT 填：状态 schema/revision、checkpoint 状态、更新时间、阶段、活动 Task、owner/session、repo/branch/HEAD/dirty 快照、有效验证、阻塞、唯一下一步、required_reads。

HANDOFF 填：同一 revision、移交 session、当前 Loop/Task、已完成/未完成、未提交改动归属、最近尝试与失败、不要重复的路径、活动进程/外部任务、验证指针、恢复步骤与确切下一动作。

坏的下一步：“继续完善后端分析”。

好的下一步：“T006：在订单 fixture 中加入同类自调用的正/负例，验证事务提示只在已声明代理前提成立时出现；执行本仓库已有规则 eval 命令，记录实际输出和引用行号。”

## 6. Evidence 关口

任务进入 done 前逐项核对：AC 有对应 Evidence；运行对象就是当前相关快照；结果与预期比较过；必要独立检查存在；原始产物可取得；失败/未运行未被改名为 passed；报告承认覆盖限制。

发布汇总按 AC01—AC12 建立一行一项的映射。若同一条证据覆盖多项验收，要分别说明覆盖方式；不能用一条“全部测试通过”代替每项行为证据。
