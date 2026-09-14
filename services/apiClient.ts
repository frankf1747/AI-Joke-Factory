import { mockApiRequest } from './mockApi';

export class ApiError extends Error {
  /**
   * The HTTP status, reported truthfully — so it may be 2xx. A
   * MALFORMED_ENVELOPE is raised off a successful response whose *shape* is
   * wrong, and really did arrive as a 200. Branch on `code`, not on
   * `status >= 500`, to catch contract drift.
   */
  status: number;
  code?: string;
  /** Set on validation failures — names the request field that was rejected. */
  field?: string;
  /** Correlates this failure with a backend log line. */
  requestId?: string;
  details?: unknown;

  constructor(opts: {
    status: number;
    code?: string;
    message: string;
    field?: string;
    requestId?: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.field = opts.field;
    this.requestId = opts.requestId;
    this.details = opts.details;
  }
}

/* The three endpoints that return their payload at the top level. Every other
   handler goes through response.OK, which wraps in {data}. Verified in
   handler/session.go:39, handler/session.go:87, handler/admin.go:41.

   /health and /health/detailed are raw too, but they sit outside /v1 and are
   not apiRequest's business — the health probe is its own un-enveloped,
   un-authenticated call, so it is deliberately absent from this set. */
const RAW_ENDPOINTS = new Set([
  '/v1/session/join',
  '/v1/session/me',
  '/v1/instructor/login',
]);

export function isRawEndpoint(path: string): boolean {
  return RAW_ENDPOINTS.has(path.split('?')[0]);
}

type ApiClientOptions = Omit<RequestInit, 'body' | 'headers'> & {
  headers?: Record<string, string | undefined>;
  body?: unknown;
};

/**
 * Node-side override for a Vite env var. Returns undefined anywhere but Node,
 * so the import.meta.env values below stay authoritative in the browser.
 *
 * The inertness has a different mechanism in each mode, so both are worth
 * knowing: in a *production build* Vite compiles `process.env` down to `{}`,
 * so the lookup yields undefined even if something defines `process`; under
 * *vite dev* the expression is served verbatim and only the guard protects it
 * — hence the positive `process.versions.node` test rather than a bare
 * `typeof process` check, which a node-polyfill plugin, an Electron/Tauri
 * wrapper, or any dependency assigning `globalThis.process` would satisfy.
 *
 * Under Node — the smoke script, and the test suite — import.meta.env is
 * either absent or a per-module snapshot baked in at transform time that
 * nothing can reach, so process.env is the only usable channel.
 */
function envOverride(key: 'VITE_API_BASE_URL' | 'VITE_USE_MOCK_API'): string | undefined {
  if (typeof process === 'undefined' || !process.versions?.node) return undefined;
  return process.env?.[key];
}

function getConfiguredBaseUrl(): string | null {
  const envBase =
    envOverride('VITE_API_BASE_URL') ??
    ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined);
  const v = envBase && envBase.trim() ? envBase.trim() : '';
  return v ? v : null;
}

function getBaseUrl(): string {
  // The backend's default APP_PORT is 8080.
  return getConfiguredBaseUrl() ?? 'http://localhost:8080';
}

function shouldUseMockApi(): boolean {
  const prod = Boolean((import.meta as any).env?.PROD);
  const rawForceMock = envOverride('VITE_USE_MOCK_API') ?? (import.meta as any).env?.VITE_USE_MOCK_API;
  const forceMock = String(rawForceMock ?? '').toLowerCase() === 'true';
  return forceMock || (prod && !getConfiguredBaseUrl());
}

function getUserIdHeader(): string | undefined {
  // Guarded: this module is also imported by Node-side tooling (the smoke
  // script, the test suite), where there is no DOM and no localStorage.
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem('joke_factory_user_id') ?? undefined;
}

type ParsedError = { code?: string; message: string; field?: string; requestId?: string; details?: unknown };

/** A non-JSON error body goes in `details`; only this much of it reaches `message`. */
const ERROR_MESSAGE_MAX_CHARS = 200;

/**
 * The backend emits exactly one error shape, at every status:
 *   {"error": {"code", "message", "field"?, "request_id"?}}
 * — app/http/response/response.go:19-36. Anything else falls back to status.
 */
async function parseErrorBody(resp: Response): Promise<ParsedError> {
  const contentType = resp.headers.get('content-type') || '';
  const fallback = resp.statusText || `HTTP ${resp.status}`;

  if (contentType.includes('application/json')) {
    let json: unknown;
    try {
      json = await resp.json();
    } catch {
      return { message: fallback };
    }

    const err = (json as { error?: Record<string, unknown> } | null)?.error;
    if (err && typeof err === 'object') {
      return {
        code: typeof err.code === 'string' ? err.code : undefined,
        message: typeof err.message === 'string' && err.message.trim() ? err.message : fallback,
        field: typeof err.field === 'string' ? err.field : undefined,
        requestId: typeof err.request_id === 'string' ? err.request_id : undefined,
        details: json,
      };
    }

    return { message: fallback, details: json };
  }

  let text: string | undefined;
  try {
    text = await resp.text();
  } catch {
    // ignore
  }

  // `message` is what surfaces in the UI, and a gateway error page is a
  // multi-kilobyte HTML document — "HTTP 502" serves a user far better than
  // the first 200 characters of an nginx page. The body survives in `details`
  // either way, so nothing is lost for debugging.
  const trimmed = text && text.trim() ? text.trim() : '';
  const isHtml = contentType.includes('text/html');
  return {
    message: !trimmed || isHtml ? fallback : trimmed.slice(0, ERROR_MESSAGE_MAX_CHARS),
    details: text,
  };
}

export async function apiRequest<T>(path: string, opts: ApiClientOptions = {}): Promise<T> {
  const userId = getUserIdHeader();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(userId ? { 'X-User-Id': userId } : {}),
  };

  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v === undefined) continue;
      headers[k] = v;
    }
  }

  // Production fallback: if no backend base URL is configured, serve from a local mock API.
  // NOTE: mockApi already returns unwrapped payloads and the legacy services
  // depend on that — this branch must never apply the {data} unwrap below.
  if (shouldUseMockApi()) {
    const resp = await mockApiRequest<T>(path, { method: opts.method, headers, body: opts.body });
    if (resp.ok) return resp.data;
    throw new ApiError({
      status: resp.status,
      code: resp.error.code,
      message: resp.error.message,
      details: resp.error.details,
    });
  }

  const baseUrl = getBaseUrl().replace(/\/+$/, '');
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const resp = await fetch(url, {
    ...opts,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!resp.ok) {
    const err = await parseErrorBody(resp);
    throw new ApiError({
      status: resp.status,
      code: err.code,
      message: err.message,
      field: err.field,
      requestId: err.requestId,
      details: err.details,
    });
  }

  // 204 / empty responses
  if (resp.status === 204) return undefined as T;

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await resp.text().catch(() => '');
    // A raw endpoint owns its own body shape, and a genuinely empty body is
    // the ordinary 200-with-no-content case — both pass through. Anything
    // else claiming success with a non-JSON body must fail here: Render
    // serves text/html cold-start and error pages with a 200, and returning
    // that string cast to T would slip straight past the envelope check below
    // and hand the caller a value shaped nothing like its declared type.
    if (isRawEndpoint(path) || !text.trim()) return (text as unknown) as T;

    throw new ApiError({
      status: resp.status,
      code: 'MALFORMED_ENVELOPE',
      message: `Expected a {data} envelope from ${path}, but the response was ${contentType || 'untyped'} rather than JSON — the response contract has drifted.`,
      details: text,
    });
  }

  const json = await resp.json();
  if (isRawEndpoint(path)) return json as T;

  if (json === null || typeof json !== 'object' || !('data' in json)) {
    throw new ApiError({
      status: resp.status,
      code: 'MALFORMED_ENVELOPE',
      message: `Expected a {data} envelope from ${path}. The backend returned a bare object — the response contract has drifted.`,
      details: json,
    });
  }
  // NOTE: response.Paginated (response/response.go:38-45) puts total/page/
  // per_page as *siblings* of data, so this unwrap would discard them. No
  // handler uses it today; the first paginated endpoint has to change this.
  return (json as { data: T }).data;
}


