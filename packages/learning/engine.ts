import { createHash } from 'node:crypto';
import type { AnalysisReport, Finding } from '../protocol/index.js';
import {
  LEARNING_CONTENT_VERSION, STATUS_LABELS,
  type ConceptId, type DebtSummary, type LearningBinding, type LearningCard,
  type LearningEvent, type LearningState, type LearningStatus, type Verification,
} from './types.js';
export { LEARNING_CONTENT_VERSION, STATUS_LABELS } from './types.js';
export type * from './types.js';

const hash = (...items: (string | number)[]) => createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 20);
const IMPACT: Record<Finding['severity'], number> = { high: 3, medium: 2, low: 1 };
/** Transparent gap per learning status — visible in every debt report. */
export const GAP: Record<LearningStatus, number> = {
  unassessed: 1.0, 'to-learn': 0.8, learning: 0.6, 'self-reported': 0.4,
  verified: 0.0, stale: 0.9, ignored: 0.0,
};
const EVIDENCE_STRENGTH: Record<LearningBinding['association'], number> = { direct: 1.0, inferred: 0.7, unknown: 0.4 };

export function emptyLearningState(): LearningState {
  return { learningVersion: 1, bindings: {}, events: [], corrections: {} };
}

function bindingId(conceptId: ConceptId, codeRef: string): string {
  return `lb_${hash(conceptId, codeRef)}`;
}

/** Fingerprint of the code context a binding is anchored to: symbol + evidence digests. */
function fingerprintOf(finding: Finding, report: AnalysisReport): string {
  const digests = finding.evidenceIds
    .map(id => report.evidence.find(e => e.id === id)?.digest)
    .filter((d): d is string => Boolean(d))
    .sort();
  return hash(finding.symbol, ...digests);
}

/**
 * Sync learning bindings with a fresh report. Reading/creating bindings never
 * changes a learning status (viewing is not mastery); code changes mark the
 * binding stale with the previous status preserved; ignored bindings stay
 * ignored and never flow back.
 */
export function syncBindings(state: LearningState, report: AnalysisReport): { state: LearningState; changed: LearningBinding[] } {
  const next: LearningState = { ...state, bindings: { ...state.bindings } };
  const changed: LearningBinding[] = [];
  const seen = new Set<string>();
  const findingById = new Map(report.findings.map(f => [f.id, f]));
  for (const finding of report.findings) {
    const id = bindingId(finding.conceptId as ConceptId, finding.symbol);
    seen.add(id);
    const fingerprint = fingerprintOf(finding, report);
    const existing = next.bindings[id];
    if (!existing) {
      const created: LearningBinding = {
        id, conceptId: finding.conceptId as ConceptId, codeRef: finding.symbol, codeFingerprint: fingerprint,
        evidenceIds: finding.evidenceIds, findingId: finding.id,
        impact: finding.severity, association: 'direct',
        status: 'unassessed', active: true, views: 0,
        contentVersion: LEARNING_CONTENT_VERSION,
        createdAt: report.createdAt, updatedAt: report.createdAt, verifications: [],
      };
      next.bindings[id] = created;
      changed.push(created);
      continue;
    }
    if (existing.status === 'ignored') continue; // Explicit user decision; no resurrection.
    if (existing.codeFingerprint === fingerprint) {
      const refreshed: LearningBinding = { ...existing, evidenceIds: finding.evidenceIds, findingId: finding.id, association: 'direct', updatedAt: report.createdAt };
      next.bindings[id] = refreshed;
      continue;
    }
    const staleBinding: LearningBinding = {
      ...existing, codeFingerprint: fingerprint, evidenceIds: finding.evidenceIds, findingId: finding.id,
      association: 'direct', status: 'stale', staleReason: '代码已变化，需复核该知识的适用性。',
      previousStatus: existing.status === 'stale' ? existing.previousStatus : existing.status,
      updatedAt: report.createdAt,
    };
    next.bindings[id] = staleBinding;
    changed.push(staleBinding);
  }
  // Findings that disappeared: bindings survive as stale so history is not lost.
  for (const binding of Object.values(next.bindings)) {
    if (seen.has(binding.id) || binding.status === 'ignored' || binding.status === 'stale') continue;
    const gone = binding.findingId && !findingById.has(binding.findingId);
    if (!gone) continue;
    const staleBinding: LearningBinding = {
      ...binding, status: 'stale', staleReason: '最新扫描未再出现该模式；代码可能已修复或移动。',
      previousStatus: binding.status, association: 'inferred', updatedAt: report.createdAt,
    };
    next.bindings[staleBinding.id] = staleBinding;
    changed.push(staleBinding);
  }
  return { state: next, changed };
}

/** Apply one user event; events are the only way a status ever advances. */
export function applyEvent(state: LearningState, event: LearningEvent, at: string): { state: LearningState; binding: LearningBinding } {
  const binding = state.bindings[event.bindingId];
  if (!binding) throw new Error(`未知的学习绑定：${event.bindingId}`);
  const record = (status: LearningBinding['status'], patch: Partial<LearningBinding>): LearningBinding => {
    const updated: LearningBinding = { ...binding, ...patch, status, updatedAt: at };
    return updated;
  };
  let updated: LearningBinding;
  switch (event.type) {
    case 'view':
      updated = record(binding.status, { views: binding.views + 1 });
      break;
    case 'set-status': {
      if (binding.status === 'ignored') throw new Error('已忽略的绑定需先 restore 才能改状态。');
      updated = record(event.status, { previousStatus: binding.status, staleReason: undefined });
      break;
    }
    case 'answer': {
      if (binding.status === 'ignored') throw new Error('已忽略的绑定需先 restore 才能作答。');
      const card = learningCard(binding);
      const correct = event.optionId === card.question.answerId;
      const verification: Verification = {
        questionId: card.question.id, method: 'deterministic-choice',
        result: correct ? 'passed' : 'failed', contentVersion: card.contentVersion,
        codeFingerprint: binding.codeFingerprint, evidenceIds: binding.evidenceIds, at,
      };
      updated = record(correct ? 'verified' : binding.status, {
        verifications: [...binding.verifications, verification],
        previousStatus: correct ? binding.status : binding.previousStatus,
      });
      break;
    }
    case 'ignore':
      updated = record('ignored', { active: false, ignoreReason: event.reason ?? 'user-choice', previousStatus: binding.status === 'ignored' ? binding.previousStatus : binding.status });
      break;
    case 'restore':
      updated = record(binding.previousStatus ?? 'unassessed', { active: true, ignoreReason: undefined, staleReason: undefined });
      break;
    case 'rebind':
      updated = record(binding.status, { conceptId: event.conceptId, correctedFrom: binding.conceptId });
      break;
    case 'delete':
      updated = binding; // handled below
      break;
  }
  const events = [...state.events, { eventId: `ev_${hash(JSON.stringify(event), at)}`, bindingId: event.bindingId, type: event.type, at, fingerprint: binding.codeFingerprint, resultStatus: event.type === 'delete' ? 'deleted' as const : updated.status }];
  if (event.type === 'delete') {
    const { [event.bindingId]: _removed, ...rest } = state.bindings;
    return { state: { ...state, bindings: rest, events }, binding };
  }
  return { state: { ...state, bindings: { ...state.bindings, [event.bindingId]: updated }, events }, binding: updated };
}

interface CardContent {
  title: string; what: string; whyHere: string; hiddenMechanisms: string;
  whatIfRemoved: string; question: LearningCard['question']; sources: { title: string; url: string }[];
}

/** Deterministic per-concept card content — usable fully offline (AC05). */
const CARDS: Record<ConceptId, CardContent> = {
  'spring.transaction-proxy': {
    title: 'Spring 事务代理与同类调用',
    what: 'Spring 的声明式事务通过 AOP 代理实现：@Transactional 方法被容器管理的 Bean 调用时，调用先经过代理，代理开启/提交事务再转发到目标方法。',
    whyHere: '当前代码在同一个类里直接调用本类标有 @Transactional 的方法。同类内部调用不经过代理（this 引用直接指向目标对象），事务拦截器没有机会介入。',
    hiddenMechanisms: '代理只拦截从外部进入 Bean 的调用；自调用走 this，绕过代理边界。事务传播、回滚规则、只读优化都挂在代理层。AspectJ 编译期/加载期织入与自调用的影响不同。',
    whatIfRemoved: '若移除这个调用路径的知识：代码看起来"有 @Transactional 就有事务"，实际该路径上的事务语义取决于调用入口；调用者自身的事务状态会静默影响写入行为。',
    question: {
      id: 'tx-self-invocation-q1',
      prompt: '基于代理的 Spring 事务中，同类内部 this.save() 调用标有 @Transactional 的 save() 时，事务拦截发生了什么？',
      options: [
        { id: 'a', text: '代理拦截该调用并正常开启事务' },
        { id: 'b', text: '调用直接到达目标对象，不经过代理，事务注解在该路径上不生效' },
        { id: 'c', text: '容器会自动检测自调用并改用编程式事务' },
      ],
      answerId: 'b',
      rationale: '自调用使用 this 引用，绕过代理对象；拦截器不在该路径上，注解的事务语义不会被应用。',
    },
    sources: [{ title: 'Spring Framework: Declarative Transaction Annotations', url: 'https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html' }],
  },
  'jpa.query-amplification': {
    title: 'JPA 循环内查询放大',
    what: '在循环体内调用 Spring Data Repository 的查询/写入方法时，每次迭代都会独立访问数据库（除非有一级缓存命中或显式批量）。',
    whyHere: '当前代码在循环里调用 Repository 方法。循环次数与数据库往返次数线性相关；这是查询放大（常见为 N+1）的典型形态。',
    hiddenMechanisms: 'findById 可能命中持久化上下文一级缓存而不再发 SQL；save 是合并写，不一定立即 flush；派生查询（findByX）按方法名生成 SQL。批处理需要 @BatchSize/IN 查询/join fetch 等显式手段。',
    whatIfRemoved: '若不理解该机制：看到循环里"只是一次方法调用"会误以为开销恒定；数据量增长后延迟按 N 倍放大，且不一定在开发数据量下暴露。',
    question: {
      id: 'jpa-loop-q1',
      prompt: '循环内每次调用 repository.findById(id)，下面哪个说法是正确的？',
      options: [
        { id: 'a', text: '每次调用都可能独立访问数据库；一级缓存命中时不发 SQL' },
        { id: 'b', text: 'JPA 会自动把循环内的调用合并为一次批量查询' },
        { id: 'c', text: '循环内调用 Repository 方法不产生任何数据库交互' },
      ],
      answerId: 'a',
      rationale: '每次 findById 默认先查持久化上下文，未命中则发 SQL；自动批量合并不存在，需显式批量策略。',
    },
    sources: [{ title: 'Spring Data JPA: Query Methods', url: 'https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html' }],
  },
  'jpa.entity-boundary': {
    title: 'Web 响应暴露 JPA 实体关系',
    what: 'REST 端点直接返回 JPA 实体时，序列化器按对象图遍历字段；实体的关系注解（@OneToMany 等）定义了可遍历的边界。',
    whyHere: '当前端点的声明返回类型携带带关系注解的实体。序列化进入关系字段时，可能触发延迟加载（额外 SQL）或把内部结构带出 API 边界。',
    hiddenMechanisms: '延迟加载在序列化时触发 SQL（Open Session in View 决定是否抛 LazyInitializationException）；双向关系可导致循环序列化；Jackson 的忽略注解与 DTO 映射可以截断遍历。',
    whatIfRemoved: '若忽略该边界：API 契约与持久化模型耦合——改实体字段即改 API；响应体积与 SQL 数量随关系增长；内部字段可能意外泄露。',
    question: {
      id: 'web-entity-q1',
      prompt: 'RestController 直接返回带 @OneToMany 延迟加载关系的实体，序列化时最典型的影响是什么？',
      options: [
        { id: 'a', text: '序列化器遍历到关系字段时触发额外加载；契约与持久化模型耦合' },
        { id: 'b', text: '关系字段会被 JPA 自动排除在 JSON 之外' },
        { id: 'c', text: '没有任何影响，实体与 DTO 序列化行为完全一致' },
      ],
      answerId: 'a',
      rationale: '序列化按对象图遍历；延迟字段在此过程中加载（或抛异常），且实体结构变化直接影响 API。',
    },
    sources: [{ title: 'Jakarta Persistence 3.2: Entity Relationships', url: 'https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2' }],
  },
};

/** The card for a binding, with current-code references injected. */
export function learningCard(binding: LearningBinding): LearningCard {
  const content = CARDS[binding.conceptId];
  return {
    conceptId: binding.conceptId, contentVersion: LEARNING_CONTENT_VERSION,
    title: content.title, codeRef: binding.codeRef, evidenceIds: binding.evidenceIds,
    findingId: binding.findingId, historicalSnapshot: true,
    what: content.what, whyHere: content.whyHere, hiddenMechanisms: content.hiddenMechanisms,
    whatIfRemoved: content.whatIfRemoved, question: content.question, sources: content.sources,
  };
}

export function conceptIds(): ConceptId[] {
  return Object.keys(CARDS) as ConceptId[];
}

/**
 * Cognitive debt: a personal, transparent heuristic. Factors, weights and
 * every exclusion are visible; unknown and unassessed are counted, never
 * silently treated as zero mastery or hidden from the total.
 */
export function debtSummary(state: LearningState): DebtSummary {
  const bindings = Object.values(state.bindings);
  const items = bindings.map(binding => {
    const excluded = binding.status === 'ignored';
    const impact = IMPACT[binding.impact];
    const gap = GAP[binding.status];
    const evidenceStrength = EVIDENCE_STRENGTH[binding.association];
    return {
      bindingId: binding.id, conceptId: binding.conceptId, codeRef: binding.codeRef,
      status: binding.status, statusLabel: STATUS_LABELS[binding.status],
      priority: excluded ? null : Number((impact * gap * evidenceStrength).toFixed(2)),
      impact, gap: excluded ? null : gap, evidenceStrength: excluded ? null : evidenceStrength,
      impactSource: `finding severity: ${binding.impact}`, evidenceSource: `association: ${binding.association}`,
      ...(excluded ? { exclusionReason: `ignored（${binding.ignoreReason ?? 'user-choice'}）` } : {}),
    };
  }).sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || a.bindingId.localeCompare(b.bindingId, 'en'));
  const active = items.filter(item => item.priority !== null);
  return {
    modelVersion: 'debt-model-v1',
    formula: 'priority = impact(severity) × gap(学习状态) × evidenceStrength(关联方式)；high=3/medium=2/low=1；unassessed 1.0、to-learn 0.8、learning 0.6、self-reported 0.4、stale 0.9、verified/ignored 0；direct 1.0、inferred 0.7、unknown 0.4',
    meaning: '数值是"尚未验证的理解对应的条件性风险敞口"启发式，不是能力评分，也不是缺陷数量。',
    scope: '按工作区本地计算，仅覆盖扫描发现并映射到学习绑定的概念。',
    deduplication: '同一 conceptId + 代码符号只保留一条绑定；代码变化转为 stale 而非新建。',
    total: Number(active.reduce((sum, item) => sum + (item.priority ?? 0), 0).toFixed(2)),
    calculatedCount: active.length,
    unknownCount: bindings.filter(b => b.association === 'unknown').length,
    unassessedCount: bindings.filter(b => b.status === 'unassessed').length,
    staleCount: bindings.filter(b => b.status === 'stale').length,
    ignoredCount: bindings.filter(b => b.status === 'ignored').length,
    inactiveCount: bindings.filter(b => !b.active).length,
    factors: { impact: { high: 3, medium: 2, low: 1 }, gap: GAP, evidenceStrength: { direct: 1.0, inferred: 0.7, unknown: 0.4 } },
    items,
  };
}