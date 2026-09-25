/**
 * Review Insight Layer v0.2 (T302): end-to-end acceptance through the real
 * MCP pipeline (plan §23). Scenario shape mirrors the acceptance target:
 *
 *   raw findings over several concepts
 *     → 1 new actionable insight (aggregating 1 new + 2 continuing findings)
 *     + 2 resolved insights (a deleted @Transactional file)
 *     + honest scoping (an untouched file's findings stay OUT of the diff)
 *
 * Before v0.2 this review would have produced 3 per-finding suggested checks
 * and no resolved/overview structure at all (see the committed v0.1 baseline
 * fixture tests/fixtures/review-insight-v0.1-before.json).
 */
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentProcess, callTool } from './agent-helpers.js';

function serviceWithLoops(name: string, methodCount: number): string {
  const methods = Array.from({ length: methodCount }, (_, i) => `    public void process${i + 1}(java.util.List<Demo> items) {
        for (Demo item : items) {
            repository.save(item);
        }
    }`).join('\n');
  return `package demo;
import org.springframework.stereotype.Service;
@Service
public class ${name} {
    private final DemoRepository repository;
    public ${name}(DemoRepository repository) { this.repository = repository; }
${methods}
}
`;
}

describe('T302 acceptance: raw findings → concepts → actionable insights (plan §23)', () => {
  let agent: AgentProcess;
  let workspace: string;
  beforeAll(async () => {
    agent = new AgentProcess();
    await agent.initialize();
    const dir = mkdtempSync(join(tmpdir(), 'xray-accept-'));
    workspace = join(dir, 'proj');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, 'Demo.java'), 'package demo;\npublic class Demo {}\n');
    writeFileSync(join(workspace, 'DemoRepository.java'), 'package demo;\nimport org.springframework.data.jpa.repository.JpaRepository;\npublic interface DemoRepository extends JpaRepository<Demo, Long> {}\n');
    writeFileSync(join(workspace, 'Batch.java'), serviceWithLoops('Batch', 2));
    // Never touched during the edit round: its finding must NOT enter the review diff.
    writeFileSync(join(workspace, 'Unchanged.java'), serviceWithLoops('Unchanged', 1).replace('process1', 'steady'));
    writeFileSync(join(workspace, 'TxA.java'), `package demo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class TxA {
    public void submit(String payload) { this.save(payload); }
    @Transactional
    public void save(String payload) { }
}
`);
  });
  afterAll(async () => {
    await agent?.close();
    if (workspace) rmSync(resolve(workspace, '..'), { recursive: true, force: true });
  });

  it('one review: 5 raw findings → 1 actionable insight + 2 resolved insights, one primary check', async () => {
    const start = await callTool(agent, 'a1', 'xray_review_start', { path: workspace });
    expect(start.status).toBe('ok');

    // The agent edits: extend Batch.java with a third loop, delete TxA.java.
    writeFileSync(join(workspace, 'Batch.java'), serviceWithLoops('Batch', 3));
    unlinkSync(join(workspace, 'TxA.java'));

    const finish = await callTool(agent, 'a2', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
    expect(finish.status).toBe('ok');
    const record = finish.data.record;
    expect(record.schemaVersion).toBe('0.2');
    const output = record.output;

    // --- facts: 1 new + 2 continuing loop findings; 2 tx findings resolved ---
    expect(output.overview.filesChanged).toBe(2); // Batch.java modified, TxA.java deleted
    expect(output.overview.newFindingCount).toBe(1);
    expect(output.overview.continuingFindingCount).toBe(2);
    expect(output.overview.resolvedFindingCount).toBe(2);

    // --- ONE actionable insight for the jpa concept (Case 1/2 semantics end-to-end) ---
    expect(output.insights).toHaveLength(1);
    const insight = output.insights[0];
    expect(insight.conceptId).toBe('jpa.query-amplification');
    expect(insight.changeType).toBe('new');
    expect(insight.newOccurrenceCount).toBe(1);
    expect(insight.continuingOccurrenceCount).toBe(2);
    expect(insight.occurrenceCount).toBe(3);
    expect(insight.knowledgeStatus).toBe('new-to-user'); // fresh data dir: no prior learning history
    expect(insight.findingIds).toHaveLength(3);
    // Honest scoping: the untouched file's finding is NOT part of the review diff.
    expect(insight.symbols.join(' ')).not.toContain('steady');
    // The primary action points at the NEW occurrence, not the first id in a list.
    expect(insight.nextAction).toContain('process3');

    // --- resolved concepts carry baseline-scoped evidence (Case 7) ---
    expect(output.resolvedInsights).toHaveLength(2);
    const resolvedConcepts = output.resolvedInsights.map((i: any) => i.conceptId).sort();
    expect(resolvedConcepts).toEqual(['spring.transaction-boundary', 'spring.transaction-proxy']);
    for (const resolved of output.resolvedInsights) {
      expect(resolved.changeType).toBe('resolved');
      expect(resolved.evidenceScope).toBe('baseline');
      expect(resolved.findingIds.length).toBeGreaterThan(0);
    }

    // --- noise reduction: ONE primary check per insight, not per finding ---
    expect(output.suggestedChecks).toHaveLength(1);
    expect(output.suggestedChecks[0].insightId).toBe(insight.id);
    expect(output.suggestedChecks.length).toBeLessThan(output.overview.newFindingCount + output.overview.continuingFindingCount);

    // --- debt v2 on both sides of the delta (Case 13) ---
    expect(output.debtDelta.modelVersion).toBe('debt-model-v2');
    expect(output.debtDelta.conceptsBefore).toBe(0);
    expect(output.debtDelta.conceptsAfter).toBe(1); // only the jpa concept has bindings after sync

    // --- gate stays honest ---
    expect(record.gate.state).toBe('needs_human');
    expect(record.gate.blocking).toBe(false);
    expect(record.gate.reasons.some((r: string) => r.includes('1 个新的风险概念'))).toBe(true);

    // --- presentation: acceptance-style first screen ---
    const presentation: string = finish.data.presentation;
    expect(presentation).toContain('新增 1 个风险概念');
    expect(presentation).toContain('2 个历史风险概念不再出现');
    expect(presentation).toContain('JPA 循环内查询放大');
    expect(presentation).toContain('建议确认：优先检查');

    // --- idempotency (Case 9) with identical presentation ---
    const again = await callTool(agent, 'a3', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
    expect(again.data.reused).toBe(true);
    expect(again.data.record.reviewId).toBe(record.reviewId);
    expect(again.data.presentation).toBe(presentation);
  }, 180_000);
});
