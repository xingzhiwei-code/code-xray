import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../apps/cli/index.js';

function captureStd(): { readonly stdout: string; readonly stderr: string; restore: () => void } {
  const live = { stdout: '', stderr: '' };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { live.stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => { live.stderr += String(chunk); return true; });
  return {
    get stdout() { return live.stdout; },
    get stderr() { return live.stderr; },
    restore: () => { out.mockRestore(); err.mockRestore(); },
  };
}

const ORIGINAL_DATA_DIR = process.env.XRAY_DATA_DIR;

describe('real CLI end-to-end through cliff dispatch', () => {
  afterEach(() => {
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.XRAY_DATA_DIR;
    else process.env.XRAY_DATA_DIR = ORIGINAL_DATA_DIR;
    vi.restoreAllMocks();
  });

  it('scan --format json emits a pure protocol-valid JSON report on stdout', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-cli-data-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      const exit = await main(['scan', 'fixtures/java-spring-jpa', '--format', 'json']);
      expect(exit).toBe(0);
      expect(std.stderr).toBe('');
      const report = JSON.parse(std.stdout);
      expect(report.schemaVersion).toBe('0.1');
      expect(report.coverage.parsed).toBe(36);
      expect(report.findings).toHaveLength(27);
      expect(report.provenance.offline).toBe(true);
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('scan prints a bounded human summary without ANSI codes', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-cli-data-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      const exit = await main(['scan', 'fixtures/java-spring-jpa']);
      expect(exit).toBe(0);
      expect(std.stderr).toBe('');
      expect(std.stdout).not.toMatch(/\[/);
      expect(std.stdout).toContain('27 项发现');
      expect(std.stdout).toContain('demo/orders/OrderService.java');
      // Bounded default summary: exactly three numbered findings, no fourth.
      expect(std.stdout).toContain('  1. ');
      expect(std.stdout).toContain('  2. ');
      expect(std.stdout).toContain('  3. ');
      expect(std.stdout).not.toContain('  4. ');
      expect(std.stdout).toContain('--format json');
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('a bare xray run behaves like scan .', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-cli-data-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      const exit = await main([]);
      expect(exit).toBe(0);
      // From the repo root the walk finds the fixture sources (36 files).
      expect(std.stdout).toContain('36 个文件完成解析');
      expect(std.stdout).toContain('27 项发现');
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('typed failures return contract exit codes with actionable stderr', async () => {
    const std = captureStd();
    try {
      expect(await main(['scan', '/definitely/not/a/dir'])).toBe(2);
      expect(std.stderr).toContain('项目目录');
      expect(await main(['scan', 'fixtures/java-spring-jpa', '--format', 'xml'])).toBe(2);
      expect(std.stderr).toContain('human 或 json');
      expect(await main(['scan', '--nonsense'])).toBe(2);
      expect(std.stderr).toContain('未知参数');
      expect(await main(['frobnicate'])).toBe(1);
      expect(std.stderr).toContain('Unknown command');
    } finally {
      std.restore();
    }
  });

  it('doctor reports the offline environment without network or prompts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-cli-data-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      const exit = await main(['doctor']);
      expect(exit).toBe(0);
      expect(std.stdout).toContain('Node ');
      expect(std.stdout).toContain('TX_SELF_INVOCATION');
      expect(std.stdout).toContain('零外发');
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
