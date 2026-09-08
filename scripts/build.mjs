import { build } from 'esbuild';
import { mkdir, chmod } from 'node:fs/promises';
await mkdir('dist', {recursive:true});
await build({entryPoints:{cli:'apps/cli/index.ts',engine:'packages/engine/index.ts',protocol:'packages/protocol/index.ts'},outdir:'dist',bundle:true,platform:'node',target:'node22',format:'esm',sourcemap:true,banner:{js:"#!/usr/bin/env node\nimport { createRequire as __xrayCreateRequire } from 'node:module'; const require = __xrayCreateRequire(import.meta.url);"}});
await chmod('dist/cli.js',0o755);
