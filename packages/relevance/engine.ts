/**
 * Deterministic Relevance Gate (T303 §8—§13, §25 Phase 5).
 *
 * Rule-based + explainable + deterministic. No LLM, no ML, no remote ranking,
 * no clock reads, no randomness. Composes Developer Context (provenance /
 * freshness / corrections / preferences) with T302 ConceptKnowledgeState —
 * never recomputes concept knowledge here (§7/§21 boundary).
 *
 * Safety invariants (§12, §22):
 * - self-reported skill claims NEVER drive a SKIP on their own;
 * - routine-task-class SKIPs are driven by the task class (routine UI/type
 *   work is low-risk by nature), not by any skill claim, and are vetoed by
 *   risk terms, corrections and always-analyze preferences;
 * - familiarity with a technology never skips a high-risk concept
 *   (熟悉技术 ≠ 熟悉当前问题);
 * - unknown context degrades to LIGHT, never to SKIP;
 * - skip ≠ "code is correct" — always stated in limitations.
 */
import type { ConceptKnowledgeState } from '../learning/types.js';
import {
  familiarityOf, hasRecentCorrection, technologiesForPaths, technologiesForNames,
} from '../developer-profile/engine.js';
import {
  ANALYZABLE_EXTENSIONS, ARCHITECTURE_TASK, CODE_EXTENSIONS, CRITICAL_RISK_TERMS,
  LARGE_CHANGE_FILES, MIGRATION_PATH, MODERATE_RISK_TERMS, NEW_LIBRARY_TASK, RELEVANCE_RULES_VERSION,
  ROUTINE_ASSET_EXTENSIONS, ROUTINE_TYPE_TASK, ROUTINE_UI_TASK, SHARED_CORE_SEGMENTS, SKIP_MIN_OBSERVATIONS,
  SMALL_CHANGE_FILES, TARGET_PATH_LIMIT, type RiskTermRule,
} from './rules.js';
import type {
  AnalysisTarget, FamiliaritySignal, RelevanceDecision, RelevanceEnvironment, RelevanceInput,
  RelevanceLevel, RelevanceSignals, RiskHit,
} from './types.js';

export { RELEVANCE_RULES_VERSION, LARGE_CHANGE_FILES, SMALL_CHANGE_FILES, SKIP_MIN_OBSERVATIONS, TARGET_PATH_LIMIT } from './rules.js';
export type * from './types.js';

const LEVEL_RANK: Record<RelevanceLevel, number> = { skip: 0, light: 1, full: 2 };

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Minimal deterministic glob (`*` wildcard) match for preference scopes. */
export function matchScope(scope: string, path: string): boolean {
  const pattern = scope.trim().toLowerCase();
  const target = path.toLowerCase();
  if (!pattern.includes('*')) return target === pattern || target.startsWith(`${pattern}/`);
  const regexp = new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}`);
  return regexp.test(target);
}

function scanTerms(text: string, rules: RiskTermRule[], where: 'task' | 'path', ref: string): RiskHit[] {
  const lower = text.toLowerCase();
  const hits: RiskHit[] = [];
  for (const rule of rules) {
    if (!rule.pattern.test(lower)) continue;
    const existing = hits.find(hit => hit.label === rule.label && hit.where === where);
    if (existing) continue;
    hits.push({
      label: rule.label, riskClass: rule.riskClass, where,
      ref: where === 'path' ? ref : rule.label,
      focus: [...rule.focus], conceptIds: [...(rule.conceptIds ?? [])],
    });
  }
  return hits;
}

function classify(input: RelevanceInput, env: RelevanceEnvironment): RelevanceSignals {
  const task = input.task ?? '';
  const files = [...new Set(input.changedFiles ?? [])];
  const lowerTask = task.toLowerCase();

  const criticalHits: RiskHit[] = [
    ...scanTerms(task, CRITICAL_RISK_TERMS, 'task', ''),
    ...files.flatMap(path => scanTerms(path, CRITICAL_RISK_TERMS, 'path', path)),
  ];
  const moderateHits: RiskHit[] = [
    ...scanTerms(task, MODERATE_RISK_TERMS, 'task', ''),
    ...files.flatMap(path => scanTerms(path, MODERATE_RISK_TERMS, 'path', path)),
  ];
  const dedupe = (hits: RiskHit[]) => {
    const seen = new Set<string>();
    return hits.filter(hit => {
      const key = `${hit.label}|${hit.where}|${hit.ref}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.label.localeCompare(b.label, 'en') || a.where.localeCompare(b.where, 'en') || a.ref.localeCompare(b.ref, 'en'));
  };

  const extensions = files.map(extOf);
  const javaTouched = files.some(path => extOf(path) === 'java' || path.includes('src/main/java/'));
  const migrationTouched = files.some(path => MIGRATION_PATH.test(path));
  const sharedCoreTouched = files.some(path => {
    if (!CODE_EXTENSIONS.has(extOf(path))) return false;
    return path.toLowerCase().split('/').some(segment => SHARED_CORE_SEGMENTS.has(segment));
  });
  const analyzableByEngine = files.some(path => ANALYZABLE_EXTENSIONS.has(extOf(path)));
  const pureRoutineAssets = files.length > 0 && extensions.every(ext => ROUTINE_ASSET_EXTENSIONS.has(ext));

  const sightings = [
    ...technologiesForPaths(files),
    ...technologiesForNames(input.projectContext ?? {}),
  ];
  const techKeys = [...new Set(sightings.map(s => `${s.dimension}:${s.key}`))].sort((a, b) => a.localeCompare(b, 'en'));

  const developer = env.developer;
  const familiarity: FamiliaritySignal[] = developer
    ? techKeys.flatMap(key => {
      const info = familiarityOf(developer, key, env.now);
      return info
        ? [{ key, provenance: info.provenance, freshness: info.freshness, observationCount: info.observationCount, recentlyCorrected: info.recentlyCorrected }]
        : [];
    })
    : [];

  const conceptStates = (env.concepts ?? []).map(concept => ({ conceptId: concept.conceptId, status: concept.status }));
  const staleActiveBindings = (env.concepts ?? []).reduce((sum, concept: ConceptKnowledgeState) => sum + concept.staleBindingCount, 0);

  const matchedPreferences = (developer?.preferences ?? [])
    .filter(preference => files.length === 0 || files.some(path => matchScope(preference.scope, path)))
    .map(preference => ({ scope: preference.scope, preference: preference.preference }))
    .sort((a, b) => a.scope.localeCompare(b.scope, 'en'));

  // A recent explicit correction anywhere in the context is a humility signal:
  // the user just told us something changed — no SKIP for the whole window
  // (T303 §18/§31.4, Case E), even if the corrected skill is not directly
  // derivable from the changed files' extensions.
  const recentCorrectionKeys = developer
    ? Object.values(developer.skills)
      .filter(assessment => hasRecentCorrection(developer, assessment.key, env.now))
      .map(assessment => assessment.key)
      .sort((a, b) => a.localeCompare(b, 'en'))
    : [];

  return {
    criticalHits: dedupe(criticalHits),
    moderateHits: dedupe(moderateHits),
    routineUiTask: ROUTINE_UI_TASK.test(lowerTask),
    routineTypeTask: ROUTINE_TYPE_TASK.test(lowerTask),
    newLibraryTask: NEW_LIBRARY_TASK.test(lowerTask),
    architectureTask: ARCHITECTURE_TASK.test(lowerTask),
    pureRoutineAssets,
    javaTouched,
    migrationTouched,
    sharedCoreTouched,
    changeSize: files.length,
    analyzableByEngine,
    techKeys,
    familiarity,
    conceptStates,
    staleActiveBindings,
    matchedPreferences,
    recentCorrectionKeys,
  };
}

/** Familiarity strong enough to drive a SKIP: observed/verified + fresh|aging + enough observations (§12/§13/§22). */
function strongFamiliarity(signals: RelevanceSignals, keys: string[]): boolean {
  if (!keys.length) return false;
  const relevant = signals.familiarity.filter(item => keys.includes(item.key));
  if (relevant.length !== keys.length) return false; // unknown skill → not enough evidence → no skip
  return relevant.every(item =>
    (item.provenance === 'observed' || item.provenance === 'verified')
    && (item.freshness === 'fresh' || item.freshness === 'aging')
    && item.observationCount >= SKIP_MIN_OBSERVATIONS
    && !item.recentlyCorrected);
}

function frontendKeysOf(signals: RelevanceSignals): string[] {
  return signals.techKeys.filter(key => key.startsWith('framework:') || key.startsWith('language:'));
}

function pathTargets(files: string[], reason: string): AnalysisTarget[] {
  return files.slice(0, TARGET_PATH_LIMIT).map(path => ({ kind: 'path' as const, ref: path, reason }));
}

function focusTargets(hits: RiskHit[], conceptIds: string[]): AnalysisTarget[] {
  const seen = new Set<string>();
  const targets: AnalysisTarget[] = [];
  for (const hit of hits) {
    for (const focus of hit.focus) {
      if (seen.has(focus)) continue;
      seen.add(focus);
      targets.push({ kind: 'focus', ref: focus, reason: `高风险词命中：${hit.label}` });
    }
  }
  for (const conceptId of conceptIds) {
    if (seen.has(conceptId)) continue;
    seen.add(conceptId);
    targets.push({ kind: 'concept', ref: conceptId, reason: '映射到引擎概念（可经 learning/knowledge state 钻取）' });
  }
  return targets;
}

/**
 * The gate. Ordered, deterministic rules; every branch appends a rule-tagged
 * reason. `now` comes from the environment — same input ⇒ same decision.
 */
export function decideRelevance(input: RelevanceInput, env: RelevanceEnvironment): RelevanceDecision {
  const signals = classify(input, env);
  const files = [...new Set(input.changedFiles ?? [])];
  const reasons: string[] = [];
  const limitations: string[] = [];
  let level: RelevanceLevel = 'light';
  let targets: AnalysisTarget[] = [];

  const raise = (next: RelevanceLevel) => { if (LEVEL_RANK[next] > LEVEL_RANK[level]) level = next; };
  const alwaysAnalyze = signals.matchedPreferences.some(p => p.preference === 'always-analyze');
  const skipPreference = signals.matchedPreferences.some(p => p.preference === 'skip-deep-analysis');
  const hasRiskHits = signals.criticalHits.length > 0 || signals.moderateHits.length > 0;
  const conceptIds = [...new Set([...signals.criticalHits, ...signals.moderateHits].flatMap(hit => hit.conceptIds))];
  const allMappedConceptsVerified = conceptIds.length > 0
    && conceptIds.every(id => signals.conceptStates.some(c => c.conceptId === id && c.status === 'verified'));

  if (!input.task && files.length === 0) {
    // Insufficient input: honest conservative default — LIGHT, never SKIP (§12).
    reasons.push('[insufficient-input] 没有任务描述也没有变更文件，信息不足；保守选择 LIGHT。');
    level = 'light';
  } else if (signals.criticalHits.length > 0) {
    // §11 high-risk domain ⇒ FULL. Downgrade only on POSITIVE verified concept
    // knowledge + small change (§13: familiar tech ≠ familiar problem; a mere
    // skill claim or unmapped term never downgrades).
    const small = signals.changeSize <= SMALL_CHANGE_FILES;
    const noCorrection = signals.recentCorrectionKeys.length === 0;
    if (allMappedConceptsVerified && small && noCorrection) {
      level = 'light';
      reasons.push(`[critical-risk→knowledge] 命中高风险词（${signals.criticalHits.map(h => h.label).join('、')}），但相关概念均已 verified 且变更很小（${signals.changeSize} 文件）→ LIGHT 聚焦分析。`);
    } else {
      level = 'full';
      const why = !allMappedConceptsVerified
        ? (conceptIds.length === 0 ? '高风险词没有可降级的已验证概念知识' : '相关概念知识未达到 verified')
        : !small ? `变更规模 ${signals.changeSize} 文件超过小变更阈值 ${SMALL_CHANGE_FILES}` : '存在近期用户修正';
      reasons.push(`[critical-risk] 命中高风险领域：${signals.criticalHits.map(h => h.label).join('、')} → FULL（${why}）。`);
    }
    if (signals.moderateHits.length) reasons.push(`[moderate-risk] 同时命中：${signals.moderateHits.map(h => h.label).join('、')}。`);
    targets = [...focusTargets([...signals.criticalHits, ...signals.moderateHits], conceptIds), ...pathTargets(files, '变更文件')];
  } else if (signals.moderateHits.length > 0) {
    // §10: risk-relevant but scope-narrowable. Frontend-only small change ⇒ LIGHT
    // (Case B: React 权限控制); Java/backend or larger ⇒ FULL.
    if (signals.javaTouched || signals.changeSize > SMALL_CHANGE_FILES) {
      level = 'full';
      reasons.push(`[moderate-risk+backend] 命中 ${signals.moderateHits.map(h => h.label).join('、')}，且${signals.javaTouched ? '涉及 Java 后端代码' : `变更规模 ${signals.changeSize} 文件`} → FULL。`);
    } else {
      level = 'light';
      reasons.push(`[moderate-risk] 命中 ${signals.moderateHits.map(h => h.label).join('、')}；变更集中在前端且规模小 → LIGHT 聚焦分析，不扫描整个仓库。`);
    }
    targets = [...focusTargets(signals.moderateHits, conceptIds), ...pathTargets(files, '变更文件')];
  } else if (signals.migrationTouched) {
    level = 'full';
    reasons.push('[migration] 变更涉及数据库迁移/SQL/changelog 路径 → FULL（migration safety/rollback）。');
    targets = [
      { kind: 'focus', ref: 'migration safety', reason: '迁移路径命中' },
      { kind: 'focus', ref: 'backward compatibility', reason: '迁移路径命中' },
      { kind: 'focus', ref: 'rollback plan', reason: '迁移路径命中' },
      ...pathTargets(files, '变更文件'),
    ];
  } else if (signals.changeSize > LARGE_CHANGE_FILES || signals.sharedCoreTouched) {
    // §11 影响范围大：core domain / shared infra / public API / cross-module.
    level = 'full';
    reasons.push(signals.sharedCoreTouched
      ? `[shared-core] 变更触达共享/核心路径（core/common/shared/domain/api 等）→ FULL（影响范围大）。`
      : `[large-change] 变更 ${signals.changeSize} 个文件，超过 ${LARGE_CHANGE_FILES} → FULL（影响范围大）。`);
    targets = pathTargets(files, '变更文件');
  } else if (signals.javaTouched && signals.staleActiveBindings > 0) {
    // §9/§11 历史风险信号：stale 概念绑定说明既往知识因代码变化待复核。
    level = 'light';
    reasons.push(`[historical-risk] 存在 ${signals.staleActiveBindings} 条 stale 学习绑定（历史风险信号），且本次触达 Java → 至少 LIGHT。`);
    targets = pathTargets(files, '变更 Java 文件');
  } else if (!signals.javaTouched && (signals.routineUiTask || signals.pureRoutineAssets || (signals.routineTypeTask && !signals.javaTouched))) {
    // §9 routine task CLASS: button/loading/css/copy/type-rename level work.
    // The skip is class-driven, not claim-driven (§12): a self-reported skill
    // is never the reason. Vetoes: risk terms (already handled above), recent
    // corrections, always-analyze preference.
    const vetoCorrection = signals.recentCorrectionKeys.length > 0;
    if (alwaysAnalyze || vetoCorrection) {
      level = 'light';
      reasons.push(alwaysAnalyze
        ? '[preference] 用户偏好 always-analyze 覆盖该范围 → 不 SKIP。'
        : `[correction] 相关技能近期有用户修正（${signals.recentCorrectionKeys.join('、')}）→ 不因常规类别 SKIP。`);
      targets = pathTargets(files, '变更文件');
    } else {
      level = 'skip';
      reasons.push(signals.pureRoutineAssets && files.length > 0
        ? '[routine-class] 变更全部为样式/资源/文档类文件，且无高风险词命中 → SKIP（任务类别低风险，非技能声明驱动）。'
        : '[routine-class] 常规低风险 UI/类型任务（按钮/样式/文案/类型级修改），无高风险词命中 → SKIP。');
    }
  } else if (signals.javaTouched) {
    // Engine's deep-analysis target. Routine backend change with long-term
    // observed familiarity and small scope may skip (§13 dynamic exemption);
    // otherwise LIGHT scoped to the changed Java files.
    const keys = frontendKeysOf(signals).filter(key => ['language:java', 'framework:spring', 'framework:jpa'].includes(key));
    if (!alwaysAnalyze && signals.recentCorrectionKeys.length === 0
      && signals.changeSize <= SMALL_CHANGE_FILES && strongFamiliarity(signals, keys)) {
      level = 'skip';
      reasons.push(`[dynamic-exemption] 小型 Java 变更（${signals.changeSize} 文件）+ 长期观察到的熟悉度（${keys.join('、')}，observed/verified 且 fresh）+ 无风险词/历史风险 → SKIP。`);
    } else {
      level = 'light';
      reasons.push('[java-change] 触达 Java 后端代码（引擎深度分析目标），未满足豁免条件 → LIGHT，聚焦变更文件。');
      targets = pathTargets(files, '变更 Java 文件');
    }
  } else if (files.length > 0 && !signals.analyzableByEngine) {
    // Non-covered stack (frontend logic without routine class, python/go/...).
    // Frontend code with strong observed familiarity → SKIP (§22 long-term
    // observed familiarity may skip); otherwise LIGHT (scoped review pointers)
    // with an honest coverage limitation — unknown ≠ unsafe, and the engine
    // cannot deep-analyze these languages yet.
    const frontendKeys = frontendKeysOf(signals);
    if (!alwaysAnalyze && signals.recentCorrectionKeys.length === 0 && frontendKeys.length > 0 && strongFamiliarity(signals, frontendKeys)) {
      level = 'skip';
      reasons.push(`[familiarity] 前端/非 Java 变更 + 长期观察到的熟悉度（${frontendKeys.join('、')}）+ 无风险词命中 → SKIP。`);
      limitations.push('当前引擎深度分析仅覆盖 Java；SKIP 表示 X-Ray 分析无增益，不代表代码正确。');
    } else {
      level = 'light';
      reasons.push(signals.familiarity.length === 0
        ? '[no-familiarity] 缺少足够的 observed/verified 熟悉度证据（unknown ≠ 不会，但不足以 SKIP）→ LIGHT。'
        : '[familiarity-insufficient] 熟悉度证据不足（provenance/freshness/观察次数未达阈值）→ LIGHT。');
      targets = pathTargets(files, '变更文件（作为聚焦审查范围）');
      limitations.push('当前引擎深度分析仅覆盖 Java；LIGHT 目标供聚焦人工/Agent 审查，X-Ray 扫描对这些文件无规则覆盖。');
    }
  } else {
    level = 'light';
    reasons.push('[fallback] 变更/任务未匹配任何明确类别 → 保守 LIGHT。');
    targets = pathTargets(files, '变更文件');
  }

  // Floors from task-level signals (§22: new library integration → LIGHT; unknown architecture → LIGHT/FULL).
  if (signals.newLibraryTask && LEVEL_RANK[level] < LEVEL_RANK['light'] && !hasRiskHits) {
    level = 'light';
    reasons.push('[new-library] 任务涉及新库/依赖接入或升级 → 至少 LIGHT。');
    if (targets.length === 0) targets = [{ kind: 'focus', ref: 'integration boundary', reason: '新库接入' }, { kind: 'focus', ref: 'dependency configuration', reason: '新库接入' }];
  }
  if (signals.architectureTask && LEVEL_RANK[level] < LEVEL_RANK['light']) {
    level = 'light';
    reasons.push('[architecture] 任务涉及架构/陌生代码/大规模重构 → 至少 LIGHT。');
    if (targets.length === 0) targets = [{ kind: 'focus', ref: 'module boundaries', reason: '架构级任务' }, { kind: 'focus', ref: 'shared contracts', reason: '架构级任务' }];
  }
  if (alwaysAnalyze && level === 'skip') {
    level = 'light';
    reasons.push('[preference] 用户偏好 always-analyze → 不 SKIP。');
  }
  if (signals.recentCorrectionKeys.length > 0 && level === 'skip') {
    // Global correction floor: within the window after ANY explicit correction
    // the system stays humble — no class/familiarity/preference skip (§18/§31.4).
    level = 'light';
    reasons.push(`[correction] 近期窗口内存在用户修正（${signals.recentCorrectionKeys.join('、')}）→ 全局不 SKIP。`);
    if (targets.length === 0) targets = pathTargets(files, '变更文件');
  }
  // §13 dynamic exemption: user preference skip-deep-analysis may downgrade a
  // non-risk LIGHT to SKIP; it never touches risk-driven FULL/LIGHT decisions.
  if (skipPreference && level === 'light' && !hasRiskHits && !signals.migrationTouched && !signals.sharedCoreTouched && signals.recentCorrectionKeys.length === 0) {
    level = 'skip';
    reasons.push('[preference] 用户偏好 skip-deep-analysis 覆盖该范围，且无风险信号 → SKIP。');
    targets = [];
  }

  if (level === 'skip') {
    targets = []; // §16: skip stays minimal.
    limitations.push('skip ≠ 代码正确：仅表示本次任务不值得消耗 X-Ray 分析成本（T303 §9）。');
  }

  return {
    level,
    reasons,
    targets,
    limitations: [...new Set(limitations)],
    signals,
    rulesVersion: RELEVANCE_RULES_VERSION,
    quiet: level === 'skip',
  };
}
