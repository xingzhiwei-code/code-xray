import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../packages/engine/index.js';
import { LocalStore } from '../packages/storage-local/index.js';
import { emptyLearningState } from '../packages/learning/engine.js';
import {
  AGING_DAYS, CORRECTION_BLOCK_DAYS, FRESH_DAYS, OBSERVED_CONFIDENCE_HIGH_COUNT, OBSERVED_CONFIDENCE_MEDIUM_COUNT,
  emptyDeveloperProfile, freshnessOf, hasRecentCorrection, familiarityOf, knowledgeGaps, migrateProfileToContext, readContextFrom,
  recordCorrection, recordObservations, setContextRoles, setPreference, technologiesForPaths,
  toLegacyProfileView, upsertSkill, upsertContextSkill, updateContextIn, isDeveloperContext,
  type DeveloperContext,
} from '../packages/developer-profile/engine.js';

const AT = '2026-09-30T10:00:00.000Z';
const FIXTURE = 'fixtures/java-spring-jpa';

function v1Profile() {
  let profile = emptyDeveloperProfile('2026-01-10T08:00:00.000Z');
  profile = upsertSkill(profile, {
    dimension: 'language', key: 'Java', label: 'Java', level: 'expert', confidence: 'high',
    evidenceKind: 'self-assessment', evidenceSummary: '用户自述专家',
  }, '2026-01-10T08:00:00.000Z');
  profile = upsertSkill(profile, {
    dimension: 'framework', key: 'Spring', label: 'Spring', level: 'advanced', confidence: 'medium',
    evidenceKind: 'verified-learning', evidenceSummary: '通过学习卡验证',
  }, '2026-02-01T08:00:00.000Z');
  return profile;
}

describe('DeveloperContext migration (T303 §19, Phase 3)', () => {
  it('maps v1 evidence kinds to honest provenance without inventing facts', () => {
    const context = migrateProfileToContext(v1Profile(), AT);
    expect(context.schemaVersion).toBe('developer-context-v1');
    // §19: user-filled level=expert is a claim → self-reported + confidence low.
    const java = context.skills['language:java']!;
    expect(java.provenance).toBe('self-reported');
    expect(java.confidence).toBe('low');
    expect(java.legacyLevel).toBe('expert');
    expect(java.legacyConfidence).toBe('high');
    // verified-learning → verified (never downgraded to a claim).
    const spring = context.skills['framework:spring']!;
    expect(spring.provenance).toBe('verified');
    expect(spring.confidence).toBe('high');
    expect(spring.legacyLevel).toBe('advanced');
  });

  it('keeps every original evidence id, kind and summary (no history loss)', () => {
    const profile = v1Profile();
    const context = migrateProfileToContext(profile, AT);
    for (const [id, item] of Object.entries(profile.evidence)) {
      expect(context.evidence[id]).toBeDefined();
      expect(context.evidence[id]!.kind).toBe(item.kind);
      expect(context.evidence[id]!.summary).toBe(item.summary);
      expect(context.evidence[id]!.observedAt).toBe(item.observedAt);
    }
  });

  it('is idempotent — migrating twice yields deep-equal context', () => {
    const once = migrateProfileToContext(v1Profile(), AT);
    const twice = migrateProfileToContext(v1Profile(), AT);
    expect(twice).toEqual(once);
  });

  it('reads old v1 data via versioned read and upgrades on write-through', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-ctx-migrate-'));
    try {
      const store = new LocalStore({ dataDir });
      // Seed v1 data through the untouched v1 API (simulates an old installation).
      await store.updateProfile(emptyDeveloperProfile(), () => v1Profile());
      const raw = await store.readProfile(emptyDeveloperProfile());
      const context = readContextFrom(raw, AT);
      expect(isDeveloperContext(context)).toBe(true);
      expect(context.skills['language:java']!.legacyLevel).toBe('expert');
      // Write-through upgrade: any update persists developer-context-v1.
      const updated = await store.updateProfile(emptyDeveloperContextForTest(), stored =>
        updateContextIn(stored, ctx => recordObservations(ctx, technologiesForPaths(['a.java']), AT), AT));
      expect(updated.schemaVersion).toBe('developer-context-v1');
      const persisted = JSON.parse(readFileSync(join(dataDir, 'developer', 'profile.json'), 'utf8'));
      expect(persisted.payload.schemaVersion).toBe('developer-context-v1');
      // Old evidence survived the upgrade.
      expect(Object.keys(persisted.payload.evidence).length).toBeGreaterThanOrEqual(2);
      // Re-reading is stable (repeatable migration/upgrade).
      const reread = readContextFrom(await store.readProfile(emptyDeveloperContextForTest()), AT);
      expect(reread.skills['framework:spring']!.provenance).toBe('verified');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('legacy view keeps knowledgeGaps output byte-identical for v1 data', async () => {
    const report = await analyze({ path: FIXTURE });
    const profile = v1Profile();
    const learning = emptyLearningState();
    const direct = knowledgeGaps(report, profile, learning);
    const viaContext = knowledgeGaps(report, toLegacyProfileView(migrateProfileToContext(profile, AT)), learning);
    expect(viaContext).toEqual(direct);
  });

  it('observation-only skills never fabricate a legacy level', () => {
    let context = readContextFrom(undefined, AT);
    context = recordObservations(context, technologiesForPaths(['src/App.tsx']), AT);
    const view = toLegacyProfileView(context);
    expect(Object.keys(view.skills)).toHaveLength(0);
    const gaps = knowledgeGaps({ findings: [], evidence: [] } as never, Object.keys(view.skills).length ? view : undefined);
    expect(gaps.profileConfigured).toBe(false);
  });
});

function emptyDeveloperContextForTest(): DeveloperContext {
  return readContextFrom(undefined, AT);
}

describe('Provenance & freshness (T303 §5/§6, Phase 2)', () => {
  it('computes fresh/aging/stale from injected now with exported thresholds', () => {
    const now = '2026-09-30T00:00:00.000Z';
    const daysAgo = (days: number) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
    expect(freshnessOf(daysAgo(FRESH_DAYS - 1), now)).toBe('fresh');
    expect(freshnessOf(daysAgo(FRESH_DAYS + 1), now)).toBe('aging');
    expect(freshnessOf(daysAgo(AGING_DAYS + 1), now)).toBe('stale');
    expect(freshnessOf(null, now)).toBe('stale');
  });

  it('unknown means no evidence, never inability (§3.5)', () => {
    const context = readContextFrom(undefined, AT);
    expect(Object.keys(context.skills)).toHaveLength(0);
    // No skill entry at all: familiarity lookup returns null ("not enough evidence").
    expect(familiarityOf(context, 'language:java', AT)).toBeNull();
  });

  it('grows observed confidence transparently with observation counts (§17)', () => {
    let context = readContextFrom(undefined, AT);
    const react = () => context.skills['framework:react']!;
    for (let i = 0; i < OBSERVED_CONFIDENCE_HIGH_COUNT; i++) {
      context = recordObservations(context, technologiesForPaths(['src/App.tsx']), new Date(Date.parse(AT) + i * 1000).toISOString());
    }
    expect(react().provenance).toBe('observed');
    expect(react().observationCount).toBe(OBSERVED_CONFIDENCE_HIGH_COUNT);
    expect(react().confidence).toBe('high');
    expect(react().observationCount).toBeGreaterThanOrEqual(OBSERVED_CONFIDENCE_MEDIUM_COUNT);
    // Evidence does not flood: one first-observation entry only.
    expect(react().evidenceIds).toHaveLength(1);
  });
});

describe('Passive observation (T303 §17, Phase 4)', () => {
  it('detects a bounded technology set from paths only', () => {
    const sightings = technologiesForPaths(['src/App.tsx', 'src/util.ts', 'theme.css', 'OrderService.java', 'README.md']);
    const keys = sightings.map(s => `${s.dimension}:${s.key}`);
    expect(keys).toEqual(['framework:react', 'framework:ui-styling', 'language:java', 'language:typescript']);
  });

  it('records aggregate counts without storing a behavior log', () => {
    let context = readContextFrom(undefined, AT);
    context = recordObservations(context, technologiesForPaths(['a.tsx']), AT);
    context = recordObservations(context, technologiesForPaths(['b.tsx']), AT);
    expect(context.observations['framework:react']!.count).toBe(2);
    expect(Object.keys(context.evidence).filter(id => context.evidence[id]!.kind === 'observation')).toHaveLength(2); // react + typescript first sightings
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('a.tsx');
    expect(serialized).not.toContain('b.tsx');
  });
});

describe('Explicit correction (T303 §18, Case E)', () => {
  it('appends correction evidence, keeps history, re-anchors provenance', () => {
    let context = migrateProfileToContext(v1Profile(), AT);
    const before = context.skills['framework:spring']!;
    const later = new Date(Date.parse(AT) + 86_400_000).toISOString();
    context = recordCorrection(context, { key: 'spring', direction: 'unfamiliar', note: '其实我不熟 Spring Transaction' }, later);
    const after = context.skills['framework:spring']!;
    expect(after.provenance).toBe('self-reported');
    expect(after.confidence).toBe('low');
    expect(after.evidenceCount).toBe(before.evidenceCount + 1);
    // History preserved: all previous evidence ids still present.
    for (const id of before.evidenceIds) expect(after.evidenceIds).toContain(id);
    const correctionEvidence = Object.values(context.evidence).find(e => e.kind === 'correction')!;
    expect(correctionEvidence.correctsEvidenceId).toBe(before.evidenceIds.at(-1));
    expect(correctionEvidence.summary).toContain('Spring Transaction');
    expect(after.lastCorrection).toEqual({ at: later, direction: 'unfamiliar' });
  });

  it('blocks familiarity-driven decisions only within the correction window', () => {
    let context = migrateProfileToContext(v1Profile(), AT);
    context = recordCorrection(context, { key: 'spring', direction: 'unfamiliar' }, AT);
    const inWindow = new Date(Date.parse(AT) + (CORRECTION_BLOCK_DAYS - 1) * 86_400_000).toISOString();
    const outWindow = new Date(Date.parse(AT) + (CORRECTION_BLOCK_DAYS + 1) * 86_400_000).toISOString();
    expect(hasRecentCorrection(context, 'framework:spring', inWindow)).toBe(true);
    expect(hasRecentCorrection(context, 'framework:spring', outWindow)).toBe(false);
    expect(hasRecentCorrection(context, 'language:java', inWindow)).toBe(false);
  });

  it('creates the skill when missing only with an explicit dimension', () => {
    let context = readContextFrom(undefined, AT);
    expect(() => recordCorrection(context, { key: 'spring', direction: 'unfamiliar' }, AT)).toThrow(/--dimension/);
    context = recordCorrection(context, { dimension: 'framework', key: 'spring', direction: 'unfamiliar' }, AT);
    expect(context.skills['framework:spring']!.provenance).toBe('self-reported');
  });
});

describe('Context skills, roles & preferences (T303 §4, §31.5)', () => {
  it('keeps self-reported claims as claims (§3.2, Case D)', () => {
    let context = readContextFrom(undefined, AT);
    context = setContextRoles(context, ['backend'], 'backend', AT);
    context = upsertContextSkill(context, {
      dimension: 'framework', key: 'Spring', label: 'Spring', level: 'expert',
      evidenceKind: 'self-assessment', evidenceSummary: '我是 Spring 专家',
    }, AT);
    const spring = context.skills['framework:spring']!;
    expect(spring.provenance).toBe('self-reported');
    expect(spring.confidence).toBe('low');
    expect(spring.legacyLevel).toBe('expert');
    expect(spring.observationCount).toBe(0);
    // Freshness is anchored to the declaration time, not nulled by aggregation.
    expect(spring.lastObservedAt).toBe(AT);
    expect(spring.freshness).toBe('fresh');
  });

  it('supports reserved preference controls without a UI', () => {
    let context = readContextFrom(undefined, AT);
    context = setPreference(context, 'frontend/react/*', 'skip-deep-analysis', AT);
    context = setPreference(context, 'payments/*', 'always-analyze', AT);
    expect(context.preferences.map(p => `${p.scope}=${p.preference}`)).toEqual([
      'frontend/react/*=skip-deep-analysis', 'payments/*=always-analyze',
    ]);
    // Same scope updates in place (deterministic, sorted).
    context = setPreference(context, 'frontend/react/*', 'always-analyze', AT);
    expect(context.preferences).toHaveLength(2);
    expect(context.preferences.find(p => p.scope === 'frontend/react/*')!.preference).toBe('always-analyze');
  });

  it('exposes no numeric capability score anywhere in the model (§3.3)', () => {
    let context = readContextFrom(undefined, AT);
    context = recordObservations(context, technologiesForPaths(['a.tsx', 'b.java']), AT);
    context = upsertContextSkill(context, { dimension: 'framework', key: 'spring', label: 'Spring', level: 'expert' }, AT);
    for (const assessment of Object.values(context.skills)) {
      expect(Object.keys(assessment)).not.toContain('score');
      expect(typeof assessment.provenance).toBe('string');
      expect(typeof assessment.observationCount).toBe('number'); // count, not a rating
    }
    expect(JSON.stringify(context)).not.toMatch(/"(score|abilityScore|competency)"/);
  });
});
