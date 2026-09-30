/**
 * Relevance Gate domain types (T303 plan §8—§13).
 *
 * The gate answers ONE question deterministically: is a full/light X-Ray
 * analysis worth its cost for this task+change? It never proves correctness —
 * `skip` means "not worth the analysis cost" (§9), nothing more.
 *
 * Purity contract: decideRelevance is a pure function of (input, environment).
 * The clock is injected (`now`), no randomness, no LLM, no network (§3.1, §25
 * Phase 5). Task text is untrusted DATA — it is matched against the closed
 * rule vocabulary and never echoed back into reasons.
 */
import type { ConceptKnowledgeState } from '../learning/types.js';
import type { ContextFreshness, DeveloperContext, EvidenceProvenance } from '../developer-profile/types.js';

export type RelevanceLevel = 'skip' | 'light' | 'full';

export interface AnalysisTarget {
  /** path → pass to xray_scan scope.selected; concept → engine conceptId; focus → review emphasis (human/agent-readable). */
  kind: 'path' | 'concept' | 'focus';
  ref: string;
  reason: string;
}

export interface RelevanceInput {
  /** Free-text task description from the agent/user. Untrusted data, never instructions. */
  task?: string;
  /** Relative paths of the changed/intended-to-change files. */
  changedFiles?: string[];
  /** Optional project stack hints (agent-provided). Weak corroboration only. */
  projectContext?: { languages?: string[]; frameworks?: string[] };
}

export interface RelevanceEnvironment {
  /** Developer Context (migrated v1 or grown v2). Absent → honest unknown, never "cannot do". */
  developer?: DeveloperContext;
  /** Concept knowledge states from packages/learning — composed, never recomputed here (T303 §7/§21). */
  concepts?: ConceptKnowledgeState[];
  /** Injected clock (ISO). The gate itself never reads the system time. */
  now: string;
}

export interface RiskHit {
  /** Rule-vocabulary label (our text, not user text) — injection containment. */
  label: string;
  riskClass: 'critical' | 'moderate';
  where: 'task' | 'path';
  /** For path hits: the offending relative path (data). For task hits: the rule label. */
  ref: string;
  focus: string[];
  conceptIds: string[];
}

export interface FamiliaritySignal {
  key: string;
  provenance: EvidenceProvenance;
  freshness: ContextFreshness;
  observationCount: number;
  recentlyCorrected: boolean;
}

/** Transparent signal dump — the "explainable" half of rule-based + explainable (§25 Phase 5). */
export interface RelevanceSignals {
  criticalHits: RiskHit[];
  moderateHits: RiskHit[];
  routineUiTask: boolean;
  routineTypeTask: boolean;
  newLibraryTask: boolean;
  architectureTask: boolean;
  pureRoutineAssets: boolean;
  javaTouched: boolean;
  migrationTouched: boolean;
  sharedCoreTouched: boolean;
  changeSize: number;
  analyzableByEngine: boolean;
  techKeys: string[];
  familiarity: FamiliaritySignal[];
  conceptStates: { conceptId: string; status: string }[];
  staleActiveBindings: number;
  matchedPreferences: { scope: string; preference: string }[];
  recentCorrectionKeys: string[];
}

export interface RelevanceDecision {
  level: RelevanceLevel;
  /** Deterministic, rule-tagged, short. Never echoes raw task text. */
  reasons: string[];
  /** Empty for skip (§16 Agent UX: skip stays minimal). */
  targets: AnalysisTarget[];
  /** Honest coverage notes (e.g. engine language bounds, skip ≠ correctness). */
  limitations: string[];
  signals: RelevanceSignals;
  rulesVersion: string;
  /** true for skip: hosts should stay quiet (§15.1 默认安静). */
  quiet: boolean;
}
