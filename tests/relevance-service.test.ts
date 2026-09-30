/**
 * Relevance composition service tests (T303 Phase 4/6/7): decision log,
 * passive observation, false-skip fact signals and honest metrics — all
 * through the real LocalStore (same code path CLI and MCP bridge use).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from '../packages/engine/index.js';
import { LocalStore } from '../packages/storage-local/index.js';
import {
  evaluateRelevance, noteAnalysisAfterDecision, recordReportObservations, relevanceStats, taskFingerprint,
  type RelevanceLogEvent,
} from '../packages/relevance/service.js';
import { readContextFrom, emptyDeveloperContext, type StoredDeveloperData } from '../packages/developer-profile/engine.js';

const FIXTURE = 'fixtures/java-spring-jpa';
const NOW = '2026-09-30T12:00:00.000Z';
const WORK = join(process.cwd(), 'tests');

let dataDir: string;
let store: LocalStore;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'xray-relevance-service-'));
  store = new LocalStore({ dataDir });
});
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); });

async function context() {
  return readContextFrom(await store.readProfile<StoredDeveloperData>(emptyDeveloperContext()), NOW);
}

describe('evaluateRelevance (shared composition)', () => {
  it('decides skip for routine UI work and logs a bounded decision event without raw task text', async () => {
    const task = '给 React Button 增加 loading 状态';
    const { decision } = await evaluateRelevance(store, WORK, { task, changedFiles: ['src/Button.tsx', 'src/Button.css'] }, NOW);
    expect(decision.level).toBe('skip');
    const events = await store.readRelevanceEvents<RelevanceLogEvent>(WORK);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('decision');
    expect(events[0]!.level).toBe('skip');
    expect(events[0]!.fileCount).toBe(2);
    expect(events[0]!.taskFingerprint).toBe(taskFingerprint(task));
    // §20 privacy: raw task text never lands in the log.
    expect(JSON.stringify(events)).not.toContain('loading');
  });

  it('grows passive observations from repeated gate calls (§17), aggregate-only', async () => {
    for (let i = 0; i < 3; i++) {
      await evaluateRelevance(store, WORK, { changedFiles: [`src/c${i}/Cart.tsx`] }, new Date(Date.parse(NOW) + i * 1000).toISOString());
    }
    const ctx = await context();
    expect(ctx.observations['framework:react']!.count).toBe(3);
    expect(ctx.observations['language:typescript']!.count).toBe(3);
    expect(ctx.skills['framework:react']!.provenance).toBe('observed');
    // No per-file behavior log: file names never appear in the stored context.
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('Cart.tsx');
  });

  it('bootstraps to SKIP after sustained observed familiarity (Case A growth path)', async () => {
    // A brand-new developer with a non-routine frontend logic change starts at LIGHT…
    const cold = await evaluateRelevance(store, WORK, { task: '重构购物车组件的合计逻辑', changedFiles: ['src/cart/Cart.tsx'] }, NOW);
    expect(cold.decision.level).toBe('light');
    // …after repeated real usage the same class of task may skip (§13/§22).
    for (let i = 0; i < 5; i++) {
      await evaluateRelevance(store, WORK, { changedFiles: [`src/cart/p${i}.tsx`] }, new Date(Date.parse(NOW) + (i + 1) * 1000).toISOString());
    }
    const warm = await evaluateRelevance(store, WORK, { task: '重构购物车组件的合计逻辑', changedFiles: ['src/cart/Cart.tsx'] }, NOW);
    expect(warm.decision.level).toBe('skip');
  });
});

describe('false-skip fact signal (§24.3, §31.4)', () => {
  it('records a fact signal when analysis after a skip finds new risks — once, without duplication', async () => {
    await evaluateRelevance(store, WORK, { task: '按钮样式', changedFiles: ['src/a.css'] }, NOW);
    await noteAnalysisAfterDecision(store, WORK, { source: 'scan', newRiskCount: 2 }, NOW);
    await noteAnalysisAfterDecision(store, WORK, { source: 'scan', newRiskCount: 2 }, NOW); // second call: last event is the signal, not a skip decision
    const events = await store.readRelevanceEvents<RelevanceLogEvent>(WORK);
    expect(events.filter(e => e.type === 'false-skip-signal')).toHaveLength(1);
    expect(events.at(-1)!.fact).toContain('2 项新增风险');
  });

  it('stays silent when there is no preceding skip or no new risk', async () => {
    await noteAnalysisAfterDecision(store, WORK, { source: 'scan', newRiskCount: 5 }, NOW);
    expect(await store.readRelevanceEvents(WORK)).toHaveLength(0);
    await evaluateRelevance(store, WORK, { task: '修改订单支付状态流转', changedFiles: ['Pay.java'] }, NOW);
    await noteAnalysisAfterDecision(store, WORK, { source: 'review', newRiskCount: 3 }, NOW);
    const events = await store.readRelevanceEvents<RelevanceLogEvent>(WORK);
    expect(events.filter(e => e.type === 'false-skip-signal')).toHaveLength(0);
    await evaluateRelevance(store, WORK, { changedFiles: ['a.css'] }, NOW);
    await noteAnalysisAfterDecision(store, WORK, { source: 'scan', newRiskCount: 0 }, NOW);
    expect((await store.readRelevanceEvents<RelevanceLogEvent>(WORK)).filter(e => e.type === 'false-skip-signal')).toHaveLength(0);
  });
});

describe('relevanceStats (§24 metrics, honest)', () => {
  it('computes skip rate and false-skip rate over the retained local window', async () => {
    await evaluateRelevance(store, WORK, { changedFiles: ['a.css'] }, NOW);            // skip
    await evaluateRelevance(store, WORK, { changedFiles: ['b.css'] }, NOW);            // skip
    await evaluateRelevance(store, WORK, { task: '修改支付', changedFiles: ['P.java'] }, NOW); // full
    await noteAnalysisAfterDecision(store, WORK, { source: 'scan', newRiskCount: 0 }, NOW);
    const stats = await relevanceStats(store, WORK);
    expect(stats.totalDecisions).toBe(3);
    expect(stats.skip).toBe(2);
    expect(stats.full).toBe(1);
    expect(stats.skipRate).toBe(0.67);
    expect(stats.falseSkipSignals).toBe(0);
    expect(stats.falseSkipRate).toBe(0);
    expect(stats.note).toContain('v1 不做估算');
  });
});

describe('recordReportObservations (scan/review passive growth)', () => {
  it('observes java/spring/jpa only from report facts', async () => {
    const report = await analyze({ path: FIXTURE });
    await recordReportObservations(store, report, NOW);
    const ctx = await context();
    expect(ctx.observations['language:java']!.count).toBe(1);
    expect(ctx.observations['framework:spring']!.count).toBe(1);
    expect(ctx.observations['framework:jpa']!.count).toBe(1);
    expect(ctx.skills['framework:spring']!.provenance).toBe('observed');
  });
});

describe('storage lifecycle', () => {
  it('relevance log is workspace-isolated, bounded and deletable', async () => {
    await evaluateRelevance(store, WORK, { changedFiles: ['a.css'] }, NOW);
    expect(await store.readRelevanceEvents(join(process.cwd(), 'fixtures'))).toHaveLength(0);
    await store.deleteData(WORK, 'relevance');
    expect(await store.readRelevanceEvents(WORK)).toHaveLength(0);
    await evaluateRelevance(store, WORK, { changedFiles: ['a.css'] }, NOW);
    await store.deleteData(WORK, 'all');
    expect(await store.readRelevanceEvents(WORK)).toHaveLength(0);
  });

  it('log file is user-private (0600) like the rest of the store', async () => {
    await evaluateRelevance(store, WORK, { changedFiles: ['a.css'] }, NOW);
    const { readdirSync, statSync } = await import('node:fs');
    const dir = join(dataDir, 'workspaces');
    const ws = readdirSync(dir)[0]!;
    const info = statSync(join(dir, ws, 'relevance-log.json'));
    expect(info.mode & 0o077).toBe(0);
  });
});
