import { createHash } from 'node:crypto';
import type { AnalysisReport } from '../protocol/index.js';
import {
  DEVELOPER_PROFILE_VERSION,
  type DeveloperProfile, type KnowledgeGap, type KnowledgeGapSummary,
  type KnowledgeGapLearningStatus,
  type ProfileSkill, type ProfileSkillInput,
} from './types.js';
import { STATUS_LABELS, type ConceptId, type LearningStatus } from '../learning/types.js';
import { GAP, learningStatusFor, type LearningState } from '../learning/engine.js';

export { DEVELOPER_PROFILE_VERSION } from './types.js';
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
