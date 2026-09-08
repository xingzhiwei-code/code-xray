/**
 * Rule evaluation harness — runs the analyzer over the frozen fixture set and
 * scores it against the labels frozen in evals/java/oracle.md (v1, 2026-09-08).
 *
 * Scoring follows AC03: precision/recall are computed over the KNOWN labels
 * only (4 positives + 4 negatives per rule); unknown cases are excluded from
 * both denominator and numerator and reported separately. An unknown case
 * reported as a finding fails its boundary check; an unknown case without a
 * visible unknown/unresolved diagnostic fails visibility.
 *
 * Run: npx tsx evals/run.ts   (exit 0 = thresholds met, 1 = not met)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { analyzeJava, JAVA_ANALYZER_VERSION, type JavaSourceFile } from '../packages/analyzer-java/index.js';

type Label = 'positive' | 'negative' | 'unknown';
type RuleId = 'TX_SELF_INVOCATION' | 'JPA_CALL_IN_LOOP' | 'WEB_ENTITY_RELATION';
interface Case { id: string; rule: RuleId; label: Label; file: string }

// Mirrors the frozen table in evals/java/oracle.md. Labels stay fixed even if
// the implementation fails — that is the point of a frozen oracle.
const PREFIX_RULE: Record<string, RuleId> = { tx: 'TX_SELF_INVOCATION', loop: 'JPA_CALL_IN_LOOP', web: 'WEB_ENTITY_RELATION' };
const CASES: Case[] = ([
  ['tx-unqualified', 'positive'], ['tx-this', 'positive'], ['tx-fqn', 'positive'], ['tx-two-args', 'positive'],
  ['tx-no-annotation', 'negative'], ['tx-other-receiver', 'negative'], ['tx-custom-annotation', 'negative'], ['tx-string-comment', 'negative'],
  ['tx-star-import', 'unknown'], ['tx-overload', 'unknown'],
  ['loop-for', 'positive'], ['loop-while', 'positive'], ['loop-do', 'positive'], ['loop-this', 'positive'],
  ['loop-outside', 'negative'], ['loop-plain-type', 'negative'], ['loop-string', 'negative'], ['loop-shadowed', 'negative'],
  ['loop-external', 'unknown'], ['loop-lambda', 'unknown'],
  ['web-direct', 'positive'], ['web-list', 'positive'], ['web-response', 'positive'], ['web-controller-body', 'positive'],
  ['web-dto', 'negative'], ['web-no-relation', 'negative'], ['web-no-mapping', 'negative'], ['web-html', 'negative'],
  ['web-external', 'unknown'], ['web-star-entity', 'unknown'],
] as [string, Label][]).map(([id, label]) => {
  const prefix = id.split('-')[0] as keyof typeof PREFIX_RULE;
  const [, ...rest] = id.split('-');
  const file = ['Tx', 'Loop', 'Web'].includes(prefix[0].toUpperCase() + prefix.slice(1) + '')
    ? `${prefix === 'tx' ? 'Tx' : prefix === 'loop' ? 'Loop' : 'Web'}${rest.map(p => p[0].toUpperCase() + p.slice(1)).join('')}Case.java`
    : '';
  return { id, rule: PREFIX_RULE[prefix], label, file };
});

const ROOT = 'fixtures/java-spring-jpa/src/main/java';

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'en'))) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.java')) out.push(full);
  }
}

const paths: string[] = [];
collect(ROOT, paths);
const files: JavaSourceFile[] = paths.map(path => {
  const content = readFileSync(path, 'utf8');
  return { path: relative(ROOT, path).split('\\').join('/'), content, digest: createHash('sha256').update(content).digest('hex') };
});

const result = await analyzeJava(files);

// A finding belongs to a case file when any of its evidence points there.
const findingsByFile = new Map<string, string[]>();
for (const finding of result.findings) {
  for (const id of finding.evidenceIds) {
    const evidence = result.evidence.find(e => e.id === id);
    if (evidence) findingsByFile.set(evidence.path, [...(findingsByFile.get(evidence.path) ?? []), finding.ruleId]);
  }
}
const diagnosticsByFile = new Map<string, string[]>();
for (const diagnostic of result.diagnostics)
  diagnosticsByFile.set(diagnostic.path, [...(diagnosticsByFile.get(diagnostic.path) ?? []), diagnostic.code]);

interface Row { id: string; label: Label; fired: boolean; unknownReported: boolean; verdict: 'TP' | 'FP' | 'FN' | 'correct-negative' | 'unknown-clean' | 'unknown-leak' | 'unknown-invisible' }
const rows: Row[] = CASES.map(c => {
  const fired = (findingsByFile.get(`demo/${c.rule === 'TX_SELF_INVOCATION' ? 'tx' : c.rule === 'JPA_CALL_IN_LOOP' ? 'loop' : 'web'}/${c.file}`) ?? []).includes(c.rule);
  const casePath = `demo/${c.rule === 'TX_SELF_INVOCATION' ? 'tx' : c.rule === 'JPA_CALL_IN_LOOP' ? 'loop' : 'web'}/${c.file}`;
  const unknownReported = (diagnosticsByFile.get(casePath) ?? []).some(code => /UNKNOWN|UNRESOLVED/.test(code));
  let verdict: Row['verdict'];
  if (c.label === 'positive') verdict = fired ? 'TP' : 'FN';
  else if (c.label === 'negative') verdict = fired ? 'FP' : 'correct-negative';
  else verdict = fired ? 'unknown-leak' : unknownReported ? 'unknown-clean' : 'unknown-invisible';
  return { id: c.id, label: c.label, fired, unknownReported, verdict };
});

const RULES: RuleId[] = ['TX_SELF_INVOCATION', 'JPA_CALL_IN_LOOP', 'WEB_ENTITY_RELATION'];
const lines: string[] = [];
lines.push('# Rule eval — frozen oracle v1 (evals/java/oracle.md)');
lines.push('');
lines.push(`- 运行：${new Date().toISOString()}；analyzer ${result.analyzerId}@${result.analyzerVersion}（parser ${result.parserVersion}）`);
lines.push(`- 输入：${files.length} 个 fixture 文件（含 demo/orders 5 文件与 support 1 文件，不参与计分）`);
lines.push('- 计分规则（AC03）：precision/recall 仅在已知标签（每规则 4 正 + 4 负）上计算；unknown 单列，不计入分母。');
lines.push('');
lines.push('| 规则 | TP | FP | FN | 已知分母 | precision | recall | unknown 清洁 |');
lines.push('|---|---|---|---|---|---|---|---|');
let allPass = true;
const failures: string[] = [];
for (const rule of RULES) {
  const ruleRows = rows.filter((_, i) => CASES[i].rule === rule);
  const tp = ruleRows.filter(r => r.verdict === 'TP').length;
  const fp = ruleRows.filter(r => r.verdict === 'FP').length;
  const fn = ruleRows.filter(r => r.verdict === 'FN').length;
  const known = tp + fp + fn + ruleRows.filter(r => r.verdict === 'correct-negative').length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const unknownClean = ruleRows.filter(r => r.verdict === 'unknown-clean').length;
  const pass = precision >= 0.9 && recall >= 0.8 && ruleRows.every(r => r.verdict !== 'unknown-leak' && r.verdict !== 'unknown-invisible');
  if (!pass) allPass = false;
  lines.push(`| ${rule} | ${tp} | ${fp} | ${fn} | ${known} | ${(precision * 100).toFixed(1)}% | ${(recall * 100).toFixed(1)}% | ${unknownClean}/2${pass ? '' : ' ❌'} |`);
  for (const row of ruleRows) {
    if (row.verdict === 'FP' || row.verdict === 'FN' || row.verdict === 'unknown-leak' || row.verdict === 'unknown-invisible')
      failures.push(`${rule}/${row.id}: ${row.verdict}`);
  }
}
lines.push('');
lines.push('## 逐案结果');
lines.push('');
lines.push('| 案例 | 标签 | 触发 | unknown 可见 | 判定 |');
lines.push('|---|---|---|---|---|');
for (const row of rows)
  lines.push(`| ${row.id} | ${row.label} | ${row.fired ? '是' : '否'} | ${row.unknownReported ? '是' : '—'} | ${row.verdict} |`);
lines.push('');
lines.push(`阈值：precision ≥ 90%、recall ≥ 80%（AC03）；unknown 泄漏或不可见即失败。`);
lines.push(allPass ? '结果：**通过**。' : `结果：**未通过** —— ${failures.join('；')}`);
lines.push('');
lines.push('限制：本评估仅覆盖冻结 fixture 的语法适用性标签，不外推到任意真实项目（AC03 原文约束）；TP/FP/FN 是规则触发与冻结标签的对照，不是运行时缺陷证明。');

const report = lines.join('\n');
mkdirSync('evals/results', { recursive: true });
const outFile = 'evals/results/java-oracle-v1.md';
writeFileSync(outFile, report + '\n');
process.stdout.write(report + '\n');
process.stdout.write(`\n报告已写入 ${outFile}\n`);
process.exit(allPass ? 0 : 1);
