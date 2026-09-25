/**
 * Insight Aggregator (Review Insight Layer v0.2, plan §5—§10).
 *
 * Pure deterministic domain service — no I/O, no clock, no randomness, no LLM.
 * Pipeline: Raw Findings + Diff → Concept Aggregation → Knowledge State →
 * Change Attribution → Priority → Actionable Insights.
 *
 * Hard invariants (plan §3):
 * - only aggregates data the analyzer/diff already proved; never invents
 *   runtime facts, never turns unknown into pass;
 * - every insight keeps full drill-down (findingIds / evidenceIds / symbols);
 * - identical input ⇒ byte-identical output (stable ordering everywhere).
 */
import { createHash } from 'node:crypto';
import type { Finding, ReviewInsight, Severity } from '../protocol/index.js';
import { conceptKnowledgeStates, getConceptContent, type LearningState } from '../learning/engine.js';
import type { ConceptKnowledgeState } from '../learning/types.js';
import { emptyInsightsResult, type ReviewInsightsInput, type ReviewInsightsResult } from './types.js';

export * from './types.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Severity rank for "highest severity wins" and deterministic sorting. */
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// ---- Importance (plan §6.1): transparent, testable, deterministic scoring ----
// score = severity + changeType + knowledgeStatus weights, mapped by threshold:
//   critical >= 7 (only reachable with severity 'high' — never inflated by
//   medium-severity facts alone), high >= 5, medium >= 3, low < 3.
// Worked examples: new+high+new-to-user=7 critical; new+medium+unassessed=5
// high (plan §15 example); continuing+high+stale=5 high (fact-backed
// escalation, §12); continuing+low+known=2 low (quiet).
export const IMPORTANCE_WEIGHTS = {
  severity: { high: 3, medium: 2, low: 1 } as Record<Severity, number>,
  changeType: { new: 2, continuing: 1, resolved: 0 } as Record<ReviewInsight['changeType'], number>,
  knowledgeStatus: { 'new-to-user': 2, unassessed: 1, stale: 1, learning: 0, known: 0 } as Record<ReviewInsight['knowledgeStatus'], number>,
} as const;
export const IMPORTANCE_THRESHOLDS = { critical: 7, high: 5, medium: 3 } as const;

export function importanceScore(input: { severity: Severity; changeType: ReviewInsight['changeType']; knowledgeStatus: ReviewInsight['knowledgeStatus'] }): number {
  return IMPORTANCE_WEIGHTS.severity[input.severity]
    + IMPORTANCE_WEIGHTS.changeType[input.changeType]
    + IMPORTANCE_WEIGHTS.knowledgeStatus[input.knowledgeStatus];
}

export function importanceOf(input: { severity: Severity; changeType: ReviewInsight['changeType']; knowledgeStatus: ReviewInsight['knowledgeStatus'] }): ReviewInsight['importance'] {
  const score = importanceScore(input);
  if (score >= IMPORTANCE_THRESHOLDS.critical) return 'critical';
  if (score >= IMPORTANCE_THRESHOLDS.high) return 'high';
  if (score >= IMPORTANCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

const IMPORTANCE_RANK: Record<ReviewInsight['importance'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const CHANGE_RANK: Record<ReviewInsight['changeType'], number> = { new: 0, continuing: 1, resolved: 2 };
const KNOWLEDGE_RANK: Record<ReviewInsight['knowledgeStatus'], number> = { 'new-to-user': 0, unassessed: 1, stale: 2, learning: 3, known: 4 };

/** Deterministic insight identity (plan §4.1): review context + concept + rule set version; never random. */
export function insightId(reviewId: string, conceptId: string, ruleSetVersion: string): string {
  return `ins_${sha256(`${reviewId}|${conceptId}|${ruleSetVersion}`).slice(0, 32)}`;
}

function highestSeverity(findings: Finding[]): Severity {
  return findings.reduce<Severity>((worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst), 'low');
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Knowledge status mapping (plan §8). `new-to-user` requires positive proof:
 * the concept had NO binding before this round AND the concept arrives via new
 * findings. Anything less falls back to the concept-level aggregate — never a
 * guess. An all-ignored concept maps to 'known' for PRIORITIZATION only (the
 * user explicitly acknowledged it); findings stay fully visible regardless.
 */
export function knowledgeStatusOf(concept: ConceptKnowledgeState | undefined, hadPriorBinding: boolean, changeType: ReviewInsight['changeType']): ReviewInsight['knowledgeStatus'] {
  if (!hadPriorBinding && changeType === 'new') return 'new-to-user';
  switch (concept?.status) {
    case 'verified':
    case 'self-reported':
    case 'ignored':
      return 'known';
    case 'learning':
    case 'to-learn':
      return 'learning';
    case 'stale':
      return 'stale';
    default:
      return 'unassessed';
  }
}

/** Primary finding choice (plan §10): new findings first, then higher severity, then stable id order. */
export function pickPrimaryFinding(findings: Finding[], newFindingIds: Set<string>): Finding | undefined {
  return [...findings].sort((a, b) =>
    Number(newFindingIds.has(b.id)) - Number(newFindingIds.has(a.id))
    || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || a.id.localeCompare(b.id, 'en'))[0];
}

interface ConceptFacts {
  conceptId: string;
  current: Finding[];   // new + continuing findings in the target snapshot
  removed: Finding[];   // baseline findings that disappeared (baseline-scoped)
}

function groupByConcept(changed: Finding[], removed: Finding[]): Map<string, ConceptFacts> {
  const groups = new Map<string, ConceptFacts>();
  const group = (conceptId: string): ConceptFacts => {
    let entry = groups.get(conceptId);
    if (!entry) { entry = { conceptId, current: [], removed: [] }; groups.set(conceptId, entry); }
    return entry;
  };
  for (const finding of changed) group(finding.conceptId).current.push(finding);
  for (const finding of removed) group(finding.conceptId).removed.push(finding);
  return groups;
}

function conceptTitle(conceptId: string): string {
  return getConceptContent(conceptId)?.title ?? conceptId;
}

function whyItMattersOf(conceptId: string): string {
  return getConceptContent(conceptId)?.whyHere
    ?? '该概念没有内置学习卡内容；以 Finding 的证据、前提与未知项为准。';
}

/**
 * Build concept-level insights for one review. All inputs are facts produced
 * upstream (report diff + learning states); this function only restructures
 * them — it never re-derives risk and never fabricates escalations.
 */
export function buildReviewInsights(input: ReviewInsightsInput): ReviewInsightsResult {
  const { report, learningStateBefore, learningStateAfter, reviewId, ruleSetVersion } = input;
  const diff = report.diff;
  if (!diff) return { ...emptyInsightsResult, insights: [], resolvedInsights: [] };

  const newFindingIds = new Set(diff.newFindingIds);
  const continuingFindingIds = new Set(diff.continuingFindingIds);
  const changed = report.findings.filter(f => newFindingIds.has(f.id) || continuingFindingIds.has(f.id));
  const conceptStatesAfter = new Map(conceptKnowledgeStates(learningStateAfter).map(s => [s.conceptId as string, s]));
  const conceptsBefore = new Set(Object.values(learningStateBefore.bindings).map(b => b.conceptId as string));
  const groups = groupByConcept(changed, diff.removedFindings);

  const insights: ReviewInsight[] = [];
  const resolvedInsights: ReviewInsight[] = [];

  for (const conceptId of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
    const facts = groups.get(conceptId)!;
    const current = facts.current;
    const removed = facts.removed;
    const conceptState = conceptStatesAfter.get(conceptId);
    const hadPriorBinding = conceptsBefore.has(conceptId);

    if (current.length === 0) {
      // Fully resolved concept: its findings disappeared from the target snapshot.
      const severity = highestSeverity(removed);
      const knowledgeStatus = knowledgeStatusOf(conceptState, hadPriorBinding, 'resolved');
      const primary = pickPrimaryFinding(removed, new Set());
      resolvedInsights.push({
        id: insightId(reviewId, conceptId, ruleSetVersion),
        conceptId, title: conceptTitle(conceptId),
        changeType: 'resolved',
        importance: importanceOf({ severity, changeType: 'resolved', knowledgeStatus }),
        knowledgeStatus,
        summary: `该概念的 ${removed.length} 个基线发现未在目标快照中再出现（代码已修复或移动）。`,
        whyItMatters: whyItMattersOf(conceptId),
        nextAction: '确认移除是有意修复而非模式逃逸；证据属于基线快照，可经 findingIds 在基线报告中追溯。',
        severity,
        occurrenceCount: 0, newOccurrenceCount: 0, continuingOccurrenceCount: 0,
        resolvedOccurrenceCount: removed.length,
        findingIds: sortedUnique(removed.map(f => f.id)),
        evidenceIds: sortedUnique(removed.flatMap(f => f.evidenceIds)),
        symbols: sortedUnique(removed.map(f => f.symbol)),
        ...(primary ? { primaryFindingId: primary.id, ...(primary.evidenceIds[0] ? { primaryEvidenceId: primary.evidenceIds[0] } : {}) } : {}),
        evidenceScope: 'baseline',
      });
      continue;
    }

    const newOnes = current.filter(f => newFindingIds.has(f.id));
    const continuingOnes = current.filter(f => continuingFindingIds.has(f.id));
    const changeType: ReviewInsight['changeType'] = newOnes.length > 0 ? 'new' : 'continuing';
    const severity = highestSeverity(current);
    const knowledgeStatus = knowledgeStatusOf(conceptState, hadPriorBinding, changeType);
    const primary = pickPrimaryFinding(current, newFindingIds);
    const occurrenceCount = current.length;
    const others = occurrenceCount - 1;
    const summary = changeType === 'new'
      ? `本轮新增 ${newOnes.length} 个代码位置${continuingOnes.length ? `，另有 ${continuingOnes.length} 个已有相关位置持续存在` : ''}${removed.length ? `；${removed.length} 个基线位置已消失` : ''}。`
      : `${continuingOnes.length} 个已有代码位置持续存在，本轮没有新增位置${removed.length ? `；${removed.length} 个基线位置已消失` : ''}。`;
    const nextAction = primary
      ? `优先检查 ${primary.symbol}：${primary.nextCheck}${others > 0 ? `（该概念本轮共涉及 ${occurrenceCount} 个位置，其余 ${others} 个经 findingIds/evidenceIds 钻取）` : ''}`
      : '经 findingIds 查看该概念的全部位置。';
    insights.push({
      id: insightId(reviewId, conceptId, ruleSetVersion),
      conceptId, title: conceptTitle(conceptId),
      changeType,
      importance: importanceOf({ severity, changeType, knowledgeStatus }),
      knowledgeStatus,
      summary,
      whyItMatters: whyItMattersOf(conceptId),
      nextAction,
      severity,
      occurrenceCount,
      newOccurrenceCount: newOnes.length,
      continuingOccurrenceCount: continuingOnes.length,
      resolvedOccurrenceCount: removed.length,
      findingIds: sortedUnique(current.map(f => f.id)),
      evidenceIds: sortedUnique(current.flatMap(f => f.evidenceIds)),
      symbols: sortedUnique(current.map(f => f.symbol)),
      ...(primary ? { primaryFindingId: primary.id, ...(primary.evidenceIds[0] ? { primaryEvidenceId: primary.evidenceIds[0] } : {}) } : {}),
      evidenceScope: 'target',
    });
  }

  // Deterministic ordering (plan §6.1): change type → importance → severity →
  // knowledge status → exposure → stable conceptId tie breaker.
  insights.sort((a, b) =>
    CHANGE_RANK[a.changeType] - CHANGE_RANK[b.changeType]
    || IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]
    || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || KNOWLEDGE_RANK[a.knowledgeStatus] - KNOWLEDGE_RANK[b.knowledgeStatus]
    || b.occurrenceCount - a.occurrenceCount
    || a.conceptId.localeCompare(b.conceptId, 'en'));
  resolvedInsights.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || b.resolvedOccurrenceCount - a.resolvedOccurrenceCount
    || a.conceptId.localeCompare(b.conceptId, 'en'));

  return {
    insights, resolvedInsights,
    newInsightCount: insights.filter(i => i.changeType === 'new').length,
    continuingInsightCount: insights.filter(i => i.changeType === 'continuing').length,
    resolvedInsightCount: resolvedInsights.length,
  };
}
