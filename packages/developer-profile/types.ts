export const DEVELOPER_PROFILE_VERSION = 'developer-profile-v1';

export type ProfileSkillLevel = 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type ProfileConfidence = 'low' | 'medium' | 'high';
export type ProfileEvidenceKind =
  | 'self-assessment'
  | 'onboarding-answer'
  | 'verified-learning'
  | 'cli-update'
  | 'project-scan';

export type ProfileDimension =
  | 'language'
  | 'framework'
  | 'engineering'
  | 'domain'
  | 'tool';

export interface ProfileEvidence {
  id: string;
  kind: ProfileEvidenceKind;
  observedAt: string;
  summary: string;
}

export interface ProfileSkill {
  dimension: ProfileDimension;
  key: string;
  label: string;
  level: ProfileSkillLevel;
  confidence: ProfileConfidence;
  evidenceIds: string[];
  updatedAt: string;
}

export interface DeveloperProfile {
  schemaVersion: typeof DEVELOPER_PROFILE_VERSION;
  createdAt: string;
  updatedAt: string;
  roles: ProfileSkill['key'][];
  primaryRole?: ProfileSkill['key'];
  skills: Record<string, ProfileSkill>;
  evidence: Record<string, ProfileEvidence>;
}

export interface ProfileSkillInput {
  dimension: ProfileDimension;
  key: string;
  label: string;
  level: ProfileSkillLevel;
  confidence?: ProfileConfidence;
  evidenceKind?: ProfileEvidenceKind;
  evidenceSummary?: string;
}

export interface KnowledgeGap {
  conceptId: string;
  requiredSkillKey: string;
  skillLabel: string;
  reason: 'profile-missing' | 'skill-missing' | 'learning-state-used' | 'profile-signal';
  reasonLabel: string;
  learningStatus: 'unassessed' | 'to-learn' | 'learning' | 'self-reported' | 'verified' | 'stale';
  learningStatusLabel: string;
  priority: number | null;
  evidenceIds: string[];
  evidenceSummary: string;
  strongestSkillKey?: string;
}
export type KnowledgeGapLearningStatus = KnowledgeGap['learningStatus'];

export interface KnowledgeGapSummary {
  profileVersion: string;
  profileConfigured: boolean;
  conceptIds: string[];
  items: KnowledgeGap[];
}

// ---------- Developer Context v2 (T303 plan §4—§6, §18—§19) ----------

export const DEVELOPER_CONTEXT_VERSION = 'developer-context-v1';

/**
 * Evidence provenance (T303 §5): every claim about the developer carries its
 * source. `self-reported` is a claim, never a fact; `observed` comes from real
 * coding activity; `inferred` is system-derived and must stay visibly inferred;
 * `verified` means the user confirmed it through an explicit check/learning
 * event; `unknown` means "not enough evidence", never "cannot do" (§3.5).
 */
export type EvidenceProvenance = 'self-reported' | 'observed' | 'inferred' | 'verified' | 'unknown';

/** Freshness (T303 §6): yesterday's observation ≠ 18-months-ago observation. */
export type ContextFreshness = 'fresh' | 'aging' | 'stale';

export type ContextEvidenceKind = ProfileEvidenceKind | 'observation' | 'correction';

export interface ContextEvidence {
  id: string;
  kind: ContextEvidenceKind;
  provenance: EvidenceProvenance;
  observedAt: string;
  summary: string;
  /** Skill this evidence belongs to (stored key `dimension:key`), when applicable. */
  skillKey?: string;
  /** Corrections never erase history: they reference what they correct (§18). */
  correctsEvidenceId?: string;
  correction?: 'unfamiliar' | 'familiar';
}

/**
 * Skill state as evidence aggregation — NOT a capability score (§3.3). It says
 * "the system has this much recent evidence from this kind of source", never
 * "the user scores N". No numeric level×confidence signal is exposed here.
 */
export interface SkillAssessment {
  dimension: ProfileDimension;
  key: string;
  label: string;
  /** Aggregated from evidence: the strongest honest source, never user-set (§3.2). */
  provenance: EvidenceProvenance;
  confidence: ProfileConfidence;
  /** Snapshot at last write; consumers needing accuracy recompute via freshnessOf(lastObservedAt, now). */
  freshness: ContextFreshness;
  evidenceCount: number;
  observationCount: number;
  lastObservedAt: string | null;
  evidenceIds: string[];
  updatedAt: string;
  /** Latest explicit user correction; blocks familiarity-driven skips within its window (§18, §22 Case E). */
  lastCorrection?: { at: string; direction: 'unfamiliar' | 'familiar' };
  /** Descriptive only, from v1 migration or explicit CLI input; never a numeric score. */
  legacyLevel?: ProfileSkillLevel;
  legacyConfidence?: ProfileConfidence;
}

/** Aggregated technology usage — structured signal for the Relevance Gate, never a behavior log (§17). */
export interface DeveloperObservation {
  skillKey: string;
  dimension: ProfileDimension;
  label: string;
  count: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

/** Reserved user control (§31.5): the gate honors these; a full management UI is deferred. */
export interface DeveloperPreference {
  id: string;
  /** Glob-like scope over relative file paths, e.g. `frontend/*`. */
  scope: string;
  preference: 'skip-deep-analysis' | 'always-analyze';
  provenance: EvidenceProvenance;
  createdAt: string;
}

export interface DeveloperContext {
  schemaVersion: typeof DEVELOPER_CONTEXT_VERSION;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  primaryRole?: string;
  skills: Record<string, SkillAssessment>;
  observations: Record<string, DeveloperObservation>;
  preferences: DeveloperPreference[];
  evidence: Record<string, ContextEvidence>;
}

/** What developer/profile.json may contain: v1 (read + migrate) or v2 (write). */
export type StoredDeveloperData = DeveloperProfile | DeveloperContext;

export interface TechnologySighting {
  dimension: ProfileDimension;
  key: string;
  label: string;
}
