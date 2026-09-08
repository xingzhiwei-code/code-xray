import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, chmodSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotWorkspace, snapshotBaseline, stalePaths } from '../packages/workspace-local/index.js';
import { XrayError } from '../packages/protocol/index.js';

// T004 verification matrix: boundaries, privacy and change semantics of the
// workspace layer. Git operations here are test-setup only; the product code
// itself never commits or writes into the analyzed project.
function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=test@xray.local', '-c', 'user.name=xray-test', ...args], { cwd, stdio: 'pipe' });
}

const tempRoots: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `xray-ws-${prefix}-`));
  tempRoots.push(dir);
  return dir;
}
afterEach(() => { while (tempRoots.length) { try { rmSync(tempRoots.pop()!, { recursive: true, force: true }); } catch { /* already gone */ } } });

const JAVA = (name: string, body = '') => `public class ${name} { void run() {} ${body} }\n`;

describe('snapshotWorkspace: directory scan without Git', () => {
  it('scans a plain non-Git directory (Git unavailable only limits diff)', async () => {
    const root = tempDir('plain');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'A.java'), JAVA('A'));
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.files.map(f => f.path)).toEqual(['src/A.java']);
    expect(snapshot.gitRoot).toBeNull();
    expect(snapshot.snapshot.gitHead).toBeNull();
    expect(snapshot.snapshot.gitBase).toBeNull();
  });

  it('rejects missing or non-directory paths with a typed error', async () => {
    await expect(snapshotWorkspace({ path: join(tempDir('miss'), 'nope') })).rejects.toMatchObject({ code: 'INVALID_PATH', exitCode: 2 });
  });
});

describe('snapshotWorkspace: file boundaries', () => {
  it('skips binary files (NUL bytes) with a visible reason', async () => {
    const root = tempDir('binary');
    writeFileSync(join(root, 'A.java'), Buffer.concat([Buffer.from('public class A { /* '), Buffer.from([0, 0]), Buffer.from(' */ }\n')]));
    writeFileSync(join(root, 'B.java'), JAVA('B'));
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.files.map(f => f.path)).toEqual(['B.java']);
    expect(snapshot.reasons.some(r => r.code === 'BINARY_FILE' && r.path === 'A.java')).toBe(true);
  });

  it('skips non-UTF-8 encodings with a visible reason', async () => {
    const root = tempDir('encoding');
    writeFileSync(join(root, 'A.java'), Buffer.from('public class A { /* \xff\xfe */ }\n', 'latin1'));
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.files).toHaveLength(0);
    expect(snapshot.reasons.some(r => r.code === 'ENCODING' && r.path === 'A.java')).toBe(true);
  });

  it('enforces the single-file size limit', async () => {
    const root = tempDir('size');
    writeFileSync(join(root, 'A.java'), JAVA('A').padEnd(2048, '// padding\n'));
    const snapshot = await snapshotWorkspace({ path: root, maxFileBytes: 64 });
    expect(snapshot.files).toHaveLength(0);
    expect(snapshot.reasons.some(r => r.code === 'FILE_LIMIT')).toBe(true);
    await expect(snapshotWorkspace({ path: root, maxFileBytes: 0 })).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    await expect(snapshotWorkspace({ path: root, maxFiles: 10001 })).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
  });

  it('enforces the file-count limit and keeps the reason visible', async () => {
    const root = tempDir('count');
    for (let i = 0; i < 5; i++) writeFileSync(join(root, `F${i}.java`), JAVA(`F${i}`));
    const snapshot = await snapshotWorkspace({ path: root, maxFiles: 2 });
    expect(snapshot.files).toHaveLength(2);
    expect(snapshot.reasons.some(r => r.code === 'FILE_LIMIT')).toBe(true);
  });

  it('never follows symlinks — files or directories — even outside the tree', async () => {
    const root = tempDir('link');
    const outside = tempDir('outside');
    writeFileSync(join(outside, 'Secret.java'), JAVA('Secret'));
    mkdirSync(join(root, 'pkg'), { recursive: true });
    writeFileSync(join(root, 'pkg', 'Real.java'), JAVA('Real'));
    symlinkSync(join(outside, 'Secret.java'), join(root, 'Linked.java'));
    symlinkSync(outside, join(root, 'LinkedDir'));
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.files.map(f => f.path)).toEqual(['pkg/Real.java']);
    expect(snapshot.reasons.some(r => r.code === 'SYMLINK_SKIPPED' && r.path === 'Linked.java')).toBe(true);
    expect(snapshot.reasons.some(r => r.code === 'SYMLINK_SKIPPED' && r.path === 'LinkedDir')).toBe(true);
  });
});

describe('snapshotWorkspace: privacy filters', () => {
  it('excludes sensitive paths by name regardless of content', async () => {
    const root = tempDir('secretname');
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    writeFileSync(join(root, '.env'), 'PASSWORD=x\n');
    writeFileSync(join(root, 'service.credentials.yaml'), 'x');
    writeFileSync(join(root, 'server.pem'), 'x');
    writeFileSync(join(root, 'Secrets.java'), JAVA('Secrets'));
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.files.map(f => f.path)).toEqual(['A.java']);
    expect(snapshot.reasons.some(r => r.code === 'SENSITIVE_PATH' && r.path === 'Secrets.java')).toBe(true);
  });

  it('excludes .java files that contain credential-like content, without leaking the content', async () => {
    const root = tempDir('secretcontent');
    writeFileSync(join(root, 'Config.java'), 'public class Config {\n  // sk-abcdefghijklmnopqrstuvwx\n  private String key = "password = supersecretvalue";\n}\n');
    writeFileSync(join(root, 'Clean.java'), JAVA('Clean'));
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.files.map(f => f.path)).toEqual(['Clean.java']);
    const reason = snapshot.reasons.find(r => r.code === 'SECRET_FILTER');
    expect(reason?.path).toBe('Config.java');
    expect(reason?.message).not.toContain('supersecretvalue');
    expect(reason?.message).not.toContain('sk-');
  });

  it('honors exclude globs and .gitignore rules for java files', async () => {
    const root = tempDir('ignore');
    mkdirSync(join(root, 'gen'), { recursive: true });
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    writeFileSync(join(root, 'gen', 'B.java'), JAVA('B'));
    writeFileSync(join(root, '.gitignore'), 'gen/\n');
    const ignored = await snapshotWorkspace({ path: root });
    expect(ignored.files.map(f => f.path)).toEqual(['A.java']);
    const excluded = await snapshotWorkspace({ path: root, exclude: ['A.java'] });
    expect(excluded.files).toHaveLength(0);
    expect(excluded.reasons.some(r => r.code === 'EXCLUDED' && r.path === 'A.java')).toBe(true);
  });
});

describe('snapshotWorkspace: Git tracking policy', () => {
  it('includes untracked files by default and excludes them on request', async () => {
    const root = tempDir('untracked');
    git(root, 'init', '-q');
    writeFileSync(join(root, 'Tracked.java'), JAVA('Tracked'));
    git(root, 'add', 'Tracked.java');
    git(root, 'commit', '-q', '-m', 'base');
    writeFileSync(join(root, 'Fresh.java'), JAVA('Fresh'));
    const byDefault = await snapshotWorkspace({ path: root });
    expect(byDefault.files.map(f => f.path).sort()).toEqual(['Fresh.java', 'Tracked.java']);
    const trackedOnly = await snapshotWorkspace({ path: root, includeUntracked: false });
    expect(trackedOnly.files.map(f => f.path)).toEqual(['Tracked.java']);
    expect(trackedOnly.reasons.some(r => r.code === 'UNTRACKED' && r.path === 'Fresh.java')).toBe(true);
  });

  it('records gitHead and never modifies the analyzed project', async () => {
    const root = tempDir('readonly');
    git(root, 'init', '-q');
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    git(root, 'add', 'A.java');
    git(root, 'commit', '-q', '-m', 'base');
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    const snapshot = await snapshotWorkspace({ path: root });
    expect(snapshot.snapshot.gitHead).toMatch(/^[0-9a-f]{40}$/);
    const after = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    expect(after).toBe(before);
  });
});

describe('snapshotBaseline: explicit diff base', () => {
  it('fails with NOT_GIT outside a repository while scan keeps working', async () => {
    const root = tempDir('notgit');
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    const current = await snapshotWorkspace({ path: root });
    await expect(snapshotBaseline(current, 'HEAD')).rejects.toMatchObject({ code: 'NOT_GIT', exitCode: 2 });
  });

  it('rejects malformed base refs without invoking anything risky', async () => {
    const root = tempDir('badbase');
    git(root, 'init', '-q');
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    git(root, 'add', 'A.java');
    git(root, 'commit', '-q', '-m', 'base');
    const current = await snapshotWorkspace({ path: root });
    await expect(snapshotBaseline(current, '-x-inject')).rejects.toMatchObject({ code: 'INVALID_BASE', exitCode: 2 });
    await expect(snapshotBaseline(current, 'definitely-not-a-ref')).rejects.toMatchObject({ code: 'GIT_ERROR', exitCode: 2 });
  });

  it('reads baseline blobs, applies privacy filters, and records the resolved SHA', async () => {
    const root = tempDir('baseline');
    git(root, 'init', '-q');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'A.java'), JAVA('A'));
    writeFileSync(join(root, 'src', 'Leaky.java'), 'public class Leaky { private String password = "leaked-secret-value-123"; }\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'base');
    writeFileSync(join(root, 'src', 'A.java'), JAVA('A', 'int changed = 1;'));
    const current = await snapshotWorkspace({ path: root });
    const baseline = await snapshotBaseline(current, 'HEAD');
    expect(baseline.snapshot.gitBase).toMatch(/^[0-9a-f]{40}$/);
    expect(baseline.files.map(f => f.path)).toEqual(['src/A.java']);
    expect(baseline.reasons.some(r => r.code === 'BASE_EXCLUDED' && r.path === 'src/Leaky.java')).toBe(true);
    expect(baseline.files.some(f => f.path === 'src/Leaky.java')).toBe(false);
    expect(current.files.map(f => f.path)).toEqual(['src/A.java']);
  });
});

describe('stalePaths: evidence staleness', () => {
  it('flags files whose digest no longer matches the recorded snapshot', async () => {
    const root = tempDir('stale');
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    const snapshot = await snapshotWorkspace({ path: root });
    writeFileSync(join(root, 'A.java'), JAVA('A', 'int edited = 1;'));
    utimesSync(join(root, 'A.java'), new Date(), new Date());
    expect(await stalePaths(root, snapshot.snapshot)).toEqual(['A.java']);
    const unchanged = await snapshotWorkspace({ path: root });
    expect(await stalePaths(root, unchanged.snapshot)).toEqual([]);
  });

  it('flags deleted files as stale', async () => {
    const root = tempDir('gone');
    writeFileSync(join(root, 'A.java'), JAVA('A'));
    const snapshot = await snapshotWorkspace({ path: root });
    rmSync(join(root, 'A.java'));
    expect(await stalePaths(root, snapshot.snapshot)).toEqual(['A.java']);
  });
});

describe('snapshotWorkspace: unreadable entries degrade to reasons', () => {
  it('reports unreadable directories instead of failing the scan', async () => {
    const root = tempDir('unreadable');
    mkdirSync(join(root, 'locked'), { recursive: true });
    writeFileSync(join(root, 'locked', 'A.java'), JAVA('A'));
    writeFileSync(join(root, 'B.java'), JAVA('B'));
    chmodSync(join(root, 'locked'), 0o000);
    try {
      const snapshot = await snapshotWorkspace({ path: root });
      expect(snapshot.files.map(f => f.path)).toEqual(['B.java']);
      expect(snapshot.reasons.some(r => r.code === 'UNREADABLE')).toBe(true);
    } finally {
      chmodSync(join(root, 'locked'), 0o755);
    }
  });
});
