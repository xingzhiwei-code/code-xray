# Vendored @cliffx packages — source, patch and provenance

Vendored: 2026-09-08 by session 20260908-143500-claude. See DECISIONS D007 for the decision record.

## Source

| Package | Version | Origin |
|---|---|---|
| `vendor/cliffx-core` | 0.0.1 | npm registry tarball `@cliffx/core@0.0.1` |
| `vendor/cliffx-ui` | 0.0.1 | npm registry tarball `@cliffx/ui@0.0.1` |
| `vendor/cliffx-test` | 0.0.1 | npm registry tarball `@cliffx/test@0.0.1` |

Provenance checks (2026-09-08): registry manifests declare `repository: git+https://github.com/xingzhiwei-code/cliff.git`, the same repository as the E002 static inspection commit `0c8d0d9745ebcfbccdc60e7b705f0a7ec2f7308c`; all manifests declare `license: MIT`. Limitation: the tarballs ship built `dist/` output, so no byte-level source-to-dist verification against the pinned commit was performed (that would require building the upstream monorepo).

## Why vendored

The published tarballs are unusable as direct npm dependencies: cross-package dependencies use the `workspace:*` protocol (`@cliffx/core` → `@cliffx/ui`, `@cliffx/test` → `@cliffx/core`), which `npm install` rejects (`EUNSUPPORTEDPROTOCOL`). Per CLIFF_INTEGRATION §4 step 2, the fallback is local tarballs with the protocol rewritten — vendoring with `file:` links is the recorded form of that.

## Patches

All patches are generic CLI-infrastructure changes; no Code X-Ray domain logic enters cliff (per CLIFF_INTEGRATION §2 / D002).

### 1. Dependency protocol rewrite (core, test)

`workspace:*` → `file:../cliffx-*` in both `package.json` manifests. Installability only.

### 2. `checkUpdates` opt-in (core `Cli.run`)

Upstream: a set `version` alone triggers an npm-registry update check on every `run()`. Patch: the check requires `checkUpdates: true` explicitly; default is off (zero network). Default-off matches CLIFF_INTEGRATION §2 ("添加默认关闭的开关").

### 3. `errorMode: 'throw'` (core `Cli.run` unknown-command branch + `handleError`)

Upstream: unknown commands and command failures print to stderr and call `process.exit(1)`, terminating an embedding host. Patch: with `errorMode: 'throw'` both paths rethrow so the host owns exit codes, cleanup and presentation. Default `'exit'` preserves upstream behavior.

### 4. `loadConfig: false` disables implicit discovery (core `Cli.run`)

Upstream: every matched command run loads config files from `.`, `..`, `../..`, `$HOME` and merges prefixed env vars over option defaults. Patch: `loadConfig: false` skips both file and env discovery — the host only ever sees explicitly passed values. Default `true` preserves upstream behavior. This matters because Code X-Ray runs with the analyzed repository as cwd: an untrusted `.xray.json` must not influence scan scope or privacy options (AC09).

`@cliffx/ui` is vendored unmodified.

## Upstreaming / changes

If cliff upstream adds equivalent embedding switches or publishes installable tarballs, re-evaluate against CLIFF_INTEGRATION §5: re-run the CLI and privacy contract tests (`tests/cliff-adapter.test.ts`) against the new artifact and update this file plus D007. Do not treat an upstream changelog claim as verification.
