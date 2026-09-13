# Phase 2 — Contracts & Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the frontend a typed, envelope-correct client for the real Go backend — so that the day the backend is deployed, pointing `VITE_API_BASE_URL` at it is the only change needed.

**Deviation from the phase-1 roadmap, stated up front:** that roadmap listed
"retire `mockApi.ts` behind a flag" as part of this phase. It is not here. Every
view and `context.tsx` currently depends on the mock, so retiring it now would
break the running app for the length of the phase and couple a transport change
to a behavioural one. The mock is left completely untouched; it retires when the
last view migrates off it, in phase 7.

**Architecture:** Purely **additive**. A new `types/api.ts` transcribed from the Go handlers, a rewritten envelope-aware transport, and a new `services/api/` layer typed against both. The existing `services/*.ts` and `services/mockApi.ts` are left untouched, so the app keeps running on the mock exactly as it does today; views migrate off them in phases 3–7. Nothing in this phase changes what a user sees.

**Tech Stack:** TypeScript, Vitest, `fetch` (stubbed in tests).

**Baseline of truth, in order:**
1. `/Users/frankfu/Documents/GitHub/jokefactory_be/src/app/http/handler/*.go` — the response shapes
2. `/Users/frankfu/Documents/GitHub/jokefactory_be/src/app/http/dto/models.go` — the request shapes
3. `/Users/frankfu/Documents/GitHub/jokefactory_be/src/app/http/response/response.go` — the envelope
4. `/Users/frankfu/Documents/GitHub/jokefactory_be/src/app/server/server.go` — the route table
5. `REFACTOR_PLAN.md` and `Backend Change Requests (V2).md` (both in the backend repo) — design intent, useful but **not the implementation**; the backend diverged from both.

**Correction (found during Task 1):** earlier drafts of this plan cited a `FRONTEND_PLAN.md` hand-off document. That file does not exist in either repo and never has — `git log --all -- '*PLAN*'` in `jokefactory_be` shows only `REFACTOR_PLAN.md` and `CLASSIFIER_SANDBOX_PLAN.md`. It reached this session as pasted content and is not re-checkable. Every "FRONTEND_PLAN.md lags the code" remark below should be read as "the design documents lag the code", which remains true and is demonstrable against `REFACTOR_PLAN.md`.

---

## The constraint that shapes this phase

**The backend is not deployed and cannot be run locally** (no Go toolchain on this machine; Azure deployment is pending). So nothing here can be verified against a live server.

That is survivable, and it dictates the approach: every task is verified by **stubbed-`fetch` contract tests** built from payloads transcribed out of the Go handlers, plus a **smoke script that is written now and run the day Azure is up**. The phase is done when the client is provably correct against the contract as written — not when it has talked to a server.

## A structural risk worth naming up front

The backend types its **requests** (`dto/models.go`) but builds its **responses as inline `gin.H` maps inside handler bodies**. There is no Go struct for most response shapes, so nothing on the backend side prevents a field being renamed without notice, and no generator can be pointed at it.

Two consequences:
- `types/api.ts` must be **transcribed by hand from handler code**, with each type citing the Go `file:line` it came from, so the next person can re-check it.
- The smoke script in Task 6 is not a nicety. It is the only mechanism that will catch response drift, and it should be run against Azure before any classroom session.

---

## What the frontend currently gets wrong

Verified against `server.go`'s route table:

| Current frontend call | Backend reality | Action |
|---|---|---|
| `GET /v1/session/team?round_id=` | **does not exist** | drop |
| `GET /v1/qc/queue/next` | `GET /v1/marketing/queue/next` | rename |
| `GET /v1/qc/queue/count` | `GET /v1/marketing/queue/count` | rename |
| `POST /v1/qc/batches/{id}/ratings` | `POST /v1/marketing/batches/{id}/publish` — different body entirely | replace |
| `POST /v1/qc/batches/{id}/split` | **does not exist** | drop (splitting moves to JM in phase 4) |
| `POST /v1/qc/batches/{id}/unsplit` | **does not exist** | drop |
| `GET /v1/rounds/{id}/customers/budget` | **removed** (no human customers) | drop |
| `POST /v1/rounds/{id}/market/{jid}/buy` | **removed** | drop |
| `POST /v1/rounds/{id}/market/{jid}/return` | **removed** | drop |
| `POST .../assign` body `{customer_count, team_count}` | `{team_count}` only | fix |
| — | `GET /v1/rounds/{id}/teams/{tid}/feedback` | add |
| — | `POST /v1/instructor/rounds/{id}/end` | add |
| — | `POST /v1/admin/reset` | add |

Plus three transport-level defects:
- `apiRequest` returns `await resp.json()` raw. It never unwraps the `data` envelope, so every wrapped endpoint would hand callers `{data: …}` instead of the payload.
- The default base URL is `http://localhost:8081`; the backend's `APP_PORT` default is **8080**.
- Three TypeScript errors at `services/apiClient.ts:95` — the mock's discriminated union isn't narrowed before `.error` is read.

## The envelope, verified in code

- **Wrapped** in `{ "data": … }`: everything using `response.OK` / `response.Created` — which is every handler except the three below.
- **Raw** (payload at the top level): exactly three —
  - `POST /v1/session/join` (`handler/session.go:39`)
  - `GET /v1/session/me` (`handler/session.go:87`)
  - `POST /v1/instructor/login` (`handler/admin.go:41` — note it lives in `AdminHandler`, not `InstructorHandler`)
- **Health** (`/health`, `/health/detailed`) is raw and sits **outside `/v1`**.
- **Errors**, at every status: `{ "error": { "code", "message", "field"?, "request_id"? } }` (`response/response.go:20-36`). Note `field` — the hand-off document omitted it.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `types/api.ts` | Request/response shapes transcribed from the Go handlers, each citing its source. No logic. | Create |
| `services/apiClient.ts` | Transport: base URL, `X-User-Id`, envelope unwrapping, error parsing. | Rewrite |
| `services/apiClient.test.ts` | Transport tests against a stubbed `fetch`. | Create |
| `services/api/index.ts` | Barrel re-exporting the endpoint groups. | Create |
| `services/api/session.ts` | join / me / active rounds. | Create |
| `services/api/team.ts` | batches, summary, feedback, market. | Create |
| `services/api/marketing.ts` | queue next / count, publish. | Create |
| `services/api/instructor.ts` | lobby, config, assign, patch/delete user, start, end, popups, stats, reset. | Create |
| `services/api/contract.test.ts` | One realistic payload per endpoint, asserted through the real client. | Create |
| `scripts/smoke-api.ts` | Live check against a running backend. Run against Azure when it exists. | Create |

**Why `services/api/` rather than editing `services/*.ts`:** the existing services are wired into `context.tsx` and every view. Editing them in place would break the running app for the length of this phase. The new layer sits beside them; phases 3–7 move callers across one screen at a time, and the old files are deleted when the last caller goes.

---

## Task 1: Transcribe the API types

**Files:**
- Create: `types/api.ts`

- [ ] **Step 1: Read the handlers**

Read every file in `/Users/frankfu/Documents/GitHub/jokefactory_be/src/app/http/handler/`. For each route in `server.go`, find the handler and record the exact JSON keys it emits. The response shapes are inline `gin.H` maps — there is no struct to copy, so read the literal.

- [ ] **Step 2: Write the file**

Create `types/api.ts`. Every exported type carries a comment naming the Go `file:line` it was transcribed from. Start from this skeleton and complete it from the handlers — **do not invent fields, and do not copy them from any design document, all of which are known to lag the code**:

```typescript
/* ============================================================================
   Wire types for the Go backend.

   Transcribed by hand from jokefactory_be/src/app/http/handler/*.go, because
   the backend builds its responses as inline gin.H maps rather than typed
   structs — there is nothing to generate from. Every type below cites the Go
   file and line it came from; re-check them against that source, not against
   FRONTEND_PLAN.md, which already lags the implementation.

   Nothing here is defensive. If the backend sends a field this file does not
   declare, that is drift and scripts/smoke-api.ts is what catches it.
============================================================================ */

/** Envelope for every endpoint except the three raw ones. response.go:14 */
export interface Wrapped<T> { data: T; }

/** Error body, at every status. response.go:20-36 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    request_id?: string;
  };
}

// ---- Session (RAW — no data envelope) --------------------------------------

/** dto/models.go:6 */
export interface SessionJoinRequest { display_name: string; }

/** handler/session.go:39 — RAW */
export interface SessionJoinResponse {
  user: { user_id: number; display_name: string };
  participant: { status: ParticipantStatus; joined_at: string; assigned_at: string | null };
}

export type ParticipantStatus = 'WAITING' | 'ASSIGNED';
export type Role = 'INSTRUCTOR' | 'JM' | 'MARKETING';

/** handler/session.go:87 — RAW */
export interface SessionMeResponse {
  user: { user_id: number; display_name: string };
  participant: { status: ParticipantStatus; joined_at: string; assigned_at: string | null };
  assignment: { role: Role | null; team_id: number | null };
  teammates: Array<{ user_id: number; display_name: string; role: Role }>;
}

/** handler/admin.go:41 — RAW. Note: served by AdminHandler, not InstructorHandler. */
export interface InstructorLoginResponse {
  user: { user_id: number; display_name: string; role: Role };
  round_id: number | null;
}
```

Then complete the file. These are the exact types the later tasks import — every
one must exist by the end of this task, or Tasks 3–5 will not compile:

| Type | Source to read |
|---|---|
| `RoundsActiveResponse` | `handler/round.go` — the student projection; `buy_threshold`, `jitter`, `swap_margin`, `feedback_pass_threshold` and `ideal_profile` are **absent** here |
| `BatchSubmitRequest` | `dto/models.go:11` |
| `BatchSubmitResponse` | `handler/batch.go` |
| `TeamBatchesResponse` | `handler/batch.go` |
| `TeamSummaryResponse` | `handler/customer.go` or `handler/batch.go` — find which serves `/teams/{id}/summary`; fields per `ports.TeamSummary` in `core/ports/repositories.go:50` |
| `TeamFeedbackResponse` | `handler/feedback.go` + `dto/models.go:41` |
| `MarketResponse` | `handler/customer.go` |
| `MarketingQueueResponse` | `handler/marketing.go` — `batch` is nullable |
| `PublishRequest`, `PublishJokeDecision` | `dto/models.go:29-38` |
| `PublishResponse` | `handler/marketing.go` |
| `LobbyResponse` | `handler/instructor.go` — **PascalCase**, see below |
| `ConfigRequest` | `dto/models.go:51` — every field optional |
| `InstructorRoundResponse` | `handler/instructor.go` — the instructor projection, which **does** include the hidden knobs and `ideal_profile` |
| `PatchUserRequest` | `dto/models.go:22` |
| `RoundStatsResponse` | `handler/instructor.go` + `ports.RoundStats` at `core/ports/repositories.go:88` — `{round_id, leaderboard[]}`, nothing else |
| `AdminResetResponse` | `handler/admin.go:60` |

Supporting unions to declare once and reuse: `ParticipantStatus`, `Role`, `BatchStatus`
(`'DRAFT' | 'SUBMITTED' | 'PROCESSED'`), `JokePublishStatus`
(`'PENDING' | 'PUBLISHED' | 'DISCARDED'`), `RoundStatus`
(`'CONFIGURED' | 'ACTIVE' | 'ENDED'`). Confirm each against the enums in
`core/domain/` rather than inferring from a handler.

Two things to get right, because they are easy to miss:
- **The instructor lobby response is PascalCase** (`RoundID`, `Summary`, `Teams`, `Members`, `UserID`, `DisplayName`, `Role`, `Unassigned`) while every other endpoint is snake_case. This is because the Go struct is serialised without json tags. Transcribe it as it actually is and add a comment saying why it differs — do not "fix" it here.
- **`publish_status`** is `'PENDING' | 'PUBLISHED' | 'DISCARDED'`; **`batch.status`** is `'DRAFT' | 'SUBMITTED' | 'PROCESSED'`. Confirm both against `domain`'s enums rather than assuming.

- [ ] **Step 3: Verify it compiles and cites its sources**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "types/api"`
Expected: empty.

Run: `grep -c "handler/\|dto/models.go\|response.go" types/api.ts`
Expected: at least one citation per exported interface. Count your interfaces and confirm.

- [ ] **Step 4: Commit**

```bash
git add types/api.ts
git commit -m "feat(api): transcribe the backend's wire types

Read out of the Go handlers rather than FRONTEND_PLAN.md, which lags the
code. Responses are inline gin.H maps with no struct to generate from, so
each type cites the file:line it came from.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Envelope-aware transport

**Files:**
- Modify: `services/apiClient.ts`
- Test: `services/apiClient.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `services/apiClient.test.ts`:

```typescript
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

const realFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
});

afterEach(() => {
  globalThis.fetch = realFetch;
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

    const err = await apiRequest('/v1/rounds/1/batches', { method: 'POST', body: {} }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('round not active');
  });

  it('keeps the field name on a validation error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'required', field: 'jokes' } }, 400),
    ) as any;
    const err = await apiRequest('/v1/rounds/1/batches', { method: 'POST', body: {} }).catch(e => e);
    expect(err.field).toBe('jokes');
  });

  it('falls back to the status when the body is not the expected shape', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ nonsense: true }, 500)) as any;
    const err = await apiRequest('/v1/rounds/active').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });
});

describe('apiRequest — headers and base URL', () => {
  it('sends X-User-Id when a user id is stored', async () => {
    localStorage.setItem('joke_factory_user_id', '12');
    const spy = vi.fn(async () => jsonResponse({ data: {} }));
    globalThis.fetch = spy as any;
    await apiRequest('/v1/rounds/active');
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-User-Id': '12' });
  });

  it('omits X-User-Id when there is none', async () => {
    const spy = vi.fn(async () => jsonResponse({ data: {} }));
    globalThis.fetch = spy as any;
    await apiRequest('/v1/rounds/active');
    expect((spy.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('X-User-Id');
  });

  it('joins the configured base URL to the path exactly once', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    const spy = vi.fn(async () => jsonResponse({ data: {} }));
    globalThis.fetch = spy as any;
    await apiRequest('/v1/rounds/active');
    expect(spy.mock.calls[0][0]).toBe('http://api.test/v1/rounds/active');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/apiClient.test.ts`
Expected: FAIL — `isRawEndpoint` is not exported.

- [ ] **Step 3: Implement**

In `services/apiClient.ts`:

1. Add the raw-endpoint list and predicate:

```typescript
/* The three endpoints that return their payload at the top level. Every other
   handler goes through response.OK, which wraps in {data}. Verified in
   handler/session.go:39, handler/session.go:87, handler/admin.go:41. */
const RAW_ENDPOINTS = new Set([
  '/v1/session/join',
  '/v1/session/me',
  '/v1/instructor/login',
]);

export function isRawEndpoint(path: string): boolean {
  return RAW_ENDPOINTS.has(path.split('?')[0]);
}
```

2. Change the default base URL from `http://localhost:8081` to `http://localhost:8080` — the backend's `APP_PORT` default.

3. Add `field` to `ApiError` (constructor option and property), and rewrite `parseErrorBody` to read the real shape `{ error: { code, message, field?, request_id? } }` first, falling back to the status text. Drop the speculative `error_code` / `err.code` branches — they match nothing the backend emits.

4. After a successful JSON parse, unwrap:

```typescript
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
```

5. Fix the three existing type errors at the mock branch by narrowing on `resp.ok` before reading `.error`:

```typescript
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
```

**The mock branch must not unwrap** — `mockApi` already returns unwrapped payloads, and the legacy services depend on that. Leave it alone.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/apiClient.test.ts`
Expected: PASS, 13 tests.

Run: `npx vitest run` — the existing 214 must still pass; the app still runs on the mock, whose branch is unchanged.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: **2** — down from 5. The three `apiClient.ts` errors are gone; the two in `mockApi.ts` remain and are not in scope.

- [ ] **Step 5: Commit**

```bash
git add services/apiClient.ts services/apiClient.test.ts
git commit -m "feat(api): unwrap the data envelope and fix the base URL

Every handler but session/join, session/me and instructor/login wraps its
payload in {data}; the client returned the envelope itself. A wrapped
endpoint that arrives without one now throws rather than handing callers
an object shaped nothing like its declared type.

Default port corrected to 8080, and errors parse the real shape
including the field name on validation failures.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Session and rounds endpoints

**Files:**
- Create: `services/api/session.ts`, `services/api/index.ts`

- [ ] **Step 1: Write the module**

```typescript
import { apiRequest } from '../apiClient';
import type {
  SessionJoinRequest, SessionJoinResponse, SessionMeResponse,
  InstructorLoginRequest, InstructorLoginResponse, RoundsActiveResponse,
} from '../../types/api';

export const sessionApi = {
  /** RAW — no data envelope. handler/session.go:39 */
  join(body: SessionJoinRequest) {
    return apiRequest<SessionJoinResponse>('/v1/session/join', { method: 'POST', body });
  },

  /** RAW. Poll this on the waiting screen to detect assignment. handler/session.go:87 */
  me() {
    return apiRequest<SessionMeResponse>('/v1/session/me');
  },

  /** RAW. handler/admin.go:41 */
  instructorLogin(body: InstructorLoginRequest) {
    return apiRequest<InstructorLoginResponse>('/v1/instructor/login', { method: 'POST', body });
  },

  /** Student-safe projection — the engine knobs and ideal profile are stripped. */
  activeRounds() {
    return apiRequest<RoundsActiveResponse>('/v1/rounds/active');
  },
};
```

Create `services/api/index.ts` re-exporting each group as it lands:

```typescript
export { sessionApi } from './session';
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "services/api"`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add services/api/session.ts services/api/index.ts
git commit -m "feat(api): session and rounds endpoints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Team and marketing endpoints

**Files:**
- Create: `services/api/team.ts`, `services/api/marketing.ts`
- Modify: `services/api/index.ts`

- [ ] **Step 1: Write the modules**

`services/api/team.ts`:

```typescript
import { apiRequest } from '../apiClient';
import type {
  BatchSubmitRequest, BatchSubmitResponse, TeamBatchesResponse,
  TeamSummaryResponse, TeamFeedbackResponse, MarketResponse,
} from '../../types/api';

export const teamApi = {
  /** Jokes are plain strings — titling is Marketing's job. dto/models.go:11 */
  submitBatch(roundId: number, body: BatchSubmitRequest) {
    return apiRequest<BatchSubmitResponse>(`/v1/rounds/${roundId}/batches`, { method: 'POST', body });
  },

  batches(roundId: number, teamId: number) {
    return apiRequest<TeamBatchesResponse>(`/v1/rounds/${roundId}/teams/${teamId}/batches`);
  },

  summary(roundId: number, teamId: number) {
    return apiRequest<TeamSummaryResponse>(`/v1/rounds/${roundId}/teams/${teamId}/summary`);
  },

  /** Dimension NAMES only — never categories, never numbers. */
  feedback(roundId: number, teamId: number) {
    return apiRequest<TeamFeedbackResponse>(`/v1/rounds/${roundId}/teams/${teamId}/feedback`);
  },

  /** Read-only. AI customers do the buying; there is no buy/return endpoint. */
  market(roundId: number) {
    return apiRequest<MarketResponse>(`/v1/rounds/${roundId}/market`);
  },
};
```

`services/api/marketing.ts`:

```typescript
import { apiRequest } from '../apiClient';
import type {
  MarketingQueueNextResponse, MarketingQueueCountResponse,
  PublishRequest, PublishResponse,
} from '../../types/api';

export const marketingApi = {
  /** Claims AND locks the next submitted batch for this marketer's team.
   *  `batch` is null when the queue is empty. Locks expire after 15 minutes
   *  (repo/postgres/marketing_repo.go:53). */
  queueNext(roundId: number) {
    return apiRequest<MarketingQueueNextResponse>(`/v1/marketing/queue/next?round_id=${roundId}`);
  },

  queueCount(roundId: number) {
    return apiRequest<MarketingQueueCountResponse>(`/v1/marketing/queue/count?round_id=${roundId}`);
  },

  /** One decision per joke. Publishing is final for the batch.
   *
   *  Note: the implemented usecase validates only "at least one joke decision"
   *  — it does NOT require at least one PUBLISHED joke, despite both plan
   *  documents saying it returns 400. Verified in usecase/marketing.go:80-82
   *  and dto/models.go:29-38. Our Round 2 publish-nothing flow depends on that,
   *  so if a NO_JOKE_PUBLISHED error ever appears, it is a backend change and
   *  the Round 2 path breaks with it. */
  publish(batchId: number, body: PublishRequest) {
    return apiRequest<PublishResponse>(`/v1/marketing/batches/${batchId}/publish`, { method: 'POST', body });
  },
};
```

Add both to `services/api/index.ts`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "services/api"`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add services/api/ && git commit -m "feat(api): team and marketing endpoints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Instructor endpoints

**Files:**
- Create: `services/api/instructor.ts`
- Modify: `services/api/index.ts`

- [ ] **Step 1: Write the module**

```typescript
import { apiRequest } from '../apiClient';
import type {
  LobbyResponse, ConfigRequest, InstructorRoundResponse, PublicRoundResponse,
  PatchUserRequest, DeleteUserResponse, RoundStatsResponse, AdminResetResponse,
} from '../../types/api';

/* AssignRequest and PopupStateRequest are built inline below rather than taken
   as parameters — the call sites take plain arguments, which is friendlier than
   making every caller construct a body object. The types still exist in
   types/api.ts and the literals below must satisfy them. */

export const instructorApi = {
  /** NOTE: this response is PascalCase, unlike every other endpoint — the Go
   *  struct is serialised without json tags. Transcribed as-is in types/api.ts. */
  lobby(roundId: number) {
    return apiRequest<LobbyResponse>(`/v1/instructor/rounds/${roundId}/lobby`);
  },

  /** All fields optional; omitted values keep the existing round's. Includes
   *  the hidden knobs and the ideal profile, which students never receive. */
  config(roundId: number, body: ConfigRequest) {
    return apiRequest<InstructorRoundResponse>(`/v1/instructor/rounds/${roundId}/config`, { method: 'POST', body });
  },

  /** Body is {team_count} only — there is no customer_count, customers are
   *  simulated. The old frontend sent one and it was ignored. */
  assign(roundId: number, teamCount: number) {
    return apiRequest<LobbyResponse>(`/v1/instructor/rounds/${roundId}/assign`, {
      method: 'POST',
      body: { team_count: teamCount },
    });
  },

  patchUser(roundId: number, userId: number, body: PatchUserRequest) {
    return apiRequest<LobbyResponse>(`/v1/instructor/rounds/${roundId}/users/${userId}`, { method: 'PATCH', body });
  },

  deleteUser(roundId: number, userId: number) {
    return apiRequest<DeleteUserResponse>(`/v1/instructor/rounds/${roundId}/users/${userId}`, { method: 'DELETE' });
  },

  /** Locks the config and the ideal profile, then generates the AI customers. */
  start(roundId: number, body: ConfigRequest = {}) {
    return apiRequest<InstructorRoundResponse>(`/v1/instructor/rounds/${roundId}/start`, { method: 'POST', body });
  },

  /** CORRECTED: returns the PUBLIC projection, not the instructor one.
   *  handler/instructor.go:221 calls dto.ToPublicRound — so buy_threshold,
   *  jitter, swap_margin, feedback_pass_threshold and ideal_profile are NOT
   *  on this response. Only config (:86) and start (:192) return
   *  ToInstructorRound. Typing this as InstructorRoundResponse would be a
   *  lie the compiler cannot catch, because the type is a claim about the
   *  wire rather than a check of it. */
  end(roundId: number) {
    return apiRequest<PublicRoundResponse>(`/v1/instructor/rounds/${roundId}/end`, { method: 'POST' });
  },

  /** Also the PUBLIC projection — handler/instructor.go:248. See end(). */
  popups(roundId: number, isActive: boolean) {
    return apiRequest<PublicRoundResponse>(`/v1/instructor/rounds/${roundId}/popups`, {
      method: 'POST',
      body: { is_popped_active: isActive },
    });
  },

  /** Leaderboard ONLY. There are no time-series or chart payloads — ports.RoundStats
   *  is {round_id, leaderboard[]}. Any dashboard chart needs a different source. */
  stats(roundId: number) {
    return apiRequest<RoundStatsResponse>(`/v1/instructor/rounds/${roundId}/stats`);
  },

  /** Wipes all game data. Instructor-guarded. */
  resetGame() {
    return apiRequest<AdminResetResponse>('/v1/admin/reset', { method: 'POST' });
  },
};
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "services/api"`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add services/api/ && git commit -m "feat(api): instructor endpoints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Contract tests

Every service call is asserted against a payload transcribed from the Go handlers, driven through the real `apiRequest`. This is what proves the client is correct without a server.

**Files:**
- Create: `services/api/contract.test.ts`

**Type the fixtures.** The payloads in Step 1 are written below as untyped object
literals, which means a fixture can drift from `types/api.ts` without anyone
noticing — and then the test passes while asserting a shape the client does not
actually declare. Annotate each one, so the compiler checks the fixture against
the wire types:

```typescript
import type { Wrapped, MarketingQueueNextResponse, SessionMeResponse } from '../../types/api';

const queueBody: Wrapped<MarketingQueueNextResponse> = { data: { /* … */ } };
const meBody: SessionMeResponse = { /* … raw, no envelope … */ };
```

Use `Wrapped<T>` for the wrapped endpoints and the bare type for the three raw
ones — which also makes each fixture state, in its own type, which kind it is.
This is what `Wrapped<T>` exists for; nothing else in the codebase uses it.

If annotating a fixture produces a type error, **that is a finding, not a
nuisance**: either the payload was transcribed wrong or the type was. Stop and
work out which, then report it — do not loosen the annotation to make it pass.

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sessionApi } from './session';
import { teamApi } from './team';
import { marketingApi } from './marketing';
import { instructorApi } from './instructor';

/* Payloads below are transcribed from jokefactory_be/src/app/http/handler/*.go.
   They are the contract. If a test here fails after a backend change, the
   backend moved and this file is the record of what it moved from. */

function stub(body: unknown, status = 200) {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
  globalThis.fetch = spy;
  return spy;
}

const realFetch = globalThis.fetch;
beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_API_BASE_URL', 'http://api.test'); });
afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); });

describe('session', () => {
  it('reads a RAW join response without unwrapping', async () => {
    stub({
      user: { user_id: 12, display_name: 'Alice' },
      participant: { status: 'WAITING', joined_at: '2026-01-12T10:00:00Z', assigned_at: null },
    });
    const res = await sessionApi.join({ display_name: 'Alice' });
    expect(res.user.user_id).toBe(12);
    expect(res.participant.status).toBe('WAITING');
  });

  it('reads assignment as null before the instructor assigns', async () => {
    stub({
      user: { user_id: 12, display_name: 'Alice' },
      participant: { status: 'WAITING', joined_at: '...', assigned_at: null },
      assignment: { role: null, team_id: null },
      teammates: [],
    });
    const res = await sessionApi.me();
    expect(res.assignment.role).toBeNull();
  });
});

describe('marketing', () => {
  it('unwraps the queue payload', async () => {
    stub({
      data: {
        batch: {
          batch_id: 501, round_id: 1, team_id: 3, status: 'SUBMITTED',
          submitted_at: '...', locked_at: '...', locked_by: 15,
        },
        jokes: [{ joke_id: 9101, joke_text: 'a' }, { joke_id: 9102, joke_text: 'b' }],
        queue_size: 4,
      },
    });
    const res = await marketingApi.queueNext(1);
    expect(res.batch?.batch_id).toBe(501);
    expect(res.jokes).toHaveLength(2);
    expect(res.queue_size).toBe(4);
  });

  it('handles an empty queue', async () => {
    stub({ data: { batch: null, jokes: [], queue_size: 0 } });
    const res = await marketingApi.queueNext(1);
    expect(res.batch).toBeNull();
  });

  it('reads a publish result', async () => {
    stub({
      data: {
        batch: { batch_id: 501, status: 'PROCESSED', processed_at: '...' },
        published: { count: 1, joke_ids: [9101] },
        discarded: { count: 1, joke_ids: [9102] },
      },
    });
    const res = await marketingApi.publish(501, {
      jokes: [
        { joke_id: 9101, joke_title: 'Corporate Comedy', is_published: true },
        { joke_id: 9102, joke_title: '', is_published: false },
      ],
    });
    expect(res.published.joke_ids).toEqual([9101]);
    expect(res.batch.status).toBe('PROCESSED');
  });

  it('sends the publish decisions as the backend expects', async () => {
    const spy = stub({ data: { batch: {}, published: { count: 0, joke_ids: [] }, discarded: { count: 0, joke_ids: [] } } });
    await marketingApi.publish(501, { jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toEqual({ jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
  });

  it('publishes nothing without error — the backend has no >=1 rule', async () => {
    // usecase/marketing.go:80 validates only that decisions exist. Both plan
    // documents claim a 400 here; the implementation does not. Round 2 depends
    // on this, so pin it.
    const spy = stub({ data: { batch: {}, published: { count: 0, joke_ids: [] }, discarded: { count: 2, joke_ids: [1, 2] } } });
    const res = await marketingApi.publish(501, {
      jokes: [
        { joke_id: 1, joke_title: '', is_published: false },
        { joke_id: 2, joke_title: '', is_published: false },
      ],
    });
    expect(res.discarded.count).toBe(2);
    expect(spy).toHaveBeenCalled();
  });
});

describe('team', () => {
  it('submits jokes as plain strings', async () => {
    const spy = stub({ data: { batch: { batch_id: 501, round_id: 1, team_id: 3, status: 'SUBMITTED', submitted_at: '...', jokes_count: 2 } } });
    await teamApi.submitBatch(1, { team_id: 3, jokes: ['one', 'two'] });
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.jokes).toEqual(['one', 'two']);
  });

  it('reads feedback as dimension names only', async () => {
    stub({
      data: {
        jokes: [{
          joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
          good_dimensions: ['LENGTH', 'TOPIC'],
          improve_dimensions: ['WORDPLAY', 'CLARITY', 'ENERGY'],
        }],
      },
    });
    const res = await teamApi.feedback(1, 3);
    expect(res.jokes[0].good_dimensions).toEqual(['LENGTH', 'TOPIC']);
    // The contract carries no categories and no numbers. If either ever appears,
    // it is a privacy regression, not a feature.
    expect(res.jokes[0]).not.toHaveProperty('dim_fit');
  });

  it('reads the team summary keys', async () => {
    stub({
      data: {
        team: { id: 3, name: 'Team 3' }, round_id: 1, rank: 1, points: 42,
        profit: 40.85, total_sales: 42, performance_label: 'AVERAGE PERFORMING',
        unsold_jokes: 0, sold_jokes_count: 10, batches_created: 4,
        batches_processed: 3, published_jokes: 10, discarded_jokes: 5,
        unprocessed_batches: 1,
      },
    });
    const res = await teamApi.summary(1, 3);
    expect(res.profit).toBeCloseTo(40.85);
    expect(res.unprocessed_batches).toBe(1);
  });
});

describe('instructor', () => {
  it('reads the PascalCase lobby without renaming it', async () => {
    stub({
      data: {
        RoundID: 1,
        Summary: { Waiting: 2, Assigned: 8, Dropped: 0, TeamCount: 4 },
        Teams: [{ Team: { id: 3, name: 'Team 3', created_at: '...' }, Members: [{ UserID: 12, DisplayName: 'Alice', Role: 'JM' }] }],
        Unassigned: [{ UserID: 20, DisplayName: 'Carol', Status: 'WAITING' }],
      },
    });
    const res = await instructorApi.lobby(1);
    expect(res.Summary.TeamCount).toBe(4);
    expect(res.Teams[0].Members[0].Role).toBe('JM');
  });

  it('sends team_count alone on assign', async () => {
    const spy = stub({ data: { RoundID: 1, Summary: {}, Teams: [], Unassigned: [] } });
    await instructorApi.assign(1, 4);
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ team_count: 4 });
  });

  it('reads leaderboard-only stats', async () => {
    stub({
      data: {
        round_id: 1,
        leaderboard: [{
          rank: 1, team: { id: 3, name: 'Team 3' }, batches_processed: 3,
          total_sales: 42, published_jokes: 10, discarded_jokes: 5,
          total_jokes: 15, unsold_jokes: 0, profit: 40.85,
        }],
      },
    });
    const res = await instructorApi.stats(1);
    expect(res.leaderboard).toHaveLength(1);
    // No time-series keys exist. Assert it, so a future "the charts are back"
    // assumption fails here rather than in a view.
    expect(res).not.toHaveProperty('sales_over_time');
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run services/api/contract.test.ts`
Expected: PASS, 14 tests. If any fails, the service or the type is wrong — fix those, not the payload, which is the transcribed contract.

- [ ] **Step 3: Commit**

```bash
git add services/api/contract.test.ts
git commit -m "test(api): pin every endpoint against a transcribed payload

Drives the real client over stubbed fetch using response bodies taken
from the Go handlers, so the contract is provable with no server running.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Live smoke script

Nothing above talks to a server. This is the piece that will, the day Azure is up.

**Files:**
- Create: `scripts/smoke-api.ts`
- Modify: `package.json` (one script entry)

- [ ] **Step 1: Write the script**

`scripts/smoke-api.ts` — a plain Node script. Check first whether the repo can
already run a TypeScript file (`npx tsx --version`); if not, add `tsx` as a
devDependency in Step 2 rather than reaching for a different runner. It must:

1. Take a base URL from `--base` or `APP_BASE_URL`, defaulting to `http://localhost:8080`.
2. `GET /health` first and abort with a clear message if it fails — no point testing further.
3. For each endpoint that is safe to call without mutating state — `/health`, `/health/detailed`, `/v1/rounds/active` — fetch it and check:
   - the status is 2xx
   - the envelope matches expectation (`/health*` are raw and sit outside `/v1`; `/v1/rounds/active` is wrapped in `{data}`)
   - every key the corresponding `types/api.ts` interface declares is present

   **`/health/detailed` has no declared type**, and deliberately so: `handler/health.go:45-48` returns whatever `usecase.HealthService.Check` produces, which is not a fixed shape. Check only that it is 2xx and parses as JSON — do not assert keys on it, and do not add a type for it.
4. Print one line per endpoint: `PASS`, or `FAIL` with the specific missing or extra key.
5. **Report extra keys as warnings, not failures** — the backend adding a field is not our problem; the backend *removing* one is.
6. Exit non-zero if any check fails.

Keep it dependency-free and under ~150 lines. It is a diagnostic, not a test framework.

Do **not** call mutating endpoints (join, publish, assign, start, reset) — a smoke run must be safe against a live classroom.

- [ ] **Step 2: Add the script entry**

In `package.json`:

```json
    "smoke:api": "tsx scripts/smoke-api.ts"
```

Add `tsx` as a devDependency if the repo cannot already run a TypeScript file directly.

- [ ] **Step 3: Verify it runs and fails cleanly with no server**

Run: `npm run smoke:api`
Expected: it reports that `/health` is unreachable and exits non-zero — *not* a stack trace. Confirm the message names the base URL it tried.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-api.ts package.json
git commit -m "feat(api): add a live contract smoke script

Read-only checks against a running backend: envelope shape and declared
keys per endpoint. Responses are inline gin.H maps on the Go side, so
nothing prevents drift — this is what catches it. Run before any
classroom session once the backend is deployed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Verification

**Files:** none

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: 214 existing + 13 transport + 14 contract = **241 passing**, 9 files.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: **2**, both in `services/mockApi.ts`. The three `apiClient.ts` errors are fixed; `mockApi.ts` is legacy and out of scope.

- [ ] **Step 3: Confirm nothing user-facing changed**

Run: `npm run dev`, open the app, and walk all four roles. Everything must behave exactly as before — this phase adds a parallel client and changes no view. If anything differs, something in the mock branch was disturbed and must be reverted.

- [ ] **Step 4: Confirm the dead endpoints are gone from the new layer**

Run: `grep -rn "qc/\|customers/budget\|market/.*/buy\|market/.*/return\|session/team" services/api/`
Expected: empty. (The legacy `services/*.ts` still contain them — that is expected and they are deleted in later phases.)

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore(api): verify phase 2

241 tests; 2 pre-existing type errors in the legacy mock; no user-facing
change. The client is wired for the real backend and provable without it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- `types/api.ts` describes every route in `server.go`, each type citing the Go source it was read from.
- `apiRequest` unwraps `{data}` for wrapped endpoints, passes the three raw ones through, and throws loudly if a wrapped endpoint arrives without an envelope.
- Every endpoint has a contract test driven through the real client.
- `npm run smoke:api` exists, is read-only, and fails cleanly with no server.
- The app behaves exactly as it did before this phase.

## Deliberately not in this phase

Migrating any view or `context.tsx` onto the new layer; deleting the legacy services or `mockApi.ts`; the role rename; moving joke-splitting to the Joke Maker; removing the Marketing Topic picker; rebuilding the feedback panel; the instructor config form. Each is its own plan.

## The first thing to do when Azure is live

```bash
VITE_API_BASE_URL=https://<your-app>.azurecontainerapps.io npm run smoke:api
```

Expect failures. The types were transcribed by hand from handler code that has no compiler enforcing its own shape, and the design documents already disagreed with the implementation in several places before we started. Fix `types/api.ts` against what the server actually returns, then re-run the contract tests — those payloads are the record of what we believed, and updating them is how the belief gets corrected.
