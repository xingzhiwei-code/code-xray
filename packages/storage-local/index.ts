import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export class LocalStoreError extends Error {
  constructor(public readonly code: 'STORAGE_CORRUPT' | 'STORAGE_VERSION' | 'STORAGE_LOCKED' | 'STORAGE_BOUNDARY', message: string) {
    super(message); this.name = 'LocalStoreError';
  }
}
export type DataKind = 'reports' | 'learning' | 'cache' | 'llm-cache' | 'all';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** User-private, workspace-isolated storage. A failed write leaves the previous complete JSON intact. */
export class LocalStore {
  readonly dataDir: string;
  readonly lockTimeoutMs: number;
  private canonicalRoot: string | null = null;
  constructor(options: { dataDir?: string; lockTimeoutMs?: number } = {}) {
    const base = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
      : process.platform === 'win32' ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
        : (process.env.XDG_DATA_HOME && isAbsolute(process.env.XDG_DATA_HOME) ? process.env.XDG_DATA_HOME : join(homedir(), '.local', 'share'));
    this.dataDir = resolve(options.dataDir || join(base, 'code-xray'));
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5000;
  }
  async workspaceId(workspace: string): Promise<string> {
    const root = await realpath(workspace);
    if (!(await lstat(root)).isDirectory()) throw new LocalStoreError('STORAGE_BOUNDARY', '工作区必须是目录。');
    return digest(root);
  }
  /**
   * The configured dataDir is trusted input and its existing prefix may sit
   * behind OS-level symlinks (e.g. /var or /tmp on macOS). Resolve that prefix
   * once; everything INSIDE the resolved root is then required to be
   * symlink-free so store contents cannot be redirected.
   */
  private async root(): Promise<string> {
    if (this.canonicalRoot) return this.canonicalRoot;
    let existing = this.dataDir;
    while (true) {
      try { await lstat(existing); break; }
      catch (error) {
        if (!absent(error)) throw error;
        const parent = dirname(existing);
        if (parent === existing) { this.canonicalRoot = this.dataDir; return this.dataDir; }
        existing = parent;
      }
    }
    this.canonicalRoot = resolve(await realpath(existing), relative(existing, this.dataDir));
    return this.canonicalRoot;
  }
  private async ensureDir(path: string, root: string): Promise<void> {
    if (path.startsWith(root + '/')) {
      const parent = dirname(path);
      if (parent.length > root.length) await this.ensureDir(parent, root);
    }
    try { await mkdir(path, { mode: 0o700 }); }
    catch (creationError) { if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') throw creationError; }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new LocalStoreError('STORAGE_BOUNDARY', '数据目录边界无效。');
  }
  private async directory(workspace: string): Promise<string> {
    const root = await this.root();
    await this.ensureDir(root, root);
    const directory = join(root, 'workspaces', await this.workspaceId(workspace));
    await this.ensureDir(directory, root);
    const canonical = await realpath(directory);
    if (canonical !== directory) throw new LocalStoreError('STORAGE_BOUNDARY', '数据目录不能通过符号链接重定向。');
    return directory;
  }
  private async read<T>(path: string): Promise<T | undefined> {
    let handle;
    try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
      if (absent(error)) return undefined;
      if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new LocalStoreError('STORAGE_BOUNDARY', '不读取符号链接数据。');
      throw error;
    }
    try {
      if (!(await handle.stat()).isFile()) throw new LocalStoreError('STORAGE_BOUNDARY', '数据文件类型无效。');
      const text = await handle.readFile('utf8');
      let envelope: { storageVersion?: unknown; payload?: T };
      try { envelope = JSON.parse(text) as typeof envelope; }
      catch { throw new LocalStoreError('STORAGE_CORRUPT', '本地数据损坏，已保留原文件；请备份后修复或显式删除该类数据。'); }
      if (!envelope || typeof envelope !== 'object' || !('payload' in envelope)) throw new LocalStoreError('STORAGE_CORRUPT', '本地数据结构损坏，未重置。');
      if (envelope.storageVersion !== 1) throw new LocalStoreError('STORAGE_VERSION', '本地数据版本不兼容，未覆盖；请使用兼容版本或先迁移。');
      return envelope.payload;
    } finally { await handle.close(); }
  }
  private async atomicWrite(root: string, path: string, payload: unknown): Promise<void> {
    await this.ensureDir(dirname(path), root);
    await this.read(path); // Never silently overwrite corrupt/foreign-version data.
    const temp = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify({ storageVersion: 1, payload }) + '\n');
      await handle.sync();
    } finally { await handle.close(); }
    try {
      await rename(temp, path);
      const parent = await open(dirname(path), 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    } finally { await rm(temp, { force: true }); }
  }
  private async locked<T>(workspace: string, operation: (directory: string) => Promise<T>): Promise<T> {
    const directory = await this.directory(workspace);
    const root = dirname(directory); // workspaces/<id> 的父级即 store 根
    const lock = join(directory, '.write-lock');
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const info = await lstat(lock);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new LocalStoreError('STORAGE_BOUNDARY', '写入锁边界无效。');
        if (Date.now() >= deadline) throw new LocalStoreError('STORAGE_LOCKED', '另一个进程持有写锁；若此前进程已崩溃，请确认其退出后删除本工作区的 .write-lock 目录再重试。原数据未重置。');
        await new Promise(resolveWait => setTimeout(resolveWait, 15));
      }
    }
    try {
      await this.atomicWrite(directory, join(lock, 'owner.json'), { pid: process.pid });
      return await operation(directory);
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
  async saveReport(workspace: string, id: string, report: unknown): Promise<void> {
    if (!id || id === 'latest') throw new Error('报告 ID 不能为空或 latest。');
    await this.locked(workspace, async directory => {
      const reports = join(directory, 'reports');
      await this.ensureDir(reports, directory);
      await this.atomicWrite(directory, join(reports, `${digest(id)}.json`), redactReport(report));
      await this.atomicWrite(directory, join(reports, 'latest.json'), id);
    });
  }
  async loadReport<T = unknown>(workspace: string, id = 'latest'): Promise<T | undefined> {
    const directory = await this.directory(workspace);
    const reports = join(directory, 'reports');
    await this.ensureDir(reports, directory);
    const selected = id === 'latest' ? await this.read<unknown>(join(reports, 'latest.json')) : id;
    if (selected === undefined) return undefined;
    if (typeof selected !== 'string') throw new LocalStoreError('STORAGE_CORRUPT', '报告索引损坏，未重置。');
    return this.read<T>(join(reports, `${digest(selected)}.json`));
  }
  async readState<T>(workspace: string, initial: T): Promise<T> {
    return (await this.read<T>(join(await this.directory(workspace), 'learning.json'))) ?? clone(initial);
  }
  async updateState<T>(workspace: string, initial: T, update: (state: T) => T | Promise<T>): Promise<T> {
    return this.locked(workspace, async directory => {
      const path = join(directory, 'learning.json');
      const state = (await this.read<T>(path)) ?? clone(initial);
      const updated = await update(state);
      await this.atomicWrite(directory, path, updated);
      return clone(updated);
    });
  }
  async deleteData(workspace: string, kind: DataKind): Promise<void> {
    if (!['reports', 'learning', 'cache', 'llm-cache', 'all'].includes(kind)) throw new LocalStoreError('STORAGE_BOUNDARY', '未知数据类别。');
    await this.locked(workspace, async directory => {
      const selected = kind === 'all' ? ['reports', 'learning', 'cache', 'llm-cache'] : [kind];
      for (const name of selected) {
        const path = join(directory, name === 'learning' ? 'learning.json' : name);
        try { if ((await lstat(path)).isSymbolicLink()) throw new LocalStoreError('STORAGE_BOUNDARY', '删除目标为符号链接，已拒绝。'); }
        catch (error) { if (!absent(error)) throw error; }
        await rm(path, { recursive: true, force: true });
      }
    });
  }
}

/** Sharing and retained reports omit source-bearing fields; credentials are never retained. */
export function redactReport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactReport);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(source|sourceCode|rawSource|snippet|codeSnippet|content|answer|freeAnswer|password|secret|apiKey|token|authorization|credential|credentials|profile|learningState)$/i.test(key)).map(([key, entry]) => [key, redactReport(entry)]));
  }
  if (typeof value === 'string') {
    if (/^(?:\/|[A-Za-z]:\\)/.test(value)) return '[local path omitted]';
    return value.replace(/(?:sk-[A-Za-z0-9_-]{12,}|(?:password|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s,"']+)/gi, '[redacted]');
  }
  return value;
}
