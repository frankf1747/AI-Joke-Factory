# Phase 3C — The Role Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the round clickable end to end — the Joke Maker submits a raw blob, Marketing claims it, splits it, titles and publishes, and the Joke Maker sees the result. Against the real backend, in a browser.

**Architecture:** Frontend-only. Repoint the legacy `services/qcService.ts` at the routes that now exist, change the publish payload to the shape the backend binds, and fix three field mappings the backend renamed. The views themselves are barely touched — almost every defect is in `context.tsx` and the service layer between them.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 2, `strictNullChecks` on.

---

## What changed under us

Phase 3B restored the backend capabilities V2 had dropped. Two consequences for this plan:

- **`split` and `unsplit` exist again**, at `/v1/marketing/batches/{id}/split` and `/unsplit`.
  An earlier audit said to delete those calls. That is no longer true — they need a **prefix
  change, not removal**. The splitting flow stays exactly where it is, in Marketing.
- **`sold_count`, `first_sold_at`, `jokes_created` and `jokes_published` are real now.** The
  tiles that read them will start showing true numbers once the field mappings below are
  fixed.

## The route mapping

| Frontend calls today | Reality | Action |
|---|---|---|
| `/v1/qc/queue/next` | `/v1/marketing/queue/next` | rename |
| `/v1/qc/queue/count` | `/v1/marketing/queue/count` | rename |
| `/v1/qc/batches/{id}/split` | `/v1/marketing/batches/{id}/split` | rename |
| `/v1/qc/batches/{id}/unsplit` | `/v1/marketing/batches/{id}/unsplit` | rename |
| `/v1/qc/batches/{id}/ratings` | `/v1/marketing/batches/{id}/publish` | **replace — different body** |
| `/v1/rounds/{id}/customers/budget` | gone | delete |
| `/v1/rounds/{id}/market/{jid}/buy` · `/return` | gone | delete |
| `/v1/session/team` | never existed | delete |

## The field mappings

| Frontend reads | Backend sends | Effect today |
|---|---|---|
| `batch.rated_at` | `processed_at` | "Created to Publish" is `—` for every batch |
| `batch.status === 'RATED'` | `'PROCESSED'` | every JM joke sits in "In review" forever |
| `joke.is_published` | `publish_status: PENDING\|PUBLISHED\|DISCARDED` | Content Waste reads 0 |

Each is a one-line mapping in `context.tsx`, and each currently makes a visible tile lie.

## Explicitly NOT in this plan

The feedback panel rewrite (it fabricates entries locally against a hardcoded ideal and leaks
graded proximity where the backend correctly returns pass/fail); the market board's
`team`/`bought_count` shape; stripping `avg_score` / `accepted_jokes` / the seven chart arrays
from the instructor view. Those are **panels**, not the workflow — they are Phase 3D. Folding
them in here triples the phase and delays a clickable round.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `services/marketingService.ts` | The Marketing routes, correctly named and typed. Replaces `qcService.ts`. | Create |
| `services/qcService.ts` | — | Delete |
| `services/customerService.ts` | Market read only; the human-buyer calls go. | Modify |
| `services/sessionService.ts` | Drop the `myTeam` call to a route that never existed. | Modify |
| `context.tsx` | Publish payload; the three field mappings; the null-batch guard. | Modify |
| `context.batchMapping.test.ts` | Pins the three field mappings against real backend payloads. | Create |

---

## Task 1: Rename the service, keep the flow

`qcService` is renamed rather than deleted, because four of its five calls are still correct
apart from their prefix. The fifth changes shape in Task 2.

**Files:** Create `services/marketingService.ts`; delete `services/qcService.ts`; update importers.

- [ ] **Step 1: Create the new service**

```typescript
import { apiRequest } from './apiClient';
import type {
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiSplitBatchRequest,
  BatchId,
  RoundId,
} from '../types';

/* The backend renamed the QC route prefix to /v1/marketing in V2. Split and unsplit were
   dropped in that refactor and restored in phase 3B, so all four of these exist again —
   only the prefix moved. Verified against src/app/server/server.go. */
export const marketingService = {
  queueNext(round_id: RoundId): Promise<ApiQcQueueNextResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/queue/next?round_id=${q}`, { method: 'GET' });
  },

  queueCount(round_id: RoundId): Promise<ApiQcQueueCountResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueCountResponse>(`/v1/marketing/queue/count?round_id=${q}`, { method: 'GET' });
  },

  splitBatch(batch_id: BatchId, body: ApiSplitBatchRequest): Promise<ApiQcQueueNextResponse> {
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/batches/${batch_id}/split`, { method: 'POST', body });
  },

  unsplitBatch(batch_id: BatchId): Promise<ApiQcQueueNextResponse> {
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/batches/${batch_id}/unsplit`, { method: 'POST' });
  },
};
```

`submitRatings` is deliberately absent — it is replaced in Task 2.

- [ ] **Step 2: Update importers and delete the old file**

`grep -rn "qcService" --include="*.ts" --include="*.tsx" .` and repoint every one. Then delete
`services/qcService.ts`.

**`services/mockApi.ts` must keep serving both prefixes** for now — it is the default runtime
(`.env.local` commits `VITE_USE_MOCK_API=true`) and breaking it breaks the app for anyone
without a local backend. If the mock routes on `/v1/qc/`, add the `/v1/marketing/` paths
alongside rather than replacing them.

- [ ] **Step 3: Verify**

`npm run typecheck 2>&1 | grep -c "error TS"` → **1** (the pre-existing `mockApi.ts:657`).
`npx vitest run` → **281 passing**, unchanged.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(api): rename qcService to marketingService

Four of the five calls were correct apart from their prefix: the backend
renamed /v1/qc to /v1/marketing in V2, and phase 3B restored split and
unsplit, so the splitting flow stays in Marketing where it belongs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The publish payload

This is the substantive change. The frontend sends a **rating** model that no longer exists —
`{ratings: [{joke_id, rating 1-5, tag, joke_title?, topic?}], feedback}` — and relies on the
server to pick which jokes ship. V2 deleted ratings entirely (`grep -i rating` over the
non-test Go source returns nothing). The backend now wants an **explicit decision per joke**:

```
POST /v1/marketing/batches/{id}/publish
{ "jokes": [ { "joke_id": 1, "joke_title": "Corporate Comedy", "is_published": true }, ... ] }
```

Rules the backend enforces, all verified live in 3B:
- **One decision per joke in the batch** — a partial list is rejected.
- **A published joke must have a non-empty title**; a discarded one need not.
- **Round 1 requires at least one published joke** (400 `NO_JOKE_PUBLISHED`); **Round 2 does
  not**. This is why the Round 2 publish-nothing flow works.

**Files:** `services/marketingService.ts`, `context.tsx`, `views/QualityControl.tsx` (call site only)

- [ ] **Step 1: Add the service call**

```typescript
/** One decision per joke in the batch. A published joke needs a non-empty title.
 *  Round 1 rejects an all-discard batch with 400 NO_JOKE_PUBLISHED; round 2 allows it. */
  publish(batch_id: BatchId, body: {
    jokes: Array<{ joke_id: number; joke_title: string; is_published: boolean }>;
  }): Promise<unknown> {
    return apiRequest<unknown>(`/v1/marketing/batches/${batch_id}/publish`, { method: 'POST', body });
  },
```

- [ ] **Step 2: Rewrite `rateBatch` as `publishBatch`**

`context.tsx` currently builds a `ratingList` from a `ratings` map and derives the title from
`rating >= 4`. Replace the whole function. The view already knows exactly which jokes ship —
`views/QualityControl.tsx:542` computes `submittingIds` — so pass that in rather than
reconstructing intent from scores:

```typescript
  const publishBatch = async (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
  ) => {
    if (!roundId) return;
    const bid = Number(batchId) as BatchId;
    const active = qcQueue?.batch?.batch_id === bid ? qcQueue : null;
    if (!active) return;

    // The backend requires a decision for EVERY joke in the batch, not just the published
    // ones (marketing_repo.go rejects a partial list), so build from the batch contents.
    const published = new Set(publishedIds);
    const jokes = (active.jokes ?? []).map(j => ({
      joke_id: Number(j.joke_id),
      joke_title: published.has(Number(j.joke_id)) ? (jokeTitles[String(j.joke_id)] ?? '').trim() : '',
      is_published: published.has(Number(j.joke_id)),
    }));

    try {
      await marketingService.publish(bid, { jokes });
      setQcQueue(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && e.message === 'NO_JOKE_PUBLISHED') {
        // Round 1 only. The round-2 flow deliberately allows an all-discard batch.
        alert('Round 1 requires at least one joke to be published.');
        return;
      }
      alert('Failed to publish the batch. Please try again.');
    }
  };
```

Keep the name `rateBatch` exported from the context if renaming it ripples too far — but if
you do, add a comment saying it publishes and no longer rates, because "rate" now describes
nothing the system does. Prefer the rename.

- [ ] **Step 3: Update the call site**

`views/QualityControl.tsx:586` calls
`rateBatch(batchId, ratings, tagsOut, batchFeedback, titlesOut, topicsOut)`. It becomes:

```typescript
    await publishBatch(batchId, submittingIds, titlesOut);
```

`ratings`, `tagsOut`, `batchFeedback` and `topicsOut` have nowhere to go: the backend stores no
rating, no tag, no batch feedback and no topic. **Do not silently drop the feedback textarea's
contents** — if the UI still collects batch feedback and tells the team it was sent, that is a
lie. Either remove the textarea and its "feedback sent to Joke Maker" toast copy, or leave them
and add a `TODO` naming the missing backend field. Say which you chose and why.

- [ ] **Step 4: Verify**

`npm run typecheck` → 1 error. `npx vitest run` → 281 passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): publish with explicit per-joke decisions

The frontend sent a rating model the backend deleted in V2 - there is no
joke_ratings table, no avg_score and no /ratings route - and relied on the
server to choose which jokes shipped. It now sends one explicit decision
per joke, built from the batch contents because a partial list is
rejected.

NO_JOKE_PUBLISHED is surfaced as a readable message; it fires in round 1
only, which is what makes the round-2 publish-nothing flow work.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The three field mappings

**Files:** `context.tsx`, `views/JokeMaker.tsx`, `context.batchMapping.test.ts` (create)

- [ ] **Step 1: Write the failing test**

`mapBatchFromTeamList` is module-private. Export it, then create
`context.batchMapping.test.ts`. The payload below is transcribed from a **real** response
captured in 3B — do not adjust it to match the code:

```typescript
import { describe, it, expect } from 'vitest';
import { mapBatchFromTeamList } from './context';

/* Captured from GET /v1/rounds/1/teams/1/batches against the live backend.
   The backend sends processed_at (not rated_at), PROCESSED (not RATED), and
   publish_status (not is_published). */
const realBatch = {
  batch_id: 1,
  status: 'PROCESSED' as const,
  submitted_at: '2026-09-13T21:33:10.000000-07:00',
  processed_at: '2026-09-13T21:33:19.011937-07:00',
  jokes: [
    {
      joke_id: 1, joke_text: 'a', joke_title: 'Crossing Over',
      publish_status: 'PUBLISHED', sold_count: 5,
      published_at: '2026-09-13T21:33:19.011937-07:00',
      first_sold_at: '2026-09-13T21:33:19.028595-07:00',
    },
    {
      joke_id: 2, joke_text: 'b', joke_title: null,
      publish_status: 'DISCARDED', sold_count: 0,
      published_at: null, first_sold_at: null,
    },
  ],
};

describe('mapBatchFromTeamList', () => {
  it('reads the publish timestamp from processed_at', () => {
    const b = mapBatchFromTeamList(1, 1 as never, realBatch as never);
    expect(b.ratedAt).toBe(Date.parse(realBatch.processed_at));
  });

  it('derives is_published from publish_status', () => {
    const b = mapBatchFromTeamList(1, 1 as never, realBatch as never);
    expect((b.jokes[0] as never as { is_published: boolean }).is_published).toBe(true);
    expect((b.jokes[1] as never as { is_published: boolean }).is_published).toBe(false);
  });

  it('keeps the real sales figures', () => {
    const b = mapBatchFromTeamList(1, 1 as never, realBatch as never);
    expect((b.jokes[0] as never as { sold_count: number }).sold_count).toBe(5);
  });

  it('survives a null jokes array', () => {
    // handler/batch.go declares `var jokes []gin.H`, so an empty batch sends null, not [].
    const b = mapBatchFromTeamList(1, 1 as never, { ...realBatch, jokes: null } as never);
    expect(b.jokes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

`npx vitest run context.batchMapping.test.ts` → the `processed_at` and `is_published`
assertions fail. Paste the output.

- [ ] **Step 3: Implement**

In `mapBatchFromTeamList` (`context.tsx`), three changes:

```typescript
  // The backend renamed rated_at -> processed_at in V2 (handler/batch.go). Accept both so a
  // stale mock response still maps.
  const ratedAtRaw = (teamBatches as any).processed_at ?? (teamBatches as any).rated_at;
  const ratedAt = ratedAtRaw ? Date.parse(ratedAtRaw) : undefined;
```

and in the joke mapping, derive the boolean rather than reading a field that never arrives:

```typescript
        // The backend sends publish_status: PENDING | PUBLISHED | DISCARDED. is_published is
        // kept as the UI's vocabulary, derived here at the boundary.
        is_published:
          (j as any)?.publish_status != null
            ? (j as any).publish_status === 'PUBLISHED'
            : ((j as any)?.is_published ?? undefined),
```

Then in `views/JokeMaker.tsx:36`, the terminal batch status:

```typescript
  // V2 renamed RATED to PROCESSED (domain/enums.go). Accept both; the mock still says RATED.
  if (batch.status !== 'PROCESSED' && batch.status !== 'RATED') return 'reviewing';
```

Update `BatchStatus` in `types.ts:25` to `'DRAFT' | 'SUBMITTED' | 'PROCESSED' | 'RATED'` so
the comparison typechecks, with a comment that `RATED` is the mock's legacy value.

- [ ] **Step 4: Run and confirm PASS** — 4 new tests, **285 passing** total.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(batches): map the fields V2 renamed

processed_at (was rated_at), PROCESSED (was RATED), and publish_status
(was is_published). Each was silently making a tile lie: Created to
Publish showed a dash for every batch, every JM joke sat in In Review
forever, and Content Waste read 0.

Both spellings are accepted at the boundary so the in-browser mock, which
still uses the old names, keeps working.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The null-batch crash, and deleting the dead client

**Files:** `context.tsx`, `services/customerService.ts`, `services/sessionService.ts`

- [ ] **Step 1: Guard the empty queue**

`GET /v1/marketing/queue/next` returns **200** `{batch: null, jokes: [], queue_size: N}` when
every batch is held by a teammate — `CountSubmittedBatchesForTeam` counts locked batches, so
`queue_size > 0` while `batch` is null. `context.tsx` builds `normalizedQueue` with no null
check and `views/QualityControl.tsx:466` then reads `qcQueue.batch.batch_id`. That is a
`TypeError` that blanks the Marketing screen, and it is reachable with two marketers on a team.

```typescript
              normalizedQueue = qData && qData.batch
                ? {
                    batch: qData.batch,
                    jokes: Array.isArray(qData.jokes) ? qData.jokes : [],
                    queue_size: qData.queue_size ?? size,
                  }
                : null;
```

A null `batch` means "the queue is not empty but nothing is available to me" — which renders
identically to an empty queue and is the correct behaviour.

- [ ] **Step 2: Delete the human-customer calls**

In `services/customerService.ts`, remove `budget`, `buy` and `return` — all three 404
(verified live). **Keep `market`**, which exists and is read-only. Then remove the
`role === Role.CUSTOMER` branch in `context.tsx` that calls `budget()`, and `buyJoke` /
`returnJoke`.

`views/Customer.tsx` is a self-contained offline explainer with no network calls — **do not
touch it**, and leave `Role.CUSTOMER` in the enum. Only the dead API client goes.

- [ ] **Step 3: Delete `sessionService.myTeam`**

It calls `/v1/session/team`, which has never existed in this backend, and has no callers —
the team popup is fed from `me.teammates`. Remove the method and its mock branch.

- [ ] **Step 4: Verify**

`npm run typecheck` → 1 error. `npx vitest run` → 285 passing. `npm run build` → succeeds,
then `git checkout -- dist/ && git clean -f dist/` (`dist/` is tracked and must end clean).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(marketing): handle an empty claim, drop the dead client

queue/next returns 200 {batch: null} when every batch is held by a
teammate - queue_size counts locked batches - and the frontend read
.batch_id straight off it, blanking the Marketing screen with a
TypeError. Reachable with two marketers on one team.

Also removes the human-customer API client (budget/buy/return all 404;
customers are simulated now) and sessionService.myTeam, which called a
route that never existed in this backend.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Walk the whole workflow in a browser

The point of the phase. No mock.

- [ ] **Step 1: Bring both sides up**

```bash
cd /Users/frankfu/Documents/GitHub/jokefactory_be && make run          # :8080
curl -s -X POST -H 'X-User-Id: 1' http://localhost:8080/v1/admin/reset # clean slate
```

```bash
cd /Users/frankfu/Documents/GitHub/AI-Joke-Factory
VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://localhost:8080 npx vite --port 3001 --strictPort
```

**Do not edit the committed `.env.local`** — override on the command line for this run only.

- [ ] **Step 2: Walk it, in three browser windows**

1. **Instructor** — log in, set the ideal profile (or "Use defaults"), Auto-Assign, Start.
2. **Joke Maker** — paste a multi-joke blob, submit. It must succeed; `jokes_count` will be 0.
3. **Marketing** — the batch appears. **The splitter must show the raw text**, not an empty
   card list. Split it into 5. Joke cards appear with real ids.
4. **Marketing** — title one, select it, release. The batch clears.
5. **Joke Maker** — the batch shows as processed, the published joke is no longer "In review",
   and Content Waste reads 4, not 0.

Watch the devtools console throughout. **Zero 404s on `/v1/qc/*`** — that is the assertion for
Task 1. Note any 409 on `/market` polling; it is known pre-existing noise, not yours.

- [ ] **Step 3: Test the Round 2 publish-nothing path**

End round 1, configure and start round 2 (it needs its own ideal profile), submit a batch, and
release with **nothing selected**. It must succeed — the backend allows an all-discard batch in
round 2 only. Then confirm the same action in round 1 shows the "at least one joke" message.

- [ ] **Step 4: Commit the evidence**

```bash
git commit --allow-empty -m "chore(fe): verify the role workflow against the live backend

JM submits a raw blob, Marketing splits, titles and publishes, the JM sees
the result. Round 2 publish-nothing works and round 1 refuses it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- A JM can submit and a Marketer can split, title and publish, in a browser, against the real
  backend.
- The JM sees the outcome — processed batch, published joke out of "In review", real Content
  Waste.
- No `/v1/qc/*` request is made anywhere.
- Round 2 allows publishing nothing; round 1 explains why it will not.
- 285 tests pass, typecheck holds at 1, `dist/` clean.

## What remains after this (Phase 3D)

The feedback panel still fabricates entries locally against a hardcoded ideal profile and
renders graded proximity bars where the backend correctly returns pass/fail only — it leaks
more than the learning design intends and none of it is real. The market board reads a
`team` object and `bought_count` the backend does not send. The instructor view renders four
charts off arrays that do not exist, and a leaderboard whose `Avg Score` and `Accepted Jokes`
columns cannot be restored because V2 deleted ratings as a concept.

---

# Execution log — COMPLETE (2026-09-13)

Executed subagent-driven. Commits `c03a07d`, `3f9dd1b`, `1e6d8fe`, `13c51be`.
**285 tests / 12 files**, typecheck holds at its 1 pre-existing error, `dist/` clean.

## Verified in a browser, against the live backend

A Joke Maker pasted a five-joke blob and submitted it. Marketing claimed it and **the splitter
rendered the raw text**, with Content Backlog reading **1** — it read 0 before, because
`/v1/qc/queue/count` 404'd. Zero console errors on either screen.

After split and publish, the Joke Maker's own view:

| Tile | Before 3C | After |
|---|---|---|
| Created to Publish | `—` | **1m 36s** |
| Content Waste | `0` | **4** |
| Jokes by stage | In review 5, forever | **In review 0 · On market 1 · Wasted 4** |
| Profit | — | **−$0.14** |

−$0.14 is independently correct: one publish at $0.10 plus four discards at $0.01, no sales
yet. Zero console errors, and **no `/v1/qc/*` request anywhere**.

## Things the plan got wrong

1. **`ratedAt` alone would not have fixed "Created to Publish".** The tile calls
   `computeAvgCreatedToPublishSeconds`, which reads the raw string `b.rated_at`
   (`services/economics.ts:103`), not the parsed number `b.ratedAt` the plan's snippet
   assigned. Both are now fed from the same `processed_at ?? rated_at` source. The plan's
   version would have passed its own test while the tile still showed a dash.
2. **Task 1 was internally impossible as written** — it said delete `qcService.ts` in commit 1,
   while `rateBatch` (commit 2's job) still called `submitRatings`. Carried through commit 1 as
   a commented holdover, deleted in commit 2.
3. **The plan never mentioned the mock needed a publish route.** Publishing is *the* Marketing
   action; without it the default no-Postgres runtime breaks at Release. Added, mirroring all
   three backend rules, and the mock now answers **both** route prefixes rather than swapping.
4. **`services/api/marketing.ts` already had a `publish`** — a parallel contract layer from
   phase 2 that nothing in the runtime imports. `services/marketingService.ts` now duplicates
   it. Worth collapsing in a later phase.
5. **That file's doc comment asserted the opposite of reality** — that an all-discard publish
   is rejected unconditionally and "a 'publish nothing' flow is NOT supported by this backend".
   3B made it round-scoped. Corrected; it would have misled phase 3D.

## The batch-feedback lie, which predates all of this

Marketing's feedback box was labelled "(sent to Joke Maker)" and its toast said "feedback sent
to Joke Maker". Nothing ever sent it: the only thing that stored feedback was **the marketer's
own browser localStorage**. A real Joke Maker in a different browser has always seen "Awaiting
Marketing's feedback" and always would have — the promise was false before V2 dropped the
field, and before this project started.

The textarea is kept (removing a teaching surface is the owner's call, and the panel is phase
3D's) but the copy no longer claims delivery: it now reads "(for your team's discussion — not
sent)", and a TODO names the missing backend field.

## Known-remaining, by design — phase 3D

The feedback panel still fabricates entries locally against a hardcoded ideal profile and
renders graded proximity bars where the backend correctly returns pass/fail only. The market
board reads a `team` object and `bought_count` the backend does not send. The instructor view
renders four charts from arrays that do not exist, and a leaderboard whose `Avg Score` and
`Accepted Jokes` columns cannot be restored, because V2 deleted ratings as a concept.

Also noted: the mock still carries the legacy `/ratings` route, now unreachable; and
`GET /v1/rounds/{id}/market` 409s on a polling loop while a round is not ACTIVE — pre-existing
noise, not introduced here.
