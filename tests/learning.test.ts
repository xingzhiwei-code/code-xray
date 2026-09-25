import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../packages/engine/index.js';
import type { AnalysisReport, Finding } from '../packages/protocol/index.js';
import { LocalStore } from '../packages/storage-local/index.js';
import {
  applyEvent, conceptKnowledgeStates, debtSummary, emptyLearningState, EXPOSURE_K, exposureFactor, learningCard,
  learningStatusFor, MAX_EXPOSURE_BONUS, syncBindings,
  type LearningBinding, type LearningState,
} from '../packages/learning/engine.js';

const FIXTURE = 'fixtures/java-spring-jpa';
const AT = '2026-09-08T16:20:00.000Z';

// Reports are engine output — the real thing, not crafted samples.
async function fixtureReport(): Promise<AnalysisReport> {
  return analyze({ path: FIXTURE });
}

function firstBindingFor(state: LearningState, conceptId: string): LearningBinding {
  const binding = Object.values(state.bindings).find(b => b.conceptId === conceptId);
  expect(binding).toBeDefined();
  return binding!;
}

describe('T008 AC05/AC06: binding lifecycle', () => {
  it('creates one unassessed binding per finding and never duplicates on rescan', async () => {
    const report = await fixtureReport();
    const first = syncBindings(emptyLearningState(), report);
    expect(Object.keys(first.state.bindings)).toHaveLength(report.findings.length);
    for (const binding of Object.values(first.state.bindings)) {
      expect(binding.status).toBe('unassessed');
      expect(binding.impact).toBe('medium');
      expect(binding.association).toBe('direct');
      expect(binding.verifications).toHaveLength(0);
    }
    const second = syncBindings(first.state, report);
    expect(Object.keys(second.state.bindings)).toHaveLength(report.findings.length);
    expect(second.changed).toHaveLength(0);
    // Binding ids are stable across scans for the same concept+symbol.
    expect(Object.keys(second.state.bindings)).toEqual(Object.keys(first.state.bindings));
  });

  it('marks a binding stale (previous status preserved) when its code changes', async () => {
    const report = await fixtureReport();
    const base = syncBindings(emptyLearningState(), report);
    const binding = firstBindingFor(base.state, 'spring.transaction-proxy');
    const advanced = applyEvent(base.state, { type: 'set-status', bindingId: binding.id, status: 'learning' }, AT).state;
    // Simulate a code change: same symbol, different evidence digests.
    const changedReport: AnalysisReport = {
      ...report,
      evidence: report.evidence.map(e => binding.evidenceIds.includes(e.id) ? { ...e, digest: 'changed-digest' } : e),
    };
    const after = syncBindings(advanced, changedReport);
    const stale = after.state.bindings[binding.id];
    expect(after.changed.some(b => b.id === binding.id)).toBe(true);
    expect(stale.status).toBe('stale');
    expect(stale.previousStatus).toBe('learning');
    expect(stale.staleReason).toContain('代码已变化');
  });

  it('marks bindings stale when their finding disappears from a later scan', async () => {
    const report = await fixtureReport();
    const base = syncBindings(emptyLearningState(), report);
    const binding = firstBindingFor(base.state, 'jpa.query-amplification');
    // A report where that finding no longer exists (e.g. narrower scope).
    const shrunk: AnalysisReport = { ...report, findings: report.findings.filter(f => f.id !== binding.findingId) };
    const after = syncBindings(base.state, shrunk);
    expect(after.state.bindings[binding.id].status).toBe('stale');
    expect(after.state.bindings[binding.id].staleReason).toContain('未再出现');
    expect(after.state.bindings[binding.id].association).toBe('inferred');
  });

  it('ignored bindings never flow back, even after code changes', async () => {
    const report = await fixtureReport();
    const base = syncBindings(emptyLearningState(), report);
    const binding = firstBindingFor(base.state, 'jpa.entity-boundary');
    const ignored = applyEvent(base.state, { type: 'ignore', bindingId: binding.id, reason: 'not-relevant' }, AT).state;
    const changedReport: AnalysisReport = {
      ...report,
      evidence: report.evidence.map(e => binding.evidenceIds.includes(e.id) ? { ...e, digest: 'changed-digest' } : e),
    };
    const after = syncBindings(ignored, changedReport);
    expect(after.state.bindings[binding.id].status).toBe('ignored');
    expect(after.changed.some(b => b.id === binding.id)).toBe(false);
  });
});

describe('T008 AC05: learning events', () => {
  it('viewing a card increments views but never the status', async () => {
    const report = await fixtureReport();
    const base = syncBindings(emptyLearningState(), report);
    const binding = firstBindingFor(base.state, 'spring.transaction-proxy');
    const after = applyEvent(base.state, { type: 'view', bindingId: binding.id }, AT);
    expect(after.binding.views).toBe(1);
    expect(after.binding.status).toBe('unassessed');
  });

  it('a correct deterministic answer verifies; a wrong one records the failure without advancing', async () => {
    const report = await fixtureReport();
    const base = syncBindings(emptyLearningState(), report);
    const binding = firstBindingFor(base.state, 'spring.transaction-proxy');
    const card = learningCard(binding);
    const wrongOption = card.question.options.find(o => o.id !== card.question.answerId)!.id;
    const failed = applyEvent(base.state, { type: 'answer', bindingId: binding.id, questionId: card.question.id, optionId: wrongOption }, AT);
    expect(failed.binding.status).toBe('unassessed');
    expect(failed.binding.verifications).toHaveLength(1);
    expect(failed.binding.verifications[0].result).toBe('failed');
    const passed = applyEvent(failed.state, { type: 'answer', bindingId: binding.id, questionId: card.question.id, optionId: card.question.answerId }, AT);
    expect(passed.binding.status).toBe('verified');
    expect(passed.binding.verifications.at(-1)?.result).toBe('passed');
    expect(passed.binding.verifications).toHaveLength(2);
  });

  it('self-reported is distinct from verified; restore/rebind/delete behave per contract', async () => {
    const report = await fixtureReport();
    const base = syncBindings(emptyLearningState(), report);
    const binding = firstBindingFor(base.state, 'jpa.query-amplification');
    const claimed = applyEvent(base.state, { type: 'set-status', bindingId: binding.id, status: 'self-reported' }, AT);
    expect(claimed.binding.status).toBe('self-reported');
    expect(claimed.binding.previousStatus).toBe('unassessed');
    const ignored = applyEvent(claimed.state, { type: 'ignore', bindingId: binding.id }, AT);
    expect(ignored.binding.status).toBe('ignored');
    expect(ignored.binding.active).toBe(false);
    const restored = applyEvent(ignored.state, { type: 'restore', bindingId: binding.id }, AT);
    expect(restored.binding.status).toBe('self-reported');
    expect(restored.binding.active).toBe(true);
    const rebound = applyEvent(restored.state, { type: 'rebind', bindingId: binding.id, conceptId: 'jpa.entity-boundary' }, AT);
    expect(rebound.binding.conceptId).toBe('jpa.entity-boundary');
    expect(rebound.binding.correctedFrom).toBe('jpa.query-amplification');
    const deleted = applyEvent(rebound.state, { type: 'delete', bindingId: binding.id }, AT);
    expect(deleted.state.bindings[binding.id]).toBeUndefined();
    expect(deleted.state.events.at(-1)?.resultStatus).toBe('deleted');
    // set-status on ignored is refused — restore first.
    const reignored = applyEvent(deleted.state, { type: 'ignore', bindingId: firstBindingFor(deleted.state, 'spring.transaction-proxy').id }, AT).state;
    const target = firstBindingFor(reignored, 'spring.transaction-proxy');
    expect(() => applyEvent(reignored, { type: 'set-status', bindingId: target.id, status: 'learning' }, AT)).toThrow('restore');
  });
});

describe('T008 AC09: local persistence lifecycle', () => {
  it('state survives a fresh store instance (restart) and repeated scans do not accumulate', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-learn-'));
    try {
      const report = await fixtureReport();
      const store = new LocalStore({ dataDir });
      const state = await store.updateState(FIXTURE, emptyLearningState(), s => syncBindings(s, report).state);
      expect(Object.keys(state.bindings)).toHaveLength(report.findings.length);
      // "Restart": a brand new store instance reading the same workspace.
      const reopened = new LocalStore({ dataDir });
      const restored = await reopened.readState(FIXTURE, emptyLearningState());
      expect(Object.keys(restored.bindings)).toHaveLength(report.findings.length);
      // Rescan through a fresh store: no duplication.
      const again = await reopened.updateState(FIXTURE, emptyLearningState(), s => syncBindings(s, report).state);
      expect(Object.keys(again.bindings)).toHaveLength(report.findings.length);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('deleted bindings stay deleted after a rescan without new findings', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-learn2-'));
    try {
      const report = await fixtureReport();
      const store = new LocalStore({ dataDir });
      const state = await store.updateState(FIXTURE, emptyLearningState(), s => syncBindings(s, report).state);
      const victim = Object.values(state.bindings)[0]!;
      const afterDelete = applyEvent(state, { type: 'delete', bindingId: victim.id }, AT).state;
      // Persist the deletion — events only count once they are stored.
      await store.updateState(FIXTURE, emptyLearningState(), () => afterDelete);
      const reopened = new LocalStore({ dataDir });
      const persisted = await reopened.readState(FIXTURE, emptyLearningState());
      expect(persisted.bindings[victim.id]).toBeUndefined();
      // A scan with the finding still present recreates the binding as a NEW
      // unassessed one — deletion removes history, it does not suppress future findings.
      const resynced = syncBindings(persisted, report);
      expect(resynced.state.bindings[victim.id]).toBeDefined();
      expect(resynced.state.bindings[victim.id].status).toBe('unassessed');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('T008 AC06 + T302 Phase 6: cognitive debt v2 (concept-level, non-linear)', () => {
  it('computes hand-checkable concept priorities and never hides unknown or unassessed', async () => {
    const report = await fixtureReport();
    let state = syncBindings(emptyLearningState(), report).state;
    const tx = firstBindingFor(state, 'spring.transaction-proxy');
    const jpa = firstBindingFor(state, 'jpa.query-amplification');
    state = applyEvent(state, { type: 'set-status', bindingId: jpa.id, status: 'learning' }, AT).state;
    state = applyEvent(state, { type: 'ignore', bindingId: firstBindingFor(state, 'jpa.entity-boundary').id, reason: 'not-relevant' }, AT).state;
    const summary = debtSummary(state);
    expect(summary.modelVersion).toBe('debt-model-v2');
    // Hand check: tx concept all-unassessed → impact medium(2) × gap(1.0) × direct(1.0) × exposure(occurrences)
    const txItem = summary.items.find(i => i.conceptId === 'spring.transaction-proxy')!;
    expect(txItem.status).toBe('unassessed');
    expect(txItem.priority).toBe(Number((2 * 1.0 * 1.0 * exposureFactor(txItem.occurrenceCount)).toFixed(2)));
    // jpa concept: one binding set to learning → concept status 'learning' by precedence → gap 0.6
    const jpaItem = summary.items.find(i => i.conceptId === 'jpa.query-amplification')!;
    expect(jpaItem.status).toBe('learning');
    expect(jpaItem.gap).toBe(0.6);
    expect(jpaItem.priority).toBe(Number((2 * 0.6 * 1.0 * exposureFactor(jpaItem.occurrenceCount)).toFixed(2)));
    // ignored binding: visible in counts, excluded from concept occurrences, never silently dropped
    const entityItem = summary.items.find(i => i.conceptId === 'jpa.entity-boundary')!;
    expect(summary.ignoredCount).toBe(1);
    expect(entityItem.bindingIds.length - entityItem.occurrenceCount).toBe(1);
    // counts are visible, not folded into zero
    expect(summary.unassessedCount).toBeGreaterThan(0);
    expect(summary.calculatedCount).toBe(summary.items.filter(i => i.priority !== null).length);
    const expectedTotal = Number(summary.items.filter(i => i.priority !== null).reduce((sum, i) => sum + (i.priority ?? 0), 0).toFixed(2));
    expect(summary.total).toBe(expectedTotal);
    expect(summary.formula).toContain('impact');
    expect(summary.meaning).toContain('不是能力评分');
    // exposure constants and samples are published — no hidden magic numbers (plan §14)
    expect(summary.exposure.k).toBe(EXPOSURE_K);
    expect(summary.exposure.maxBonus).toBe(MAX_EXPOSURE_BONUS);
    expect(summary.exposure.samples[0]).toEqual({ occurrences: 1, factor: 1 });
    // binding-level drill-down rows are preserved (never merged away)
    expect(summary.bindingItems.find(b => b.bindingId === tx.id)).toBeDefined();
  });

  it('Case 4: one concept ×10 occurrences is NOT 10× single-occurrence debt; exposure formula and cap verified', () => {
    const bindings = Array.from({ length: 10 }, (_, i) => makeBinding({ id: `lb-${i}`, conceptId: 'jpa.query-amplification', status: 'unassessed' }));
    const summary = debtSummary(stateWith(...bindings));
    const [item] = summary.items;
    expect(summary.items).toHaveLength(1);
    expect(item.occurrenceCount).toBe(10);
    // Single-binding linear reference (the old v1 unit): medium(2) × unassessed(1.0) × direct(1.0) = 2.0
    expect(summary.bindingItems[0]!.priority).toBe(2.0);
    // v2: 2 × 1.0 × 1.0 × exposure(10)=1.5 → 3.0 — decidedly not 20.
    expect(exposureFactor(10)).toBe(1.5);
    expect(item.exposureFactor).toBe(1.5);
    expect(item.priority).toBe(3.0);
    expect(summary.total).toBe(3.0);
    expect(summary.total).toBeLessThan(10 * 2.0);
    // Plan §14 sample curve: 1→1.00, 2→~1.15, 5→~1.35, 20→capped.
    expect(exposureFactor(1)).toBe(1);
    expect(exposureFactor(2)).toBe(1.15);
    expect(exposureFactor(5)).toBe(1.35);
    expect(exposureFactor(20)).toBe(1.5);
  });

  it('an all-ignored concept is excluded with a visible reason, never folded into the total', () => {
    const summary = debtSummary(stateWith(
      makeBinding({ id: 'lb-x', conceptId: 'jpa.entity-boundary', status: 'ignored' }),
      makeBinding({ id: 'lb-y', conceptId: 'jpa.entity-boundary', status: 'ignored' }),
    ));
    const [item] = summary.items;
    expect(item.priority).toBeNull();
    expect(item.exclusionReason).toContain('ignored');
    expect(summary.total).toBe(0);
    expect(summary.calculatedCount).toBe(0);
    expect(summary.ignoredCount).toBe(2);
  });

  it('verified knowledge drops its priority to zero but stays listed', async () => {
    const report = await fixtureReport();
    let state = syncBindings(emptyLearningState(), report).state;
    const binding = firstBindingFor(state, 'spring.transaction-proxy');
    const card = learningCard(binding);
    state = applyEvent(state, { type: 'answer', bindingId: binding.id, questionId: card.question.id, optionId: card.question.answerId }, AT).state;
    const summary = debtSummary(state);
    const item = summary.items.find(i => i.conceptId === 'spring.transaction-proxy')!;
    expect(item.priority).toBe(0);
    expect(item.statusLabel).toBe('已验证理解');
    // drill-down keeps every binding of the concept addressable
    expect(item.bindingIds).toContain(binding.id);
    expect(summary.bindingItems.find(b => b.bindingId === binding.id)).toBeDefined();
  });
});

// ---------- Review Insight Layer v0.2 (T302) Phase 2: concept-level knowledge state ----------

function makeBinding(overrides: Partial<LearningBinding> & { id: string; conceptId: LearningBinding['conceptId']; status: LearningBinding['status'] }): LearningBinding {
  return {
    codeRef: `Symbol.${overrides.id}`, codeFingerprint: `fp-${overrides.id}`, evidenceIds: [`ev-${overrides.id}`],
    impact: 'medium', association: 'direct', active: overrides.status !== 'ignored', views: 0,
    contentVersion: 'learning-v1', createdAt: AT, updatedAt: AT, verifications: [],
    ...overrides,
  };
}

function stateWith(...bindings: LearningBinding[]): LearningState {
  return { learningVersion: 1, bindings: Object.fromEntries(bindings.map(b => [b.id, b])), events: [], corrections: {} };
}

describe('T302 Phase 2: concept-level knowledge state (plan §7/§8.1)', () => {
  it('Case 12: aggregates conflicting binding statuses by explicit precedence, never by array order', () => {
    const verified = makeBinding({ id: 'lb-a', conceptId: 'spring.transaction-proxy', status: 'verified' });
    const stale = makeBinding({ id: 'lb-b', conceptId: 'spring.transaction-proxy', status: 'stale' });
    const unassessed = makeBinding({ id: 'lb-c', conceptId: 'spring.transaction-proxy', status: 'unassessed' });
    // Both insertion orders must produce the identical aggregate.
    for (const state of [stateWith(verified, stale, unassessed), stateWith(unassessed, verified, stale), stateWith(stale, unassessed, verified)]) {
      const [concept] = conceptKnowledgeStates(state);
      // stale outranks verified: changed code needs re-confirmation of applicability;
      // the verified mastery itself stays visible through verifiedBindingCount.
      expect(concept.status).toBe('stale');
      expect(concept.verifiedBindingCount).toBe(1);
      expect(concept.staleBindingCount).toBe(1);
      expect(concept.unassessedBindingCount).toBe(1);
      expect(concept.occurrenceCount).toBe(3);
      expect(concept.bindingIds).toEqual(['lb-a', 'lb-b', 'lb-c']);
    }
  });

  it('Case 3 support: a new unassessed binding never downgrades a verified concept to unassessed', () => {
    const verified = makeBinding({ id: 'lb-old', conceptId: 'jpa.query-amplification', status: 'verified' });
    const fresh = makeBinding({ id: 'lb-new', conceptId: 'jpa.query-amplification', status: 'unassessed' });
    const [concept] = conceptKnowledgeStates(stateWith(fresh, verified));
    expect(concept.status).toBe('verified');
    expect(concept.occurrenceCount).toBe(2);
    // learningStatusFor (used by knowledge gaps) agrees with the concept aggregate.
    expect(learningStatusFor(stateWith(fresh, verified), 'jpa.query-amplification')).toBe('verified');
  });

  it('ignored bindings are excluded; an all-ignored concept reports ignored', () => {
    const ignored = makeBinding({ id: 'lb-i1', conceptId: 'jpa.entity-boundary', status: 'ignored' });
    const ignored2 = makeBinding({ id: 'lb-i2', conceptId: 'jpa.entity-boundary', status: 'ignored' });
    const [allIgnored] = conceptKnowledgeStates(stateWith(ignored, ignored2));
    expect(allIgnored.status).toBe('ignored');
    expect(allIgnored.occurrenceCount).toBe(0);
    expect(allIgnored.ignoredBindingCount).toBe(2);

    const mixed = makeBinding({ id: 'lb-m1', conceptId: 'jpa.entity-boundary', status: 'ignored' });
    const learning = makeBinding({ id: 'lb-m2', conceptId: 'jpa.entity-boundary', status: 'learning' });
    const [concept] = conceptKnowledgeStates(stateWith(mixed, learning));
    expect(concept.status).toBe('learning');
    expect(concept.occurrenceCount).toBe(1);
  });

  it('is deterministic: concepts sorted by id, bindings kept per position (never merged away)', () => {
    const b1 = makeBinding({ id: 'lb-1', conceptId: 'spring.transaction-proxy', status: 'unassessed' });
    const b2 = makeBinding({ id: 'lb-2', conceptId: 'jpa.query-amplification', status: 'learning' });
    const b3 = makeBinding({ id: 'lb-3', conceptId: 'jpa.query-amplification', status: 'unassessed' });
    const states = conceptKnowledgeStates(stateWith(b1, b2, b3));
    expect(states.map(s => s.conceptId)).toEqual(['jpa.query-amplification', 'spring.transaction-proxy']);
    // One concept, two code positions → ONE concept state with TWO bindings (plan §2.1).
    expect(states[0].bindingIds).toEqual(['lb-2', 'lb-3']);
    expect(states[0].occurrenceCount).toBe(2);
  });
});
