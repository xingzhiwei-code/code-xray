import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { LocalStore } from '../packages/storage-local/index.js';

const WORK = 'fixtures/java-spring-jpa';

function tempStore(prefix: string): { store: LocalStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), `xray-store-${prefix}-`));
  return { store: new LocalStore({ dataDir: dir }), dir };
}

describe('T010: storage error envelopes (Checker finding #4)', () => {
  it('refuses to silently reset corrupt data and keeps the original file', async () => {
    const { store, dir } = tempStore('corrupt');
    try {
      await store.saveReport(WORK, 'r1', { hello: 'world' });
      const reportFile = join(dir, 'workspaces', await store.workspaceId(WORK), 'reports');
      // Corrupt the report index; every later operation must refuse, never reset.
      writeFileSync(join(reportFile, 'latest.json'), '{ this is not json');
      await expect(store.loadReport(WORK)).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
      // A new save must NOT silently overwrite the corrupt file.
      await expect(store.saveReport(WORK, 'r2', { hello: 'again' })).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
      expect(readFileSync(join(reportFile, 'latest.json'), 'utf8')).toBe('{ this is not json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects foreign storage versions instead of resetting', async () => {
    const { store, dir } = tempStore('version');
    try {
      await store.updateState(WORK, { tags: [] }, () => ({ tags: ['a'] }));
      const stateFile = join(dir, 'workspaces', await store.workspaceId(WORK), 'learning.json');
      writeFileSync(stateFile, JSON.stringify({ storageVersion: 99, payload: { tags: ['x'] } }) + '\n');
      await expect(store.readState(WORK, { tags: [] })).rejects.toMatchObject({ code: 'STORAGE_VERSION' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('times out with STORAGE_LOCKED when another process holds the write lock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xray-store-lock-'));
    try {
      const holder = new LocalStore({ dataDir: dir, lockTimeoutMs: 5_000 });
      const challenger = new LocalStore({ dataDir: dir, lockTimeoutMs: 300 });
      // Hold the lock from a SEPARATE process so the in-test store truly contends.
      mkdirSync(join(dir, 'workspaces', await holder.workspaceId(WORK)), { recursive: true });
      const lockDir = join(dir, 'workspaces', await holder.workspaceId(WORK), '.write-lock');
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid }) + '\n');
      const start = Date.now();
      await expect(challenger.saveReport(WORK, 'r1', { a: 1 })).rejects.toMatchObject({ code: 'STORAGE_LOCKED' });
      expect(Date.now() - start).toBeGreaterThanOrEqual(250);
      expect(Date.now() - start).toBeLessThan(5_000);
      // The lock message explains recovery without resetting data.
      try { await challenger.saveReport(WORK, 'r1', { a: 1 }); } catch (error) {
        expect((error as Error).message).toContain('.write-lock');
        expect((error as Error).message).toContain('未重置');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('saves and reloads reports and state across store instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xray-store-round-'));
    try {
      const first = new LocalStore({ dataDir: dir });
      // English credential keyword per the documented redaction pattern;
      // non-English keywords are a known limitation (see docs/SUPPORT.md).
      await first.saveReport(WORK, 'report-1', { findings: 3, note: 'password = "supersecret-12345"' });
      await first.updateState(WORK, { items: [] }, () => ({ items: ['kept'] }));
      const second = new LocalStore({ dataDir: dir });
      const report = await second.loadReport<{ findings: number }>(WORK);
      expect(report?.findings).toBe(3);
      const state = await second.readState<{ items: string[] }>(WORK, { items: [] });
      expect(state.items).toEqual(['kept']);
      // redactReport strips credential-shaped strings before they hit disk.
      const onDisk = execFileSync('find', [dir, '-type', 'f']).toString().trim().split('\n');
      expect(onDisk.length).toBeGreaterThan(0);
      for (const file of onDisk) expect(readFileSync(file, 'utf8')).not.toContain('supersecret');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deleteData removes the requested kind without touching others', async () => {
    const { store, dir } = tempStore('delete');
    try {
      await store.saveReport(WORK, 'report-1', { a: 1 });
      await store.updateState(WORK, { x: 0 }, () => ({ x: 1 }));
      await store.deleteData(WORK, 'reports');
      expect(await store.loadReport(WORK)).toBeUndefined();
      const state = await store.readState<{ x: number }>(WORK, { x: 0 });
      expect(state.x).toBe(1); // learning state survives a reports-only delete
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
