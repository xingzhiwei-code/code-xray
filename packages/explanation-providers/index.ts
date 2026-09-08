/**
 * Optional LLM explanation providers. Deterministic analysis never depends
 * on this module: every failure path falls back to the deterministic report
 * and the report object itself is never modified by an enhancement.
 *
 * The outbound context is minimal by construction: concept ids and the
 * deterministic card content only — no source code, no paths, no digests,
 * no evidence. A provider may only add explanation TEXT; any response that
 * tries to mint evidence, paths or findings is rejected.
 */
export interface EnhanceInput {
  conceptId: string; cardTitle: string;
  what: string; whyHere: string; hiddenMechanisms: string; whatIfRemoved: string;
  findingTitle: string; assumptions: string[]; uncertainties: string[];
}
export interface Enhancement { text: string; providerId: string; modelId?: string }
export type EnhancementFailure = 'timeout' | 'unreachable' | 'invalid-structure' | 'error';
export interface EnhanceOutcome { enhancement?: Enhancement; failure?: EnhancementFailure }

export interface ExplanationProvider {
  readonly id: string;
  /** 'stub' proves the local contract; 'unverified-remote' ships disabled until a real smoke runs. */
  readonly status: 'stub' | 'unverified-remote';
  /** Raw provider output; structured by enhanceFinding, never trusted blindly. */
  enhance(input: EnhanceInput, signal?: AbortSignal): Promise<unknown>;
}

/** Fields a provider must never add — enhancements cannot mint facts. */
const FORBIDDEN_KEYS = ['evidenceIds', 'evidence', 'path', 'file', 'line', 'digest', 'finding', 'findingId', 'severity'];

export async function enhanceFinding(
  provider: ExplanationProvider,
  input: EnhanceInput,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<EnhanceOutcome> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  try {
    const raw = await provider.enhance(input, signal);
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { failure: 'invalid-structure' };
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return { failure: 'invalid-structure' };
    if (FORBIDDEN_KEYS.some(key => key in parsed)) return { failure: 'invalid-structure' };
    const modelId = typeof parsed.modelId === 'string' ? parsed.modelId : undefined;
    return { enhancement: { text: parsed.text, providerId: provider.id, ...(modelId ? { modelId } : {}) } };
  } catch (error) {
    if (error instanceof SyntaxError) return { failure: 'invalid-structure' };
    if (signal.aborted && (error as Error)?.name === 'TimeoutError') return { failure: 'timeout' };
    if ((error as Error)?.name === 'AbortError') return { failure: 'timeout' };
    if (error instanceof TypeError) return { failure: 'unreachable' };
    return { failure: 'error' };
  }
}

/** Minimal context: concept + deterministic card + finding semantics. No source, no paths. */
export function enhanceInputFrom(parts: {
  conceptId: string; cardTitle: string; what: string; whyHere: string;
  hiddenMechanisms: string; whatIfRemoved: string;
  findingTitle: string; assumptions: string[]; uncertainties: string[];
}): EnhanceInput {
  return {
    conceptId: parts.conceptId, cardTitle: parts.cardTitle,
    what: parts.what, whyHere: parts.whyHere,
    hiddenMechanisms: parts.hiddenMechanisms, whatIfRemoved: parts.whatIfRemoved,
    findingTitle: parts.findingTitle, assumptions: parts.assumptions, uncertainties: parts.uncertainties,
  };
}

/** Test double with scripted responses — proves the local contract only. */
export function createStubProvider(script: Array<{ delayMs?: number; respond?: unknown; reject?: Error }>): ExplanationProvider {
  let call = 0;
  return {
    id: 'stub', status: 'stub',
    async enhance(_input: EnhanceInput, signal?: AbortSignal) {
      const step = script[Math.min(call++, script.length - 1)]!;
      if (step.delayMs) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, step.delayMs);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
      if (step.reject) throw step.reject;
      return step.respond;
    },
  };
}

/** OpenAI-compatible chat provider. Ships DISABLED until a real smoke test runs. */
export function createHttpProvider(config: { baseUrl: string; apiKey: string; model: string; id?: string }): ExplanationProvider {
  return {
    id: config.id ?? 'openai-compatible', status: 'unverified-remote',
    async enhance(input: EnhanceInput, signal?: AbortSignal) {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: '你是代码机制解释助手。只基于用户提供的内容补充解释与类比；不得编造证据、文件路径、行号或新事实。仅返回 JSON：{"text": "...", "modelId": "..."}' },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
        signal,
      });
      if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

/** Explicit opt-in only: all three env vars must be present. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): ExplanationProvider | undefined {
  const baseUrl = env.XRAY_PROVIDER_URL, apiKey = env.XRAY_PROVIDER_KEY, model = env.XRAY_PROVIDER_MODEL;
  if (!baseUrl || !apiKey || !model) return undefined;
  return createHttpProvider({ baseUrl, apiKey, model });
}

export const OUTBOUND_SCOPE = '概念 ID、学习卡四段确定性内容、发现标题、前提与未知列表——不含源码、路径、digest 或证据引用。';
