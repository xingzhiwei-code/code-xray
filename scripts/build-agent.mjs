import { build } from 'esbuild';
import { mkdir, chmod } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: { agent: 'apps/agent/index.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
await chmod('dist/agent.js', 0o755);
