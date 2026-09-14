/**
 * Live contract smoke check. Run against a deployed backend BEFORE a classroom
 * session: `npm run smoke:api -- --base https://<host>`.
 *
 * WHY THIS EXISTS. The backend builds its HTTP responses as inline gin.H maps
 * inside handler bodies — there is no Go struct for most shapes, so nothing on
 * that side stops a field being renamed and no generator can be pointed at it.
 * types/api.ts was transcribed by hand. This script is the only thing that
 * notices when the wire and that transcription part ways.
 *
 * RAW FETCH, NOT services/apiClient — deliberate. The script's job is to judge
 * the envelope, and apiClient is the component that *interprets* the envelope:
 * routed through it, a wrong isRawEndpoint entry or a broken unwrap would be
 * invisible, because the thing under test would also be the instrument. A
 * diagnostic must not depend on the subsystem it diagnoses. Raw fetch also
 * keeps the script clear of the mock-API path and of import.meta.env, neither
 * of which exists sanely under plain Node.
 *
 * READ-ONLY BY CONSTRUCTION. See PROBES and probe() below: every request is a
 * hard-coded GET from a frozen table, there is no parameter that could add a
 * method or a body, and a runtime assertion rejects the table if a mutating
 * path ever appears in it. A smoke run must be safe against a live session.
 */

import type { HealthResponse, RoundsActiveResponse, PublicRound } from '../types/api';

/** Builds a runtime key list the COMPILER ties to the interface: the Record is
 *  exhaustive and exact, so adding or renaming a field in types/api.ts breaks
 *  this file until the list is updated. */
function keysOf<T extends object>(spec: Record<keyof T, true>): string[] {
  return Object.keys(spec);
}

const HEALTH_KEYS = keysOf<HealthResponse>({ status: true });
const ROUNDS_ACTIVE_KEYS = keysOf<RoundsActiveResponse>({ rounds: true });
const PUBLIC_ROUND_KEYS = keysOf<PublicRound>({
  id: true, round_number: true, status: true, batch_size: true, max_batch_size: true,
  customer_budget: true, market_price: true, cost_of_publishing: true, cost_of_discard: true,
  customer_count: true, feedback_joke_count: true, started_at: true, ended_at: true,
  is_popped_active: true,
});

type Envelope = 'raw' | 'wrapped';
interface Probe {
  path: string;
  envelope: Envelope;
  /** Declared keys to require on the payload. Empty = parses-as-JSON only. */
  keys: string[];
  /** Optional second pass over a nested element (e.g. one round in the list). */
  nested?: { label: string; pick: (payload: any) => unknown; keys: string[] };
  note?: string;
}

const PROBES: readonly Probe[] = Object.freeze([
  { path: '/health', envelope: 'raw', keys: HEALTH_KEYS },
  {
    path: '/health/detailed', envelope: 'raw', keys: [],
    // DELIBERATELY UNTYPED: handler/health.go:45-48 returns whatever
    // usecase.HealthService.Check produces. There is no fixed shape to assert.
    note: 'untyped by design — checked only for 2xx + valid JSON',
  },
  {
    path: '/v1/rounds/active', envelope: 'wrapped', keys: ROUNDS_ACTIVE_KEYS,
    nested: { label: 'rounds[0]', pick: (p) => p?.rounds?.[0], keys: PUBLIC_ROUND_KEYS },
  },
]);

/** Belt-and-braces: nothing mutating may enter the table above. */
const MUTATING = /join|publish|assign|start|end|reset|config|popups|batches|login|users/i;
for (const p of PROBES) {
  if (MUTATING.test(p.path)) throw new Error(`refusing to probe a mutating path: ${p.path}`);
}

function parseBase(argv: string[]): string {
  const i = argv.indexOf('--base');
  const flag = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith('--base='))?.slice(7);
  const base = flag || process.env.APP_BASE_URL || 'http://localhost:8080';
  return base.replace(/\/+$/, '');
}

function describe(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string } };
  const code = e?.cause?.code;
  return `${e?.message ?? String(err)}${code ? ` (${code})` : ''}`;
}

interface Result { ok: boolean; line: string; warnings: string[] }

function checkKeys(label: string, value: unknown, keys: string[]): { missing: string[]; extra: string[] } | string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} is ${Array.isArray(value) ? 'an array' : String(value)}, expected an object`;
  }
  const present = Object.keys(value as Record<string, unknown>);
  return {
    missing: keys.filter((k) => !present.includes(k)),
    extra: keys.length ? present.filter((k) => !keys.includes(k)) : [],
  };
}

async function probe(base: string, p: Probe): Promise<Result> {
  const url = `${base}${p.path}`;
  const warnings: string[] = [];
  let resp: Response;
  try {
    // GET only. No method, no body, no caller-supplied options — by design.
    resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (err) {
    return { ok: false, line: `FAIL ${p.path} — unreachable at ${url}: ${describe(err)}`, warnings };
  }

  if (!resp.ok) return { ok: false, line: `FAIL ${p.path} — HTTP ${resp.status} ${resp.statusText}`.trim(), warnings };

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { ok: false, line: `FAIL ${p.path} — 2xx but the body is not valid JSON`, warnings };
  }

  let payload = body;
  if (p.envelope === 'wrapped') {
    if (body === null || typeof body !== 'object' || !('data' in body)) {
      return { ok: false, line: `FAIL ${p.path} — expected a {data} envelope, got a bare body`, warnings };
    }
    payload = (body as { data: unknown }).data;
  } else if (body !== null && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    warnings.push(`${p.path}: declared RAW but the body has a "data" key — check the envelope`);
  }

  if (!p.keys.length) return { ok: true, line: `PASS ${p.path}${p.note ? ` (${p.note})` : ''}`, warnings };

  const targets: Array<{ label: string; value: unknown; keys: string[] }> = [
    { label: p.path, value: payload, keys: p.keys },
  ];
  if (p.nested) {
    const v = p.nested.pick(payload);
    if (v === undefined) warnings.push(`${p.path}: no ${p.nested.label} to inspect (empty list) — fields unverified`);
    else targets.push({ label: `${p.path} ${p.nested.label}`, value: v, keys: p.nested.keys });
  }

  const missing: string[] = [];
  for (const t of targets) {
    const r = checkKeys(t.label, t.value, t.keys);
    if (typeof r === 'string') return { ok: false, line: `FAIL ${p.path} — ${r}`, warnings };
    missing.push(...r.missing.map((k) => `${t.label}.${k}`));
    if (r.extra.length) warnings.push(`${t.label}: undeclared key(s) ${r.extra.join(', ')} — backend added a field`);
  }

  if (missing.length) return { ok: false, line: `FAIL ${p.path} — missing key(s): ${missing.join(', ')}`, warnings };
  return { ok: true, line: `PASS ${p.path}`, warnings };
}

async function main(): Promise<void> {
  const base = parseBase(process.argv.slice(2));
  console.log(`smoke-api: read-only contract check against ${base}\n`);
  if (String(process.env.VITE_USE_MOCK_API ?? '').toLowerCase() === 'true') {
    console.log('NOTE  VITE_USE_MOCK_API=true is set and is being IGNORED — this script uses raw');
    console.log('      fetch and never loads services/mockApi. Results below are from a real server.\n');
  }

  const [health, ...rest] = PROBES;
  const first = await probe(base, health);
  console.log(first.line);
  first.warnings.forEach((w) => console.log(`WARN  ${w}`));
  if (!first.ok) {
    console.error(`\nAborting: /health did not pass at ${base}. Is the backend running and is ${base} the right base URL?`);
    process.exit(1);
  }

  let failed = 0;
  for (const p of rest) {
    const r = await probe(base, p);
    console.log(r.line);
    r.warnings.forEach((w) => console.log(`WARN  ${w}`));
    if (!r.ok) failed++;
  }

  console.log(`\n${failed ? `${failed} check(s) FAILED against ${base}` : `all ${PROBES.length} checks passed against ${base}`}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`smoke-api: unexpected error — ${describe(err)}`);
  process.exit(1);
});
