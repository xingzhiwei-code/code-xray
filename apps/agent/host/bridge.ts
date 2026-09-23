/**
 * The single seam between the MCP host protocol and the shared domain layer
 * (Engine facade, LocalStore, learning, profile). No rules, gate logic or debt
 * formulas are reimplemented here; Surfaces must reuse the Engine boundary
 * (D009, ARCHITECTURE §3). If this bridge ever needs process isolation, it
 * becomes the apps/engine-host stdio client without touching tool handlers.
 */
import { resolve } from 'node:path';
import { analyze, capabilities as engineCapabilities, ENGINE_VERSION, RULE_SET_VERSION } from '../../../packages/engine/index.js';
import { LocalStore } from '../../../packages/storage-local/index.js';
import { emptyLearningState, syncBindings } from '../../../packages/learning/engine.js';
import { SCHEMA_VERSION, VERSION, XrayError, type AnalysisReport, type AnalyzeRequest, type Envelope, errorEnvelope, okEnvelope } from '../../../packages/protocol/index.js';

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
