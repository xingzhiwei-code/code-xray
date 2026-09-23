/**
 * Code X-Ray Agent Surface entry: MCP server over stdio (NDJSON framing).
 * The shebang is injected by scripts/build-agent.mjs (banner), not written here.
 * stdout carries protocol messages only; diagnostics go to stderr without
 * source content (ARCHITECTURE §11). Exit codes follow the product contract:
 * 0 clean shutdown, 1 fatal runtime failure, 130 cancellation (SIGINT/SIGTERM).
 */
import { createInterface } from 'node:readline';
import { McpServer } from './host/mcp.js';

async function flushStdout(): Promise<void> {
  await new Promise<void>(resolve => { process.stdout.write('', () => resolve()); });
}

async function main(): Promise<number> {
  const server = new McpServer({
    write: line => { process.stdout.write(line + '\n'); },
  });
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', line => {
    void (async () => {
      try { await server.receive(line); }
      catch (error) {
        process.stderr.write(`code-xray agent: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    })();
  });
  await new Promise<void>(resolve => { rl.on('close', resolve); });
  await flushStdout();
  return 0;
}

let shuttingDown = false;
async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try { await flushStdout(); } finally { process.exit(code); }
}
process.on('SIGINT', () => { void shutdown(130); });
process.on('SIGTERM', () => { void shutdown(130); });

main().then(
  code => { process.exitCode = code; },
  error => {
    process.stderr.write(`code-xray agent fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
