import { Ajv2020 } from 'ajv/dist/2020.js';

export const VERSION = '0.1.0';
export const SCHEMA_VERSION = '0.1';
export type Epistemic = 'fact' | 'inference' | 'recommendation' | 'unknown';
export type Severity = 'high' | 'medium' | 'low';
export interface SourceFile { path: string; content: string; digest: string }
export interface Position { line: number; column: number }
export interface EvidenceRef {
  id: string; path: string; digest: string; start: Position; end: Position;
  observation: string; producer: string;
}
export interface Finding {
  id: string; ruleId: string; ruleVersion: string; title: string; severity: Severity;
  epistemic: Epistemic; evidenceIds: string[]; conceptId: string;
  symbol: string; assumptions: string[]; uncertainties: string[]; nextCheck: string;
}
export interface FlowEdge {
  from: string; to?: string; status: 'observed' | 'inferred' | 'unresolved';
  reason?: string; evidenceIds: string[];
}
export interface Diagnostic { path: string; code: string; message: string }
export interface Snapshot {
  id: string; workspaceId: string; files: {path:string;digest:string}[];
  gitHead: string | null; gitBase: string | null;
}
export interface Coverage {
  discovered: number; parsed: number; skipped: number; failed: number; unknown: number;
  reasons: Diagnostic[];
}
export interface DiffSummary {
  base: string; added: string[]; modified: string[]; deleted: string[];
  newFindingIds: string[]; continuingFindingIds: string[]; removedFindings: Finding[];
  limitations: string[];
}
export interface AnalysisReport {
  schemaVersion: '0.1'; analysisId: string; createdAt: string;
  status: 'complete' | 'partial' | 'failed' | 'cancelled';
  snapshot: Snapshot; coverage: Coverage; findings: Finding[]; evidence: EvidenceRef[];
  flows: FlowEdge[]; summary: string; diff: DiffSummary | null;
  provenance: {engineVersion:string;adapterVersion:string;ruleSetVersion:string;offline:boolean;llm:'disabled'|'enhanced'|'unavailable'};
  limitations: string[];
}
export interface AnalyzeRequest {
  path: string; base?: string; includeUntracked?: boolean; exclude?: string[];
  maxFiles?: number; maxFileBytes?: number; signal?: AbortSignal;
  scope?: AnalyzeScope;
  /** Internal observation hook: receives the baseline snapshot when a git base is resolved. Not part of the wire schema. */
  onBaseline?: (baseline: Snapshot) => void | Promise<void>;
}
export type AnalyzeScope =
  | { mode: 'selected'; paths: string[] }
  | { mode: 'uncommitted' };
/** Versioned capability declaration: what the engine can and cannot do, per language. */
export interface LanguageCapability {
  id: string; analyzerId: string; analyzerVersion: string;
  rules: string[]; bounds: string[];
}
export interface Capabilities {
  schemaVersion: string; engineVersion: string; languages: LanguageCapability[];
}
export class XrayError extends Error {
  constructor(public code:string,message:string,public exitCode=1) { super(message); this.name='XrayError'; }
}
/** Surface-facing result envelope (ARCHITECTURE §11): success and failure both serialize to one legal envelope. */
export type Envelope<T> =
  | { schemaVersion: '0.1'; status: 'ok'; data: T }
  | { schemaVersion: '0.1'; status: 'error'; error: { code: string; message: string; exitCode: number } };
export function okEnvelope<T>(data: T): Envelope<T> { return { schemaVersion: '0.1', status: 'ok', data }; }
export function errorEnvelope<T = never>(error: unknown): Envelope<T> {
  const code = error instanceof XrayError ? error.code : 'INTERNAL';
  const exitCode = error instanceof XrayError ? error.exitCode : 1;
  const message = error instanceof Error ? error.message : String(error);
  return { schemaVersion: '0.1', status: 'error', error: { code, message, exitCode } };
}
/** Review gate (PRD §8.5-5): blocking only when the user explicitly enabled an enforce policy. */
export type GateState = 'pass' | 'needs_human' | 'incomplete' | 'failed' | 'disabled';
export interface Gate { state: GateState; reasons: string[]; blocking: boolean }
/** Structured post-change review (PRD §8.5-4/7): stable identity, both snapshots, versions, idempotent by target snapshot. */
export interface ReviewVersions { engineVersion: string; ruleSetVersion: string; protocolVersion: string; adapterVersion: string; surface: 'agent-mcp' }
export interface ReviewDebtDelta { modelVersion: string; before: number; after: number; delta: number; bindingsBefore: number; bindingsAfter: number }
export interface ReviewOutput {
  changeSummary: string;
  pathImpacts: { added: string[]; modified: string[]; deleted: string[] };
  newFindingIds: string[]; continuingFindingIds: string[];
  removedFindingIds: string[]; removedFindingTitles: string[];
  evidenceRefs: string[];
  unknownCoverage: { path: string; code: string; message: string }[];
  suggestedChecks: { findingId: string; ruleId: string; symbol: string; nextCheck: string }[];
  conceptRefs: string[];
  debtDelta: ReviewDebtDelta;
  limitations: string[];
}
export interface ReviewRecord {
  schemaVersion: '0.1';
  reviewId: string;
  workspaceId: string;
  baseline: { snapshotId: string; gitHead: string | null; gitBase: string | null; ref: string | null };
  target: { snapshotId: string; gitHead: string | null; files: { path: string; digest: string }[]; createdAt: string };
  analysisId: string;
  reportStatus: AnalysisReport['status'];
  versions: ReviewVersions;
  gate: Gate;
  output: ReviewOutput;
}/** Pending review session persisted between review_start and review_finish; replaced by the final ReviewRecord under the same id. */
export interface ReviewSession {
  schemaVersion: '0.1';
  reviewId: string;
  workspace: string;
  base: string | null;
  /** Full baseline snapshot (manifest with digests); file contents are cached alongside the session, never in the final record. */
  baseline: Snapshot & { ref: string | null };
  createdAt: string;
}
const str = {type:'string'};
const strings = {type:'array',items:str};
const obj = (properties: Record<string, unknown>, required=Object.keys(properties)) => ({type:'object',properties,required,additionalProperties:false});
const arr = (items:unknown) => ({type:'array',items});
const position = obj({line:{type:'integer',minimum:1},column:{type:'integer',minimum:1}});
const finding = obj({id:str,ruleId:str,ruleVersion:str,title:str,severity:{enum:['high','medium','low']},epistemic:{enum:['fact','inference','recommendation','unknown']},evidenceIds:{...strings,minItems:1},conceptId:str,symbol:str,assumptions:strings,uncertainties:strings,nextCheck:str});
const diagnostic = obj({path:str,code:str,message:str});
const nullableString = {type:['string','null']};
export const reportSchema = {
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://code-xray.local/schemas/analysis-0.1.json',
  ...obj({
    schemaVersion:{const:'0.1'},analysisId:str,createdAt:str,status:{enum:['complete','partial','failed','cancelled']},
    snapshot:obj({id:str,workspaceId:str,files:arr(obj({path:str,digest:str})),gitHead:nullableString,gitBase:nullableString}),
    coverage:obj({discovered:{type:'integer',minimum:0},parsed:{type:'integer',minimum:0},skipped:{type:'integer',minimum:0},failed:{type:'integer',minimum:0},unknown:{type:'integer',minimum:0},reasons:arr(diagnostic)}),
    findings:arr(finding),evidence:arr(obj({id:str,path:str,digest:str,start:position,end:position,observation:str,producer:str})),
    flows:arr(obj({from:str,to:str,status:{enum:['observed','inferred','unresolved']},reason:str,evidenceIds:strings},['from','status','evidenceIds'])),summary:str,
    diff:{anyOf:[{type:'null'},obj({base:str,added:strings,modified:strings,deleted:strings,newFindingIds:strings,continuingFindingIds:strings,removedFindings:arr(finding),limitations:strings})]},
    provenance:obj({engineVersion:str,adapterVersion:str,ruleSetVersion:str,offline:{type:'boolean'},llm:{enum:['disabled','enhanced','unavailable']}}),limitations:strings,
  }),
};
const validate = new Ajv2020({allErrors:true,strict:true}).compile<AnalysisReport>(reportSchema);
export function assertReport(value: unknown): asserts value is AnalysisReport {
  if (!validate(value)) throw new XrayError('INVALID_REPORT','报告格式不符合协议：'+JSON.stringify(validate.errors),1);
  const r = value as AnalysisReport;
  const ids = new Set<string>();
  const files = new Map(r.snapshot.files.map(f=>[f.path,f.digest]));
  for(const e of r.evidence) {
    if(ids.has(e.id) || files.get(e.path)!==e.digest || e.path.startsWith('/') || e.path.split(/[\\/]/).includes('..') || e.end.line<e.start.line || (e.end.line===e.start.line && e.end.column<e.start.column)) throw new XrayError('INVALID_EVIDENCE','报告包含重复、越界或快照不匹配的证据。');
    ids.add(e.id);
  }
  const findingIds = new Set<string>();
  for(const f of r.findings) {
    if(findingIds.has(f.id) || f.evidenceIds.some(id=>!ids.has(id))) throw new XrayError('INVALID_EVIDENCE','发现引用不存在的证据或重复标识。');
    findingIds.add(f.id);
  }
  for(const e of r.flows) if(e.evidenceIds.some(id=>!ids.has(id))) throw new XrayError('INVALID_EVIDENCE','静态路径引用不存在的证据。');
}
export function normalizedReport(report:AnalysisReport):unknown {
  const {analysisId:_id,createdAt:_date,...rest}=report;
  return rest;
}
