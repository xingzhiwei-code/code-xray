import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { createCli, defineCommand, type CommandDef } from '@cliffx/core';
import { createTestApp } from '@cliffx/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from '../apps/cli/cliff-adapter.js';

afterEach(() => vi.restoreAllMocks());

// Tests share process-global spies (exit/stderr) and createTestApp swaps
// process globals; vitest runs tests within a file sequentially by default,
// which is exactly the serialization this suite requires.
describe('real cliff adapter and pinned embedding patch', () => {
  it('routes explicit commands and preserves argument boundaries for the CLI parser', async () => {
    const scan = vi.fn(async (_args: string[]) => {});
    const doctor = vi.fn(async (_args: string[]) => {});
    const args = ['scan', '--path', '中文项目 with spaces', '--', '--help', '--unknown'];
    await dispatch([
      { name: 'scan', description: '扫描', run: scan },
      { name: 'doctor', description: '诊断', run: doctor },
    ], args);
    expect(scan).toHaveBeenCalledExactlyOnceWith(args.slice(1));
    expect(doctor).not.toHaveBeenCalled();
    await dispatch([{ name: 'doctor', description: '诊断', run: doctor }], ['doctor']);
    expect(doctor).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('returns command failures and cancellation to the owner without process.exit or stderr', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('unexpected process.exit'); });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const failure = new Error('typed engine failure');
    let cleanedUp = false;
    await expect(dispatch([{
      name: 'scan', description: '扫描', async run() {
        try { throw failure; } finally { cleanedUp = true; }
      },
    }], ['scan'])).rejects.toBe(failure);
    const abort = new DOMException('Analysis cancelled', 'AbortError');
    await expect(dispatch([{
      name: 'scan', description: '扫描', async run() { throw abort; },
    }], ['scan'])).rejects.toBe(abort);
    expect(cleanedUp).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('rejects invalid dispatch without cliff terminating the host', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('unexpected process.exit'); });
    const scan = { name: 'scan', description: '扫描', run: vi.fn(async () => {}) };
    await expect(dispatch([scan], ['scna'])).rejects.toThrow('Unknown command: scna');
    await expect(dispatch([scan], [])).rejects.toThrow('Unknown command');
    await expect(dispatch([scan, scan], ['scan'])).rejects.toThrow('duplicate');
    const cli = createCli({ name: 'xray', loadConfig: false, checkUpdates: false, errorMode: 'throw' });
    await expect(cli.run(['nonexistent'])).rejects.toThrow('Unknown command');
    expect(exit).not.toHaveBeenCalled();
    expect(scan.run).not.toHaveBeenCalled();
  });

  it('never executes repository commands/plugins or inherits parent config/env', async () => {
    const originalCwd = process.cwd();
    const originalEnv = process.env.XRAY_OFFLINE;
    const root = mkdtempSync(join(tmpdir(), 'xray-cliff-'));
    const target = join(root, '中文 项目');
    const marker = join(root, 'executed.txt');
    mkdirSync(join(target, 'commands'), { recursive: true });
    mkdirSync(join(target, 'plugins'), { recursive: true });
    const maliciousModule = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); export default {};`;
    writeFileSync(join(target, 'commands', 'scan.js'), maliciousModule);
    writeFileSync(join(target, 'plugins', 'plugin.js'), maliciousModule);
    writeFileSync(join(target, 'xray.config.js'), maliciousModule);
    writeFileSync(join(root, '.xray.json'), JSON.stringify({ offline: false, provider: 'remote', path: '/' }));
    process.env.XRAY_OFFLINE = 'false';
    try {
      process.chdir(target);
      await dispatch([{ name: 'scan', description: '扫描', run: async () => {} }], ['scan']);
      const cli = createCli({ name: 'xray', loadConfig: false, checkUpdates: false, errorMode: 'throw' });
      const run = vi.fn();
      // Upstream register() is not generic; the typed def needs an explicit cast.
      cli.register(defineCommand({
        name: 'scan', options: { offline: { type: 'boolean', default: true } }, run,
      }).def as CommandDef);
      await cli.run(['scan']);
      expect(run.mock.calls[0][0].options).toEqual({ offline: true });
      expect(run.mock.calls[0][0].config).toEqual({});
      expect(existsSync(marker)).toBe(false);
    } finally {
      process.chdir(originalCwd);
      if (originalEnv === undefined) delete process.env.XRAY_OFFLINE;
      else process.env.XRAY_OFFLINE = originalEnv;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('makes zero network attempts for dispatch and version/help in the real test harness', async () => {
    const deny = () => { throw new Error('network forbidden in offline test'); };
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(deny);
    const httpRequest = vi.spyOn(http, 'request').mockImplementation(deny);
    const httpsRequest = vi.spyOn(https, 'request').mockImplementation(deny);
    const connect = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(deny);
    await dispatch([{ name: 'scan', description: '扫描', run: async () => {} }], ['scan']);
    const app = createTestApp({
      cliOptions: { name: 'xray', version: '0.1.0', loadConfig: false, checkUpdates: false, errorMode: 'throw' },
      commands: [{ name: 'scan', description: '扫描', run: ({ ui }) => { ui.stdout('{"ok":true}'); } }],
    });
    expect(await app.run(['scan'])).toEqual({ stdout: '{"ok":true}\n', stderr: '', exitCode: 0 });
    expect((await app.run(['--version'])).stderr).toBe('0.1.0\n');
    expect((await app.run(['--help'])).stderr).toContain('scan');
    expect(fetch).not.toHaveBeenCalled();
    expect(httpRequest).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
