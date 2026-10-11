import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeJava, type JavaAnalysis, type JavaSourceFile } from '../packages/analyzer-java/index.js';
import { buildLinkSummaries } from '../packages/links/engine.js';
import { conceptCard } from '../packages/learning/engine.js';

const digest = (content: string) => createHash('sha256').update(content).digest('hex');
const file = (path: string, content: string): JavaSourceFile => ({ path, content, digest: digest(content) });

const FILES: JavaSourceFile[] = [
  file('demo/Order.java',
    'package demo;\nimport jakarta.persistence.Entity; import jakarta.persistence.Id; import jakarta.persistence.OneToMany;\nimport java.util.List; import java.util.ArrayList;\n@Entity\npublic class Order { @Id private Long id; @OneToMany private List<Line> lines = new ArrayList<>(); }\nclass Line {}\n'),
  file('demo/OrderRepository.java',
    'package demo;\nimport org.springframework.data.jpa.repository.JpaRepository;\npublic interface OrderRepository extends JpaRepository<Order, Long> { java.util.List<Order> findByStatus(String status); }\n'),
  file('demo/OrderService.java',
    'package demo;\nimport org.springframework.stereotype.Service;\nimport java.util.List;\n@Service\npublic class OrderService { private final OrderRepository repo; public OrderService(OrderRepository repo){this.repo=repo;} public List<Order> open(){ return repo.findByStatus("OPEN"); } }\n'),
  file('demo/OrderController.java',
    'package demo;\nimport org.springframework.web.bind.annotation.GetMapping; import org.springframework.web.bind.annotation.RequestParam; import org.springframework.web.bind.annotation.RestController;\nimport java.util.List;\n@RestController\npublic class OrderController { private final OrderService svc; public OrderController(OrderService svc){this.svc=svc;} @GetMapping("/api/orders") public List<Order> orders(@RequestParam(required=false) String status){ return svc.open(); } }\n'),
];

describe('link summary (v0.6 M2 "讲懂" capability)', () => {
  let analysis: JavaAnalysis;
  beforeAll(async () => {
    analysis = await analyzeJava(FILES);
  });

  it('produces one summary for the changed HTTP entry', () => {
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OrderController.java']));
    expect(summaries).toHaveLength(1);
    expect(summaries[0].entryKind).toBe('http');
    expect(summaries[0].entry).toBe('demo.OrderController#orders(String)');
  });

  it('emits all 9 rings in reading order', () => {
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OrderController.java']));
    expect(summaries[0].rings.map(r => r.kind)).toEqual([
      'entry', 'parameters', 'call-chain', 'branches', 'data-touch', 'side-effects', 'transaction', 'return', 'rationale',
    ]);
  });

  it('resolves the cross-file call chain A→B→C with evidence', () => {
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OrderController.java']));
    const chain = summaries[0].rings.find(r => r.kind === 'call-chain')!;
    expect(chain.items.map(i => i.label)).toEqual([
      'orders(String) → svc.open() → open()',
      'open() → repo.findByStatus() → findByStatus(String)',
    ]);
    expect(chain.items.every(i => i.resolution === 'resolved')).toBe(true);
    expect(chain.items.every(i => i.evidence.length > 0)).toBe(true);
  });

  it('distinguishes read from write in the data-touch ring', () => {
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OrderController.java']));
    const touch = summaries[0].rings.find(r => r.kind === 'data-touch')!;
    expect(touch.items.some(i => i.label.includes('findByStatus') && i.access === 'read')).toBe(true);
  });

  it('maps the return ring to the entity-boundary concept (risk view → learning)', () => {
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OrderController.java']));
    const ret = summaries[0].rings.find(r => r.kind === 'return')!;
    expect(ret.items[0].label).toBe('List<Order>');
    expect(ret.concepts.map(c => c.conceptId)).toContain('jpa.entity-boundary');
  });

  it('marks the rationale ring as speculation, never fact', () => {
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OrderController.java']));
    const why = summaries[0].rings.find(r => r.kind === 'rationale')!;
    expect(why.speculation).toBe(true);
    expect(why.unknowns.length).toBeGreaterThan(0);
  });

  it('exposes no summary for files outside the changed set', () => {
    expect(buildLinkSummaries(analysis, new Set(['demo/Order.java']))).toHaveLength(0);
  });
});

describe('link-summary learning loop (v0.6 M3)', () => {
  it('claims a concept-level card without a binding', () => {
    const card = conceptCard('jpa.entity-boundary');
    expect(card).not.toBeNull();
    expect(card!.title).toContain('实体');
    expect(card!.question.options.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown concept id (honest degrade)', () => {
    expect(conceptCard('does.not.exist')).toBeNull();
  });
});

describe('link-summary narrowing (v0.7 M2 / R6)', () => {
  // Two HTTP entries in the SAME changed file; only the `b` method's lines are
  // touched by the diff, so only `b` should surface as an entry summary.
  const twoEntries = [
    file('demo/TwoController.java', [
      'package demo;',
      '',
      'import org.springframework.web.bind.annotation.GetMapping;',
      'import org.springframework.web.bind.annotation.RestController;',
      '',
      '@RestController',
      'public class TwoController {',
      '',
      '    @GetMapping("/a")',
      '    public String a() {',
      '        return "a";',
      '    }',
      '',
      '    @GetMapping("/b")',
      '    public String b() {',
      '        return "b";',
      '    }',
      '}',
    ].join('\n') + '\n'),
  ];

  it('emits only the entry whose line range intersects the changed lines', async () => {
    const analysis = await analyzeJava(twoEntries);
    const changedLines = new Map<string, Set<number>>([['demo/TwoController.java', new Set([14, 15, 16, 17])]]);
    const summaries = buildLinkSummaries(analysis, new Set(['demo/TwoController.java']), changedLines);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].entry).toBe('demo.TwoController#b()');
  });

  it('emits nothing when no entry line is touched', async () => {
    const analysis = await analyzeJava(twoEntries);
    const changedLines = new Map<string, Set<number>>([['demo/TwoController.java', new Set([3, 4])]]);
    expect(buildLinkSummaries(analysis, new Set(['demo/TwoController.java']), changedLines)).toHaveLength(0);
  });

  it('keeps all entries when no per-line info is provided (whole file changed)', async () => {
    const analysis = await analyzeJava(twoEntries);
    expect(buildLinkSummaries(analysis, new Set(['demo/TwoController.java']))).toHaveLength(2);
  });
});

describe('link-summary lazy collection access (v0.7 M3 / R7)', () => {
  const lazyFiles = [
    file('demo/Owner.java', 'package demo;\nimport jakarta.persistence.Entity; import jakarta.persistence.Id; import jakarta.persistence.OneToMany;\nimport java.util.List;\n@Entity\npublic class Owner { @Id private Long id; @OneToMany private List<Pet> pets; public List<Pet> getPets(){ return pets; } }\n'),
    file('demo/Pet.java', 'package demo;\nimport jakarta.persistence.Entity; import jakarta.persistence.Id;\n@Entity\npublic class Pet { @Id private Long id; }\n'),
    file('demo/OwnerController.java', 'package demo;\nimport org.springframework.web.bind.annotation.GetMapping; import org.springframework.web.bind.annotation.RestController;\n@RestController\npublic class OwnerController { private final Owner owner; public OwnerController(Owner owner){ this.owner = owner; } @GetMapping("/pets") public int petCount(){ return owner.getPets().size(); } }\n'),
  ];

  it('counts owner.getPets() as a read and flags lazy-load checkpoint', async () => {
    const analysis = await analyzeJava(lazyFiles);
    const summaries = buildLinkSummaries(analysis, new Set(['demo/OwnerController.java']));
    const touch = summaries[0].rings.find(r => r.kind === 'data-touch')!;
    const lazy = touch.items.find(i => i.label.includes('getPets'));
    expect(lazy).toBeDefined();
    expect(lazy!.access).toBe('read');
    expect(lazy!.label).toContain('懒加载集合访问');
    expect(lazy!.label).toContain('N+1');
  });
});
