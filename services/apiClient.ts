import { mockApiRequest } from './mockApi';

export class ApiError extends Error {
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
 * Node-side override for a Vite env var.
 *
 * In the browser this is dead code: `process` is undefined there (vite.config
 * only defines the two literal `process.env.*_API_KEY` expressions), so the
 * guard short-circuits and the import.meta.env value below is used exactly as
 * before. Under Node — the smoke script, and the test suite — import.meta.env
 * is either absent or a per-module snapshot baked in at transform time that
 * nothing can reach, so process.env is the only usable channel.
 */
function envOverride(key: 'VITE_API_BASE_URL' | 'VITE_USE_MOCK_API'): string | undefined {
  if (typeof process === 'undefined') return undefined;
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
  return { message: (text && text.trim()) ? text : fallback };
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
    // Best-effort: allow empty response bodies
    const text = await resp.text().catch(() => '');
    return (text as unknown) as T;
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
  return (json as { data: T }).data;
}


