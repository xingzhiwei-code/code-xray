/**
 * The single seam between the MCP host protocol and the shared domain layer
 * (Engine facade, LocalStore, learning, profile). No rules, gate logic or debt
 * formulas are reimplemented here; Surfaces must reuse the Engine boundary
 * (D009, ARCHITECTURE §3). If this bridge ever needs process isolation, it
 * becomes the apps/engine-host stdio client without touching tool handlers.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { analyze, analyzeWithBaseline, capabilities as engineCapabilities, ENGINE_VERSION, RULE_SET_VERSION } from '../../../packages/engine/index.js';
import { LocalStore } from '../../../packages/storage-local/index.js';
import { debtSummary, emptyLearningState, learningCard, syncBindings, type LearningState } from '../../../packages/learning/engine.js';
import { emptyDeveloperProfile, knowledgeGaps } from '../../../packages/developer-profile/engine.js';
import { buildReviewRecord } from '../../../packages/insights/review.js';
import { renderReviewPresentation } from '../../../packages/insights/presentation.js';
import { snapshotWorkspace, stalePaths } from '../../../packages/workspace-local/index.js';
import {
  SCHEMA_VERSION, VERSION, XrayError,
  type AnalysisReport, type AnalyzeRequest, type Envelope, type ReviewSession, type SourceFile, type StoredReviewRecord,
  errorEnvelope, okEnvelope,
} from '../../../packages/protocol/index.js';

export const AGENT_ADAPTER_VERSION = '0.1.0';
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_PROTOCOL_FALLBACK = '2024-11-05';
export const SERVER_INFO = { name: 'code-xray', title: 'Code X-Ray', version: VERSION };

export type GatePolicy = 'report-only' | 'enforce';

export function gatePolicy(env: NodeJS.ProcessEnv = process.env): GatePolicy {
  // Blocking behavior is opt-in only (PRD §8.5-5); anything unrecognized stays report-only.
  return env.XRAY_AGENT_GATE === 'enforce' ? 'enforce' : 'report-only';
}

export function store(): LocalStore {
  return new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
}

export function resolveWorkspace(path: string): string {
  if (typeof path !== 'string' || !path.trim()) throw new XrayError('INVALID_ARGUMENT', 'path 不能为空。', 2);
  return resolve(path);
}

export interface ScanInput {
  path: string;
  base?: string;
  scope?: AnalyzeRequest['scope'];
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Findings are truncated for the tool channel; the full report is persisted and recoverable by analysisId. */
export const SCAN_FINDING_LIMIT = 20;

export interface ScanResult {
  analysisId: string;
  snapshotId: string;
  workspaceId: string;
  status: AnalysisReport['status'];
  summary: string;
  coverage: AnalysisReport['coverage'];
  findingsTotal: number;
  findingsTruncated: boolean;
  findings: AnalysisReport['findings'];
  diff: AnalysisReport['diff'];
  limitations: string[];
  savedTo: string;
}

export async function runScan(input: ScanInput): Promise<ScanResult> {
  const path = resolveWorkspace(input.path);
  const request: AnalyzeRequest = {
    path,
    ...(input.base ? { base: input.base } : {}),
    ...(input.scope ? { scope: input.scope } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  };
  let report: AnalysisReport;
  if (input.timeoutMs && input.timeoutMs > 0) {
    report = await withTimeout(analyze(request), input.timeoutMs);
  } else {
    report = await analyze(request);
  }
  const local = store();
  await local.saveReport(path, report.analysisId, report);
  // Learning bindings follow the saved report, same lifecycle as CLI/VS Code Surfaces.
  await local.updateState(path, emptyLearningState(), state => syncBindings(state, report).state);
  return {
    analysisId: report.analysisId,
    snapshotId: report.snapshot.id,
    workspaceId: report.snapshot.workspaceId,
    status: report.status,
    summary: report.summary,
    coverage: report.coverage,
    findingsTotal: report.findings.length,
    findingsTruncated: report.findings.length > SCAN_FINDING_LIMIT,
    findings: report.findings.slice(0, SCAN_FINDING_LIMIT),
    diff: report.diff,
    limitations: report.limitations,
    savedTo: local.dataDir,
  };
}

export async function loadSavedReport(path: string, analysisId?: string): Promise<AnalysisReport> {
  const report = await store().loadReport<AnalysisReport>(resolveWorkspace(path), analysisId ?? 'latest');
  if (!report) throw new XrayError('NO_REPORT', analysisId ? `没有找到报告 ${analysisId}；先运行 xray_scan。` : '该工作区没有已保存的报告；先运行 xray_scan。', 2);
  return report;
}

// ---------- Review sessions (PRD §8.5-3/4/5/7, V04-1/3) ----------

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

interface SessionPayload { session: ReviewSession; files: SourceFile[] }

export interface ReviewStartResult {
  sessionId: string;
  baselineSnapshotId: string;
  gitHead: string | null;
  fileCount: number;
  createdAt: string;
  note: string;
}

/** Capture the pre-change baseline (disk state, including uncommitted content) and open a review session. */
export async function startReview(path: string, signal?: AbortSignal): Promise<ReviewStartResult> {
  const workspacePath = resolveWorkspace(path);
  const workspace = await snapshotWorkspace({ path: workspacePath, ...(signal ? { signal } : {}) });
  const createdAt = new Date().toISOString();
  const sessionId = `revs_${sha256(`${workspace.snapshot.workspaceId}|${workspace.snapshot.id}|${createdAt}`).slice(0, 32)}`;
  const session: ReviewSession = {
    schemaVersion: '0.1', reviewId: '', workspace: workspacePath, base: null,
    baseline: { ...workspace.snapshot, ref: null },
    createdAt,
  };
  const payload: SessionPayload = { session, files: workspace.files };
  await store().saveSession(workspacePath, sessionId, payload);
  return {
    sessionId, baselineSnapshotId: workspace.snapshot.id, gitHead: workspace.snapshot.gitHead,
    fileCount: workspace.files.length, createdAt,
    note: '基线已记录（磁盘现状，含未提交内容）。完成修改后调用 xray_review_finish 生成结构化审查。',
  };
}

export interface ReviewFinishResult {
  record: StoredReviewRecord;
  reused: boolean;
  stale: boolean;
  stalePaths: string[];
  analysisId: string;
  /** Deterministic human-friendly first-screen rendering (plan §15); derived from the record, never a new fact source. */
  presentation: string;
}

/**
 * Finish a review: analyze the post-change snapshot against the captured
 * baseline, persist an idempotent ReviewRecord and report the gate. When the
 * target snapshot already has a review, the stored record is reused — a
 * repeated trigger never fabricates a new conclusion. Stored v0.1 records are
 * returned as-is (versioned read; no silent migration, no invented insights).
 */
export async function finishReview(path: string, sessionId: string, options: { base?: string; signal?: AbortSignal } = {}): Promise<ReviewFinishResult> {
  const workspacePath = resolveWorkspace(path);
  const local = store();
  const payload = await local.loadSession<SessionPayload>(workspacePath, sessionId);
  if (!payload?.session) throw new XrayError('NO_REVIEW_SESSION', `没有找到审查会话 ${sessionId}；先调用 xray_review_start 记录改动前基线。`, 2);
  const request: AnalyzeRequest = { path: workspacePath, ...(options.signal ? { signal: options.signal } : {}) };
  const { ref: _ref, ...baselineSnapshot } = payload.session.baseline;
  const report = options.base
    ? await analyze({ ...request, base: options.base })
    : await analyzeWithBaseline(request, { snapshot: baselineSnapshot, files: payload.files });
  await local.saveReport(workspacePath, report.analysisId, report);
  const reviewId = computeReviewId(report.snapshot.workspaceId, report.snapshot.id);
  const existingId = await local.findReviewByTargetSnapshot(workspacePath, report.snapshot.id);
  if (existingId) {
    const existing = await local.loadReview<StoredReviewRecord>(workspacePath, existingId);
    if (existing) {
      const staleness = await stalenessOf(workspacePath, existing);
      const record = withStaleness(existing, staleness);
      return { record, reused: true, ...staleness, analysisId: existing.analysisId, presentation: renderReviewPresentation(record) };
    }
  }
  // Debt delta: bindings before this report vs after syncing to it. Both
  // sides use the SAME debt model function, so before/after/delta are always
  // computed under one modelVersion (plan §14.2, Case 13).
  const stateBefore = await local.readState<LearningState>(workspacePath, emptyLearningState());
  const debtBefore = debtSummary(stateBefore);
  const synced = syncBindings(stateBefore, report);
  await local.updateState(workspacePath, emptyLearningState(), () => synced.state);
  const debtAfter = debtSummary(synced.state);
  const record = buildReviewRecord({
    session: payload.session, report, reviewId,
    versions: {
      engineVersion: ENGINE_VERSION, ruleSetVersion: RULE_SET_VERSION, protocolVersion: SCHEMA_VERSION,
      adapterVersion: AGENT_ADAPTER_VERSION, surface: 'agent-mcp',
    },
    learningStateBefore: stateBefore, learningStateAfter: synced.state,
    debtBefore, debtAfter,
    gateBlocking: gatePolicy() === 'enforce',
  });
  await local.saveReview(workspacePath, record);
  return { record, reused: false, ...(await stalenessOf(workspacePath, record)), analysisId: report.analysisId, presentation: renderReviewPresentation(record) };
}

export function computeReviewId(workspaceId: string, targetSnapshotId: string): string {
  // Content-addressed: same workspace + same target snapshot + same rule set ⇒ same review id.
  return `rev_${sha256(`${workspaceId}|${targetSnapshotId}|${RULE_SET_VERSION}`).slice(0, 32)}`;
}

/** Re-read a stored review (v0.1 or v0.2); staleness and gate downgrade are always computed fresh, never persisted. */
export async function readReview(path: string, reviewId: string): Promise<ReviewFinishResult & { record: StoredReviewRecord }> {
  const workspacePath = resolveWorkspace(path);
  const record = await store().loadReview<StoredReviewRecord>(workspacePath, reviewId);
  if (!record) throw new XrayError('NO_REVIEW', `没有找到审查记录 ${reviewId}。`, 2);
  const staleness = await stalenessOf(workspacePath, record);
  const fresh = withStaleness(record, staleness);
  return { record: fresh, reused: true, ...staleness, analysisId: record.analysisId, presentation: renderReviewPresentation(fresh) };
}

async function stalenessOf(workspacePath: string, record: StoredReviewRecord): Promise<{ stale: boolean; stalePaths: string[] }> {
  const changed = await stalePaths(workspacePath, { files: record.target.files });
  return { stale: changed.length > 0, stalePaths: changed };
}

/** A stale review downgrades to incomplete at READ time (not persisted): old conclusions never claim current validity (V04-3). */
function withStaleness<T extends StoredReviewRecord>(record: T, staleness: { stale: boolean; stalePaths: string[] }): T {
  if (!staleness.stale) return record;
  const reason = `审查已过期：目标快照后 ${staleness.stalePaths.length} 个文件发生变化（${staleness.stalePaths.slice(0, 5).join('、')}${staleness.stalePaths.length > 5 ? ' 等' : ''}）；结论不代表当前代码。`;
  return {
    ...record,
    gate: {
      state: 'incomplete',
      reasons: [reason, ...record.gate.reasons],
      blocking: record.gate.blocking,
    },
  };
}

// ---------- explain / summary (reuse learning & profile engines, never recompute) ----------

export interface ExplainResult {
  analysisId: string; findingId: string; ruleId: string; ruleVersion: string; title: string;
  severity: string; epistemic: string; symbol: string;
  assumptions: string[]; uncertainties: string[]; nextCheck: string; conceptId: string;
  evidence: { evidenceId: string; path: string; start: number; end: number; observation: string }[];
  learning: { status: string; card: ReturnType<typeof learningCard> | null };
}

export async function explainFinding(path: string, findingId: string, analysisId?: string): Promise<ExplainResult> {
  const workspacePath = resolveWorkspace(path);
  const report = await loadSavedReport(workspacePath, analysisId);
  const finding = report.findings.find(f => f.id === findingId);
  if (!finding) throw new XrayError('FINDING_NOT_FOUND', `报告 ${report.analysisId} 中没有发现 ${findingId}。`, 2);
  const local = store();
  const state = await local.readState<LearningState>(workspacePath, emptyLearningState());
  const binding = Object.values(state.bindings).find(b => b.findingId === findingId);
  return {
    analysisId: report.analysisId, findingId: finding.id, ruleId: finding.ruleId, ruleVersion: finding.ruleVersion,
    title: finding.title, severity: finding.severity, epistemic: finding.epistemic, symbol: finding.symbol,
    assumptions: finding.assumptions, uncertainties: finding.uncertainties, nextCheck: finding.nextCheck, conceptId: finding.conceptId,
    evidence: finding.evidenceIds.map(id => {
      const evidence = report.evidence.find(e => e.id === id);
      return evidence
        ? { evidenceId: id, path: evidence.path, start: evidence.start.line, end: evidence.end.line, observation: evidence.observation }
        : { evidenceId: id, path: '', start: 0, end: 0, observation: '证据不在报告中' };
    }),
    learning: { status: binding?.status ?? 'unassessed', card: binding ? learningCard(binding) : null },
  };
}

export async function summarize(path: string, kind: 'learning' | 'debt' | 'profile', analysisId?: string): Promise<unknown> {
  const workspacePath = resolveWorkspace(path);
  const local = store();
  const state = await local.readState<LearningState>(workspacePath, emptyLearningState());
  if (kind === 'debt') return { kind, ...debtSummary(state) };
  if (kind === 'learning') {
    const bindings = Object.values(state.bindings);
    return {
      kind, total: bindings.length,
      byStatus: bindings.reduce<Record<string, number>>((acc, b) => { acc[b.status] = (acc[b.status] ?? 0) + 1; return acc; }, {}),
      concepts: [...new Set(bindings.map(b => b.conceptId))],
      note: '阅读不等于掌握；状态变更需经 xray learn 类显式事件（CLI/IDE），Agent 不替用户确认掌握。',
    };
  }
  const report = await loadSavedReport(workspacePath, analysisId);
  const profile = await local.readProfile(emptyDeveloperProfile());
  const gaps = knowledgeGaps(report, Object.keys(profile.skills).length ? profile : undefined, state);
  return { kind, analysisId: report.analysisId, ...gaps };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_never, reject) => { timer = setTimeout(() => reject(new XrayError('TIMEOUT', `分析超过 ${ms}ms 未完成，已放弃本次调用；可用更大 timeoutMs 重试或缩小 scope。`, 1)), ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export function toEnvelope<T>(run: () => Promise<T> | T): Promise<Envelope<T>> {
  return Promise.resolve().then(run).then(okEnvelope, errorEnvelope);
}

export { engineCapabilities, ENGINE_VERSION, RULE_SET_VERSION, SCHEMA_VERSION };
