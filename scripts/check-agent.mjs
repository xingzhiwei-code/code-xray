import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const tsc = join(process.cwd(), 'node_modules', '.bin', 'tsc');
const result = spawnSync(tsc, ['-p', 'apps/agent/tsconfig.json', '--noEmit'], {
  stdio: 'inherit',
  cwd: process.cwd(),
});
process.exit(result.status ?? 1);
