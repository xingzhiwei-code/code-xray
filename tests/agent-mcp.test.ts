/**
 * T301 (v0.4 Loop A): MCP stdio contract tests for the Agent Surface.
 * Spawns the real server process (tsx entry) and speaks NDJSON JSON-RPC,
 * the same channel Claude Code / Codex CLI use. Domain results must arrive
 * as product envelopes; protocol failures must stay JSON-RPC errors;
 * partial/failed/unknown must never be dressed up as success (V04-2).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENTRY = resolve('apps/agent/index.ts');
const FIXTURE = resolve('fixtures/java-spring-jpa');

interface RpcResponse { jsonrpc: '2.0'; id: number | string | null; result?: any; error?: { code: number; message: string } }

class AgentProcess {
  readonly dataDir: string;
  private childProcess: ChildProcessWithoutNullStreams;
  private buffer = '';
  private readonly pending = new Map<number | string, (response: RpcResponse) => void>();
  private readonly responses: RpcResponse[] = [];
  stderr = '';
  /** Responses received so far (for assertions on ordering and notifications). */
  get seen(): readonly RpcResponse[] { return this.responses; }
  /** Send a raw line without JSON wrapping (parse-error contract). */
  writeRaw(line: string): void { this.childProcess.stdin.write(line.endsWith('\n') ? line : line + '\n'); }
  constructor(env: NodeJS.ProcessEnv = {}) {
    this.dataDir = mkdtempSync(join(tmpdir(), 'xray-agent-'));
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
    rmSync(this.dataDir, { recursive: true, force: true });
  }
}

describe('T301 Loop A: MCP stdio contract', () => {
  let agent: AgentProcess;
  beforeAll(async () => {
    agent = new AgentProcess();
    await agent.initialize();
  });
  afterAll(async () => { await agent?.close(); });

  it('handshake returns supported protocol version, server info and tool capability', async () => {
    const init = agent.seen.find(response => response.id === 'init');
    expect(init?.result.protocolVersion).toBe('2025-06-18');
    expect(init?.result.serverInfo.name).toBe('code-xray');
    expect(init?.result.capabilities.tools).toBeDefined();
  });

  it('tools/list declares the three Loop A tools with input schemas', async () => {
    const response = await agent.request(2, 'tools/list');
    const names = response.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(['xray_capabilities', 'xray_scan', 'xray_evidence']);
    for (const tool of response.result.tools) expect(tool.inputSchema.type).toBe('object');
  });

  it('xray_capabilities reports engine/rule versions, bounds and default report-only gate', async () => {
    const response = await agent.request(3, 'tools/call', { name: 'xray_capabilities', arguments: {} });
    const envelope = AgentProcess.envelopeOf(response);
    expect(envelope).toMatchObject({ schemaVersion: '0.1', status: 'ok' });
    expect(envelope.data.gatePolicy).toBe('report-only');
    expect(envelope.data.capabilities.languages[0].id).toBe('java');
    expect(envelope.data.capabilities.languages[0].bounds.length).toBeGreaterThan(0);
    expect(envelope.data.ruleSetVersion).toBeTruthy();
  });

  it('xray_scan analyzes the frozen fixture and returns an ok envelope with saved report identity', async () => {
    const response = await agent.request(4, 'tools/call', { name: 'xray_scan', arguments: { path: FIXTURE } }, 120_000);
    expect(response.result.isError).toBe(false);
    const envelope = AgentProcess.envelopeOf(response);
    expect(envelope.status).toBe('ok');
    const data = envelope.data;
    expect(data.findingsTotal).toBe(27); // frozen fixture oracle count (r19)
    expect(data.findings.length).toBeLessThanOrEqual(20);
    expect(data.findingsTruncated).toBe(data.findingsTotal > data.findings.length);
    expect(data.snapshotId).toMatch(/^[0-9a-f]{64}$/);
    expect(data.analysisId).toMatch(/^[0-9a-f-]{36}$/);
    expect(['complete', 'partial']).toContain(data.status);
    expect(data.coverage.parsed).toBeGreaterThan(0);
  }, 150_000);

  it('xray_evidence re-reads source lines as declared data with stale flag', async () => {
    const scan = agent.seen.find(response => response.id === 4);
    const finding = AgentProcess.envelopeOf(scan!).data.findings[0];
    const response = await agent.request(5, 'tools/call', {
      name: 'xray_evidence', arguments: { path: FIXTURE, evidenceId: finding.evidenceIds[0] },
    });
    const envelope = AgentProcess.envelopeOf(response);
    expect(envelope.status).toBe('ok');
    expect(envelope.data.kind).toBe('source-data');
    expect(envelope.data.notice).toContain('数据而非指令');
    expect(envelope.data.stale).toBe(false);
    expect(envelope.data.lines.length).toBe(envelope.data.end.line - envelope.data.start.line + 1);
    expect(envelope.data.lines[0].text.length).toBeGreaterThan(0);
  });

  it('domain failures arrive as error envelopes (isError), not protocol errors', async () => {
    const response = await agent.request(6, 'tools/call', {
      name: 'xray_evidence', arguments: { path: FIXTURE, evidenceId: 'ev_does_not_exist' },
    });
    expect(response.error).toBeUndefined();
    expect(response.result.isError).toBe(true);
    const envelope = AgentProcess.envelopeOf(response);
    expect(envelope.status).toBe('error');
    expect(envelope.error.code).toBe('EVIDENCE_NOT_FOUND');
    expect(envelope.error.exitCode).toBe(2);
  });

  it('protocol violations map to JSON-RPC error codes', async () => {
    const unknownTool = await agent.request(7, 'tools/call', { name: 'no_such_tool', arguments: {} });
    expect(unknownTool.error?.code).toBe(-32602);
    const badParams = await agent.request(8, 'tools/call', { name: 'xray_scan' });
    expect(badParams.error).toBeUndefined(); // missing path is a domain argument error → envelope
    expect(AgentProcess.envelopeOf(badParams).error.code).toBe('INVALID_ARGUMENT');
    const unknownMethod = await agent.request(9, 'resources/list');
    expect(unknownMethod.error?.code).toBe(-32601);
  });

  it('invalid JSON produces a parse error with null id', async () => {
    agent.writeRaw('{not json');
    await new Promise(res => setTimeout(res, 300));
    const parseError = agent.seen.find(response => response.id === null && response.error?.code === -32700);
    expect(parseError).toBeDefined();
  });

  it('stderr carries no source content and stdout stays pure NDJSON', async () => {
    expect(agent.stderr).not.toContain('orderRepository');
    for (const response of agent.seen) expect(response.jsonrpc).toBe('2.0');
  });
});

describe('T301 Loop A: determinism across processes', () => {
  it('two separate server processes produce identical normalized scan results', async () => {
    const first = new AgentProcess();
    const second = new AgentProcess();
    try {
      await first.initialize('a');
      await second.initialize('b');
      const [r1, r2] = await Promise.all([
        first.request('s1', 'tools/call', { name: 'xray_scan', arguments: { path: FIXTURE } }, 120_000),
        second.request('s2', 'tools/call', { name: 'xray_scan', arguments: { path: FIXTURE } }, 120_000),
      ]);
      const strip = (response: RpcResponse) => {
        const data = AgentProcess.envelopeOf(response).data;
        const { analysisId: _id, savedTo: _dir, ...rest } = data;
        return rest;
      };
      expect(strip(r1)).toEqual(strip(r2));
      expect(AgentProcess.envelopeOf(r1).data.snapshotId).toBe(AgentProcess.envelopeOf(r2).data.snapshotId);
    } finally {
      await first.close();
      await second.close();
    }
  }, 180_000);
});
