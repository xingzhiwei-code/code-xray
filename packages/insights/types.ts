/**
 * Review Insight Layer domain types (v0.2 plan §4/§5). The wire shapes
 * (ReviewInsight and friends) live in the protocol package; this module owns
 * the aggregation service's input/output contracts only.
 */
import type { AnalysisReport, InsightChangeType, InsightImportance, InsightKnowledgeStatus, ReviewInsight, Severity } from '../protocol/index.js';
import type { LearningState } from '../learning/engine.js';

export type { InsightChangeType, InsightImportance, InsightKnowledgeStatus, ReviewInsight };

export interface ReviewInsightsInput {
  /** Content-addressed review identity (workspace + target snapshot + rule set version). */
  reviewId: string;
  ruleSetVersion: string;
  /** Target-snapshot report; must carry the diff against the review baseline. */
  report: AnalysisReport;
  /** Learning state BEFORE this round's syncBindings — used for honest new-to-user detection. */
  learningStateBefore: LearningState;
  /** Learning state AFTER syncing to the target report — source of concept knowledge status. */
  learningStateAfter: LearningState;
}

export interface ReviewInsightsResult {
  /** new + continuing insights, deterministically sorted (plan §6.1). */
  insights: ReviewInsight[];
  /** Concepts whose related findings disappeared in the target snapshot (baseline-scoped evidence). */
  resolvedInsights: ReviewInsight[];
  newInsightCount: number;
  continuingInsightCount: number;
  resolvedInsightCount: number;
}

export const emptyInsightsResult: ReviewInsightsResult = {
  insights: [], resolvedInsights: [],
  newInsightCount: 0, continuingInsightCount: 0, resolvedInsightCount: 0,
};

export { type AnalysisReport, type LearningState, type Severity };
