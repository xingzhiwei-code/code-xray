/**
 * T301d: opt-in host hook contract (scripts/agent-review-hook.mjs).
 * The hook reuses the CLI/Engine channel; these tests lock its gate policy:
 * report-only never blocks (exit 0), enforce blocks with exit 2, and analysis
 * failure is declared unusable instead of being dressed up as a pass (V04-2).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOK = resolve('scripts/agent-review-hook.mjs');
const FIXTURE = resolve('fixtures/java-spring-jpa');

function runHook(args: string[], env: NodeJS.ProcessEnv = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'xray-hook-'));
  try {
    const result = spawnSync(process.execPath, [HOOK, ...args], {
      env: { ...process.env, XRAY_DATA_DIR: dataDir, ...env },
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('T301d: agent review hook gate policy', () => {
  it('report-only (default) exits 0 even with findings and unknowns, printing an honest summary', () => {
    const run = runHook([FIXTURE]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('修改后审查');
    expect(run.stdout).toContain('未知不等于无风险');
    expect(run.stdout).toContain('analysisId');
  }, 150_000);

  it('enforce exits 2 when the gate cannot pass (unknown coverage / findings)', () => {
    const run = runHook([FIXTURE], { XRAY_AGENT_GATE: 'enforce' });
    expect(run.status).toBe(2);
    expect(run.stdout).toContain('修改后审查');
  }, 150_000);

  it('analysis failure declares the conclusion unusable, never a pass', () => {
    const reportOnly = runHook(['/definitely/not/a/dir']);
    expect(reportOnly.status).toBe(0);
    expect(reportOnly.stdout).toContain('审查未完成');
    expect(reportOnly.stdout).toContain('请勿视为审查通过');
    const enforce = runHook(['/definitely/not/a/dir'], { XRAY_AGENT_GATE: 'enforce' });
    expect(enforce.status).toBe(2);
    expect(enforce.stdout).toContain('审查未完成');
  }, 150_000);

  it('a clean workspace with no risks and no unknowns passes the gate even under enforce', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xray-hook-clean-'));
    try {
      // Non-git dir + XRAY_HOOK_BASE='' → plain directory review without diff.
      writeFileSync(join(dir, 'Plain.java'), 'package demo;\npublic class Plain { public int add(int a, int b) { return a + b; } }\n');
      const run = runHook([dir], { XRAY_AGENT_GATE: 'enforce', XRAY_HOOK_BASE: '' });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('修改后审查');
      expect(run.stdout).not.toContain('审查未完成');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 150_000);
});
