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
/**
 * Concept-level review insight (Review Insight Layer v0.2, plan §4). One
 * insight per concept per review — N findings of the same concept never
 * produce N top-level items. Every insight drills down to findingIds /
 * evidenceIds, so aggregation adds structure without dropping facts.
 */
export type InsightChangeType = 'new' | 'continuing' | 'resolved';
export type InsightImportance = 'critical' | 'high' | 'medium' | 'low';
/** Concept knowledge relative to the user: mapped from concept-level learning state (plan §8). */
export type InsightKnowledgeStatus = 'new-to-user' | 'unassessed' | 'learning' | 'known' | 'stale';
export interface ReviewInsight {
  /** Deterministic: derived from reviewId + conceptId + changeType (plan §4.1); never random. */
  id: string;
  conceptId: string;
  title: string;
  changeType: InsightChangeType;
  importance: InsightImportance;
  knowledgeStatus: InsightKnowledgeStatus;
  /** Deterministic text from concept metadata + finding/diff facts; no runtime claims the analyzer did not prove. */
  summary: string;
  whyItMatters: string;
  nextAction: string;
  severity: Severity;
  occurrenceCount: number;
  newOccurrenceCount: number;
  continuingOccurrenceCount: number;
  resolvedOccurrenceCount: number;
  findingIds: string[];
  evidenceIds: string[];
  symbols: string[];
  primaryFindingId?: string;
  primaryEvidenceId?: string;
  /**
   * Which snapshot the findingIds/evidenceIds belong to (plan §6): active
   * insights cite the TARGET report; resolved insights cite the BASELINE
   * (their findings no longer exist in the target snapshot).
   */
  evidenceScope: 'target' | 'baseline';
}
/** Structured post-change review (PRD §8.5-4/7): stable identity, both snapshots, versions, idempotent by target snapshot. */
export interface ReviewVersions { engineVersion: string; ruleSetVersion: string; protocolVersion: string; adapterVersion: string; surface: 'agent-mcp' }
export interface ReviewDebtDelta {
  modelVersion: string; before: number; after: number; delta: number;
  bindingsBefore: number; bindingsAfter: number;
  /** v0.2 (debt-model-v2): concept-level counts; absent on v0.1 records. */
  conceptsBefore?: number; conceptsAfter?: number;
}
/**
 * Review output schema 0.1 (legacy). Stored v0.1 records keep this exact
 * shape forever — they are re-read versioned, never silently reshaped or
 * back-filled with insights that were never computed at review time.
 */
export interface ReviewOutputV01 {
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
/** Concept-level headline numbers (plan §11): what this round actually brought. */
export interface ReviewOverview {
  filesChanged: number;
  newInsightCount: number;
  continuingInsightCount: number;
  resolvedInsightCount: number;
  newFindingCount: number;
  continuingFindingCount: number;
  resolvedFindingCount: number;
}
export interface ReviewCoverageSummary {
  status: AnalysisReport['status'];
  unknownCount: number;
  reasons: Diagnostic[];
}
/**
 * Review output schema 0.2 (Review Insight Layer). New consumers read
 * overview + insights first; the legacy v0.1 fields remain during the
 * migration period as deprecated finding-level drill-down detail, EXCEPT
 * suggestedChecks, whose v0.2 semantics are insight-level: one primary
 * action per insight (plan §13), each linked via insightId.
 */
export interface ReviewOutput {
  overview: ReviewOverview;
  insights: ReviewInsight[];
  resolvedInsights: ReviewInsight[];
  coverageSummary: ReviewCoverageSummary;
  /** @deprecated migration detail — prefer overview/changeSummary only as a headline. */
  changeSummary: string;
  pathImpacts: { added: string[]; modified: string[]; deleted: string[] };
  /** @deprecated drill-down detail — prefer insights[].findingIds. */
  newFindingIds: string[]; continuingFindingIds: string[];
  removedFindingIds: string[]; removedFindingTitles: string[];
  /** @deprecated drill-down detail — prefer insights[].evidenceIds. */
  evidenceRefs: string[];
  /** @deprecated drill-down detail — prefer coverageSummary. */
  unknownCoverage: { path: string; code: string; message: string }[];
  /** v0.2: ONE primary check per insight (insightId links it), not one per finding. */
  suggestedChecks: { insightId: string; findingId: string; ruleId: string; symbol: string; nextCheck: string }[];
  /** @deprecated drill-down detail — prefer insights[].conceptId. */
  conceptRefs: string[];
  debtDelta: ReviewDebtDelta;
  limitations: string[];
}
export const REVIEW_SCHEMA_VERSION = '0.2';
interface ReviewRecordBase {
  reviewId: string;
  workspaceId: string;
  baseline: { snapshotId: string; gitHead: string | null; gitBase: string | null; ref: string | null };
  target: { snapshotId: string; gitHead: string | null; files: { path: string; digest: string }[]; createdAt: string };
  analysisId: string;
  reportStatus: AnalysisReport['status'];
  versions: ReviewVersions;
  gate: Gate;
}
export interface ReviewRecord extends ReviewRecordBase {
  schemaVersion: '0.2';
  output: ReviewOutput;
}
/** Legacy stored record (schema 0.1). Readable forever; never rewritten in place. */
export interface ReviewRecordV01 extends ReviewRecordBase {
  schemaVersion: '0.1';
  output: ReviewOutputV01;
}
/** Any persisted review record; readers branch on schemaVersion (versioned read, no silent migration). */
export type StoredReviewRecord = ReviewRecord | ReviewRecordV01;/** Pending review session persisted between review_start and review_finish; replaced by the final ReviewRecord under the same id. */
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
// ---- Review record schema 0.2 (Review Insight Layer): validation covers the new structure (plan §18) ----
const count = {type:'integer',minimum:0};
const insight = obj({
  id:str, conceptId:str, title:str,
  changeType:{enum:['new','continuing','resolved']},
  importance:{enum:['critical','high','medium','low']},
  knowledgeStatus:{enum:['new-to-user','unassessed','learning','known','stale']},
  summary:str, whyItMatters:str, nextAction:str,
  severity:{enum:['high','medium','low']},
  occurrenceCount:count, newOccurrenceCount:count, continuingOccurrenceCount:count, resolvedOccurrenceCount:count,
  findingIds:strings, evidenceIds:strings, symbols:strings,
  primaryFindingId:str, primaryEvidenceId:str,
  evidenceScope:{enum:['target','baseline']},
}, ['id','conceptId','title','changeType','importance','knowledgeStatus','summary','whyItMatters','nextAction','severity','occurrenceCount','newOccurrenceCount','continuingOccurrenceCount','resolvedOccurrenceCount','findingIds','evidenceIds','symbols','evidenceScope']);
export const reviewRecordSchema = {
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://code-xray.local/schemas/review-0.2.json',
  ...obj({
    schemaVersion:{const:'0.2'},
    reviewId:str, workspaceId:str,
    baseline:obj({snapshotId:str,gitHead:nullableString,gitBase:nullableString,ref:nullableString}),
    target:obj({snapshotId:str,gitHead:nullableString,files:arr(obj({path:str,digest:str})),createdAt:str}),
    analysisId:str,
    reportStatus:{enum:['complete','partial','failed','cancelled']},
    versions:obj({engineVersion:str,ruleSetVersion:str,protocolVersion:str,adapterVersion:str,surface:{const:'agent-mcp'}}),
    gate:obj({state:{enum:['pass','needs_human','incomplete','failed','disabled']},reasons:strings,blocking:{type:'boolean'}}),
    output:obj({
      overview:obj({filesChanged:count,newInsightCount:count,continuingInsightCount:count,resolvedInsightCount:count,newFindingCount:count,continuingFindingCount:count,resolvedFindingCount:count}),
      insights:arr(insight), resolvedInsights:arr(insight),
      coverageSummary:obj({status:{enum:['complete','partial','failed','cancelled']},unknownCount:count,reasons:arr(diagnostic)}),
      changeSummary:str,
      pathImpacts:obj({added:strings,modified:strings,deleted:strings}),
      newFindingIds:strings, continuingFindingIds:strings, removedFindingIds:strings, removedFindingTitles:strings,
      evidenceRefs:strings,
      unknownCoverage:arr(obj({path:str,code:str,message:str})),
      suggestedChecks:arr(obj({insightId:str,findingId:str,ruleId:str,symbol:str,nextCheck:str})),
      conceptRefs:strings,
      debtDelta:obj({modelVersion:str,before:{type:'number'},after:{type:'number'},delta:{type:'number'},bindingsBefore:count,bindingsAfter:count,conceptsBefore:count,conceptsAfter:count},
        ['modelVersion','before','after','delta','bindingsBefore','bindingsAfter']),
      limitations:strings,
    }),
  }),
};
const validateReview = new Ajv2020({allErrors:true,strict:true}).compile<ReviewRecord>(reviewRecordSchema);
/**
 * Validate a freshly built v0.2 review record: wire shape PLUS the semantic
 * invariants the insight layer promises (drill-down integrity, honest evidence
 * scope, overview consistent with the lists). Stored v0.1 records are NOT
 * re-validated here — they are read versioned, never rewritten.
 */
export function assertReviewRecord(value: unknown): asserts value is ReviewRecord {
  if (!validateReview(value)) throw new XrayError('INVALID_REVIEW','审查记录格式不符合协议 0.2：'+JSON.stringify(validateReview.errors),1);
  const r = value as ReviewRecord;
  const changedIds = new Set([...r.output.newFindingIds, ...r.output.continuingFindingIds]);
  const removedIds = new Set(r.output.removedFindingIds);
  const check = (insight: ReviewInsight) => {
    if (insight.findingIds.length === 0) throw new XrayError('INVALID_REVIEW','Insight 缺少可钻取的 findingIds。');
    if (insight.occurrenceCount !== insight.newOccurrenceCount + insight.continuingOccurrenceCount)
      throw new XrayError('INVALID_REVIEW',`Insight ${insight.id} 的 occurrenceCount 与 new/continuing 计数不一致。`);
    if (insight.primaryFindingId && !insight.findingIds.includes(insight.primaryFindingId))
      throw new XrayError('INVALID_REVIEW',`Insight ${insight.id} 的 primaryFindingId 不在其 findingIds 中。`);
  };
  for (const insight of r.output.insights) {
    check(insight);
    if (insight.changeType === 'resolved' || insight.evidenceScope !== 'target')
      throw new XrayError('INVALID_REVIEW','活跃 Insight 必须引用目标快照证据（evidenceScope=target）。');
    if (insight.findingIds.some(id => !changedIds.has(id)))
      throw new XrayError('INVALID_REVIEW','活跃 Insight 引用了 diff 之外的发现。');
    if ((insight.changeType === 'new') !== (insight.newOccurrenceCount > 0))
      throw new XrayError('INVALID_REVIEW','changeType=new 当且仅当存在新增 occurrence。');
  }
  for (const insight of r.output.resolvedInsights) {
    check(insight);
    if (insight.changeType !== 'resolved' || insight.evidenceScope !== 'baseline')
      throw new XrayError('INVALID_REVIEW','resolved Insight 的证据必须显式属于基线快照。');
    if (insight.findingIds.some(id => !removedIds.has(id)))
      throw new XrayError('INVALID_REVIEW','resolved Insight 引用了未移除的发现。');
  }
  const overview = r.output.overview;
  if (overview.newInsightCount !== r.output.insights.filter(i => i.changeType === 'new').length
    || overview.continuingInsightCount !== r.output.insights.filter(i => i.changeType === 'continuing').length
    || overview.resolvedInsightCount !== r.output.resolvedInsights.length
    || overview.newFindingCount !== r.output.newFindingIds.length
    || overview.continuingFindingCount !== r.output.continuingFindingIds.length
    || overview.resolvedFindingCount !== r.output.removedFindingIds.length)
    throw new XrayError('INVALID_REVIEW','overview 计数与 insight/finding 列表不一致。');
  for (const check of r.output.suggestedChecks)
    if (!r.output.insights.some(i => i.id === check.insightId))
      throw new XrayError('INVALID_REVIEW','suggestedChecks 必须逐条挂在一个活跃 Insight 上。');
}
export function normalizedReport(report:AnalysisReport):unknown {
  const {analysisId:_id,createdAt:_date,...rest}=report;
  return rest;
}
