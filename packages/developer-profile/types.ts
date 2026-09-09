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
