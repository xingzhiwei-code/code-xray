/**
 * Idempotent vendor-cliff bootstrap (A1).
 *
 * The published `@cliffx/*@0.0.1` tarballs are unusable as direct npm
 * dependencies (workspace:* protocol) and ship only compiled `dist/`. We
 * vendor their `dist/` output here — downloaded once, integrity-checked, then
 * patched with the 4 documented embedding patches from vendor/VENDOR_PATCH.md
 * (patch 1 = dependency protocol rewrite is already in the committed
 * package.json manifests; patches 2–4 are source-level and applied below).
 *
 * A unique marker export (`XRAY_CLIFF_PATCHES`) is injected so `xray doctor`
 * can PROVE the patches are present instead of asserting a hard-coded claim
 * (A2). The marker is what makes this step idempotent: if it is already there
 * the script exits without network.
 *
 * Runtime stays zero-network; the only network here is the install/build-time
 * tarball fetch, in the same session as `npm install`.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATCH_MARKER = 'checkUpdates-optin;errorMode-throw;loadConfig-off';
const MARKER_EXPORT = `export var XRAY_CLIFF_PATCHES = "${PATCH_MARKER}";`;
const MARKER_DTS = `export declare const XRAY_CLIFF_PATCHES: string;`;

/** Pinned upstream tarballs + registry sha512 integrity (provenance: VENDOR_PATCH.md). */
const PACKAGES = [
  { name: 'core', url: 'https://registry.npmjs.org/@cliffx/core/-/core-0.0.1.tgz', integrity: 'sha512-QLcKqFMWZCTnkvlHnMfay+WRYaXuSS0+ylz+5K+qbiHlrH09Yvx1OwyMUSCF+5szOa3k+FVa+8ndIcJA+MzMUg==' },
  { name: 'ui', url: 'https://registry.npmjs.org/@cliffx/ui/-/ui-0.0.1.tgz', integrity: 'sha512-0O12tgLO951YjUUR8qXy4bqxg0BF2P/PDn5A48t3EvmRXUvAVhl/RY9pBLOrxgArd/n/Kdp3ryKsOn6d/SsW2A==' },
  { name: 'test', url: 'https://registry.npmjs.org/@cliffx/test/-/test-0.0.1.tgz', integrity: 'sha512-9R1y+16+BMZy1/l1sh7NNXN0Ajb2lzXWVai3cZayU3c4yTtB3bQPj/DH9khT1G3jlAz+M/itI1T63+ZRUM7P6g==' },
];

/**
 * The four source-level patches (2–4 in VENDOR_PATCH.md) applied to the
 * compiled `@cliffx/core` dist. Each anchor must match the pinned 0.0.1
 * output exactly; a miss aborts so we never ship an unpatched dist.
 */
const CORE_PATCHES = [
  [
    // Patch 2 — checkUpdates opt-in: a set version alone no longer triggers a
    // registry update check on every run; it now requires checkUpdates: true.
    'checkUpdates opt-in',
    `  async run(args = process.argv.slice(2)) {
    if (this.options.version) {
      checkForUpdates(this.options.name, this.options.version).catch(() => {
      });
    }`,
    `  async run(args = process.argv.slice(2)) {
    if (this.options.checkUpdates === true && this.options.version) {
      checkForUpdates(this.options.name, this.options.version).catch(() => {
      });
    }`,
  ],
  [
    // Patch 3a — errorMode 'throw' on the unknown-command branch: rethrow so
    // the embedding host owns exit codes, instead of ui.error + process.exit(1).
    'errorMode throw (unknown command)',
    `      ui.error(\`Unknown command: \${args.join(" ")}\`);
      ui.log(\`Run \${this.options.name} --help for available commands.\`);
      process.exit(1);`,
    `      if (this.options.errorMode === "throw") {
        throw new Error(\`Unknown command: \${args.join(" ")}\`);
      }
      ui.error(\`Unknown command: \${args.join(" ")}\`);
      ui.log(\`Run \${this.options.name} --help for available commands.\`);
      process.exit(1);`,
  ],
  [
    // Patch 3b — errorMode 'throw' in handleError: rethrow the original error
    // for command failures instead of printing to stderr and terminating.
    'errorMode throw (handleError)',
    `  handleError(err) {
    if (err instanceof Error) {
      ui.error(err.message);`,
    `  handleError(err) {
    if (this.options.errorMode === "throw") {
      throw err;
    }
    if (err instanceof Error) {
      ui.error(err.message);`,
  ],
  [
    // Patch 4 — loadConfig: false disables implicit config-file AND env
    // discovery; the host only ever sees explicitly passed values.
    'loadConfig off',
    `    if (!this.loadedConfig || Object.keys(this.loadedConfig).length === 0) {
      const configResult = loadConfig(this.options.name);
      this.loadedConfig = configResult.values;
    }
    const prefix = envPrefix(this.options.name);
    const envValues = loadEnv(prefix);`,
    `    if (this.options.loadConfig === false) {
      this.loadedConfig = {};
    } else if (!this.loadedConfig || Object.keys(this.loadedConfig).length === 0) {
      const configResult = loadConfig(this.options.name);
      this.loadedConfig = configResult.values;
    }
    const prefix = envPrefix(this.options.name);
    const envValues = this.options.loadConfig === false ? {} : loadEnv(prefix);`,
  ],
];

/** Type declaration for the three embedding switches, so TypeScript consumers accept them. */
const CLI_OPTIONS_DTS_PATCH = [
  'cli options types',
  `    /** Enable debug mode. */
    debug?: boolean;
}`,
  `    /** Enable debug mode. */
    debug?: boolean;
    /** Opt-in update check (vendor patch 2). */
    checkUpdates?: boolean;
    /** Disable implicit config-file + env discovery (vendor patch 4). */
    loadConfig?: boolean;
    /** 'throw' rethrows command errors instead of process.exit (vendor patch 3). */
    errorMode?: 'throw' | 'exit';
}`,
];

function sha512Base64(buffer) {
  return createHash('sha512').update(buffer).digest('base64');
}

function isAlreadyPatched() {
  const index = join(ROOT, 'vendor', 'cliffx-core', 'dist', 'index.js');
  if (!existsSync(index)) return false;
  return readFileSync(index, 'utf8').includes('XRAY_CLIFF_PATCHES');
}

function assertIntegrity(name, buffer, integrity) {
  const [, expected] = integrity.split('-');
  if (sha512Base64(buffer) !== expected) {
    throw new Error(`@cliffx/${name} tarball integrity 校验失败（可能与上游不一致）；已拒绝使用该产物。`);
  }
}

function applyPatches(text, patches) {
  let out = text;
  for (const [label, from, to] of patches) {
    if (!out.includes(from)) {
      throw new Error(`cliff 补丁「${label}」未命中上游 0.0.1 内容（上游可能已变化）；拒绝生成未打补丁的 dist。`);
    }
    out = out.replace(from, to);
  }
  return out;
}

async function main() {
  if (isAlreadyPatched()) {
    process.stdout.write('vendor/cliffx-* dist 已就绪（含嵌入补丁，已验证标记存在），跳过。\n');
    return;
  }
  process.stdout.write('正在拉取并生成 vendor/cliffx-* dist（首次构建需要联网，与 npm install 同一会话）…\n');

  const work = mkdtempSync(join(tmpdir(), 'cliffx-vendor-'));
  try {
    for (const pkg of PACKAGES) {
      const response = await fetch(pkg.url);
      if (!response.ok) throw new Error(`拉取 ${pkg.name} tarball 失败：HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      assertIntegrity(pkg.name, buffer, pkg.integrity);

      const tarball = join(work, `${pkg.name}.tgz`);
      const extractDir = join(work, pkg.name);
      writeFileSync(tarball, buffer);
      mkdirSync(extractDir, { recursive: true });
      const result = spawnSync('tar', ['-xzf', tarball, '-C', extractDir], { stdio: 'pipe' });
      if (result.status !== 0) throw new Error(`解压 ${pkg.name} tarball 失败：${result.stderr?.toString() ?? result.error?.message ?? ''}`);

      const dist = join(extractDir, 'package', 'dist');
      if (!existsSync(join(dist, 'index.js'))) throw new Error(`@cliffx/${pkg.name} tarball 缺少 dist/index.js；上游结构可能变化。`);

      if (pkg.name === 'core') {
        const indexPath = join(dist, 'index.js');
        const patched = applyPatches(readFileSync(indexPath, 'utf8'), CORE_PATCHES);
        writeFileSync(indexPath, `${patched.trimEnd()}\n${MARKER_EXPORT}\n`);
        const dtsPath = join(dist, 'index.d.ts');
        const dts = applyPatches(readFileSync(dtsPath, 'utf8'), [CLI_OPTIONS_DTS_PATCH]);
        writeFileSync(dtsPath, `${dts.trimEnd()}\n${MARKER_DTS}\n`);
      }

      const dest = join(ROOT, 'vendor', `cliffx-${pkg.name}`, 'dist');
      rmSync(dest, { recursive: true, force: true });
      cpSync(dist, dest, { recursive: true });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  process.stdout.write('vendor/cliffx-* dist 已生成并应用嵌入补丁。\n');
}

main().catch(error => {
  process.stderr.write(`vendor-prebuild 失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
