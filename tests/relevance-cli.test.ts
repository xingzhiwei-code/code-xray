/**
 * T303 CLI surface: `xray relevance` (human explain/debug view, §16) and the
 * extended `xray profile` (correct/prefer, §15.4/§31.5). Normal coding flow
 * stays interaction-free — every command here is explicit and non-blocking.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../apps/cli/index.js';

const ORIGINAL_DATA_DIR = process.env.XRAY_DATA_DIR;

function captureStd(): { readonly stdout: string; readonly stderr: string; restore: () => void } {
  const live = { stdout: '', stderr: '' };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { live.stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => { live.stderr += String(chunk); return true; });
  return { get stdout() { return live.stdout; }, get stderr() { return live.stderr; }, restore: () => { out.mockRestore(); err.mockRestore(); } };
}

let dataDir: string;

function freshDataDir(): void {
  dataDir = mkdtempSync(join(tmpdir(), 'xray-relevance-cli-'));
  process.env.XRAY_DATA_DIR = dataDir;
}

afterEach(() => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.XRAY_DATA_DIR;
  else process.env.XRAY_DATA_DIR = ORIGINAL_DATA_DIR;
  vi.restoreAllMocks();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('xray relevance (CLI)', () => {
  it('renders a quiet SKIP decision with reasons and honest limitation', async () => {
    freshDataDir();
    const std = captureStd();
    try {
      expect(await main(['relevance', '--task', '给 React Button 增加 loading 状态', '--files', 'src/Button.tsx,src/Button.css'])).toBe(0);
      expect(std.stdout).toContain('Relevance Gate');
      expect(std.stdout).toContain('SKIP');
      expect(std.stdout).toContain('routine-class');
      expect(std.stdout).toContain('skip ≠ 代码正确');
      // Human view may explain — but never echoes raw task text back.
      expect(std.stdout).not.toContain('给 React Button 增加 loading 状态');
    } finally { std.restore(); }
  });

  it('renders LIGHT with path targets usable as scan scope', async () => {
    freshDataDir();
    const std = captureStd();
    try {
      expect(await main(['relevance', '--task', '给 React 页面增加权限控制', '--files', 'src/pages/Dashboard.tsx'])).toBe(0);
      expect(std.stdout).toContain('LIGHT');
      expect(std.stdout).toContain('authorization boundary');
      expect(std.stdout).toContain('[path] src/pages/Dashboard.tsx');
    } finally { std.restore(); }
  });

  it('--explain dumps deterministic signals for debugging (§16 "Why was this skipped?")', async () => {
    freshDataDir();
    const std = captureStd();
    try {
      expect(await main(['relevance', '--task', '修改订单支付状态流转', '--files', 'Pay.java', '--explain'])).toBe(0);
      expect(std.stdout).toContain('FULL');
      expect(std.stdout).toContain('criticalHits');
      expect(std.stdout).toContain('payment/支付');
    } finally { std.restore(); }
  });

  it('--stats reports skip rate / false-skip metrics after decisions', async () => {
    freshDataDir();
    await main(['relevance', '--files', 'a.css']);
    await main(['relevance', '--task', '修改支付', '--files', 'Pay.java']);
    const std = captureStd();
    try {
      expect(await main(['relevance', '--stats'])).toBe(0);
      expect(std.stdout).toContain('Relevance 指标');
      expect(std.stdout).toContain('Skip 率');
      expect(std.stdout).toContain('False-skip 事实信号');
    } finally { std.restore(); }
  });

  it('rejects unknown flags with usage-level errors', async () => {
    freshDataDir();
    const std = captureStd();
    try {
      expect(await main(['relevance', 'positional'])).toBe(2);
      expect(std.stderr).toContain('未知参数');
    } finally { std.restore(); }
  });
});

describe('xray profile correct / prefer (CLI)', () => {
  it('records an explicit correction, keeps history and surfaces it in show (§15.4, Case E)', async () => {
    freshDataDir();
    await main(['profile', 'init', '--dimension', 'framework', '--key', 'Spring', '--label', 'Spring', '--level', 'expert', '--evidence', '我是 Spring 专家']);
    const std = captureStd();
    try {
      expect(await main(['profile', 'correct', '--key', 'spring', '--unfamiliar', '--note', '其实我不熟 Spring Transaction'])).toBe(0);
      expect(std.stdout).toContain('已记录修正证据');
      expect(std.stdout).toContain('历史证据全部保留');
    } finally { std.restore(); }
    const show = captureStd();
    try {
      expect(await main(['profile', 'show'])).toBe(0);
      expect(show.stdout).toContain('provenance self-reported');
      expect(show.stdout).toContain('近期修正：自述不熟悉');
      // Original claim evidence survives in the same context.
      expect(show.stdout).toContain('framework:spring');
    } finally { show.restore(); }
  });

  it('correction requires a direction and an existing (or dimensioned) skill', async () => {
    freshDataDir();
    const std = captureStd();
    try {
      expect(await main(['profile', 'correct', '--key', 'spring'])).toBe(2);
      expect(std.stderr).toContain('--unfamiliar');
      expect(await main(['profile', 'correct', '--key', 'spring', '--unfamiliar'])).toBe(2);
      expect(std.stderr).toContain('--dimension');
    } finally { std.restore(); }
  });

  it('records reserved preference controls (§31.5)', async () => {
    freshDataDir();
    const std = captureStd();
    try {
      expect(await main(['profile', 'prefer', '--scope', 'frontend/*', '--skip'])).toBe(0);
      expect(std.stdout).toContain('frontend/* → 默认跳过深度分析');
      expect(std.stdout).toContain('非永久白名单');
      expect(await main(['profile', 'prefer', '--scope', 'payments/*', '--always'])).toBe(0);
    } finally { std.restore(); }
    const show = captureStd();
    try {
      await main(['profile', 'show']);
      expect(show.stdout).toContain('偏好（用户控制）');
      expect(show.stdout).toContain('payments/* → 总是分析');
    } finally { show.restore(); }
  });

  it('relevance honors preferences end-to-end: skip-deep-analysis downgrades, always-analyze vetoes', async () => {
    freshDataDir();
    await main(['profile', 'prefer', '--scope', 'frontend/*', '--skip']);
    const downgraded = captureStd();
    try {
      await main(['relevance', '--task', '重构购物车逻辑', '--files', 'frontend/src/cart.ts']);
      expect(downgraded.stdout).toContain('SKIP');
      expect(downgraded.stdout).toContain('preference');
    } finally { downgraded.restore(); }
    await main(['profile', 'prefer', '--scope', 'frontend/*', '--always']);
    const vetoed = captureStd();
    try {
      await main(['relevance', '--task', '调整按钮样式', '--files', 'frontend/src/Button.css']);
      expect(vetoed.stdout).not.toContain('决策：SKIP');
      expect(vetoed.stdout).toContain('always-analyze');
    } finally { vetoed.restore(); }
  });
});
