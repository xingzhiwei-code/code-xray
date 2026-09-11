import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../packages/engine/index.js';
import { LocalStore } from '../packages/storage-local/index.js';
import { emptyLearningState, learningCard, applyEvent, syncBindings, debtSummary } from '../packages/learning/engine.js';
import {
  emptyDeveloperProfile, knowledgeGaps, profileSignal, setRoles, upsertSkill,
} from '../packages/developer-profile/engine.js';

const FIXTURE = 'fixtures/java-spring-jpa';
const AT = '2026-09-09T10:00:00.000Z';

describe('Developer Profile v1', () => {
  it('stores level with confidence and evidence, not only a single label', async () => {
    let profile = setRoles(emptyDeveloperProfile(AT), ['frontend', 'backend'], 'frontend', AT);
    profile = upsertSkill(profile, {
      dimension: 'language', key: 'Java', label: 'Java', level: 'beginner',
      confidence: 'medium', evidenceKind: 'onboarding-answer', evidenceSummary: '用户自述前端背景，Java 初学',
    }, AT);
    expect(profile.roles).toEqual(['frontend', 'backend']);
    expect(profile.primaryRole).toBe('frontend');
    const skill = profile.skills['language:java'];
    expect(skill.level).toBe('beginner');
    expect(skill.confidence).toBe('medium');
    expect(skill.evidenceIds).toHaveLength(1);
    expect(profile.evidence[skill.evidenceIds[0]!]!.summary).toContain('用户自述');
    expect(profileSignal(profile, 'language:java')).toBe(1.5);
  });

  it('persists globally outside workspace learning state and survives restart', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-profile-store-'));
    try {
      const store = new LocalStore({ dataDir });
      const profile = await store.updateProfile(emptyDeveloperProfile(), current => upsertSkill(current, {
        dimension: 'framework', key: 'Spring', label: 'Spring', level: 'beginner', confidence: 'low',
      }, AT));
      const reopened = new LocalStore({ dataDir });
      const restored = await reopened.readProfile(emptyDeveloperProfile());
      expect(restored).toEqual(profile);
      const learning = await reopened.readState(FIXTURE, emptyLearningState());
      expect(learning).toEqual(emptyLearningState());
      const path = join(dataDir, 'developer', 'profile.json');
      expect(JSON.parse(readFileSync(path, 'utf8')).payload.skills['framework:spring'].level).toBe('beginner');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('combines required code knowledge with the developer profile and learning state', async () => {
    const report = await analyze({ path: FIXTURE });
    const missing = knowledgeGaps(report, undefined);
    expect(missing.profileConfigured).toBe(false);
    expect(missing.items).toHaveLength(6);
    for (const item of missing.items) {
      expect(item.reason).toBe('profile-missing');
      expect(item.priority).toBeNull();
      expect(item.reasonLabel).toContain('未建立');
    }

    let profile = upsertSkill(emptyDeveloperProfile(AT), {
      dimension: 'framework', key: 'Spring', label: 'Spring', level: 'beginner', confidence: 'medium',
      evidenceKind: 'self-assessment',
    }, AT);
    const withProfile = knowledgeGaps(report, profile);
    const spring = withProfile.items.find(item => item.conceptId === 'spring.transaction-proxy')!;
    const jpa = withProfile.items.find(item => item.conceptId === 'jpa.query-amplification')!;
    expect(spring.reason).toBe('profile-signal');
    expect(spring.priority).toBe(1.5); // level 2 × confidence .75 × unassessed gap 1
    expect(spring.strongestSkillKey).toBe('framework:spring');
    expect(jpa.reason).toBe('skill-missing');
    expect(jpa.priority).toBeNull();

    let learning = syncBindings(emptyLearningState(), report).state;
    const binding = Object.values(learning.bindings).find(item => item.conceptId === 'spring.transaction-proxy')!;
    const card = learningCard(binding);
    learning = applyEvent(learning, { type: 'answer', bindingId: binding.id, questionId: card.question.id, optionId: card.question.answerId }, AT).state;
    const verified = knowledgeGaps(report, profile, learning);
    const verifiedSpring = verified.items.find(item => item.conceptId === 'spring.transaction-proxy')!;
    expect(verifiedSpring.reason).toBe('learning-state-used');
    expect(verifiedSpring.learningStatus).toBe('verified');
    expect(verifiedSpring.priority).toBe(0);
    // The debt model itself remains project learning evidence, profile only personalizes suggestions.
    expect(debtSummary(learning).items.find(item => item.bindingId === binding.id)!.priority).toBe(0);
  });

  it('keeps a missing profile visible as unassessed rather than zero mastery', async () => {
    const report = await analyze({ path: FIXTURE });
    const gaps = knowledgeGaps(report, undefined);
    expect(gaps.profileConfigured).toBe(false);
    expect(gaps.items.every(item => item.reasonLabel === '开发者画像未建立')).toBe(true);
  });
});
