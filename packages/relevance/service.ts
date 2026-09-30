/**
 * Relevance composition service (T303 Phase 4/6/7).
 *
 * ONE shared composition for every Surface (MCP bridge, CLI): loads the
 * Developer Context + concept knowledge states through a storage port, calls
 * the pure gate, records passive observations, appends the bounded decision
 * log and derives honest metrics. Surfaces only shape their own output — no
 * gate/observation/metric logic is ever reimplemented per Surface (D009).
 *
 * Privacy (§20): everything stays in the local store. The log holds rule
 * outputs and a task fingerprint — never raw task text, never source content.
 */
import { createHash } from 'node:crypto';
import type { AnalysisReport } from '../protocol/index.js';
import { conceptKnowledgeStates, emptyLearningState, type LearningState } from '../learning/engine.js';
import {
  dedupeSightings, emptyDeveloperContext, observeFromReport, readContextFrom, recordObservations,
  technologiesForNames, technologiesForPaths,
  type DeveloperContext, type StoredDeveloperData, type TechnologySighting,
} from '../developer-profile/engine.js';
import { decideRelevance } from './engine.js';
import type { RelevanceDecision, RelevanceInput, RelevanceLevel } from './types.js';

export type { RelevanceDecision, RelevanceInput, RelevanceLevel } from './types.js';

/** Structural port — LocalStore satisfies it; tests can substitute a fake. */
export interface RelevanceStorePort {
  readProfile<T>(initial: T): Promise<T>;
  updateProfile<T>(initial: T, update: (profile: T) => T | Promise<T>): Promise<T>;
  readState<T>(workspace: string, initial: T): Promise<T>;
  appendRelevanceEvent(workspace: string, event: unknown): Promise<void>;
  readRelevanceEvents<T = unknown>(workspace: string): Promise<T[]>;
}

export interface RelevanceLogEvent {
  at: string;
  type: 'decision' | 'false-skip-signal';
  level?: RelevanceLevel;
  rulesVersion?: string;
  fileCount: number;
  riskHitCount: number;
  /** sha256 prefix of the task text — correlation without retaining content (§20). */
  taskFingerprint: string;
  /** false-skip-signal only: the deterministic fact that triggered it. */
  fact?: string;
}

export function taskFingerprint(task: string | undefined): string {
  return createHash('sha256').update(task ?? '').digest('hex').slice(0, 12);
}

export interface RelevanceEvaluation {
  decision: RelevanceDecision;
  context: DeveloperContext;
}

/** Load context + knowledge states, decide, observe, log. `now` is injected by the caller. */
export async function evaluateRelevance(store: RelevanceStorePort, workspace: string, input: RelevanceInput, now: string): Promise<RelevanceEvaluation> {
  const stored = await store.readProfile<StoredDeveloperData>(emptyDeveloperContext(now));
  const context = readContextFrom(stored, now);
  const learning = await store.readState<LearningState>(workspace, emptyLearningState());
  const decision = decideRelevance(input, {
    developer: context,
    concepts: conceptKnowledgeStates(learning),
    now,
  });
  // Passive observation (Phase 4): the gate call is itself a coding-event
  // signal — only structured tech-stack sightings, never a behavior log (§17).
  const sightings = dedupeSightings([
    ...technologiesForPaths(input.changedFiles ?? []),
    ...technologiesForNames(input.projectContext ?? {}),
  ]);
  let updatedContext = context;
  if (sightings.length > 0) {
    updatedContext = await store.updateProfile(emptyDeveloperContext(now), current =>
      recordObservations(readContextFrom(current as StoredDeveloperData, now), sightings, now));
  }
  await store.appendRelevanceEvent(workspace, {
    at: now, type: 'decision', level: decision.level, rulesVersion: decision.rulesVersion,
    fileCount: new Set(input.changedFiles ?? []).size,
    riskHitCount: decision.signals.criticalHits.length + decision.signals.moderateHits.length,
    taskFingerprint: taskFingerprint(input.task),
  } satisfies RelevanceLogEvent);
  return { decision, context: updatedContext };
}

/** Record observations derived from analysis-report facts (scan / review paths). */
export async function recordReportObservations(store: RelevanceStorePort, report: AnalysisReport, now: string): Promise<void> {
  const sightings = observeFromReport(report);
  if (sightings.length === 0) return;
  await store.updateProfile(emptyDeveloperContext(now), current =>
    recordObservations(readContextFrom(current as StoredDeveloperData, now), sightings, now));
}

/**
 * False-skip fact signal (§24.3, §31.4): when the MOST RECENT log entry is a
 * skip decision and this analysis genuinely found new risks, append a factual
 * signal — no inference, no flow interruption, fully recoverable. Deduped by
 * requiring the skip decision to be the last entry (one signal per skip).
 */
export async function noteAnalysisAfterDecision(
  store: RelevanceStorePort, workspace: string,
  fact: { source: 'scan' | 'review'; newRiskCount: number }, now: string,
): Promise<void> {
  if (fact.newRiskCount <= 0) return;
  const events = await store.readRelevanceEvents<RelevanceLogEvent>(workspace);
  const last = events.at(-1);
  if (!last || last.type !== 'decision' || last.level !== 'skip') return;
  await store.appendRelevanceEvent(workspace, {
    at: now, type: 'false-skip-signal',
    fileCount: last.fileCount, riskHitCount: last.riskHitCount, taskFingerprint: last.taskFingerprint,
    fact: `skip 决策后 ${fact.source} 发现 ${fact.newRiskCount} 项新增风险（事实信号；skip 不代表代码正确）`,
  } satisfies RelevanceLogEvent);
}

export interface RelevanceStats {
  totalDecisions: number;
  skip: number; light: number; full: number;
  skipRate: number | null;
  falseSkipSignals: number;
  falseSkipRate: number | null;
  eventsRetained: number;
  note: string;
}

/** Honest metrics (§24): counts + skip rate + false-skip rate over the retained window. */
export async function relevanceStats(store: RelevanceStorePort, workspace: string): Promise<RelevanceStats> {
  const events = await store.readRelevanceEvents<RelevanceLogEvent>(workspace);
  const decisions = events.filter(event => event.type === 'decision');
  const count = (level: RelevanceLevel) => decisions.filter(event => event.level === level).length;
  const skip = count('skip');
  const falseSkipSignals = events.filter(event => event.type === 'false-skip-signal').length;
  const round = (value: number) => Number(value.toFixed(2));
  return {
    totalDecisions: decisions.length,
    skip, light: count('light'), full: count('full'),
    skipRate: decisions.length ? round(skip / decisions.length) : null,
    falseSkipSignals,
    falseSkipRate: skip ? round(falseSkipSignals / skip) : null,
    eventsRetained: events.length,
    note: 'false-skip=skip 后分析发现新增风险的事实信号（非推断）；useful-analysis-rate 需要真实使用反馈，v1 不做估算（§24.4 诚实标注未实现）。指标仅本机存储。',
  };
}

/** Technology sightings helper re-export for Surfaces composing their own paths. */
export { dedupeSightings, type TechnologySighting };
