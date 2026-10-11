/**
 * Analyzer abstraction (v0.6 M1, ADR-004).
 *
 * The engine facade depends on this interface, never on a concrete language
 * analyzer. `packages/analyzer-java` is one implementation; a future
 * tree-sitter-based analyzer implements the same contract (the CST stays
 * inside the analyzer — only the structured result crosses this boundary).
 *
 * This iteration introduces the seam only: no tree-sitter, no parser change,
 * zero behavioral change (verified by evals + `npm run verify`).
 */
import { javaAnalyzer } from '../analyzer-java/index.js';
import type { JavaAnalysis, JavaSourceFile } from '../analyzer-java/types.js';

/** A single source file handed to an analyzer; digest is the caller's content hash. */
export interface AnalyzerFile {
  path: string;
  content: string;
  digest: string;
}

/**
 * The analyzer contract. `TAnalysis` is the structured result vocabulary; the
 * concrete analyzer owns its CST representation and never leaks parser objects
 * (java-parser CstNode never crosses this boundary — ARCHITECTURE §1).
 */
export interface Analyzer<TAnalysis = JavaAnalysis> {
  /** Language id the analyzer targets (e.g. 'java'). */
  readonly language: string;
  /** Stable analyzer identity, reported in capabilities. */
  readonly analyzerId: string;
  readonly analyzerVersion: string;
  readonly parserVersion: string;
  /** Rule ids this analyzer implements (the "risk view", unchanged in v0.6). */
  readonly rules: readonly string[];
  /** Parse + query a set of files into a structured analysis. */
  analyze(files: AnalyzerFile[], onProgress?: (parsed: number, total: number) => void): Promise<TAnalysis>;
}

/** Java analyzer implementation, wired into the registry below. */
export { javaAnalyzer };

/** Re-export the Java result vocabulary so engine/links consumers stay behind this boundary. */
export type {
  JavaAnalysis, JavaDiagnostic, JavaEvidence, JavaFact, JavaFinding, JavaFlow, JavaSourceFile,
} from '../analyzer-java/types.js';

/** Rule/version constants re-exported for capability reporting and the CLI surface. */
export { JAVA_ANALYZER_VERSION, JAVA_RULES } from '../analyzer-java/index.js';

const REGISTRY: ReadonlyMap<string, Analyzer> = new Map([['java', javaAnalyzer]]);

/**
 * Resolve an analyzer by language id. Returns undefined for unknown languages —
 * callers must degrade honestly rather than guess (multi-language is future work).
 */
export function analyzerFor(language: string): Analyzer | undefined {
  return REGISTRY.get(language);
}

/** Registered language ids (deterministic order). */
export function analyzerLanguages(): string[] {
  return [...REGISTRY.keys()];
}
