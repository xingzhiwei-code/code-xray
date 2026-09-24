/**
 * Review record assembly (Review Insight Layer v0.2, plan §5/§11/§16).
 *
 * Domain service shared by every Surface: turns the fact layer
 * (AnalysisReport + diff + learning states + debt summaries) into a
 * ReviewRecord 0.2 through the Insight Aggregator. Surfaces (MCP bridge
 * today; CLI/VSCode later) only adapt protocol and policy — aggregation and
 * gate rules live here, never in an adapter (plan §21-4).
 *
 * Honesty invariants: the gate never passes on partial/unknown/failed;
 * insight text only re-states analyzer-proven facts; legacy v0.1 fields are
 * preserved for migration but no longer the primary consumer surface.
 */
import type {
  AnalysisReport, Diagnostic, Gate, ReviewDebtDelta, ReviewOutput,
  ReviewRecord, ReviewSession, ReviewVersions,
} from '../protocol/index.js';
import { assertReviewRecord, REVIEW_SCHEMA_VERSION } from '../protocol/index.js';
import type { DebtSummary, LearningState } from '../learning/engine.js';
import { conceptKnowledgeStates } from '../learning/engine.js';
import { buildReviewInsights } from './engine.js';

/** Caps keep the tool channel bounded; full detail always stays in the persisted report. */
export const REVIEW_PATH_LIMIT = 50;

export interface BuildReviewRecordInput {
  session: ReviewSession;
  /** Target-snapshot report; MUST carry the diff against the review baseline. */
  report: AnalysisReport;
  reviewId: string;
  versions: ReviewVersions;
  learningStateBefore: LearningState;
  learningStateAfter: LearningState;
  debtBefore: DebtSummary;
  debtAfter: DebtSummary;
  /** Surface policy input (e.g. env-driven); the domain itself stays pure. */
  gateBlocking: boolean;
}

export function buildReviewRecord(input: BuildReviewRecordInput): ReviewRecord {
  const { report, session, reviewId, versions, learningStateBefore, learningStateAfter, debtBefore, debtAfter } = input;
  const diff = report.diff;
  const newIds = diff?.newFindingIds ?? [];
  const continuingIds = diff?.continuingFindingIds ?? [];
  const removed = diff?.removedFindings ?? [];

  const aggregated = buildReviewInsights({
    reviewId, ruleSetVersion: versions.ruleSetVersion, report,
    learningStateBefore, learningStateAfter,
  });

  const changedFindings = report.findings.filter(f => newIds.includes(f.id) || continuingIds.includes(f.id));
  const evidenceRefs = [...new Set(changedFindings.flatMap(f => f.evidenceIds))].sort((a, b) => a.localeCompare(b, 'en')).slice(0, REVIEW_PATH_LIMIT);
  const findingById = new Map(report.findings.map(f => [f.id, f]));

  // v0.2 (plan §13): ONE primary suggested check per insight — the concept's
  // primary finding keeps the analyzer's raw nextCheck; the other occurrences
  // stay reachable through the insight's findingIds/evidenceIds drill-down.
  const suggestedChecks: ReviewOutput['suggestedChecks'] = [];
  for (const insight of aggregated.insights) {
    const finding = insight.primaryFindingId ? findingById.get(insight.primaryFindingId) : undefined;
    if (!finding) continue;
    suggestedChecks.push({
      insightId: insight.id, findingId: finding.id, ruleId: finding.ruleId,
      symbol: finding.symbol, nextCheck: finding.nextCheck,
    });
  }

  const filesChanged = (diff?.added.length ?? 0) + (diff?.modified.length ?? 0) + (diff?.deleted.length ?? 0);
  const debtDelta: ReviewDebtDelta = {
    modelVersion: debtAfter.modelVersion,
    before: debtBefore.total, after: debtAfter.total, delta: Number((debtAfter.total - debtBefore.total).toFixed(2)),
    bindingsBefore: Object.keys(learningStateBefore.bindings).length,
    bindingsAfter: Object.keys(learningStateAfter.bindings).length,
    conceptsBefore: conceptKnowledgeStates(learningStateBefore).length,
    conceptsAfter: conceptKnowledgeStates(learningStateAfter).length,
  };

  const coverageReasons: Diagnostic[] = report.coverage.reasons.map(r => ({ path: r.path, code: r.code, message: r.message }));
  const output: ReviewOutput = {
    // ---- v0.2 primary consumer surface ----
    overview: {
      filesChanged,
      newInsightCount: aggregated.newInsightCount,
      continuingInsightCount: aggregated.continuingInsightCount,
      resolvedInsightCount: aggregated.resolvedInsightCount,
      newFindingCount: newIds.length,
      continuingFindingCount: continuingIds.length,
      resolvedFindingCount: removed.length,
    },
    insights: aggregated.insights,
    resolvedInsights: aggregated.resolvedInsights,
    coverageSummary: { status: report.status, unknownCount: report.coverage.unknown, reasons: coverageReasons },
    // ---- legacy v0.1 fields (migration period drill-down detail) ----
    changeSummary: diff
      ? `相对基线：新增 ${diff.added.length} 个文件、修改 ${diff.modified.length} 个、删除 ${diff.deleted.length} 个；新增风险 ${newIds.length} 项、持续 ${continuingIds.length} 项、移除 ${removed.length} 项。${report.summary}`
      : `无基线对比（缺少 diff）：${report.summary}`,
    pathImpacts: {
      added: (diff?.added ?? []).slice(0, REVIEW_PATH_LIMIT),
      modified: (diff?.modified ?? []).slice(0, REVIEW_PATH_LIMIT),
      deleted: (diff?.deleted ?? []).slice(0, REVIEW_PATH_LIMIT),
    },
    newFindingIds: newIds, continuingFindingIds: continuingIds,
    removedFindingIds: removed.map(f => f.id), removedFindingTitles: removed.map(f => f.title),
    evidenceRefs,
    unknownCoverage: coverageReasons.slice(0, REVIEW_PATH_LIMIT).map(r => ({ path: r.path, code: r.code, message: r.message })),
    suggestedChecks,
    conceptRefs: [...new Set(changedFindings.map(f => f.conceptId))].sort((a, b) => a.localeCompare(b, 'en')),
    debtDelta,
    limitations: [...report.limitations, ...(diff?.limitations ?? [])],
  };

  const record: ReviewRecord = {
    schemaVersion: REVIEW_SCHEMA_VERSION as '0.2',
    reviewId,
    workspaceId: report.snapshot.workspaceId,
    baseline: { snapshotId: session.baseline.id, gitHead: session.baseline.gitHead, gitBase: session.baseline.gitBase, ref: session.baseline.ref },
    target: { snapshotId: report.snapshot.id, gitHead: report.snapshot.gitHead, files: report.snapshot.files, createdAt: report.createdAt },
    analysisId: report.analysisId,
    reportStatus: report.status,
    versions,
    gate: computeGate(report, output, input.gateBlocking),
    output,
  };
  assertReviewRecord(record);
  return record;
}

/**
 * Gate semantics (PRD §8.5-5, plan §16): partial != pass, unknown != pass,
 * failed != pass — insight aggregation never launders coverage uncertainty.
 * The headline reason is phrased in concepts (human cognition), with finding
 * counts preserved as detail. Blocking only under an explicit enforce policy.
 */
export function computeGate(report: AnalysisReport, output: ReviewOutput, blocking: boolean): Gate {
  if (report.status === 'failed' || report.status === 'cancelled')
    return { state: 'failed', reasons: [`分析状态为 ${report.status}，审查结论不可用。`], blocking };
  const reasons: string[] = [];
  if (report.status === 'partial') reasons.push('覆盖不完整（partial）：存在解析失败或快照变化，结论范围受限。');
  const { newInsightCount, continuingInsightCount, newFindingCount, continuingFindingCount } = output.overview;
  const risky = newFindingCount + continuingFindingCount;
  if (risky > 0)
    reasons.push(`本轮产生 ${newInsightCount} 个新的风险概念（${newFindingCount} 个具体代码位置），另有 ${continuingInsightCount} 个已有风险概念持续存在（${continuingFindingCount} 个位置）；需要人工检查，证据与验证建议可经 insights 钻取。`);
  if (report.coverage.unknown > 0) reasons.push(`${report.coverage.unknown} 项未知/未解析覆盖，已在 coverageSummary 列出；未知不等于无风险。`);
  if (reasons.length === 0 && report.status === 'complete')
    return { state: 'pass', reasons: ['分析完成且变更范围内没有触发规则；零发现不等于没有问题，覆盖与限制见 output。'], blocking: false };
  const state = report.status === 'partial' ? 'incomplete' : 'needs_human';
  return { state, reasons, blocking };
}
