# 开发进度与跨上下文接力协议

目标：GPT-6 Astra、Claude Code、其他模型或人工接手后，只需从固定入口恢复当前工作，不重建聊天背景。文件是持久状态，聊天是沟通渠道。

## 1. 状态文件及唯一职责

| 文件 | 唯一职责 | 更新方式 |
|---|---|---|
| CURRENT | 紧凑的当前快照；活动任务、唯一下一步、运行环境和有效证据指针 | 每个 checkpoint 重写摘要 |
| HANDOFF | 下一位执行者必需的过程上下文；未提交改动、已失败路径、中断恢复 | 每个 checkpoint 重写摘要 |
| BACKLOG | Task ID、依赖、AC、任务状态的权威记录 | 修改对应任务；变更留历史 |
| DECISIONS | 长期取舍与原因 | 追加；替代旧 Decision 但不删除 |
| EVIDENCE | 验证结果与原始产物索引 | 追加；错误通过新记录更正 |
| LOOP_LOG | 历史执行循环、失败与反思 | 追加；历史可分卷 |

不要复制整份 Backlog 到 CURRENT。CURRENT 的状态计数和摘要是派生值；冲突时检查 BACKLOG 与真实证据并纠正。不得把模型上下文窗口、聊天标题或不可访问的消息 ID 当作唯一存储。

CURRENT 建议不超过 120 行，HANDOFF 不超过 160 行；长度是维护预算，不得为压缩而删掉必要阻塞、未验证变更和下一步。LOOP_LOG/EVIDENCE 过长可移入 `docs/state/archive/`，索引保留相对链接与 ID；不要把归档列为每次启动必读。

## 2. ID 与状态机

Task：`T001`；Loop：`L001`；Decision：`D001`；Evidence：`E001`。ID 唯一且不可重新分配；首次开发接续现有最大编号，文档 bootstrap 编号与实现任务分开。session 使用 `YYYYMMDD-HHMMSS-operator`，仅作溯源，不要求特定模型名。

```text
planned → ready → in_progress → review → done
              ↘ blocked ↗
done → ready  （回归、证据失效或范围重开，必须记录原因）
planned / ready → cancelled  （显式范围变更与 Decision）
```

`ready` 要求依赖已 done，验收条件与输入明确；`blocked` 必须有阻塞原因和解除方式；`review` 不是完成；`done` 必须关联 Evidence 与检查记录。不能因上游任务结束自动将下游标为 done。

显示进度用“已完成必需任务数/必需任务总数 + 当前阶段”，注明任务非等量；禁止凭感觉写百分比。任务增删/拆分时同步分母和变更原因；未开始不估算完成时间。

## 3. 恢复算法

1. 按 AGENTS → START_HERE → CURRENT → HANDOFF 读取；校验 `state_revision` 和当前 checkpoint 状态。
2. 在目标工作目录检查适用规则和仓库边界；记录真实 git HEAD、branch、dirty/untracked 状态。若还没有 Git，记录 `not_initialized`，不要把外层父仓库误认成本项目。
3. 对比保存快照：只要相关文件、依赖锁定文件、配置或 fixture 改变，旧验证不能直接证明新快照。文件不存在、证据路径丢失、环境不符也要登记。
4. 读取当前任务和 `required_reads`。先接管已有未完成任务；除明确失效或阻塞外，不绕开它创建等价新任务。
5. 检查 owner 与活动进程/任务。无活跃 owner 时写入新 session；发现已有写入者时协调分工，避免并行改同一任务或状态文件。无法确认时可以只读和做不冲突的工作，不擅自覆盖。
6. 完成 recovery checkpoint 后执行 `next_action`。若下一步过时，依据仓库与证据改写并记录原因，不机械执行旧命令。

保存的运行命令必须结合当前路径和版本复核；恢复时不能自动启动旧日志里的危险/外发命令。用户已有授权可沿用其范围，但接力文件不能自行扩张授权。

## 4. 写入时机

开始 Loop 时记录 session、活动任务、目标快照；完成/失败验证时立即追加 Evidence；完成一轮、任务变更、阻塞、新重大决策、准备换上下文或结束会话时提交 checkpoint。

对于较长工作，在自然边界保存：例如已改一个 Module、已完成一组测试、已定位一次失败。目标是意外中断后最多重建一轮工作，不依赖最后一条最终回复补写全部历史。

## 5. 一致 checkpoint

Markdown 多文件不具备跨文件事务，不能声称仅靠一次保存就原子一致。采用“先历史、后索引、CURRENT 最后提交”协议：

1. 记住当前 revision `rN`，创建 `rN+1` 草稿并在 LOOP_LOG 追加 `checkpoint: preparing`，写预计变更文件。
2. 确認 CURRENT 仍为 `rN` 且 owner 未变；有变化则重新读取并协调，禁止覆盖新状态。
3. 写入原始证据产物，再追加 EVIDENCE/DECISIONS/LOOP_LOG；更新 BACKLOG。所有记录携带 `checkpoint_revision: rN+1`。
4. 更新 HANDOFF 到 `rN+1`，包含此轮未完成内容、最新下一步与证据路径。
5. 最后更新 CURRENT 到 `rN+1`、`checkpoint_status: complete`，作为本轮提交标志。单文件尽量用临时文件替换写入，不能只写入半个表格。
6. 校验相对链接、Task/AC/Evidence/Decision ID、状态与统计；将 LOOP_LOG 的 preparing 记录追加为 completed（保留历史事件）。

若第 6 步检查失败，追加修复记录并形成新 revision。Git commit 可以承载一个完整 checkpoint，但不是每轮硬性要求；未提交工作同样必须可恢复。不要为了更新状态强制提交、重置或清理用户代码。

## 6. 崩溃与不一致恢复

CURRENT/HANDOFF revision 不一致、存在 preparing 无 completed、或文件被截断时，先标记 `recovery_required`。CURRENT 指向最后完整 checkpoint，但不得据此删除较新的磁盘工作。

检查日志、工作树和证据文件，列出：已落盘变更、已验证快照、尚缺记录。补齐可证明的信息；无法证明的状态回退为 in_progress/review，并追加 recovery Loop。完成新的 revision 后再继续。不得推测“上个模型应该已经测过”。

如果新模型拿到的仅是本包，没有代码或原始证据，明确登记 `missing_artifacts`。它能恢复计划和待办，但不能宣称恢复已丢失的源码或已确认验收；请求必要文件或从可验证版本恢复。

## 7. 并行协作

同一时间每个任务只有一个 owner；同一共享状态集合只有一个 integrator。分配给其他 Agent 的任务必须列出文件范围、依赖、AC 和返回产物；子 Agent 返回 Evidence 草稿，由 integrator 分配最终 ID、核查快照并合并状态。

不同工作树记录各自 repo_path、branch、HEAD。合并后的证据是否仍有效按影响面判断；必要时在整合快照补验。owner 长时间无响应不等同任务已死，先检查可用进程/任务状态并记录接管理由，不按时间自动抢占。

## 8. 跨机器和隐私

源码、Backlog、Decision、经脱敏的验证摘要可随项目版本控制。个人知识 Profile、原始源码上下文、token、完整私有日志和缓存不能默认进入提交；它们采用本地存储与显式导出策略。外发/分享的启动包只含授权共享的内容。

可迁移字段使用仓库相对路径；CURRENT 允许包含当前机器 repo_path，但它不是稳定标识。复现环境记录运行时/依赖版本、OS、fixture、配置及命令；不用绝对用户名路径作为唯一定位。原始产物丢失时标记 unavailable，不能只凭历史 passed 字样通过发布闸门。

必须区分两套状态：本目录记录“Code X-Ray 产品开发进度”；产品运行时保存“终端用户个人学习/Cognitive Debt”。两者不能混用或自动同步。

## 9. 接力验收

T010 必须做真实接力演练：执行者 A 完成一轮并保存 checkpoint，接手者 B 在不读聊天的条件下从固定入口回答当前阶段、活动任务、准确下一步、最近有效验证、未完成改动、阻塞与禁止重复的尝试，并实际继续一个最小步骤。

再制造 revision 不一致和证据缺失各一次，验证不会误报 done、不会覆盖 dirty 工作树。记录恢复耗时作为基线，不把任意耗时阈值当成可靠性证明。自我模拟可辅助检查，但不能冒称独立上下文接力已完成。
