# Lean Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Lean rounds only, replace the five Classic instructor chart cards with four charts (Where the money leaked, Jokes standing still, Smaller batches faster feedback, More cycles more learning) and replace the students' learning-curve card with charts 2 and 4, all fed by one new read-only backend endpoint that agrees to the cent with the leaderboard.

**Architecture:** The backend reads three raw row sets (batches, published jokes, per-team totals from the extended `leanTeamCTE`) in one read-only snapshot, and a pure Go function `usecase.BuildLeanCharts` turns them into the response; two thin handlers serve it on an instructor route and a team route, refusing Classic rounds with 409 `NOT_LEAN_ROUND`. The frontend has a pure transform module (`services/leanCharts.ts`), a poller plus hook (`services/useLeanCharts.ts`), four recharts card components, an instructor panel swapped in for the Classic cards only when the shown round is Lean, and a student wrapper swapped in for `LearningCurve`.

**Tech Stack:** Go (module `jokefactory`, gin, pgx v5, in-memory `testutil.Store` for usecase tests); React 19 + TypeScript 5.8 + Vite 6 + recharts 3.6 + vitest 2 (environment `node`, so components are tested with `react-dom/server` `renderToStaticMarkup`); local Docker stack (api on :8081, Postgres on :55432).

**Spec:** `~/Documents/GitHub/AI-Joke-Factory/docs/superpowers/specs/2026-10-06-lean-charts-design.md` (read it first; this plan argues from it).

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Repos and branches:** backend `~/Documents/GitHub/jokefactory_be`, frontend `~/Documents/GitHub/AI-Joke-Factory`, both on branch `feat/lean-market`. Each task names its repo; commit only in that repo.
- **Git:** new commits only. Never `git reset`, `git commit --amend`, `git rebase`, `git stash` or `git push`. Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never print secrets and never `cat` `jokefactory_be/.env`. The admin password is only ever read by shell substitution (`$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)`) inside a command, never echoed.
- **Lean-only rendering:** the new charts render only when the round shown is Lean. A round is Lean when its stats rows carry `lean`; before any stats rows arrive, when it is the current round and `config.marketMode === 'LEAN'` (the leaderboard's rule).
- **Classic unchanged:** in a Classic round the five Classic cards ("Cumulative Sales Over Time", "Batch Sequence vs Quality", "Wasted Jokes", "Scatter Plots", "Unrated Jokes Over Time") render exactly as today. `git diff --numstat views/Instructor.tsx` must show 0 deleted lines. No Classic SQL string, Classic branch or existing test expectation is edited. Leaderboard, "Round 1 vs Round 2" table and Live Market stay where they are.
- **Colours (exact):** Setup `#2563eb`; Waiting at Marketing `#7c3aed`; Unsold on shelf `#d97706`; Published, never sold `#e11d48`; Discarded `#94a3b8`; Round 1 `#3B82F6`; Round 2 `#F97316`; Class average `#64748b`, always dashed.
- **Colour is never the only cue:** Round 1 points are circles, Round 2 points are triangles, the class average is dashed, "no sale yet" batches are hollow.
- **Titles and subtitles (verbatim):** "Where the money leaked" / "Cost of waste per team, by kind. Shorter bars = leaner."; "Jokes standing still" / "Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste." (+ " WIP limit: N batches" when the round has a WIP limit); "Smaller batches, faster feedback" / "Each dot is a batch. Lower = the market answered sooner."; "More cycles, more learning" / "Each dot is a batch: how much of it sold. More dots = more chances to adjust."
- **Polling:** every 10 s (`LEAN_CHARTS_POLL_MS = 10_000`) while mounted and the round is Lean and ACTIVE; an ended round is fetched once; a failed poll keeps the last good response; after 3 consecutive failures (`LEAN_CHARTS_FAILURE_LIMIT = 3`) the card shows "Chart data unavailable — retrying".
- **Empty states:** "No batches sent yet" and, for batches with nothing released, "No jokes released yet".
- **Samples:** `sample_seconds = max(1, round(arrival_window_seconds / 15))`; samples at `t = 0, s, 2s, …` up to and including the first sample at or after `clock_end − started_at`; at most 120 samples (`MaxLeanChartSamples = 120`); a round that has not started has no samples. Plan resolution of the cap: when more than 120 would be needed, the step widens to `ceil(elapsed / 119)` so the last sample still reaches `clock_end`, and `sample_seconds` reports the widened step.
- **Clock:** `clock_end = COALESCE(ended_at, now())` using the database clock; all response times are seconds from `started_at`.
- **Definitions:** `waste.setup = batches_submitted × setup_cost_per_batch`; `waste.waiting = rate × wip_joke_minutes`; `waste.shelf = rate × inventory_joke_minutes`; `waste.never_sold = cost_of_publishing × published jokes with no +1 purchase event`; `waste.discarded = cost_of_discard × discarded jokes`; `waste.total` = sum of the five. A batch's `jokes` = its joke rows, or `batch_size` if it has none (unsplit). `waste.setup + waste.waiting + waste.shelf` equals the leaderboard's `setup_cost + carrying_cost` for the same team at the same instant.
- **Routes:** `GET /v1/instructor/rounds/:round_id/lean-charts` (existing instructor auth, every team + class average) and `GET /v1/rounds/:round_id/teams/:team_id/lean-charts` (same access as the team summary route: no auth header; exactly one team + class average, never another team's rows). A Classic round answers 409 `{"error":{"code":"CONFLICT","message":"conflict: NOT_LEAN_ROUND: …"}}` (the codebase's MARKET_MODE_LOCKED / WIP_LIMIT_REACHED pattern); an unknown round or team answers 404.
- **Read-only:** nothing new is written during play; no migration.
- **Students:** see their own team plus the anonymous class average, never another team by name; their charts are compact (180 px plot).
- **Style:** existing `Card` (`components/ui.tsx`), recharts, the app's tooltip box (`rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg`), plain-English captions, `isAnimationActive={false}` so 10-second refreshes do not re-animate.
- **Keep:** `components/LearningCurve.tsx` stays in the repo, unused by Lean screens.
- **Out of scope:** no change to gameplay, costs, customers or the leaderboard; no new Classic charts; no chart export; the pilot report does not render these charts.

## Review Focus

The five input classes most likely to bite a real class, each pinned by a test in the owning task:

1. **A round still running** (`ended_at` NULL): `clock_end` is the database `now()`, the last sample must reach it, and the waste must agree with a leaderboard read a moment later within a cent. Pinned: Task 2 `TestBuildLeanChartsRunningRoundReachesClockEnd`; Task 4 running-round section of `TestLeanChartsSQLIntegration`.
2. **A batch Marketing has not split yet** (0 joke rows): counts as `batch_size` jokes in waiting, in `batches[i].jokes` and in WIP minutes, never as 0. Pinned: Task 1 `TestMemStoreLeanChartRowsUnsplitBatchAndEmptyTeam`; Task 2 `TestBuildLeanChartsUnsplitBatchCountsBatchSize`; Task 4 team B.
3. **A team with zero batches, or with no `team_rounds_state` row yet:** it appears with zeros, it is counted in the class average, and the team route returns a zero row for it (not 404, not someone else's row). Pinned: Task 2 `TestBuildLeanChartsClassAverageIncludesTeamsWithNoBatches`; Task 3 `TestStatsServiceTeamLeanChartsReturnOnlyThatTeam`; Task 5 `wasteBars` / `defaultIdleTeamId` tests.
4. **A batch with `published = 0`** (unsplit, or all discarded in Round 2): no NaN anywhere — pooled sell-through for its bucket is JSON `null` (and `json.Marshal` must not fail), chart 4 skips it, chart 3 shows it hollow with "Nothing released yet". Pinned: Task 2 `TestBuildLeanChartsPooledSellThrough`; Task 5 `batchSellThrough` / `cyclesForInstructor` / `batchScatter` tests.
5. **Switching R1/R2, Lean/Classic, or a reset while a request is in flight; a round ending:** a late answer for the old round must never paint the new one, and a round going ACTIVE → ENDED must not blank the charts. Pinned: Task 6 "drops an answer that arrives after stop", "starts from the given initial state" and `leanChartsKey` tests.

## File Structure

Backend (`~/Documents/GitHub/jokefactory_be`):

| File | Action | Responsibility |
|---|---|---|
| `src/core/ports/repositories.go` | Modify | `LeanChartTeamRow`, `LeanChartBatchRow`, `LeanChartJokeRow`, `LeanChartRows`; `StatsRepository.GetLeanChartRows`. |
| `src/infra/repo/postgres/lean_stats_repo.go` | Modify | `leanTeamCTE` exposes `wip_joke_minutes` and `inventory_joke_minutes` (additive columns only). |
| `src/infra/repo/postgres/lean_charts_repo.go` | Create | `GetLeanChartRows`: clock end + three row sets in one read-only REPEATABLE READ transaction. |
| `src/core/usecase/testutil/memstore_lean_charts.go` | Create | In-memory `GetLeanChartRows` mirroring the SQL. |
| `src/core/usecase/lean_chart_rows_test.go` | Create | Memstore row tests (Task 1). |
| `src/core/usecase/lean_charts.go` | Create | Response types, `LeanChartSampling`, pure `BuildLeanCharts`. |
| `src/core/usecase/lean_charts_test.go` | Create | `BuildLeanCharts` unit tests (Task 2). |
| `src/core/usecase/stats.go` | Modify | `GetLeanCharts`, `GetTeamLeanCharts`, `leanRound`, `errNotLeanRound`. |
| `src/core/usecase/instructor.go`, `src/core/usecase/round.go` | Modify | `InstructorService.LeanCharts`, `RoundService.TeamLeanCharts`. |
| `src/core/usecase/lean_charts_service_test.go` | Create | Service tests (Task 3). |
| `src/app/http/handler/instructor.go`, `src/app/http/handler/round.go` | Modify | `InstructorHandler.LeanCharts`, `RoundHandler.TeamLeanCharts`. |
| `src/app/server/server.go` | Modify | Two routes. |
| `src/app/server/lean_charts_routes_test.go` | Create | HTTP tests through the real router (auth, 200/400/404/409). |
| `src/infra/repo/postgres/lean_charts_integration_test.go` | Create | Integration test (build tag `integration`). |

Frontend (`~/Documents/GitHub/AI-Joke-Factory`):

| File | Action | Responsibility |
|---|---|---|
| `types/api.ts` | Modify | `LeanChartsResponse` and nested types; endpoint index lines. |
| `services/api/team.ts`, `services/api/instructor.ts` | Modify | `teamApi.leanCharts(roundId, teamId)`, `instructorApi.leanCharts(roundId)`. |
| `services/api/contract.test.ts` | Modify | Contract tests for both routes and the 409. |
| `services/leanCharts.ts` | Create | Colours, constants, `isNotLeanRound`, every pure transform. |
| `services/leanCharts.testdata.ts` | Create | Shared typed fixture for the frontend tests. |
| `services/leanCharts.test.ts` | Create | Transform tests. |
| `services/useLeanCharts.ts` | Create | `startLeanChartsPoller` (pure timing), `leanChartsKey`, `useLeanCharts` hook. |
| `services/useLeanCharts.test.ts` | Create | Poller tests with fake timers. |
| `components/leanCharts/chartParts.tsx` | Create | Legend, tooltip box, notices, round markers, plot height. |
| `components/leanCharts/WasteBreakdownChart.tsx` | Create | Chart 1. |
| `components/leanCharts/IdleJokesChart.tsx` | Create | Chart 2. |
| `components/leanCharts/BatchFeedbackChart.tsx` | Create | Chart 3. |
| `components/leanCharts/LearningCyclesChart.tsx` | Create | Chart 4. |
| `components/leanCharts/leanCharts.render.test.ts` | Create | Static-render tests of the four cards. |
| `components/leanCharts/LeanChartsPanel.tsx` | Create | Instructor control bar + the four cards (grid children). |
| `components/leanCharts/LeanChartsPanel.test.ts` | Create | Static-render test of the panel. |
| `components/leanCharts/StudentLeanCharts.tsx` | Create | Charts 2 and 4 for a team screen; Round 1 faded batches in Round 2. |
| `components/leanCharts/StudentLeanCharts.test.ts` | Create | Static-render test. |
| `views/Instructor.tsx` | Modify (additions only) | Lean flags, two `useLeanCharts` calls, panel swapped for the Classic cards. |
| `views/JokeMaker.tsx`, `views/QualityControl.tsx` | Modify | `StudentLeanCharts` instead of the `LearningCurve` card. |
| `docs/lean-market-mode.md` | Modify | The four charts, how to read them, debrief prompts. |

Baselines (verified 2026-10-06): backend `go build ./... && go vet ./... && go test ./...` passes; frontend `npx tsc --noEmit -p tsconfig.json` passes and `npx vitest run` passes 518 tests in 28 files.

---

## Task 1: Raw chart rows in one snapshot (backend repo + memstore)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Modify: `src/core/ports/repositories.go` (after `type RoundStats` at :124-127; `StatsRepository` interface at :214-225)
- Modify: `src/infra/repo/postgres/lean_stats_repo.go:30-31, :91-93, :117`
- Create: `src/infra/repo/postgres/lean_charts_repo.go`
- Create: `src/core/usecase/testutil/memstore_lean_charts.go`
- Test: `src/core/usecase/lean_chart_rows_test.go`

**Interfaces:**
- Consumes: `leanTeamCTE` (`lean_stats_repo.go`), `testutil.Store` fields `Rounds`, `Batches`, `TeamState`, `PurchaseEvents`, `Now`, method `(*Store).now()` and `GetTeam`.
- Produces (in package `ports`):
  ```go
  type LeanChartTeamRow struct { TeamID int64; TeamName string; BatchesSubmitted int; DiscardedJokes int; WIPJokeMinutes float64; InventoryJokeMinutes float64 }
  type LeanChartBatchRow struct { BatchID int64; TeamID int64; SubmittedAt time.Time; ProcessedAt *time.Time; JokeRows int; Published int; Sold int; FirstSoldAt *time.Time }
  type LeanChartJokeRow struct { TeamID int64; PublishedAt time.Time; FirstSoldAt *time.Time }
  type LeanChartRows struct { ClockEnd time.Time; Teams []LeanChartTeamRow; Batches []LeanChartBatchRow; Jokes []LeanChartJokeRow }
  // StatsRepository gains:
  GetLeanChartRows(ctx context.Context, roundID int64) (*LeanChartRows, error)
  ```
  Implemented by `(*postgres.Repositories)` and `(*testutil.Store)`. Teams are sorted by `TeamID`; batches by `(TeamID, SubmittedAt, BatchID)`; jokes by `(TeamID, PublishedAt)`. All times UTC. Unknown round → `domain.NewNotFoundError("round")`.

- [ ] **Step 1: Write the failing test**

Create `src/core/usecase/lean_chart_rows_test.go`:

```go
package usecase

import (
	"context"
	"math"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
)

// The lean stats fixture (lean_stats_test.go) at T+16min: one batch of 5 sent
// at T, released at T+6min with 3 published and 2 discarded, one published
// joke first sold at T+10min.
func TestMemStoreLeanChartRowsMirrorTheLeanStats(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	round, teamID := seedLeanStatsFixture(t, st)
	now := round.StartedAt.Add(16 * time.Minute)
	st.Now = func() time.Time { return now }
	at := func(min int) time.Time { return round.StartedAt.Add(time.Duration(min) * time.Minute) }
	approx := func(got, want float64) bool { return math.Abs(got-want) < 1e-9 }

	rows, err := st.GetLeanChartRows(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !rows.ClockEnd.Equal(now) {
		t.Fatalf("clock end %v; want %v", rows.ClockEnd, now)
	}
	if len(rows.Teams) != 1 {
		t.Fatalf("teams %+v", rows.Teams)
	}
	tr := rows.Teams[0]
	if tr.TeamID != teamID || tr.TeamName != "Team 1" || tr.BatchesSubmitted != 1 || tr.DiscardedJokes != 2 ||
		!approx(tr.WIPJokeMinutes, 30) || !approx(tr.InventoryJokeMinutes, 24) {
		t.Fatalf("team row %+v; want 1 submitted, 2 discarded, WIP 30, inventory 24", tr)
	}
	if len(rows.Batches) != 1 {
		t.Fatalf("batches %+v", rows.Batches)
	}
	b := rows.Batches[0]
	if b.TeamID != teamID || !b.SubmittedAt.Equal(at(0)) || b.ProcessedAt == nil || !b.ProcessedAt.Equal(at(6)) ||
		b.JokeRows != 5 || b.Published != 3 || b.Sold != 1 || b.FirstSoldAt == nil || !b.FirstSoldAt.Equal(at(10)) {
		t.Fatalf("batch row %+v", b)
	}
	// Discarded jokes never appear: only the 3 published jokes, one of them sold.
	if len(rows.Jokes) != 3 {
		t.Fatalf("jokes %+v; want the 3 published", rows.Jokes)
	}
	sold := 0
	for _, j := range rows.Jokes {
		if !j.PublishedAt.Equal(at(6)) {
			t.Errorf("joke published at %v; want %v", j.PublishedAt, at(6))
		}
		if j.FirstSoldAt != nil {
			sold++
		}
	}
	if sold != 1 {
		t.Fatalf("%d sold jokes; want 1", sold)
	}

	// The leaderboard's carrying cost is rate × (wip + inventory) of these rows.
	stats, err := st.GetRoundStatsLean(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	want := round.CarryingCostPerJokeMinute * (tr.WIPJokeMinutes + tr.InventoryJokeMinutes)
	if !approx(stats.Leaderboard[0].Lean.CarryingCost, want) {
		t.Fatalf("leaderboard carrying %.4f; rows give %.4f", stats.Leaderboard[0].Lean.CarryingCost, want)
	}
}

// Review focus 2 and 3: an unsplit batch counts batch_size jokes of WIP, and a
// team with no batches still gets a (zero) row.
func TestMemStoreLeanChartRowsUnsplitBatchAndEmptyTeam(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketLean
	cfg.BatchSize = 5
	cfg.CarryingCostPerJokeMinute = 0.05
	if _, err := st.InsertRoundConfig(ctx, 1, &cfg); err != nil {
		t.Fatal(err)
	}
	st.Teams = []domain.Team{{ID: 1, Name: "Team 1"}, {ID: 2, Name: "Team 2"}}
	if _, err := st.StartRound(ctx, 1); err != nil {
		t.Fatal(err)
	}
	b, err := st.CreateBatch(ctx, 1, 1, nil, "one joke\n\nanother joke")
	if err != nil {
		t.Fatal(err)
	}
	st.Now = func() time.Time { return b.SubmittedAt.Add(2 * time.Minute) }

	rows, err := st.GetLeanChartRows(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows.Teams) != 2 || rows.Teams[0].TeamID != 1 || rows.Teams[1].TeamID != 2 {
		t.Fatalf("teams %+v; want teams 1 and 2 in id order", rows.Teams)
	}
	if got := rows.Teams[0]; got.BatchesSubmitted != 1 || math.Abs(got.WIPJokeMinutes-10) > 1e-9 {
		t.Fatalf("team 1 %+v; want 1 submitted and 5 jokes × 2 min = 10 joke-min", got)
	}
	if got := rows.Teams[1]; got.BatchesSubmitted != 0 || got.WIPJokeMinutes != 0 || got.InventoryJokeMinutes != 0 {
		t.Fatalf("team 2 %+v; want zeros", got)
	}
	if len(rows.Batches) != 1 || rows.Batches[0].JokeRows != 0 || rows.Batches[0].Published != 0 ||
		rows.Batches[0].ProcessedAt != nil || rows.Batches[0].FirstSoldAt != nil {
		t.Fatalf("batches %+v; want one unsplit, unprocessed, unsold batch", rows.Batches)
	}
	stats, err := st.GetRoundStatsLean(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range stats.Leaderboard {
		if row.Team.ID == 1 && math.Abs(row.Lean.CarryingCost-0.05*10) > 1e-9 {
			t.Fatalf("leaderboard carrying %.4f; want 0.50", row.Lean.CarryingCost)
		}
	}
}

func TestMemStoreLeanChartRowsUnknownRound(t *testing.T) {
	_, err := testutil.NewStore().GetLeanChartRows(context.Background(), 99)
	if !domain.IsNotFound(err) {
		t.Fatalf("want not found, got %v", err)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run TestMemStoreLeanChartRows -v`
Expected: FAIL to compile with `st.GetLeanChartRows undefined (type *testutil.Store has no field or method GetLeanChartRows)`.

- [ ] **Step 3: Add the row types and the interface method**

In `src/core/ports/repositories.go`, find:

```go
type RoundStats struct {
	RoundID     int64       `json:"round_id"`
	Leaderboard []TeamStats `json:"leaderboard"`
}
```

and add directly after it:

```go

// LeanChartTeamRow is one team of a round (a team_rounds_state row) with the
// per-team totals the lean charts read from leanTeamCTE. WIPJokeMinutes and
// InventoryJokeMinutes are the two halves of the Lean carrying cost.
type LeanChartTeamRow struct {
	TeamID               int64
	TeamName             string
	BatchesSubmitted     int
	DiscardedJokes       int
	WIPJokeMinutes       float64
	InventoryJokeMinutes float64
}

// LeanChartBatchRow is one submitted batch of the round. JokeRows is 0 for a
// batch Marketing has not split yet. Sold counts its jokes with any +1
// purchase event; FirstSoldAt is the earliest of those events (nil: none).
type LeanChartBatchRow struct {
	BatchID     int64
	TeamID      int64
	SubmittedAt time.Time
	ProcessedAt *time.Time
	JokeRows    int
	Published   int
	Sold        int
	FirstSoldAt *time.Time
}

// LeanChartJokeRow is one PUBLISHED joke of the round with its first sale.
type LeanChartJokeRow struct {
	TeamID      int64
	PublishedAt time.Time
	FirstSoldAt *time.Time
}

// LeanChartRows is everything the lean charts are built from, read in one
// snapshot. ClockEnd is the round's ended_at, or the database's now() while it
// runs — the instant the Lean costs stop at.
type LeanChartRows struct {
	ClockEnd time.Time
	Teams    []LeanChartTeamRow
	Batches  []LeanChartBatchRow
	Jokes    []LeanChartJokeRow
}
```

In the same file, find:

```go
	GetRoundStatsLean(ctx context.Context, roundID int64) (*RoundStats, error)
	GetTeamSummaryLean(ctx context.Context, roundID, teamID int64) (*TeamSummary, error)
}
```

and replace it with:

```go
	GetRoundStatsLean(ctx context.Context, roundID int64) (*RoundStats, error)
	GetTeamSummaryLean(ctx context.Context, roundID, teamID int64) (*TeamSummary, error)
	// GetLeanChartRows reads the raw rows the lean charts are built from, in
	// one read-only snapshot. An unknown round is a not-found error.
	GetLeanChartRows(ctx context.Context, roundID int64) (*LeanChartRows, error)
}
```

- [ ] **Step 4: Expose the two carrying halves in `leanTeamCTE`**

In `src/infra/repo/postgres/lean_stats_repo.go` (the SQL lines start with one tab, then spaces), find:

```
//	lean        setup_cost = batches_submitted × setup_cost_per_batch,
//	            carrying_cost = carrying_cost_per_joke_minute × (wip + inventory)
```

and replace it with:

```
//	lean        setup_cost = batches_submitted × setup_cost_per_batch,
//	            carrying_cost = carrying_cost_per_joke_minute × (wip + inventory),
//	            and wip_joke_minutes / inventory_joke_minutes, the two halves
//	            the lean charts show separately
```

Find:

```
	       c.carrying_cost_per_joke_minute
	         * (COALESCE(w.wip_joke_minutes, 0) + COALESCE(i.inventory_joke_minutes, 0)) AS carrying_cost,
```

and replace it with:

```
	       c.carrying_cost_per_joke_minute
	         * (COALESCE(w.wip_joke_minutes, 0) + COALESCE(i.inventory_joke_minutes, 0)) AS carrying_cost,
	       COALESCE(w.wip_joke_minutes, 0)            AS wip_joke_minutes,
	       COALESCE(i.inventory_joke_minutes, 0)      AS inventory_joke_minutes,
```

Find:

```
	       l.batches_submitted, l.setup_cost, l.carrying_cost,
```

and replace it with:

```
	       l.batches_submitted, l.setup_cost, l.carrying_cost,
	       l.wip_joke_minutes, l.inventory_joke_minutes,
```

`GetRoundStatsLean` and `GetTeamSummaryLean` select named columns from `profits`, so neither changes.

- [ ] **Step 5: Create the Postgres implementation**

Create `src/infra/repo/postgres/lean_charts_repo.go`:

```go
package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)

// leanChartFirstSaleCTE is each joke's earliest +1 purchase event in round $1
// (the same rule as first_sale in leanTeamCTE: a return does not undo a sale).
const leanChartFirstSaleCTE = `
WITH first_sale AS (
	SELECT joke_id, MIN(created_at) AS first_sold_at
	FROM purchase_events
	WHERE round_id = $1 AND delta > 0
	GROUP BY joke_id
)`

// leanChartTeamsSQL is one row per team_rounds_state row of round $1 with the
// totals the lean charts need, from the same CTE as the leaderboard.
const leanChartTeamsSQL = leanTeamCTE + `
SELECT team_id, team_name, batches_submitted, discarded_jokes,
       wip_joke_minutes, inventory_joke_minutes
FROM profits
ORDER BY team_id`

// leanChartBatchesSQL lists every submitted batch of round $1 with its joke
// rows, published jokes, jokes ever sold and first sale. first_sale has one
// row per joke, so the LEFT JOINs never fan a joke out.
const leanChartBatchesSQL = leanChartFirstSaleCTE + `
SELECT b.batch_id, b.team_id, b.submitted_at, b.processed_at,
       COUNT(j.joke_id)::int                                         AS joke_rows,
       (COUNT(*) FILTER (WHERE j.publish_status = 'PUBLISHED'))::int AS published,
       COUNT(fs.joke_id)::int                                        AS sold,
       MIN(fs.first_sold_at)                                         AS first_sold_at
FROM batches b
LEFT JOIN jokes j       ON j.batch_id = b.batch_id
LEFT JOIN first_sale fs ON fs.joke_id = j.joke_id
WHERE b.round_id = $1 AND b.submitted_at IS NOT NULL
GROUP BY b.batch_id
ORDER BY b.team_id, b.submitted_at, b.batch_id`

// leanChartJokesSQL lists every PUBLISHED joke of round $1 with its first sale
// (the inventory CTE's filter: discarded jokes never sit on the shelf).
const leanChartJokesSQL = leanChartFirstSaleCTE + `
SELECT b.team_id, j.published_at, fs.first_sold_at
FROM jokes j
JOIN batches b          ON b.batch_id = j.batch_id
LEFT JOIN first_sale fs ON fs.joke_id = j.joke_id
WHERE b.round_id = $1 AND j.publish_status = 'PUBLISHED' AND j.published_at IS NOT NULL
ORDER BY b.team_id, j.published_at, j.joke_id`

// GetLeanChartRows reads the lean charts' rows in one read-only REPEATABLE
// READ transaction: every query sees the same rows and the same now(), so a
// running round's clock end, idle samples and carrying minutes stop at one
// instant. Nothing is written.
func (r *Repositories) GetLeanChartRows(ctx context.Context, roundID int64) (*ports.LeanChartRows, error) {
	tx, err := r.pg.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	out := &ports.LeanChartRows{}
	err = tx.QueryRow(ctx, `SELECT COALESCE(ended_at, now()) FROM rounds WHERE round_id = $1`, roundID).Scan(&out.ClockEnd)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NewNotFoundError("round")
	}
	if err != nil {
		return nil, err
	}
	out.ClockEnd = out.ClockEnd.UTC()
	if out.Teams, err = leanChartTeams(ctx, tx, roundID); err != nil {
		return nil, err
	}
	if out.Batches, err = leanChartBatches(ctx, tx, roundID); err != nil {
		return nil, err
	}
	if out.Jokes, err = leanChartJokes(ctx, tx, roundID); err != nil {
		return nil, err
	}
	return out, nil
}

func leanChartTeams(ctx context.Context, tx pgx.Tx, roundID int64) ([]ports.LeanChartTeamRow, error) {
	rows, err := tx.Query(ctx, leanChartTeamsSQL, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ports.LeanChartTeamRow{}
	for rows.Next() {
		var t ports.LeanChartTeamRow
		if err := rows.Scan(&t.TeamID, &t.TeamName, &t.BatchesSubmitted, &t.DiscardedJokes,
			&t.WIPJokeMinutes, &t.InventoryJokeMinutes); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func leanChartBatches(ctx context.Context, tx pgx.Tx, roundID int64) ([]ports.LeanChartBatchRow, error) {
	rows, err := tx.Query(ctx, leanChartBatchesSQL, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ports.LeanChartBatchRow{}
	for rows.Next() {
		var b ports.LeanChartBatchRow
		if err := rows.Scan(&b.BatchID, &b.TeamID, &b.SubmittedAt, &b.ProcessedAt,
			&b.JokeRows, &b.Published, &b.Sold, &b.FirstSoldAt); err != nil {
			return nil, err
		}
		b.SubmittedAt = b.SubmittedAt.UTC()
		if b.ProcessedAt != nil {
			p := b.ProcessedAt.UTC()
			b.ProcessedAt = &p
		}
		if b.FirstSoldAt != nil {
			f := b.FirstSoldAt.UTC()
			b.FirstSoldAt = &f
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func leanChartJokes(ctx context.Context, tx pgx.Tx, roundID int64) ([]ports.LeanChartJokeRow, error) {
	rows, err := tx.Query(ctx, leanChartJokesSQL, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ports.LeanChartJokeRow{}
	for rows.Next() {
		var j ports.LeanChartJokeRow
		if err := rows.Scan(&j.TeamID, &j.PublishedAt, &j.FirstSoldAt); err != nil {
			return nil, err
		}
		j.PublishedAt = j.PublishedAt.UTC()
		if j.FirstSoldAt != nil {
			f := j.FirstSoldAt.UTC()
			j.FirstSoldAt = &f
		}
		out = append(out, j)
	}
	return out, rows.Err()
}
```

- [ ] **Step 6: Create the in-memory implementation**

Create `src/core/usecase/testutil/memstore_lean_charts.go`:

```go
package testutil

import (
	"context"
	"sort"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)

// GetLeanChartRows mirrors the Postgres lean-charts queries
// (infra/repo/postgres/lean_charts_repo.go): a row for every
// team_rounds_state row of the round, every submitted batch, and every
// PUBLISHED joke with its first sale. The clock is the store clock, as in
// leanStats, so the two always agree.
func (st *Store) GetLeanChartRows(ctx context.Context, roundID int64) (*ports.LeanChartRows, error) {
	rd, ok := st.Rounds[roundID]
	if !ok {
		return nil, domain.NewNotFoundError("round")
	}
	clockEnd := st.now()
	if rd.EndedAt != nil {
		clockEnd = *rd.EndedAt
	}
	minutes := func(from, to time.Time) float64 {
		d := to.Sub(from).Minutes()
		if d < 0 {
			return 0
		}
		return d
	}

	// first_sale: earliest +1 purchase event per joke.
	firstSale := make(map[int64]time.Time)
	for _, e := range st.PurchaseEvents {
		if e.RoundID != roundID || e.Delta <= 0 {
			continue
		}
		if at, ok := firstSale[e.JokeID]; !ok || e.CreatedAt.Before(at) {
			firstSale[e.JokeID] = e.CreatedAt
		}
	}

	var batches []*domain.Batch
	for _, b := range st.Batches {
		if b.RoundID == roundID && b.SubmittedAt != nil {
			batches = append(batches, b)
		}
	}
	sort.Slice(batches, func(i, j int) bool {
		bi, bj := batches[i], batches[j]
		if bi.TeamID != bj.TeamID {
			return bi.TeamID < bj.TeamID
		}
		if !bi.SubmittedAt.Equal(*bj.SubmittedAt) {
			return bi.SubmittedAt.Before(*bj.SubmittedAt)
		}
		return bi.ID < bj.ID
	})

	type acc struct {
		submitted  int
		wip, shelf float64
	}
	byTeam := make(map[int64]*acc)
	out := &ports.LeanChartRows{
		ClockEnd: clockEnd.UTC(),
		Teams:    []ports.LeanChartTeamRow{},
		Batches:  []ports.LeanChartBatchRow{},
		Jokes:    []ports.LeanChartJokeRow{},
	}
	for _, b := range batches {
		a := byTeam[b.TeamID]
		if a == nil {
			a = &acc{}
			byTeam[b.TeamID] = a
		}
		a.submitted++
		jokes := len(b.Jokes)
		if jokes == 0 {
			jokes = rd.BatchSize
		}
		row := ports.LeanChartBatchRow{
			BatchID: b.ID, TeamID: b.TeamID, SubmittedAt: b.SubmittedAt.UTC(), JokeRows: len(b.Jokes),
		}
		end := clockEnd
		if b.ProcessedAt != nil {
			end = *b.ProcessedAt
			p := b.ProcessedAt.UTC()
			row.ProcessedAt = &p
		}
		a.wip += float64(jokes) * minutes(*b.SubmittedAt, end)

		for _, j := range b.Jokes {
			sold, hasSale := firstSale[j.ID]
			if hasSale {
				row.Sold++
				if row.FirstSoldAt == nil || sold.Before(*row.FirstSoldAt) {
					s := sold.UTC()
					row.FirstSoldAt = &s
				}
			}
			if j.PublishStatus != domain.PublishPublished {
				continue
			}
			row.Published++
			if j.PublishedAt == nil {
				continue
			}
			jokeRow := ports.LeanChartJokeRow{TeamID: b.TeamID, PublishedAt: j.PublishedAt.UTC()}
			shelfEnd := clockEnd
			if hasSale {
				shelfEnd = sold
				s := sold.UTC()
				jokeRow.FirstSoldAt = &s
			}
			a.shelf += minutes(*j.PublishedAt, shelfEnd)
			out.Jokes = append(out.Jokes, jokeRow)
		}
		out.Batches = append(out.Batches, row)
	}

	for key, state := range st.TeamState {
		if key[0] != roundID {
			continue
		}
		team, err := st.GetTeam(ctx, key[1])
		if err != nil {
			continue
		}
		row := ports.LeanChartTeamRow{TeamID: team.ID, TeamName: team.Name, DiscardedJokes: state.DiscardedJokes}
		if a := byTeam[team.ID]; a != nil {
			row.BatchesSubmitted, row.WIPJokeMinutes, row.InventoryJokeMinutes = a.submitted, a.wip, a.shelf
		}
		out.Teams = append(out.Teams, row)
	}
	sort.Slice(out.Teams, func(i, j int) bool { return out.Teams[i].TeamID < out.Teams[j].TeamID })
	sort.SliceStable(out.Jokes, func(i, j int) bool {
		ji, jj := out.Jokes[i], out.Jokes[j]
		if ji.TeamID != jj.TeamID {
			return ji.TeamID < jj.TeamID
		}
		return ji.PublishedAt.Before(jj.PublishedAt)
	})
	return out, nil
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run TestMemStoreLeanChartRows -v`
Expected: PASS for all three tests.

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go build ./... && go vet ./... && go vet -tags integration ./src/infra/repo/postgres/ && go test ./...`
Expected: `gofmt -l` prints nothing; everything else passes (the existing `TestLeanStatsComputeSetupAndCarrying` still passes: the CTE change only adds columns).

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be
git add src/core/ports/repositories.go src/infra/repo/postgres/lean_stats_repo.go src/infra/repo/postgres/lean_charts_repo.go src/core/usecase/testutil/memstore_lean_charts.go src/core/usecase/lean_chart_rows_test.go
git commit -m "feat(lean): raw rows for the lean charts in one read-only snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Pure `BuildLeanCharts` (backend usecase)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Create: `src/core/usecase/lean_charts.go`
- Test: `src/core/usecase/lean_charts_test.go`

**Interfaces:**
- Consumes: `ports.LeanChartRows`, `ports.LeanChartTeamRow`, `ports.LeanChartBatchRow`, `ports.LeanChartJokeRow` (Task 1); `domain.Round` fields `ID`, `StartedAt`, `ArrivalWindowSeconds`, `WIPLimit`, `BatchSize`, `SetupCostPerBatch`, `CarryingCostPerJokeMinute`, `CostOfPublishing`, `CostOfDiscard`.
- Produces (package `usecase`):
  ```go
  const MaxLeanChartSamples = 120
  type LeanWaste struct { Setup, Waiting, Shelf, NeverSold, Discarded, Total float64 } // json: setup, waiting, shelf, never_sold, discarded, total
  type IdleSample struct { T int; Waiting, Shelf float64 }                              // json: t, waiting, shelf
  type LeanChartsBatch struct { Seq int; SentS float64; Jokes, Published, Sold int; FirstSaleS *float64 } // json: seq, sent_s, jokes, published, sold, first_sale_s
  type LeanChartsTeam struct { TeamID int64; TeamName string; Waste LeanWaste; Idle []IdleSample; Batches []LeanChartsBatch } // json: team_id, team_name, waste, idle, batches
  type SellThroughSample struct { T int; Value *float64 }                                // json: t, value
  type LeanChartsClassAverage struct { Waste LeanWaste; Idle []IdleSample; SellThrough []SellThroughSample } // json: waste, idle, sell_through
  type LeanCharts struct { RoundID int64; StartedAt *time.Time; ClockEnd time.Time; SampleSeconds int; WIPLimit int; Teams []LeanChartsTeam; ClassAverage LeanChartsClassAverage } // json: round_id, started_at, clock_end, sample_seconds, wip_limit, teams, class_average
  func LeanChartSampling(windowSeconds int, elapsed float64) (step, count int)
  func BuildLeanCharts(round *domain.Round, rows *ports.LeanChartRows) LeanCharts
  ```
  Every slice in the result is non-nil (JSON `[]`, never `null`).

- [ ] **Step 1: Write the failing tests**

Create `src/core/usecase/lean_charts_test.go`:

```go
package usecase

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)

var lcStart = time.Date(2026, 10, 6, 10, 0, 0, 0, time.UTC)

// lcAt is the round start plus s seconds.
func lcAt(s float64) time.Time { return lcStart.Add(time.Duration(s * float64(time.Second))) }

func lcAtPtr(s float64) *time.Time {
	v := lcAt(s)
	return &v
}

func lcNear(got, want float64) bool { return math.Abs(got-want) < 1e-9 }

// lcRound is a started LEAN round: window 900 s (one sample a minute), batch
// size 5, setup $3, carrying $0.02/joke-min, publishing $0.10, discard $0.01,
// WIP limit 2.
func lcRound() *domain.Round {
	start := lcStart
	return &domain.Round{
		ID: 7, MarketMode: domain.MarketLean, BatchSize: 5, MarketPrice: 1,
		CostOfPublishing: 0.10, CostOfDiscard: 0.01, SetupCostPerBatch: 3,
		CarryingCostPerJokeMinute: 0.02, ArrivalWindowSeconds: 900, WIPLimit: 2,
		StartedAt: &start,
	}
}

func TestLeanChartSampling(t *testing.T) {
	cases := []struct {
		window      int
		elapsed     float64
		step, count int
	}{
		{900, 900, 60, 16},   // t = 0..900, last sample exactly at the end
		{900, 901, 60, 17},   // first sample at or after the end is 960
		{900, 0, 60, 1},      // started this instant
		{900, -5, 60, 1},     // clock skew never gives zero samples
		{180, 180, 12, 16},   // the pilot window: one sample every 12 s
		{1, 0.5, 1, 2},       // step never below 1
		{900, 7140, 60, 120}, // exactly at the cap
		{900, 7141, 61, 119}, // past the cap: the step widens
	}
	for _, c := range cases {
		step, count := LeanChartSampling(c.window, c.elapsed)
		if step != c.step || count != c.count {
			t.Errorf("LeanChartSampling(%d, %v) = %d, %d; want %d, %d", c.window, c.elapsed, step, count, c.step, c.count)
		}
	}
	for elapsed := 0.0; elapsed < 50000; elapsed += 37.3 {
		step, count := LeanChartSampling(180, elapsed)
		if count > MaxLeanChartSamples || float64((count-1)*step) < elapsed {
			t.Fatalf("elapsed %.1f: step %d count %d does not reach the end within the cap", elapsed, step, count)
		}
	}
}

func TestBuildLeanChartsWasteMatchesTheLeaderboardFormula(t *testing.T) {
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(16 * 60),
		Teams: []ports.LeanChartTeamRow{{
			TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, DiscardedJokes: 2,
			WIPJokeMinutes: 30, InventoryJokeMinutes: 24,
		}},
		Batches: []ports.LeanChartBatchRow{{
			BatchID: 1, TeamID: 1, SubmittedAt: lcAt(0), ProcessedAt: lcAtPtr(360),
			JokeRows: 5, Published: 3, Sold: 1, FirstSoldAt: lcAtPtr(600),
		}},
		Jokes: []ports.LeanChartJokeRow{
			{TeamID: 1, PublishedAt: lcAt(360), FirstSoldAt: lcAtPtr(600)},
			{TeamID: 1, PublishedAt: lcAt(360)},
			{TeamID: 1, PublishedAt: lcAt(360)},
		},
	}
	got := BuildLeanCharts(lcRound(), rows).Teams[0].Waste
	want := LeanWaste{Setup: 3, Waiting: 0.60, Shelf: 0.48, NeverSold: 0.20, Discarded: 0.02, Total: 4.30}
	if !lcNear(got.Setup, want.Setup) || !lcNear(got.Waiting, want.Waiting) || !lcNear(got.Shelf, want.Shelf) ||
		!lcNear(got.NeverSold, want.NeverSold) || !lcNear(got.Discarded, want.Discarded) || !lcNear(got.Total, want.Total) {
		t.Fatalf("waste %+v; want %+v", got, want)
	}
	// The leaderboard's setup_cost + carrying_cost for the same rows.
	if !lcNear(got.Setup+got.Waiting+got.Shelf, 3+0.02*(30+24)) {
		t.Fatalf("setup+waiting+shelf %.4f; want the leaderboard's 4.08", got.Setup+got.Waiting+got.Shelf)
	}
}

func TestBuildLeanChartsIdleCountsAtSampleBoundaries(t *testing.T) {
	// A batch of 3 sent exactly at t=60 and released exactly at t=180; two of
	// its jokes published at 180, one of them first sold exactly at 300.
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(360),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, DiscardedJokes: 1}},
		Batches: []ports.LeanChartBatchRow{{
			BatchID: 1, TeamID: 1, SubmittedAt: lcAt(60), ProcessedAt: lcAtPtr(180),
			JokeRows: 3, Published: 2, Sold: 1, FirstSoldAt: lcAtPtr(300),
		}},
		Jokes: []ports.LeanChartJokeRow{
			{TeamID: 1, PublishedAt: lcAt(180), FirstSoldAt: lcAtPtr(300)},
			{TeamID: 1, PublishedAt: lcAt(180)},
		},
	}
	idle := BuildLeanCharts(lcRound(), rows).Teams[0].Idle
	want := []IdleSample{{0, 0, 0}, {60, 3, 0}, {120, 3, 0}, {180, 0, 2}, {240, 0, 2}, {300, 0, 1}, {360, 0, 1}}
	if len(idle) != len(want) {
		t.Fatalf("idle %+v; want %+v", idle, want)
	}
	for i := range want {
		if idle[i] != want[i] {
			t.Errorf("idle[%d] = %+v; want %+v (sent at t counts, released or sold at t does not)", i, idle[i], want[i])
		}
	}
}

// Review focus 2.
func TestBuildLeanChartsUnsplitBatchCountsBatchSize(t *testing.T) {
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(120),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, WIPJokeMinutes: 10}},
		Batches:  []ports.LeanChartBatchRow{{BatchID: 1, TeamID: 1, SubmittedAt: lcAt(0)}},
	}
	team := BuildLeanCharts(lcRound(), rows).Teams[0]
	if len(team.Idle) != 3 {
		t.Fatalf("idle %+v; want 3 samples", team.Idle)
	}
	for _, s := range team.Idle {
		if s.Waiting != 5 || s.Shelf != 0 {
			t.Fatalf("idle %+v; an unsplit batch waits as batch_size (5) jokes", team.Idle)
		}
	}
	b := team.Batches[0]
	if b.Jokes != 5 || b.Published != 0 || b.Sold != 0 || b.FirstSaleS != nil {
		t.Fatalf("batch %+v; want 5 jokes, nothing published, no sale", b)
	}
	if !lcNear(team.Waste.Waiting, 0.20) {
		t.Fatalf("waiting %.4f; want 0.02 × 10 = 0.20", team.Waste.Waiting)
	}
}

func TestBuildLeanChartsFirstSalePerBatch(t *testing.T) {
	// Given out of order on purpose: seq follows submission time.
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(300),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 2}},
		Batches: []ports.LeanChartBatchRow{
			{BatchID: 2, TeamID: 1, SubmittedAt: lcAt(200), ProcessedAt: lcAtPtr(230), JokeRows: 2, Published: 2},
			{BatchID: 1, TeamID: 1, SubmittedAt: lcAt(30), ProcessedAt: lcAtPtr(60), JokeRows: 4, Published: 4, Sold: 3, FirstSoldAt: lcAtPtr(125)},
		},
	}
	charts := BuildLeanCharts(lcRound(), rows)
	bs := charts.Teams[0].Batches
	if len(bs) != 2 {
		t.Fatalf("batches %+v", bs)
	}
	if bs[0].Seq != 1 || bs[0].SentS != 30 || bs[0].Jokes != 4 || bs[0].Sold != 3 || bs[0].FirstSaleS == nil || *bs[0].FirstSaleS != 95 {
		t.Fatalf("batch 1 %+v; want seq 1 sent at 30 s, first sale 95 s after sending", bs[0])
	}
	if bs[1].Seq != 2 || bs[1].SentS != 200 || bs[1].FirstSaleS != nil {
		t.Fatalf("batch 2 %+v; want seq 2, no sale yet", bs[1])
	}
	body, err := json.Marshal(charts)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"first_sale_s":95`) || !strings.Contains(string(body), `"first_sale_s":null`) {
		t.Fatalf("json %s", body)
	}
}

// Review focus 3.
func TestBuildLeanChartsClassAverageIncludesTeamsWithNoBatches(t *testing.T) {
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(60),
		Teams: []ports.LeanChartTeamRow{
			{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, WIPJokeMinutes: 1},
			{TeamID: 2, TeamName: "Team 2", BatchesSubmitted: 2, WIPJokeMinutes: 2},
			{TeamID: 3, TeamName: "Team 3"},
		},
		Batches: []ports.LeanChartBatchRow{
			{BatchID: 1, TeamID: 1, SubmittedAt: lcAt(0), JokeRows: 3},
			{BatchID: 2, TeamID: 2, SubmittedAt: lcAt(0)},
		},
	}
	charts := BuildLeanCharts(lcRound(), rows)
	if len(charts.Teams) != 3 {
		t.Fatalf("teams %+v", charts.Teams)
	}
	three := charts.Teams[2]
	if three.TeamID != 3 || len(three.Idle) != 2 || three.Idle[1] != (IdleSample{60, 0, 0}) || three.Batches == nil || len(three.Batches) != 0 || three.Waste.Total != 0 {
		t.Fatalf("team 3 %+v; want zero idle samples, no batches, no waste", three)
	}
	avg := charts.ClassAverage
	if !lcNear(avg.Waste.Setup, (3+6+0)/3.0) || !lcNear(avg.Waste.Waiting, (0.02+0.04+0)/3) || !lcNear(avg.Waste.Total, 3.02) {
		t.Fatalf("class average waste %+v; want setup 3, waiting 0.02, total 3.02 over all 3 teams", avg.Waste)
	}
	if len(avg.Idle) != 2 || !lcNear(avg.Idle[1].Waiting, (3+5+0)/3.0) || avg.Idle[1].T != 60 {
		t.Fatalf("class average idle %+v; want (3 + 5 + 0) / 3 waiting at t=60", avg.Idle)
	}
}

// Review focus 4: a batch with nothing published never divides by zero.
func TestBuildLeanChartsPooledSellThrough(t *testing.T) {
	// Minute 0: team 1 sends a batch, 4 published and 1 sold; team 2 one with 2
	// published and 2 sold → (1+2)/(4+2) = 0.5. Minute 1: only an unsplit batch
	// with nothing published → null. Minute 2: nothing sent → null.
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(120),
		Teams: []ports.LeanChartTeamRow{
			{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 2},
			{TeamID: 2, TeamName: "Team 2", BatchesSubmitted: 1},
		},
		Batches: []ports.LeanChartBatchRow{
			{BatchID: 1, TeamID: 1, SubmittedAt: lcAt(10), ProcessedAt: lcAtPtr(20), JokeRows: 4, Published: 4, Sold: 1, FirstSoldAt: lcAtPtr(40)},
			{BatchID: 2, TeamID: 2, SubmittedAt: lcAt(50), ProcessedAt: lcAtPtr(55), JokeRows: 2, Published: 2, Sold: 2, FirstSoldAt: lcAtPtr(58)},
			{BatchID: 3, TeamID: 1, SubmittedAt: lcAt(70)},
		},
	}
	charts := BuildLeanCharts(lcRound(), rows)
	st := charts.ClassAverage.SellThrough
	if len(st) != 3 || st[0].T != 0 || st[1].T != 60 || st[2].T != 120 {
		t.Fatalf("sell-through %+v; want samples at 0, 60, 120", st)
	}
	if st[0].Value == nil || !lcNear(*st[0].Value, 0.5) || st[1].Value != nil || st[2].Value != nil {
		t.Fatalf("sell-through values %v %v %v; want 0.5, null, null", st[0].Value, st[1].Value, st[2].Value)
	}
	body, err := json.Marshal(charts)
	if err != nil {
		t.Fatalf("marshal must not fail (NaN would): %v", err)
	}
	if !strings.Contains(string(body), `"value":null`) {
		t.Fatalf("json %s", body)
	}
}

func TestBuildLeanChartsCapsSamplesAndStillReachesClockEnd(t *testing.T) {
	round := lcRound()
	round.ArrivalWindowSeconds = 180
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(10000),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1"}},
	}
	charts := BuildLeanCharts(round, rows)
	idle := charts.Teams[0].Idle
	if len(idle) > MaxLeanChartSamples || len(charts.ClassAverage.Idle) != len(idle) || len(charts.ClassAverage.SellThrough) != len(idle) {
		t.Fatalf("%d team samples, %d class idle, %d sell-through; want equal and at most %d",
			len(idle), len(charts.ClassAverage.Idle), len(charts.ClassAverage.SellThrough), MaxLeanChartSamples)
	}
	if last := idle[len(idle)-1]; last.T < 10000 {
		t.Fatalf("last sample t=%d; must reach clock_end (10000 s)", last.T)
	}
	if charts.SampleSeconds != 85 {
		t.Fatalf("sample_seconds %d; want the widened step ceil(10000/119) = 85", charts.SampleSeconds)
	}
}

func TestBuildLeanChartsRoundNotStarted(t *testing.T) {
	round := lcRound()
	round.StartedAt = nil
	charts := BuildLeanCharts(round, &ports.LeanChartRows{
		ClockEnd: lcAt(0),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1"}},
	})
	if charts.StartedAt != nil || charts.SampleSeconds != 60 {
		t.Fatalf("started_at %v sample_seconds %d; want nil and 60", charts.StartedAt, charts.SampleSeconds)
	}
	team := charts.Teams[0]
	if team.Idle == nil || len(team.Idle) != 0 || team.Batches == nil || len(team.Batches) != 0 ||
		charts.ClassAverage.Idle == nil || len(charts.ClassAverage.Idle) != 0 ||
		charts.ClassAverage.SellThrough == nil || len(charts.ClassAverage.SellThrough) != 0 {
		t.Fatalf("a round that has not started has no samples: %+v", charts)
	}
	body, err := json.Marshal(charts)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"started_at":null`, `"idle":[]`, `"batches":[]`, `"sell_through":[]`} {
		if !strings.Contains(string(body), want) {
			t.Errorf("json lacks %s: %s", want, body)
		}
	}
	empty, err := json.Marshal(BuildLeanCharts(round, &ports.LeanChartRows{ClockEnd: lcAt(0)}))
	if err != nil || !strings.Contains(string(empty), `"teams":[]`) {
		t.Fatalf("no teams must marshal as []: %s %v", empty, err)
	}
}

// Review focus 1: ended_at is NULL, so the repository passes the database's
// now() as ClockEnd, and the samples must reach it.
func TestBuildLeanChartsRunningRoundReachesClockEnd(t *testing.T) {
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(150),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1}},
		Batches:  []ports.LeanChartBatchRow{{BatchID: 1, TeamID: 1, SubmittedAt: lcAt(100), JokeRows: 2}},
	}
	charts := BuildLeanCharts(lcRound(), rows)
	if !charts.ClockEnd.Equal(lcAt(150)) {
		t.Fatalf("clock_end %v; want %v", charts.ClockEnd, lcAt(150))
	}
	idle := charts.Teams[0].Idle
	if len(idle) != 4 || idle[3].T != 180 {
		t.Fatalf("idle %+v; want samples 0, 60, 120, 180 (the first at or after 150)", idle)
	}
	if idle[1].Waiting != 0 || idle[2].Waiting != 2 || idle[3].Waiting != 2 {
		t.Fatalf("idle %+v; the open batch waits from t=100 on", idle)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run 'TestLeanChartSampling|TestBuildLeanCharts' -v`
Expected: FAIL to compile with `undefined: BuildLeanCharts` (and `LeanChartSampling`, `LeanWaste`, `IdleSample`, `MaxLeanChartSamples`).

- [ ] **Step 3: Write the implementation**

Create `src/core/usecase/lean_charts.go`:

```go
package usecase

import (
	"math"
	"sort"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)

// MaxLeanChartSamples caps the idle and sell-through series of the lean charts.
const MaxLeanChartSamples = 120

// LeanWaste is a team's cost of waste by kind, in dollars. Setup + Waiting +
// Shelf equals the leaderboard's setup_cost + carrying_cost.
type LeanWaste struct {
	Setup     float64 `json:"setup"`
	Waiting   float64 `json:"waiting"`
	Shelf     float64 `json:"shelf"`
	NeverSold float64 `json:"never_sold"`
	Discarded float64 `json:"discarded"`
	Total     float64 `json:"total"`
}

// IdleSample counts idle jokes T seconds after the round started: waiting at
// Marketing and unsold on the shelf. Class averages are means, so fractional.
type IdleSample struct {
	T       int     `json:"t"`
	Waiting float64 `json:"waiting"`
	Shelf   float64 `json:"shelf"`
}

// LeanChartsBatch is one submitted batch. SentS is seconds from the round's
// start; FirstSaleS is seconds from the batch being sent to its first sale,
// nil (JSON null) while none of its jokes has sold.
type LeanChartsBatch struct {
	Seq        int      `json:"seq"`
	SentS      float64  `json:"sent_s"`
	Jokes      int      `json:"jokes"`
	Published  int      `json:"published"`
	Sold       int      `json:"sold"`
	FirstSaleS *float64 `json:"first_sale_s"`
}

// LeanChartsTeam is one team's lean charts.
type LeanChartsTeam struct {
	TeamID   int64             `json:"team_id"`
	TeamName string            `json:"team_name"`
	Waste    LeanWaste         `json:"waste"`
	Idle     []IdleSample      `json:"idle"`
	Batches  []LeanChartsBatch `json:"batches"`
}

// SellThroughSample is the class's pooled sell-through of the batches sent in
// [T, T+sample_seconds): Σ sold ÷ Σ published, nil when nothing was published.
type SellThroughSample struct {
	T     int      `json:"t"`
	Value *float64 `json:"value"`
}

// LeanChartsClassAverage is the anonymous class view: means over every team
// of the round (teams with no batches included) and pooled sell-through.
type LeanChartsClassAverage struct {
	Waste       LeanWaste           `json:"waste"`
	Idle        []IdleSample        `json:"idle"`
	SellThrough []SellThroughSample `json:"sell_through"`
}

// LeanCharts is the body of GET .../lean-charts. Every time is seconds from
// StartedAt; a round that has not started has no samples and no batches.
type LeanCharts struct {
	RoundID       int64                  `json:"round_id"`
	StartedAt     *time.Time             `json:"started_at"`
	ClockEnd      time.Time              `json:"clock_end"`
	SampleSeconds int                    `json:"sample_seconds"`
	WIPLimit      int                    `json:"wip_limit"`
	Teams         []LeanChartsTeam       `json:"teams"`
	ClassAverage  LeanChartsClassAverage `json:"class_average"`
}

// LeanChartSampling returns the sample step in seconds and the number of
// samples for a round with this arrival window whose clock has run for
// elapsed seconds. The step is max(1, round(window / 15)); samples run t = 0,
// step, 2·step, … up to and including the first at or after elapsed. When that
// would exceed MaxLeanChartSamples the step widens so the last sample still
// reaches elapsed: keeping the first 120 would hide the end of a long round.
func LeanChartSampling(windowSeconds int, elapsed float64) (step, count int) {
	step = int(math.Round(float64(windowSeconds) / 15))
	if step < 1 {
		step = 1
	}
	if elapsed < 0 {
		elapsed = 0
	}
	count = int(math.Ceil(elapsed/float64(step))) + 1
	if count > MaxLeanChartSamples {
		step = int(math.Ceil(elapsed / float64(MaxLeanChartSamples-1)))
		count = int(math.Ceil(elapsed/float64(step))) + 1
	}
	return step, count
}

// BuildLeanCharts turns one snapshot of a round's rows into the lean-charts
// body. It is pure; every rule of the lean charts lives here:
//
//	waste      setup = batches_submitted × setup_cost_per_batch,
//	           waiting = rate × WIP joke-minutes, shelf = rate × inventory
//	           joke-minutes, never_sold = cost_of_publishing × published jokes
//	           never sold, discarded = cost_of_discard × discarded jokes
//	idle(t)    waiting = Σ jokes of batches with submitted ≤ t < processed;
//	           shelf = published jokes with published ≤ t < first sale
//	jokes      a batch's joke rows, or batch_size while it is unsplit
//	average    mean over every team row; sell-through pooled per sample
func BuildLeanCharts(round *domain.Round, rows *ports.LeanChartRows) LeanCharts {
	out := LeanCharts{
		RoundID:  round.ID,
		ClockEnd: rows.ClockEnd.UTC(),
		WIPLimit: round.WIPLimit,
		Teams:    []LeanChartsTeam{},
		ClassAverage: LeanChartsClassAverage{
			Idle:        []IdleSample{},
			SellThrough: []SellThroughSample{},
		},
	}
	step, count := LeanChartSampling(round.ArrivalWindowSeconds, 0)
	var sec func(time.Time) float64
	if round.StartedAt != nil {
		start := round.StartedAt.UTC()
		out.StartedAt = &start
		sec = func(at time.Time) float64 { return at.Sub(start).Seconds() }
		step, count = LeanChartSampling(round.ArrivalWindowSeconds, sec(rows.ClockEnd))
	} else {
		count = 0
	}
	out.SampleSeconds = step

	jokesIn := func(b ports.LeanChartBatchRow) int {
		if b.JokeRows > 0 {
			return b.JokeRows
		}
		return round.BatchSize
	}
	batchesOf := make(map[int64][]ports.LeanChartBatchRow)
	for _, b := range rows.Batches {
		batchesOf[b.TeamID] = append(batchesOf[b.TeamID], b)
	}
	jokesOf := make(map[int64][]ports.LeanChartJokeRow)
	for _, j := range rows.Jokes {
		jokesOf[j.TeamID] = append(jokesOf[j.TeamID], j)
	}

	teams := append([]ports.LeanChartTeamRow(nil), rows.Teams...)
	sort.Slice(teams, func(i, j int) bool { return teams[i].TeamID < teams[j].TeamID })
	for _, tr := range teams {
		batches := batchesOf[tr.TeamID]
		sort.SliceStable(batches, func(i, j int) bool {
			if !batches[i].SubmittedAt.Equal(batches[j].SubmittedAt) {
				return batches[i].SubmittedAt.Before(batches[j].SubmittedAt)
			}
			return batches[i].BatchID < batches[j].BatchID
		})
		jokes := jokesOf[tr.TeamID]
		team := LeanChartsTeam{
			TeamID:   tr.TeamID,
			TeamName: tr.TeamName,
			Waste:    teamWaste(round, tr, jokes),
			Idle:     []IdleSample{},
			Batches:  []LeanChartsBatch{},
		}
		if sec != nil {
			for k := 0; k < count; k++ {
				team.Idle = append(team.Idle, idleAt(k*step, batches, jokes, sec, jokesIn))
			}
			for i, b := range batches {
				p := LeanChartsBatch{
					Seq: i + 1, SentS: sec(b.SubmittedAt), Jokes: jokesIn(b),
					Published: b.Published, Sold: b.Sold,
				}
				if b.FirstSoldAt != nil {
					v := b.FirstSoldAt.Sub(b.SubmittedAt).Seconds()
					p.FirstSaleS = &v
				}
				team.Batches = append(team.Batches, p)
			}
		}
		out.Teams = append(out.Teams, team)
	}

	out.ClassAverage.Waste = averageWaste(out.Teams)
	for k := 0; k < count; k++ {
		out.ClassAverage.Idle = append(out.ClassAverage.Idle, averageIdle(out.Teams, k, k*step))
	}
	if sec != nil {
		out.ClassAverage.SellThrough = pooledSellThrough(rows.Batches, sec, step, count)
	}
	return out
}

func teamWaste(round *domain.Round, tr ports.LeanChartTeamRow, jokes []ports.LeanChartJokeRow) LeanWaste {
	neverSold := 0
	for _, j := range jokes {
		if j.FirstSoldAt == nil {
			neverSold++
		}
	}
	w := LeanWaste{
		Setup:     float64(tr.BatchesSubmitted) * round.SetupCostPerBatch,
		Waiting:   round.CarryingCostPerJokeMinute * tr.WIPJokeMinutes,
		Shelf:     round.CarryingCostPerJokeMinute * tr.InventoryJokeMinutes,
		NeverSold: round.CostOfPublishing * float64(neverSold),
		Discarded: round.CostOfDiscard * float64(tr.DiscardedJokes),
	}
	w.Total = w.Setup + w.Waiting + w.Shelf + w.NeverSold + w.Discarded
	return w
}

// idleAt counts, t seconds after the start, the jokes waiting at Marketing
// (submitted ≤ t < processed) and the published jokes unsold on the shelf
// (published ≤ t < first sale). An interval that never closed stays open.
func idleAt(
	t int,
	batches []ports.LeanChartBatchRow,
	jokes []ports.LeanChartJokeRow,
	sec func(time.Time) float64,
	jokesIn func(ports.LeanChartBatchRow) int,
) IdleSample {
	at := float64(t)
	s := IdleSample{T: t}
	for _, b := range batches {
		if sec(b.SubmittedAt) <= at && (b.ProcessedAt == nil || at < sec(*b.ProcessedAt)) {
			s.Waiting += float64(jokesIn(b))
		}
	}
	for _, j := range jokes {
		if sec(j.PublishedAt) <= at && (j.FirstSoldAt == nil || at < sec(*j.FirstSoldAt)) {
			s.Shelf++
		}
	}
	return s
}

func averageWaste(teams []LeanChartsTeam) LeanWaste {
	var w LeanWaste
	if len(teams) == 0 {
		return w
	}
	for _, t := range teams {
		w.Setup += t.Waste.Setup
		w.Waiting += t.Waste.Waiting
		w.Shelf += t.Waste.Shelf
		w.NeverSold += t.Waste.NeverSold
		w.Discarded += t.Waste.Discarded
	}
	n := float64(len(teams))
	w.Setup /= n
	w.Waiting /= n
	w.Shelf /= n
	w.NeverSold /= n
	w.Discarded /= n
	w.Total = w.Setup + w.Waiting + w.Shelf + w.NeverSold + w.Discarded
	return w
}

func averageIdle(teams []LeanChartsTeam, k, t int) IdleSample {
	s := IdleSample{T: t}
	if len(teams) == 0 {
		return s
	}
	for _, team := range teams {
		s.Waiting += team.Idle[k].Waiting
		s.Shelf += team.Idle[k].Shelf
	}
	n := float64(len(teams))
	s.Waiting /= n
	s.Shelf /= n
	return s
}

// pooledSellThrough pools every team's batches by the sample interval they
// were sent in: Σ sold ÷ Σ published, nil where nothing was published.
func pooledSellThrough(batches []ports.LeanChartBatchRow, sec func(time.Time) float64, step, count int) []SellThroughSample {
	sold := make([]int, count)
	published := make([]int, count)
	for _, b := range batches {
		k := int(math.Floor(sec(b.SubmittedAt) / float64(step)))
		if k < 0 {
			k = 0
		}
		if k >= count {
			k = count - 1
		}
		sold[k] += b.Sold
		published[k] += b.Published
	}
	out := make([]SellThroughSample, 0, count)
	for k := 0; k < count; k++ {
		s := SellThroughSample{T: k * step}
		if published[k] > 0 {
			v := float64(sold[k]) / float64(published[k])
			s.Value = &v
		}
		out = append(out, s)
	}
	return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run 'TestLeanChartSampling|TestBuildLeanCharts' -v`
Expected: PASS for all ten tests.

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go vet ./... && go test ./...`
Expected: `gofmt -l` prints nothing; all packages pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be
git add src/core/usecase/lean_charts.go src/core/usecase/lean_charts_test.go
git commit -m "feat(lean): build the lean charts from one snapshot of rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Service methods, handlers, routes and 409 NOT_LEAN_ROUND (backend)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Modify: `src/core/usecase/stats.go` (imports at :3-9; append after `serveArrivals` at :72-79)
- Modify: `src/core/usecase/instructor.go:370-372` (after `Stats`)
- Modify: `src/core/usecase/round.go:32-35` (after `TeamSummary`)
- Modify: `src/app/http/handler/instructor.go` (after `Stats` at :269-285)
- Modify: `src/app/http/handler/round.go` (append after `TeamSummary`)
- Modify: `src/app/server/server.go:132` and `:163`
- Test: `src/core/usecase/lean_charts_service_test.go`, `src/app/server/lean_charts_routes_test.go`

**Interfaces:**
- Consumes: `BuildLeanCharts`, `LeanCharts`, `LeanChartsTeam`, `IdleSample`, `LeanChartsBatch` (Task 2); `ports.Store.GetLeanChartRows` (Task 1); `StatsService.serveArrivals`; `ports.Store.GetRoundByID`, `GetTeam`.
- Produces:
  ```go
  func (s *StatsService) GetLeanCharts(ctx context.Context, roundID int64) (*LeanCharts, error)
  func (s *StatsService) GetTeamLeanCharts(ctx context.Context, roundID, teamID int64) (*LeanCharts, error)
  func (s *InstructorService) LeanCharts(ctx context.Context, roundID int64) (*LeanCharts, error)
  func (s *RoundService) TeamLeanCharts(ctx context.Context, roundID, teamID int64) (*LeanCharts, error)
  func (h *InstructorHandler) LeanCharts(c *gin.Context)   // GET /v1/instructor/rounds/:round_id/lean-charts (instructor auth)
  func (h *RoundHandler) TeamLeanCharts(c *gin.Context)    // GET /v1/rounds/:round_id/teams/:team_id/lean-charts (no auth)
  const notLeanRoundCode = "NOT_LEAN_ROUND"                // usecase, unexported
  ```
  Wire contract: 200 `{"data": LeanCharts}`; Classic round 409 `{"error":{"code":"CONFLICT","message":"conflict: NOT_LEAN_ROUND: lean charts exist only for LEAN rounds"}}`; unknown round or team 404; non-numeric id 400.

- [ ] **Step 1: Write the failing service tests**

Create `src/core/usecase/lean_charts_service_test.go`:

```go
package usecase

import (
	"context"
	"log/slog"
	"math"
	"strings"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
)

// The headline promise, through the service: waste setup + waiting + shelf
// equals the leaderboard's setup + carrying at the same instant.
func TestStatsServiceLeanChartsAgreeWithTheLeaderboard(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	round, teamID := seedLeanStatsFixture(t, st)
	now := round.StartedAt.Add(16 * time.Minute)
	st.Now = func() time.Time { return now }
	svc := NewStatsService(st, slog.Default())
	approx := func(got, want float64) bool { return math.Abs(got-want) < 0.005 }

	charts, err := svc.GetLeanCharts(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	stats, err := svc.GetRoundStats(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(charts.Teams) != 1 || charts.Teams[0].TeamID != teamID {
		t.Fatalf("teams %+v", charts.Teams)
	}
	w := charts.Teams[0].Waste
	lean := stats.Leaderboard[0].Lean
	if !approx(w.Setup+w.Waiting+w.Shelf, lean.SetupCost+lean.CarryingCost) {
		t.Fatalf("charts setup+waiting+shelf %.4f; leaderboard setup+carrying %.4f", w.Setup+w.Waiting+w.Shelf, lean.SetupCost+lean.CarryingCost)
	}
	// 2 published jokes never sold, 2 discarded.
	if !approx(w.NeverSold, 0.20) || !approx(w.Discarded, 0.02) {
		t.Fatalf("waste %+v", w)
	}
	// Default window 900 s → one sample a minute; 16 minutes → 17 samples.
	if charts.RoundID != round.ID || charts.StartedAt == nil || charts.SampleSeconds != 60 || len(charts.Teams[0].Idle) != 17 {
		t.Fatalf("round %d started %v step %d samples %d", charts.RoundID, charts.StartedAt, charts.SampleSeconds, len(charts.Teams[0].Idle))
	}
}

func TestStatsServiceLeanChartsRefuseAClassicRound(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	round, teamID := seedLeanStatsFixture(t, st)
	st.Rounds[round.ID].MarketMode = domain.MarketClassic
	svc := NewStatsService(st, slog.Default())
	for name, call := range map[string]func() error{
		"instructor": func() error { _, err := svc.GetLeanCharts(ctx, round.ID); return err },
		"team":       func() error { _, err := svc.GetTeamLeanCharts(ctx, round.ID, teamID); return err },
	} {
		err := call()
		if !domain.IsConflict(err) || !strings.Contains(err.Error(), notLeanRoundCode) {
			t.Fatalf("%s: want a %s conflict, got %v", name, notLeanRoundCode, err)
		}
	}
}

func TestStatsServiceLeanChartsUnknownRoundIsNotFound(t *testing.T) {
	_, err := NewStatsService(testutil.NewStore(), slog.Default()).GetLeanCharts(context.Background(), 99)
	if !domain.IsNotFound(err) {
		t.Fatalf("want not found, got %v", err)
	}
}

// Review focus 3: the team route returns exactly one team — a zero row for a
// team with nothing (or no row) in the round — and the class average of all.
func TestStatsServiceTeamLeanChartsReturnOnlyThatTeam(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	round, teamID := seedLeanStatsFixture(t, st)
	// Team 2 plays the round but sends nothing; team 3 exists but has no row in it yet.
	st.Teams = append(st.Teams, domain.Team{ID: 2, Name: "Team 2"}, domain.Team{ID: 3, Name: "Team 3"})
	if err := st.EnsureTeamRoundState(ctx, round.ID, 2); err != nil {
		t.Fatal(err)
	}
	now := round.StartedAt.Add(16 * time.Minute)
	st.Now = func() time.Time { return now }
	svc := NewStatsService(st, slog.Default())

	full, err := svc.GetLeanCharts(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(full.Teams) != 2 {
		t.Fatalf("instructor view teams %+v; want teams %d and 2", full.Teams, teamID)
	}
	two, err := svc.GetTeamLeanCharts(ctx, round.ID, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(two.Teams) != 1 || two.Teams[0].TeamID != 2 || two.Teams[0].Waste.Total != 0 {
		t.Fatalf("team 2 view %+v; want only team 2, with no waste", two.Teams)
	}
	if math.Abs(two.ClassAverage.Waste.Total-full.ClassAverage.Waste.Total) > 1e-9 {
		t.Fatalf("class average %.4f; want the instructor view's %.4f", two.ClassAverage.Waste.Total, full.ClassAverage.Waste.Total)
	}
	three, err := svc.GetTeamLeanCharts(ctx, round.ID, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(three.Teams) != 1 || three.Teams[0].TeamID != 3 || three.Teams[0].TeamName != "Team 3" ||
		len(three.Teams[0].Idle) != len(three.ClassAverage.Idle) || len(three.Teams[0].Batches) != 0 {
		t.Fatalf("team 3 view %+v; want a zero row with one idle sample per class sample", three.Teams)
	}
	for i, s := range three.Teams[0].Idle {
		if s.T != three.ClassAverage.Idle[i].T || s.Waiting != 0 || s.Shelf != 0 {
			t.Fatalf("team 3 idle %+v", three.Teams[0].Idle)
		}
	}
	if _, err := svc.GetTeamLeanCharts(ctx, round.ID, 99); !domain.IsNotFound(err) {
		t.Fatalf("unknown team: want not found, got %v", err)
	}
}
```

- [ ] **Step 2: Write the failing route tests**

Create `src/app/server/lean_charts_routes_test.go`:

```go
package server_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"jokefactory/src/app/server"
	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
	"jokefactory/src/infra/config"
)

// leanChartsStore seeds two started rounds on two teams: round 1 LEAN with one
// batch from team 1, round 2 CLASSIC. It returns the store and an instructor id.
func leanChartsStore(t *testing.T) (*testutil.Store, int64) {
	t.Helper()
	ctx := context.Background()
	st := testutil.NewStore()
	st.Teams = []domain.Team{{ID: 1, Name: "Team 1"}, {ID: 2, Name: "Team 2"}}
	lean := domain.DefaultRoundConfig()
	lean.MarketMode = domain.MarketLean
	lean.SetupCostPerBatch = 2
	lean.CarryingCostPerJokeMinute = 0.05
	if _, err := st.InsertRoundConfig(ctx, 1, &lean); err != nil {
		t.Fatal(err)
	}
	classic := domain.DefaultRoundConfig()
	if _, err := st.InsertRoundConfig(ctx, 2, &classic); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{1, 2} {
		if _, err := st.StartRound(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.CreateBatch(ctx, 1, 1, []string{"a joke", "another joke"}, ""); err != nil {
		t.Fatal(err)
	}
	u, err := st.CreateUser(ctx, "Instructor")
	if err != nil {
		t.Fatal(err)
	}
	role := domain.RoleInstructor
	if err := st.UpdateUserAssignment(ctx, u.ID, &role, nil); err != nil {
		t.Fatal(err)
	}
	return st, u.ID
}

func leanChartsGet(t *testing.T, h http.Handler, path string, userID int64) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if userID != 0 {
		req.Header.Set("X-User-Id", strconv.FormatInt(userID, 10))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: %v\n%s", path, err, rec.Body.String())
	}
	return rec.Code, body
}

func TestLeanChartsRoutes(t *testing.T) {
	st, instructor := leanChartsStore(t)
	h := server.New(&config.Config{}, slog.New(slog.NewTextHandler(io.Discard, nil)), st, nil, nil).Router()

	if code, _ := leanChartsGet(t, h, "/v1/instructor/rounds/1/lean-charts", 0); code != http.StatusUnauthorized {
		t.Fatalf("instructor route without X-User-Id: %d; want 401", code)
	}
	code, body := leanChartsGet(t, h, "/v1/instructor/rounds/1/lean-charts", instructor)
	if code != http.StatusOK {
		t.Fatalf("instructor route: %d %v", code, body)
	}
	data := body["data"].(map[string]any)
	if teams := data["teams"].([]any); len(teams) != 2 || data["round_id"].(float64) != 1 {
		t.Fatalf("instructor route data %v; want round 1 with both teams", data)
	}

	code, body = leanChartsGet(t, h, "/v1/rounds/1/teams/2/lean-charts", 0)
	if code != http.StatusOK {
		t.Fatalf("team route: %d %v", code, body)
	}
	teams := body["data"].(map[string]any)["teams"].([]any)
	if len(teams) != 1 || teams[0].(map[string]any)["team_id"].(float64) != 2 {
		t.Fatalf("team route teams %v; want exactly team 2", teams)
	}

	for _, path := range []string{"/v1/instructor/rounds/2/lean-charts", "/v1/rounds/2/teams/1/lean-charts"} {
		code, body = leanChartsGet(t, h, path, instructor)
		e := body["error"].(map[string]any)
		if code != http.StatusConflict || e["code"] != "CONFLICT" || !strings.Contains(e["message"].(string), "NOT_LEAN_ROUND") {
			t.Fatalf("%s on a Classic round: %d %v; want 409 CONFLICT NOT_LEAN_ROUND", path, code, body)
		}
	}
	for _, path := range []string{"/v1/instructor/rounds/99/lean-charts", "/v1/rounds/99/teams/1/lean-charts", "/v1/rounds/1/teams/99/lean-charts"} {
		if code, body = leanChartsGet(t, h, path, instructor); code != http.StatusNotFound {
			t.Fatalf("%s: %d %v; want 404", path, code, body)
		}
	}
	for _, path := range []string{"/v1/instructor/rounds/x/lean-charts", "/v1/rounds/1/teams/x/lean-charts"} {
		if code, body = leanChartsGet(t, h, path, instructor); code != http.StatusBadRequest {
			t.Fatalf("%s: %d %v; want 400", path, code, body)
		}
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run 'TestStatsServiceLeanCharts|TestStatsServiceTeamLeanCharts' -v`
Expected: FAIL to compile with `svc.GetLeanCharts undefined` and `undefined: notLeanRoundCode`.

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/app/server/ -run TestLeanChartsRoutes -v`
Expected: FAIL — the instructor route answers 404 (route not registered) instead of 401.

- [ ] **Step 4: Add the service methods**

In `src/core/usecase/stats.go`, replace the import block:

```go
import (
	"context"
	"log/slog"
	"time"

	"jokefactory/src/core/ports"
)
```

with:

```go
import (
	"context"
	"log/slog"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)
```

Then find:

```go
// arrivalServer converts a possibly-nil *AICustomerService into an
```

and insert directly before it:

```go
// notLeanRoundCode starts the 409 message for lean charts of a CLASSIC round;
// the frontend matches on it (services/leanCharts.ts isNotLeanRound), as it
// does for MARKET_MODE_LOCKED and WIP_LIMIT_REACHED.
const notLeanRoundCode = "NOT_LEAN_ROUND"

func errNotLeanRound() error {
	return domain.NewConflictError(notLeanRoundCode + ": lean charts exist only for LEAN rounds")
}

// GetLeanCharts returns the lean charts of a LEAN round for every team. A
// CLASSIC round is a NOT_LEAN_ROUND conflict (409) and an unknown round a
// not-found error (404). Due Lean customers are served first, as on every
// stats read, so the charts agree with the leaderboard.
func (s *StatsService) GetLeanCharts(ctx context.Context, roundID int64) (*LeanCharts, error) {
	round, err := s.leanRound(ctx, roundID)
	if err != nil {
		return nil, err
	}
	s.serveArrivals(ctx, roundID)
	rows, err := s.repo.GetLeanChartRows(ctx, roundID)
	if err != nil {
		return nil, err
	}
	charts := BuildLeanCharts(round, rows)
	return &charts, nil
}

// GetTeamLeanCharts is GetLeanCharts for one team's screen: that team's row
// and the class average, never another team's row. A team with no row in the
// round yet gets an all-zero row; an unknown team is a not-found error.
func (s *StatsService) GetTeamLeanCharts(ctx context.Context, roundID, teamID int64) (*LeanCharts, error) {
	charts, err := s.GetLeanCharts(ctx, roundID)
	if err != nil {
		return nil, err
	}
	for _, t := range charts.Teams {
		if t.TeamID == teamID {
			charts.Teams = []LeanChartsTeam{t}
			return charts, nil
		}
	}
	team, err := s.repo.GetTeam(ctx, teamID)
	if err != nil {
		return nil, err
	}
	zero := LeanChartsTeam{
		TeamID: team.ID, TeamName: team.Name,
		Idle:    make([]IdleSample, 0, len(charts.ClassAverage.Idle)),
		Batches: []LeanChartsBatch{},
	}
	for _, a := range charts.ClassAverage.Idle {
		zero.Idle = append(zero.Idle, IdleSample{T: a.T})
	}
	charts.Teams = []LeanChartsTeam{zero}
	return charts, nil
}

// leanRound loads a round for the lean charts: not-found passes through, a
// CLASSIC round is a NOT_LEAN_ROUND conflict.
func (s *StatsService) leanRound(ctx context.Context, roundID int64) (*domain.Round, error) {
	round, err := s.repo.GetRoundByID(ctx, roundID)
	if err != nil {
		return nil, err
	}
	if round == nil {
		return nil, domain.NewNotFoundError("round")
	}
	if !round.MarketMode.IsLean() {
		return nil, errNotLeanRound()
	}
	return round, nil
}

```

In `src/core/usecase/instructor.go`, find:

```go
func (s *InstructorService) Stats(ctx context.Context, roundID int64) (*ports.RoundStats, error) {
	return s.stats.GetRoundStats(ctx, roundID)
}
```

and add after it:

```go

// LeanCharts returns the lean charts of a LEAN round, every team.
func (s *InstructorService) LeanCharts(ctx context.Context, roundID int64) (*LeanCharts, error) {
	return s.stats.GetLeanCharts(ctx, roundID)
}
```

In `src/core/usecase/round.go`, find:

```go
func (s *RoundService) TeamSummary(ctx context.Context, roundID, teamID int64) (*ports.TeamSummary, error) {
	return s.stats.GetTeamSummary(ctx, roundID, teamID)
}
```

and add after it:

```go

// TeamLeanCharts returns one team's lean charts plus the class average.
func (s *RoundService) TeamLeanCharts(ctx context.Context, roundID, teamID int64) (*LeanCharts, error) {
	return s.stats.GetTeamLeanCharts(ctx, roundID, teamID)
}
```

- [ ] **Step 5: Add the handlers and routes**

In `src/app/http/handler/instructor.go`, find:

```go
	response.OK(c, gin.H{
		"round_id":    stats.RoundID,
		"leaderboard": stats.Leaderboard,
	})
}
```

and add after it:

```go

// LeanCharts serves GET /v1/instructor/rounds/:round_id/lean-charts: every
// team's lean charts and the class average. 409 NOT_LEAN_ROUND for a CLASSIC
// round, 404 for an unknown one.
func (h *InstructorHandler) LeanCharts(c *gin.Context) {
	roundID, err := strconv.ParseInt(c.Param("round_id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid round id", middleware.GetRequestID(c))
		return
	}
	charts, err := h.instructorService.LeanCharts(c.Request.Context(), roundID)
	if err != nil {
		_ = c.Error(err)
		response.FromDomainError(c, err, middleware.GetRequestID(c))
		return
	}
	response.OK(c, charts)
}
```

In `src/app/http/handler/round.go`, append at the end of the file:

```go

// TeamLeanCharts serves GET /v1/rounds/:round_id/teams/:team_id/lean-charts:
// that team's lean charts and the anonymous class average, never another
// team's rows. Same access as TeamSummary. 409 NOT_LEAN_ROUND for a CLASSIC
// round; 404 for an unknown round or team.
func (h *RoundHandler) TeamLeanCharts(c *gin.Context) {
	roundID, err := strconv.ParseInt(c.Param("round_id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid round id", middleware.GetRequestID(c))
		return
	}
	teamID, err := strconv.ParseInt(c.Param("team_id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid team id", middleware.GetRequestID(c))
		return
	}
	charts, err := h.roundService.TeamLeanCharts(c.Request.Context(), roundID, teamID)
	if err != nil {
		_ = c.Error(err)
		response.FromDomainError(c, err, middleware.GetRequestID(c))
		return
	}
	response.OK(c, charts)
}
```

In `src/app/server/server.go`, find:

```go
		v1.GET("/rounds/:round_id/teams/:team_id/summary", s.roundHandler.TeamSummary)
```

and replace it with:

```go
		v1.GET("/rounds/:round_id/teams/:team_id/summary", s.roundHandler.TeamSummary)
		v1.GET("/rounds/:round_id/teams/:team_id/lean-charts", s.roundHandler.TeamLeanCharts)
```

Find:

```go
		instructor.GET("/instructor/rounds/:round_id/stats", s.instructorHandler.Stats)
```

and replace it with:

```go
		instructor.GET("/instructor/rounds/:round_id/stats", s.instructorHandler.Stats)
		instructor.GET("/instructor/rounds/:round_id/lean-charts", s.instructorHandler.LeanCharts)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run 'TestStatsServiceLeanCharts|TestStatsServiceTeamLeanCharts' -v && go test ./src/app/server/ -run TestLeanChartsRoutes -v`
Expected: PASS (4 service tests, 1 route test).

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go build ./... && go vet ./... && go test ./...`
Expected: `gofmt -l` prints nothing; everything passes.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be
git add src/core/usecase/stats.go src/core/usecase/instructor.go src/core/usecase/round.go src/core/usecase/lean_charts_service_test.go src/app/http/handler/instructor.go src/app/http/handler/round.go src/app/server/server.go src/app/server/lean_charts_routes_test.go
git commit -m "feat(lean): serve the lean charts on an instructor route and a team route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Integration test against real Postgres (backend)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Test: `src/infra/repo/postgres/lean_charts_integration_test.go` (build tag `integration`)

**Interfaces:**
- Consumes: `(*Repositories).GetLeanChartRows`, `GetRoundStatsLean`, `GetRoundByID` (Task 1, existing); `usecase.BuildLeanCharts`, `usecase.LeanCharts`, `usecase.LeanChartsTeam`, `usecase.LeanWaste` (Task 2); `handler.NewInstructorHandler(...).LeanCharts`, `handler.NewRoundHandler(...).TeamLeanCharts`, `usecase.NewInstructorService(repo, nil, log)`, `usecase.NewRoundService(repo, log)` (Task 3).
- Produces: no code; proves the SQL rows agree with the leaderboard to the cent.

The local stack must be running (Postgres on :55432, already migrated; this plan adds no migration). If it is not: `cd ~/Documents/GitHub/jokefactory_be && APP_LLM_MODE=hash APP_LLM_HASH_CONFIRM=local-pilot-only docker compose -f docker-compose.yml -f /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean/compose.override.yml up -d --build`.

- [ ] **Step 1: Write the integration test**

Create `src/infra/repo/postgres/lean_charts_integration_test.go`:

```go
//go:build integration

// Lean charts SQL against a real Postgres. Run with
//
//	JF_TEST_DATABASE_URL=postgres://… go test -count=1 -tags integration ./src/infra/repo/postgres/
//
// The database must already be migrated; the test applies nothing. It inserts
// its own rounds and uniquely named teams and deletes them afterwards.
package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"jokefactory/src/app/http/handler"
	"jokefactory/src/core/usecase"
	"jokefactory/src/infra/db"
)

// Fixture (round ENDED 10:00–10:30, arrival window 900 s so one sample a
// minute, WIP limit 2, setup $3, carrying $0.02/joke-min, batch size 5,
// publishing $0.10, discard $0.01) — the lean stats fixture:
//
//	Team A: batch of 5 sent 10:00, released 10:06, 3 published / 2 discarded.
//	        Joke 1 bought 10:10 and returned 10:12; joke 2 bought 10:20 and
//	        10:25; joke 3 never sold. Leaderboard: setup 3, carrying 1.44.
//	        Waste: setup 3, waiting 0.60 (30 joke-min), shelf 0.84 (42),
//	        never sold 0.10 (joke 3), discarded 0.02; total 4.56.
//	Team B: unsplit batch sent 10:20, still waiting. Leaderboard: setup 3,
//	        carrying 1.00. Waste: setup 3, waiting 1.00 (5 × 10 min); total 4.00.
//	Team C: nothing. All zeros.
//
// Plus a running LEAN round (ended_at NULL) and an ENDED CLASSIC round.
func TestLeanChartsSQLIntegration(t *testing.T) {
	dsn := os.Getenv("JF_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("JF_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Registered first so it runs last: the data cleanup below needs the pool.
	t.Cleanup(pool.Close)
	repo := New(&db.Postgres{Pool: pool}, slog.Default())

	base := time.Date(2026, 10, 6, 10, 0, 0, 0, time.UTC)
	at := func(min int) time.Time { return base.Add(time.Duration(min) * time.Minute) }
	suffix := fmt.Sprintf("lean-charts-it-%d", time.Now().UnixNano())
	approx := func(got, want float64) bool { return math.Abs(got-want) < 0.005 }

	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
	}
	mustID := func(q string, args ...any) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(ctx, q, args...).Scan(&id); err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
		return id
	}

	var rounds, teams []int64
	t.Cleanup(func() {
		// Deleting the rounds and teams cascades to every row the test made.
		for _, id := range rounds {
			if _, err := pool.Exec(ctx, `DELETE FROM rounds WHERE round_id = $1`, id); err != nil {
				t.Errorf("cleanup round %d: %v", id, err)
			}
		}
		for _, id := range teams {
			if _, err := pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, id); err != nil {
				t.Errorf("cleanup team %d: %v", id, err)
			}
		}
	})

	// Explicit ids above each table's maximum, so the test never depends on
	// (or advances) the id sequences.
	nextID := func(table, col string) int64 {
		t.Helper()
		return mustID(`SELECT COALESCE(MAX(` + col + `), 0) + 1000 FROM ` + table)
	}
	newRound := func(mode, status string, startedAt, endedAt any) int64 {
		t.Helper()
		id := mustID(`
			INSERT INTO rounds (round_id, round_number, status, batch_size, market_price, cost_of_publishing, cost_of_discard,
			                    market_mode, arrival_window_seconds, setup_cost_per_batch, carrying_cost_per_joke_minute,
			                    wip_limit, started_at, ended_at)
			VALUES ($1, 999, $2::text::round_status, 5, 1, 0.10, 0.01, $3, 900, 3, 0.02, 2, $4, $5)
			RETURNING round_id`, nextID("rounds", "round_id"), status, mode, startedAt, endedAt)
		rounds = append(rounds, id)
		return id
	}
	team := func(name string) int64 {
		t.Helper()
		id := mustID(`INSERT INTO teams (id, name) VALUES ($1, $2) RETURNING id`, nextID("teams", "id"), suffix+name)
		teams = append(teams, id)
		return id
	}
	submitEvent := func(roundID, teamID, batchID int64, jokes, delta int, created time.Time) {
		t.Helper()
		mustExec(`
			INSERT INTO batch_submission_events (event_id, round_id, team_id, batch_id, jokes_count, delta, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			nextID("batch_submission_events", "event_id"), roundID, teamID, batchID, jokes, delta, created)
	}

	// ---- The ENDED charts round -------------------------------------------
	chartsRound := newRound("LEAN", "ENDED", at(0), at(30))
	teamA, teamB, teamC := team("-A"), team("-B"), team("-C")
	mustExec(`
		INSERT INTO team_rounds_state (round_id, team_id, points_earned, batches_created, batches_processed, published_jokes, discarded_jokes)
		VALUES ($1, $2, 2, 1, 1, 3, 2), ($1, $3, 0, 1, 0, 0, 0), ($1, $4, 0, 0, 0, 0, 0)`,
		chartsRound, teamA, teamB, teamC)

	batchA := mustID(`
		INSERT INTO batches (batch_id, round_id, team_id, status, submitted_at, processed_at)
		VALUES ($1, $2, $3, 'PROCESSED', $4, $5) RETURNING batch_id`,
		nextID("batches", "batch_id"), chartsRound, teamA, at(0), at(6))
	var jokes [5]int64
	for i := range jokes {
		if i < 3 {
			jokes[i] = mustID(`
				INSERT INTO jokes (joke_id, batch_id, joke_text, joke_title, publish_status, published_at)
				VALUES ($1, $2, 'j', 't', 'PUBLISHED', $3) RETURNING joke_id`, nextID("jokes", "joke_id"), batchA, at(6))
		} else {
			jokes[i] = mustID(`
				INSERT INTO jokes (joke_id, batch_id, joke_text, publish_status)
				VALUES ($1, $2, 'j', 'DISCARDED') RETURNING joke_id`, nextID("jokes", "joke_id"), batchA)
		}
	}
	submitEvent(chartsRound, teamA, batchA, 5, 1, at(0))
	submitEvent(chartsRound, teamA, batchA, 5, -1, at(6))

	batchB := mustID(`
		INSERT INTO batches (batch_id, round_id, team_id, status, submitted_at, raw_text, raw_text_original)
		VALUES ($1, $2, $3, 'SUBMITTED', $4, 'a', 'a') RETURNING batch_id`,
		nextID("batches", "batch_id"), chartsRound, teamB, at(20))
	submitEvent(chartsRound, teamB, batchB, 0, 1, at(20))

	cust := func() int64 {
		return mustID(`
			INSERT INTO ai_customers (ai_customer_id, round_id, personal_threshold, starting_budget, remaining_budget)
			VALUES ($1, $2, 7, 3, 2) RETURNING ai_customer_id`, nextID("ai_customers", "ai_customer_id"), chartsRound)
	}
	c1, c2, c3 := cust(), cust(), cust()
	purchaseEvent := func(custID, jokeID int64, delta int, created time.Time) {
		t.Helper()
		mustExec(`
			INSERT INTO purchase_events (event_id, round_id, ai_customer_id, joke_id, team_id, delta, price, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, 1, $7)`,
			nextID("purchase_events", "event_id"), chartsRound, custID, jokeID, teamA, delta, created)
	}
	purchaseEvent(c1, jokes[0], 1, at(10))
	purchaseEvent(c1, jokes[0], -1, at(12))
	purchaseEvent(c2, jokes[1], 1, at(20))
	purchaseEvent(c3, jokes[1], 1, at(25))
	for _, h := range []struct {
		cust int64
		at   time.Time
	}{{c2, at(20)}, {c3, at(25)}} {
		mustExec(`
			INSERT INTO purchases (purchase_id, round_id, ai_customer_id, joke_id, team_id, price, created_at)
			VALUES ($1, $2, $3, $4, $5, 1, $6)`,
			nextID("purchases", "purchase_id"), chartsRound, h.cust, jokes[1], teamA, h.at)
	}

	round, err := repo.GetRoundByID(ctx, chartsRound)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := repo.GetLeanChartRows(ctx, chartsRound)
	if err != nil {
		t.Fatal(err)
	}
	charts := usecase.BuildLeanCharts(round, rows)
	stats, err := repo.GetRoundStatsLean(ctx, chartsRound)
	if err != nil {
		t.Fatal(err)
	}
	if len(charts.Teams) != 3 || len(stats.Leaderboard) != 3 {
		t.Fatalf("charts %d teams, leaderboard %d rows; want 3 and 3", len(charts.Teams), len(stats.Leaderboard))
	}
	byTeam := map[int64]usecase.LeanChartsTeam{}
	for _, tm := range charts.Teams {
		byTeam[tm.TeamID] = tm
	}

	// The headline promise: setup + waiting + shelf == leaderboard setup + carrying.
	for _, row := range stats.Leaderboard {
		w := byTeam[row.Team.ID].Waste
		if !approx(w.Setup+w.Waiting+w.Shelf, row.Lean.SetupCost+row.Lean.CarryingCost) {
			t.Errorf("team %d: charts setup+waiting+shelf %.4f; leaderboard setup+carrying %.4f",
				row.Team.ID, w.Setup+w.Waiting+w.Shelf, row.Lean.SetupCost+row.Lean.CarryingCost)
		}
	}
	wantWaste := map[int64]usecase.LeanWaste{
		teamA: {Setup: 3, Waiting: 0.60, Shelf: 0.84, NeverSold: 0.10, Discarded: 0.02, Total: 4.56},
		teamB: {Setup: 3, Waiting: 1.00, Total: 4.00},
		teamC: {},
	}
	for id, want := range wantWaste {
		got := byTeam[id].Waste
		if !approx(got.Setup, want.Setup) || !approx(got.Waiting, want.Waiting) || !approx(got.Shelf, want.Shelf) ||
			!approx(got.NeverSold, want.NeverSold) || !approx(got.Discarded, want.Discarded) || !approx(got.Total, want.Total) {
			t.Errorf("team %d waste %+v; want %+v", id, got, want)
		}
	}

	a := byTeam[teamA].Batches
	if len(a) != 1 || a[0].Seq != 1 || a[0].SentS != 0 || a[0].Jokes != 5 || a[0].Published != 3 || a[0].Sold != 2 ||
		a[0].FirstSaleS == nil || !approx(*a[0].FirstSaleS, 600) {
		t.Errorf("team A batches %+v; want 5 jokes, 3 published, 2 sold, first sale after 600 s", a)
	}
	b := byTeam[teamB].Batches
	if len(b) != 1 || b[0].SentS != 1200 || b[0].Jokes != 5 || b[0].Published != 0 || b[0].FirstSaleS != nil {
		t.Errorf("team B batches %+v; want the unsplit batch counted as 5 jokes, no sale", b)
	}

	if charts.SampleSeconds != 60 || charts.WIPLimit != 2 || len(byTeam[teamA].Idle) != 31 {
		t.Fatalf("sample_seconds %d wip_limit %d samples %d; want 60, 2, 31", charts.SampleSeconds, charts.WIPLimit, len(byTeam[teamA].Idle))
	}
	idleA, idleB := byTeam[teamA].Idle, byTeam[teamB].Idle
	for _, c := range []struct {
		k              int
		waiting, shelf float64
	}{{0, 5, 0}, {6, 0, 3}, {10, 0, 2}, {20, 0, 1}, {30, 0, 1}} {
		if got := idleA[c.k]; got.T != c.k*60 || got.Waiting != c.waiting || got.Shelf != c.shelf {
			t.Errorf("team A idle[%d] = %+v; want waiting %v shelf %v", c.k, got, c.waiting, c.shelf)
		}
	}
	if idleB[19].Waiting != 0 || idleB[20].Waiting != 5 {
		t.Errorf("team B waiting at minutes 19, 20 = %v, %v; want 0, 5", idleB[19].Waiting, idleB[20].Waiting)
	}
	sell := charts.ClassAverage.SellThrough
	if sell[0].Value == nil || !approx(*sell[0].Value, 2.0/3) || sell[20].Value != nil {
		t.Errorf("class sell-through at minutes 0 and 20: %v, %v; want 2/3 and null", sell[0].Value, sell[20].Value)
	}
	if !approx(charts.ClassAverage.Waste.Total, (4.56+4.00)/3) {
		t.Errorf("class average total %.4f; want (4.56 + 4.00 + 0) / 3", charts.ClassAverage.Waste.Total)
	}

	// ---- Review focus 1: a running round (ended_at NULL, clock_end = now()) --
	// Status CONFIGURED keeps the single-ACTIVE-round index free; the charts
	// only read started_at and ended_at.
	running := newRound("LEAN", "CONFIGURED", nil, nil)
	mustExec(`UPDATE rounds SET started_at = now() - interval '10 minutes' WHERE round_id = $1`, running)
	mustExec(`
		INSERT INTO team_rounds_state (round_id, team_id, points_earned, batches_created, batches_processed, published_jokes, discarded_jokes)
		VALUES ($1, $2, 0, 1, 0, 0, 0)`, running, teamA)
	runBatch := mustID(`
		INSERT INTO batches (batch_id, round_id, team_id, status, submitted_at)
		VALUES ($1, $2, $3, 'SUBMITTED', now() - interval '8 minutes') RETURNING batch_id`,
		nextID("batches", "batch_id"), running, teamA)
	for i := 0; i < 2; i++ {
		mustExec(`INSERT INTO jokes (joke_id, batch_id, joke_text, publish_status) VALUES ($1, $2, 'j', 'PENDING')`,
			nextID("jokes", "joke_id"), runBatch)
	}
	mustExec(`
		INSERT INTO batch_submission_events (event_id, round_id, team_id, batch_id, jokes_count, delta, created_at)
		VALUES ($1, $2, $3, $4, 2, 1, now() - interval '8 minutes')`,
		nextID("batch_submission_events", "event_id"), running, teamA, runBatch)

	runRound, err := repo.GetRoundByID(ctx, running)
	if err != nil {
		t.Fatal(err)
	}
	runRows, err := repo.GetLeanChartRows(ctx, running)
	if err != nil {
		t.Fatal(err)
	}
	runCharts := usecase.BuildLeanCharts(runRound, runRows)
	runStats, err := repo.GetRoundStatsLean(ctx, running)
	if err != nil {
		t.Fatal(err)
	}
	rw, rl := runCharts.Teams[0].Waste, runStats.Leaderboard[0].Lean
	// Two reads, two now()s milliseconds apart: they agree within a cent.
	if math.Abs(rw.Setup+rw.Waiting+rw.Shelf-(rl.SetupCost+rl.CarryingCost)) > 0.01 || math.Abs(rw.Waiting-0.02*2*8) > 0.01 {
		t.Errorf("running round: charts %+v vs leaderboard setup %.4f carrying %.4f; want waiting ≈ 0.32", rw, rl.SetupCost, rl.CarryingCost)
	}
	if d := time.Since(runCharts.ClockEnd); d < -5*time.Second || d > 5*time.Second {
		t.Errorf("running round clock_end %v is not now", runCharts.ClockEnd)
	}
	runIdle := runCharts.Teams[0].Idle
	last := runIdle[len(runIdle)-1]
	if elapsed := runCharts.ClockEnd.Sub(*runCharts.StartedAt).Seconds(); float64(last.T) < elapsed || last.Waiting != 2 {
		t.Errorf("running round last sample %+v; want t ≥ %.0f with the 2 waiting jokes", last, elapsed)
	}

	// ---- HTTP: Classic round → 409; team route → exactly one team ----------
	classic := newRound("CLASSIC", "ENDED", at(0), at(30))
	mustExec(`
		INSERT INTO team_rounds_state (round_id, team_id, points_earned, batches_created, batches_processed, published_jokes, discarded_jokes)
		VALUES ($1, $2, 0, 0, 0, 0, 0)`, classic, teamA)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	log := slog.Default()
	router.GET("/v1/instructor/rounds/:round_id/lean-charts",
		handler.NewInstructorHandler(usecase.NewInstructorService(repo, nil, log)).LeanCharts)
	router.GET("/v1/rounds/:round_id/teams/:team_id/lean-charts",
		handler.NewRoundHandler(usecase.NewRoundService(repo, log)).TeamLeanCharts)
	call := func(path string) (int, string) {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec.Code, rec.Body.String()
	}

	if code, body := call(fmt.Sprintf("/v1/instructor/rounds/%d/lean-charts", classic)); code != http.StatusConflict || !strings.Contains(body, "NOT_LEAN_ROUND") {
		t.Errorf("classic round: %d %s; want 409 NOT_LEAN_ROUND", code, body)
	}
	code, body := call(fmt.Sprintf("/v1/rounds/%d/teams/%d/lean-charts", chartsRound, teamB))
	if code != http.StatusOK {
		t.Fatalf("team route: %d %s", code, body)
	}
	var env struct {
		Data usecase.LeanCharts `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &env); err != nil {
		t.Fatal(err)
	}
	if len(env.Data.Teams) != 1 || env.Data.Teams[0].TeamID != teamB {
		t.Errorf("team route teams %+v; want exactly team B", env.Data.Teams)
	}
	if !approx(env.Data.ClassAverage.Waste.Total, (4.56+4.00)/3) {
		t.Errorf("team route class average %.4f; want every team's mean", env.Data.ClassAverage.Waste.Total)
	}
}
```

- [ ] **Step 2: Run it**

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" go test -count=1 -tags integration ./src/infra/repo/postgres/ -run TestLeanChartsSQLIntegration -v`
Expected: PASS. Tasks 1–3 are already in, so this test passes on first run; it is the gate that the SQL matches the in-memory store. If it fails, the failure message names the team and field — fix `lean_charts_repo.go` or `leanTeamCTE`, never the expectations.

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" go test -count=1 -tags integration ./src/infra/repo/postgres/ -v`
Expected: PASS for both `TestLeanStatsSQLIntegration` (unchanged) and `TestLeanChartsSQLIntegration`.

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go vet -tags integration ./src/infra/repo/postgres/`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be
git add src/infra/repo/postgres/lean_charts_integration_test.go
git commit -m "test(lean): lean charts agree with the leaderboard against real Postgres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Frontend types, API calls and pure transforms

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Modify: `types/api.ts` (endpoint index at :102-125; insert after `RoundStatsResponse` at :1049-1052)
- Modify: `services/api/team.ts`, `services/api/instructor.ts`
- Modify: `services/api/contract.test.ts` (imports at :1-15; append at end of file)
- Create: `services/leanCharts.ts`, `services/leanCharts.testdata.ts`
- Test: `services/leanCharts.test.ts`

**Interfaces:**
- Consumes: wire shape of Task 3.
- Produces:
  ```ts
  // types/api.ts
  interface LeanWaste { setup; waiting; shelf; never_sold; discarded; total: number }
  interface LeanIdleSample { t: number; waiting: number; shelf: number }
  interface LeanChartsBatch { seq; sent_s; jokes; published; sold: number; first_sale_s: number | null }
  interface LeanChartsTeam { team_id: number; team_name: string; waste: LeanWaste; idle: LeanIdleSample[]; batches: LeanChartsBatch[] }
  interface LeanSellThroughSample { t: number; value: number | null }
  interface LeanChartsClassAverage { waste: LeanWaste; idle: LeanIdleSample[]; sell_through: LeanSellThroughSample[] }
  interface LeanChartsResponse { round_id; started_at: string | null; clock_end: string; sample_seconds; wip_limit; teams: LeanChartsTeam[]; class_average: LeanChartsClassAverage }
  // services/api
  teamApi.leanCharts(roundId: number, teamId: number): Promise<LeanChartsResponse>
  instructorApi.leanCharts(roundId: number): Promise<LeanChartsResponse>
  // services/leanCharts.ts
  LEAN_CHART_COLORS, LEAN_CHARTS_POLL_MS (10_000), LEAN_CHARTS_FAILURE_LIMIT (3), NOT_LEAN_ROUND_MESSAGE,
  LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, NO_RELEASES_TEXT, WASTE_SEGMENTS
  isNotLeanRound(e: unknown): boolean
  roundColor(round: 1 | 2): string
  teamLabel(teamId: number, fallback: string, teamNames?: Record<string, string>): string
  fmtMinutes(minutes: number): string; fmtMinuteTick(minute: number): string
  leanRoundFlags(r1Rows, r2Rows, currentRound: 1 | 2, currentMarketMode: string): { 1: boolean; 2: boolean }
  leanRound1Id(rounds): number | null
  teamOptions(r1, r2, teamNames?): Array<{ id: number; name: string }>
  wasteBars(res, teamNames?): WasteBarRow[]; hasWaste(rows): boolean
  idleRows(team, avg): IdleRow[]; hasIdle(rows): boolean; defaultIdleTeamId(res): number | null; idleSubtitle(wipLimit: number): string
  integerTicks(max: number): number[]
  batchScatter(sources: { 1: LeanChartsResponse | null; 2: LeanChartsResponse | null }, teamFilter: number | null, teamNames?): BatchScatter
  batchSellThrough(team): CyclesPoint[]; classSellThrough(avg): CyclesPoint[]
  cyclesForInstructor(r1, r2, teamFilter: number | null, teamNames?): CyclesModel
  cyclesForStudent(current, round: 1 | 2, earlier): CyclesModel
  types WasteBarRow, WasteSegmentKey, IdleRow, BatchScatterPoint, BatchScatter, CyclesPoint, CyclesSeries, CyclesModel
  // services/leanCharts.testdata.ts
  leanChartsFixture(over?: Partial<LeanChartsResponse>): LeanChartsResponse
  ```

- [ ] **Step 1: Add the wire types (types only — needed for the failing tests to compile their fixtures)**

In `types/api.ts`, find:

```
     GET    /v1/rounds/{rid}/market                       MarketResponse
```

and replace it with:

```
     GET    /v1/rounds/{rid}/market                       MarketResponse
     GET    /v1/rounds/{rid}/teams/{tid}/lean-charts      LeanChartsResponse
```

Find:

```
     GET    /v1/instructor/rounds/{rid}/stats             RoundStatsResponse
```

and replace it with:

```
     GET    /v1/instructor/rounds/{rid}/stats             RoundStatsResponse
     GET    /v1/instructor/rounds/{rid}/lean-charts       LeanChartsResponse
```

Find:

```ts
export interface RoundStatsResponse {
  round_id: number;
  leaderboard: TeamStats[];
}
```

and add directly after it:

```ts

// ---- Lean charts -------------------------------------------------------------

/**
 * Lean charts — LEAN rounds only. Every time is in seconds from `started_at`.
 *   GET /v1/instructor/rounds/{rid}/lean-charts    — wrapped; every team + class average
 *   GET /v1/rounds/{rid}/teams/{tid}/lean-charts   — wrapped; that team only + class average
 * A CLASSIC round answers 409 CONFLICT whose message contains "NOT_LEAN_ROUND"
 * (services/leanCharts.ts isNotLeanRound); an unknown round or team answers 404.
 * Built by jokefactory_be core/usecase/lean_charts.go (BuildLeanCharts).
 */
export interface LeanWaste {
  setup: number;
  waiting: number;
  shelf: number;
  never_sold: number;
  discarded: number;
  total: number;
}

/** Idle jokes at `t`. Counts for a team; means (fractions) in class_average. */
export interface LeanIdleSample {
  t: number;
  waiting: number;
  shelf: number;
}

export interface LeanChartsBatch {
  seq: number;
  sent_s: number;
  /** Joke rows, or the round's batch_size while Marketing has not split it. */
  jokes: number;
  published: number;
  sold: number;
  /** Seconds from sending to the first sale; null while none of its jokes sold. */
  first_sale_s: number | null;
}

export interface LeanChartsTeam {
  team_id: number;
  team_name: string;
  waste: LeanWaste;
  idle: LeanIdleSample[];
  batches: LeanChartsBatch[];
}

/** Pooled sell-through of the batches sent in [t, t + sample_seconds); null when nothing was published. */
export interface LeanSellThroughSample {
  t: number;
  value: number | null;
}

export interface LeanChartsClassAverage {
  waste: LeanWaste;
  idle: LeanIdleSample[];
  sell_through: LeanSellThroughSample[];
}

export interface LeanChartsResponse {
  round_id: number;
  /** null while the round has not started (then there are no samples). */
  started_at: string | null;
  clock_end: string;
  sample_seconds: number;
  wip_limit: number;
  teams: LeanChartsTeam[];
  class_average: LeanChartsClassAverage;
}
```

- [ ] **Step 2: Create the shared test fixture**

Create `services/leanCharts.testdata.ts`:

```ts
/* A typed lean-charts response shared by the frontend tests
   (services/leanCharts.test.ts, services/useLeanCharts.test.ts,
   components/leanCharts/*.test.ts). One sample a minute over three minutes:
     Team 1 — batch 1: 5 jokes sent at 10 s, 4 published, 2 sold, first sale after 95 s;
              batch 2: 3 jokes sent at 130 s, nothing published.
     Team 2 — batch 1: 5 jokes sent at 20 s, all 5 published and sold, first sale after 30 s.
     Team 3 — nothing. */
import type { LeanChartsResponse, LeanWaste } from '../types/api';

const zeroWaste: LeanWaste = { setup: 0, waiting: 0, shelf: 0, never_sold: 0, discarded: 0, total: 0 };

export function leanChartsFixture(over: Partial<LeanChartsResponse> = {}): LeanChartsResponse {
  return {
    round_id: 7,
    started_at: '2026-10-06T10:00:00Z',
    clock_end: '2026-10-06T10:03:00Z',
    sample_seconds: 60,
    wip_limit: 2,
    teams: [
      {
        team_id: 1, team_name: 'Team 1',
        waste: { setup: 4, waiting: 1, shelf: 2, never_sold: 0.5, discarded: 0.02, total: 7.52 },
        idle: [
          { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 5, shelf: 0 },
          { t: 120, waiting: 0, shelf: 3 }, { t: 180, waiting: 0, shelf: 2 },
        ],
        batches: [
          { seq: 1, sent_s: 10, jokes: 5, published: 4, sold: 2, first_sale_s: 95 },
          { seq: 2, sent_s: 130, jokes: 3, published: 0, sold: 0, first_sale_s: null },
        ],
      },
      {
        team_id: 2, team_name: 'Team 2',
        waste: { setup: 8, waiting: 3, shelf: 1, never_sold: 1, discarded: 0, total: 13 },
        idle: [
          { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 0, shelf: 0 },
          { t: 120, waiting: 2, shelf: 4 }, { t: 180, waiting: 5, shelf: 1 },
        ],
        batches: [{ seq: 1, sent_s: 20, jokes: 5, published: 5, sold: 5, first_sale_s: 30 }],
      },
      {
        team_id: 3, team_name: 'Team 3',
        waste: { ...zeroWaste },
        idle: [
          { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 0, shelf: 0 },
          { t: 120, waiting: 0, shelf: 0 }, { t: 180, waiting: 0, shelf: 0 },
        ],
        batches: [],
      },
    ],
    class_average: {
      waste: { setup: 4, waiting: 4 / 3, shelf: 1, never_sold: 0.5, discarded: 0.02 / 3, total: 20.52 / 3 },
      idle: [
        { t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 5 / 3, shelf: 0 },
        { t: 120, waiting: 2 / 3, shelf: 7 / 3 }, { t: 180, waiting: 5 / 3, shelf: 1 },
      ],
      sell_through: [
        { t: 0, value: 7 / 9 }, { t: 60, value: null }, { t: 120, value: null }, { t: 180, value: null },
      ],
    },
    ...over,
  };
}
```

- [ ] **Step 3: Write the failing tests**

Create `services/leanCharts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  LEAN_CHART_COLORS, NO_BATCHES_TEXT, NO_RELEASES_TEXT,
  batchScatter, batchSellThrough, classSellThrough, cyclesForInstructor, cyclesForStudent,
  defaultIdleTeamId, hasIdle, hasWaste, idleRows, idleSubtitle, integerTicks, isNotLeanRound,
  leanRound1Id, leanRoundFlags, teamOptions, wasteBars,
} from './leanCharts';
import { leanChartsFixture } from './leanCharts.testdata';
import type { LeanChartsResponse } from '../types/api';

const res = leanChartsFixture();
const avg = res.class_average;

describe('colours', () => {
  it('match the spec table exactly', () => {
    expect(LEAN_CHART_COLORS).toEqual({
      setup: '#2563eb', waiting: '#7c3aed', shelf: '#d97706', neverSold: '#e11d48', discarded: '#94a3b8',
      round1: '#3B82F6', round2: '#F97316', classAverage: '#64748b',
    });
  });
});

describe('isNotLeanRound', () => {
  it('is true only for a 409 whose message names NOT_LEAN_ROUND', () => {
    expect(isNotLeanRound({ status: 409, message: 'conflict: NOT_LEAN_ROUND: lean charts exist only for LEAN rounds' })).toBe(true);
    expect(isNotLeanRound({ status: 409, message: 'WIP_LIMIT_REACHED' })).toBe(false);
    expect(isNotLeanRound({ status: 500, message: 'NOT_LEAN_ROUND' })).toBe(false);
    expect(isNotLeanRound(null)).toBe(false);
  });
});

describe('leanRoundFlags', () => {
  it('follows the stats rows when there are any', () => {
    expect(leanRoundFlags([{ lean: {} }], [{ lean: undefined }], 1, 'CLASSIC')).toEqual({ 1: true, 2: false });
    // Rows without lean win over a config that says LEAN.
    expect(leanRoundFlags([{ lean: undefined }], [], 1, 'LEAN')).toEqual({ 1: false, 2: false });
  });
  it('falls back to the current round config before stats arrive', () => {
    expect(leanRoundFlags(undefined, [], 1, 'LEAN')).toEqual({ 1: true, 2: false });
    expect(leanRoundFlags([], null, 2, 'LEAN')).toEqual({ 1: false, 2: true });
    expect(leanRoundFlags([], [], 2, 'CLASSIC')).toEqual({ 1: false, 2: false });
  });
});

describe('leanRound1Id', () => {
  it('finds Round 1 only when it was Lean', () => {
    expect(leanRound1Id([{ id: 4, round_number: 1, market_mode: 'LEAN' }, { id: 5, round_number: 2, market_mode: 'LEAN' }])).toBe(4);
    expect(leanRound1Id([{ id: 4, round_number: 1, market_mode: 'CLASSIC' }])).toBeNull();
    expect(leanRound1Id([{ id: 4, round_number: 1 }])).toBeNull();
    expect(leanRound1Id(undefined)).toBeNull();
  });
});

describe('teamOptions', () => {
  it('unions both rounds by id, applies renames, sorts by id', () => {
    const r2 = leanChartsFixture({ teams: [...res.teams, { ...res.teams[2], team_id: 4, team_name: 'Team 4' }] });
    expect(teamOptions(res, r2, { '2': 'Zebras' })).toEqual([
      { id: 1, name: 'Team 1' }, { id: 2, name: 'Zebras' }, { id: 3, name: 'Team 3' }, { id: 4, name: 'Team 4' },
    ]);
    expect(teamOptions(null, null)).toEqual([]);
  });
});

describe('wasteBars (chart 1)', () => {
  it('sorts by total waste, most first, and keeps teams with no waste', () => {
    const rows = wasteBars(res, { '1': 'Punchliners' });
    expect(rows.map(r => r.teamId)).toEqual([2, 1, 3]);
    expect(rows[1]).toEqual({ teamId: 1, team: 'Punchliners', setup: 4, waiting: 1, shelf: 2, neverSold: 0.5, discarded: 0.02, total: 7.52 });
    expect(rows[2].total).toBe(0);
    expect(hasWaste(rows)).toBe(true);
  });
  it('is empty without data, and an all-zero class has no waste to draw', () => {
    expect(wasteBars(null)).toEqual([]);
    expect(hasWaste(wasteBars(leanChartsFixture({ teams: [res.teams[2]] })))).toBe(false);
  });
});

describe('idleRows (chart 2)', () => {
  it('pairs the team with the class-average total, per minute', () => {
    const rows = idleRows(res.teams[0], avg);
    expect(rows.map(r => r.minute)).toEqual([0, 1, 2, 3]);
    expect(rows[1]).toEqual({ minute: 1, waiting: 5, shelf: 0, classAverage: 5 / 3 });
    expect(rows[2].classAverage).toBeCloseTo(3);
    expect(hasIdle(rows)).toBe(true);
  });
  it('draws the class average alone when no team is picked', () => {
    const rows = idleRows(null, avg);
    expect(rows[1].waiting).toBe(0);
    expect(rows[1].classAverage).toBeCloseTo(5 / 3);
  });
  it('has nothing to draw before the round starts', () => {
    expect(hasIdle(idleRows(null, { ...avg, idle: [] }))).toBe(false);
  });
});

describe('defaultIdleTeamId', () => {
  it('picks the team with the most idle jokes at the latest sample', () => {
    expect(defaultIdleTeamId(res)).toBe(2); // team 1: 0 + 2, team 2: 5 + 1
  });
  it('breaks ties by the lowest team id', () => {
    const tied = leanChartsFixture();
    tied.teams[0].idle[3] = { t: 180, waiting: 6, shelf: 0 };
    expect(defaultIdleTeamId(tied)).toBe(1);
  });
  it('handles no teams and no samples', () => {
    expect(defaultIdleTeamId(null)).toBeNull();
    expect(defaultIdleTeamId(leanChartsFixture({ teams: [] }))).toBeNull();
    const notStarted = leanChartsFixture();
    notStarted.teams.forEach(t => { t.idle = []; });
    expect(defaultIdleTeamId(notStarted)).toBe(1);
  });
});

describe('idleSubtitle', () => {
  const base = 'Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste.';
  it('states the WIP limit only when there is one', () => {
    expect(idleSubtitle(0)).toBe(base);
    expect(idleSubtitle(2)).toBe(`${base} WIP limit: 2 batches`);
    expect(idleSubtitle(1)).toBe(`${base} WIP limit: 1 batch`);
  });
});

describe('batchScatter (chart 3)', () => {
  it('puts unsold batches in the band above the axis, hollow', () => {
    const s = batchScatter({ 1: res, 2: null }, null);
    expect(s.r1).toHaveLength(3);
    expect(s.r2).toHaveLength(0);
    expect(s.yMax).toBe(2); // 95 s = 1.58 min, rounded up
    expect(s.yTicks).toEqual([0, 1, 2]);
    const unsold = s.r1.find(p => p.noSale)!;
    expect(unsold.teamId).toBe(1);
    expect(unsold.minutes).toBeNull();
    expect(unsold.y).toBeGreaterThan(s.bandFrom);
    expect(unsold.y).toBeLessThan(s.bandTo);
    expect(s.bandFrom).toBeGreaterThan(s.yMax);
  });
  it('jitters points with the same batch size apart, and leaves a lone one centred', () => {
    const s = batchScatter({ 1: res, 2: null }, null);
    const fives = s.r1.filter(p => p.jokes === 5).sort((a, b) => a.x - b.x);
    expect(fives.map(p => p.teamId)).toEqual([1, 2]);
    expect(fives[0].x).toBeCloseTo(4.7);
    expect(fives[1].x).toBeCloseTo(5.3);
    expect(s.r1.find(p => p.jokes === 3)!.x).toBe(3);
    expect(fives[0].y).toBeCloseTo(95 / 60);
    expect(s.xMax).toBe(5);
  });
  it('narrows to one team and overlays Round 2', () => {
    expect(batchScatter({ 1: res, 2: null }, 2, {}).r1).toHaveLength(1);
    const both = batchScatter({ 1: res, 2: leanChartsFixture({ round_id: 8 }) }, null, { '1': 'Punchliners' });
    expect(both.r2).toHaveLength(3);
    expect(both.r2.every(p => p.round === 2)).toBe(true);
    expect(both.r1.find(p => p.teamId === 1)!.team).toBe('Punchliners');
  });
  it('is empty without data', () => {
    const s = batchScatter({ 1: null, 2: null }, null);
    expect(s.r1.length + s.r2.length).toBe(0);
    expect(s.yMax).toBe(1);
  });
});

describe('integerTicks', () => {
  it('counts by one up to five, then by about a fifth', () => {
    expect(integerTicks(2)).toEqual([0, 1, 2]);
    expect(integerTicks(12)).toEqual([0, 3, 6, 9, 12]);
  });
});

describe('sell-through (chart 4)', () => {
  it('skips batches with nothing published', () => {
    expect(batchSellThrough(res.teams[0])).toEqual([{ minute: 10 / 60, rate: 0.5, label: 'Batch 1: 2 of 4 sold' }]);
    expect(batchSellThrough(null)).toEqual([]);
  });
  it('drops class samples with no value', () => {
    const pts = classSellThrough(avg);
    expect(pts).toHaveLength(1);
    expect(pts[0].minute).toBe(0);
    expect(pts[0].rate).toBeCloseTo(7 / 9);
  });
});

describe('cyclesForInstructor', () => {
  it('shows the class line per round by default', () => {
    const m = cyclesForInstructor(res, null, null);
    expect(m.series.map(s => s.key)).toEqual(['r1-class']);
    expect(m.series[0].color).toBe(LEAN_CHART_COLORS.round1);
    expect(m.series[0].dashed).toBe(false);
    expect(m.emptyText).toBeNull();
  });
  it("shows a picked team's batches in both rounds", () => {
    const m = cyclesForInstructor(res, leanChartsFixture({ round_id: 8 }), 2, { '2': 'Zebras' });
    expect(m.series.map(s => s.key)).toEqual(['r1-team', 'r2-team']);
    expect(m.series[1].name).toBe('Round 2 · Zebras');
    expect(m.series[1].color).toBe(LEAN_CHART_COLORS.round2);
    expect(m.series[1].round).toBe(2);
    expect(m.series[0].points).toHaveLength(1);
  });
  it('says why it is empty', () => {
    const noBatches: LeanChartsResponse = leanChartsFixture({
      teams: res.teams.map(t => ({ ...t, batches: [] })),
      class_average: { ...avg, sell_through: avg.sell_through.map(s => ({ ...s, value: null })) },
    });
    expect(cyclesForInstructor(noBatches, null, null).emptyText).toBe(NO_BATCHES_TEXT);
    const unreleased: LeanChartsResponse = leanChartsFixture({
      teams: [{ ...res.teams[0], batches: [res.teams[0].batches[1]] }],
      class_average: { ...avg, sell_through: avg.sell_through.map(s => ({ ...s, value: null })) },
    });
    expect(cyclesForInstructor(unreleased, null, null).emptyText).toBe(NO_RELEASES_TEXT);
    expect(cyclesForInstructor(null, null, null).emptyText).toBe(NO_BATCHES_TEXT);
  });
});

describe('cyclesForStudent', () => {
  const current = leanChartsFixture({ round_id: 8, teams: [res.teams[0]] });
  const earlier = leanChartsFixture({ teams: [res.teams[1]] });
  it('in Round 2: faded Round 1 batches, own batches in orange, dashed class average', () => {
    const m = cyclesForStudent(current, 2, earlier);
    expect(m.series.map(s => s.key)).toEqual(['earlier', 'mine', 'class']);
    expect(m.series[0]).toMatchObject({ faded: true, color: LEAN_CHART_COLORS.round1, round: 1 });
    expect(m.series[1]).toMatchObject({ faded: false, color: LEAN_CHART_COLORS.round2, round: 2, markers: true });
    expect(m.series[2]).toMatchObject({ dashed: true, markers: false, color: LEAN_CHART_COLORS.classAverage });
  });
  it('in Round 1: no earlier round, own batches in blue', () => {
    const m = cyclesForStudent(current, 1, earlier);
    expect(m.series.map(s => s.key)).toEqual(['mine', 'class']);
    expect(m.series[0].color).toBe(LEAN_CHART_COLORS.round1);
  });
});
```

Then append to `services/api/contract.test.ts`. First, in its imports find:

```ts
  RoundStatsResponse, AdminResetResponse, ApiErrorBody, IdealDimension,
} from '../../types/api';
```

and replace it with:

```ts
  RoundStatsResponse, AdminResetResponse, ApiErrorBody, IdealDimension,
  LeanChartsResponse,
} from '../../types/api';
import { isNotLeanRound } from '../leanCharts';
```

Then append at the very end of the file:

```ts

// ---- lean charts -------------------------------------------------------------

/** core/usecase/lean_charts.go LeanCharts, served through response.OK by
 *  InstructorHandler.LeanCharts and RoundHandler.TeamLeanCharts — wrapped. */
describe('lean charts', () => {
  const body: Wrapped<LeanChartsResponse> = {
    data: {
      round_id: 7, started_at: '2026-10-06T10:00:00Z', clock_end: '2026-10-06T10:02:00Z',
      sample_seconds: 60, wip_limit: 2,
      teams: [{
        team_id: 3, team_name: 'Team 3',
        waste: { setup: 4, waiting: 6.1, shelf: 18.3, never_sold: 2.5, discarded: 0.12, total: 31.02 },
        idle: [{ t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 5, shelf: 2 }, { t: 120, waiting: 0, shelf: 4 }],
        batches: [
          { seq: 1, sent_s: 12.4, jokes: 5, published: 4, sold: 3, first_sale_s: 95 },
          { seq: 2, sent_s: 70, jokes: 5, published: 0, sold: 0, first_sale_s: null },
        ],
      }],
      class_average: {
        waste: { setup: 2, waiting: 3.05, shelf: 9.15, never_sold: 1.25, discarded: 0.06, total: 15.51 },
        idle: [{ t: 0, waiting: 0, shelf: 0 }, { t: 60, waiting: 2.5, shelf: 1 }, { t: 120, waiting: 0, shelf: 2 }],
        sell_through: [{ t: 0, value: 0.75 }, { t: 60, value: null }, { t: 120, value: null }],
      },
    },
  };

  it('reads every team for the instructor', async () => {
    const spy = stub(body);
    const res = await instructorApi.leanCharts(7);
    expect(sentUrl(spy)).toBe('http://api.test/v1/instructor/rounds/7/lean-charts');
    expect(res.teams[0].batches[1].first_sale_s).toBeNull();
    expect(res.class_average.sell_through[1].value).toBeNull();
  });

  it('reads one team for a team screen', async () => {
    const spy = stub(body);
    const res = await teamApi.leanCharts(7, 3);
    expect(sentUrl(spy)).toBe('http://api.test/v1/rounds/7/teams/3/lean-charts');
    expect(res.teams).toHaveLength(1);
  });

  it('surfaces a Classic round as a 409 NOT_LEAN_ROUND', async () => {
    stub({ error: { code: 'CONFLICT', message: 'conflict: NOT_LEAN_ROUND: lean charts exist only for LEAN rounds' } }, 409);
    const err = await instructorApi.leanCharts(8).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(isNotLeanRound(err)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanCharts.test.ts services/api/contract.test.ts`
Expected: FAIL — `Failed to resolve import "./leanCharts"` (and `../leanCharts` in the contract test).

- [ ] **Step 5: Add the API calls**

In `services/api/team.ts`, find:

```ts
  TeamSummaryResponse, TeamFeedbackResponse, MarketResponse,
} from '../../types/api';
```

and replace it with:

```ts
  TeamSummaryResponse, TeamFeedbackResponse, MarketResponse, LeanChartsResponse,
} from '../../types/api';
```

Find:

```ts
  market(roundId: number) {
    return apiRequest<MarketResponse>(`/v1/rounds/${roundId}/market`);
  },
};
```

and replace it with:

```ts
  market(roundId: number) {
    return apiRequest<MarketResponse>(`/v1/rounds/${roundId}/market`);
  },

  /** Lean rounds only: this team's lean charts plus the anonymous class
   *  average (jokefactory_be core/usecase/lean_charts.go). Like summary(), it
   *  needs no X-User-Id. A CLASSIC round answers 409 NOT_LEAN_ROUND
   *  (services/leanCharts.ts isNotLeanRound). */
  leanCharts(roundId: number, teamId: number) {
    return apiRequest<LeanChartsResponse>(`/v1/rounds/${roundId}/teams/${teamId}/lean-charts`);
  },
};
```

In `services/api/instructor.ts`, find:

```ts
  AssignRequest, PopupStateRequest,
} from '../../types/api';
```

and replace it with:

```ts
  AssignRequest, PopupStateRequest, LeanChartsResponse,
} from '../../types/api';
```

Find:

```ts
  stats(roundId: number) {
    return apiRequest<RoundStatsResponse>(`/v1/instructor/rounds/${roundId}/stats`);
  },
```

and replace it with:

```ts
  stats(roundId: number) {
    return apiRequest<RoundStatsResponse>(`/v1/instructor/rounds/${roundId}/stats`);
  },

  /** Lean rounds only: every team's lean charts plus the class average.
   *  A CLASSIC round answers 409 NOT_LEAN_ROUND (services/leanCharts.ts). */
  leanCharts(roundId: number) {
    return apiRequest<LeanChartsResponse>(`/v1/instructor/rounds/${roundId}/lean-charts`);
  },
```

- [ ] **Step 6: Write the transforms**

Create `services/leanCharts.ts`:

```ts
/**
 * Lean charts — pure transforms from GET .../lean-charts (types/api.ts
 * LeanChartsResponse) to the rows the four recharts cards draw. The components
 * in components/leanCharts only render; every rule is here and in
 * services/leanCharts.test.ts.
 */
import type { LeanChartsClassAverage, LeanChartsResponse, LeanChartsTeam } from '../types/api';

/** Same meaning, same colour, everywhere (design_handoff_joke_factory_ui/colors_and_type.css.txt). */
export const LEAN_CHART_COLORS = {
  setup: '#2563eb',        // --production: Joke Maker changeover
  waiting: '#7c3aed',      // --marketing: waiting at Marketing
  shelf: '#d97706',        // --market: unsold on the shelf
  neverSold: '#e11d48',    // --waste: published, never sold
  discarded: '#94a3b8',    // --fg4: discarded
  round1: '#3B82F6',       // Round 1, as on the Wasted Jokes chart
  round2: '#F97316',       // Round 2, as on the Wasted Jokes chart
  classAverage: '#64748b', // --fg3, always drawn dashed
} as const;

export const LEAN_CHARTS_POLL_MS = 10_000;
export const LEAN_CHARTS_FAILURE_LIMIT = 3;
/** The backend refuses lean charts of a CLASSIC round: 409 CONFLICT with this in the message. */
export const NOT_LEAN_ROUND_MESSAGE = 'NOT_LEAN_ROUND';
export const LEAN_CHARTS_UNAVAILABLE_TEXT = 'Chart data unavailable — retrying';
export const NO_BATCHES_TEXT = 'No batches sent yet';
export const NO_RELEASES_TEXT = 'No jokes released yet';

/** True for the backend's 409 refusal of lean charts for a CLASSIC round. */
export function isNotLeanRound(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(NOT_LEAN_ROUND_MESSAGE);
}

export function roundColor(round: 1 | 2): string {
  return round === 2 ? LEAN_CHART_COLORS.round2 : LEAN_CHART_COLORS.round1;
}

/** The instructor's rename (kept in the browser, keyed by team id) wins, as on the leaderboard. */
export function teamLabel(teamId: number, fallback: string, teamNames: Record<string, string> = {}): string {
  return teamNames[String(teamId)] || fallback || `Team ${teamId}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** "45 s" under a minute, "1.6 min" from a minute on. */
export function fmtMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  return `${minutes.toFixed(1)} min`;
}

/** Axis ticks: whole minutes as "3", fractions (12-second samples) as "0.2". */
export function fmtMinuteTick(minute: number): string {
  return Number.isInteger(minute) ? String(minute) : minute.toFixed(1);
}

/* ---- Which rounds are Lean ------------------------------------------------ */

type StatsRows = ReadonlyArray<{ lean?: unknown }> | null | undefined;

/**
 * The leaderboard's rule: a round is Lean when its stats rows carry `lean`.
 * Before any rows arrive, the current round falls back to its config.
 */
export function leanRoundFlags(
  r1Rows: StatsRows,
  r2Rows: StatsRows,
  currentRound: 1 | 2,
  currentMarketMode: string,
): { 1: boolean; 2: boolean } {
  const flag = (rows: StatsRows, n: 1 | 2) =>
    rows && rows.length > 0 ? rows.some(r => r.lean != null) : n === currentRound && currentMarketMode === 'LEAN';
  return { 1: flag(r1Rows, 1), 2: flag(r2Rows, 2) };
}

/** Round 1's id from /v1/rounds/active, only if Round 1 was Lean. */
export function leanRound1Id(
  rounds: ReadonlyArray<{ id: number; round_number: number; market_mode?: string }> | null | undefined,
): number | null {
  const r1 = (rounds ?? []).find(r => Number(r.round_number) === 1);
  return r1 && r1.market_mode === 'LEAN' ? r1.id : null;
}

/** The instructor's team picker: every team in either round, by id. */
export function teamOptions(
  r1: LeanChartsResponse | null,
  r2: LeanChartsResponse | null,
  teamNames: Record<string, string> = {},
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const res of [r1, r2]) {
    for (const t of res?.teams ?? []) {
      if (!byId.has(t.team_id)) byId.set(t.team_id, teamLabel(t.team_id, t.team_name, teamNames));
    }
  }
  return [...byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name }));
}

/* ---- Chart 1: Where the money leaked -------------------------------------- */

export interface WasteBarRow {
  teamId: number;
  team: string;
  setup: number;
  waiting: number;
  shelf: number;
  neverSold: number;
  discarded: number;
  total: number;
}

export type WasteSegmentKey = 'setup' | 'waiting' | 'shelf' | 'neverSold' | 'discarded';

/** Bar segments in stacking order, left to right. */
export const WASTE_SEGMENTS: ReadonlyArray<{ key: WasteSegmentKey; label: string; color: string }> = [
  { key: 'setup', label: 'Setup', color: LEAN_CHART_COLORS.setup },
  { key: 'waiting', label: 'Waiting at Marketing', color: LEAN_CHART_COLORS.waiting },
  { key: 'shelf', label: 'Unsold on shelf', color: LEAN_CHART_COLORS.shelf },
  { key: 'neverSold', label: 'Published, never sold', color: LEAN_CHART_COLORS.neverSold },
  { key: 'discarded', label: 'Discarded', color: LEAN_CHART_COLORS.discarded },
];

/** One bar per team, most waste first (ties: lowest team id first). */
export function wasteBars(res: LeanChartsResponse | null, teamNames: Record<string, string> = {}): WasteBarRow[] {
  return (res?.teams ?? [])
    .map(t => ({
      teamId: t.team_id,
      team: teamLabel(t.team_id, t.team_name, teamNames),
      setup: t.waste.setup,
      waiting: t.waste.waiting,
      shelf: t.waste.shelf,
      neverSold: t.waste.never_sold,
      discarded: t.waste.discarded,
      total: t.waste.total,
    }))
    .sort((a, b) => b.total - a.total || a.teamId - b.teamId);
}

export function hasWaste(rows: ReadonlyArray<WasteBarRow>): boolean {
  return rows.some(r => r.total > 0);
}

/* ---- Chart 2: Jokes standing still ---------------------------------------- */

export interface IdleRow {
  minute: number;
  waiting: number;
  shelf: number;
  /** Class-average idle jokes (waiting + shelf), drawn dashed. */
  classAverage: number;
}

export function idleRows(team: LeanChartsTeam | null, avg: LeanChartsClassAverage | null): IdleRow[] {
  const samples = avg?.idle ?? team?.idle ?? [];
  return samples.map((s, k) => {
    const mine = team?.idle[k];
    const a = avg?.idle[k];
    return {
      minute: s.t / 60,
      waiting: mine?.waiting ?? 0,
      shelf: mine?.shelf ?? 0,
      classAverage: a ? a.waiting + a.shelf : 0,
    };
  });
}

export function hasIdle(rows: ReadonlyArray<IdleRow>): boolean {
  return rows.some(r => r.waiting + r.shelf + r.classAverage > 0);
}

/** The instructor's default team for chart 2: most idle jokes at the latest sample (ties: lowest id). */
export function defaultIdleTeamId(res: LeanChartsResponse | null): number | null {
  let best: { id: number; idle: number } | null = null;
  for (const t of res?.teams ?? []) {
    const last = t.idle[t.idle.length - 1];
    const idle = last ? last.waiting + last.shelf : 0;
    if (!best || idle > best.idle || (idle === best.idle && t.team_id < best.id)) best = { id: t.team_id, idle };
  }
  return best?.id ?? null;
}

/** The limit counts batches and the chart counts jokes, so the limit is stated, not drawn. */
export function idleSubtitle(wipLimit: number): string {
  const base = 'Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste.';
  return wipLimit > 0 ? `${base} WIP limit: ${wipLimit} batch${wipLimit === 1 ? '' : 'es'}` : base;
}

/* ---- Chart 3: Smaller batches, faster feedback ---------------------------- */

export interface BatchScatterPoint {
  key: string;
  teamId: number;
  team: string;
  round: 1 | 2;
  seq: number;
  jokes: number;
  published: number;
  sold: number;
  /** Minutes from sending to the first sale; null while unsold. */
  minutes: number | null;
  noSale: boolean;
  /** Plot position: batch size jittered sideways; minutes, or the "no sale yet" band. */
  x: number;
  y: number;
}

export interface BatchScatter {
  r1: BatchScatterPoint[];
  r2: BatchScatterPoint[];
  xMax: number;
  yMax: number;
  yTicks: number[];
  bandFrom: number;
  bandTo: number;
}

/** 0..max in whole steps: by one up to 5, then by ceil(max / 5). */
export function integerTicks(max: number): number[] {
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

export function batchScatter(
  sources: { 1: LeanChartsResponse | null; 2: LeanChartsResponse | null },
  teamFilter: number | null,
  teamNames: Record<string, string> = {},
): BatchScatter {
  type Raw = Omit<BatchScatterPoint, 'x' | 'y'>;
  const raw: Raw[] = [];
  for (const round of [1, 2] as const) {
    for (const t of sources[round]?.teams ?? []) {
      if (teamFilter != null && t.team_id !== teamFilter) continue;
      for (const b of t.batches) {
        raw.push({
          key: `${round}-${t.team_id}-${b.seq}`,
          teamId: t.team_id,
          team: teamLabel(t.team_id, t.team_name, teamNames),
          round,
          seq: b.seq,
          jokes: b.jokes,
          published: b.published,
          sold: b.sold,
          minutes: b.first_sale_s == null ? null : b.first_sale_s / 60,
          noSale: b.first_sale_s == null,
        });
      }
    }
  }
  const yMax = Math.max(1, Math.ceil(Math.max(0, ...raw.map(p => p.minutes ?? 0))));
  const bandFrom = yMax * 1.08;
  const bandTo = yMax * 1.3;
  const bandY = (bandFrom + bandTo) / 2;
  const xMax = Math.max(5, ...raw.map(p => p.jokes));

  // Points with the same batch size spread evenly over ±0.3 so they do not stack.
  const groups = new Map<number, Raw[]>();
  for (const p of raw) groups.set(p.jokes, [...(groups.get(p.jokes) ?? []), p]);
  const points: BatchScatterPoint[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.round - b.round || a.teamId - b.teamId || a.seq - b.seq);
    group.forEach((p, i) => {
      const offset = group.length <= 1 ? 0 : -0.3 + (0.6 * i) / (group.length - 1);
      points.push({ ...p, x: p.jokes + offset, y: p.minutes ?? bandY });
    });
  }
  return {
    r1: points.filter(p => p.round === 1),
    r2: points.filter(p => p.round === 2),
    xMax,
    yMax,
    yTicks: integerTicks(yMax),
    bandFrom,
    bandTo,
  };
}

/* ---- Chart 4: More cycles, more learning ---------------------------------- */

export interface CyclesPoint {
  minute: number;
  /** Sell-through, 0..1. */
  rate: number;
  label: string;
}

export interface CyclesSeries {
  key: string;
  name: string;
  color: string;
  /** Marker shape: Round 1 circle, Round 2 triangle. */
  round: 1 | 2;
  dashed: boolean;
  markers: boolean;
  faded: boolean;
  points: CyclesPoint[];
}

export interface CyclesModel {
  series: CyclesSeries[];
  /** Set when there is nothing to plot. */
  emptyText: string | null;
}

/** One point per batch at the minute it was sent; batches with nothing published are skipped. */
export function batchSellThrough(team: LeanChartsTeam | null | undefined): CyclesPoint[] {
  return [...(team?.batches ?? [])]
    .filter(b => b.published > 0)
    .sort((a, b) => a.seq - b.seq)
    .map(b => ({
      minute: b.sent_s / 60,
      rate: clamp01(b.sold / b.published),
      label: `Batch ${b.seq}: ${b.sold} of ${b.published} sold`,
    }));
}

/** The class's pooled sell-through per sample; samples with nothing published are dropped. */
export function classSellThrough(avg: LeanChartsClassAverage | null | undefined): CyclesPoint[] {
  return (avg?.sell_through ?? []).flatMap(s =>
    s.value == null
      ? []
      : [{ minute: s.t / 60, rate: clamp01(s.value), label: `Class: ${Math.round(clamp01(s.value) * 100)}% sold` }],
  );
}

function cyclesEmptyText(series: ReadonlyArray<CyclesSeries>, teams: ReadonlyArray<LeanChartsTeam>): string | null {
  if (series.some(s => s.points.length > 0)) return null;
  return teams.some(t => t.batches.length > 0) ? NO_RELEASES_TEXT : NO_BATCHES_TEXT;
}

/** Instructor: the class line per round, or one picked team's batches per round. */
export function cyclesForInstructor(
  r1: LeanChartsResponse | null,
  r2: LeanChartsResponse | null,
  teamFilter: number | null,
  teamNames: Record<string, string> = {},
): CyclesModel {
  const series: CyclesSeries[] = [];
  const teams: LeanChartsTeam[] = [];
  for (const [round, res] of [[1, r1], [2, r2]] as const) {
    if (!res) continue;
    if (teamFilter == null) {
      teams.push(...res.teams);
      series.push({
        key: `r${round}-class`, name: `Round ${round} · class`, color: roundColor(round), round,
        dashed: false, markers: true, faded: false, points: classSellThrough(res.class_average),
      });
    } else {
      const team = res.teams.find(t => t.team_id === teamFilter) ?? null;
      if (team) teams.push(team);
      series.push({
        key: `r${round}-team`,
        name: `Round ${round} · ${team ? teamLabel(team.team_id, team.team_name, teamNames) : `Team ${teamFilter}`}`,
        color: roundColor(round), round, dashed: false, markers: true, faded: false,
        points: batchSellThrough(team),
      });
    }
  }
  return { series, emptyText: cyclesEmptyText(series, teams) };
}

/** Student: own batches this round, the class average dashed, and in Round 2 the team's Round 1 batches faded. */
export function cyclesForStudent(
  current: LeanChartsResponse | null,
  round: 1 | 2,
  earlier: LeanChartsResponse | null,
): CyclesModel {
  const mine = current?.teams[0] ?? null;
  const before = round === 2 ? earlier?.teams[0] ?? null : null;
  const series: CyclesSeries[] = [];
  if (before) {
    series.push({
      key: 'earlier', name: 'Your Round 1 batches', color: LEAN_CHART_COLORS.round1, round: 1,
      dashed: false, markers: true, faded: true, points: batchSellThrough(before),
    });
  }
  series.push({
    key: 'mine', name: `Your batches · Round ${round}`, color: roundColor(round), round,
    dashed: false, markers: true, faded: false, points: batchSellThrough(mine),
  });
  series.push({
    key: 'class', name: 'Class average', color: LEAN_CHART_COLORS.classAverage, round,
    dashed: true, markers: false, faded: false, points: classSellThrough(current?.class_average),
  });
  const teams = [mine, before].filter((t): t is LeanChartsTeam => t != null);
  return { series, emptyText: cyclesEmptyText(series, teams) };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanCharts.test.ts services/api/contract.test.ts`
Expected: PASS.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exits 0; all test files pass.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add types/api.ts services/api/team.ts services/api/instructor.ts services/api/contract.test.ts services/leanCharts.ts services/leanCharts.testdata.ts services/leanCharts.test.ts
git commit -m "feat(lean): lean-charts types, API calls and chart transforms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Poller and `useLeanCharts` hook

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `services/useLeanCharts.ts`
- Test: `services/useLeanCharts.test.ts`

**Interfaces:**
- Consumes: `instructorApi.leanCharts`, `teamApi.leanCharts`, `LEAN_CHARTS_POLL_MS`, `LEAN_CHARTS_FAILURE_LIMIT`, `isNotLeanRound` (Task 5); `leanChartsFixture` (tests).
- Produces:
  ```ts
  interface LeanChartsState { data: LeanChartsResponse | null; failures: number; unavailable: boolean; notLean: boolean }
  const EMPTY_LEAN_CHARTS_STATE: LeanChartsState
  interface LeanChartsPollerOptions { fetch: () => Promise<LeanChartsResponse>; live: boolean; onState: (s: LeanChartsState) => void; initial?: LeanChartsState; intervalMs?: number }
  function startLeanChartsPoller(opts: LeanChartsPollerOptions): () => void   // returns stop()
  interface LeanChartsSource { roundId: number | null; teamId: number | null /* null = instructor route */; enabled: boolean; live: boolean }
  function leanChartsKey(src: Pick<LeanChartsSource, 'roundId' | 'teamId' | 'enabled'>): string | null
  function useLeanCharts(src: LeanChartsSource): LeanChartsState
  ```

The vitest environment is `node` (no DOM, no React Testing Library), so all timing logic lives in `startLeanChartsPoller`, which the tests drive with fake timers; the hook only wires it to React state.

- [ ] **Step 1: Write the failing tests**

Create `services/useLeanCharts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LEAN_CHARTS_STATE, leanChartsKey, startLeanChartsPoller, type LeanChartsState } from './useLeanCharts';
import { LEAN_CHARTS_POLL_MS } from './leanCharts';
import { leanChartsFixture } from './leanCharts.testdata';
import type { LeanChartsResponse } from '../types/api';

const resp = (round_id: number): LeanChartsResponse => leanChartsFixture({ round_id });
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
/** Fake timers do not fake promises: a few microtask hops let `await fetch()` settle. */
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const advance = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await flush(); };

function record() {
  const states: LeanChartsState[] = [];
  return { states, onState: (s: LeanChartsState) => { states.push(s); }, last: () => states[states.length - 1] };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('startLeanChartsPoller', () => {
  it('fetches at once, then every 10 s while live', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockResolvedValueOnce(resp(1))
      .mockResolvedValueOnce(resp(2));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    expect(fetch).toHaveBeenCalledTimes(1);
    await flush();
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rec.last().data?.round_id).toBe(2);
    stop();
  });

  it('keeps the last good data through failures and reports unavailable after three in a row', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockResolvedValueOnce(resp(1))
      .mockRejectedValueOnce(fail(500, 'boom'))
      .mockRejectedValueOnce(fail(502, 'HTTP 502'))
      .mockRejectedValueOnce(fail(0, 'network'))
      .mockResolvedValueOnce(resp(2));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    await flush();
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 1, unavailable: false });
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 2, unavailable: false });
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 3, unavailable: true });
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last()).toMatchObject({ failures: 0, unavailable: false });
    expect(rec.last().data?.round_id).toBe(2);
    stop();
  });

  it('hides on NOT_LEAN_ROUND and comes back on the next good poll', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockRejectedValueOnce(fail(409, 'conflict: NOT_LEAN_ROUND: lean charts exist only for LEAN rounds'))
      .mockResolvedValueOnce(resp(1));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    await flush();
    expect(rec.last()).toEqual({ ...EMPTY_LEAN_CHARTS_STATE, notLean: true });
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last().notLean).toBe(false);
    expect(rec.last().data?.round_id).toBe(1);
    stop();
  });

  it('fetches an ended round once', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>().mockResolvedValue(resp(1));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: false, onState: rec.onState });
    await flush();
    await advance(LEAN_CHARTS_POLL_MS * 6);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rec.last().data?.round_id).toBe(1);
    stop();
  });

  it('retries a failed one-shot fetch until it succeeds, then stops', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>()
      .mockRejectedValueOnce(fail(500, 'boom'))
      .mockResolvedValue(resp(1));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: false, onState: rec.onState });
    await flush();
    expect(rec.last().failures).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS);
    expect(rec.last().data?.round_id).toBe(1);
    await advance(LEAN_CHARTS_POLL_MS * 6);
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  // Review focus 5: a slow answer for the round you just left never paints the new one.
  it('drops an answer that arrives after stop', async () => {
    let resolve!: (r: LeanChartsResponse) => void;
    const fetch = vi.fn(() => new Promise<LeanChartsResponse>(r => { resolve = r; }));
    const rec = record();
    const stop = startLeanChartsPoller({ fetch, live: true, onState: rec.onState });
    stop();
    resolve(resp(9));
    await flush();
    expect(rec.states).toHaveLength(0);
    await advance(LEAN_CHARTS_POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // Review focus 5: a round that just ended restarts its poller without blanking the chart.
  it('starts from the given initial state', async () => {
    const fetch = vi.fn<() => Promise<LeanChartsResponse>>().mockRejectedValueOnce(fail(500, 'boom'));
    const rec = record();
    const initial: LeanChartsState = { ...EMPTY_LEAN_CHARTS_STATE, data: resp(1) };
    const stop = startLeanChartsPoller({ fetch, live: false, onState: rec.onState, initial });
    await flush();
    expect(rec.last()).toMatchObject({ failures: 1, unavailable: false });
    expect(rec.last().data?.round_id).toBe(1);
    stop();
  });
});

describe('leanChartsKey', () => {
  it('is null when disabled or without a round, else round and route', () => {
    expect(leanChartsKey({ roundId: 7, teamId: null, enabled: false })).toBeNull();
    expect(leanChartsKey({ roundId: null, teamId: 3, enabled: true })).toBeNull();
    expect(leanChartsKey({ roundId: 7, teamId: null, enabled: true })).toBe('7:all');
    expect(leanChartsKey({ roundId: 7, teamId: 3, enabled: true })).toBe('7:3');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/useLeanCharts.test.ts`
Expected: FAIL — `Failed to resolve import "./useLeanCharts"`.

- [ ] **Step 3: Write the implementation**

Create `services/useLeanCharts.ts`:

```ts
/**
 * Polls the lean-charts endpoint for one round. The timing lives in
 * startLeanChartsPoller, a plain function the tests drive with fake timers;
 * useLeanCharts only wires it to React state.
 *
 *  - live (ACTIVE) round: one request at once, then one LEAN_CHARTS_POLL_MS
 *    after each answer — never two in flight;
 *  - ended round: one request; a failure retries on the same clock until one
 *    succeeds;
 *  - a failed poll keeps the last good response; LEAN_CHARTS_FAILURE_LIMIT
 *    failures in a row set `unavailable` ("Chart data unavailable — retrying");
 *  - 409 NOT_LEAN_ROUND clears the data and sets `notLean` so the caller hides
 *    the charts; a live poller keeps asking, so the next good answer shows
 *    them again;
 *  - an answer that arrives after stop() is dropped: a slow response for the
 *    round you just left never paints over the round you switched to.
 */
import { useEffect, useRef, useState } from 'react';
import type { LeanChartsResponse } from '../types/api';
import { instructorApi } from './api/instructor';
import { teamApi } from './api/team';
import { LEAN_CHARTS_FAILURE_LIMIT, LEAN_CHARTS_POLL_MS, isNotLeanRound } from './leanCharts';

export interface LeanChartsState {
  data: LeanChartsResponse | null;
  /** Consecutive failed polls since the last good answer. */
  failures: number;
  /** True once `failures` reaches LEAN_CHARTS_FAILURE_LIMIT. */
  unavailable: boolean;
  /** The server says the round is not Lean (409 NOT_LEAN_ROUND). */
  notLean: boolean;
}

export const EMPTY_LEAN_CHARTS_STATE: LeanChartsState = { data: null, failures: 0, unavailable: false, notLean: false };

export interface LeanChartsPollerOptions {
  fetch: () => Promise<LeanChartsResponse>;
  /** true: poll while the round runs; false: fetch once (retrying failures). */
  live: boolean;
  onState: (state: LeanChartsState) => void;
  /** The state to build on (kept when only `live` changed). Not emitted. */
  initial?: LeanChartsState;
  intervalMs?: number;
}

/** Starts polling; returns stop(). onState is never called after stop(). */
export function startLeanChartsPoller(opts: LeanChartsPollerOptions): () => void {
  const interval = opts.intervalMs ?? LEAN_CHARTS_POLL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: LeanChartsState = opts.initial ?? EMPTY_LEAN_CHARTS_STATE;

  const emit = (next: LeanChartsState) => {
    state = next;
    opts.onState(next);
  };
  const schedule = () => {
    if (!stopped) timer = setTimeout(() => { void tick(); }, interval);
  };
  const tick = async () => {
    timer = null;
    let res: LeanChartsResponse;
    try {
      res = await opts.fetch();
    } catch (err) {
      if (stopped) return;
      if (isNotLeanRound(err)) {
        emit({ data: null, failures: 0, unavailable: false, notLean: true });
        if (opts.live) schedule();
        return;
      }
      const failures = state.failures + 1;
      emit({ ...state, failures, unavailable: failures >= LEAN_CHARTS_FAILURE_LIMIT });
      schedule();
      return;
    }
    if (stopped) return;
    emit({ data: res, failures: 0, unavailable: false, notLean: false });
    if (opts.live) schedule();
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

export interface LeanChartsSource {
  roundId: number | null;
  /** null: the instructor route (every team). A number: that team's route. */
  teamId: number | null;
  /** false: no requests at all (a Classic round, or no round yet). */
  enabled: boolean;
  /** true while the round is ACTIVE (poll every 10 s); false once ended (fetch once). */
  live: boolean;
}

/** What the charts are of. A new key starts empty; the same key keeps its data. */
export function leanChartsKey(src: Pick<LeanChartsSource, 'roundId' | 'teamId' | 'enabled'>): string | null {
  if (!src.enabled || src.roundId == null) return null;
  return `${src.roundId}:${src.teamId ?? 'all'}`;
}

export function useLeanCharts(src: LeanChartsSource): LeanChartsState {
  const { roundId, teamId, enabled, live } = src;
  const [state, setState] = useState<LeanChartsState>(EMPTY_LEAN_CHARTS_STATE);
  const stateRef = useRef<LeanChartsState>(EMPTY_LEAN_CHARTS_STATE);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = leanChartsKey({ roundId, teamId, enabled });
    // Same round and route (only `live` changed — the round started or ended):
    // keep what is on screen. A different round or team starts empty.
    const initial = key !== null && key === keyRef.current ? stateRef.current : EMPTY_LEAN_CHARTS_STATE;
    keyRef.current = key;
    const publish = (next: LeanChartsState) => {
      stateRef.current = next;
      setState(next);
    };
    publish(initial);
    if (key === null || roundId == null) return undefined;
    const fetch = teamId == null
      ? () => instructorApi.leanCharts(roundId)
      : () => teamApi.leanCharts(roundId, teamId);
    return startLeanChartsPoller({ fetch, live, initial, onState: publish });
  }, [roundId, teamId, enabled, live]);

  return state;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/useLeanCharts.test.ts`
Expected: PASS (8 tests).

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exits 0; all test files pass.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add services/useLeanCharts.ts services/useLeanCharts.test.ts
git commit -m "feat(lean): poll the lean charts, keeping the last good answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: The four chart components

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `components/leanCharts/chartParts.tsx`, `components/leanCharts/WasteBreakdownChart.tsx`, `components/leanCharts/IdleJokesChart.tsx`, `components/leanCharts/BatchFeedbackChart.tsx`, `components/leanCharts/LearningCyclesChart.tsx`
- Test: `components/leanCharts/leanCharts.render.test.ts`

**Interfaces:**
- Consumes: everything in `services/leanCharts.ts` (Task 5); `Card` from `components/ui.tsx`; `fmtMoney` from `services/leanMode.ts`; types from `types/api.ts`.
- Produces (React components, each rendering its own `Card`):
  ```ts
  WasteBreakdownChart: React.FC<{ data: LeanChartsResponse | null; teamNames: Record<string, string>; unavailable?: boolean; className?: string }>
  IdleJokesChart: React.FC<{ team: LeanChartsTeam | null; classAverage: LeanChartsClassAverage | null; wipLimit: number; compact?: boolean; teamLabel?: string | null; unavailable?: boolean; className?: string }>
  BatchFeedbackChart: React.FC<{ scatter: BatchScatter; unavailable?: boolean; className?: string }>
  LearningCyclesChart: React.FC<{ model: CyclesModel; compact?: boolean; unavailable?: boolean; className?: string }>
  // chartParts.tsx
  Marker, ChartLegend, ChartTooltipBox, ChartNotice, chartHeight(compact: boolean): number, type LegendItem, type MarkerShape
  ```

Tests render with `react-dom/server` `renderToStaticMarkup` (vitest runs in `node`). Recharts' `ResponsiveContainer` measures 0×0 there and logs a size warning; the tests assert on the card text around it, never on chart internals.

- [ ] **Step 1: Write the failing tests**

Create `components/leanCharts/leanCharts.render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WasteBreakdownChart } from './WasteBreakdownChart';
import { IdleJokesChart } from './IdleJokesChart';
import { BatchFeedbackChart } from './BatchFeedbackChart';
import { LearningCyclesChart } from './LearningCyclesChart';
import { batchScatter, cyclesForInstructor } from '../../services/leanCharts';
import { leanChartsFixture } from '../../services/leanCharts.testdata';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const res = leanChartsFixture();

describe('chart 1 — Where the money leaked', () => {
  it('shows its title, subtitle, legend and the empty state', () => {
    const out = html(createElement(WasteBreakdownChart, { data: null, teamNames: {} }));
    expect(out).toContain('Where the money leaked');
    expect(out).toContain('Cost of waste per team, by kind. Shorter bars = leaner.');
    for (const label of ['Setup', 'Waiting at Marketing', 'Unsold on shelf', 'Published, never sold', 'Discarded']) {
      expect(out).toContain(label);
    }
    expect(out).toContain('No batches sent yet');
  });
  it('draws a chart when there is waste', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {} }));
    expect(out).toContain('recharts-responsive-container');
    expect(out).not.toContain('No batches sent yet');
  });
  it('says when the data is unavailable', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {}, unavailable: true }));
    expect(out).toContain('Chart data unavailable — retrying');
  });
});

describe('chart 2 — Jokes standing still', () => {
  it('states the WIP limit in the subtitle and the empty state before any batch', () => {
    const out = html(createElement(IdleJokesChart, { team: null, classAverage: null, wipLimit: 2 }));
    expect(out).toContain('Jokes standing still');
    expect(out).toContain('Jokes waiting for Marketing or unsold on the shelf. A growing pile is waste. WIP limit: 2 batches');
    expect(out).toContain('Class average');
    expect(out).toContain('No batches sent yet');
  });
  it('names the team it shows', () => {
    const out = html(createElement(IdleJokesChart, {
      team: res.teams[1], classAverage: res.class_average, wipLimit: 0, teamLabel: 'Team 2 — most idle jokes now',
    }));
    expect(out).toContain('Showing Team 2 — most idle jokes now');
    expect(out).not.toContain('WIP limit');
    expect(out).toContain('recharts-responsive-container');
  });
});

describe('chart 3 — Smaller batches, faster feedback', () => {
  it('shows its title, subtitle, legend and the empty state', () => {
    const out = html(createElement(BatchFeedbackChart, { scatter: batchScatter({ 1: null, 2: null }, null) }));
    expect(out).toContain('Smaller batches, faster feedback');
    expect(out).toContain('Each dot is a batch. Lower = the market answered sooner.');
    expect(out).toContain('Round 1');
    expect(out).toContain('Round 2');
    expect(out).toContain('No sale yet (hollow)');
    expect(out).toContain('No batches sent yet');
  });
  it('draws a chart when there are batches', () => {
    const out = html(createElement(BatchFeedbackChart, { scatter: batchScatter({ 1: res, 2: null }, null) }));
    expect(out).toContain('recharts-responsive-container');
  });
});

describe('chart 4 — More cycles, more learning', () => {
  it('shows its title, subtitle and why it is empty', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(null, null, null) }));
    expect(out).toContain('More cycles, more learning');
    expect(out).toContain('Each dot is a batch: how much of it sold. More dots = more chances to adjust.');
    expect(out).toContain('No batches sent yet');
  });
  it('lists its series in the legend', () => {
    const out = html(createElement(LearningCyclesChart, { model: cyclesForInstructor(res, null, null) }));
    expect(out).toContain('Round 1 · class');
    expect(out).toContain('recharts-responsive-container');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/leanCharts/leanCharts.render.test.ts`
Expected: FAIL — `Failed to resolve import "./WasteBreakdownChart"`.

- [ ] **Step 3: Write the shared parts**

Create `components/leanCharts/chartParts.tsx`:

```tsx
/* Shared pieces of the four lean charts: the round markers (Round 1 circle,
   Round 2 triangle, hollow for "no sale yet"), the small legend drawn above
   each plot, the tooltip box in the app's existing style (views/Instructor.tsx)
   and the notices. */
import React from 'react';

export type MarkerShape = 'circle' | 'triangle';

export const Marker: React.FC<{
  cx?: number;
  cy?: number;
  shape: MarkerShape;
  color: string;
  hollow?: boolean;
  opacity?: number;
  size?: number;
}> = ({ cx, cy, shape, color, hollow = false, opacity = 1, size = 5 }) => {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return <g />;
  const fill = hollow ? '#ffffff' : color;
  if (shape === 'triangle') {
    const d = `M${cx},${cy - size * 1.15} L${cx + size},${cy + size * 0.85} L${cx - size},${cy + size * 0.85} Z`;
    return <path d={d} fill={fill} stroke={color} strokeWidth={1.5} opacity={opacity} />;
  }
  return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={color} strokeWidth={1.5} opacity={opacity} />;
};

export interface LegendItem {
  label: string;
  color: string;
  kind: 'square' | 'circle' | 'triangle' | 'line' | 'dashed';
  hollow?: boolean;
  faded?: boolean;
}

export const ChartLegend: React.FC<{ items: ReadonlyArray<LegendItem> }> = ({ items }) => (
  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
    {items.map(item => (
      <span key={item.label} className="inline-flex items-center gap-1">
        <svg width="14" height="10" aria-hidden="true" opacity={item.faded ? 0.4 : 1}>
          {item.kind === 'square' && <rect x="2" y="1" width="10" height="8" rx="1.5" fill={item.color} />}
          {item.kind === 'circle' && (
            <circle cx="7" cy="5" r="3.5" fill={item.hollow ? '#ffffff' : item.color} stroke={item.color} strokeWidth="1.5" />
          )}
          {item.kind === 'triangle' && (
            <path d="M7,1 L11,9 L3,9 Z" fill={item.hollow ? '#ffffff' : item.color} stroke={item.color} strokeWidth="1.2" />
          )}
          {item.kind === 'line' && <line x1="1" y1="5" x2="13" y2="5" stroke={item.color} strokeWidth="2" />}
          {item.kind === 'dashed' && (
            <line x1="1" y1="5" x2="13" y2="5" stroke={item.color} strokeWidth="2" strokeDasharray="3 2" />
          )}
        </svg>
        {item.label}
      </span>
    ))}
  </div>
);

export const ChartTooltipBox: React.FC<{
  title: string;
  rows: ReadonlyArray<{ label: string; value: string; color?: string }>;
}> = ({ title, rows }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
    <div className="text-sm font-bold text-gray-900">{title}</div>
    <div className="mt-1 space-y-0.5 text-sm text-gray-700">
      {rows.map(r => (
        <div key={r.label} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} />}
            {r.label}
          </span>
          <span className="font-mono font-bold">{r.value}</span>
        </div>
      ))}
    </div>
  </div>
);

/** "muted": an empty state in place of the plot. "warn": a line above the plot. */
export const ChartNotice: React.FC<{ text: string; tone?: 'muted' | 'warn' }> = ({ text, tone = 'muted' }) => (
  <p className={tone === 'warn' ? 'mb-2 text-xs font-semibold text-amber-700' : 'py-6 text-center text-sm italic text-gray-400'}>
    {text}
  </p>
);

/** Plot height in pixels: 180 on the compact student cards, 288 (h-72) on the instructor grid. */
export const chartHeight = (compact: boolean): number => (compact ? 180 : 288);
```

- [ ] **Step 4: Write chart 1**

Create `components/leanCharts/WasteBreakdownChart.tsx`:

```tsx
/* Chart 1 — "Where the money leaked" (instructor only). One horizontal bar per
   team, most waste first, split into the five kinds of waste in dollars, with
   the total at the end of each bar. Setup + Waiting + Unsold equals the
   leaderboard's Setup + Carrying for that team. */
import React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import type { LeanChartsResponse } from '../../types/api';
import { fmtMoney } from '../../services/leanMode';
import {
  LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, WASTE_SEGMENTS, hasWaste, wasteBars, type WasteBarRow,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox } from './chartParts';

export interface WasteBreakdownChartProps {
  data: LeanChartsResponse | null;
  teamNames: Record<string, string>;
  unavailable?: boolean;
  className?: string;
}

export const WasteBreakdownChart: React.FC<WasteBreakdownChartProps> = ({
  data, teamNames, unavailable = false, className = '',
}) => {
  const rows = wasteBars(data, teamNames);
  const height = Math.max(180, rows.length * 34 + 48);
  return (
    <Card title="Where the money leaked" subtitle="Cost of waste per team, by kind. Shorter bars = leaner." className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      <ChartLegend items={WASTE_SEGMENTS.map(s => ({ label: s.label, color: s.color, kind: 'square' as const }))} />
      {!hasWaste(rows) ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => fmtMoney(Number(v))} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="team" width={104} tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                content={(props: any) => {
                  const row = props?.active ? (props?.payload?.[0]?.payload as WasteBarRow | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <ChartTooltipBox
                      title={row.team}
                      rows={[
                        ...WASTE_SEGMENTS.map(s => ({ label: s.label, value: fmtMoney(row[s.key]), color: s.color })),
                        { label: 'Total', value: fmtMoney(row.total) },
                      ]}
                    />
                  );
                }}
              />
              {WASTE_SEGMENTS.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="waste" fill={s.color} isAnimationActive={false}>
                  {i === WASTE_SEGMENTS.length - 1 && (
                    <LabelList dataKey="total" position="right" formatter={(v) => fmtMoney(Number(v))} fill="#334155" fontSize={12} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default WasteBreakdownChart;
```

- [ ] **Step 5: Write chart 2**

Create `components/leanCharts/IdleJokesChart.tsx`:

```tsx
/* Chart 2 — "Jokes standing still". For one team: jokes waiting for Marketing
   (bottom band) and unsold on the shelf (top band) at each sample of the round,
   with the class-average total as a dashed line. The WIP limit counts batches
   and the chart counts jokes, so the limit is stated in the subtitle, not drawn. */
import React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import type { LeanChartsClassAverage, LeanChartsTeam } from '../../types/api';
import {
  LEAN_CHART_COLORS, LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT,
  fmtMinuteTick, hasIdle, idleRows, idleSubtitle, type IdleRow,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox, chartHeight } from './chartParts';

export interface IdleJokesChartProps {
  team: LeanChartsTeam | null;
  classAverage: LeanChartsClassAverage | null;
  wipLimit: number;
  /** Student side panel: 180 px plot, no axis title. */
  compact?: boolean;
  /** Instructor: which team the chart shows. */
  teamLabel?: string | null;
  unavailable?: boolean;
  className?: string;
}

const fmtCount = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export const IdleJokesChart: React.FC<IdleJokesChartProps> = ({
  team, classAverage, wipLimit, compact = false, teamLabel = null, unavailable = false, className = '',
}) => {
  const rows = idleRows(team, classAverage);
  return (
    <Card title="Jokes standing still" subtitle={idleSubtitle(wipLimit)} className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      {teamLabel && <div className="mb-1 text-xs font-semibold text-gray-600">Showing {teamLabel}</div>}
      <ChartLegend
        items={[
          { label: 'Waiting at Marketing', color: LEAN_CHART_COLORS.waiting, kind: 'square' },
          { label: 'Unsold on shelf', color: LEAN_CHART_COLORS.shelf, kind: 'square' },
          { label: 'Class average', color: LEAN_CHART_COLORS.classAverage, kind: 'dashed' },
        ]}
      />
      {!hasIdle(rows) ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 4, right: 12, left: 0, bottom: compact ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="minute"
                type="number"
                domain={[0, 'dataMax'] as const}
                tickFormatter={(v) => fmtMinuteTick(Number(v))}
                tick={{ fontSize: 11 }}
                label={compact ? undefined : { value: 'Minute of the round', position: 'insideBottom', offset: -6, style: { fontSize: 11 } }}
              />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
              <Tooltip
                content={(props: any) => {
                  const row = props?.active ? (props?.payload?.[0]?.payload as IdleRow | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <ChartTooltipBox
                      title={`Minute ${fmtMinuteTick(row.minute)}`}
                      rows={[
                        { label: 'Waiting at Marketing', value: fmtCount(row.waiting), color: LEAN_CHART_COLORS.waiting },
                        { label: 'Unsold on shelf', value: fmtCount(row.shelf), color: LEAN_CHART_COLORS.shelf },
                        { label: 'Class average', value: fmtCount(row.classAverage), color: LEAN_CHART_COLORS.classAverage },
                      ]}
                    />
                  );
                }}
              />
              <Area
                type="linear" dataKey="waiting" name="Waiting at Marketing" stackId="idle"
                stroke={LEAN_CHART_COLORS.waiting} fill={LEAN_CHART_COLORS.waiting} fillOpacity={0.35} isAnimationActive={false}
              />
              <Area
                type="linear" dataKey="shelf" name="Unsold on shelf" stackId="idle"
                stroke={LEAN_CHART_COLORS.shelf} fill={LEAN_CHART_COLORS.shelf} fillOpacity={0.35} isAnimationActive={false}
              />
              <Line
                type="linear" dataKey="classAverage" name="Class average" stroke={LEAN_CHART_COLORS.classAverage}
                strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default IdleJokesChart;
```

- [ ] **Step 6: Write chart 3**

Create `components/leanCharts/BatchFeedbackChart.tsx`:

```tsx
/* Chart 3 — "Smaller batches, faster feedback" (instructor only). One point per
   batch: jokes in the batch across (jittered so equal sizes do not stack),
   minutes from sending to its first sale up. Round 1 circles, Round 2
   triangles. Batches with no sale yet are hollow, in a "no sale yet" band
   above the top of the axis, so they are visible and never read as fast. */
import React from 'react';
import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import {
  LEAN_CHART_COLORS, LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, fmtMinutes,
  type BatchScatter, type BatchScatterPoint,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox, Marker, chartHeight } from './chartParts';

export interface BatchFeedbackChartProps {
  scatter: BatchScatter;
  unavailable?: boolean;
  className?: string;
}

const renderPoint = (props: any) => {
  const p = props?.payload as BatchScatterPoint | undefined;
  if (!p) return <g />;
  return (
    <Marker
      cx={props.cx}
      cy={props.cy}
      shape={p.round === 2 ? 'triangle' : 'circle'}
      color={p.round === 2 ? LEAN_CHART_COLORS.round2 : LEAN_CHART_COLORS.round1}
      hollow={p.noSale}
    />
  );
};

function firstSaleText(p: BatchScatterPoint): string {
  if (p.minutes != null) return fmtMinutes(p.minutes);
  return p.published > 0 ? 'No sale yet' : 'Nothing released yet';
}

export const BatchFeedbackChart: React.FC<BatchFeedbackChartProps> = ({ scatter, unavailable = false, className = '' }) => {
  const empty = scatter.r1.length + scatter.r2.length === 0;
  const xTicks = Array.from({ length: scatter.xMax }, (_, i) => i + 1);
  return (
    <Card title="Smaller batches, faster feedback" subtitle="Each dot is a batch. Lower = the market answered sooner." className={className}>
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      <ChartLegend
        items={[
          { label: 'Round 1', color: LEAN_CHART_COLORS.round1, kind: 'circle' },
          { label: 'Round 2', color: LEAN_CHART_COLORS.round2, kind: 'triangle' },
          { label: 'No sale yet (hollow)', color: LEAN_CHART_COLORS.classAverage, kind: 'circle', hollow: true },
        ]}
      />
      {empty ? (
        <ChartNotice text={NO_BATCHES_TEXT} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(false) }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number" dataKey="x" domain={[0.5, scatter.xMax + 0.5]} ticks={xTicks} allowDecimals={false}
                tick={{ fontSize: 11 }}
                label={{ value: 'Jokes in the batch', position: 'insideBottom', offset: -6, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number" dataKey="y" domain={[0, scatter.bandTo]} ticks={scatter.yTicks} width={40} tick={{ fontSize: 11 }}
                label={{ value: 'Minutes to first sale', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }}
              />
              {/* recharts 3.6 types do not accept `fill` on ReferenceArea, so the band is a custom shape. */}
              <ReferenceArea
                y1={scatter.bandFrom}
                y2={scatter.bandTo}
                shape={(props: any) => <rect x={props.x} y={props.y} width={props.width} height={props.height} fill="#f1f5f9" />}
                label={{ value: 'no sale yet', position: 'insideTopRight', style: { fontSize: 11, fill: LEAN_CHART_COLORS.classAverage } }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={(props: any) => {
                  const p = props?.active ? (props?.payload?.[0]?.payload as BatchScatterPoint | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipBox
                      title={`${p.team} · Round ${p.round} · batch ${p.seq}`}
                      rows={[
                        { label: 'Jokes', value: String(p.jokes) },
                        { label: 'Sold', value: `${p.sold} of ${p.published} released` },
                        { label: 'First sale', value: firstSaleText(p) },
                      ]}
                    />
                  );
                }}
              />
              <Scatter name="Round 1" data={scatter.r1} shape={renderPoint} isAnimationActive={false} />
              <Scatter name="Round 2" data={scatter.r2} shape={renderPoint} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default BatchFeedbackChart;
```

- [ ] **Step 7: Write chart 4**

Create `components/leanCharts/LearningCyclesChart.tsx`:

```tsx
/* Chart 4 — "More cycles, more learning". Sell-through (share of released
   jokes that sold, 0–100 %) against the minute of the round. Each series is
   drawn as connected markers (Round 1 circles, Round 2 triangles) or, for the
   class average, a dashed line; a faded series is an earlier round behind.
   Series come from services/leanCharts.ts cyclesForInstructor / cyclesForStudent. */
import React from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui';
import {
  LEAN_CHARTS_UNAVAILABLE_TEXT, fmtMinuteTick, type CyclesModel, type CyclesPoint,
} from '../../services/leanCharts';
import { ChartLegend, ChartNotice, ChartTooltipBox, Marker, chartHeight, type LegendItem } from './chartParts';

export interface LearningCyclesChartProps {
  model: CyclesModel;
  compact?: boolean;
  unavailable?: boolean;
  className?: string;
}

export const LearningCyclesChart: React.FC<LearningCyclesChartProps> = ({
  model, compact = false, unavailable = false, className = '',
}) => {
  const legend: LegendItem[] = model.series.map(s => ({
    label: s.name,
    color: s.color,
    kind: s.dashed ? 'dashed' : s.markers ? (s.round === 2 ? 'triangle' : 'circle') : 'line',
    faded: s.faded,
  }));
  return (
    <Card
      title="More cycles, more learning"
      subtitle="Each dot is a batch: how much of it sold. More dots = more chances to adjust."
      className={className}
    >
      {unavailable && <ChartNotice text={LEAN_CHARTS_UNAVAILABLE_TEXT} tone="warn" />}
      <ChartLegend items={legend} />
      {model.emptyText ? (
        <ChartNotice text={model.emptyText} />
      ) : (
        <div className="w-full" style={{ height: chartHeight(compact) }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: compact ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number" dataKey="minute" domain={[0, 'dataMax'] as const}
                tickFormatter={(v) => fmtMinuteTick(Number(v))} tick={{ fontSize: 11 }}
                label={compact ? undefined : { value: 'Minute the batch was sent', position: 'insideBottom', offset: -6, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number" dataKey="rate" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} width={40} tick={{ fontSize: 11 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={(props: any) => {
                  const p = props?.active ? (props?.payload?.[0]?.payload as CyclesPoint | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltipBox
                      title={`Minute ${fmtMinuteTick(Math.round(p.minute * 10) / 10)}`}
                      rows={[{ label: p.label, value: `${Math.round(p.rate * 100)}%` }]}
                    />
                  );
                }}
              />
              {model.series.map(s => (
                <Scatter
                  key={s.key}
                  name={s.name}
                  data={s.points}
                  isAnimationActive={false}
                  lineJointType="linear"
                  line={{
                    stroke: s.color,
                    strokeWidth: s.dashed ? 1.5 : 2,
                    strokeDasharray: s.dashed ? '5 4' : undefined,
                    strokeOpacity: s.faded ? 0.35 : 1,
                  }}
                  shape={(props: any) =>
                    s.markers ? (
                      <Marker
                        cx={props.cx} cy={props.cy} shape={s.round === 2 ? 'triangle' : 'circle'} color={s.color}
                        opacity={s.faded ? 0.35 : 1} size={compact ? 4 : 5}
                      />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default LearningCyclesChart;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/leanCharts/leanCharts.render.test.ts`
Expected: PASS (9 tests). Recharts may log "The width(…) and height(…) of chart should be greater than 0" — expected under `renderToStaticMarkup`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: tsc exits 0; all tests pass; the build succeeds.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components/leanCharts/chartParts.tsx components/leanCharts/WasteBreakdownChart.tsx components/leanCharts/IdleJokesChart.tsx components/leanCharts/BatchFeedbackChart.tsx components/leanCharts/LearningCyclesChart.tsx components/leanCharts/leanCharts.render.test.ts
git commit -m "feat(lean): the four lean chart cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Instructor panel and the Lean/Classic swap

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `components/leanCharts/LeanChartsPanel.tsx`
- Test: `components/leanCharts/LeanChartsPanel.test.ts`
- Modify (additions only): `views/Instructor.tsx` — imports after :14; state after :92; tab-defaults effect at :318-329; after `statsR1`/`statsR2` at :340-342; the Classic chart block from :2801 (`{!isChartHidden('sales') && (`) to :3203 (the `)}` before `{/* Live Market (Instructor view) */}`).

**Interfaces:**
- Consumes: `WasteBreakdownChart`, `IdleJokesChart`, `BatchFeedbackChart`, `LearningCyclesChart` (Task 7); `useLeanCharts`, `LeanChartsState`, `EMPTY_LEAN_CHARTS_STATE` (Task 6); `batchScatter`, `cyclesForInstructor`, `defaultIdleTeamId`, `teamLabel`, `teamOptions`, `leanRoundFlags` (Task 5); from `useGame()`: `roundIds`, `roundStatuses`, `teamNames`, `config.round`, `config.marketMode`, `instructorStatsRound1/2`.
- Produces:
  ```ts
  interface LeanChartsPanelProps { round: 1 | 2; onRoundChange: (r: 1 | 2) => void; leanRounds: { 1: boolean; 2: boolean }; r1: LeanChartsState; r2: LeanChartsState; teamNames: Record<string, string> }
  const LeanChartsPanel: React.FC<LeanChartsPanelProps>   // renders a fragment: a full-width control bar + four Cards, as grid children
  ```

- [ ] **Step 1: Write the failing test**

Create `components/leanCharts/LeanChartsPanel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeanChartsPanel } from './LeanChartsPanel';
import { EMPTY_LEAN_CHARTS_STATE } from '../../services/useLeanCharts';
import { leanChartsFixture } from '../../services/leanCharts.testdata';

const render = (round: 1 | 2, leanRounds: { 1: boolean; 2: boolean }) =>
  renderToStaticMarkup(createElement(LeanChartsPanel, {
    round,
    onRoundChange: () => {},
    leanRounds,
    r1: EMPTY_LEAN_CHARTS_STATE,
    r2: { ...EMPTY_LEAN_CHARTS_STATE, data: leanChartsFixture({ round_id: 8 }) },
    teamNames: { '2': 'Zebras' },
  }));

describe('LeanChartsPanel', () => {
  it('renders the control bar and the four cards in order', () => {
    const out = render(2, { 1: true, 2: true });
    const titles = ['Lean charts', 'Where the money leaked', 'Jokes standing still', 'Smaller batches, faster feedback', 'More cycles, more learning'];
    const at = titles.map(t => out.indexOf(t));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(out).toContain('All teams');
    expect(out).toContain('Zebras');
  });
  it('shows the most idle team by default in chart 2', () => {
    expect(render(2, { 1: true, 2: true })).toContain('Showing Zebras — most idle jokes now');
  });
  it('disables the round button of a round that is not Lean', () => {
    const out = render(2, { 1: false, 2: true });
    expect(out).toMatch(/disabled=""[^>]*title="Round 1 is not a Lean round"/);
    expect(out).not.toMatch(/disabled=""[^>]*title="Round 2"/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/leanCharts/LeanChartsPanel.test.ts`
Expected: FAIL — `Failed to resolve import "./LeanChartsPanel"`.

- [ ] **Step 3: Write the panel**

Create `components/leanCharts/LeanChartsPanel.tsx`:

```tsx
/* The instructor's lean charts, rendered as children of the dashboard grid in
   views/Instructor.tsx in place of the five Classic chart cards when the round
   shown is Lean. A full-width control bar holds the team picker and the R1/R2
   control; the round control sets charts 1 and 2, and charts 3 and 4 always
   overlay both rounds. A round that is not Lean cannot be picked. */
import React, { useEffect, useMemo, useState } from 'react';
import type { LeanChartsState } from '../../services/useLeanCharts';
import { batchScatter, cyclesForInstructor, defaultIdleTeamId, teamLabel, teamOptions } from '../../services/leanCharts';
import { WasteBreakdownChart } from './WasteBreakdownChart';
import { IdleJokesChart } from './IdleJokesChart';
import { BatchFeedbackChart } from './BatchFeedbackChart';
import { LearningCyclesChart } from './LearningCyclesChart';

export interface LeanChartsPanelProps {
  round: 1 | 2;
  onRoundChange: (round: 1 | 2) => void;
  leanRounds: { 1: boolean; 2: boolean };
  r1: LeanChartsState;
  r2: LeanChartsState;
  /** The instructor's renames, keyed by team id (the leaderboard's map). */
  teamNames: Record<string, string>;
}

export const LeanChartsPanel: React.FC<LeanChartsPanelProps> = ({ round, onRoundChange, leanRounds, r1, r2, teamNames }) => {
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const selected = round === 1 ? r1 : r2;
  const options = useMemo(() => teamOptions(r1.data, r2.data, teamNames), [r1.data, r2.data, teamNames]);

  // A reset or a new class can remove the picked team: fall back to all teams.
  useEffect(() => {
    if (teamFilter != null && options.length > 0 && !options.some(o => o.id === teamFilter)) setTeamFilter(null);
  }, [options, teamFilter]);

  const idleTeamId = teamFilter ?? defaultIdleTeamId(selected.data);
  const idleTeam = selected.data?.teams.find(t => t.team_id === idleTeamId) ?? null;
  const idleLabel = idleTeam
    ? `${teamLabel(idleTeam.team_id, idleTeam.team_name, teamNames)}${teamFilter == null ? ' — most idle jokes now' : ''}`
    : null;
  const scatter = useMemo(
    () => batchScatter({ 1: r1.data, 2: r2.data }, teamFilter, teamNames),
    [r1.data, r2.data, teamFilter, teamNames],
  );
  const cycles = useMemo(
    () => cyclesForInstructor(r1.data, r2.data, teamFilter, teamNames),
    [r1.data, r2.data, teamFilter, teamNames],
  );
  const eitherUnavailable = r1.unavailable || r2.unavailable;

  return (
    <>
      <div className="xl:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-gray-800">Lean charts</div>
          <div className="text-xs text-gray-400">The round control sets the first two charts; the last two compare both rounds.</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={teamFilter == null ? 'ALL' : String(teamFilter)}
            onChange={(e) => setTeamFilter(e.target.value === 'ALL' ? null : Number(e.target.value))}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
            title="Filter by Team"
          >
            <option value="ALL">All teams</option>
            {options.map(o => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
          <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
            {([1, 2] as const).map(r => (
              <button
                key={r}
                type="button"
                disabled={!leanRounds[r]}
                title={leanRounds[r] ? `Round ${r}` : `Round ${r} is not a Lean round`}
                className={`px-2 py-1 rounded text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                  round === r ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => onRoundChange(r)}
              >
                {r === 1 ? 'R1' : 'R2'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <WasteBreakdownChart data={selected.data} teamNames={teamNames} unavailable={selected.unavailable} />
      <IdleJokesChart
        team={idleTeam}
        classAverage={selected.data?.class_average ?? null}
        wipLimit={selected.data?.wip_limit ?? 0}
        teamLabel={idleLabel}
        unavailable={selected.unavailable}
      />
      <BatchFeedbackChart scatter={scatter} unavailable={eitherUnavailable} />
      <LearningCyclesChart model={cycles} unavailable={eitherUnavailable} />
    </>
  );
};

export default LeanChartsPanel;
```

- [ ] **Step 4: Run the panel test to verify it passes**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/leanCharts/LeanChartsPanel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Swap the panel in for the Classic cards in `views/Instructor.tsx` (additions only)**

(a) Imports. Find:

```tsx
import { LeanDebrief } from '../components/LeanDebrief';
```

and replace it with:

```tsx
import { LeanDebrief } from '../components/LeanDebrief';
import { LeanChartsPanel } from '../components/leanCharts/LeanChartsPanel';
import { useLeanCharts } from '../services/useLeanCharts';
import { leanRoundFlags } from '../services/leanCharts';
```

(b) State. Find:

```tsx
  const leaderboardRoundTouchedRef = useRef(false);
```

and replace it with:

```tsx
  const leaderboardRoundTouchedRef = useRef(false);
  // Lean charts: the round their R1/R2 control shows. It follows the current
  // round until the instructor picks one, like the leaderboard tab.
  const [leanChartsRound, setLeanChartsRound] = useState<1 | 2>((config.round === 2 ? 2 : 1) as 1 | 2);
  const leanChartsRoundTouchedRef = useRef(false);
```

(c) Follow the current round. Find:

```tsx
    if (!leaderboardRoundTouchedRef.current) {
      setLeaderboardRoundTab((config.round === 2 ? 2 : 1) as 1 | 2);
    }
  }, [config.round, config.isActive]);
```

and replace it with:

```tsx
    if (!leaderboardRoundTouchedRef.current) {
      setLeaderboardRoundTab((config.round === 2 ? 2 : 1) as 1 | 2);
    }
    if (!leanChartsRoundTouchedRef.current) {
      setLeanChartsRound((config.round === 2 ? 2 : 1) as 1 | 2);
    }
  }, [config.round, config.isActive]);
```

(d) Lean flags and the two pollers. Find:

```tsx
  const statsR1 = instructorStatsRound1 ?? null;
  const statsR2 = instructorStatsRound2 ?? null;
  const leaderboardStatsSelected = (leaderboardRoundTab === 1 ? statsR1 : statsR2) ?? instructorStats ?? null;
```

and replace it with:

```tsx
  const statsR1 = instructorStatsRound1 ?? null;
  const statsR2 = instructorStatsRound2 ?? null;
  const leaderboardStatsSelected = (leaderboardRoundTab === 1 ? statsR1 : statsR2) ?? instructorStats ?? null;

  /* Lean charts replace the five Classic chart cards when the round their
     round control shows is Lean — the leaderboard's rule: its stats rows carry
     `lean`, or, before stats arrive, the current round's config. Both rounds
     are loaded (charts 3 and 4 overlay them): an ACTIVE round is polled every
     10 s, an ENDED one fetched once, a round not yet started not at all. */
  const leanRounds = useMemo(
    () => leanRoundFlags(statsR1?.leaderboard, statsR2?.leaderboard, config.round === 2 ? 2 : 1, config.marketMode),
    [statsR1?.leaderboard, statsR2?.leaderboard, config.round, config.marketMode],
  );
  const leanChartsR1 = useLeanCharts({
    roundId: roundIds[1],
    teamId: null,
    enabled: leanRounds[1] && roundStatuses[1] != null && roundStatuses[1] !== 'CONFIGURED',
    live: roundStatuses[1] === 'ACTIVE',
  });
  const leanChartsR2 = useLeanCharts({
    roundId: roundIds[2],
    teamId: null,
    enabled: leanRounds[2] && roundStatuses[2] != null && roundStatuses[2] !== 'CONFIGURED',
    live: roundStatuses[2] === 'ACTIVE',
  });
  // A 409 NOT_LEAN_ROUND (a mode change racing the start) hides the panel
  // until a later poll answers again.
  const showLeanCharts =
    leanRounds[leanChartsRound] && !(leanChartsRound === 1 ? leanChartsR1 : leanChartsR2).notLean;
```

(e) Open the swap. The line before this anchor is a blank line that may carry trailing spaces; leave it alone. Find:

```tsx
          {!isChartHidden('sales') && (
            <Card
              title="Cumulative Sales Over Time"
```

and replace it with:

```tsx
          {showLeanCharts ? (
            <LeanChartsPanel
              round={leanChartsRound}
              onRoundChange={(r) => {
                leanChartsRoundTouchedRef.current = true;
                setLeanChartsRound(r);
              }}
              leanRounds={leanRounds}
              r1={leanChartsR1}
              r2={leanChartsR2}
              teamNames={teamNames}
            />
          ) : (
          <>
          {!isChartHidden('sales') && (
            <Card
              title="Cumulative Sales Over Time"
```

(f) Close the swap. Find:

```tsx
              <div className="h-72 w-full">
                {renderChart('unrated_jokes')}
              </div>
            </Card>
          )}

          {/* Live Market (Instructor view) */}
```

and replace it with:

```tsx
              <div className="h-72 w-full">
                {renderChart('unrated_jokes')}
              </div>
            </Card>
          )}
          </>
          )}

          {/* Live Market (Instructor view) */}
```

The five Classic cards between (e) and (f) are not edited; they keep their indentation inside the fragment.

- [ ] **Step 6: Verify Classic is untouched and everything builds**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && git diff --numstat views/Instructor.tsx`
Expected: `52	0	views/Instructor.tsx` — 52 added, zero deleted.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: tsc exits 0; all tests pass; the build succeeds.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components/leanCharts/LeanChartsPanel.tsx components/leanCharts/LeanChartsPanel.test.ts views/Instructor.tsx
git commit -m "feat(lean): lean charts replace the Classic chart cards in Lean rounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Student screens

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `components/leanCharts/StudentLeanCharts.tsx`
- Test: `components/leanCharts/StudentLeanCharts.test.ts`
- Modify: `views/JokeMaker.tsx:17` (import), `:167` (`useGame()`), `:378-382` (card)
- Modify: `views/QualityControl.tsx:25` (import), `:314` (`useGame()`), `:795-799` (card)

**Interfaces:**
- Consumes: `IdleJokesChart`, `LearningCyclesChart` (Task 7); `useLeanCharts` (Task 6); `cyclesForStudent`, `leanRound1Id` (Task 5); `sessionApi.activeRounds()` (`services/api/session.ts`); from `useGame()`: `roundId`, `user.team_id`, `config.round`, `config.isActive`, `config.marketMode`.
- Produces:
  ```ts
  interface StudentLeanChartsProps { roundId: number | null; teamId: number | null; roundNumber: 1 | 2; live: boolean }
  const StudentLeanCharts: React.FC<StudentLeanChartsProps>   // fragment of two compact Cards; null on 409 NOT_LEAN_ROUND
  ```

- [ ] **Step 1: Write the failing test**

Create `components/leanCharts/StudentLeanCharts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentLeanCharts } from './StudentLeanCharts';

describe('StudentLeanCharts', () => {
  it('shows charts 2 and 4 only — never the instructor charts', () => {
    // Effects do not run in a static render, so nothing is fetched.
    const out = renderToStaticMarkup(createElement(StudentLeanCharts, { roundId: 7, teamId: 3, roundNumber: 1, live: true }));
    expect(out).toContain('Jokes standing still');
    expect(out).toContain('More cycles, more learning');
    expect(out).toContain('Your batches · Round 1');
    expect(out).toContain('Class average');
    expect(out).not.toContain('Where the money leaked');
    expect(out).not.toContain('Smaller batches, faster feedback');
    expect(out).toContain('No batches sent yet');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/leanCharts/StudentLeanCharts.test.ts`
Expected: FAIL — `Failed to resolve import "./StudentLeanCharts"`.

- [ ] **Step 3: Write the component**

Create `components/leanCharts/StudentLeanCharts.tsx`:

```tsx
/* The two lean charts on a team screen (Joke Maker and Marketing), where the
   learning-curve card used to be: "Jokes standing still" and "More cycles,
   more learning", compact. Own team only plus the anonymous class average; in
   Round 2 the team's Round 1 batches are drawn faded behind (only if Round 1
   was Lean too). components/LearningCurve.tsx stays in the repo, so going back
   is a one-line change in each view. */
import React, { useEffect, useState } from 'react';
import { sessionApi } from '../../services/api/session';
import { useLeanCharts } from '../../services/useLeanCharts';
import { cyclesForStudent, leanRound1Id } from '../../services/leanCharts';
import { IdleJokesChart } from './IdleJokesChart';
import { LearningCyclesChart } from './LearningCyclesChart';

export interface StudentLeanChartsProps {
  roundId: number | null;
  teamId: number | null;
  roundNumber: 1 | 2;
  /** true while the round is ACTIVE: poll every 10 s; otherwise fetch once. */
  live: boolean;
}

export const StudentLeanCharts: React.FC<StudentLeanChartsProps> = ({ roundId, teamId, roundNumber, live }) => {
  const current = useLeanCharts({ roundId, teamId, enabled: roundId != null && teamId != null, live });

  // Round 2 only: Round 1's id, once, if Round 1 was Lean.
  const [round1Id, setRound1Id] = useState<number | null>(null);
  useEffect(() => {
    if (roundNumber !== 2) {
      setRound1Id(null);
      return undefined;
    }
    let cancelled = false;
    sessionApi.activeRounds()
      .then(res => { if (!cancelled) setRound1Id(leanRound1Id(res.rounds)); })
      .catch(() => { if (!cancelled) setRound1Id(null); });
    return () => { cancelled = true; };
  }, [roundNumber]);
  const earlier = useLeanCharts({
    roundId: round1Id,
    teamId,
    enabled: roundNumber === 2 && round1Id != null && teamId != null,
    live: false,
  });

  if (current.notLean) return null;
  return (
    <>
      <IdleJokesChart
        team={current.data?.teams[0] ?? null}
        classAverage={current.data?.class_average ?? null}
        wipLimit={current.data?.wip_limit ?? 0}
        compact
        unavailable={current.unavailable}
      />
      <LearningCyclesChart model={cyclesForStudent(current.data, roundNumber, earlier.data)} compact unavailable={current.unavailable} />
    </>
  );
};

export default StudentLeanCharts;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/leanCharts/StudentLeanCharts.test.ts`
Expected: PASS.

- [ ] **Step 5: Swap it in on the Joke Maker screen**

In `views/JokeMaker.tsx`, find:

```tsx
import { LearningCurve } from '../components/LearningCurve';
```

and replace it with:

```tsx
import { StudentLeanCharts } from '../components/leanCharts/StudentLeanCharts';
```

Find:

```tsx
  const { user, roster, batches, submitRawBatch, config, teamSummary, teamFeedback } = useGame();
```

and replace it with:

```tsx
  const { user, roster, batches, submitRawBatch, config, teamSummary, teamFeedback, roundId } = useGame();
```

Find:

```tsx
          {leanMode && (
            <Card title="Learning curve" subtitle="Share of each batch's released jokes that sold">
              <LearningCurve series={teamSummary?.lean?.batch_series ?? []} />
            </Card>
          )}
```

and replace it with:

```tsx
          {leanMode && (
            <StudentLeanCharts
              roundId={roundId}
              teamId={user?.team_id ?? null}
              roundNumber={config.round === 2 ? 2 : 1}
              live={config.isActive}
            />
          )}
```

- [ ] **Step 6: Swap it in on the Marketing screen**

In `views/QualityControl.tsx`, find:

```tsx
import { LearningCurve } from '../components/LearningCurve';
```

and replace it with:

```tsx
import { StudentLeanCharts } from '../components/leanCharts/StudentLeanCharts';
```

Find:

```tsx
  const { user, roster, qcQueue, publishBatch, splitBatch, unsplitBatch, config, teamSummary, teamFeedback, batches } = useGame();
```

and replace it with:

```tsx
  const { user, roster, qcQueue, publishBatch, splitBatch, unsplitBatch, config, teamSummary, teamFeedback, batches, roundId } = useGame();
```

Find:

```tsx
          {leanMode && (
            <Card title="Learning curve" subtitle="Share of each batch's released jokes that sold">
              <LearningCurve series={lean?.batch_series ?? []} />
            </Card>
          )}
```

and replace it with:

```tsx
          {leanMode && (
            <StudentLeanCharts
              roundId={roundId}
              teamId={user?.team_id ?? null}
              roundNumber={config.round === 2 ? 2 : 1}
              live={config.isActive}
            />
          )}
```

- [ ] **Step 7: Verify**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -n "LearningCurve" views/*.tsx; ls components/LearningCurve.tsx`
Expected: grep prints nothing; `components/LearningCurve.tsx` still exists.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: tsc exits 0; all tests pass (including the existing `services/leanMode.test.ts` `learningCurvePoints` tests); the build succeeds.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components/leanCharts/StudentLeanCharts.tsx components/leanCharts/StudentLeanCharts.test.ts views/JokeMaker.tsx views/QualityControl.tsx
git commit -m "feat(lean): team screens show idle jokes and learning cycles in Lean rounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Instructor guide and final verification

**Repo:** `~/Documents/GitHub/AI-Joke-Factory` (docs commit); verification runs in both repos.

**Files:**
- Modify: `docs/lean-market-mode.md` (:56, :110-112, :132, :156-159, :303, :316, after the debrief table, :330-331)

**Interfaces:**
- Consumes: everything above, the running local stack, the preview server config `joke-factory-lean-local` (`.claude/launch.json`: frontend on :3005 against the backend on :8081), `scripts/pilot/lean-pilot.mts` in smoke mode.
- Produces: the instructor guide; evidence (command output and screenshots) that the whole feature works and Classic is unchanged.

- [ ] **Step 1: Describe the charts in the instructor guide**

In `docs/lean-market-mode.md`:

(a) Find:

```
| Debrief 1 | 10 min | Shows the Round 1 leaderboard with the Setup, Carrying, Lead and Sale columns. Asks what drove cost and why jokes sat unsold. | Discuss. | Discuss; read the Customer feedback panel and learning curve. |
```

and replace it with:

```
| Debrief 1 | 10 min | Shows the Round 1 leaderboard with the Setup, Carrying, Lead and Sale columns, and the lean charts (section 3). Asks what drove cost and why jokes sat unsold. | Discuss. | Discuss; read the Customer feedback panel and the two lean charts. |
```

(b) Find the paragraph ending:

```
never sold, R1 setup+carry, R2 setup+carry, R1 lead, R2 lead. Teams are sorted by Round 2 profit.
```

and replace it with:

```
never sold, R1 setup+carry, R2 setup+carry, R1 lead, R2 lead. Teams are sorted by Round 2 profit.

**Lean charts.** When the round shown is Lean, the five Classic chart cards (Cumulative Sales Over
Time, Batch Sequence vs Quality, Wasted Jokes, Scatter Plots, Unrated Jokes Over Time) are replaced
by four lean charts in the same place. A bar above them holds a team picker ("All teams" or one
team) and an **R1 / R2** control: the control sets the round of the first two charts, and the last
two always compare both rounds. A round that is not Lean cannot be picked. The charts refresh every
10 seconds while a round runs; if the server cannot be reached three times in a row a card says
"Chart data unavailable — retrying" and keeps the last picture.

| Chart | What it shows | How to read it |
|---|---|---|
| **Where the money leaked** | One bar per team, most waste first, split into Setup, Waiting at Marketing, Unsold on shelf, Published never sold and Discarded, in dollars, with the total at the end. | Shorter bars are leaner. Setup + Waiting + Unsold is exactly the leaderboard's Setup + Carrying for that team. |
| **Jokes standing still** | For one team, the jokes waiting for Marketing (purple) and unsold on the shelf (amber) at each minute of the round, with the class average dashed. With "All teams" it shows the team with the most idle jokes right now. In a round with a WIP limit the subtitle says so, for example "WIP limit: 2 batches". | A growing pile is waste: work that has cost money and has not earned any. |
| **Smaller batches, faster feedback** | One dot per batch: jokes in the batch across, minutes from sending it to its first sale up. Round 1 circles (blue), Round 2 triangles (orange). Batches with no sale yet are hollow, in a "no sale yet" band at the top. | Lower is better: the market answered sooner. Small batches should sit lower. |
| **More cycles, more learning** | With "All teams": the class's sell-through (share of released jokes that sold) for the batches sent in each minute, one line per round. With one team: that team's batches, one dot per batch at the minute it was sent. | More dots in the same 15 minutes means more chances to adjust; a rising line means the team is learning what sells. |
```

(c) Find:

```
The Joke Maker also sees a **Learning curve** card (see Marketing) and the Customer feedback panel.
```

and replace it with:

```
The Joke Maker also sees the two lean charts described under Marketing and the Customer feedback panel.
```

(d) Find:

```
A **Learning curve** card ("Share of each batch's released jokes that sold") plots, for each
batch in the order it was sent, the share of its released jokes that have sold at least once.
A rising line means the team is learning what the market wants. Batches with nothing released are
left out.
```

and replace it with:

```
Two lean charts sit below the tiles. They show the team's own data and an anonymous class
average, never another team by name:

- **Jokes standing still** — the team's jokes waiting for Marketing and unsold on the shelf at
  each minute, with the class average dashed. A growing pile is waste.
- **More cycles, more learning** — one dot per batch at the minute it was sent, showing the share
  of its released jokes that sold; the class average is a dashed line. In Round 2 the team's
  Round 1 batches are drawn faded behind, so the two rounds can be compared. Batches with nothing
  released are left out. A rising line means the team is learning what the market wants.
```

(e) Find:

```
- "Look at the learning curve: are later batches selling better than earlier ones?"
```

and replace it with:

```
- "Look at More cycles, more learning: are later batches selling better than earlier ones?"
- "Jokes standing still: whose pile is growing, and what is it waiting for?"
```

(f) Find:

```
| 8 | Did your learning curve rise? How did you use the customer feedback? | Δ profit, R2 unsold, team learning curves |
```

and replace it with:

```
| 8 | Did your sell-through rise from batch to batch? How did you use the customer feedback? | Δ profit, R2 unsold, More cycles, more learning (pick the team) |

### Debrief with the lean charts

Pick the round with **R1 / R2** and, where it helps, one team in the team picker.

1. **Where the money leaked**, Round 1 then Round 2: "Which colour shrank most? Was it setup
   (fewer changeovers) or waiting (less work piled up in front of Marketing)?"
2. **Jokes standing still**, the most idle team: "When did the pile start to grow? What was the
   Joke Maker doing then, and what was Marketing doing?"
3. **Smaller batches, faster feedback**: "Are the orange triangles lower than the blue circles?
   What did a smaller batch buy you?"
4. **More cycles, more learning**: "How many dots did your team get in Round 1, and in Round 2?
   Did the line rise? Which feedback did you act on?"
```

(g) Find:

```
Nothing else changes. In Classic mode the lean settings are stored but ignored, the lean fields,
tiles, columns and debrief table are hidden, and profit is calculated exactly as before.
```

and replace it with:

```
Nothing else changes. In Classic mode the lean settings are stored but ignored, the lean fields,
tiles, columns, debrief table and lean charts are hidden (the instructor sees the five Classic
chart cards), and profit is calculated exactly as before.
```

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -n -i "learning curve" docs/lean-market-mode.md`
Expected: no output.

- [ ] **Step 2: Full backend verification**

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go build ./... && go vet ./... && go vet -tags integration ./src/infra/repo/postgres/ && go test ./...`
Expected: `gofmt -l` prints nothing; every package passes.

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" go test -count=1 -tags integration ./src/infra/repo/postgres/ -v`
Expected: `TestLeanStatsSQLIntegration` and `TestLeanChartsSQLIntegration` PASS.

- [ ] **Step 3: Full frontend verification**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: tsc exits 0; more than the baseline 518 tests pass with 0 failures; the build succeeds.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && git show --numstat --format=%s "$(git log -1 --format=%H --grep='lean charts replace the Classic chart cards')" -- views/Instructor.tsx`
Expected: `feat(lean): lean charts replace the Classic chart cards in Lean rounds` followed by `52	0	views/Instructor.tsx` (additions only; the Classic cards are untouched).

- [ ] **Step 4: Rebuild the local stack and smoke the routes**

Run: `cd ~/Documents/GitHub/jokefactory_be && APP_LLM_MODE=hash APP_LLM_HASH_CONFIRM=local-pilot-only docker compose -f docker-compose.yml -f /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean/compose.override.yml up -d --build`
Expected: the api and postgres containers are running; `curl -s http://localhost:8081/health` returns `{"status":…}`.

Run: `curl -s http://localhost:8081/v1/rounds/999999/teams/1/lean-charts`
Expected: `{"error":{"code":"NOT_FOUND","message":"resource not found: round",…}}` — the route exists (the router's own 404 would say "The requested resource was not found").

- [ ] **Step 5: Run a short Lean bot class and watch it live**

Read the `anthropic-skills:built-in-browser` skill before the first browser step.

Start the pilot in smoke mode in the background (one Lean class, one team per persona, 60-second window; it resets the local game data first). The password is read by shell substitution and never printed:

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
PILOT_SMOKE=1 E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
  npx tsx scripts/pilot/lean-pilot.mts /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean/charts-smoke.md
```

(Run it with `run_in_background`; do not commit the report it writes to the scratchpad.)

Wait until Round 1 is ACTIVE (use the Monitor tool with an until-loop, or repeat the curl):
`until curl -s http://localhost:8081/v1/rounds/active | jq -e '.data.rounds[] | select(.status=="ACTIVE")' >/dev/null; do sleep 2; done`

Get an instructor id without printing the password, and the round ids:

```bash
IID=$(jq -n --arg p "$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
  '{display_name:"Local Instructor", password:$p}' \
  | curl -s -X POST http://localhost:8081/v1/instructor/login -H 'Content-Type: application/json' -d @- | jq -r '.user.user_id')
echo "instructor id: $IID"
curl -s http://localhost:8081/v1/rounds/active | jq -c '.data.rounds[] | {id, round_number, status, market_mode}'
```

Open the preview: `preview_start` with name `joke-factory-lean-local` (http://localhost:3005). Sign the tab in as that instructor with `javascript_tool` (no password typed into the page):

```js
localStorage.setItem('joke_factory_user_id', '<IID>');
localStorage.setItem('joke_factory_display_name', 'Local Instructor');
localStorage.setItem('joke_factory_role', 'INSTRUCTOR');
localStorage.setItem('joke_factory_round_id', '<Round 1 id>');
location.reload();
```

Then: wait 30 s (three `computer` `wait` actions of 10 s), `read_network_requests` with `urlPattern: "lean-charts"`.
Expected: at least 3 requests to `/v1/instructor/rounds/<Round 1 id>/lean-charts`, about 10 s apart, all 200. `get_page_text` contains "Lean charts", "Where the money leaked", "Jokes standing still", "Smaller batches, faster feedback", "More cycles, more learning", and does not contain "Cumulative Sales Over Time". Take a screenshot of the live grid.

- [ ] **Step 6: Screenshots after the class ends**

When the background pilot finishes, reload the instructor tab.
Expected: both rounds ENDED; the lean charts show Round 2 by default; `read_network_requests` shows one request per round after the reload, then no more (ended rounds are fetched once). Take screenshots of: the grid with R2; the grid after clicking **R1** in the lean-charts bar; the grid with one team picked in "All teams". Hover one point in chart 3 and one in chart 4 and screenshot the tooltips. `read_console_messages` with `onlyErrors: true` shows no errors mentioning lean charts.

Student panels: get the Round 2 bot ids from the lobby and open each in watch mode (a per-tab identity that never touches the instructor's localStorage):

```bash
R2=$(curl -s http://localhost:8081/v1/rounds/active | jq -r '.data.rounds[] | select(.round_number==2) | .id')
curl -s -H "X-User-Id: $IID" "http://localhost:8081/v1/instructor/rounds/$R2/lobby" \
  | jq -c '.data.Teams[0].Members[] | {UserID, DisplayName, Role}'
```

Open a new tab at `http://localhost:3005/?watch=<JM UserID>&watchName=Bot%20JM` and another at `http://localhost:3005/?watch=<MARKETING UserID>&watchName=Bot%20Marketing`.
Expected on both: the side panel shows "Jokes standing still" and "More cycles, more learning" (compact) where the learning curve used to be, the Round 1 batches faded behind the Round 2 ones in chart 4, a dashed class-average line, and no other team's name. Screenshot both.

- [ ] **Step 7: A Classic round shows the old cards unchanged**

Reset the local game (local stack only; the pilot does the same at its start), which returns both rounds to the Classic defaults:

```bash
curl -s -X POST -H "X-User-Id: $IID" http://localhost:8081/v1/admin/reset | jq -c .
```

If the reset removed the instructor user, repeat the instructor-id command from Step 5 and the `localStorage` lines, then reload the instructor tab.
Expected: `get_page_text` contains "Cumulative Sales Over Time", "Batch Sequence vs Quality", "Wasted Jokes", "Scatter Plots" and "Unrated Jokes Over Time", and does not contain "Lean charts"; `read_network_requests` with `urlPattern: "lean-charts"` shows no new requests. Screenshot the Classic grid.

- [ ] **Step 8: Commit the guide**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add docs/lean-market-mode.md
git commit -m "docs(lean): the four lean charts, how to read them, debrief prompts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Report to the user: the commits in each repo, the test counts, and the screenshots (live grid, ended grid R1/R2, a picked team, tooltips, both student panels, the Classic grid). Do not push.

---

## Self-review (done while writing; kept for the reviewer)

- **Spec coverage.** §2 decisions → Global Constraints. §3 charts 1–4 (forms, segments, subtitles, colours, shapes, hollow band, jitter, team picker default, WIP subtitle, student variants, skip published 0) → Tasks 5, 7, 8, 9. §4 placement (instructor swap in the same grid, same rule as the leaderboard; students replace `LearningCurve`) → Tasks 8, 9. §5 routes, access, 409, 404, response shape, definitions, samples, computation (three row sets, extended CTE, pure `BuildLeanCharts`, read-only) → Tasks 1–3. §6 frontend units → Tasks 5–9 (plus `chartParts.tsx`, `StudentLeanCharts.tsx` and `leanCharts.testdata.ts`, which the spec's table does not name). §7 error handling (keep last good, three failures, empty wording, 409 hides) → Tasks 6–9. §8 testing (every listed Go unit case, the integration assertions, vitest for transforms and keep-last-good, browser check incl. Classic) → Tasks 2, 4, 5, 6, 10. §9 out of scope → Global Constraints.
- **Placeholder scan.** No TBD/TODO; every code step has full code; every modification names an exact anchor.
- **Type consistency.** Go: `LeanChartRows`/`LeanChartTeamRow`/`LeanChartBatchRow`/`LeanChartJokeRow` (Task 1) are used with the same field names in Tasks 2 and 4; `LeanCharts`/`LeanChartsTeam`/`LeanWaste`/`IdleSample`/`LeanChartsBatch`/`SellThroughSample` (Task 2) in Tasks 3 and 4; `notLeanRoundCode` (Task 3). TS: JSON keys in `types/api.ts` match the Go json tags; `LeanChartsState`/`EMPTY_LEAN_CHARTS_STATE` (Task 6) in Tasks 8–9; `BatchScatter`, `CyclesModel`, `WASTE_SEGMENTS` (Task 5) in Task 7.
- **Review Focus.** Each of the five lines has a named test in its owning task.

## Spec ambiguities and how this plan resolves them

1. **Sample cap.** "Capped at 120 samples" could mean "keep the first 120". That would freeze the latest sample of a long round (a forgotten 180 s pilot round would stop at ~24 minutes) and break "default team = most idle at the latest sample". Resolution: widen the step (`ceil(elapsed / 119)`) so the last sample still reaches `clock_end`; `sample_seconds` reports the widened step. In every normal round (≤ 119 steps) the spec formula is used unchanged.
2. **"409 `NOT_LEAN_ROUND`".** The backend has no per-error code field; every 409 is `code: "CONFLICT"` and conflicts carry their identifier in `message` (as MARKET_MODE_LOCKED and WIP_LIMIT_REACHED do). Resolution: `domain.NewConflictError("NOT_LEAN_ROUND: …")`; the frontend matches `status === 409 && message.includes('NOT_LEAN_ROUND')`.
3. **Team route for a team with no row in the round.** The spec says "that team + class average" but not what a team without a `team_rounds_state` row gets. Resolution: an all-zero row (as the team summary route returns zeros), 404 only for a team that does not exist.
4. **Agreement "at the same instant".** Two HTTP reads cannot share an instant while a round runs. Resolution: the chart rows are read in one read-only REPEATABLE READ transaction (one `now()`), waste comes straight from the same CTE as the leaderboard, the ended-round integration test asserts equality to the cent, and the running-round test asserts agreement within $0.01 between two reads.
5. **Batches with nothing published on chart 3.** "One point per batch", but a batch with `published = 0` (unsplit, or all discarded) has not been on the market. Resolution: it is plotted hollow in the "no sale yet" band, with the tooltip saying "Nothing released yet" instead of "No sale yet"; chart 4 skips it as the spec says.
6. **Where the round control and team picker live.** Charts 1 and 2 are one round at a time; charts 3 and 4 overlay both rounds; the picker serves charts 2–4. Resolution: one full-width control bar above the four cards, whose caption says the round control sets the first two charts; a round that is not Lean is disabled in the control (otherwise picking a Classic round would swap the whole grid back to the Classic cards with no lean control left to return).
7. **Student Round 1 id.** `roundIds` in the context is populated for the instructor only. Resolution: `StudentLeanCharts` calls `/v1/rounds/active` once in Round 2 and uses Round 1's id only if Round 1 was Lean; `context.tsx` is not changed.
8. **"Hides the panel until the next config refresh".** Resolution: the panel hides while the poller's last answer was 409; a live poller keeps asking every 10 s and the next good answer shows it again. For a round not yet started no request is made at all (empty states show), so the 409 race can only occur during the instant of starting.
9. **Hook tests.** vitest runs in `node` with no React Testing Library. Resolution: the timing logic is a pure `startLeanChartsPoller` tested with fake timers; components are tested with `renderToStaticMarkup`.
