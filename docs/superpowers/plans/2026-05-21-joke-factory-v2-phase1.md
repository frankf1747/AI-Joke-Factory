# AI Joke Factory V2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six independent Phase-1 frontend changes (two-cost profit, force-release, category palette, QC→Marketing rename, flow visualization, cheap polling fix) running entirely on the local mock API, with all economics/persona values centralized in one editable config module.

**Architecture:** Frontend-only React 19 + Vite app. All backend calls are routed through the existing localStorage mock (`services/mockApi.ts`) via `apiClient.ts`'s `shouldUseMockApi()` switch. A new `config/simConfig.ts` module holds every tunable number. Pure logic (config validation, profit math, force-release selection, length classification) is unit-tested with Vitest; UI changes are verified manually in the browser plus a TypeScript build check.

**Tech Stack:** React 19, TypeScript ~5.8, Vite 6, lucide-react (icons), recharts (charts), Vitest (added in Task 2).

**Companion design docs (Obsidian):** `V2-Workflow`, `Backend Change Requests (V2)`. The backend tracker is the contract for reconnecting the real server later; **do not** modify backend behavior here.

**Testing approach (read before starting):**
- **Pure logic modules** → Vitest TDD (write failing test → implement → pass → commit).
- **UI / React rendering** → there is no component-test harness and the owner tests visually. Each UI task ends with a **Manual Verification** step (exact click-path + expected result) and a **build check** (`npm run build` must pass with no TS errors).
- Each task is independently committable. Commit after each task.

---

## File Structure

**New files:**
- `config/simConfig.ts` — single source of truth for the Phase 1 sim: Topic categories, economics (creation/publish/market price, buyer budget), and length classification thresholds (3 buckets). Owner edits this freely. (Phase 2 extends this module with the engine config — ideal joke profile, τ, M, jitter — when those land.)
- `config/simConfig.test.ts` — Vitest tests for the category palette + length classifier.
- `services/economics.ts` — pure functions: `computeProfit`, `classifyLength`, `selectPublishedJokeIds` (force-release). Imported by the mock.
- `services/economics.test.ts` — Vitest tests for the pure functions.
- `components/FlowBoard.tsx` — the Kanban value-stream visualization.
- `vitest.config.ts` — Vitest configuration.

**Modified files:**
- `.env.local` — flip to mock-only.
- `package.json` — add Vitest + `test` script.
- `types.ts` — add `costOfCreation` to `GameConfig`; add `categories` strings already covered by config.
- `context.tsx` — add `costOfCreation` to config defaults + round mapping; pass through; cheap polling fix (visibility-aware interval).
- `services/mockApi.ts` — compute profit/jokes_created/cost_breakdown in team summary; force-release via `selectPublishedJokeIds`; persist `category` on ratings; expose published/sold for the flow board; lightweight simulated buyer.
- `views/JokeMaker.tsx` — 4-line profit breakdown; soft category hint; "Marketing" wording.
- `views/QualityControl.tsx` — 4-line profit breakdown; category selector; "Marketing" wording.
- `views/Customer.tsx`, `views/Instructor.tsx`, `components.tsx` — "Marketing" wording where user-facing.

---

## Task 1: Switch to mock-only mode

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Force the mock API**

Replace the contents of `.env.local` with:

```
# Phase 1: run entirely on the local mock API (real server disconnected).
# To reconnect later, set VITE_USE_MOCK_API=false and restore VITE_API_BASE_URL.
# VITE_API_BASE_URL=https://jokefactory-be.onrender.com
VITE_USE_MOCK_API=true
```

- [ ] **Step 2: Verify mock mode at runtime**

Run: `npm run dev`
Open `http://localhost:3000`, open DevTools → Application → Local Storage. Join as a player.
Expected: a `joke_factory_mock_db_v1` key appears in localStorage, and the Network tab shows **no** requests to `jokefactory-be.onrender.com` or `localhost:8081`.

- [ ] **Step 3: Commit**

```bash
git add .env.local
git commit -m "chore: run frontend on local mock API only (Phase 1)"
```

---

## Task 2: Add Vitest test harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `services/economics.test.ts` (temporary smoke test, expanded in Task 5)

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@^2.1.0`
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the test script**

In `package.json`, add a `test` entry to `scripts` so the block reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `services/economics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts services/economics.test.ts
git commit -m "chore: add Vitest test harness"
```

---

## Task 3: Central sim-config module

**Files:**
- Create: `config/simConfig.ts`
- Create: `config/simConfig.test.ts`

This is the file the owner edits to retune the simulation. All numbers from the design doc live here.

- [ ] **Step 1: Write failing tests for the sim-config**

Create `config/simConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SIM_CONFIG, classifyLength } from './simConfig';

describe('SIM_CONFIG categories', () => {
  it('has 10 approved Topic categories', () => {
    expect(SIM_CONFIG.categories).toHaveLength(10);
  });

  it('category ids are unique', () => {
    const ids = SIM_CONFIG.categories.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('SIM_CONFIG economics', () => {
  it('all costs are non-negative numbers', () => {
    const e = SIM_CONFIG.economics;
    expect(e.marketPrice).toBeGreaterThan(0);
    expect(e.costOfCreation).toBeGreaterThanOrEqual(0);
    expect(e.costOfPublishing).toBeGreaterThanOrEqual(0);
    expect(e.buyerBudget).toBeGreaterThan(0);
  });
});

describe('classifyLength (3 buckets)', () => {
  it('classifies short / medium / long by word count', () => {
    expect(classifyLength('one two three')).toBe('short');                 // 3 words → short
    expect(classifyLength(Array(25).fill('w').join(' '))).toBe('short');   // boundary 25 → short
    expect(classifyLength(Array(40).fill('w').join(' '))).toBe('medium');  // 40 words → medium
    expect(classifyLength(Array(60).fill('w').join(' '))).toBe('medium');  // boundary 60 → medium
    expect(classifyLength(Array(80).fill('w').join(' '))).toBe('long');    // 80 words → long
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./simConfig`.

- [ ] **Step 3: Implement `config/simConfig.ts`**

```ts
// Single source of truth for the AI Joke Factory Phase 1 simulation.
// Phase 2 will extend this module with the customer engine config
// (ideal joke profile, τ, M, jitter, tick) when those land.

export type CategoryId =
  | 'workplace' | 'mba' | 'tech' | 'ai' | 'animals' | 'sports'
  | 'everyday' | 'social_media' | 'education' | 'random';

export type LengthClass = 'short' | 'medium' | 'long';

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: string; // emoji for quick visual coding
}

export const SIM_CONFIG = {
  // ---- Approved Topic categories (10 — from the professor's joke universe) ----
  categories: [
    { id: 'workplace',    label: 'Workplace',          icon: '🏢' },
    { id: 'mba',          label: 'MBA / Student Life', icon: '🎓' },
    { id: 'tech',         label: 'Tech',               icon: '💻' },
    { id: 'ai',           label: 'AI',                 icon: '🤖' },
    { id: 'animals',      label: 'Animals',            icon: '🐾' },
    { id: 'sports',       label: 'Sports',             icon: '🏅' },
    { id: 'everyday',     label: 'Everyday life',      icon: '☕' },
    { id: 'social_media', label: 'Social media',       icon: '📱' },
    { id: 'education',    label: 'Education',          icon: '📚' },
    { id: 'random',       label: 'Random / absurd',    icon: '🎲' },
  ] as CategoryDef[],

  bannedCategories: ['Religion', 'Politics', 'Tragedy', 'Targeting a person or group'],

  // ---- Economics (assume ~15 teams) ----
  economics: {
    marketPrice:      1.00,  // revenue per joke sold
    costOfCreation:   0.10,  // per joke created (charged at submit)
    costOfPublishing: 0.10,  // per joke released to market
    buyerBudget:      3.00,  // per AI customer, in $ (= up to 3 jokes held)
  },

  // ---- Length classification (3 buckets, used by the Phase 2 classifier later) ----
  length: { shortMaxWords: 25, longMinWords: 61 },
};

export function classifyLength(text: string): LengthClass {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= SIM_CONFIG.length.shortMaxWords) return 'short';
  if (words >= SIM_CONFIG.length.longMinWords) return 'long';
  return 'medium';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — categories + economics + classifyLength tests green.

- [ ] **Step 5: Commit**

```bash
git add config/simConfig.ts config/simConfig.test.ts
git commit -m "feat: add central sim-config (10 Topic categories, economics, length classifier)"
```

---

## Task 4: Add `costOfCreation` to config plumbing

**Files:**
- Modify: `types.ts:101-113` (the `GameConfig` interface)
- Modify: `context.tsx:36-38` (constants), `context.tsx:419-430` (defaults), `context.tsx:583-598` and `context.tsx:919-934` (round mapping)

- [ ] **Step 1: Add the field to `GameConfig`**

In `types.ts`, inside `interface GameConfig`, add after `costOfPublishing: number;`:

```ts
  costOfCreation: number;
```

- [ ] **Step 2: Add the default constant**

In `context.tsx`, after line 38 (`const DEFAULT_COST_OF_PUBLISHING = 0.1;`) add:

```ts
const DEFAULT_COST_OF_CREATION = 0.1;
```

- [ ] **Step 3: Add to initial config**

In `context.tsx` `initialConfig()` (around line 429), after `costOfPublishing: DEFAULT_COST_OF_PUBLISHING,` add:

```ts
    costOfCreation: DEFAULT_COST_OF_CREATION,
```

- [ ] **Step 4: Map it from the round payload (two places)**

In `context.tsx`, both config-mapping blocks (near lines 583 and 919) compute `nextCostOfPublishing`. Immediately after each `const nextCostOfPublishing = ...;` add:

```ts
                const nextCostOfCreation =
                  shouldUseBackendConfig && Number((selectedRound as any)?.cost_of_creation) >= 0
                    ? Number((selectedRound as any)?.cost_of_creation)
                    : prev.costOfCreation ?? DEFAULT_COST_OF_CREATION;
```

(Match the surrounding indentation at each site.) Then, in each returned config object that sets `costOfPublishing: nextCostOfPublishing,` add on the next line:

```ts
                  costOfCreation: nextCostOfCreation,
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: PASS — no TypeScript errors. (`GameConfig` now requires `costOfCreation`; the default + both mappings supply it.)

- [ ] **Step 6: Commit**

```bash
git add types.ts context.tsx
git commit -m "feat: add costOfCreation to game config plumbing"
```

---

## Task 5: Two-cost profit in the mock (pure logic + wiring)

**Files:**
- Create: `services/economics.ts`
- Modify: `services/economics.test.ts` (replace smoke test)
- Modify: `services/mockApi.ts:265-290` (`computeTeamStats`), `services/mockApi.ts:722-744` (summary route)
- Modify: `types.ts` (`ApiTeamSummaryResponse`) to add new optional fields

- [ ] **Step 1: Write failing tests for `computeProfit`**

Replace the contents of `services/economics.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { computeProfit } from './economics';

describe('computeProfit (two-cost)', () => {
  const rates = { marketPrice: 1, costOfCreation: 0.1, costOfPublishing: 0.1 };

  it('a sold joke nets price minus both costs', () => {
    // 1 created, 1 published, 1 sold
    expect(computeProfit({ created: 1, published: 1, sold: 1 }, rates)).toBeCloseTo(0.8, 6);
  });

  it('a published-but-unsold joke loses creation + publish', () => {
    expect(computeProfit({ created: 1, published: 1, sold: 0 }, rates)).toBeCloseTo(-0.2, 6);
  });

  it('a created-but-rejected joke loses only creation', () => {
    expect(computeProfit({ created: 1, published: 0, sold: 0 }, rates)).toBeCloseTo(-0.1, 6);
  });

  it('scales: 40 created, 20 published, 11 sold', () => {
    // 11 - 4 - 2 = 5
    expect(computeProfit({ created: 40, published: 20, sold: 11 }, rates)).toBeCloseTo(5, 6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeProfit` is not exported from `./economics`.

- [ ] **Step 3: Implement `services/economics.ts`**

```ts
export interface CostRates {
  marketPrice: number;
  costOfCreation: number;
  costOfPublishing: number;
}

export interface Counts {
  created: number;
  published: number;
  sold: number;
}

/**
 * Two-cost profit model:
 *   profit = sold*price - created*creation - published*publish
 */
export function computeProfit(counts: Counts, rates: CostRates): number {
  return (
    counts.sold * rates.marketPrice -
    counts.created * rates.costOfCreation -
    counts.published * rates.costOfPublishing
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `computeProfit` tests green.

- [ ] **Step 5: Add summary fields to the API type**

In `types.ts`, inside `interface ApiTeamSummaryResponse`, add after `unsold_jokes?: number;`:

```ts
  jokes_created?: number;
  jokes_published?: number;
  cost_breakdown?: { revenue: number; production_cost: number; publish_cost: number; profit: number };
}
```

(Ensure the closing brace count is unchanged — you are adding three members before the existing `}`.)

- [ ] **Step 6: Compute the counts + profit in the mock**

In `services/mockApi.ts`, at the top add an import:

```ts
import { computeProfit } from './economics';
import { SIM_CONFIG } from '../config/simConfig';
```

In `computeTeamStats` (around line 265), before the `return {`, add:

```ts
  const jokes_created = teamBatches.reduce((sum, b) => sum + b.jokes.length, 0);
  const jokes_published = rated.reduce((sum, b) => sum + (b.passes_count ?? 0), 0);
```

and include them in the returned object:

```ts
    jokes_created,
    jokes_published,
```

- [ ] **Step 7: Return profit + breakdown from the summary route**

In `services/mockApi.ts` summary route (around line 730), build the breakdown from `stats` and the configured rates, then add to the `resp` object. Replace the `const resp: ApiTeamSummaryResponse = { ... };` block with:

```ts
      const rates = {
        marketPrice: SIM_CONFIG.economics.marketPrice,
        costOfCreation: SIM_CONFIG.economics.costOfCreation,
        costOfPublishing: SIM_CONFIG.economics.costOfPublishing,
      };
      const profit = computeProfit(
        { created: (stats as any).jokes_created, published: (stats as any).jokes_published, sold: stats.total_sales },
        rates,
      );
      const resp: ApiTeamSummaryResponse = {
        team,
        round_id,
        rank: 1,
        points,
        total_sales: stats.total_sales,
        batches_created: stats.batches_created,
        batches_rated: stats.batches_rated,
        accepted_jokes: stats.accepted_jokes,
        avg_score_overall: stats.avg_score_overall,
        unrated_batches: stats.unrated_batches,
        jokes_created: (stats as any).jokes_created,
        jokes_published: (stats as any).jokes_published,
        profit: Number(profit.toFixed(2)),
        cost_breakdown: {
          revenue: Number((stats.total_sales * rates.marketPrice).toFixed(2)),
          production_cost: Number(((stats as any).jokes_created * rates.costOfCreation).toFixed(2)),
          publish_cost: Number(((stats as any).jokes_published * rates.costOfPublishing).toFixed(2)),
          profit: Number(profit.toFixed(2)),
        },
      };
```

- [ ] **Step 8: Build + unit test check**

Run: `npm run build && npm test`
Expected: PASS — build clean, all tests green.

- [ ] **Step 9: Commit**

```bash
git add services/economics.ts services/economics.test.ts services/mockApi.ts types.ts
git commit -m "feat: two-cost profit model in mock team summary"
```

---

## Task 6: 4-line profit breakdown UI (JM + Marketing)

**Files:**
- Modify: `views/JokeMaker.tsx:313-334` (profit flip-card)
- Modify: `views/QualityControl.tsx:391-412` (profit flip-card)

The back face of the profit card currently shows `p × Total Sales − c × Published`. Update both to the three-cost breakdown using the new `cost_breakdown`.

- [ ] **Step 1: JokeMaker — read the breakdown**

In `views/JokeMaker.tsx`, after the `const cDisplay = ...` line (line 64), add:

```ts
  const breakdown = (teamSummary as any)?.cost_breakdown as
    | { revenue: number; production_cost: number; publish_cost: number; profit: number }
    | undefined;
  const fmt = (n: number | undefined) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '—');
```

- [ ] **Step 2: JokeMaker — replace the flip-card back face**

Replace the back-face `<div ...flip-card-back...>` block (lines ~321-332) with:

```tsx
                <div
                  className={`flip-card-face flip-card-back ${profitBoxColor} p-4 flex flex-col items-center justify-center shadow-sm`}
                  title="Profit = Revenue − Production cost − Publish cost"
                >
                  <div className="inline-flex flex-col items-start text-xs font-semibold text-gray-900 leading-snug">
                    <div>Revenue: {fmt(breakdown?.revenue)}</div>
                    <div>− Production: {fmt(breakdown?.production_cost)}</div>
                    <div>− Publish: {fmt(breakdown?.publish_cost)}</div>
                    <div className="mt-1 border-t border-gray-300 pt-1">= Profit: {fmt(breakdown?.profit)}</div>
                  </div>
                </div>
```

- [ ] **Step 3: Marketing — apply the identical change**

In `views/QualityControl.tsx`, add the same `breakdown` + `fmt` constants after line 106, and replace the back-face block (lines ~399-410) with the identical markup from Step 2.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: PASS — no TS errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. As instructor (`Charles2026`), start a round; as a JM submit a 5-joke batch; as Marketing rate it (give some 5s). Return to JM, hover/flip the **Profit** card.
Expected: the back face shows four lines — Revenue, − Production, − Publish, = Profit — and Profit equals `Revenue − Production − Publish` (e.g. created 5 → Production $0.50). Profit goes **negative** before any sale (you paid to create) and rises after sales.

- [ ] **Step 6: Commit**

```bash
git add views/JokeMaker.tsx views/QualityControl.tsx
git commit -m "feat: 4-line profit breakdown (revenue/production/publish/profit)"
```

---

## Task 7: Force-release ≥1 joke per batch (pure logic + mock)

**Files:**
- Modify: `services/economics.ts` (add `selectPublishedJokeIds`)
- Modify: `services/economics.test.ts`
- Modify: `services/mockApi.ts:837-893` (ratings route), `services/mockApi.ts:225-254` (`getMarketItems`)

Replace the current "publish all jokes rated ≥3" rule with: publish all 5-rated jokes; if none scored 5, publish the single highest-rated joke (ties → lowest joke_id, or a provided tiebreak).

- [ ] **Step 1: Write failing tests**

Append to `services/economics.test.ts`:

```ts
import { selectPublishedJokeIds } from './economics';

describe('selectPublishedJokeIds (force-release)', () => {
  it('publishes all 5-rated jokes when present', () => {
    const ids = selectPublishedJokeIds([
      { joke_id: 1, rating: 5 },
      { joke_id: 2, rating: 3 },
      { joke_id: 3, rating: 5 },
    ]);
    expect(ids.sort()).toEqual([1, 3]);
  });

  it('publishes the single highest-rated when no 5 exists', () => {
    const ids = selectPublishedJokeIds([
      { joke_id: 1, rating: 2 },
      { joke_id: 2, rating: 4 },
      { joke_id: 3, rating: 3 },
    ]);
    expect(ids).toEqual([2]);
  });

  it('breaks ties by lowest joke_id when no 5 exists', () => {
    const ids = selectPublishedJokeIds([
      { joke_id: 7, rating: 4 },
      { joke_id: 3, rating: 4 },
    ]);
    expect(ids).toEqual([3]);
  });

  it('always returns at least one joke for a non-empty batch', () => {
    const ids = selectPublishedJokeIds([{ joke_id: 9, rating: 1 }]);
    expect(ids).toEqual([9]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `selectPublishedJokeIds` not exported.

- [ ] **Step 3: Implement the selector**

Append to `services/economics.ts`:

```ts
export interface RatedJoke {
  joke_id: number;
  rating: number;
}

/**
 * Force-release rule: publish all 5-rated jokes; if none scored 5, publish the
 * single highest-rated joke (ties broken by lowest joke_id). Never returns empty
 * for a non-empty batch.
 */
export function selectPublishedJokeIds(jokes: RatedJoke[]): number[] {
  if (jokes.length === 0) return [];
  const fives = jokes.filter(j => j.rating === 5).map(j => j.joke_id);
  if (fives.length > 0) return fives;
  const best = [...jokes].sort((a, b) => b.rating - a.rating || a.joke_id - b.joke_id)[0];
  return [best.joke_id];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Wire force-release into the ratings route**

In `services/mockApi.ts` add `selectPublishedJokeIds` to the economics import:

```ts
import { computeProfit, selectPublishedJokeIds } from './economics';
```

In the ratings route (around line 863-881), after `ratingByJoke` is built, compute published ids and store them on the batch. Replace the lines computing `passes` and `publishedIds` so the block reads:

```ts
      const vals = batch.jokes.map(j => ratingByJoke[String(j.joke_id)] ?? 1);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

      const publishedIds = selectPublishedJokeIds(
        batch.jokes.map(j => ({ joke_id: j.joke_id, rating: ratingByJoke[String(j.joke_id)] ?? 1 })),
      );
      const passes = publishedIds.length;

      batch.status = 'RATED';
      batch.rated_at = isoNow();
      batch.avg_score = Number(avg.toFixed(2));
      batch.passes_count = passes;
      const publishedSet = new Set(publishedIds);
      batch.jokes = batch.jokes.map(j => {
        const rating = ratingByJoke[String(j.joke_id)] ?? 1;
        const title = titleByJoke[String(j.joke_id)];
        return {
          ...j,
          ...(publishedSet.has(j.joke_id) ? { is_published: true } : { is_published: false }),
          ...(title ? { joke_title: title } : {}),
        };
      });
      persistDb(db);

      const resp: ApiQcSubmitRatingsResponse = {
        batch: {
          batch_id: batch.batch_id,
          status: batch.status,
          rated_at: batch.rated_at!,
          avg_score: batch.avg_score ?? 0,
          passes_count: batch.passes_count ?? 0,
        },
        published: { count: publishedIds.length, joke_ids: publishedIds },
      };
      return ok(resp, 200);
```

Add `is_published?: boolean` to the `MockBatch.jokes` element type (line ~67):

```ts
  jokes: Array<{ joke_id: JokeId; joke_text: string; joke_title?: string; is_published?: boolean }>;
```

- [ ] **Step 6: Make the market read `is_published`**

In `getMarketItems` (line ~225-254), replace the `.filter(({ batch, joke }) => {...})` block (which currently slices by `passes_count`) with a filter on the per-joke flag:

```ts
    .filter(({ joke }) => Boolean((joke as any).is_published))
```

- [ ] **Step 7: Build + test check**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Start a round; submit a batch; as Marketing rate **all jokes 1–2 (no 5s)** and submit. As Customer, open the market.
Expected: exactly **one** joke from that batch appears in the market (the highest-rated). Rate another batch with two 5s → both 5s appear.

- [ ] **Step 9: Commit**

```bash
git add services/economics.ts services/economics.test.ts services/mockApi.ts
git commit -m "feat: force-release at least one joke per rated batch"
```

---

## Task 8: Category palette — Marketing assigns, JM soft-hint

**Files:**
- Modify: `services/mockApi.ts` (persist `category` on ratings; include in market items)
- Modify: `types.ts` (`ApiQcSubmitRatingsRequest`, `ApiMarketItem`)
- Modify: `views/QualityControl.tsx` (category selector per joke; send categories)
- Modify: `context.tsx` `rateBatch` (pass categories through)
- Modify: `views/JokeMaker.tsx` (soft hint line)

- [ ] **Step 1: Extend the ratings request + market item types**

In `types.ts`, change the `ratings` element in `ApiQcSubmitRatingsRequest` to include `category`:

```ts
  ratings: Array<{ joke_id: JokeId; rating: number; tag: string; joke_title?: string; category?: string }>;
```

In `ApiMarketItem`, add:

```ts
  category?: string;
```

- [ ] **Step 2: Persist category in the mock ratings route**

In `services/mockApi.ts` ratings route, alongside `titleByJoke`, build a `categoryByJoke` map:

```ts
      const categoryByJoke: Record<string, string> = {};
      for (const r of ratings) {
        const jid = Number((r as any).joke_id);
        const cat = String((r as any).category ?? '').trim();
        if (Number.isFinite(jid) && cat) categoryByJoke[String(jid)] = cat;
      }
```

In the `batch.jokes = batch.jokes.map(...)` block (from Task 7 Step 5), add category persistence by extending the returned object with:

```ts
          ...(categoryByJoke[String(j.joke_id)] ? { category: categoryByJoke[String(j.joke_id)] } : {}),
```

Add `category?: string` to the `MockBatch.jokes` element type:

```ts
  jokes: Array<{ joke_id: JokeId; joke_text: string; joke_title?: string; is_published?: boolean; category?: string }>;
```

In `getMarketItems`, include the category in the mapped item:

```ts
        category: (joke as any).category ?? undefined,
```

- [ ] **Step 3: Marketing UI — category selector**

In `views/QualityControl.tsx`:

Add at top: `import { SIM_CONFIG } from '../config/simConfig';`

Add state near the other rating state (after `jokeTitles`):

```ts
  const [jokeCategories, setJokeCategories] = useState<Record<string, string>>({});
```

Inside the joke card (after the rating/tag grid, before the title block ~line 295), insert a category chip row:

```tsx
                       <div className="mt-3">
                         <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Category (required)</span>
                         <div className="flex flex-wrap gap-2">
                           {SIM_CONFIG.categories.map(cat => {
                             const selected = jokeCategories[joke.id] === cat.id;
                             return (
                               <button
                                 key={cat.id}
                                 onClick={() => {
                                   setJokeCategories(prev => ({ ...prev, [joke.id]: cat.id }));
                                   if (submitError) setSubmitError(null);
                                 }}
                                 className={`text-xs px-2 py-1 rounded border transition-colors ${
                                   selected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                                 }`}
                               >
                                 {cat.icon} {cat.label}
                               </button>
                             );
                           })}
                         </div>
                       </div>
```

Require a category in `isBatchFullyRated` — add to the return expression:

```ts
    const allCategorized = batch.jokes.every(j => Boolean(jokeCategories[j.id]));
    return allRated && allTagged && allCategorized && feedbackValid && titlesValid;
```

In `submitBatchRating`, pass categories to `rateBatch`:

```ts
    rateBatch(activeBatch.id, currentRatings, currentTags, batchFeedback, jokeTitles, jokeCategories);
```

and reset it alongside the others: `setJokeCategories({});`

- [ ] **Step 4: Thread categories through `rateBatch`**

In `context.tsx` find `const rateBatch = async (` (line 1670). Add a parameter `categories: Record<string, string> = {}` to the signature, and where it builds the `ratings` array for `qcService.submitRatings` (around line 1708), add `category: categories[<jokeIdKey>]` to each rating object. (Match the existing key the code uses to look up ratings/titles per joke — use the same key for `categories`.)

- [ ] **Step 5: JM soft-hint line**

In `views/JokeMaker.tsx`, add `import { SIM_CONFIG } from '../config/simConfig';` at top. Below the Current Batch staging block (after line 266, before the Compliance row), add:

```tsx
              <p className="text-xs text-gray-400 italic">
                Stuck for ideas? Try: {SIM_CONFIG.categories.slice(0, 6).map(c => c.label).join(' · ')} · …
              </p>
```

The 10 full categories would overflow a single line, so we show the first 6 as a soft prompt and trail with `…` to signal more exist. (No picker, no tagging — display only.)

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Manual verification**

As Marketing, open a batch: each joke now shows a required **Category** chip row; submit is blocked until every joke has a category. As JM, confirm the soft hint line appears under the batch staging and there is **no** category picker on the JM screen.

- [ ] **Step 8: Commit**

```bash
git add types.ts services/mockApi.ts views/QualityControl.tsx views/JokeMaker.tsx context.tsx
git commit -m "feat: category palette (Marketing assigns, JM soft hint)"
```

---

## Task 9: Rename QC → "Marketing" (user-facing only)

**Files:**
- Modify: `views/QualityControl.tsx`, `views/JokeMaker.tsx`, `views/Customer.tsx`, `views/Instructor.tsx`, `components.tsx`

Keep code identifiers, the `QC` role enum, and `/qc/` routes unchanged — change only **visible text**.

- [ ] **Step 1: Find user-facing QC strings**

Run: `grep -rniE "quality control|\bQC\b|inspection station|inspect" views components.tsx | grep -v "qcQueue\|qcService\|QC_TAG\|Role.QUALITY"`
Expected: a list of JSX text occurrences (e.g. "Inspection Station", "QC Feedback", any "Quality Control" labels).

- [ ] **Step 2: Replace visible labels**

For each match that is **rendered text** (not an identifier), rename to the Marketing vocabulary:
- "Quality Control" → "Marketing"
- "Inspection Station" → "Marketing Desk"
- "QC Feedback" → "Marketing Feedback"
- "Inspection History" → "Marketing History"
- "Inspection Results" → "Marketing Results"
- The `Role.QUALITY_CONTROL` display via `.replace('_',' ')` renders "QUALITY CONTROL"; in `components.tsx` `RoleLayout` and any role label, special-case it: where the role is displayed, map `QUALITY_CONTROL` → `MARKETING` for display only, e.g.:

```tsx
{(user.role === Role.QUALITY_CONTROL ? 'MARKETING' : user.role.replace('_', ' '))}
```

Do **not** change `Role.QUALITY_CONTROL`, `qcQueue`, `qcService`, route strings, or enum values.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Log in as the QC role. The header role badge reads "MARKETING", the main card reads "Marketing Desk", history reads "Marketing History". The JM "Show Feedback" modal reads "Marketing Feedback". No console errors; the role still routes to the same screen.

- [ ] **Step 5: Commit**

```bash
git add views components.tsx
git commit -m "feat: rename QC to Marketing in user-facing copy (FE only)"
```

---

## Task 10: Cheap polling fix (visibility-aware)

**Files:**
- Modify: `context.tsx:1350-1361` (poll setup/teardown)

Pause polling when the tab is hidden and use a single named interval constant. This is the lightweight fix (no SSE/WebSocket).

- [ ] **Step 1: Add a poll interval constant**

In `context.tsx` near the other constants (after line 38), add:

```ts
const POLL_INTERVAL_MS = 2500;
```

- [ ] **Step 2: Replace the poll scheduler**

Replace lines 1350-1360 (`poll();` through the cleanup `return () => {...}`) with a visibility-aware scheduler:

```ts
    poll();

    const startTimer = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    };
    const stopTimer = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        poll();        // refresh immediately on focus
        startTimer();
      } else {
        stopTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') startTimer();

    return () => {
      cancelled = true;
      pollAbortRef.current?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      stopTimer();
    };
```

- [ ] **Step 3: Update the stale `1500` comment reference**

At line ~666 the code compares `now - last >= 1500`. Change the literal to `POLL_INTERVAL_MS` so throttling aligns with the new interval:

```ts
      return now - last >= POLL_INTERVAL_MS; // align with poll interval
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open the app, open DevTools → Network (filter to the mock is N/A; instead add a `console.log('poll')` temporarily inside `poll` if needed). Switch to another browser tab for 10s, then return.
Expected: while hidden, no polling occurs; on returning to the tab, a poll fires immediately and resumes every 2.5s. (Remove any temporary log before committing.)

- [ ] **Step 6: Commit**

```bash
git add context.tsx
git commit -m "perf: pause polling on hidden tab; single 2.5s interval"
```

---

## Task 11: Flow visualization (value-stream Kanban)

**Files:**
- Create: `components/FlowBoard.tsx`
- Modify: `services/mockApi.ts` (add a lightweight simulated buyer so the Sold lane moves)
- Modify: `views/JokeMaker.tsx` and `views/QualityControl.tsx` (render `<FlowBoard />`)

The board shows four lanes with live counts for the viewer's team: **Production** (submitted, not yet rated), **Marketing** (in queue / being rated), **Market** (published, unsold), **Sold**. Data is derived from the team's batches (already polled into `batches`) plus team summary.

- [ ] **Step 1: Add a simple simulated buyer to the mock (so Sold animates)**

In `services/mockApi.ts`, inside `mockApiRequest`, before `const resp = route(...)`, call a buyer tick on GET requests so the market drains over time. Add this helper near the other functions:

```ts
function simulateBuyerTick(db: MockDb) {
  if (db.round.status !== 'ACTIVE') return;
  // Buy at most one unsold published joke per tick to keep the Sold lane moving.
  const round_id = db.active_round_id;
  const published: Array<{ joke_id: JokeId; team_id: TeamId }> = [];
  for (const b of Object.values(db.batches)) {
    if (b.round_id !== round_id || b.status !== 'RATED') continue;
    for (const j of b.jokes) {
      if ((j as any).is_published) published.push({ joke_id: j.joke_id, team_id: b.team_id });
    }
  }
  const SIM_BUYER = -1 as UserId; // synthetic buyer id
  const alreadyBought = new Set(
    Object.values(db.purchases)
      .filter(p => p.buyer_user_id === SIM_BUYER && !p.returned_at)
      .map(p => p.joke_id),
  );
  const target = published.find(p => !alreadyBought.has(p.joke_id));
  if (!target) return;
  const purchase_id = (++db.seq.purchase_id) as number;
  db.purchases[String(purchase_id)] = {
    purchase_id,
    round_id,
    buyer_user_id: SIM_BUYER,
    joke_id: target.joke_id,
    team_id: target.team_id,
    created_at: isoNow(),
    returned_at: null,
  };
  db.purchaseIndex[`${round_id}:${SIM_BUYER}:${target.joke_id}`] = purchase_id;
  persistDb(db);
}
```

Then in `mockApiRequest`, after `const db = loadDb();` add:

```ts
  if (String(opts.method ?? 'GET').toUpperCase() === 'GET') simulateBuyerTick(db);
```

> Note: this is a placeholder buyer for Phase-1 demos only. The real persona engine (BE #5) replaces it. Documented in `Backend Change Requests (V2)`.

- [ ] **Step 2: Create `components/FlowBoard.tsx`**

```tsx
import React from 'react';
import { useGame } from '../context';

const Lane: React.FC<{ title: string; count: number; color: string }> = ({ title, count, color }) => (
  <div className={`flex-1 rounded-lg border p-3 text-center ${color}`}>
    <div className="text-2xl font-bold">{count}</div>
    <div className="text-[11px] uppercase tracking-wide opacity-80">{title}</div>
  </div>
);

const FlowBoard: React.FC = () => {
  const { batches, user, teamSummary } = useGame();
  const mine = batches.filter(b => b.team === user?.team);

  // Production: submitted batches not yet rated (jokes in flight at Marketing's door)
  const production = mine
    .filter(b => b.status !== 'RATED')
    .reduce((sum, b) => sum + b.jokes.length, 0);

  // Marketing: same as queue depth for this team's unrated batches (approx = production here)
  const inMarketing = mine.filter(b => b.status !== 'RATED').length;

  const published = Number((teamSummary as any)?.jokes_published ?? 0);
  const sold = Number(teamSummary?.total_sales ?? 0);
  const onMarket = Math.max(0, published - sold);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Value Stream</h4>
      <div className="flex items-stretch gap-2">
        <Lane title="Production" count={production} color="bg-blue-50 text-blue-800 border-blue-100" />
        <div className="self-center text-gray-300">→</div>
        <Lane title="Marketing" count={inMarketing} color="bg-purple-50 text-purple-800 border-purple-100" />
        <div className="self-center text-gray-300">→</div>
        <Lane title="On Market" count={onMarket} color="bg-amber-50 text-amber-800 border-amber-100" />
        <div className="self-center text-gray-300">→</div>
        <Lane title="Sold" count={sold} color="bg-emerald-50 text-emerald-800 border-emerald-100" />
      </div>
    </div>
  );
};

export default FlowBoard;
```

- [ ] **Step 3: Render the board on JM and Marketing screens**

In `views/JokeMaker.tsx` and `views/QualityControl.tsx`, add `import FlowBoard from '../components/FlowBoard';` at top, and render `<FlowBoard />` at the top of the right-hand column (immediately before `<PerformanceToggle ... />`).

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Start a round; as JM submit several batches (watch **Production** rise). As Marketing rate a batch (Production drops, **On Market** rises). Wait ~10s with the tab focused (the simulated buyer ticks on each poll) → **Sold** climbs and **On Market** falls. Counts are per your team.

- [ ] **Step 6: Commit**

```bash
git add components/FlowBoard.tsx services/mockApi.ts views/JokeMaker.tsx views/QualityControl.tsx
git commit -m "feat: value-stream flow board + mock simulated buyer"
```

---

## Self-Review Notes (verified against the Phase 1 spec)

- **Two-cost model** → Tasks 4, 5, 6. ✅ (`costOfCreation` plumbed; `computeProfit`; 4-line UI.)
- **Force-release ≥1** → Task 7. ✅ (`selectPublishedJokeIds` + market reads `is_published`.)
- **Category palette (Marketing assigns, JM hint)** → Task 8. ✅
- **QC→Marketing rename (FE only)** → Task 9. ✅ (enum/routes untouched.)
- **Flow visualization** → Task 11. ✅ (mock buyer makes Sold move.)
- **Cheap polling fix** → Task 10. ✅ (visibility-aware, single interval.)
- **Mock-only + config-in-code** → Tasks 1, 3. ✅
- **Test harness** → Task 2. ✅

**Type consistency:** `cost_breakdown`, `jokes_created`, `jokes_published` defined in `ApiTeamSummaryResponse` (Task 5) are consumed in Tasks 6 and 11. `selectPublishedJokeIds`/`computeProfit` signatures match their call sites. `SIM_CONFIG.categories[].id` (CategoryId) is what Marketing stores and JM displays via `.label`.

**Known Phase-1 simplifications (documented for later):** the simulated buyer (Task 11) and the simple Production/Marketing lane approximation are placeholders for the real persona engine (BE #5). The full grading/buying/return engine, demand dashboard, lead-time, and survey are **Phase 2** and live only in the backend tracker for now.
