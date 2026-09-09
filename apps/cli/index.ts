import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dispatch } from './cliff-adapter.js';
import { analyze, ENGINE_VERSION, JAVA_RULES } from '../../packages/engine/index.js';
import { SCHEMA_VERSION, XrayError, type AnalysisReport, type AnalyzeRequest } from '../../packages/protocol/index.js';
import { LocalStore } from '../../packages/storage-local/index.js';
import {
  applyEvent, debtSummary, emptyLearningState, learningCard, LEARNING_CONTENT_VERSION, STATUS_LABELS, syncBindings,
  learningStatusFor,
  type LearningBinding, type LearningState,
} from '../../packages/learning/engine.js';
import {
  emptyDeveloperProfile, knowledgeGaps, setRoles, upsertSkill, DEVELOPER_PROFILE_VERSION,
  type DeveloperProfile, type ProfileDimension, type ProfileEvidenceKind, type ProfileSkillLevel,
} from '../../packages/developer-profile/engine.js';
import { enhanceFinding, enhanceInputFrom, OUTBOUND_SCOPE, providerFromEnv } from '../../packages/explanation-providers/index.js';

const exec = promisify(execFile);

interface ScanOptions {
  path: string; format: 'human' | 'json'; gitTrackedOnly: boolean;
  noSave: boolean; exclude: string[]; maxFiles?: number; maxFileBytes?: number; base?: string;
}

function usage(): string {
  return ['用法：xray scan [路径] [--format human|json] [--git-tracked-only] [--no-save]',
    '           [--exclude <glob> ...] [--max-files <n>] [--max-file-bytes <n>] [--base <git-ref>]',
    '       xray explain [编号] [--enhance]   单条发现完整上下文（--enhance 需显式配置 LLM provider）',
    '       xray learn [编号] [status|answer|ignore|restore|rebind|delete] …',
    '       xray debt                        透明认知债务模型',
    '       xray profile [init|show|update]  本机开发者画像（角色/语言/框架/工程能力）',
    '       xray doctor',
    '无参数运行 xray 等价于 xray scan .；默认扫描工作区磁盘现状（含未跟踪文件）。',
    '--base 对照显式 Git 基线（commit/branch/HEAD~1 等）输出变更摘要；需要 Git 仓库。',
    '报告按扫描路径保存；explain/learn/debt 读取当前目录的最近报告（在项目目录内运行）。'].join('\n');
}

const PROFILE_LEVELS: ProfileSkillLevel[] = ['novice', 'beginner', 'intermediate', 'advanced', 'expert'];
const PROFILE_CONFIDENCE = ['low', 'medium', 'high'] as const;
const PROFILE_EVIDENCE_KINDS: ProfileEvidenceKind[] = ['self-assessment', 'onboarding-answer', 'verified-learning', 'cli-update', 'project-scan'];

function parseScanArgs(args: string[]): ScanOptions {
  const options: ScanOptions = { path: '.', format: 'human', gitTrackedOnly: false, noSave: false, exclude: [] };
  const positional: string[] = [];
  let literal = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (literal || arg === '--') { positional.push(arg === '--' ? '' : arg); continue; }
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      if (flag === 'git-tracked-only') options.gitTrackedOnly = true;
      else if (flag === 'no-save') options.noSave = true;
      else if (flag === 'format') {
        const value = args[++i];
        if (value !== 'human' && value !== 'json') throw new XrayError('INVALID_ARGUMENT', `--format 只支持 human 或 json，收到：${value ?? '(缺失)'}`, 2);
        options.format = value;
      } else if (flag === 'exclude' || flag === 'max-files' || flag === 'max-file-bytes' || flag === 'base') {
        const value = args[++i];
        if (value === undefined) throw new XrayError('INVALID_ARGUMENT', `--${flag} 需要一个值。`, 2);
        if (flag === 'exclude') options.exclude.push(value);
        else if (flag === 'base') {
          if (value.startsWith('-') || value.includes('\0')) throw new XrayError('INVALID_BASE', '请指定有效的 Git 基线。', 2);
          options.base = value;
        } else {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed < 1) throw new XrayError('INVALID_ARGUMENT', `--${flag} 需要正整数，收到：${value}`, 2);
          if (flag === 'max-files') options.maxFiles = parsed;
          else options.maxFileBytes = parsed;
        }
      } else throw new XrayError('INVALID_ARGUMENT', `未知参数：--${flag}\n${usage()}`, 2);
    } else positional.push(arg);
  }
  const paths = positional.filter(p => p !== '');
  if (paths.length > 1) throw new XrayError('INVALID_ARGUMENT', `只能指定一个扫描路径，收到：${paths.join(' ')}`, 2);
  if (paths.length === 1) options.path = paths[0];
  return options;
}

/** East-Asian display width: CJK ranges occupy two terminal cells. */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) ? 2 : 1;
  }
  return width;
}

function wrapLine(text: string, width: number, indent = '  '): string[] {
  if (displayWidth(text) <= width) return [text];
  // Break at spaces so paths and identifiers stay whole; keep the line's own
  // leading indent, continue wrapped lines under it, hard-break only tokens
  // wider than the terminal.
  const leading = /^[ \t]*/.exec(text)![0];
  const continuation = leading + indent;
  const lines: string[] = [];
  let current = leading;
  for (const token of text.slice(leading.length).split(' ').filter(part => part.length > 0)) {
    const gap = current.trim() ? 1 : 0;
    if (displayWidth(current) + gap + displayWidth(token) <= width) {
      current += (gap ? ' ' : '') + token;
      continue;
    }
    if (displayWidth(token) <= width - displayWidth(continuation)) {
      lines.push(current);
      current = continuation + token;
      continue;
    }
    if (current.trim()) { lines.push(current); current = continuation; }
    for (const char of token) {
      if (displayWidth(current) + displayWidth(char) > width && current.trim()) { lines.push(current); current = continuation; }
      current += char;
    }
  }
  if (current.trim() || lines.length === 0) lines.push(current);
  return lines;
}

function terminalWidth(): number {
  const fromEnv = Number(process.env.COLUMNS ?? '');
  if (Number.isInteger(fromEnv) && fromEnv >= 40 && fromEnv <= 500) return fromEnv;
  return process.stdout.columns ?? 80;
}

function humanSummary(report: AnalysisReport, gaps?: ReturnType<typeof knowledgeGaps>): string {
  const width = terminalWidth();
  const lines: string[] = [];
  lines.push(`Code X-Ray ${ENGINE_VERSION} · 协议 ${SCHEMA_VERSION}`);
  lines.push(report.summary);
  if (report.coverage.discovered === 0 && report.coverage.parsed === 0)
    lines.push('未发现 Java 源文件：确认目录正确，或用 --exclude 调整过滤规则；非 .java 文件不在 v0.1 分析范围。');
  if (report.status === 'partial') lines.push(`状态：partial —— ${report.limitations.join(' ') || '部分内容未覆盖。'}`);
  if (report.diff) {
    const diff = report.diff;
    lines.push(`对照基线 ${diff.base.slice(0, 12)}：新增 ${diff.added.length}、修改 ${diff.modified.length}、删除 ${diff.deleted.length} 个文件；` +
      `新增 ${diff.newFindingIds.length}、持续 ${diff.continuingFindingIds.length}、移除 ${diff.removedFindings.length} 项发现。`);
    for (const note of diff.limitations) lines.push(`  注意：${note}`);
    if (diff.added.length) lines.push(`  新增文件：${diff.added.join('、')}`);
    if (diff.modified.length) lines.push(`  修改文件：${diff.modified.join('、')}`);
    if (diff.deleted.length) lines.push(`  删除文件：${diff.deleted.join('、')}`);
  }
  if (report.findings.length) {
    lines.push('');
    lines.push(`前 ${Math.min(3, report.findings.length)} 项发现（完整列表用 --format json，逐项详情用 xray explain）：`);
    for (const [index, finding] of report.findings.slice(0, 3).entries()) {
      const evidence = report.evidence.find(e => e.id === finding.evidenceIds[0]);
      const where = evidence ? `${evidence.path}:${evidence.start.line}` : finding.symbol;
      lines.push(`  ${index + 1}. ${finding.title} [${finding.ruleId}] ${where}`);
      lines.push(`     下一步：${finding.nextCheck}`);
    }
    const concepts = [...new Set(report.findings.map(f => f.conceptId))];
    const profileNote = gaps
      ? gaps.profileConfigured
        ? `开发者画像：已启用（${gaps.items.filter(item => item.reason === 'profile-signal' || item.reason === 'learning-state-used').length}/${gaps.items.length} 个概念有画像信号）`
        : `开发者画像：未评估——先运行 xray profile init，再结合个人画像查看缺口。`
      : '';
    lines.push(...[`知识缺口：${concepts.slice(0, 3).join('、')}${concepts.length > 3 ? ' 等' : ''}（${concepts.length} 个概念）——用 xray learn 逐个掌握，xray debt 查看认知债务。`]);
    if (profileNote) lines.push(profileNote);
  } else if (report.coverage.parsed > 0) {
    lines.push('未发现可报告的模式。零发现不等于没有问题；未知与限制见 --format json。');
  }
  // Every rendered line respects the terminal width; break at spaces so
  // paths and identifiers survive, hard-break only oversized tokens.
  return lines.flatMap(line => wrapLine(line, width)).join('\n');
}

async function runScan(args: string[], signal?: AbortSignal): Promise<void> {
  const options = parseScanArgs(args);
  const request: AnalyzeRequest = {
    path: options.path, includeUntracked: options.gitTrackedOnly ? false : undefined,
    exclude: options.exclude.length ? options.exclude : undefined,
    maxFiles: options.maxFiles, maxFileBytes: options.maxFileBytes, signal, base: options.base,
  };
  const report = await analyze(request, (parsed, total) => {
    // Long scans report progress on stderr (AC12); stdout stays pure for JSON.
    if (total >= 100 && parsed % 100 === 0) process.stderr.write(`已解析 ${parsed}/${total} 个文件…（Ctrl-C 取消）\n`);
  });
  let saved = '';
  if (!options.noSave) {
    const store = new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
    await store.saveReport(options.path, report.analysisId, report);
    // Learning bindings follow the saved report; reading never changes status.
    await store.updateState(options.path, emptyLearningState(), state => syncBindings(state, report).state);
    const [profile, learningState] = await Promise.all([
      store.readProfile(emptyDeveloperProfile()),
      store.readState(options.path, emptyLearningState()),
    ]);
    const gaps = knowledgeGaps(report, Object.keys(profile.skills).length ? profile : undefined, learningState);
    if (process.env.XRAY_PROFILE_DIAGNOSTICS === '1')
      process.stderr.write(`知识缺口（Developer Profile）：${gaps.items.map(item => `${item.conceptId}=${item.reasonLabel}`).join('、')}\n`);
    saved = `报告已保存到本地（analysisId ${report.analysisId.slice(0, 8)}…）；--no-save 可跳过。`;
    if (options.format === 'human') process.stdout.write(humanSummary(report, gaps) + `\n${saved}\n`);
  }
  if (options.format === 'json') {
    process.stdout.write(JSON.stringify(report) + '\n');
  }
  else if (options.noSave) process.stdout.write(humanSummary(report) + '\n');
}

async function runDoctor(): Promise<void> {
  const lines: string[] = [];
  lines.push(`Code X-Ray doctor`);
  lines.push(`  运行时：Node ${process.version} · ${process.platform}/${process.arch}`);
  let git = '不可用（diff 功能将受限，scan 不受影响）';
  try { git = (await exec('git', ['--version'])).stdout.trim(); } catch { /* keep default */ }
  lines.push(`  Git：${git}`);
  lines.push(`  CLI 框架：cliff vendored 0.0.1（vendor/cliffx-core，含嵌入补丁）`);
  lines.push(`  协议 schema：${SCHEMA_VERSION} · Engine：${ENGINE_VERSION}`);
  lines.push(`  规则（${JAVA_RULES.length}）：${JAVA_RULES.join('、')}`);
  try {
    const store = new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
    const latest = await store.loadReport<AnalysisReport>(process.cwd());
    lines.push(`  本地数据目录：${store.dataDir}（可写）`);
    lines.push(latest ? `  当前目录最近报告：${latest.analysisId} · ${latest.findings.length} 项发现 · ${latest.summary}` : '  当前目录最近报告：无（尚未扫描）');
  } catch (error) {
    lines.push(`  本地数据目录：不可用（${error instanceof Error ? error.message : String(error)}）`);
  }
  lines.push('  网络：默认零外发；LLM 增强仅在显式配置（XRAY_PROVIDER_URL/KEY/MODEL）时启用。');
  const provider = providerFromEnv();
  lines.push(provider ? `  LLM provider：${provider.id}（已配置；远端 provider 未做真实 smoke，标注为 ${provider.status}）` : '  LLM provider：未配置（保持禁用）。');
  process.stdout.write(lines.join('\n') + '\n');
}

async function runExplain(args: string[]): Promise<void> {
  const store = new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
  const report = await store.loadReport<AnalysisReport>('.');
  if (!report) {
    process.stdout.write('当前目录没有已保存的报告；先运行 xray scan <路径>。\n');
    return;
  }
  const width = terminalWidth();
  const positional = args.filter(arg => !arg.startsWith('--'));
  const wantsEnhancement = args.includes('--enhance');
  const selector = positional[0];
  if (!selector) {
    process.stdout.write(`最近报告（${report.analysisId}，${report.coverage.parsed} 个文件）共 ${report.findings.length} 项发现：\n`);
    report.findings.forEach((finding, index) => {
      const evidence = report.evidence.find(e => e.id === finding.evidenceIds[0]);
      const where = evidence ? `${evidence.path}:${evidence.start.line}` : finding.symbol;
      process.stdout.write(wrapLine(`  ${index + 1}. [${finding.ruleId}] ${finding.title} — ${where}`, width).join('\n') + '\n');
    });
    process.stdout.write('用 xray explain <编号> 查看单条发现的完整上下文。\n');
    return;
  }
  const index = Number(selector);
  if (!Number.isInteger(index) || index < 1 || index > report.findings.length) {
    throw new XrayError('INVALID_ARGUMENT', `编号需为 1—${report.findings.length}；收到：${selector}`, 2);
  }
  const finding = report.findings[index - 1];
  const lines: string[] = [];
  lines.push(`${finding.title} [${finding.ruleId} v${finding.ruleVersion}]`);
  lines.push(`位置（符号）：${finding.symbol}`);
  lines.push('');
  lines.push('证据（可回源到快照）：');
  for (const id of finding.evidenceIds) {
    const evidence = report.evidence.find(e => e.id === id);
    if (evidence) lines.push(...wrapLine(`  - ${evidence.path}:${evidence.start.line}-${evidence.end.line}（${evidence.observation}）`, width));
  }
  lines.push('');
  lines.push('成立前提：');
  for (const assumption of finding.assumptions) lines.push(...wrapLine(`  - ${assumption}`, width));
  lines.push('未知/未解析：');
  for (const uncertainty of finding.uncertainties) lines.push(...wrapLine(`  - ${uncertainty}`, width));
  lines.push('');
  lines.push(...wrapLine(`下一步检查：${finding.nextCheck}`, width));
  lines.push(...wrapLine(`知识缺口标记：${finding.conceptId}`, width));
  process.stdout.write(lines.join('\n') + '\n');
  if (wantsEnhancement) {
    // Explicit opt-in only; any failure keeps the deterministic output untouched.
    const provider = providerFromEnv();
    if (!provider) {
      process.stderr.write('LLM 增强未启用：需要同时设置 XRAY_PROVIDER_URL、XRAY_PROVIDER_KEY、XRAY_PROVIDER_MODEL（显式开启）。当前输出仅为确定性解释。\n');
      return;
    }
    process.stderr.write(`将发送最小上下文到 ${provider.id}：${OUTBOUND_SCOPE}\n`);
    const card = learningCardFor(report, finding);
    const outcome = await enhanceFinding(provider, enhanceInputFrom({
      conceptId: finding.conceptId, cardTitle: card.title,
      what: card.what, whyHere: card.whyHere, hiddenMechanisms: card.hiddenMechanisms, whatIfRemoved: card.whatIfRemoved,
      findingTitle: finding.title, assumptions: finding.assumptions, uncertainties: finding.uncertainties,
    }));
    if (!outcome.enhancement) {
      process.stderr.write(`增强失败（${outcome.failure}），已回退到确定性解释；主链路不受影响。\n`);
      return;
    }
    process.stdout.write([
      '',
      `【LLM 增强解释｜${outcome.enhancement.providerId}${outcome.enhancement.modelId ? ` · ${outcome.enhancement.modelId}` : ''}】`,
      ...wrapLine(outcome.enhancement.text, width),
      '（以上为增强表述，非确定性事实；证据与结论以上方确定性部分为准。）',
    ].join('\n') + '\n');
  }
}

function learningCardFor(report: AnalysisReport, finding: AnalysisReport['findings'][number]) {
  // Card content is keyed by concept; code refs come from the report finding.
  return learningCard({
    id: 'lb-from-report', conceptId: finding.conceptId as never, codeRef: finding.symbol,
    codeFingerprint: '', evidenceIds: finding.evidenceIds, findingId: finding.id,
    impact: finding.severity, association: 'direct', status: 'unassessed', active: true, views: 0,
    contentVersion: LEARNING_CONTENT_VERSION, createdAt: report.createdAt, updatedAt: report.createdAt,
    verifications: [],
  });
}

function sortedBindings(state: LearningState): LearningBinding[] {
  const summary = debtSummary(state);
  return summary.items
    .map(item => state.bindings[item.bindingId])
    .filter((b): b is LearningBinding => Boolean(b));
}

async function runLearn(args: string[]): Promise<void> {
  const store = new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
  const width = terminalWidth();
  const state = await store.readState('.', emptyLearningState());
  const bindings = sortedBindings(state);
  if (!bindings.length) {
    process.stdout.write('当前目录没有学习绑定；先运行 xray scan <路径> 生成发现。\n');
    return;
  }
  if (args.length === 0) {
    const summary = debtSummary(state);
    process.stdout.write(`学习绑定（按认知债务排序，共 ${bindings.length} 条；总债务 ${summary.total}）：\n`);
    for (const [index, binding] of bindings.entries())
      process.stdout.write(wrapLine(`  ${index + 1}. [${STATUS_LABELS[binding.status]}] ${binding.conceptId} — ${binding.codeRef}${binding.status === 'stale' ? '（待复核：' + (binding.staleReason ?? '') + '）' : ''}`, width).join('\n') + '\n');
    process.stdout.write('子命令：xray learn <编号> [status|answer|ignore|restore|rebind|delete] …\n');
    return;
  }
  const index = Number(args[0]);
  if (!Number.isInteger(index) || index < 1 || index > bindings.length)
    throw new XrayError('INVALID_ARGUMENT', `编号需为 1—${bindings.length}；收到：${args[0]}`, 2);
  const binding = bindings[index - 1];
  const sub = args[1];
  const at = new Date().toISOString();
  if (!sub) {
    const card = learningCard(binding);
    const lines = [
      `${card.title}（${card.conceptId}）`,
      `代码位置：${binding.codeRef} · 状态：${STATUS_LABELS[binding.status]} · 已查看 ${binding.views} 次`,
      '',
      `是什么：${card.what}`,
      `为什么在这里：${card.whyHere}`,
      `隐藏机制：${card.hiddenMechanisms}`,
      `如果不理解/移除会怎样：${card.whatIfRemoved}`,
      '',
      `验证问题：${card.question.prompt}`,
      ...card.question.options.map(option => `  ${option.id}) ${option.text}`),
      '',
      `来源：${card.sources.map(s => s.title).join('、')}`,
      '回答验证：xray learn <编号> answer <选项字母>；自述掌握：xray learn <编号> status self-reported。',
    ];
    process.stdout.write(lines.flatMap(line => wrapLine(line, width)).join('\n') + '\n');
    await store.updateState('.', emptyLearningState(), current => applyEvent(current, { type: 'view', bindingId: binding.id }, at).state);
    return;
  }
  const events = {
    status: () => {
      const status = args[2];
      if (!['to-learn', 'learning', 'self-reported'].includes(status ?? ''))
        throw new XrayError('INVALID_ARGUMENT', 'status 需为 to-learn、learning 或 self-reported。', 2);
      return { type: 'set-status', bindingId: binding.id, status: status as 'to-learn' | 'learning' | 'self-reported' };
    },
    answer: () => {
      if (!args[2] || !/^[a-z]$/.test(args[2])) throw new XrayError('INVALID_ARGUMENT', 'answer 需要一个选项字母（a/b/c…）。', 2);
      return { type: 'answer', bindingId: binding.id, questionId: learningCard(binding).question.id, optionId: args[2] };
    },
    ignore: () => ({ type: 'ignore', bindingId: binding.id, ...(args[2] ? { reason: args[2] as 'not-relevant' | 'accepted-for-now' | 'user-choice' } : {}) }),
    restore: () => ({ type: 'restore', bindingId: binding.id }),
    rebind: () => {
      const conceptId = args[2];
      if (!['spring.transaction-proxy', 'jpa.query-amplification', 'jpa.entity-boundary'].includes(conceptId ?? ''))
        throw new XrayError('INVALID_ARGUMENT', 'rebind 需要概念 ID（spring.transaction-proxy / jpa.query-amplification / jpa.entity-boundary）。', 2);
      return { type: 'rebind', bindingId: binding.id, conceptId: conceptId as 'spring.transaction-proxy' };
    },
    delete: () => ({ type: 'delete', bindingId: binding.id }),
  } as const;
  if (!(sub in events)) throw new XrayError('INVALID_ARGUMENT', `未知子命令：${sub}（可用 status/answer/ignore/restore/rebind/delete）`, 2);
  const event = (events as Record<string, () => { type: string; bindingId: string }>)[sub]();
  const updated = await store.updateState('.', emptyLearningState(), current => applyEvent(current, event as never, at).state);
  const after = updated.bindings[binding.id];
  if (sub === 'delete') { process.stdout.write(`已删除学习绑定 ${binding.id}。\n`); return; }
  if (sub === 'answer') {
    const verification = after?.verifications.at(-1);
    process.stdout.write(verification?.result === 'passed'
      ? `回答正确——已验证理解（${binding.conceptId}）。\n`
      : `回答未通过，状态保持 ${STATUS_LABELS[after?.status ?? 'unassessed']}。解析：${learningCard(binding).question.rationale}\n`);
    return;
  }
  process.stdout.write(`已更新：${binding.conceptId} → ${STATUS_LABELS[after?.status ?? 'unassessed']}${sub === 'rebind' ? '（概念已更正）' : ''}\n`);
}

async function runDebt(): Promise<void> {
  const store = new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
  const width = terminalWidth();
  const state = await store.readState('.', emptyLearningState());
  const summary = debtSummary(state);
  const profile = await store.readProfile(emptyDeveloperProfile());
  const profileConfigured = Object.keys(profile.skills).length > 0;
  const lines = [
    `认知债务（${summary.modelVersion}，个人启发式，不是能力评分）`,
    `总债务：${summary.total}（${summary.calculatedCount} 条计入；未评估 ${summary.unassessedCount}、待复核 ${summary.staleCount}、未知关联 ${summary.unknownCount}、已忽略 ${summary.ignoredCount}）`,
    `公式：${summary.formula}`,
    `含义：${summary.meaning}`,
    `范围：${summary.scope}`,
    `去重：${summary.deduplication}`,
    `开发者画像：${profileConfigured ? `${DEVELOPER_PROFILE_VERSION}（本机全局，影响个人建议排序，不改变代码发现）` : '未评估——xray profile init 后可结合画像计算个人知识缺口'}`,
    '',
    '明细（按优先级降序）：',
  ];
  for (const item of summary.items)
    lines.push(wrapLine(`  ${item.priority === null ? '—' : item.priority.toFixed(2).padStart(5)} [${item.statusLabel}] ${item.conceptId} — ${item.codeRef}` +
      (item.priority === null ? `（${item.exclusionReason}）` : ` = ${item.impact}×${item.gap}×${item.evidenceStrength}`), width).join('\n'));
  if (!summary.items.length) lines.push('  （暂无绑定；先运行 xray scan）');
  process.stdout.write(lines.join('\n') + '\n');
}

function parseProfileArgs(args: string[]): { dimension: ProfileDimension; key: string; label: string; level: ProfileSkillLevel; confidence: 'low' | 'medium' | 'high'; evidenceKind: ProfileEvidenceKind; evidenceSummary?: string; roleKeys: string[]; primaryRole?: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) throw new XrayError('INVALID_ARGUMENT', `未知 profile 参数：${arg}`, 2);
    const flag = arg.slice(2);
    const value = args[++i];
    if (value === undefined) throw new XrayError('INVALID_ARGUMENT', `--${flag} 需要一个值。`, 2);
    values.set(flag, value);
  }
  const dimension = values.get('dimension');
  if (!dimension || !['language', 'framework', 'engineering', 'domain', 'tool'].includes(dimension))
    throw new XrayError('INVALID_ARGUMENT', 'dimension 需为 language/framework/engineering/domain/tool。', 2);
  const key = values.get('key');
  const label = values.get('label') ?? key;
  const level = values.get('level');
  if (!key || !label) throw new XrayError('INVALID_ARGUMENT', '--key 和 --label 均需提供。', 2);
  if (!level || !PROFILE_LEVELS.includes(level as ProfileSkillLevel))
    throw new XrayError('INVALID_ARGUMENT', 'level 需为 novice/beginner/intermediate/advanced/expert。', 2);
  const confidence = values.get('confidence') ?? 'medium';
  if (!PROFILE_CONFIDENCE.includes(confidence as 'low')) throw new XrayError('INVALID_ARGUMENT', 'confidence 需为 low/medium/high。', 2);
  const evidenceKind = values.get('evidence-kind') ?? 'self-assessment';
  if (!PROFILE_EVIDENCE_KINDS.includes(evidenceKind as ProfileEvidenceKind))
    throw new XrayError('INVALID_ARGUMENT', 'evidence-kind 需为 self-assessment/onboarding-answer/verified-learning/cli-update/project-scan。', 2);
  const roles = values.get('roles');
  return {
    dimension: dimension as ProfileDimension, key, label, level: level as ProfileSkillLevel,
    confidence: confidence as 'low', evidenceKind: evidenceKind as ProfileEvidenceKind,
    evidenceSummary: values.get('evidence'), roleKeys: roles ? roles.split(',').map(role => role.trim()).filter(Boolean) : [],
    primaryRole: values.get('primary-role'),
  };
}

function renderProfile(profile: DeveloperProfile): string {
  const lines = [
    `Developer Profile（${profile.schemaVersion}，本机全局；不是能力评分）`,
    `角色：${profile.roles.length ? profile.roles.join('、') : '未设置'}${profile.primaryRole ? ` · 主角色：${profile.primaryRole}` : ''}`,
    `技能：${Object.keys(profile.skills).length} 项 · 证据：${Object.keys(profile.evidence).length} 条`,
  ];
  for (const skill of Object.values(profile.skills).sort((a, b) => a.key.localeCompare(b.key, 'en')))
    lines.push(`  ${skill.dimension} · ${skill.key}：${skill.label} = ${skill.level}（confidence ${skill.confidence}，证据 ${skill.evidenceIds.length} 条）`);
  return lines.join('\n');
}

async function runProfile(args: string[]): Promise<void> {
  const sub = args[0] ?? 'show';
  if (sub === '--help' || sub === '-h') {
    process.stdout.write(['用法：xray profile show',
      '       xray profile init --roles <逗号分隔> --primary-role <role> --dimension <language|framework|engineering|domain|tool>',
      '           --key <技能> --label <显示名> --level <novice|beginner|intermediate|advanced|expert>',
      '           [--confidence <low|medium|high>] [--evidence-kind <...>] [--evidence <说明>]',
      '       xray profile update …（参数同 init，更新已有画像；保留历史证据）'].join('\n') + '\n');
    return;
  }
  const store = new LocalStore(process.env.XRAY_DATA_DIR ? { dataDir: process.env.XRAY_DATA_DIR } : {});
  if (sub === 'show') {
    const profile = await store.readProfile(emptyDeveloperProfile());
    process.stdout.write(renderProfile(profile) + '\n');
    if (!Object.keys(profile.skills).length) process.stdout.write('下一步：xray profile init --roles frontend,backend --primary-role frontend --dimension language --key Java --label Java --level beginner --confidence medium\n');
    return;
  }
  if (sub !== 'init' && sub !== 'update') throw new XrayError('INVALID_ARGUMENT', `未知 profile 子命令：${sub}（可用 init/show/update）`, 2);
  const rest = args.slice(1).filter(arg => arg !== '--help' && arg !== '-h');
  const parsed = parseProfileArgs(rest);
  const updated = await store.updateProfile(emptyDeveloperProfile(), profile => {
    let next = sub === 'init' ? emptyDeveloperProfile() : profile;
    if (parsed.roleKeys.length || parsed.primaryRole !== undefined) next = setRoles(next, parsed.roleKeys, parsed.primaryRole);
    return upsertSkill(next, {
      dimension: parsed.dimension, key: parsed.key, label: parsed.label, level: parsed.level,
      confidence: parsed.confidence, evidenceKind: parsed.evidenceKind, evidenceSummary: parsed.evidenceSummary,
    });
  });
  process.stdout.write(renderProfile(updated) + '\n');
  process.stdout.write('画像仅保存在本机用户数据目录，不写入当前项目或 Git。\n');
}

export function buildCommands(signal?: AbortSignal): { name: string; description: string; run: (args: string[]) => Promise<void> }[] {
  return [
    { name: 'scan', description: '扫描 Java 项目并输出有证据的分析摘要', run: args => runScan(args, signal) },
    { name: 'explain', description: '查看最近报告中单条发现的完整上下文（证据/前提/未知）', run: runExplain },
    { name: 'learn', description: '学习知识缺口：查看学习卡、自述状态、验证理解', run: runLearn },
    { name: 'debt', description: '查看透明的认知债务模型与明细', run: () => runDebt() },
    { name: 'profile', description: '查看或更新本机开发者画像（角色与技能证据）', run: runProfile },
    { name: 'doctor', description: '检查运行环境、依赖与本地数据状态', run: () => runDoctor() },
  ];
}

/** Composition root: owns process concerns; the engine and cliff stay behind their boundaries. */
export async function main(argv: string[]): Promise<number> {
  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.on('SIGINT', onInterrupt);
  try {
    // cliff sees no version (update checks stay off) and no implicit config/env.
    await dispatch(buildCommands(controller.signal), argv.length ? argv : ['scan', '.']);
    return 0;
  } catch (error) {
    if (error instanceof XrayError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    process.stderr.write(`意外错误：${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    return 1;
  } finally {
    process.off('SIGINT', onInterrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const exit = await main(process.argv.slice(2));
  // Piped stdout flushes asynchronously; exiting before the stream drains
  // truncates large reports at the pipe buffer boundary. Wait for the flush.
  await new Promise<void>(resolve => { process.stdout.write('', () => resolve()); });
  process.exit(exit);
}
