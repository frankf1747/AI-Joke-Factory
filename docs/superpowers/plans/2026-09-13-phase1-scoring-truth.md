# Phase 1 — Scoring Truth Implementation Plan

> **STATUS: COMPLETE** (2026-09-13). 19 commits, `8409eb5`..`HEAD`, on `main`.
> 217 tests across 7 files. `npx tsc` reports 5 errors, all pre-existing in
> `services/apiClient.ts` / `services/mockApi.ts`.
> See "Closeout" at the end of this document for what was and was not achieved.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend's joke-scoring logic byte-for-byte agree with the Go backend's `src/core/domain/scoring/` package, so every fit number the UI shows is the number the real market will produce.

**Architecture:** `config/dimensions.ts` becomes a direct mirror of the backend's `scoring` package — the 12-dimension catalog, the 3-tier `dimFit`, the `trueFit` sum, and the code-based length classifier. `services/aiCustomerDemo.ts` keeps its role as the instructor-facing illustration but sources all scoring from that one module and switches its jitter model from normal to uniform. Nothing in this phase talks to the network: it is pure functions plus the three views that render them.

**Tech Stack:** TypeScript, React 19, Vitest.

**Baseline of truth (in priority order):**
1. `/Users/frankfu/Documents/GitHub/jokefactory_be/src/core/domain/scoring/{dimensions,fit,length}.go`
2. The classifier sandbox at `https://jokefactory-classifier-sandbox.vercel.app/`
3. `FRONTEND_PLAN.md`

`REFACTOR_PLAN.md` is **stale** on scoring — do not use it for this phase.

---

## Execution log — deviations from this plan

Recorded during execution so the document stays honest about what actually happened.

**Tasks 5, 6 and 7 were merged into a single Task 5.** Splitting them was a planning
error. `services/aiCustomerDemo.ts` evaluates `MAX_FIT = SCORED_DIMENSIONS.length` at
module load against an export Task 1 removes, so the module throws on import and its
entire test file fails to collect. None of the three sub-steps could end green on its
own, which makes them uncommittable separately. They were executed as one task and one
commit. Remaining tasks renumber accordingly: 8→6, 9→7, 10→8, 11→9 (nine tasks, not
eleven).

**Fixes applied during review that this plan got wrong:**

- Task 1's test rewrite dropped a pre-existing assertion that `dimById` returns
  undefined for an unknown id. Restored.
- Task 2's `dimFit` shared one empty-input guard placed below the graded branch. That
  ordering was load-bearing — Title Fit always passes `ideal === ''` — so a natural
  "validate first" cleanup would have silently zeroed every Title Fit score. Split into
  `gradedFit` / `categoricalFit` / `ordinalFit` mirroring the Go source, each owning its
  own guard, making the trap structurally impossible.
- Task 3's `wordCount` used `text.trim().split(/\s+/)`. JavaScript's `\s` matches
  U+00A0 and other Unicode spaces; Go's `isWhitespace` recognises only six ASCII
  characters. Jokes pasted from chat windows and docs carry non-breaking spaces, so a
  joke near the 15/16-word boundary could be bucketed Medium by the frontend and Short
  by the backend. Narrowed to Go's exact set.
- Task 5's threshold-spread test asserted each third of the band holds >20% of
  customers, claiming to catch a normal distribution. It does not: a gaussian with
  sd = jitter scores 30/27/32 and passes. Tightened to 0.28, and the comment now says
  the band test is the real guard.
- `RULE_DIMS` and `JokeScore.joke` were specified but have no readers. Deleted.

---

## Why this phase is first

It is pure logic with no backend dependency, it is fully testable, and it corrects numbers that are **currently wrong on screen**. Four defects it fixes:

| Current frontend | Backend truth |
|---|---|
| `dimProx` = `1 − Δ/(n−1)` linear ramp | 3-tier: `1.0` exact, `0.5` adjacent, `0` otherwise |
| `MAX_FIT = 11`, Structure is a placeholder scoring 0 | `MAX_FIT = 12`, Structure is a scored Categorical dimension |
| Customer thresholds drawn from a normal distribution (Box–Muller) | Uniform: `(rand*2−1) * jitter` |
| Topic has 10 invented categories | 15 fixed categories; several dimensions carry a `"None of the above"` catch-all |

---

## Roadmap (later phases — separate plans, do not start here)

| Phase | Scope |
|---|---|
| **1. Scoring truth** | **This plan** |
| 2. Contracts & plumbing | `apiClient` for the `data` envelope + 3 raw endpoints + `X-User-Id`; regenerate `types.ts` from backend DTOs; retire `mockApi.ts` behind a flag |
| 3. Roles & routing | `QUALITY_CONTROL`→`MARKETING`, drop `CUSTOMER` as a player role, join → poll `/session/me` → route |
| 4. JM screen | Move splitting to JM, submit `jokes: [strings]`, honour `max_batch_size` |
| 5. Marketing screen | Title + publish/discard only; keep the decision timer; delete Topic picker and batch-feedback textarea |
| 6. Feedback + summary | Rebuild against `good_dimensions`/`improve_dimensions` and the real summary keys |
| 7. Instructor | Full config form incl. 11-dimension ideal profile; leaderboard-only stats |

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `config/dimensions.ts` | The 12-dimension rubric: specs, categories, 3-tier fit, true-fit sum, code-based length classifier. Mirror of the backend `scoring` package. | Rewrite |
| `config/dimensions.test.ts` | Tests for the above, including the backend's own edge cases. | Rewrite |
| `services/aiCustomerDemo.ts` | Instructor-facing market illustration. Owns customer generation (uniform jitter), buy/swap simulation, demo fixtures. | Modify |
| `services/aiCustomerDemo.test.ts` | Tests for customer generation and simulation. | Modify |
| `views/Customer.tsx` | Renders the demo. Threshold visual changes from a bell curve to a uniform band. | Modify |
| `views/QualityControl.tsx` | `revealedDimsFor` uses the new fit API. | Modify |
| `components/Tutorial.tsx` | Imports the renamed exports. | Modify |

**Canonical vocabulary decision:** dimension ids become the backend's `UPPER_SNAKE` enum values (`LENGTH`, `HUMOR_STYLE`, `SETUP_PAYOFF`…). One vocabulary, shared with the API payloads (`ideal_profile` is keyed this way), so no translation layer is ever needed.

---

## Task 1: Dimension catalog

**Files:**
- Modify: `config/dimensions.ts` (full rewrite of the catalog section)
- Test: `config/dimensions.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `config/dimensions.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import {
  DIMENSIONS,
  IDEAL_DIMENSIONS,
  MAX_FIT,
  CATCH_ALL,
  dimById,
  categoryIndex,
  isCatchAll,
} from './dimensions';

describe('DIMENSIONS catalog', () => {
  it('has all 12 dimensions in backend order', () => {
    expect(DIMENSIONS.map(d => d.id)).toEqual([
      'LENGTH', 'TOPIC', 'HUMOR_STYLE', 'COMPLEXITY', 'EDGINESS', 'STRUCTURE',
      'WORDPLAY', 'FRESHNESS', 'SETUP_PAYOFF', 'CLARITY', 'ENERGY', 'TITLE_FIT',
    ]);
  });

  it('scores all 12 — Structure is a real dimension, not a placeholder', () => {
    expect(MAX_FIT).toBe(12);
    expect(dimById('STRUCTURE')?.scoring).toBe('categorical');
  });

  it('offers an ideal for 11 dimensions — Title Fit is intrinsic', () => {
    expect(IDEAL_DIMENSIONS).toHaveLength(11);
    expect(IDEAL_DIMENSIONS.map(d => d.id)).not.toContain('TITLE_FIT');
    expect(dimById('TITLE_FIT')?.hasIdeal).toBe(false);
  });

  it('uses the backend Topic list, which includes Politics', () => {
    expect(dimById('TOPIC')?.categories).toEqual([
      'Work', 'Relationships', 'Family', 'Food', 'Technology',
      'Animals', 'School', 'Money', 'Travel', 'Health',
      'Sports', 'Politics', 'Everyday', 'Language', 'Other',
    ]);
  });

  it('carries the catch-all on exactly the four dimensions that have one', () => {
    const withCatchAll = DIMENSIONS
      .filter(d => d.categories.includes(CATCH_ALL))
      .map(d => d.id);
    expect(withCatchAll).toEqual(['HUMOR_STYLE', 'EDGINESS', 'STRUCTURE', 'ENERGY']);
  });

  it('marks which dimensions the code classifies rather than the LLM', () => {
    expect(dimById('LENGTH')?.classifiedBy).toBe('code');
    expect(dimById('TOPIC')?.classifiedBy).toBe('llm');
  });

  it('every id is unique', () => {
    const ids = DIMENSIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves a category to its index, and -1 when absent', () => {
    expect(categoryIndex('COMPLEXITY', 'Very simple')).toBe(0);
    expect(categoryIndex('COMPLEXITY', 'Expert')).toBe(4);
    expect(categoryIndex('COMPLEXITY', 'Nonsense')).toBe(-1);
    expect(categoryIndex('NOT_A_DIM', 'Expert')).toBe(-1);
  });

  it('recognises the catch-all string', () => {
    expect(isCatchAll(CATCH_ALL)).toBe(true);
    expect(isCatchAll('Clean')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run config/dimensions.test.ts`
Expected: FAIL — `No "IDEAL_DIMENSIONS" export is defined` (or a similar missing-export error).

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `config/dimensions.ts` with:

```typescript
/* ============================================================================
   The 12-dimension joke rubric.

   This module is a direct mirror of the Go backend's scoring package:
     jokefactory_be/src/core/domain/scoring/{dimensions,fit,length}.go
   and of the classifier sandbox that the instructor uses to explore it.

   Keep it in lockstep with that package. If the two ever disagree, the Go code
   wins — it is what actually decides whether a joke sells.

   Ids are the backend's enum values (UPPER_SNAKE) so they can be sent straight
   back in an `ideal_profile` payload with no translation.
============================================================================ */

export type ScoringType = 'ordinal' | 'categorical' | 'graded';

/** The classifier's escape hatch when a joke fits no listed category. */
export const CATCH_ALL = 'None of the above';

export interface DimensionSpec {
  /** Backend enum value, e.g. 'HUMOR_STYLE'. */
  id: string;
  label: string;
  scoring: ScoringType;
  /** Ordered — ordinal adjacency is defined by this order. */
  categories: string[];
  /** False only for Title Fit, which is graded against itself. */
  hasIdeal: boolean;
  classifiedBy: 'code' | 'llm';
  /** The instructor's default pick, matching the sandbox. */
  defaultIdeal?: string;
}

export const DIMENSIONS: DimensionSpec[] = [
  {
    id: 'LENGTH', label: 'Length', scoring: 'ordinal', classifiedBy: 'code',
    categories: ['Short', 'Medium', 'Long'],
    hasIdeal: true, defaultIdeal: 'Medium',
  },
  {
    id: 'TOPIC', label: 'Topic', scoring: 'categorical', classifiedBy: 'llm',
    categories: [
      'Work', 'Relationships', 'Family', 'Food', 'Technology',
      'Animals', 'School', 'Money', 'Travel', 'Health',
      'Sports', 'Politics', 'Everyday', 'Language', 'Other',
    ],
    hasIdeal: true, defaultIdeal: 'Work',
  },
  {
    id: 'HUMOR_STYLE', label: 'Humor Style', scoring: 'categorical', classifiedBy: 'llm',
    categories: [
      'Pun', 'Observational', 'Irony', 'Absurdity', 'Exaggeration',
      'Self-deprecating', 'Anti-joke', 'Callback', CATCH_ALL,
    ],
    hasIdeal: true, defaultIdeal: 'Observational',
  },
  {
    id: 'COMPLEXITY', label: 'Complexity', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Very simple', 'Simple', 'Moderate', 'Thoughtful', 'Expert'],
    hasIdeal: true, defaultIdeal: 'Moderate',
  },
  {
    id: 'EDGINESS', label: 'Edginess', scoring: 'categorical', classifiedBy: 'llm',
    categories: ['Clean', 'Slightly edgy', CATCH_ALL],
    hasIdeal: true, defaultIdeal: 'Clean',
  },
  {
    id: 'STRUCTURE', label: 'Structure', scoring: 'categorical', classifiedBy: 'llm',
    categories: [
      'One-liner', 'Setup–punchline', 'Question–answer', 'Short story',
      'Dialogue/conversation', 'List/build-up', CATCH_ALL,
    ],
    hasIdeal: true, defaultIdeal: 'Setup–punchline',
  },
  {
    id: 'WORDPLAY', label: 'Wordplay', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['None', 'Light', 'Moderate', 'Heavy'],
    hasIdeal: true, defaultIdeal: 'Light',
  },
  {
    id: 'FRESHNESS', label: 'Freshness', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Timeless', 'Slightly current', 'Current', 'Very topical', 'Time-sensitive'],
    hasIdeal: true, defaultIdeal: 'Timeless',
  },
  {
    id: 'SETUP_PAYOFF', label: 'Setup→Payoff', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Immediate', 'Quick', 'Balanced', 'Long', 'Very long build'],
    hasIdeal: true, defaultIdeal: 'Balanced',
  },
  {
    id: 'CLARITY', label: 'Clarity', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Crystal clear', 'Mostly clear', 'Slightly ambiguous', 'Ambiguous', 'Reinterpretation'],
    hasIdeal: true, defaultIdeal: 'Crystal clear',
  },
  {
    id: 'ENERGY', label: 'Energy', scoring: 'ordinal', classifiedBy: 'llm',
    categories: ['Deadpan', 'Low', 'Conversational', 'Animated', 'High-energy', CATCH_ALL],
    hasIdeal: true, defaultIdeal: 'Conversational',
  },
  {
    id: 'TITLE_FIT', label: 'Title Fit', scoring: 'graded', classifiedBy: 'llm',
    categories: ['Perfect', 'Strong', 'Moderate', 'Weak', 'Mismatch'],
    hasIdeal: false,
  },
];

/** Every dimension contributes to true_fit, so the ceiling is 12. */
export const MAX_FIT = DIMENSIONS.length;

/** The 11 the instructor picks an ideal for. Title Fit is graded intrinsically. */
export const IDEAL_DIMENSIONS: DimensionSpec[] = DIMENSIONS.filter(d => d.hasIdeal);

const byId = new Map(DIMENSIONS.map(d => [d.id, d]));

export function dimById(id: string): DimensionSpec | undefined {
  return byId.get(id);
}

/** Position of `category` in a dimension's ordered list, or -1 if unknown. */
export function categoryIndex(dimId: string, category: string): number {
  return byId.get(dimId)?.categories.indexOf(category) ?? -1;
}

export function isCatchAll(category: string): boolean {
  return category === CATCH_ALL;
}

/** The sandbox's starting profile — a sensible default for any picker. */
export const DEFAULT_IDEAL_PROFILE: Record<string, string> = Object.fromEntries(
  IDEAL_DIMENSIONS.map(d => [d.id, d.defaultIdeal ?? d.categories[0]]),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run config/dimensions.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add config/dimensions.ts config/dimensions.test.ts
git commit -m "refactor(scoring): mirror backend dimension catalog

Ids become the backend enum values, Structure becomes a scored
categorical dimension, and the catch-all category is modelled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Three-tier `dimFit`

**Files:**
- Modify: `config/dimensions.ts` (append)
- Test: `config/dimensions.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `config/dimensions.test.ts`:

```typescript
import { dimFit, TITLE_FIT_GRADES } from './dimensions';

describe('dimFit — ordinal is a cliff, not a ramp', () => {
  it('scores an exact match 1', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Moderate')).toBe(1);
  });

  it('scores one step away 0.5', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Simple')).toBe(0.5);
    expect(dimFit('COMPLEXITY', 'Moderate', 'Thoughtful')).toBe(0.5);
  });

  it('scores two or more steps away 0 — the same as being completely wrong', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Very simple')).toBe(0);
    expect(dimFit('COMPLEXITY', 'Moderate', 'Expert')).toBe(0);
    expect(dimFit('FRESHNESS', 'Timeless', 'Time-sensitive')).toBe(0);
  });

  it('treats the catch-all as binary, bypassing adjacency', () => {
    // ENERGY is ordinal and has a catch-all.
    expect(dimFit('ENERGY', 'Conversational', CATCH_ALL)).toBe(0);
    expect(dimFit('ENERGY', CATCH_ALL, CATCH_ALL)).toBe(1);
  });

  it('scores unknown categories 0 rather than throwing', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', 'Banana')).toBe(0);
    expect(dimFit('COMPLEXITY', 'Banana', 'Moderate')).toBe(0);
    expect(dimFit('NOT_A_DIM', 'a', 'b')).toBe(0);
  });

  it('scores an empty classification 0', () => {
    expect(dimFit('COMPLEXITY', 'Moderate', '')).toBe(0);
    expect(dimFit('COMPLEXITY', '', 'Moderate')).toBe(0);
  });
});

describe('dimFit — categorical is all or nothing', () => {
  it('scores an exact match 1 and anything else 0', () => {
    expect(dimFit('TOPIC', 'Work', 'Work')).toBe(1);
    expect(dimFit('TOPIC', 'Work', 'Money')).toBe(0);
  });

  it('does not reward adjacency in the list', () => {
    // Relationships sits next to Work, but categorical has no notion of near.
    expect(dimFit('TOPIC', 'Work', 'Relationships')).toBe(0);
  });
});

describe('dimFit — Title Fit is graded against itself', () => {
  it('maps each grade to its score, ignoring the ideal', () => {
    expect(dimFit('TITLE_FIT', '', 'Perfect')).toBe(1);
    expect(dimFit('TITLE_FIT', '', 'Strong')).toBe(0.75);
    expect(dimFit('TITLE_FIT', '', 'Moderate')).toBe(0.5);
    expect(dimFit('TITLE_FIT', '', 'Weak')).toBe(0.25);
    expect(dimFit('TITLE_FIT', '', 'Mismatch')).toBe(0);
  });

  it('scores an unknown grade 0', () => {
    expect(dimFit('TITLE_FIT', '', 'Sublime')).toBe(0);
  });

  it('exposes the grade table', () => {
    expect(TITLE_FIT_GRADES.Perfect).toBe(1);
    expect(TITLE_FIT_GRADES.Mismatch).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run config/dimensions.test.ts`
Expected: FAIL — `No "dimFit" export is defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `config/dimensions.ts`:

```typescript
/** Title Fit's intrinsic grade → score map (backend: titleFitGrades). */
export const TITLE_FIT_GRADES: Record<string, number> = {
  Perfect: 1,
  Strong: 0.75,
  Moderate: 0.5,
  Weak: 0.25,
  Mismatch: 0,
};

/**
 * Per-dimension fit in [0, 1], matching scoring.DimFit in the Go backend.
 *
 *   ordinal     → 1 exact, 0.5 one step away, 0 beyond. A cliff, not a ramp:
 *                 two steps off is worth exactly as much as being wrong.
 *   categorical → 1 on an exact match, else 0.
 *   graded      → Title Fit's own scale; the ideal is ignored.
 *
 * The catch-all short-circuits ordinal adjacency: "None of the above" is not
 * near anything, so it only ever matches itself.
 *
 * Unknown dimensions, unknown categories and empty strings score 0 rather than
 * throwing — a mis-classified joke should cost points, not crash the page.
 */
export function dimFit(dimId: string, ideal: string, joke: string): number {
  const spec = byId.get(dimId);
  if (!spec) return 0;

  if (spec.scoring === 'graded') {
    return TITLE_FIT_GRADES[joke] ?? 0;
  }
  if (!joke || !ideal) return 0;

  if (spec.scoring === 'categorical') {
    return joke === ideal ? 1 : 0;
  }

  // Ordinal.
  if (isCatchAll(joke) || isCatchAll(ideal)) {
    return joke === ideal ? 1 : 0;
  }
  const ji = spec.categories.indexOf(joke);
  const ii = spec.categories.indexOf(ideal);
  if (ji < 0 || ii < 0) return 0;

  const gap = Math.abs(ji - ii);
  if (gap === 0) return 1;
  if (gap === 1) return 0.5;
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run config/dimensions.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add config/dimensions.ts config/dimensions.test.ts
git commit -m "fix(scoring): replace linear ramp with backend's 3-tier dimFit

Ordinal dimensions score 1 / 0.5 / 0 by adjacency, not 1 - distance.
Two steps off now scores zero, matching scoring.DimFit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Length classifier

**Files:**
- Modify: `config/dimensions.ts` (append)
- Test: `config/dimensions.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `config/dimensions.test.ts`:

```typescript
import { wordCount, classifyLength, LENGTH_SHORT_MAX, LENGTH_MEDIUM_MAX } from './dimensions';

describe('wordCount', () => {
  it('counts whitespace-separated tokens', () => {
    expect(wordCount('one two three')).toBe(3);
  });

  it('collapses runs of whitespace', () => {
    expect(wordCount('one   two\n\nthree\tfour')).toBe(4);
  });

  it('ignores leading and trailing whitespace', () => {
    expect(wordCount('  padded  ')).toBe(1);
  });

  it('counts empty and whitespace-only text as 0', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   \n\t ')).toBe(0);
  });
});

describe('classifyLength', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'w').join(' ');

  it('exposes the backend thresholds', () => {
    expect(LENGTH_SHORT_MAX).toBe(15);
    expect(LENGTH_MEDIUM_MAX).toBe(40);
  });

  it('calls 15 words or fewer Short', () => {
    expect(classifyLength(words(1))).toBe('Short');
    expect(classifyLength(words(15))).toBe('Short');
  });

  it('calls 16 to 40 words Medium', () => {
    expect(classifyLength(words(16))).toBe('Medium');
    expect(classifyLength(words(40))).toBe('Medium');
  });

  it('calls more than 40 words Long', () => {
    expect(classifyLength(words(41))).toBe('Long');
  });

  it('calls empty text Short', () => {
    expect(classifyLength('')).toBe('Short');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run config/dimensions.test.ts`
Expected: FAIL — `No "wordCount" export is defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `config/dimensions.ts`:

```typescript
/* ---- Length: the one dimension the code classifies, not the LLM ----------
   Mirrors scoring/length.go. The backend never sends Length to the model, so
   the frontend can compute it locally and show it live as the writer types. */

export const LENGTH_SHORT_MAX = 15;   // Short:  ≤ 15 words
export const LENGTH_MEDIUM_MAX = 40;  // Medium: 16–40 words; Long: 41+

/** Whitespace-separated token count. Empty / whitespace-only text yields 0. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function classifyLength(text: string): 'Short' | 'Medium' | 'Long' {
  const n = wordCount(text);
  if (n <= LENGTH_SHORT_MAX) return 'Short';
  if (n <= LENGTH_MEDIUM_MAX) return 'Medium';
  return 'Long';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run config/dimensions.test.ts`
Expected: PASS, 29 tests.

- [ ] **Step 5: Commit**

```bash
git add config/dimensions.ts config/dimensions.test.ts
git commit -m "feat(scoring): add code-side length classifier

Short <= 15 words, Medium 16-40, Long 41+, matching scoring/length.go.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `trueFit` over all 12 dimensions

**Files:**
- Modify: `config/dimensions.ts` (append)
- Test: `config/dimensions.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `config/dimensions.test.ts`:

```typescript
import { trueFit, DEFAULT_IDEAL_PROFILE } from './dimensions';

describe('trueFit', () => {
  /** A classification that matches DEFAULT_IDEAL_PROFILE on all 11, plus a grade. */
  const perfect = (): Record<string, string> => ({
    ...DEFAULT_IDEAL_PROFILE,
    TITLE_FIT: 'Perfect',
  });

  it('scores a flawless joke the full 12', () => {
    expect(trueFit(perfect(), DEFAULT_IDEAL_PROFILE)).toBe(12);
  });

  it('docks half a point for a single adjacent ordinal miss', () => {
    const c = { ...perfect(), COMPLEXITY: 'Thoughtful' };
    expect(trueFit(c, DEFAULT_IDEAL_PROFILE)).toBe(11.5);
  });

  it('docks a whole point for a categorical miss', () => {
    const c = { ...perfect(), TOPIC: 'Money' };
    expect(trueFit(c, DEFAULT_IDEAL_PROFILE)).toBe(11);
  });

  it('docks a whole point for an ordinal miss of two or more steps', () => {
    const c = { ...perfect(), COMPLEXITY: 'Expert' };
    expect(trueFit(c, DEFAULT_IDEAL_PROFILE)).toBe(11);
  });

  it('scores an empty classification 0', () => {
    expect(trueFit({}, DEFAULT_IDEAL_PROFILE)).toBe(0);
  });

  it('rounds to two decimals so sums of 0.5s stay exact', () => {
    const c = {
      ...perfect(),
      COMPLEXITY: 'Thoughtful',
      WORDPLAY: 'Moderate',
      CLARITY: 'Mostly clear',
    };
    expect(trueFit(c, DEFAULT_IDEAL_PROFILE)).toBe(10.5);
  });

  it('never exceeds MAX_FIT', () => {
    expect(trueFit(perfect(), DEFAULT_IDEAL_PROFILE)).toBeLessThanOrEqual(MAX_FIT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run config/dimensions.test.ts`
Expected: FAIL — `No "trueFit" export is defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `config/dimensions.ts`:

```typescript
/** A joke's classified category per dimension, keyed by dimension id. */
export type Classification = Record<string, string>;
/** The instructor's hidden ideal, keyed by dimension id. No TITLE_FIT. */
export type IdealProfile = Record<string, string>;

/**
 * Sum of dim_fit across all 12 dimensions — the number the market buys on.
 * Range [0, 12]. Rounded to 2dp so a run of 0.5s doesn't drift in float.
 * Mirrors scoring.TrueFit.
 */
export function trueFit(classification: Classification, profile: IdealProfile): number {
  let sum = 0;
  for (const dim of DIMENSIONS) {
    sum += dimFit(dim.id, profile[dim.id] ?? '', classification[dim.id] ?? '');
  }
  return Math.round(sum * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run config/dimensions.test.ts`
Expected: PASS, 36 tests.

- [ ] **Step 5: Commit**

```bash
git add config/dimensions.ts config/dimensions.test.ts
git commit -m "feat(scoring): sum true_fit across all 12 dimensions

Structure now counts, so the ceiling is 12 and buy_threshold 7 means
7 of 12. Mirrors scoring.TrueFit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Uniform customer thresholds

The backend draws each customer's personal bar from a **uniform** band, not a normal curve:
`jitter := (s.rng.Float64()*2 - 1) * round.Jitter` (`usecase/aicustomer.go:39`).

**Files:**
- Modify: `services/aiCustomerDemo.ts:115-145` (replace `gaussian`, `normalPdf`, `makeCustomers`)
- Test: `services/aiCustomerDemo.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `services/aiCustomerDemo.test.ts`:

```typescript
import { makeCustomers, buyFraction } from './aiCustomerDemo';

describe('makeCustomers — uniform thresholds', () => {
  const cfg = {
    tau: 7, jitter: 0.3, swapMargin: 0.5, customerCount: 200,
    budget: 3, marketPrice: 1, perDimBar: 0.75,
    ideal: {} as Record<string, string>,
  };

  it('creates one customer per configured count', () => {
    expect(makeCustomers(cfg, 1)).toHaveLength(200);
  });

  it('keeps every threshold inside the uniform band', () => {
    for (const c of makeCustomers(cfg, 1)) {
      expect(c.threshold).toBeGreaterThanOrEqual(cfg.tau - cfg.jitter);
      expect(c.threshold).toBeLessThanOrEqual(cfg.tau + cfg.jitter);
    }
  });

  it('spreads thresholds across the band rather than clustering at the centre', () => {
    // Uniform: roughly a third in each third of the band. Normal would pile up
    // in the middle third, which is the bug this test exists to catch.
    const thirds = [0, 0, 0];
    for (const c of makeCustomers(cfg, 1)) {
      const pos = (c.threshold - (cfg.tau - cfg.jitter)) / (2 * cfg.jitter);
      thirds[Math.min(2, Math.floor(pos * 3))] += 1;
    }
    for (const count of thirds) {
      expect(count).toBeGreaterThan(200 * 0.2);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(makeCustomers(cfg, 42)).toEqual(makeCustomers(cfg, 42));
  });

  it('gives every customer the configured starting budget', () => {
    expect(makeCustomers(cfg, 1).every(c => c.budget === 3)).toBe(true);
  });
});

describe('buyFraction — share of a uniform band a fit clears', () => {
  it('is 0 below the band', () => {
    expect(buyFraction(6.5, 7, 0.3)).toBe(0);
  });

  it('is 1 above the band', () => {
    expect(buyFraction(7.5, 7, 0.3)).toBe(1);
  });

  it('is 0.5 exactly at tau', () => {
    expect(buyFraction(7, 7, 0.3)).toBeCloseTo(0.5, 6);
  });

  it('grows linearly across the band', () => {
    expect(buyFraction(6.85, 7, 0.3)).toBeCloseTo(0.25, 6);
    expect(buyFraction(7.15, 7, 0.3)).toBeCloseTo(0.75, 6);
  });

  it('is all-or-nothing when there is no jitter', () => {
    expect(buyFraction(7, 7, 0)).toBe(1);
    expect(buyFraction(6.99, 7, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/aiCustomerDemo.test.ts`
Expected: FAIL — `No "buyFraction" export is defined`.

- [ ] **Step 3: Write minimal implementation**

In `services/aiCustomerDemo.ts`, delete the `gaussian` and `normalPdf` functions entirely and replace `makeCustomers`, so the block reads:

```typescript
/**
 * Deterministic 0..1 from an integer. Seeded on purpose: Math.random() would
 * reshuffle every customer's bar on each React re-render (and make tests flaky).
 */
export function rand01(seed: number): number {
  const x = Math.sin(seed * 99.13) * 10000;
  return x - Math.floor(x);
}

/**
 * Build the round's customers. Each personal bar is drawn UNIFORMLY from
 * [τ − jitter, τ + jitter] — the backend's model:
 *   jitter := (rng.Float64()*2 - 1) * round.Jitter
 * Same taste, evenly spread standards. (This was a normal distribution; the
 * backend never implemented that, so the curve it drew was fiction.)
 */
export function makeCustomers(cfg: EngineConfig, seed = 1): AiCustomer[] {
  return Array.from({ length: cfg.customerCount }, (_, i) => ({
    id: i + 1,
    threshold: cfg.tau + (rand01(seed + i * 7.7) * 2 - 1) * cfg.jitter,
    budget: cfg.budget,
  }));
}

/**
 * Share of a uniform threshold band that a given true_fit clears — i.e. the
 * fraction of customers interested, before budget. Used to draw the band.
 */
export function buyFraction(fit: number, tau: number, jitter: number): number {
  if (jitter <= 0) return fit >= tau ? 1 : 0;
  const lo = tau - jitter;
  return Math.max(0, Math.min(1, (fit - lo) / (2 * jitter)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/aiCustomerDemo.test.ts`
Expected: PASS. If any pre-existing test referenced `gaussian` or `normalPdf`, delete those test cases — the functions are gone on purpose.

- [ ] **Step 5: Commit**

```bash
git add services/aiCustomerDemo.ts services/aiCustomerDemo.test.ts
git commit -m "fix(sim): draw customer thresholds uniformly, not normally

The backend uses (rand*2-1)*jitter. Our Box-Muller bell curve was
modelling a distribution that does not exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Point the simulator at the shared scoring module

**Files:**
- Modify: `services/aiCustomerDemo.ts` (imports, `MAX_FIT`, `scoreJoke`)
- Test: `services/aiCustomerDemo.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `services/aiCustomerDemo.test.ts`:

```typescript
import { scoreJoke } from './aiCustomerDemo';
import { DEFAULT_IDEAL_PROFILE, MAX_FIT } from '../config/dimensions';

describe('scoreJoke', () => {
  const cfg = {
    tau: 7, jitter: 0.3, swapMargin: 0.5, customerCount: 100,
    budget: 3, marketPrice: 1, perDimBar: 0.75,
    ideal: DEFAULT_IDEAL_PROFILE,
  };

  const flawless = {
    id: 'j1', text: 'x', title: 't',
    dims: { ...DEFAULT_IDEAL_PROFILE, TITLE_FIT: 'Perfect' },
  };

  it('scores a flawless joke the full 12 out of 12', () => {
    const s = scoreJoke(flawless, cfg);
    expect(s.trueFit).toBe(12);
    expect(s.maxFit).toBe(12);
    expect(MAX_FIT).toBe(12);
  });

  it('reports one row per dimension, all 12', () => {
    expect(scoreJoke(flawless, cfg).dims).toHaveLength(12);
  });

  it('counts Structure as a real scored dimension', () => {
    const off = { ...flawless, dims: { ...flawless.dims, STRUCTURE: 'Short story' } };
    expect(scoreJoke(off, cfg).trueFit).toBe(11);
  });

  it('marks a dimension passed when it clears the per-dim bar', () => {
    const s = scoreJoke(flawless, cfg);
    expect(s.passedCount).toBe(12);
    expect(s.failedCount).toBe(0);
  });

  it('counts an adjacent ordinal miss as a fail against a 0.75 bar', () => {
    const near = { ...flawless, dims: { ...flawless.dims, CLARITY: 'Mostly clear' } };
    const s = scoreJoke(near, cfg);
    expect(s.trueFit).toBe(11.5);
    expect(s.failedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/aiCustomerDemo.test.ts`
Expected: FAIL — `expected 11 to be 12` (the old module still treats Structure as a placeholder), or a missing-export error for `MAX_FIT` from `config/dimensions`.

- [ ] **Step 3: Write minimal implementation**

In `services/aiCustomerDemo.ts`, replace the import block and the `MAX_FIT` / `DimScore` / `scoreJoke` definitions with:

```typescript
import {
  DIMENSIONS,
  MAX_FIT,
  dimFit,
  type Classification,
  type IdealProfile,
} from '../config/dimensions';

export { MAX_FIT };

/** Dims the backend scores with code instead of an LLM. */
export const RULE_DIMS = new Set<string>(['LENGTH']);

export interface DimScore {
  id: string;
  label: string;
  /** Keep this name — views/Customer.tsx renders a Rule/LLM badge from it. */
  source: 'rule' | 'llm';
  level: string;
  ideal: string;
  fit: number;
  pass: boolean;
}

export function scoreJoke(joke: DemoJoke, cfg: EngineConfig): JokeScore {
  const dims: DimScore[] = DIMENSIONS.map(d => {
    const level = joke.dims[d.id] ?? '';
    const ideal = d.hasIdeal ? (cfg.ideal[d.id] ?? '') : '';
    const fit = dimFit(d.id, ideal, level);
    return {
      id: d.id,
      label: d.label,
      source: d.classifiedBy === 'code' ? 'rule' : 'llm',
      level,
      ideal: d.hasIdeal ? ideal : '—',
      fit,
      pass: fit >= cfg.perDimBar,
    };
  });

  const sum = dims.reduce((acc, d) => acc + d.fit, 0);

  return {
    joke,
    dims,
    trueFit: Math.round(sum * 100) / 100,
    maxFit: MAX_FIT,
    passedCount: dims.filter(d => d.pass).length,
    failedCount: dims.filter(d => !d.pass).length,
  };
}
```

Then update the two interfaces near the top of the file so they use the shared types:

```typescript
export interface DemoJoke {
  id: string;
  text: string;
  title: string;
  /** Classified category per dimension, keyed by backend dimension id. */
  dims: Classification;
}

export interface EngineConfig {
  /** τ — base true_fit bar to buy (0..MAX_FIT). */
  tau: number;
  /** Half-width of the uniform threshold band. */
  jitter: number;
  /** M — how far a new joke must beat the weakest held joke to trigger a swap. */
  swapMargin: number;
  customerCount: number;
  /** Per-dimension fit bar for the Good/Improve feedback split. */
  perDimBar: number;
  budget: number;
  marketPrice: number;
  ideal: IdealProfile;
}
```

Delete the now-unused `PLACEHOLDER_DIMS` / `SCORED_DIMENSIONS` / `IDEAL_PROFILE` / `dimProx` imports and the `placeholder` field on `DimScore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/aiCustomerDemo.test.ts`
Expected: PASS for the new `scoreJoke` block. Pre-existing tests that assert `/11` or reference `placeholder` will fail — update each to the 12-dimension truth as you go; do not delete coverage.

- [ ] **Step 5: Commit**

```bash
git add services/aiCustomerDemo.ts services/aiCustomerDemo.test.ts
git commit -m "refactor(sim): source all scoring from config/dimensions

One implementation of dimFit, shared by the simulator and the views.
MAX_FIT is 12 and Structure is scored.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Retune the demo fixtures to real categories

The five demo jokes exist to show the whole range of market outcomes. Their classifications must use the backend's category strings and the new ids, and their fits must be recomputed under the 3-tier rule.

**Files:**
- Modify: `services/aiCustomerDemo.ts` (`DEMO_CONFIG`, `DEMO_JOKES`)
- Test: `services/aiCustomerDemo.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `services/aiCustomerDemo.test.ts`:

```typescript
import { DEMO_JOKES, DEMO_CONFIG, simulateMarket } from './aiCustomerDemo';
import { DIMENSIONS } from '../config/dimensions';

describe('demo fixtures tell the whole market story', () => {
  it('uses the sandbox defaults for the ideal profile', () => {
    expect(DEMO_CONFIG.tau).toBe(7);
    expect(DEMO_CONFIG.jitter).toBe(0.3);
    expect(DEMO_CONFIG.customerCount).toBe(100);
    expect(DEMO_CONFIG.ideal.TOPIC).toBe('Work');
    expect(DEMO_CONFIG.ideal.STRUCTURE).toBe('Setup–punchline');
  });

  it('classifies every joke on all 12 dimensions with valid categories', () => {
    for (const joke of DEMO_JOKES) {
      for (const dim of DIMENSIONS) {
        const level = joke.dims[dim.id];
        expect(level, `${joke.id} is missing ${dim.id}`).toBeTruthy();
        expect(dim.categories, `${joke.id}.${dim.id} = ${level}`).toContain(level);
      }
    }
  });

  it('opens with a flawless joke that everyone buys', () => {
    expect(scoreJoke(DEMO_JOKES[0], DEMO_CONFIG).trueFit).toBe(12);
  });

  it('includes a borderline joke inside the jitter band', () => {
    const fit = scoreJoke(DEMO_JOKES[1], DEMO_CONFIG).trueFit;
    expect(fit).toBeGreaterThan(DEMO_CONFIG.tau - DEMO_CONFIG.jitter);
    expect(fit).toBeLessThan(DEMO_CONFIG.tau + DEMO_CONFIG.jitter);
  });

  it('includes a joke far below the bar that nobody buys', () => {
    const fit = scoreJoke(DEMO_JOKES[3], DEMO_CONFIG).trueFit;
    expect(fit).toBeLessThan(DEMO_CONFIG.tau - DEMO_CONFIG.jitter);
  });

  it('sells the borderline joke to some customers but not all', () => {
    const result = simulateMarket(DEMO_JOKES, DEMO_CONFIG, 1);
    const borderline = result[DEMO_JOKES[1].id];
    expect(borderline.bought).toBeGreaterThan(0);
    expect(borderline.bought).toBeLessThan(DEMO_CONFIG.customerCount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run services/aiCustomerDemo.test.ts`
Expected: FAIL — the fixtures still use lowercase ids like `topic`, so `joke.dims[dim.id]` is `undefined` and the "missing LENGTH" assertion trips.

- [ ] **Step 3: Write minimal implementation**

Replace `DEMO_CONFIG` and `DEMO_JOKES` in `services/aiCustomerDemo.ts` with:

```typescript
export const DEMO_CONFIG: EngineConfig = {
  tau: 7,
  jitter: 0.3,
  swapMargin: 0.5,
  customerCount: 100,
  perDimBar: 0.75,
  budget: 3,
  marketPrice: 1,
  ideal: DEFAULT_IDEAL_PROFILE,
};

/* The batch is tuned to show the whole range under the 3-tier rule:
   #1 a flawless 12, #2 a borderline 7.25 (the jitter story), #3 a strong 11,
   #4 a 0.75 that nobody touches, #5 strong-but-blocked-by-budget. */
export const DEMO_JOKES: DemoJoke[] = [
  {
    id: 'j1',
    title: 'The Self-Starter',
    text: 'I told my boss I needed a raise because three companies were after me. He asked which ones. I said the electric company, the gas company, and the water company.',
    dims: { ...DEFAULT_IDEAL_PROFILE, TITLE_FIT: 'Perfect' },
  },
  {
    id: 'j2',
    // 1 + 1 + 0 + 0.5 + 1 + 0 + 0.5 + 0.5 + 0.5 + 0.5 + 1 + 0.75 = 7.25
    title: 'Anti-Gravity',
    text: "I'm reading a book about anti-gravity at my desk. It's impossible to put down, which is why the quarterly report is late.",
    dims: {
      LENGTH: 'Medium',
      TOPIC: 'Work',
      HUMOR_STYLE: 'Pun',                 // categorical miss  −1
      COMPLEXITY: 'Simple',               // adjacent          −0.5
      EDGINESS: 'Clean',
      STRUCTURE: 'One-liner',             // categorical miss  −1
      WORDPLAY: 'Moderate',               // adjacent          −0.5
      FRESHNESS: 'Slightly current',      // adjacent          −0.5
      SETUP_PAYOFF: 'Quick',              // adjacent          −0.5
      CLARITY: 'Mostly clear',            // adjacent          −0.5
      ENERGY: 'Conversational',
      TITLE_FIT: 'Strong',                // graded            −0.25
    },
  },
  {
    id: 'j3',
    // 12 − 0.5 (Complexity) − 0.5 (Title Fit) = 11
    title: 'Scarecrow of the Year',
    text: 'My colleague won an award for being outstanding in his field. He is a scarecrow, and frankly the competition was thin.',
    dims: {
      ...DEFAULT_IDEAL_PROFILE,
      COMPLEXITY: 'Thoughtful',
      TITLE_FIT: 'Moderate',
    },
  },
  {
    id: 'j4',
    // 0.5 (Length adjacent) + 0.25 (Title Fit Weak) = 0.75
    title: 'Thoughts',
    text: 'Consider, if you will, the profound and frankly upsetting possibility that every single spreadsheet ever opened in the history of this company has been quietly judging us all, row by row, column by column, waiting patiently for the day it finally decides to speak, and when it does, it will simply say: recalculate.',
    dims: {
      LENGTH: 'Long',                     // adjacent to Medium  −0.5
      TOPIC: 'Technology',                // miss                −1
      HUMOR_STYLE: 'Absurdity',           // miss                −1
      COMPLEXITY: 'Expert',               // 2 steps             −1
      EDGINESS: 'Slightly edgy',          // miss                −1
      STRUCTURE: 'Short story',           // miss                −1
      WORDPLAY: 'Heavy',                  // 2 steps             −1
      FRESHNESS: 'Time-sensitive',        // 4 steps             −1
      SETUP_PAYOFF: 'Very long build',    // 2 steps             −1
      CLARITY: 'Ambiguous',               // 3 steps             −1
      ENERGY: 'High-energy',              // 2 steps             −1
      TITLE_FIT: 'Weak',                  // graded              −0.75
    },
  },
  {
    id: 'j5',
    // 12 − 0.5 (Wordplay) − 0.5 (Clarity) − 0.25 (Title Fit) = 10.75
    title: 'Math Book Blues',
    text: 'The new hire asked why the math book looked so sad. I said it had too many problems, and then I gave it a project plan.',
    dims: {
      ...DEFAULT_IDEAL_PROFILE,
      WORDPLAY: 'Moderate',
      CLARITY: 'Mostly clear',
      TITLE_FIT: 'Strong',
    },
  },
];
```

Add `DEFAULT_IDEAL_PROFILE` to the `config/dimensions` import at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run services/aiCustomerDemo.test.ts`
Expected: PASS. If the borderline assertion fails, print `scoreJoke(DEMO_JOKES[1], DEMO_CONFIG).dims` and check each row against the arithmetic in the comments — do not adjust the test to match a wrong number.

- [ ] **Step 5: Commit**

```bash
git add services/aiCustomerDemo.ts services/aiCustomerDemo.test.ts
git commit -m "refactor(sim): retune demo jokes to real backend categories

Fixtures now use backend dimension ids and category strings, and their
fits are recomputed under the 3-tier rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Customer view — replace the bell curve with a uniform band

The `ThresholdCurve` component draws a normal distribution that does not exist. Under a uniform band the honest picture is a flat rectangle from `τ − jitter` to `τ + jitter`, shaded up to the joke's fit.

**Files:**
- Modify: `views/Customer.tsx` (the `ThresholdCurve` component and its import block)

- [ ] **Step 1: Update the import block**

Replace the `aiCustomerDemo` import in `views/Customer.tsx` with:

```typescript
import {
  simulateCustomer, simulateMarket, buyFraction, DEMO_JOKES, DEMO_CONFIG,
  type DecisionStep, type Verdict, type DimScore, type JokeMarketResult,
} from '../services/aiCustomerDemo';
```

- [ ] **Step 2: Strip the placeholder branches from `DimRow`**

`DimScore.placeholder` is gone, and `DimRow` reads it in five places. Replace the whole `DimRow` component with:

```typescript
/* ---- A single dimension row in the scorecard ---- */
const DimRow: React.FC<{ d: DimScore }> = ({ d }) => (
  <div className="flex items-center gap-2 py-1">
    <span className="w-24 shrink-0 text-[11px] font-semibold text-gray-600 truncate" title={d.label}>{d.label}</span>
    <span
      className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${
        d.source === 'rule' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
      }`}
      title={d.source === 'rule' ? 'Scored in code from the word count' : 'Classified by the LLM'}
    >
      {d.source === 'rule' ? <Cpu size={9} /> : <Sparkles size={9} />}
      {d.source === 'rule' ? 'Rule' : 'LLM'}
    </span>
    <span className="w-32 shrink-0 text-[11px] text-gray-500 truncate" title={`joke: ${d.level} · ideal: ${d.ideal}`}>
      {d.level}
      {d.level !== d.ideal && <span className="text-gray-300"> → {d.ideal}</span>}
    </span>
    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.round(d.fit * 100)}%`, background: d.pass ? '#10b981' : '#f59e0b' }}
      />
    </div>
    <span className={`w-11 shrink-0 text-right text-[11px] font-bold tabular-nums ${d.pass ? 'text-emerald-600' : 'text-gray-400'}`}>
      +{d.fit.toFixed(2)}
    </span>
  </div>
);
```

The `Ban` icon is now unused — remove it from the `lucide-react` import at the top of the file.

- [ ] **Step 3: Replace the threshold component**

Replace the entire `ThresholdCurve` component with:

```typescript
/* ---- The threshold band: every customer's personal bar is drawn uniformly
        from [τ − jitter, τ + jitter], so the honest picture is a flat band,
        not a bell. The shaded part is the share whose bar this joke clears. */
const ThresholdBand: React.FC<{ result: JokeMarketResult }> = ({ result }) => {
  const W = 300;
  const H = 64;
  const lo = CFG.tau - CFG.jitter;
  const hi = CFG.tau + CFG.jitter;
  const share = buyFraction(result.trueFit, CFG.tau, CFG.jitter);
  const fitPx = share * W;
  const tauPx = W / 2;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${Math.round(share * 100)}% of customers have a bar this joke clears`}>
        {/* the full band of customer bars */}
        <rect x={0} y={12} width={W} height={H - 28} rx={3} fill="#e2e8f0" />
        {/* the share that buys */}
        <rect x={0} y={12} width={fitPx} height={H - 28} rx={3} fill="#86efac" />
        {/* τ marker */}
        <line x1={tauPx} y1={6} x2={tauPx} y2={H - 10} stroke="#475569"
              strokeWidth={1} strokeDasharray="3 3" />
        <text x={tauPx} y={H - 1} textAnchor="middle" fontSize={9} fill="#64748b">
          τ {CFG.tau}
        </text>
        <text x={2} y={9} fontSize={9} fill="#94a3b8">{fit2(lo)}</text>
        <text x={W - 2} y={9} textAnchor="end" fontSize={9} fill="#94a3b8">{fit2(hi)}</text>
      </svg>
      <p className="text-[11px] text-gray-500 mt-1">
        Bars are spread evenly across the band. This joke clears{' '}
        <b>{result.bought} of {CFG.customerCount}</b>.
      </p>
    </div>
  );
};
```

- [ ] **Step 4: Update the call site**

Find the single `<ThresholdCurve result={...} />` usage and rename it to `<ThresholdBand result={...} />`.

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Open the app, switch to the **Customer** role via the DEV bar, and confirm:
- The header reads `TRUE_FIT … / 12`.
- Joke 1 shows `12.00` and `100/100 sold`.
- Joke 2 shows `7.25` and a partially shaded band (roughly 92/100).
- Joke 4 shows `0.75` and `0/100 sold`.
- The per-dimension table lists 12 rows with Structure scored, not greyed out.
- No console errors.

- [ ] **Step 6: Commit**

```bash
git add views/Customer.tsx
git commit -m "fix(ui): draw the threshold band uniformly instead of as a bell

Customer bars are uniform in [tau-jitter, tau+jitter]; a bell curve
misrepresented how the market actually spreads.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Marketing view — feed the reveal panel from the new API

`revealedDimsFor` in `views/QualityControl.tsx` calls the deleted `dimProx` and filters on `SCORED_DIMENSIONS`.

> **Scope note:** this panel shows the classified category and a fit position, which the real backend will never send (feedback is dimension *names* grouped Good/Improve). Rebuilding it belongs to **Phase 6**. Here we only keep it compiling and correct against the new module.

**Files:**
- Modify: `views/QualityControl.tsx` (import block, `revealedDimsFor`, `defaultDims`, the criteria chips)

- [ ] **Step 1: Update the import block**

Replace the `config/dimensions` import with:

```typescript
import {
  DIMENSIONS, MAX_FIT, dimById, dimFit, DEFAULT_IDEAL_PROFILE,
} from '../config/dimensions';
```

- [ ] **Step 2: Update the helpers**

Replace `defaultDims` and `revealedDimsFor` with:

```typescript
/* A plausible classification for demo/seed signals: lean on the default ideal
   so a published joke has a sensible level on every dimension. */
function defaultDims(): Record<string, string> {
  return { ...DEFAULT_IDEAL_PROFILE, TITLE_FIT: 'Strong' };
}

/* The dims a sale reveals: one of the top-3 closest + two seeded-random others.
   All 12 are eligible now — Structure is a real dimension. */
function revealedDimsFor(jokeId: number, dims: Record<string, string>): RevealedDim[] {
  const scored: RevealedDim[] = DIMENSIONS.map(d => ({
    dim: d,
    level: dims[d.id] ?? d.categories[0],
    prox: dimFit(d.id, DEFAULT_IDEAL_PROFILE[d.id] ?? '', dims[d.id] ?? d.categories[0]),
  }));
  const ranked = [...scored].sort((a, b) => b.prox - a.prox);
  const top = ranked[Math.floor(mkSeed(jokeId) * 3) % Math.min(3, ranked.length)];
  const rest = scored.filter(s => s.dim!.id !== top.dim!.id);
  const r1 = rest[Math.floor(mkSeed(jokeId + 1) * rest.length)];
  let r2 = rest[Math.floor(mkSeed(jokeId + 7) * rest.length)];
  if (r2 && r1 && r2.dim!.id === r1.dim!.id) {
    r2 = rest[(rest.indexOf(r1) + 1) % rest.length];
  }
  return [top, r1, r2].filter(Boolean) as RevealedDim[];
}
```

- [ ] **Step 3: Update the `RevealedDim` type and the criteria chips**

Change the `RevealedDim` interface to use the new spec type:

```typescript
interface RevealedDim {
  dim: ReturnType<typeof dimById>;
  level: string;
  prox: number;
}
```

In the "The 12 criteria customers judge" card, remove the `PLACEHOLDER_DIMS` greyed-out branch — Structure is a normal chip now — and keep the `INTRINSIC_DIMS` gold star for Title Fit by testing `d.hasIdeal === false` instead. Replace the `CATEGORICAL_DIMS.has(...)` check in `DimScale` with `dim.scoring === 'categorical'`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep QualityControl`
Expected: no output.

Run: `npm test`
Expected: all green.

Then in the browser, as **Marketing**: the criteria card shows 12 chips with Structure no longer dimmed, and the "What's selling" panel still renders for a sold joke.

- [ ] **Step 5: Commit**

```bash
git add views/QualityControl.tsx
git commit -m "refactor(marketing): read dimensions from the shared scoring module

Structure is no longer a placeholder chip. Panel rebuild against the
real feedback contract is Phase 6.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Tutorial — update imports and copy

**Files:**
- Modify: `components/Tutorial.tsx:18`

- [ ] **Step 1: Update the import**

Replace line 18 with:

```typescript
import { DIMENSIONS, MAX_FIT, DEFAULT_IDEAL_PROFILE } from '../config/dimensions';
```

- [ ] **Step 2: Fix every usage**

Search the file for `IDEAL_PROFILE`, `PLACEHOLDER_DIMS` and `INTRINSIC_DIMS` and replace:
- `IDEAL_PROFILE` → `DEFAULT_IDEAL_PROFILE`
- `PLACEHOLDER_DIMS.has(d.id)` → delete the branch; Structure is scored
- `INTRINSIC_DIMS.has(d.id)` → `d.hasIdeal === false`
- any copy saying "11 dimensions", "0–11" or "Structure doesn't count" → "12 dimensions", "0–12", and drop the Structure caveat

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep Tutorial`
Expected: no output.

In the browser, open the tutorial from each role and read the AI Customers tab: no stale "11" claims.

- [ ] **Step 4: Commit**

```bash
git add components/Tutorial.tsx
git commit -m "docs(tutorial): teach 12 dimensions, not 11

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Whole-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all files pass. Record the count.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
Expected: `5` — the pre-existing errors in `services/apiClient.ts` and `services/mockApi.ts`. Confirm none mention `dimensions`, `aiCustomerDemo`, `Customer`, `QualityControl` or `Tutorial`:

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "dimensions|aiCustomerDemo|Customer|QualityControl|Tutorial"`
Expected: no output.

- [ ] **Step 3: Confirm no stale scoring symbols survive**

Run: `grep -rn "dimProx\|SCORED_DIMENSIONS\|PLACEHOLDER_DIMS\|INTRINSIC_DIMS\|CATEGORICAL_DIMS\|gaussian\|normalPdf" --include="*.ts" --include="*.tsx" . | grep -v node_modules`
Expected: no output.

- [ ] **Step 4: Cross-check three jokes against the sandbox**

Open `https://jokefactory-classifier-sandbox.vercel.app/`, leave the ideal profile at its defaults, and classify the text of `DEMO_JOKES[0]`, `[1]` and `[3]`. For each, compare the sandbox's per-dimension table against `scoreJoke(joke, DEMO_CONFIG).dims`.

The **categories** may differ — the sandbox asks a live model and our fixtures are hand-written. What must match is the **arithmetic**: for any dimension where the sandbox's classified category equals our fixture's, the `dim_fit` must be identical, and the denominator must read `/ 12`.

If any pair disagrees, the bug is in `dimFit` — fix it and re-run Task 2's tests.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: verify phase 1 scoring matches backend

Full suite green; no scoring symbols left from the pre-refactor model;
spot-checked three jokes against the classifier sandbox.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- `npm test` is green and every scoring assertion encodes a backend rule, not a plan-document rule.
- `MAX_FIT` is 12 everywhere; no code treats Structure as a placeholder.
- No normal distribution remains in the customer model.
- The Customer view's numbers match the sandbox for any joke whose classification you copy across.
- `config/dimensions.ts` reads as a faithful mirror of `src/core/domain/scoring/`, so the next person can diff the two by eye.

## Deliberately not in this phase

Network calls, the `data` envelope, role renames, the splitting move, the Topic picker removal, the feedback rebuild, and the instructor config form. Each is its own plan.


---

## Closeout

### The goal was met

Frontend scoring agrees with `jokefactory_be/src/core/domain/scoring/`. All four
target defects are fixed and verified in code, not just asserted:

| Defect | Fix |
|---|---|
| `dimProx` linear ramp `1 − Δ/(n−1)` | 3-tier `dimFit`: 1.0 exact, 0.5 adjacent, 0 beyond |
| `MAX_FIT = 11`, Structure an unscored placeholder | 12, Structure a scored categorical dimension |
| Thresholds from a normal distribution | Uniform across `[τ−jitter, τ+jitter]` |
| 10 invented Topic categories | The backend's fixed 15 (in the rubric — see caveat) |

The load-bearing artifact is `config/dimensions.backend-parity.test.ts`: 93 cases
lifted from the backend's own Go test files and asserted against our TypeScript.
Zero divergences, with nothing adjusted on either side. It was mutation-tested —
breaking ordinal adjacency, the catch-all, and a length threshold each produce
failures — so it can go red.

### Substituted verification

The plan's Task 9 called for cross-checking three jokes against the live
classifier sandbox. The sandbox is password-gated and could not be driven, so the
check was replaced by the parity port above. The sandbox mirrors the Go package;
the Go package is the authority, and its own tests are a stronger oracle than
three hand-picked jokes. Recorded as a substitution, not a completion.

### Known gaps carried forward

1. ~~**The Marketing Topic picker still shows the legacy 10 categories.**~~
   **CLOSED** (`57e51c3`). The picker and the Joke Maker's prompt hint now read
   `dimById('TOPIC').categories` directly, so there is one Topic list in the
   codebase. The free-text custom topic went with it — `Other` is a real backend
   category now, so the escape hatch only produced values the rubric rejects —
   as did `bannedCategories`, which had no consumers and listed Politics, a
   valid backend Topic. The picker is still slated for removal in phase 5 (Topic
   is LLM-classified and the publish endpoint has no field for it); this makes
   it honest in the meantime.

2. **The three views have no tests.** Both Important findings in the final review
   — the Tutorial contradicting itself, and the ordinal track plotting a fit value
   against category labels — were invisible to a green suite. The scoring engine
   is proven; the UI layer is covered only by manual browser passes. View tests
   are better written against the real API in phase 2 than against the mock now.

3. **Marketing's "What's selling" panel scores against `DEFAULT_IDEAL_PROFILE`**,
   a module constant, rather than the round's actual instructor-chosen ideal, so
   its stated reasons are decorative. Pre-existing; the panel is replaced in
   phase 6 against the Good/Improve contract.

4. **The demo batch never produces a `SKIP_FULL`.** Measured verdicts: j1 100 BUY,
   j2 92 BUY / 8 SKIP_LOW, j3 100 BUY, j4 100 SKIP_LOW, j5 8 BUY / 92 SWAP. The
   Customer page teaches "otherwise the customer holds" with a batch that never
   demonstrates it. Adding a sixth joke would shift every "N/100 sold" figure on
   the page, so it belongs with whoever owns that fixture set.

### Closeout changes (after the final review)

- Deleted `classifyLength` and `SIM_CONFIG.length` from `config/simConfig.ts`.
  A second length classifier with 25/61-word thresholds and the `split(/\s+/)`
  Unicode bug we had just fixed was sitting two files from the correct one, with
  no callers. `config/` no longer contains two functions of the same name
  disagreeing about the answer.
- Reworded `config/simConfig.test.ts` so it stops reading as a claim about the
  rubric. It previously asserted "10 approved Topic categories" while
  `dimensions.backend-parity.test.ts` asserted `Workplace is not in the locked
  Topic list` — both green, in the same directory.
