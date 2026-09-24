/**
 * Phase 1 baseline capture (Review Insight Layer v0.2 plan, §22 Phase 1).
 *
 * Runs the CURRENT (v0.1) review pipeline over a synthetic workspace that
 * reproduces the known information-quality problems:
 *   - one concept (jpa.query-amplification) with 10 findings
 *     → 10 near-identical per-finding suggestedChecks (finding dump);
 *   - cognitive debt accumulating linearly per binding (12 bindings × 2.0).
 *
 * The captured ReviewRecord JSON is sanitized of volatile identifiers and
 * written to tests/fixtures/review-insight-v0.1-before.json as the permanent
 * "before" evidence. Run with:  npx tsx scripts/capture-insight-baseline.ts
 *
 * NOTE: run this BEFORE changing review/debt behavior; after the v0.2
 * refactor this script reproduces the NEW output instead (the committed
 * v0.1 fixture stays as the historical record).
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'tests/fixtures/review-insight-v0.1-before.json';

const dataDir = mkdtempSync(join(tmpdir(), 'xray-baseline-data-'));
process.env.XRAY_DATA_DIR = dataDir;

const { startReview, finishReview } = await import('../apps/agent/host/bridge.js');

const wsRoot = mkdtempSync(join(tmpdir(), 'xray-baseline-ws-'));
const workspace = join(wsRoot, 'proj');
mkdirSync(workspace, { recursive: true });

// Baseline state: repository + entity only — zero findings.
writeFileSync(join(workspace, 'Demo.java'), 'package demo;\npublic class Demo {}\n');
writeFileSync(join(workspace, 'DemoRepository.java'), [
  'package demo;',
  'import org.springframework.data.jpa.repository.JpaRepository;',
  'public interface DemoRepository extends JpaRepository<Demo, Long> {}',
  '',
].join('\n'));

const start = await startReview(workspace);

// "Agent edits": 10 loop-call methods in one service → 10 findings sharing
// the concept jpa.query-amplification; plus one @Transactional self-invocation.
const methods: string[] = [];
for (let i = 1; i <= 10; i++) {
  methods.push(`    public void process${i}(java.util.List<Demo> items) {
        for (Demo item : items) {
            repository.save(item);
        }
    }`);
}
writeFileSync(join(workspace, 'BatchService.java'), [
  'package demo;',
  'import org.springframework.stereotype.Service;',
  '@Service',
  'public class BatchService {',
  '    private final DemoRepository repository;',
  '    public BatchService(DemoRepository repository) { this.repository = repository; }',
  ...methods,
  '}',
  '',
].join('\n'));
writeFileSync(join(workspace, 'TxService.java'), [
  'package demo;',
  'import org.springframework.stereotype.Service;',
  'import org.springframework.transaction.annotation.Transactional;',
  '@Service',
  'public class TxService {',
  '    public void submit(String payload) { this.save(payload); }',
  '    @Transactional',
  '    public void save(String payload) { }',
  '}',
  '',
].join('\n'));

const finished = await finishReview(workspace, start.sessionId);

// Sanitize volatile identifiers; content-addressed snapshot ids stay (deterministic).
const record = JSON.parse(JSON.stringify(finished.record));
record.workspaceId = '<workspaceId>';
record.analysisId = '<analysisId>';
record.reviewId = '<reviewId>';
record.target.createdAt = '<createdAt>';

const payload = {
  _note: 'Review Insight Layer v0.2 计划 Phase 1 基线捕获：v0.1 review_finish 真实输出（易变标识符已替换为占位符）。问题特征：同 concept 10 findings → 10 条近似 suggestedChecks；债务按 binding 线性累计（12 × 2.0 = 24.0）。',
  _capturedFrom: 'scripts/capture-insight-baseline.ts (v0.1 pipeline)',
  _volatileFieldsReplaced: ['workspaceId', 'analysisId', 'reviewId', 'target.createdAt'],
  reused: finished.reused,
  stale: finished.stale,
  record,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
const out = record.output;
console.log(`captured → ${OUT}`);
console.log(`findings: new=${out.newFindingIds.length} continuing=${out.continuingFindingIds.length} removed=${out.removedFindingIds.length}`);
console.log(`suggestedChecks: ${out.suggestedChecks.length}; conceptRefs: ${out.conceptRefs.length}`);
console.log(`debtDelta: ${JSON.stringify(out.debtDelta)}`);
console.log(`gate: ${finished.record.gate.state}; reasons=${finished.record.gate.reasons.length}`);
