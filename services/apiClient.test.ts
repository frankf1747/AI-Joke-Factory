import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, ApiError, isRawEndpoint } from './apiClient';

/** Minimal Response stand-in — we only use the fields apiRequest reads. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Non-JSON stand-in, for gateway HTML and empty bodies. */
function textResponse(body: string, status = 200, contentType = 'text/plain'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    text: async () => body,
  } as unknown as Response;
}

/**
 * Snag A: vitest runs with environment 'node', so there is no DOM and no
 * localStorage. Install a minimal in-memory stand-in so the header tests
 * exercise the real getUserIdHeader path rather than a mock of it. Kept
 * dependency-free on purpose — no jsdom/happy-dom.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

const realFetch = globalThis.fetch;

/**
 * Snag C: the repo commits a .env.local with VITE_USE_MOCK_API=true, which
 * Vite loads into import.meta.env for the test run — so apiRequest would take
 * the mock branch and never call fetch. import.meta.env is baked in per module
 * at transform time, so neither mutation nor vi.stubEnv can reach the copy
 * apiClient sees; process.env is the only channel, which is why the source
 * consults it under Node. Pin both vars so these tests exercise the real
 * network path whatever .env.local happens to say.
 */
beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  vi.stubEnv('VITE_USE_MOCK_API', 'false');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
});

describe('isRawEndpoint', () => {
  it('knows the three endpoints that skip the data envelope', () => {
    expect(isRawEndpoint('/v1/session/join')).toBe(true);
    expect(isRawEndpoint('/v1/session/me')).toBe(true);
    expect(isRawEndpoint('/v1/instructor/login')).toBe(true);
  });

  it('treats everything else as wrapped', () => {
    expect(isRawEndpoint('/v1/rounds/active')).toBe(false);
    expect(isRawEndpoint('/v1/marketing/queue/count?round_id=1')).toBe(false);
  });

  it('ignores a query string when matching', () => {
    expect(isRawEndpoint('/v1/session/me?x=1')).toBe(true);
  });
});

describe('apiRequest — envelope', () => {
  it('unwraps data for a wrapped endpoint', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: { queue_size: 4 } })) as any;
    await expect(apiRequest('/v1/marketing/queue/count')).resolves.toEqual({ queue_size: 4 });
  });

  it('returns the body as-is for a raw endpoint', async () => {
    const body = { user: { user_id: 12, display_name: 'Alice' } };
    globalThis.fetch = vi.fn(async () => jsonResponse(body)) as any;
    await expect(apiRequest('/v1/session/join', { method: 'POST', body: {} })).resolves.toEqual(body);
  });

  it('throws rather than silently returning {data} if a wrapped endpoint omits it', async () => {
    // A backend change that drops the envelope must fail loudly here, not
    // hand every caller an object shaped nothing like its declared type.
    globalThis.fetch = vi.fn(async () => jsonResponse({ queue_size: 4 })) as any;
    await expect(apiRequest('/v1/marketing/queue/count')).rejects.toThrow(/envelope/i);
  });

  it('accepts a wrapped null payload', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: null })) as any;
    await expect(apiRequest('/v1/marketing/queue/next')).resolves.toBeNull();
  });
});

describe('apiRequest — errors', () => {
  it('parses the error envelope into an ApiError', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: { code: 'CONFLICT', message: 'round not active', request_id: 'r1' } }, 409),
    ) as any;

    const err: any = await apiRequest('/v1/rounds/1/batches', { method: 'POST', body: {} }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('round not active');
    expect(err.requestId).toBe('r1');
  });

  it('keeps the field name on a validation error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'required', field: 'jokes' } }, 400),
    ) as any;
    const err: any = await apiRequest('/v1/rounds/1/batches', { method: 'POST', body: {} }).catch(e => e);
    expect(err.field).toBe('jokes');
  });

  it('falls back to the status when the body is not the expected shape', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ nonsense: true }, 500)) as any;
    const err: any = await apiRequest('/v1/rounds/active').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });

  it('keeps a gateway HTML error page out of the message but in details', async () => {
    // message is what surfaces in the UI: "HTTP 502" beats the first 200
    // characters of an nginx page. The body still has to survive for debugging.
    const html = `<html><head><title>502 Bad Gateway</title></head><body>${'x'.repeat(3000)}</body></html>`;
    globalThis.fetch = vi.fn(async () => textResponse(html, 502, 'text/html')) as any;
    const err: any = await apiRequest('/v1/rounds/active').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('HTTP 502');
    expect(err.details).toBe(html);
  });

  it('caps a plain-text error message and keeps the full body in details', async () => {
    const body = 'y'.repeat(500);
    globalThis.fetch = vi.fn(async () => textResponse(body, 500, 'text/plain')) as any;
    const err: any = await apiRequest('/v1/rounds/active').catch(e => e);
    expect(err.message.length).toBeLessThanOrEqual(200);
    expect(err.details).toBe(body);
  });
});

describe('apiRequest — non-JSON success bodies', () => {
  it('throws rather than returning a string when a wrapped endpoint answers 200 with HTML', async () => {
    // Render serves text/html cold-start pages with a 200. Returning that
    // string cast to T would defeat the envelope guard entirely.
    const html = '<html><body>Application is starting</body></html>';
    globalThis.fetch = vi.fn(async () => textResponse(html, 200, 'text/html')) as any;
    const err: any = await apiRequest('/v1/rounds/active').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('MALFORMED_ENVELOPE');
    expect(err.details).toBe(html);
  });

  it('still returns a non-JSON body as-is for a raw endpoint', async () => {
    globalThis.fetch = vi.fn(async () => textResponse('pong', 200, 'text/plain')) as any;
    await expect(apiRequest('/v1/session/me')).resolves.toBe('pong');
  });

  it('allows an empty body on a wrapped endpoint', async () => {
    globalThis.fetch = vi.fn(async () => textResponse('', 200, 'text/plain')) as any;
    await expect(apiRequest('/v1/rounds/active')).resolves.toBe('');
  });
});

describe('apiRequest — headers and base URL', () => {
  it('sends X-User-Id when a user id is stored', async () => {
    localStorage.setItem('joke_factory_user_id', '12');
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ data: {} }));
    globalThis.fetch = spy as any;
    await apiRequest('/v1/rounds/active');
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-User-Id': '12' });
  });

  it('omits X-User-Id when there is none', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ data: {} }));
    globalThis.fetch = spy as any;
    await apiRequest('/v1/rounds/active');
    expect((spy.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('X-User-Id');
  });

  it('joins the configured base URL to the path exactly once', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ data: {} }));
    globalThis.fetch = spy as any;
    await apiRequest('/v1/rounds/active');
    expect(spy.mock.calls[0][0]).toBe('http://api.test/v1/rounds/active');
  });
});
