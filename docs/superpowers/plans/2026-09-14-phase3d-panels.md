# Phase 3D — The Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the integration. Every panel that currently shows fabricated, blank or zero data reads real backend data — or is honestly removed.

**Architecture:** Frontend-only. Three panels, each independently shippable: Marketing's feedback, the instructor's Live Market, and the instructor's leaderboard. Plus deleting types for endpoints that do not exist, so the gap stops looking bigger than it is.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 2, `strictNullChecks` on.

---

## Where this picks up

3A made a round startable. 3B restored the backend capabilities V2 dropped. 3C made the role
workflow clickable end to end — JM submits a blob, Marketing splits and publishes, the JM sees
the result, all verified in a browser against the live backend.

What is left is everything *beside* that loop. Three panels lie to the user today, in three
different ways: one invents its data, one reads fields the backend does not send, and one
renders charts for endpoints that do not exist.

## The payloads, captured live

**`GET /v1/rounds/{r}/teams/{t}/feedback`:**
```json
{ "data": { "jokes": [ {
  "joke_id": 1, "joke_title": "The Other IDE", "was_bought": false,
  "good_dimensions": ["TOPIC", "EDGINESS"],
  "improve_dimensions": ["LENGTH", "HUMOR_STYLE", "COMPLEXITY"]
} ] } }
```

**`GET /v1/rounds/{r}/market`:**
```json
{ "data": { "items": [ {
  "joke_id": 1, "joke_text": "...", "joke_title": "The Other IDE",
  "published_at": "2026-09-14T05:24:36.745934Z",
  "sold_count": 0, "team_id": 1, "team_name": "Team 1"
} ] } }
```

Note what feedback does **not** contain: no numbers, no categories, no ideal levels. Dimension
ids only, split into pass and fail. That is deliberate — the learning design requires teams to
reverse-engineer the hidden ideal, and a graded reveal would hand it to them.

---

## Explicitly NOT in this plan

Building the seven instructor chart series. Frank's call: leaderboard only for now.
`cumulative_sales` is the cheapest to add later (`ports.SalesPoint` is already declared and
nothing constructs it), but `learning_curve`, `Avg Score` and `Accepted Jokes` are **not
restorable at all** — V2 deleted ratings as a concept, so per-batch "quality" has no
definition. This plan deletes the dead types rather than faking them.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `services/teamService.ts` or existing equivalent | A `feedback(roundId, teamId)` call. | Modify |
| `context.tsx` | Fetch and expose real feedback; map the flat market shape. | Modify |
| `views/QualityControl.tsx` | Render pass/fail chips; delete the fabrication. | Modify |
| `views/Instructor.tsx` | Flat market fields; real leaderboard field names; drop Avg Score. | Modify |
| `types.ts` | Delete the three unrendered chart types and the dead summary fields. | Modify |
| `views/feedback.test.ts` | Pins the pass/fail rendering against the real payload. | Create |

---

## Task 1: Make the feedback panel real

This is the most important task in the phase, and the only one where the current behaviour is
actively misleading rather than merely empty.

**What it does today.** `views/QualityControl.tsx:77 revealedDimsFor()` invents everything:

```typescript
      prox: dimFit(d.id, DEFAULT_IDEAL_PROFILE[d.id] ?? '', level),
```

`DEFAULT_IDEAL_PROFILE` is the **frontend's hardcoded default**, not the round's actual ideal
profile — which the instructor sets and which the engine actually scores against. It then picks
three dimensions from a hash of the joke id (`mkSeed`) and renders `prox`, a 0–1 graded value,
as a proximity bar.

So the panel is wrong twice over: the numbers are fiction, and **a graded distance-to-ideal
leaks strictly more than the pass/fail the learning design allows**. A team could read the bars
and solve the hidden profile without ever selling a joke.

**Files:** `services/*`, `context.tsx`, `views/QualityControl.tsx`, `views/feedback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `views/feedback.test.ts`. Extract whatever pure mapping you introduce (payload →
renderable rows) into a testable function rather than testing React:

```typescript
import { describe, it, expect } from 'vitest';
import { toFeedbackRows } from './QualityControl';

/* Captured live from GET /v1/rounds/1/teams/1/feedback. Dimension ids only — the backend
   deliberately sends no numbers, no categories and no ideal levels, because teams are meant
   to reverse-engineer the hidden ideal. */
const payload = {
  jokes: [{
    joke_id: 1,
    joke_title: 'The Other IDE',
    was_bought: false,
    good_dimensions: ['TOPIC', 'EDGINESS'],
    improve_dimensions: ['LENGTH', 'HUMOR_STYLE', 'COMPLEXITY'],
  }],
};

describe('toFeedbackRows', () => {
  it('maps dimension ids to their display labels', () => {
    const [row] = toFeedbackRows(payload as never);
    expect(row.good.map(d => d.label)).toEqual(['Topic', 'Edginess']);
    expect(row.improve.map(d => d.label)).toContain('Humor Style');
  });

  it('carries no numeric score anywhere', () => {
    // The learning design forbids a graded reveal. If a number ever appears in a feedback
    // row, a team can solve the hidden ideal without selling anything.
    const [row] = toFeedbackRows(payload as never);
    const json = JSON.stringify(row);
    expect(json).not.toMatch(/"prox"|"fit"|"score"/);
  });

  it('survives an unknown dimension id', () => {
    // If the backend adds a dimension before the frontend knows it, show the raw id rather
    // than crashing or dropping the row.
    const [row] = toFeedbackRows({ jokes: [{ ...payload.jokes[0], good_dimensions: ['NEW_DIM'] }] } as never);
    expect(row.good[0].label).toBe('NEW_DIM');
  });

  it('handles a joke with no feedback yet', () => {
    const [row] = toFeedbackRows({ jokes: [{ joke_id: 2, joke_title: 'x', was_bought: false, good_dimensions: [], improve_dimensions: [] }] } as never);
    expect(row.good).toEqual([]);
    expect(row.improve).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, confirm FAIL** (`toFeedbackRows` does not exist). Paste the output.

- [ ] **Step 3: Fetch the real feedback**

Add a `feedback(roundId, teamId)` call to the service layer alongside the other team calls,
hitting `/v1/rounds/${roundId}/teams/${teamId}/feedback`.

**Note `services/api/team.ts` already has exactly this** (`teamApi.feedback`), typed and
covered by contract tests, but nothing in the runtime imports it — `context.tsx` uses the flat
`services/*Service.ts` layer. Use whichever fits the existing wiring, and **say which you chose
and why**; do not create a third copy.

**`X-User-Id` is required** on this route (400 `BAD_REQUEST` without it). `apiRequest` already
attaches it from localStorage.

Poll it where the other team data is polled in `context.tsx`, expose it through the context,
and gate it on the user being on a team.

- [ ] **Step 4: Render pass/fail, delete the fabrication**

Write `toFeedbackRows` as a pure exported function mapping the payload to
`{ joke_id, joke_title, was_bought, good: {id,label}[], improve: {id,label}[] }`, resolving
labels via `dimById(id)?.label ?? id`.

Render each dimension as a chip — pass and fail visually distinct. **No bar, no percentage, no
"→ target" arrow, no ideal level.** The whole point is that the team learns *which* dimensions
missed, not by how much.

Then delete `revealedDimsFor`, `defaultDims`, `mkSeed` (if unused elsewhere), the `RevealedDim`
type, and the local seeding at `views/QualityControl.tsx:496` and `:592`. Check whether
`DimScale` is still used anywhere; if the only caller was the feedback panel, delete it too.

**Be careful:** `views/QualityControl.tsx:496` seeds feedback from published jokes with
`sold_count > 0`, and `:592` appends a fabricated entry on each release. Both go. Make sure
removing them does not break the release flow itself — that is 3C's work and must keep working.

- [ ] **Step 5: Verify**

`npx vitest run` → 285 + 4 = **289 passing**. `npm run typecheck` → **1**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(marketing): render real feedback instead of inventing it

The panel scored every joke against DEFAULT_IDEAL_PROFILE - the frontend's
hardcoded default, not the round's actual ideal - picked three dimensions
from a hash of the joke id, and drew a graded proximity bar.

So it was wrong twice: the numbers were fiction, and a graded reveal leaks
strictly more than the pass/fail the learning design allows. A team could
read the bars and solve the hidden profile without selling a joke.

It now reads GET /v1/rounds/{r}/teams/{t}/feedback and renders the
backend's good/improve dimension names as chips, with no score anywhere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The market board's real shape

The instructor's Live Market panel reads `it.team?.id`, `it.team?.name`, `it.bought_count` and
`it.team?.sold_jokes_count`. The backend sends a **flat** item: `team_id`, `team_name`,
`sold_count`. So every row renders a blank team, `0` sales and `Sold: 0/0`.

**Files:** `types.ts`, `context.tsx`, `views/Instructor.tsx`

- [ ] **Step 1: Map at the boundary**

Wherever `context.tsx` normalises market items, map the flat fields into whatever shape the
view expects — or change the view to read the flat fields directly. **Prefer changing the
view**: the backend's shape is the simpler one, and inventing a nested `team` object in the
mapper just to satisfy old code preserves a fiction.

`types/api.ts:MarketItem` already describes the real shape correctly. Align `types.ts`'s
`ApiMarketItem` with it, and delete `is_bought_by_me` — it is meaningless without a human
buyer.

- [ ] **Step 2: Verify against live data**

With the backend running and a published joke on the market:

```bash
curl -s -H 'X-User-Id: 1' http://localhost:8080/v1/rounds/1/market
```

Then open the instructor view and confirm the Live Market row shows the **real team name** and
the **real sold count**, matching that JSON. Paste both.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(instructor): read the market's real flat shape

The Live Market panel read a nested team object and bought_count; the
backend sends flat team_id, team_name and sold_count, so every row showed
a blank team and zero sales.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Honest leaderboard, and delete what does not exist

The leaderboard renders nine columns; **four have no source** and render `0` via `?? 0`:
`batches_rated`, `accepted_jokes`, `unaccepted_jokes`, `avg_score_overall`. The backend's
`ports.TeamStats` provides `batches_processed`, `published_jokes`, `discarded_jokes`,
`total_jokes`, `unsold_jokes`, `profit`, `total_sales`, `rank`, `team`.

**Files:** `types.ts`, `context.tsx`, `views/Instructor.tsx`

- [ ] **Step 1: Rename three, delete one**

- `batches_rated` → `batches_processed`
- `accepted_jokes` → `published_jokes`
- `unaccepted_jokes` → `discarded_jokes`
- **`Avg Score`: delete the column.** It cannot be restored — V2 removed ratings, so there is
  no per-batch quality score to show. Rendering `0.0` for every team is worse than not
  rendering it.

The scatter-plot metric panel reads the same four keys; re-point it and drop any metric that
depended on `avg_score_overall`. Same for the team summary's `batches_rated`,
`accepted_jokes`, `avg_score_overall`, `unrated_batches` → `batches_processed`,
`published_jokes`, `unprocessed_batches`.

- [ ] **Step 2: Derive the one chart that is derivable**

`rejection_by_team` is rendered (the "Wasted Jokes" bars) and the backend does not send it —
but its inputs are already on the leaderboard. Derive it client-side:

```typescript
  const rejectionByTeam = leaderboard.map(t => ({
    team_id: t.team.id,
    team_name: t.team.name,
    unaccepted_jokes: t.discarded_jokes,
    rejection_rate: t.total_jokes > 0 ? t.discarded_jokes / t.total_jokes : 0,
  }));
```

- [ ] **Step 3: Delete the dead types**

`types.ts` declares `batch_quality_by_size`, `output_vs_rejection` and `revenue_vs_acceptance`,
normalises all three in `context.tsx`, and **renders none of them** (`grep` in
`views/Instructor.tsx` returns zero hits). Delete the types and their normaliser branches.

Also delete the batch-listing fields the backend never sends: `avg_score`, `passes_count`,
`feedback`, `tag_summary`.

For `cumulative_sales`, `learning_curve` and `unrated_jokes_over_time` — which **are** rendered
— do not delete them. Leave the charts, but make the empty state honest: if the array is
absent, show "Not available yet" rather than an empty axis that looks like zero data. Say what
you did.

- [ ] **Step 4: Verify**

`npx vitest run` → 289 passing. `npm run typecheck` → 1. Then open the instructor view against
the live backend and confirm the leaderboard shows **real** batch and joke counts for the team
that published in 3C, and that no column reads 0 where the data exists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(instructor): real leaderboard fields, drop what cannot exist

Four of nine columns had no backend source and rendered 0: batches_rated,
accepted_jokes, unaccepted_jokes and avg_score_overall. Three were simply
renamed in V2. Avg Score is deleted - V2 removed ratings as a concept, so
there is no per-batch quality score, and showing 0.0 for every team is
worse than showing nothing.

Also deletes three chart types that were declared and normalised but never
rendered, and derives rejection_by_team from leaderboard fields.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Walk all four roles against the live backend

- [ ] **Step 1: Clean slate, full round**

Reset the DB, configure and start a round, and play it through: JM submits a blob, Marketing
splits, titles, publishes one and discards the rest. Wait for the AI customers to tick.

- [ ] **Step 2: Check every panel**

- **Marketing** — the feedback panel shows real dimension chips for the published joke, sourced
  from the backend. No bars, no numbers.
- **Joke Maker** — Created to Publish, Content Waste and Jokes-by-stage all show real values
  (these were 3C's fixes; confirm nothing regressed).
- **Instructor** — Live Market shows the real team name and sold count; the leaderboard shows
  real batch and joke counts and has no Avg Score column.
- **AI Customers** — unchanged, it is a local explainer.

Console must be clean on every screen. Note any 409 on `/market` polling — known pre-existing
noise from polling a non-ACTIVE round, not introduced here.

- [ ] **Step 3: Commit the evidence**

```bash
git commit --allow-empty -m "chore(fe): verify all four panels against the live backend

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- Marketing's feedback panel shows the backend's real good/improve dimensions, with no score.
- The instructor's Live Market shows real team names and sold counts.
- The leaderboard shows real counts, and no column renders a placeholder zero.
- No type remains in `types.ts` for an endpoint or field the backend does not send.
- 289 tests pass, typecheck holds at 1, `dist/` clean.
