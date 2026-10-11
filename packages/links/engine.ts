/**
 * Link Summary builder (v0.6 M2 — the first "讲懂" capability, Java-first).
 *
 * Turns the analyzer's raw link data (entries / methods / calls / branches /
 * data touches / side effects) plus the existing risk findings into a
 * 9-ring, per-entry reading of "what does this changed entry point actually
 * do". It consumes only analyzer-proven facts — every ring carries path:line
 * evidence, and anything not provable is marked `unknown`, never invented.
 *
 * Honesty contract (PRD §2): the "why" ring is always speculation and marked
 * as such; interface/virtual/reflection/dynamic-proxy targets stay unknown.
 */
import { createHash } from 'node:crypto';
import type { LinkRing, LinkRingItem, LinkSummary } from '../protocol/index.js';
import type { JavaAnalysis, JavaLinkCall, JavaLinkData, JavaLinkMethod } from '../analyzer-java/types.js';

export * from './types.js';

const sha = (...items: string[]) => createHash('sha256').update(items.join('|')).digest('hex').slice(0, 20);

const ENTRY_LABELS: Record<string, string> = { http: 'HTTP 接口', scheduled: '@Scheduled 定时任务', mq: 'MQ 监听器' };
const ENTRY_KIND_ORDER: Record<string, number> = { http: 0, scheduled: 1, mq: 2 };

const TRANSACTION_CONCEPTS = new Set(['spring.transaction-proxy', 'spring.transaction-boundary']);
const RETURN_CONCEPTS = new Set(['jpa.entity-boundary', 'jpa.persistence-context']);
const DATA_CONCEPTS = new Set(['jpa.query-amplification', 'jpa.persistence-context']);
const CALL_CONCEPTS = new Set(['spring.bean-relationship']);

function outerType(raw: string): string {
  return raw.split('<')[0].split('[')[0].trim();
}

/** Strip generic wrappers to the element type (List<Order> → Order). */
function elementType(raw: string): string {
  const inner = raw.slice(raw.indexOf('<') + 1, raw.lastIndexOf('>'));
  return inner && !inner.includes(',') ? outerType(inner) : outerType(raw);
}

function unique(items: string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b, 'en'));
}

interface RingDraft {
  kind: LinkRing['kind']; title: string; summary: string;
  items: LinkRingItem[]; unknowns: string[]; concepts: string[];
  speculation?: boolean;
}

/** Follow resolved call edges from an entry signature (cycle-guarded). */
function traceChain(entry: string, calls: JavaLinkCall[]): { chain: string[]; edges: JavaLinkCall[]; unresolved: JavaLinkCall[] } {
  const byFrom = new Map<string, JavaLinkCall[]>();
  for (const call of calls) {
    const list = byFrom.get(call.from);
    if (list) list.push(call); else byFrom.set(call.from, [call]);
  }
  const chain: string[] = [entry];
  const visited = new Set([entry]);
  const edges: JavaLinkCall[] = [];
  const unresolved: JavaLinkCall[] = [];
  let frontier = [entry];
  while (frontier.length) {
    const next: string[] = [];
    for (const from of frontier) {
      for (const call of byFrom.get(from) ?? []) {
        if (call.to && call.resolution === 'resolved') {
          edges.push(call);
          if (!visited.has(call.to)) { visited.add(call.to); chain.push(call.to); next.push(call.to); }
        } else {
          unresolved.push(call);
        }
      }
    }
    frontier = next;
  }
  return { chain, edges, unresolved };
}

export function buildLinkSummaries(analysis: JavaAnalysis, changedFiles?: Set<string>): LinkSummary[] {
  const links: JavaLinkData | undefined = analysis.links;
  if (!links) return [];
  const methodIndex = new Map<string, JavaLinkMethod>(links.methods.map(m => [m.signature, m]));
  // Finding → concept mapping by method symbol (risk view feeds the "讲懂" rings).
  const conceptsBySymbol = new Map<string, Set<string>>();
  for (const finding of analysis.findings) {
    const set = conceptsBySymbol.get(finding.symbol);
    if (set) set.add(finding.conceptId); else conceptsBySymbol.set(finding.symbol, new Set([finding.conceptId]));
  }
  // Simple-name → type facts, for entity/DTO classification of return types.
  const typesByName = new Map<string, typeof analysis.facts>();
  for (const fact of analysis.facts) {
    if (fact.kind !== 'type') continue;
    const list = typesByName.get(fact.name);
    if (list) list.push(fact); else typesByName.set(fact.name, [fact]);
  }
  const isEntity = (simpleName: string): boolean => {
    const candidates = typesByName.get(simpleName);
    return candidates?.length === 1 && (candidates[0].attributes.annotations as string[]).some(a => a === 'jakarta.persistence.Entity' || a === 'javax.persistence.Entity');
  };

  const conceptsFor = (symbols: string[], relevant: Set<string>): string[] => {
    const ids = new Set<string>();
    for (const symbol of symbols) for (const conceptId of conceptsBySymbol.get(symbol) ?? []) if (relevant.has(conceptId)) ids.add(conceptId);
    return unique([...ids]);
  };

  const summaries: LinkSummary[] = [];
  for (const entry of links.entries) {
    if (changedFiles && !changedFiles.has(entry.path)) continue;
    const { chain, edges, unresolved } = traceChain(entry.method, links.calls);
    const chainMethods = chain.map(sig => methodIndex.get(sig)).filter((m): m is JavaLinkMethod => Boolean(m));
    const rings: RingDraft[] = [];

    // 1. 入口
    rings.push({
      kind: 'entry', title: '入口',
      summary: `${ENTRY_LABELS[entry.kind] ?? '入口'}：${entry.method}`,
      items: entry.annotations.map(ann => ({ label: ann.split('.').at(-1) ?? ann, evidence: [{ path: entry.path, line: entry.line }], resolution: 'resolved' })),
      unknowns: [], concepts: [],
    });

    // 2. 参数与校验
    {
      const validation = entry.params.filter(p => p.annotations.length);
      const items: LinkRingItem[] = entry.params.map(p => ({
        label: `${p.type} ${p.name}${p.annotations.length ? `（${p.annotations.map(a => a.split('.').at(-1) ?? a).join('、')}）` : ''}`,
        evidence: [{ path: entry.path, line: entry.line }], resolution: 'resolved',
      }));
      const unknowns: string[] = [];
      if (entry.params.length === 0) unknowns.push('该方法没有显式入参。');
      if (validation.length === 0 && entry.params.length > 0) unknowns.push('未检测到显式校验注解（@Valid / @NotNull 等）；调用方应传入什么需结合调用点确认。');
      rings.push({
        kind: 'parameters', title: '参数与校验',
        summary: entry.params.length === 0 ? '无入参。' : `${entry.params.length} 个入参${validation.length ? `，${validation.length} 个带校验/绑定注解` : '，未见显式校验注解'}。`,
        items, unknowns, concepts: [],
      });
    }

    // 3. 调用链
    {
      const items: LinkRingItem[] = edges.map(edge => ({
        label: `${edge.from.split('#').at(-1)} → ${edge.label} → ${edge.to?.split('#').at(-1) ?? '?'}`,
        evidence: [{ path: edge.path, line: edge.line }], resolution: 'resolved',
      }));
      const unknowns = unique(unresolved.map(call => `${call.from.split('#').at(-1)} 调用 ${call.label}：${call.reason ?? '运行目标 unknown'}`));
      rings.push({
        kind: 'call-chain', title: '调用链',
        summary: chain.length > 1 ? `从入口到数据边界共 ${chain.length} 步：${chain.map(sig => sig.split('#').at(-1)).join(' → ')}` : '该入口方法体没有可解析的下游调用（或直接返回）。',
        items, unknowns, concepts: conceptsFor(chain, CALL_CONCEPTS),
      });
    }

    // 4. 分支与异常路径
    {
      const branchItems = links.branches.filter(b => chain.includes(b.method));
      const handlers = chainMethods.filter(m => m.isExceptionHandler);
      const items: LinkRingItem[] = branchItems.map(b => ({
        label: `${b.kind}${b.detail ? `（${b.detail}）` : ''}`, evidence: [{ path: b.path, line: b.line }], resolution: 'resolved',
      }));
      const unknowns: string[] = [];
      if (branchItems.length === 0) unknowns.push('链路上未检测到显式 if/else/switch/throw/try/catch。');
      unknowns.push('静态分支只表示"代码里写了这个分支"，不代表运行时一定走到；异常最终由谁接住需结合 @ExceptionHandler / 调用点。');
      if (handlers.length) unknowns.push(`存在 @ExceptionHandler：${handlers.map(h => h.signature.split('#').at(-1)).join('、')}。`);
      rings.push({
        kind: 'branches', title: '分支与异常路径',
        summary: branchItems.length === 0 ? '无显式分支/异常路径。' : `共 ${branchItems.length} 处分支/异常结构${handlers.length ? `，${handlers.length} 个 @ExceptionHandler` : ''}。`,
        items, unknowns, concepts: [],
      });
    }

    // 5. 数据触及（读/写区分）
    {
      const touches = links.dataTouches.filter(t => chain.includes(t.method));
      const items: LinkRingItem[] = touches.map(t => ({
        label: `${t.receiverType?.split('.').at(-1) ?? 'Repository'}.${t.repositoryMethod}()`, evidence: [{ path: t.path, line: t.line }],
        resolution: 'resolved', access: t.access,
      }));
      const unknowns = touches.filter(t => t.access === 'unknown').map(t => `${t.repositoryMethod}() 的读/写性质无法静态确定（自定义或继承方法）。`);
      if (touches.length === 0) unknowns.push('链路上未检测到显式 Repository 数据访问（可能经接口/动态代理，静态不可见）。');
      rings.push({
        kind: 'data-touch', title: '数据触及（读/写）',
        summary: touches.length === 0 ? '未检测到显式数据访问。' : `${touches.length} 次数据访问（读 ${touches.filter(t => t.access === 'read').length} / 写 ${touches.filter(t => t.access === 'write').length} / 未知 ${touches.filter(t => t.access === 'unknown').length}）。`,
        items, unknowns, concepts: conceptsFor(chain, DATA_CONCEPTS),
      });
    }

    // 6. 副作用
    {
      const effects = links.sideEffects.filter(s => chain.includes(s.method));
      const items: LinkRingItem[] = effects.map(s => ({
        label: `[${s.kind}] ${s.detail}`, evidence: [{ path: s.path, line: s.line }], resolution: 'resolved',
      }));
      const unknowns = effects.length === 0 ? ['未检测到显式 MQ 发送 / 外部 HTTP / 缓存写入；动态或外部类型的副作用静态不可见。'] : [];
      rings.push({
        kind: 'side-effects', title: '副作用',
        summary: effects.length === 0 ? '未检测到显式副作用。' : `检测到 ${effects.length} 处副作用（MQ/HTTP/缓存）。`,
        items, unknowns, concepts: [],
      });
    }

    // 7. 事务边界
    {
      const txMethods = chainMethods.filter(m => m.hasTransactional);
      const items: LinkRingItem[] = txMethods.map(m => ({
        label: `@Transactional ${m.signature.split('#').at(-1)}`, evidence: [{ path: m.path, line: m.line }], resolution: 'resolved',
      }));
      const unknowns = txMethods.length === 0 ? ['链路上没有方法标 @Transactional；若有事务语义依赖调用方或代理边界，静态不可见。'] : ['事务传播/回滚规则/是否真正经过代理不在静态解析范围内。'];
      rings.push({
        kind: 'transaction', title: '事务边界',
        summary: txMethods.length === 0 ? '链路上未检测到 @Transactional。' : `${txMethods.length} 个方法标有 @Transactional。`,
        items, unknowns, concepts: conceptsFor(chain, TRANSACTION_CONCEPTS),
      });
    }

    // 8. 返回
    {
      const element = elementType(entry.returnType);
      const entity = isEntity(element);
      const kindLabel = entry.returnType === 'void' ? 'void' : entity ? 'JPA 实体' : (entry.returnType.includes('<') || entry.returnType.includes('List') ? '集合/DTO（非实体）' : '普通类型/DTO（非实体）');
      rings.push({
        kind: 'return', title: '返回',
        summary: `返回 ${entry.returnType}（${kindLabel}）。`,
        items: [{ label: entry.returnType, evidence: [{ path: entry.path, line: entry.line }], resolution: 'resolved' }],
        unknowns: entity ? ['返回实体可能把持久化关系带入序列化边界（见返回环概念）。'] : [],
        concepts: conceptsFor([entry.method], RETURN_CONCEPTS),
      });
    }

    // 9. 为什么这样写（仅推测）
    {
      const speculations: string[] = [];
      if (rings[6].items.length) speculations.push('使用 @Transactional 通常是为了让这几步在同一事务内原子提交或回滚。');
      if (rings[7].items.length && rings[7].items.some(i => i.label.includes('实体'))) speculations.push('直接返回实体通常是为了省去 DTO 映射，但会让 API 契约与持久化模型耦合。');
      if (rings[4].items.some(i => i.access === 'read')) speculations.push('只读查询通常服务于列表/展示读取路径。');
      if (rings[5].items.length) speculations.push('显式副作用通常发生在主流程之外，用于异步通知或缓存一致性。');
      if (!speculations.length) speculations.push('没有足够信号推测设计意图；不臆测。');
      const items: LinkRingItem[] = speculations.map(s => ({ label: s, evidence: [], resolution: 'unknown' }));
      rings.push({
        kind: 'rationale', title: '为什么这样写（推测）',
        summary: '以下为推测，不代表代码作者真实意图；不确定即标 unknown，不瞎编。',
        items, unknowns: ['意图无法从静态代码确定；任何"为什么"都是推测，需结合提交信息/文档/作者确认。'], concepts: [], speculation: true,
      });
    }

    summaries.push({
      id: `ls_${sha(entry.method, entry.path)}`,
      entry: entry.method, entryKind: entry.kind, file: entry.path,
      rings: rings.map(ring => ({
        kind: ring.kind, title: ring.title, summary: ring.summary, items: ring.items,
        unknowns: ring.unknowns, concepts: unique(ring.concepts).map(conceptId => ({ conceptId })),
        ...(ring.speculation ? { speculation: true } : {}),
      })),
    });
  }
  return summaries.sort((a, b) => a.file.localeCompare(b.file, 'en') || (ENTRY_KIND_ORDER[a.entryKind] ?? 9) - (ENTRY_KIND_ORDER[b.entryKind] ?? 9) || a.entry.localeCompare(b.entry, 'en'));
}
