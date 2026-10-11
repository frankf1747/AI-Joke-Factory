# Lean Fees and Next Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Lean rule set for both rounds — real, impactful fees (shipping by batch size, storage on Marketing's desk, hosting on the shelf, listing, discard), Round 1 batches of exactly 5 and Round 2 batches of 1–10, no WIP limit and no Classic UI — plus a "Next step" coaching line on both student screens, and a bot pilot that checks the fees teach the lesson.

**Architecture:** The backend gains five fee columns on `rounds` (migration 0005) with Lean defaults, validated and locked by the config API like the other Lean settings; Reset Game and admin login give Round 1 `batch_size` 5 and Round 2 `batch_size` 10. One change to the stats CTE (`leanTeamCTE`) computes `shipping_cost`, `storage_cost` and `hosting_cost`, which feed the leaderboard, the team summary and the lean charts; `setup_cost` and `carrying_cost` stay as aliases. The frontend reads the fees off the public round, replaces the instructor's mode/preset/WIP controls with fee inputs, renames every cost label after the fees, and adds pure Next step rule functions (`services/nextStep.ts`) whose sentence is rendered under the stat tiles of both team views. The bot personas and the pilot script learn the fees and the Round 2 batch sizes; the pilot itself is run after this plan.

**Tech Stack:** Go (module `jokefactory`, gin, pgx v5, goose SQL migrations applied by hand, in-memory `testutil.Store` for usecase tests, build tag `integration` for Postgres tests); React 19 + TypeScript 5.8 + Vite 6 + vitest 2 (environment `node`; components and whole screens rendered with `react-dom/server` `renderToStaticMarkup`), lucide-react 0.562, Tailwind via the Play CDN; local Docker stack (api on :8081, Postgres on :55432).

**Spec:** `~/Documents/GitHub/AI-Joke-Factory/docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md` (binding; read it first — amounts and copy below are copied from it).

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Reading the edit steps:** "In `file`, replace: … with: …" means the first block occurs exactly once in the file, verbatim (whole lines, tabs in Go), and is replaced by the second; an empty `with` block deletes it. "Create" writes a new file; "Replace the whole of" overwrites one. Paths are relative to the task's repo. Run each `Run:` line from any directory (it `cd`s itself) and compare with its `Expected:`.

- **Repos and branches:** backend `~/Documents/GitHub/jokefactory_be` (HEAD `f3f634b` when this plan was written), frontend `~/Documents/GitHub/AI-Joke-Factory` (HEAD `9441b90`), both on branch `feat/lean-market`. Each task names its repo; commit only in that repo.
- **Git:** new commits only. Never `git reset`, `git commit --amend`, `git rebase`, `git stash` or `git push`. Stage files by name (never `git add -A` / `git add .`). Never stage the frontend's `.claude/launch.json`, `.progress` or `docs/superpowers/plans/2026-10-11-guided-walkthrough.md`. Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never print secrets. Never `cat` `jokefactory_be/.env`; the admin password is only ever read by shell substitution (`$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)`) inside a command. Never run `docker compose config` unfiltered.
- **Databases:** migrations are applied by hand (`goose` / `make migrate-up` with `DB_DSN`); the API never runs them. Tasks 1–2 run integration tests ONLY against the throwaway database `jokefactory_fees_test` on the local Postgres (`postgres://postgres:postgres@localhost:55432/jokefactory_fees_test?sslmode=disable`), created and migrated in Task 1 and dropped in Task 7. The real local `jokefactory` database is migrated only in Task 7.
- **Migration 0005 (`0005_lean_fees.sql`):** adds to `rounds` `shipping_fee_small`, `shipping_fee_standard`, `shipping_fee_large` (`NUMERIC(10,2) NOT NULL DEFAULT 0`) and `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute` (`NUMERIC(10,4) NOT NULL DEFAULT 0`), each `CHECK (… >= 0)`. `setup_cost_per_batch` and `carrying_cost_per_joke_minute` stay, stored but no longer read by stats.
- **Defaults (`domain.DefaultRoundConfig`):** `MarketMode` LEAN; shipping 1 / 2 / 3; storage 0.10; hosting 0.05; `WIPLimit` 0; `PreferenceBase` 3; `CustomerCount` 150; `ArrivalWindowSeconds` 900; `BatchSize` 5. `domain.DefaultRoundConfigFor(n)` is the same with `BatchSize` 10 for `n >= 2`.
- **Batch sizes:** Reset Game, admin login (which creates rounds 1 and 2) and a config call that creates a round use `DefaultRoundConfigFor(round number)`: Round 1 `batch_size` 5 (exactly 5, the existing rule), Round 2 `batch_size` 10 (up to 10, the existing rule). The instructor screen no longer edits batch size.
- **Shipping tiers:** 1–4 jokes → small, exactly 5 → standard, 6 or more → large. A batch with no joke rows (unsplit) counts as **5** jokes (`domain.StandardShipmentJokes`) for the shipping fee and for storage, in every round, whatever `batch_size` is, until it is split.
- **Profit:** `sales × market_price − cost_of_publishing × published − cost_of_discard × discarded − shipping_cost − storage_cost − hosting_cost`, with `storage_cost = storage_fee × WIP joke-minutes` and `hosting_cost = hosting_fee × inventory joke-minutes` (the existing clocks, stopping at `ended_at`).
- **Config API:** `POST /v1/instructor/rounds/:id/config` (and the optional body of `/start`) accepts `shipping_fee_small`, `shipping_fee_standard`, `shipping_fee_large`, `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute` (all optional). Each must be ≥ 0 (400 `VALIDATION_ERROR`, `field` = the key); `small ≤ standard ≤ large` (400 on field `shipping_fee_standard`). Changing any of them once the round has left CONFIGURED is 409 whose message contains `MARKET_MODE_LOCKED`; re-sending the stored values (compared at the stored scale) is allowed. The same five keys are on the instructor round and on every public round (`GET /v1/rounds/active`).
- **Stats API:** the `lean` block (leaderboard rows and team summary) gains `shipping_cost`, `storage_cost`, `hosting_cost`; `setup_cost` = `shipping_cost` and `carrying_cost` = `storage_cost + hosting_cost` stay as aliases. Lean charts keep their JSON keys: `waste.setup` = shipping, `waste.waiting` = storage, `waste.shelf` = hosting.
- **Student-facing names (verbatim):** "Shipping fee", "Storage fee", "Hosting fee", "Listing fee"; Marketing tiles **"Shipping fees"**, **"Storage fees"**, **"Hosting fees"**; leaderboard columns **"Shipping"**, **"Storage"**, **"Hosting"**, "Lead", "Sale"; Round 1 vs Round 2 columns **"R1 Fees"** / **"R2 Fees"** (shipping + storage + hosting); waste segments **"Shipping"**, **"Storage (waiting on Marketing's desk)"**, **"Hosting (unsold on the shelf)"**, **"Listing fees on never-sold jokes"**, **"Discards"** (colours unchanged).
- **Tooltips (verbatim, amounts from the round):** Shipping "Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10." · Storage "Every minute a joke waits on Marketing's desk costs 10¢." · Hosting "Every minute a released joke sits unsold costs 5¢."
- **Joke Maker copy:** shipping line Round 1 **"Shipping: $2 per batch of 5"**, Round 2 **"Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10"** (amounts from the round: whole dollars print as `$2`, others as `$0.50`); Round 2 brief "Generate up to 10 jokes with any AI tool (smaller batches are fine) and paste the whole response below." No WIP counter.
- **Instructor CONFIG copy:** "R1 batch: 5 (exactly)", "R2 batch: up to 10", "Arrival window (s):", "Shipping fee (1–4 / 5 / 6–10 jokes):" (three inputs), "Storage fee per joke-minute:", "Hosting fee per joke-minute:". No Market mode select, no Lean class preset button, no WIP limit field, no R1 Batch Size input.
- **Next step line:** a small rounded bar (blue `bg-sky-50` for info, amber `bg-amber-50` for warn) with a lucide `ArrowRight` icon and the label "Next step", directly under the stat tiles of the Joke Maker and Marketing screens, recomputed every second and on every poll. Rules and copy verbatim from spec §6, first match wins; the storage amount in Marketing rule 2 comes from the round (`fmtPerMinute`, "10¢ a joke each minute"). Thresholds: note fresh while its batch was sent ≤ 120 s ago; big batch ≥ 6 jokes (Round 2 only); Joke Maker idle ≥ 90 s; desk wait ≥ 45 s; discard share ≥ 60 %; notes quoted up to 80 characters then "…".
- **Bots:** Round 2 batch sizes Spray 10, Balanced 5, Careful 5, Learner 3 (capped at the round's `batch_size`); Round 1 always `batch_size` (5). The per-round cap is 40 jokes in both rounds (`JOKE_CAP_PER_ROUND`).
- **Pilot script:** one class, Round 1 then Round 2, 12 teams (3 per persona), bots at 10×, `PILOT_WINDOW` default 90 s, storage and hosting sent ×10, shipping unscaled, local-only guard kept; report per persona and round: revenue, shipping, storage, hosting, listing, profit, batches, mean batch size, send → first sale, fees % of revenue, plus the three spec §7 checks as PASS/FAIL lines.
- **Unchanged:** the backend Classic code paths (a CLASSIC round still computes Classic profit; only the defaults change), scoring, customers, notes, feedback, the guided walkthrough plan (spec §8).

Baselines (verified 2026-10-11 on the HEADs above): backend `gofmt -l .` clean, `go build ./... && go vet ./... && go vet -tags integration ./...` clean, `go test ./...` passes **153** tests (subtests included); frontend `npx tsc --noEmit -p tsconfig.json` exits 0, `npx vitest run` passes **628 tests in 38 files**, `npx vite build` succeeds. The local stack runs (`jokefactory_be-api-1` on :8081, `jokefactory-postgres` on :55432) with goose at version 4 on the real `jokefactory` database.

## Review Focus

The five failure modes most likely to bite a real class, each pinned by a test in the owning task:

1. **A pasted batch nobody splits before the round ends** — it must ship at the standard fee and store as 5 jokes right up to `ended_at` (not to "now", not as `batch_size` 10). Pinned: Task 2 `TestUnsplitBatchIsChargedUntilTheRoundEnds` (memstore, read two hours after the end) and `TestLeanFeesSQLIntegration` (SQL, an unsplit batch sent a minute before the end of a `batch_size` 10 round); `TestBuildLeanChartsUnsplitBatchCountsFiveJokes`.
2. **A Round 2 batch of exactly 4, 5 or 6 jokes** — the tier boundaries: 4 is small, 5 standard, 6 large, in SQL and memstore alike. Pinned: Task 1 `TestShippingFeeForTiers`; Task 2 team 2 of `TestLeanFeesInStatsAndCharts` and team B of `TestLeanFeesSQLIntegration` (batches of 4, 5, 6 → $6.00); Task 3A `shippingFeeFor` test (1, 4, 5, 6, 10, unknown).
3. **The instructor edits fees at the wrong time or to nonsense** — after Start: 409 and nothing written; before Start: negatives and `small > standard` / `standard > large` refused on the right field; the screen greys the fields out once the round started. Pinned: Task 1 `TestConfigLocksLeanFeesOnceStarted`, `TestConfigAllowsResendingSameLeanFeesOnceStarted`, `TestConfigRejectsBadLeanFees`, `TestLeanFeesRoutes` (400 on the field over HTTP); Task 3A `FeeConfigFields` lock test and `Instructor.render.test.ts` "greys them out once the selected round has started".
4. **Mixed versions** — an older frontend against the new backend (the `setup_cost`/`carrying_cost` aliases still add up to the fees), and the new frontend against an older backend (no `shipping_cost` keys: fall back to the aliases, never `NaN` on a tile or a column). Pinned: Task 2 alias assertions in `TestLeanFeesInStatsAndCharts` and `TestLeanFeesSQLIntegration`; Task 3B `leanFeesOf` test and "reads an older backend's setup and carrying costs without showing NaN" (leaderboard); Task 4 the same for Marketing's tiles.
5. **The Next step line with partial data** — before the first poll (no summary, no batches, no desk), exactly at each threshold, several rules matching at once, a long or multi-line note. It must never throw, never show a rule whose data is missing, and pick rules in spec order. Pinned: Task 5 boundary tests (119/120/121 s note, 5/6 jokes, 89/90 s idle, 44/45 s desk, 2/5 vs 3/5 discards), "the first matching rule wins" (both roles), `quoteNote` tests (80 characters, emoji, line breaks), and `views/nextStep.render.test.ts` "renders on both screens before anything has loaded".

## File Structure

Backend (`~/Documents/GitHub/jokefactory_be`):

| File | Action | Responsibility |
|---|---|---|
| `src/infra/db/migrations/0005_lean_fees.sql` | Create | The five fee columns. |
| `src/core/domain/defaults.go` | Replace | Lean defaults, `DefaultRound2BatchSize`, fee defaults. |
| `src/core/domain/lean_fees.go` | Create | `StandardShipmentJokes`, `ShippingFeeFor`, `DefaultRoundConfigFor`. |
| `src/core/domain/round_config.go`, `entities.go`, `market_mode.go` | Modify | Fee fields on `RoundConfig` and `Round`; comment. |
| `src/core/domain/lean_fees_test.go` | Create | Defaults, round-2 batch size, tiers. |
| `src/core/domain/market_mode_test.go` | Modify | Drop the Classic-default test. |
| `src/core/usecase/instructor.go` | Modify | `validateLeanFees`, lock, `MergeConfig`, `PartialRoundConfig`. |
| `src/core/usecase/admin_auth.go` | Modify | Login creates round 2 with batch size 10. |
| `src/app/http/dto/models.go`, `dto/round.go` | Modify | Fee keys on the config request and on `PublicRound`. |
| `src/app/http/handler/instructor.go` | Modify | `partialConfig`, `DefaultRoundConfigFor`, `hasConfigFields`. |
| `src/infra/repo/postgres/mapper.go`, `round_repo.go` | Modify | Read/write the columns; `ResetGame` per-round batch size. |
| `src/core/usecase/testutil/memstore.go` | Modify | `applyConfig`; `ResetGame` mirrors Postgres. |
| `src/core/usecase/lean_fees_test.go`, `src/app/server/lean_fees_routes_test.go` | Create | Usecase and HTTP tests of Task 1. |
| `src/infra/repo/postgres/lean_fees_integration_test.go` | Create | Column round trip; guarded Reset Game test. |
| `src/core/usecase/{lean_config_test.go,batch_sales_test.go,e2e_test.go}`, `src/app/server/lean_charts_routes_test.go` | Modify | Pin Classic where a test means Classic. |
| `README.md` | Modify | Deploying migration 0005. |
| `src/core/ports/repositories.go` | Modify | `ShippingCost`/`StorageCost`/`HostingCost` on `LeanTeamStats`; `ShippingCost` on `LeanChartTeamRow`. |
| `src/infra/repo/postgres/lean_stats_repo.go`, `lean_charts_repo.go` | Modify | The CTE and its scans. |
| `src/core/usecase/lean_charts.go` | Modify | Waste from the fees; unsplit = 5. |
| `src/core/usecase/testutil/memstore_lean_stats.go`, `memstore_lean_charts.go` | Modify | Mirror the CTE. |
| `src/core/usecase/lean_fees_stats_test.go`, `src/infra/repo/postgres/lean_fees_stats_integration_test.go` | Create | Task 2 tests (memstore, SQL). |
| `src/core/usecase/{lean_stats_test.go,lean_charts_test.go,lean_chart_rows_test.go}`, `src/infra/repo/postgres/{lean_stats,lean_charts}_integration_test.go` | Modify | Fixtures on the fee columns. |

Frontend (`~/Documents/GitHub/AI-Joke-Factory`):

| File | Action | Responsibility |
|---|---|---|
| `types/api.ts`, `types.ts` | Modify | Fee keys on rounds, config request, `LeanTeamStats`, `GameConfig`, team summary `lean`. |
| `services/leanMode.ts` (+ `leanMode.test.ts`) | Replace / Modify | Fee config mapping, `shippingFeeFor`, `fmtFee`/`fmtCents`/`fmtPerMinute`, `leanFeesOf`, `LEAN_LEADERBOARD_COLUMNS`, `shippingLine`, `feeTooltips`; preset and `wipStatus` removed. |
| `context.tsx` | Modify | Export `GameContext`/`GameContextType`; stop sending `batch_size`. |
| `services/instructorService.ts`, `scripts/smoke-api.ts` | Modify | Fee keys. |
| `components/FeeConfigFields.tsx` (+ test) | Create | The Lean part of CONFIG. |
| `views/Instructor.tsx` | Modify | CONFIG without mode/preset/WIP/batch input; fee leaderboard columns; debrief subtitle. |
| `views/testing/renderWithGame.ts` | Create | Render a whole screen in a fake game. |
| `views/Instructor.render.test.ts`, `views/Instructor.leaderboard.render.test.ts` | Create | Instructor screen tests. |
| `components/LeanDebrief.tsx` (+ `LeanDebrief.render.test.ts`) | Modify / Create | "Fees" column. |
| `services/leanCharts.ts`, `components/leanCharts/WasteBreakdownChart.tsx`, `leanCharts.render.test.ts` | Modify | Waste segment names. |
| `components/ui.tsx` | Modify | `StatBox` `title`. |
| `views/JokeMaker.tsx`, `views/QualityControl.tsx` | Modify | Shipping line, R2 brief, no WIP; fee tiles; Next step line. |
| `views/studentScreens.render.test.ts` | Create | Student screen fee tests. |
| `services/nextStep.ts` (+ test), `components/NextStep.tsx` (+ test), `views/nextStep.render.test.ts` | Create | The Next step line. |
| `services/bots/personas.ts`, `engine.ts` (+ tests) | Modify | Round 2 sizes, 40-joke cap. |
| `services/shared/client.ts` | Modify | `instructorLeanCharts`. |
| `scripts/pilot/report.ts`, `report.test.ts`, `lean-pilot.mts` | Replace | The fees pilot. |
| `docs/lean-market-mode.md` | Replace | One rule set, fees, Next step, debrief prompts. |

---
## Task 1: Backend — fee columns, Lean defaults, config API, Round 2 batches of up to 10

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Create: `src/infra/db/migrations/0005_lean_fees.sql`, `src/core/domain/lean_fees.go`
- Replace: `src/core/domain/defaults.go`
- Modify: `src/core/domain/round_config.go` (`RoundConfig`, `DefaultRoundConfig`, `ConfigFromRound`), `src/core/domain/entities.go` (`Round`), `src/core/domain/market_mode.go` (comment), `src/core/usecase/instructor.go` (`leanSettingsChanged`, `validateLeanConfig`, new `validateLeanFees`, `MergeConfig`, `PartialRoundConfig`), `src/core/usecase/admin_auth.go` (`Login`), `src/app/http/dto/models.go` (`ConfigRequest`), `src/app/http/dto/round.go` (`PublicRound`, `ToPublicRound`), `src/app/http/handler/instructor.go` (`Config`, `StartRound`, new `partialConfig`, `hasConfigFields`), `src/infra/repo/postgres/mapper.go` (`roundColumns`, `scanRound`), `src/infra/repo/postgres/round_repo.go` (`UpdateRoundConfig`, `InsertRoundConfig`, `ResetGame`), `src/core/usecase/testutil/memstore.go` (`applyConfig`, `ResetGame`), `README.md`
- Test: create `src/core/domain/lean_fees_test.go`, `src/core/usecase/lean_fees_test.go`, `src/app/server/lean_fees_routes_test.go`, `src/infra/repo/postgres/lean_fees_integration_test.go`; modify `src/core/domain/market_mode_test.go`, `src/core/usecase/lean_config_test.go`, `src/core/usecase/batch_sales_test.go`, `src/core/usecase/e2e_test.go`, `src/app/server/lean_charts_routes_test.go`

**Interfaces:**
- Consumes: `testutil.NewStore`, `(*Store).GetRoundByID/GetUserByDisplayName/GetIdealProfile`, `usecase.NewAdminAuthService(repo, password)`, `(*AdminAuthService).Login/ResetGame`, `usecase.NewInstructorService(repo, nil, log)`, `(*InstructorService).Config/StartRound/GetRound`, `newLeanConfigInstructor()` (`src/core/usecase/lean_config_test.go`), `testutil.ValidIdealProfile()`, `server.New(cfg, log, repo, nil, nil).Router()`, `config.Config{Admin: config.AdminConfig{AdminPassword: …}}`.
- Produces:
  ```go
  // package domain
  const StandardShipmentJokes = 5
  const DefaultRound2BatchSize = 10
  const DefaultShippingFeeSmall, DefaultShippingFeeStandard, DefaultShippingFeeLarge = 1.0, 2.0, 3.0
  const DefaultStorageFeePerJokeMinute, DefaultHostingFeePerJokeMinute = 0.10, 0.05
  func ShippingFeeFor(jokes int, small, standard, large float64) float64 // jokes <= 0 = unsplit = 5
  func DefaultRoundConfigFor(roundNumber int) RoundConfig               // BatchSize 10 for roundNumber >= 2
  // RoundConfig and Round both gain:
  ShippingFeeSmall, ShippingFeeStandard, ShippingFeeLarge, StorageFeePerJokeMinute, HostingFeePerJokeMinute float64
  // package usecase — PartialRoundConfig gains the same five names as *float64.
  // package dto — ConfigRequest gains them as *float64, PublicRound as float64, with JSON keys
  //   shipping_fee_small, shipping_fee_standard, shipping_fee_large,
  //   storage_fee_per_joke_minute, hosting_fee_per_joke_minute
  ```
  Wire: `POST /v1/instructor/rounds/:id/config` body may carry the five keys; `data.round` of that response and every `data.rounds[i]` of `GET /v1/rounds/active` carry them. Errors: 400 `VALIDATION_ERROR` with `field` (negative → that key; `small > standard` or `standard > large` → `shipping_fee_standard`); 409 `CONFLICT` with `MARKET_MODE_LOCKED` in the message for a change after Start.

- [ ] **Step 1: Write the failing domain tests**

Create `src/core/domain/lean_fees_test.go`:

```go
package domain

import "testing"

// One Lean rule set for both rounds (spec §4 Defaults).
func TestDefaultRoundConfigIsTheLeanRuleSet(t *testing.T) {
	cfg := DefaultRoundConfig()
	if cfg.MarketMode != MarketLean {
		t.Fatalf("default mode %q; want LEAN", cfg.MarketMode)
	}
	if cfg.ShippingFeeSmall != 1 || cfg.ShippingFeeStandard != 2 || cfg.ShippingFeeLarge != 3 {
		t.Fatalf("shipping fees %v / %v / %v; want 1 / 2 / 3",
			cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge)
	}
	if cfg.StorageFeePerJokeMinute != 0.10 || cfg.HostingFeePerJokeMinute != 0.05 {
		t.Fatalf("storage %v, hosting %v; want 0.10, 0.05", cfg.StorageFeePerJokeMinute, cfg.HostingFeePerJokeMinute)
	}
	if cfg.WIPLimit != 0 || cfg.PreferenceBase != 3 || cfg.CustomerCount != 150 || cfg.ArrivalWindowSeconds != 900 {
		t.Fatalf("wip %d, preference base %v, customers %d, window %d; want 0, 3, 150, 900",
			cfg.WIPLimit, cfg.PreferenceBase, cfg.CustomerCount, cfg.ArrivalWindowSeconds)
	}
	if cfg.BatchSize != 5 {
		t.Fatalf("round 1 batch size %d; want 5", cfg.BatchSize)
	}
}

func TestDefaultRoundConfigForGivesRound2UpToTenJokes(t *testing.T) {
	if got := DefaultRoundConfigFor(1).BatchSize; got != 5 {
		t.Fatalf("round 1 batch size %d; want 5", got)
	}
	for _, n := range []int{2, 3} {
		got := DefaultRoundConfigFor(n)
		if got.BatchSize != 10 {
			t.Fatalf("round %d batch size %d; want 10", n, got.BatchSize)
		}
		got.BatchSize = 5
		if got != DefaultRoundConfig() {
			t.Fatalf("round %d differs from the defaults beyond batch size: %+v", n, got)
		}
	}
}

func TestShippingFeeForTiers(t *testing.T) {
	for _, tc := range []struct {
		jokes int
		want  float64
	}{
		{0, 2}, // unsplit: the standard shipment
		{-1, 2},
		{1, 1}, {4, 1},
		{5, 2},
		{6, 3}, {10, 3}, {12, 3},
	} {
		if got := ShippingFeeFor(tc.jokes, 1, 2, 3); got != tc.want {
			t.Errorf("ShippingFeeFor(%d) = %v; want %v", tc.jokes, got, tc.want)
		}
	}
}
```

In `src/core/domain/market_mode_test.go`, replace the Classic-default test (Lean is the default now; `lean_fees_test.go` pins the new defaults):

```go

func TestDefaultRoundConfigIsClassic(t *testing.T) {
	cfg := DefaultRoundConfig()
	if cfg.MarketMode != MarketClassic {
		t.Fatalf("default mode %q", cfg.MarketMode)
	}
	if cfg.ArrivalWindowSeconds != 900 || cfg.PreferenceBase != 2 || cfg.SetupCostPerBatch != 0 ||
		cfg.CarryingCostPerJokeMinute != 0 || cfg.WIPLimit != 0 {
		t.Fatalf("lean defaults wrong: %+v", cfg)
	}
}
```

with:

```go
```

- [ ] **Step 2: Write the failing usecase, HTTP and integration tests**

Create `src/core/usecase/lean_fees_test.go`:

```go
package usecase_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase"
	"jokefactory/src/core/usecase/testutil"
)

// Admin login creates both rounds with the Lean rule set: Round 1 batches of
// exactly 5, Round 2 batches of up to 10. Reset Game puts both back, whatever
// the instructor changed, and keeps the instructor.
func TestLoginAndResetGiveRound1FiveAndRound2Ten(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	admin := usecase.NewAdminAuthService(st, "pw")
	if _, err := admin.Login(ctx, "Instructor", "pw"); err != nil {
		t.Fatal(err)
	}
	checkRounds := func(when string) {
		t.Helper()
		for _, want := range []struct {
			id        int64
			batchSize int
		}{{1, 5}, {2, 10}} {
			rd, err := st.GetRoundByID(ctx, want.id)
			if err != nil {
				t.Fatalf("%s: round %d: %v", when, want.id, err)
			}
			if rd.BatchSize != want.batchSize || rd.Status != domain.RoundConfigured || rd.MarketMode != domain.MarketLean ||
				rd.ShippingFeeStandard != 2 || rd.StorageFeePerJokeMinute != 0.10 || rd.HostingFeePerJokeMinute != 0.05 ||
				rd.StartedAt != nil {
				t.Fatalf("%s: round %d = %+v; want CONFIGURED LEAN, batch size %d, default fees",
					when, want.id, rd, want.batchSize)
			}
		}
	}
	checkRounds("after login")

	instructor := usecase.NewInstructorService(st, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	changed := domain.DefaultRoundConfigFor(2)
	changed.BatchSize = 4
	changed.StorageFeePerJokeMinute = 0.5
	if _, err := instructor.Config(ctx, 2, &changed, testutil.ValidIdealProfile()); err != nil {
		t.Fatal(err)
	}
	round1 := domain.DefaultRoundConfig()
	if _, err := instructor.Config(ctx, 1, &round1, testutil.ValidIdealProfile()); err != nil {
		t.Fatal(err)
	}
	if _, err := instructor.StartRound(ctx, 1); err != nil {
		t.Fatal(err)
	}

	if err := admin.ResetGame(ctx); err != nil {
		t.Fatal(err)
	}
	checkRounds("after reset")
	if _, err := st.GetUserByDisplayName(ctx, "Instructor"); err != nil {
		t.Fatalf("the instructor did not survive the reset: %v", err)
	}
	if profile, _ := st.GetIdealProfile(ctx, 1); len(profile) != 0 {
		t.Fatalf("reset kept round 1's ideal profile: %v", profile)
	}
}

func TestConfigRejectsBadLeanFees(t *testing.T) {
	for _, tc := range []struct {
		name, field string
		mutate      func(*domain.RoundConfig)
	}{
		{"small negative", "shipping_fee_small", func(c *domain.RoundConfig) { c.ShippingFeeSmall = -0.01 }},
		{"standard negative", "shipping_fee_standard", func(c *domain.RoundConfig) { c.ShippingFeeStandard = -1 }},
		{"large negative", "shipping_fee_large", func(c *domain.RoundConfig) { c.ShippingFeeLarge = -3 }},
		{"storage negative", "storage_fee_per_joke_minute", func(c *domain.RoundConfig) { c.StorageFeePerJokeMinute = -0.1 }},
		{"hosting negative", "hosting_fee_per_joke_minute", func(c *domain.RoundConfig) { c.HostingFeePerJokeMinute = -0.05 }},
		{"small above standard", "shipping_fee_standard", func(c *domain.RoundConfig) { c.ShippingFeeSmall = 2.5 }},
		{"standard above large", "shipping_fee_standard", func(c *domain.RoundConfig) { c.ShippingFeeStandard = 3.5 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st, svc := newLeanConfigInstructor()
			cfg := domain.DefaultRoundConfig()
			tc.mutate(&cfg)
			_, err := svc.Config(context.Background(), 1, &cfg, nil)
			var de *domain.DomainError
			if !domain.IsValidationError(err) || !errors.As(err, &de) || de.Field != tc.field {
				t.Fatalf("want a validation error on %s, got %v", tc.field, err)
			}
			if _, ok := st.Rounds[1]; ok {
				t.Fatal("a rejected config was written")
			}
		})
	}
}

func TestConfigAcceptsFlatAndFreeShipping(t *testing.T) {
	_, svc := newLeanConfigInstructor()
	for _, fees := range [][3]float64{{2, 2, 2}, {0, 0, 0}, {0.5, 1.25, 7}} {
		cfg := domain.DefaultRoundConfig()
		cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge = fees[0], fees[1], fees[2]
		cfg.StorageFeePerJokeMinute, cfg.HostingFeePerJokeMinute = 0, 0
		res, err := svc.Config(context.Background(), 1, &cfg, nil)
		if err != nil {
			t.Fatalf("fees %v: %v", fees, err)
		}
		got := domain.ConfigFromRound(res.Round)
		if got.ShippingFeeSmall != fees[0] || got.ShippingFeeStandard != fees[1] || got.ShippingFeeLarge != fees[2] {
			t.Fatalf("fees %v not persisted: %+v", fees, got)
		}
	}
}

func TestMergeConfigLeanFees(t *testing.T) {
	base := domain.DefaultRoundConfig()
	small, standard, large, storage, hosting := 0.5, 1.5, 2.5, 0.2, 0.01
	got := usecase.MergeConfig(&base, &usecase.PartialRoundConfig{
		ShippingFeeSmall: &small, ShippingFeeStandard: &standard, ShippingFeeLarge: &large,
		StorageFeePerJokeMinute: &storage, HostingFeePerJokeMinute: &hosting,
	})
	if got.ShippingFeeSmall != 0.5 || got.ShippingFeeStandard != 1.5 || got.ShippingFeeLarge != 2.5 ||
		got.StorageFeePerJokeMinute != 0.2 || got.HostingFeePerJokeMinute != 0.01 {
		t.Fatalf("fee overlay not merged: %+v", got)
	}
	if kept := usecase.MergeConfig(&base, &usecase.PartialRoundConfig{}); kept != base {
		t.Fatalf("nil overlay changed config: %+v", kept)
	}
}

// startedDefaultRound configures round 1 with the defaults and starts it.
func startedDefaultRound(t *testing.T, svc *usecase.InstructorService) domain.RoundConfig {
	t.Helper()
	ctx := context.Background()
	cfg := domain.DefaultRoundConfig()
	if _, err := svc.Config(ctx, 1, &cfg, testutil.ValidIdealProfile()); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.StartRound(ctx, 1); err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestConfigLocksLeanFeesOnceStarted(t *testing.T) {
	for name, mutate := range map[string]func(*domain.RoundConfig){
		"shipping small":    func(c *domain.RoundConfig) { c.ShippingFeeSmall = 0.5 },
		"shipping standard": func(c *domain.RoundConfig) { c.ShippingFeeStandard = 2.5 },
		"shipping large":    func(c *domain.RoundConfig) { c.ShippingFeeLarge = 4 },
		"storage":           func(c *domain.RoundConfig) { c.StorageFeePerJokeMinute = 0.2 },
		"hosting":           func(c *domain.RoundConfig) { c.HostingFeePerJokeMinute = 0.1 },
	} {
		t.Run(name, func(t *testing.T) {
			_, svc := newLeanConfigInstructor()
			cfg := startedDefaultRound(t, svc)
			mutate(&cfg)
			_, err := svc.Config(context.Background(), 1, &cfg, nil)
			var de *domain.DomainError
			if !domain.IsConflict(err) || !errors.As(err, &de) || !strings.Contains(de.Message, "MARKET_MODE_LOCKED") {
				t.Fatalf("want a MARKET_MODE_LOCKED conflict, got %v", err)
			}
			rd, err := svc.GetRound(context.Background(), 1)
			if err != nil {
				t.Fatal(err)
			}
			if got := domain.ConfigFromRound(rd); got != domain.DefaultRoundConfig() {
				t.Fatalf("a rejected fee change was written: %+v", got)
			}
		})
	}
}

func TestConfigAllowsResendingSameLeanFeesOnceStarted(t *testing.T) {
	_, svc := newLeanConfigInstructor()
	cfg := startedDefaultRound(t, svc)
	// Values that round to the stored scale are the same values.
	cfg.ShippingFeeStandard = 2.000001
	cfg.StorageFeePerJokeMinute = 0.100000001
	cfg.MarketPrice = 2
	if _, err := svc.Config(context.Background(), 1, &cfg, nil); err != nil {
		t.Fatalf("resending the same fees on an ACTIVE round: %v", err)
	}
	rd, err := svc.GetRound(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if rd.MarketPrice != 2 {
		t.Fatalf("price change not written: %+v", rd)
	}
}

func TestConfigAllowsLeanFeeChangesBeforeStart(t *testing.T) {
	_, svc := newLeanConfigInstructor()
	cfg := domain.DefaultRoundConfig()
	if _, err := svc.Config(context.Background(), 1, &cfg, nil); err != nil {
		t.Fatal(err)
	}
	cfg.ShippingFeeLarge = 5
	cfg.HostingFeePerJokeMinute = 0.2
	res, err := svc.Config(context.Background(), 1, &cfg, nil)
	if err != nil {
		t.Fatalf("fee change on a CONFIGURED round: %v", err)
	}
	if res.Round.ShippingFeeLarge != 5 || res.Round.HostingFeePerJokeMinute != 0.2 {
		t.Fatalf("fee change not written: %+v", res.Round)
	}
}
```

Create `src/app/server/lean_fees_routes_test.go`:

```go
package server_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"jokefactory/src/app/server"
	"jokefactory/src/core/usecase/testutil"
	"jokefactory/src/infra/config"
)

func feesRequest(t *testing.T, h http.Handler, method, path string, userID int64, body any) (int, map[string]any) {
	t.Helper()
	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		payload = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, payload)
	req.Header.Set("Content-Type", "application/json")
	if userID != 0 {
		req.Header.Set("X-User-Id", strconv.FormatInt(userID, 10))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s %s: %v\n%s", method, path, err, rec.Body.String())
	}
	return rec.Code, out
}

// The five fee keys travel on the config request and come back on the
// instructor round and on the students' public round; a bad value is a 400 on
// its field; Reset Game restores the defaults with Round 2 batches up to 10.
func TestLeanFeesRoutes(t *testing.T) {
	st := testutil.NewStore()
	cfg := &config.Config{Admin: config.AdminConfig{AdminPassword: "pw"}}
	h := server.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), st, nil, nil).Router()

	code, login := feesRequest(t, h, http.MethodPost, "/v1/instructor/login", 0,
		map[string]any{"display_name": "Instructor", "password": "pw"})
	if code != http.StatusOK {
		t.Fatalf("login: %d %v", code, login)
	}
	instructor := int64(login["user"].(map[string]any)["user_id"].(float64))

	fees := map[string]any{
		"shipping_fee_small": 0.5, "shipping_fee_standard": 1.5, "shipping_fee_large": 2.5,
		"storage_fee_per_joke_minute": 0.2, "hosting_fee_per_joke_minute": 0.03,
	}
	code, body := feesRequest(t, h, http.MethodPost, "/v1/instructor/rounds/2/config", instructor, fees)
	if code != http.StatusOK {
		t.Fatalf("config: %d %v", code, body)
	}
	round := body["data"].(map[string]any)["round"].(map[string]any)
	for k, v := range fees {
		if round[k] != v {
			t.Errorf("instructor round %s = %v; want %v", k, round[k], v)
		}
	}
	if round["batch_size"].(float64) != 10 || round["market_mode"] != "LEAN" {
		t.Errorf("round 2 batch_size %v, market_mode %v; want 10, LEAN", round["batch_size"], round["market_mode"])
	}

	publicRound := func(number float64) map[string]any {
		t.Helper()
		code, body := feesRequest(t, h, http.MethodGet, "/v1/rounds/active", 0, nil)
		if code != http.StatusOK {
			t.Fatalf("rounds/active: %d %v", code, body)
		}
		for _, r := range body["data"].(map[string]any)["rounds"].([]any) {
			if m := r.(map[string]any); m["round_number"] == number {
				return m
			}
		}
		t.Fatalf("round %v not listed", number)
		return nil
	}
	r2 := publicRound(2)
	for k, v := range fees {
		if r2[k] != v {
			t.Errorf("public round 2 %s = %v; want %v", k, r2[k], v)
		}
	}
	if r1 := publicRound(1); r1["shipping_fee_standard"] != 2.0 || r1["storage_fee_per_joke_minute"] != 0.1 ||
		r1["hosting_fee_per_joke_minute"] != 0.05 || r1["batch_size"] != 5.0 {
		t.Errorf("public round 1 = %v; want the default fees and batch size 5", r1)
	}

	for _, tc := range []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"storage_fee_per_joke_minute": -0.1}, "storage_fee_per_joke_minute"},
		{map[string]any{"shipping_fee_small": 3, "shipping_fee_standard": 2}, "shipping_fee_standard"},
	} {
		code, body := feesRequest(t, h, http.MethodPost, "/v1/instructor/rounds/1/config", instructor, tc.body)
		e, _ := body["error"].(map[string]any)
		if code != http.StatusBadRequest || e["code"] != "VALIDATION_ERROR" || e["field"] != tc.field {
			t.Errorf("config %v: %d %v; want 400 VALIDATION_ERROR on %s", tc.body, code, body, tc.field)
		}
	}

	if code, body := feesRequest(t, h, http.MethodPost, "/v1/admin/reset", instructor, nil); code != http.StatusOK {
		t.Fatalf("reset: %d %v", code, body)
	}
	if r2 := publicRound(2); r2["batch_size"] != 10.0 || r2["shipping_fee_small"] != 1.0 ||
		r2["storage_fee_per_joke_minute"] != 0.1 || r2["status"] != "CONFIGURED" {
		t.Errorf("round 2 after reset = %v; want batch_size 10 and the default fees", r2)
	}
}
```

The integration tests carry the build tag `integration`. The Reset Game test also needs `JF_TEST_ALLOW_RESET=1`, because Reset Game empties every game table of the database it runs on.

Create `src/infra/repo/postgres/lean_fees_integration_test.go`:

```go
//go:build integration

// Lean fee columns against a real Postgres. Run with
//
//	JF_TEST_DATABASE_URL=postgres://… go test -tags integration ./src/infra/repo/postgres/
//
// The database must already be migrated to 0005; the tests apply nothing.
// The round-trip test inserts its own round and deletes it afterwards. The
// Reset Game test deletes ALL game data, so it also needs JF_TEST_ALLOW_RESET=1
// and must only ever run against a throwaway database.
package postgres

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"jokefactory/src/core/domain"
	"jokefactory/src/infra/db"
)

func feesPool(t *testing.T) (*pgxpool.Pool, *Repositories) {
	t.Helper()
	dsn := os.Getenv("JF_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("JF_TEST_DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Registered first so it runs last: the data cleanup needs the pool.
	t.Cleanup(pool.Close)
	return pool, New(&db.Postgres{Pool: pool}, slog.Default())
}

// The five fee columns round-trip through InsertRoundConfig, UpdateRoundConfig
// and every round read, at their stored scale.
func TestLeanFeeColumnsRoundTripIntegration(t *testing.T) {
	ctx := context.Background()
	pool, repo := feesPool(t)
	var roundID int64
	if err := pool.QueryRow(ctx, `SELECT COALESCE(MAX(round_id), 0) + 1000 FROM rounds`).Scan(&roundID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(ctx, `DELETE FROM rounds WHERE round_id = $1`, roundID); err != nil {
			t.Errorf("cleanup round %d: %v", roundID, err)
		}
	})

	cfg := domain.DefaultRoundConfigFor(2)
	inserted, err := repo.InsertRoundConfig(ctx, roundID, &cfg)
	if err != nil {
		t.Fatal(err)
	}
	if got := domain.ConfigFromRound(inserted); got != cfg {
		t.Fatalf("inserted %+v; want %+v", got, cfg)
	}

	cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge = 0.5, 1.25, 4
	cfg.StorageFeePerJokeMinute, cfg.HostingFeePerJokeMinute = 0.125, 0.0375
	if _, err := repo.UpdateRoundConfig(ctx, roundID, &cfg); err != nil {
		t.Fatal(err)
	}
	read, err := repo.GetRoundByID(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	if read.ShippingFeeSmall != 0.5 || read.ShippingFeeStandard != 1.25 || read.ShippingFeeLarge != 4 ||
		read.StorageFeePerJokeMinute != 0.125 || read.HostingFeePerJokeMinute != 0.0375 || read.BatchSize != 10 {
		t.Fatalf("read back %+v", read)
	}
}

// Reset Game truncates every game table, so this test runs only when
// JF_TEST_ALLOW_RESET=1 says the database is a throwaway one.
func TestResetGameRestoresTheLeanRoundsIntegration(t *testing.T) {
	if os.Getenv("JF_TEST_ALLOW_RESET") != "1" {
		t.Skip("JF_TEST_ALLOW_RESET=1 not set: Reset Game would delete all game data")
	}
	ctx := context.Background()
	_, repo := feesPool(t)
	round1, round2 := domain.DefaultRoundConfigFor(1), domain.DefaultRoundConfigFor(2)
	round1.BatchSize = 7
	round2.StorageFeePerJokeMinute = 0.9
	round2.ShippingFeeLarge = 9
	if _, err := repo.InsertRoundConfig(ctx, 1, &round1); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.InsertRoundConfig(ctx, 2, &round2); err != nil {
		t.Fatal(err)
	}
	if err := repo.ResetGame(ctx); err != nil {
		t.Fatal(err)
	}
	for _, n := range []int64{1, 2} {
		rd, err := repo.GetRoundByID(ctx, n)
		if err != nil {
			t.Fatal(err)
		}
		if got, want := domain.ConfigFromRound(rd), domain.DefaultRoundConfigFor(int(n)); got != want || rd.Status != domain.RoundConfigured {
			t.Errorf("round %d after reset: %+v (%s); want %+v, CONFIGURED", n, got, rd.Status, want)
		}
	}
}
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/domain/ ./src/core/usecase/ ./src/app/server/ -run 'TestDefaultRoundConfig|TestShippingFeeFor|LeanFee|TestLoginAndReset|TestConfigRejectsBadLeanFees|TestConfigAcceptsFlat|TestMergeConfigLeanFees'`
Expected: FAIL — the packages do not build: `undefined: DefaultRoundConfigFor`, `undefined: ShippingFeeFor`, `cfg.ShippingFeeSmall undefined (type RoundConfig has no field or method ShippingFeeSmall)`, `unknown field ShippingFeeSmall in struct literal of type usecase.PartialRoundConfig`.

Run: `cd ~/Documents/GitHub/jokefactory_be && go vet -tags integration ./src/infra/repo/postgres/`
Expected: FAIL — `undefined: domain.DefaultRoundConfigFor` in `lean_fees_integration_test.go`.

- [ ] **Step 4: Add migration 0005**

Create `src/infra/db/migrations/0005_lean_fees.sql`:

```sql
-- +goose Up
BEGIN;

-- Lean fees, one rule set for both rounds. Shipping is charged per sent batch
-- by its size (small 1-4 jokes, standard 5, large 6+); storage per joke-minute
-- a batch waits on Marketing's desk; hosting per joke-minute a released joke
-- sits unsold. Every column defaults to 0, so rows written before this
-- migration carry no fees until they are configured or reset. The old
-- setup_cost_per_batch and carrying_cost_per_joke_minute columns stay, unread.
ALTER TABLE rounds
  ADD COLUMN shipping_fee_small          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_fee_small >= 0),
  ADD COLUMN shipping_fee_standard       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_fee_standard >= 0),
  ADD COLUMN shipping_fee_large          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_fee_large >= 0),
  ADD COLUMN storage_fee_per_joke_minute NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (storage_fee_per_joke_minute >= 0),
  ADD COLUMN hosting_fee_per_joke_minute NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (hosting_fee_per_joke_minute >= 0);

COMMIT;

-- +goose Down
BEGIN;

ALTER TABLE rounds
  DROP COLUMN shipping_fee_small,
  DROP COLUMN shipping_fee_standard,
  DROP COLUMN shipping_fee_large,
  DROP COLUMN storage_fee_per_joke_minute,
  DROP COLUMN hosting_fee_per_joke_minute;

COMMIT;
```

- [ ] **Step 5: Domain — fee fields, defaults, tiers**

Replace the whole of `src/core/domain/defaults.go` with:

```go
package domain

const (
	DefaultCustomerBudget        = 3.0
	DefaultInstructorBatchSize   = 5
	DefaultMarketPrice           = 1.0
	DefaultCostOfPublishing      = 0.1
	DefaultCostOfDiscard         = 0.01
	DefaultCustomerCount         = 150
	DefaultBuyThreshold          = 7.0
	DefaultJitter                = 0.3
	DefaultSwapMargin            = 0.5
	DefaultFeedbackJokeCount     = 3
	DefaultFeedbackPassThreshold = 0.75

	// DefaultRound2BatchSize is Round 2's batch_size: a cap there (1 to 10
	// jokes), where Round 1's DefaultInstructorBatchSize is exact.
	DefaultRound2BatchSize = 10

	// Lean is the only mode this branch plays: one rule set for both rounds.
	DefaultMarketMode                = MarketLean
	DefaultArrivalWindowSeconds      = 900
	DefaultSetupCostPerBatch         = 0.0
	DefaultCarryingCostPerJokeMinute = 0.0
	DefaultWIPLimit                  = 0
	DefaultPreferenceBase            = 3.0

	// Lean fees (see lean_fees.go).
	DefaultShippingFeeSmall        = 1.0
	DefaultShippingFeeStandard     = 2.0
	DefaultShippingFeeLarge        = 3.0
	DefaultStorageFeePerJokeMinute = 0.10
	DefaultHostingFeePerJokeMinute = 0.05
)
```

Create `src/core/domain/lean_fees.go`:

```go
package domain

// StandardShipmentJokes is the standard shipment: a batch Marketing has not
// split yet counts as this many jokes for both the storage fee and the
// shipping fee, whatever the round's batch_size.
const StandardShipmentJokes = 5

// ShippingFeeFor is the shipping fee of one sent batch with this many jokes:
// small for 1 to 4, standard for exactly 5, large for 6 or more. A count of 0
// or less is an unsplit batch, which ships as the standard 5.
func ShippingFeeFor(jokes int, small, standard, large float64) float64 {
	if jokes <= 0 {
		jokes = StandardShipmentJokes
	}
	switch {
	case jokes < StandardShipmentJokes:
		return small
	case jokes == StandardShipmentJokes:
		return standard
	default:
		return large
	}
}

// DefaultRoundConfigFor is DefaultRoundConfig with the batch size of that
// round: exactly DefaultInstructorBatchSize in Round 1, up to
// DefaultRound2BatchSize from Round 2 on.
func DefaultRoundConfigFor(roundNumber int) RoundConfig {
	cfg := DefaultRoundConfig()
	if roundNumber >= 2 {
		cfg.BatchSize = DefaultRound2BatchSize
	}
	return cfg
}
```

In `src/core/domain/round_config.go`, replace the end of `RoundConfig`:

```go
	WIPLimit                  int
	PreferenceBase            float64
}
```

with:

```go
	WIPLimit                  int
	PreferenceBase            float64

	// Lean fees (see lean_fees.go). They replace SetupCostPerBatch and
	// CarryingCostPerJokeMinute, which are still stored but no longer read.
	ShippingFeeSmall        float64
	ShippingFeeStandard     float64
	ShippingFeeLarge        float64
	StorageFeePerJokeMinute float64
	HostingFeePerJokeMinute float64
}
```

In `src/core/domain/round_config.go`, replace the comment of `DefaultRoundConfig`:

```go
// DefaultRoundConfig returns the pilot defaults from §2.4.
```

with:

```go
// DefaultRoundConfig returns the Lean defaults (one rule set for both rounds,
// docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §4) with
// Round 1's batch size; DefaultRoundConfigFor gives a later round its own.
```

In `src/core/domain/round_config.go`, replace the end of `DefaultRoundConfig`'s literal:

```go
		WIPLimit:                  DefaultWIPLimit,
		PreferenceBase:            DefaultPreferenceBase,
	}
```

with:

```go
		WIPLimit:                  DefaultWIPLimit,
		PreferenceBase:            DefaultPreferenceBase,

		ShippingFeeSmall:        DefaultShippingFeeSmall,
		ShippingFeeStandard:     DefaultShippingFeeStandard,
		ShippingFeeLarge:        DefaultShippingFeeLarge,
		StorageFeePerJokeMinute: DefaultStorageFeePerJokeMinute,
		HostingFeePerJokeMinute: DefaultHostingFeePerJokeMinute,
	}
```

In `src/core/domain/round_config.go`, replace the end of `ConfigFromRound`'s literal:

```go
		WIPLimit:                  r.WIPLimit,
		PreferenceBase:            r.PreferenceBase,
	}
```

with:

```go
		WIPLimit:                  r.WIPLimit,
		PreferenceBase:            r.PreferenceBase,

		ShippingFeeSmall:        r.ShippingFeeSmall,
		ShippingFeeStandard:     r.ShippingFeeStandard,
		ShippingFeeLarge:        r.ShippingFeeLarge,
		StorageFeePerJokeMinute: r.StorageFeePerJokeMinute,
		HostingFeePerJokeMinute: r.HostingFeePerJokeMinute,
	}
```

In `src/core/domain/entities.go`, replace in `Round`:

```go
	WIPLimit                  int
	PreferenceBase            float64

	StartedAt      *time.Time
```

with:

```go
	WIPLimit                  int
	PreferenceBase            float64

	// Lean fees (see lean_fees.go).
	ShippingFeeSmall        float64
	ShippingFeeStandard     float64
	ShippingFeeLarge        float64
	StorageFeePerJokeMinute float64
	HostingFeePerJokeMinute float64

	StartedAt      *time.Time
```

In `src/core/domain/market_mode.go`, replace:

```go
// CLASSIC is the game as shipped: every customer shops the moment a joke is
// classified and swaps for better jokes later. LEAN is the opt-in mode in
// which customers arrive steadily, shop once, and teams pay setup and carrying
// costs. Every Lean rule in the code base is guarded by this value, so a
// CLASSIC round runs the original code paths untouched.
```

with:

```go
// CLASSIC is the game as first shipped: every customer shops the moment a
// joke is classified and swaps for better jokes later. LEAN, the default on
// this branch, has customers arrive steadily and shop once, and charges teams
// the shipping, storage and hosting fees (lean_fees.go). Every Lean rule in the
// code base is guarded by this value, so a CLASSIC round still runs the
// original code paths untouched.
```

- [ ] **Step 6: Usecase — validate, lock and merge the fees; Login's round 2**

In `src/core/usecase/instructor.go`, replace the comment of `checkStartedRoundLock`:

```go
// checkStartedRoundLock refuses, once a round has left CONFIGURED, to change
// market_mode or (for a LEAN round) any lean setting. Lean customers get
// arrival times only in StartRound, so a mode switch mid-round would strand
// them (to LEAN) or make them all shop at once (to CLASSIC); and lean setup
// and carrying costs are read at stats time, so changing them later would
// rewrite the round's past profits. Re-sending the stored values, and every
// other field (price, costs, budget, ...), are unaffected. Lean settings on a
// CLASSIC round are ignored by the market, so they are not locked there.
```

with:

```go
// checkStartedRoundLock refuses, once a round has left CONFIGURED, to change
// market_mode or (for a LEAN round) any lean setting, the five fees included.
// Lean customers get arrival times only in StartRound, so a mode switch
// mid-round would strand them (to LEAN) or make them all shop at once (to
// CLASSIC); and the fees are read at stats time, so changing them later would
// rewrite the round's past profits. Re-sending the stored values, and every
// other field (price, costs, budget, ...), are unaffected. Lean settings on a
// CLASSIC round are ignored by the market, so they are not locked there.
```

In `src/core/usecase/instructor.go`, replace `leanSettingsChanged`:

```go
// leanSettingsChanged compares at the scale Postgres stores each column
// (setup cost and preference base NUMERIC(_,2), carrying cost NUMERIC(_,4)),
// so a value that round-trips through the database counts as unchanged.
func leanSettingsChanged(r *domain.Round, cfg *domain.RoundConfig) bool {
	return r.ArrivalWindowSeconds != cfg.ArrivalWindowSeconds ||
		r.WIPLimit != cfg.WIPLimit ||
		!sameAtScale(r.SetupCostPerBatch, cfg.SetupCostPerBatch, 100) ||
		!sameAtScale(r.CarryingCostPerJokeMinute, cfg.CarryingCostPerJokeMinute, 10000) ||
		!sameAtScale(r.PreferenceBase, cfg.PreferenceBase, 100)
}
```

with:

```go
// leanSettingsChanged compares at the scale Postgres stores each column
// (setup cost, shipping fees and preference base NUMERIC(_,2); carrying cost,
// storage and hosting fees NUMERIC(_,4)), so a value that round-trips through
// the database counts as unchanged. The fees are read at stats time, so
// changing one after the start would rewrite the round's past profits.
func leanSettingsChanged(r *domain.Round, cfg *domain.RoundConfig) bool {
	return r.ArrivalWindowSeconds != cfg.ArrivalWindowSeconds ||
		r.WIPLimit != cfg.WIPLimit ||
		!sameAtScale(r.SetupCostPerBatch, cfg.SetupCostPerBatch, 100) ||
		!sameAtScale(r.CarryingCostPerJokeMinute, cfg.CarryingCostPerJokeMinute, 10000) ||
		!sameAtScale(r.PreferenceBase, cfg.PreferenceBase, 100) ||
		!sameAtScale(r.ShippingFeeSmall, cfg.ShippingFeeSmall, 100) ||
		!sameAtScale(r.ShippingFeeStandard, cfg.ShippingFeeStandard, 100) ||
		!sameAtScale(r.ShippingFeeLarge, cfg.ShippingFeeLarge, 100) ||
		!sameAtScale(r.StorageFeePerJokeMinute, cfg.StorageFeePerJokeMinute, 10000) ||
		!sameAtScale(r.HostingFeePerJokeMinute, cfg.HostingFeePerJokeMinute, 10000)
}
```

In `src/core/usecase/instructor.go`, replace in `validateLeanConfig`:

```go
	// wip_limit 0 means "no limit".
	if cfg.WIPLimit < 0 {
		return domain.NewValidationError("wip_limit", "must be >= 0 (0 means no limit)")
	}
```

with:

```go
	// wip_limit 0 means "no limit".
	if cfg.WIPLimit < 0 {
		return domain.NewValidationError("wip_limit", "must be >= 0 (0 means no limit)")
	}
	if err := validateLeanFees(cfg); err != nil {
		return err
	}
```

In `src/core/usecase/instructor.go`, replace:

```go
// Assign creates N teams and assigns one JM + one MARKETING per team.
```

with:

```go
// validateLeanFees checks the five Lean fees: none negative, and a bigger
// shipment never ships for less (small <= standard <= large).
func validateLeanFees(cfg *domain.RoundConfig) error {
	for _, f := range []struct {
		field string
		value float64
	}{
		{"shipping_fee_small", cfg.ShippingFeeSmall},
		{"shipping_fee_standard", cfg.ShippingFeeStandard},
		{"shipping_fee_large", cfg.ShippingFeeLarge},
		{"storage_fee_per_joke_minute", cfg.StorageFeePerJokeMinute},
		{"hosting_fee_per_joke_minute", cfg.HostingFeePerJokeMinute},
	} {
		if f.value < 0 {
			return domain.NewValidationError(f.field, "must be >= 0")
		}
	}
	if cfg.ShippingFeeSmall > cfg.ShippingFeeStandard || cfg.ShippingFeeStandard > cfg.ShippingFeeLarge {
		return domain.NewValidationError("shipping_fee_standard",
			"shipping fees must rise with batch size: shipping_fee_small <= shipping_fee_standard <= shipping_fee_large")
	}
	return nil
}

// Assign creates N teams and assigns one JM + one MARKETING per team.
```

In `src/core/usecase/instructor.go`, replace the end of `MergeConfig`:

```go
	if overlay.PreferenceBase != nil {
		cfg.PreferenceBase = *overlay.PreferenceBase
	}
	return cfg
}
```

with:

```go
	if overlay.PreferenceBase != nil {
		cfg.PreferenceBase = *overlay.PreferenceBase
	}
	if overlay.ShippingFeeSmall != nil {
		cfg.ShippingFeeSmall = *overlay.ShippingFeeSmall
	}
	if overlay.ShippingFeeStandard != nil {
		cfg.ShippingFeeStandard = *overlay.ShippingFeeStandard
	}
	if overlay.ShippingFeeLarge != nil {
		cfg.ShippingFeeLarge = *overlay.ShippingFeeLarge
	}
	if overlay.StorageFeePerJokeMinute != nil {
		cfg.StorageFeePerJokeMinute = *overlay.StorageFeePerJokeMinute
	}
	if overlay.HostingFeePerJokeMinute != nil {
		cfg.HostingFeePerJokeMinute = *overlay.HostingFeePerJokeMinute
	}
	return cfg
}
```

In `src/core/usecase/instructor.go`, replace the end of `PartialRoundConfig`:

```go
	WIPLimit                  *int // 0 means no limit
	PreferenceBase            *float64
}
```

with:

```go
	WIPLimit                  *int // 0 means no limit
	PreferenceBase            *float64

	// Lean fees. nil keeps the existing value.
	ShippingFeeSmall        *float64
	ShippingFeeStandard     *float64
	ShippingFeeLarge        *float64
	StorageFeePerJokeMinute *float64
	HostingFeePerJokeMinute *float64
}
```

In `src/core/usecase/admin_auth.go`, replace in `Login`:

```go
	defaults := domain.DefaultRoundConfig()
	if round == nil || round.RoundNumber < 2 {
		// Ensure round 1 exists
		if round == nil {
			r1, err := s.repo.InsertRoundConfig(ctx, 1, &defaults)
			if err != nil {
				return nil, err
			}
			round = r1 // keep round 1 in the response for compatibility
		}
		// Ensure round 2 exists
		if _, err := s.repo.InsertRoundConfig(ctx, 2, &defaults); err != nil {
			return nil, err
		}
	}
```

with:

```go
	if round == nil || round.RoundNumber < 2 {
		// Ensure round 1 exists
		if round == nil {
			round1 := domain.DefaultRoundConfigFor(1)
			r1, err := s.repo.InsertRoundConfig(ctx, 1, &round1)
			if err != nil {
				return nil, err
			}
			round = r1 // keep round 1 in the response for compatibility
		}
		// Ensure round 2 exists, with its own batch size (up to 10).
		round2 := domain.DefaultRoundConfigFor(2)
		if _, err := s.repo.InsertRoundConfig(ctx, 2, &round2); err != nil {
			return nil, err
		}
	}
```

- [ ] **Step 7: HTTP — accept and return the fee keys**

In `src/app/http/dto/models.go`, replace the end of `ConfigRequest`:

```go
	WIPLimit                  *int     `json:"wip_limit"` // 0 means no limit
	PreferenceBase            *float64 `json:"preference_base"`
}
```

with:

```go
	WIPLimit                  *int     `json:"wip_limit"` // 0 means no limit
	PreferenceBase            *float64 `json:"preference_base"`

	// Lean fees (domain/lean_fees.go): shipping per sent batch by size, and
	// storage / hosting per joke-minute. Locked once the round has started.
	ShippingFeeSmall        *float64 `json:"shipping_fee_small"`
	ShippingFeeStandard     *float64 `json:"shipping_fee_standard"`
	ShippingFeeLarge        *float64 `json:"shipping_fee_large"`
	StorageFeePerJokeMinute *float64 `json:"storage_fee_per_joke_minute"`
	HostingFeePerJokeMinute *float64 `json:"hosting_fee_per_joke_minute"`
}
```

In `src/app/http/dto/round.go`, replace the end of `PublicRound`:

```go
	WIPLimit                  int     `json:"wip_limit"` // 0 means no limit
}
```

with:

```go
	WIPLimit                  int     `json:"wip_limit"` // 0 means no limit

	// Lean fees. Students see them so their screens can quote the real amounts.
	ShippingFeeSmall        float64 `json:"shipping_fee_small"`
	ShippingFeeStandard     float64 `json:"shipping_fee_standard"`
	ShippingFeeLarge        float64 `json:"shipping_fee_large"`
	StorageFeePerJokeMinute float64 `json:"storage_fee_per_joke_minute"`
	HostingFeePerJokeMinute float64 `json:"hosting_fee_per_joke_minute"`
}
```

In `src/app/http/dto/round.go`, replace the end of `ToPublicRound`:

```go
		WIPLimit:                  rd.WIPLimit,
	}
}
```

with:

```go
		WIPLimit:                  rd.WIPLimit,

		ShippingFeeSmall:        rd.ShippingFeeSmall,
		ShippingFeeStandard:     rd.ShippingFeeStandard,
		ShippingFeeLarge:        rd.ShippingFeeLarge,
		StorageFeePerJokeMinute: rd.StorageFeePerJokeMinute,
		HostingFeePerJokeMinute: rd.HostingFeePerJokeMinute,
	}
}
```

In `src/app/http/handler/instructor.go`, replace in `Config`:

```go
	base := domain.DefaultRoundConfig()
	existing, err := h.instructorService.GetRound(c.Request.Context(), roundID)
	if err == nil {
		base = domain.ConfigFromRound(existing)
	} else if !domain.IsNotFound(err) {
		response.FromDomainError(c, err, middleware.GetRequestID(c))
		return
	}

	cfg := usecase.MergeConfig(&base, &usecase.PartialRoundConfig{
		CustomerBudget:            req.CustomerBudget,
		BatchSize:                 req.BatchSize,
		MarketPrice:               req.MarketPrice,
		CostOfPublishing:          req.CostOfPublishing,
		CostOfDiscard:             req.CostOfDiscard,
		CustomerCount:             req.CustomerCount,
		BuyThreshold:              req.BuyThreshold,
		Jitter:                    req.Jitter,
		SwapMargin:                req.SwapMargin,
		FeedbackJokeCount:         req.FeedbackJokeCount,
		FeedbackPassThreshold:     req.FeedbackPassThreshold,
		MarketMode:                req.MarketMode,
		ArrivalWindowSeconds:      req.ArrivalWindowSeconds,
		SetupCostPerBatch:         req.SetupCostPerBatch,
		CarryingCostPerJokeMinute: req.CarryingCostPerJokeMinute,
		WIPLimit:                  req.WIPLimit,
		PreferenceBase:            req.PreferenceBase,
	})

	result, err := h.instructorService.Config(
```

with:

```go
	base := domain.DefaultRoundConfigFor(int(roundID))
	existing, err := h.instructorService.GetRound(c.Request.Context(), roundID)
	if err == nil {
		base = domain.ConfigFromRound(existing)
	} else if !domain.IsNotFound(err) {
		response.FromDomainError(c, err, middleware.GetRequestID(c))
		return
	}

	cfg := usecase.MergeConfig(&base, partialConfig(&req))

	result, err := h.instructorService.Config(
```

In `src/app/http/handler/instructor.go`, replace in `StartRound`:

```go
	if bindErr == nil && hasConfigFields(&req) {
		base := domain.DefaultRoundConfig()
		existing, err := h.instructorService.GetRound(c.Request.Context(), roundID)
		if err == nil {
			base = domain.ConfigFromRound(existing)
		} else if !domain.IsNotFound(err) {
			response.FromDomainError(c, err, middleware.GetRequestID(c))
			return
		}
		cfg := usecase.MergeConfig(&base, &usecase.PartialRoundConfig{
			CustomerBudget:            req.CustomerBudget,
			BatchSize:                 req.BatchSize,
			MarketPrice:               req.MarketPrice,
			CostOfPublishing:          req.CostOfPublishing,
			CostOfDiscard:             req.CostOfDiscard,
			CustomerCount:             req.CustomerCount,
			BuyThreshold:              req.BuyThreshold,
			Jitter:                    req.Jitter,
			SwapMargin:                req.SwapMargin,
			FeedbackJokeCount:         req.FeedbackJokeCount,
			FeedbackPassThreshold:     req.FeedbackPassThreshold,
			MarketMode:                req.MarketMode,
			ArrivalWindowSeconds:      req.ArrivalWindowSeconds,
			SetupCostPerBatch:         req.SetupCostPerBatch,
			CarryingCostPerJokeMinute: req.CarryingCostPerJokeMinute,
			WIPLimit:                  req.WIPLimit,
			PreferenceBase:            req.PreferenceBase,
		})
```

with:

```go
	if bindErr == nil && hasConfigFields(&req) {
		base := domain.DefaultRoundConfigFor(int(roundID))
		existing, err := h.instructorService.GetRound(c.Request.Context(), roundID)
		if err == nil {
			base = domain.ConfigFromRound(existing)
		} else if !domain.IsNotFound(err) {
			response.FromDomainError(c, err, middleware.GetRequestID(c))
			return
		}
		cfg := usecase.MergeConfig(&base, partialConfig(&req))
```

In `src/app/http/handler/instructor.go`, replace:

```go
func hasConfigFields(req *dto.ConfigRequest) bool {
```

with:

```go
// partialConfig carries every optional config field of the request into the
// usecase overlay; nil fields keep the round's current value.
func partialConfig(req *dto.ConfigRequest) *usecase.PartialRoundConfig {
	return &usecase.PartialRoundConfig{
		CustomerBudget:            req.CustomerBudget,
		BatchSize:                 req.BatchSize,
		MarketPrice:               req.MarketPrice,
		CostOfPublishing:          req.CostOfPublishing,
		CostOfDiscard:             req.CostOfDiscard,
		CustomerCount:             req.CustomerCount,
		BuyThreshold:              req.BuyThreshold,
		Jitter:                    req.Jitter,
		SwapMargin:                req.SwapMargin,
		FeedbackJokeCount:         req.FeedbackJokeCount,
		FeedbackPassThreshold:     req.FeedbackPassThreshold,
		MarketMode:                req.MarketMode,
		ArrivalWindowSeconds:      req.ArrivalWindowSeconds,
		SetupCostPerBatch:         req.SetupCostPerBatch,
		CarryingCostPerJokeMinute: req.CarryingCostPerJokeMinute,
		WIPLimit:                  req.WIPLimit,
		PreferenceBase:            req.PreferenceBase,
		ShippingFeeSmall:          req.ShippingFeeSmall,
		ShippingFeeStandard:       req.ShippingFeeStandard,
		ShippingFeeLarge:          req.ShippingFeeLarge,
		StorageFeePerJokeMinute:   req.StorageFeePerJokeMinute,
		HostingFeePerJokeMinute:   req.HostingFeePerJokeMinute,
	}
}

func hasConfigFields(req *dto.ConfigRequest) bool {
```

In `src/app/http/handler/instructor.go`, replace the end of `hasConfigFields`:

```go
		req.PreferenceBase != nil ||
		req.IdealProfile != nil
```

with:

```go
		req.PreferenceBase != nil ||
		req.ShippingFeeSmall != nil ||
		req.ShippingFeeStandard != nil ||
		req.ShippingFeeLarge != nil ||
		req.StorageFeePerJokeMinute != nil ||
		req.HostingFeePerJokeMinute != nil ||
		req.IdealProfile != nil
```

- [ ] **Step 8: Postgres — read and write the columns; Reset Game's per-round batch size**

In `src/infra/repo/postgres/mapper.go`, replace:

```go
	market_mode, arrival_window_seconds, setup_cost_per_batch,
	carrying_cost_per_joke_minute, wip_limit, preference_base`
```

with:

```go
	market_mode, arrival_window_seconds, setup_cost_per_batch,
	carrying_cost_per_joke_minute, wip_limit, preference_base,
	shipping_fee_small, shipping_fee_standard, shipping_fee_large,
	storage_fee_per_joke_minute, hosting_fee_per_joke_minute`
```

In `src/infra/repo/postgres/mapper.go`, replace:

```go
		&rd.CarryingCostPerJokeMinute, &rd.WIPLimit, &rd.PreferenceBase,
	)
```

with:

```go
		&rd.CarryingCostPerJokeMinute, &rd.WIPLimit, &rd.PreferenceBase,
		&rd.ShippingFeeSmall, &rd.ShippingFeeStandard, &rd.ShippingFeeLarge,
		&rd.StorageFeePerJokeMinute, &rd.HostingFeePerJokeMinute,
	)
```

In `src/infra/repo/postgres/round_repo.go`, replace in `UpdateRoundConfig`:

```go
		    wip_limit = $17,
		    preference_base = $18
		WHERE round_id = $1
		RETURNING `+roundColumns, roundID,
		cfg.CustomerBudget, cfg.BatchSize, cfg.MarketPrice, cfg.CostOfPublishing,
		cfg.CostOfDiscard, cfg.CustomerCount, cfg.BuyThreshold, cfg.Jitter,
		cfg.SwapMargin, cfg.FeedbackJokeCount, cfg.FeedbackPassThreshold,
		string(cfg.MarketMode), cfg.ArrivalWindowSeconds, cfg.SetupCostPerBatch,
		cfg.CarryingCostPerJokeMinute, cfg.WIPLimit, cfg.PreferenceBase))
```

with:

```go
		    wip_limit = $17,
		    preference_base = $18,
		    shipping_fee_small = $19,
		    shipping_fee_standard = $20,
		    shipping_fee_large = $21,
		    storage_fee_per_joke_minute = $22,
		    hosting_fee_per_joke_minute = $23
		WHERE round_id = $1
		RETURNING `+roundColumns, roundID,
		cfg.CustomerBudget, cfg.BatchSize, cfg.MarketPrice, cfg.CostOfPublishing,
		cfg.CostOfDiscard, cfg.CustomerCount, cfg.BuyThreshold, cfg.Jitter,
		cfg.SwapMargin, cfg.FeedbackJokeCount, cfg.FeedbackPassThreshold,
		string(cfg.MarketMode), cfg.ArrivalWindowSeconds, cfg.SetupCostPerBatch,
		cfg.CarryingCostPerJokeMinute, cfg.WIPLimit, cfg.PreferenceBase,
		cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge,
		cfg.StorageFeePerJokeMinute, cfg.HostingFeePerJokeMinute))
```

In `src/infra/repo/postgres/round_repo.go`, replace in `InsertRoundConfig`:

```go
			market_mode, arrival_window_seconds, setup_cost_per_batch,
			carrying_cost_per_joke_minute, wip_limit, preference_base
		)
		VALUES ($1, $2, 'CONFIGURED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			$14, $15, $16, $17, $18, $19)
		RETURNING `+roundColumns,
		roundID, int(roundID),
		cfg.CustomerBudget, cfg.BatchSize, cfg.MarketPrice, cfg.CostOfPublishing,
		cfg.CostOfDiscard, cfg.CustomerCount, cfg.BuyThreshold, cfg.Jitter,
		cfg.SwapMargin, cfg.FeedbackJokeCount, cfg.FeedbackPassThreshold,
		string(cfg.MarketMode), cfg.ArrivalWindowSeconds, cfg.SetupCostPerBatch,
		cfg.CarryingCostPerJokeMinute, cfg.WIPLimit, cfg.PreferenceBase))
```

with:

```go
			market_mode, arrival_window_seconds, setup_cost_per_batch,
			carrying_cost_per_joke_minute, wip_limit, preference_base,
			shipping_fee_small, shipping_fee_standard, shipping_fee_large,
			storage_fee_per_joke_minute, hosting_fee_per_joke_minute
		)
		VALUES ($1, $2, 'CONFIGURED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			$14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
		RETURNING `+roundColumns,
		roundID, int(roundID),
		cfg.CustomerBudget, cfg.BatchSize, cfg.MarketPrice, cfg.CostOfPublishing,
		cfg.CostOfDiscard, cfg.CustomerCount, cfg.BuyThreshold, cfg.Jitter,
		cfg.SwapMargin, cfg.FeedbackJokeCount, cfg.FeedbackPassThreshold,
		string(cfg.MarketMode), cfg.ArrivalWindowSeconds, cfg.SetupCostPerBatch,
		cfg.CarryingCostPerJokeMinute, cfg.WIPLimit, cfg.PreferenceBase,
		cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge,
		cfg.StorageFeePerJokeMinute, cfg.HostingFeePerJokeMinute))
```

In `src/infra/repo/postgres/round_repo.go`, replace the head of `ResetGame`:

```go
func (r *Repositories) ResetGame(ctx context.Context) error {
	cfg := domain.DefaultRoundConfig()
	return r.pg.WithTx(ctx, func(tx pgx.Tx) error {
```

with:

```go
// ResetGame clears all game data and puts every round back to CONFIGURED with
// the defaults: one Lean rule set, with batch_size 5 (exact) for Round 1 and
// 10 (a cap) for Round 2 and later.
func (r *Repositories) ResetGame(ctx context.Context) error {
	cfg := domain.DefaultRoundConfig()
	round2 := domain.DefaultRoundConfigFor(2)
	return r.pg.WithTx(ctx, func(tx pgx.Tx) error {
```

In `src/infra/repo/postgres/round_repo.go`, replace in `ResetGame` (the casts matter: inside a `CASE`, Postgres cannot infer a parameter's type and would read it as text):

```go
			SET status = 'CONFIGURED',
			    customer_budget = $1,
			    batch_size = $2,
```

with:

```go
			SET status = 'CONFIGURED',
			    customer_budget = $1,
			    batch_size = CASE WHEN round_number >= 2 THEN $18::int ELSE $2::int END,
```

In `src/infra/repo/postgres/round_repo.go`, replace in `ResetGame`:

```go
			    preference_base = $17,
			    started_at = NULL,
```

with:

```go
			    preference_base = $17,
			    shipping_fee_small = $19,
			    shipping_fee_standard = $20,
			    shipping_fee_large = $21,
			    storage_fee_per_joke_minute = $22,
			    hosting_fee_per_joke_minute = $23,
			    started_at = NULL,
```

In `src/infra/repo/postgres/round_repo.go`, replace in `ResetGame`:

```go
			cfg.WIPLimit,
			cfg.PreferenceBase,
		); err != nil {
```

with:

```go
			cfg.WIPLimit,
			cfg.PreferenceBase,
			round2.BatchSize,
			cfg.ShippingFeeSmall,
			cfg.ShippingFeeStandard,
			cfg.ShippingFeeLarge,
			cfg.StorageFeePerJokeMinute,
			cfg.HostingFeePerJokeMinute,
		); err != nil {
```

- [ ] **Step 9: Memstore — store the fees; reset like Postgres**

In `src/core/usecase/testutil/memstore.go`, replace the end of `applyConfig`:

```go
	r.WIPLimit = cfg.WIPLimit
	r.PreferenceBase = cfg.PreferenceBase
}
```

with:

```go
	r.WIPLimit = cfg.WIPLimit
	r.PreferenceBase = cfg.PreferenceBase
	r.ShippingFeeSmall = cfg.ShippingFeeSmall
	r.ShippingFeeStandard = cfg.ShippingFeeStandard
	r.ShippingFeeLarge = cfg.ShippingFeeLarge
	r.StorageFeePerJokeMinute = cfg.StorageFeePerJokeMinute
	r.HostingFeePerJokeMinute = cfg.HostingFeePerJokeMinute
}
```

In `src/core/usecase/testutil/memstore.go`, replace `ResetGame`:

```go
func (st *Store) ResetGame(context.Context) error {
	*st = *NewStore()
	return nil
}
```

with:

```go
// ResetGame mirrors the Postgres reset: every round row stays, back to
// CONFIGURED with the defaults of its round number (Round 1 batch size 5,
// Round 2 batch size 10); instructors stay; everything else is cleared and the
// id counters restart, except users, whose ids keep counting as in Postgres.
func (st *Store) ResetGame(context.Context) error {
	fresh := NewStore()
	fresh.Now = st.Now
	fresh.NextUser = st.NextUser
	for id, r := range st.Rounds {
		cfg := domain.DefaultRoundConfigFor(r.RoundNumber)
		reset := &domain.Round{ID: r.ID, RoundNumber: r.RoundNumber, Status: domain.RoundConfigured, CreatedAt: r.CreatedAt}
		applyConfig(reset, &cfg)
		fresh.Rounds[id] = reset
	}
	for id, u := range st.Users {
		if u.Role != nil && *u.Role == domain.RoleInstructor {
			fresh.Users[id] = cloneUser(u)
			fresh.ByName[u.DisplayName] = id
		}
	}
	*st = *fresh
	return nil
}
```

- [ ] **Step 10: Run the new tests to verify they pass**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/domain/ ./src/core/usecase/ ./src/app/server/ -run 'TestDefaultRoundConfig|TestShippingFeeFor|LeanFee|TestLoginAndReset|TestConfigRejectsBadLeanFees|TestConfigAcceptsFlat|TestMergeConfigLeanFees' -v`
Expected: PASS — every listed test (`TestDefaultRoundConfigIsTheLeanRuleSet`, `TestDefaultRoundConfigForGivesRound2UpToTenJokes`, `TestShippingFeeForTiers`, `TestLoginAndResetGiveRound1FiveAndRound2Ten`, `TestConfigRejectsBadLeanFees` and its 7 subtests, `TestConfigAcceptsFlatAndFreeShipping`, `TestMergeConfigLeanFees`, `TestConfigLocksLeanFeesOnceStarted` and its 5 subtests, `TestConfigAllowsResendingSameLeanFeesOnceStarted`, `TestConfigAllowsLeanFeeChangesBeforeStart`, `TestLeanFeesRoutes`).

- [ ] **Step 11: Run the whole suite and see which old tests assumed Classic defaults**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./...`
Expected: FAIL — exactly these, all because `DefaultRoundConfig()` is LEAN now: `TestDefaultRoundIsClassic` (lean_config_test.go: "default round is not classic"), `TestBatchListingSoldCountMatchesMarket` and `TestBatchListingReportsFirstSoldAt` (batch_sales_test.go: "fixture expected 5 purchases, got 0" — Lean customers shop on arrival, not at classification), `TestEndToEndRound` (e2e_test.go: "sold = 0, want 5"), `TestLeanChartsRoutes` (its round 2 is meant to be CLASSIC).

- [ ] **Step 12: Pin Classic where those tests mean Classic**

In `src/core/usecase/lean_config_test.go`, replace (the new defaults are pinned in `src/core/domain/lean_fees_test.go`, and reset in `TestLoginAndResetGiveRound1FiveAndRound2Ten`):

```go
// Pins the Classic defaults: a round configured from defaults after a reset
// reads back as CLASSIC with preference base 2 and no lean costs.
func TestDefaultRoundIsClassic(t *testing.T) {
	st, svc := newLeanConfigInstructor()
	ctx := context.Background()
	if err := st.ResetGame(ctx); err != nil {
		t.Fatal(err)
	}
	cfg := domain.DefaultRoundConfig()
	if _, err := svc.Config(ctx, 1, &cfg, nil); err != nil {
		t.Fatal(err)
	}
	rd, err := svc.GetRound(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if rd.MarketMode != domain.MarketClassic || rd.PreferenceBase != 2 || rd.ArrivalWindowSeconds != 900 ||
		rd.SetupCostPerBatch != 0 || rd.CarryingCostPerJokeMinute != 0 || rd.WIPLimit != 0 {
		t.Fatalf("default round is not classic: %+v", rd)
	}
}

```

with:

```go
```

In `src/core/usecase/lean_config_test.go`, replace in `TestConfigLocksMarketModeOnceStarted` (it switches CLASSIC → LEAN, so it must start from CLASSIC):

```go
	// CONFIGURED: the mode may change freely.
	cfg := domain.DefaultRoundConfig()
	if _, err := svc.Config(ctx, 1, &cfg, testutil.ValidIdealProfile()); err != nil {
```

with:

```go
	// CONFIGURED: the mode may change freely.
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketClassic
	if _, err := svc.Config(ctx, 1, &cfg, testutil.ValidIdealProfile()); err != nil {
```

In `src/core/usecase/lean_config_test.go`, replace the head of `TestConfigAllowsClassicPriceChangeOnceStarted`:

```go
func TestConfigAllowsClassicPriceChangeOnceStarted(t *testing.T) {
	_, svc := newLeanConfigInstructor()
	ctx := context.Background()
	cfg := domain.DefaultRoundConfig()
```

with:

```go
func TestConfigAllowsClassicPriceChangeOnceStarted(t *testing.T) {
	_, svc := newLeanConfigInstructor()
	ctx := context.Background()
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketClassic
```

In `src/core/usecase/batch_sales_test.go`, replace:

```go
	defaults := domain.DefaultRoundConfig()
	defaults.BatchSize = 2
```

with:

```go
	defaults := domain.DefaultRoundConfig()
	defaults.MarketMode = domain.MarketClassic // every customer shops as soon as a joke is classified
	defaults.BatchSize = 2
```

In `src/core/usecase/e2e_test.go`, replace:

```go
	defaults := domain.DefaultRoundConfig()
	defaults.BatchSize = 2
```

with:

```go
	defaults := domain.DefaultRoundConfig()
	defaults.MarketMode = domain.MarketClassic // every customer shops as soon as a joke is classified
	defaults.BatchSize = 2
```

In `src/app/server/lean_charts_routes_test.go`, replace:

```go
	classic := domain.DefaultRoundConfig()
	if _, err := st.InsertRoundConfig(ctx, 2, &classic); err != nil {
```

with:

```go
	classic := domain.DefaultRoundConfig()
	classic.MarketMode = domain.MarketClassic
	if _, err := st.InsertRoundConfig(ctx, 2, &classic); err != nil {
```

- [ ] **Step 13: Document the deployment order**

In `README.md`, replace:

```markdown
Rollback: if the backend image is rolled back, do NOT run `migrate-down`. The old image works with the column present, and Down deletes every note.
```

with:

```markdown
Rollback: if the backend image is rolled back, do NOT run `migrate-down`. The old image works with the column present, and Down deletes every note.

### Deploying the Lean fees (migration 0005)

1. Migrate first: `DB_DSN=<DSN> make migrate-up`, then `DB_DSN=<DSN> make migrate-status` and confirm `0005_lean_fees.sql` is Applied. The new backend reads the five fee columns on every round query, so it fails until 0005 is applied.
2. Then deploy the backend, and press **Reset Game** before the next class: rounds written before 0005 carry zero fees and the old batch sizes until they are reset (Round 1 batch size 5, Round 2 batch size 10).
3. Deploy the frontend last. An older frontend keeps working against the new backend: `setup_cost` and `carrying_cost` remain in the stats as aliases of the fees.

Rollback: do NOT run `migrate-down`; the old image ignores the new columns.
```

- [ ] **Step 14: Create the throwaway database and run the integration tests**

Run: `PGPASSWORD=postgres psql -h localhost -p 55432 -U postgres -d postgres -c "DROP DATABASE IF EXISTS jokefactory_fees_test" -c "CREATE DATABASE jokefactory_fees_test"`
Expected: PASS — prints `DROP DATABASE` and `CREATE DATABASE`.

Run: `cd ~/Documents/GitHub/jokefactory_be && goose -dir src/infra/db/migrations postgres "postgres://postgres:postgres@localhost:55432/jokefactory_fees_test?sslmode=disable" up`
Expected: PASS — the last line is `goose: successfully migrated database to version: 5`.

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_ALLOW_RESET=1 JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory_fees_test?sslmode=disable" go test -tags integration ./src/infra/repo/postgres/ ./src/core/usecase/ -v -run 'Integration'`
Expected: PASS — `TestLeanChartsSQLIntegration`, `TestLeanFeeColumnsRoundTripIntegration`, `TestResetGameRestoresTheLeanRoundsIntegration`, `TestLeanStatsSQLIntegration` and `TestMarketingNoteIntegration` all `--- PASS` (the stats tests still read the old columns until Task 2). Never point `JF_TEST_ALLOW_RESET=1` at a database you want to keep.

- [ ] **Step 15: Full checks**

Run: `cd ~/Documents/GitHub/jokefactory_be && test -z "$(gofmt -l .)" && go build ./... && go vet ./... && go vet -tags integration ./... && go test ./...`
Expected: PASS — no files listed by gofmt, every package `ok`.

- [ ] **Step 16: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be && git add \
  src/infra/db/migrations/0005_lean_fees.sql \
  src/core/domain/defaults.go src/core/domain/lean_fees.go src/core/domain/lean_fees_test.go \
  src/core/domain/round_config.go src/core/domain/entities.go src/core/domain/market_mode.go src/core/domain/market_mode_test.go \
  src/core/usecase/instructor.go src/core/usecase/admin_auth.go src/core/usecase/lean_fees_test.go \
  src/core/usecase/lean_config_test.go src/core/usecase/batch_sales_test.go src/core/usecase/e2e_test.go \
  src/core/usecase/testutil/memstore.go \
  src/app/http/dto/models.go src/app/http/dto/round.go src/app/http/handler/instructor.go \
  src/app/server/lean_fees_routes_test.go src/app/server/lean_charts_routes_test.go \
  src/infra/repo/postgres/mapper.go src/infra/repo/postgres/round_repo.go \
  src/infra/repo/postgres/lean_fees_integration_test.go README.md && git commit -q -F - <<'EOF'
feat(lean): fee columns, Lean-only defaults, round 2 batches up to 10

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 2: Backend — shipping, storage and hosting fees in stats and charts

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Modify: `src/core/ports/repositories.go` (`LeanTeamStats`, `LeanChartTeamRow`, a comment), `src/infra/repo/postgres/lean_stats_repo.go` (`leanTeamCTE`, `GetRoundStatsLean`, `GetTeamSummaryLean`), `src/infra/repo/postgres/lean_charts_repo.go` (`leanChartTeamsSQL`, `leanChartTeams`, a comment), `src/core/usecase/lean_charts.go` (`LeanWaste` comment, `BuildLeanCharts`, `teamWaste`), `src/core/usecase/testutil/memstore_lean_stats.go` (`leanStats`, `leanProfit`), `src/core/usecase/testutil/memstore_lean_charts.go` (`GetLeanChartRows`)
- Test: create `src/core/usecase/lean_fees_stats_test.go`, `src/infra/repo/postgres/lean_fees_stats_integration_test.go`; modify `src/core/usecase/lean_stats_test.go`, `src/core/usecase/lean_chart_rows_test.go`, `src/core/usecase/lean_charts_test.go`, `src/infra/repo/postgres/lean_stats_integration_test.go`, `src/infra/repo/postgres/lean_charts_integration_test.go`

**Interfaces:**
- Consumes (Task 1): `domain.StandardShipmentJokes`, `domain.ShippingFeeFor`, `domain.DefaultRoundConfigFor`, the five fee fields on `domain.Round`, `feesPool(t)` (`src/infra/repo/postgres/lean_fees_integration_test.go`), the throwaway database `jokefactory_fees_test`. Also `usecase.NewStatsService(store, log)`, `(*StatsService).GetRoundStats/GetTeamSummary/GetLeanCharts`, `usecase.BuildLeanCharts(round, rows)`, `(*Repositories).GetRoundStatsLean/GetTeamSummaryLean/GetLeanChartRows/GetRoundByID`.
- Produces:
  ```go
  // package ports — LeanTeamStats gains (JSON in the `lean` block):
  ShippingCost float64 `json:"shipping_cost"` // Σ shipping fee of each sent batch by its size
  StorageCost  float64 `json:"storage_cost"`  // storage fee × WIP joke-minutes
  HostingCost  float64 `json:"hosting_cost"`  // hosting fee × inventory joke-minutes
  // SetupCost (json "setup_cost") = ShippingCost; CarryingCost (json "carrying_cost") = StorageCost + HostingCost
  // package ports — LeanChartTeamRow gains:
  ShippingCost float64
  ```
  `BuildLeanCharts`: `waste.setup` = the row's `ShippingCost`, `waste.waiting` = `StorageFeePerJokeMinute × WIPJokeMinutes`, `waste.shelf` = `HostingFeePerJokeMinute × InventoryJokeMinutes`; an unsplit batch shows 5 jokes in `batches[].jokes` and `idle[].waiting`. JSON keys unchanged.

- [ ] **Step 1: Write the failing memstore test**

Create `src/core/usecase/lean_fees_stats_test.go`:

```go
package usecase_test

import (
	"context"
	"io"
	"log/slog"
	"math"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase"
	"jokefactory/src/core/usecase/testutil"
)

// feesFixture is a running Round 2 (batch_size 10) at the default fees
// ($1 / $2 / $3 shipping, storage $0.10 and hosting $0.05 per joke-minute,
// price $1, listing $0.10, discard $0.01), read at T+30min:
//
//	Team 1: batch of 5 sent T, released T+2 (WIP 5×2 = 10): 1 published at
//	        T+2 and sold at T+6 (hosting 4 min), 4 discarded. Batch of 3 and
//	        batch of 8 sent and released at T+3 / T+4, all discarded. An
//	        unsplit batch sent T+29, still on the desk (WIP 5×1 = 5).
//	        shipping 2+1+3+2 = 8.00; storage 0.10×15 = 1.50; hosting
//	        0.05×4 = 0.20; profit 1 − 0.10 − 0.15 − 8 − 1.50 − 0.20 = −8.95
//	Team 2: batches of exactly 4, 5 and 6, each released the moment it was
//	        sent, all discarded: shipping 1+2+3 = 6.00, no storage, no
//	        hosting; profit −0.15 − 6 = −6.15
func feesFixture(t *testing.T) (*testutil.Store, *domain.Round) {
	t.Helper()
	ctx := context.Background()
	st := testutil.NewStore()
	st.Teams = []domain.Team{{ID: 1, Name: "Team 1"}, {ID: 2, Name: "Team 2"}}
	cfg := domain.DefaultRoundConfigFor(2)
	if _, err := st.InsertRoundConfig(ctx, 2, &cfg); err != nil {
		t.Fatal(err)
	}
	round, err := st.StartRound(ctx, 2)
	if err != nil {
		t.Fatal(err)
	}
	at := func(min int) *time.Time {
		v := round.StartedAt.Add(time.Duration(min) * time.Minute)
		return &v
	}
	now := *at(30)
	st.Now = func() time.Time { return now }

	title := "t"
	nextJoke := int64(1)
	jokes := func(n, published int, publishedAt *time.Time) []domain.Joke {
		out := make([]domain.Joke, 0, n)
		for i := 0; i < n; i++ {
			j := domain.Joke{ID: nextJoke, Text: "j", PublishStatus: domain.PublishDiscarded}
			if i < published {
				j.Title, j.PublishStatus, j.PublishedAt = &title, domain.PublishPublished, publishedAt
			}
			nextJoke++
			out = append(out, j)
		}
		return out
	}
	nextBatch := int64(1)
	batch := func(team int64, sent, processed *time.Time, js []domain.Joke) {
		status := domain.BatchSubmitted
		if processed != nil {
			status = domain.BatchProcessed
		}
		b := &domain.Batch{
			ID: nextBatch, RoundID: 2, TeamID: team, Status: status,
			SubmittedAt: sent, ProcessedAt: processed, CreatedAt: *sent, Jokes: js,
		}
		for i := range b.Jokes {
			b.Jokes[i].BatchID = b.ID
		}
		if len(js) == 0 {
			raw := "an unsplit blob of several jokes"
			b.RawText, b.RawTextOriginal = &raw, &raw
		}
		st.Batches[b.ID] = b
		nextBatch++
	}
	batch(1, at(0), at(2), jokes(5, 1, at(2)))
	batch(1, at(3), at(3), jokes(3, 0, nil))
	batch(1, at(4), at(4), jokes(8, 0, nil))
	batch(1, at(29), nil, nil)
	batch(2, at(1), at(1), jokes(4, 0, nil))
	batch(2, at(2), at(2), jokes(5, 0, nil))
	batch(2, at(3), at(3), jokes(6, 0, nil))
	st.NextBatch, st.NextJoke = nextBatch, nextJoke

	team1 := st.TeamState[[2]int64{2, 1}]
	team1.BatchesCreated, team1.BatchesProcessed, team1.PublishedJokes, team1.DiscardedJokes = 4, 3, 1, 15
	team2 := st.TeamState[[2]int64{2, 2}]
	team2.BatchesCreated, team2.BatchesProcessed, team2.DiscardedJokes = 3, 3, 15

	st.AICustomers[1] = &domain.AICustomer{ID: 1, RoundID: 2, StartingBudget: 3, RemainingBudget: 3}
	st.NextAICust = 2
	if err := st.BuyJoke(ctx, 2, 1, 1, 1, 1); err != nil {
		t.Fatal(err)
	}
	// Stamp the sale at T+6: BuyJoke uses the wall clock.
	st.PurchaseEvents[len(st.PurchaseEvents)-1].CreatedAt = *at(6)
	for _, p := range st.Purchases {
		p.CreatedAt = *at(6)
	}
	return st, round
}

func TestLeanFeesInStatsAndCharts(t *testing.T) {
	ctx := context.Background()
	st, round := feesFixture(t)
	svc := usecase.NewStatsService(st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	near := func(got, want float64) bool { return math.Abs(got-want) < 1e-9 }
	want := map[int64]struct{ shipping, storage, hosting, profit float64 }{
		1: {8, 1.50, 0.20, -8.95},
		2: {6, 0, 0, -6.15},
	}

	stats, err := svc.GetRoundStats(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats.Leaderboard) != 2 {
		t.Fatalf("leaderboard %+v", stats.Leaderboard)
	}
	for _, row := range stats.Leaderboard {
		w, l := want[row.Team.ID], row.Lean
		if l == nil {
			t.Fatalf("team %d: no lean block", row.Team.ID)
		}
		if !near(l.ShippingCost, w.shipping) || !near(l.StorageCost, w.storage) || !near(l.HostingCost, w.hosting) ||
			!near(row.Profit, w.profit) {
			t.Errorf("team %d: shipping %.4f storage %.4f hosting %.4f profit %.4f; want %+v",
				row.Team.ID, l.ShippingCost, l.StorageCost, l.HostingCost, row.Profit, w)
		}
		if !near(l.SetupCost, l.ShippingCost) || !near(l.CarryingCost, l.StorageCost+l.HostingCost) {
			t.Errorf("team %d: aliases setup %.4f carrying %.4f do not match shipping %.4f, storage + hosting %.4f",
				row.Team.ID, l.SetupCost, l.CarryingCost, l.ShippingCost, l.StorageCost+l.HostingCost)
		}

		sum, err := svc.GetTeamSummary(ctx, round.ID, row.Team.ID)
		if err != nil {
			t.Fatal(err)
		}
		if sum.Lean == nil || !near(sum.Lean.ShippingCost, w.shipping) || !near(sum.Lean.StorageCost, w.storage) ||
			!near(sum.Lean.HostingCost, w.hosting) || !near(sum.Profit, w.profit) {
			t.Errorf("team %d summary: %+v profit %.4f; want %+v", row.Team.ID, sum.Lean, sum.Profit, w)
		}
	}

	charts, err := svc.GetLeanCharts(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, team := range charts.Teams {
		w := want[team.TeamID]
		if !near(team.Waste.Setup, w.shipping) || !near(team.Waste.Waiting, w.storage) || !near(team.Waste.Shelf, w.hosting) {
			t.Errorf("team %d waste %+v; want setup = shipping %.2f, waiting = storage %.2f, shelf = hosting %.2f",
				team.TeamID, team.Waste, w.shipping, w.storage, w.hosting)
		}
		if team.TeamID == 1 {
			last := team.Batches[len(team.Batches)-1]
			if last.Jokes != 5 {
				t.Errorf("unsplit batch shows %d jokes; want 5 (not batch_size 10)", last.Jokes)
			}
		}
	}
}

// Review focus 1: a pasted batch nobody splits before the round ends ships
// at the standard fee and stores 5 jokes all the way to the round's end.
func TestUnsplitBatchIsChargedUntilTheRoundEnds(t *testing.T) {
	ctx := context.Background()
	st, round := feesFixture(t)
	instructor := usecase.NewInstructorService(st, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if _, err := instructor.EndRound(ctx, round.ID); err != nil {
		t.Fatal(err)
	}
	ended := round.StartedAt.Add(31 * time.Minute)
	st.Rounds[round.ID].EndedAt = &ended
	// Long after the end: the clocks stopped at ended_at.
	later := ended.Add(2 * time.Hour)
	st.Now = func() time.Time { return later }

	svc := usecase.NewStatsService(st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	sum, err := svc.GetTeamSummary(ctx, round.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	// Storage: 10 joke-min (first batch) + 5 jokes × 2 min (T+29 → T+31).
	// Hosting: still 4 min; the one released joke sold at T+6.
	if math.Abs(sum.Lean.ShippingCost-8) > 1e-9 || math.Abs(sum.Lean.StorageCost-2.0) > 1e-9 ||
		math.Abs(sum.Lean.HostingCost-0.20) > 1e-9 {
		t.Fatalf("after the end: %+v; want shipping 8.00, storage 2.00, hosting 0.20", sum.Lean)
	}
}
```

- [ ] **Step 2: Write the failing SQL test**

Create `src/infra/repo/postgres/lean_fees_stats_integration_test.go`:

```go
//go:build integration

// Lean fees in the stats and lean charts SQL against a real Postgres. Run with
//
//	JF_TEST_DATABASE_URL=postgres://… go test -tags integration ./src/infra/repo/postgres/
//
// The database must already be migrated to 0005; the test applies nothing. It
// inserts its own round and uniquely named teams and deletes them afterwards.
// feesPool is in lean_fees_integration_test.go.
package postgres

import (
	"context"
	"fmt"
	"math"
	"testing"
	"time"

	"jokefactory/src/core/usecase"
)

// Fixture (round ENDED 10:00–10:30, batch_size 10, the default fees: $1 / $2
// / $3 shipping, storage $0.10 and hosting $0.05 per joke-minute; price $1,
// listing $0.10, discard $0.01) — the memstore fixture of
// src/core/usecase/lean_fees_stats_test.go, one minute longer:
//
//	Team A: batch of 5 sent 10:00, released 10:02 (WIP 10): 1 published at
//	        10:02 and sold at 10:06 (hosting 4 min), 4 discarded. Batches of 3
//	        and 8 sent and released at 10:03 / 10:04, all discarded. An
//	        unsplit batch sent 10:29 and never split (WIP 5 × 1 = 5).
//	        shipping 2+1+3+2 = 8.00; storage 0.10 × 15 = 1.50;
//	        hosting 0.05 × 4 = 0.20; profit 1 − 0.10 − 0.15 − 9.70 = −8.95
//	Team B: batches of exactly 4, 5 and 6, released when sent, all discarded:
//	        shipping 1+2+3 = 6.00; profit −0.15 − 6 = −6.15
func TestLeanFeesSQLIntegration(t *testing.T) {
	ctx := context.Background()
	pool, repo := feesPool(t)
	base := time.Date(2026, 10, 11, 10, 0, 0, 0, time.UTC)
	at := func(min int) time.Time { return base.Add(time.Duration(min) * time.Minute) }
	suffix := fmt.Sprintf("lean-fees-it-%d", time.Now().UnixNano())

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
	var roundID int64
	var teams []int64
	t.Cleanup(func() {
		// Deleting the round and teams cascades to every row the test made.
		if roundID != 0 {
			if _, err := pool.Exec(ctx, `DELETE FROM rounds WHERE round_id = $1`, roundID); err != nil {
				t.Errorf("cleanup round %d: %v", roundID, err)
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

	roundID = mustID(`
		INSERT INTO rounds (round_id, round_number, status, batch_size, market_price, cost_of_publishing, cost_of_discard,
		                    market_mode, shipping_fee_small, shipping_fee_standard, shipping_fee_large,
		                    storage_fee_per_joke_minute, hosting_fee_per_joke_minute, started_at, ended_at)
		VALUES ($1, 998, 'ENDED', 10, 1, 0.10, 0.01, 'LEAN', 1, 2, 3, 0.10, 0.05, $2, $3)
		RETURNING round_id`, nextID("rounds", "round_id"), at(0), at(30))
	team := func(name string) int64 {
		id := mustID(`INSERT INTO teams (id, name) VALUES ($1, $2) RETURNING id`, nextID("teams", "id"), suffix+name)
		teams = append(teams, id)
		return id
	}
	teamA, teamB := team("-A"), team("-B")
	mustExec(`
		INSERT INTO team_rounds_state (round_id, team_id, points_earned, batches_created, batches_processed, published_jokes, discarded_jokes)
		VALUES ($1, $2, 1, 4, 3, 1, 15), ($1, $3, 0, 3, 3, 0, 15)`, roundID, teamA, teamB)

	// batch inserts a sent batch with `jokes` joke rows, the first `published`
	// of them PUBLISHED at its processed time, the rest DISCARDED. jokes 0 is an
	// unsplit batch (raw text, no joke rows). processed nil leaves it SUBMITTED.
	batch := func(teamID int64, sent time.Time, processed *time.Time, jokes, published int) []int64 {
		t.Helper()
		status, raw := "PROCESSED", any(nil)
		if processed == nil {
			status = "SUBMITTED"
		}
		if jokes == 0 {
			raw = "an unsplit blob of several jokes"
		}
		id := mustID(`
			INSERT INTO batches (batch_id, round_id, team_id, status, submitted_at, processed_at, raw_text, raw_text_original)
			VALUES ($1, $2, $3, $4::text::batch_status, $5, $6, $7, $7) RETURNING batch_id`,
			nextID("batches", "batch_id"), roundID, teamID, status, sent, processed, raw)
		mustExec(`
			INSERT INTO batch_submission_events (event_id, round_id, team_id, batch_id, jokes_count, delta, created_at)
			VALUES ($1, $2, $3, $4, $5, 1, $6)`,
			nextID("batch_submission_events", "event_id"), roundID, teamID, id, jokes, sent)
		var ids []int64
		for i := 0; i < jokes; i++ {
			if i < published {
				ids = append(ids, mustID(`
					INSERT INTO jokes (joke_id, batch_id, joke_text, joke_title, publish_status, published_at)
					VALUES ($1, $2, 'j', 't', 'PUBLISHED', $3) RETURNING joke_id`, nextID("jokes", "joke_id"), id, *processed))
			} else {
				ids = append(ids, mustID(`
					INSERT INTO jokes (joke_id, batch_id, joke_text, publish_status)
					VALUES ($1, $2, 'j', 'DISCARDED') RETURNING joke_id`, nextID("jokes", "joke_id"), id))
			}
		}
		return ids
	}
	ptr := func(v time.Time) *time.Time { return &v }
	soldJoke := batch(teamA, at(0), ptr(at(2)), 5, 1)[0]
	batch(teamA, at(3), ptr(at(3)), 3, 0)
	batch(teamA, at(4), ptr(at(4)), 8, 0)
	batch(teamA, at(29), nil, 0, 0)
	batch(teamB, at(1), ptr(at(1)), 4, 0)
	batch(teamB, at(2), ptr(at(2)), 5, 0)
	batch(teamB, at(3), ptr(at(3)), 6, 0)

	cust := mustID(`
		INSERT INTO ai_customers (ai_customer_id, round_id, personal_threshold, starting_budget, remaining_budget)
		VALUES ($1, $2, 7, 3, 2) RETURNING ai_customer_id`, nextID("ai_customers", "ai_customer_id"), roundID)
	mustExec(`
		INSERT INTO purchase_events (event_id, round_id, ai_customer_id, joke_id, team_id, delta, price, created_at)
		VALUES ($1, $2, $3, $4, $5, 1, 1, $6)`,
		nextID("purchase_events", "event_id"), roundID, cust, soldJoke, teamA, at(6))
	mustExec(`
		INSERT INTO purchases (purchase_id, round_id, ai_customer_id, joke_id, team_id, price, created_at)
		VALUES ($1, $2, $3, $4, $5, 1, $6)`,
		nextID("purchases", "purchase_id"), roundID, cust, soldJoke, teamA, at(6))

	near := func(got, want float64) bool { return math.Abs(got-want) < 0.005 }
	want := map[int64]struct{ shipping, storage, hosting, profit float64 }{
		teamA: {8, 1.50, 0.20, -8.95},
		teamB: {6, 0, 0, -6.15},
	}

	stats, err := repo.GetRoundStatsLean(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats.Leaderboard) != 2 {
		t.Fatalf("leaderboard has %d rows", len(stats.Leaderboard))
	}
	for _, row := range stats.Leaderboard {
		w, l := want[row.Team.ID], row.Lean
		if !near(l.ShippingCost, w.shipping) || !near(l.StorageCost, w.storage) || !near(l.HostingCost, w.hosting) ||
			!near(row.Profit, w.profit) {
			t.Errorf("leaderboard team %d: shipping %.4f storage %.4f hosting %.4f profit %.4f; want %+v",
				row.Team.ID, l.ShippingCost, l.StorageCost, l.HostingCost, row.Profit, w)
		}
		if !near(l.SetupCost, w.shipping) || !near(l.CarryingCost, w.storage+w.hosting) {
			t.Errorf("leaderboard team %d: aliases setup %.4f carrying %.4f; want %.2f and %.2f",
				row.Team.ID, l.SetupCost, l.CarryingCost, w.shipping, w.storage+w.hosting)
		}
		sum, err := repo.GetTeamSummaryLean(ctx, roundID, row.Team.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !near(sum.Lean.ShippingCost, w.shipping) || !near(sum.Lean.StorageCost, w.storage) ||
			!near(sum.Lean.HostingCost, w.hosting) || !near(sum.Lean.SetupCost, w.shipping) ||
			!near(sum.Lean.CarryingCost, w.storage+w.hosting) || !near(sum.Profit, w.profit) {
			t.Errorf("summary team %d: %+v profit %.4f; want %+v", row.Team.ID, *sum.Lean, sum.Profit, w)
		}
	}

	round, err := repo.GetRoundByID(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := repo.GetLeanChartRows(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	charts := usecase.BuildLeanCharts(round, rows)
	for _, tm := range charts.Teams {
		w := want[tm.TeamID]
		if !near(tm.Waste.Setup, w.shipping) || !near(tm.Waste.Waiting, w.storage) || !near(tm.Waste.Shelf, w.hosting) {
			t.Errorf("charts team %d waste %+v; want setup %.2f, waiting %.2f, shelf %.2f",
				tm.TeamID, tm.Waste, w.shipping, w.storage, w.hosting)
		}
		if tm.TeamID == teamA {
			if last := tm.Batches[len(tm.Batches)-1]; last.Jokes != 5 {
				t.Errorf("unsplit batch shows %d jokes; want 5, not batch_size 10", last.Jokes)
			}
		}
	}
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run 'TestLeanFeesInStatsAndCharts|TestUnsplitBatchIsChargedUntilTheRoundEnds'`
Expected: FAIL — `l.ShippingCost undefined (type *ports.LeanTeamStats has no field or method ShippingCost)`.

Run: `cd ~/Documents/GitHub/jokefactory_be && go vet -tags integration ./src/infra/repo/postgres/`
Expected: FAIL — `l.ShippingCost undefined` in `lean_fees_stats_integration_test.go`.

- [ ] **Step 4: Ports — the new stats fields**

In `src/core/ports/repositories.go`, replace in `LeanTeamStats`:

```go
	BatchesSubmitted int `json:"batches_submitted"`
	// SetupCost is BatchesSubmitted × setup_cost_per_batch.
	SetupCost float64 `json:"setup_cost"`
	// CarryingCost is carrying_cost_per_joke_minute × (WIP joke-minutes +
	// unsold-inventory joke-minutes).
	CarryingCost           float64      `json:"carrying_cost"`
```

with:

```go
	BatchesSubmitted int `json:"batches_submitted"`
	// ShippingCost is the sum over sent batches of the shipping fee for the
	// batch's size (domain.ShippingFeeFor; an unsplit batch ships as 5).
	ShippingCost float64 `json:"shipping_cost"`
	// StorageCost is storage_fee_per_joke_minute × WIP joke-minutes (jokes
	// waiting on Marketing's desk; an unsplit batch counts 5 jokes).
	StorageCost float64 `json:"storage_cost"`
	// HostingCost is hosting_fee_per_joke_minute × inventory joke-minutes
	// (released jokes waiting for their first sale).
	HostingCost float64 `json:"hosting_cost"`
	// SetupCost is an alias of ShippingCost, kept for older frontends.
	SetupCost float64 `json:"setup_cost"`
	// CarryingCost is an alias of StorageCost + HostingCost, kept for older
	// frontends.
	CarryingCost           float64      `json:"carrying_cost"`
```

In `src/core/ports/repositories.go`, replace:

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
```

with:

```go
// LeanChartTeamRow is one team of a round (a team_rounds_state row) with the
// per-team totals the lean charts read from leanTeamCTE. ShippingCost is the
// leaderboard's shipping_cost; WIPJokeMinutes and InventoryJokeMinutes price
// the storage and hosting fees.
type LeanChartTeamRow struct {
	TeamID               int64
	TeamName             string
	BatchesSubmitted     int
	DiscardedJokes       int
	ShippingCost         float64
	WIPJokeMinutes       float64
	InventoryJokeMinutes float64
}
```

In `src/core/ports/repositories.go`, replace:

```go
	// Lean variants compute setup and carrying costs at read time and fold
```

with:

```go
	// Lean variants compute shipping, storage and hosting fees at read time and fold
```

- [ ] **Step 5: The stats CTE**

In `src/infra/repo/postgres/lean_stats_repo.go`, replace the whole `leanTeamCTE` declaration and its comment:

```go
// leanTeamCTE computes, per team of round $1, everything Lean mode adds, and
// ends in `profits`: one row per team_rounds_state row, with the Classic
// counts, the Lean profit and the five Lean columns. The Classic queries in
// stats_repo.go are not touched.
//
//	cfg         round settings; clock_end = ended_at, or now() while running
//	submitted   batches_submitted = +1 batch_submission_events (a submit);
//	            the -1 events record processing, so they are not counted
//	batch_jokes one row per submitted batch with its joke-row count
//	wip         Σ jokes × minutes(submitted_at → processed_at or clock_end),
//	            an unsplit batch (0 joke rows) counting batch_size jokes;
//	            plus the mean submit → processed seconds of processed batches
//	first_sale  each joke's earliest +1 purchase event
//	inventory   Σ over PUBLISHED jokes of minutes(published_at → first sale
//	            or clock_end); discarded jokes never carry; plus the mean
//	            publish → first sale seconds of sold jokes
//	lean        setup_cost = batches_submitted × setup_cost_per_batch,
//	            carrying_cost = carrying_cost_per_joke_minute × (wip + inventory),
//	            and wip_joke_minutes / inventory_joke_minutes, the two halves
//	            the lean charts show separately
//	profits     Classic profit − setup_cost − carrying_cost
const leanTeamCTE = `
WITH cfg AS (
	SELECT market_price, cost_of_publishing, cost_of_discard, batch_size,
	       setup_cost_per_batch::float8          AS setup_cost_per_batch,
	       carrying_cost_per_joke_minute::float8 AS carrying_cost_per_joke_minute,
	       COALESCE(ended_at, now())             AS clock_end
	FROM rounds WHERE round_id = $1
),
submitted AS (
	SELECT team_id, COUNT(*)::int AS batches_submitted
	FROM batch_submission_events
	WHERE round_id = $1 AND delta > 0
	GROUP BY team_id
),
batch_jokes AS (
	SELECT b.batch_id, b.team_id, b.submitted_at, b.processed_at,
	       COUNT(j.joke_id)::int AS joke_rows
	FROM batches b
	LEFT JOIN jokes j ON j.batch_id = b.batch_id
	WHERE b.round_id = $1 AND b.submitted_at IS NOT NULL
	GROUP BY b.batch_id
),
wip AS (
	SELECT bj.team_id,
	       SUM(
	         (CASE WHEN bj.joke_rows > 0 THEN bj.joke_rows ELSE c.batch_size END)
	         * GREATEST(EXTRACT(EPOCH FROM (COALESCE(bj.processed_at, c.clock_end) - bj.submitted_at))::float8, 0)
	         / 60.0
	       ) AS wip_joke_minutes,
	       AVG(EXTRACT(EPOCH FROM (bj.processed_at - bj.submitted_at))::float8)
	         FILTER (WHERE bj.processed_at IS NOT NULL) AS avg_submit_to_publish_s
	FROM batch_jokes bj CROSS JOIN cfg c
	GROUP BY bj.team_id
),
first_sale AS (
	SELECT joke_id, MIN(created_at) AS first_sold_at
	FROM purchase_events
	WHERE round_id = $1 AND delta > 0
	GROUP BY joke_id
),
inventory AS (
	SELECT b.team_id,
	       SUM(
	         GREATEST(EXTRACT(EPOCH FROM (COALESCE(fs.first_sold_at, c.clock_end) - j.published_at))::float8, 0)
	         / 60.0
	       ) AS inventory_joke_minutes,
	       AVG(EXTRACT(EPOCH FROM (fs.first_sold_at - j.published_at))::float8)
	         FILTER (WHERE fs.first_sold_at IS NOT NULL) AS avg_publish_to_first_sale_s
	FROM jokes j
	JOIN batches b ON b.batch_id = j.batch_id
	LEFT JOIN first_sale fs ON fs.joke_id = j.joke_id
	CROSS JOIN cfg c
	WHERE b.round_id = $1 AND j.publish_status = 'PUBLISHED' AND j.published_at IS NOT NULL
	GROUP BY b.team_id
),
lean AS (
	SELECT trs.team_id,
	       COALESCE(s.batches_submitted, 0) AS batches_submitted,
	       COALESCE(s.batches_submitted, 0) * c.setup_cost_per_batch AS setup_cost,
	       c.carrying_cost_per_joke_minute
	         * (COALESCE(w.wip_joke_minutes, 0) + COALESCE(i.inventory_joke_minutes, 0)) AS carrying_cost,
	       COALESCE(w.wip_joke_minutes, 0)            AS wip_joke_minutes,
	       COALESCE(i.inventory_joke_minutes, 0)      AS inventory_joke_minutes,
	       COALESCE(w.avg_submit_to_publish_s, 0)     AS avg_submit_to_publish_s,
	       COALESCE(i.avg_publish_to_first_sale_s, 0) AS avg_publish_to_first_sale_s
	FROM team_rounds_state trs
	CROSS JOIN cfg c
	LEFT JOIN submitted s ON s.team_id = trs.team_id
	LEFT JOIN wip w       ON w.team_id = trs.team_id
	LEFT JOIN inventory i ON i.team_id = trs.team_id
	WHERE trs.round_id = $1
),
profits AS (
	SELECT trs.team_id,
	       t.name AS team_name,
	       trs.batches_created,
	       trs.batches_processed,
	       trs.points_earned AS total_sales,
	       trs.published_jokes,
	       trs.discarded_jokes,
	       trs.published_jokes + trs.discarded_jokes AS total_jokes,
	       GREATEST(trs.published_jokes - trs.points_earned, 0) AS unsold_jokes,
	       (SELECT market_price FROM cfg) * trs.points_earned::float8
	         - (SELECT cost_of_publishing FROM cfg) * trs.published_jokes::float8
	         - (SELECT cost_of_discard FROM cfg) * trs.discarded_jokes::float8
	         - l.setup_cost - l.carrying_cost AS profit,
	       l.batches_submitted, l.setup_cost, l.carrying_cost,
	       l.wip_joke_minutes, l.inventory_joke_minutes,
	       l.avg_submit_to_publish_s, l.avg_publish_to_first_sale_s
	FROM team_rounds_state trs
	JOIN teams t ON t.id = trs.team_id
	JOIN lean l  ON l.team_id = trs.team_id
	WHERE trs.round_id = $1
)`
```

with:

```go
// leanTeamCTE computes, per team of round $1, everything Lean mode adds, and
// ends in `profits`: one row per team_rounds_state row, with the Classic
// counts, the Lean profit and the Lean columns. The Classic queries in
// stats_repo.go are not touched.
//
//	cfg         round settings and fees; clock_end = ended_at, or now() while running
//	submitted   batches_submitted = +1 batch_submission_events (a submit);
//	            the -1 events record processing, so they are not counted
//	batch_jokes one row per submitted batch with its joke-row count
//	shipping    Σ over sent batches of the shipping fee for its size: small
//	            for 1–4 jokes, standard for 5, large for 6+; an unsplit batch
//	            (0 joke rows) ships as 5 (domain.StandardShipmentJokes)
//	wip         Σ jokes × minutes(submitted_at → processed_at or clock_end),
//	            an unsplit batch counting 5 jokes (not batch_size); plus the
//	            mean submit → processed seconds of processed batches
//	first_sale  each joke's earliest +1 purchase event
//	inventory   Σ over PUBLISHED jokes of minutes(published_at → first sale
//	            or clock_end); discarded jokes never carry; plus the mean
//	            publish → first sale seconds of sold jokes
//	lean        shipping_cost; storage_cost = storage fee × wip joke-minutes;
//	            hosting_cost = hosting fee × inventory joke-minutes; and the
//	            two joke-minute totals the lean charts show separately
//	profits     Classic profit − shipping − storage − hosting, plus the
//	            aliases setup_cost = shipping_cost and
//	            carrying_cost = storage_cost + hosting_cost
const leanTeamCTE = `
WITH cfg AS (
	SELECT market_price, cost_of_publishing, cost_of_discard,
	       shipping_fee_small::float8          AS shipping_fee_small,
	       shipping_fee_standard::float8       AS shipping_fee_standard,
	       shipping_fee_large::float8          AS shipping_fee_large,
	       storage_fee_per_joke_minute::float8 AS storage_fee_per_joke_minute,
	       hosting_fee_per_joke_minute::float8 AS hosting_fee_per_joke_minute,
	       COALESCE(ended_at, now())           AS clock_end
	FROM rounds WHERE round_id = $1
),
submitted AS (
	SELECT team_id, COUNT(*)::int AS batches_submitted
	FROM batch_submission_events
	WHERE round_id = $1 AND delta > 0
	GROUP BY team_id
),
batch_jokes AS (
	SELECT b.batch_id, b.team_id, b.submitted_at, b.processed_at,
	       COUNT(j.joke_id)::int AS joke_rows
	FROM batches b
	LEFT JOIN jokes j ON j.batch_id = b.batch_id
	WHERE b.round_id = $1 AND b.submitted_at IS NOT NULL
	GROUP BY b.batch_id
),
shipping AS (
	SELECT bj.team_id,
	       SUM(CASE WHEN bj.jokes < 5 THEN c.shipping_fee_small
	                WHEN bj.jokes = 5 THEN c.shipping_fee_standard
	                ELSE c.shipping_fee_large END) AS shipping_cost
	FROM (SELECT team_id, CASE WHEN joke_rows > 0 THEN joke_rows ELSE 5 END AS jokes FROM batch_jokes) bj
	CROSS JOIN cfg c
	GROUP BY bj.team_id
),
wip AS (
	SELECT bj.team_id,
	       SUM(
	         (CASE WHEN bj.joke_rows > 0 THEN bj.joke_rows ELSE 5 END)
	         * GREATEST(EXTRACT(EPOCH FROM (COALESCE(bj.processed_at, c.clock_end) - bj.submitted_at))::float8, 0)
	         / 60.0
	       ) AS wip_joke_minutes,
	       AVG(EXTRACT(EPOCH FROM (bj.processed_at - bj.submitted_at))::float8)
	         FILTER (WHERE bj.processed_at IS NOT NULL) AS avg_submit_to_publish_s
	FROM batch_jokes bj CROSS JOIN cfg c
	GROUP BY bj.team_id
),
first_sale AS (
	SELECT joke_id, MIN(created_at) AS first_sold_at
	FROM purchase_events
	WHERE round_id = $1 AND delta > 0
	GROUP BY joke_id
),
inventory AS (
	SELECT b.team_id,
	       SUM(
	         GREATEST(EXTRACT(EPOCH FROM (COALESCE(fs.first_sold_at, c.clock_end) - j.published_at))::float8, 0)
	         / 60.0
	       ) AS inventory_joke_minutes,
	       AVG(EXTRACT(EPOCH FROM (fs.first_sold_at - j.published_at))::float8)
	         FILTER (WHERE fs.first_sold_at IS NOT NULL) AS avg_publish_to_first_sale_s
	FROM jokes j
	JOIN batches b ON b.batch_id = j.batch_id
	LEFT JOIN first_sale fs ON fs.joke_id = j.joke_id
	CROSS JOIN cfg c
	WHERE b.round_id = $1 AND j.publish_status = 'PUBLISHED' AND j.published_at IS NOT NULL
	GROUP BY b.team_id
),
lean AS (
	SELECT trs.team_id,
	       COALESCE(s.batches_submitted, 0)                                   AS batches_submitted,
	       COALESCE(sh.shipping_cost, 0)                                      AS shipping_cost,
	       c.storage_fee_per_joke_minute * COALESCE(w.wip_joke_minutes, 0)       AS storage_cost,
	       c.hosting_fee_per_joke_minute * COALESCE(i.inventory_joke_minutes, 0) AS hosting_cost,
	       COALESCE(w.wip_joke_minutes, 0)            AS wip_joke_minutes,
	       COALESCE(i.inventory_joke_minutes, 0)      AS inventory_joke_minutes,
	       COALESCE(w.avg_submit_to_publish_s, 0)     AS avg_submit_to_publish_s,
	       COALESCE(i.avg_publish_to_first_sale_s, 0) AS avg_publish_to_first_sale_s
	FROM team_rounds_state trs
	CROSS JOIN cfg c
	LEFT JOIN submitted s ON s.team_id = trs.team_id
	LEFT JOIN shipping sh ON sh.team_id = trs.team_id
	LEFT JOIN wip w       ON w.team_id = trs.team_id
	LEFT JOIN inventory i ON i.team_id = trs.team_id
	WHERE trs.round_id = $1
),
profits AS (
	SELECT trs.team_id,
	       t.name AS team_name,
	       trs.batches_created,
	       trs.batches_processed,
	       trs.points_earned AS total_sales,
	       trs.published_jokes,
	       trs.discarded_jokes,
	       trs.published_jokes + trs.discarded_jokes AS total_jokes,
	       GREATEST(trs.published_jokes - trs.points_earned, 0) AS unsold_jokes,
	       (SELECT market_price FROM cfg) * trs.points_earned::float8
	         - (SELECT cost_of_publishing FROM cfg) * trs.published_jokes::float8
	         - (SELECT cost_of_discard FROM cfg) * trs.discarded_jokes::float8
	         - l.shipping_cost - l.storage_cost - l.hosting_cost AS profit,
	       l.batches_submitted, l.shipping_cost, l.storage_cost, l.hosting_cost,
	       l.shipping_cost                  AS setup_cost,
	       l.storage_cost + l.hosting_cost  AS carrying_cost,
	       l.wip_joke_minutes, l.inventory_joke_minutes,
	       l.avg_submit_to_publish_s, l.avg_publish_to_first_sale_s
	FROM team_rounds_state trs
	JOIN teams t ON t.id = trs.team_id
	JOIN lean l  ON l.team_id = trs.team_id
	WHERE trs.round_id = $1
)`
```

In `src/infra/repo/postgres/lean_stats_repo.go`, replace in `GetRoundStatsLean`:

```go
			published_jokes, discarded_jokes, total_jokes, unsold_jokes, profit,
			batches_submitted, setup_cost, carrying_cost,
			avg_submit_to_publish_s, avg_publish_to_first_sale_s
```

with:

```go
			published_jokes, discarded_jokes, total_jokes, unsold_jokes, profit,
			batches_submitted, shipping_cost, storage_cost, hosting_cost, setup_cost, carrying_cost,
			avg_submit_to_publish_s, avg_publish_to_first_sale_s
```

In `src/infra/repo/postgres/lean_stats_repo.go`, replace in `GetRoundStatsLean`:

```go
			&ts.Lean.BatchesSubmitted, &ts.Lean.SetupCost, &ts.Lean.CarryingCost,
```

with:

```go
			&ts.Lean.BatchesSubmitted, &ts.Lean.ShippingCost, &ts.Lean.StorageCost, &ts.Lean.HostingCost,
			&ts.Lean.SetupCost, &ts.Lean.CarryingCost,
```

In `src/infra/repo/postgres/lean_stats_repo.go`, replace the doc of `GetTeamSummaryLean`:

```go
// GetTeamSummaryLean mirrors GetTeamSummary's output columns and scan order,
// with Lean profit and rank, and appends the five Lean columns. Like the
```

with:

```go
// GetTeamSummaryLean mirrors GetTeamSummary's output columns and scan order,
// with Lean profit and rank, and appends the Lean columns. Like the
```

In `src/infra/repo/postgres/lean_stats_repo.go`, replace in `GetTeamSummaryLean`:

```go
		       COALESCE(p.batches_submitted, 0),
		       COALESCE(p.setup_cost, 0),
		       COALESCE(p.carrying_cost, 0),
```

with:

```go
		       COALESCE(p.batches_submitted, 0),
		       COALESCE(p.shipping_cost, 0),
		       COALESCE(p.storage_cost, 0),
		       COALESCE(p.hosting_cost, 0),
		       COALESCE(p.setup_cost, 0),
		       COALESCE(p.carrying_cost, 0),
```

In `src/infra/repo/postgres/lean_stats_repo.go`, replace in `GetTeamSummaryLean`:

```go
		&summary.Lean.BatchesSubmitted, &summary.Lean.SetupCost, &summary.Lean.CarryingCost,
```

with:

```go
		&summary.Lean.BatchesSubmitted, &summary.Lean.ShippingCost, &summary.Lean.StorageCost, &summary.Lean.HostingCost,
		&summary.Lean.SetupCost, &summary.Lean.CarryingCost,
```

- [ ] **Step 6: The lean charts read shipping from the CTE**

In `src/infra/repo/postgres/lean_charts_repo.go`, replace:

```go
SELECT team_id, team_name, batches_submitted, discarded_jokes,
       wip_joke_minutes, inventory_joke_minutes
FROM profits
```

with:

```go
SELECT team_id, team_name, batches_submitted, discarded_jokes, shipping_cost,
       wip_joke_minutes, inventory_joke_minutes
FROM profits
```

In `src/infra/repo/postgres/lean_charts_repo.go`, replace:

```go
		if err := rows.Scan(&t.TeamID, &t.TeamName, &t.BatchesSubmitted, &t.DiscardedJokes,
			&t.WIPJokeMinutes, &t.InventoryJokeMinutes); err != nil {
```

with:

```go
		if err := rows.Scan(&t.TeamID, &t.TeamName, &t.BatchesSubmitted, &t.DiscardedJokes, &t.ShippingCost,
			&t.WIPJokeMinutes, &t.InventoryJokeMinutes); err != nil {
```

In `src/infra/repo/postgres/lean_charts_repo.go`, replace:

```go
// GetLeanChartRows reads the lean charts' rows in one read-only REPEATABLE
// READ transaction: every query sees the same rows and the same now(), so a
// running round's clock end, idle samples and carrying minutes stop at one
// instant. Nothing is written.
```

with:

```go
// GetLeanChartRows reads the lean charts' rows in one read-only REPEATABLE
// READ transaction: every query sees the same rows and the same now(), so a
// running round's clock end, idle samples and storage and hosting minutes stop
// at one instant. Nothing is written.
```

In `src/core/usecase/lean_charts.go`, replace:

```go
// LeanWaste is a team's cost of waste by kind, in dollars. Setup + Waiting +
// Shelf equals the leaderboard's setup_cost + carrying_cost.
```

with:

```go
// LeanWaste is a team's cost of waste by kind, in dollars. The JSON keys
// predate the fee names: Setup is the shipping fee, Waiting the storage fee and
// Shelf the hosting fee, so Setup + Waiting + Shelf equals the leaderboard's
// shipping_cost + storage_cost + hosting_cost (= setup_cost + carrying_cost).
```

In `src/core/usecase/lean_charts.go`, replace in the comment of `BuildLeanCharts`:

```go
//	waste      setup = batches_submitted × setup_cost_per_batch,
//	           waiting = rate × WIP joke-minutes, shelf = rate × inventory
//	           joke-minutes, never_sold = cost_of_publishing × published jokes
//	           never sold, discarded = cost_of_discard × discarded jokes
//	idle(t)    waiting = Σ jokes of batches with submitted ≤ t < processed;
//	           shelf = published jokes with published ≤ t < first sale
//	jokes      a batch's joke rows, or batch_size while it is unsplit
```

with:

```go
//	waste      setup = the leaderboard's shipping_cost, waiting = storage fee ×
//	           WIP joke-minutes, shelf = hosting fee × inventory joke-minutes,
//	           never_sold = cost_of_publishing × published jokes never sold,
//	           discarded = cost_of_discard × discarded jokes
//	idle(t)    waiting = Σ jokes of batches with submitted ≤ t < processed;
//	           shelf = published jokes with published ≤ t < first sale
//	jokes      a batch's joke rows, or 5 (domain.StandardShipmentJokes)
//	           while it is unsplit
```

In `src/core/usecase/lean_charts.go`, replace:

```go
	jokesIn := func(b ports.LeanChartBatchRow) int {
		if b.JokeRows > 0 {
			return b.JokeRows
		}
		return round.BatchSize
	}
```

with:

```go
	jokesIn := func(b ports.LeanChartBatchRow) int {
		if b.JokeRows > 0 {
			return b.JokeRows
		}
		return domain.StandardShipmentJokes
	}
```

In `src/core/usecase/lean_charts.go`, replace in `teamWaste`:

```go
	w := LeanWaste{
		Setup:     float64(tr.BatchesSubmitted) * round.SetupCostPerBatch,
		Waiting:   round.CarryingCostPerJokeMinute * tr.WIPJokeMinutes,
		Shelf:     round.CarryingCostPerJokeMinute * tr.InventoryJokeMinutes,
```

with:

```go
	w := LeanWaste{
		Setup:     tr.ShippingCost,
		Waiting:   round.StorageFeePerJokeMinute * tr.WIPJokeMinutes,
		Shelf:     round.HostingFeePerJokeMinute * tr.InventoryJokeMinutes,
```

- [ ] **Step 7: The memstore mirrors the CTE**

In `src/core/usecase/testutil/memstore_lean_stats.go`, replace:

```go
		a.stats.BatchesSubmitted++

		// wip: jokes (batch_size when unsplit) × minutes submitted → processed/clock end.
		jokes := len(b.Jokes)
		if jokes == 0 {
			jokes = rd.BatchSize
		}
```

with:

```go
		a.stats.BatchesSubmitted++
		// shipping: the fee for the batch's size; an unsplit batch ships as 5.
		a.stats.ShippingCost += domain.ShippingFeeFor(len(b.Jokes),
			rd.ShippingFeeSmall, rd.ShippingFeeStandard, rd.ShippingFeeLarge)

		// wip: jokes (5 while unsplit) × minutes submitted → processed/clock end.
		jokes := len(b.Jokes)
		if jokes == 0 {
			jokes = domain.StandardShipmentJokes
		}
```

In `src/core/usecase/testutil/memstore_lean_stats.go`, replace:

```go
		s := a.stats
		s.SetupCost = float64(s.BatchesSubmitted) * rd.SetupCostPerBatch
		s.CarryingCost = rd.CarryingCostPerJokeMinute * (a.wipMin + a.invMin)
```

with:

```go
		s := a.stats
		s.StorageCost = rd.StorageFeePerJokeMinute * a.wipMin
		s.HostingCost = rd.HostingFeePerJokeMinute * a.invMin
		s.SetupCost = s.ShippingCost
		s.CarryingCost = s.StorageCost + s.HostingCost
```

In `src/core/usecase/testutil/memstore_lean_stats.go`, replace:

```go
// leanProfit is the Classic profit minus setup and carrying costs.
func leanProfit(rd *domain.Round, s *domain.TeamRoundState, lean *ports.LeanTeamStats) float64 {
	return rd.MarketPrice*float64(s.PointsEarned) -
		rd.CostOfPublishing*float64(s.PublishedJokes) -
		rd.CostOfDiscard*float64(s.DiscardedJokes) -
		lean.SetupCost - lean.CarryingCost
}
```

with:

```go
// leanProfit is the Classic profit minus the shipping, storage and hosting fees.
func leanProfit(rd *domain.Round, s *domain.TeamRoundState, lean *ports.LeanTeamStats) float64 {
	return rd.MarketPrice*float64(s.PointsEarned) -
		rd.CostOfPublishing*float64(s.PublishedJokes) -
		rd.CostOfDiscard*float64(s.DiscardedJokes) -
		lean.ShippingCost - lean.StorageCost - lean.HostingCost
}
```

In `src/core/usecase/testutil/memstore_lean_charts.go`, replace:

```go
	type acc struct {
		submitted  int
		wip, shelf float64
	}
```

with:

```go
	type acc struct {
		submitted            int
		shipping, wip, shelf float64
	}
```

In `src/core/usecase/testutil/memstore_lean_charts.go`, replace:

```go
		a.submitted++
		jokes := len(b.Jokes)
		if jokes == 0 {
			jokes = rd.BatchSize
		}
```

with:

```go
		a.submitted++
		a.shipping += domain.ShippingFeeFor(len(b.Jokes),
			rd.ShippingFeeSmall, rd.ShippingFeeStandard, rd.ShippingFeeLarge)
		jokes := len(b.Jokes)
		if jokes == 0 {
			jokes = domain.StandardShipmentJokes
		}
```

In `src/core/usecase/testutil/memstore_lean_charts.go`, replace:

```go
		if a := byTeam[team.ID]; a != nil {
			row.BatchesSubmitted, row.WIPJokeMinutes, row.InventoryJokeMinutes = a.submitted, a.wip, a.shelf
		}
```

with:

```go
		if a := byTeam[team.ID]; a != nil {
			row.BatchesSubmitted, row.ShippingCost = a.submitted, a.shipping
			row.WIPJokeMinutes, row.InventoryJokeMinutes = a.wip, a.shelf
		}
```

- [ ] **Step 8: Run the new memstore tests to verify they pass**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ -run 'TestLeanFeesInStatsAndCharts|TestUnsplitBatchIsChargedUntilTheRoundEnds' -v`
Expected: PASS — both tests.

- [ ] **Step 9: Run the whole suite and see which fixtures still price the old costs**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./...`
Expected: FAIL — `TestLeanStatsComputeSetupAndCarrying` ("setup=2.00 carrying=4.20 profit=-5.52"), `TestMemStoreLeanChartRowsMirrorTheLeanStats`, `TestMemStoreLeanChartRowsUnsplitBatchAndEmptyTeam`, `TestBuildLeanChartsWasteMatchesTheLeaderboardFormula`, `TestBuildLeanChartsUnsplitBatchCountsBatchSize`, `TestBuildLeanChartsClassAverageIncludesTeamsWithNoBatches`: their fixtures still set `SetupCostPerBatch` / `CarryingCostPerJokeMinute`, which stats no longer read.

- [ ] **Step 10: Move the fixtures onto the fees**

Flat $3 shipping and one $0.02 rate for storage and hosting keep each old fixture's arithmetic (setup $3 a batch, carrying $0.02 a joke-minute) exactly.

In `src/core/usecase/lean_stats_test.go`, replace:

```go
	cfg.CostOfDiscard = 0.01
	cfg.SetupCostPerBatch = 3
	cfg.CarryingCostPerJokeMinute = 0.02
	if _, err := st.InsertRoundConfig(ctx, 1, &cfg); err != nil {
```

with:

```go
	cfg.CostOfDiscard = 0.01
	// Flat $3 shipping and one $0.02 rate for storage and hosting keep the
	// old setup $3 / carrying $0.02 arithmetic of the tests built on this.
	cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge = 3, 3, 3
	cfg.StorageFeePerJokeMinute = 0.02
	cfg.HostingFeePerJokeMinute = 0.02
	if _, err := st.InsertRoundConfig(ctx, 1, &cfg); err != nil {
```

In `src/core/usecase/lean_stats_test.go`, replace:

```go
// published and 2 discarded; one published joke sold at T+10min; now = T+16min;
// setup $3, carrying $0.02/joke-min, price $1, publishing $0.10, discard $0.01.
//
//	WIP:        5 jokes × 6 min                     = 30 joke-min
//	Inventory:  sold joke 4 min (6→10) + 2 unsold × 10 min (6→16) = 24 joke-min
//	carrying = 0.02 × 54 = 1.08 ; setup = 3
//	profit   = 1×1 − 3×0.10 − 2×0.01 − 3 − 1.08 = −3.40
```

with:

```go
// published and 2 discarded; one published joke sold at T+10min; now = T+16min;
// shipping $3, storage and hosting $0.02/joke-min, price $1, publishing $0.10,
// discard $0.01.
//
//	WIP:        5 jokes × 6 min                     = 30 joke-min
//	Inventory:  sold joke 4 min (6→10) + 2 unsold × 10 min (6→16) = 24 joke-min
//	storage = 0.02 × 30 = 0.60 ; hosting = 0.02 × 24 = 0.48 ; shipping = 3
//	carrying = 1.08 ; setup = 3
//	profit   = 1×1 − 3×0.10 − 2×0.01 − 3 − 1.08 = −3.40
```

In `src/core/usecase/lean_chart_rows_test.go`, replace:

```go
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
```

with:

```go
	// The leaderboard's fees are the rows' shipping and fee × joke-minutes.
	stats, err := st.GetRoundStatsLean(ctx, round.ID)
	if err != nil {
		t.Fatal(err)
	}
	lean := stats.Leaderboard[0].Lean
	if !approx(lean.ShippingCost, tr.ShippingCost) || !approx(tr.ShippingCost, 3) ||
		!approx(lean.StorageCost, round.StorageFeePerJokeMinute*tr.WIPJokeMinutes) ||
		!approx(lean.HostingCost, round.HostingFeePerJokeMinute*tr.InventoryJokeMinutes) {
		t.Fatalf("leaderboard %+v; rows give shipping %.4f, WIP %.4f, inventory %.4f",
			*lean, tr.ShippingCost, tr.WIPJokeMinutes, tr.InventoryJokeMinutes)
	}
}
```

In `src/core/usecase/lean_chart_rows_test.go`, replace:

```go
// Review focus 2 and 3: an unsplit batch counts batch_size jokes of WIP, and a
// team with no batches still gets a (zero) row.
func TestMemStoreLeanChartRowsUnsplitBatchAndEmptyTeam(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketLean
	cfg.BatchSize = 5
	cfg.CarryingCostPerJokeMinute = 0.05
```

with:

```go
// Review focus 2 and 3: an unsplit batch counts 5 jokes of WIP and ships as
// the standard 5, even when the round allows batches of 10, and a team with no
// batches still gets a (zero) row.
func TestMemStoreLeanChartRowsUnsplitBatchAndEmptyTeam(t *testing.T) {
	ctx := context.Background()
	st := testutil.NewStore()
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketLean
	cfg.BatchSize = 10
	cfg.StorageFeePerJokeMinute = 0.05
```

In `src/core/usecase/lean_chart_rows_test.go`, replace:

```go
	if got := rows.Teams[0]; got.BatchesSubmitted != 1 || math.Abs(got.WIPJokeMinutes-10) > 1e-9 {
		t.Fatalf("team 1 %+v; want 1 submitted and 5 jokes × 2 min = 10 joke-min", got)
	}
```

with:

```go
	if got := rows.Teams[0]; got.BatchesSubmitted != 1 || math.Abs(got.WIPJokeMinutes-10) > 1e-9 || got.ShippingCost != 2 {
		t.Fatalf("team 1 %+v; want 1 submitted, 5 jokes × 2 min = 10 joke-min, standard shipping $2", got)
	}
```

In `src/core/usecase/lean_chart_rows_test.go`, replace:

```go
		if row.Team.ID == 1 && math.Abs(row.Lean.CarryingCost-0.05*10) > 1e-9 {
			t.Fatalf("leaderboard carrying %.4f; want 0.50", row.Lean.CarryingCost)
		}
```

with:

```go
		if row.Team.ID == 1 && (math.Abs(row.Lean.StorageCost-0.05*10) > 1e-9 || row.Lean.CarryingCost != row.Lean.StorageCost) {
			t.Fatalf("leaderboard storage %.4f, carrying %.4f; want both 0.50", row.Lean.StorageCost, row.Lean.CarryingCost)
		}
```

In `src/core/usecase/lean_charts_test.go`, replace:

```go
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
```

with:

```go
// lcRound is a started LEAN round: window 900 s (one sample a minute), batch
// size 5, storage and hosting $0.02/joke-min, publishing $0.10, discard $0.01,
// WIP limit 2. Shipping comes from each team row's ShippingCost.
func lcRound() *domain.Round {
	start := lcStart
	return &domain.Round{
		ID: 7, MarketMode: domain.MarketLean, BatchSize: 5, MarketPrice: 1,
		CostOfPublishing: 0.10, CostOfDiscard: 0.01,
		StorageFeePerJokeMinute: 0.02, HostingFeePerJokeMinute: 0.02,
		ArrivalWindowSeconds: 900, WIPLimit: 2,
		StartedAt: &start,
	}
}
```

In `src/core/usecase/lean_charts_test.go`, replace:

```go
		Teams: []ports.LeanChartTeamRow{{
			TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, DiscardedJokes: 2,
			WIPJokeMinutes: 30, InventoryJokeMinutes: 24,
		}},
```

with:

```go
		Teams: []ports.LeanChartTeamRow{{
			TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, DiscardedJokes: 2, ShippingCost: 3,
			WIPJokeMinutes: 30, InventoryJokeMinutes: 24,
		}},
```

In `src/core/usecase/lean_charts_test.go`, replace:

```go
	// The leaderboard's setup_cost + carrying_cost for the same rows.
	if !lcNear(got.Setup+got.Waiting+got.Shelf, 3+0.02*(30+24)) {
		t.Fatalf("setup+waiting+shelf %.4f; want the leaderboard's 4.08", got.Setup+got.Waiting+got.Shelf)
	}
```

with:

```go
	// The leaderboard's shipping + storage + hosting for the same rows.
	if !lcNear(got.Setup+got.Waiting+got.Shelf, 3+0.02*30+0.02*24) {
		t.Fatalf("setup+waiting+shelf %.4f; want the leaderboard's 4.08", got.Setup+got.Waiting+got.Shelf)
	}
```

In `src/core/usecase/lean_charts_test.go`, replace:

```go
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
```

with:

```go
// Review focus 2: an unsplit batch counts 5 jokes even in a round whose
// batch_size is 10.
func TestBuildLeanChartsUnsplitBatchCountsFiveJokes(t *testing.T) {
	rows := &ports.LeanChartRows{
		ClockEnd: lcAt(120),
		Teams:    []ports.LeanChartTeamRow{{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, ShippingCost: 2, WIPJokeMinutes: 10}},
		Batches:  []ports.LeanChartBatchRow{{BatchID: 1, TeamID: 1, SubmittedAt: lcAt(0)}},
	}
	round := lcRound()
	round.BatchSize = 10
	team := BuildLeanCharts(round, rows).Teams[0]
	if len(team.Idle) != 3 {
		t.Fatalf("idle %+v; want 3 samples", team.Idle)
	}
	for _, s := range team.Idle {
		if s.Waiting != 5 || s.Shelf != 0 {
			t.Fatalf("idle %+v; an unsplit batch waits as 5 jokes, not batch_size 10", team.Idle)
		}
	}
```

In `src/core/usecase/lean_charts_test.go`, replace:

```go
		Teams: []ports.LeanChartTeamRow{
			{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, WIPJokeMinutes: 1},
			{TeamID: 2, TeamName: "Team 2", BatchesSubmitted: 2, WIPJokeMinutes: 2},
			{TeamID: 3, TeamName: "Team 3"},
		},
```

with:

```go
		Teams: []ports.LeanChartTeamRow{
			{TeamID: 1, TeamName: "Team 1", BatchesSubmitted: 1, ShippingCost: 3, WIPJokeMinutes: 1},
			{TeamID: 2, TeamName: "Team 2", BatchesSubmitted: 2, ShippingCost: 6, WIPJokeMinutes: 2},
			{TeamID: 3, TeamName: "Team 3"},
		},
```

- [ ] **Step 11: Move the SQL fixtures onto the fee columns**

In `src/infra/repo/postgres/lean_stats_integration_test.go`, replace:

```go
// Fixture (round ENDED, 10:00–10:30, setup $3, carrying $0.02/joke-min, batch
// size 5, price $1, publishing $0.10, discard $0.01):
```

with:

```go
// Fixture (round ENDED, 10:00–10:30, shipping $3 for every batch size,
// storage and hosting $0.02/joke-min — so setup_cost is $3 a batch and
// carrying_cost is $0.02 a joke-minute, as before the fees were split — batch
// size 5, price $1, publishing $0.10, discard $0.01):
```

In `src/infra/repo/postgres/lean_stats_integration_test.go`, replace:

```go
		INSERT INTO rounds (round_id, round_number, status, batch_size, market_price, cost_of_publishing, cost_of_discard,
		                    market_mode, setup_cost_per_batch, carrying_cost_per_joke_minute, started_at, ended_at)
		VALUES ($1, 999, 'ENDED', 5, 1, 0.10, 0.01, 'LEAN', 3, 0.02, $2, $3)
		RETURNING round_id`, nextID("rounds", "round_id"), at(0), at(30))
```

with:

```go
		INSERT INTO rounds (round_id, round_number, status, batch_size, market_price, cost_of_publishing, cost_of_discard,
		                    market_mode, shipping_fee_small, shipping_fee_standard, shipping_fee_large,
		                    storage_fee_per_joke_minute, hosting_fee_per_joke_minute, started_at, ended_at)
		VALUES ($1, 999, 'ENDED', 5, 1, 0.10, 0.01, 'LEAN', 3, 3, 3, 0.02, 0.02, $2, $3)
		RETURNING round_id`, nextID("rounds", "round_id"), at(0), at(30))
```

In `src/infra/repo/postgres/lean_charts_integration_test.go`, replace:

```go
// Fixture (round ENDED 10:00–10:30, arrival window 900 s so one sample a
// minute, WIP limit 2, setup $3, carrying $0.02/joke-min, batch size 5,
// publishing $0.10, discard $0.01) — the lean stats fixture:
```

with:

```go
// Fixture (round ENDED 10:00–10:30, arrival window 900 s so one sample a
// minute, WIP limit 2, shipping $3 for every batch size, storage and hosting
// $0.02/joke-min, batch size 5, publishing $0.10, discard $0.01) — the lean
// stats fixture:
```

In `src/infra/repo/postgres/lean_charts_integration_test.go`, replace:

```go
			INSERT INTO rounds (round_id, round_number, status, batch_size, market_price, cost_of_publishing, cost_of_discard,
			                    market_mode, arrival_window_seconds, setup_cost_per_batch, carrying_cost_per_joke_minute,
			                    wip_limit, started_at, ended_at)
			VALUES ($1, 999, $2::text::round_status, 5, 1, 0.10, 0.01, $3, 900, 3, 0.02, 2, $4, $5)
```

with:

```go
			INSERT INTO rounds (round_id, round_number, status, batch_size, market_price, cost_of_publishing, cost_of_discard,
			                    market_mode, arrival_window_seconds, shipping_fee_small, shipping_fee_standard,
			                    shipping_fee_large, storage_fee_per_joke_minute, hosting_fee_per_joke_minute,
			                    wip_limit, started_at, ended_at)
			VALUES ($1, 999, $2::text::round_status, 5, 1, 0.10, 0.01, $3, 900, 3, 3, 3, 0.02, 0.02, 2, $4, $5)
```

- [ ] **Step 12: Full checks, the SQL included**

Run: `cd ~/Documents/GitHub/jokefactory_be && test -z "$(gofmt -l .)" && go build ./... && go vet ./... && go vet -tags integration ./... && go test ./...`
Expected: PASS — every package `ok`.

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_ALLOW_RESET=1 JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory_fees_test?sslmode=disable" go test -tags integration ./src/infra/repo/postgres/ ./src/core/usecase/ -v -run 'Integration'`
Expected: PASS — `TestLeanChartsSQLIntegration`, `TestLeanFeeColumnsRoundTripIntegration`, `TestResetGameRestoresTheLeanRoundsIntegration`, `TestLeanFeesSQLIntegration`, `TestLeanStatsSQLIntegration`, `TestMarketingNoteIntegration` all `--- PASS`.

- [ ] **Step 13: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be && git add \
  src/core/ports/repositories.go \
  src/infra/repo/postgres/lean_stats_repo.go src/infra/repo/postgres/lean_charts_repo.go \
  src/core/usecase/lean_charts.go \
  src/core/usecase/testutil/memstore_lean_stats.go src/core/usecase/testutil/memstore_lean_charts.go \
  src/core/usecase/lean_fees_stats_test.go src/core/usecase/lean_stats_test.go \
  src/core/usecase/lean_chart_rows_test.go src/core/usecase/lean_charts_test.go \
  src/infra/repo/postgres/lean_fees_stats_integration_test.go \
  src/infra/repo/postgres/lean_stats_integration_test.go src/infra/repo/postgres/lean_charts_integration_test.go && git commit -q -F - <<'EOF'
feat(lean): shipping, storage and hosting fees in stats and charts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 3A: Frontend — fee settings and a Lean-only instructor CONFIG

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `components/FeeConfigFields.tsx`, `views/testing/renderWithGame.ts`
- Replace: `services/leanMode.ts`, `services/leanMode.test.ts`
- Modify: `types/api.ts` (`PublicRound`, `ConfigRequest`), `types.ts` (`GameConfig`, `ApiRound`), `context.tsx` (`PERSISTED_CONFIG_KEYS`, `updateConfig`, export `GameContextType` and `GameContext`), `services/instructorService.ts` (`updateRoundConfig` body type), `scripts/smoke-api.ts` (optional public-round keys), `views/Instructor.tsx` (imports, CONFIG state, edit rules, `handleUpdateSettings`, the preset handler, CONFIG JSX, the preset notice)
- Test: create `components/FeeConfigFields.test.ts`, `views/Instructor.render.test.ts`; replace `services/leanMode.test.ts`

**Interfaces:**
- Consumes (Task 1): the five snake_case fee keys on every public round and on the config request; the 409 `MARKET_MODE_LOCKED` refusal.
- Produces:
  ```ts
  // services/leanMode.ts
  export interface ShippingFees { shippingFeeSmall: number; shippingFeeStandard: number; shippingFeeLarge: number }
  export interface LeanFeeConfig extends ShippingFees { storageFeePerJokeMinute: number; hostingFeePerJokeMinute: number }
  export interface LeanConfig extends LeanFeeConfig { marketMode; arrivalWindowSeconds; setupCostPerBatch; carryingCostPerJokeMinute; wipLimit }
  export const STANDARD_SHIPMENT_JOKES = 5;
  export interface LeanConfigUpdate extends Partial<LeanConfig> { preferenceBase?: number; customerCount?: number } // was LeanPresetConfig
  export function shippingFeeFor(jokes: number, c: ShippingFees): number   // 1–4 small, 5 standard, 6+ large, unknown → 5
  export function fmtFee(v: number): string        // 2 → "$2", 0.5 → "$0.50"
  export function fmtCents(v: number): string      // 0.1 → "10¢", 0.025 → "2.5¢", 1 → "$1.00"
  export function fmtPerMinute(v: number): string  // 0.1 → "10¢ a joke each minute"
  export const MARKET_MODE_LOCKED_TEXT = "Fees and Lean settings can't change once a round has started.";
  // leanConfigFromRound / leanConfigToBody map the five fee keys both ways; absent fees read as 0.
  // LEAN_CLASS_PRESET stays only for scripts/pilot/lean-pilot.mts until Task 6 (marked @deprecated).
  // types.ts GameConfig gains shippingFeeSmall, shippingFeeStandard, shippingFeeLarge,
  //   storageFeePerJokeMinute, hostingFeePerJokeMinute: number
  // components/FeeConfigFields.tsx
  export interface FeeConfigValues { arrivalWindowSeconds; shippingFeeSmall; shippingFeeStandard; shippingFeeLarge; storageFeePerJokeMinute; hostingFeePerJokeMinute: number }
  export function feeValuesOf(config: FeeConfigValues): FeeConfigValues
  export function changedFees(local: FeeConfigValues, config: FeeConfigValues): Partial<GameConfig>
  export const FeeConfigFields: React.FC<{ values; onChange(next); disabled: boolean; lockHint: string; round1BatchSize: number; round2BatchLimit: number }>
  // context.tsx
  export interface GameContextType { … }   // unchanged members
  export const GameContext: React.Context<GameContextType | undefined>
  // views/testing/renderWithGame.ts
  export const TEST_CONFIG: GameConfig      // a running Round 1 at the default fees
  export function testUser(role: Role, teamId: number | null = 1): User
  export function fakeGame(over?: Partial<GameContextType>): GameContextType
  export function renderWithGame(view: React.ComponentType, over?: Partial<GameContextType>): string
  ```

- [ ] **Step 1: Write the failing tests**

Replace the whole of `services/leanMode.test.ts` with:

```ts
// services/leanMode.test.ts
import { describe, expect, it } from 'vitest';
import {
  MARKET_MODE_LOCKED_MESSAGE, WIP_LIMIT_MESSAGE,
  fmtCents, fmtFee, fmtMoney, fmtPerMinute, isLeanRound, isMarketModeLocked, isWipLimitReached,
  leanConfigFromRound, leanConfigToBody, learningCurvePoints, neverSold, shippingFeeFor, wipStatus,
} from './leanMode';

const classic = { market_mode: 'CLASSIC', arrival_window_seconds: 900, setup_cost_per_batch: 0, carrying_cost_per_joke_minute: 0, wip_limit: 0 };
const lean = {
  ...classic, market_mode: 'LEAN', setup_cost_per_batch: 3, carrying_cost_per_joke_minute: 0.02, wip_limit: 0,
  shipping_fee_small: 1, shipping_fee_standard: 2, shipping_fee_large: 3,
  storage_fee_per_joke_minute: 0.1, hosting_fee_per_joke_minute: 0.05,
};
const fees = { shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3 };

describe('lean mode helpers', () => {
  it('detects the mode, defaulting to classic', () => {
    expect(isLeanRound(lean)).toBe(true);
    expect(isLeanRound(classic)).toBe(false);
    expect(isLeanRound(undefined)).toBe(false);
    expect(isLeanRound({})).toBe(false);
  });

  it('maps round fields onto GameConfig keys, fees included, with defaults for old backends', () => {
    expect(leanConfigFromRound(lean)).toEqual({
      marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 3, carryingCostPerJokeMinute: 0.02, wipLimit: 0,
      shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
    });
    expect(leanConfigFromRound({})).toEqual({
      marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
      shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0, storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0,
    });
  });

  it('describes the WIP state for the Joke Maker', () => {
    expect(wipStatus(0, 0)).toEqual({ blocked: false, label: null });
    expect(wipStatus(1, 2)).toEqual({ blocked: false, label: 'Marketing has 1 of 2 batches waiting' });
    expect(wipStatus(2, 2)).toEqual({ blocked: true, label: 'Marketing has 2 of 2 batches waiting — wait, or go help' });
  });

  it('prices a batch by its size, an unsplit batch as the standard 5', () => {
    expect(shippingFeeFor(1, fees)).toBe(1);
    expect(shippingFeeFor(4, fees)).toBe(1);
    expect(shippingFeeFor(5, fees)).toBe(2);
    expect(shippingFeeFor(6, fees)).toBe(3);
    expect(shippingFeeFor(10, fees)).toBe(3);
    for (const unknown of [0, -2, Number.NaN]) expect(shippingFeeFor(unknown, fees)).toBe(2);
  });

  it('formats money with sign and cents', () => {
    expect(fmtMoney(3)).toBe('$3.00');
    expect(fmtMoney(-1.085)).toBe('-$1.09');
    expect(fmtMoney(1.005)).toBe('$1.01');
  });

  it('formats fees for copy: whole dollars bare, per-minute rates in cents', () => {
    expect(fmtFee(2)).toBe('$2');
    expect(fmtFee(1)).toBe('$1');
    expect(fmtFee(0.5)).toBe('$0.50');
    expect(fmtFee(1.25)).toBe('$1.25');
    expect(fmtCents(0.1)).toBe('10¢');
    expect(fmtCents(0.05)).toBe('5¢');
    expect(fmtCents(0.025)).toBe('2.5¢');
    expect(fmtCents(1)).toBe('$1.00');
    expect(fmtPerMinute(0.1)).toBe('10¢ a joke each minute');
    expect(fmtPerMinute(0.05)).toBe('5¢ a joke each minute');
    expect(fmtPerMinute(1.5)).toBe('$1.50 a joke each minute');
  });

  it('maps lean config keys, the five fees included, onto the snake_case request body', () => {
    expect(leanConfigToBody({
      shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
    })).toEqual({
      shipping_fee_small: 1, shipping_fee_standard: 2, shipping_fee_large: 3,
      storage_fee_per_joke_minute: 0.1, hosting_fee_per_joke_minute: 0.05,
    });
    expect(leanConfigToBody({ marketMode: 'LEAN', preferenceBase: 3, customerCount: 150 })).toEqual({
      market_mode: 'LEAN', preference_base: 3, customer_count: 150,
    });
    expect(leanConfigToBody({ arrivalWindowSeconds: 600, storageFeePerJokeMinute: 0 })).toEqual({
      arrival_window_seconds: 600, storage_fee_per_joke_minute: 0,
    });
    expect(leanConfigToBody({})).toEqual({});
  });

  it('counts never-sold jokes per batch, even when total sales exceed published', () => {
    const series = [
      { seq: 1, submitted_at: '', jokes: 5, published: 4, sold: 1 },
      { seq: 2, submitted_at: '', jokes: 5, published: 3, sold: 3 },
      { seq: 3, submitted_at: '', jokes: 5, published: 2, sold: 0 },
    ];
    // 9 published, 4 sold at least once; total sales could be 20 (repeat buys),
    // which the classic max(published - sales, 0) formula would report as 0 unsold.
    expect(neverSold({ batch_series: series })).toBe(5);
    expect(neverSold({ batch_series: [{ published: 1, sold: 3 }] })).toBe(0);
    expect(neverSold({ batch_series: [] })).toBe(0);
    expect(neverSold(undefined)).toBeNull();
  });

  it('recognises the locked-settings refusal', () => {
    expect(isMarketModeLocked({ status: 409, message: `${MARKET_MODE_LOCKED_MESSAGE}: round started` })).toBe(true);
    expect(isMarketModeLocked({ status: 409, message: 'WIP_LIMIT_REACHED' })).toBe(false);
    expect(isMarketModeLocked({ status: 500, message: MARKET_MODE_LOCKED_MESSAGE })).toBe(false);
    expect(isMarketModeLocked(null)).toBe(false);
  });

  it('recognises the WIP-limit refusal', () => {
    expect(isWipLimitReached({ status: 409, message: `${WIP_LIMIT_MESSAGE}: 2 batches waiting` })).toBe(true);
    expect(isWipLimitReached({ status: 409, message: MARKET_MODE_LOCKED_MESSAGE })).toBe(false);
    expect(isWipLimitReached({ status: 400, message: WIP_LIMIT_MESSAGE })).toBe(false);
    expect(isWipLimitReached(undefined)).toBe(false);
  });

  it('turns the batch series into sell-through points', () => {
    const at = '2026-10-06T00:00:00Z';
    const series = [
      { seq: 3, submitted_at: at, jokes: 5, published: 4, sold: 3 },
      { seq: 1, submitted_at: at, jokes: 5, published: 2, sold: 0 },
      { seq: 2, submitted_at: at, jokes: 5, published: 0, sold: 0 },
      { seq: 4, submitted_at: at, jokes: 5, published: 1, sold: 2 },
    ];
    expect(learningCurvePoints(series)).toEqual([{ seq: 1, rate: 0 }, { seq: 3, rate: 0.75 }, { seq: 4, rate: 1 }]);
    expect(learningCurvePoints([])).toEqual([]);
    expect(learningCurvePoints(undefined)).toEqual([]);
  });
});
```

Create `components/FeeConfigFields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeeConfigFields, changedFees, feeValuesOf, type FeeConfigValues } from './FeeConfigFields';

const config: FeeConfigValues = {
  arrivalWindowSeconds: 900, shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
};

const render = (disabled: boolean) => renderToStaticMarkup(createElement(FeeConfigFields, {
  values: config, onChange: () => {}, disabled, lockHint: 'Lean settings lock once the round starts',
  round1BatchSize: 5, round2BatchLimit: 10,
}));

describe('FeeConfigFields', () => {
  it('labels the three shipping tiers, storage and hosting, with the batch-size rule', () => {
    const out = render(false);
    expect(out).toContain('Shipping fee (1–4 / 5 / 6–10 jokes):');
    expect(out).toContain('aria-label="Shipping fee for 1–4 jokes"');
    expect(out).toContain('aria-label="Shipping fee for 5 jokes"');
    expect(out).toContain('aria-label="Shipping fee for 6–10 jokes"');
    expect(out).toContain('Storage fee per joke-minute:');
    expect(out).toContain('Hosting fee per joke-minute:');
    expect(out).toContain('R1 batch: 5 (exactly)');
    expect(out).toContain('R2 batch: up to 10');
    expect(out).toContain('value="0.05"');
    expect(out).not.toContain('disabled=""');
  });

  it('locks every input with the hint once the round has started', () => {
    const out = render(true);
    expect(out.match(/disabled=""/g)?.length).toBe(6);
    expect(out).toContain('title="Lean settings lock once the round starts"');
  });

  it('sends only what changed, with the arrival window clamped to a whole second of at least 1', () => {
    expect(changedFees(feeValuesOf(config), config)).toEqual({});
    expect(changedFees({ ...config, storageFeePerJokeMinute: 0.2, shippingFeeLarge: 4 }, config))
      .toEqual({ storageFeePerJokeMinute: 0.2, shippingFeeLarge: 4 });
    expect(changedFees({ ...config, arrivalWindowSeconds: 0 }, config)).toEqual({ arrivalWindowSeconds: 1 });
    expect(changedFees({ ...config, arrivalWindowSeconds: 600.6 }, config)).toEqual({ arrivalWindowSeconds: 601 });
    expect(changedFees({ ...config, hostingFeePerJokeMinute: Number.NaN }, config)).toEqual({});
  });
});
```

Whole screens are rendered with a fake game, the same way the existing component tests render one component.

Create `views/testing/renderWithGame.ts`:

```ts
/* Renders a whole screen (JokeMaker, QualityControl, Instructor) to static
   markup inside a fake game, for the view tests. Effects never run under
   renderToStaticMarkup, so nothing polls or fetches. Instructor reads
   `window.location` while rendering: tests that render it stub `window` first
   (vi.stubGlobal('window', { location: { search: '' } })). */
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameContext, type GameContextType } from '../../context';
import { Role, type GameConfig, type User } from '../../types';

/** A running Round 1 at the default Lean fees. */
export const TEST_CONFIG: GameConfig = {
  status: 'PLAYING', round: 1, isActive: true, showTeamPopup: false, startTime: 0, elapsedTime: 60,
  customerBudget: 3, round1BatchSize: 5, round2BatchLimit: 10, marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  marketingNudge1Seconds: 60, marketingNudge2Seconds: 45, idealProfile: {},
  marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05,
};

/** A signed-in user; teamId null for the instructor. */
export function testUser(role: Role, teamId: number | null = 1): User {
  return {
    user_id: 7, display_name: 'Pat', role, team_id: teamId, id: '7', name: 'Pat',
    team: teamId == null ? 'N/A' : String(teamId), wallet: 0, purchasedJokes: [],
  };
}

export function fakeGame(over: Partial<GameContextType> = {}): GameContextType {
  const done = async () => {};
  return {
    user: null, roster: [], login: done, instructorLogin: done, logout: () => {},
    config: TEST_CONFIG, updateConfig: done, setRound: () => {}, setGameActive: done, endRound: done,
    toggleTeamPopup: done, resetGame: async () => true, formTeams: done, resetToLobby: () => {},
    teamNames: {}, updateTeamName: () => {}, updateUser: done, deleteUser: done,
    batches: [], addBatch: done, submitRawBatch: async () => true, splitBatch: done, unsplitBatch: done,
    publishBatch: async () => true, sales: {},
    roundId: 1, roundIds: { 1: 1, 2: 2 }, roundStatuses: { 1: 'ACTIVE', 2: 'CONFIGURED' },
    marketItems: [], teamSummary: null, teamFeedback: null, instructorLobby: null, instructorStats: null,
    instructorStatsRound1: null, instructorStatsRound2: null, qcQueue: null,
    ...over,
  };
}

export function renderWithGame(view: ComponentType, over: Partial<GameContextType> = {}): string {
  return renderToStaticMarkup(createElement(GameContext.Provider, { value: fakeGame(over) }, createElement(view)));
}
```

Create `views/Instructor.render.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import Instructor from './Instructor';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role } from '../types';

// Instructor reads window.location.search while rendering (the bot panel switch).
vi.stubGlobal('window', { location: { search: '' } });

const instructor = testUser(Role.INSTRUCTOR, null);

describe('Instructor screen, one Lean rule set', () => {
  it('shows the fee settings and the batch-size rule, and no market mode, preset or WIP limit', () => {
    const out = renderWithGame(Instructor, { user: instructor });
    expect(out).toContain('Shipping fee (1–4 / 5 / 6–10 jokes):');
    expect(out).toContain('Storage fee per joke-minute:');
    expect(out).toContain('Hosting fee per joke-minute:');
    expect(out).toContain('R1 batch: 5 (exactly)');
    expect(out).toContain('R2 batch: up to 10');
    for (const gone of ['Market mode', 'Lean class preset', 'WIP limit', 'Setup cost', 'Carrying cost', 'R1 Batch Size']) {
      expect(out).not.toContain(gone);
    }
  });

  it('lets the instructor edit the fees between rounds, and greys them out once the selected round has started', () => {
    const between = { ...TEST_CONFIG, isActive: false };
    const open = renderWithGame(Instructor, { user: instructor, config: between, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(open).not.toMatch(/id="cfg-storage-fee"[^>]*disabled=""/);
    const locked = renderWithGame(Instructor, { user: instructor, config: between, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' } });
    expect(locked).toMatch(/id="cfg-storage-fee"[^>]*disabled=""/);
    expect(locked).toContain('title="Lean settings lock once the round starts"');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanMode.test.ts components/FeeConfigFields.test.ts views/Instructor.render.test.ts`
Expected: FAIL — `TypeError: shippingFeeFor is not a function` and `fmtFee is not a function`, the fee keys missing from `leanConfigFromRound`/`leanConfigToBody`, `Error: Failed to load url ./FeeConfigFields`, and in `Instructor.render.test.ts` `TypeError: Cannot read properties of undefined (reading 'Provider')` (`GameContext` is not exported yet).

- [ ] **Step 3: Types — the fee keys**

In `types/api.ts`, replace the end of `PublicRound`:

```ts
  /** Lean: max batches waiting for Marketing per team; 0 = no limit. */
  wip_limit?: number;
}
```

with:

```ts
  /** Lean: max batches waiting for Marketing per team; 0 = no limit. */
  wip_limit?: number;
  /**
   * Lean fees (backends with migration 0005; absent before). Shipping is
   * charged per sent batch by its size: small 1–4 jokes, standard 5, large
   * 6+ (an unsplit batch ships as 5). Storage and hosting are per joke per
   * minute: on Marketing's desk, and released but unsold.
   */
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}
```

In `types/api.ts`, replace the end of `ConfigRequest`:

```ts
  wip_limit?: number;
  preference_base?: number;
}
```

with:

```ts
  wip_limit?: number;
  preference_base?: number;
  /** Lean fees: each >= 0, and shipping small <= standard <= large, or 400 on the field. Locked once the round starts. */
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}
```

In `types.ts`, replace the end of `GameConfig`:

```ts
  /** Max batches waiting for Marketing per team; 0 = no limit. */
  wipLimit: number;
}
```

with:

```ts
  /** Max batches waiting for Marketing per team; 0 = no limit. */
  wipLimit: number;
  /* Lean fees (newer backends), read off the current public round the same
     way; 0 when absent. Shipping per sent batch by size (1–4 / 5 / 6+ jokes),
     storage and hosting per joke per minute. */
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}
```

In `types.ts`, replace the end of `ApiRound`:

```ts
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
}

export interface ApiActiveRoundResponse {
```

with:

```ts
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
  // Lean fees; absent on backends before migration 0005.
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}

export interface ApiActiveRoundResponse {
```

In `services/instructorService.ts`, replace in `updateRoundConfig`'s body type:

```ts
      wip_limit?: number;
      preference_base?: number;
    },
```

with:

```ts
      wip_limit?: number;
      preference_base?: number;
      shipping_fee_small?: number;
      shipping_fee_standard?: number;
      shipping_fee_large?: number;
      storage_fee_per_joke_minute?: number;
      hosting_fee_per_joke_minute?: number;
    },
```

In `scripts/smoke-api.ts`, replace:

```ts
type LeanRoundKey =
  | 'market_mode' | 'arrival_window_seconds' | 'setup_cost_per_batch'
  | 'carrying_cost_per_joke_minute' | 'wip_limit';
```

with:

```ts
type LeanRoundKey =
  | 'market_mode' | 'arrival_window_seconds' | 'setup_cost_per_batch'
  | 'carrying_cost_per_joke_minute' | 'wip_limit'
  | 'shipping_fee_small' | 'shipping_fee_standard' | 'shipping_fee_large'
  | 'storage_fee_per_joke_minute' | 'hosting_fee_per_joke_minute';
```

In `scripts/smoke-api.ts`, replace:

```ts
  market_mode: true, arrival_window_seconds: true, setup_cost_per_batch: true,
  carrying_cost_per_joke_minute: true, wip_limit: true,
});
```

with:

```ts
  market_mode: true, arrival_window_seconds: true, setup_cost_per_batch: true,
  carrying_cost_per_joke_minute: true, wip_limit: true,
  shipping_fee_small: true, shipping_fee_standard: true, shipping_fee_large: true,
  storage_fee_per_joke_minute: true, hosting_fee_per_joke_minute: true,
});
```

- [ ] **Step 4: Lean helpers — fees in the config and in copy**

Replace the whole of `services/leanMode.ts` with:

```ts
/**
 * Lean market mode — pure helpers shared by the views.
 *
 * The backend decides the rules (jokefactory_be: market_mode and the fees on
 * the round). Lean is the only mode this branch plays: one rule set and one
 * set of fees for both rounds; only the batch size differs (Round 1 exactly
 * 5, Round 2 up to 10). The frontend reads the rules off the public round.
 * Everything here tolerates a backend that predates a field: a missing mode
 * reads as CLASSIC and a missing fee as 0 (that backend does not charge it).
 */
export type MarketMode = 'CLASSIC' | 'LEAN';

export interface LeanRoundFields {
  market_mode?: string;
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}

/** The shipping tiers: small 1–4 jokes, standard exactly 5, large 6 or more. */
export interface ShippingFees {
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
}

/** The five Lean fees, as GameConfig carries them. */
export interface LeanFeeConfig extends ShippingFees {
  /** Per joke per minute a batch waits on Marketing's desk. */
  storageFeePerJokeMinute: number;
  /** Per joke per minute a released joke waits for its first sale. */
  hostingFeePerJokeMinute: number;
}

export interface LeanConfig extends LeanFeeConfig {
  marketMode: MarketMode;
  arrivalWindowSeconds: number;
  /** Stored by the backend but no longer charged (replaced by the fees). */
  setupCostPerBatch: number;
  /** Stored by the backend but no longer charged (replaced by the fees). */
  carryingCostPerJokeMinute: number;
  wipLimit: number;
}

export const LEAN_DEFAULTS: LeanConfig = {
  marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
  shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0, storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0,
};

/** The standard shipment: an unsplit batch counts as this many jokes for its fees. */
export const STANDARD_SHIPMENT_JOKES = 5;

/**
 * Round settings a caller may send beyond the GameConfig lean fields. The bot
 * pilot sets these; context.updateConfig never sends them.
 */
export interface LeanConfigUpdate extends Partial<LeanConfig> {
  /** How sharply customers prefer jokes that fit the hidden ideal. */
  preferenceBase?: number;
  /** AI customers per round. */
  customerCount?: number;
}

/**
 * @deprecated The two-rule-set class preset of the first Lean design (Round 1
 * push, Round 2 WIP-limited pull). Only scripts/pilot/lean-pilot.mts still
 * reads it; the instructor screen no longer offers it.
 */
export const LEAN_CLASS_PRESET: Record<1 | 2, LeanConfigUpdate> = {
  1: { marketMode: 'LEAN', setupCostPerBatch: 2, carryingCostPerJokeMinute: 0.05, wipLimit: 0, preferenceBase: 3, customerCount: 150 },
  2: { marketMode: 'LEAN', setupCostPerBatch: 0.5, carryingCostPerJokeMinute: 0.05, wipLimit: 2, preferenceBase: 3, customerCount: 150 },
};

export function isLeanRound(round: LeanRoundFields | null | undefined): boolean {
  return round?.market_mode === 'LEAN';
}

export function leanConfigFromRound(round: LeanRoundFields | null | undefined): LeanConfig {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    marketMode: isLeanRound(round) ? 'LEAN' : 'CLASSIC',
    arrivalWindowSeconds: num(round?.arrival_window_seconds, LEAN_DEFAULTS.arrivalWindowSeconds),
    setupCostPerBatch: num(round?.setup_cost_per_batch, LEAN_DEFAULTS.setupCostPerBatch),
    carryingCostPerJokeMinute: num(round?.carrying_cost_per_joke_minute, LEAN_DEFAULTS.carryingCostPerJokeMinute),
    wipLimit: num(round?.wip_limit, LEAN_DEFAULTS.wipLimit),
    shippingFeeSmall: num(round?.shipping_fee_small, LEAN_DEFAULTS.shippingFeeSmall),
    shippingFeeStandard: num(round?.shipping_fee_standard, LEAN_DEFAULTS.shippingFeeStandard),
    shippingFeeLarge: num(round?.shipping_fee_large, LEAN_DEFAULTS.shippingFeeLarge),
    storageFeePerJokeMinute: num(round?.storage_fee_per_joke_minute, LEAN_DEFAULTS.storageFeePerJokeMinute),
    hostingFeePerJokeMinute: num(round?.hosting_fee_per_joke_minute, LEAN_DEFAULTS.hostingFeePerJokeMinute),
  };
}

export function wipStatus(waiting: number, limit: number): { blocked: boolean; label: string | null } {
  if (limit <= 0) return { blocked: false, label: null };
  const blocked = waiting >= limit;
  const base = `Marketing has ${waiting} of ${limit} batches waiting`;
  return { blocked, label: blocked ? `${base} — wait, or go help` : base };
}

/**
 * The shipping fee of one batch with this many jokes: small for 1–4, standard
 * for exactly 5, large for 6 or more. An unknown count (a batch Marketing has
 * not split: 0, negative or not a number) ships as the standard 5.
 */
export function shippingFeeFor(jokes: number, c: ShippingFees): number {
  const n = Number.isFinite(jokes) && jokes > 0 ? jokes : STANDARD_SHIPMENT_JOKES;
  if (n < STANDARD_SHIPMENT_JOKES) return c.shippingFeeSmall;
  if (n === STANDARD_SHIPMENT_JOKES) return c.shippingFeeStandard;
  return c.shippingFeeLarge;
}

/**
 * Money with a leading sign and two decimals, rounding half away from zero.
 * The cent count is taken to 12 significant digits before rounding, which
 * absorbs binary representation error: 1.005 * 100 is 100.49999999999999 in
 * floating point, so a plain Math.round (or toFixed(2)) would give $1.00.
 */
export function fmtMoney(v: number): string {
  const cents = Math.round(Number((Math.abs(v) * 100).toPrecision(12)));
  const abs = (cents / 100).toFixed(2);
  return v < 0 && cents > 0 ? `-$${abs}` : `$${abs}`;
}

/** A fee in copy: whole dollars without cents ("$2"), otherwise as fmtMoney ("$0.50"). */
export function fmtFee(v: number): string {
  const cents = Math.round(Number((Math.abs(v) * 100).toPrecision(12)));
  return cents % 100 === 0 ? `${v < 0 && cents > 0 ? '-' : ''}$${cents / 100}` : fmtMoney(v);
}

/**
 * A per-minute rate: in cents below $1 ("10¢", "5¢", "2.5¢"), in dollars from
 * $1 up ("$1.00"). Never more than two decimals of a cent.
 */
export function fmtCents(v: number): string {
  if (Math.abs(v) >= 1) return fmtMoney(v);
  const cents = Number((v * 100).toFixed(2));
  return `${cents}¢`;
}

/** "10¢ a joke each minute" — the storage or hosting fee as students read it. */
export function fmtPerMinute(v: number): string {
  return `${fmtCents(v)} a joke each minute`;
}

/** The backend reports a WIP refusal as 409 CONFLICT with this prefix in the message. */
export const WIP_LIMIT_MESSAGE = 'WIP_LIMIT_REACHED';

/** True for the backend's 409 refusal of a Lean submit beyond the WIP limit. */
export function isWipLimitReached(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(WIP_LIMIT_MESSAGE);
}

/** What the Joke Maker sees when the backend refuses a submit at the WIP limit. */
export const WIP_LIMIT_TEXT = 'Marketing still has batches waiting. In a pull system you wait — or go help them decide.';

/** The backend refuses a Lean setting change after the round started with this prefix. */
export const MARKET_MODE_LOCKED_MESSAGE = 'MARKET_MODE_LOCKED';

/** What the instructor sees when the backend refuses a fee or market change after the start. */
export const MARKET_MODE_LOCKED_TEXT = "Fees and Lean settings can't change once a round has started.";

/** True for the backend's 409 refusal to change Lean settings after a round started. */
export function isMarketModeLocked(e: unknown): boolean {
  const err = e as { status?: unknown; message?: unknown } | null;
  return Boolean(err) && err!.status === 409 && String(err!.message ?? '').includes(MARKET_MODE_LOCKED_MESSAGE);
}

export interface LeanConfigBody {
  market_mode?: MarketMode;
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
  preference_base?: number;
  customer_count?: number;
  shipping_fee_small?: number;
  shipping_fee_standard?: number;
  shipping_fee_large?: number;
  storage_fee_per_joke_minute?: number;
  hosting_fee_per_joke_minute?: number;
}

/**
 * GameConfig (camelCase) lean keys → the POST /config body (snake_case), the
 * same mapping context.updateConfig uses. Absent keys stay absent so the
 * backend keeps the round's current value.
 */
export function leanConfigToBody(c: LeanConfigUpdate): LeanConfigBody {
  const body: LeanConfigBody = {};
  if (c.marketMode !== undefined) body.market_mode = c.marketMode;
  if (c.arrivalWindowSeconds !== undefined) body.arrival_window_seconds = c.arrivalWindowSeconds;
  if (c.setupCostPerBatch !== undefined) body.setup_cost_per_batch = c.setupCostPerBatch;
  if (c.carryingCostPerJokeMinute !== undefined) body.carrying_cost_per_joke_minute = c.carryingCostPerJokeMinute;
  if (c.wipLimit !== undefined) body.wip_limit = c.wipLimit;
  if (c.preferenceBase !== undefined) body.preference_base = c.preferenceBase;
  if (c.customerCount !== undefined) body.customer_count = c.customerCount;
  if (c.shippingFeeSmall !== undefined) body.shipping_fee_small = c.shippingFeeSmall;
  if (c.shippingFeeStandard !== undefined) body.shipping_fee_standard = c.shippingFeeStandard;
  if (c.shippingFeeLarge !== undefined) body.shipping_fee_large = c.shippingFeeLarge;
  if (c.storageFeePerJokeMinute !== undefined) body.storage_fee_per_joke_minute = c.storageFeePerJokeMinute;
  if (c.hostingFeePerJokeMinute !== undefined) body.hosting_fee_per_joke_minute = c.hostingFeePerJokeMinute;
  return body;
}

/** One learning-curve point: a batch's sell-through (sold ÷ published). */
export interface LearningCurvePoint { seq: number; rate: number }

/**
 * Sold ÷ published per batch, in submission order — the team's learning curve.
 * Batches with nothing published have no sell-through and are left out; the
 * rate is clamped to [0, 1] so a stray count can't push the line off the chart.
 */
export function learningCurvePoints(
  series: ReadonlyArray<{ seq: number; published: number; sold: number }> | null | undefined,
): LearningCurvePoint[] {
  return [...(series ?? [])]
    .filter(p => p.published > 0)
    .sort((a, b) => a.seq - b.seq)
    .map(p => ({ seq: p.seq, rate: Math.min(1, Math.max(0, p.sold / p.published)) }));
}

/**
 * Jokes published but never sold, for a Lean row: the sum over submitted
 * batches of (published − sold), each floored at 0. The backend's
 * unsold_jokes is max(published − sales, 0), and one joke can sell many
 * times, so it reads 0 even when many jokes never sold. Returns null when the
 * row has no lean stats (a Classic round), so callers keep the classic figure.
 */
export function neverSold(
  lean: { batch_series?: Array<{ published: number; sold: number }> | null } | null | undefined,
): number | null {
  if (!lean) return null;
  return (lean.batch_series ?? []).reduce(
    (n, b) => n + Math.max(0, (Number(b.published) || 0) - (Number(b.sold) || 0)),
    0,
  );
}
```

- [ ] **Step 5: Context — export the game context; never send a batch size**

In `context.tsx`, replace:

```tsx
/** Config keys updateConfig sends to the backend besides the Lean ones (see leanConfigToBody). */
const PERSISTED_CONFIG_KEYS = new Set<keyof GameConfig>([
  'customerBudget', 'marketPrice', 'costOfPublishing', 'costOfDiscard', 'round1BatchSize', 'idealProfile',
]);
```

with:

```tsx
/** Config keys updateConfig sends to the backend besides the Lean ones (see leanConfigToBody).
    Batch sizes are not among them: Reset Game sets Round 1 to exactly 5 and
    Round 2 to up to 10, and the instructor screen no longer edits them. */
const PERSISTED_CONFIG_KEYS = new Set<keyof GameConfig>([
  'customerBudget', 'marketPrice', 'costOfPublishing', 'costOfDiscard', 'idealProfile',
]);
```

In `context.tsx`, replace:

```tsx
    if (updates.round1BatchSize !== undefined) body.batch_size = updates.round1BatchSize;
```

with:

```tsx
```

In `context.tsx`, replace:

```tsx
interface GameContextType {
```

with:

```tsx
export interface GameContextType {
```

In `context.tsx`, replace:

```tsx
const GameContext = createContext<GameContextType | undefined>(undefined);
```

with:

```tsx
/** Exported so view tests can render a screen with a fake game (views/testing/renderWithGame.ts). */
export const GameContext = createContext<GameContextType | undefined>(undefined);
```

- [ ] **Step 6: The CONFIG fee fields**

Create `components/FeeConfigFields.tsx`:

```tsx
/* The Lean part of the instructor's CONFIG row: the batch-size rule (read
   only: Reset Game sets it, Round 1 exactly 5 and Round 2 up to 10), the
   arrival window and the five fees. One rule set for both rounds, so there is
   no market mode, preset or WIP limit to choose. The values edit the round the
   Round 1 / Round 2 tabs select, and lock once it has started. */
import React from 'react';
import type { GameConfig } from '../types';

export interface FeeConfigValues {
  arrivalWindowSeconds: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}

const FEE_KEYS = [
  'arrivalWindowSeconds', 'shippingFeeSmall', 'shippingFeeStandard', 'shippingFeeLarge',
  'storageFeePerJokeMinute', 'hostingFeePerJokeMinute',
] as const satisfies ReadonlyArray<keyof FeeConfigValues>;

export function feeValuesOf(config: FeeConfigValues): FeeConfigValues {
  return {
    arrivalWindowSeconds: config.arrivalWindowSeconds,
    shippingFeeSmall: config.shippingFeeSmall,
    shippingFeeStandard: config.shippingFeeStandard,
    shippingFeeLarge: config.shippingFeeLarge,
    storageFeePerJokeMinute: config.storageFeePerJokeMinute,
    hostingFeePerJokeMinute: config.hostingFeePerJokeMinute,
  };
}

/**
 * The updateConfig patch for what changed. The arrival window is clamped to a
 * whole number of at least 1 second (0 would bring every customer at once); a
 * value that is not a number is left out, so the server keeps its own.
 */
export function changedFees(local: FeeConfigValues, config: FeeConfigValues): Partial<GameConfig> {
  const out: Partial<GameConfig> = {};
  for (const k of FEE_KEYS) {
    const v = local[k];
    if (v === config[k] || !Number.isFinite(v)) continue;
    out[k] = k === 'arrivalWindowSeconds' ? Math.max(1, Math.round(v || 0)) : v;
  }
  return out;
}

const inputClass = (disabled: boolean) =>
  `w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

const FeeInput: React.FC<{
  id: string; label: string; value: number; step: string; min: string; disabled: boolean; onChange: (v: number) => void;
}> = ({ id, label, value, step, min, disabled, onChange }) => (
  <input
    id={id}
    aria-label={label}
    type="number"
    step={step}
    min={min}
    value={value}
    onChange={e => onChange(Number(e.target.value))}
    disabled={disabled}
    className={inputClass(disabled)}
  />
);

export const FeeConfigFields: React.FC<{
  values: FeeConfigValues;
  onChange: (next: FeeConfigValues) => void;
  /** True once the selected round has started (or while one runs). */
  disabled: boolean;
  /** Tooltip while locked. */
  lockHint: string;
  round1BatchSize: number;
  round2BatchLimit: number;
}> = ({ values, onChange, disabled, lockHint, round1BatchSize, round2BatchLimit }) => {
  const set = (k: keyof FeeConfigValues) => (v: number) => onChange({ ...values, [k]: v });
  const tip = (text: string) => (disabled ? lockHint : text);
  return (
    <>
      <div className="flex items-center space-x-3 text-sm text-gray-600" title="Set by Reset Game. Round 1 batches must have exactly this many jokes; Round 2 batches may have fewer.">
        <span className="whitespace-nowrap">R1 batch: {round1BatchSize} (exactly)</span>
        <span className="whitespace-nowrap">R2 batch: up to {round2BatchLimit}</span>
      </div>
      <div className="flex items-center space-x-3" title={tip('Seconds over which customers arrive')}>
        <label htmlFor="cfg-arrival-window" className="text-sm text-gray-600 whitespace-nowrap">Arrival window (s):</label>
        <FeeInput id="cfg-arrival-window" label="Arrival window in seconds" value={values.arrivalWindowSeconds} step="1" min="1" disabled={disabled} onChange={set('arrivalWindowSeconds')} />
      </div>
      <div className="flex items-center space-x-2" title={tip('Charged for every batch the Joke Maker sends, by its size. A batch not yet split ships as 5 jokes.')}>
        <span className="text-sm text-gray-600 whitespace-nowrap">Shipping fee (1–4 / 5 / 6–10 jokes):</span>
        <FeeInput id="cfg-shipping-small" label="Shipping fee for 1–4 jokes" value={values.shippingFeeSmall} step="0.5" min="0" disabled={disabled} onChange={set('shippingFeeSmall')} />
        <FeeInput id="cfg-shipping-standard" label="Shipping fee for 5 jokes" value={values.shippingFeeStandard} step="0.5" min="0" disabled={disabled} onChange={set('shippingFeeStandard')} />
        <FeeInput id="cfg-shipping-large" label="Shipping fee for 6–10 jokes" value={values.shippingFeeLarge} step="0.5" min="0" disabled={disabled} onChange={set('shippingFeeLarge')} />
      </div>
      <div className="flex items-center space-x-3" title={tip("Charged per joke per minute while a batch waits on Marketing's desk, from send until released or discarded")}>
        <label htmlFor="cfg-storage-fee" className="text-sm text-gray-600 whitespace-nowrap">Storage fee per joke-minute:</label>
        <FeeInput id="cfg-storage-fee" label="Storage fee per joke-minute" value={values.storageFeePerJokeMinute} step="0.01" min="0" disabled={disabled} onChange={set('storageFeePerJokeMinute')} />
      </div>
      <div className="flex items-center space-x-3" title={tip('Charged per joke per minute while a released joke sits unsold, until its first sale or the end of the round')}>
        <label htmlFor="cfg-hosting-fee" className="text-sm text-gray-600 whitespace-nowrap">Hosting fee per joke-minute:</label>
        <FeeInput id="cfg-hosting-fee" label="Hosting fee per joke-minute" value={values.hostingFeePerJokeMinute} step="0.01" min="0" disabled={disabled} onChange={set('hostingFeePerJokeMinute')} />
      </div>
    </>
  );
};
```

- [ ] **Step 7: Instructor — one rule set in CONFIG**

In `views/Instructor.tsx`, replace the imports of the preset's helpers:

```tsx
import { instructorService } from '../services/instructorService';
import { sessionService } from '../services/sessionService';
import {
  LEAN_CLASS_PRESET, MARKET_MODE_LOCKED_TEXT, isMarketModeLocked, leanConfigToBody, fmtMoney, neverSold,
  type MarketMode,
} from '../services/leanMode';
```

with:

```tsx
import { FeeConfigFields, changedFees, feeValuesOf, type FeeConfigValues } from '../components/FeeConfigFields';
import { fmtMoney, neverSold } from '../services/leanMode';
```

In `views/Instructor.tsx`, replace the CONFIG state (the batch size, market mode, setup, carrying, WIP and preset state go):

```tsx
  const [localBatchSize, setLocalBatchSize] = useState(config.round1BatchSize);
  const [localBudget, setLocalBudget] = useState(config.customerBudget);
  const [localMarketPrice, setLocalMarketPrice] = useState(config.marketPrice);
  const [localCostOfPublishing, setLocalCostOfPublishing] = useState(config.costOfPublishing);
  // Marketing's decision clock — how long they may deliberate before each nudge.
  const [localNudge1, setLocalNudge1] = useState(config.marketingNudge1Seconds);
  const [localNudge2, setLocalNudge2] = useState(config.marketingNudge2Seconds);
  // Lean market mode — edits the current round, like the fields above.
  const [localMarketMode, setLocalMarketMode] = useState<MarketMode>(config.marketMode);
  const [localArrivalWindow, setLocalArrivalWindow] = useState(config.arrivalWindowSeconds);
  const [localSetupCost, setLocalSetupCost] = useState(config.setupCostPerBatch);
  const [localCarryingCost, setLocalCarryingCost] = useState(config.carryingCostPerJokeMinute);
  const [localWipLimit, setLocalWipLimit] = useState(config.wipLimit);
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
```

with:

```tsx
  const [localBudget, setLocalBudget] = useState(config.customerBudget);
  const [localMarketPrice, setLocalMarketPrice] = useState(config.marketPrice);
  const [localCostOfPublishing, setLocalCostOfPublishing] = useState(config.costOfPublishing);
  // Marketing's decision clock — how long they may deliberate before each nudge.
  const [localNudge1, setLocalNudge1] = useState(config.marketingNudge1Seconds);
  const [localNudge2, setLocalNudge2] = useState(config.marketingNudge2Seconds);
  // The Lean fees and arrival window — edit the current round, like the fields above.
  const [localFees, setLocalFees] = useState<FeeConfigValues>(() => feeValuesOf(config));
```

In `views/Instructor.tsx`, replace the effects that sync that state:

```tsx
  useEffect(() => setLocalBatchSize(config.round1BatchSize), [config.round1BatchSize]);
  useEffect(() => setLocalBudget(config.customerBudget), [config.customerBudget]);
  useEffect(() => setLocalMarketPrice(config.marketPrice), [config.marketPrice]);
  useEffect(() => setLocalCostOfPublishing(config.costOfPublishing), [config.costOfPublishing]);
  useEffect(() => setLocalNudge1(config.marketingNudge1Seconds), [config.marketingNudge1Seconds]);
  useEffect(() => setLocalNudge2(config.marketingNudge2Seconds), [config.marketingNudge2Seconds]);
  useEffect(() => setLocalMarketMode(config.marketMode), [config.marketMode]);
  useEffect(() => setLocalArrivalWindow(config.arrivalWindowSeconds), [config.arrivalWindowSeconds]);
  useEffect(() => setLocalSetupCost(config.setupCostPerBatch), [config.setupCostPerBatch]);
  useEffect(() => setLocalCarryingCost(config.carryingCostPerJokeMinute), [config.carryingCostPerJokeMinute]);
  useEffect(() => setLocalWipLimit(config.wipLimit), [config.wipLimit]);
```

with:

```tsx
  useEffect(() => setLocalBudget(config.customerBudget), [config.customerBudget]);
  useEffect(() => setLocalMarketPrice(config.marketPrice), [config.marketPrice]);
  useEffect(() => setLocalCostOfPublishing(config.costOfPublishing), [config.costOfPublishing]);
  useEffect(() => setLocalNudge1(config.marketingNudge1Seconds), [config.marketingNudge1Seconds]);
  useEffect(() => setLocalNudge2(config.marketingNudge2Seconds), [config.marketingNudge2Seconds]);
  useEffect(
    () => setLocalFees(feeValuesOf(config)),
    [config.arrivalWindowSeconds, config.shippingFeeSmall, config.shippingFeeStandard, config.shippingFeeLarge,
      config.storageFeePerJokeMinute, config.hostingFeePerJokeMinute],
  );
```

In `views/Instructor.tsx`, replace the edit rules, `hasPendingConfigChanges` and `handleUpdateSettings`:

```tsx
// Config edit rules:
// - While a round is active: config is not editable.
// - In round 2: only customer budget + pricing are editable.
  const canEditBatchSize = !config.isActive && config.round === 1;
  const canEditBudget = !config.isActive && (config.round === 1 || config.round === 2);
  const canEditPricing = !config.isActive && (config.round === 1 || config.round === 2);
  // Lean settings lock once the selected round has started (ACTIVE or ENDED); the server
  // refuses them with 409 MARKET_MODE_LOCKED. Classic fields keep canEditPricing/canEditBudget.
  // An unknown status (null) is not treated as locked: the server stays the authority.
  const selectedRoundStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const leanLocked = selectedRoundStatus != null && selectedRoundStatus !== 'CONFIGURED';
  const canEditLean = canEditPricing && !leanLocked;
  const LEAN_LOCK_HINT = 'Lean settings lock once the round starts';
  // Pacing, not round-specific — editable between rounds whatever the round number.
  const canEditNudges = !config.isActive;

  const hasPendingConfigChanges =
    (canEditBatchSize && localBatchSize !== config.round1BatchSize) ||
    (canEditBudget && localBudget !== config.customerBudget) ||
    (canEditPricing && (localMarketPrice !== config.marketPrice || localCostOfPublishing !== config.costOfPublishing)) ||
    (canEditNudges && (localNudge1 !== config.marketingNudge1Seconds || localNudge2 !== config.marketingNudge2Seconds)) ||
    (canEditLean && localMarketMode !== config.marketMode) ||
    (canEditLean && localMarketMode === 'LEAN' && (
      localArrivalWindow !== config.arrivalWindowSeconds ||
      localSetupCost !== config.setupCostPerBatch ||
      localCarryingCost !== config.carryingCostPerJokeMinute ||
      localWipLimit !== config.wipLimit
    ));

  const handleUpdateSettings = () => {
    const updates: any = {};
    if (canEditBatchSize && localBatchSize !== config.round1BatchSize) updates.round1BatchSize = localBatchSize;
    if (canEditBudget && localBudget !== config.customerBudget) updates.customerBudget = localBudget;
    if (canEditPricing && localMarketPrice !== config.marketPrice) updates.marketPrice = localMarketPrice;
    if (canEditPricing && localCostOfPublishing !== config.costOfPublishing) updates.costOfPublishing = localCostOfPublishing;
    // Clamped: a 0s nudge would fire the instant Marketing lands on the view.
    if (canEditNudges && localNudge1 !== config.marketingNudge1Seconds) {
      updates.marketingNudge1Seconds = Math.max(5, localNudge1);
    }
    if (canEditNudges && localNudge2 !== config.marketingNudge2Seconds) {
      updates.marketingNudge2Seconds = Math.max(5, localNudge2);
    }
    if (canEditLean && localMarketMode !== config.marketMode) updates.marketMode = localMarketMode;
    if (canEditLean && localMarketMode === 'LEAN') {
      // Clamped like the nudges: an empty or 0 window would mean every customer arrives at once.
      if (localArrivalWindow !== config.arrivalWindowSeconds) {
        updates.arrivalWindowSeconds = Math.max(1, Math.round(localArrivalWindow || 0));
      }
      if (localSetupCost !== config.setupCostPerBatch) updates.setupCostPerBatch = localSetupCost;
      if (localCarryingCost !== config.carryingCostPerJokeMinute) updates.carryingCostPerJokeMinute = localCarryingCost;
      if (localWipLimit !== config.wipLimit) updates.wipLimit = localWipLimit;
    }
    if (Object.keys(updates).length === 0) return;
    updateConfig(updates);
  };
```

with:

```tsx
// Config edit rules:
// - While a round is active: config is not editable.
// - Batch sizes are not editable: Round 1 is exactly 5, Round 2 up to 10 (Reset Game sets them).
  const canEditBudget = !config.isActive && (config.round === 1 || config.round === 2);
  const canEditPricing = !config.isActive && (config.round === 1 || config.round === 2);
  // Lean settings lock once the selected round has started (ACTIVE or ENDED); the server
  // refuses them with 409 MARKET_MODE_LOCKED. Classic fields keep canEditPricing/canEditBudget.
  // An unknown status (null) is not treated as locked: the server stays the authority.
  const selectedRoundStatus = roundStatuses[config.round === 2 ? 2 : 1];
  const leanLocked = selectedRoundStatus != null && selectedRoundStatus !== 'CONFIGURED';
  const canEditLean = canEditPricing && !leanLocked;
  const LEAN_LOCK_HINT = 'Lean settings lock once the round starts';
  // Pacing, not round-specific — editable between rounds whatever the round number.
  const canEditNudges = !config.isActive;

  const hasPendingConfigChanges =
    (canEditBudget && localBudget !== config.customerBudget) ||
    (canEditPricing && (localMarketPrice !== config.marketPrice || localCostOfPublishing !== config.costOfPublishing)) ||
    (canEditNudges && (localNudge1 !== config.marketingNudge1Seconds || localNudge2 !== config.marketingNudge2Seconds)) ||
    (canEditLean && Object.keys(changedFees(localFees, config)).length > 0);

  const handleUpdateSettings = () => {
    const updates: any = {};
    if (canEditBudget && localBudget !== config.customerBudget) updates.customerBudget = localBudget;
    if (canEditPricing && localMarketPrice !== config.marketPrice) updates.marketPrice = localMarketPrice;
    if (canEditPricing && localCostOfPublishing !== config.costOfPublishing) updates.costOfPublishing = localCostOfPublishing;
    // Clamped: a 0s nudge would fire the instant Marketing lands on the view.
    if (canEditNudges && localNudge1 !== config.marketingNudge1Seconds) {
      updates.marketingNudge1Seconds = Math.max(5, localNudge1);
    }
    if (canEditNudges && localNudge2 !== config.marketingNudge2Seconds) {
      updates.marketingNudge2Seconds = Math.max(5, localNudge2);
    }
    // The fees and the arrival window (clamped to at least 1 s: 0 would bring every customer at once).
    if (canEditLean) Object.assign(updates, changedFees(localFees, config));
    if (Object.keys(updates).length === 0) return;
    updateConfig(updates);
  };
```

In `views/Instructor.tsx`, replace the preset handler (everything from its comment down to the Lobby Logic comment):

```tsx
  /* One click for a Lean class: Round 1 with push rules, Round 2 with lean
     rules. Writes both rounds directly — only rounds still CONFIGURED, since
     the backend locks market_mode once a round starts. Statuses are read
     fresh at click time rather than inferred from the current-round config. */
  const presetDisabled = config.isActive || presetBusy || (roundIds[1] == null && roundIds[2] == null);
  const handleApplyLeanPreset = async () => {
    if (presetDisabled) return;
    setPresetBusy(true);
    try {
      let statuses: Record<1 | 2, string | null> = { 1: null, 2: null };
      try {
        const active: any = await sessionService.activeRound();
        const rounds: any[] = active?.rounds ?? active?.data?.rounds ?? [];
        for (const n of [1, 2] as const) {
          const r = rounds.find(x => Number(x?.round_number) === n);
          statuses[n] = r ? String(r.status ?? '').toUpperCase() : null;
        }
      } catch {
        alert('Could not read the round status. Check the connection and try again.');
        return;
      }
      const targets = ([1, 2] as const).filter(n => roundIds[n] != null && statuses[n] === 'CONFIGURED');
      if (targets.length === 0) {
        alert(MARKET_MODE_LOCKED_TEXT);
        return;
      }
      const applied: Array<1 | 2> = [];
      for (const n of targets) {
        try {
          await instructorService.updateRoundConfig(roundIds[n]!, leanConfigToBody(LEAN_CLASS_PRESET[n]));
          applied.push(n);
        } catch (e) {
          console.error(`Failed to apply the lean preset to round ${n}`, e);
          alert(isMarketModeLocked(e)
            ? MARKET_MODE_LOCKED_TEXT
            : `Round ${n} settings were not saved to the server. Check the connection and try again.`);
        }
      }
      if (applied.length === 0) return;
      const parts = applied.map(n => (n === 1 ? 'Round 1: push rules' : 'Round 2: lean rules'));
      const customers = new Set(applied.map(n => LEAN_CLASS_PRESET[n].customerCount).filter(c => c != null));
      const customerNote = customers.size === 1 ? ` (${[...customers][0]} customers)` : '';
      const skipped = roundIds[1] == null || statuses[1] === 'CONFIGURED'
        ? ''
        : statuses[1] == null
          ? " (Round 1's status is unknown, so it was left as is)"
          : ' (Round 1 has already started, so it was left as is)';
      setPresetNotice(`Lean class preset applied — ${parts.join(' · ')}${customerNote}${skipped}`);
      window.setTimeout(() => setPresetNotice(null), 3200);
    } finally {
      setPresetBusy(false);
    }
  };

  // --- Lobby Logic ---
```

with:

```tsx
  // --- Lobby Logic ---
```

In `views/Instructor.tsx`, replace the R1 Batch Size input (Reset Game sets the batch sizes; FeeConfigFields shows them as text):

```tsx
              <div className="flex items-center space-x-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">R1 Batch Size:</label>
                <input
                  type="number"
                  value={localBatchSize}
                  onChange={e => setLocalBatchSize(Number(e.target.value))}
                  disabled={!canEditBatchSize}
                  className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditBatchSize ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
```

with:

```tsx
```

In `views/Instructor.tsx`, replace the Market mode select and the four Lean inputs:

```tsx
              <div className="flex items-center space-x-3" title={leanLocked ? LEAN_LOCK_HINT : "Classic: every customer looks at each joke as soon as it is classified, buys the ones that qualify while budget lasts, and later swaps for clearly better ones. Lean: customers arrive evenly across the arrival window and shop once; setup, carrying and WIP rules apply."}>
                <label htmlFor="cfg-market-mode" className="text-sm text-gray-600 whitespace-nowrap">Market mode:</label>
                <select
                  id="cfg-market-mode"
                  value={localMarketMode}
                  onChange={e => setLocalMarketMode(e.target.value as MarketMode)}
                  disabled={!canEditLean}
                  className={`p-1 border border-gray-300 rounded bg-white text-black text-sm ${!canEditLean ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <option value="CLASSIC">Classic</option>
                  <option value="LEAN">Lean</option>
                </select>
              </div>
              {localMarketMode === 'LEAN' && (
                <>
                  <div className="flex items-center space-x-3" title={leanLocked ? LEAN_LOCK_HINT : "Seconds over which customers arrive"}>
                    <label htmlFor="cfg-arrival-window" className="text-sm text-gray-600 whitespace-nowrap">Arrival window (s):</label>
                    <input
                      id="cfg-arrival-window"
                      type="number"
                      step="1"
                      min="1"
                      value={localArrivalWindow}
                      onChange={e => setLocalArrivalWindow(Number(e.target.value))}
                      disabled={!canEditLean}
                      className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditLean ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div className="flex items-center space-x-3" title={leanLocked ? LEAN_LOCK_HINT : "Charged for every batch a team submits"}>
                    <label htmlFor="cfg-setup-cost" className="text-sm text-gray-600 whitespace-nowrap">Setup cost / batch:</label>
                    <input
                      id="cfg-setup-cost"
                      type="number"
                      step="0.5"
                      min="0"
                      value={localSetupCost}
                      onChange={e => setLocalSetupCost(Number(e.target.value))}
                      disabled={!canEditLean}
                      className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditLean ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div className="flex items-center space-x-3" title={leanLocked ? LEAN_LOCK_HINT : "Charged per joke per minute it waits: jokes in batches waiting in Marketing (submitted to released; an unsplit batch counts as batch-size jokes) and published jokes until their first sale"}>
                    <label htmlFor="cfg-carrying-cost" className="text-sm text-gray-600 whitespace-nowrap">Carrying cost / joke-min:</label>
                    <input
                      id="cfg-carrying-cost"
                      type="number"
                      step="0.001"
                      min="0"
                      value={localCarryingCost}
                      onChange={e => setLocalCarryingCost(Number(e.target.value))}
                      disabled={!canEditLean}
                      className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditLean ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div className="flex items-center space-x-3" title={leanLocked ? LEAN_LOCK_HINT : "Batches that may wait for Marketing before the Joke Maker must stop (0 = no limit)"}>
                    <label htmlFor="cfg-wip-limit" className="text-sm text-gray-600 whitespace-nowrap">WIP limit:</label>
                    <input
                      id="cfg-wip-limit"
                      type="number"
                      step="1"
                      min="0"
                      value={localWipLimit}
                      onChange={e => setLocalWipLimit(Number(e.target.value))}
                      disabled={!canEditLean}
                      className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditLean ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                </>
              )}
```

with:

```tsx
              <FeeConfigFields
                values={localFees}
                onChange={setLocalFees}
                disabled={!canEditLean}
                lockHint={LEAN_LOCK_HINT}
                round1BatchSize={config.round1BatchSize}
                round2BatchLimit={config.round2BatchLimit}
              />
```

In `views/Instructor.tsx`, replace the Lean class preset button:

```tsx
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleApplyLeanPreset}
                  aria-label="Lean class preset"
                  variant="secondary"
                  disabled={presetDisabled}
                  className={`px-4 py-1 text-xs font-semibold ${presetDisabled ? 'opacity-60' : ''}`}
                  title={`Round 1: push rules (setup ${fmtMoney(LEAN_CLASS_PRESET[1].setupCostPerBatch ?? 0)}, no WIP limit) · Round 2: lean rules (setup ${fmtMoney(LEAN_CLASS_PRESET[2].setupCostPerBatch ?? 0)}, WIP limit ${LEAN_CLASS_PRESET[2].wipLimit})`}
                >
                  {presetBusy ? 'Applying…' : 'Lean class preset'}
                </Button>
                {config.round === 2 && !config.isActive && roundStatuses[2] === 'CONFIGURED' && (
                  <span className="text-xs text-gray-500">Round 1 has started — applies to Round 2 only.</span>
                )}
              </div>
```

with:

```tsx
```

In `views/Instructor.tsx`, replace the preset's notice:

```tsx
      {presetNotice && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <CheckCircle size={16} className="text-emerald-400" /> {presetNotice}
        </div>
      )}
```

with:

```tsx
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanMode.test.ts components/FeeConfigFields.test.ts views/Instructor.render.test.ts`
Expected: PASS — 3 files, 16 tests.

- [ ] **Step 9: Full checks**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent, every test file passes, `✓ built`.

- [ ] **Step 10: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add \
  types/api.ts types.ts context.tsx services/instructorService.ts scripts/smoke-api.ts \
  services/leanMode.ts services/leanMode.test.ts \
  components/FeeConfigFields.tsx components/FeeConfigFields.test.ts \
  views/Instructor.tsx views/testing/renderWithGame.ts views/Instructor.render.test.ts && git commit -q -F - <<'EOF'
feat(lean): fee settings; Lean-only instructor config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 3B: Frontend — the instructor's read-outs name the fees

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Modify: `types/api.ts` (`LeanTeamStats`), `services/leanMode.ts` (add `LeanFees`, `leanFeesOf`, `LeanSortKey`, `LEAN_LEADERBOARD_COLUMNS`), `views/Instructor.tsx` (leaderboard columns, `leanByTeam`, cells, the Round 1 vs Round 2 subtitle), `components/LeanDebrief.tsx` (Fees column), `services/leanCharts.ts` (`WASTE_SEGMENTS`, colour comments), `components/leanCharts/WasteBreakdownChart.tsx` (comment)
- Test: modify `services/leanMode.test.ts`, `components/leanCharts/leanCharts.render.test.ts`; create `components/LeanDebrief.render.test.ts`, `views/Instructor.leaderboard.render.test.ts`

**Interfaces:**
- Consumes (Task 2): the `lean` block's `shipping_cost`, `storage_cost`, `hosting_cost` (absent on an older backend) and the aliases `setup_cost`, `carrying_cost`; lean charts `waste.setup/waiting/shelf`. (Task 3A): `views/testing/renderWithGame.ts`.
- Produces:
  ```ts
  // types/api.ts LeanTeamStats gains (optional: older backends omit them)
  shipping_cost?: number; storage_cost?: number; hosting_cost?: number;
  // services/leanMode.ts
  export interface LeanFees { shipping: number; storage: number; hosting: number }
  export function leanFeesOf(lean: { shipping_cost?; storage_cost?; hosting_cost?; setup_cost?; carrying_cost? } | null | undefined): LeanFees
  //   older backend: shipping = setup_cost, storage = carrying_cost, hosting = 0; never NaN
  export type LeanSortKey = 'shipping_cost' | 'storage_cost' | 'hosting_cost' | 'lead_time_s' | 'sale_time_s';
  export const LEAN_LEADERBOARD_COLUMNS: ReadonlyArray<{ key: LeanSortKey; label: string; title: string }>;
  //   labels 'Shipping', 'Storage', 'Hosting', 'Lead', 'Sale'
  // components/LeanDebrief.tsx DebriefSide: `setup`/`carrying` replaced by `fees` (shipping + storage + hosting)
  ```

- [ ] **Step 1: Write the failing tests**

In `services/leanMode.test.ts`, replace the import:

```ts
import {
  MARKET_MODE_LOCKED_MESSAGE, WIP_LIMIT_MESSAGE,
  fmtCents, fmtFee, fmtMoney, fmtPerMinute, isLeanRound, isMarketModeLocked, isWipLimitReached,
  leanConfigFromRound, leanConfigToBody, learningCurvePoints, neverSold, shippingFeeFor, wipStatus,
} from './leanMode';
```

with:

```ts
import {
  LEAN_LEADERBOARD_COLUMNS, MARKET_MODE_LOCKED_MESSAGE, WIP_LIMIT_MESSAGE,
  fmtCents, fmtFee, fmtMoney, fmtPerMinute, isLeanRound, isMarketModeLocked, isWipLimitReached,
  leanConfigFromRound, leanConfigToBody, leanFeesOf, learningCurvePoints, neverSold, shippingFeeFor, wipStatus,
} from './leanMode';
```

In `services/leanMode.test.ts`, replace:

```ts
  it('counts never-sold jokes per batch, even when total sales exceed published', () => {
```

with:

```ts
  it('reads the three fees off a lean block, falling back to the old aliases without NaN', () => {
    expect(leanFeesOf({ shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7 }))
      .toEqual({ shipping: 8, storage: 1.5, hosting: 0.2 });
    // An older backend: only setup_cost and carrying_cost.
    expect(leanFeesOf({ setup_cost: 4, carrying_cost: 2.5 })).toEqual({ shipping: 4, storage: 2.5, hosting: 0 });
    expect(leanFeesOf({ setup_cost: 'x', carrying_cost: undefined })).toEqual({ shipping: 0, storage: 0, hosting: 0 });
    expect(leanFeesOf(null)).toEqual({ shipping: 0, storage: 0, hosting: 0 });
    expect(leanFeesOf(undefined)).toEqual({ shipping: 0, storage: 0, hosting: 0 });
  });

  it('names the leaderboard Lean columns after the fees', () => {
    expect(LEAN_LEADERBOARD_COLUMNS.map(c => c.label)).toEqual(['Shipping', 'Storage', 'Hosting', 'Lead', 'Sale']);
  });

  it('counts never-sold jokes per batch, even when total sales exceed published', () => {
```

Create `components/LeanDebrief.render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeanDebrief, debriefRows, type DebriefStats } from './LeanDebrief';

const stats = (profit: number, lean: Record<string, unknown>): DebriefStats => ({
  leaderboard: [{
    team: { id: 3, name: 'Team 3' }, profit, total_sales: 12, published_jokes: 10, unsold_jokes: 0,
    lean: { batches_submitted: 4, avg_submit_to_publish_s: 60, avg_publish_to_first_sale_s: 30, batch_series: [], setup_cost: 0, carrying_cost: 0, ...lean },
  }],
});

describe('Round 1 vs Round 2 fees', () => {
  it('adds shipping, storage and hosting into one Fees figure per round', () => {
    const rows = debriefRows(
      stats(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.25, setup_cost: 8, carrying_cost: 1.75 }),
      stats(4, { shipping_cost: 5, storage_cost: 0.5, hosting_cost: 0.1, setup_cost: 5, carrying_cost: 0.6 }),
    );
    expect(rows[0].r1?.fees).toBeCloseTo(9.75);
    expect(rows[0].r2?.fees).toBeCloseTo(5.6);
  });

  it('reads an older backend\'s setup and carrying costs as the fees', () => {
    const rows = debriefRows(stats(1, { setup_cost: 4, carrying_cost: 2 }), null);
    expect(rows[0].r1?.fees).toBe(6);
  });

  it('heads the column Fees, never setup+carry', () => {
    const out = renderToStaticMarkup(createElement(LeanDebrief, {
      r1: stats(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.25 }),
      r2: stats(4, { shipping_cost: 5, storage_cost: 0.5, hosting_cost: 0.1 }),
    }));
    expect(out).toContain('R1 Fees');
    expect(out).toContain('R2 Fees');
    expect(out).toContain('$9.75');
    expect(out).toContain('$5.60');
    expect(out).not.toContain('setup+carry');
  });
});
```

Create `views/Instructor.leaderboard.render.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import Instructor from './Instructor';
import { renderWithGame, testUser } from './testing/renderWithGame';
import { Role, type ApiInstructorStatsResponse } from '../types';
import type { LeanTeamStats } from '../types/api';

// Instructor reads window.location.search while rendering (the bot panel switch).
vi.stubGlobal('window', { location: { search: '' } });

const instructor = testUser(Role.INSTRUCTOR, null);

const row = (id: number, lean: Partial<LeanTeamStats>): ApiInstructorStatsResponse['leaderboard'][number] => ({
  rank: id, team: { id, name: `Team ${id}` }, points: 0, total_sales: 10, unsold_jokes: 0, discarded_jokes: 1,
  batches_processed: 3, profit: 2.5, total_jokes: 9, published_jokes: 8,
  lean: {
    batches_submitted: 3, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 42, avg_publish_to_first_sale_s: 90,
    batch_series: [], ...lean,
  },
});

describe('Instructor leaderboard, Lean columns', () => {
  it('heads the Lean leaderboard columns Shipping, Storage, Hosting, Lead and Sale', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: {
        round_id: 1,
        leaderboard: [row(1, { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7 })],
      },
    });
    const head = out.slice(out.indexOf('<thead'), out.indexOf('</thead>'));
    const labels = ['Profit', 'Shipping', 'Storage', 'Hosting', 'Lead', 'Sale'].map(l => head.indexOf(`<span>${l}</span>`));
    expect(labels.every(i => i > 0)).toBe(true);
    expect([...labels].sort((a, b) => a - b)).toEqual(labels);
    expect(head).not.toContain('<span>Setup</span>');
    expect(head).not.toContain('<span>Carrying</span>');
    expect(out).toContain('$8.00');
    expect(out).toContain('$1.50');
    expect(out).toContain('$0.20');
  });

  it('reads an older backend\'s setup and carrying costs without showing NaN', () => {
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, { setup_cost: 4, carrying_cost: 2.5 })] },
    });
    expect(out).toContain('$4.00');
    expect(out).toContain('$2.50');
    expect(out).not.toContain('NaN');
  });

  it('subtitles the Round 1 vs Round 2 table for one rule set', () => {
    const lean = { shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2 };
    const out = renderWithGame(Instructor, {
      user: instructor,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, lean)] },
      instructorStatsRound2: { round_id: 2, leaderboard: [row(1, lean)] },
    });
    expect(out).toContain('Same rules and fees in both rounds, per team');
    expect(out).not.toContain('Push rules vs lean rules');
  });
});
```

In `components/leanCharts/leanCharts.render.test.ts`, replace:

```ts
    for (const label of ['Setup', 'Waiting at Marketing', 'Unsold on shelf', 'Published, never sold', 'Discarded']) {
      expect(out).toContain(label);
    }
```

with:

```ts
    for (const label of [
      'Shipping', 'Storage (waiting on Marketing&#x27;s desk)', 'Hosting (unsold on the shelf)',
      'Listing fees on never-sold jokes', 'Discards',
    ]) {
      expect(out).toContain(label);
    }
    for (const old of ['>Setup<', 'Waiting at Marketing', 'Unsold on shelf', 'Published, never sold']) {
      expect(out).not.toContain(old);
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanMode.test.ts components/LeanDebrief.render.test.ts views/Instructor.leaderboard.render.test.ts components/leanCharts/leanCharts.render.test.ts`
Expected: FAIL — `leanFeesOf is not a function`, `LEAN_LEADERBOARD_COLUMNS` undefined, `expected … to contain 'R1 Fees'`, the leaderboard head has `<span>Setup</span>`, the waste legend still reads "Setup".

- [ ] **Step 3: Types and helpers**

In `types/api.ts`, replace:

```ts
export interface LeanTeamStats {
  batches_submitted: number;
  setup_cost: number;
  carrying_cost: number;
```

with:

```ts
export interface LeanTeamStats {
  batches_submitted: number;
  /** Shipping fees so far: every sent batch priced by its size. Absent before migration 0005. */
  shipping_cost?: number;
  /** Storage fees so far: jokes waiting on Marketing's desk. Absent before migration 0005. */
  storage_cost?: number;
  /** Hosting fees so far: released jokes waiting for a first sale. Absent before migration 0005. */
  hosting_cost?: number;
  /** Alias of shipping_cost on newer backends (read through services/leanMode.ts leanFeesOf). */
  setup_cost: number;
  /** Alias of storage_cost + hosting_cost on newer backends. */
  carrying_cost: number;
```

In `services/leanMode.ts`, replace:

```ts
/** One learning-curve point: a batch's sell-through (sold ÷ published). */
```

with:

```ts
/** A team's three Lean fees so far, in dollars. */
export interface LeanFees { shipping: number; storage: number; hosting: number }

/**
 * Shipping, storage and hosting from a Lean stats block. A backend that
 * predates the fee names sends only setup_cost and carrying_cost: shipping then
 * reads setup_cost, storage reads the whole carrying_cost (it cannot be split)
 * and hosting 0, so the three still add up to what that backend charged.
 * Anything missing or not a number reads as 0, never NaN.
 */
export function leanFeesOf(
  lean: { shipping_cost?: unknown; storage_cost?: unknown; hosting_cost?: unknown; setup_cost?: unknown; carrying_cost?: unknown } | null | undefined,
): LeanFees {
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  if (!lean) return { shipping: 0, storage: 0, hosting: 0 };
  const split = num(lean.storage_cost) != null || num(lean.hosting_cost) != null;
  return {
    shipping: num(lean.shipping_cost) ?? num(lean.setup_cost) ?? 0,
    storage: split ? num(lean.storage_cost) ?? 0 : num(lean.carrying_cost) ?? 0,
    hosting: split ? num(lean.hosting_cost) ?? 0 : 0,
  };
}

/** Sort keys of the leaderboard's Lean columns. */
export type LeanSortKey = 'shipping_cost' | 'storage_cost' | 'hosting_cost' | 'lead_time_s' | 'sale_time_s';

/** The leaderboard's Lean columns, in order (views/Instructor.tsx). */
export const LEAN_LEADERBOARD_COLUMNS: ReadonlyArray<{ key: LeanSortKey; label: string; title: string }> = [
  { key: 'shipping_cost', label: 'Shipping', title: 'Shipping fees: every batch sent, priced by its size' },
  { key: 'storage_cost', label: 'Storage', title: "Storage fees: jokes waiting on Marketing's desk, per minute" },
  { key: 'hosting_cost', label: 'Hosting', title: 'Hosting fees: released jokes unsold on the shelf, per minute' },
  { key: 'lead_time_s', label: 'Lead', title: 'Average lead time: batch sent to joke released' },
  { key: 'sale_time_s', label: 'Sale', title: 'Average time from release to first sale' },
];

/** One learning-curve point: a batch's sell-through (sold ÷ published). */
```

- [ ] **Step 4: Leaderboard columns and the Round 1 vs Round 2 table**

In `views/Instructor.tsx`, replace:

```tsx
import { fmtMoney, neverSold } from '../services/leanMode';
```

with:

```tsx
import { LEAN_LEADERBOARD_COLUMNS, fmtMoney, leanFeesOf, neverSold, type LeanSortKey } from '../services/leanMode';
```

In `views/Instructor.tsx`, replace the local column list:

```tsx
// Lean leaderboard columns, read from row.lean on LEAN rounds only.
type LeanSortKey = 'setup_cost' | 'carrying_cost' | 'lead_time_s' | 'sale_time_s';
const LEAN_COLUMNS: Array<{ key: LeanSortKey; label: string; title: string }> = [
  { key: 'setup_cost', label: 'Setup', title: 'Setup cost (per batch submitted)' },
  { key: 'carrying_cost', label: 'Carrying', title: 'Carrying cost (jokes waiting, per minute)' },
  { key: 'lead_time_s', label: 'Lead', title: 'Average lead time: batch submitted to joke published' },
  { key: 'sale_time_s', label: 'Sale', title: 'Average time from publish to first sale' },
];
```

with:

```tsx
// Lean leaderboard columns, read from row.lean on LEAN rounds only.
const LEAN_COLUMNS = LEAN_LEADERBOARD_COLUMNS;
```

In `views/Instructor.tsx`, replace in `leanByTeam`:

```tsx
    for (const r of leaderboardStatsSelected?.leaderboard ?? []) {
      m[String(r.team.id)] = {
        setup_cost: Number(r.lean?.setup_cost ?? 0),
        carrying_cost: Number(r.lean?.carrying_cost ?? 0),
```

with:

```tsx
    for (const r of leaderboardStatsSelected?.leaderboard ?? []) {
      // Older backends send only setup_cost / carrying_cost: leanFeesOf falls back to them.
      const fees = leanFeesOf(r.lean);
      m[String(r.team.id)] = {
        shipping_cost: fees.shipping,
        storage_cost: fees.storage,
        hosting_cost: fees.hosting,
```

In `views/Instructor.tsx`, replace the Lean cells of a leaderboard row:

```tsx
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.setup_cost) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.carrying_cost) : '—'}</td>
```

with:

```tsx
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.shipping_cost) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.storage_cost) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{lean ? fmtMoney(lean.hosting_cost) : '—'}</td>
```

In `views/Instructor.tsx`, replace:

```tsx
            <Card className="xl:col-span-2" title="Round 1 vs Round 2" subtitle="Push rules vs lean rules, per team">
```

with:

```tsx
            <Card className="xl:col-span-2" title="Round 1 vs Round 2" subtitle="Same rules and fees in both rounds, per team">
```

In `components/LeanDebrief.tsx`, replace:

```tsx
/* Round 1 vs Round 2, per team — the debrief table for Lean classes. Round 1
   is played with push rules and Round 2 with lean rules, so the comparison
   itself is the lesson: profit, waste and lead time side by side. */
import React from 'react';
import type { TeamStats } from '../types/api';
import { fmtMoney, neverSold } from '../services/leanMode';
```

with:

```tsx
/* Round 1 vs Round 2, per team — the debrief table for Lean classes. Both
   rounds play the same rules and fees (only the batch size differs), so any
   change is the team's doing: profit, waste, fees and lead time side by side. */
import React from 'react';
import type { TeamStats } from '../types/api';
import { fmtMoney, leanFeesOf, neverSold } from '../services/leanMode';
```

In `components/LeanDebrief.tsx`, replace:

```tsx
  unsold: number | null;
  setup: number; carrying: number; leadTimeS: number; saleTimeS: number;
}
```

with:

```tsx
  unsold: number | null;
  /** Shipping + storage + hosting (an older backend's setup + carrying). */
  fees: number;
  leadTimeS: number; saleTimeS: number;
}
```

In `components/LeanDebrief.tsx`, replace:

```tsx
function side(t: DebriefStats['leaderboard'][number]): DebriefSide {
  return {
    profit: t.profit, sales: t.total_sales, published: t.published_jokes, unsold: neverSold(t.lean),
    setup: t.lean?.setup_cost ?? 0, carrying: t.lean?.carrying_cost ?? 0,
```

with:

```tsx
function side(t: DebriefStats['leaderboard'][number]): DebriefSide {
  const fees = leanFeesOf(t.lean);
  return {
    profit: t.profit, sales: t.total_sales, published: t.published_jokes, unsold: neverSold(t.lean),
    fees: fees.shipping + fees.storage + fees.hosting,
```

In `components/LeanDebrief.tsx`, replace:

```tsx
            <th className="px-2 py-1 text-right">R1 setup+carry</th><th className="px-2 py-1 text-right">R2 setup+carry</th>
```

with:

```tsx
            <th className="px-2 py-1 text-right" title="Shipping + storage + hosting fees">R1 Fees</th>
            <th className="px-2 py-1 text-right" title="Shipping + storage + hosting fees">R2 Fees</th>
```

In `components/LeanDebrief.tsx`, replace:

```tsx
              <Cell s={r.r1} pick={s => fmtMoney(s.setup + s.carrying)} /><Cell s={r.r2} pick={s => fmtMoney(s.setup + s.carrying)} />
```

with:

```tsx
              <Cell s={r.r1} pick={s => fmtMoney(s.fees)} /><Cell s={r.r2} pick={s => fmtMoney(s.fees)} />
```

- [ ] **Step 5: Waste segments named after the fees**

In `services/leanCharts.ts`, replace:

```ts
  setup: '#2563eb',        // --production: Joke Maker changeover
  waiting: '#7c3aed',      // --marketing: waiting at Marketing
  shelf: '#d97706',        // --market: unsold on the shelf
```

with:

```ts
  setup: '#2563eb',        // --production: shipping (each batch the Joke Maker sends)
  waiting: '#7c3aed',      // --marketing: storage (waiting on Marketing's desk)
  shelf: '#d97706',        // --market: hosting (unsold on the shelf)
```

In `services/leanCharts.ts`, replace:

```ts
/** Bar segments in stacking order, left to right. */
export const WASTE_SEGMENTS: ReadonlyArray<{ key: WasteSegmentKey; label: string; color: string }> = [
  { key: 'setup', label: 'Setup', color: LEAN_CHART_COLORS.setup },
  { key: 'waiting', label: 'Waiting at Marketing', color: LEAN_CHART_COLORS.waiting },
  { key: 'shelf', label: 'Unsold on shelf', color: LEAN_CHART_COLORS.shelf },
  { key: 'neverSold', label: 'Published, never sold', color: LEAN_CHART_COLORS.neverSold },
  { key: 'discarded', label: 'Discarded', color: LEAN_CHART_COLORS.discarded },
];
```

with:

```ts
/** Bar segments in stacking order, left to right. The keys are the backend's
    waste keys (setup = shipping, waiting = storage, shelf = hosting); the
    labels are the fee names students see. */
export const WASTE_SEGMENTS: ReadonlyArray<{ key: WasteSegmentKey; label: string; color: string }> = [
  { key: 'setup', label: 'Shipping', color: LEAN_CHART_COLORS.setup },
  { key: 'waiting', label: "Storage (waiting on Marketing's desk)", color: LEAN_CHART_COLORS.waiting },
  { key: 'shelf', label: 'Hosting (unsold on the shelf)', color: LEAN_CHART_COLORS.shelf },
  { key: 'neverSold', label: 'Listing fees on never-sold jokes', color: LEAN_CHART_COLORS.neverSold },
  { key: 'discarded', label: 'Discards', color: LEAN_CHART_COLORS.discarded },
];
```

In `components/leanCharts/WasteBreakdownChart.tsx`, replace:

```tsx
/* Chart 1 — "Where the money leaked" (instructor only). One horizontal bar per
   team, most waste first, split into the five kinds of waste in dollars, with
   the total at the end of each bar. Setup + Waiting + Unsold equals the
   leaderboard's Setup + Carrying for that team. */
```

with:

```tsx
/* Chart 1 — "Where the money leaked" (instructor only). One horizontal bar per
   team, most waste first, split into the five kinds of waste in dollars, with
   the total at the end of each bar. Shipping + Storage + Hosting equals the
   leaderboard's Shipping + Storage + Hosting for that team. */
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanMode.test.ts components/LeanDebrief.render.test.ts views/Instructor.leaderboard.render.test.ts components/leanCharts/leanCharts.render.test.ts components/leanDebrief.test.ts`
Expected: PASS — every listed file.

- [ ] **Step 7: Full checks**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent, every test file passes, `✓ built`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add \
  types/api.ts services/leanMode.ts services/leanMode.test.ts \
  views/Instructor.tsx views/Instructor.leaderboard.render.test.ts \
  components/LeanDebrief.tsx components/LeanDebrief.render.test.ts \
  services/leanCharts.ts components/leanCharts/WasteBreakdownChart.tsx components/leanCharts/leanCharts.render.test.ts && git commit -q -F - <<'EOF'
feat(lean): leaderboard, debrief and charts name the fees

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 4: Frontend — the student screens show the fees

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Modify: `services/leanMode.ts` (remove `wipStatus`; add `shippingLine`, `feeTooltips`), `types.ts` (`ApiTeamSummaryResponse.lean`), `components/ui.tsx` (`StatBox` `title`), `views/JokeMaker.tsx` (import, `canSubmit`, the submit comment, the round brief, the shipping line), `views/QualityControl.tsx` (import, the Lean block, the fee tiles)
- Test: modify `services/leanMode.test.ts`; create `views/studentScreens.render.test.ts`

**Interfaces:**
- Consumes (Task 3A/3B): `GameConfig` fee fields, `ShippingFees`, `LeanFeeConfig`, `shippingFeeFor`, `fmtFee`, `fmtCents`, `fmtMoney`, `leanFeesOf`, `renderWithGame`, `TEST_CONFIG`, `testUser`.
- Produces:
  ```ts
  // services/leanMode.ts
  export function shippingLine(roundNumber: number, round1BatchSize: number, f: ShippingFees): string
  //   1 → "Shipping: $2 per batch of 5"; 2 → "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10"
  export function feeTooltips(f: LeanFeeConfig): { shipping: string; storage: string; hosting: string }
  // wipStatus is removed (nothing shows a WIP counter any more)
  // components/ui.tsx StatBox gains `title?: string` (the tile's native tooltip)
  // types.ts ApiTeamSummaryResponse gains `lean?: LeanTeamStats`
  ```

- [ ] **Step 1: Write the failing tests**

In `services/leanMode.test.ts`, replace the import:

```ts
import {
  LEAN_LEADERBOARD_COLUMNS, MARKET_MODE_LOCKED_MESSAGE, WIP_LIMIT_MESSAGE,
  fmtCents, fmtFee, fmtMoney, fmtPerMinute, isLeanRound, isMarketModeLocked, isWipLimitReached,
  leanConfigFromRound, leanConfigToBody, leanFeesOf, learningCurvePoints, neverSold, shippingFeeFor, wipStatus,
} from './leanMode';
```

with:

```ts
import {
  LEAN_LEADERBOARD_COLUMNS, MARKET_MODE_LOCKED_MESSAGE, WIP_LIMIT_MESSAGE,
  feeTooltips, fmtCents, fmtFee, fmtMoney, fmtPerMinute, isLeanRound, isMarketModeLocked, isWipLimitReached,
  leanConfigFromRound, leanConfigToBody, leanFeesOf, learningCurvePoints, neverSold, shippingFeeFor, shippingLine,
} from './leanMode';
```

In `services/leanMode.test.ts`, replace the WIP counter test:

```ts
  it('describes the WIP state for the Joke Maker', () => {
    expect(wipStatus(0, 0)).toEqual({ blocked: false, label: null });
    expect(wipStatus(1, 2)).toEqual({ blocked: false, label: 'Marketing has 1 of 2 batches waiting' });
    expect(wipStatus(2, 2)).toEqual({ blocked: true, label: 'Marketing has 2 of 2 batches waiting — wait, or go help' });
  });
```

with:

```ts
  it('writes the Joke Maker\'s shipping line from the round\'s fees', () => {
    expect(shippingLine(1, 5, fees)).toBe('Shipping: $2 per batch of 5');
    expect(shippingLine(2, 5, fees)).toBe('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
    expect(shippingLine(1, 5, { shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 2 }))
      .toBe('Shipping: $1.50 per batch of 5');
  });

  it('writes the fee tooltips from the round\'s fees', () => {
    expect(feeTooltips({ ...fees, storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.05 })).toEqual({
      shipping: 'Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10.',
      storage: "Every minute a joke waits on Marketing's desk costs 10¢.",
      hosting: 'Every minute a released joke sits unsold costs 5¢.',
    });
    expect(feeTooltips({ ...fees, storageFeePerJokeMinute: 0.2, hostingFeePerJokeMinute: 0.025 }).storage)
      .toBe("Every minute a joke waits on Marketing's desk costs 20¢.");
  });
```

Create `views/studentScreens.render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import JokeMaker from './JokeMaker';
import QualityControl from './QualityControl';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role, type ApiTeamSummaryResponse } from '../types';
import type { LeanTeamStats } from '../types/api';

const summary = (lean?: Partial<LeanTeamStats>): ApiTeamSummaryResponse => ({
  team: { id: 1, name: 'Team 1' }, round_id: 1, rank: 1, points: 0, total_sales: 3, profit: -1.25,
  batches_created: 2, batches_processed: 1, published_jokes: 3, unprocessed_batches: 2,
  jokes_created: 5, jokes_published: 3,
  lean: lean && {
    batches_submitted: 2, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 40, avg_publish_to_first_sale_s: 0,
    batch_series: [], ...lean,
  },
});

const jokeMaker = (round: 1 | 2, extra: Partial<typeof TEST_CONFIG> = {}) => renderWithGame(JokeMaker, {
  user: testUser(Role.JOKE_MAKER),
  config: { ...TEST_CONFIG, round, ...extra },
  teamSummary: summary({}),
});

const marketing = (lean: Partial<LeanTeamStats>) => renderWithGame(QualityControl, {
  user: testUser(Role.QUALITY_CONTROL),
  teamSummary: summary(lean),
});

describe('Joke Maker screen', () => {
  it('quotes Round 1 shipping for its batch of 5', () => {
    expect(jokeMaker(1)).toContain('Shipping: $2 per batch of 5');
  });

  it('quotes the three Round 2 tiers and says up to 10 jokes, smaller allowed', () => {
    const out = jokeMaker(2);
    expect(out).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
    expect(out).toContain('Generate up to 10 jokes');
    expect(out).toContain('smaller batches are fine');
  });

  it('reads the amounts from the round, never from fixed copy', () => {
    const out = jokeMaker(2, { shippingFeeSmall: 0.5, shippingFeeStandard: 1, shippingFeeLarge: 4 });
    expect(out).toContain('Shipping: $0.50 for 1–4 jokes · $1 for 5 · $4 for 6–10');
  });

  it('shows no WIP counter and no setup or carrying wording, even with an old WIP limit stored', () => {
    const out = jokeMaker(1, { wipLimit: 2, setupCostPerBatch: 2 });
    for (const gone of ['batches waiting', 'wait, or go help', 'to set up', 'Setup cost', 'Carrying cost']) {
      expect(out).not.toContain(gone);
    }
  });
});

describe('Marketing screen', () => {
  it('shows Shipping, Storage and Hosting fee tiles with one-line tooltips', () => {
    const out = marketing({ shipping_cost: 8, storage_cost: 1.5, hosting_cost: 0.2, setup_cost: 8, carrying_cost: 1.7 });
    expect(out).toContain('Shipping fees');
    expect(out).toContain('Storage fees');
    expect(out).toContain('Hosting fees');
    expect(out).toContain('$8.00');
    expect(out).toContain('$1.50');
    expect(out).toContain('$0.20');
    expect(out).toContain('title="Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10."');
    expect(out).toContain('title="Every minute a joke waits on Marketing&#x27;s desk costs 10¢."');
    expect(out).toContain('title="Every minute a released joke sits unsold costs 5¢."');
    expect(out).not.toContain('Setup cost');
    expect(out).not.toContain('Carrying cost');
  });

  it('reads an older backend\'s setup and carrying costs without NaN', () => {
    const out = marketing({ setup_cost: 4, carrying_cost: 2.5 });
    expect(out).toContain('$4.00');
    expect(out).toContain('$2.50');
    expect(out).not.toContain('NaN');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanMode.test.ts views/studentScreens.render.test.ts`
Expected: FAIL — `shippingLine is not a function`, `feeTooltips is not a function`; the Joke Maker renders "Each batch costs $0.00 to set up" instead of "Shipping: $2 per batch of 5" and still says "your jokes" in Round 2; Marketing shows "Setup cost" and "Carrying cost".

- [ ] **Step 3: Helpers, types and the tile tooltip**

In `services/leanMode.ts`, replace (the WIP counter goes; nothing shows it any more):

```ts
export function wipStatus(waiting: number, limit: number): { blocked: boolean; label: string | null } {
  if (limit <= 0) return { blocked: false, label: null };
  const blocked = waiting >= limit;
  const base = `Marketing has ${waiting} of ${limit} batches waiting`;
  return { blocked, label: blocked ? `${base} — wait, or go help` : base };
}

```

with:

```ts
```

In `services/leanMode.ts`, replace:

```ts
/** "10¢ a joke each minute" — the storage or hosting fee as students read it. */
export function fmtPerMinute(v: number): string {
  return `${fmtCents(v)} a joke each minute`;
}
```

with:

```ts
/** "10¢ a joke each minute" — the storage or hosting fee as students read it. */
export function fmtPerMinute(v: number): string {
  return `${fmtCents(v)} a joke each minute`;
}

/**
 * The Joke Maker's shipping line under Send. Round 1 sends one size, so it
 * names that size's fee ("Shipping: $2 per batch of 5"); Round 2 lists the
 * three tiers ("Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10").
 */
export function shippingLine(roundNumber: number, round1BatchSize: number, f: ShippingFees): string {
  if (roundNumber <= 1) {
    return `Shipping: ${fmtFee(shippingFeeFor(round1BatchSize, f))} per batch of ${round1BatchSize}`;
  }
  return `Shipping: ${fmtFee(f.shippingFeeSmall)} for 1–4 jokes · ${fmtFee(f.shippingFeeStandard)} for 5 · ${fmtFee(f.shippingFeeLarge)} for 6–10`;
}

/** The one-line tooltips of Marketing's three fee tiles, with the round's amounts. */
export function feeTooltips(f: LeanFeeConfig): { shipping: string; storage: string; hosting: string } {
  return {
    shipping: `Charged per batch you send: ${fmtFee(f.shippingFeeSmall)} for 1–4 jokes, ${fmtFee(f.shippingFeeStandard)} for 5, ${fmtFee(f.shippingFeeLarge)} for 6–10.`,
    storage: `Every minute a joke waits on Marketing's desk costs ${fmtCents(f.storageFeePerJokeMinute)}.`,
    hosting: `Every minute a released joke sits unsold costs ${fmtCents(f.hostingFeePerJokeMinute)}.`,
  };
}
```

In `types.ts`, replace the end of `ApiTeamSummaryResponse`:

```ts
  jokes_published?: number;
  cost_breakdown?: { revenue: number; publish_cost: number; discard_cost: number; profit: number };
}
```

with:

```ts
  jokes_published?: number;
  cost_breakdown?: { revenue: number; publish_cost: number; discard_cost: number; profit: number };
  /** Lean rounds only: the team's fees so far (read through services/leanMode.ts leanFeesOf). */
  lean?: LeanTeamStats;
}
```

In `components/ui.tsx`, replace in `StatBox`:

```tsx
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}> = ({ label, value, tone, sub, color, className = '', valueClassName = '', labelClassName = '' }) => {
  // Back-compat: legacy `color` prop (raw className) takes precedence if provided.
  const toneClass = color ?? STAT_TONES[tone ?? 'slate'];
  return (
    <div className={`px-3 py-3 rounded-lg flex flex-col items-center justify-center text-center ${toneClass} ${className}`}>
```

with:

```tsx
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
  /** Native tooltip: one line saying what the number counts. */
  title?: string;
}> = ({ label, value, tone, sub, color, className = '', valueClassName = '', labelClassName = '', title }) => {
  // Back-compat: legacy `color` prop (raw className) takes precedence if provided.
  const toneClass = color ?? STAT_TONES[tone ?? 'slate'];
  return (
    <div title={title} className={`px-3 py-3 rounded-lg flex flex-col items-center justify-center text-center ${toneClass} ${className}`}>
```

- [ ] **Step 4: Joke Maker — the shipping line, Round 2 "up to 10", no WIP counter**

In `views/JokeMaker.tsx`, replace:

```tsx
import { fmtMoney, wipStatus } from '../services/leanMode';
```

with:

```tsx
import { shippingLine } from '../services/leanMode';
```

In `views/JokeMaker.tsx`, replace:

```tsx
  const trimmedLen = input.trim().length;
  /* Lean market mode only: each batch carries a setup cost, and with a WIP
     limit the Joke Maker may not send another batch while Marketing already
     has that many waiting (a pull system). CLASSIC: leanMode is false, so
     canSubmit is exactly what it was. */
  const leanMode = config.marketMode === 'LEAN';
  const wip = wipStatus(teamSummary?.unprocessed_batches ?? 0, config.wipLimit);
  const canSubmit = config.isActive && certified && trimmedLen >= MIN_RAW_CHARS && !(leanMode && wip.blocked);
```

with:

```tsx
  const trimmedLen = input.trim().length;
  /* Lean market mode: every batch sent pays a shipping fee by its size (the
     line under Send). There is no WIP limit: the Joke Maker may always send. */
  const leanMode = config.marketMode === 'LEAN';
  const canSubmit = config.isActive && certified && trimmedLen >= MIN_RAW_CHARS;
```

In `views/JokeMaker.tsx`, replace:

```tsx
    // Lean: keep the draft when the backend refused the batch (e.g. the WIP
    // limit was reached between polls), so the Joke Maker can send it later.
    if (leanMode && !sent) return;
```

with:

```tsx
    // Lean: keep the draft when the backend refused the batch, so the Joke
    // Maker can send it later.
    if (leanMode && !sent) return;
```

In `views/JokeMaker.tsx`, replace the round brief:

```tsx
                <span>
                  <b>{isRound1 ? `Round 1:` : `Round 2:`}</b>{' '}
                  Generate {isRound1 ? `${targetBatchSize} jokes` : `your jokes`} with any AI tool and paste
                  the whole response below. Marketing will split the batch into individual jokes.
                </span>
```

with:

```tsx
                <span>
                  <b>{isRound1 ? `Round 1:` : `Round 2:`}</b>{' '}
                  {isRound1
                    ? <>Generate {targetBatchSize} jokes with any AI tool and paste the whole response below.</>
                    : <>Generate up to {config.round2BatchLimit} jokes with any AI tool (smaller batches are fine) and paste the whole response below.</>}
                  {' '}Marketing will split the batch into individual jokes.
                </span>
```

In `views/JokeMaker.tsx`, replace the line under Send:

```tsx
              {leanMode && (
                <div className="text-xs text-gray-500 text-right">
                  Each batch costs {fmtMoney(config.setupCostPerBatch)} to set up
                  {wip.label ? <> · <span className={wip.blocked ? 'font-semibold text-amber-700' : ''}>{wip.label}</span></> : null}
                </div>
              )}
```

with:

```tsx
              {leanMode && (
                <div className="text-xs text-gray-500 text-right">
                  {shippingLine(config.round, config.round1BatchSize, config)}
                </div>
              )}
```

- [ ] **Step 5: Marketing — Shipping, Storage and Hosting fee tiles**

In `views/QualityControl.tsx`, replace:

```tsx
import { fmtMoney } from '../services/leanMode';
```

with:

```tsx
import { feeTooltips, fmtMoney, leanFeesOf } from '../services/leanMode';
```

In `views/QualityControl.tsx`, replace:

```tsx
  /* Lean market mode only: the team's setup and carrying costs and how long a
     released joke waits for its first buyer. Nothing below renders for a
     CLASSIC round. The lean charts are instructor-only. */
  const leanMode = config.marketMode === 'LEAN';
  const lean = teamSummary?.lean ?? null;
```

with:

```tsx
  /* Lean market mode only: the team's shipping, storage and hosting fees and
     how long a released joke waits for its first buyer. Nothing below renders
     for a CLASSIC round. The lean charts are instructor-only. */
  const leanMode = config.marketMode === 'LEAN';
  const lean = teamSummary?.lean ?? null;
  const fees = leanFeesOf(lean);
  const tips = feeTooltips(config);
```

In `views/QualityControl.tsx`, replace:

```tsx
                <StatBox label="Setup cost" value={fmtMoney(lean?.setup_cost ?? 0)} tone="rose" valueClassName="text-xl" />
                <StatBox label="Carrying cost" value={fmtMoney(lean?.carrying_cost ?? 0)} tone="rose" valueClassName="text-xl" />
                <StatBox label="Publish → first sale" value={fmtSeconds(toFirstSale)} tone="sky" className="col-span-2" />
```

with:

```tsx
                <StatBox label="Shipping fees" value={fmtMoney(fees.shipping)} tone="rose" valueClassName="text-xl" title={tips.shipping} />
                <StatBox label="Storage fees" value={fmtMoney(fees.storage)} tone="rose" valueClassName="text-xl" title={tips.storage} />
                <StatBox label="Hosting fees" value={fmtMoney(fees.hosting)} tone="rose" valueClassName="text-xl" title={tips.hosting} />
                <StatBox label="Publish → first sale" value={fmtSeconds(toFirstSale)} tone="sky" />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/leanMode.test.ts views/studentScreens.render.test.ts`
Expected: PASS — both files.

- [ ] **Step 7: Full checks**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent, every test file passes, `✓ built`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add \
  services/leanMode.ts services/leanMode.test.ts types.ts components/ui.tsx \
  views/JokeMaker.tsx views/QualityControl.tsx views/studentScreens.render.test.ts && git commit -q -F - <<'EOF'
feat(lean): students see shipping, storage and hosting fees

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 5: Frontend — the "Next step" line

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `services/nextStep.ts`, `components/NextStep.tsx`
- Modify: `views/JokeMaker.tsx` (imports, the line under the stat tiles), `views/QualityControl.tsx` (imports, the line under the stat tiles)
- Test: create `services/nextStep.test.ts`, `components/NextStep.test.ts`, `views/nextStep.render.test.ts`

**Interfaces:**
- Consumes: `fmtPerMinute` (Task 3A), `summarizeFeedback(rows).fix` (`services/feedbackSummary.ts`), `FeedbackRow` (`views/feedback.ts`), `Batch` (`types.ts`: `status`, `jokes`, `submittedAt`, `ratedAt`, `marketing_note`), the screens' `config.isActive/round/storageFeePerJokeMinute`, `teamSummary.unprocessed_batches`, `qcQueue.batch.submitted_at`, `renderWithGame`.
- Produces:
  ```ts
  // services/nextStep.ts
  export type NextStepTone = 'info' | 'warn';
  export interface NextStep { text: string; tone: NextStepTone }
  export interface JokeMakerStepInput {
    now: number; roundActive: boolean; roundNumber: 1 | 2;
    marketingBacklog: number | null;   // unprocessed_batches; null = unknown
    lastSentAt: number | null;         // ms epoch of the latest sent batch
    lastBatchJokes: number | null;     // its joke count; null while unsplit
    latestNote: { text: string; batchSentAt: number } | null; // the latest PROCESSED batch's note
  }
  export interface MarketingStepInput {
    now: number; roundActive: boolean; storageFeePerJokeMinute: number;
    deskBatchSentAt: number | null;    // the claimed batch's submitted_at; null = no batch on the desk
    deskEmpty: boolean | null;         // nothing claimed and nothing waiting; null = unknown
    lastDecision: { published: number; discarded: number } | null; // the latest processed batch with jokes
    topFixNext: string | null;         // summarizeFeedback(rows).fix[0]?.label
  }
  export const NOTE_FRESH_MS = 120_000, BIG_BATCH_JOKES = 6, JM_IDLE_MS = 90_000, DESK_WAIT_S = 45,
    DISCARD_WARN_SHARE = 0.6, NOTE_QUOTE_CHARS = 80;
  export function quoteNote(text: string): string
  export function jokeMakerNextStep(i: JokeMakerStepInput): NextStep
  export function marketingNextStep(i: MarketingStepInput): NextStep
  export function jokeMakerInputFrom(a: { now; roundActive; round; teamSummary; batches }): JokeMakerStepInput
  export function marketingInputFrom(a: { now; roundActive; storageFeePerJokeMinute; teamSummary; qcQueue; batches; feedbackRows }): MarketingStepInput
  // components/NextStep.tsx
  export const NextStepLine: React.FC<{ step: NextStep }>
  export function useNow(intervalMs?: number): number
  export const NextStepLive: React.FC<{ step: (now: number) => NextStep }> // its own 1 s clock
  ```
  Every spec §6 rule has the data it needs on its screen, so none is skipped; an input is null only until the first poll answers, and the rule that needs it is skipped until then.

- [ ] **Step 1: Write the failing tests**

Create `services/nextStep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  jokeMakerInputFrom, jokeMakerNextStep, marketingInputFrom, marketingNextStep, quoteNote,
  type JokeMakerStepInput, type MarketingStepInput,
} from './nextStep';
import type { Batch, Joke } from '../types';
import type { FeedbackRow } from '../views/feedback';

const NOW = 1_000_000_000;
const s = (seconds: number) => seconds * 1000;

const jm = (over: Partial<JokeMakerStepInput> = {}): JokeMakerStepInput => ({
  now: NOW, roundActive: true, roundNumber: 1, marketingBacklog: 1, lastSentAt: NOW - s(10), lastBatchJokes: 5,
  latestNote: null, ...over,
});
const mk = (over: Partial<MarketingStepInput> = {}): MarketingStepInput => ({
  now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, deskBatchSentAt: null, deskEmpty: false,
  lastDecision: null, topFixNext: null, ...over,
});

describe('Joke Maker next step', () => {
  it('rule 1: the round has not started', () => {
    expect(jokeMakerNextStep(jm({ roundActive: false, latestNote: { text: 'More puns', batchSentAt: NOW } })))
      .toEqual({ text: 'Get your AI tool ready — the round starts soon.', tone: 'info' });
  });

  it('rule 2: quotes Marketing\'s note on the latest processed batch for 2 minutes after it was sent', () => {
    const note = (ago: number) => jm({ latestNote: { text: 'Shorter setups, more puns.', batchSentAt: NOW - s(ago) } });
    expect(jokeMakerNextStep(note(119))).toEqual({
      text: 'Marketing says: “Shorter setups, more puns.” — use it in your next batch.', tone: 'info',
    });
    expect(jokeMakerNextStep(note(120)).text).toContain('Marketing says');
    expect(jokeMakerNextStep(note(121)).text).not.toContain('Marketing says');
  });

  it('rule 2: cuts a long note at 80 characters and keeps it on one line', () => {
    const long = `${'a'.repeat(79)}bc and more`;
    expect(quoteNote(long)).toBe(`${'a'.repeat(79)}b…`);
    expect(quoteNote('x'.repeat(80))).toBe('x'.repeat(80));
    expect(quoteNote('Line one.\n\n  Line two.')).toBe('Line one. Line two.');
    expect(quoteNote(`${'😀'.repeat(81)}`)).toBe(`${'😀'.repeat(80)}…`);
    expect(jokeMakerNextStep(jm({ latestNote: { text: long, batchSentAt: NOW } })).text)
      .toBe(`Marketing says: “${'a'.repeat(79)}b…” — use it in your next batch.`);
  });

  it('rule 2: a blank note says nothing', () => {
    expect(jokeMakerNextStep(jm({ latestNote: { text: '   ', batchSentAt: NOW } })).text).not.toContain('Marketing says');
  });

  it('rule 3: Round 2, a last batch of 6 or more jokes', () => {
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: 6 }))).toEqual({
      text: 'Big batches wait longer for feedback — try 2 or 3 jokes next.', tone: 'warn',
    });
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: 5 })).tone).toBe('info');
    expect(jokeMakerNextStep(jm({ roundNumber: 1, lastBatchJokes: 8 })).text).not.toContain('Big batches');
    expect(jokeMakerNextStep(jm({ roundNumber: 2, lastBatchJokes: null })).text).not.toContain('Big batches');
  });

  it('rule 4: Marketing\'s desk is empty', () => {
    expect(jokeMakerNextStep(jm({ marketingBacklog: 0 }))).toEqual({
      text: "Marketing's desk is empty — send your next batch of 5.", tone: 'info',
    });
    expect(jokeMakerNextStep(jm({ roundNumber: 2, marketingBacklog: 0 })).text)
      .toBe("Marketing's desk is empty — send a small batch now.");
    expect(jokeMakerNextStep(jm({ marketingBacklog: null, lastSentAt: NOW })).text)
      .toBe('Keep writing — every batch is another chance to sell.');
  });

  it('rule 5: no batch sent for 90 s', () => {
    expect(jokeMakerNextStep(jm({ lastSentAt: NOW - s(90) }))).toEqual({
      text: 'No batch sent in 90 s — keep the line moving.', tone: 'warn',
    });
    expect(jokeMakerNextStep(jm({ lastSentAt: NOW - s(89) })).tone).toBe('info');
    expect(jokeMakerNextStep(jm({ lastSentAt: null })).tone).toBe('info');
  });

  it('rule 6: otherwise', () => {
    expect(jokeMakerNextStep(jm())).toEqual({ text: 'Keep writing — every batch is another chance to sell.', tone: 'info' });
  });

  it('the first matching rule wins', () => {
    const all = jm({
      roundNumber: 2, latestNote: { text: 'Go short', batchSentAt: NOW - s(5) }, lastBatchJokes: 10,
      marketingBacklog: 0, lastSentAt: NOW - s(200),
    });
    expect(jokeMakerNextStep(all).text).toContain('Marketing says');
    expect(jokeMakerNextStep({ ...all, latestNote: null }).text).toContain('Big batches');
    expect(jokeMakerNextStep({ ...all, latestNote: null, lastBatchJokes: 3 }).text).toContain('desk is empty');
    expect(jokeMakerNextStep({ ...all, latestNote: null, lastBatchJokes: 3, marketingBacklog: 2 }).text).toContain('No batch sent');
  });
});

describe('Marketing next step', () => {
  it('rule 1: the round has not started', () => {
    expect(marketingNextStep(mk({ roundActive: false, deskBatchSentAt: NOW - s(300) }))).toEqual({
      text: "Watch the desk — your Joke Maker's first batch is coming.", tone: 'info',
    });
  });

  it('rule 2: a batch on the desk for 45 s or more, priced at the round\'s storage fee', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45) }))).toEqual({
      text: "Batch waiting 45 s — release what's good enough. Storage costs 10¢ a joke each minute.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(44) })).tone).toBe('info');
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(130.9), storageFeePerJokeMinute: 0.25 })).text)
      .toBe("Batch waiting 130 s — release what's good enough. Storage costs 25¢ a joke each minute.");
  });

  it('rule 3: the last decision discarded 60 % or more of a batch', () => {
    expect(marketingNextStep(mk({ lastDecision: { published: 2, discarded: 3 } }))).toEqual({
      text: "You discarded 3 of 5 last time — customers can only buy what's on the shelf.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ lastDecision: { published: 3, discarded: 2 } })).tone).toBe('info');
    expect(marketingNextStep(mk({ lastDecision: { published: 0, discarded: 0 } })).tone).toBe('info');
  });

  it('rule 4: the top Fix next item', () => {
    expect(marketingNextStep(mk({ topFixNext: 'Wordplay' }))).toEqual({
      text: 'Tell your Joke Maker: fix Wordplay next.', tone: 'info',
    });
  });

  it('rule 5: the desk is empty', () => {
    expect(marketingNextStep(mk({ deskEmpty: true }))).toEqual({
      text: 'Desk is clear — nudge your Joke Maker to send the next batch.', tone: 'info',
    });
    expect(marketingNextStep(mk({ deskEmpty: null })).text)
      .toBe("Release what's good enough, then tell your Joke Maker what to change.");
  });

  it('rule 6: otherwise', () => {
    expect(marketingNextStep(mk())).toEqual({
      text: "Release what's good enough, then tell your Joke Maker what to change.", tone: 'info',
    });
  });

  it('the first matching rule wins', () => {
    const all = mk({ deskBatchSentAt: NOW - s(60), lastDecision: { published: 1, discarded: 4 }, topFixNext: 'Topic', deskEmpty: true });
    expect(marketingNextStep(all).text).toContain('Batch waiting 60 s');
    expect(marketingNextStep({ ...all, deskBatchSentAt: NOW - s(10) }).text).toContain('You discarded 4 of 5');
    expect(marketingNextStep({ ...all, deskBatchSentAt: null, lastDecision: null }).text).toContain('fix Topic next');
    expect(marketingNextStep({ ...all, deskBatchSentAt: null, lastDecision: null, topFixNext: null }).text).toContain('Desk is clear');
  });
});

/* ---- Inputs built from the screens' data ---- */

const joke = (id: number, published?: boolean): Joke => ({
  joke_id: id, joke_text: `joke ${id}`, id: String(id), content: `joke ${id}`, is_published: published,
});
const batch = (id: number, over: Partial<Batch>): Batch => ({
  batch_id: id, round_id: 1, team_id: 1, status: 'SUBMITTED', jokes: [], id: String(id), team: '1', round: 1, ...over,
});

describe('inputs from the screens\' data', () => {
  it('the Joke Maker reads its latest sent batch and the latest processed batch\'s note', () => {
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(300), ratedAt: NOW - s(250), jokes: [joke(1, true)], marketing_note: 'old note' }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(100), ratedAt: NOW - s(40), jokes: [joke(2, true)], marketing_note: 'Go shorter' }),
      batch(3, { status: 'SUBMITTED', submittedAt: NOW - s(20), jokes: [] }),
    ];
    const input = jokeMakerInputFrom({ now: NOW, roundActive: true, round: 2, teamSummary: { unprocessed_batches: 1 }, batches });
    expect(input).toEqual({
      now: NOW, roundActive: true, roundNumber: 2, marketingBacklog: 1, lastSentAt: NOW - s(20), lastBatchJokes: null,
      latestNote: { text: 'Go shorter', batchSentAt: NOW - s(100) },
    });
  });

  it('the Joke Maker sees no note when the latest processed batch has none, and no backlog before the summary loads', () => {
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(100), ratedAt: NOW - s(90), jokes: [joke(1)], marketing_note: 'Go shorter' }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(50), ratedAt: NOW - s(30), jokes: [joke(2), joke(3)], marketing_note: null }),
    ];
    const input = jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: null, batches });
    expect(input.latestNote).toBeNull();
    expect(input.marketingBacklog).toBeNull();
    expect(input.lastBatchJokes).toBe(2);
    expect(jokeMakerInputFrom({ now: NOW, roundActive: true, round: 1, teamSummary: null, batches: [] }))
      .toMatchObject({ lastSentAt: null, lastBatchJokes: null, latestNote: null });
  });

  it('Marketing reads the desk, the last decision and the top Fix next item', () => {
    const rows: FeedbackRow[] = [
      { joke_id: 1, joke_title: 'a', was_bought: false, good: [], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }] },
      { joke_id: 2, joke_title: 'b', was_bought: false, good: [{ id: 'TOPIC', label: 'Topic' }], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }] },
    ];
    const batches = [
      batch(1, { status: 'PROCESSED', submittedAt: NOW - s(400), ratedAt: NOW - s(300), jokes: [joke(1, true), joke(2, true)] }),
      batch(2, { status: 'PROCESSED', submittedAt: NOW - s(200), ratedAt: NOW - s(100), jokes: [joke(3, true), joke(4, false), joke(5, false)] }),
    ];
    const desk = new Date(NOW - s(50)).toISOString();
    const input = marketingInputFrom({
      now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, teamSummary: { unprocessed_batches: 1 },
      qcQueue: { batch: { submitted_at: desk } }, batches, feedbackRows: rows,
    });
    expect(input).toEqual({
      now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, deskBatchSentAt: NOW - s(50), deskEmpty: false,
      lastDecision: { published: 1, discarded: 2 }, topFixNext: 'Wordplay',
    });
  });

  it('Marketing\'s desk is empty only when nothing is claimed and nothing waits; unknown before the summary loads', () => {
    const base = { now: NOW, roundActive: true, storageFeePerJokeMinute: 0.1, batches: [], feedbackRows: [] };
    expect(marketingInputFrom({ ...base, teamSummary: { unprocessed_batches: 0 }, qcQueue: null }).deskEmpty).toBe(true);
    expect(marketingInputFrom({ ...base, teamSummary: { unprocessed_batches: 2 }, qcQueue: null }).deskEmpty).toBe(false);
    expect(marketingInputFrom({ ...base, teamSummary: null, qcQueue: null })).toMatchObject({
      deskEmpty: null, deskBatchSentAt: null, lastDecision: null, topFixNext: null,
    });
  });
});
```

Create `components/NextStep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextStepLine, NextStepLive } from './NextStep';

describe('NextStepLine', () => {
  it('labels the sentence "Next step" in a blue bar with an arrow', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'Keep writing — every batch is another chance to sell.', tone: 'info' },
    }));
    expect(out).toContain('Next step');
    expect(out).toContain('Keep writing — every batch is another chance to sell.');
    expect(out).toContain('bg-sky-50');
    expect(out).not.toContain('bg-amber-50');
    expect(out).toContain('<svg');
    expect(out).toContain('role="status"');
  });

  it('turns amber for a warning', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'No batch sent in 90 s — keep the line moving.', tone: 'warn' },
    }));
    expect(out).toContain('bg-amber-50');
    expect(out).not.toContain('bg-sky-50');
  });

  it('shows text as text, never as markup', () => {
    const out = renderToStaticMarkup(createElement(NextStepLine, {
      step: { text: 'Marketing says: “<b>hi</b>” — use it in your next batch.', tone: 'info' },
    }));
    expect(out).not.toContain('<b>hi</b>');
    expect(out).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });
});

describe('NextStepLive', () => {
  it('asks for the sentence at the current time', () => {
    const asked: number[] = [];
    const before = Date.now();
    const out = renderToStaticMarkup(createElement(NextStepLive, {
      step: (now: number) => { asked.push(now); return { text: 'Desk is clear — nudge your Joke Maker to send the next batch.', tone: 'info' }; },
    }));
    expect(out).toContain('Desk is clear');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeGreaterThanOrEqual(before);
  });
});
```

Create `views/nextStep.render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import JokeMaker from './JokeMaker';
import QualityControl from './QualityControl';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role } from '../types';

const summary = {
  team: { id: 1, name: 'Team 1' }, round_id: 1, rank: 1, points: 0, total_sales: 0,
  batches_created: 0, batches_processed: 0, published_jokes: 0, unprocessed_batches: 0,
};

describe('the Next step line on the student screens', () => {
  it('sits under the Joke Maker\'s stat tiles, above Jokes by stage', () => {
    const out = renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), teamSummary: summary });
    const line = out.indexOf('Next step');
    expect(line).toBeGreaterThan(out.indexOf('Content Waste'));
    expect(line).toBeLessThan(out.indexOf('Jokes by stage'));
    expect(out).toContain("Marketing&#x27;s desk is empty — send your next batch of 5.");
  });

  it('tells a Joke Maker to get ready before the round starts', () => {
    const out = renderWithGame(JokeMaker, {
      user: testUser(Role.JOKE_MAKER), config: { ...TEST_CONFIG, isActive: false }, teamSummary: summary,
    });
    expect(out).toContain('Get your AI tool ready — the round starts soon.');
  });

  it('renders on both screens before anything has loaded (no summary, no batches, no desk)', () => {
    for (const [view, role] of [[JokeMaker, Role.JOKE_MAKER], [QualityControl, Role.QUALITY_CONTROL]] as const) {
      const out = renderWithGame(view, { user: testUser(role), teamSummary: null, qcQueue: null, batches: [] });
      expect(out).toContain('Next step');
    }
  });

  it('sits under Marketing\'s stat tiles and prices a waiting batch at the round\'s storage fee', () => {
    const sent = new Date(Date.now() - 50_000).toISOString();
    const out = renderWithGame(QualityControl, {
      user: testUser(Role.QUALITY_CONTROL),
      teamSummary: { ...summary, unprocessed_batches: 1 },
      qcQueue: { batch: { batch_id: 9, round_id: 1, team_id: 1, submitted_at: sent, raw_text: 'one\n\ntwo' }, jokes: [], queue_size: 1 },
    });
    const line = out.indexOf('Next step');
    expect(line).toBeGreaterThan(out.indexOf('Hosting fees'));
    expect(line).toBeLessThan(out.indexOf('The 12 criteria customers judge'));
    expect(out).toMatch(/Batch waiting (5\d) s — release what&#x27;s good enough\. Storage costs 10¢ a joke each minute\./);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/nextStep.test.ts components/NextStep.test.ts views/nextStep.render.test.ts`
Expected: FAIL — `Error: Failed to load url ./nextStep` and `Error: Failed to load url ./NextStep`; the screens render no "Next step".

- [ ] **Step 3: The rules**

Create `services/nextStep.ts`:

```ts
/* The "Next step" line on the two student screens: one sentence that tells
   the seat what to do now. Pure: the screen passes in what it already loads,
   time included (`now`), and the first rule that matches wins
   (docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §6).
   An input the screen does not have yet is null, and the rule that needs it
   is skipped. */
import type { Batch } from '../types';
import type { FeedbackRow } from '../views/feedback';
import { summarizeFeedback } from './feedbackSummary';
import { fmtPerMinute } from './leanMode';

export type NextStepTone = 'info' | 'warn';
export interface NextStep { text: string; tone: NextStepTone }

export interface JokeMakerStepInput {
  now: number;
  roundActive: boolean;
  roundNumber: 1 | 2;
  /** Batches waiting on Marketing's desk (the team summary's unprocessed_batches); null = unknown. */
  marketingBacklog: number | null;
  /** ms epoch of the team's latest sent batch; null = none sent (or unknown). */
  lastSentAt: number | null;
  /** Joke count of the latest sent batch; null while it is unsplit (or unknown). */
  lastBatchJokes: number | null;
  /** The latest processed batch's note from Marketing, when it has one. */
  latestNote: { text: string; batchSentAt: number } | null;
}

export interface MarketingStepInput {
  now: number;
  roundActive: boolean;
  /** The round's storage fee, per joke per minute. */
  storageFeePerJokeMinute: number;
  /** ms epoch the batch on the desk was sent; null = no batch on the desk (or unknown). */
  deskBatchSentAt: number | null;
  /** True when no batch is waiting at all; null = unknown. */
  deskEmpty: boolean | null;
  /** The last released or discarded batch: how many jokes went out and how many were dropped. */
  lastDecision: { published: number; discarded: number } | null;
  /** The top "Fix next" criterion of the customer feedback (summarizeFeedback). */
  topFixNext: string | null;
}

/** A note counts as fresh while its batch was sent at most this long ago. */
export const NOTE_FRESH_MS = 120_000;
/** Round 2: a last batch of at least this many jokes earns the small-batch hint. */
export const BIG_BATCH_JOKES = 6;
/** The Joke Maker is idle once this long has passed since the last batch. */
export const JM_IDLE_MS = 90_000;
/** A batch on Marketing's desk this long (seconds) is waiting too long. */
export const DESK_WAIT_S = 45;
/** Discarding at least this share of a batch earns the empty-shelf warning. */
export const DISCARD_WARN_SHARE = 0.6;
/** Notes are quoted up to this many characters. */
export const NOTE_QUOTE_CHARS = 80;

const info = (text: string): NextStep => ({ text, tone: 'info' });
const warn = (text: string): NextStep => ({ text, tone: 'warn' });

/** Marketing's note on one line: whitespace runs collapsed, cut at 80 characters with "…". */
export function quoteNote(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > NOTE_QUOTE_CHARS ? `${chars.slice(0, NOTE_QUOTE_CHARS).join('')}…` : flat;
}

export function jokeMakerNextStep(i: JokeMakerStepInput): NextStep {
  if (!i.roundActive) return info('Get your AI tool ready — the round starts soon.');
  const note = i.latestNote?.text.trim() ? i.latestNote : null;
  if (note && i.now - note.batchSentAt <= NOTE_FRESH_MS) {
    return info(`Marketing says: “${quoteNote(note.text)}” — use it in your next batch.`);
  }
  if (i.roundNumber === 2 && i.lastBatchJokes != null && i.lastBatchJokes >= BIG_BATCH_JOKES) {
    return warn('Big batches wait longer for feedback — try 2 or 3 jokes next.');
  }
  if (i.marketingBacklog === 0) {
    return info(i.roundNumber === 1
      ? "Marketing's desk is empty — send your next batch of 5."
      : "Marketing's desk is empty — send a small batch now.");
  }
  if (i.lastSentAt != null && i.now - i.lastSentAt >= JM_IDLE_MS) {
    return warn('No batch sent in 90 s — keep the line moving.');
  }
  return info('Keep writing — every batch is another chance to sell.');
}

export function marketingNextStep(i: MarketingStepInput): NextStep {
  if (!i.roundActive) return info("Watch the desk — your Joke Maker's first batch is coming.");
  if (i.deskBatchSentAt != null) {
    const waited = Math.floor((i.now - i.deskBatchSentAt) / 1000);
    if (waited >= DESK_WAIT_S) {
      return warn(`Batch waiting ${waited} s — release what's good enough. Storage costs ${fmtPerMinute(i.storageFeePerJokeMinute)}.`);
    }
  }
  if (i.lastDecision) {
    const { published, discarded } = i.lastDecision;
    const total = published + discarded;
    if (total > 0 && discarded / total >= DISCARD_WARN_SHARE) {
      return warn(`You discarded ${discarded} of ${total} last time — customers can only buy what's on the shelf.`);
    }
  }
  if (i.topFixNext) return info(`Tell your Joke Maker: fix ${i.topFixNext} next.`);
  if (i.deskEmpty === true) return info('Desk is clear — nudge your Joke Maker to send the next batch.');
  return info("Release what's good enough, then tell your Joke Maker what to change.");
}

/* ---- Inputs from what the screens already load ------------------------- */

const isProcessed = (b: Batch) => b.status === 'PROCESSED' || b.status === 'RATED';

/** The batch with the latest value of `at`; batches without it are skipped, ties go to the higher id. */
function latestBy(batches: readonly Batch[], at: (b: Batch) => number | undefined): Batch | null {
  let best: Batch | null = null;
  let bestAt = -Infinity;
  for (const b of batches) {
    const t = at(b);
    if (t == null || !Number.isFinite(t)) continue;
    if (t > bestAt || (t === bestAt && best != null && b.batch_id > best.batch_id)) {
      best = b;
      bestAt = t;
    }
  }
  return best;
}

const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The Joke Maker's inputs: its own team's batches and team summary. */
export function jokeMakerInputFrom(a: {
  now: number;
  roundActive: boolean;
  round: number;
  teamSummary: { unprocessed_batches?: number } | null;
  batches: readonly Batch[];
}): JokeMakerStepInput {
  const lastSent = latestBy(a.batches, b => b.submittedAt);
  const lastProcessed = latestBy(a.batches.filter(isProcessed), b => b.ratedAt ?? b.submittedAt);
  const noteText = lastProcessed?.marketing_note ?? null;
  return {
    now: a.now,
    roundActive: a.roundActive,
    roundNumber: a.round === 2 ? 2 : 1,
    marketingBacklog: finiteOrNull(a.teamSummary?.unprocessed_batches),
    lastSentAt: lastSent?.submittedAt ?? null,
    lastBatchJokes: lastSent && lastSent.jokes.length > 0 ? lastSent.jokes.length : null,
    latestNote: noteText && noteText.trim() && lastProcessed?.submittedAt != null
      ? { text: noteText, batchSentAt: lastProcessed.submittedAt }
      : null,
  };
}

/** Marketing's inputs: the desk (claimed batch), the team's batches, summary and feedback. */
export function marketingInputFrom(a: {
  now: number;
  roundActive: boolean;
  storageFeePerJokeMinute: number;
  teamSummary: { unprocessed_batches?: number } | null;
  qcQueue: { batch?: { submitted_at?: string } | null } | null;
  batches: readonly Batch[];
  feedbackRows: readonly FeedbackRow[];
}): MarketingStepInput {
  const desk = a.qcQueue?.batch ?? null;
  const sentAt = desk?.submitted_at ? Date.parse(desk.submitted_at) : NaN;
  const backlog = finiteOrNull(a.teamSummary?.unprocessed_batches);
  const decided = latestBy(a.batches.filter(b => isProcessed(b) && b.jokes.length > 0), b => b.ratedAt ?? b.submittedAt);
  const published = decided ? decided.jokes.filter(j => j.is_published === true).length : 0;
  return {
    now: a.now,
    roundActive: a.roundActive,
    storageFeePerJokeMinute: a.storageFeePerJokeMinute,
    deskBatchSentAt: Number.isFinite(sentAt) ? sentAt : null,
    deskEmpty: desk ? false : backlog == null ? null : backlog === 0,
    lastDecision: decided ? { published, discarded: decided.jokes.length - published } : null,
    topFixNext: summarizeFeedback(a.feedbackRows).fix[0]?.label ?? null,
  };
}
```

- [ ] **Step 4: The line**

Create `components/NextStep.tsx`:

```tsx
/* The "Next step" line under the stat tiles of both student screens: a small
   coloured bar with an arrow, the label "Next step" and one sentence from
   services/nextStep.ts. Amber for a warning, blue otherwise. NextStepLive
   keeps its own one-second clock, so only the line re-renders as time
   passes; the screen's polls re-render it with fresh inputs. */
import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { NextStep } from '../services/nextStep';

export const NextStepLine: React.FC<{ step: NextStep }> = ({ step }) => {
  const warn = step.tone === 'warn';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        warn ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-sky-50 border-sky-200 text-sky-900'
      }`}
    >
      <ArrowRight size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide">Next step</span>
        {step.text}
      </span>
    </div>
  );
};

/** Date.now(), refreshed every `intervalMs` while mounted. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** The line, recomputed every second: `step` maps the current time to the sentence. */
export const NextStepLive: React.FC<{ step: (now: number) => NextStep }> = ({ step }) => {
  const now = useNow();
  return <NextStepLine step={step(now)} />;
};
```

- [ ] **Step 5: Wire it under the stat tiles**

In `views/JokeMaker.tsx`, replace:

```tsx
import { MarketingNoteCallout, MarketingNoteIcon, marketingNoteOf } from '../components/MarketingNote';
```

with:

```tsx
import { MarketingNoteCallout, MarketingNoteIcon, marketingNoteOf } from '../components/MarketingNote';
import { NextStepLive } from '../components/NextStep';
import { jokeMakerInputFrom, jokeMakerNextStep } from '../services/nextStep';
```

In `views/JokeMaker.tsx`, replace:

```tsx
            <StatBox label="Content Waste" value={waste} tone="rose" />
          </div>
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
```

with:

```tsx
            <StatBox label="Content Waste" value={waste} tone="rose" />
          </div>
          <NextStepLive
            step={now => jokeMakerNextStep(jokeMakerInputFrom({
              now, roundActive: config.isActive, round: config.round, teamSummary, batches: myBatches,
            }))}
          />
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
```

In `views/QualityControl.tsx`, replace:

```tsx
import { releaseOutcome } from './marketingRelease';
```

with:

```tsx
import { releaseOutcome } from './marketingRelease';
import { NextStepLive } from '../components/NextStep';
import { marketingInputFrom, marketingNextStep } from '../services/nextStep';
```

In `views/QualityControl.tsx`, replace:

```tsx
                <StatBox label="Publish → first sale" value={fmtSeconds(toFirstSale)} tone="sky" />
              </>
            )}
          </div>
```

with:

```tsx
                <StatBox label="Publish → first sale" value={fmtSeconds(toFirstSale)} tone="sky" />
              </>
            )}
          </div>
          <NextStepLive
            step={now => marketingNextStep(marketingInputFrom({
              now, roundActive: config.isActive, storageFeePerJokeMinute: config.storageFeePerJokeMinute,
              teamSummary, qcQueue, batches: batches.filter(b => b.team === user?.team), feedbackRows,
            }))}
          />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/nextStep.test.ts components/NextStep.test.ts views/nextStep.render.test.ts`
Expected: PASS — 3 files, 28 tests.

- [ ] **Step 7: Full checks**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent, every test file passes, `✓ built`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add \
  services/nextStep.ts services/nextStep.test.ts components/NextStep.tsx components/NextStep.test.ts \
  views/JokeMaker.tsx views/QualityControl.tsx views/nextStep.render.test.ts && git commit -q -F - <<'EOF'
feat(coach): Next step line for the Joke Maker and Marketing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 6: Bots, the pilot script and the instructor guide

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Modify: `services/bots/personas.ts` (`Persona.round2BatchSize`, the four personas, `JOKE_CAP_PER_ROUND`), `services/bots/engine.ts` (imports, the cap, the batch size), `services/shared/client.ts` (`instructorLeanCharts`), `services/leanMode.ts` (remove `LEAN_CLASS_PRESET`)
- Replace: `scripts/pilot/report.ts`, `scripts/pilot/lean-pilot.mts`, `docs/lean-market-mode.md`
- Test: modify `services/bots/personas.test.ts`, `services/bots/engine.test.ts`; replace `scripts/pilot/report.test.ts`

**Interfaces:**
- Consumes: Task 1's Round 2 `batch_size` 10 and fee keys on `ConfigRequest`; Task 2's `shipping_cost`/`storage_cost`/`hosting_cost`; `leanFeesOf` (Task 3B); the lean charts route; `BotEngine`, `CAP_REACHED`, `realDelay`, `personaSequence`, `createClient`.
- Produces:
  ```ts
  // services/bots/personas.ts
  interface Persona { readonly round2BatchSize: number } // replaces the optional leanBatchSize
  // CAREFUL 5, BALANCED 5, SPRAY 10, LEARNER 3
  export const JOKE_CAP_PER_ROUND = 40; // replaces BATCH_CAP_PER_ROUND (8); jokeCapFor() is removed
  // services/shared/client.ts
  instructorLeanCharts(roundId: number, signal?: AbortSignal): Promise<LeanChartsResponse>
  // scripts/pilot/report.ts
  export type PilotRound = 1 | 2;
  export interface TeamRow { teamId; persona; revenue; shipping; storage; hosting; listing; discard; profit; batches: number;
    meanBatchSize: number | null; sendToFirstSaleS: number | null }
  export interface RunResult { round: PilotRound; durationS: number; calls: number; rows: TeamRow[] }
  export interface PersonaSummary { n; revenue; shipping; storage; hosting; listing; discard; profit; batches: number;
    meanBatchSize: number | null; sendToFirstSaleS: number | null; feesPct: number | null }
  export function feesOf(r): number                       // shipping + storage + hosting + listing + discard
  export function summarise(runs): Record<PilotRound, Record<string, PersonaSummary>>
  export function spearman(xs, ys): number | null
  export interface Check { name: string; pass: boolean; detail: string }
  export function successChecks(runs): Check[]            // the three spec §7 checks, in order
  export function teamRowFrom(leaderboardRow, persona, prices, chartBatches): TeamRow
  export interface PilotFees { shippingSmall; shippingStandard; shippingLarge; storage; hosting: number }
  export const SPEC_FEES: PilotFees                       // 1 / 2 / 3, 0.10, 0.05
  export interface Tuning { fees; window: number; preferenceBase?; customers?; budget?; tag?; overrides: string[] }
  export function parseTuning(env): Tuning                // PILOT_SHIP_SMALL/STANDARD/LARGE, PILOT_STORAGE, PILOT_HOSTING, PILOT_WINDOW (90), …
  export function pilotConfig(t: Tuning, speed: number, round: PilotRound): ConfigRequest // storage/hosting × speed, shipping unscaled
  export function settingsLines(t: Tuning, speed: number, counts: string): string[]
  export function isLocalUrl(url: string): boolean
  export interface PilotSidecar { date; settings; results: RunResult[]; errors; tag? }
  export function markdown(runs, date, settings?, errors?, tag?): string
  ```

- [ ] **Step 1: Write the failing bot tests**

In `services/bots/personas.test.ts`, replace:

```ts
import {
  PERSONAS, PERSONA_ORDER, chooseWithMemory, choosePublished, jitter, personaSequence, publishCount, type Persona,
} from './personas';
```

with:

```ts
import {
  JOKE_CAP_PER_ROUND, PERSONAS, PERSONA_ORDER, chooseWithMemory, choosePublished, jitter, personaSequence, publishCount,
  type Persona,
} from './personas';
```

In `services/bots/personas.test.ts`, replace:

```ts
describe('Learner persona', () => {
  it('is in the order and publishes 2 of 3 by default', () => {
    expect(PERSONA_ORDER).toContain('LEARNER');
    expect(PERSONAS.LEARNER.leanBatchSize).toBe(3);
```

with:

```ts
describe('round 2 batch sizes and the joke cap', () => {
  it('sends Spray 10, Balanced 5, Careful 5 and Learner 3 jokes a batch from round 2', () => {
    expect(Object.fromEntries(PERSONA_ORDER.map(id => [id, PERSONAS[id].round2BatchSize]))).toEqual({
      CAREFUL: 5, BALANCED: 5, SPRAY: 10, LEARNER: 3,
    });
  });

  it('caps every round at 40 jokes', () => {
    expect(JOKE_CAP_PER_ROUND).toBe(40);
  });
});

describe('Learner persona', () => {
  it('is in the order and publishes 2 of 3 by default', () => {
    expect(PERSONA_ORDER).toContain('LEARNER');
    expect(PERSONAS.LEARNER.round2BatchSize).toBe(3);
```

In `services/bots/engine.test.ts`, replace:

```ts
import { BotEngine, CAP_REACHED, SEAT_CHECK_MS, WIP_WAIT_ACTIVITY, fitPieces, jokeCapFor, splitBlob, titleOf, wallClockSteps } from './engine';
```

with:

```ts
import { BotEngine, CAP_REACHED, SEAT_CHECK_MS, WIP_WAIT_ACTIVITY, fitPieces, splitBlob, titleOf, wallClockSteps } from './engine';
```

In `services/bots/engine.test.ts`, replace:

```ts
import { BATCH_CAP_PER_ROUND } from './personas';
```

with:

```ts
import { JOKE_CAP_PER_ROUND } from './personas';

/** Round 1 batches of 5 reach the 40-joke cap after exactly this many batches. */
const ROUND1_BATCHES_AT_CAP = JOKE_CAP_PER_ROUND / 5;
```

In `services/bots/engine.test.ts`, replace:

```ts
    expect(world.batches.filter(b => b.teamId === team)).toHaveLength(BATCH_CAP_PER_ROUND);
  });

  it('caps full-batch personas at exactly BATCH_CAP_PER_ROUND batches, as the old batch cap did', async () => {
```

with:

```ts
    expect(world.batches.filter(b => b.teamId === team)).toHaveLength(ROUND1_BATCHES_AT_CAP);
  });

  it('caps full-batch personas at exactly 8 batches of 5 in round 1', async () => {
```

In `services/bots/engine.test.ts`, replace:

```ts
    expect(jokeCapFor(world.round.batch_size)).toBe(BATCH_CAP_PER_ROUND * 5);
    for (let i = 1; i <= personas.length; i++) {
      const team = teamOf(world, botName(i, 'A'));
      expect(world.batches.filter(b => b.teamId === team)).toHaveLength(BATCH_CAP_PER_ROUND);
    }
    expect(activity).toBe(`done — ${BATCH_CAP_PER_ROUND * 5}-joke ${CAP_REACHED}`);
```

with:

```ts
    expect(ROUND1_BATCHES_AT_CAP).toBe(8);
    for (let i = 1; i <= personas.length; i++) {
      const team = teamOf(world, botName(i, 'A'));
      expect(world.batches.filter(b => b.teamId === team)).toHaveLength(ROUND1_BATCHES_AT_CAP);
    }
    expect(activity).toBe(`done — 40-joke ${CAP_REACHED}`);
```

In `services/bots/engine.test.ts`, replace:

```ts
describe('Learner bot', () => {
```

with:

```ts
describe('Round 2 batch sizes and the Learner bot', () => {
```

In `services/bots/engine.test.ts`, replace:

```ts
  it('sends more than BATCH_CAP_PER_ROUND smaller batches in round 2, stopping at the joke cap', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round.round_number = 2;
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }] }));
    await until(() => engine.status().teams[0].jm.activity.includes(CAP_REACHED), 'the joke cap');
    engine.stop();
    const cap = jokeCapFor(world.round.batch_size);
    const jokes = submits.reduce((n, s) => n + s.jokes, 0);
    expect(submits.length).toBeGreaterThan(BATCH_CAP_PER_ROUND);
```

with:

```ts
  it('sends Round 2 batches of 10 (Spray), 5 (Balanced, Careful) and 3 (Learner) when the round allows 10', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round = { ...world.round, round_number: 2, batch_size: 10, max_batch_size: 10 };
    const personas = ['SPRAY', 'BALANCED', 'CAREFUL', 'LEARNER'] as const;
    await engine.start(options({ teams: personas.map((persona, i) => ({ index: i + 1, persona })) }));
    const teams = personas.map((_, i) => teamOf(world, botName(i + 1, 'A')));
    await until(() => teams.every(t => submits.some(s => s.teamId === t)), 'a batch from every team');
    engine.stop();
    expect(teams.map(t => submits.find(s => s.teamId === t)?.jokes)).toEqual([10, 5, 5, 3]);
  });

  it('never sends a Round 2 batch above the round\'s batch_size', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round = { ...world.round, round_number: 2, batch_size: 4, max_batch_size: 4 };
    const personas = ['SPRAY', 'BALANCED', 'LEARNER'] as const;
    await engine.start(options({ teams: personas.map((persona, i) => ({ index: i + 1, persona })) }));
    const teams = personas.map((_, i) => teamOf(world, botName(i + 1, 'A')));
    await until(() => teams.every(t => submits.some(s => s.teamId === t)), 'a batch from every team');
    engine.stop();
    expect(teams.map(t => submits.find(s => s.teamId === t)?.jokes)).toEqual([4, 4, 3]);
  });

  it('caps a Round 2 Spray team at 40 jokes, 4 batches of 10', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round = { ...world.round, round_number: 2, batch_size: 10, max_batch_size: 10 };
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }] }));
    await until(() => engine.status().teams[0].jm.activity.includes(CAP_REACHED), 'the joke cap');
    const activity = engine.status().teams[0].jm.activity;
    engine.stop();
    expect(submits.map(s => s.jokes)).toEqual([10, 10, 10, 10]);
    expect(activity).toBe(`done — 40-joke ${CAP_REACHED}`);
  });

  it('sends more, smaller batches in round 2, stopping at the 40-joke cap', async () => {
    const submits: Submit[] = [];
    const { world, engine } = setup([], { wrapApi: recordSubmits(submits) });
    world.round.round_number = 2;
    await engine.start(options({ teams: [{ index: 1, persona: 'LEARNER' }] }));
    await until(() => engine.status().teams[0].jm.activity.includes(CAP_REACHED), 'the joke cap');
    engine.stop();
    const cap = JOKE_CAP_PER_ROUND;
    const jokes = submits.reduce((n, s) => n + s.jokes, 0);
    expect(submits.length).toBeGreaterThan(ROUND1_BATCHES_AT_CAP);
```

- [ ] **Step 2: Write the failing report tests**

Replace the whole of `scripts/pilot/report.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
  SPEC_FEES, feesOf, isLocalUrl, markdown, parseTuning, pilotConfig, settingsLines, spearman, successChecks, summarise,
  teamRowFrom, type RunResult, type TeamRow,
} from './report';

const row = (persona: string, over: Partial<TeamRow> = {}, teamId = 1): TeamRow => ({
  teamId, persona, revenue: 40, shipping: 16, storage: 2, hosting: 1, listing: 1, discard: 0, profit: 20,
  batches: 8, meanBatchSize: 5, sendToFirstSaleS: 120, ...over,
});
const run = (round: 1 | 2, rows: TeamRow[]): RunResult => ({ round, durationS: 100, calls: 30, rows });

/** A class where every check passes: Spray pays 45 % in fees, the Learner sells soonest, holding never pays. */
const passing = (): RunResult[] => [
  run(1, [
    row('SPRAY', { revenue: 40, shipping: 16, storage: 1, hosting: 0.5, listing: 0.5, profit: 20, batches: 8 }, 1),
    row('CAREFUL', { revenue: 20, shipping: 8, storage: 1, hosting: 1, listing: 0.2, profit: 9.8, batches: 4 }, 2),
    row('LEARNER', { revenue: 30, shipping: 12, storage: 0.5, hosting: 1, listing: 0.3, profit: 16.2, batches: 6 }, 3),
  ]),
  run(2, [
    row('SPRAY', { revenue: 30, shipping: 12, storage: 6, hosting: 2, listing: 4, profit: 6, batches: 4, meanBatchSize: 10, sendToFirstSaleS: 150 }, 1),
    row('CAREFUL', { revenue: 25, shipping: 8, storage: 1, hosting: 1, listing: 1, profit: 14, batches: 4, meanBatchSize: 5, sendToFirstSaleS: 120 }, 2),
    row('LEARNER', { revenue: 35, shipping: 13, storage: 0.2, hosting: 0.5, listing: 1, profit: 20.3, batches: 13, meanBatchSize: 3, sendToFirstSaleS: 60 }, 3),
  ]),
];

describe('pilot summary', () => {
  it('means each column per persona and round, with fees as a share of revenue', () => {
    const s = summarise([run(1, [row('SPRAY', {}, 1), row('SPRAY', { revenue: 60, profit: 40, sendToFirstSaleS: null }, 2)])]);
    expect(s[1].SPRAY.n).toBe(2);
    expect(s[1].SPRAY.revenue).toBe(50);
    expect(s[1].SPRAY.profit).toBe(30);
    expect(s[1].SPRAY.sendToFirstSaleS).toBe(120);
    expect(s[1].SPRAY.feesPct).toBeCloseTo((20 / 50) * 100);
    expect(s[2]).toEqual({});
    expect(feesOf(row('X'))).toBe(20);
  });

  it('has no fees share without revenue', () => {
    expect(summarise([run(1, [row('SPRAY', { revenue: 0 })])])[1].SPRAY.feesPct).toBeNull();
  });

  it('ranks with ties averaged', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2], [3, 3, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe('a team row from the backend', () => {
  it('prices revenue, listing and discard, reads the three fees, and averages batch size and time to first sale', () => {
    const lean = {
      batches_submitted: 3, shipping_cost: 5, storage_cost: 1.25, hosting_cost: 0.5, setup_cost: 5, carrying_cost: 1.75,
      avg_submit_to_publish_s: 30, avg_publish_to_first_sale_s: 20,
      batch_series: [
        { seq: 1, submitted_at: '', jokes: 3, published: 2, sold: 1 },
        { seq: 2, submitted_at: '', jokes: 5, published: 4, sold: 0 },
        { seq: 3, submitted_at: '', jokes: 0, published: 0, sold: 0 },
      ],
    };
    const r = teamRowFrom(
      { team: { id: 4 }, total_sales: 9, published_jokes: 6, discarded_jokes: 2, profit: 0.1, lean },
      'LEARNER', { market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0.01 },
      [{ first_sale_s: 40 }, { first_sale_s: null }, { first_sale_s: 80 }],
    );
    expect(r).toMatchObject({
      teamId: 4, persona: 'LEARNER', revenue: 9, shipping: 5, storage: 1.25, hosting: 0.5,
      discard: 0.02, profit: 0.1, batches: 3, meanBatchSize: 4, sendToFirstSaleS: 60,
    });
    expect(r.listing).toBeCloseTo(0.6);
  });

  it('has no batch size or first sale when nothing was split or sold', () => {
    const r = teamRowFrom(
      { team: { id: 1 }, total_sales: 0, published_jokes: 0, discarded_jokes: 0, profit: -2, lean: undefined },
      'SPRAY', { market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0.01 }, undefined,
    );
    expect(r).toMatchObject({ shipping: 0, storage: 0, hosting: 0, batches: 0, meanBatchSize: null, sendToFirstSaleS: null });
  });
});

describe('success checks', () => {
  it('passes all three on a class that teaches the lesson', () => {
    const checks = successChecks(passing());
    expect(checks.map(c => c.pass)).toEqual([true, true, true]);
    expect(checks[0].detail).toBe('Spray Round 1 fees are 45.0 % of revenue');
    expect(checks[1].detail).toBe('send → first sale: Learner 60 s, Spray 150 s');
  });

  it('fails the fee check outside 40–60 %, at both ends', () => {
    for (const shipping of [10, 30]) {
      const runs = passing();
      runs[0].rows[0] = { ...runs[0].rows[0], shipping };
      expect(successChecks(runs)[0].pass).toBe(false);
    }
  });

  it('fails the speed check when the Learner is not sooner, or never sold', () => {
    const slower = passing();
    slower[1].rows[2] = { ...slower[1].rows[2], sendToFirstSaleS: 150 };
    expect(successChecks(slower)[1].pass).toBe(false);
    const unsold = passing();
    unsold[1].rows[2] = { ...unsold[1].rows[2], sendToFirstSaleS: null };
    const check = successChecks(unsold)[1];
    expect(check.pass).toBe(false);
    expect(check.detail).toBe('no first sale for Learner in Round 2');
  });

  it('fails the desk check when more storage per batch goes with more profit', () => {
    const runs = passing();
    runs[1].rows = runs[1].rows.map(r => ({ ...r, storage: r.profit * r.batches }));
    const check = successChecks(runs)[2];
    expect(check.pass).toBe(false);
    expect(check.detail).toContain('Round 2: ρ = 1.00');
  });

  it('fails every check when there is nothing to judge', () => {
    expect(successChecks([]).map(c => c.pass)).toEqual([false, false, false]);
  });
});

describe('pilot settings', () => {
  it('defaults to the spec fees, a 90 s window and no overrides', () => {
    const t = parseTuning({});
    expect(t).toEqual({
      fees: SPEC_FEES, window: 90, preferenceBase: undefined, customers: undefined, budget: undefined, tag: undefined, overrides: [],
    });
  });

  it('reads the fee knobs and refuses bad ones', () => {
    const t = parseTuning({ PILOT_SHIP_LARGE: '4', PILOT_STORAGE: '0.2', PILOT_WINDOW: '120', PILOT_TAG: 'storage 20¢' });
    expect(t.fees).toEqual({ ...SPEC_FEES, shippingLarge: 4, storage: 0.2 });
    expect(t.window).toBe(120);
    expect(t.tag).toBe('storage 20¢');
    expect(t.overrides).toEqual(['PILOT_SHIP_LARGE', 'PILOT_STORAGE', 'PILOT_WINDOW']);
    expect(() => parseTuning({ PILOT_STORAGE: '-1' })).toThrow(/PILOT_STORAGE/);
    expect(() => parseTuning({ PILOT_WINDOW: '0' })).toThrow(/PILOT_WINDOW/);
    expect(() => parseTuning({ PILOT_SHIP_SMALL: '3' })).toThrow(/rise with batch size/);
    expect(() => parseTuning({ PILOT_CUSTOMERS: '2.5' })).toThrow(/PILOT_CUSTOMERS/);
  });

  it('scales storage and hosting by the bot speed, never shipping, with batch 5 then up to 10', () => {
    const t = parseTuning({});
    expect(pilotConfig(t, 10, 1)).toEqual({
      market_mode: 'LEAN', arrival_window_seconds: 90, wip_limit: 0, batch_size: 5,
      shipping_fee_small: 1, shipping_fee_standard: 2, shipping_fee_large: 3,
      storage_fee_per_joke_minute: 1, hosting_fee_per_joke_minute: 0.5,
    });
    expect(pilotConfig(t, 10, 2).batch_size).toBe(10);
    expect(pilotConfig({ ...t, customers: 150, preferenceBase: 3 }, 10, 2)).toMatchObject({ customer_count: 150, preference_base: 3 });
    expect(settingsLines(t, 10, '3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER')).toContain(
      'Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.',
    );
  });

  it('treats only localhost, 127.0.0.1 and [::1] as local', () => {
    expect(isLocalUrl('http://localhost:8081')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:8081')).toBe(true);
    expect(isLocalUrl('http://[::1]:8081')).toBe(true);
    expect(isLocalUrl('https://jf.example.azurecontainerapps.io')).toBe(false);
    expect(isLocalUrl('http://localhost.evil.com')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
});

describe('pilot report', () => {
  it('prints the PASS/FAIL checks, a table per round with the spec columns, and the rounds', () => {
    const md = markdown(passing(), '2026-10-12', ['Bots at 10×'], [], 'first fees run');
    expect(md).toContain('# Lean fees pilot — 2026-10-12\n\n_first fees run_');
    expect(md).toContain('- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 45.0 % of revenue');
    expect(md).toContain('## Round 1');
    expect(md).toContain('## Round 2');
    expect(md).toContain(
      '| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |',
    );
    expect(md).toContain('| SPRAY | 1 | $30.00 | $12.00 | $6.00 | $2.00 | $4.00 | **$6.00** | 4.0 | 10.0 | 150 s | 80.0 % |');
    expect(md).toContain('| 2 | LEARNER | $20.30 | 100s | 30 |');
    expect(md).toContain('## Settings\n\n- Bots at 10×');
  });

  it('prints FAIL lines and errors', () => {
    const md = markdown([], '2026-10-12', [], ['Round 2: boom']);
    expect(md).toContain('- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: no Spray Round 1 revenue');
    expect(md).toContain('## Errors\n\n- Round 2: boom');
    expect(md).not.toContain('## Round 1');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/bots/personas.test.ts services/bots/engine.test.ts scripts/pilot/report.test.ts`
Expected: FAIL — `JOKE_CAP_PER_ROUND` and `round2BatchSize` are undefined; in a `batch_size` 10 round Balanced and Careful send batches of 10 instead of 5 and a Spray team sends 8 batches (the old cap is 8 × `batch_size`) instead of 4; `report.ts` has no `successChecks`, `pilotConfig`, `teamRowFrom`, `spearman` or `parseTuning` fee knobs. (`never sends a Round 2 batch above the round's batch_size` already passes: it guards the cap.)

- [ ] **Step 4: Personas and the engine**

In `services/bots/personas.ts`, replace:

```ts
  /**
   * The Joke Maker's batch size from round 2 on, capped at the round's
   * batch_size. Round 1 always uses batch_size, because Marketing must split
   * a round-1 batch into exactly that many jokes (usecase/marketing.go:98-102).
   */
  readonly leanBatchSize?: number;
```

with:

```ts
  /**
   * The Joke Maker's batch size from round 2 on, capped at the round's
   * batch_size (10 after Reset Game). Round 1 always uses batch_size (5),
   * because Marketing must split a round-1 batch into exactly that many jokes
   * (usecase/marketing.go Split).
   */
  readonly round2BatchSize: number;
```

In `services/bots/personas.ts`, replace:

```ts
  CAREFUL: {
    id: 'CAREFUL', label: 'Careful', submitIntervalMs: 150_000, waitForFeedback: true,
    publish: n => Math.min(2, n),
  },
  BALANCED: {
    id: 'BALANCED', label: 'Balanced', submitIntervalMs: 90_000, waitForFeedback: false,
    publish: (n, rand) => Math.min(rand() < 0.5 ? 3 : 4, n),
  },
  SPRAY: {
    id: 'SPRAY', label: 'Spray', submitIntervalMs: 45_000, waitForFeedback: false,
    publish: n => n,
  },
```

with:

```ts
  CAREFUL: {
    id: 'CAREFUL', label: 'Careful', submitIntervalMs: 150_000, waitForFeedback: true,
    publish: n => Math.min(2, n), round2BatchSize: 5,
  },
  BALANCED: {
    id: 'BALANCED', label: 'Balanced', submitIntervalMs: 90_000, waitForFeedback: false,
    publish: (n, rand) => Math.min(rand() < 0.5 ? 3 : 4, n), round2BatchSize: 5,
  },
  /** Spray pushes the biggest batch the round allows: 10 jokes from round 2. */
  SPRAY: {
    id: 'SPRAY', label: 'Spray', submitIntervalMs: 45_000, waitForFeedback: false,
    publish: n => n, round2BatchSize: 10,
  },
```

In `services/bots/personas.ts`, replace:

```ts
    publish: n => Math.min(2, n), leanBatchSize: 3, learns: true,
```

with:

```ts
    publish: n => Math.min(2, n), round2BatchSize: 3, learns: true,
```

In `services/bots/personas.ts`, replace:

```ts
/** Each classification is a paid Azure LLM call, so each bot team is capped per round. */
export const BATCH_CAP_PER_ROUND = 8;
```

with:

```ts
/**
 * Each classification is a paid Azure LLM call, so each bot team is capped per
 * round, in JOKES: 40 in both rounds, whatever the batch size, so a persona
 * that sends batches of 10 gets no more jokes than one that sends batches of 3.
 */
export const JOKE_CAP_PER_ROUND = 40;
```

In `services/bots/engine.ts`, replace:

```ts
import {
  BATCH_CAP_PER_ROUND, DWELL_MS, FEEDBACK_WAIT_MS, IDLE_POLL_MS, MAX_BOT_TEAMS, PERSONAS,
```

with:

```ts
import {
  DWELL_MS, FEEDBACK_WAIT_MS, IDLE_POLL_MS, JOKE_CAP_PER_ROUND, MAX_BOT_TEAMS, PERSONAS,
```

In `services/bots/engine.ts`, replace:

```ts
/**
 * The per-round cap in JOKES: BATCH_CAP_PER_ROUND batches of the round's
 * batch_size. A persona that submits full batches stops after exactly
 * BATCH_CAP_PER_ROUND batches, as before; one that submits smaller batches
 * (the Learner's 3 from round 2) sends more, smaller batches instead of fewer
 * jokes. Classification calls are bounded by jokes either way.
 */
export function jokeCapFor(batchSize: number): number {
  return BATCH_CAP_PER_ROUND * batchSize;
}
```

with:

```ts
```

In `services/bots/engine.ts`, replace:

```ts
  /** Jokes submitted per round, for the per-round cap (jokeCapFor). */
```

with:

```ts
  /** Jokes submitted per round, for the per-round cap (JOKE_CAP_PER_ROUND). */
```

In `services/bots/engine.ts`, replace:

```ts
        const cap = jokeCapFor(round.batch_size);
        if (submittedJokes >= cap) {
```

with:

```ts
        // The cap is in jokes (40), not batches: smaller batches mean more of
        // them, never fewer jokes. The last batch may run past it by less than
        // one batch.
        const cap = JOKE_CAP_PER_ROUND;
        if (submittedJokes >= cap) {
```

In `services/bots/engine.ts`, replace:

```ts
        // Round 1 must split into exactly batch_size, so a lean batch size
        // applies only from round 2 (usecase/marketing.go:98-102).
        const size = persona.leanBatchSize && round.round_number >= 2
          ? Math.min(persona.leanBatchSize, round.batch_size)
          : round.batch_size;
```

with:

```ts
        // Round 1 must split into exactly batch_size (5), so the persona's own
        // size applies only from round 2, capped at that round's batch_size.
        const size = round.round_number >= 2
          ? Math.min(persona.round2BatchSize, round.batch_size)
          : round.batch_size;
```

- [ ] **Step 5: The client reads the lean charts; the old preset goes**

In `services/shared/client.ts`, replace:

```ts
  InstructorRoundResponse,
  LobbyResponse,
```

with:

```ts
  InstructorRoundResponse,
  LeanChartsResponse,
  LobbyResponse,
```

In `services/shared/client.ts`, replace:

```ts
  instructorStats(roundId: number, signal?: AbortSignal): Promise<RoundStatsResponse> {
    return this.call<RoundStatsResponse>({
      method: 'GET', path: `/v1/instructor/rounds/${roundId}/stats`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }
```

with:

```ts
  instructorStats(roundId: number, signal?: AbortSignal): Promise<RoundStatsResponse> {
    return this.call<RoundStatsResponse>({
      method: 'GET', path: `/v1/instructor/rounds/${roundId}/stats`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }

  /** GET /v1/instructor/rounds/{rid}/lean-charts — every team's lean charts
   *  and the class average. A CLASSIC round answers 409 NOT_LEAN_ROUND. */
  instructorLeanCharts(roundId: number, signal?: AbortSignal): Promise<LeanChartsResponse> {
    return this.call<LeanChartsResponse>({
      method: 'GET', path: `/v1/instructor/rounds/${roundId}/lean-charts`,
      envelope: 'wrapped', needsIdentity: true, signal,
    });
  }
```

In `services/leanMode.ts`, replace (the pilot below no longer reads it):

```ts
/**
 * @deprecated The two-rule-set class preset of the first Lean design (Round 1
 * push, Round 2 WIP-limited pull). Only scripts/pilot/lean-pilot.mts still
 * reads it; the instructor screen no longer offers it.
 */
export const LEAN_CLASS_PRESET: Record<1 | 2, LeanConfigUpdate> = {
  1: { marketMode: 'LEAN', setupCostPerBatch: 2, carryingCostPerJokeMinute: 0.05, wipLimit: 0, preferenceBase: 3, customerCount: 150 },
  2: { marketMode: 'LEAN', setupCostPerBatch: 0.5, carryingCostPerJokeMinute: 0.05, wipLimit: 2, preferenceBase: 3, customerCount: 150 },
};

```

with:

```ts
```

- [ ] **Step 6: The pilot report**

Replace the whole of `scripts/pilot/report.ts` with:

```ts
/* Pure summarisation for the Lean fees pilot. Kept separate from the runner so
   the success checks are unit-tested and the markdown is reproducible.

   One class plays Round 1 then Round 2 under one rule set and one set of fees
   (docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §7). One
   RunResult is one round of that class. */
import type { ConfigRequest, LeanTeamStats } from '../../types/api';
import { leanFeesOf } from '../../services/leanMode';

export type PilotRound = 1 | 2;

export interface TeamRow {
  teamId: number;
  persona: string;
  /** Sales × market price. */
  revenue: number;
  shipping: number;
  storage: number;
  hosting: number;
  /** Listing fees: released jokes × cost_of_publishing. */
  listing: number;
  /** Discard fees: dropped jokes × cost_of_discard. */
  discard: number;
  profit: number;
  /** Batches sent. */
  batches: number;
  /** Mean jokes per split batch; null when none was split. */
  meanBatchSize: number | null;
  /** Mean seconds from sending a batch to its first sale, over batches that sold; null when none sold. */
  sendToFirstSaleS: number | null;
}

export interface RunResult { round: PilotRound; durationS: number; calls: number; rows: TeamRow[] }

export interface PersonaSummary {
  n: number;
  revenue: number; shipping: number; storage: number; hosting: number; listing: number; discard: number; profit: number;
  batches: number;
  meanBatchSize: number | null;
  sendToFirstSaleS: number | null;
  /** All five fees as a share of revenue, in percent; null without revenue. */
  feesPct: number | null;
}

export const PERSONAS = ['CAREFUL', 'BALANCED', 'SPRAY', 'LEARNER'] as const;
export const ROUNDS: readonly PilotRound[] = [1, 2];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: Array<number | null>) => {
  const known = xs.filter((x): x is number => x != null);
  return known.length ? mean(known) : null;
};

/** Fees are everything profit subtracts from revenue: shipping, storage, hosting, listing, discard. */
export function feesOf(r: Pick<TeamRow, 'shipping' | 'storage' | 'hosting' | 'listing' | 'discard'>): number {
  return r.shipping + r.storage + r.hosting + r.listing + r.discard;
}

/** Per persona means, per round (both rounds always present, possibly empty). */
export function summarise(runs: RunResult[]): Record<PilotRound, Record<string, PersonaSummary>> {
  const out = { 1: {}, 2: {} } as Record<PilotRound, Record<string, PersonaSummary>>;
  for (const round of ROUNDS) {
    const rows = runs.filter(r => r.round === round).flatMap(r => r.rows);
    for (const persona of new Set(rows.map(r => r.persona))) {
      const xs = rows.filter(r => r.persona === persona);
      const s: PersonaSummary = {
        n: xs.length,
        revenue: mean(xs.map(x => x.revenue)), shipping: mean(xs.map(x => x.shipping)),
        storage: mean(xs.map(x => x.storage)), hosting: mean(xs.map(x => x.hosting)),
        listing: mean(xs.map(x => x.listing)), discard: mean(xs.map(x => x.discard)),
        profit: mean(xs.map(x => x.profit)), batches: mean(xs.map(x => x.batches)),
        meanBatchSize: meanOrNull(xs.map(x => x.meanBatchSize)),
        sendToFirstSaleS: meanOrNull(xs.map(x => x.sendToFirstSaleS)),
        feesPct: null,
      };
      s.feesPct = s.revenue > 0 ? (feesOf(s) / s.revenue) * 100 : null;
      out[round][persona] = s;
    }
  }
  return out;
}

/** Spearman's rank correlation, ties given their average rank; null below 3 pairs or with no spread. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const ranks = (vs: readonly number[]) => {
    const order = vs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array<number>(vs.length);
    for (let k = 0; k < order.length;) {
      let j = k;
      while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
      for (let m = k; m <= j; m++) r[order[m].i] = (k + j) / 2 + 1;
      k = j + 1;
    }
    return r;
  };
  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

export interface Check { name: string; pass: boolean; detail: string }

/** The three success checks of spec §7, in its order. */
export function successChecks(runs: RunResult[]): Check[] {
  const s = summarise(runs);
  const pct = s[1].SPRAY?.feesPct ?? null;
  const fees: Check = {
    name: 'Spray spends 40–60 % of its revenue on fees in Round 1',
    pass: pct != null && pct >= 40 && pct <= 60,
    detail: pct == null ? 'no Spray Round 1 revenue' : `Spray Round 1 fees are ${pct.toFixed(1)} % of revenue`,
  };

  const learner = s[2].LEARNER?.sendToFirstSaleS ?? null;
  const spray = s[2].SPRAY?.sendToFirstSaleS ?? null;
  const faster: Check = {
    name: "In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10",
    pass: learner != null && spray != null && learner < spray,
    detail: learner == null || spray == null
      ? `no first sale for ${[learner == null ? 'Learner' : '', spray == null ? 'Spray' : ''].filter(Boolean).join(' or ')} in Round 2`
      : `send → first sale: Learner ${Math.round(learner)} s, Spray ${Math.round(spray)} s`,
  };

  const parts: string[] = [];
  let holdPays = false;
  for (const round of ROUNDS) {
    const rows = runs.filter(r => r.round === round).flatMap(r => r.rows).filter(r => r.batches > 0);
    const rho = spearman(rows.map(r => r.storage / r.batches), rows.map(r => r.profit));
    if (rho == null) {
      holdPays = true;
      parts.push(`Round ${round}: too few teams to rank`);
    } else {
      if (rho > 0) holdPays = true;
      parts.push(`Round ${round}: ρ = ${rho.toFixed(2)}`);
    }
  }
  const desk: Check = {
    name: "No persona profits by leaving batches on Marketing's desk",
    pass: !holdPays,
    detail: `rank correlation of storage fee per batch with profit, across teams (must not be positive): ${parts.join('; ')}`,
  };
  return [fees, faster, desk];
}

/**
 * One team's row from the round's leaderboard row, its prices and its lean
 * charts batches. Mean batch size counts split batches (an unsplit one has no
 * joke rows yet); send → first sale averages the batches that sold.
 */
export function teamRowFrom(
  r: {
    team: { id: number };
    total_sales: number; published_jokes: number; discarded_jokes: number; profit: number;
    lean?: LeanTeamStats;
  },
  persona: string,
  prices: { market_price: number; cost_of_publishing: number; cost_of_discard: number },
  chartBatches: ReadonlyArray<{ first_sale_s: number | null }> | undefined,
): TeamRow {
  const fees = leanFeesOf(r.lean);
  const split = (r.lean?.batch_series ?? []).filter(b => b.jokes > 0);
  const sold = (chartBatches ?? []).map(b => b.first_sale_s).filter((v): v is number => v != null);
  return {
    teamId: r.team.id, persona,
    revenue: r.total_sales * prices.market_price,
    shipping: fees.shipping, storage: fees.storage, hosting: fees.hosting,
    listing: r.published_jokes * prices.cost_of_publishing,
    discard: r.discarded_jokes * prices.cost_of_discard,
    profit: r.profit,
    batches: r.lean?.batches_submitted ?? 0,
    meanBatchSize: split.length ? split.reduce((n, b) => n + b.jokes, 0) / split.length : null,
    sendToFirstSaleS: sold.length ? sold.reduce((a, b) => a + b, 0) / sold.length : null,
  };
}

/* ---- Settings ------------------------------------------------------------ */

/** The five fees at the real-time (classroom) rate. */
export interface PilotFees {
  shippingSmall: number; shippingStandard: number; shippingLarge: number;
  /** Per joke-minute. */
  storage: number;
  /** Per joke-minute. */
  hosting: number;
}

/** The spec's starting amounts (§3). */
export const SPEC_FEES: PilotFees = { shippingSmall: 1, shippingStandard: 2, shippingLarge: 3, storage: 0.1, hosting: 0.05 };

export interface Tuning {
  fees: PilotFees;
  /** Arrival window in seconds (bots run 10× faster, so 90 s stands for 15 minutes). */
  window: number;
  preferenceBase?: number;
  customers?: number;
  budget?: number;
  tag?: string;
  /** The env knobs that changed a value, for the report. */
  overrides: string[];
}

/**
 * Reads PILOT_SHIP_SMALL, PILOT_SHIP_STANDARD, PILOT_SHIP_LARGE, PILOT_STORAGE,
 * PILOT_HOSTING (real-time amounts; default the spec's), PILOT_WINDOW (default
 * 90), PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET and PILOT_TAG.
 * Throws on a bad value, and when shipping does not rise with batch size.
 */
export function parseTuning(env: Record<string, string | undefined>): Tuning {
  const overrides: string[] = [];
  const num = (name: string, ok: (v: number) => boolean, rule: string): number | undefined => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return undefined;
    const v = Number(raw);
    if (!Number.isFinite(v) || !ok(v)) throw new Error(`${name} must be ${rule}, got ${raw}`);
    overrides.push(name);
    return v;
  };
  const fee = (name: string, fallback: number) => num(name, v => v >= 0, 'a number >= 0') ?? fallback;
  const fees: PilotFees = {
    shippingSmall: fee('PILOT_SHIP_SMALL', SPEC_FEES.shippingSmall),
    shippingStandard: fee('PILOT_SHIP_STANDARD', SPEC_FEES.shippingStandard),
    shippingLarge: fee('PILOT_SHIP_LARGE', SPEC_FEES.shippingLarge),
    storage: fee('PILOT_STORAGE', SPEC_FEES.storage),
    hosting: fee('PILOT_HOSTING', SPEC_FEES.hosting),
  };
  if (fees.shippingSmall > fees.shippingStandard || fees.shippingStandard > fees.shippingLarge) {
    throw new Error('shipping fees must rise with batch size: PILOT_SHIP_SMALL <= PILOT_SHIP_STANDARD <= PILOT_SHIP_LARGE');
  }
  return {
    fees,
    window: num('PILOT_WINDOW', v => Number.isInteger(v) && v >= 1, 'an integer >= 1') ?? 90,
    preferenceBase: num('PILOT_PREFERENCE_BASE', v => v > 1, 'a number > 1'),
    customers: num('PILOT_CUSTOMERS', v => Number.isInteger(v) && v >= 1, 'an integer >= 1'),
    budget: num('PILOT_BUDGET', v => v >= 0, 'a number >= 0'),
    tag: env.PILOT_TAG?.trim() || undefined,
    overrides,
  };
}

/**
 * The config body of one round. The backend charges storage and hosting per
 * wall-clock minute while the bots play `speed` times faster, so those two are
 * multiplied by `speed` to weigh what they weigh in a real 15-minute round.
 * Shipping is per batch, not per minute, and is sent unscaled. Batch size:
 * exactly 5 in Round 1, up to 10 in Round 2. No WIP limit.
 */
export function pilotConfig(t: Tuning, speed: number, round: PilotRound): ConfigRequest {
  const perMinute = (v: number) => Number((v * speed).toFixed(4));
  const body: ConfigRequest = {
    market_mode: 'LEAN', arrival_window_seconds: t.window, wip_limit: 0, batch_size: round === 1 ? 5 : 10,
    shipping_fee_small: t.fees.shippingSmall, shipping_fee_standard: t.fees.shippingStandard,
    shipping_fee_large: t.fees.shippingLarge,
    storage_fee_per_joke_minute: perMinute(t.fees.storage), hosting_fee_per_joke_minute: perMinute(t.fees.hosting),
  };
  if (t.preferenceBase !== undefined) body.preference_base = t.preferenceBase;
  if (t.customers !== undefined) body.customer_count = t.customers;
  if (t.budget !== undefined) body.customer_budget = t.budget;
  return body;
}

/** The Settings lines: fees, scaling, window and every override. */
export function settingsLines(t: Tuning, speed: number, counts: string): string[] {
  const f = t.fees;
  return [
    `Bots at ${speed}×; ${counts}; one class, Round 1 then Round 2.`,
    `Fees (real time): shipping $${f.shippingSmall} / $${f.shippingStandard} / $${f.shippingLarge} for 1–4 / 5 / 6–10 jokes, `
      + `storage $${f.storage} and hosting $${f.hosting} per joke-minute.`,
    `Storage and hosting are sent ×${speed} ($${Number((f.storage * speed).toFixed(4))} and $${Number((f.hosting * speed).toFixed(4))}) `
      + 'because the backend charges per wall-clock minute; shipping is per batch and is not scaled.',
    `Arrival window ${t.window} s (stands for ${Math.round((t.window * speed) / 60)} minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.`,
    'Bot rounds are capped at 40 jokes per team, whatever the batch size.',
    t.overrides.length ? `Overrides: ${t.overrides.join(', ')}.` : 'Overrides: none (the spec\'s starting amounts).',
  ];
}

/* ---- Markdown ------------------------------------------------------------ */

const money = (v: number) => (v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`);
const winnerOf = (r: RunResult) => [...r.rows].sort((a, b) => b.profit - a.profit)[0];

/** Only these hosts may be pilot targets by default: the class starts with a destructive reset. */
export function isLocalUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Everything a run produced, written next to the markdown as JSON so it can be re-rendered. */
export interface PilotSidecar { date: string; settings: string[]; results: RunResult[]; errors: string[]; tag?: string }

export function markdown(
  runs: RunResult[], date: string, settings: string[] = [], errors: string[] = [], tag?: string,
): string {
  const s = summarise(runs);
  const checks = successChecks(runs);
  const table = (round: PilotRound): string[] => {
    const group = s[round];
    const known = PERSONAS.filter(p => group[p]);
    const extra = Object.keys(group).filter(p => !(PERSONAS as readonly string[]).includes(p)).sort();
    return [
      `## Round ${round}`, '',
      '| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...[...known, ...extra].map(p => {
        const x = group[p];
        return `| ${p} | ${x.n} | ${money(x.revenue)} | ${money(x.shipping)} | ${money(x.storage)} | ${money(x.hosting)} | `
          + `${money(x.listing)} | **${money(x.profit)}** | ${x.batches.toFixed(1)} | `
          + `${x.meanBatchSize == null ? '—' : x.meanBatchSize.toFixed(1)} | `
          + `${x.sendToFirstSaleS == null ? '—' : `${Math.round(x.sendToFirstSaleS)} s`} | `
          + `${x.feesPct == null ? '—' : `${x.feesPct.toFixed(1)} %`} |`;
      }),
      '',
    ];
  };
  return [
    `# Lean fees pilot — ${date}`, '',
    ...(tag ? [`_${tag}_`, ''] : []),
    '## Success checks', '',
    ...checks.map(c => `- **${c.pass ? 'PASS' : 'FAIL'}** — ${c.name}: ${c.detail}`),
    '',
    ...(errors.length ? ['## Errors', '', ...errors.map(x => `- ${x}`), ''] : []),
    ...(settings.length ? ['## Settings', '', ...settings.map(x => `- ${x}`), ''] : []),
    'Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. '
      + 'Mean batch size counts split batches; send → first sale is per batch, over batches that sold.', '',
    ...ROUNDS.filter(r => runs.some(x => x.round === r)).flatMap(table),
    '## Rounds', '',
    '| Round | Winner | Profit | Duration | Classification calls |',
    '|---|---|---|---|---|',
    ...[...runs].sort((a, b) => a.round - b.round).map(r => {
      const w = winnerOf(r);
      return `| ${r.round} | ${w?.persona ?? '—'} | ${w ? money(w.profit) : '—'} | ${r.durationS}s | ${r.calls} |`;
    }),
    '',
  ].join('\n');
}
```

- [ ] **Step 7: The pilot runner — one class, Round 1 then Round 2**

Replace the whole of `scripts/pilot/lean-pilot.mts` with:

```ts
/* Runs ONE Lean bot class against a local backend — Round 1 then Round 2,
   one rule set and one set of fees — and writes the fees pilot report
   (scripts/pilot/report.ts; spec docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §7).

   Usage (local docker backend, password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/lean-pilot.mts docs/pilots/<date>-lean-fees-pilot.md

   Environment:
     E2E_ADMIN_PASSWORD   required.
     E2E_BE_URL           default http://localhost:8081. Only localhost, 127.0.0.1 and [::1]
                          are allowed unless PILOT_ALLOW_REMOTE=1: the class starts with an
                          admin reset that deletes all game data.
     PILOT_RENDER_ONLY    path to a JSON sidecar from an earlier run: re-render its markdown
                          (to the output path, default the sidecar's path with .md) and exit.
                          Calls no backend and needs no password.
     PILOT_INSTRUCTOR     instructor display name, default "Local Instructor".
     PILOT_WINDOW         arrival window in seconds, default 90: the bots play 10× faster, so
                          90 s stands for a 15-minute round.
     PILOT_SHIP_SMALL / PILOT_SHIP_STANDARD / PILOT_SHIP_LARGE
                          shipping fee per batch of 1–4 / 5 / 6–10 jokes, default 1 / 2 / 3.
                          Per batch, so NOT scaled.
     PILOT_STORAGE / PILOT_HOSTING
                          per joke-minute at classroom speed, default 0.10 / 0.05. The backend
                          charges per wall-clock minute, so both are sent ×10.
     PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET
                          optional overrides of the backend defaults (3, 150, $3).
     PILOT_TAG            free-text label printed under the report title.

   The class: reset (Round 1 batch size 5 exactly, Round 2 up to 10); configure both rounds
   with the fees (pilotConfig); start the bot engine on Round 1 with 12 teams, 3 per persona
   (Careful, Balanced, Spray, Learner). The SAME engine keeps running while the script ends
   Round 1 and starts Round 2: the bots read the active round on every loop and keep their
   40-joke cap per round id, and team assignments live on the users, so nobody re-seats. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '../../services/shared/client';
import { BotEngine, CAP_REACHED, realDelay } from '../../services/bots/engine';
import { personaSequence, type PersonaId } from '../../services/bots/personas';
import type { EngineStatus } from '../../services/bots/protocol';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import type { ConfigRequest } from '../../types/api';
import {
  isLocalUrl, markdown, parseTuning, pilotConfig, settingsLines, teamRowFrom,
  type PilotRound, type PilotSidecar, type RunResult,
} from './report';

const RENDER_ONLY = process.env.PILOT_RENDER_ONLY;
if (RENDER_ONLY) {
  const side = JSON.parse(readFileSync(RENDER_ONLY, 'utf8')) as PilotSidecar;
  const out = process.argv[2] ?? RENDER_ONLY.replace(/\.json$/, '') + '.md';
  writeFileSync(out, markdown(side.results, side.date, side.settings, side.errors, side.tag));
  console.log(`rendered ${out} from ${RENDER_ONLY}`);
  process.exit(0);
}

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the pilot against ${BE}: it resets all game data. Use the local backend.`);
}
const TUNING = parseTuning(process.env);
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const INSTRUCTOR = process.env.PILOT_INSTRUCTOR ?? 'Local Instructor';
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-lean-fees-pilot.md`;
const SIDECAR = OUT.replace(/\.md$/, '') + '.json';

const COUNTS: Record<PersonaId, number> = { CAREFUL: 3, BALANCED: 3, SPRAY: 3, LEARNER: 3 };
const SPEED = 10 as const;
const POLL_MS = 5_000;
const MAX_ROUND_MS = 8 * 60_000;
const SETTLE_MS = 15_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ideal = { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'];

const SETTINGS: string[] = [
  `Backend ${BE}.`,
  ...settingsLines(TUNING, SPEED, Object.entries(COUNTS).map(([p, n]) => `${n} ${p}`).join(', ')),
  `Each round waits for every team's cap and the arrival window, then settles ${SETTLE_MS / 1000} s before reading stats.`,
];

type Instructor = ReturnType<ReturnType<typeof createClient>['as']>;

/** Pushes each round's result into `results` as soon as it is read, so a later failure keeps it. */
async function runClass(results: RunResult[]): Promise<void> {
  const api = createClient({ baseUrl: BE });
  const login = await api.instructorLogin({ display_name: INSTRUCTOR, password: PASSWORD as string });
  const instructor = api.as(login.user.user_id, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const rounds = (await api.roundsActive()).rounds;
  const ids = {
    1: rounds.find(r => r.round_number === 1)?.id,
    2: rounds.find(r => r.round_number === 2)?.id,
  };
  if (ids[1] == null || ids[2] == null) throw new Error('the backend has no rounds 1 and 2 after reset');
  for (const round of [1, 2] as const) {
    await instructor.instructorConfig(ids[round] as number, pilotConfig(TUNING, SPEED, round));
  }

  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'fatal') console.error('FATAL', m.message); },
    seed: 'pilot-fees',
  });
  const teams = personaSequence(COUNTS).map((persona, i) => ({ index: i + 1, persona }));
  try {
    await engine.start({ roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE } });
    console.log(`${teams.length} teams, round 1 started`);
    results.push(await playRound(1, ids[1], engine, instructor));
    await instructor.instructorStart(ids[2], { ideal_profile: ideal });
    console.log('round 2 started');
    results.push(await playRound(2, ids[2], engine, instructor));
  } finally {
    engine.stop();
  }
}

/** Wait for the round to play out, read its stats and lean charts, end it. */
async function playRound(round: PilotRound, roundId: number, engine: BotEngine, instructor: Instructor): Promise<RunResult> {
  const t0 = Date.now();
  const calls0 = engine.status().classificationCalls;
  const startedAt = Date.parse(
    (await instructor.roundsActive()).rounds.find(r => r.id === roundId)?.started_at ?? '',
  ) || t0;
  const windowEnds = startedAt + TUNING.window * 1000;

  while (Date.now() - t0 < MAX_ROUND_MS) {
    await sleep(POLL_MS);
    const s: EngineStatus = engine.status();
    const capped = s.teams.filter(t => t.jm.activity.includes(CAP_REACHED)).length;
    const idle = s.teams.filter(t => /waiting for a batch/.test(t.marketing.activity)).length;
    const windowLeft = Math.max(0, Math.round((windowEnds - Date.now()) / 1000));
    console.log(
      `  R${round} t=${Math.round((Date.now() - t0) / 1000)}s capped=${capped}/${s.teams.length} `
        + `marketing idle=${idle}/${s.teams.length} calls=${s.classificationCalls} window left=${windowLeft}s`,
    );
    if (capped === s.teams.length && idle === s.teams.length && windowLeft === 0) break;
  }
  if (Date.now() - t0 >= MAX_ROUND_MS) console.warn(`  R${round}: hit the ${MAX_ROUND_MS / 60_000}-minute cap`);
  await sleep(SETTLE_MS);

  // Reading stats also serves any Lean arrivals that are due.
  const final = engine.status();
  const stats = await instructor.instructorStats(roundId);
  const charts = await instructor.instructorLeanCharts(roundId);
  const prices = (await instructor.roundsActive()).rounds.find(r => r.id === roundId);
  if (!prices) throw new Error(`round ${roundId} vanished`);
  const personaByTeam = new Map<number, string>();
  for (const t of final.teams) if (t.teamId != null) personaByTeam.set(t.teamId, t.persona);
  const rows = stats.leaderboard.map(r => teamRowFrom(
    r, personaByTeam.get(r.team.id) ?? '?', prices,
    charts.teams.find(t => t.team_id === r.team.id)?.batches,
  ));
  await instructor.instructorEnd(roundId);
  const durationS = Math.round((Date.now() - t0) / 1000);
  console.log(`  R${round} ended after ${durationS}s`);
  return { round, durationS, calls: final.classificationCalls - calls0, rows };
}

const results: RunResult[] = [];
const t0 = Date.now();
const errors: string[] = [];
try {
  await runClass(results);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAILED ${message}`);
  errors.push(message);
}
const sidecar: PilotSidecar = { date: TODAY, settings: SETTINGS, results, errors, tag: TUNING.tag };
writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2));
writeFileSync(OUT, markdown(results, TODAY, SETTINGS, errors, TUNING.tag));
console.log(`wrote ${OUT} and ${SIDECAR}`);
console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/bots/personas.test.ts services/bots/engine.test.ts scripts/pilot/report.test.ts`
Expected: PASS — all three files.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && d="$(mktemp -d)" && printf '%s' '{"date":"2026-10-12","settings":["render check"],"results":[],"errors":[]}' > "$d/side.json" && PILOT_RENDER_ONLY="$d/side.json" npx tsx scripts/pilot/lean-pilot.mts "$d/side.md" && grep -q '## Success checks' "$d/side.md"`
Expected: PASS — prints `rendered …/side.md from …/side.json`. This loads the runner and its imports without a backend or a password; it does not run the pilot.

- [ ] **Step 9: The instructor guide**

Replace the whole of `docs/lean-market-mode.md` with:

````markdown
# Lean market mode — a guide for instructors

This guide explains how to run the Joke Factory in **Lean market mode**: the one lesson it teaches,
how a 90-minute class runs, what each person sees on which screen, what the fees are, how the
simulated customers buy, and how to debrief.

Everything here describes the code on the `feat/lean-market` branches of both repositories, which
play Lean only. The design is `docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md`.

---

## 1. Goal

One lesson, one rule set:

- In **Round 1**, the Joke Maker keeps pushing jokes.
- In **Round 2**, the team discovers that smaller batches bring faster feedback and faster
  improvement.

Both rounds keep the same rules and the same fees, so any change in results comes from how the team
played, not from the game. The only difference is the batch size, which is the lever the lesson is
about. The fees are named the way a real operation names them, and they are big enough to shape
decisions: a team that pushes should see roughly half of its revenue go to fees.

---

## 2. The rules

| Rule | Round 1 | Round 2 |
|---|---|---|
| Jokes per batch | **exactly 5** | **1 to 10**, the team's choice |
| Work-in-progress limit | none | none |
| Fees | the same | the same |
| Customers | 150, arriving over 15 minutes (900 s) | the same, as a fresh market |
| Preference base | 3 | 3 |

**Reset Game** sets all of this: both rounds Lean, Round 1 batches of exactly 5, Round 2 batches of
up to 10, the fees in section 3, 150 customers, preference base 3, arrival window 900 s, no WIP
limit. There is no market mode to choose and no preset button.

Suggested timeline for a 90-minute session (about 65 minutes of game time):

| Step | Time | Instructor (Instructor screen) | Joke Makers | Marketing |
|---|---|---|---|---|
| Setup | 10 min | Presses **Reset Game** if a previous class played, forms teams in the lobby, picks the ideal joke profile. Explains the fees (section 3). | Log in, take their seat, read the brief. | Log in, take their seat, read "The 12 criteria customers judge". |
| Round 1 | 15 min | Presses **Start** on the Round 1 tab. Watches the leaderboard, calls out cues (section 6). Presses **End Round** at about 15 minutes. | Write batches of exactly 5 and press **Send to Marketing**. See "Shipping: $2 per batch of 5". | Split each batch, choose jokes, add a Topic and a title, **Release to market**. Watch the Shipping, Storage and Hosting fees tiles. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard (Shipping, Storage, Hosting, Lead, Sale) and the lean charts. Asks where the money went. | Discuss. | Discuss; read the Customer feedback panel. |
| Round 2 | 15 min | Selects the Round 2 tab, presses **Start**, ends at about 15 minutes. | Batches of 1 to 10 jokes. The line reads "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10". | Same desk; in Round 2 Marketing may also discard a whole batch. |
| Debrief 2 | 15+ min | Opens the **Round 1 vs Round 2** table and works through the debrief prompts in section 6. | Discuss. | Discuss. |

Customers arrive over exactly 15 minutes. The rounds are ended by hand: ending early means the
remaining customers never arrive, and running past 15 minutes brings no new customers while
storage and hosting keep charging.

---

## 3. Fees

| Fee | When it is charged | Starting amount |
|---|---|---|
| **Shipping fee** | Each batch the Joke Maker sends, priced by its size | **$1** for 1–4 jokes · **$2** for 5 · **$3** for 6–10 |
| **Storage fee** | Each minute a joke waits on Marketing's desk, from send until released or discarded | **$0.10 per joke per minute** |
| **Hosting fee** | Each minute a released joke sits unsold, from release until its first sale (or until the round ends) | **$0.05 per joke per minute** |
| **Listing fee** | Each joke Marketing releases | $0.10 |
| Discard fee | Each joke Marketing drops | $0.01 |

```
profit = sales × $1 − shipping − storage − hosting − listing − discard
```

**How a batch's size is counted.** A pasted batch has no joke count until Marketing splits it.
Before the split it counts as **5 jokes** for both the storage fee and the shipping fee (the standard
shipment, $2). After the split, its real count sets both. A batch nobody splits before the round ends
is charged as 5 jokes all the way to the end.

Storage costs more than hosting on purpose: holding a batch on the desk costs more than releasing
it, so Marketing gains nothing by being the bottleneck.

Nothing is stored: the fees are worked out from timestamps each time a screen refreshes, which is why
the Storage and Hosting tiles tick up during the round, and every clock stops when the round ends.
The inventory clock starts at release, so time spent waiting for AI classification counts as
hosting.

**Worked example** (illustrative numbers, at the starting amounts):

*A pushing team in Round 1.* Sends 8 batches of 5: shipping 8 × $2 = $16. Each batch waits 2 minutes
on the desk: 8 × 5 × 2 × $0.10 = $8.00 storage. Releases all 40 jokes ($4.00 listing); 20 of them sit
unsold for 8 minutes: 20 × 8 × $0.05 = $8.00 hosting. With 60 sales: fees $36.00, 60 % of revenue;
profit $24.00.

*A team that learned, in Round 2.* Sends 13 batches of 3: shipping 13 × $1 = $13. Each is decided
within a minute: 13 × 3 × 1 × $0.10 = $3.90 storage. Releases 26 ($2.60), drops 13 ($0.13); 6 sit
unsold for 5 minutes ($1.50 hosting). With 50 sales: fees $21.13; profit $28.87. It sold less and
earned more.

---

## 4. Who sees what

### Instructor

**CONFIG.** The row edits the round selected by the **Round 1 / Round 2** tabs. It shows the batch
rule as text, **R1 batch: 5 (exactly)** and **R2 batch: up to 10** (Reset Game sets them; they are
not edited here), then:

| Label on screen | What it does |
|---|---|
| **Arrival window (s):** | Customers arrive evenly over this many seconds from Start. Minimum 1. |
| **Shipping fee (1–4 / 5 / 6–10 jokes):** | Three amounts, one per batch size. Each must be 0 or more, and a bigger batch never ships for less. |
| **Storage fee per joke-minute:** | Charged while a batch waits on Marketing's desk. |
| **Hosting fee per joke-minute:** | Charged while a released joke waits for its first sale. |

Changes take effect when you press **Apply**. The fees and the window lock once that round has
started: they are greyed out, and the server refuses a change with "Fees and Lean settings can't
change once a round has started." The other fields (Cust. Budget, Market Price, Cost of Publishing,
the nudges) work as before.

**Leaderboard.** After Profit, five sortable columns:

| Column | Meaning |
|---|---|
| **Shipping** | Shipping fees so far: every batch sent, priced by its size. |
| **Storage** | Storage fees so far: jokes waiting on Marketing's desk. |
| **Hosting** | Hosting fees so far: released jokes waiting for a first sale. |
| **Lead** | Average seconds from a batch being sent to Marketing releasing it. |
| **Sale** | Average seconds from a joke being released to its first sale. |

Profit already has every fee subtracted. The first click on a fee or time column sorts lowest
first, because lower is better. The unsold column is titled **Never Sold**: released jokes with no
sale at all.

**Round 1 vs Round 2 table.** Once Round 2 has stats, a card titled "Round 1 vs Round 2" (subtitle
"Same rules and fees in both rounds, per team") shows per team: R1 profit, R2 profit, Δ profit, R1 and
R2 never sold, **R1 Fees** and **R2 Fees** (shipping + storage + hosting), R1 lead and R2 lead.

**Lean charts.** Four charts replace the Classic chart cards, with a team picker and an **R1 / R2**
control above them.

| Chart | What it shows | How to read it |
|---|---|---|
| **Where the money leaked** | One bar per team, most waste first, split into **Shipping** (blue), **Storage (waiting on Marketing's desk)** (purple), **Hosting (unsold on the shelf)** (amber), **Listing fees on never-sold jokes** (red) and **Discards** (grey), in dollars. | Shorter bars are leaner. Shipping + Storage + Hosting is the leaderboard's three fee columns for that team. |
| **Jokes standing still** | For one team, the jokes waiting for Marketing (purple) and unsold on the shelf (amber) over the round, with the class average dashed. | A growing pile is money: storage and hosting charge for every joke in it. |
| **Smaller batches, faster feedback** | One dot per batch: jokes in the batch across, minutes from sending it to its first sale up. Round 1 circles, Round 2 triangles. | Lower is better. Small Round 2 batches should sit lower. |
| **More cycles, more learning** | The class's sell-through over the round, one line per round; with one team picked, that team's batches. | More dots in the same time means more chances to adjust. |

### Joke Maker

The Joke Maker writes jokes with the AI tool, pastes them in, ticks "I certify these jokes are not
offensive." and presses **Send to Marketing**. The brief reads "Generate 5 jokes" in Round 1 and
"Generate up to 10 jokes … (smaller batches are fine)" in Round 2. Under the Send button, the
shipping line quotes the round's fees: "Shipping: $2 per batch of 5" in Round 1, "Shipping: $1 for
1–4 jokes · $2 for 5 · $3 for 6–10" in Round 2. There is no WIP limit: the Joke Maker can always send.

Under the stat tiles, the **Next step** line gives one instruction, the first that applies:

1. Before the round: "Get your AI tool ready — the round starts soon."
2. Marketing left a note on the latest processed batch, sent within the last 2 minutes:
   "Marketing says: “…” — use it in your next batch." (the note, up to 80 characters)
3. Round 2, the last batch had 6 or more jokes: "Big batches wait longer for feedback — try 2 or 3
   jokes next." (amber)
4. Marketing's desk is empty: "Marketing's desk is empty — send your next batch of 5." (Round 1) or
   "… — send a small batch now." (Round 2)
5. No batch sent for 90 s: "No batch sent in 90 s — keep the line moving." (amber)
6. Otherwise: "Keep writing — every batch is another chance to sell."

In **Value stream**, a batch Marketing left a note on shows a speech-bubble icon; expanding it shows
the note under "From Marketing". The Joke Maker does not see the customer feedback panel.

### Marketing

The next waiting batch appears on the **Marketing Desk** automatically. Marketing **splits** it
(Round 1 into exactly 5, Round 2 into up to 10), **decides** which jokes to sell with a Topic and a
title (in Round 2 it may discard the whole batch), writes an optional **Note to your Joke Maker**,
and **releases**.

Three fee tiles sit next to the usual ones, each with a one-line tooltip carrying the round's
amounts:

| Tile | Tooltip |
|---|---|
| **Shipping fees** | "Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10." |
| **Storage fees** | "Every minute a joke waits on Marketing's desk costs 10¢." |
| **Hosting fees** | "Every minute a released joke sits unsold costs 5¢." |

**Publish → first sale** shows how long a sold joke waited for its first buyer.

Under the tiles, the **Next step** line:

1. Before the round: "Watch the desk — your Joke Maker's first batch is coming."
2. A batch has been on the desk 45 s or more: "Batch waiting {n} s — release what's good enough.
   Storage costs 10¢ a joke each minute." (amber; the round's storage fee)
3. The last decision discarded 60 % or more of a batch: "You discarded {d} of {n} last time —
   customers can only buy what's on the shelf." (amber)
4. The customer feedback has a Fix next item: "Tell your Joke Maker: fix {criterion} next."
5. The desk is empty: "Desk is clear — nudge your Joke Maker to send the next batch."
6. Otherwise: "Release what's good enough, then tell your Joke Maker what to change."

The **Customer feedback** panel shows which criteria landed and which missed, never by how much,
and can be popped out above the game.

---

## 5. How customers buy

Each round creates 150 customers, so Round 2 starts with a fresh market. Each has a personal quality
bar of 7 ± 0.3 and a budget of $3. A joke's **fit** is how well it matches the hidden ideal profile:
the sum of its scores on the 12 criteria, from 0 to 12.

- **Arrival.** Customers arrive evenly across the arrival window: with 150 customers and 900 seconds,
  one every 6 seconds. Arrival order is shuffled.
- **Shopping once.** An arriving customer looks at every released, classified joke whose fit clears
  their bar, and buys up to 3 (budget ÷ price), one weighted pick at a time: a joke's weight is 3 to
  the power of its fit, so one fit point higher is three times as likely to be picked. A customer never
  buys two jokes with the same text. Then they leave for good; there are no swaps.
- **Lost demand.** A customer who finds nothing good enough leaves with their money. Customers who
  have not arrived when the round ends are never served.

Customers are served whenever a screen polls and whenever a batch finishes classification, so within
a few seconds of their arrival time.

---

## 6. Instructor playbook

### Before class

- [ ] Press **Reset Game** (this also clears the ideal profile and every team).
- [ ] Form teams in the lobby: one Joke Maker and one Marketing seat per team.
- [ ] Pick the ideal joke profile; a round will not start without a complete profile.
- [ ] Check CONFIG on each tab: R1 batch 5 (exactly), R2 batch up to 10, shipping 1 / 2 / 3, storage
      0.1, hosting 0.05, arrival window 900.

### Cues to call out during a round

- "Look at the Storage column: whose jokes are waiting longest on Marketing's desk?"
- "Your Hosting tile is going up every minute. What is sitting on the shelf unsold?"
- "Customers are arriving now. If your shelf is empty, those sales are gone."
- Round 2: "Smaller batches are allowed now. What does that do to your feedback?"
- "Jokes standing still: whose pile is growing, and what is it waiting for?"

### Debrief prompts

| # | Prompt | Look at |
|---|---|---|
| 1 | Where did your money go? Shipping, storage or hosting? | Leaderboard fee columns; Where the money leaked |
| 2 | Which batch size got feedback fastest in Round 2? | Smaller batches, faster feedback |
| 3 | Did Marketing hold batches? What did that cost? | Storage column; R1 Fees vs R2 Fees |
| 4 | Which team improved most from Round 1 to Round 2, and what did it change? | Δ profit |
| 5 | Did your shipping bill go up or down in Round 2, and was it worth it? | Shipping column per round |
| 6 | Which jokes sat unsold longest, and what does that say about fit? | Hosting column; Sale column |
| 7 | How did you use Marketing's notes and the customer feedback? | More cycles, more learning (pick the team) |

---

## 7. Limits and open questions

- **The amounts are starting values.** They come from the design and are confirmed by the bot pilot
  (`scripts/pilot/lean-pilot.mts`), which plays at 10× with storage and hosting scaled ×10. Human play
  will not match bot numbers exactly.
- **Bots learn only from sold counts.** The Learner bot remembers which joke texts sold. It does not
  read the customer feedback panel; human teams can learn more.
- **The pilot does not use the real classifier.** It runs with a deterministic hash classifier
  (`APP_LLM_MODE=hash`). In class, jokes are classified by the LLM.
- **Lean only.** The instructor screen has no Classic mode. The backend still contains the Classic
  code, so returning to Classic is a matter of running the `main` branch.

---

## 8. Earlier pilot evidence

The pilots of 2026-10-06 tested a different rule set (setup and carrying costs, and a WIP limit in
Round 2 only); their numbers do not apply here. They remain in git history and in `docs/pilots/`.
````

- [ ] **Step 10: Full checks**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent (it type-checks `scripts/pilot/lean-pilot.mts` too), every test file passes, `✓ built`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && ! grep -rn "LEAN_CLASS_PRESET\|wipStatus\|BATCH_CAP_PER_ROUND\|jokeCapFor\|leanBatchSize" --include='*.ts' --include='*.tsx' --include='*.mts' services views components scripts context.tsx types.ts`
Expected: PASS — no line printed: nothing refers to the removed names.

- [ ] **Step 11: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add \
  services/bots/personas.ts services/bots/personas.test.ts services/bots/engine.ts services/bots/engine.test.ts \
  services/shared/client.ts services/leanMode.ts \
  scripts/pilot/report.ts scripts/pilot/report.test.ts scripts/pilot/lean-pilot.mts \
  docs/lean-market-mode.md && git commit -q -F - <<'EOF'
feat(pilot): fees and one rule set in bots, pilot and guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 7: Verification, the local stack, and the pilot hand-off

**Repo:** both (`~/Documents/GitHub/jokefactory_be` and `~/Documents/GitHub/AI-Joke-Factory`). No code changes; nothing to commit except the pilot report in Step 7.

**Interfaces:**
- Consumes: every task above; the throwaway database `jokefactory_fees_test` (dropped here); the local Docker stack (`jokefactory_be-api-1` on :8081, `jokefactory-postgres` on :55432).
- Produces: the real local `jokefactory` database at goose version 5, a rebuilt API running the hash classifier, and the exact pilot command for the controller.

- [ ] **Step 1: Full suites**

Run: `cd ~/Documents/GitHub/jokefactory_be && test -z "$(gofmt -l .)" && go build ./... && go vet ./... && go vet -tags integration ./... && go test ./...`
Expected: PASS — every package `ok`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent, every test file passes, `✓ built`.

- [ ] **Step 2: The SQL one last time, then drop the throwaway database**

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_ALLOW_RESET=1 JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory_fees_test?sslmode=disable" go test -tags integration ./src/infra/repo/postgres/ ./src/core/usecase/ -v -run 'Integration'`
Expected: PASS — six `--- PASS` lines (`TestLeanChartsSQLIntegration`, `TestLeanFeeColumnsRoundTripIntegration`, `TestResetGameRestoresTheLeanRoundsIntegration`, `TestLeanFeesSQLIntegration`, `TestLeanStatsSQLIntegration`, `TestMarketingNoteIntegration`).

Run: `PGPASSWORD=postgres psql -h localhost -p 55432 -U postgres -d postgres -c "DROP DATABASE jokefactory_fees_test"`
Expected: PASS — prints `DROP DATABASE`.

- [ ] **Step 3: Migrate the real local database (this is the only step that touches it)**

Run: `cd ~/Documents/GitHub/jokefactory_be && DB_DSN="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" make migrate-up && DB_DSN="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" make migrate-status 2>&1 | grep '0005_lean_fees.sql' | grep -v Pending`
Expected: PASS — goose reports `successfully migrated database to version: 5`, and the status line for `0005_lean_fees.sql` shows an Applied timestamp (goose prints its status on stderr, hence `2>&1`).

- [ ] **Step 4: Rebuild the local API with the hash classifier**

The stock compose file publishes Postgres on 5432, which a host Postgres already holds; a one-line override kept outside the repo publishes it on 55432 instead.

Run: `O="${TMPDIR:-/tmp}/jokefactory-compose.override.yml" && printf 'services:\n  postgres:\n    ports: !override ["55432:5432"]\n' > "$O" && cd ~/Documents/GitHub/jokefactory_be && APP_LLM_MODE=hash APP_LLM_HASH_CONFIRM=local-pilot-only docker compose -f docker-compose.yml -f "$O" up -d --build api`
Expected: PASS — the `api` image builds and `jokefactory_be-api-1` is recreated; `curl -s localhost:8081/health` answers `{"status":…}` within a few seconds. (Compose reads `APP_ADMIN_PASSWORD` from the backend's `.env` itself; nothing prints it. Never run `docker compose config` unfiltered.)

- [ ] **Step 5: API smoke — Reset Game gives both rounds the Lean rule set**

Run: `cd ~/Documents/GitHub/jokefactory_be && PW="$(grep '^APP_ADMIN_PASSWORD=' .env | cut -d= -f2-)" python3 -c 'import json,os,urllib.request as u; B="http://localhost:8081"; post=lambda p,b,h={}: json.load(u.urlopen(u.Request(B+p, data=json.dumps(b).encode(), headers={"Content-Type":"application/json",**h}))); uid=post("/v1/instructor/login",{"display_name":"Local Instructor","password":os.environ["PW"]})["user"]["user_id"]; post("/v1/admin/reset",{},{"X-User-Id":str(uid)}); rs={r["round_number"]:r for r in json.load(u.urlopen(B+"/v1/rounds/active"))["data"]["rounds"]}; want={"market_mode":"LEAN","shipping_fee_small":1,"shipping_fee_standard":2,"shipping_fee_large":3,"storage_fee_per_joke_minute":0.1,"hosting_fee_per_joke_minute":0.05,"wip_limit":0,"customer_count":150}; bad=[(n,k,rs[n].get(k)) for n in (1,2) for k,v in {**want,"batch_size":5 if n==1 else 10}.items() if rs[n].get(k)!=v]; print("rounds 1 and 2 OK" if not bad else bad); raise SystemExit(1 if bad else 0)'`
Expected: PASS — prints `rounds 1 and 2 OK` (Round 1 `batch_size` 5, Round 2 `batch_size` 10, LEAN, fees 1 / 2 / 3, 0.1, 0.05, WIP 0, 150 customers). The password travels only inside the request body.

- [ ] **Step 6: Hand off the browser check**

The controller (not the implementer) checks in a browser against `npm run dev` with the frontend pointed at `http://localhost:8081`: the instructor CONFIG shows "R1 batch: 5 (exactly)", "R2 batch: up to 10", the three shipping inputs, storage and hosting, and no Market mode / Lean class preset / WIP limit; the leaderboard shows Shipping, Storage, Hosting, Lead, Sale; the Joke Maker sees "Shipping: $2 per batch of 5" and a Next step line under the stat tiles; Marketing sees the three fee tiles with their tooltips and its Next step line.

- [ ] **Step 7: Hand off the pilot (the controller runs it; about 10 minutes, in the background)**

The exact command, from the frontend repo (the password only by shell substitution; the local-only guard refuses any non-local backend):

```
cd ~/Documents/GitHub/AI-Joke-Factory && D="$(date +%F)" && E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" npx tsx scripts/pilot/lean-pilot.mts "docs/pilots/$D-lean-fees-pilot.md"
```

It resets the local game, plays one class (12 bot teams, 3 per persona, 10×, 90 s window, storage $1.00 and hosting $0.50 per joke-minute sent, shipping $1 / $2 / $3), and writes `docs/pilots/$D-lean-fees-pilot.md` (today's date) plus its `.json` sidecar. Read the three PASS/FAIL lines under "## Success checks", summarise them, then commit the two files in the frontend repo:

```
cd ~/Documents/GitHub/AI-Joke-Factory && D="$(date +%F)" && git add "docs/pilots/$D-lean-fees-pilot.md" "docs/pilots/$D-lean-fees-pilot.json" && git commit -q -F - <<'EOF'
docs(pilot): Lean fees pilot report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

To re-render the report from its sidecar without a backend (same day): `cd ~/Documents/GitHub/AI-Joke-Factory && D="$(date +%F)" && PILOT_RENDER_ONLY="docs/pilots/$D-lean-fees-pilot.json" npx tsx scripts/pilot/lean-pilot.mts`.

---

## Self-review against the spec

**Verification of this plan (2026-10-11).** Every code block and edit above was applied, in order, to fresh clones of both repos at `f3f634b` / `9441b90`, by a script that executes each `Create`, `Replace the whole of` and `In …, replace … with` step literally and runs each `Run:` line, checking its PASS/FAIL expectation and every commit block. All 31 checked runs matched, including every RED step (each failed as written before its implementation). The integration tests ran against a throwaway database migrated to 0005, never against `jokefactory`. Results: backend `gofmt -l .` clean, `go build`, `go vet`, `go vet -tags integration` clean, `go test ./...` **153 → 176** passing tests (subtests included), integration tests **3 → 6** passing; frontend `tsc --noEmit` clean, `vitest run` **628 tests in 38 files → 685 in 46**, `vite build` succeeds; the pilot runner type-checks and its render-only path runs (Task 6 Step 8); the pilot itself was not run. Task 7's API smoke one-liner was run against an API built from the plan's code on the throwaway database. The plan's end state was compared file by file with an independent implementation of the same tasks: identical apart from comment wording.

**1. Spec coverage**

| Spec | Where |
|---|---|
| §1 Goal, success criteria | The fees and rules (Tasks 1–2), the lesson on screen (Tasks 3A–5), the checks in the pilot report (Task 6), the run (Task 7 Step 7). |
| §2 Rules table: R1 exactly 5, R2 1–10, no WIP, same fees, 150 customers over 900 s, base 3 | Task 1 defaults, `DefaultRoundConfigFor`, Reset Game, admin login; Task 3A CONFIG text; Task 4 Round 2 brief. |
| §2 Lean only: defaults, Reset Game, no mode selector / preset / WIP field, Classic code kept | Task 1 (defaults LEAN; Classic tests pinned to CLASSIC, Classic paths untouched); Task 3A (controls removed, pinned by `Instructor.render.test.ts`). |
| §3 Fees, names, amounts, unsplit = 5, profit | Task 1 (columns, defaults), Task 2 (CTE, memstore, charts), Tasks 3A/3B/4 (names and copy), Task 6 guide. |
| §4 Migration 0005, domain, defaults, per-round batch size, config API validation and lock, stats keys and aliases, charts keys, unsplit counting | Tasks 1 and 2. |
| §5 Instructor CONFIG, leaderboard, Round 1 vs Round 2, charts labels, Joke Maker line / WIP / R2 copy, Marketing tiles and tooltips, guide | Task 3A (CONFIG), 3B (leaderboard, debrief, charts), 4 (student screens), 6 (guide). |
| §6 Next step line, both roles, rules, `now`, skipped rules | Task 5 (no rule skipped: every input exists on its screen; null until the first poll answers). |
| §7 Pilot: 12 teams, 3 per persona, 10×, 90 s, per-minute ×10, shipping unscaled, R2 sizes, 40-joke cap, report columns, success checks, hash classifier | Task 6 (personas, engine, report, runner), Task 7 (hash-classifier stack, the command). |
| §8 Out of scope | No Classic UI work, no scoring or customer change; the guided walkthrough plan is untouched. Its captions still use the old cost names and must be updated before it is built. |

**2. Placeholder scan.** No "TBD", "TODO" (the one `TODO(backend)` in `QualityControl.tsx` is existing code, not touched), "similar to Task N" or "follow the pattern". Every test and implementation step carries its full code or an exact anchor and its replacement; anchors are full lines copied from the files at the HEADs named in Global Constraints. The only placeholders in commands are shell expressions that resolve themselves (`$(date +%F)`, `$(mktemp -d)`, `${TMPDIR:-/tmp}`, the password substitution).

**3. Type and name consistency.** JSON keys `shipping_fee_small`, `shipping_fee_standard`, `shipping_fee_large`, `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute` (round and config) and `shipping_cost`, `storage_cost`, `hosting_cost` (stats) are spelled identically in Go (`dto`, `ports`), TypeScript (`types/api.ts`, `types.ts`, `services/leanMode.ts`), the pilot (`pilotConfig`) and the tests. Go names: `ShippingFeeSmall/Standard/Large`, `StorageFeePerJokeMinute`, `HostingFeePerJokeMinute` on `RoundConfig`, `Round`, `PartialRoundConfig` (pointers) and `dto`; `ShippingCost/StorageCost/HostingCost` on `ports.LeanTeamStats`, `ShippingCost` on `ports.LeanChartTeamRow`; `domain.StandardShipmentJokes` (Go) and `STANDARD_SHIPMENT_JOKES` (TS) are both 5. TS names defined once and reused: `leanFeesOf`, `shippingFeeFor`, `shippingLine`, `feeTooltips`, `fmtFee`, `fmtCents`, `fmtPerMinute`, `LEAN_LEADERBOARD_COLUMNS`, `LeanSortKey`, `FeeConfigValues`, `changedFees`, `feeValuesOf`, `renderWithGame`, `TEST_CONFIG`, `testUser`, `jokeMakerNextStep`, `marketingNextStep`, `jokeMakerInputFrom`, `marketingInputFrom`, `NextStepLive`, `JOKE_CAP_PER_ROUND`, `round2BatchSize`, `teamRowFrom`, `successChecks`, `pilotConfig`.

**4. Review Focus.** Each of the five failure modes is pinned by tests in its owning task (listed under Review Focus above); all of those tests ran in the verification.

## Spec ambiguities and how this plan resolves them

1. **"Marketing left a note on the latest processed batch, sent within the last 2 minutes."** The note is shown only when it is on the *latest processed* batch (an older batch's note never resurfaces), and "sent" is read as the batch's send time, ≤ 120 s ago (`latestNote.batchSentAt`, the lean plan's interface).
2. **Threshold edges.** Inclusive: note fresh at ≤ 120 s; big batch at ≥ 6 jokes; idle at ≥ 90 s; desk wait at ≥ 45 s; discards at ≥ 60 %. Boundary tests pin each.
3. **"The round hasn't started."** Read as "no round is running" (`config.isActive` false), which also covers the pause between rounds and after Round 2.
4. **Marketing's desk.** "The batch on the desk" is the batch claimed for this seat, timed from its send; the desk is "empty" only when nothing is claimed and `unprocessed_batches` is 0; unknown (null) before the first summary.
5. **"The last decision."** The latest processed batch with jokes, by processed time, from the team's own batch list (it survives a reload and works in watch mode), rather than the screen's memory of its last Release click.
6. **What counts as "fees".** The pilot's "fees % of revenue" and the 40–60 % check count all five fees (revenue − profit), since §3 lists listing and discard as fees and §1 measures fees against revenue. The instructor's "R1 Fees / R2 Fees" column keeps the meaning of the column it replaces (setup + carry → shipping + storage + hosting); its header tooltip says so.
7. **New frontend, old backend.** Missing `shipping_cost`/`storage_cost`/`hosting_cost`: shipping reads `setup_cost`, storage reads the whole `carrying_cost` (it cannot be split), hosting 0, so the three still add up. Missing fee keys on a round read as 0 (that backend charges none), not as the new defaults.
8. **Batch size in CONFIG.** The R1 Batch Size input is removed and `updateConfig` no longer sends `batch_size`: it wrote to whichever round the tabs selected and could set Round 2 to 5. Reset Game, admin login and a config call that creates a round all use the per-round defaults; CONFIG shows the rule as text.
9. **Copy the spec does not give.** The locked-settings alert now reads "Fees and Lean settings can't change once a round has started." (the market-mode control it named is gone); the debrief card's subtitle reads "Same rules and fees in both rounds, per team"; the Round 2 brief reads "Generate up to 10 jokes with any AI tool (smaller batches are fine) and paste the whole response below."
10. **Money formats.** Shipping amounts print as whole dollars when whole ("$2", "$0.50" otherwise), per-minute rates in cents ("10¢"), so the tooltips and lines read exactly like the spec at the default fees and stay correct for any configured amount.
11. **The bots' 40-joke cap.** Kept the engine's existing rule (stop once 40 jokes are sent, so a Learner may send 14 × 3 = 42) rather than trimming the last batch to 1 joke, which would add a cheap, oddly small batch to the pilot data.
12. **"No persona profits by leaving batches on Marketing's desk."** Checked as the lean plan decided: Spearman's rank correlation between storage fee per batch and profit across teams must not be positive, in each round; fewer than 3 teams with batches is a FAIL, not a pass.
13. **"The Learner's batches of 3 reach their first sale sooner than Spray's batches of 10."** Compared on the mean, per persona, of each team's mean send → first sale over its batches that sold (lean charts `first_sale_s`); a persona with no sale fails the check.
14. **Memstore Reset Game.** It now mirrors Postgres (rounds kept and reset by round number, instructors kept, everything else cleared); before, it dropped every round, which hid the per-round batch sizes from usecase tests.
15. **Old setup/carrying settings.** Still accepted, validated, locked and stored (the columns stay), but nothing reads them; this keeps a rollback to the previous image a branch switch.
16. **The idle chart.** "Jokes standing still" counts jokes, not money, so its "Waiting at Marketing" / "Unsold on shelf" labels stay; only the money segments of "Where the money leaked" take the fee names.
17. **Task 3 split.** The lean plan's Task 3 is split into 3A (settings and CONFIG) and 3B (read-outs), each with its own tests and commit, so each is one reviewer gate.
18. **The Reset Game integration test.** It truncates every game table, so it runs only with `JF_TEST_ALLOW_RESET=1`, which this plan sets only for the throwaway database.
