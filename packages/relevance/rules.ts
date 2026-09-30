/**
 * Relevance rule vocabulary (T303 §9—§13). Everything the gate knows is here:
 * versioned, exported, tested. No hidden magic — thresholds are named
 * constants, term tables are closed vocabularies matched against task text
 * (data) and relative paths. Bilingual (zh/en) because tasks arrive in both.
 */

export const RELEVANCE_RULES_VERSION = 'relevance-rules-v1';

/** More changed files than this ⇒ high-impact change (§11 影响范围大) ⇒ FULL. */
export const LARGE_CHANGE_FILES = 10;
/** Small change bound used for knowledge-verified downgrades and backend skips. */
export const SMALL_CHANGE_FILES = 5;
/** Minimum observed usages before familiarity may drive a SKIP (§12/§13). */
export const SKIP_MIN_OBSERVATIONS = 3;
/** Path targets attached to a LIGHT/FULL decision (keep agent output small). */
export const TARGET_PATH_LIMIT = 10;

export interface RiskTermRule {
  label: string;
  riskClass: 'critical' | 'moderate';
  pattern: RegExp;
  /** Review focus pointers (§10/§11 targets). */
  focus: string[];
  /** Engine conceptIds this term maps to (knowledge-state downgrade only when ALL are verified). */
  conceptIds?: string[];
}

/**
 * CRITICAL: high-risk domains (§11) ⇒ FULL. A downgrade to LIGHT requires
 * positive verified concept knowledge + small change — never familiarity
 * alone (§13: 熟悉技术 ≠ 熟悉当前问题).
 */
export const CRITICAL_RISK_TERMS: RiskTermRule[] = [
  { label: 'payment/支付', riskClass: 'critical', pattern: /payment|payments|支付|付款|收银|checkout|payout|打款/, focus: ['payment flow', 'transaction boundary', 'idempotency', 'state transition', 'data consistency', 'historical risk'] },
  { label: 'transaction/事务', riskClass: 'critical', pattern: /transaction|transactional|事务|@transactional/, focus: ['transaction boundary', 'idempotency', 'data consistency'], conceptIds: ['spring.transaction-boundary', 'spring.transaction-proxy'] },
  { label: 'refund/退款结算', riskClass: 'critical', pattern: /refund|退款|settlement|结算|billing|计费|账单|invoice|发票|wallet|钱包|balance|余额|资金/, focus: ['money flow', 'idempotency', 'state transition', 'data consistency'] },
  { label: 'order-state/订单状态流转', riskClass: 'critical', pattern: /订单状态|order[- ]?state|state[- ]machine|状态机|状态流转|state[- ]transition/, focus: ['state transition', 'idempotency', 'data consistency', 'historical risk'] },
  { label: 'idempotency/幂等', riskClass: 'critical', pattern: /idempoten|幂等/, focus: ['idempotency', 'retry semantics'] },
  { label: 'concurrency/并发', riskClass: 'critical', pattern: /concurren|并发|竞态|race[- ]condition|deadlock|死锁|分布式锁/, focus: ['concurrency', 'lock boundary', 'data consistency'] },
  { label: 'distributed/分布式一致性', riskClass: 'critical', pattern: /distributed|分布式|consistency|一致性|cap\b/, focus: ['distributed-system boundary', 'data consistency'] },
  { label: 'db-migration/数据库迁移', riskClass: 'critical', pattern: /数据库迁移|数据迁移|db migration|schema (change|migration)|flyway|liquibase|migration script|迁移脚本/, focus: ['migration safety', 'backward compatibility', 'rollback plan'] },
  { label: 'crypto/加密凭据', riskClass: 'critical', pattern: /encrypt|decrypt|加密|解密|crypto|credential|凭据|secret|密钥|password|密码/, focus: ['credential handling', 'secret exposure', 'crypto correctness'] },
  { label: 'fraud/风控', riskClass: 'critical', pattern: /fraud|欺诈|风控|risk[- ]control|kyc|反洗钱|aml\b/, focus: ['risk control', 'data consistency', 'audit trail'] },
];

/**
 * MODERATE: risk-relevant but scope-narrowable (§10). Frontend-only small
 * changes ⇒ LIGHT with focused targets; backend/Java or larger ⇒ FULL.
 */
export const MODERATE_RISK_TERMS: RiskTermRule[] = [
  { label: 'auth/认证鉴权', riskClass: 'moderate', pattern: /auth\b|authenticat|authorizat|认证|鉴权|授权|权限|permission|access[- ]control|登录|login|rbac|oauth|sso\b/, focus: ['authorization boundary', 'existing auth abstraction', 'relevant symbols'] },
  { label: 'session/会话', riskClass: 'moderate', pattern: /session|会话/, focus: ['session handling', 'authorization boundary'] },
  { label: 'security/安全', riskClass: 'moderate', pattern: /security|安全|xss|csrf|injection|注入|越权/, focus: ['security boundary', 'input validation'] },
  { label: 'token/令牌', riskClass: 'moderate', pattern: /token|令牌|jwt/, focus: ['token handling', 'authorization boundary'] },
  { label: 'entity-boundary/实体暴露', riskClass: 'moderate', pattern: /实体关系|entity relation|lazy[- ]?load|延迟加载|n\+1|循环查询|query amplification/, focus: ['entity boundary', 'query amplification'], conceptIds: ['jpa.entity-boundary', 'jpa.persistence-context', 'jpa.query-amplification'] },
];

/** Routine UI task vocabulary (§9 普通 UI/按钮/样式/文案): task-class driven, low-risk by nature. */
export const ROUTINE_UI_TASK = /button|按钮|loading|加载状态|加载动画|spinner|样式|style\b|css|文案|措辞|copywriting|i18n|国际化|翻译|表单|form\b|icon|图标|间距|padding|margin|颜色|color\b|字体|font|布局|layout|动画|animation|tooltip|placeholder|对齐|alignment|圆角|border-radius|阴影|shadow|typo|错别字|拼写|ui 微调|界面微调/;

/** Routine TypeScript-level tasks (§22: type rename → SKIP/LIGHT). */
export const ROUTINE_TYPE_TASK = /类型重命名|类型修改|类型调整|重命名(类型|接口)|rename (a )?type|type (rename|alias change)|interface rename/;

/** New library / dependency integration (§22 → LIGHT floor). */
export const NEW_LIBRARY_TASK = /接入|集成|integrate|integration|新增依赖|添加依赖|引入(库|框架|依赖)|new (library|dependency|package)|升级(依赖|版本)|upgrade (dependency|package)|版本升级/;

/** Unknown-architecture / large-refactor tasks (§22 → LIGHT floor, FULL when large). */
export const ARCHITECTURE_TASK = /架构|architecture|陌生的?代码|unknown codebase|legacy|遗留系统|大规模重构|large(-| )scale refactor|拆分模块|模块拆分/;

/** Pure routine asset/style/markup/doc extensions — SKIP class when no risk term hits. */
export const ROUTINE_ASSET_EXTENSIONS = new Set([
  'css', 'scss', 'less', 'sass', 'html', 'htm', 'svg', 'md', 'markdown', 'txt',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif', 'woff', 'woff2', 'ttf', 'eot', 'otf',
]);

/** Frontend code extensions: SKIP requires observed familiarity (§12: claims alone never skip). */
export const FRONTEND_CODE_EXTENSIONS = new Set(['tsx', 'jsx', 'vue', 'svelte', 'ts', 'mts', 'cts', 'js', 'mjs', 'cjs']);

/** Path segments marking shared/core infrastructure (§11 修改共享基础设施/公共 API ⇒ FULL). */
export const SHARED_CORE_SEGMENTS = new Set(['core', 'common', 'shared', 'domain', 'infrastructure', 'kernel', 'base', 'sdk', 'platform', 'api']);

/** Migration-ish paths (files or well-known directories). */
export const MIGRATION_PATH = /\.sql$|(^|\/)(db|database|migrations?)\/|flyway|liquibase|changelog/i;

/** Source extensions that count as "code" for shared-core detection. */
export const CODE_EXTENSIONS = new Set([...FRONTEND_CODE_EXTENSIONS, 'java', 'kt', 'py', 'go', 'rs', 'rb', 'php', 'swift', 'cs', 'sql']);

/** Extensions the current engine can deeply analyze (v1: Java only). */
export const ANALYZABLE_EXTENSIONS = new Set(['java']);
