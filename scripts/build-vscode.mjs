import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const root = 'apps/vscode';
await mkdir(`${root}/dist`, { recursive: true });
await build({
  entryPoints: [`${root}/extension.ts`],
  outfile: `${root}/dist/extension.js`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
});
await cp(`${root}/package.json`, `${root}/dist/package.json`);
await cp(`${root}/assets`, `${root}/dist/assets`, { recursive: true });
