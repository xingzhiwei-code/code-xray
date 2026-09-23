/**
 * Shared spawn-based MCP test client for Agent Surface contract tests.
 * Speaks NDJSON JSON-RPC to the real server process — the same channel
 * Claude Code / Codex CLI use.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { expect } from 'vitest';

export const ENTRY = resolve('apps/agent/index.ts');
export const FIXTURE = resolve('fixtures/java-spring-jpa');
export const FIXTURE_SRC = join(FIXTURE, 'src');

export interface RpcResponse { jsonrpc: '2.0'; id: number | string | null; result?: any; error?: { code: number; message: string } }

export class AgentProcess {
  readonly dataDir: string;
  private readonly ownsDataDir: boolean;
  private childProcess: ChildProcessWithoutNullStreams;
  private buffer = '';
  private readonly pending = new Map<number | string, (response: RpcResponse) => void>();
  private readonly responses: RpcResponse[] = [];
  stderr = '';
  /** Responses received so far (for assertions on ordering and notifications). */
  get seen(): readonly RpcResponse[] { return this.responses; }
  /** Send a raw line without JSON wrapping (parse-error contract). */
  writeRaw(line: string): void { this.childProcess.stdin.write(line.endsWith('\n') ? line : line + '\n'); }
  constructor(env: NodeJS.ProcessEnv = {}, dataDir?: string) {
    this.dataDir = dataDir ?? mkdtempSync(join(tmpdir(), 'xray-agent-'));
    this.ownsDataDir = dataDir === undefined;
    this.childProcess = spawn(process.execPath, ['--import', 'tsx', ENTRY], {
      env: { ...process.env, XRAY_DATA_DIR: this.dataDir, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    // CJK output can split multi-byte characters across chunk boundaries; decode incrementally.
    const decoder = new StringDecoder('utf8');
    this.childProcess.stdout.on('data', (chunk: Buffer) => {
      this.buffer += decoder.write(chunk);
      let index: number;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        const response = JSON.parse(line) as RpcResponse;
        this.responses.push(response);
        if (response.id !== null && response.id !== undefined) this.pending.get(response.id)?.(response);
      }
    });
    const stderrDecoder = new StringDecoder('utf8');
    this.childProcess.stderr.on('data', (chunk: Buffer) => { this.stderr += stderrDecoder.write(chunk); });
  }
  send(message: unknown): void { this.childProcess.stdin.write(JSON.stringify(message) + '\n'); }
  notify(method: string, params?: unknown): void { this.send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }); }
  async request(id: number | string, method: string, params?: unknown, timeoutMs = 60_000): Promise<RpcResponse> {
    const existing = this.responses.find(response => response.id === id);
    if (existing) return existing;
    const promise = new Promise<RpcResponse>((res, rej) => {
      this.pending.set(id, res);
      setTimeout(() => rej(new Error(`request ${String(id)} (${method}) timed out`)), timeoutMs).unref();
    });
    this.send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    return promise;
  }
  async initialize(id: number | string = 'init'): Promise<RpcResponse> {
    const response = await this.request(id, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '0' },
    });
    this.notify('notifications/initialized');
    return response;
  }
  /** Unwrap the envelope carried by a tools/call result. */
  static envelopeOf(response: RpcResponse): any {
    expect(response.error).toBeUndefined();
    const text = response.result.content[0].text as string;
    const envelope = JSON.parse(text);
    expect(response.result.structuredContent).toEqual(envelope);
    return envelope;
  }
  async close(): Promise<void> {
    this.childProcess.stdin.end();
    await new Promise<void>(res => { this.childProcess.on('close', () => res()); setTimeout(() => { this.childProcess.kill('SIGKILL'); res(); }, 3000).unref(); });
    if (this.ownsDataDir) rmSync(this.dataDir, { recursive: true, force: true });
  }
}

/** Call a tool and return the unwrapped envelope ({status:'ok',data} | {status:'error',error}). */
export async function callTool(agent: AgentProcess, id: string | number, name: string, args: Record<string, unknown>, timeoutMs = 60_000): Promise<any> {
  const response = await agent.request(id, 'tools/call', { name, arguments: args }, timeoutMs);
  return AgentProcess.envelopeOf(response);
}
