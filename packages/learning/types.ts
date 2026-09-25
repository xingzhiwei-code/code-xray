export const LEARNING_CONTENT_VERSION = 'learning-v1';
export type ConceptId =
  | 'spring.transaction-proxy'
  | 'jpa.query-amplification'
  | 'jpa.entity-boundary'
  | 'spring.bean-relationship'
  | 'spring.transaction-boundary'
  | 'jpa.persistence-context';
export type LearningStatus = 'unassessed' | 'to-learn' | 'learning' | 'self-reported' | 'verified' | 'stale' | 'ignored';
export const STATUS_LABELS: Record<LearningStatus, string> = {
  unassessed: '未评估', 'to-learn': '待学习', learning: '学习中',
  'self-reported': '自述理解', verified: '已验证理解', stale: '待复核', ignored: '忽略',
};
export interface LearningBindingInput {
  conceptId: ConceptId;
  codeRef: string;
  codeFingerprint: string;
  evidenceIds: string[];
  findingId?: string;
  impact: 'low' | 'medium' | 'high';
  association: 'direct' | 'inferred' | 'unknown';
  contentVersion?: string;
}
export interface Verification {
  questionId: string; method: 'deterministic-choice'; result: 'passed' | 'failed';
  contentVersion: string; codeFingerprint: string; evidenceIds: string[]; at: string;
}
export interface LearningBinding extends LearningBindingInput {
  id: string; status: LearningStatus; active: boolean; views: number;
  contentVersion: string; createdAt: string; updatedAt: string;
  previousStatus?: Exclude<LearningStatus, 'ignored'>;
  staleReason?: string; ignoreReason?: 'not-relevant' | 'accepted-for-now' | 'user-choice';
  correctedFrom?: ConceptId; verifications: Verification[];
}
interface EventBase { bindingId: string }
export type LearningEvent = EventBase & (
  | { type: 'view' }
  | { type: 'set-status'; status: 'unassessed' | 'to-learn' | 'learning' | 'self-reported' }
  | { type: 'answer'; questionId: string; optionId: string }
  | { type: 'ignore'; reason?: 'not-relevant' | 'accepted-for-now' | 'user-choice' }
  | { type: 'restore' }
  | { type: 'rebind'; conceptId: ConceptId }
  | { type: 'delete' }
);
export interface EventRecord {
  eventId: string; bindingId: string; type: LearningEvent['type']; at: string;
  fingerprint: string; resultStatus: LearningStatus | 'deleted';
}
export interface LearningState {
  learningVersion: 1; bindings: Record<string, LearningBinding>; events: EventRecord[];
  corrections: Record<string, ConceptId>;
}
/**
 * Concept-level aggregation of learning bindings (Review Insight Layer v0.2, plan §7).
 * Four-layer responsibility split:
 *   Concept  = the knowledge the user needs to understand (this record's granularity);
 *   Binding  = one concrete code association of that concept (kept per conceptId+codeRef, never merged away);
 *   Finding  = one analyzer-detected rule instance;
 *   Evidence = the traceable fact behind a finding.
 * A concept appearing at 10 code positions is ONE ConceptKnowledgeState with 10 bindings —
 * not 10 independent knowledge gaps.
 */
export interface ConceptKnowledgeState {
  conceptId: ConceptId;
  /** Aggregated status per CONCEPT_STATUS_PRECEDENCE; 'ignored' only when every binding is ignored. */
  status: LearningStatus;
  /** All binding ids of this concept (including ignored), sorted for determinism. */
  bindingIds: string[];
  activeBindingCount: number;
  verifiedBindingCount: number;
  staleBindingCount: number;
  unassessedBindingCount: number;
  ignoredBindingCount: number;
  /** Current code occurrences of the concept = non-ignored bindings (each anchors one codeRef). */
  occurrenceCount: number;
}
export interface LearningCard {
  conceptId: ConceptId; contentVersion: string; title: string;
  codeRef: string; evidenceIds: string[]; findingId?: string; historicalSnapshot: boolean;
  what: string; whyHere: string; hiddenMechanisms: string; whatIfRemoved: string;
  question: { id: string; prompt: string; options: { id: string; text: string }[]; answerId: string; rationale: string };
  sources: { title: string; url: string }[];
}
/**
 * Cognitive Debt v2 (Review Insight Layer plan §14): concept-level, non-linear.
 * "用户不会一个 Concept ≠ 代码出现 N 次就不会 N 次" — occurrences modulate
 * exposure, they never multiply the knowledge gap linearly.
 */
export interface ConceptDebtItem {
  conceptId: ConceptId;
  /** Aggregated concept status (CONCEPT_STATUS_PRECEDENCE); 'ignored' when every binding is ignored. */
  status: LearningStatus;
  statusLabel: string;
  /** Active (non-ignored) code occurrences of this concept. */
  occurrenceCount: number;
  impact: number;
  gap: number | null;
  evidenceStrength: number | null;
  exposureFactor: number | null;
  /** conceptDebt = impact × gap × evidenceStrength × exposureFactor; null when excluded. */
  priority: number | null;
  impactSource: string;
  gapSource: string;
  evidenceSource: string;
  exposureSource: string;
  /** Binding-level drill-down (bindings are never merged away). */
  bindingIds: string[];
  exclusionReason?: string;
}
/** v1-shaped per-binding row, retained as drill-down detail; NOT summed into the total. */
export interface BindingDebtItem {
  bindingId: string; conceptId: ConceptId; codeRef: string; status: LearningStatus; statusLabel: string;
  /** Linear single-binding reference value (impact × gap × evidenceStrength), drill-down only. */
  priority: number | null;
  impact: number; gap: number | null; evidenceStrength: number | null;
  impactSource: string; evidenceSource: string; exclusionReason?: string;
}
export interface DebtSummary {
  modelVersion: 'debt-model-v2';
  formula: string; meaning: string;
  scope: string; deduplication: string;
  /** Non-linear exposure constants — fully transparent, no hidden magic numbers (plan §14). */
  exposure: { k: number; maxBonus: number; formula: string; samples: { occurrences: number; factor: number }[] };
  total: number; calculatedCount: number;
  unknownCount: number; unassessedCount: number; staleCount: number; ignoredCount: number; inactiveCount: number;
  factors: { impact: Record<string, number>; gap: Record<string, number>; evidenceStrength: Record<string, number> };
  /** Concept-level items (the debt's primary granularity), sorted by priority desc. */
  items: ConceptDebtItem[];
  /** Binding-level drill-down rows, sorted by (concept priority, binding reference value, bindingId). */
  bindingItems: BindingDebtItem[];
}
