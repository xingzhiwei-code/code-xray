#!/usr/bin/env node
/**
 * Opt-in host hook: post-change review from the CLI channel.
 *
 * Usage (Claude Code settings.json, hooks.Stop or hooks.PostToolUse):
 *   { "hooks": [{ "type": "command", "command": "node <abs>/scripts/agent-review-hook.mjs <project-path>" }] }
 *
 * Semantics (PRD §8.5-5, gate policy):
 * - report-only (default): always exits 0; the review summary goes to stdout
 *   so the host/user sees risks, evidence pointers and unknowns. Findings
 *   NEVER block the flow.
 * - XRAY_AGENT_GATE=enforce: exits 2 with the gate JSON on stdout when the
 *   gate is not pass/needs-human-reviewable — Claude Code treats exit 2 as
 *   blocking feedback. Only this explicit user configuration makes findings
 *   influence whether the flow continues.
 *
 * The hook is stateless: it runs `scan --base <ref>` (default HEAD) through
 * the same Engine the MCP tools use; no rules or gate logic are duplicated.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'dist', 'cli.js');
const projectPath = resolve(process.argv[2] ?? process.cwd());
// XRAY_HOOK_BASE='' disables the git baseline (plain directory review).
const base = process.env.XRAY_HOOK_BASE !== undefined ? process.env.XRAY_HOOK_BASE : 'HEAD';
const enforce = process.env.XRAY_AGENT_GATE === 'enforce';

const args = [cli, 'scan', projectPath, '--format', 'json'];
if (base) args.splice(3, 0, '--base', base);
const child = spawn(process.execPath, args, {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: process.env,
});
let out = '';
child.stdout.on('data', chunk => { out += chunk; });
child.on('close', code => {
  if (code !== 0) {
    // Analysis failure is never dressed up as a pass (V04-2).
    process.stdout.write(`Code X-Ray 审查未完成（scan 退出码 ${code}）：结论不可用，请勿视为审查通过。\n`);
    process.exit(enforce ? 2 : 0);
  }
  let report;
  try { report = JSON.parse(out); }
  catch {
    process.stdout.write('Code X-Ray 审查未完成（输出解析失败）：结论不可用。\n');
    process.exit(enforce ? 2 : 0);
  }
  const diff = report.diff;
  const lines = [];
  lines.push(`Code X-Ray 修改后审查（${base ? `base ${base}，` : ''}${report.status}）：${report.summary}`);
  if (diff) {
    lines.push(`变更：+${diff.added.length} ~${diff.modified.length} -${diff.deleted.length}；新增风险 ${diff.newFindingIds.length}、持续 ${diff.continuingFindingIds.length}、移除 ${diff.removedFindings.length}。`);
    if (diff.limitations.length) lines.push(`diff 限制：${diff.limitations.join(' ')}`);
  }
  if (report.coverage.unknown > 0) lines.push(`未知覆盖 ${report.coverage.unknown} 项（未知不等于无风险）；限制：${report.limitations.join(' ') || '无'}`);
  lines.push(`报告已存本地（analysisId ${report.analysisId}）；用 xray explain / IDE 查看证据后再决定接受、修改或补验证。`);
  process.stdout.write(lines.join('\n') + '\n');
  const risky = diff ? diff.newFindingIds.length + diff.continuingFindingIds.length : report.findings.length;
  const gateFailed = report.status !== 'complete' || risky > 0 || report.coverage.unknown > 0;
  if (enforce && gateFailed) process.exit(2);
  process.exit(0);
});
