import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
const ORIGINAL_COLUMNS = process.env.COLUMNS;
const ORIGINAL_NOCOLOR = process.env.NO_COLOR;

afterEach(() => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.XRAY_DATA_DIR;
  else process.env.XRAY_DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_COLUMNS === undefined) delete process.env.COLUMNS;
  else process.env.COLUMNS = ORIGINAL_COLUMNS;
  if (ORIGINAL_NOCOLOR === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = ORIGINAL_NOCOLOR;
  vi.restoreAllMocks();
});

// East-Asian display width of a string, for asserting terminal bounds.
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xff60) ? 2 : 1;
  }
  return width;
}

describe('T007: terminal presentation contract', () => {
  it('wraps long CJK lines within 60 columns without ANSI escapes', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-tty-'));
    process.env.XRAY_DATA_DIR = dataDir;
    process.env.COLUMNS = '60';
    process.env.NO_COLOR = '1';
    const std = captureStd();
    try {
      const exit = await main(['scan', 'fixtures/java-spring-jpa']);
      expect(exit).toBe(0);
      expect(std.stdout).not.toMatch(/\[/);
      const longest = Math.max(...std.stdout.split('\n').filter(Boolean).map(displayWidth));
      expect(longest).toBeLessThanOrEqual(60);
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('uses the full width at 120 columns and stays wrapped at 80', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-tty-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      process.env.COLUMNS = '80';
      await main(['scan', 'fixtures/java-spring-jpa']);
      const longest80 = Math.max(...std.stdout.split('\n').filter(Boolean).map(displayWidth));
      expect(longest80).toBeLessThanOrEqual(80);
      std.restore();
      const std2 = captureStd();
      process.env.COLUMNS = '120';
      await main(['scan', 'fixtures/java-spring-jpa']);
      expect(Math.max(...std2.stdout.split('\n').filter(Boolean).map(displayWidth))).toBeLessThanOrEqual(120);
      std2.restore();
    } finally {
      delete process.env.COLUMNS;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('gives actionable copy for a directory with no Java sources', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-tty-'));
    const empty = mkdtempSync(join(tmpdir(), 'xray-empty-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      const exit = await main(['scan', empty]);
      expect(exit).toBe(0);
      expect(std.stdout).toContain('未发现 Java 源文件');
      expect(std.stdout).toContain('--exclude');
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('T007: explain shares facts with the saved report', () => {
  it('lists findings and expands one with evidence, assumptions and unknowns', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-explain-'));
    process.env.XRAY_DATA_DIR = dataDir;
    // explain reads the report saved for the CURRENT directory; scan the repo root.
    const scanStd = captureStd();
    await main(['scan', '.']);
    scanStd.restore();
    const std = captureStd();
    try {
      await main(['explain']);
      expect(std.stdout).toContain('项发现');
      expect(std.stdout).toContain('xray explain <编号>');
      std.restore();
      const detail = captureStd();
      await main(['explain', '1']);
      expect(detail.stdout).toContain('证据（可回源到快照）');
      expect(detail.stdout).toContain('成立前提');
      expect(detail.stdout).toContain('未知/未解析');
      expect(detail.stdout).toContain('下一步检查');
      detail.restore();
      const bad = captureStd();
      expect(await main(['explain', '99'])).toBe(2);
      expect(bad.stderr).toContain('1—');
      bad.restore();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('tells the user to scan first when no report exists', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-noreport-'));
    const fresh = mkdtempSync(join(tmpdir(), 'xray-fresh-'));
    process.env.XRAY_DATA_DIR = dataDir;
    const std = captureStd();
    try {
      // Chdir so the workspace id differs from any saved report.
      const originalCwd = process.cwd();
      process.chdir(fresh);
      try {
        const exit = await main(['explain']);
        expect(exit).toBe(0);
        expect(std.stdout).toContain('没有已保存的报告');
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      std.restore();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe('T008: learn and debt through the real CLI', () => {
  it('runs the full learning loop: scan → learn list → card → verify → debt', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-learn-cli-'));
    process.env.XRAY_DATA_DIR = dataDir;
    try {
      const scanStd = captureStd();
      expect(await main(['scan', '.'])).toBe(0);
      expect(scanStd.stdout).toContain('知识缺口');
      scanStd.restore();

      const list = captureStd();
      expect(await main(['learn'])).toBe(0);
      expect(list.stdout).toContain('学习绑定');
      expect(list.stdout).toContain('jpa.query-amplification');
      list.restore();

      const card = captureStd();
      expect(await main(['learn', '1'])).toBe(0);
      expect(card.stdout).toContain('是什么：');
      expect(card.stdout).toContain('验证问题');
      card.restore();

      // Wrong answer recorded without advancing; the rationale is shown.
      const { LocalStore } = await import('../packages/storage-local/index.js');
      const learning = await import('../packages/learning/engine.js');
      const state = await new LocalStore({ dataDir }).readState('.', learning.emptyLearningState());
      const firstId = Object.values(state.bindings)[0]!.id;
      const question = learning.learningCard(state.bindings[firstId]).question;
      const wrongOption = question.options.find(option => option.id !== question.answerId)!.id;
      const wrong = captureStd();
      expect(await main(['learn', '1', 'answer', wrongOption])).toBe(0);
      expect(wrong.stdout).toContain('回答未通过');
      wrong.restore();

      // The correct answer (from the same deterministic card) verifies.
      const right = captureStd();
      expect(await main(['learn', '1', 'answer', question.answerId])).toBe(0);
      expect(right.stdout).toContain('已验证理解');
      right.restore();

      const debt = captureStd();
      expect(await main(['debt'])).toBe(0);
      expect(debt.stdout).toContain('认知债务');
      expect(debt.stdout).toContain('公式');
      expect(debt.stdout).toContain('不是能力评分');
      expect(debt.stdout).toContain('已验证理解');
      debt.restore();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('T007: keyboard cancellation', () => {
  it('a real SIGINT during a large scan cancels with exit code 130', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-sigint-'));
    const dataDir = mkdtempSync(join(tmpdir(), 'xray-sigint-data-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      // Enough files that the scan is still running when SIGINT arrives.
      const body = 'public class C%d { void m%d() { int x = %d; if (x > 0) { x = x + 1; } } void n%d() { m%d(); } }\n';
      for (let i = 0; i < 900; i++)
        writeFileSync(join(root, 'src', `C${i}.java`), body.replaceAll('%d', String(i)));
      const child = spawn(process.execPath, ['--import', 'tsx', 'apps/cli/index.ts', 'scan', root, '--no-save'], {
        env: { ...process.env, XRAY_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => resolve(code ?? -1));
        // Wait until parsing is provably underway (progress marker on stderr),
        // then cancel — no racing against tsx startup.
        const started = Date.now();
        const poll = () => {
          if (/已解析/.test(stderr)) { child.kill('SIGINT'); return; }
          if (Date.now() - started > 25_000) { child.kill('SIGKILL'); reject(new Error('scan never reported progress')); return; }
          setTimeout(poll, 50);
        };
        setTimeout(poll, 50);
      });
      expect(exitCode).toBe(130);
      expect(stderr).toContain('取消');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 40_000);
});
