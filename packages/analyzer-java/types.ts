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
}
