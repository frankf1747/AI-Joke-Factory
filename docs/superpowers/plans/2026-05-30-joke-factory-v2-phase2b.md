# AI Joke Factory V2 — Phase 2B (FE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the placeholder simulated buyer now that the real AI Customer Engine is live; verify the engine drives sales end-to-end; surface the new Lead Time KPI on JM and Marketing dashboards.

**Architecture:** No new architectural changes. The real backend now writes `purchases` rows in response to its internal customer-engine tick — the FE's flow viz and dashboards already poll the existing endpoints, so they pick up the new behaviour automatically. Two small additions: (a) feature-flag the dumb buyer in the mock so dev mode still feels alive without it, (b) read the new `first_sold_at` / `published_at` fields exposed by BE Item #4 to compute Lead Time.

**Tech Stack:** React 19, TypeScript ~5.8, Vite 6, Vitest.

**Dependencies that MUST be live before starting:**
- BE Phase 2A (Item #9) — classifier live (otherwise the engine can't compute fits).
- BE Phase 2B (Items #5, #4) — customer engine ticking; `first_sold_at` + `published_at` fields exposed on the team batches endpoint.

**Testing approach:**
- Pure logic (lead-time computation): Vitest TDD.
- UI / integration: manual verification against the live engine.

---

## File Structure

**Modified files:**
- `services/mockApi.ts` — gate the `simulateBuyerTick` placeholder behind a config flag (off by default; on when running disconnected for FE-only dev).
- `config/simConfig.ts` — add a `devSimulatedBuyer` flag.
- `types.ts` — extend `ApiTeamBatchesResponse` joke shape with `first_sold_at?` and `published_at?`.
- `views/JokeMaker.tsx` and `views/QualityControl.tsx` — add Lead Time stat box.
- `services/economics.ts` — add a `computeLeadTimeSeconds` pure helper.
- `services/economics.test.ts` — add tests for the new helper.

---

## Task 1: Feature-flag the dumb mock buyer

**Files:**
- Modify: `config/simConfig.ts` (add a `dev` block)
- Modify: `services/mockApi.ts` — guard `simulateBuyerTick` behind the flag.

- [ ] **Step 1: Add the dev flag to sim-config**

In `config/simConfig.ts`, inside the `SIM_CONFIG` object, append:

```ts
  // ---- Dev-mode toggles ----
  dev: {
    /**
     * When true (mock-only mode), the mock backend's `simulateBuyerTick`
     * auto-buys published jokes so the flow-viz "Sold" lane animates.
     * Off in production-like mode; the real AI Customer Engine handles buying.
     */
    simulatedBuyerInMock: true,
  },
```

- [ ] **Step 2: Guard the simulated buyer in `mockApi.ts`**

In `services/mockApi.ts`, find the `mockApiRequest` function. The line currently reads (approximately):

```ts
  if (String(opts.method ?? 'GET').toUpperCase() === 'GET') simulateBuyerTick(db);
```

Replace with:

```ts
  if (
    SIM_CONFIG.dev.simulatedBuyerInMock &&
    String(opts.method ?? 'GET').toUpperCase() === 'GET'
  ) {
    simulateBuyerTick(db);
  }
```

(`SIM_CONFIG` is already imported in `mockApi.ts` after Phase 1.)

- [ ] **Step 3: Build + test check**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add config/simConfig.ts services/mockApi.ts
git commit -m "chore: gate mock simulated buyer behind dev flag"
```

---

## Task 2: Verify the real engine drives sales

**Files:** (verification-only)

- [ ] **Step 1: Run against real BE with mock disabled**

Confirm `.env.local` has `VITE_USE_MOCK_API=false`. Run `npm run dev`.

- [ ] **Step 2: Start a round; submit + rate enough jokes to trigger sales**

As Instructor → start a round (with an instructor-configured ideal joke profile via the code-config module on BE side — coordinate with Hussain). As JM → submit a couple of batches. As Marketing → rate them; force-release publishes at least 1 per batch.

- [ ] **Step 3: Watch the flow-viz "Sold" lane**

Expected: within ~15–30 s after the first publish, the **Sold** count begins ticking up automatically (engine ticks every 15 s). The pace and distribution should look spread (per-customer jitter), not all-at-once.

- [ ] **Step 4: Confirm sales totals on JM + Marketing cards**

Expected: `total_sales` increments as customers buy. Profit card moves from net-negative to positive on teams whose jokes hit the ideal.

If sales do not appear, flag against BE Item #5 acceptance.

---

## Task 3: Lead-Time helper (pure logic + tests)

**Files:**
- Modify: `services/economics.ts`
- Modify: `services/economics.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `services/economics.test.ts`:

```ts
import { computeLeadTimeSeconds } from './economics';

describe('computeLeadTimeSeconds', () => {
  it('returns seconds between created (submitted) and first sold', () => {
    expect(
      computeLeadTimeSeconds('2026-06-01T10:00:00Z', '2026-06-01T10:01:30Z'),
    ).toBe(90);
  });

  it('returns null if first_sold_at is null/undefined', () => {
    expect(computeLeadTimeSeconds('2026-06-01T10:00:00Z', null)).toBeNull();
    expect(computeLeadTimeSeconds('2026-06-01T10:00:00Z', undefined)).toBeNull();
  });

  it('returns null on invalid input', () => {
    expect(computeLeadTimeSeconds(undefined as any, '2026-06-01T10:01:30Z')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL (`computeLeadTimeSeconds` not exported).

- [ ] **Step 3: Implement the helper**

Append to `services/economics.ts`:

```ts
/**
 * Lead time = seconds between joke "created" (batch submitted_at) and the
 * joke's first sale (purchase_events.created_at, exposed as first_sold_at).
 * Returns null if the joke has not yet sold.
 */
export function computeLeadTimeSeconds(
  submittedAt: string | undefined | null,
  firstSoldAt: string | undefined | null,
): number | null {
  if (!submittedAt || !firstSoldAt) return null;
  const t0 = Date.parse(submittedAt);
  const t1 = Date.parse(firstSoldAt);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.max(0, Math.round((t1 - t0) / 1000));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/economics.ts services/economics.test.ts
git commit -m "feat: add computeLeadTimeSeconds helper"
```

---

## Task 4: Surface per-joke timestamps from the API

**Files:**
- Modify: `types.ts` — extend the batches endpoint joke shape.

- [ ] **Step 1: Extend the type**

In `types.ts`, find `interface ApiTeamBatchesResponse`. Inside the per-joke array element type, add:

```ts
        first_sold_at?: string | null;
        published_at?: string | null;
```

- [ ] **Step 2: Build check**

Run: `npm run build` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: type per-joke first_sold_at and published_at"
```

---

## Task 5: Render team-level Lead Time KPI

**Files:**
- Modify: `views/JokeMaker.tsx`
- Modify: `views/QualityControl.tsx`

Compute a team's average lead time from its own batches' jokes (use the `batches` already in context).

- [ ] **Step 1: Add a helper that aggregates lead times for the team**

In both `views/JokeMaker.tsx` and `views/QualityControl.tsx`, add the import and a small in-component memo near where stats are computed:

```ts
import { computeLeadTimeSeconds } from '../services/economics';

// inside the component, near other derived stats:
const leadTimes = React.useMemo(() => {
  const out: number[] = [];
  for (const b of myBatches) {                  // or `batches.filter(b => b.team === user?.team)` in QC
    for (const j of b.jokes ?? []) {
      const t = computeLeadTimeSeconds(b.submitted_at, (j as any).first_sold_at);
      if (t !== null) out.push(t);
    }
  }
  return out;
}, [myBatches]);

const avgLeadTimeSec = leadTimes.length
  ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
  : null;

const leadTimeDisplay =
  avgLeadTimeSec == null ? '—' :
  avgLeadTimeSec < 60 ? `${avgLeadTimeSec}s` :
  `${Math.floor(avgLeadTimeSec / 60)}m ${avgLeadTimeSec % 60}s`;
```

- [ ] **Step 2: Add a StatBox**

In both views' stat grid, add:

```tsx
<StatBox label="Avg Lead Time" value={leadTimeDisplay} color="bg-sky-50 text-sky-700" />
```

- [ ] **Step 3: Build check**

Run: `npm run build` — Expected: PASS.

- [ ] **Step 4: Manual verification**

Run against real BE. Submit some jokes; rate them; wait for sales.
Expected: "Avg Lead Time" populates with a sensible number (seconds, then minutes once jokes age). Reads `—` while no jokes have sold yet.

- [ ] **Step 5: Commit**

```bash
git add views/JokeMaker.tsx views/QualityControl.tsx
git commit -m "feat: surface team avg Lead Time on JM and Marketing dashboards"
```

---

## Self-Review

- **Dumb mock buyer** → Task 1 (gated, not deleted — dev still has it on by default).
- **Real engine driving sales** → Task 2 verification.
- **Lead Time pure logic** → Tasks 3–4 (helper + types).
- **Lead Time on dashboards** → Task 5.
- No removal of Phase 1 features. No code change required if BE shape exactly matches the spec; otherwise small fix-ups noted in each task.
