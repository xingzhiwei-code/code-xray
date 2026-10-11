/**
 * Rule-count consistency check (A4).
 *
 * The implementation's rule list (packages/analyzer-java/index.ts `JAVA_RULES`)
 * must match the rule table in README.md. A drift in either direction fails
 * `npm run verify` so the docs can never silently fall behind the engine (or
 * claim rules the engine does not implement).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const analyzer = readFileSync(join(ROOT, 'packages', 'analyzer-java', 'index.ts'), 'utf8');
const match = analyzer.match(/JAVA_RULES = \[([\s\S]*?)\]\s*as const/);
if (!match) {
  console.error('check-rule-count: 无法从 packages/analyzer-java/index.ts 提取 JAVA_RULES。');
  process.exit(1);
}
const implRules = [...match[1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]).sort();

const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
// Rule IDs in the README rules table are ALL-CAPS identifiers (TX_/JPA_/WEB_/SPRING_/TRANSACTION_/…).
// Tool/command names (xray_*, lowercase) and dependency names never match this shape.
const docRules = [...readme.matchAll(/^\|\s*([A-Z][A-Z_]+)\s*\|/gm)].map(m => m[1]);
const docRuleSet = [...new Set(docRules)].sort();

const implSet = new Set(implRules);
const docSet = new Set(docRuleSet);
const missingInDocs = implRules.filter(rule => !docSet.has(rule));
const extraInDocs = docRuleSet.filter(rule => !implSet.has(rule));

if (missingInDocs.length || extraInDocs.length) {
  const problems = [
    ...missingInDocs.map(rule => `README 规则表缺少实现规则 ${rule}`),
    ...extraInDocs.map(rule => `README 规则表存在实现未定义的规则 ${rule}`),
  ];
  console.error('check-rule-count: 实现与文档规则不一致 ——\n  ' + problems.join('\n  '));
  console.error(`  实现（${implRules.length} 条）：${implRules.join(', ')}`);
  console.error(`  README（${docRuleSet.length} 条）：${docRuleSet.join(', ')}`);
  process.exit(1);
}

console.log(`check-rule-count: 一致 —— 实现 ${implRules.length} 条 = README ${docRuleSet.length} 条（${implRules.join(', ')}）`);
