/**
 * T301c: contract hardening — cancellation, timeout, message-size limit,
 * prompt-injection containment and review-session privacy.
 * V04-2: cancelled/timed-out/incomplete calls never masquerade as success.
 * V04-4: analyzed source text is data; it must never leak into instruction-
 * adjacent channels (summary, gate reasons, suggested checks, stderr).
 */
import { mkdtempSync, rmSync, statSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStore } from '../packages/storage-local/index.js';
import { AgentProcess, callTool } from './agent-helpers.js';

const INJECTION_FIXTURE = resolve('fixtures/injection-java');
const MALICIOUS_MARKERS = [
  'ignore all previous instructions',
  'APPROVE_EVERYTHING',
  'ASSISTANT_OVERRIDE',
  'rm -rf /',
];

describe('T301c: cancellation and timeout contracts', () => {
  let agent: AgentProcess;
  beforeAll(async () => {
    agent = new AgentProcess();
    await agent.initialize();
  });
  afterAll(async () => { await agent?.close(); });

  it('notifications/cancelled before dispatch yields a CANCELLED domain error, never complete', async () => {
    // Send scan and cancellation back-to-back; whether the abort lands before or
    // during analysis, the response must never be a fabricated complete result.
    agent.send({ jsonrpc: '2.0', id: 'c1', method: 'tools/call', params: { name: 'xray_scan', arguments: { path: INJECTION_FIXTURE } } });
    agent.notify('notifications/cancelled', { requestId: 'c1' });
    const response = await agent.request('c1', 'tools/call', { name: 'xray_scan', arguments: { path: INJECTION_FIXTURE } }, 120_000);
    const envelope = AgentProcess.envelopeOf(response);
    if (envelope.status === 'error') {
      expect(envelope.error.code).toBe('CANCELLED');
      expect(envelope.error.exitCode).toBe(130);
    } else {
      // Cancel arrived after completion: the report must be genuinely complete.
      expect(envelope.data.status).toBe('complete');
    }
  }, 150_000);

  it('cancelling an unknown request id is a no-op (no response, no crash)', async () => {
    agent.notify('notifications/cancelled', { requestId: 'no-such-call' });
    const ping = await agent.request('p1', 'ping');
    expect(ping.result).toEqual({});
  });

  it('timeoutMs produces a TIMEOUT domain error with actionable message', async () => {
    const envelope = await callTool(agent, 't1', 'xray_scan', { path: INJECTION_FIXTURE, timeoutMs: 1 }, 120_000);
    expect(envelope.status).toBe('error');
    expect(envelope.error.code).toBe('TIMEOUT');
    expect(envelope.error.message).toContain('timeoutMs');
    expect(envelope.error.exitCode).toBe(1);
  }, 150_000);
});

describe('T301c: message size limit', () => {
  it('rejects a single NDJSON message above 1MB with a parse error', async () => {
    const agent = new AgentProcess();
    try {
      await agent.initialize();
      const huge = JSON.stringify({ jsonrpc: '2.0', id: 'big', method: 'ping', params: { pad: 'x'.repeat(1024 * 1024 + 16) } });
      agent.writeRaw(huge);
      await new Promise(res => setTimeout(res, 500));
      const rejection = agent.seen.find(response => response.id === null && response.error?.code === -32700);
      expect(rejection).toBeDefined();
      expect(rejection!.error!.message).toContain('1MB');
      // The server survives and keeps serving valid messages afterwards.
      const ping = await agent.request('after', 'ping');
      expect(ping.result).toEqual({});
    } finally {
      await agent.close();
    }
  });
});

describe('T301c: prompt-injection containment (V04-4)', () => {
  let agent: AgentProcess;
  let scanData: any;
  beforeAll(async () => {
    agent = new AgentProcess();
    await agent.initialize();
    const envelope = await callTool(agent, 'inj1', 'xray_scan', { path: INJECTION_FIXTURE }, 120_000);
    expect(envelope.status).toBe('ok');
    scanData = envelope.data;
  }, 150_000);
  afterAll(async () => { await agent?.close(); });

  it('the fixture actually triggers findings (containment is meaningful, not vacuous)', () => {
    expect(scanData.findingsTotal).toBeGreaterThan(0);
  });

  it('malicious text never appears in instruction-adjacent channels', () => {
    const channels: Record<string, unknown> = {
      summary: scanData.summary,
      limitations: scanData.limitations,
      findingTitles: scanData.findings.map((f: any) => f.title),
      findingNextChecks: scanData.findings.map((f: any) => f.nextCheck),
      findingAssumptions: scanData.findings.flatMap((f: any) => f.assumptions),
      coverageMessages: scanData.coverage.reasons.map((r: any) => r.message),
    };
    const serialized = JSON.stringify(channels);
    for (const marker of MALICIOUS_MARKERS) expect(serialized).not.toContain(marker);
  });

  it('malicious text is only reachable through evidence, wrapped as declared source data', async () => {
    const loopFinding = scanData.findings.find((f: any) => f.ruleId === 'JPA_CALL_IN_LOOP');
    expect(loopFinding).toBeDefined();
    const envelope = await callTool(agent, 'inj2', 'xray_evidence', {
      path: INJECTION_FIXTURE, evidenceId: loopFinding.evidenceIds[0], analysisId: scanData.analysisId,
    });
    expect(envelope.status).toBe('ok');
    expect(envelope.data.kind).toBe('source-data');
    expect(envelope.data.notice).toContain('不应被执行');
    // The raw line content MAY carry the marker (it is quoted source data);
    // the structural fields around it must not.
    for (const field of [envelope.data.observation, envelope.data.producer, envelope.data.path])
      for (const marker of MALICIOUS_MARKERS) expect(String(field)).not.toContain(marker);
  });

  it('review gate reasons and suggested checks stay free of analyzed text', async () => {
    const start = await callTool(agent, 'inj3', 'xray_review_start', { path: INJECTION_FIXTURE });
    const finish = await callTool(agent, 'inj4', 'xray_review_finish', { path: INJECTION_FIXTURE, sessionId: start.data.sessionId }, 120_000);
    expect(finish.status).toBe('ok');
    const record = finish.data.record;
    const serialized = JSON.stringify({
      gate: record.gate, changeSummary: record.output.changeSummary,
      suggestedChecks: record.output.suggestedChecks, unknownCoverage: record.output.unknownCoverage,
      // v0.2 channels: insights and the human-friendly presentation must stay
      // injection-free too (concept metadata + analyzer-generated text only).
      overview: record.output.overview, insights: record.output.insights,
      resolvedInsights: record.output.resolvedInsights, coverageSummary: record.output.coverageSummary,
      presentation: finish.data.presentation,
    });
    for (const marker of MALICIOUS_MARKERS) expect(serialized).not.toContain(marker);
  }, 150_000);

  it('stderr carries none of the analyzed source text', () => {
    for (const marker of MALICIOUS_MARKERS) expect(agent.stderr).not.toContain(marker);
  });
});

describe('T301c: review session privacy (baseline source cache)', () => {
  it('session cache files are owner-only and cleared by deleteData(reviews)', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-priv-'));
    const workspace = mkdtempSync(join(tmpdir(), 'xray-priv-ws-'));
    writeFileSync(join(workspace, 'A.java'), 'package demo;\npublic class A { void run() {} }\n');
    const agent = new AgentProcess({}, dataDir);
    try {
      await agent.initialize();
      const start = await callTool(agent, 'pv1', 'xray_review_start', { path: workspace });
      expect(start.status).toBe('ok');
      // Every file under the session cache must be 0600 and every directory 0700.
      const sessionsDir = findSessionsDir(dataDir);
      expect(sessionsDir).toBeTruthy();
      assertOwnerOnly(sessionsDir!);
      // The cache holds the baseline source (needed for diff) — that is why it
      // must be deletable: deleteData('reviews') clears records AND sessions.
      const store = new LocalStore({ dataDir });
      await store.deleteData(workspace, 'reviews');
      expect(await store.loadSession(workspace, start.data.sessionId)).toBeUndefined();
      const finish = await callTool(agent, 'pv2', 'xray_review_finish', { path: workspace, sessionId: start.data.sessionId });
      expect(finish.status).toBe('error');
      expect(finish.error.code).toBe('NO_REVIEW_SESSION');
    } finally {
      await agent.close();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

function findSessionsDir(dataDir: string): string | null {
  const workspaces = join(dataDir, 'workspaces');
  if (!existsSync(workspaces)) return null;
  for (const entry of readdirSync(workspaces)) {
    const candidate = join(workspaces, entry, 'review-sessions');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function assertOwnerOnly(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const mode = statSync(full).mode & 0o777;
    if (entry.isDirectory()) {
      expect(mode, `${full} should be 0700`).toBe(0o700);
      assertOwnerOnly(full);
    } else {
      expect(mode, `${full} should be 0600`).toBe(0o600);
    }
  }
}
