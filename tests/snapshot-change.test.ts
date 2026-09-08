import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotWorkspace } from '../packages/workspace-local/index.js';

/**
 * T010 leftover: the SNAPSHOT_CHANGED race cannot be triggered by luck, but
 * the DETECTION path can be exercised deterministically — patch the file
 * handle's prototype method so the target file mutates mid-read, between the
 * scanner's before-stat and after-stat. The scanner must refuse with a typed
 * error and never build a half-old half-new snapshot.
 */
type ReadFileFn = (...args: unknown[]) => Promise<Buffer>;
const fault = { enabled: false, path: '' };
let originalReadFile: ReadFileFn | undefined;

async function armFault(path: string): Promise<void> {
  fault.enabled = true;
  fault.path = path;
  // Grab the real prototype from a live handle (FileHandle is type-only in
  // @types/node, but its runtime class is reachable from any instance).
  const probe = await open(path, 'r');
  const proto = Object.getPrototypeOf(probe) as { readFile: ReadFileFn };
  await probe.close();
  originalReadFile ??= proto.readFile;
  vi.spyOn(proto, 'readFile').mockImplementation((async function (this: FileHandle, ...args: unknown[]) {
    const bytes = await originalReadFile!.apply(this, args);
    if (fault.enabled && bytes.includes(Buffer.from('void original()'))) {
      // The file changes while the scanner holds it open, mid-measurement.
      writeFileSync(fault.path, 'public class A { void mutatedByFault() {} }\n');
    }
    return bytes;
  }) as unknown as ReadFileFn);
}

afterEach(() => {
  fault.enabled = false;
  vi.restoreAllMocks();
});

describe('T010 leftover: snapshot-change detection under an injected mid-read fault', () => {
  it('is inert when no fault is armed (baseline scan unaffected)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-stable-'));
    try {
      writeFileSync(join(root, 'A.java'), 'public class A { void original() {} }\n');
      const snapshot = await snapshotWorkspace({ path: root });
      expect(snapshot.files).toHaveLength(1);
      expect(snapshot.files[0]!.content).toContain('original');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a file that mutates mid-read: typed reason, no mixed snapshot, scan continues', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-midread-'));
    const target = join(root, 'A.java');
    try {
      writeFileSync(target, 'public class A { void original() {} }\n');
      writeFileSync(join(root, 'B.java'), 'public class B { void run() {} }\n');
      await armFault(target);
      // The per-file contract: a mid-read change degrades to a visible
      // coverage reason — the scan keeps going, the mutated file is excluded,
      // and its half-read content never enters the snapshot.
      const snapshot = await snapshotWorkspace({ path: root });
      fault.enabled = false;
      expect(snapshot.files.map(f => f.path)).toEqual(['B.java']);
      const reason = snapshot.reasons.find(r => r.path === 'A.java');
      expect(reason?.code).toBe('SNAPSHOT_CHANGED');
      expect(reason?.message).toContain('重新扫描');
      // The fault provably fired; the on-disk file keeps its new content.
      expect(readFileSync(target, 'utf8')).toContain('mutatedByFault');
      // The excluded file's content never leaked into the snapshot.
      expect(snapshot.files.some(f => f.content.includes('original') || f.content.includes('mutatedByFault'))).toBe(false);
    } finally {
      fault.enabled = false;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
