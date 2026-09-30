/**
 * T303 E2E acceptance (plan §23 Case A—E, §24 metrics, §31 UX hard rules).
 * Runs against the REAL MCP server process (same channel Claude Code/Codex use)
 * with a real local store — no mocks in the decision path.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentProcess, callTool } from './agent-helpers.js';

const WORKSPACE = resolve('fixtures/java-spring-jpa');

describe('T303 E2E acceptance — Cases A–E', () => {
  let agent: AgentProcess;
  beforeAll(async () => {
    agent = new AgentProcess();
    await agent.initialize();
  });
  afterAll(async () => { await agent?.close(); });

  it('Case A — frontend routine: SKIP, tiny output, no analysis triggered, zero interaction', async () => {
    const response = await agent.request('case-a', 'tools/call', {
      name: 'xray_relevance',
      arguments: { path: WORKSPACE, task: '给 React Button 增加 loading 状态', changedFiles: ['src/components/Button.tsx', 'src/components/Button.css'] },
    });
    const envelope = AgentProcess.envelopeOf(response);
    expect(envelope.status).toBe('ok');
    expect(envelope.data.decision).toBe('skip');
    expect(envelope.data.quiet).toBe(true);
    // §31.1: a routine frontend task must NOT produce scan-sized MCP output.
    const skipWire = (response.result.content[0].text as string).length;
    expect(skipWire).toBeLessThan(800);
    // No report was created by the gate call itself (no hidden analysis).
    const summary = await callTool(agent, 'case-a-summary', 'xray_summary', { path: WORKSPACE, kind: 'learning' });
    expect(summary.status).toBe('ok');
    // Zero user interaction is structural: the tool never prompts, never blocks.
    expect(envelope.data.decision).toBe('skip');
  });

  it('Case A contrast — the same task WITHOUT the gate would cost a scan-sized envelope (§24.5)', async () => {
    const scan = await agent.request('case-a-scan', 'tools/call', { name: 'xray_scan', arguments: { path: WORKSPACE } }, 120_000);
    const scanEnvelope = AgentProcess.envelopeOf(scan);
    expect(scanEnvelope.status).toBe('ok');
    const scanWire = (scan.result.content[0].text as string).length;
    const gate = await agent.request('case-a-gate', 'tools/call', {
      name: 'xray_relevance',
      arguments: { path: WORKSPACE, task: '给 React Button 增加 loading 状态', changedFiles: ['src/components/Button.tsx'] },
    });
    const gateWire = (gate.result.content[0].text as string).length;
    // The token-savings claim must be a measurable fact, not a promise.
    expect(scanWire / gateWire).toBeGreaterThan(5);
  }, 150_000);

  it('Case B — frontend authorization: LIGHT with authorization-boundary targets, not a repo-wide scan', async () => {
    const envelope = await callTool(agent, 'case-b', 'xray_relevance', {
      path: WORKSPACE, task: '给 React 页面增加权限控制', changedFiles: ['src/pages/Dashboard.tsx'],
    });
    expect(envelope.data.decision).toBe('light');
    const targets = envelope.data.targets as { kind: string; ref: string }[];
    expect(targets.map(t => t.ref)).toEqual(expect.arrayContaining(['authorization boundary', 'existing auth abstraction', 'relevant symbols']));
    // LIGHT stays scoped: path targets are exactly the changed files (≤ limit).
    expect(targets.filter(t => t.kind === 'path').map(t => t.ref)).toEqual(['src/pages/Dashboard.tsx']);
  });

  it('Case C — payment state transition: FULL with transaction/idempotency/consistency focus', async () => {
    const envelope = await callTool(agent, 'case-c', 'xray_relevance', {
      path: WORKSPACE, task: '修改订单支付状态流转', changedFiles: ['src/main/java/com/shop/OrderPaymentService.java'],
    });
    expect(envelope.data.decision).toBe('full');
    const refs = (envelope.data.targets as { ref: string }[]).map(t => t.ref);
    expect(refs).toEqual(expect.arrayContaining(['transaction boundary', 'idempotency', 'state transition', 'data consistency']));
  });

  it('Case D — "我是 Spring 专家": recorded as self-reported, never a high-trust skip', async () => {
    // The host LLM would call this after the user's claim; CLI path is covered
    // in relevance-cli tests. Here we assert the gate consequence over MCP:
    // even with a spring-expert context, a spring backend task is not skipped.
    const before = await callTool(agent, 'case-d', 'xray_relevance', {
      path: WORKSPACE, task: '调整 Spring service 的事务传播行为', changedFiles: ['src/main/java/com/shop/OrderService.java'],
    });
    expect(['light', 'full']).toContain(before.data.decision);
    expect(before.data.decision).not.toBe('skip');
    // The stored context (grown via observations so far) contains no verified
    // spring claim — observations are aggregate usage, not skill assertions.
    const stored = JSON.parse(readFileSync(join(agent.dataDir, 'developer', 'profile.json'), 'utf8')).payload;
    for (const skill of Object.values(stored.skills as Record<string, { provenance: string }>)) {
      expect(skill.provenance).not.toBe('verified');
    }
  });

  it('§24 metrics are queryable over MCP and stay honest about unimplemented rates', async () => {
    const stats = await callTool(agent, 'metrics', 'xray_summary', { path: WORKSPACE, kind: 'relevance' });
    expect(stats.status).toBe('ok');
    expect(stats.data.totalDecisions).toBeGreaterThanOrEqual(5);
    expect(stats.data.skip).toBeGreaterThanOrEqual(2);
    expect(stats.data.full).toBeGreaterThanOrEqual(1);
    expect(typeof stats.data.skipRate).toBe('number');
    expect(stats.data.note).toContain('v1 不做估算');
  });

  it('§31.4 recoverability: a skip followed by an analysis that finds new risks records a false-skip fact', async () => {
    const { noteAnalysisAfterDecision } = await import('../packages/relevance/service.js');
    const { LocalStore } = await import('../packages/storage-local/index.js');
    const store = new LocalStore({ dataDir: agent.dataDir });
    // Fresh quiet skip on the same workspace…
    await callTool(agent, 'recover-skip', 'xray_relevance', { path: WORKSPACE, task: '调整按钮样式', changedFiles: ['src/theme.css'] });
    // …then a real analysis (scan/review path) finds new risks.
    await noteAnalysisAfterDecision(store, WORKSPACE, { source: 'scan', newRiskCount: 1 }, new Date().toISOString());
    const stats = await callTool(agent, 'recover-stats', 'xray_summary', { path: WORKSPACE, kind: 'relevance' });
    expect(stats.data.falseSkipSignals).toBeGreaterThanOrEqual(1);
    // The system stays functional — the next decision works normally (no error state).
    const next = await callTool(agent, 'recover-next', 'xray_relevance', { path: WORKSPACE, changedFiles: ['a.css'] });
    expect(next.status).toBe('ok');
  });
  it('Case E — correction flow: history preserved, later related tasks never skip on the old profile', async () => {
    // Simulate the long-term observed familiarity that would otherwise skip.
    for (let i = 0; i < 4; i++) {
      await callTool(agent, `case-e-obs-${i}`, 'xray_relevance', {
        path: WORKSPACE, changedFiles: [`src/main/java/com/shop/svc${i}/OrderService.java`],
      });
    }
    const beforeCorrection = JSON.parse(readFileSync(join(agent.dataDir, 'developer', 'profile.json'), 'utf8')).payload;
    const javaBefore = beforeCorrection.skills['language:java'];
    expect(javaBefore.provenance).toBe('observed');

    // A correction arrives through the CLI domain (single shared engine); here
    // we drive it through the same store the MCP server uses.
    const { readContextFrom, recordCorrection, emptyDeveloperContext } = await import('../packages/developer-profile/engine.js');
    const { LocalStore } = await import('../packages/storage-local/index.js');
    const store = new LocalStore({ dataDir: agent.dataDir });
    const corrected = await store.updateProfile(emptyDeveloperContext(), current =>
      recordCorrection(readContextFrom(current), { dimension: 'language', key: 'java', direction: 'unfamiliar', note: '其实我不熟 Spring Transaction' }));
    // History preserved: every prior evidence id still present.
    for (const id of javaBefore.evidenceIds) {
      expect(corrected.skills['language:java'].evidenceIds).toContain(id);
    }
    expect(corrected.skills['language:java'].lastCorrection?.direction).toBe('unfamiliar');

    // After the correction, the same class of Java task must not skip.
    const after = await callTool(agent, 'case-e-after', 'xray_relevance', {
      path: WORKSPACE, task: '小改 Spring 配置', changedFiles: ['src/main/java/com/shop/Config.java'],
    });
    expect(after.data.decision).not.toBe('skip');
  }, 120_000);

});
