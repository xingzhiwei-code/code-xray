import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../apps/cli/index.js';

const ORIGINAL_DATA_DIR = process.env.XRAY_DATA_DIR;
const ORIGINAL_PROFILE_DIAGNOSTICS = process.env.XRAY_PROFILE_DIAGNOSTICS;

function captureStd(): { readonly stdout: string; readonly stderr: string; restore: () => void } {
  const live = { stdout: '', stderr: '' };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { live.stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => { live.stderr += String(chunk); return true; });
  return { get stdout() { return live.stdout; }, get stderr() { return live.stderr; }, restore: () => { out.mockRestore(); err.mockRestore(); } };
}

afterEach(() => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.XRAY_DATA_DIR;
  else process.env.XRAY_DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_PROFILE_DIAGNOSTICS === undefined) delete process.env.XRAY_PROFILE_DIAGNOSTICS;
  else process.env.XRAY_PROFILE_DIAGNOSTICS = ORIGINAL_PROFILE_DIAGNOSTICS;
  vi.restoreAllMocks();
});

describe('profile CLI surface', () => {
  it('shows an unassessed profile without guessing skill', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-profile-cli-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      expect(await main(['profile'])).toBe(0);
      expect(std.stdout).toContain('Developer Profile');
      expect(std.stdout).toContain('技能：0 项');
      expect(std.stdout).toContain('xray profile init');
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('creates and updates a local-first profile with evidence and confidence', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-profile-init-'));
    process.env.XRAY_DATA_DIR = dataDir;
    try {
      const init = captureStd();
      expect(await main(['profile', 'init', '--roles', 'frontend,backend', '--primary-role', 'frontend',
        '--dimension', 'language', '--key', 'Java', '--label', 'Java', '--level', 'beginner',
        '--confidence', 'medium', '--evidence-kind', 'onboarding-answer',
        '--evidence', '前端工程师，维护 Java 后端，自述初学'])).toBe(0);
      expect(init.stdout).toContain('language · language:java');
      expect(init.stdout).toContain('Java = beginner');
      expect(init.stdout).toContain('confidence medium');
      expect(init.stdout).toContain('证据 1 条');
      expect(init.stdout).toContain('不写入当前项目或 Git');
      init.restore();

      const update = captureStd();
      expect(await main(['profile', 'update', '--dimension', 'framework', '--key', 'Spring',
        '--label', 'Spring', '--level', 'intermediate', '--confidence', 'low'])).toBe(0);
      expect(update.stdout).toContain('framework · framework:spring');
      expect(update.stdout).toContain('Spring = intermediate');
      update.restore();

      process.env.XRAY_PROFILE_DIAGNOSTICS = '1';
      const scan = captureStd();
      expect(await main(['scan', 'fixtures/java-spring-jpa'])).toBe(0);
      expect(scan.stderr).toContain('Developer Profile');
      expect(scan.stderr).toContain('spring.transaction-proxy=画像信号');
      expect(scan.stderr).toContain('jpa.query-amplification=画像缺少该技能');
      expect(scan.stdout).toContain('开发者画像：已启用');
      scan.restore();
      delete process.env.XRAY_PROFILE_DIAGNOSTICS;

      const debt = captureStd();
      expect(await main(['debt'])).toBe(0);
      expect(debt.stdout).toContain('开发者画像：developer-profile-v1');
      debt.restore();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
