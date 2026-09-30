import { createHash } from 'node:crypto';
import type { AnalysisReport } from '../protocol/index.js';
import {
  DEVELOPER_CONTEXT_VERSION, DEVELOPER_PROFILE_VERSION,
  type ContextEvidence, type ContextEvidenceKind, type ContextFreshness, type DeveloperContext,
  type DeveloperObservation, type DeveloperPreference, type DeveloperProfile, type EvidenceProvenance,
  type KnowledgeGap, type KnowledgeGapSummary,
  type KnowledgeGapLearningStatus,
  type ProfileConfidence, type ProfileDimension, type ProfileEvidence, type ProfileEvidenceKind,
  type ProfileSkill, type ProfileSkillInput,
  type SkillAssessment,
  type StoredDeveloperData, type TechnologySighting,
} from './types.js';
import { STATUS_LABELS, type ConceptId, type LearningStatus } from '../learning/types.js';
import { GAP, learningStatusFor, type LearningState } from '../learning/engine.js';

export { DEVELOPER_CONTEXT_VERSION, DEVELOPER_PROFILE_VERSION } from './types.js';
export type * from './types.js';

const hash = (...items: (string | number)[]) => createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 20);

const LEVEL_NUMBERS: Record<ProfileSkill['level'], number> = {
  novice: 1, beginner: 2, intermediate: 3, advanced: 4, expert: 5,
};
const CONFIDENCE_WEIGHTS: Record<NonNullable<ProfileSkill['confidence']>, number> = {
  low: 0.5, medium: 0.75, high: 1,
};

const CONCEPT_SKILLS: Record<ConceptId, { key: string; label: string }> = {
  'spring.transaction-proxy': { key: 'framework:spring', label: 'Spring' },
  'jpa.query-amplification': { key: 'framework:jpa', label: 'JPA / Hibernate' },
  'jpa.entity-boundary': { key: 'framework:jpa', label: 'JPA / Hibernate' },
  'spring.bean-relationship': { key: 'framework:spring', label: 'Spring' },
  'spring.transaction-boundary': { key: 'framework:spring', label: 'Spring' },
  'jpa.persistence-context': { key: 'framework:jpa', label: 'JPA / Hibernate' },
};

export function emptyDeveloperProfile(at = new Date().toISOString()): DeveloperProfile {
  return {
    schemaVersion: DEVELOPER_PROFILE_VERSION,
    createdAt: at, updatedAt: at,
    roles: [], skills: {}, evidence: {},
  };
}

export function normalizeSkillKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9+._:-]/g, '');
}

export function upsertSkill(profile: DeveloperProfile, input: ProfileSkillInput, at = new Date().toISOString()): DeveloperProfile {
  const key = normalizeSkillKey(input.key);
  if (!key) throw new Error('技能 key 不能为空。');
  if (!LEVEL_NUMBERS[input.level]) throw new Error(`无效技能等级：${input.level}`);
  const storedKey = `${input.dimension}:${key}`;
  const existing = profile.skills[storedKey];
  const evidenceKind = input.evidenceKind ?? 'self-assessment';
  const evidenceId = `pe_${hash(evidenceKind, key, input.level, at, Object.keys(profile.evidence).length)}`;
  const summary = input.evidenceSummary?.trim()
    || (existing ? `更新 ${existing.label}：${existing.level} → ${input.level}` : `初始画像：${input.label} = ${input.level}`);
  return {
    ...profile,
    updatedAt: at,
    skills: {
      ...profile.skills,
      [storedKey]: {
        dimension: input.dimension, key: storedKey, label: input.label, level: input.level,
        confidence: input.confidence ?? existing?.confidence ?? 'medium',
        evidenceIds: [...(existing?.evidenceIds ?? []), evidenceId],
        updatedAt: at,
      },
    },
    evidence: {
      ...profile.evidence,
      [evidenceId]: { id: evidenceId, kind: evidenceKind, observedAt: at, summary },
    },
  };
}

export function setRoles(profile: DeveloperProfile, roleKeys: string[], primaryRole: string | undefined, at = new Date().toISOString()): DeveloperProfile {
  const normalized = roleKeys.map(normalizeSkillKey).filter(Boolean);
  const unique = [...new Set(normalized)];
  if (primaryRole !== undefined) {
    const primary = normalizeSkillKey(primaryRole);
    if (!primary) throw new Error('primary role 不能为空。');
    if (!unique.includes(primary)) unique.unshift(primary);
  }
  return { ...profile, updatedAt: at, roles: unique, ...(primaryRole !== undefined ? { primaryRole: normalizeSkillKey(primaryRole) } : {}) };
}

export function profileSignal(profile: DeveloperProfile, skillKey: string): number | null {
  const requested = normalizeSkillKey(skillKey);
  const skill = Object.values(profile.skills).find(candidate => candidate.key === requested || candidate.key.endsWith(`:${requested}`));
  if (!skill) return null;
  return Number((LEVEL_NUMBERS[skill.level] * CONFIDENCE_WEIGHTS[skill.confidence]).toFixed(2));
}

/**
 * Required knowledge is matched to the developer profile. Learning state is
 * never overwritten: it remains the evidence for what this developer verified
 * in this codebase. A missing profile is visible, never treated as zero.
 */
export function knowledgeGaps(report: AnalysisReport, profile: DeveloperProfile | undefined, learningState?: LearningState): KnowledgeGapSummary {
  const items: KnowledgeGap[] = [...new Set(report.findings.map(f => f.conceptId))]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map(conceptId => {
      const skill = CONCEPT_SKILLS[conceptId as ConceptId];
      if (!skill) throw new Error(`概念没有画像技能映射：${conceptId}`);
      const related = Object.values(profile?.skills ?? {}).filter(candidate => {
        if (candidate.key === skill.key) return true;
        return candidate.dimension === 'domain'
          && candidate.key.split(/[+:-]/).some(part => part && skill.key.split(':').includes(part));
      });
      const strongest = related.sort((a, b) =>
        (LEVEL_NUMBERS[b.level] * CONFIDENCE_WEIGHTS[b.confidence]) - (LEVEL_NUMBERS[a.level] * CONFIDENCE_WEIGHTS[a.confidence])
        || a.key.localeCompare(b.key, 'en'))[0];
      const signal = strongest ? profileSignal(profile!, strongest.key) : null;
      const learningStatus: KnowledgeGapLearningStatus = learningState
        ? learningStatusFor(learningState, conceptId as ConceptId)
        : 'unassessed';
      const reason: KnowledgeGap['reason'] = !profile
        ? 'profile-missing'
        : !strongest || signal === null
          ? 'skill-missing'
          : learningStatus === 'verified' || learningStatus === 'self-reported'
            ? 'learning-state-used'
            : 'profile-signal';
      return {
        conceptId, requiredSkillKey: skill.key, skillLabel: skill.label,
        reason, reasonLabel: reason === 'profile-missing'
          ? '开发者画像未建立'
          : reason === 'skill-missing'
            ? '画像缺少该技能'
            : reason === 'learning-state-used'
              ? '项目学习状态已覆盖画像'
              : '画像信号',
        learningStatus,
        learningStatusLabel: STATUS_LABELS[learningStatus],
        priority: signal === null ? null : Number((signal * GAP[learningStatus]).toFixed(2)),
        evidenceIds: strongest?.evidenceIds ?? [],
        evidenceSummary: strongest ? `${strongest.label}（${strongest.level}，confidence ${strongest.confidence}）` : '无画像证据',
        ...(strongest ? { strongestSkillKey: strongest.key } : {}),
      } satisfies KnowledgeGap;
    });
  return {
    profileVersion: DEVELOPER_PROFILE_VERSION,
    profileConfigured: Boolean(profile && Object.keys(profile.skills).length > 0),
    conceptIds: items.map(item => item.conceptId),
    items,
  };
}

// ================= Developer Context v2 (T303) =================
//
// Boundary (T303 §7): DeveloperContext holds Role/Skill/Domain/Preference/
// Evidence ABOUT THE DEVELOPER. Concept knowledge (does the user understand
// spring.transaction-boundary IN THIS CODEBASE) stays in packages/learning
// (ConceptKnowledgeState). This module never copies that state; the Relevance
// Gate composes both.

/** Freshness thresholds in days (T303 §6). Exported constants — no hidden magic numbers. */
export const FRESH_DAYS = 30;
export const AGING_DAYS = 180;

/** Confidence from observed usage counts (T303 §17 passive growth). Transparent, tested. */
export const OBSERVED_CONFIDENCE_HIGH_COUNT = 5;
export const OBSERVED_CONFIDENCE_MEDIUM_COUNT = 2;

/** A correction blocks familiarity-driven skips for this many days (T303 §18, §31.4). */
export const CORRECTION_BLOCK_DAYS = 30;

/** Provenance strength order — aggregation picks the strongest honest source. */
export const PROVENANCE_RANK: Record<EvidenceProvenance, number> = {
  verified: 4, observed: 3, inferred: 2, 'self-reported': 1, unknown: 0,
};

/** v1 evidence kind → provenance (T303 §19). Never fabricates a stronger source. */
export const V1_KIND_PROVENANCE: Record<ProfileEvidenceKind, EvidenceProvenance> = {
  'self-assessment': 'self-reported',
  'onboarding-answer': 'self-reported',
  'cli-update': 'self-reported',
  'verified-learning': 'verified',
  'project-scan': 'observed',
};

export function freshnessOf(lastObservedAt: string | null, now: string): ContextFreshness {
  if (!lastObservedAt) return 'stale';
  const days = (Date.parse(now) - Date.parse(lastObservedAt)) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 'fresh'; // unparsable/future (clock skew) → treat as freshest, honestly visible via lastObservedAt
  if (days <= FRESH_DAYS) return 'fresh';
  if (days <= AGING_DAYS) return 'aging';
  return 'stale';
}

export function emptyDeveloperContext(at = new Date().toISOString()): DeveloperContext {
  return {
    schemaVersion: DEVELOPER_CONTEXT_VERSION,
    createdAt: at, updatedAt: at,
    roles: [], skills: {}, observations: {}, preferences: [], evidence: {},
  };
}

export function isDeveloperContext(value: StoredDeveloperData | undefined): value is DeveloperContext {
  return (value as DeveloperContext | undefined)?.schemaVersion === DEVELOPER_CONTEXT_VERSION;
}

function aggregateConfidence(provenance: EvidenceProvenance, observationCount: number): ProfileConfidence {
  if (provenance === 'verified') return 'high';
  if (provenance === 'observed')
    return observationCount >= OBSERVED_CONFIDENCE_HIGH_COUNT ? 'high'
      : observationCount >= OBSERVED_CONFIDENCE_MEDIUM_COUNT ? 'medium' : 'low';
  return 'low';
}

/**
 * Migrate developer-profile-v1 → developer-context-v1 (T303 §19, Phase 3).
 * Deterministic and idempotent: original evidence ids/kinds/summaries are kept
 * verbatim, provenance is mapped from the evidence kind (never invented), and
 * a user-filled level becomes `self-reported / low` unless stronger evidence
 * exists. v1 confidence stays reachable through legacyConfidence so the
 * existing knowledge-gap ordering is bit-for-bit unchanged.
 */
export function migrateProfileToContext(profile: DeveloperProfile, at = new Date().toISOString()): DeveloperContext {
  const evidence: Record<string, ContextEvidence> = {};
  for (const item of Object.values(profile.evidence)) {
    evidence[item.id] = {
      id: item.id, kind: item.kind, provenance: V1_KIND_PROVENANCE[item.kind] ?? 'unknown',
      observedAt: item.observedAt, summary: item.summary,
    };
  }
  const skills: DeveloperContext['skills'] = {};
  for (const skill of Object.values(profile.skills)) {
    const linked = skill.evidenceIds.map(id => evidence[id]).filter((e): e is ContextEvidence => Boolean(e));
    const provenance = strongestProvenance(linked.map(item => item.provenance));
    const lastObservedAt = linked.map(e => e.observedAt).sort().at(-1) ?? skill.updatedAt;
    const observationCount = linked.filter(e => e.provenance === 'observed').length;
    const correction = linked.filter(e => e.kind === 'correction').sort((a, b) => a.observedAt.localeCompare(b.observedAt)).at(-1);
    skills[skill.key] = {
      dimension: skill.dimension, key: skill.key, label: skill.label,
      provenance,
      // §19: a user-filled level is a claim → self-reported/low; verified/observed keep honest confidence.
      confidence: provenance === 'self-reported' || provenance === 'unknown' ? 'low' : aggregateConfidence(provenance, observationCount),
      freshness: freshnessOf(lastObservedAt, at),
      evidenceCount: linked.length,
      observationCount,
      lastObservedAt: lastObservedAt ?? null,
      evidenceIds: [...skill.evidenceIds],
      updatedAt: skill.updatedAt,
      ...(correction ? { lastCorrection: { at: correction.observedAt, direction: correction.correction ?? 'unfamiliar' } } : {}),
      legacyLevel: skill.level,
      legacyConfidence: skill.confidence,
    };
  }
  return {
    schemaVersion: DEVELOPER_CONTEXT_VERSION,
    createdAt: profile.createdAt, updatedAt: at,
    roles: [...profile.roles],
    ...(profile.primaryRole ? { primaryRole: profile.primaryRole } : {}),
    skills, observations: {}, preferences: [], evidence,
  };
}

/** Versioned read (same principle as ReviewRecord 0.1/0.2, D013): v1 payloads migrate in-memory, never fail. */
export function readContextFrom(stored: StoredDeveloperData | undefined, at = new Date().toISOString()): DeveloperContext {
  if (!stored) return emptyDeveloperContext(at);
  if (isDeveloperContext(stored)) return stored;
  return migrateProfileToContext(stored as DeveloperProfile, at);
}

/** Pure write helper for `LocalStore.updateProfile`: migrates on the fly, then applies the update. */
export function updateContextIn(stored: StoredDeveloperData, update: (context: DeveloperContext) => DeveloperContext, at = new Date().toISOString()): DeveloperContext {
  return update(readContextFrom(stored, at));
}

/**
 * Legacy v1 view for the existing knowledge-gap engine (T011 zero-regression):
 * only skills with a user-declared level participate; observation-grown skills
 * never fabricate a level. The original context remains the source of truth.
 */
export function toLegacyProfileView(context: DeveloperContext): DeveloperProfile {
  const skills: Record<string, ProfileSkill> = {};
  const evidence: Record<string, ProfileEvidence> = {};
  for (const assessment of Object.values(context.skills)) {
    if (!assessment.legacyLevel) continue;
    skills[assessment.key] = {
      dimension: assessment.dimension, key: assessment.key, label: assessment.label,
      level: assessment.legacyLevel, confidence: assessment.legacyConfidence ?? assessment.confidence,
      evidenceIds: [...assessment.evidenceIds], updatedAt: assessment.updatedAt,
    };
    for (const id of assessment.evidenceIds) {
      const item = context.evidence[id];
      if (!item) continue;
      const kind: ProfileEvidenceKind = item.kind === 'observation' || item.kind === 'correction' ? 'cli-update' : item.kind;
      evidence[id] = { id, kind, observedAt: item.observedAt, summary: item.summary };
    }
  }
  return {
    schemaVersion: DEVELOPER_PROFILE_VERSION,
    createdAt: context.createdAt, updatedAt: context.updatedAt,
    roles: [...context.roles],
    ...(context.primaryRole ? { primaryRole: context.primaryRole } : {}),
    skills, evidence,
  };
}

export function setContextRoles(context: DeveloperContext, roleKeys: string[], primaryRole: string | undefined, at = new Date().toISOString()): DeveloperContext {
  const normalized = roleKeys.map(normalizeSkillKey).filter(Boolean);
  const unique = [...new Set([...normalized])];
  if (primaryRole !== undefined) {
    const primary = normalizeSkillKey(primaryRole);
    if (!primary) throw new Error('primary role 不能为空。');
    if (!unique.includes(primary)) unique.unshift(primary);
  }
  return { ...context, updatedAt: at, roles: unique, ...(primaryRole !== undefined ? { primaryRole: normalizeSkillKey(primaryRole) } : {}) };
}

/**
 * `profile init` semantics: resets ONLY user-declared skills and roles.
 * Passively observed skills, observation aggregates, preferences and every
 * evidence entry survive — an explicit re-init must never destroy long-term
 * context the user did not explicitly provide (§17/§31.4).
 */
export function resetDeclaredSkills(context: DeveloperContext, at = new Date().toISOString()): DeveloperContext {
  const skills: Record<string, SkillAssessment> = {};
  for (const [key, assessment] of Object.entries(context.skills)) {
    if (!assessment.legacyLevel) skills[key] = assessment;
  }
  return { ...context, updatedAt: at, roles: [], primaryRole: undefined, skills };
}

/** Explicit user-declared skill (CLI init/update, §15.3): stays a self-reported claim unless evidence says otherwise. */
export function upsertContextSkill(context: DeveloperContext, input: ProfileSkillInput, at = new Date().toISOString()): DeveloperContext {
  const key = normalizeSkillKey(input.key);
  if (!key) throw new Error('技能 key 不能为空。');
  if (!LEVEL_NUMBERS[input.level]) throw new Error(`无效技能等级：${input.level}`);
  const storedKey = `${input.dimension}:${key}`;
  const existing = context.skills[storedKey];
  const evidenceKind: ContextEvidenceKind = input.evidenceKind ?? 'self-assessment';
  const provenance = V1_KIND_PROVENANCE[evidenceKind as ProfileEvidenceKind] ?? 'self-reported';
  const evidenceId = `pe_${hash(evidenceKind, key, input.level, at, Object.keys(context.evidence).length)}`;
  const summary = input.evidenceSummary?.trim()
    || (existing ? `更新 ${existing.label}：${existing.legacyLevel ?? '—'} → ${input.level}` : `初始画像：${input.label} = ${input.level}`);
  const evidence: ContextEvidence = { id: evidenceId, kind: evidenceKind, provenance, observedAt: at, summary, skillKey: storedKey };
  const next: DeveloperContext = {
    ...context, updatedAt: at,
    evidence: { ...context.evidence, [evidenceId]: evidence },
  };
  const observationCount = existing?.observationCount ?? 0;
  // Filter before sorting: String(null) sorts AFTER ISO timestamps, which would
  // silently null out lastObservedAt (and fake a stale freshness).
  const lastObservedAt = [existing?.lastObservedAt, at].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const aggregated = strongestProvenance(existing ? [existing.provenance, provenance] : [provenance]);
  next.skills = {
    ...context.skills,
    [storedKey]: {
      dimension: input.dimension, key: storedKey, label: input.label,
      provenance: aggregated,
      confidence: aggregateConfidence(aggregated, observationCount),
      freshness: freshnessOf(lastObservedAt, at),
      evidenceCount: (existing?.evidenceCount ?? 0) + 1,
      observationCount,
      lastObservedAt,
      evidenceIds: [...(existing?.evidenceIds ?? []), evidenceId],
      updatedAt: at,
      ...(existing?.lastCorrection ? { lastCorrection: existing.lastCorrection } : {}),
      legacyLevel: input.level,
      legacyConfidence: input.confidence ?? existing?.legacyConfidence ?? 'medium',
    },
  };
  return next;
}

function strongestProvenance(provenances: EvidenceProvenance[]): EvidenceProvenance {
  return provenances.reduce<EvidenceProvenance>(
    (best, item) => (PROVENANCE_RANK[item] > PROVENANCE_RANK[best] ? item : best),
    'unknown',
  );
}

/**
 * Technology detection for passive observation (T303 §17). Bounded, path-based;
 * only structured signals the Relevance Gate needs — never a behavior log,
 * never file contents. jsx/tsx is recorded as React-family usage (labeled as
 * such); ambiguity stays visible through the label.
 */
const EXT_TECHNOLOGIES: Record<string, TechnologySighting[]> = {
  java: [{ dimension: 'language', key: 'java', label: 'Java' }],
  kt: [{ dimension: 'language', key: 'kotlin', label: 'Kotlin' }],
  ts: [{ dimension: 'language', key: 'typescript', label: 'TypeScript' }],
  mts: [{ dimension: 'language', key: 'typescript', label: 'TypeScript' }],
  cts: [{ dimension: 'language', key: 'typescript', label: 'TypeScript' }],
  tsx: [{ dimension: 'language', key: 'typescript', label: 'TypeScript' }, { dimension: 'framework', key: 'react', label: 'React/TSX' }],
  jsx: [{ dimension: 'language', key: 'javascript', label: 'JavaScript' }, { dimension: 'framework', key: 'react', label: 'React/JSX' }],
  js: [{ dimension: 'language', key: 'javascript', label: 'JavaScript' }],
  mjs: [{ dimension: 'language', key: 'javascript', label: 'JavaScript' }],
  cjs: [{ dimension: 'language', key: 'javascript', label: 'JavaScript' }],
  vue: [{ dimension: 'framework', key: 'vue', label: 'Vue' }],
  svelte: [{ dimension: 'framework', key: 'svelte', label: 'Svelte' }],
  css: [{ dimension: 'framework', key: 'ui-styling', label: '前端样式' }],
  scss: [{ dimension: 'framework', key: 'ui-styling', label: '前端样式' }],
  less: [{ dimension: 'framework', key: 'ui-styling', label: '前端样式' }],
  sass: [{ dimension: 'framework', key: 'ui-styling', label: '前端样式' }],
  html: [{ dimension: 'framework', key: 'ui-markup', label: 'HTML' }],
  htm: [{ dimension: 'framework', key: 'ui-markup', label: 'HTML' }],
  py: [{ dimension: 'language', key: 'python', label: 'Python' }],
  go: [{ dimension: 'language', key: 'go', label: 'Go' }],
  rs: [{ dimension: 'language', key: 'rust', label: 'Rust' }],
  rb: [{ dimension: 'language', key: 'ruby', label: 'Ruby' }],
  php: [{ dimension: 'language', key: 'php', label: 'PHP' }],
  swift: [{ dimension: 'language', key: 'swift', label: 'Swift' }],
  cs: [{ dimension: 'language', key: 'csharp', label: 'C#' }],
  sql: [{ dimension: 'language', key: 'sql', label: 'SQL' }],
};

export function technologiesForPaths(paths: string[]): TechnologySighting[] {
  const seen = new Map<string, TechnologySighting>();
  for (const path of paths) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    for (const sighting of EXT_TECHNOLOGIES[ext] ?? []) {
      const storedKey = `${sighting.dimension}:${normalizeSkillKey(sighting.key)}`;
      if (!seen.has(storedKey)) seen.set(storedKey, sighting);
    }
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en')).map(([, sighting]) => sighting);
}

export function technologiesForNames(names: { languages?: string[]; frameworks?: string[] }): TechnologySighting[] {
  const seen = new Map<string, TechnologySighting>();
  const add = (dimension: ProfileDimension, name: string) => {
    const key = normalizeSkillKey(name);
    if (!key) return;
    const storedKey = `${dimension}:${key}`;
    if (!seen.has(storedKey)) seen.set(storedKey, { dimension, key, label: name.trim() });
  };
  for (const name of names.languages ?? []) add('language', name);
  for (const name of names.frameworks ?? []) add('framework', name);
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en')).map(([, sighting]) => sighting);
}

/**
 * Passive observation from analysis-report FACTS (T303 §17): language from the
 * snapshot manifest, framework signals only when the analyzer actually proved
 * concept hits. No content reading, no inference beyond report facts.
 */
export function observeFromReport(report: AnalysisReport): TechnologySighting[] {
  const sightings = technologiesForPaths(report.snapshot.files.map(file => file.path));
  const keys = new Set(sightings.map(s => `${s.dimension}:${normalizeSkillKey(s.key)}`));
  const concepts = new Set(report.findings.map(finding => finding.conceptId));
  const push = (dimension: ProfileDimension, key: string, label: string) => {
    const storedKey = `${dimension}:${key}`;
    if (keys.has(storedKey)) return;
    keys.add(storedKey);
    sightings.push({ dimension, key, label });
  };
  if ([...concepts].some(concept => concept.startsWith('spring.'))) push('framework', 'spring', 'Spring');
  if ([...concepts].some(concept => concept.startsWith('jpa.'))) push('framework', 'jpa', 'JPA / Hibernate');
  return sightings.sort((a, b) => `${a.dimension}:${a.key}`.localeCompare(`${b.dimension}:${b.key}`, 'en'));
}

/** Deduplicate sightings by stored key, keeping deterministic order. */
export function dedupeSightings(sightings: TechnologySighting[]): TechnologySighting[] {
  const seen = new Map<string, TechnologySighting>();
  for (const sighting of sightings) {
    const storedKey = `${sighting.dimension}:${normalizeSkillKey(sighting.key)}`;
    if (!seen.has(storedKey)) seen.set(storedKey, sighting);
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en')).map(([, sighting]) => sighting);
}

/**
 * Record one passive observation event (T303 §17 Phase 4): bumps the aggregate
 * counter and creates ONE evidence entry the first time a technology is seen.
 * Repeated events never flood the evidence store — counts live in observations.
 */
export function recordObservations(context: DeveloperContext, sightings: TechnologySighting[], at = new Date().toISOString()): DeveloperContext {
  if (!sightings.length) return context;
  let next: DeveloperContext = { ...context, observations: { ...context.observations }, evidence: { ...context.evidence }, skills: { ...context.skills } };
  let changed = false;
  for (const sighting of sightings) {
    const storedKey = `${sighting.dimension}:${normalizeSkillKey(sighting.key)}`;
    const existing = next.observations[storedKey];
    const observation: DeveloperObservation = existing
      ? { ...existing, count: existing.count + 1, lastObservedAt: at }
      : { skillKey: storedKey, dimension: sighting.dimension, label: sighting.label, count: 1, firstObservedAt: at, lastObservedAt: at };
    next.observations[storedKey] = observation;
    if (!existing) {
      const evidenceId = `pe_${hash('observation', storedKey, at)}`;
      next.evidence[evidenceId] = {
        id: evidenceId, kind: 'observation', provenance: 'observed', observedAt: at,
        summary: `首次观察到实际使用 ${sighting.label}`, skillKey: storedKey,
      };
      next = applyObservationToSkill(next, storedKey, sighting, [evidenceId], at);
    } else {
      next = applyObservationToSkill(next, storedKey, sighting, [], at);
    }
    changed = true;
  }
  if (!changed) return context;
  return { ...next, updatedAt: at };
}

function applyObservationToSkill(context: DeveloperContext, storedKey: string, sighting: TechnologySighting, newEvidenceIds: string[], at: string): DeveloperContext {
  const observation = context.observations[storedKey]!;
  const existing = context.skills[storedKey];
  const evidenceIds = [...(existing?.evidenceIds ?? []), ...newEvidenceIds];
  const provenance = strongestProvenance([...(existing ? [existing.provenance] : []), 'observed']);
  const correction = existing?.lastCorrection;
  return {
    ...context,
    skills: {
      ...context.skills,
      [storedKey]: {
        dimension: sighting.dimension, key: storedKey, label: existing?.label ?? sighting.label,
        provenance,
        confidence: aggregateConfidence(provenance, observation.count),
        freshness: freshnessOf(observation.lastObservedAt, at),
        evidenceCount: evidenceIds.length,
        observationCount: observation.count,
        lastObservedAt: observation.lastObservedAt,
        evidenceIds,
        updatedAt: at,
        ...(correction ? { lastCorrection: correction } : {}),
        ...(existing?.legacyLevel ? { legacyLevel: existing.legacyLevel } : {}),
        ...(existing?.legacyConfidence ? { legacyConfidence: existing.legacyConfidence } : {}),
      },
    },
  };
}

/**
 * Explicit user correction (T303 §18, Case E): appends correction evidence,
 * keeps ALL history, and re-anchors the assessment on the fresh claim.
 * A correction is self-reported by nature — it never upgrades to verified.
 */
export function recordCorrection(
  context: DeveloperContext,
  input: { dimension?: ProfileDimension; key: string; direction: 'unfamiliar' | 'familiar'; note?: string },
  at = new Date().toISOString(),
): DeveloperContext {
  const normalized = normalizeSkillKey(input.key);
  if (!normalized) throw new Error('技能 key 不能为空。');
  const storedKey = Object.keys(context.skills).find(candidate => candidate === normalized || candidate.endsWith(`:${normalized}`))
    ?? (input.dimension ? `${input.dimension}:${normalized}` : null);
  if (!storedKey) throw new Error(`画像中没有技能 ${input.key}；请用 --dimension 指定维度（language/framework/engineering/domain/tool）。`);
  const existing = context.skills[storedKey];
  const lastEvidenceId = existing?.evidenceIds.at(-1);
  const evidenceId = `pe_${hash('correction', storedKey, input.direction, at, Object.keys(context.evidence).length)}`;
  const evidence: ContextEvidence = {
    id: evidenceId, kind: 'correction', provenance: 'self-reported', observedAt: at,
    summary: input.note?.trim() || `用户修正：对 ${existing?.label ?? storedKey} ${input.direction === 'unfamiliar' ? '不熟悉' : '熟悉'}`,
    skillKey: storedKey,
    ...(lastEvidenceId ? { correctsEvidenceId: lastEvidenceId } : {}),
    correction: input.direction,
  };
  const assessment: SkillAssessment = {
    dimension: existing?.dimension ?? (storedKey.split(':')[0] as ProfileDimension),
    key: storedKey,
    label: existing?.label ?? normalized,
    // The fresh claim dominates: provenance drops back to self-reported (§3.2 —
    // a claim is not a fact, in either direction), confidence to low, and the
    // correction timestamp blocks familiarity-driven skips within its window.
    provenance: 'self-reported',
    confidence: 'low',
    freshness: 'fresh',
    evidenceCount: (existing?.evidenceCount ?? 0) + 1,
    observationCount: existing?.observationCount ?? 0,
    lastObservedAt: at,
    evidenceIds: [...(existing?.evidenceIds ?? []), evidenceId],
    updatedAt: at,
    lastCorrection: { at, direction: input.direction },
    ...(existing?.legacyLevel ? { legacyLevel: existing.legacyLevel } : {}),
    ...(existing?.legacyConfidence ? { legacyConfidence: existing.legacyConfidence } : {}),
  };
  return {
    ...context, updatedAt: at,
    evidence: { ...context.evidence, [evidenceId]: evidence },
    skills: { ...context.skills, [storedKey]: assessment },
  };
}

/** Reserved user control (§31.5): preferences are evidence-backed, never silent. */
export function setPreference(context: DeveloperContext, scope: string, preference: DeveloperPreference['preference'], at = new Date().toISOString()): DeveloperContext {
  const trimmed = scope.trim();
  if (!trimmed) throw new Error('preference scope 不能为空。');
  const existing = context.preferences.find(item => item.scope === trimmed);
  const entry: DeveloperPreference = existing
    ? { ...existing, preference, provenance: 'self-reported' }
    : { id: `pref_${hash(trimmed, preference, at)}`, scope: trimmed, preference, provenance: 'self-reported', createdAt: at };
  return {
    ...context, updatedAt: at,
    preferences: [...context.preferences.filter(item => item.scope !== trimmed), entry]
      .sort((a, b) => a.scope.localeCompare(b.scope, 'en')),
  };
}

/** Was this skill corrected inside the blocking window? Deterministic; used by the Relevance Gate. */
export function hasRecentCorrection(context: DeveloperContext, skillKey: string, now: string): boolean {
  const normalized = normalizeSkillKey(skillKey);
  return Object.values(context.skills).some(assessment => {
    if (!assessment.lastCorrection) return false;
    if (assessment.key !== normalized && assessment.key !== skillKey && !assessment.key.endsWith(`:${normalized}`)) return false;
    const days = (Date.parse(now) - Date.parse(assessment.lastCorrection.at)) / 86_400_000;
    return Number.isFinite(days) && days >= 0 && days <= CORRECTION_BLOCK_DAYS;
  });
}

/** Read model for the gate: provenance + freshness + counts, no numeric score (§3.3). */
export function familiarityOf(context: DeveloperContext, skillKey: string, now: string): {
  provenance: EvidenceProvenance; confidence: ProfileConfidence; freshness: ContextFreshness;
  observationCount: number; lastObservedAt: string | null; recentlyCorrected: boolean;
} | null {
  const normalized = normalizeSkillKey(skillKey);
  const assessment = Object.values(context.skills).find(candidate => candidate.key === skillKey || candidate.key === normalized || candidate.key.endsWith(`:${normalized}`));
  if (!assessment) return null;
  return {
    provenance: assessment.provenance,
    confidence: assessment.confidence,
    freshness: freshnessOf(assessment.lastObservedAt, now),
    observationCount: assessment.observationCount,
    lastObservedAt: assessment.lastObservedAt,
    recentlyCorrected: hasRecentCorrection(context, assessment.key, now),
  };
}
