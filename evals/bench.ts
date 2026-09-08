/**
 * AC12 performance benchmark. Deterministically generates a fixed fixture
 * (100 Java files, ~200 non-empty lines each ≈ 20k non-empty lines) in a temp
 * directory, then measures cold scan, hot scan (OS cache warm) and peak RSS
 * of the real CLI binary against the v0.1 targets:
 *   cold ≤ 10s, hot ≤ 3s, peak memory ≤ 512 MiB.
 *
 * Run after `npm run build`:  npx tsx evals/bench.ts
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = 'dist/cli.js';
const FILES = 100;
const LINES_PER_FILE = 240;

function generate(root: string): void {
  // Deterministic bodies: repository interface + entity + service variants so
  // rules fire on a realistic share of the corpus.
  for (let i = 0; i < FILES; i++) {
    const lines: string[] = [
      'package bench.gen;',
      '',
      `import java.util.List;`,
      `import org.springframework.data.jpa.repository.JpaRepository;`,
      `import org.springframework.stereotype.Service;`,
      `import org.springframework.transaction.annotation.Transactional;`,
      `import jakarta.persistence.Entity;`,
      `import jakarta.persistence.Id;`,
      `import jakarta.persistence.OneToMany;`,
      '',
      `public class Service${i} {`,
      '',
      `    private final Repo${i} repo${i};`,
      '',
      `    public Service${i}(Repo${i} repo${i}) {`,
      `        this.repo${i} = repo${i};`,
      `    }`,
      '',
      `    public void place(Order${i} order) {`,
      `        validate${i}(order);`,
      `        save${i}(order);`,
      `    }`,
      '',
      `    @Transactional`,
      `    public void save${i}(Order${i} order) {`,
      `        repo${i}.save(order);`,
      `    }`,
      '',
      `    public void restock(List<Order${i}> orders) {`,
      `        for (Order${i} order : orders) {`,
      `            repo${i}.save(order);`,
      `        }`,
      `    }`,
      '',
      `    private void validate${i}(Order${i} order) {`,
      `        if (order == null) {`,
      `            throw new IllegalArgumentException("order");`,
      `        }`,
      `    }`,
      `}`,
      '',
      `interface Repo${i} extends JpaRepository<Order${i}, Long> {`,
      `}`,
      '',
      `@Entity`,
      `class Order${i} {`,
      `    @Id`,
      `    private Long id;`,
      `    @OneToMany`,
      `    private List<Line${i}> lines;`,
      `}`,
      '',
      `class Line${i} {`,
      `    private int quantity;`,
      `}`,
    ];
    // Padding: plain method bodies to reach the per-file line budget.
    while (lines.length < LINES_PER_FILE + 10) {
      const block = Math.floor(lines.length / 10);
      lines.push(`    int helper${i}_${block}(int input) {`, `        int result = input + ${block};`, `        return result > 0 ? result : -result;`, `    }`, '');
    }
    mkdirSync(join(root, 'src', 'main', 'java', 'bench', 'gen'), { recursive: true });
    writeFileSync(join(root, 'src', 'main', 'java', 'bench', 'gen', `Service${i}.java`), lines.join('\n') + '\n');
  }
}

function nonEmptyLines(root: string): number {
  let count = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.java'))
        for (const line of execFileSync('grep', ['-c', '.', full], { encoding: 'utf8' }).trim().split('\n')) count += Number(line) || 0;
    }
  };
  walk(root);
  return count;
}

function runOnce(root: string): { seconds: number; peakKb: number } {
  const start = process.hrtime.bigint();
  // The time report goes to stderr; spawnSync captures both streams.
  const result = spawnSync('/usr/bin/time', ['-l', process.execPath, CLI, 'scan', root, '--no-save', '--format', 'json'], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  // macOS: "<bytes>  peak memory footprint"; Linux: "<kb> maximum resident set size".
  const footprint = result.stderr.match(/(\d+)\s+peak memory footprint/);
  const rss = result.stderr.match(/(\d+) maximum resident set size/);
  const peakKb = footprint ? Number(footprint[1]) / 1024 : rss ? Number(rss[1]) : -1;
  return { seconds, peakKb };
}

const root = mkdtempSync(join(tmpdir(), 'xray-bench-'));
try {
  generate(root);
  const total = nonEmptyLines(root);
  console.log(`fixture: ${FILES} files, ${total} non-empty lines (target ≈ 20000)`);
  // Warm-up run first would defeat the cold measurement; run cold, then hot.
  const cold = runOnce(root);
  const hot = runOnce(root);
  const hot2 = runOnce(root);
  const peakKb = Math.max(cold.peakKb, hot.peakKb, hot2.peakKb);
  console.log(`cold: ${cold.seconds.toFixed(2)}s (target ≤ 10s)`);
  console.log(`hot:  ${Math.min(hot.seconds, hot2.seconds).toFixed(2)}s (target ≤ 3s)`);
  console.log(`peak: ${(peakKb / 1024).toFixed(1)} MiB (target ≤ 512 MiB)`);
  const pass = cold.seconds <= 10 && Math.min(hot.seconds, hot2.seconds) <= 3 && peakKb <= 512 * 1024;
  console.log(pass ? 'AC12 性能目标：通过' : 'AC12 性能目标：未通过');
  process.exit(pass ? 0 : 1);
} finally {
  rmSync(root, { recursive: true, force: true });
}
