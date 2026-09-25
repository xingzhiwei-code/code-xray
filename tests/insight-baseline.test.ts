/**
 * Phase 1 baseline evidence (Review Insight Layer v0.2 plan, §22 Phase 1).
 *
 * These assertions run against the COMMITTED v0.1 capture
 * (tests/fixtures/review-insight-v0.1-before.json), produced by
 * scripts/capture-insight-baseline.ts on the pre-refactor pipeline. They
 * permanently document the old information-quality problems the v0.2 Insight
 * Aggregation Layer exists to fix:
 *
 *   P1 — Finding dump: one concept with 10 findings yields 10 near-identical
 *        per-finding suggestedChecks (1 Finding → 1 suggestedCheck).
 *   P2 — No insight layer: the review output has no concept-level aggregation
 *        fields (overview / insights / resolvedInsights / coverageSummary).
 *   P3 — Linear cognitive debt: debt-model-v1 accumulates per binding, so one
 *        concept occurring 10 times scores 10 × single-occurrence debt.
 *   P4 — New vs continuing not differentiated at the top level: everything is
 *        flattened into finding-id lists of equal weight.
 *
 * The live v0.2 behavior is asserted in tests/insights.test.ts and
 * tests/agent-review.test.ts; this file intentionally tests the STATIC
 * historical fixture so it keeps passing as a record.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface CapturedReview {
  _note: string;
  record: {
    schemaVersion: string;
    gate: { state: string; reasons: string[] };
    output: {
      newFindingIds: string[];
      continuingFindingIds: string[];
      removedFindingIds: string[];
      suggestedChecks: { findingId: string; ruleId: string; symbol: string; nextCheck: string }[];
      conceptRefs: string[];
      debtDelta: { modelVersion: string; before: number; after: number; delta: number; bindingsBefore: number; bindingsAfter: number };
      insights?: unknown;
      overview?: unknown;
    };
  };
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/review-insight-v0.1-before.json', import.meta.url), 'utf8'),
) as CapturedReview;

interface CapturedReviewV02 extends CapturedReview {
  presentation?: string;
  record: CapturedReview['record'] & {
    schemaVersion: '0.2';
    reportStatus: string;
    output: CapturedReview['record']['output'] & {
      overview: { filesChanged: number; newInsightCount: number; continuingInsightCount: number; resolvedInsightCount: number; newFindingCount: number; continuingFindingCount: number; resolvedFindingCount: number };
      insights: { id: string; conceptId: string; changeType: string; occurrenceCount: number; findingIds: string[]; nextAction: string }[];
      resolvedInsights: unknown[];
      coverageSummary: { status: string; unknownCount: number };
      suggestedChecks: { insightId: string; findingId: string }[];
      debtDelta: CapturedReview['record']['output']['debtDelta'] & { conceptsBefore: number; conceptsAfter: number };
    };
  };
}

const after = JSON.parse(
  readFileSync(new URL('./fixtures/review-insight-v0.2-after.json', import.meta.url), 'utf8'),
) as CapturedReviewV02;

describe('Phase 1 baseline: v0.1 review output reproduces the documented problems', () => {
  const output = fixture.record.output;
  const loopChecks = output.suggestedChecks.filter(c => c.ruleId === 'JPA_CALL_IN_LOOP');

  it('P0 capture shape: 12 new findings over 3 concepts, gate needs_human (facts unchanged by the refactor)', () => {
    expect(fixture.record.schemaVersion).toBe('0.1');
    expect(output.newFindingIds).toHaveLength(12);
    expect(output.continuingFindingIds).toHaveLength(0);
    expect(output.conceptRefs).toHaveLength(3);
    expect(output.conceptRefs).toContain('jpa.query-amplification');
    expect(fixture.record.gate.state).toBe('needs_human');
  });

  it('P1 finding dump: the same concept produced 10 near-identical suggested checks', () => {
    // 10 loop findings, all sharing concept jpa.query-amplification.
    expect(loopChecks).toHaveLength(10);
    // Their nextCheck texts are all identical — pure repetition for the user.
    expect(new Set(loopChecks.map(c => c.nextCheck)).size).toBe(1);
    // 12 findings → 12 checks: strictly 1 Finding → 1 suggestedCheck.
    expect(output.suggestedChecks).toHaveLength(output.newFindingIds.length);
  });

  it('P2 no insight layer: v0.1 output carries no concept-level aggregation fields', () => {
    expect(output.insights).toBeUndefined();
    expect(output.overview).toBeUndefined();
    expect((output as Record<string, unknown>).resolvedInsights).toBeUndefined();
    expect((output as Record<string, unknown>).coverageSummary).toBeUndefined();
  });

  it('P3 linear cognitive debt: 12 bindings × 2.0 = 24.0, one concept counted 10 times', () => {
    expect(output.debtDelta.modelVersion).toBe('debt-model-v1');
    expect(output.debtDelta.bindingsAfter).toBe(12);
    expect(output.debtDelta.before).toBe(0);
    // Every binding is medium(2) × unassessed(1.0) × direct(1.0) = 2.0 → linear.
    expect(output.debtDelta.after).toBe(24);
    // The 10-occurrence concept alone contributes 20.0 = 10 × single occurrence.
    expect(output.debtDelta.after - 4).toBe(20);
  });

  it('P4 new/continuing flattened into equal-weight id lists; gate reason counts findings, not concepts', () => {
    expect(Array.isArray(output.newFindingIds)).toBe(true);
    expect(output.removedFindingIds).toHaveLength(0);
    const riskReason = fixture.record.gate.reasons.find(r => r.includes('需要人工检查'));
    expect(riskReason).toBeDefined();
    // v0.1 phrasing is finding-count based ("12 项新增"), not concept based.
    expect(riskReason).toContain(`${output.newFindingIds.length} 项新增`);
  });
});

describe('Phase 9 after-evidence: the SAME scenario under the v0.2 pipeline (plan §23/§27.8)', () => {
  const out = after.record.output;

  it('same 12 findings over 3 concepts — facts unchanged, aggregation added', () => {
    expect(after.record.schemaVersion).toBe('0.2');
    expect(out.newFindingIds).toEqual(fixture.record.output.newFindingIds);
    expect(out.overview.newFindingCount).toBe(12);
    expect(out.overview.newInsightCount).toBe(3);
    expect(out.insights).toHaveLength(3);
    expect(out.coverageSummary.status).toBe(after.record.reportStatus);
  });

  it('P1 fixed: 10 same-concept findings → ONE insight with 10 occurrences and ONE primary check', () => {
    const jpa = out.insights.find(i => i.conceptId === 'jpa.query-amplification')!;
    expect(jpa).toBeDefined();
    expect(jpa.occurrenceCount).toBe(10);
    expect(jpa.findingIds).toHaveLength(10);
    expect(jpa.nextAction).toContain('优先检查');
    // 12 findings → 3 checks (one per concept), each linked to its insight.
    expect(out.suggestedChecks).toHaveLength(3);
    for (const check of out.suggestedChecks)
      expect(out.insights.some(i => i.id === check.insightId)).toBe(true);
  });

  it('P3 fixed: debt is concept-level and non-linear (24.0 linear → 7.0)', () => {
    expect(out.debtDelta.modelVersion).toBe('debt-model-v2');
    expect(out.debtDelta.bindingsAfter).toBe(12);
    expect(out.debtDelta.conceptsAfter).toBe(3);
    // jpa concept: 2×1×1×exposure(10)=1.5 → 3.0; two tx concepts 2.0 each → 7.0 total (was 24.0).
    expect(out.debtDelta.after).toBe(7);
    expect(out.debtDelta.after).toBeLessThan(fixture.record.output.debtDelta.after);
  });

  it('P2/P4 fixed: overview + presentation give a concept-phrased first screen', () => {
    expect(after.presentation).toContain('Code X-Ray Review（schema 0.2）');
    expect(after.presentation).toContain('新增 3 个风险概念');
    expect(after.presentation).toContain('JPA 循环内查询放大');
    const headline = after.record.gate.reasons.find(r => r.includes('风险概念'));
    expect(headline).toContain('3 个新的风险概念');
    expect(headline).toContain('12 个具体代码位置');
  });
});
