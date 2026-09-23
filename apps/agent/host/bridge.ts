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
import { snapshotWorkspace, stalePaths } from '../../../packages/workspace-local/index.js';
import {
  SCHEMA_VERSION, VERSION, XrayError,
  type AnalysisReport, type AnalyzeRequest, type Envelope, type Gate, type ReviewOutput, type ReviewRecord, type ReviewSession, type SourceFile,
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
const REVIEW_PATH_LIMIT = 50;
const REVIEW_CHECK_LIMIT = 20;

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
  record: ReviewRecord;
  reused: boolean;
  stale: boolean;
  stalePaths: string[];
  analysisId: string;
}

/**
 * Finish a review: analyze the post-change snapshot against the captured
 * baseline, persist an idempotent ReviewRecord and report the gate. When the
 * target snapshot already has a review, the stored record is reused — a
 * repeated trigger never fabricates a new conclusion.
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
    const existing = await local.loadReview<ReviewRecord>(workspacePath, existingId);
    if (existing) {
      const staleness = await stalenessOf(workspacePath, existing);
      return { record: withStaleness(existing, staleness), reused: true, ...staleness, analysisId: existing.analysisId };
    }
  }
  // Debt delta: bindings before this report vs after syncing to it.
  const stateBefore = await local.readState<LearningState>(workspacePath, emptyLearningState());
  const debtBefore = debtSummary(stateBefore);
  const synced = syncBindings(stateBefore, report);
  await local.updateState(workspacePath, emptyLearningState(), () => synced.state);
  const debtAfter = debtSummary(synced.state);
  const record = buildReviewRecord(payload.session, report, reviewId, debtBefore, debtAfter, {
    before: Object.keys(stateBefore.bindings).length, after: Object.keys(synced.state.bindings).length,
  });
  await local.saveReview(workspacePath, record);
  return { record, reused: false, ...(await stalenessOf(workspacePath, record)), analysisId: report.analysisId };
}

export function computeReviewId(workspaceId: string, targetSnapshotId: string): string {
  // Content-addressed: same workspace + same target snapshot + same rule set ⇒ same review id.
  return `rev_${sha256(`${workspaceId}|${targetSnapshotId}|${RULE_SET_VERSION}`).slice(0, 32)}`;
}

/** Re-read a stored review; staleness and gate downgrade are always computed fresh, never persisted. */
export async function readReview(path: string, reviewId: string): Promise<ReviewFinishResult & { record: ReviewRecord }> {
  const workspacePath = resolveWorkspace(path);
  const record = await store().loadReview<ReviewRecord>(workspacePath, reviewId);
  if (!record) throw new XrayError('NO_REVIEW', `没有找到审查记录 ${reviewId}。`, 2);
  const staleness = await stalenessOf(workspacePath, record);
  return { record: withStaleness(record, staleness), reused: true, ...staleness, analysisId: record.analysisId };
}

async function stalenessOf(workspacePath: string, record: ReviewRecord): Promise<{ stale: boolean; stalePaths: string[] }> {
  const changed = await stalePaths(workspacePath, { files: record.target.files });
  return { stale: changed.length > 0, stalePaths: changed };
}

/** A stale review downgrades to incomplete at READ time (not persisted): old conclusions never claim current validity (V04-3). */
function withStaleness(record: ReviewRecord, staleness: { stale: boolean; stalePaths: string[] }): ReviewRecord {
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

function buildReviewRecord(
  session: ReviewSession, report: AnalysisReport,
  reviewId: string, debtBefore: ReturnType<typeof debtSummary>, debtAfter: ReturnType<typeof debtSummary>,
  bindings: { before: number; after: number },
): ReviewRecord {
  const diff = report.diff;
  const newIds = diff?.newFindingIds ?? [];
  const continuingIds = diff?.continuingFindingIds ?? [];
  const removed = diff?.removedFindings ?? [];
  const changedFindings = report.findings.filter(f => newIds.includes(f.id) || continuingIds.includes(f.id));
  const evidenceRefs = [...new Set(changedFindings.flatMap(f => f.evidenceIds))].slice(0, REVIEW_PATH_LIMIT);
  const output: ReviewOutput = {
    changeSummary: diff
      ? `相对基线：新增 ${diff.added.length} 个文件、修改 ${diff.modified.length} 个、删除 ${diff.deleted.length} 个；新增风险 ${newIds.length} 项、持续 ${continuingIds.length} 项、移除 ${removed.length} 项。${report.summary}`
      : `无基线对比（缺少 diff）：${report.summary}`,
    pathImpacts: {
      added: (diff?.added ?? []).slice(0, REVIEW_PATH_LIMIT),
      modified: (diff?.modified ?? []).slice(0, REVIEW_PATH_LIMIT),
      deleted: (diff?.deleted ?? []).slice(0, REVIEW_PATH_LIMIT),
    },
    newFindingIds: newIds, continuingFindingIds: continuingIds,
    removedFindingIds: removed.map(f => f.id), removedFindingTitles: removed.map(f => f.title),
    evidenceRefs,
    unknownCoverage: report.coverage.reasons.slice(0, REVIEW_PATH_LIMIT).map(r => ({ path: r.path, code: r.code, message: r.message })),
    suggestedChecks: changedFindings.slice(0, REVIEW_CHECK_LIMIT).map(f => ({ findingId: f.id, ruleId: f.ruleId, symbol: f.symbol, nextCheck: f.nextCheck })),
    conceptRefs: [...new Set(changedFindings.map(f => f.conceptId))],
    debtDelta: {
      modelVersion: debtAfter.modelVersion, before: debtBefore.total, after: debtAfter.total,
      delta: debtAfter.total - debtBefore.total,
      bindingsBefore: bindings.before, bindingsAfter: bindings.after,
    },
    limitations: [...report.limitations, ...(diff?.limitations ?? [])],
  };
  return {
    schemaVersion: '0.1', reviewId,
    workspaceId: report.snapshot.workspaceId,
    baseline: { snapshotId: session.baseline.id, gitHead: session.baseline.gitHead, gitBase: session.baseline.gitBase, ref: session.baseline.ref },
    target: { snapshotId: report.snapshot.id, gitHead: report.snapshot.gitHead, files: report.snapshot.files, createdAt: report.createdAt },
    analysisId: report.analysisId,
    reportStatus: report.status,
    versions: {
      engineVersion: ENGINE_VERSION, ruleSetVersion: RULE_SET_VERSION, protocolVersion: SCHEMA_VERSION,
      adapterVersion: AGENT_ADAPTER_VERSION, surface: 'agent-mcp',
    },
    gate: computeGate(report, output),
    output,
  };
}

/** Gate semantics (PRD §8.5-5): never pass on partial/failed/unknown; blocking only under explicit enforce policy. */
export function computeGate(report: AnalysisReport, output: ReviewOutput): Gate {
  const blocking = gatePolicy() === 'enforce';
  if (report.status === 'failed' || report.status === 'cancelled')
    return { state: 'failed', reasons: [`分析状态为 ${report.status}，审查结论不可用。`], blocking };
  const reasons: string[] = [];
  if (report.status === 'partial') reasons.push('覆盖不完整（partial）：存在解析失败或快照变化，结论范围受限。');
  const risky = output.newFindingIds.length + output.continuingFindingIds.length;
  if (risky > 0) reasons.push(`${output.newFindingIds.length} 项新增、${output.continuingFindingIds.length} 项持续风险需要人工检查（含证据与验证建议）。`);
  if (report.coverage.unknown > 0) reasons.push(`${report.coverage.unknown} 项未知/未解析覆盖，已在 unknownCoverage 列出；未知不等于无风险。`);
  if (reasons.length === 0 && report.status === 'complete')
    return { state: 'pass', reasons: ['分析完成且变更范围内没有触发规则；零发现不等于没有问题，覆盖与限制见 output。'], blocking: false };
  const state = report.status === 'partial' ? 'incomplete' : 'needs_human';
  return { state, reasons, blocking };
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
