# Lean charts — design

Status: approved in conversation 2026-10-06; this document records it.
Branches: `feat/lean-market` in both repos (frontend `AI-Joke-Factory`, backend `jokefactory_be`).

## 1. Goal

Lean market mode (see `2026-10-06-lean-market-mode-design.md` and `docs/lean-market-mode.md`)
changes the economics of the game, but the instructor dashboard still shows charts built for the
Classic game. Three of them never show data (the backend does not send their series) and the
other two re-plot leaderboard totals. None of them teaches a lean idea.

Replace them, **in Lean rounds only**, with four charts that let the instructor and the students
see two lean ideas in the simulation's own data:

1. **Waste** — what did not sell, what sat waiting, and what that cost.
2. **Smaller batches → faster change** — small batches get market feedback sooner, so teams learn
   and improve faster.

Success: an instructor can point at a chart in the debrief and a student can read it without
explanation; the charts agree to the cent with the leaderboard; a Classic round looks exactly as
it does today.

## 2. Decisions (from the conversation)

| Question | Decision |
|---|---|
| What do Classic rounds show? | Exactly today's charts. The new charts appear only when the round shown is Lean. "We can always go back" stays true. |
| Which lean ideas? | Waste; smaller batches → faster feedback → improvement. (Flow/WIP and pull/demand were offered and not chosen as separate themes.) |
| What do students compare against? | Their own team plus an anonymous class average. Never other teams by name. |
| Where does the data come from? | One new read-only backend endpoint that rebuilds history from timestamps already stored. |
| Style | Match the app: existing `Card` component, recharts, the design-handoff colours, plain-English captions. Easy and intuitive over clever. |

## 3. The four charts

All four are recharts charts inside the existing `Card` (white, rounded-xl, gray-200 border), with
a title, a one-line subtitle that says what "good" looks like, and a small legend above the plot.
Hover tooltips use the app's existing tooltip style.

### Colours

From `design_handoff_joke_factory_ui/colors_and_type.css.txt`, so the same thing has the same
colour everywhere in the app:

| Meaning | Colour | Token |
|---|---|---|
| Setup (Joke Maker changeover) | `#2563eb` | `--production` |
| Waiting at Marketing | `#7c3aed` | `--marketing` |
| Unsold on the shelf | `#d97706` | `--market` |
| Published, never sold | `#e11d48` | `--waste` |
| Discarded | `#94a3b8` | `--fg4` |
| Round 1 | `#3B82F6` | already used by the Wasted Jokes chart |
| Round 2 | `#F97316` | already used by the Wasted Jokes chart |
| Class average | `#64748b`, dashed | `--fg3` |

Colour is never the only cue: Round 2 points are triangles and Round 1 circles; the class average
is dashed.

### Chart 1 — "Where the money leaked" (Waste)

- **Form:** horizontal stacked bar, one bar per team, sorted by total waste, most first.
- **Segments (dollars):** Setup · Waiting at Marketing · Unsold on shelf · Published, never sold ·
  Discarded. A label at the end of each bar shows the total.
- **Subtitle:** "Cost of waste per team, by kind. Shorter bars = leaner."
- **Round control:** R1 / R2 (one round at a time; the totals differ by round).
- **Instructor only.**

### Chart 2 — "Jokes standing still" (Waste)

- **Form:** stacked area over the round. Bottom band: jokes waiting at Marketing. Top band: jokes
  unsold on the shelf. X = minute of the round, Y = jokes.
- **Class average:** dashed line of the class-average total (waiting + shelf).
- **Instructor:** a team picker (default: the team with the most idle jokes at the latest sample);
  R1 / R2 control.
- **Student:** their own team, current round, no picker.
- **Subtitle:** "Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste."
- In a round with a WIP limit, the subtitle adds "WIP limit: N batches" (the limit counts batches,
  the chart counts jokes, so it is stated, not drawn).

### Chart 3 — "Smaller batches, faster feedback" (Improvement)

- **Form:** scatter. One point per batch. X = jokes in the batch (1–5), Y = minutes from sending
  the batch to its first sale. Round 1 circles (blue), Round 2 triangles (orange); both rounds on
  one chart. Points at the same X are jittered horizontally so they do not stack.
- **Batches with no sale yet** are drawn as hollow markers in a band labelled "no sale yet" above
  the top of the Y axis, so they are visible and not mistaken for fast ones.
- **Subtitle:** "Each dot is a batch. Lower = the market answered sooner."
- **Instructor only.** Shows all teams; the team picker from chart 2 can narrow it to one team.

### Chart 4 — "More cycles, more learning" (Improvement)

- **Form:** line with markers. One point per batch at the minute it was sent (X); Y = share of
  its published jokes that sold (sell-through, 0–100 %). More points in the same 15 minutes =
  more chances to adjust; a rising line = learning.
- **Instructor:** class-wide view by default: Round 1 and Round 2 lines of the class sell-through
  per time sample; picking a team in the team picker shows that team's batches instead.
- **Student:** own team's batches in the current round (orange in R2, blue in R1); the class
  average sell-through as a dashed line; in Round 2, the team's own Round 1 batches faded behind.
- **Subtitle:** "Each dot is a batch: how much of it sold. More dots = more chances to adjust."
- Replaces the existing `LearningCurve` sparkline on the student screens. A batch with no
  published jokes is skipped (as `learningCurvePoints` does today).

## 4. Placement

**Instructor (`views/Instructor.tsx`).** When the round shown by the charts' round control is
Lean, the cards "Cumulative Sales Over Time", "Batch Sequence vs Quality", "Wasted Jokes",
"Scatter Plots" and "Unrated Jokes Over Time" are replaced by charts 1–4, in that order, in the
same grid. The leaderboard, the "Round 1 vs Round 2" table and Live Market stay where they are.
When the round is Classic, the existing cards render exactly as today. The decision uses the same
rule as the leaderboard: a round is Lean when its stats rows carry `lean` (or `config.marketMode`
for the selected round before stats arrive).

**Students (`views/JokeMaker.tsx`, `views/QualityControl.tsx`).** In a Lean round, the side panel
shows chart 2 and chart 4 (compact height, ~180 px) where the `LearningCurve` card is now. Classic
rounds are unchanged.

## 5. Data: one new endpoint

### Routes

| Route | Who | Returns |
|---|---|---|
| `GET /v1/instructor/rounds/:round_id/lean-charts` | Instructor (existing instructor auth) | every team + class average |
| `GET /v1/rounds/:round_id/teams/:team_id/lean-charts` | Team screens | that team + class average |

The team route follows the access model of the existing team summary route
(`/v1/rounds/:round_id/teams/:team_id/summary`): it returns one team's detail and the class
average, never another team's rows. A Classic round returns 409 `NOT_LEAN_ROUND`; the frontend
only calls it for Lean rounds. An unknown round returns 404 as the other round routes do.

### Response

```json
{
  "round_id": 7,
  "started_at": "…", "clock_end": "…",
  "sample_seconds": 60,
  "wip_limit": 2,
  "teams": [
    {
      "team_id": 3, "team_name": "Team 3",
      "waste": { "setup": 4.0, "waiting": 6.1, "shelf": 18.3, "never_sold": 2.5, "discarded": 0.12, "total": 31.02 },
      "idle": [ { "t": 0, "waiting": 0, "shelf": 0 }, { "t": 60, "waiting": 5, "shelf": 2 } ],
      "batches": [ { "seq": 1, "sent_s": 12.4, "jokes": 5, "published": 4, "sold": 3, "first_sale_s": 95.0 } ]
    }
  ],
  "class_average": {
    "waste": { "setup": …, "waiting": …, "shelf": …, "never_sold": …, "discarded": …, "total": … },
    "idle":  [ { "t": 0, "waiting": 0, "shelf": 0 } ],
    "sell_through": [ { "t": 0, "value": null }, { "t": 60, "value": 0.5 } ]
  }
}
```

All times are seconds from `started_at`. `first_sale_s` is seconds from the batch being sent to
its first sale, or `null` if none of its jokes has sold.

### Definitions — chosen to match the leaderboard exactly

Let `clock_end = COALESCE(ended_at, now())`, `rate = carrying_cost_per_joke_minute`, and a batch's
`jokes` = its joke rows, or `batch_size` if it has none yet (unsplit) — the same rule as the WIP
CTE in `lean_stats_repo.go`.

| Field | Definition |
|---|---|
| `waste.setup` | `batches_submitted × setup_cost_per_batch` (= leaderboard `lean.setup_cost`) |
| `waste.waiting` | `rate × wip_joke_minutes` (the WIP half of `lean.carrying_cost`) |
| `waste.shelf` | `rate × inventory_joke_minutes` (the inventory half of `lean.carrying_cost`) |
| `waste.never_sold` | `cost_of_publishing × published jokes with no sale` |
| `waste.discarded` | `cost_of_discard × discarded jokes` |
| `waste.total` | sum of the five |
| `idle[k].waiting` at time `t` | Σ `jokes` over batches with `submitted_at ≤ t < COALESCE(processed_at, ∞)` |
| `idle[k].shelf` at time `t` | count of PUBLISHED jokes with `published_at ≤ t < COALESCE(first_sold_at, ∞)` |
| `batches[i].sold` | jokes of the batch with any `+1` purchase event (as `batch_series`) |
| `batches[i].first_sale_s` | `MIN(first_sold_at over its jokes) − submitted_at` |
| `class_average.waste.*`, `class_average.idle[k].*` | arithmetic mean over every team in the round (`team_rounds_state`), including teams with no batches |
| `class_average.sell_through[k].value` | pooled over all teams' batches **sent** in `[t_k, t_{k+1})`: Σ sold ÷ Σ published; `null` when Σ published = 0 |

`waste.setup + waste.waiting + waste.shelf` equals the leaderboard's `setup_cost + carrying_cost`
for the same team at the same instant (a test asserts this).

**Samples.** `sample_seconds = max(1, round(arrival_window_seconds / 15))`; samples at
`t = 0, s, 2s, …` up to and including the first sample at or after `clock_end − started_at`,
capped at 120 samples. A 900 s window gives one sample a minute; the 180 s pilot window gives one
every 12 s. A round that has not started returns no samples.

### Computation

The repository loads three raw row sets for the round in one round trip each: batches
(`team_id, submitted_at, processed_at, joke_rows, published, sold, first_sold_at_min`), published
jokes (`team_id, published_at, first_sold_at`), and per-team counts/costs from the existing
`leanTeamCTE` (extended to expose `wip_joke_minutes` and `inventory_joke_minutes` separately).
A pure Go function `BuildLeanCharts(cfg, rows) LeanCharts` in the usecase layer turns them into
the response; it holds every rule above and is unit-tested without a database.

Read-only: nothing new is written during play, no migration.

## 6. Frontend structure

| Unit | Responsibility |
|---|---|
| `types/api.ts` | `LeanChartsResponse` and nested types, mirroring §5. |
| `services/api/team.ts`, `services/api/instructor.ts` | `leanCharts(roundId, teamId)` / `leanCharts(roundId)`. |
| `services/leanCharts.ts` | Pure transforms from the response to recharts rows: waste bars (sorted), idle area rows (+ class average), batch scatter points (jitter, "no sale yet" band), sell-through points; colour constants. Unit-tested. |
| `services/useLeanCharts.ts` | Hook: polls the right route every 10 s while mounted and the round is Lean; keeps the last good response on a failed poll; fetches an ended round once. The instructor panel loads both rounds (charts 3 and 4 overlay R1 and R2); a student screen loads the current round, plus Round 1 once when in Round 2 (for the faded batches). |
| `components/leanCharts/WasteBreakdownChart.tsx` | Chart 1. |
| `components/leanCharts/IdleJokesChart.tsx` | Chart 2 (props: team series, class average, compact flag). |
| `components/leanCharts/BatchFeedbackChart.tsx` | Chart 3. |
| `components/leanCharts/LearningCyclesChart.tsx` | Chart 4 (props: current batches, optional faded earlier-round batches, class sell-through, compact flag). |
| `components/leanCharts/LeanChartsPanel.tsx` | Instructor grid: round control, team picker, the four cards. |
| `views/Instructor.tsx` | Render `LeanChartsPanel` instead of the five Classic cards when the round is Lean. |
| `views/JokeMaker.tsx`, `views/QualityControl.tsx` | In Lean rounds, render charts 2 and 4 instead of `LearningCurve`. |

`components/LearningCurve.tsx` stays in the repo (unused by Lean screens) so reverting is a
one-line change; delete it later if the new chart proves itself.

## 7. Error handling

- A failed poll keeps the last chart and shows nothing alarming; after three consecutive failures
  the card shows "Chart data unavailable — retrying".
- Empty states use the app's existing wording style: "No batches sent yet" / "No sales yet".
- 409 `NOT_LEAN_ROUND` (a race with a mode change before start) hides the panel until the next
  config refresh.

## 8. Testing

- **Go unit tests** for `BuildLeanCharts`: idle counts at sample boundaries (submitted exactly at
  `t`, processed exactly at `t`), unsplit batch counting `batch_size`, discarded jokes never on the
  shelf, first sale per batch, `null` for unsold batches, class average over teams with no batches,
  pooled sell-through, sample count and the 120 cap, a not-started round.
- **Go integration test** (build tag `integration`, `JF_TEST_DATABASE_URL`): seeded round →
  `waste.setup + waiting + shelf` equals the leaderboard's `setup_cost + carrying_cost`; handler
  returns 409 for a Classic round; the team route returns exactly one team.
- **Vitest** for `services/leanCharts.ts` transforms and for the hook's keep-last-good behaviour.
- **Browser check:** a short Lean bot game on the local stack; screenshots of the instructor grid
  and both student panels; a Classic round shows the old cards unchanged.

## 9. Out of scope

- No change to gameplay, costs, customers, or the leaderboard.
- No new charts for Classic rounds.
- No export / download of charts.
- The pilot report does not render these charts.
