import { describe, expect, it } from 'vitest';
import {
  createStubProvider, enhanceFinding, enhanceInputFrom, providerFromEnv,
  type EnhanceInput,
} from '../packages/explanation-providers/index.js';

const INPUT: EnhanceInput = enhanceInputFrom({
  conceptId: 'spring.transaction-proxy', cardTitle: 'Spring 事务代理与同类调用',
  what: '声明式事务通过 AOP 代理实现。', whyHere: '同类内部调用不经过代理。',
  hiddenMechanisms: '代理只拦截外部调用。', whatIfRemoved: '事务语义取决于调用入口。',
  findingTitle: '同类调用需要核对事务代理边界',
  assumptions: ['适用于基于代理的事务拦截模式。'], uncertainties: ['未解析运行时 Bean 绑定。'],
});

describe('T009 AC08: provider contract and fallback', () => {
  it('accepts a structured enhancement from a valid provider response', async () => {
    const provider = createStubProvider([{ respond: { text: '代理边界类比：像门卫只检查从大门进来的人。', modelId: 'test-model' } }]);
    const outcome = await enhanceFinding(provider, INPUT, { timeoutMs: 1000 });
    expect(outcome.enhancement?.text).toContain('门卫');
    expect(outcome.enhancement?.providerId).toBe('stub');
    expect(outcome.enhancement?.modelId).toBe('test-model');
    expect(outcome.failure).toBeUndefined();
  });

  it('parses JSON-string responses and rejects structures without text', async () => {
    const provider = createStubProvider([
      { respond: JSON.stringify({ text: '来自字符串的增强。' }) },
      { respond: { noText: true } },
      { respond: { text: '' } },
      { respond: 'not json' },
    ]);
    expect((await enhanceFinding(provider, INPUT)).enhancement?.text).toContain('字符串');
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('invalid-structure');
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('invalid-structure');
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('invalid-structure');
  });

  it('rejects fabricated evidence, paths or findings — providers cannot mint facts', async () => {
    const provider = createStubProvider([
      { respond: { text: '解释', evidenceIds: ['ev_fake'] } },
      { respond: { text: '解释', path: 'src/Secret.java', line: 42 } },
      { respond: { text: '解释', finding: { id: 'f1', severity: 'high' } } },
    ]);
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('invalid-structure');
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('invalid-structure');
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('invalid-structure');
  });

  it('falls back on timeout without touching the deterministic chain', async () => {
    const provider = createStubProvider([{ delayMs: 5_000, respond: { text: 'too late' } }]);
    const outcome = await enhanceFinding(provider, INPUT, { timeoutMs: 50 });
    expect(outcome.enhancement).toBeUndefined();
    expect(outcome.failure).toBe('timeout');
  });

  it('classifies unreachable endpoints separately from other errors', async () => {
    const provider = createStubProvider([
      { reject: new TypeError('fetch failed') },
      { reject: new Error('provider HTTP 429') },
    ]);
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('unreachable');
    expect((await enhanceFinding(provider, INPUT)).failure).toBe('error');
  });

  it('keeps the outbound context minimal: no source, paths or digests', () => {
    const serialized = JSON.stringify(INPUT);
    expect(serialized).not.toMatch(/\.java|path|digest|src\/|evidence/i);
    expect(serialized).toContain('conceptId');
    expect(serialized).toContain('assumptions');
  });

  it('providers are replaceable through one port', async () => {
    const first = createStubProvider([{ respond: { text: 'A 的解释' } }]);
    const second = createStubProvider([{ respond: { text: 'B 的解释' } }]);
    expect((await enhanceFinding(first, INPUT)).enhancement?.text).toBe('A 的解释');
    expect((await enhanceFinding(second, INPUT)).enhancement?.text).toBe('B 的解释');
  });

  it('stays disabled unless all three env vars are explicitly set', () => {
    expect(providerFromEnv({})).toBeUndefined();
    expect(providerFromEnv({ XRAY_PROVIDER_URL: 'https://x' })).toBeUndefined();
    expect(providerFromEnv({ XRAY_PROVIDER_URL: 'https://x', XRAY_PROVIDER_KEY: 'k' })).toBeUndefined();
    const provider = providerFromEnv({ XRAY_PROVIDER_URL: 'https://x', XRAY_PROVIDER_KEY: 'k', XRAY_PROVIDER_MODEL: 'm' });
    expect(provider?.id).toBe('openai-compatible');
    expect(provider?.status).toBe('unverified-remote');
  });
});
