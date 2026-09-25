/**
 * Human-friendly review presentation (Review Insight Layer v0.2, plan §12/§15).
 *
 * ONE deterministic renderer shared by every Surface (MCP today; CLI/VSCode
 * can import it directly) so no adapter re-invents insight wording. This is
 * a pure function of the stored record — no clock, no randomness, no new
 * facts: presentation NEVER becomes a source of truth (§21-12). Everything
 * rendered here is drill-down-able through the record's structured fields.
 *
 * First-screen discipline (§15): NEW insights render in full; CONTINUING
 * insights collapse into one summary line unless a deterministic, fact-backed
 * escalation condition holds (severity high, or knowledge status stale —
 * occurrence increase is NOT inferred because a genuinely new occurrence
 * would already have flipped changeType to 'new'). Assumptions, uncertainties,
 * raw evidence and finding-id lists stay out of the first screen; they remain
 * available via the record fields, xray_explain and xray_evidence.
 */
import type { ReviewInsight, ReviewRecord, ReviewRecordV01, StoredReviewRecord } from '../protocol/index.js';

const CHANGE_LABELS: Record<ReviewInsight['changeType'], string> = {
  new: '本轮新增', continuing: '持续存在', resolved: '已解决',
};
const IMPORTANCE_LABELS: Record<ReviewInsight['importance'], string> = {
  critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW',
};
const KNOWLEDGE_LABELS: Record<ReviewInsight['knowledgeStatus'], string> = {
  'new-to-user': '新出现知识点', unassessed: '尚未评估', learning: '学习中', known: '已掌握', stale: '待复核',
};
const GATE_LABELS: Record<string, string> = {
  pass: '通过', needs_human: '需人工检查', incomplete: '不完整', failed: '失败', disabled: '已禁用',
};
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const RULE = '──────────────────────';

function marker(index: number): string {
  return CIRCLED[index] ?? `(${index + 1})`;
}

/** Deterministic escalation for continuing insights (plan §12): only facts already in the record. */
export function isEscalated(insight: ReviewInsight): boolean {
  return insight.severity === 'high' || insight.knowledgeStatus === 'stale';
}

function renderInsightFull(insight: ReviewInsight, index: number): string[] {
  const lines = [
    `${marker(index)} ${insight.title}`,
    `状态：${CHANGE_LABELS[insight.changeType]}　重要性：${IMPORTANCE_LABELS[insight.importance]}　知识状态：${KNOWLEDGE_LABELS[insight.knowledgeStatus]}`,
    `本轮发现：${insight.summary}`,
  ];
  if (insight.symbols.length > 0)
    lines.push(`涉及位置（${insight.symbols.length}）：${insight.symbols.slice(0, 5).join('、')}${insight.symbols.length > 5 ? ' 等' : ''}（主要位置见"建议确认"）`);
  lines.push(`为什么值得关注：${insight.whyItMatters}`);
  lines.push(`建议确认：${insight.nextAction}`);
  lines.push(`[可展开：findingIds ${insight.findingIds.length} 条 · evidenceIds ${insight.evidenceIds.length} 条（xray_explain / xray_evidence）]`);
  return lines;
}

function renderV02(record: ReviewRecord): string[] {
  const { overview, insights, resolvedInsights, coverageSummary, debtDelta } = record.output;
  const lines: string[] = ['Code X-Ray Review（schema 0.2）', ''];

  lines.push('本轮修改', RULE);
  lines.push(`${overview.filesChanged} 个文件发生变化`);
  lines.push(`新增 ${overview.newInsightCount} 个风险概念 · ${overview.continuingInsightCount} 个已有风险概念持续存在 · ${overview.resolvedInsightCount} 个历史风险概念已解决`);
  lines.push(`（具体代码位置：新增 ${overview.newFindingCount} · 持续 ${overview.continuingFindingCount} · 移除 ${overview.resolvedFindingCount}）`);
  lines.push(`关口：${GATE_LABELS[record.gate.state] ?? record.gate.state}${record.gate.blocking ? '（blocking：已显式启用 enforce）' : '（report-only）'}`);
  lines.push('');

  const newInsights = insights.filter(i => i.changeType === 'new');
  const continuing = insights.filter(i => i.changeType === 'continuing');
  if (newInsights.length > 0) {
    lines.push('需要关注', RULE);
    newInsights.forEach((insight, index) => { lines.push(...renderInsightFull(insight, index), ''); });
  }

  if (continuing.length > 0) {
    const escalated = continuing.filter(isEscalated);
    const quiet = continuing.length - escalated.length;
    lines.push('已有风险摘要', RULE);
    const quietFindings = continuing.filter(i => !isEscalated(i)).reduce((sum, i) => sum + i.occurrenceCount, 0);
    if (quiet > 0)
      lines.push(`• ${quietFindings} 个已有风险仍然存在，涉及 ${quiet} 个知识概念（无升级条件，详情可经 output.insights 钻取）。`);
    for (const insight of escalated)
      lines.push(`• [升级展示] ${insight.title}：${insight.occurrenceCount} 个位置持续存在（升级原因：${insight.severity === 'high' ? 'severity high' : ''}${insight.severity === 'high' && insight.knowledgeStatus === 'stale' ? ' + ' : ''}${insight.knowledgeStatus === 'stale' ? '知识状态待复核' : ''}）`);
    lines.push('');
  }

  if (resolvedInsights.length > 0) {
    lines.push('已解决', RULE);
    lines.push(`✓ ${resolvedInsights.length} 个历史风险概念不再出现（${resolvedInsights.reduce((sum, i) => sum + i.resolvedOccurrenceCount, 0)} 个基线位置；证据属于基线快照）。`);
    for (const insight of resolvedInsights) lines.push(`  - ${insight.title}`);
    lines.push('');
  }

  lines.push('其他信息', RULE);
  if (coverageSummary.status !== 'complete') lines.push(`• 分析状态：${coverageSummary.status}——结论范围受限。`);
  if (coverageSummary.unknownCount > 0) lines.push(`• ${coverageSummary.unknownCount} 个区域存在静态分析 unknown（未知不等于无风险，见 coverageSummary）。`);
  if (record.output.limitations.length > 0) lines.push(`• ${record.output.limitations.length} 条分析限制（见 output.limitations）。`);
  lines.push('');

  lines.push('Cognitive Debt', RULE);
  const delta = debtDelta.delta;
  lines.push(`${debtDelta.before.toFixed(1)} → ${debtDelta.after.toFixed(1)}（${delta >= 0 ? '+' : ''}${delta.toFixed(1)}；${debtDelta.modelVersion}，概念 ${debtDelta.conceptsBefore ?? '—'}→${debtDelta.conceptsAfter ?? '—'}，绑定 ${debtDelta.bindingsBefore}→${debtDelta.bindingsAfter}）`);
  return lines;
}

function renderV01(record: ReviewRecordV01): string[] {
  // Versioned read (plan §18): a legacy record renders from its own fields,
  // clearly marked; insights are never fabricated retroactively.
  const output = record.output;
  return [
    'Code X-Ray Review（schema 0.1 · 旧版记录，未含 Insight 聚合；重新运行 review 可获得 0.2 结构）',
    '',
    '本轮修改', RULE,
    output.changeSummary,
    `关口：${GATE_LABELS[record.gate.state] ?? record.gate.state}${record.gate.blocking ? '（blocking）' : '（report-only）'}`,
    '',
    '风险明细（v0.1 按 Finding 平铺）', RULE,
    ...output.suggestedChecks.map((check, index) => `${marker(index)} [${check.ruleId}] ${check.symbol}：${check.nextCheck}`),
    '',
    'Cognitive Debt', RULE,
    `${output.debtDelta.before.toFixed(1)} → ${output.debtDelta.after.toFixed(1)}（${output.debtDelta.delta >= 0 ? '+' : ''}${output.debtDelta.delta.toFixed(1)}；${output.debtDelta.modelVersion}）`,
  ];
}

/** Render any stored review record (v0.1 or v0.2) to deterministic first-screen text. */
export function renderReviewPresentation(record: StoredReviewRecord): string {
  const lines = record.schemaVersion === '0.2' ? renderV02(record) : renderV01(record);
  for (const reason of record.gate.reasons) lines.push(`关口原因：${reason}`);
  return lines.join('\n');
}
