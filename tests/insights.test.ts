/**
 * Review Insight Layer v0.2 (T302 Phase 3): Insight Aggregator unit tests.
 * Covers plan §19 Cases 1, 2, 3, 5, 7, 11 plus primary-finding choice,
 * importance scoring, knowledge-status mapping and drill-down integrity.
 * The aggregator is pure: facts in (report diff + learning states), insights out.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisReport, DiffSummary, Finding, Severity } from '../packages/protocol/index.js';
import { emptyLearningState, type LearningState } from '../packages/learning/engine.js';
import type { LearningBinding } from '../packages/learning/types.js';
import {
  IMPORTANCE_THRESHOLDS, IMPORTANCE_WEIGHTS, buildReviewInsights, importanceOf, importanceScore,
  insightId, knowledgeStatusOf, pickPrimaryFinding,
} from '../packages/insights/engine.js';
import { conceptKnowledgeStates } from '../packages/learning/engine.js';

const REVIEW_ID = 'rev_test0000000000000000000000000000';
const RULE_SET_VERSION = '1.0.0';
const AT = '2026-09-24T00:00:00.000Z';

function makeFinding(id: string, conceptId: string, symbol: string, severity: Severity = 'medium'): Finding {
  return {
    id, ruleId: `RULE_FOR_${conceptId}`, ruleVersion: RULE_SET_VERSION, title: `${conceptId} finding`,
    severity, epistemic: 'inference', evidenceIds: [`ev-${id}`], conceptId, symbol,
    assumptions: [], uncertainties: [], nextCheck: `verify ${symbol}`,
  };
}

function makeReport(findings: Finding[], diff: Partial<DiffSummary> | null): AnalysisReport {
  return {
    findings,
    diff: diff ? {
      base: 'baseline', added: [], modified: [], deleted: [],
      newFindingIds: [], continuingFindingIds: [], removedFindings: [], limitations: [],
      ...diff,
    } : null,
  } as unknown as AnalysisReport;
}

function makeBinding(id: string, conceptId: string, status: LearningBinding['status']): LearningBinding {
  return {
    id, conceptId: conceptId as LearningBinding['conceptId'], codeRef: `Symbol.${id}`, codeFingerprint: `fp-${id}`,
    evidenceIds: [`ev-${id}`], impact: 'medium', association: 'direct', status, active: status !== 'ignored',
    views: 0, contentVersion: 'learning-v1', createdAt: AT, updatedAt: AT, verifications: [],
  };
}

function stateWith(...bindings: LearningBinding[]): LearningState {
  return { learningVersion: 1, bindings: Object.fromEntries(bindings.map(b => [b.id, b])), events: [], corrections: {} };
}

function build(input: {
  findings: Finding[];
  diff: Partial<DiffSummary> | null;
  before?: LearningState;
  after?: LearningState;
}) {
  return buildReviewInsights({
    reviewId: REVIEW_ID,
    ruleSetVersion: RULE_SET_VERSION,
    report: makeReport(input.findings, input.diff),
    learningStateBefore: input.before ?? emptyLearningState(),
    learningStateAfter: input.after ?? emptyLearningState(),
  });
}

describe('T302 Phase 3: concept aggregation (plan §5.1)', () => {
  it('Case 1: one concept with 10 findings → ONE insight with 10 occurrences and full drill-down', () => {
    const findings = Array.from({ length: 10 }, (_, i) => makeFinding(`f${i}`, 'jpa.query-amplification', `BatchService.process${i}`));
    const result = build({
      findings,
      diff: { newFindingIds: findings.map(f => f.id) },
      after: stateWith(...findings.map((f, i) => makeBinding(`lb${i}`, 'jpa.query-amplification', 'unassessed'))),
    });
    expect(result.insights).toHaveLength(1);
    const [insight] = result.insights;
    expect(insight.conceptId).toBe('jpa.query-amplification');
    expect(insight.occurrenceCount).toBe(10);
    expect(insight.newOccurrenceCount).toBe(10);
    expect(insight.findingIds).toHaveLength(10);
    expect(insight.evidenceIds).toHaveLength(10);
    expect(insight.symbols).toHaveLength(10);
    // ONE primary next action instead of 10 near-identical checks (plan §13).
    expect(insight.nextAction).toContain('优先检查');
    expect(insight.nextAction).toContain('其余 9 个');
    expect(result.newInsightCount).toBe(1);
  });

  it('Case 2: new + continuing mixed → changeType=new with separate counters', () => {
    const news = [makeFinding('n1', 'spring.transaction-proxy', 'A.m1'), makeFinding('n2', 'spring.transaction-proxy', 'A.m2')];
    const conts = Array.from({ length: 5 }, (_, i) => makeFinding(`c${i}`, 'spring.transaction-proxy', `B.m${i}`));
    const result = build({
      findings: [...news, ...conts],
      diff: { newFindingIds: news.map(f => f.id), continuingFindingIds: conts.map(f => f.id) },
    });
    expect(result.insights).toHaveLength(1);
    const [insight] = result.insights;
    expect(insight.changeType).toBe('new');
    expect(insight.newOccurrenceCount).toBe(2);
    expect(insight.continuingOccurrenceCount).toBe(5);
    expect(insight.occurrenceCount).toBe(7);
  });

  it('Case 5: two concepts → two insights', () => {
    const a = makeFinding('fa', 'spring.transaction-proxy', 'A.m');
    const b = makeFinding('fb', 'jpa.query-amplification', 'B.m');
    const result = build({ findings: [a, b], diff: { newFindingIds: ['fa', 'fb'] } });
    expect(result.insights).toHaveLength(2);
    expect(result.insights.map(i => i.conceptId).sort()).toEqual(['jpa.query-amplification', 'spring.transaction-proxy']);
  });

  it('Case 7: removed-only concepts land in resolvedInsights with baseline-scoped evidence', () => {
    const removed = [makeFinding('r1', 'jpa.entity-boundary', 'OldController.get')];
    const result = build({ findings: [], diff: { removedFindings: removed } });
    expect(result.insights).toHaveLength(0);
    expect(result.resolvedInsights).toHaveLength(1);
    const [resolved] = result.resolvedInsights;
    expect(resolved.changeType).toBe('resolved');
    expect(resolved.evidenceScope).toBe('baseline');
    expect(resolved.findingIds).toEqual(['r1']);
    expect(resolved.resolvedOccurrenceCount).toBe(1);
    expect(result.resolvedInsightCount).toBe(1);
  });

  it('mixed concept (current + removed) stays ONE active insight carrying resolvedOccurrenceCount', () => {
    const current = makeFinding('k1', 'spring.transaction-boundary', 'Svc.tx');
    const removed = makeFinding('k0', 'spring.transaction-boundary', 'Svc.oldTx');
    const result = build({ findings: [current], diff: { continuingFindingIds: ['k1'], removedFindings: [removed] } });
    expect(result.insights).toHaveLength(1);
    expect(result.resolvedInsights).toHaveLength(0);
    expect(result.insights[0].resolvedOccurrenceCount).toBe(1);
    expect(result.insights[0].changeType).toBe('continuing');
  });

  it('no diff → honest empty result, never fabricated attribution', () => {
    const result = build({ findings: [makeFinding('x', 'jpa.query-amplification', 'X.m')], diff: null });
    expect(result.insights).toHaveLength(0);
    expect(result.resolvedInsights).toHaveLength(0);
  });

  it('evidence/symbol lists are deduplicated and sorted; ids are stable per review+concept', () => {
    const f1 = { ...makeFinding('f1', 'jpa.query-amplification', 'S.m1'), evidenceIds: ['ev-shared', 'ev-b'] };
    const f2 = { ...makeFinding('f2', 'jpa.query-amplification', 'S.m1'), evidenceIds: ['ev-shared', 'ev-a'] };
    const result = build({ findings: [f1, f2], diff: { newFindingIds: ['f1', 'f2'] } });
    const [insight] = result.insights;
    expect(insight.evidenceIds).toEqual(['ev-a', 'ev-b', 'ev-shared']);
    expect(insight.symbols).toEqual(['S.m1']);
    expect(insight.id).toBe(insightId(REVIEW_ID, 'jpa.query-amplification', RULE_SET_VERSION));
    expect(insight.id).toMatch(/^ins_[0-9a-f]{32}$/);
  });
});

describe('T302 Phase 3: knowledge status mapping (plan §8/§8.1)', () => {
  const conceptStates = (state: LearningState) => new Map(conceptKnowledgeStates(state).map(s => [s.conceptId as string, s]));

  it('new-to-user requires NO prior binding AND first appearance this round', () => {
    const findings = [makeFinding('f1', 'jpa.query-amplification', 'S.m')];
    const after = stateWith(makeBinding('lb1', 'jpa.query-amplification', 'unassessed'));
    const result = build({ findings, diff: { newFindingIds: ['f1'] }, before: emptyLearningState(), after });
    expect(result.insights[0].knowledgeStatus).toBe('new-to-user');
  });

  it('Case 3: verified concept re-appearing at a NEW position stays known — never repackaged as first-time', () => {
    const old = makeFinding('fold', 'jpa.query-amplification', 'S.oldMethod');
    const fresh = makeFinding('fnew', 'jpa.query-amplification', 'S.newMethod');
    const before = stateWith(makeBinding('lb-old', 'jpa.query-amplification', 'verified'));
    // After state: the verified binding survives plus a fresh unassessed one.
    const after = stateWith(
      makeBinding('lb-old', 'jpa.query-amplification', 'verified'),
      makeBinding('lb-new', 'jpa.query-amplification', 'unassessed'),
    );
    const result = build({
      findings: [old, fresh],
      diff: { continuingFindingIds: ['fold'], newFindingIds: ['fnew'] },
      before, after,
    });
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].changeType).toBe('new');
    expect(result.insights[0].knowledgeStatus).toBe('known');
    // The concept aggregate itself keeps verified mastery visible.
    expect(conceptStates(after).get('jpa.query-amplification')!.status).toBe('verified');
  });

  it('maps learning/to-learn→learning, stale→stale, unassessed with history→unassessed, ignored→known (acknowledged)', () => {
    expect(knowledgeStatusOf(conceptStates(stateWith(makeBinding('b', 'jpa.query-amplification', 'learning'))).get('jpa.query-amplification'), true, 'continuing')).toBe('learning');
    expect(knowledgeStatusOf(conceptStates(stateWith(makeBinding('b', 'jpa.query-amplification', 'to-learn'))).get('jpa.query-amplification'), true, 'continuing')).toBe('learning');
    expect(knowledgeStatusOf(conceptStates(stateWith(makeBinding('b', 'jpa.query-amplification', 'stale'))).get('jpa.query-amplification'), true, 'continuing')).toBe('stale');
    expect(knowledgeStatusOf(conceptStates(stateWith(makeBinding('b', 'jpa.query-amplification', 'unassessed'))).get('jpa.query-amplification'), true, 'continuing')).toBe('unassessed');
    expect(knowledgeStatusOf(conceptStates(stateWith(makeBinding('b', 'jpa.query-amplification', 'ignored'))).get('jpa.query-amplification'), true, 'continuing')).toBe('known');
    // Insufficient evidence → unassessed, never a guess (plan §8).
    expect(knowledgeStatusOf(undefined, true, 'continuing')).toBe('unassessed');
  });
});

describe('T302 Phase 3: importance, ordering, primary finding (plan §6.1/§10/§11)', () => {
  it('importance scoring is transparent and monotonic', () => {
    // new + high + new-to-user = 2+3+2 = 7 → critical
    expect(importanceScore({ severity: 'high', changeType: 'new', knowledgeStatus: 'new-to-user' })).toBe(7);
    expect(importanceOf({ severity: 'high', changeType: 'new', knowledgeStatus: 'new-to-user' })).toBe('critical');
    // new + medium + unassessed = 2+2+1 = 5 → high (plan §15 example: 新增/HIGH)
    expect(importanceOf({ severity: 'medium', changeType: 'new', knowledgeStatus: 'unassessed' })).toBe('high');
    // continuing + low + known = 0+1+0 = 1 → low
    expect(importanceOf({ severity: 'low', changeType: 'continuing', knowledgeStatus: 'known' })).toBe('low');
    // continuing + high + stale escalates (fact-backed, plan §12) = 0+3+1 = 4 → high
    expect(importanceOf({ severity: 'high', changeType: 'continuing', knowledgeStatus: 'stale' })).toBe('high');
    expect(IMPORTANCE_THRESHOLDS.critical).toBeGreaterThan(IMPORTANCE_THRESHOLDS.high);
    expect(IMPORTANCE_WEIGHTS.changeType.new).toBeGreaterThan(IMPORTANCE_WEIGHTS.changeType.continuing);
  });

  it('pickPrimaryFinding: new beats continuing, then higher severity, then stable id order', () => {
    const contHigh = makeFinding('b-cont-high', 'c', 'S.high', 'high');
    const newMedium = makeFinding('a-new-med', 'c', 'S.med', 'medium');
    const newMedium2 = makeFinding('c-new-med', 'c', 'S.med2', 'medium');
    const newIds = new Set(['a-new-med', 'c-new-med']);
    expect(pickPrimaryFinding([contHigh, newMedium2, newMedium], newIds)!.id).toBe('a-new-med');
    expect(pickPrimaryFinding([contHigh], new Set())!.id).toBe('b-cont-high');
  });

  it('Case 11: identical inputs → byte-identical insights regardless of finding order; new sorts before continuing', () => {
    const newA = makeFinding('n-a', 'spring.transaction-proxy', 'N.m', 'medium');
    const contB = makeFinding('c-b', 'jpa.query-amplification', 'C.m', 'medium');
    const contC = makeFinding('c-c', 'jpa.entity-boundary', 'D.m', 'high');
    const diff = { newFindingIds: ['n-a'], continuingFindingIds: ['c-b', 'c-c'] };
    const run = (findings: Finding[]) => JSON.stringify(build({ findings, diff }).insights);
    const first = run([newA, contB, contC]);
    expect(first).toBe(run([contC, contB, newA]));
    expect(first).toBe(run([contB, newA, contC]));
    const insights = build({ findings: [newA, contB, contC], diff }).insights;
    expect(insights[0].changeType).toBe('new');
    // Within continuing: high severity (importance high via severity 3) before medium.
    expect(insights[1].conceptId).toBe('jpa.entity-boundary');
    expect(insights[2].conceptId).toBe('jpa.query-amplification');
    // primary finding/evidence are deterministic
    for (const insight of insights) {
      expect(insight.primaryFindingId).toBeTruthy();
      expect(insight.primaryEvidenceId).toBe(`ev-${insight.primaryFindingId}`);
    }
  });

  it('insight content is concept metadata + facts only (deterministic text, no invented runtime claims)', () => {
    const findings = [makeFinding('f1', 'spring.transaction-proxy', 'OrderService.createOrder')];
    const [insight] = build({ findings, diff: { newFindingIds: ['f1'] } }).insights;
    expect(insight.title).toBe('Spring 事务代理与同类调用');
    expect(insight.whyItMatters).toContain('代理');
    expect(insight.nextAction).toContain('OrderService.createOrder');
    expect(insight.nextAction).toContain('verify OrderService.createOrder');
    // Unknown concept degrades honestly to the conceptId, never a fabricated card.
    const [unknown] = build({ findings: [makeFinding('f2', 'future.unknown-concept', 'X.m')], diff: { newFindingIds: ['f2'] } }).insights;
    expect(unknown.title).toBe('future.unknown-concept');
    expect(unknown.whyItMatters).toContain('没有内置学习卡');
  });
});
