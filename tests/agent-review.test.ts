/**
 * T301b: review session contract tests — the post-change review loop that
 * v0.4 exists for. Covers: baseline capture, structured review output,
 * content-addressed idempotent reviewId, staleness downgrade (old conclusions
 * never masquerade as new), gate semantics (partial/unknown never pass,
 * blocking only under explicit enforce policy), and cross-process re-read
 * (V04-3: no reliance on private chat memory).
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentProcess, callTool, FIXTURE_SRC } from './agent-helpers.js';

const FIXTURE = resolve('fixtures/java-spring-jpa');

/** Mutable copy of the frozen fixture so tests can simulate an agent editing code. */
function makeWorkCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xray-review-ws-'));
  const target = join(dir, 'proj');
  mkdirSync(target, { recursive: true });
  // A tiny hand-written workspace keeps review loops fast and assertions sharp.
  writeFileSync(join(target, 'DemoService.java'), [
    'package demo;',
    'import org.springframework.stereotype.Service;',
    'import org.springframework.transaction.annotation.Transactional;',
    '@Service',
    'public class DemoService {',
    '    private final DemoRepository repository;',
    '    public DemoService(DemoRepository repository) { this.repository = repository; }',
    '    @Transactional',
    '    public void outer(String id) { inner(id); }',
    '    @Transactional',
    '    public void inner(String id) { repository.save(id); }',
    '}',
    '',
  ].join('\n'));
  writeFileSync(join(target, 'DemoRepository.java'), [
    'package demo;',
    'import org.springframework.data.jpa.repository.JpaRepository;',
    'public interface DemoRepository extends JpaRepository<Demo, Long> {}',
    '',
  ].join('\n'));
  return target;
}

describe('T301b: review session lifecycle', () => {
  let agent: AgentProcess;
  let workspace: string;
  beforeAll(async () => {
    agent = new AgentProcess();
    await agent.initialize();
    workspace = makeWorkCopy();
  });
  afterAll(async () => {
    await agent?.close();
    if (workspace) rmSync(resolve(workspace, '..'), { recursive: true, force: true });
  });

  it('review_start captures the baseline, review_finish returns a structured review with gate', async () => {
    const start = await callTool(agent, 'r1', 'xray_review_start', { path: workspace });
    expect(start.status).toBe('ok');
    expect(start.data.sessionId).toMatch(/^revs_[0-9a-f]{32}$/);
    expect(start.data.fileCount).toBe(2);

    // The agent "modifies code": introduce a JPA call inside a loop.
    writeFileSync(join(workspace, 'DemoBatch.java'), [
      'package demo;',
      'import java.util.List;',
      'public class DemoBatch {',
      '    private final DemoRepository repository;',
      '    public DemoBatch(DemoRepository repository) { this.repository = repository; }',
      '    public void runAll(List<Demo> items) {',
      '        for (Demo item : items) {',
      '            repository.save(item);',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n'));

    const finish = await callTool(agent, 'r2', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
    expect(finish.status).toBe('ok');
    expect(finish.data.reused).toBe(false);
    expect(finish.data.stale).toBe(false);
    const record = finish.data.record;
    expect(record.schemaVersion).toBe('0.2');
    expect(record.reviewId).toMatch(/^rev_[0-9a-f]{32}$/);
    expect(record.baseline.snapshotId).toBe(start.data.baselineSnapshotId);
    expect(record.target.snapshotId).not.toBe(record.baseline.snapshotId);
    expect(record.versions.surface).toBe('agent-mcp');
    expect(record.versions.ruleSetVersion).toBeTruthy();
    // The added file is visible in path impacts; the new loop finding drives the gate.
    expect(record.output.pathImpacts.added).toContain('DemoBatch.java');
    expect(record.output.newFindingIds.length).toBeGreaterThan(0);
    // v0.2 insight layer: concept-level aggregation with full drill-down.
    expect(record.output.insights.length).toBeGreaterThan(0);
    const loopInsight = record.output.insights.find((i: any) => i.conceptId === 'jpa.query-amplification');
    expect(loopInsight).toBeDefined();
    expect(loopInsight.changeType).toBe('new');
    expect(loopInsight.findingIds).toContain(record.output.newFindingIds[0]);
    expect(record.output.overview.newInsightCount).toBe(record.output.insights.filter((i: any) => i.changeType === 'new').length);
    expect(record.output.overview.newFindingCount).toBe(record.output.newFindingIds.length);
    expect(record.output.overview.filesChanged).toBe(1);
    expect(record.output.coverageSummary.status).toBe(record.reportStatus);
    expect(Array.isArray(record.output.resolvedInsights)).toBe(true);
    // v0.2: ONE primary suggested check per insight (not per finding), linked via insightId.
    expect(record.output.suggestedChecks.length).toBe(record.output.insights.length);
    for (const check of record.output.suggestedChecks)
      expect(record.output.insights.some((i: any) => i.id === check.insightId)).toBe(true);
    // Case 13: before/after/delta all live under ONE debt model version.
    expect(record.output.debtDelta.modelVersion).toBe('debt-model-v2');
    expect(record.output.debtDelta.conceptsAfter).toBeGreaterThan(0);
    expect(record.gate.state).toBe('needs_human');
    expect(record.gate.blocking).toBe(false); // report-only default
    // Phase 7: deterministic human-friendly first-screen rendering ships with the record.
    expect(finish.data.presentation).toContain('Code X-Ray Review（schema 0.2）');
    expect(finish.data.presentation).toContain('需要关注');
    expect(finish.data.presentation).toContain('JPA 循环内查询放大');
    expect(record.gate.reasons.length).toBeGreaterThan(0);
    // Full report was persisted and is recoverable by analysisId.
    expect(record.analysisId).toMatch(/^[0-9a-f-]{36}$/);
  }, 120_000);

  it('repeated finish on an unchanged snapshot is idempotent (same reviewId, reused=true)', async () => {
    const start = await callTool(agent, 'r3', 'xray_review_start', { path: workspace });
    const first = await callTool(agent, 'r4', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
    const second = await callTool(agent, 'r5', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    expect(second.data.record.reviewId).toBe(first.data.record.reviewId);
    expect(second.data.reused).toBe(true);
    expect(second.data.record.target.snapshotId).toBe(first.data.record.target.snapshotId);
  }, 120_000);

  it('a new change produces a NEW reviewId — old conclusions never masquerade as new', async () => {
    const before = await callTool(agent, 'r6', 'xray_review_start', { path: workspace });
    const prior = await callTool(agent, 'r7', 'xray_review_finish', { path: workspace, sessionId: before.data.sessionId });
    writeFileSync(join(workspace, 'DemoBatch.java'), readFileSync(join(workspace, 'DemoBatch.java'), 'utf8') + '\n// touched\n');
    const after = await callTool(agent, 'r8', 'xray_review_finish', { path: workspace, sessionId: before.data.sessionId });
    expect(after.data.record.reviewId).not.toBe(prior.data.record.reviewId);
    expect(after.data.record.target.snapshotId).not.toBe(prior.data.record.target.snapshotId);
  }, 120_000);

  it('review_read restores a persisted review and marks it stale after further edits', async () => {
    const start = await callTool(agent, 'r9', 'xray_review_start', { path: workspace });
    const finish = await callTool(agent, 'r10', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
    const reviewId = finish.data.record.reviewId;
    const fresh = await callTool(agent, 'r11', 'xray_review_read', { path: workspace, reviewId });
    expect(fresh.status).toBe('ok');
    expect(fresh.data.record.reviewId).toBe(reviewId);
    expect(fresh.data.stale).toBe(false);
    expect(fresh.data.presentation).toContain('Code X-Ray Review');
    expect(fresh.data.presentation).toBe(finish.data.presentation);

    writeFileSync(join(workspace, 'DemoBatch.java'), readFileSync(join(workspace, 'DemoBatch.java'), 'utf8') + '\n// touched again\n');
    const stale = await callTool(agent, 'r12', 'xray_review_read', { path: workspace, reviewId });
    expect(stale.data.stale).toBe(true);
    expect(stale.data.stalePaths).toContain('DemoBatch.java');
    // Stale reviews downgrade the gate: an old conclusion cannot claim completeness.
    expect(stale.data.record.gate.state).toBe('incomplete');
    expect(stale.data.record.gate.reasons.some((reason: string) => reason.includes('过期'))).toBe(true);
  }, 120_000);

  it('unknown sessions and missing reviews fail as domain errors, not fake results', async () => {
    const noSession = await callTool(agent, 'r13', 'xray_review_finish', { path: workspace, sessionId: 'revs_deadbeef' });
    expect(noSession.status).toBe('error');
    expect(noSession.error.code).toBe('NO_REVIEW_SESSION');
    const noReview = await callTool(agent, 'r14', 'xray_review_read', { path: workspace, reviewId: 'rev_deadbeef' });
    expect(noReview.status).toBe('error');
    expect(noReview.error.code).toBe('NO_REVIEW');
  });

  it('explain and summary reuse the shared learning/profile engines', async () => {
    const scan = await callTool(agent, 'r15', 'xray_scan', { path: FIXTURE });
    expect(scan.status).toBe('ok');
    const finding = scan.data.findings[0];
    const explain = await callTool(agent, 'r16', 'xray_explain', { path: FIXTURE, findingId: finding.id });
    expect(explain.status).toBe('ok');
    expect(explain.data.ruleId).toBe(finding.ruleId);
    expect(explain.data.assumptions.length).toBeGreaterThan(0);
    expect(explain.data.nextCheck).toBeTruthy();
    expect(['unassessed', 'to-learn', 'learning', 'self-reported', 'verified', 'stale', 'ignored']).toContain(explain.data.learning.status);

    const debt = await callTool(agent, 'r17', 'xray_summary', { path: FIXTURE, kind: 'debt' });
    expect(debt.status).toBe('ok');
    expect(debt.data.modelVersion).toBe('debt-model-v2');
    expect(debt.data.exposure.formula).toContain('log2');
    expect(debt.data.formula).toBeTruthy();
    const learning = await callTool(agent, 'r18', 'xray_summary', { path: FIXTURE, kind: 'learning' });
    expect(learning.data.total).toBeGreaterThan(0);
    expect(learning.data.note).toContain('不等于掌握');
    const profile = await callTool(agent, 'r19', 'xray_summary', { path: FIXTURE, kind: 'profile' });
    expect(profile.status).toBe('ok');
    expect(profile.data.items).toBeDefined();
    const badKind = await callTool(agent, 'r20', 'xray_summary', { path: FIXTURE, kind: 'skills' });
    expect(badKind.status).toBe('error');
    expect(badKind.error.code).toBe('INVALID_ARGUMENT');
  }, 180_000);
});

describe('T301b: gate policy is opt-in', () => {
  it('XRAY_AGENT_GATE=enforce makes non-pass gates blocking; default stays report-only', async () => {
    const workspace = makeWorkCopy();
    const agent = new AgentProcess({ XRAY_AGENT_GATE: 'enforce' });
    try {
      await agent.initialize();
      const caps = await callTool(agent, 'g1', 'xray_capabilities', {});
      expect(caps.data.gatePolicy).toBe('enforce');
      const start = await callTool(agent, 'g2', 'xray_review_start', { path: workspace });
      writeFileSync(join(workspace, 'Loop.java'), [
        'package demo;',
        'import java.util.List;',
        'public class Loop {',
        '    private final DemoRepository repository;',
        '    public Loop(DemoRepository repository) { this.repository = repository; }',
        '    public void each(List<Demo> items) { for (Demo d : items) { repository.save(d); } }',
        '}',
        '',
      ].join('\n'));
      const finish = await callTool(agent, 'g3', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
      expect(finish.data.record.gate.state).toBe('needs_human');
      expect(finish.data.record.gate.blocking).toBe(true);
      expect(finish.data.gatePolicy).toBe('enforce');
    } finally {
      await agent.close();
      rmSync(resolve(workspace, '..'), { recursive: true, force: true });
    }
  }, 120_000);

  it('a clean complete analysis with no findings passes the gate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xray-clean-'));
    writeFileSync(join(dir, 'Plain.java'), 'package demo;\npublic class Plain { public int add(int a, int b) { return a + b; } }\n');
    const agent = new AgentProcess();
    try {
      await agent.initialize();
      const start = await callTool(agent, 'c1', 'xray_review_start', { path: dir });
      const finish = await callTool(agent, 'c2', 'xray_review_finish', { path: dir, sessionId: start.data.sessionId });
      expect(finish.status).toBe('ok');
      expect(finish.data.record.gate.state).toBe('pass');
      expect(finish.data.record.gate.blocking).toBe(false);
      expect(finish.data.record.gate.reasons[0]).toContain('零发现不等于没有问题');
    } finally {
      await agent.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('T301b: cross-process review recovery (V04-3)', () => {
  it('a second server process re-reads the same review record without chat memory', async () => {
    const workspace = makeWorkCopy();
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-shared-data-'));
    const first = new AgentProcess({}, dataDir);
    const second = new AgentProcess({}, dataDir);
    try {
      await first.initialize('a');
      await second.initialize('b');
      const start = await callTool(first, 'x1', 'xray_review_start', { path: workspace });
      const finish = await callTool(first, 'x2', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
      const reviewId = finish.data.record.reviewId;
      const restored = await callTool(second, 'x3', 'xray_review_read', { path: workspace, reviewId });
      expect(restored.status).toBe('ok');
      expect(restored.data.record.reviewId).toBe(reviewId);
      expect(restored.data.record.target.snapshotId).toBe(finish.data.record.target.snapshotId);
      expect(restored.data.record.gate).toEqual(finish.data.record.gate);
      expect(restored.data.record.output.newFindingIds).toEqual(finish.data.record.output.newFindingIds);
    } finally {
      await first.close();
      await second.close();
      rmSync(resolve(workspace, '..'), { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180_000);
});
