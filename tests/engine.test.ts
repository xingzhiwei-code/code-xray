import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze, capabilities } from '../packages/engine/index.js';
import { assertReport, normalizedReport, type AnalysisReport } from '../packages/protocol/index.js';

// An independent consumer: only the engine facade and the protocol are imported —
// no CLI, no cliff, no analyzer internals cross this boundary.
const FIXTURE = 'fixtures/java-spring-jpa';

describe('engine facade as an independent protocol consumer', () => {
  it('produces a protocol-valid report from the real order fixture', async () => {
    const report = await analyze({ path: FIXTURE });
    expect(() => assertReport(report)).not.toThrow();
    expect(report.schemaVersion).toBe('0.1');
    expect(report.status).toBe('complete');
    expect(report.coverage.parsed).toBe(36);
    expect(report.coverage.failed).toBe(0);
    const byRule = new Map(report.findings.map(f => [f.ruleId, (report.findings.filter(g => g.ruleId === f.ruleId).length)]));
    expect(byRule.get('TX_SELF_INVOCATION')).toBe(5);
    expect(byRule.get('JPA_CALL_IN_LOOP')).toBe(5);
    expect(byRule.get('WEB_ENTITY_RELATION')).toBe(5);
    expect(report.provenance.offline).toBe(true);
    expect(report.provenance.llm).toBe('disabled');
    expect(report.flows.some(f => f.status === 'observed' && f.to)).toBe(true);
    expect(report.flows.some(f => f.status === 'unresolved' && f.reason)).toBe(true);
  });

  it('is deterministic across runs after excluding run metadata', async () => {
    const first = await analyze({ path: FIXTURE });
    const second = await analyze({ path: FIXTURE });
    expect(first.analysisId).not.toBe(second.analysisId);
    expect(normalizedReport(first)).toEqual(normalizedReport(second));
  });

  it('keeps findings tied to snapshot evidence with path:line anchors', async () => {
    const report = await analyze({ path: FIXTURE });
    const files = new Map(report.snapshot.files.map(f => [f.path, f.digest]));
    for (const finding of report.findings) {
      expect(finding.evidenceIds.length).toBeGreaterThan(0);
      for (const id of finding.evidenceIds) {
        const evidence = report.evidence.find(e => e.id === id);
        expect(evidence).toBeDefined();
        expect(files.get(evidence!.path)).toBe(evidence!.digest);
        expect(evidence!.start.line).toBeGreaterThan(0);
      }
      expect(finding.assumptions.length).toBeGreaterThan(0);
      expect(finding.uncertainties.length).toBeGreaterThan(0);
      expect(finding.symbol).toMatch(/#/);
    }
  });

  it('reports parse failures as partial instead of hiding them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-engine-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, 'src', 'Broken.java'), 'public class Broken { void m( {');
      writeFileSync(join(root, 'src', 'Fine.java'), 'public class Fine { void m() {} }');
      const report: AnalysisReport = await analyze({ path: root });
      expect(report.status).toBe('partial');
      expect(report.coverage.failed).toBe(1);
      expect(report.coverage.parsed).toBe(1);
      expect(report.findings).toHaveLength(0);
      expect(report.coverage.reasons.some(r => r.code === 'JAVA_PARSE_ERROR' && r.path === 'src/Broken.java')).toBe(true);
      expect(report.limitations.join('')).toContain('语法解析失败');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('declares capabilities honestly: java only, bounded, rule-complete', () => {
    expect(capabilities.languages).toHaveLength(1);
    const java = capabilities.languages[0];
    expect(java.id).toBe('java');
    expect([...java.rules].sort()).toEqual([
      'JPA_CALL_IN_LOOP', 'JPA_PERSISTENCE_CONTEXT', 'SPRING_BEAN_CANDIDATE',
      'TRANSACTION_BOUNDARY', 'TX_SELF_INVOCATION', 'WEB_ENTITY_RELATION',
    ]);
    expect(java.bounds.length).toBeGreaterThanOrEqual(4);
    expect(java.analyzerVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects a missing path with a typed error, not a crash', async () => {
    await expect(analyze({ path: join(tmpdir(), 'xray-definitely-missing-dir') })).rejects.toThrow('项目目录');
  });

  it('produces a deterministic diff against an explicit Git base', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-diff-'));
    try {
      const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@x.local', '-c', 'user.name=t', ...args], { cwd: root, stdio: 'pipe' });
      git('init', '-q');
      mkdirSync(join(root, 'src'), { recursive: true });
      // Base: a self-invocation finding and a plain file.
      writeFileSync(join(root, 'src', 'Keep.java'), 'public class Keep { void a() { b(); } void b() {} }\n');
      writeFileSync(join(root, 'src', 'Tx.java'),
        'import org.springframework.transaction.annotation.Transactional;\npublic class Tx { void outer() { save(); } @Transactional void save() {} }\n');
      git('add', '.');
      git('commit', '-q', '-m', 'base');
      // Working tree: add a new file, remove the plain file, keep the finding file byte-identical.
      writeFileSync(join(root, 'src', 'Added.java'),
        'import org.springframework.transaction.annotation.Transactional;\npublic class Added { void outer() { save(); } @Transactional void save() {} }\n');
      rmSync(join(root, 'src', 'Keep.java'));
      const report = await analyze({ path: root, base: 'HEAD' });
      expect(() => assertReport(report)).not.toThrow();
      expect(report.diff).not.toBeNull();
      expect(report.diff!.base).toMatch(/^[0-9a-f]{40}$/);
      expect(report.diff!.added).toEqual(['src/Added.java']);
      expect(report.diff!.deleted).toEqual(['src/Keep.java']);
      expect(report.diff!.modified).toEqual([]);
      expect(report.snapshot.gitBase).toBe(report.diff!.base);
      // The unchanged Tx.java keeps its finding; the new file adds the same rule at a new symbol.
      expect(report.findings.map(f => f.symbol).sort()).toEqual(['Added#outer()', 'Tx#outer()'].sort());
      expect(report.diff!.newFindingIds).toHaveLength(1);
      expect(report.diff!.continuingFindingIds).toHaveLength(0);
      expect(report.diff!.removedFindings).toHaveLength(0);
      const newId = report.diff!.newFindingIds[0];
      expect(report.findings.find(f => f.id === newId)?.symbol).toBe('Added#outer()');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('marks continuing findings and records removed ones across a base', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-diff2-'));
    try {
      const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@x.local', '-c', 'user.name=t', ...args], { cwd: root, stdio: 'pipe' });
      git('init', '-q');
      writeFileSync(join(root, 'Tx.java'),
        'import org.springframework.transaction.annotation.Transactional;\npublic class Tx { void outer() { save(); } @Transactional void save() { int x = 1; } }\n');
      writeFileSync(join(root, 'Gone.java'),
        'import org.springframework.transaction.annotation.Transactional;\npublic class Gone { void outer() { save(); } @Transactional void save() {} }\n');
      git('add', '.');
      git('commit', '-q', '-m', 'base');
      // Modify Tx.java (finding persists at the same symbol); delete Gone.java (finding disappears).
      writeFileSync(join(root, 'Tx.java'),
        'import org.springframework.transaction.annotation.Transactional;\npublic class Tx { void outer() { save(); } @Transactional void save() { int x = 2; } }\n');
      rmSync(join(root, 'Gone.java'));
      const report = await analyze({ path: root, base: 'HEAD' });
      expect(report.diff!.modified).toEqual(['Tx.java']);
      expect(report.diff!.deleted).toEqual(['Gone.java']);
      expect(report.diff!.continuingFindingIds).toHaveLength(1);
      expect(report.findings.find(f => f.id === report.diff!.continuingFindingIds[0])?.symbol).toBe('Tx#outer()');
      expect(report.diff!.removedFindings).toHaveLength(1);
      expect(report.diff!.removedFindings[0].symbol).toBe('Gone#outer()');
      expect(report.diff!.newFindingIds).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses diff outside a Git repository while scan remains usable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xray-nodiff-'));
    try {
      writeFileSync(join(root, 'A.java'), 'public class A { void run() {} }\n');
      const scanOnly = await analyze({ path: root });
      expect(scanOnly.diff).toBeNull();
      await expect(analyze({ path: root, base: 'HEAD' })).rejects.toMatchObject({ code: 'NOT_GIT', exitCode: 2 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
