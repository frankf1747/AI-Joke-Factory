/**
 * Layer 1 of the end-to-end suite: a fast, read-only coherence check on the
 * DEPLOYED stack. Run it before the heavier layers; if this fails, nothing
 * below it is worth debugging.
 *
 *   standalone:  npx tsx scripts/e2e/preflight.ts [--fe <url>] [--be <url>]
 *   imported:    import { preflight } from './preflight'
 *
 * WHY A SEPARATE LAYER. scripts/smoke-api.ts answers "does the backend still
 * send the shapes types/api.ts claims?". It says nothing about the *pair*: the
 * SWA and the Container App are deployed by two unrelated pipelines, and the
 * frontend's backend URL is BAKED IN AT BUILD TIME, so both halves can be
 * individually healthy while the deployment as a whole is broken. That is the
 * failure this file exists to catch — see CHECK 5.
 *
 * RAW FETCH, NOT services/apiClient — same reasoning as smoke-api.ts, and one
 * more besides. apiClient is the component that decides which base URL to call
 * and whether to answer from services/mockApi instead; routed through it, a
 * wrong VITE_API_BASE_URL or a mock-mode build would be invisible, because the
 * thing under test would also be the instrument. A diagnostic must not depend
 * on the subsystem it diagnoses. Raw fetch also keeps this file clear of
 * import.meta.env, which does not exist sanely under plain Node.
 *
 * READ-ONLY BY CONSTRUCTION. See PLAN, SAFE_METHODS and request() below: the
 * method is drawn from a three-value union, every static request is declared in
 * a frozen table that is asserted at module load, and request() re-asserts
 * method and path on EVERY call — including the one URL discovered at runtime
 * (the hashed bundle). There is no parameter anywhere that could add a body. A
 * preflight run must be safe against a live classroom session.
 *
 * NO DEPENDENCIES, Node 20+ built-in fetch, ESM. Run with tsx.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Targets ---------------------------------------------------------------

/** Azure Static Web Apps. Deployed by .github/workflows/azure-static-web-apps.yml. */
export const DEFAULT_FE = 'https://kind-sky-0ccf01e0f.3.azurestaticapps.net';
/** Azure Container Apps. The URL netlify.toml and the SWA workflow both bake in. */
export const DEFAULT_BE = 'https://jokefactory-api.whitepebble-2daa4226.westus2.azurecontainerapps.io';

/** A deep SPA route that exists only in the client router — never on disk. */
const DEEP_ROUTE = '/instructor';

const NET_TIMEOUT_MS = 15_000;
/** The bundle is ~800 KB and Container Apps can be cold; give it more room. */
const BUNDLE_TIMEOUT_MS = 30_000;

// ---- Read-only guard -------------------------------------------------------

type SafeMethod = 'GET' | 'HEAD' | 'OPTIONS';
const SAFE_METHODS: readonly string[] = Object.freeze(['GET', 'HEAD', 'OPTIONS']);

/** Same word list smoke-api.ts refuses, plus the phase-3B marketing verbs. */
const MUTATING = /join|publish|assign|start|end|reset|config|popups|batches|login|users|split/i;

/**
 * Hashed build outputs are exempt from the word check and allow-listed by shape
 * instead. Vite names them /assets/index-<base64ish>.js, and a hash is free to
 * contain the letters "end" or "join" — failing a run over that would be a
 * false alarm about a GET for a static file, which cannot mutate anything. The
 * shape is narrow enough to be its own guarantee: no traversal, no query.
 */
const ASSET_PATH = /^\/assets\/[A-Za-z0-9._-]+\.(js|css)$/;

interface PlannedRequest { method: SafeMethod; target: 'fe' | 'be'; path: string; why: string }

/** Every request this script makes, except the hashed bundle URL that CHECK 5
 *  reads out of the served index.html. That one goes through the same guard. */
const PLAN: readonly PlannedRequest[] = Object.freeze([
  { method: 'GET', target: 'be', path: '/health', why: 'liveness + the one raw {status} body' },
  { method: 'GET', target: 'be', path: '/health/detailed', why: '2xx + valid JSON; shape unasserted on purpose' },
  { method: 'GET', target: 'be', path: '/v1/rounds/active', why: 'the {data} envelope on a real /v1 route' },
  { method: 'GET', target: 'fe', path: '/', why: 'the SWA serves the app shell' },
  { method: 'GET', target: 'fe', path: DEEP_ROUTE, why: 'navigationFallback rewrites a deep route to index.html' },
  { method: 'OPTIONS', target: 'be', path: '/v1/rounds/active', why: 'CORS preflight from the SWA origin' },
]);

for (const r of PLAN) {
  if (!SAFE_METHODS.includes(r.method)) throw new Error(`refusing a non-safe method in PLAN: ${r.method} ${r.path}`);
  if (MUTATING.test(r.path)) throw new Error(`refusing to probe a mutating path: ${r.path}`);
}

// ---- Plumbing --------------------------------------------------------------

export interface Check { name: string; ok: boolean; detail: string; ms: number }
export interface PreflightReport { ok: boolean; checks: Check[] }

function describe(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string } };
  const code = e?.cause?.code;
  return `${e?.message ?? String(err)}${code ? ` (${code})` : ''}`;
}

/** Trailing slashes off, so a base URL typed either way compares equal. */
function normalizeBase(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

interface Res { status: number; statusText: string; headers: Headers; body: string }

/**
 * The single chokepoint. Method comes from a three-value union, there is no
 * body parameter, and both assertions run again here rather than only over PLAN
 * — that is what makes the runtime-discovered bundle URL safe too.
 */
async function request(
  method: SafeMethod,
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Res> {
  if (!SAFE_METHODS.includes(method)) throw new Error(`refusing a non-safe method: ${method} ${url}`);
  const path = new URL(url).pathname;
  if (!ASSET_PATH.test(path) && MUTATING.test(path)) {
    throw new Error(`refusing to request a mutating path: ${method} ${path}`);
  }
  const resp = await fetch(url, {
    method,
    headers: opts.headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(opts.timeoutMs ?? NET_TIMEOUT_MS),
  });
  return { status: resp.status, statusText: resp.statusText, headers: resp.headers, body: await resp.text() };
}

function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

/** First ~90 chars of a body, on one line — enough to recognise an Azure error
 *  page or an HTML 404 where JSON was expected. */
function snippet(body: string): string {
  const s = body.replace(/\s+/g, ' ').trim();
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

type Outcome = { ok: boolean; detail: string };

/**
 * A transport failure — DNS, connection refused, TLS, the 15s timeout — is not
 * a contract failure, and saying "unexpected error: fetch failed" would tell
 * the reader nothing. Every remote call is wrapped so the message names the
 * host that did not answer and where to look next.
 */
function unreachable(url: string, err: unknown, hint: string): Outcome {
  return { ok: false, detail: `unreachable at ${url}: ${describe(err)} — ${hint}` };
}

async function timed(name: string, fn: () => Promise<Outcome>): Promise<Check> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { name, ok: r.ok, detail: r.detail, ms: Math.round(performance.now() - t0) };
  } catch (err) {
    // An unexpected throw is a failed check, never a crashed run — the parent
    // orchestrator needs the other checks' results regardless. Every expected
    // transport failure is diagnosed at its call site, so anything reaching
    // here is a bug in THIS script rather than a finding about the deployment.
    return {
      name,
      ok: false,
      detail: `the check itself threw — ${describe(err)}. This is a fault in scripts/e2e/preflight.ts, not a verdict on the deployment.`,
      ms: Math.round(performance.now() - t0),
    };
  }
}

// ---- The served frontend, fetched once and shared ---------------------------

/** index.html and the bundle are each wanted by more than one check; fetch them
 *  once. Failures are memoised too, so a dead SWA is reported by every check
 *  that needed it without hammering it. */
function makeSite(fe: string) {
  let shellP: Promise<Res> | null = null;
  let bundleP: Promise<{ url: string; text: string; others: string[] }> | null = null;

  const shell = () => (shellP ??= request('GET', `${fe}/`));

  const bundle = () =>
    (bundleP ??= (async () => {
      const html = await shell();
      if (html.status !== 200) {
        throw new Error(`cannot look at the bundle: ${fe}/ returned HTTP ${html.status} — fix the shell check first`);
      }
      // Prefer the <script type="module"> Vite injects; fall back to any
      // /assets/*.js reference so a changed build output still resolves.
      const mod = /<script[^>]+type="module"[^>]*\ssrc="([^"]+\.js)"/i.exec(html.body)?.[1];
      const all = [...html.body.matchAll(/["'](\/assets\/[A-Za-z0-9._-]+\.js)["']/g)].map((m) => m[1]);
      const picked = mod ?? all[0];
      if (!picked) {
        throw new Error(
          'no /assets/*.js reference in the served index.html — if it points at "/index.tsx" instead, ' +
            'the workflow uploaded the repo root rather than dist/ (app_location must be "dist")',
        );
      }
      const url = new URL(picked, `${fe}/`).toString();
      const res = await request('GET', url, { timeoutMs: BUNDLE_TIMEOUT_MS });
      if (res.status !== 200) throw new Error(`${picked} returned HTTP ${res.status} — the SWA is serving a partial deploy`);
      return { url, text: res.body, others: all.filter((p) => p !== picked) };
    })());

  return { shell, bundle };
}

type Site = ReturnType<typeof makeSite>;

// ---- CHECK 1a/1b/1c: backend reachability + envelope contract ---------------

/**
 * /health and /health/detailed are RAW; everything under /v1 is wrapped in
 * {data} (app/http/response/response.go:14-16, and the RAW rows in
 * types/api.ts). Getting the envelope wrong in either direction means the
 * backend is not the image this frontend was built against.
 */
async function checkHealth(be: string): Promise<Outcome> {
  const url = `${be}/health`;
  let res: Res;
  try {
    res = await request('GET', url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    return {
      ok: false,
      detail:
        `unreachable at ${url}: ${describe(err)} — either the Container App has no healthy revision ` +
        '(portal → Container App → Revisions, or `az containerapp logs show`), or --be/BE_BASE_URL is pointing somewhere ' +
        'that is not the backend at all.',
    };
  }
  if (res.status !== 200) {
    return {
      ok: false,
      detail:
        `HTTP ${res.status} ${res.statusText} — something answered, so DNS and ingress are fine and the container is not. ` +
        `A 5xx here is usually a revision that started and then failed its own health probe. Body: ${snippet(res.body)}`,
    };
  }
  const parsed = parseJson(res.body);
  if (!parsed.ok) {
    return {
      ok: false,
      detail: `200 but the body is not JSON — something in front of the app is answering (an ingress error page, a proxy). Body: ${snippet(res.body)}`,
    };
  }
  const v = parsed.value as Record<string, unknown> | null;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return { ok: false, detail: `expected an object, got ${Array.isArray(v) ? 'an array' : String(v)} — not this backend's /health.` };
  }
  if ('data' in v) {
    return {
      ok: false,
      detail:
        '/health came back WRAPPED in {data}. types/api.ts lists it as RAW and services/apiClient.ts unwraps by ' +
        'endpoint (isRawEndpoint), so this would break the client. Check the handler and the isRawEndpoint list.',
    };
  }
  if (!('status' in v)) {
    return { ok: false, detail: `missing "status" (HealthResponse, types/api.ts) — got keys: ${Object.keys(v).join(', ') || '(none)'}` };
  }
  return { ok: true, detail: `200 raw {status:"${String(v.status)}"}` };
}

/** Once /health is unreachable every other backend check fails the same way for
 *  the same reason; say so instead of repeating the whole diagnosis. */
const SAME_AS_HEALTH = 'the same transport failure /health reports above. Fix that one first — nothing here is independent of it.';

async function checkHealthDetailed(be: string): Promise<Outcome> {
  const url = `${be}/health/detailed`;
  let res: Res;
  try {
    res = await request('GET', url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    return unreachable(url, err, SAME_AS_HEALTH);
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      detail:
        `HTTP ${res.status} ${res.statusText} — /health is the liveness probe, this one also touches the database ` +
        '(usecase.HealthService.Check). A failure here with /health passing means the app is up but its Postgres ' +
        `connection is not. Body: ${snippet(res.body)}`,
    };
  }
  if (!parseJson(res.body).ok) {
    return { ok: false, detail: `2xx but the body is not valid JSON. Body: ${snippet(res.body)}` };
  }
  // DELIBERATELY UNASSERTED: this endpoint returns whatever the health service
  // produces (handler/health.go:45-48). types/api.ts declines to type it; so do we.
  return { ok: true, detail: `2xx, valid JSON (shape unasserted by design) — ${snippet(res.body)}` };
}

async function checkRoundsActive(be: string): Promise<Outcome> {
  const url = `${be}/v1/rounds/active`;
  let res: Res;
  try {
    res = await request('GET', url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    return unreachable(url, err, SAME_AS_HEALTH);
  }
  if (res.status !== 200) {
    return {
      ok: false,
      detail:
        `HTTP ${res.status} ${res.statusText} — /health passing while a /v1 route does not usually means the router ` +
        `is mounted but the database is unreachable. Body: ${snippet(res.body)}`,
    };
  }
  const parsed = parseJson(res.body);
  if (!parsed.ok) return { ok: false, detail: `200 but not JSON. Body: ${snippet(res.body)}` };
  const body = parsed.value as Record<string, unknown> | null;
  if (body === null || typeof body !== 'object' || Array.isArray(body) || !('data' in body)) {
    return {
      ok: false,
      detail:
        'expected the {data} envelope every /v1 route uses (app/http/response/response.go:14-16). A bare body means ' +
        'either an older backend image or something rewriting responses in front of it — and services/apiClient.ts ' +
        `would hand components the wrong object either way. Body: ${snippet(res.body)}`,
    };
  }
  const data = (body as { data: unknown }).data as Record<string, unknown> | null;
  if (data === null || typeof data !== 'object' || Array.isArray(data) || !('rounds' in data)) {
    return { ok: false, detail: `{data} present but no "rounds" key (RoundsActiveResponse, types/api.ts). Got: ${snippet(JSON.stringify(data))}` };
  }
  const rounds = (data as { rounds: unknown }).rounds;
  if (!Array.isArray(rounds)) {
    return { ok: false, detail: `"rounds" is ${rounds === null ? 'null' : typeof rounds}, expected an array — handler/round.go allocates it with make(), so null is drift.` };
  }
  // The name lies: no status filter is applied (see RoundsActiveResponse in
  // types/api.ts), so this count is every round in the table.
  return { ok: true, detail: `{data:{rounds}} envelope ok — ${rounds.length} round(s) in the table (unfiltered by status)` };
}

// ---- CHECK 2: the SWA serves the app shell ---------------------------------

async function checkShell(site: Site, fe: string): Promise<Outcome> {
  let res: Res;
  try {
    res = await site.shell();
  } catch (err) {
    return { ok: false, detail: `unreachable at ${fe}/: ${describe(err)} — check the Static Web App exists and that --fe/FE_BASE_URL is its hostname.` };
  }
  if (res.status !== 200) {
    return {
      ok: false,
      detail:
        `HTTP ${res.status} ${res.statusText} — the SWA may still be deploying, or the last workflow run failed. ` +
        'Check the "Build and deploy" job in .github/workflows/azure-static-web-apps.yml.',
    };
  }
  const ct = res.headers.get('content-type') ?? '(none)';
  if (!/text\/html/i.test(ct)) {
    return { ok: false, detail: `content-type is "${ct}", not text/html — that is not the app shell.` };
  }
  // The documented catastrophe: app_location '/' uploads the repo ROOT, whose
  // index.html still points at the TypeScript entry. The browser dies with an
  // octet-stream MIME error and the page is blank. See the long comment on the
  // Deploy step in .github/workflows/azure-static-web-apps.yml.
  if (/src="\/index\.tsx"/i.test(res.body)) {
    return {
      ok: false,
      detail:
        'the served index.html points at /index.tsx — THE REPO ROOT WAS UPLOADED INSTEAD OF dist/. The browser will ' +
        'refuse it with "Expected a JavaScript-or-Wasm module script…". Fix app_location: \'dist\' in ' +
        '.github/workflows/azure-static-web-apps.yml and redeploy.',
    };
  }
  const missing = [
    /<div id="root">/i.test(res.body) ? null : '<div id="root">',
    /\/assets\/[A-Za-z0-9._-]+\.js/.test(res.body) ? null : 'a hashed /assets/*.js script',
    /<title>The Joke Factory<\/title>/i.test(res.body) ? null : '<title>The Joke Factory</title>',
  ].filter((x): x is string => x !== null);
  if (missing.length) {
    return {
      ok: false,
      detail: `200 text/html but it is not this app's shell — missing ${missing.join(', ')}. Something else is answering on this hostname. Body: ${snippet(res.body)}`,
    };
  }
  return { ok: true, detail: `200 text/html, ${res.body.length} B, hashed bundle referenced, #root present` };
}

// ---- CHECK 3: SPA fallback for deep routes ---------------------------------

/**
 * public/staticwebapp.config.json declares navigationFallback → /index.html
 * with /assets/* excluded. Without that file in the deployed output, SWA 404s
 * every route the client router owns — the app works only if you enter through
 * "/" and never reload.
 */
async function checkSpaFallback(site: Site, fe: string): Promise<Outcome> {
  const url = `${fe}${DEEP_ROUTE}`;
  let res: Res;
  try {
    res = await request('GET', url, { headers: { Accept: 'text/html' } });
  } catch (err) {
    return unreachable(url, err, 'the SWA did not answer at all — see the app shell check above, which hits the same host.');
  }
  if (res.status === 404) {
    return {
      ok: false,
      detail:
        `HTTP 404 on ${DEEP_ROUTE} — navigationFallback is not in effect. public/staticwebapp.config.json must end up ` +
        'at the ROOT of dist/ (Vite copies public/ verbatim, so confirm it survived the build and that the workflow ' +
        'uploaded dist/). Until it does, every deep link and every page reload dead-ends on an SWA 404 page.',
    };
  }
  if (res.status !== 200) {
    return { ok: false, detail: `HTTP ${res.status} ${res.statusText} on ${DEEP_ROUTE} — expected the rewritten index.html. Body: ${snippet(res.body)}` };
  }
  if (!/<div id="root">/i.test(res.body) || !/\/assets\/[A-Za-z0-9._-]+\.js/.test(res.body)) {
    return {
      ok: false,
      detail: `200 but the body is not index.html — the rewrite is serving something else for ${DEEP_ROUTE}. Body: ${snippet(res.body)}`,
    };
  }
  // Byte-identical to "/" is the proof it is a rewrite (same document) and not
  // some other page that happens to look app-shaped.
  let sameAsRoot = false;
  try {
    sameAsRoot = (await site.shell()).body === res.body;
  } catch {
    /* the shell check already reported this */
  }
  return {
    ok: true,
    detail: sameAsRoot
      ? `200, byte-identical to ${fe}/ — navigationFallback is rewriting, not redirecting`
      : '200 and index.html-shaped, though it differs byte-for-byte from "/" — worth a look if the app misbehaves on reload',
  };
}

// ---- CHECK 4: CORS ---------------------------------------------------------

/**
 * The browser calls the Container App cross-origin on every single request. If
 * the preflight is not permissive the app is dead in exactly the way that looks
 * like a frontend bug: a blank screen and CORS errors in a console nobody has
 * open. Cheap to check, so check it.
 */
async function checkCors(be: string, fe: string): Promise<Outcome> {
  const url = `${be}/v1/rounds/active`;
  let res: Res;
  try {
    res = await request('OPTIONS', url, {
      headers: {
        Origin: fe,
        'Access-Control-Request-Method': 'GET',
        // The app sends this on /market and /feedback (types/api.ts), so the
        // preflight must allow it or those two views break on their own.
        'Access-Control-Request-Headers': 'content-type, x-user-id',
      },
    });
  } catch (err) {
    return unreachable(url, err, 'the preflight never reached the backend, so CORS itself is UNVERIFIED rather than broken — resolve the reachability failures above and run again.');
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      detail:
        `preflight returned HTTP ${res.status} ${res.statusText} — the CORS middleware is not handling OPTIONS on /v1 ` +
        'routes (or an ingress rule is swallowing it). Every browser request will fail before it is even sent.',
    };
  }
  const allowOrigin = res.headers.get('access-control-allow-origin');
  const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
  const allowHeaders = res.headers.get('access-control-allow-headers') ?? '';
  if (!allowOrigin) {
    return {
      ok: false,
      detail:
        `2xx but no Access-Control-Allow-Origin. The browser blocks the response and the app shows an empty screen ` +
        `with only a CORS error. Add ${fe} (or *) to the backend's allowed origins.`,
    };
  }
  if (allowOrigin !== '*' && normalizeBase(allowOrigin) !== normalizeBase(fe)) {
    return {
      ok: false,
      detail:
        `Access-Control-Allow-Origin is "${allowOrigin}", which is neither * nor ${fe} — the backend is configured for a ` +
        'DIFFERENT frontend origin. Whoever set the allowed origins used the Netlify host or an older SWA hostname.',
    };
  }
  if (!/\bGET\b/i.test(allowMethods)) {
    return { ok: false, detail: `Access-Control-Allow-Methods is "${allowMethods || '(absent)'}" and does not include GET — reads will be blocked.` };
  }
  // Not fatal on its own (the header is allowed to be absent when the request
  // asks for nothing custom), but a missing X-User-Id is why /market and
  // /feedback would fail while everything else works. Worth surfacing.
  const userIdNote = /x-user-id/i.test(allowHeaders)
    ? ''
    : `; NOTE allow-headers "${allowHeaders || '(absent)'}" does not list X-User-Id — /market and /feedback need it`;
  return { ok: true, detail: `preflight ${res.status}, allow-origin: ${allowOrigin}, allow-methods: ${allowMethods}${userIdNote}` };
}

// ---- CHECK 5: the URL baked into the deployed bundle ------------------------

/**
 * THE ONE THAT MATTERS. VITE_API_BASE_URL is compiled INTO the bundle at build
 * time — it is set in two unrelated places (.github/workflows/
 * azure-static-web-apps.yml for this host, netlify.toml for the other), and
 * netlify.toml's comment block warns in as many words that the two hosts can
 * disagree about which API they talk to. Nothing at runtime notices. The
 * backend can be perfectly healthy, every check above can pass, and the
 * deployed app can still be calling a different server entirely.
 *
 * So: read the bundle the browser actually downloads and see which URL is in
 * it. Vite inlines `import.meta.env.X` two ways depending on how the source
 * reads it — as a bare literal after `??` (services/apiClient.ts, which reaches
 * for process.env first) and as a member of one inlined env object (context.tsx,
 * which does `(import.meta as any).env || {}`). Both forms are matched below.
 */
const BAKED_URL_PATTERNS: readonly RegExp[] = Object.freeze([
  /VITE_API_BASE_URL"\s*\)\s*\?\?\s*"([^"]*)"/g, // apiClient: envOverride(...) ?? <inlined>
  /VITE_API_BASE_URL\s*:\s*"([^"]*)"/g, //          context: the whole env object inlined
]);

const BAKED_MOCK_PATTERNS: readonly RegExp[] = Object.freeze([
  /VITE_USE_MOCK_API"\s*\)\s*\?\?\s*"([^"]*)"/g,
  /VITE_USE_MOCK_API\s*:\s*"([^"]*)"/g,
]);

function bakedValues(text: string, patterns: readonly RegExp[]): string[] {
  const out = new Set<string>();
  for (const p of patterns) for (const m of text.matchAll(new RegExp(p.source, 'g'))) out.add(m[1]);
  return [...out];
}

async function checkBakedUrl(site: Site, be: string): Promise<Outcome> {
  let bundle: { url: string; text: string; others: string[] };
  try {
    bundle = await site.bundle();
  } catch (err) {
    return { ok: false, detail: describe(err) };
  }
  const file = new URL(bundle.url).pathname;
  const found = bakedValues(bundle.text, BAKED_URL_PATTERNS);
  const want = normalizeBase(be);

  if (!found.length) {
    // Fall back to a literal search before crying wolf: the value may still be
    // there in a shape this script does not know how to parse.
    if (bundle.text.includes(want)) {
      return {
        ok: true,
        detail:
          `${file} contains ${want} as a bare literal, but none of the known Vite define shapes matched — the build ` +
          'output changed. Update BAKED_URL_PATTERNS in this file so the next mismatch is still caught.',
      };
    }
    return {
      ok: false,
      detail:
        `no backend URL is baked into ${file} at all. The build ran WITHOUT VITE_API_BASE_URL, so in the browser ` +
        'services/apiClient.ts falls back to http://localhost:8080 (getBaseUrl) — every API call from the deployed ' +
        'app goes to the student\'s own machine. Set VITE_API_BASE_URL in the Build step of ' +
        '.github/workflows/azure-static-web-apps.yml and redeploy.',
    };
  }

  const mismatched = found.filter((u) => normalizeBase(u) !== want);
  if (mismatched.length) {
    return {
      ok: false,
      detail:
        `the deployed bundle was built against ${mismatched.map((u) => `"${u}"`).join(', ')} but this preflight is ` +
        `testing ${want}. THE FRONTEND IS TALKING TO A DIFFERENT BACKEND than the one checked above, which is why ` +
        'everything else here can pass while the app is broken. The URL is compiled in, so nothing at runtime will ' +
        'fix it: correct VITE_API_BASE_URL in .github/workflows/azure-static-web-apps.yml (netlify.toml holds the same ' +
        'value for the other host and must agree) and redeploy.',
    };
  }
  const extra = bundle.others.length ? `; ${bundle.others.length} other /assets/*.js not inspected` : '';
  return { ok: true, detail: `${file} is built against ${found.join(', ')} — matches the backend under test${extra}` };
}

// ---- CHECK 6: is the deployed bundle a MOCK build? --------------------------

/**
 * VITE_USE_MOCK_API=true ships the in-browser demo: services/mockApi answers
 * everything and the app never opens a socket to any backend. It is a supported
 * mode (netlify.toml documents flipping back to it), and it is a catastrophe to
 * ship by accident, because the app LOOKS completely healthy — data appears,
 * rounds start, jokes score — while nothing is shared between browsers and the
 * classroom sees per-tab hallucinations. No API check can detect it, because a
 * mock build makes no API calls. This is the only place it can be caught.
 */
async function checkNotMockBuild(site: Site): Promise<Outcome> {
  let bundle: { url: string; text: string };
  try {
    bundle = await site.bundle();
  } catch (err) {
    return { ok: false, detail: describe(err) };
  }
  const file = new URL(bundle.url).pathname;
  const found = bakedValues(bundle.text, BAKED_MOCK_PATTERNS);
  if (!found.length) {
    return {
      ok: false,
      detail:
        `could not find the inlined VITE_USE_MOCK_API flag in ${file}, so this run CANNOT PROVE the deployed bundle ` +
        'talks to a real backend. The patterns here are keyed to how Vite inlines import.meta.env; if the build output ' +
        'changed, update BAKED_MOCK_PATTERNS in this file. Do not wave this through.',
    };
  }
  const mockOn = found.filter((v) => v.trim().toLowerCase() === 'true');
  if (mockOn.length) {
    return {
      ok: false,
      detail:
        '*** THE DEPLOYED BUNDLE IS A MOCK BUILD (VITE_USE_MOCK_API="true"). *** It answers from services/mockApi in ' +
        'the browser and NEVER CALLS THE BACKEND — every check above is testing a server this app does not talk to. ' +
        'Each student would get a private fake world, the DEV role-switcher is visible, and nothing is shared. Set ' +
        "VITE_USE_MOCK_API: 'false' in the Build step of .github/workflows/azure-static-web-apps.yml (and in " +
        'netlify.toml for the other host) and redeploy before anyone uses this.',
    };
  }
  return { ok: true, detail: `real-API build — VITE_USE_MOCK_API="${found.join('", "')}" in ${file}` };
}

// ---- Orchestration ---------------------------------------------------------

/**
 * Runs every check and returns the whole report. Never throws, never prints,
 * never exits — the standalone CLI below is the only thing that does those.
 */
export async function preflight(opts: { fe: string; be: string }): Promise<PreflightReport> {
  const fe = normalizeBase(opts.fe);
  const be = normalizeBase(opts.be);
  const site = makeSite(fe);

  // Sequential on purpose: ~8 cheap requests, and a readable failure order
  // (backend, then frontend, then the pairing) is worth more than a second.
  const checks: Check[] = [
    await timed('backend /health', () => checkHealth(be)),
    await timed('backend /health/detailed', () => checkHealthDetailed(be)),
    await timed('backend /v1/rounds/active', () => checkRoundsActive(be)),
    await timed('frontend app shell', () => checkShell(site, fe)),
    await timed(`frontend SPA fallback ${DEEP_ROUTE}`, () => checkSpaFallback(site, fe)),
    await timed('CORS preflight (SWA → API)', () => checkCors(be, fe)),
    await timed('bundle baked backend URL', () => checkBakedUrl(site, be)),
    await timed('bundle is not a mock build', () => checkNotMockBuild(site)),
  ];

  return { ok: checks.every((c) => c.ok), checks };
}

// ---- Standalone CLI --------------------------------------------------------

function parseArg(argv: string[], flag: string, envKey: string, fallback: string): string {
  const i = argv.indexOf(`--${flag}`);
  const value = i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  return normalizeBase(value || process.env[envKey] || fallback);
}

/** Wrap a long detail under the status/name columns so failures stay readable. */
function wrap(text: string, width: number, indent: string): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? l : indent + l));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fe = parseArg(argv, 'fe', 'FE_BASE_URL', DEFAULT_FE);
  const be = parseArg(argv, 'be', 'BE_BASE_URL', DEFAULT_BE);

  console.log('preflight: read-only coherence check on the deployed stack');
  console.log(`  frontend  ${fe}`);
  console.log(`  backend   ${be}\n`);

  const report = await preflight({ fe, be });

  const width = Math.max(...report.checks.map((c) => c.name.length));
  const indent = ' '.repeat(6 + width + 2 + 9);
  for (const c of report.checks) {
    const ms = `${c.ms}ms`.padStart(7);
    const head = `${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(width)}  ${ms}  `;
    const body = wrap(c.detail, 96, indent);
    console.log(head + body[0]);
    for (const line of body.slice(1)) console.log(line);
  }

  const failed = report.checks.filter((c) => !c.ok);
  console.log('');
  if (failed.length) {
    console.log(`${failed.length} of ${report.checks.length} checks FAILED — ${failed.map((c) => c.name).join(', ')}.`);
    console.log('The deployed stack is not coherent; the heavier e2e layers would only be testing the damage.');
  } else {
    console.log(`all ${report.checks.length} checks passed — the deployed frontend and backend agree. Safe to run the rest of the suite.`);
  }
  process.exit(failed.length ? 1 : 0);
}

/** Only the CLI path prints or exits. Importing this module must do neither,
 *  so the entry script is compared by real path rather than by name. */
function isStandalone(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isStandalone()) {
  main().catch((err) => {
    console.error(`preflight: unexpected error — ${describe(err)}`);
    process.exit(1);
  });
}
