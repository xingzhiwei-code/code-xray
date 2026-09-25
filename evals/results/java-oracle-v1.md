# Rule eval — frozen oracle v1 (evals/java/oracle.md)

- 运行：2026-09-25T09:47:24.841Z；analyzer java-cst@0.1.0（parser 3.0.1）
- 输入：36 个 fixture 文件（含 demo/orders 5 文件与 support 1 文件，不参与计分）
- 计分规则（AC03）：precision/recall 仅在已知标签（每规则 4 正 + 4 负）上计算；unknown 单列，不计入分母。

| 规则 | TP | FP | FN | 已知分母 | precision | recall | unknown 清洁 |
|---|---|---|---|---|---|---|---|
| TX_SELF_INVOCATION | 4 | 0 | 0 | 8 | 100.0% | 100.0% | 2/2 |
| JPA_CALL_IN_LOOP | 4 | 0 | 0 | 8 | 100.0% | 100.0% | 2/2 |
| WEB_ENTITY_RELATION | 4 | 0 | 0 | 8 | 100.0% | 100.0% | 2/2 |

## 逐案结果

| 案例 | 标签 | 触发 | unknown 可见 | 判定 |
|---|---|---|---|---|
| tx-unqualified | positive | 是 | — | TP |
| tx-this | positive | 是 | — | TP |
| tx-fqn | positive | 是 | — | TP |
| tx-two-args | positive | 是 | — | TP |
| tx-no-annotation | negative | 否 | — | correct-negative |
| tx-other-receiver | negative | 否 | 是 | correct-negative |
| tx-custom-annotation | negative | 否 | — | correct-negative |
| tx-string-comment | negative | 否 | 是 | correct-negative |
| tx-star-import | unknown | 否 | 是 | unknown-clean |
| tx-overload | unknown | 否 | 是 | unknown-clean |
| loop-for | positive | 是 | 是 | TP |
| loop-while | positive | 是 | 是 | TP |
| loop-do | positive | 是 | 是 | TP |
| loop-this | positive | 是 | 是 | TP |
| loop-outside | negative | 否 | 是 | correct-negative |
| loop-plain-type | negative | 否 | 是 | correct-negative |
| loop-string | negative | 否 | 是 | correct-negative |
| loop-shadowed | negative | 否 | 是 | correct-negative |
| loop-external | unknown | 否 | 是 | unknown-clean |
| loop-lambda | unknown | 否 | 是 | unknown-clean |
| web-direct | positive | 是 | — | TP |
| web-list | positive | 是 | — | TP |
| web-response | positive | 是 | 是 | TP |
| web-controller-body | positive | 是 | — | TP |
| web-dto | negative | 否 | — | correct-negative |
| web-no-relation | negative | 否 | — | correct-negative |
| web-no-mapping | negative | 否 | — | correct-negative |
| web-html | negative | 否 | — | correct-negative |
| web-external | unknown | 否 | 是 | unknown-clean |
| web-star-entity | unknown | 否 | 是 | unknown-clean |

阈值：precision ≥ 90%、recall ≥ 80%（AC03）；unknown 泄漏或不可见即失败。
结果：**通过**。

限制：本评估仅覆盖冻结 fixture 的语法适用性标签，不外推到任意真实项目（AC03 原文约束）；TP/FP/FN 是规则触发与冻结标签的对照，不是运行时缺陷证明。
