export const LEARNING_CONTENT_VERSION = 'learning-v1';
export type ConceptId = 'spring.transaction-proxy' | 'jpa.query-amplification' | 'jpa.entity-boundary';
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
export interface LearningCard {
  conceptId: ConceptId; contentVersion: string; title: string;
  codeRef: string; evidenceIds: string[]; findingId?: string; historicalSnapshot: boolean;
  what: string; whyHere: string; hiddenMechanisms: string; whatIfRemoved: string;
  question: { id: string; prompt: string; options: { id: string; text: string }[]; answerId: string; rationale: string };
  sources: { title: string; url: string }[];
}
export interface DebtSummary {
  modelVersion: 'debt-model-v1'; formula: string; meaning: string;
  scope: string; deduplication: string; total: number; calculatedCount: number;
  unknownCount: number; unassessedCount: number; staleCount: number; ignoredCount: number; inactiveCount: number;
  factors: { impact: Record<string, number>; gap: Record<string, number>; evidenceStrength: Record<string, number> };
  items: { bindingId: string; conceptId: ConceptId; codeRef: string; status: LearningStatus; statusLabel: string;
    priority: number | null; impact: number; gap: number | null; evidenceStrength: number | null;
    impactSource: string; evidenceSource: string; exclusionReason?: string }[];
}
