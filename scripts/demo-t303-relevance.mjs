#!/usr/bin/env node
/**
 * T303 E2E demo: drives the BUILT artifacts (dist/agent.js over MCP stdio +
 * dist/cli.js) through the plan §23 acceptance cases A—E and §24 metrics,
 * then writes a transcript to artifacts/evidence/E036/.
 *
 * Usage: node scripts/demo-t303-relevance.mjs [workspace-path]
 * Deterministic: fixed task texts, injected nothing — real outputs verbatim.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

const repoRoot = resolve(import.meta.dirname, '..');
const workspace = resolve(process.argv[2] ?? join(repoRoot, 'fixtures/java-spring-jpa'));
const agentBin = join(repoRoot, 'dist', 'agent.js');
const cliBin = join(repoRoot, 'dist', 'cli.js');
const dataDir = mkdtempSync(join(tmpdir(), 'xray-t303-demo-'));
const outDir = join(repoRoot, 'artifacts', 'evidence', 'E036');

const sha256 = value => createHash('sha256').update(value).digest('hex');
const transcript = [];
function record(step, detail) {
  transcript.push(`## ${step}\n\n${detail}\n`);
  console.log(`[demo] ${step}`);
}

// ---------- MCP client over stdio ----------
const child = spawn(process.execPath, [agentBin], { env: { ...process.env, XRAY_DATA_DIR: dataDir }, stdio: ['pipe', 'pipe', 'inherit'] });
const decoder = new StringDecoder('utf8');
let buffer = '';
const pending = new Map();
child.stdout.on('data', chunk => {
  buffer += decoder.write(chunk);
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) pending.get(message.id)(message);
  }
});
let nextId = 0;
function rpc(method, params) {
  const id = ++nextId;
  return new Promise((res, rej) => {
    pending.set(id, res);
    setTimeout(() => rej(new Error(`${method} timed out`)), 120_000).unref();
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
}
async function callTool(name, args) {
  const response = await rpc('tools/call', { name, arguments: args });
  const wire = response.result.content[0].text;
  return { envelope: JSON.parse(wire), wireBytes: wire.length };
}
function cli(args, cwd = workspace) {
  return new Promise((res, rej) => {
    const proc = spawn(process.execPath, [cliBin, ...args], { cwd, env: { ...process.env, XRAY_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('close', code => res({ code, out, err }));
    proc.on('error', rej);
  });
}

try {
  mkdirSync(outDir, { recursive: true });
  record('环境', [
    `dist/agent.js sha256=${sha256(readFileSync(agentBin))}`,
    `dist/cli.js sha256=${sha256(readFileSync(cliBin))}`,
    `workspace=${workspace}`,
    `XRAY_DATA_DIR=${dataDir}（临时目录，演示后保留供核对，路径见文末）`,
    `node=${process.version} platform=${process.platform}/${process.arch}`,
  ].join('\n'));

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't303-demo', version: '0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  record('Step 0 — initialize：instructions 引导先走 relevance 门', init.result.instructions);

  // Case A — routine frontend → SKIP (quiet, tiny).
  const caseA = await callTool('xray_relevance', { path: workspace, task: '给 React Button 增加 loading 状态', changedFiles: ['src/components/Button.tsx', 'src/components/Button.css'] });
  record('Step 1 — Case A：常规前端任务 → SKIP（quiet，wire ' + caseA.wireBytes + ' 字节）', JSON.stringify(caseA.envelope.data, null, 2));

  // §24.5 contrast: same workspace full scan envelope size.
  const scan = await callTool('xray_scan', { path: workspace });
  record('Step 2 — §24.5 对照：xray_scan 同工作区完整 envelope = ' + scan.wireBytes + ' 字节（skip 输出的 ' + (scan.wireBytes / caseA.wireBytes).toFixed(1) + ' 倍）',
    `scan.summary=${scan.envelope.data.summary}\nfindingsTotal=${scan.envelope.data.findingsTotal}`);

  // Case B — frontend authorization → LIGHT.
  const caseB = await callTool('xray_relevance', { path: workspace, task: '给 React 页面增加权限控制', changedFiles: ['src/pages/Dashboard.tsx'] });
  record('Step 3 — Case B：前端权限任务 → LIGHT（聚焦 targets，不扫全仓库）', JSON.stringify(caseB.envelope.data, null, 2));

  // Case C — payment state transition → FULL.
  const caseC = await callTool('xray_relevance', { path: workspace, task: '修改订单支付状态流转', changedFiles: ['src/main/java/com/shop/OrderPaymentService.java'] });
  record('Step 4 — Case C：支付状态流转 → FULL', JSON.stringify(caseC.envelope.data, null, 2));

  // Case D — self-reported claim via real CLI, then gate consequence.
  const initProfile = await cli(['profile', 'init', '--roles', 'backend', '--primary-role', 'backend', '--dimension', 'framework', '--key', 'Spring', '--label', 'Spring', '--level', 'expert', '--evidence', '用户自述：我是 Spring 专家']);
  const caseD = await callTool('xray_relevance', { path: workspace, task: '调整 Spring service 的缓存逻辑', changedFiles: ['src/main/java/com/shop/CacheService.java'] });
  record('Step 5 — Case D：自述"Spring 专家" → 记录为 self-reported/low，后端任务不因声明 SKIP',
    `CLI exit=${initProfile.code}\n${initProfile.out}\nMCP 决策：\n${JSON.stringify(caseD.envelope.data, null, 2)}`);

  // Case E — explicit correction, history preserved, later tasks don't skip.
  const correct = await cli(['profile', 'correct', '--key', 'spring', '--unfamiliar', '--note', '其实我不熟 Spring Transaction']);
  const show = await cli(['profile', 'show']);
  const caseE = await callTool('xray_relevance', { path: workspace, task: '小改 Spring 配置', changedFiles: ['src/main/java/com/shop/Config.java'] });
  const contextFile = JSON.parse(readFileSync(join(dataDir, 'developer', 'profile.json'), 'utf8')).payload;
  const springEvidence = contextFile.skills['framework:spring'].evidenceIds.length;
  record('Step 6 — Case E：显式修正 → correction 证据追加、历史保留（spring 证据 ' + springEvidence + ' 条）、修正窗口内不 SKIP',
    `CLI correct exit=${correct.code}\n${correct.out}\n${show.out}\nMCP 决策：\n${JSON.stringify(caseE.envelope.data, null, 2)}`);

  // Metrics over MCP + CLI --stats.
  const stats = await callTool('xray_summary', { path: workspace, kind: 'relevance' });
  const cliStats = await cli(['relevance', '--stats']);
  record('Step 7 — §24 指标：skip 率 / false-skip 信号（本机、有界窗口、诚实标注）',
    `MCP xray_summary(kind=relevance)：\n${JSON.stringify(stats.envelope.data, null, 2)}\n\nCLI xray relevance --stats：\n${cliStats.out}`);

  // Explainability (§16 "Why was this skipped?").
  const explain = await cli(['relevance', '--task', '给 React Button 增加 loading 状态', '--files', 'src/Button.tsx', '--explain']);
  record('Step 8 — §16 人类可解释：xray relevance --explain（完整信号诊断，任务原文不回显）', `CLI exit=${explain.code}\n${explain.out}`);

  const summary = [
    `# E036 transcript — T303 Relevance Gate 真实二进制演示`,
    ``,
    `- 日期：${new Date().toISOString()}`,
    `- 通道：dist/agent.js（MCP stdio, NDJSON JSON-RPC）+ dist/cli.js（真实入口）`,
    `- 数据目录：${dataDir}（临时；developer/profile.json 与 relevance-log.json 均在本地）`,
    ``,
    ...transcript,
  ].join('\n');
  writeFileSync(join(outDir, 'relevance-gate-transcript.md'), summary + '\n');
  console.log(`[demo] transcript written: artifacts/evidence/E036/relevance-gate-transcript.md`);
} catch (error) {
  console.error('[demo] FAILED:', error);
  writeFileSync(join(outDir, 'relevance-gate-transcript.md'), [...transcript, `## FAILURE\n\n${String(error?.stack ?? error)}\n`].join('\n'));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  // dataDir is intentionally preserved so the reviewer can inspect
  // developer/profile.json and relevance-log.json after the run.
  setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* done */ } }, 500).unref();
}
