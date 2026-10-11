/** Private adapter result. CST/Java parser objects never cross this boundary. */
export interface JavaSourceFile { path: string; content: string; digest: string }
export interface JavaPosition { line: number; column: number; offset: number }
export interface JavaEvidence {
  id: string; path: string; digest: string; start: JavaPosition; end: JavaPosition;
  excerpt: string; kind: 'declaration' | 'annotation' | 'call' | 'loop' | 'return-type';
}
export interface JavaFact {
  id: string; kind: 'type' | 'method' | 'field' | 'annotation'; name: string;
  qualifiedName: string; evidenceIds: string[]; attributes: Record<string, string | string[]>;
}
export interface JavaFinding {
  id: string; ruleId: string; ruleVersion: string; conceptId: string;
  category: 'inference'; severity: 'medium'; title: string; summary: string;
  symbol: string; evidenceIds: string[];
  assumptions: string[]; uncertainties: string[]; verification: string;
}
export interface JavaFlow {
  id: string; from: string; to?: string; label: string;
  resolution: 'resolved' | 'unknown'; reason?: string; evidenceIds: string[];
}
export interface JavaDiagnostic {
  code: string; message: string; path: string; ruleId?: string; evidenceIds?: string[];
}
export interface JavaAnalysis {
  analyzerId: 'java-cst'; analyzerVersion: string; parserVersion: string;
  analyzedFiles: string[]; failedFiles: string[];
  facts: JavaFact[]; evidence: JavaEvidence[]; findings: JavaFinding[];
  flows: JavaFlow[]; diagnostics: JavaDiagnostic[];
  /** v0.6 M2: raw link-summary data ("讲懂" capability). Additive; the rule view above is unchanged. */
  links?: JavaLinkData;
}

// ---- v0.6 M2: link-summary raw data (Java-first "讲懂" capability) ----

/** A method parameter with its (validation/web) annotations. */
export interface JavaLinkParam { name: string; type: string; annotations: string[] }
/** A changed/entry point method (HTTP / @Scheduled / MQ listener). */
export interface JavaLinkEntry {
  method: string;
  kind: 'http' | 'scheduled' | 'mq';
  annotations: string[];
  params: JavaLinkParam[];
  returnType: string;
  path: string;
  line: number;
  /** Inclusive last line of the method (declaration through body). Used to intersect with diff hunks (v0.7 M2). */
  endLine: number;
}
/** Indexed method metadata for call resolution and ring assembly. */
export interface JavaLinkMethod {
  signature: string;
  name: string;
  owner: string;
  ownerKind: 'class' | 'interface';
  annotations: string[];
  returnType: string;
  params: JavaLinkParam[];
  hasTransactional: boolean;
  isExceptionHandler: boolean;
  path: string;
  line: number;
}
/** One call site with cross-file target resolution (unknown when not provable). */
export interface JavaLinkCall {
  from: string;
  label: string;
  methodName: string;
  to?: string;
  receiverType?: string;
  receiverIsInterface?: boolean;
  resolution: 'resolved' | 'unknown';
  reason?: string;
  self?: boolean;
  path: string;
  line: number;
}
/** A branch/exception/return statement within a method body. */
export interface JavaLinkBranch {
  method: string;
  kind: 'if' | 'switch' | 'throw' | 'try' | 'catch' | 'return';
  detail?: string;
  path: string;
  line: number;
}
/** A repository data touch, read/write distinguished (read = query/derive, write = save/delete/flush). */
export interface JavaLinkDataTouch {
  method: string;
  repositoryMethod: string;
  receiverType?: string;
  access: 'read' | 'write' | 'unknown';
  path: string;
  line: number;
  /** v0.7 M3 / R7: a collection/relation access on a JPA entity (potential lazy-load). */
  lazyCollection?: boolean;
}
/** An external side effect (MQ send / external HTTP / cache write). */
export interface JavaLinkSideEffect {
  method: string;
  kind: 'mq' | 'http' | 'cache';
  detail: string;
  path: string;
  line: number;
}
export interface JavaLinkData {
  entries: JavaLinkEntry[];
  methods: JavaLinkMethod[];
  calls: JavaLinkCall[];
  branches: JavaLinkBranch[];
  dataTouches: JavaLinkDataTouch[];
  sideEffects: JavaLinkSideEffect[];
}
