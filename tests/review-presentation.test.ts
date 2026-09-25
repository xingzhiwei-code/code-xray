/**
 * Review Insight Layer v0.2 (T302 Phase 7): human-friendly deterministic
 * presentation. Covers plan §19 Case 6 (continuing降噪), §12 escalation
 * conditions, §15 first-screen discipline (no raw ids/assumptions on the
 * first screen), renderer determinism, and versioned rendering of legacy
 * v0.1 records (plan §18: no silent migration, no fabricated insights).
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisReport, DiffSummary, Finding, ReviewRecord, ReviewRecordV01, Severity } from '../packages/protocol/index.js';
import { debtSummary, emptyLearningState, type LearningState } from '../packages/learning/engine.js';
import type { LearningBinding } from '../packages/learning/types.js';
import { buildReviewRecord } from '../packages/insights/review.js';
import { isEscalated, renderReviewPresentation } from '../packages/insights/presentation.js';

const AT = '2026-09-24T00:00:00.000Z';
const REVIEW_ID = 'rev_presentation0000000000000000000000';

function makeFinding(id: string, conceptId: string, symbol: string, severity: Severity = 'medium'): Finding {
  return {
    id, ruleId: `RULE_${conceptId}`, ruleVersion: '1.0.0', title: `${conceptId} finding`,
    severity, epistemic: 'inference', evidenceIds: [`ev-${id}`], conceptId, symbol,
    assumptions: [`assumption-text-${id}`], uncertainties: [`uncertainty-text-${id}`], nextCheck: `verify ${symbol}`,
  };
}

function makeBinding(id: string, conceptId: string, status: LearningBinding['status']): LearningBinding {
  return {
    id, conceptId: conceptId as LearningBinding['conceptId'], codeRef: `S.${id}`, codeFingerprint: `fp-${id}`,
    evidenceIds: [`ev-${id}`], impact: 'medium', association: 'direct', status, active: status !== 'ignored',
    views: 0, contentVersion: 'learning-v1', createdAt: AT, updatedAt: AT, verifications: [],
  };
}

function stateWith(...bindings: LearningBinding[]): LearningState {
  return { learningVersion: 1, bindings: Object.fromEntries(bindings.map(b => [b.id, b])), events: [], corrections: {} };
}

function makeReport(findings: Finding[], diff: Partial<DiffSummary>, unknown = 0): AnalysisReport {
  return {
    schemaVersion: '0.1', analysisId: 'aaaaaaaa-0000-0000-0000-000000000000', createdAt: AT,
    status: 'complete',
    snapshot: { id: 'snap-target', workspaceId: 'ws-test', files: [], gitHead: null, gitBase: null },
    coverage: { discovered: 5, parsed: 5, skipped: 0, failed: 0, unknown, reasons: unknown > 0 ? [{ path: 'A.java', code: 'JAVA_RECEIVER_UNKNOWN', message: '接收者不可见' }] : [] },
    findings,
    evidence: findings.flatMap(f => f.evidenceIds.map(id => ({ id, path: 'A.java', digest: 'd', start: { line: 1, column: 1 }, end: { line: 2, column: 1 }, observation: 'obs', producer: 'p' }))),
    flows: [], summary: '5 个文件完成解析。',
    diff: { base: 'baseline', added: [], modified: ['A.java'], deleted: [], newFindingIds: [], continuingFindingIds: [], removedFindings: [], limitations: [], ...diff },
    provenance: { engineVersion: '0.1.0', adapterVersion: '0.1.0', ruleSetVersion: '1.0.0', offline: true, llm: 'disabled' },
    limitations: [],
  } as AnalysisReport;
}

function buildRecord(report: AnalysisReport, before: LearningState, after: LearningState): ReviewRecord {
  return buildReviewRecord({
    session: {
      schemaVersion: '0.1', reviewId: '', workspace: '/tmp/ws', base: null,
      baseline: { id: 'snap-base', workspaceId: 'ws-test', files: [], gitHead: null, gitBase: null, ref: null },
      createdAt: AT,
    },
    report, reviewId: REVIEW_ID,
    versions: { engineVersion: '0.1.0', ruleSetVersion: '1.0.0', protocolVersion: '0.1', adapterVersion: '0.1.0', surface: 'agent-mcp' },
    learningStateBefore: before, learningStateAfter: after,
    debtBefore: debtSummary(before), debtAfter: debtSummary(after),
    gateBlocking: false,
  });
}

describe('T302 Phase 7: review presentation (plan §12/§15)', () => {
  it('Case 6: continuing-only review collapses into ONE summary line — no duplicated checks on the first screen', () => {
    // 6 continuing findings over 2 concepts (the plan's exact example shape).
    const loopFindings = Array.from({ length: 4 }, (_, i) => makeFinding(`l${i}`, 'jpa.query-amplification', `Batch.p${i}`));
    const txFindings = Array.from({ length: 2 }, (_, i) => makeFinding(`t${i}`, 'spring.transaction-proxy', `Svc.m${i}`));
    const findings = [...loopFindings, ...txFindings];
    const before = stateWith(...findings.map((f, i) => makeBinding(`b${i}`, f.conceptId, 'unassessed')));
    const record = buildRecord(makeReport(findings, { continuingFindingIds: findings.map(f => f.id) }), before, before);
    const text = renderReviewPresentation(record);

    expect(text).toContain('6 个已有风险仍然存在，涉及 2 个知识概念');
    // No per-finding check repetition: the two nextCheck texts appear at most via insights, and the
    // collapsed section shows ONE bullet — not 6 lines of "verify Batch.pX".
    expect(text.split('verify Batch.p').length - 1).toBe(0);
    // Full detail remains available in the record for drill-down.
    expect(record.output.insights).toHaveLength(2);
    expect(record.output.insights.every(i => i.changeType === 'continuing')).toBe(true);
    // Raw finding-level noise never reaches the first screen.
    expect(text).not.toContain('assumption-text');
    expect(text).not.toContain('uncertainty-text');
    for (const finding of findings) expect(text).not.toContain(finding.id);
  });

  it('deterministic escalation: severity high or stale knowledge surfaces a continuing insight; nothing else', () => {
    const high = makeFinding('h1', 'jpa.query-amplification', 'Hot.loop', 'high');
    const staleBinding = makeBinding('bs', 'spring.transaction-proxy', 'stale');
    const facts = {
      high: { id: 'x', conceptId: 'jpa.query-amplification', changeType: 'continuing', severity: 'high', knowledgeStatus: 'unassessed' },
      stale: { id: 'y', conceptId: 'spring.transaction-proxy', changeType: 'continuing', severity: 'medium', knowledgeStatus: 'stale' },
      quiet: { id: 'z', conceptId: 'spring.bean-relationship', changeType: 'continuing', severity: 'medium', knowledgeStatus: 'known' },
    } as const;
    expect(isEscalated(facts.high as never)).toBe(true);
    expect(isEscalated(facts.stale as never)).toBe(true);
    expect(isEscalated(facts.quiet as never)).toBe(false);
    void high; void staleBinding;

    // End-to-end: a stale concept renders an explicit escalation line with its reason.
    const findings = [makeFinding('s1', 'spring.transaction-proxy', 'Svc.old')];
    const before = stateWith(makeBinding('b0', 'spring.transaction-proxy', 'learning'));
    const after = stateWith(makeBinding('b0', 'spring.transaction-proxy', 'stale'));
    const record = buildRecord(makeReport(findings, { continuingFindingIds: ['s1'] }), before, after);
    const text = renderReviewPresentation(record);
    expect(text).toContain('[升级展示]');
    expect(text).toContain('知识状态待复核');
  });

  it('new insights render in full with importance, knowledge status, primary action and drill-down hint', () => {
    const finding = makeFinding('n1', 'spring.transaction-proxy', 'OrderService.createOrder');
    const after = stateWith(makeBinding('bn1', 'spring.transaction-proxy', 'unassessed'));
    const record = buildRecord(makeReport([finding], { newFindingIds: ['n1'], added: ['OrderService.java'] }), emptyLearningState(), after);
    const text = renderReviewPresentation(record);
    expect(text).toContain('① Spring 事务代理与同类调用');
    expect(text).toContain('状态：本轮新增');
    expect(text).toContain('重要性：HIGH');
    expect(text).toContain('知识状态：新出现知识点');
    expect(text).toContain('为什么值得关注：');
    expect(text).toContain('建议确认：优先检查 OrderService.createOrder');
    expect(text).toContain('[可展开：findingIds 1 条 · evidenceIds 1 条');
    expect(text).toContain('关口：需人工检查（report-only）');
    expect(text).toContain('新增 1 个风险概念');
    expect(text).toContain('Cognitive Debt');
  });

  it('resolved concepts and unknown coverage stay visible with honest scope notes', () => {
    const removed = makeFinding('r1', 'jpa.entity-boundary', 'OldCtrl.get');
    const record = buildRecord(
      makeReport([], { removedFindings: [removed] }, 3),
      stateWith(makeBinding('br', 'jpa.entity-boundary', 'unassessed')),
      stateWith(makeBinding('br', 'jpa.entity-boundary', 'stale')),
    );
    const text = renderReviewPresentation(record);
    expect(text).toContain('✓ 1 个历史风险概念不再出现');
    expect(text).toContain('证据属于基线快照');
    expect(text).toContain('3 个区域存在静态分析 unknown');
    expect(text).toContain('未知不等于无风险');
    // The gate reason still surfaces after the sections.
    expect(text).toContain('关口原因：');
  });

  it('rendering is deterministic: same record → byte-identical text', () => {
    const finding = makeFinding('n1', 'jpa.query-amplification', 'S.loop');
    const after = stateWith(makeBinding('b1', 'jpa.query-amplification', 'unassessed'));
    const record = buildRecord(makeReport([finding], { newFindingIds: ['n1'] }), emptyLearningState(), after);
    expect(renderReviewPresentation(record)).toBe(renderReviewPresentation(record));
    expect(renderReviewPresentation(JSON.parse(JSON.stringify(record)))).toBe(renderReviewPresentation(record));
  });

  it('legacy v0.1 records render versioned — marked as old, insights never fabricated', () => {
    const legacy: ReviewRecordV01 = {
      schemaVersion: '0.1', reviewId: REVIEW_ID, workspaceId: 'ws',
      baseline: { snapshotId: 'b', gitHead: null, gitBase: null, ref: null },
      target: { snapshotId: 't', gitHead: null, files: [], createdAt: AT },
      analysisId: 'a', reportStatus: 'complete',
      versions: { engineVersion: '0.1.0', ruleSetVersion: '1.0.0', protocolVersion: '0.1', adapterVersion: '0.1.0', surface: 'agent-mcp' },
      gate: { state: 'needs_human', reasons: ['1 项新增、0 项持续风险需要人工检查（含证据与验证建议）。'], blocking: false },
      output: {
        changeSummary: '相对基线：新增 1 个文件。',
        pathImpacts: { added: ['A.java'], modified: [], deleted: [] },
        newFindingIds: ['f1'], continuingFindingIds: [], removedFindingIds: [], removedFindingTitles: [],
        evidenceRefs: ['ev-f1'], unknownCoverage: [],
        suggestedChecks: [{ findingId: 'f1', ruleId: 'JPA_CALL_IN_LOOP', symbol: 'A.loop', nextCheck: 'verify A.loop' }],
        conceptRefs: ['jpa.query-amplification'],
        debtDelta: { modelVersion: 'debt-model-v1', before: 0, after: 2, delta: 2, bindingsBefore: 0, bindingsAfter: 1 },
        limitations: [],
      },
    };
    const text = renderReviewPresentation(legacy);
    expect(text).toContain('schema 0.1 · 旧版记录');
    expect(text).toContain('相对基线：新增 1 个文件。');
    expect(text).toContain('① [JPA_CALL_IN_LOOP] A.loop：verify A.loop');
    expect(text).toContain('debt-model-v1');
    expect(text).not.toContain('需要关注');
  });
});

describe('T302: gate semantics survive insight aggregation (plan §16, Case 8)', () => {
  it('partial coverage with zero findings is still incomplete — never pass', () => {
    const report = makeReport([], { newFindingIds: [] });
    report.status = 'partial';
    report.limitations = ['1 个文件语法解析失败，规则未应用于这些文件。'];
    const record = buildRecord(report, emptyLearningState(), emptyLearningState());
    expect(record.gate.state).toBe('incomplete');
    expect(record.gate.reasons.some(r => r.includes('partial'))).toBe(true);
    expect(record.output.coverageSummary.status).toBe('partial');
  });

  it('unknown coverage keeps the gate at needs_human and stays visible after aggregation', () => {
    const finding = makeFinding('n1', 'jpa.query-amplification', 'S.loop');
    const after = stateWith(makeBinding('b1', 'jpa.query-amplification', 'unassessed'));
    const record = buildRecord(makeReport([finding], { newFindingIds: ['n1'] }, 4), emptyLearningState(), after);
    expect(record.gate.state).toBe('needs_human');
    expect(record.gate.reasons.some(r => r.includes('4 项未知/未解析覆盖'))).toBe(true);
    expect(record.output.coverageSummary.unknownCount).toBe(4);
    // The concept-phrased headline keeps finding counts as detail.
    const headline = record.gate.reasons.find(r => r.includes('风险概念'))!;
    expect(headline).toContain('1 个新的风险概念');
    expect(headline).toContain('1 个具体代码位置');
  });

  it('blocking only under explicit enforce policy — aggregation never changes gate policy', () => {
    const finding = makeFinding('n1', 'jpa.query-amplification', 'S.loop');
    const after = stateWith(makeBinding('b1', 'jpa.query-amplification', 'unassessed'));
    const report = makeReport([finding], { newFindingIds: ['n1'] });
    const reportOnly = buildRecord(report, emptyLearningState(), after);
    expect(reportOnly.gate.blocking).toBe(false);
    const enforced = buildReviewRecord({
      session: {
        schemaVersion: '0.1', reviewId: '', workspace: '/tmp/ws', base: null,
        baseline: { id: 'snap-base', workspaceId: 'ws-test', files: [], gitHead: null, gitBase: null, ref: null },
        createdAt: AT,
      },
      report, reviewId: REVIEW_ID,
      versions: { engineVersion: '0.1.0', ruleSetVersion: '1.0.0', protocolVersion: '0.1', adapterVersion: '0.1.0', surface: 'agent-mcp' },
      learningStateBefore: emptyLearningState(), learningStateAfter: after,
      debtBefore: debtSummary(emptyLearningState()), debtAfter: debtSummary(after),
      gateBlocking: true,
    });
    expect(enforced.gate.blocking).toBe(true);
    expect(enforced.gate.state).toBe(reportOnly.gate.state);
  });
});
