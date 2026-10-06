# Lean Market Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in `LEAN` market mode per round — steady customer arrivals, fit-weighted shopping, setup and carrying costs, a WIP limit and a lean scoreboard — that leaves the `CLASSIC` game byte-for-byte unchanged, plus a bot-simulated pilot and a workflow document.

**Architecture:** A `market_mode` column on `rounds` gates every new rule. Arrivals are served lazily from timestamps whenever the round is polled (no scheduler). All new costs are computed at read time in separate Lean SQL queries, chosen by the use case when the round is Lean; the Classic queries are not edited. The frontend reads `market_mode` off the public round and renders lean controls and tiles only then. The bot engine gains a Learner persona, and a pilot script runs whole classes against a local backend with a deterministic hash classifier.

**Tech Stack:** Go 1.27 + gin + pgx + goose migrations (backend, module `jokefactory`); React 19 + Vite + TypeScript + vitest (frontend); Playwright-free pilot via `tsx`; Docker Compose for the local backend.

**Spec:** `docs/superpowers/specs/2026-10-06-lean-market-mode-design.md` (frontend repo). Read it first.

---

## Facts this plan depends on (verified against source, 2026-10-06)

Backend (`~/Documents/GitHub/jokefactory_be`, branch `feat/lean-market`, based on `main` 171799e):
- Module path is `jokefactory`; code lives under `src/`. Packages: `jokefactory/src/core/domain`, `.../core/ports`, `.../core/usecase`, `.../core/usecase/testutil` (in-memory `Store`), `.../infra/repo/postgres`, `.../infra/llm`, `.../infra/config`, `.../app/http/dto`, `.../app/http/handler`, `.../app/http/response`. Entry point `main.go` at repo root; wiring in `src/app/server/server.go` and `main.go:61-62`.
- `rounds` columns are listed in `const roundColumns` (`infra/repo/postgres/mapper.go:11-14`) and scanned in `scanRound` (`mapper.go:20-31`); `UpdateRoundConfig` (`round_repo.go:65-92`) and `InsertRoundConfig` (`round_repo.go:94-116`) write them positionally.
- `domain.RoundConfig` / `DefaultRoundConfig` / `ConfigFromRound` in `core/domain/round_config.go`; defaults in `core/domain/defaults.go`; `domain.Round` in `core/domain/entities.go:22-41`; `domain.AICustomer` at `entities.go:90-97`.
- `dto.ConfigRequest` (`app/http/dto/models.go:63-75`) has pointer fields; `InstructorHandler.Config` copies `req.X` into a config at `handler/instructor.go:~55-70`; `InstructorService.Config` validates with `validateRoundConfig` (`usecase/instructor.go:80-104`).
- `dto.PublicRound` / `ToPublicRound` / `InstructorRound` in `app/http/dto/round.go`.
- `AICustomerService` (`usecase/aicustomer.go`): `GenerateCustomers` (l.29), `EvaluatePurchases` (l.51), `Market` (l.217). `ClassificationService.run` calls `s.purchases.EvaluatePurchases` (`usecase/classification.go:119-131`) through the `PurchaseEvaluator` interface (`classification.go:23`).
- `AICustomerRepository` interface at `core/ports/repositories.go:253-264`; postgres impl `infra/repo/postgres/aicustomer_repo.go`; memstore impl `usecase/testutil/memstore.go:806-998`.
- Stats: `GetRoundStatsV2` (`stats_repo.go:204-250`), `GetTeamSummary` (`stats_repo.go:64-125`), memstore equivalents at `memstore.go:1000` and `:1083`. `ports.TeamStats`/`TeamSummary`/`RoundStats` at `core/ports/repositories.go:50-98`. Handlers: `RoundHandler.TeamSummary` (`handler/round.go:38-78`), `InstructorHandler.Stats` (`handler/instructor.go:251-267`).
- `BatchService.Submit` (`usecase/batch.go:30-92`) enforces batch size; `CountSubmittedBatchesForTeam(ctx, roundID, teamID)` exists on the store (`ports/repositories.go:160`, memstore `:422`).
- Errors: `domain.NewConflictError(message)` → `response.Conflict` → HTTP 409 `{"error":{"code":"CONFLICT","message":...}}`. There is no per-error code field, so Lean conflicts carry their identifier in `message`.
- Schema (`src/infra/db/migrations/0001_schema.sql`): `batches(batch_id, round_id, team_id, status, submitted_at, processed_at, …)`, `jokes(joke_id, batch_id, publish_status, published_at, …)`, `joke_fit(joke_id, true_fit)`, `purchase_events(round_id, ai_customer_id, joke_id, team_id, delta ∈ {-1,1}, price, created_at)`, `batch_submission_events(round_id, team_id, batch_id, jokes_count, created_at, …)`, `ai_customers(ai_customer_id, round_id, personal_threshold, starting_budget, remaining_budget, created_at)`. Migration format: `0002_batch_raw_text.sql` (goose `Up`/`Down` with `BEGIN/COMMIT`).
- Classifier selection: `main.go:88-91` — Azure when `cfg.LLM.Enabled()`, else `llm.StubClassifier{}` with model name `"stub"`. `config.LLMConfig` at `infra/config/config.go:62-82` uses `envconfig` tags with prefix `APP_` (so `LLM_MODE` → `APP_LLM_MODE`).
- `go test ./...` baseline: `core/domain/scoring` ok, `core/usecase` ok; other packages have no tests. Local run: `docker-compose.yml` (api on :8081, postgres on :5432), `make migrate-up`, `.env` has DB + `APP_ADMIN_PASSWORD` but no LLM keys.

Frontend (`~/Documents/GitHub/AI-Joke-Factory`, branch `feat/lean-market`, based on `feat/bot-players`):
- `GameConfig` in `types.ts:107-126`; `initialConfig()` in `context.tsx:~465-480`; the round → config mapping happens twice (instructor poll `context.tsx:~611-660`, student poll `~949-999`); `updateConfig` builds the PATCH body at `context.tsx:1536-1560`; `instructorService.updateRoundConfig(round_id, body)` at `services/instructorService.ts:66`.
- API types in `types/api.ts`: `PublicRound` (l.299), `TeamSummaryResponse` (l.513), `TeamStats` (l.965), `RoundStatsResponse` (l.986), `ConfigRequest` (l.877), `TeamBatchJoke` (l.432, has `sold_count`).
- Instructor CONFIG row at `views/Instructor.tsx:~2252-2340` (inputs with `localCostOfPublishing`, `canEditPricing`, `handleUpdateSettings`, `hasPendingConfigChanges`); leaderboard sort keys at `:79-81`, columns at `:276-285`, header cells from `:796`.
- Marketing tiles at `views/QualityControl.tsx:767-775` (`StatBox`), lead time helper `computeAvgCreatedToPublishSeconds`; JM `canSubmit`/`submit` at `views/JokeMaker.tsx:184-189`, Send button `:326`; `addBatch` in `context.tsx:~1700`.
- Bots: `services/bots/personas.ts` (`PERSONAS`, `PERSONA_ORDER`, `publishCount`, `choosePublished`), `engine.ts` (`runJokeMaker` ~l.520-565, Marketing decide step ~l.681-700, `TeamRuntime` l.181), `components/BotPanel.tsx:29` `DEFAULT_COUNTS`, `services/bots/testing/fakeApi.ts`, `services/shared/client.ts` (`teamBatches`, `instructorConfig`, `instructorStats`).
- The pilot harness prototype is in the session scratchpad; the plan rewrites it as `scripts/pilot/lean-pilot.mts`.

## File structure

Backend:
- Create `src/infra/db/migrations/0003_lean_market.sql` — additive columns.
- Modify `core/domain/{defaults.go,round_config.go,entities.go}` — `MarketMode`, lean fields.
- Create `core/domain/market_mode.go` — type and constants.
- Modify `infra/repo/postgres/{mapper.go,round_repo.go,aicustomer_repo.go}` — thread columns; new arrival queries.
- Create `infra/repo/postgres/lean_stats_repo.go` — Lean stats SQL (Classic SQL untouched).
- Modify `core/ports/repositories.go` — new methods and `LeanTeamStats`.
- Modify `usecase/testutil/memstore.go` — in-memory equivalents.
- Create `core/usecase/lean_market.go` — `chooseBasket`, `ServeArrivals`, arrival scheduling helpers.
- Modify `core/usecase/{aicustomer.go,classification.go,batch.go,instructor.go,round.go,stats.go}` — guards and wiring.
- Modify `app/http/dto/{models.go,round.go}`, `app/http/handler/{instructor.go,round.go}` — request/response fields.
- Create `infra/llm/hash_classifier.go`; modify `infra/config/config.go`, `main.go`.

Frontend:
- Modify `types/api.ts`, `types.ts`, `context.tsx`, `services/instructorService.ts`.
- Create `services/leanMode.ts` (+ test) — pure helpers shared by views.
- Create `components/LearningCurve.tsx`, `components/LeanDebrief.tsx`.
- Modify `views/{Instructor,QualityControl,JokeMaker}.tsx`.
- Modify `services/bots/{personas.ts,engine.ts,protocol.ts,testing/fakeApi.ts}`, `components/BotPanel.tsx` (+ tests).
- Create `scripts/pilot/lean-pilot.mts`, `docs/pilots/2026-10-06-lean-pilot.md`, `docs/lean-market-mode.md`.

## Conventions for every task

- Two repos, two branches, both named `feat/lean-market`. Each task says which repo it is in. Commit in that repo only.
- New commits only. Never `git reset`, `commit --amend`, `rebase`, `stash` or `push`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Backend verification per task: `cd ~/Documents/GitHub/jokefactory_be && go build ./... && go vet ./... && go test ./...`.
- Frontend verification per task: `npx tsc --noEmit -p tsconfig.json && npx vitest run`.
- **Classic invariant:** never edit the body of an existing SQL string, an existing Classic branch, or an existing test's expectations. Add beside, branch on `MarketMode`.
- Nothing in this plan deploys anything or touches the live Azure stack. Pilot runs use the local Docker backend.

---

## Phase A — Backend

## Task 1: Migration and domain fields

**Repo:** jokefactory_be
**Files:**
- Create: `src/infra/db/migrations/0003_lean_market.sql`
- Create: `src/core/domain/market_mode.go`
- Modify: `src/core/domain/defaults.go`, `src/core/domain/round_config.go`, `src/core/domain/entities.go:22-41`, `src/core/domain/entities.go:90-97`
- Test: `src/core/domain/market_mode_test.go`

- [ ] **Step 1: Write the failing test**

```go
// src/core/domain/market_mode_test.go
package domain

import "testing"

func TestParseMarketMode(t *testing.T) {
	cases := map[string]struct {
		want MarketMode
		ok   bool
	}{
		"CLASSIC": {MarketClassic, true},
		"LEAN":    {MarketLean, true},
		"lean":    {MarketLean, true},
		"":        {MarketClassic, true},
		"bogus":   {"", false},
	}
	for in, c := range cases {
		got, err := ParseMarketMode(in)
		if c.ok && (err != nil || got != c.want) {
			t.Fatalf("ParseMarketMode(%q) = %q, %v; want %q", in, got, err, c.want)
		}
		if !c.ok && err == nil {
			t.Fatalf("ParseMarketMode(%q) accepted", in)
		}
	}
}

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

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/domain/ -run 'MarketMode|DefaultRoundConfig'`
Expected: compile error, `undefined: MarketMode`.

- [ ] **Step 3: Implement**

```go
// src/core/domain/market_mode.go
package domain

import (
	"fmt"
	"strings"
)

// MarketMode selects how AI customers buy and how profit is computed.
//
// CLASSIC is the game as shipped: every customer shops the moment a joke is
// classified and swaps for better jokes later. LEAN is the opt-in mode in
// which customers arrive steadily, shop once, and teams pay setup and carrying
// costs. Every Lean rule in the code base is guarded by this value, so a
// CLASSIC round runs the original code paths untouched.
type MarketMode string

const (
	MarketClassic MarketMode = "CLASSIC"
	MarketLean    MarketMode = "LEAN"
)

// ParseMarketMode accepts either mode case-insensitively; "" means CLASSIC.
func ParseMarketMode(raw string) (MarketMode, error) {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "", string(MarketClassic):
		return MarketClassic, nil
	case string(MarketLean):
		return MarketLean, nil
	}
	return "", fmt.Errorf("unknown market_mode %q", raw)
}

func (m MarketMode) IsLean() bool { return m == MarketLean }
```

Append to `defaults.go` inside the `const (...)` block:

```go
	DefaultMarketMode                = MarketClassic
	DefaultArrivalWindowSeconds      = 900
	DefaultSetupCostPerBatch         = 0.0
	DefaultCarryingCostPerJokeMinute = 0.0
	DefaultWIPLimit                  = 0
	DefaultPreferenceBase            = 2.0
```

In `round_config.go`, add to `RoundConfig` (after `FeedbackPassThreshold`):

```go
	// Lean market mode (see market_mode.go). Ignored when MarketMode is CLASSIC.
	MarketMode                MarketMode
	ArrivalWindowSeconds      int
	SetupCostPerBatch         float64
	CarryingCostPerJokeMinute float64
	WIPLimit                  int
	PreferenceBase            float64
```

Add the same six fields to `DefaultRoundConfig()` (from the defaults) and to `ConfigFromRound()` (from `r.MarketMode` etc.). Add the same six fields, same names and types, to `domain.Round` after `FeedbackPassThreshold`.

Add to `domain.AICustomer`:

```go
	// Lean mode only. ArrivesAt is when this customer shops; ShoppedAt is set
	// once they have, so they are never served twice. Both nil in CLASSIC.
	ArrivesAt *time.Time
	ShoppedAt *time.Time
```

Migration:

```sql
-- src/infra/db/migrations/0003_lean_market.sql
-- +goose Up
BEGIN;

-- Lean market mode. Every column has a default that reproduces CLASSIC
-- behaviour, so existing rows and requests are unaffected.
ALTER TABLE rounds
  ADD COLUMN market_mode                   TEXT          NOT NULL DEFAULT 'CLASSIC'
    CHECK (market_mode IN ('CLASSIC', 'LEAN')),
  ADD COLUMN arrival_window_seconds        INT           NOT NULL DEFAULT 900  CHECK (arrival_window_seconds >= 1),
  ADD COLUMN setup_cost_per_batch          NUMERIC(8,2)  NOT NULL DEFAULT 0    CHECK (setup_cost_per_batch >= 0),
  ADD COLUMN carrying_cost_per_joke_minute NUMERIC(8,4)  NOT NULL DEFAULT 0    CHECK (carrying_cost_per_joke_minute >= 0),
  ADD COLUMN wip_limit                     INT           NOT NULL DEFAULT 0    CHECK (wip_limit >= 0),
  ADD COLUMN preference_base               NUMERIC(6,2)  NOT NULL DEFAULT 2    CHECK (preference_base > 1);

-- Lean customers arrive over the round and shop once. NULL in CLASSIC.
ALTER TABLE ai_customers
  ADD COLUMN arrives_at TIMESTAMPTZ NULL,
  ADD COLUMN shopped_at TIMESTAMPTZ NULL;

CREATE INDEX idx_ai_customers_due
  ON ai_customers (round_id, arrives_at)
  WHERE shopped_at IS NULL AND arrives_at IS NOT NULL;

COMMIT;

-- +goose Down
BEGIN;
DROP INDEX IF EXISTS idx_ai_customers_due;
ALTER TABLE ai_customers DROP COLUMN arrives_at, DROP COLUMN shopped_at;
ALTER TABLE rounds
  DROP COLUMN market_mode, DROP COLUMN arrival_window_seconds, DROP COLUMN setup_cost_per_batch,
  DROP COLUMN carrying_cost_per_joke_minute, DROP COLUMN wip_limit, DROP COLUMN preference_base;
COMMIT;
```

- [ ] **Step 4: Run tests**

Run: `go build ./... && go test ./src/core/domain/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infra/db/migrations/0003_lean_market.sql src/core/domain/
git commit -m "feat(lean): market mode and lean round settings in the domain

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: Persist and expose the lean settings

**Repo:** jokefactory_be
**Files:**
- Modify: `src/infra/repo/postgres/mapper.go:11-31`, `src/infra/repo/postgres/round_repo.go:65-116`
- Modify: `src/core/usecase/instructor.go:80-104` (validation)
- Modify: `src/app/http/dto/models.go:63-75`, `src/app/http/dto/round.go`, `src/app/http/handler/instructor.go` (Config)
- Modify: `src/core/usecase/testutil/memstore.go` (round config copy)
- Test: `src/core/usecase/lean_config_test.go`

- [ ] **Step 1: Write the failing test**

Find how existing usecase tests construct an `InstructorService` over the memstore (`grep -n "NewInstructorService" src/core/usecase/*_test.go`) and copy that setup.

```go
// src/core/usecase/lean_config_test.go
package usecase

import (
	"context"
	"log/slog"
	"testing"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
)

func TestConfigPersistsLeanSettings(t *testing.T) {
	st := testutil.NewStore()
	svc := NewInstructorService(st, nil, slog.Default())
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketLean
	cfg.ArrivalWindowSeconds = 300
	cfg.SetupCostPerBatch = 3
	cfg.CarryingCostPerJokeMinute = 0.02
	cfg.WIPLimit = 2
	cfg.PreferenceBase = 3

	res, err := svc.Config(context.Background(), 1, &cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	got := domain.ConfigFromRound(res.Round)
	if got.MarketMode != domain.MarketLean || got.ArrivalWindowSeconds != 300 || got.SetupCostPerBatch != 3 ||
		got.CarryingCostPerJokeMinute != 0.02 || got.WIPLimit != 2 || got.PreferenceBase != 3 {
		t.Fatalf("lean settings not persisted: %+v", got)
	}
}

func TestConfigRejectsBadLeanSettings(t *testing.T) {
	st := testutil.NewStore()
	svc := NewInstructorService(st, nil, slog.Default())
	for name, mutate := range map[string]func(*domain.RoundConfig){
		"window":   func(c *domain.RoundConfig) { c.ArrivalWindowSeconds = 0 },
		"setup":    func(c *domain.RoundConfig) { c.SetupCostPerBatch = -1 },
		"carrying": func(c *domain.RoundConfig) { c.CarryingCostPerJokeMinute = -0.1 },
		"wip":      func(c *domain.RoundConfig) { c.WIPLimit = -1 },
		"base":     func(c *domain.RoundConfig) { c.PreferenceBase = 1 },
		"mode":     func(c *domain.RoundConfig) { c.MarketMode = "SIDEWAYS" },
	} {
		cfg := domain.DefaultRoundConfig()
		mutate(&cfg)
		if _, err := svc.Config(context.Background(), 1, &cfg, nil); !domain.IsValidation(err) {
			t.Fatalf("%s: want validation error, got %v", name, err)
		}
	}
}
```

If the memstore's `InsertRoundConfig`/`UpdateRoundConfig` copy fields one by one, the first test fails until Step 3 adds the six fields there too. If `domain.IsValidation` does not exist, use whatever predicate `errors.go` offers for validation errors (`grep -n "func Is" src/core/domain/errors.go`).

- [ ] **Step 2: Run it to verify it fails**

Run: `go test ./src/core/usecase/ -run 'LeanSettings'`
Expected: FAIL (settings not persisted / no validation).

- [ ] **Step 3: Implement**

`mapper.go`: append to `roundColumns` after `is_popped_active`:

```go
	, market_mode, arrival_window_seconds, setup_cost_per_batch,
	carrying_cost_per_joke_minute, wip_limit, preference_base
```

and extend `scanRound`'s `row.Scan(...)` with, in the same order, `&rd.MarketMode, &rd.ArrivalWindowSeconds, &rd.SetupCostPerBatch, &rd.CarryingCostPerJokeMinute, &rd.WIPLimit, &rd.PreferenceBase`. (`MarketMode` is a string type, so pgx scans a TEXT column into it directly.)

`round_repo.go` `UpdateRoundConfig`: add to the `SET` list

```sql
		    market_mode = $13,
		    arrival_window_seconds = $14,
		    setup_cost_per_batch = $15,
		    carrying_cost_per_joke_minute = $16,
		    wip_limit = $17,
		    preference_base = $18
```

and append the arguments `string(cfg.MarketMode), cfg.ArrivalWindowSeconds, cfg.SetupCostPerBatch, cfg.CarryingCostPerJokeMinute, cfg.WIPLimit, cfg.PreferenceBase`. In `InsertRoundConfig`, add the six column names to the `INSERT` list, `$14 … $19` to `VALUES`, and the same six arguments.

`usecase/instructor.go` `validateRoundConfig`, before `return nil`:

```go
	if _, err := domain.ParseMarketMode(string(cfg.MarketMode)); err != nil {
		return domain.NewValidationError("market_mode", "must be CLASSIC or LEAN")
	}
	if cfg.MarketMode == "" {
		cfg.MarketMode = domain.MarketClassic
	}
	if cfg.ArrivalWindowSeconds < 1 {
		return domain.NewValidationError("arrival_window_seconds", "must be >= 1")
	}
	if cfg.SetupCostPerBatch < 0 || cfg.CarryingCostPerJokeMinute < 0 {
		return domain.NewValidationError("config", "lean costs must be >= 0")
	}
	if cfg.WIPLimit < 0 {
		return domain.NewValidationError("wip_limit", "must be >= 0")
	}
	if cfg.PreferenceBase <= 1 {
		return domain.NewValidationError("preference_base", "must be > 1")
	}
```

`dto/models.go` `ConfigRequest`: add

```go
	MarketMode                *string  `json:"market_mode"`
	ArrivalWindowSeconds      *int     `json:"arrival_window_seconds"`
	SetupCostPerBatch         *float64 `json:"setup_cost_per_batch"`
	CarryingCostPerJokeMinute *float64 `json:"carrying_cost_per_joke_minute"`
	WIPLimit                  *int     `json:"wip_limit"`
	PreferenceBase            *float64 `json:"preference_base"`
```

`handler/instructor.go` `Config`: read how the existing pointer fields reach `domain.RoundConfig` (missing values fall back to the current round's values) and thread the six new fields the same way, converting `MarketMode` with `domain.MarketMode(*req.MarketMode)` when present.

`dto/round.go`: add to `PublicRound`

```go
	MarketMode                string  `json:"market_mode"`
	ArrivalWindowSeconds      int     `json:"arrival_window_seconds"`
	SetupCostPerBatch         float64 `json:"setup_cost_per_batch"`
	CarryingCostPerJokeMinute float64 `json:"carrying_cost_per_joke_minute"`
	WIPLimit                  int     `json:"wip_limit"`
```

set them in `ToPublicRound` (`MarketMode: string(rd.MarketMode)` …), and add `PreferenceBase float64 \`json:"preference_base"\`` to `InstructorRound`, set in `ToInstructorRound`. `preference_base` is instructor-only, like `buy_threshold`.

`memstore.go`: wherever `UpdateRoundConfig`/`InsertRoundConfig` copy config fields onto the stored round, copy the six new ones too.

- [ ] **Step 4: Run tests**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: all PASS, including the two new tests.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(lean): persist, validate and expose the lean round settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: Arrival schedule and the weighted basket (pure logic)

**Repo:** jokefactory_be
**Files:**
- Create: `src/core/usecase/lean_market.go`
- Test: `src/core/usecase/lean_market_test.go`

- [ ] **Step 1: Write the failing tests**

```go
// src/core/usecase/lean_market_test.go
package usecase

import (
	"math/rand"
	"testing"
	"time"

	"jokefactory/src/core/ports"
)

func TestArrivalTimesSpanTheWindow(t *testing.T) {
	start := time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC)
	got := arrivalTimes(start, 300, 4, rand.New(rand.NewSource(1)))
	if len(got) != 4 {
		t.Fatalf("len %d", len(got))
	}
	// Multiset of offsets is {75,150,225,300}s regardless of shuffle order.
	seen := map[int]bool{}
	for _, at := range got {
		seen[int(at.Sub(start).Seconds())] = true
	}
	for _, want := range []int{75, 150, 225, 300} {
		if !seen[want] {
			t.Fatalf("missing offset %ds in %v", want, got)
		}
	}
}

func TestChooseBasketPrefersHigherFit(t *testing.T) {
	cands := []ports.CandidateJoke{
		{JokeID: 1, TeamID: 1, TrueFit: 7},
		{JokeID: 2, TeamID: 2, TrueFit: 11},
	}
	rng := rand.New(rand.NewSource(7))
	wins := 0
	for i := 0; i < 2000; i++ {
		if chooseBasket(cands, 1, 2, rng)[0].JokeID == 2 {
			wins++
		}
	}
	// weight 2^11 vs 2^7 = 16:1 → P(2) = 16/17 ≈ 0.94
	if wins < 1800 || wins > 1960 {
		t.Fatalf("higher fit chosen %d/2000, want ≈1880", wins)
	}
}

func TestChooseBasketIsWithoutReplacementAndBounded(t *testing.T) {
	cands := []ports.CandidateJoke{{JokeID: 1, TrueFit: 8}, {JokeID: 2, TrueFit: 8}}
	got := chooseBasket(cands, 5, 2, rand.New(rand.NewSource(3)))
	if len(got) != 2 || got[0].JokeID == got[1].JokeID {
		t.Fatalf("got %+v", got)
	}
	if n := len(chooseBasket(nil, 3, 2, rand.New(rand.NewSource(3)))); n != 0 {
		t.Fatalf("empty candidates gave %d", n)
	}
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `go test ./src/core/usecase/ -run 'Arrival|ChooseBasket'`
Expected: compile error, `undefined: arrivalTimes`.

- [ ] **Step 3: Implement**

```go
// src/core/usecase/lean_market.go
package usecase

import (
	"math"
	"math/rand"
	"time"

	"jokefactory/src/core/ports"
)

// Lean market mode: customers arrive steadily and shop once.
//
// WHY LAZY: there is no scheduler in this backend. Arrival times are stamped
// at round start and served by ServeArrivals (aicustomer.go) whenever the
// round is polled or a batch is classified. Every client polls every 2.5s, so
// customers are served within seconds of their arrival time, and when nothing
// is due the check is one indexed query.

// arrivalTimes spreads n arrivals evenly over window seconds after start:
// offsets (i+1)·window/n for i in 0..n-1, returned in shuffled order so a
// customer's position in the generation loop (and so their threshold jitter)
// is uncorrelated with when they arrive.
func arrivalTimes(start time.Time, windowSeconds, n int, rng *rand.Rand) []time.Time {
	out := make([]time.Time, n)
	for i := 0; i < n; i++ {
		offset := time.Duration(float64(windowSeconds) * float64(i+1) / float64(n) * float64(time.Second))
		out[i] = start.Add(offset)
	}
	rng.Shuffle(n, func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

// chooseBasket picks up to n candidates without replacement, each pick
// weighted by base^TrueFit. With base 2, a joke one fit point higher is twice
// as likely to be chosen — better jokes sell more, good jokes still sell.
// Fit is bounded 0..12, so weights stay below 2^12·… and never overflow.
func chooseBasket(cands []ports.CandidateJoke, n int, base float64, rng *rand.Rand) []ports.CandidateJoke {
	pool := append([]ports.CandidateJoke(nil), cands...)
	out := make([]ports.CandidateJoke, 0, n)
	for len(out) < n && len(pool) > 0 {
		total := 0.0
		weights := make([]float64, len(pool))
		for i, c := range pool {
			weights[i] = math.Pow(base, c.TrueFit)
			total += weights[i]
		}
		r := rng.Float64() * total
		idx := len(pool) - 1
		acc := 0.0
		for i, w := range weights {
			acc += w
			if r < acc {
				idx = i
				break
			}
		}
		out = append(out, pool[idx])
		pool = append(pool[:idx], pool[idx+1:]...)
	}
	return out
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./src/core/usecase/ -run 'Arrival|ChooseBasket' -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/usecase/lean_market.go src/core/usecase/lean_market_test.go
git commit -m "feat(lean): arrival schedule and fit-weighted basket

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: Serve arrivals — store methods and the use case

**Repo:** jokefactory_be
**Files:**
- Modify: `src/core/ports/repositories.go:253-264` (interface), `src/infra/repo/postgres/aicustomer_repo.go`, `src/core/usecase/testutil/memstore.go`
- Modify: `src/core/usecase/aicustomer.go` (GenerateCustomers, new ServeArrivals)
- Test: `src/core/usecase/lean_serve_test.go`

- [ ] **Step 1: Write the failing tests**

Look at `aicustomer_test.go:15-80` for how it seeds a round, a team, published jokes with fits and customers in the memstore, and reuse those helpers (`grep -n "^func " src/core/usecase/test_helpers_test.go src/core/usecase/testutil/helpers.go`).

```go
// src/core/usecase/lean_serve_test.go
package usecase

import (
	"context"
	"log/slog"
	"math/rand"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
)

// leanRound seeds a LEAN round with two published, classified jokes (fit 11
// and fit 7) on two teams and returns the round and the joke ids.
func leanRound(t *testing.T, st *testutil.Store) (*domain.Round, int64, int64) {
	t.Helper()
	// Use the existing seeding helpers from aicustomer_test.go here; the round
	// must be ACTIVE with StartedAt set, MarketMode LEAN, CustomerCount 10,
	// CustomerBudget 3, MarketPrice 1, BuyThreshold 7, Jitter 0,
	// ArrivalWindowSeconds 100, PreferenceBase 2.
	panic("replace with the shared seeding helper")
}

func TestLeanCustomersAreStampedWithArrivals(t *testing.T) {
	st := testutil.NewStore()
	round, _, _ := leanRound(t, st)
	svc := NewAICustomerService(st, rand.New(rand.NewSource(1)), slog.Default())
	if err := svc.GenerateCustomers(context.Background(), round); err != nil {
		t.Fatal(err)
	}
	custs, _ := st.ListAICustomers(context.Background(), round.ID)
	if len(custs) != 10 {
		t.Fatalf("len %d", len(custs))
	}
	for _, c := range custs {
		if c.ArrivesAt == nil || c.ShoppedAt != nil {
			t.Fatalf("customer not scheduled: %+v", c)
		}
		off := c.ArrivesAt.Sub(*round.StartedAt).Seconds()
		if off < 10 || off > 100 {
			t.Fatalf("arrival offset %.0fs outside window", off)
		}
	}
}

func TestServeArrivalsServesOnlyDueCustomersOnce(t *testing.T) {
	st := testutil.NewStore()
	round, hi, lo := leanRound(t, st)
	svc := NewAICustomerService(st, rand.New(rand.NewSource(1)), slog.Default())
	_ = svc.GenerateCustomers(context.Background(), round)

	halfway := round.StartedAt.Add(50 * time.Second)
	if err := svc.ServeArrivals(context.Background(), round.ID, halfway); err != nil {
		t.Fatal(err)
	}
	served := 0
	for _, c := range mustList(t, st, round.ID) {
		if c.ShoppedAt != nil {
			served++
			if c.RemainingBudget != 1 { // budget 3, price 1, two candidates → bought both
				t.Fatalf("budget %.2f after shopping", c.RemainingBudget)
			}
		}
	}
	if served != 5 {
		t.Fatalf("served %d at halfway, want 5", served)
	}

	// Serving again at the same instant does nothing new.
	_ = svc.ServeArrivals(context.Background(), round.ID, halfway)
	if n := countServed(t, st, round.ID); n != 5 {
		t.Fatalf("re-serve changed count to %d", n)
	}

	// Everyone is served by the end of the window; the fit-11 joke sold to all 10.
	_ = svc.ServeArrivals(context.Background(), round.ID, round.StartedAt.Add(100*time.Second))
	if n := countServed(t, st, round.ID); n != 10 {
		t.Fatalf("served %d at window end", n)
	}
	if sold := soldCount(t, st, hi); sold != 10 {
		t.Fatalf("fit-11 joke sold %d times", sold)
	}
	if sold := soldCount(t, st, lo); sold != 10 {
		t.Fatalf("fit-7 joke sold %d times (budget allows both)", sold)
	}
}

func TestServeArrivalsSkipsJokesBelowThreshold(t *testing.T) {
	st := testutil.NewStore()
	round, hi, lo := leanRound(t, st)
	round.BuyThreshold = 9 // fit-7 joke no longer qualifies
	st.Rounds[round.ID] = round
	svc := NewAICustomerService(st, rand.New(rand.NewSource(1)), slog.Default())
	_ = svc.GenerateCustomers(context.Background(), round)
	_ = svc.ServeArrivals(context.Background(), round.ID, round.StartedAt.Add(time.Hour))
	if soldCount(t, st, lo) != 0 || soldCount(t, st, hi) != 10 {
		t.Fatalf("threshold ignored: lo=%d hi=%d", soldCount(t, st, lo), soldCount(t, st, hi))
	}
}

func TestServeArrivalsIsANoOpInClassic(t *testing.T) {
	st := testutil.NewStore()
	round, _, _ := leanRound(t, st)
	round.MarketMode = domain.MarketClassic
	st.Rounds[round.ID] = round
	svc := NewAICustomerService(st, rand.New(rand.NewSource(1)), slog.Default())
	_ = svc.GenerateCustomers(context.Background(), round)
	for _, c := range mustList(t, st, round.ID) {
		if c.ArrivesAt != nil {
			t.Fatal("classic customers must not be scheduled")
		}
	}
	if err := svc.ServeArrivals(context.Background(), round.ID, time.Now()); err != nil {
		t.Fatal(err)
	}
	if countServed(t, st, round.ID) != 0 {
		t.Fatal("classic customers were served")
	}
}
```

Write `mustList`, `countServed` and `soldCount` as small helpers in the same file over the memstore's `ListAICustomers` and `Purchases` map. Replace the `panic` in `leanRound` with real seeding using the file's existing helpers.

- [ ] **Step 2: Run them to verify they fail**

Run: `go test ./src/core/usecase/ -run 'Lean|ServeArrivals'`
Expected: compile error, `svc.ServeArrivals undefined`.

- [ ] **Step 3: Implement**

`ports/repositories.go`, add to `AICustomerRepository`:

```go
	// ClaimDueCustomers atomically marks every customer of the round whose
	// arrives_at <= now and shopped_at IS NULL as shopped (shopped_at = now)
	// and returns them. Two concurrent callers can never claim the same
	// customer. Lean mode only.
	ClaimDueCustomers(ctx context.Context, roundID int64, now time.Time) ([]domain.AICustomer, error)
	// ListPublishedCandidates returns every published, classified joke in the
	// round with its team and true fit — the shelf a Lean customer shops from.
	ListPublishedCandidates(ctx context.Context, roundID int64) ([]CandidateJoke, error)
```

`aicustomer_repo.go`:

```go
func (r *Repositories) ClaimDueCustomers(ctx context.Context, roundID int64, now time.Time) ([]domain.AICustomer, error) {
	rows, err := r.pg.Pool.Query(ctx, `
		UPDATE ai_customers
		SET shopped_at = $2
		WHERE round_id = $1 AND shopped_at IS NULL AND arrives_at IS NOT NULL AND arrives_at <= $2
		RETURNING ai_customer_id, round_id, personal_threshold, starting_budget, remaining_budget,
		          created_at, arrives_at, shopped_at`, roundID, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.AICustomer
	for rows.Next() {
		var c domain.AICustomer
		if err := rows.Scan(&c.ID, &c.RoundID, &c.PersonalThreshold, &c.StartingBudget, &c.RemainingBudget,
			&c.CreatedAt, &c.ArrivesAt, &c.ShoppedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repositories) ListPublishedCandidates(ctx context.Context, roundID int64) ([]ports.CandidateJoke, error) {
	rows, err := r.pg.Pool.Query(ctx, `
		SELECT j.joke_id, b.team_id, b.round_id, jf.true_fit
		FROM jokes j
		JOIN batches b ON b.batch_id = j.batch_id
		JOIN joke_fit jf ON jf.joke_id = j.joke_id
		WHERE b.round_id = $1 AND j.publish_status = 'PUBLISHED'`, roundID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ports.CandidateJoke
	for rows.Next() {
		var c ports.CandidateJoke
		if err := rows.Scan(&c.JokeID, &c.TeamID, &c.RoundID, &c.TrueFit); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
```

Check `ports.CandidateJoke` has `RoundID`; if not, scan into a discard variable. Also update `ReplaceAICustomers` to insert `arrives_at` (`c.ArrivesAt`, nullable) and `ListAICustomers` to select and scan `arrives_at, shopped_at`.

`memstore.go`: implement both methods over the maps (`ClaimDueCustomers` iterates `AICustomers` for the round, sets `ShoppedAt = &now` where due, returns copies; `ListPublishedCandidates` walks `Batches`/jokes and `JokeFits` for published jokes in the round). `ReplaceAICustomers` must keep `ArrivesAt`.

`usecase/aicustomer.go` — in `GenerateCustomers`, after the loop builds `customers` and before `ReplaceAICustomers`:

```go
	if round.MarketMode.IsLean() {
		start := time.Now().UTC()
		if round.StartedAt != nil {
			start = *round.StartedAt
		}
		arrivals := arrivalTimes(start, round.ArrivalWindowSeconds, len(customers), s.rng)
		for i := range customers {
			at := arrivals[i]
			customers[i].ArrivesAt = &at
		}
	}
```

and add:

```go
// ServeArrivals serves every Lean customer whose arrival time has passed.
// Each one shops once from the current shelf (ListPublishedCandidates),
// buying up to budget/price jokes by fit-weighted choice, then never shops
// again. A no-op for CLASSIC rounds and for rounds that are not ACTIVE.
func (s *AICustomerService) ServeArrivals(ctx context.Context, roundID int64, now time.Time) error {
	round, err := s.repo.GetRoundByID(ctx, roundID)
	if err != nil {
		return err
	}
	if !round.MarketMode.IsLean() || round.Status != domain.RoundActive {
		return nil
	}
	due, err := s.repo.ClaimDueCustomers(ctx, roundID, now)
	if err != nil || len(due) == 0 {
		return err
	}
	shelf, err := s.repo.ListPublishedCandidates(ctx, roundID)
	if err != nil {
		return err
	}
	for i := range due {
		s.serveOne(ctx, round, &due[i], shelf)
	}
	return nil
}

func (s *AICustomerService) serveOne(ctx context.Context, round *domain.Round, c *domain.AICustomer, shelf []ports.CandidateJoke) {
	qualifying := make([]ports.CandidateJoke, 0, len(shelf))
	for _, j := range shelf {
		if j.TrueFit >= c.PersonalThreshold {
			qualifying = append(qualifying, j)
		}
	}
	if round.MarketPrice <= 0 {
		return
	}
	n := int(math.Floor(c.RemainingBudget / round.MarketPrice))
	for _, pick := range chooseBasket(qualifying, n, round.PreferenceBase, s.rng) {
		if err := s.repo.BuyJoke(ctx, round.ID, c.ID, pick.JokeID, pick.TeamID, round.MarketPrice); err != nil {
			if !domain.IsConflict(err) {
				s.log.Error("lean purchase failed", "round_id", round.ID, "ai_customer_id", c.ID, "joke_id", pick.JokeID, "error", err)
			}
		}
	}
}
```

Add `"math"` to the imports.

- [ ] **Step 4: Run tests**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: all PASS. The existing `TestSwapWhenOutOfBudget` and `TestBelowThresholdSkipped` (Classic) must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(lean): customers arrive on a schedule and shop once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: Wire arrivals into classification and the polled reads; WIP limit

**Repo:** jokefactory_be
**Files:**
- Modify: `src/core/usecase/classification.go:23-27,119-131`, `src/core/usecase/aicustomer.go` (Market), `src/core/usecase/round.go`, `src/core/usecase/stats.go`, `src/core/usecase/instructor.go` (Stats), `src/core/usecase/batch.go:60-92`
- Modify: `src/app/server/server.go:64-68`, `main.go` as needed for constructor changes
- Test: `src/core/usecase/lean_wiring_test.go`

- [ ] **Step 1: Write the failing tests**

```go
// src/core/usecase/lean_wiring_test.go
package usecase

import (
	"context"
	"log/slog"
	"math/rand"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
)

func TestSubmitRefusesWhenWIPLimitReached(t *testing.T) {
	st := testutil.NewStore()
	round, _, _ := leanRound(t, st) // from lean_serve_test.go
	round.WIPLimit = 1
	st.Rounds[round.ID] = round
	jm, teamID := seedJokeMaker(t, st) // helper: a JM user on a team in this round
	svc := NewBatchService(st, slog.Default())

	jokes := []string{"a", "b", "c", "d", "e"}
	if _, err := svc.Submit(context.Background(), jm, round.ID, teamID, jokes, ""); err != nil {
		t.Fatalf("first submit: %v", err)
	}
	_, err := svc.Submit(context.Background(), jm, round.ID, teamID, jokes, "")
	if !domain.IsConflict(err) || err.Error() == "" || !contains(err.Error(), "WIP_LIMIT_REACHED") {
		t.Fatalf("want WIP_LIMIT_REACHED conflict, got %v", err)
	}
}

func TestSubmitIgnoresWIPLimitInClassic(t *testing.T) {
	st := testutil.NewStore()
	round, _, _ := leanRound(t, st)
	round.MarketMode = domain.MarketClassic
	round.WIPLimit = 1
	st.Rounds[round.ID] = round
	jm, teamID := seedJokeMaker(t, st)
	svc := NewBatchService(st, slog.Default())
	jokes := []string{"a", "b", "c", "d", "e"}
	for i := 0; i < 3; i++ {
		if _, err := svc.Submit(context.Background(), jm, round.ID, teamID, jokes, ""); err != nil {
			t.Fatalf("submit %d: %v", i, err)
		}
	}
}

func TestClassificationServesArrivalsInLeanInsteadOfEvaluating(t *testing.T) {
	// The classification service calls ServeArrivals (not EvaluatePurchases)
	// when the round is LEAN. Use a recording PurchaseEvaluator.
	rec := &recordingEvaluator{}
	st := testutil.NewStore()
	round, _, _ := leanRound(t, st)
	svc := NewClassificationService(st, stubClassifierForTests(), rec, "stub", slog.Default())
	batchID := seedPublishedBatchAwaitingClassification(t, st, round.ID) // helper from classification_test.go
	if err := svc.ProcessBatch(context.Background(), batchID); err != nil {
		t.Fatal(err)
	}
	if rec.served != 1 || rec.evaluated != 0 {
		t.Fatalf("lean: served=%d evaluated=%d", rec.served, rec.evaluated)
	}
}

type recordingEvaluator struct{ served, evaluated int }

func (r *recordingEvaluator) EvaluatePurchases(context.Context, int64, []int64) error { r.evaluated++; return nil }
func (r *recordingEvaluator) ServeArrivals(context.Context, int64, time.Time) error  { r.served++; return nil }

func TestMarketReadServesArrivals(t *testing.T) {
	st := testutil.NewStore()
	round, hi, _ := leanRound(t, st)
	svc := NewAICustomerService(st, rand.New(rand.NewSource(1)), slog.Default())
	_ = svc.GenerateCustomers(context.Background(), round)
	// Make every customer due by moving the round start into the past.
	past := time.Now().Add(-time.Hour)
	round.StartedAt = &past
	st.Rounds[round.ID] = round
	for _, c := range mustList(t, st, round.ID) {
		at := past.Add(time.Second)
		c.ArrivesAt = &at
		st.AICustomers[c.ID] = &c
	}
	viewer := seedAnyUser(t, st)
	if _, err := svc.Market(context.Background(), viewer, round.ID); err != nil {
		t.Fatal(err)
	}
	if soldCount(t, st, hi) == 0 {
		t.Fatal("reading the market did not serve due customers")
	}
}
```

Adapt the helper names (`seedJokeMaker`, `seedAnyUser`, `seedPublishedBatchAwaitingClassification`, `stubClassifierForTests`, `contains`) to whatever the existing test files already provide; write small ones where they do not exist.

- [ ] **Step 2: Run to verify they fail**

Run: `go test ./src/core/usecase/ -run 'WIP|ClassificationServes|MarketRead'`
Expected: FAIL / compile errors (`ServeArrivals` missing on the evaluator interface, no WIP check).

- [ ] **Step 3: Implement**

`classification.go` — extend the interface and the call site:

```go
type PurchaseEvaluator interface {
	EvaluatePurchases(ctx context.Context, roundID int64, jokeIDs []int64) error
	// ServeArrivals is the Lean-mode counterpart: newly classified jokes join
	// the shelf and every customer whose arrival time has passed shops once.
	ServeArrivals(ctx context.Context, roundID int64, now time.Time) error
}
```

Replace the `if s.purchases != nil { … EvaluatePurchases … }` block with:

```go
	if s.purchases != nil {
		round, rerr := s.repo.GetRoundByID(ctx, job.RoundID)
		if rerr != nil {
			return rerr
		}
		var perr error
		if round.MarketMode.IsLean() {
			perr = s.purchases.ServeArrivals(ctx, job.RoundID, time.Now().UTC())
		} else {
			ids := make([]int64, len(fits))
			for i := range fits {
				ids[i] = fits[i].JokeID
			}
			perr = s.purchases.EvaluatePurchases(ctx, job.RoundID, ids)
		}
		if perr != nil {
			s.log.Error("purchase evaluation failed after classification",
				"batch_id", job.BatchID, "round_id", job.RoundID, "error", perr)
		}
	}
```

Fix any test double in `classification_test.go` that implements `PurchaseEvaluator` by adding a no-op `ServeArrivals`.

`aicustomer.go` `Market`: after the status check and before `ListMarket`, add

```go
	if round.MarketMode.IsLean() && round.Status == domain.RoundActive {
		if err := s.ServeArrivals(ctx, roundID, time.Now().UTC()); err != nil {
			s.log.Error("serve arrivals on market read", "round_id", roundID, "error", err)
		}
	}
```

`stats.go`: give `StatsService` an optional `arrivals interface{ ServeArrivals(context.Context, int64, time.Time) error }` field, set by a new constructor `NewStatsServiceWithArrivals(repo, arrivals, log)`; keep `NewStatsService` as is (it passes nil). In `GetRoundStats` and `GetTeamSummary`, first:

```go
	if s.arrivals != nil {
		if round, err := s.repo.GetRoundByID(ctx, roundID); err == nil && round.MarketMode.IsLean() && round.Status == domain.RoundActive {
			if err := s.arrivals.ServeArrivals(ctx, roundID, time.Now().UTC()); err != nil {
				s.log.Error("serve arrivals on stats read", "round_id", roundID, "error", err)
			}
		}
	}
```

`round.go`: add `NewRoundServiceWithArrivals(repo, arrivals, log)` that builds the stats service with arrivals; `instructor.go` `Stats` should go through a `StatsService` built with `aiCustomers` (add a `stats *StatsService` field set in `NewInstructorService` via `NewStatsServiceWithArrivals(repo, aiCustomers, log)`; when `aiCustomers` is nil pass nil). In `server.go`, construct `roundService := usecase.NewRoundServiceWithArrivals(repo, aiCustomers, log)` — check how `aiCustomers` reaches `server.go` (it is created in `main.go:61` and passed in; follow the existing path used for `NewInstructorService`).

`batch.go` `Submit`: after the `round.Status != domain.RoundActive` check:

```go
	// Lean pull rule: with a WIP limit, the Joke Maker cannot push another
	// batch while Marketing already has wip_limit batches waiting.
	if round.MarketMode.IsLean() && round.WIPLimit > 0 {
		waiting, err := s.repo.CountSubmittedBatchesForTeam(ctx, roundID, teamID)
		if err != nil {
			return nil, err
		}
		if waiting >= round.WIPLimit {
			return nil, domain.NewConflictError(fmt.Sprintf("WIP_LIMIT_REACHED: %d of %d batches waiting", waiting, round.WIPLimit))
		}
	}
```

- [ ] **Step 4: Run tests**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ main.go
git commit -m "feat(lean): serve arrivals from classification and polls; WIP limit on submit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: Lean stats — ports, SQL, memstore, handlers

**Repo:** jokefactory_be
**Files:**
- Modify: `src/core/ports/repositories.go:50-98,185-191`
- Create: `src/infra/repo/postgres/lean_stats_repo.go`
- Modify: `src/core/usecase/testutil/memstore.go`, `src/core/usecase/stats.go`
- Modify: `src/app/http/handler/round.go:55-77`, `src/app/http/handler/instructor.go:263-266`
- Test: `src/core/usecase/lean_stats_test.go`

- [ ] **Step 1: Write the failing test**

```go
// src/core/usecase/lean_stats_test.go
package usecase

import (
	"context"
	"log/slog"
	"math"
	"testing"
	"time"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
)

// One team, one batch of 5 submitted at T, processed at T+6min with 3
// published and 2 discarded; one published joke sold at T+10min; now = T+16min;
// setup $3, carrying $0.02/joke-min, price $1, publishing $0.10, discard $0.01.
//
//   WIP:        5 jokes × 6 min                     = 30 joke-min
//   Inventory:  sold joke 4 min (6→10) + 2 unsold × 10 min (6→16) = 24 joke-min
//   carrying = 0.02 × 54 = 1.08 ; setup = 3
//   profit   = 1×1 − 3×0.10 − 2×0.01 − 3 − 1.08 = −3.40
func TestLeanStatsComputeSetupAndCarrying(t *testing.T) {
	st := testutil.NewStore()
	round, teamID := seedLeanStatsFixture(t, st) // builds exactly the scenario above
	svc := NewStatsService(st, slog.Default())
	now := round.StartedAt.Add(16 * time.Minute)
	st.Now = func() time.Time { return now } // memstore clock hook (add if missing)

	stats, err := svc.GetRoundStats(context.Background(), round.ID)
	if err != nil {
		t.Fatal(err)
	}
	row := stats.Leaderboard[0]
	if row.Team.ID != teamID || row.Lean == nil {
		t.Fatalf("no lean block: %+v", row)
	}
	approx := func(got, want float64) bool { return math.Abs(got-want) < 0.005 }
	if !approx(row.Lean.SetupCost, 3) || !approx(row.Lean.CarryingCost, 1.08) || !approx(row.Profit, -3.40) {
		t.Fatalf("setup=%.2f carrying=%.2f profit=%.2f", row.Lean.SetupCost, row.Lean.CarryingCost, row.Profit)
	}
	if row.Lean.BatchesSubmitted != 1 || !approx(row.Lean.AvgSubmitToPublishS, 360) || !approx(row.Lean.AvgPublishToFirstSaleS, 240) {
		t.Fatalf("lean block: %+v", *row.Lean)
	}
	if len(row.Lean.BatchSeries) != 1 || row.Lean.BatchSeries[0].Published != 3 || row.Lean.BatchSeries[0].Sold != 1 {
		t.Fatalf("series: %+v", row.Lean.BatchSeries)
	}

	sum, err := svc.GetTeamSummary(context.Background(), round.ID, teamID)
	if err != nil || sum.Lean == nil || !approx(sum.Lean.CarryingCost, 1.08) || !approx(sum.Profit, -3.40) {
		t.Fatalf("summary: %+v err=%v", sum, err)
	}
}

func TestClassicStatsHaveNoLeanBlockAndUnchangedProfit(t *testing.T) {
	st := testutil.NewStore()
	round, _ := seedLeanStatsFixture(t, st)
	round.MarketMode = domain.MarketClassic
	st.Rounds[round.ID] = round
	svc := NewStatsService(st, slog.Default())
	stats, _ := svc.GetRoundStats(context.Background(), round.ID)
	row := stats.Leaderboard[0]
	if row.Lean != nil || math.Abs(row.Profit-(1-0.30-0.02)) > 0.005 {
		t.Fatalf("classic row changed: %+v", row)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./src/core/usecase/ -run 'LeanStats|ClassicStatsHaveNoLean'`
Expected: compile error, `row.Lean undefined`.

- [ ] **Step 3: Implement**

`ports/repositories.go`:

```go
// LeanTeamStats is present only for LEAN rounds (nil → key omitted in JSON).
type LeanTeamStats struct {
	BatchesSubmitted       int          `json:"batches_submitted"`
	SetupCost              float64      `json:"setup_cost"`
	CarryingCost           float64      `json:"carrying_cost"`
	AvgSubmitToPublishS    float64      `json:"avg_submit_to_publish_s"`
	AvgPublishToFirstSaleS float64      `json:"avg_publish_to_first_sale_s"`
	BatchSeries            []BatchPoint `json:"batch_series"`
}

// BatchPoint is one submitted batch, in submission order, for the learning curve.
type BatchPoint struct {
	Seq         int       `json:"seq"`
	SubmittedAt time.Time `json:"submitted_at"`
	Jokes       int       `json:"jokes"`
	Published   int       `json:"published"`
	Sold        int       `json:"sold"`
}
```

Add `Lean *LeanTeamStats \`json:"lean,omitempty"\`` to both `TeamStats` and `TeamSummary`. Add to `StatsRepository`:

```go
	// Lean variants compute setup and carrying costs at read time and fold
	// them into profit. The Classic queries above are not touched.
	GetRoundStatsLean(ctx context.Context, roundID int64) (*RoundStats, error)
	GetTeamSummaryLean(ctx context.Context, roundID, teamID int64) (*TeamSummary, error)
```

`lean_stats_repo.go` — a shared CTE prefix, used by both queries:

```go
package postgres

// leanTeamCTE computes, per team, everything Lean mode adds. Parameter $1 is
// the round id. Clocks stop at ended_at; an unsplit batch counts as batch_size
// jokes for WIP; a published joke carries until its first sale.
const leanTeamCTE = `
WITH cfg AS (
	SELECT market_price, cost_of_publishing, cost_of_discard, batch_size,
	       setup_cost_per_batch, carrying_cost_per_joke_minute,
	       COALESCE(ended_at, now()) AS clock_end
	FROM rounds WHERE round_id = $1
),
submitted AS (
	SELECT team_id, COUNT(*)::int AS batches_submitted
	FROM batch_submission_events WHERE round_id = $1 GROUP BY team_id
),
wip AS (
	SELECT b.team_id,
	       COALESCE(SUM(
	         COALESCE(NULLIF((SELECT COUNT(*) FROM jokes j WHERE j.batch_id = b.batch_id), 0), (SELECT batch_size FROM cfg))
	         * EXTRACT(EPOCH FROM (COALESCE(b.processed_at, (SELECT clock_end FROM cfg)) - b.submitted_at)) / 60.0
	       ), 0) AS wip_joke_minutes,
	       AVG(EXTRACT(EPOCH FROM (b.processed_at - b.submitted_at))) FILTER (WHERE b.processed_at IS NOT NULL) AS avg_submit_to_publish_s
	FROM batches b
	WHERE b.round_id = $1 AND b.submitted_at IS NOT NULL
	GROUP BY b.team_id
),
first_sale AS (
	SELECT joke_id, MIN(created_at) AS first_sold_at
	FROM purchase_events WHERE round_id = $1 AND delta > 0 GROUP BY joke_id
),
inventory AS (
	SELECT b.team_id,
	       COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(fs.first_sold_at, (SELECT clock_end FROM cfg)) - j.published_at)) / 60.0), 0) AS inventory_joke_minutes,
	       AVG(EXTRACT(EPOCH FROM (fs.first_sold_at - j.published_at))) FILTER (WHERE fs.first_sold_at IS NOT NULL) AS avg_publish_to_first_sale_s
	FROM jokes j
	JOIN batches b ON b.batch_id = j.batch_id
	LEFT JOIN first_sale fs ON fs.joke_id = j.joke_id
	WHERE b.round_id = $1 AND j.publish_status = 'PUBLISHED' AND j.published_at IS NOT NULL
	GROUP BY b.team_id
),
lean AS (
	SELECT trs.team_id,
	       COALESCE(s.batches_submitted, 0) AS batches_submitted,
	       COALESCE(s.batches_submitted, 0) * (SELECT setup_cost_per_batch FROM cfg) AS setup_cost,
	       (SELECT carrying_cost_per_joke_minute FROM cfg) * (COALESCE(w.wip_joke_minutes, 0) + COALESCE(i.inventory_joke_minutes, 0)) AS carrying_cost,
	       COALESCE(w.avg_submit_to_publish_s, 0) AS avg_submit_to_publish_s,
	       COALESCE(i.avg_publish_to_first_sale_s, 0) AS avg_publish_to_first_sale_s
	FROM team_rounds_state trs
	LEFT JOIN submitted s ON s.team_id = trs.team_id
	LEFT JOIN wip w ON w.team_id = trs.team_id
	LEFT JOIN inventory i ON i.team_id = trs.team_id
	WHERE trs.round_id = $1
),
profits AS (
	SELECT trs.team_id, t.name AS team_name, trs.batches_processed,
	       trs.points_earned AS total_sales, trs.published_jokes, trs.discarded_jokes,
	       trs.published_jokes + trs.discarded_jokes AS total_jokes,
	       GREATEST(trs.published_jokes - trs.points_earned, 0) AS unsold_jokes,
	       trs.batches_created,
	       (SELECT market_price FROM cfg) * trs.points_earned::float8
	         - (SELECT cost_of_publishing FROM cfg) * trs.published_jokes::float8
	         - (SELECT cost_of_discard FROM cfg) * trs.discarded_jokes::float8
	         - l.setup_cost - l.carrying_cost AS profit,
	       l.batches_submitted, l.setup_cost, l.carrying_cost,
	       l.avg_submit_to_publish_s, l.avg_publish_to_first_sale_s
	FROM team_rounds_state trs
	JOIN teams t ON t.id = trs.team_id
	JOIN lean l ON l.team_id = trs.team_id
	WHERE trs.round_id = $1
)`
```

Then `GetRoundStatsLean` selects from `profits` with `DENSE_RANK() OVER (ORDER BY profit DESC)` and scans the Classic columns plus the five lean ones into `ts` and `ts.Lean = &ports.LeanTeamStats{…}`; `GetTeamSummaryLean` mirrors `GetTeamSummary`'s output columns (same scan order as the Classic query plus the lean ones), reading `unprocessed_batches` with the same subquery the Classic version uses. Both then fill `BatchSeries` from:

```go
const batchSeriesSQL = `
SELECT b.team_id, b.submitted_at,
       (SELECT COUNT(*) FROM jokes j WHERE j.batch_id = b.batch_id)::int AS jokes,
       (SELECT COUNT(*) FROM jokes j WHERE j.batch_id = b.batch_id AND j.publish_status = 'PUBLISHED')::int AS published,
       (SELECT COUNT(DISTINCT pe.joke_id) FROM purchase_events pe JOIN jokes j ON j.joke_id = pe.joke_id
         WHERE j.batch_id = b.batch_id AND pe.delta > 0)::int AS sold
FROM batches b
WHERE b.round_id = $1 AND b.submitted_at IS NOT NULL
ORDER BY b.team_id, b.submitted_at, b.batch_id`
```

grouped by team in Go with `Seq` numbered from 1.

`stats.go`: choose the query by mode.

```go
func (s *StatsService) GetRoundStats(ctx context.Context, roundID int64) (*ports.RoundStats, error) {
	s.serveArrivalsIfLean(ctx, roundID) // from Task 5
	round, err := s.repo.GetRoundByID(ctx, roundID)
	if err != nil {
		return nil, err
	}
	if round.MarketMode.IsLean() {
		return s.repo.GetRoundStatsLean(ctx, roundID)
	}
	return s.repo.GetRoundStatsV2(ctx, roundID)
}
```

and the same shape for `GetTeamSummary`. (Fold the Task 5 arrival hook into a private `serveArrivalsIfLean` so the round is loaded once.)

`memstore.go`: implement `GetRoundStatsLean`/`GetTeamSummaryLean` in Go over the maps with the exact formula from the spec (§5), using `st.Now()` for the clock (add `Now func() time.Time` to `Store`, defaulting to `time.Now`). `first sale` = earliest `Purchases` row for the joke; batches without jokes count `round.BatchSize`.

Handlers: `RoundHandler.TeamSummary` adds `"lean": summary.Lean` only when `summary.Lean != nil` (build the `gin.H` then `if summary.Lean != nil { h["lean"] = summary.Lean }`). `InstructorHandler.Stats` already emits `stats.Leaderboard`, whose `Lean` field is `omitempty`.

- [ ] **Step 4: Run tests**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(lean): setup and carrying costs, lead times and a batch series in stats

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: Hash classifier for local pilots

**Repo:** jokefactory_be
**Files:**
- Create: `src/infra/llm/hash_classifier.go`
- Modify: `src/infra/config/config.go:62-82`, `main.go:85-92`
- Test: `src/infra/llm/hash_classifier_test.go`

- [ ] **Step 1: Write the failing test**

```go
// src/infra/llm/hash_classifier_test.go
package llm

import (
	"context"
	"testing"

	"jokefactory/src/core/domain/scoring"
	"jokefactory/src/core/ports"
)

func TestHashClassifierIsDeterministicAndVaried(t *testing.T) {
	c := HashClassifier{}
	in := []ports.JokeInput{{JokeID: 1, Text: "My password is the last eight digits of pi."}, {JokeID: 2, Text: "My password is the last eight digits of pi."}, {JokeID: 3, Text: "Every product I own now has a subscription."}}
	out, err := c.Classify(context.Background(), in)
	if err != nil || len(out) != 3 {
		t.Fatal(err, len(out))
	}
	for _, dim := range scoring.LLMDimensions() {
		if out[0].Categories[dim] != out[1].Categories[dim] {
			t.Fatalf("same text, different %s", dim)
		}
		if scoring.IsCatchAll(out[0].Categories[dim]) {
			t.Fatalf("catch-all chosen for %s", dim)
		}
	}
	differ := 0
	for _, dim := range scoring.LLMDimensions() {
		if out[0].Categories[dim] != out[2].Categories[dim] {
			differ++
		}
	}
	if differ == 0 {
		t.Fatal("different texts classified identically on every dimension")
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./src/infra/llm/`
Expected: compile error, `undefined: HashClassifier`.

- [ ] **Step 3: Implement**

```go
// src/infra/llm/hash_classifier.go
package llm

import (
	"context"
	"hash/fnv"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/domain/scoring"
	"jokefactory/src/core/ports"
)

// HashClassifier assigns each LLM dimension a category chosen by a hash of the
// joke text. It is for local pilots only (APP_LLM_MODE=hash): deterministic,
// free, instant, and — unlike StubClassifier, which gives every joke the same
// categories — it spreads a corpus across the fit range so fit-weighted
// buying can be exercised. It knows nothing about humour.
type HashClassifier struct{}

func (HashClassifier) Classify(_ context.Context, jokes []ports.JokeInput) ([]ports.JokeClassification, error) {
	out := make([]ports.JokeClassification, 0, len(jokes))
	for _, j := range jokes {
		cats := make(map[domain.Dimension]string)
		for _, dim := range scoring.LLMDimensions() {
			cats[dim] = hashedCategory(j.Text, dim)
		}
		out = append(out, ports.JokeClassification{JokeID: j.JokeID, Categories: cats})
	}
	return out, nil
}

func hashedCategory(text string, dim domain.Dimension) string {
	var options []string
	for _, c := range scoring.Specs[dim].Categories {
		if !scoring.IsCatchAll(c) {
			options = append(options, c)
		}
	}
	if len(options) == 0 {
		return defaultCategory(dim)
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(string(dim) + "|" + text))
	return options[int(h.Sum32()%uint32(len(options)))]
}
```

`config.go` `LLMConfig`: add `Mode string \`envconfig:"LLM_MODE" default:""\`` with a comment: `"" = Azure when credentials exist else stub; "hash" = HashClassifier for local pilots`. `main.go:88-91`:

```go
	if cfg.LLM.Mode == "hash" {
		return llm.HashClassifier{}, "hash"
	}
	if cfg.LLM.Enabled() {
		return llm.NewAzureClassifier(cfg.LLM), cfg.LLM.Deployment
	}
	return llm.StubClassifier{}, "stub"
```

Also pass `APP_LLM_MODE: "${APP_LLM_MODE:-}"` through in `docker-compose.yml`'s api environment.

- [ ] **Step 4: Run tests**

Run: `go build ./... && go vet ./... && go test ./...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ main.go docker-compose.yml
git commit -m "feat(pilot): deterministic hash classifier for local runs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8: Local backend smoke test

**Repo:** jokefactory_be
**Files:** none changed; this task proves the migration and the mode switch on a real Postgres.

- [ ] **Step 1: Start the stack**

```bash
cd ~/Documents/GitHub/jokefactory_be
APP_LLM_MODE=hash make docker-up
make migrate-status   # expect 0003_lean_market listed as pending, then:
make migrate-up
curl -s localhost:8081/health
```

If `make migrate-up` needs `DB_DSN`, read the Makefile's variable and export it for the local compose Postgres (`postgres://postgres:postgres@localhost:5432/jokefactory?sslmode=disable`). Never print `.env`.

- [ ] **Step 2: Smoke the switch**

```bash
B=http://localhost:8081
UID=$(curl -s -X POST $B/v1/instructor/login -H 'content-type: application/json' \
  -d "{\"display_name\":\"Local Instructor\",\"password\":\"$(grep '^APP_ADMIN_PASSWORD=' .env | cut -d= -f2-)\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["user_id"])')
curl -s -X POST $B/v1/admin/reset -H "X-User-Id: $UID" -o /dev/null -w "reset %{http_code}\n"
curl -s -X POST $B/v1/instructor/rounds/1/config -H "X-User-Id: $UID" -H 'content-type: application/json' \
  -d '{"market_mode":"LEAN","arrival_window_seconds":120,"setup_cost_per_batch":3,"carrying_cost_per_joke_minute":0.02,"wip_limit":2}' | python3 -m json.tool | grep -E 'market_mode|wip_limit|preference_base'
curl -s $B/v1/rounds/active | python3 -c 'import sys,json;print([(r["id"],r["market_mode"],r["wip_limit"]) for r in json.load(sys.stdin)["data"]["rounds"]])'
```

Expected: `reset 200`; the config echo shows `"market_mode": "LEAN"`, `"wip_limit": 2`, `"preference_base": 2`; the public list shows `[(1,'LEAN',2),(2,'CLASSIC',0)]`. A `{"market_mode":"SIDEWAYS"}` POST returns 400.

- [ ] **Step 3: Record**

Add a `## Local run` note to the backend `README.md` (or the existing local-dev section) with the `APP_LLM_MODE=hash` instruction and the migrate command. Commit:

```bash
git add README.md
git commit -m "docs: run the backend locally with the hash classifier

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Leave the stack running for Phase C; `make docker-down` when the pilot is done.

---

## Phase B — Frontend

## Task 9: Types, config plumbing and `services/leanMode.ts`

**Repo:** AI-Joke-Factory
**Files:**
- Modify: `types/api.ts` (`PublicRound`, `TeamStats`, `TeamSummaryResponse`, `ConfigRequest`), `types.ts:107-126`, `context.tsx` (initialConfig, both round→config mappings, `updateConfig`), `services/instructorService.ts:66-80`
- Create: `services/leanMode.ts`, `services/leanMode.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// services/leanMode.test.ts
import { describe, expect, it } from 'vitest';
import { fmtMoney, isLeanRound, leanConfigFromRound, wipStatus } from './leanMode';

const classic = { market_mode: 'CLASSIC', arrival_window_seconds: 900, setup_cost_per_batch: 0, carrying_cost_per_joke_minute: 0, wip_limit: 0 };
const lean = { ...classic, market_mode: 'LEAN', setup_cost_per_batch: 3, carrying_cost_per_joke_minute: 0.02, wip_limit: 2 };

describe('lean mode helpers', () => {
  it('detects the mode, defaulting to classic', () => {
    expect(isLeanRound(lean)).toBe(true);
    expect(isLeanRound(classic)).toBe(false);
    expect(isLeanRound(undefined)).toBe(false);
    expect(isLeanRound({})).toBe(false);
  });

  it('maps round fields onto GameConfig keys with defaults for old backends', () => {
    expect(leanConfigFromRound(lean)).toEqual({
      marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 3, carryingCostPerJokeMinute: 0.02, wipLimit: 2,
    });
    expect(leanConfigFromRound({})).toEqual({
      marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
    });
  });

  it('describes the WIP state for the Joke Maker', () => {
    expect(wipStatus(0, 0)).toEqual({ blocked: false, label: null });
    expect(wipStatus(1, 2)).toEqual({ blocked: false, label: 'Marketing has 1 of 2 batches waiting' });
    expect(wipStatus(2, 2)).toEqual({ blocked: true, label: 'Marketing has 2 of 2 batches waiting — wait, or go help' });
  });

  it('formats money with sign and cents', () => {
    expect(fmtMoney(3)).toBe('$3.00');
    expect(fmtMoney(-1.085)).toBe('-$1.09');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/leanMode.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// services/leanMode.ts
/**
 * Lean market mode — pure helpers shared by the views.
 *
 * The backend decides the rules (services/../jokefactory_be: market_mode on
 * the round). The frontend only reads them off the public round and renders
 * lean controls and tiles when the round is LEAN. Everything here tolerates a
 * backend that predates the feature: missing fields read as CLASSIC.
 */
export type MarketMode = 'CLASSIC' | 'LEAN';

export interface LeanRoundFields {
  market_mode?: string;
  arrival_window_seconds?: number;
  setup_cost_per_batch?: number;
  carrying_cost_per_joke_minute?: number;
  wip_limit?: number;
}

export interface LeanConfig {
  marketMode: MarketMode;
  arrivalWindowSeconds: number;
  setupCostPerBatch: number;
  carryingCostPerJokeMinute: number;
  wipLimit: number;
}

export const LEAN_DEFAULTS: LeanConfig = {
  marketMode: 'CLASSIC', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
};

/** The one-click class preset from the spec: Round 1 push, Round 2 lean. */
export const LEAN_CLASS_PRESET: Record<1 | 2, Partial<LeanConfig>> = {
  1: { marketMode: 'LEAN', setupCostPerBatch: 3, carryingCostPerJokeMinute: 0.02, wipLimit: 0 },
  2: { marketMode: 'LEAN', setupCostPerBatch: 1, carryingCostPerJokeMinute: 0.02, wipLimit: 2 },
};

export function isLeanRound(round: LeanRoundFields | null | undefined): boolean {
  return round?.market_mode === 'LEAN';
}

export function leanConfigFromRound(round: LeanRoundFields | null | undefined): LeanConfig {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    marketMode: isLeanRound(round) ? 'LEAN' : 'CLASSIC',
    arrivalWindowSeconds: num(round?.arrival_window_seconds, LEAN_DEFAULTS.arrivalWindowSeconds),
    setupCostPerBatch: num(round?.setup_cost_per_batch, 0),
    carryingCostPerJokeMinute: num(round?.carrying_cost_per_joke_minute, 0),
    wipLimit: num(round?.wip_limit, 0),
  };
}

export function wipStatus(waiting: number, limit: number): { blocked: boolean; label: string | null } {
  if (limit <= 0) return { blocked: false, label: null };
  const blocked = waiting >= limit;
  const base = `Marketing has ${waiting} of ${limit} batches waiting`;
  return { blocked, label: blocked ? `${base} — wait, or go help` : base };
}

export function fmtMoney(v: number): string {
  const abs = Math.abs(v).toFixed(2);
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

/** The backend reports a WIP refusal as 409 CONFLICT with this prefix in the message. */
export const WIP_LIMIT_MESSAGE = 'WIP_LIMIT_REACHED';
```

`types/api.ts`: add to `PublicRound` the five fields (`market_mode: 'CLASSIC' | 'LEAN'; arrival_window_seconds: number; setup_cost_per_batch: number; carrying_cost_per_joke_minute: number; wip_limit: number;`), add

```ts
export interface BatchPoint { seq: number; submitted_at: string; jokes: number; published: number; sold: number; }
export interface LeanTeamStats {
  batches_submitted: number;
  setup_cost: number;
  carrying_cost: number;
  avg_submit_to_publish_s: number;
  avg_publish_to_first_sale_s: number;
  batch_series: BatchPoint[];
}
```

and `lean?: LeanTeamStats;` to both `TeamStats` and `TeamSummaryResponse`; add the six optional fields to `ConfigRequest` (`market_mode?: 'CLASSIC' | 'LEAN'; arrival_window_seconds?: number; setup_cost_per_batch?: number; carrying_cost_per_joke_minute?: number; wip_limit?: number; preference_base?: number;`). `services/instructorService.ts` `updateRoundConfig`'s body type gets the same keys.

`types.ts` `GameConfig`: add `marketMode: 'CLASSIC' | 'LEAN'; arrivalWindowSeconds: number; setupCostPerBatch: number; carryingCostPerJokeMinute: number; wipLimit: number;`. `context.tsx` `initialConfig()` spreads `...LEAN_DEFAULTS`; in BOTH round→config mappings (instructor poll ~l.611-660 and student poll ~l.949-999) spread `...leanConfigFromRound(roundObject)` where the other round fields are copied; in `updateConfig` add

```ts
    if (updates.marketMode !== undefined) body.market_mode = updates.marketMode;
    if (updates.arrivalWindowSeconds !== undefined) body.arrival_window_seconds = updates.arrivalWindowSeconds;
    if (updates.setupCostPerBatch !== undefined) body.setup_cost_per_batch = updates.setupCostPerBatch;
    if (updates.carryingCostPerJokeMinute !== undefined) body.carrying_cost_per_joke_minute = updates.carryingCostPerJokeMinute;
    if (updates.wipLimit !== undefined) body.wip_limit = updates.wipLimit;
```

Also expose `roundIds: { 1: number | null; 2: number | null }` on the context (set where the instructor poll computes `r1Id`/`r2Id`), for the preset in Task 10. Update `services/mockApi.ts`'s round objects to carry the five public fields with Classic defaults so mock mode keeps type-checking.

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: 0 errors; all pass (469 + 4).

- [ ] **Step 5: Commit**

```bash
git add types/api.ts types.ts context.tsx services/instructorService.ts services/leanMode.ts services/leanMode.test.ts services/mockApi.ts
git commit -m "feat(lean): read the market mode and lean settings into the game config

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 10: Instructor controls, lean leaderboard columns, debrief table

**Repo:** AI-Joke-Factory
**Files:**
- Modify: `views/Instructor.tsx` (CONFIG row ~2252-2340; sort keys :79-81; columns :276-285; header/body cells from :796)
- Create: `components/LeanDebrief.tsx`, `components/leanDebrief.test.ts` (pure row builder)

- [ ] **Step 1: Write the failing test**

```ts
// components/leanDebrief.test.ts
import { describe, expect, it } from 'vitest';
import { debriefRows } from './LeanDebrief';

const r1 = { round_id: 1, leaderboard: [
  { rank: 1, team: { id: 7, name: 'Team 7' }, batches_processed: 8, total_sales: 60, published_jokes: 40, discarded_jokes: 0, total_jokes: 40, unsold_jokes: 20, profit: 23.2,
    lean: { batches_submitted: 8, setup_cost: 24, carrying_cost: 8.8, avg_submit_to_publish_s: 360, avg_publish_to_first_sale_s: 200, batch_series: [] } },
] };
const r2 = { round_id: 2, leaderboard: [
  { rank: 1, team: { id: 7, name: 'Team 7' }, batches_processed: 4, total_sales: 45, published_jokes: 10, discarded_jokes: 2, total_jokes: 12, unsold_jokes: 2, profit: 30.8,
    lean: { batches_submitted: 4, setup_cost: 4, carrying_cost: 1.2, avg_submit_to_publish_s: 120, avg_publish_to_first_sale_s: 90, batch_series: [] } },
] };

describe('debriefRows', () => {
  it('pairs each team across rounds and computes the deltas', () => {
    const rows = debriefRows(r1 as any, r2 as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].team).toBe('Team 7');
    expect(rows[0].r1.profit).toBe(23.2);
    expect(rows[0].r2.profit).toBe(30.8);
    expect(rows[0].delta.profit).toBeCloseTo(7.6);
    expect(rows[0].delta.leadTimeS).toBe(-240);
  });
  it('tolerates a team present in one round only', () => {
    const rows = debriefRows(r1 as any, { round_id: 2, leaderboard: [] } as any);
    expect(rows[0].r2).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/leanDebrief.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// components/LeanDebrief.tsx
/* Round 1 vs Round 2, per team — the debrief table for Lean classes. Round 1
   is played with push rules and Round 2 with lean rules, so the comparison
   itself is the lesson: profit, waste and lead time side by side. */
import React from 'react';
import type { RoundStatsResponse, TeamStats } from '../types/api';
import { fmtMoney } from '../services/leanMode';

export interface DebriefSide {
  profit: number; sales: number; published: number; unsold: number;
  setup: number; carrying: number; leadTimeS: number; saleTimeS: number;
}
export interface DebriefRow {
  teamId: number; team: string;
  r1: DebriefSide | null; r2: DebriefSide | null;
  delta: { profit: number; leadTimeS: number; unsold: number };
}

function side(t: TeamStats): DebriefSide {
  return {
    profit: t.profit, sales: t.total_sales, published: t.published_jokes, unsold: t.unsold_jokes,
    setup: t.lean?.setup_cost ?? 0, carrying: t.lean?.carrying_cost ?? 0,
    leadTimeS: t.lean?.avg_submit_to_publish_s ?? 0, saleTimeS: t.lean?.avg_publish_to_first_sale_s ?? 0,
  };
}

export function debriefRows(r1: RoundStatsResponse | null, r2: RoundStatsResponse | null): DebriefRow[] {
  const byTeam = new Map<number, DebriefRow>();
  for (const [key, stats] of [['r1', r1], ['r2', r2]] as const) {
    for (const t of stats?.leaderboard ?? []) {
      const row = byTeam.get(t.team.id) ?? {
        teamId: t.team.id, team: t.team.name, r1: null, r2: null, delta: { profit: 0, leadTimeS: 0, unsold: 0 },
      };
      row[key] = side(t);
      byTeam.set(t.team.id, row);
    }
  }
  for (const row of byTeam.values()) {
    if (row.r1 && row.r2) {
      row.delta = {
        profit: row.r2.profit - row.r1.profit,
        leadTimeS: row.r2.leadTimeS - row.r1.leadTimeS,
        unsold: row.r2.unsold - row.r1.unsold,
      };
    }
  }
  return [...byTeam.values()].sort((a, b) => (b.r2?.profit ?? b.r1?.profit ?? 0) - (a.r2?.profit ?? a.r1?.profit ?? 0));
}

const fmtS = (s: number) => (s > 0 ? `${Math.round(s)}s` : '—');
const Cell: React.FC<{ s: DebriefSide | null; pick: (s: DebriefSide) => string }> = ({ s, pick }) => (
  <td className="px-2 py-1 text-right tabular-nums">{s ? pick(s) : '—'}</td>
);

export const LeanDebrief: React.FC<{ r1: RoundStatsResponse | null; r2: RoundStatsResponse | null }> = ({ r1, r2 }) => {
  const rows = debriefRows(r1, r2);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Round 1 versus Round 2, per team">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1 text-left">Team</th>
            <th className="px-2 py-1 text-right">R1 profit</th><th className="px-2 py-1 text-right">R2 profit</th><th className="px-2 py-1 text-right">Δ profit</th>
            <th className="px-2 py-1 text-right">R1 unsold</th><th className="px-2 py-1 text-right">R2 unsold</th>
            <th className="px-2 py-1 text-right">R1 setup+carry</th><th className="px-2 py-1 text-right">R2 setup+carry</th>
            <th className="px-2 py-1 text-right">R1 lead</th><th className="px-2 py-1 text-right">R2 lead</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.teamId} className="border-t border-gray-100">
              <td className="px-2 py-1 font-medium">{r.team}</td>
              <Cell s={r.r1} pick={s => fmtMoney(s.profit)} /><Cell s={r.r2} pick={s => fmtMoney(s.profit)} />
              <td className={`px-2 py-1 text-right tabular-nums font-semibold ${r.delta.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {r.r1 && r.r2 ? fmtMoney(r.delta.profit) : '—'}
              </td>
              <Cell s={r.r1} pick={s => String(s.unsold)} /><Cell s={r.r2} pick={s => String(s.unsold)} />
              <Cell s={r.r1} pick={s => fmtMoney(s.setup + s.carrying)} /><Cell s={r.r2} pick={s => fmtMoney(s.setup + s.carrying)} />
              <Cell s={r.r1} pick={s => fmtS(s.leadTimeS)} /><Cell s={r.r2} pick={s => fmtS(s.leadTimeS)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

`views/Instructor.tsx`:
1. **CONFIG row.** Beside the existing inputs add a `Market mode` `<select>` (CLASSIC / LEAN) bound to a `localMarketMode` state, and — rendered only when `localMarketMode === 'LEAN'` — number inputs for `Arrival window (s)`, `Setup cost / batch`, `Carrying cost / joke-min` (step 0.001) and `WIP limit`, each with its own `local*` state seeded from `config` the same way `localCostOfPublishing` is, disabled when `!canEditPricing`, and included in `hasPendingConfigChanges` and `handleUpdateSettings` (which calls `updateConfig` with the camelCase keys from Task 9). Add a `Lean class preset` button that calls `instructorService.updateRoundConfig(roundIds[1], toBody(LEAN_CLASS_PRESET[1]))` and the same for round 2 (skipping a null id), then shows a toast/alert "Round 1: push rules · Round 2: lean rules". `toBody` maps camelCase → snake_case exactly as `updateConfig` does.
2. **Leaderboard.** Extend the sort-key union and the `columns` list with `setup_cost`, `carrying_cost`, `lead_time_s`, `sale_time_s`, reading `row.lean?.…`. Render those `<th>`/`<td>`s only when `isLeanRound(currentRound)` (derive from the round object the view already has, or from `config.marketMode`).
3. **Debrief.** Below the leaderboard, when `config.marketMode === 'LEAN'` and `statsR2` is non-null, render `<Card title="Round 1 vs Round 2" subtitle="Push rules vs lean rules, per team"><LeanDebrief r1={statsR1} r2={statsR2} /></Card>`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build 2>&1 | tail -2`
Expected: 0 errors, all pass, `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add views/Instructor.tsx components/LeanDebrief.tsx components/leanDebrief.test.ts
git commit -m "feat(lean): instructor market-mode controls, lean columns and the debrief table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 11: Team screens — lean tiles, learning curve, WIP counter

**Repo:** AI-Joke-Factory
**Files:**
- Create: `components/LearningCurve.tsx`
- Modify: `views/QualityControl.tsx:525-560,767-775`, `views/JokeMaker.tsx:184-189,326`, `context.tsx` (`addBatch` error handling)

- [ ] **Step 1: Write the learning curve**

```tsx
// components/LearningCurve.tsx
/* Sold ÷ published per batch, in submission order — the team's learning curve.
   A rising line means later batches sell better: the feedback loop is working.
   Pure SVG, no library; sized by its container. */
import React from 'react';
import type { BatchPoint } from '../types/api';

export const LearningCurve: React.FC<{ series: BatchPoint[]; height?: number }> = ({ series, height = 48 }) => {
  const pts = series.filter(p => p.published > 0).map(p => ({ seq: p.seq, rate: p.sold / p.published }));
  if (pts.length === 0) {
    return <p className="text-xs italic text-gray-400">No published batches yet.</p>;
  }
  const w = 160;
  const x = (i: number) => (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * (w - 8) + 4);
  const y = (r: number) => height - 4 - r * (height - 8);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img"
        aria-label={`Sell-through per batch, latest ${Math.round(last.rate * 100)}%`}>
        <line x1="0" y1={y(0)} x2={w} y2={y(0)} stroke="#e5e7eb" />
        <path d={d} fill="none" stroke="#059669" strokeWidth="2" />
        {pts.map((p, i) => <circle key={p.seq} cx={x(i)} cy={y(p.rate)} r="2.5" fill="#059669" />)}
      </svg>
      <figcaption className="text-[10px] text-gray-500">Sell-through per batch · latest {Math.round(last.rate * 100)}%</figcaption>
    </figure>
  );
};
```

- [ ] **Step 2: Marketing tiles**

In `views/QualityControl.tsx`, derive `const lean = teamSummary?.lean ?? null; const leanMode = config.marketMode === 'LEAN';`. After the existing six `StatBox`es add, inside `{leanMode && (<> … </>)}`:

```tsx
            <StatBox label="Setup cost" value={fmtMoney(lean?.setup_cost ?? 0)} tone="rose" />
            <StatBox label="Carrying cost" value={fmtMoney(lean?.carrying_cost ?? 0)} tone="rose" />
            <StatBox label="Publish → first sale" value={fmtSeconds(lean?.avg_publish_to_first_sale_s ?? 0)} tone="sky" />
```

and below the tile grid a small card `title="Learning curve"` containing `<LearningCurve series={lean?.batch_series ?? []} />`. Import `fmtMoney` from `../services/leanMode`.

- [ ] **Step 3: Joke Maker**

In `views/JokeMaker.tsx`: `const leanMode = config.marketMode === 'LEAN'; const wip = wipStatus(teamSummary?.unprocessed_batches ?? 0, config.wipLimit);` (pull `teamSummary` from `useGame()` if the view does not already). Change `canSubmit` to `... && !(leanMode && wip.blocked)`. Next to the Send button render, when `leanMode`:

```tsx
                <div className="text-xs text-gray-500">
                  Each batch costs {fmtMoney(config.setupCostPerBatch)} to set up
                  {wip.label ? <> · <span className={wip.blocked ? 'font-semibold text-amber-700' : ''}>{wip.label}</span></> : null}
                </div>
```

and the learning-curve card as in Marketing. In `context.tsx` `addBatch`'s `catch`, before the generic alert: `if (e instanceof ApiError && e.status === 409 && e.message.includes(WIP_LIMIT_MESSAGE)) { alert('Marketing still has batches waiting. In a pull system you wait — or go help them decide.'); return; }`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build 2>&1 | tail -2`
Expected: 0 errors, all pass, built. Then start the dev server against the LOCAL backend (`VITE_API_BASE_URL=http://localhost:8081 VITE_USE_MOCK_API=false npx vite --port 3000`) with the Lean round from Task 8 configured, log in as the local instructor, and confirm in the browser pane: the Market mode selector shows LEAN; a Marketing tab shows the three new tiles. Screenshot for the record.

- [ ] **Step 5: Commit**

```bash
git add components/LearningCurve.tsx views/QualityControl.tsx views/JokeMaker.tsx context.tsx
git commit -m "feat(lean): lean tiles, learning curve and the WIP counter on team screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 12: The Learner persona

**Repo:** AI-Joke-Factory
**Files:**
- Modify: `services/bots/personas.ts`, `services/bots/engine.ts` (TeamRuntime, runJokeMaker batch size, Marketing decide step), `services/bots/testing/fakeApi.ts` (sold counts), `components/BotPanel.tsx:29`
- Test: `services/bots/personas.test.ts`, `services/bots/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `services/bots/personas.test.ts`:

```ts
describe('Learner persona', () => {
  it('is in the order and publishes 2 of 3 by default', () => {
    expect(PERSONA_ORDER).toContain('LEARNER');
    expect(PERSONAS.LEARNER.leanBatchSize).toBe(3);
    expect(publishCount(PERSONAS.LEARNER, 3, 2, () => 0.5)).toBe(2);
  });

  it('keeps jokes it has seen sell, drops ones it has seen fail, fills from unknowns', () => {
    const memory = new Map<string, 'sold' | 'unsold'>([['hit', 'sold'], ['dud', 'unsold']]);
    const jokes = [
      { joke_id: 1, joke_text: 'hit' }, { joke_id: 2, joke_text: 'dud' }, { joke_id: 3, joke_text: 'new' }, { joke_id: 4, joke_text: 'other' },
    ];
    const keep = chooseWithMemory(jokes, memory, 2, () => 0);
    expect(keep.has(1)).toBe(true);
    expect(keep.has(2)).toBe(false);
    expect(keep.size).toBe(2); // the hit plus one unknown
  });

  it('never publishes nothing in round 1', () => {
    const memory = new Map<string, 'sold' | 'unsold'>([['dud', 'unsold']]);
    const keep = chooseWithMemory([{ joke_id: 2, joke_text: 'dud' }], memory, 0, () => 0, 1);
    expect(keep.size).toBe(1);
  });
});
```

Append to `services/bots/engine.test.ts` (use the file's existing harness that runs an engine against `FakeApi` with controllable time):

```ts
describe('Learner bot', () => {
  it('draws batches of 3 in round 2 and of batch_size in round 1', async () => {
    // Arrange a fake with round 1 ACTIVE (batch_size 5) → run one Learner team until it submits once;
    // assert the raw blob holds 5 jokes. Then switch the fake to round 2 and assert the next
    // submission holds 3. Use the same helpers the Spray/Careful tests use.
  });

  it('remembers sold jokes from the team batch list and keeps them next time', async () => {
    // Arrange: fake.setSold(jokeId, 3) on a joke the Learner published in batch 1 whose text
    // is 'hit'; deal 'hit' again in batch 2 (seed the deck so it recurs); assert the publish
    // request for batch 2 has is_published: true for 'hit'.
  });
});
```

Fill the two bodies using the existing engine test helpers (`grep -n "function run\|FakeApi(" services/bots/engine.test.ts`); they must assert the two behaviours named.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run services/bots`
Expected: FAIL (`LEARNER` missing, `chooseWithMemory` undefined).

- [ ] **Step 3: Implement**

`personas.ts`:
- `PersonaId` gains `'LEARNER'`; `Persona` gains `readonly leanBatchSize?: number; readonly learns?: boolean;`.
- Add `LEARNER: { id: 'LEARNER', label: 'Learner', submitIntervalMs: 60_000, waitForFeedback: true, publish: n => Math.min(2, n), leanBatchSize: 3, learns: true }` and append `'LEARNER'` to `PERSONA_ORDER`.
- Add:

```ts
export type JokeMemory = Map<string, 'sold' | 'unsold'>;

/**
 * The Learner's decision: keep every joke it has seen sell, drop every one it
 * has seen fail, and fill the remaining slots from jokes it has not seen —
 * chosen at random, because it has nothing else to go on. It sees only what a
 * human Marketing seat sees (sold counts on its own team's batches).
 */
export function chooseWithMemory(
  jokes: readonly { joke_id: number; joke_text: string }[],
  memory: JokeMemory, count: number, rand: () => number, roundNumber = 2,
): Set<number> {
  const keep = new Set<number>();
  const unknown: number[] = [];
  for (const j of jokes) {
    const seen = memory.get(j.joke_text.trim());
    if (seen === 'sold') keep.add(j.joke_id);
    else if (seen === undefined) unknown.push(j.joke_id);
  }
  const want = Math.max(roundNumber === 1 ? 1 : 0, count);
  for (const id of choosePublished(unknown, Math.max(0, want - keep.size), rand)) keep.add(id);
  if (keep.size === 0 && roundNumber === 1 && jokes.length > 0) keep.add(jokes[0].joke_id);
  return keep;
}
```

`engine.ts`:
- `TeamRuntime` gains `memory: JokeMemory` (initialised `new Map()`).
- `runJokeMaker`: `const size = persona.leanBatchSize && round.round_number >= 2 ? Math.min(persona.leanBatchSize, round.batch_size) : round.batch_size;` and `deck.draw(size)`.
- Marketing decide step: before computing `keep`, if `persona.learns` refresh memory: `await this.learn(me, team, round.id, signal)`, then `const keep = persona.learns ? chooseWithMemory(jokes, team.memory, count, rand, round.round_number) : choosePublished(...)`. Implement:

```ts
  /** Read the team's own batch list and remember which published jokes have sold.
   *  A joke counts as 'unsold' only once a LATER batch has been processed, so a
   *  joke that merely has not sold yet is not written off. */
  private async learn(me: BotApi, team: TeamRuntime, roundId: number, signal: AbortSignal): Promise<void> {
    if (team.teamId == null) return;
    const list = (await me.teamBatches(roundId, team.teamId)).batches ?? [];
    if (signal.aborted) return;
    const processed = list.filter(b => b.processed_at).sort((a, b) => String(a.processed_at).localeCompare(String(b.processed_at)));
    processed.forEach((b, i) => {
      const isLatest = i === processed.length - 1;
      for (const j of b.jokes ?? []) {
        if (j.publish_status !== 'PUBLISHED') continue;
        const key = j.joke_text.trim();
        if ((j.sold_count ?? 0) > 0) team.memory.set(key, 'sold');
        else if (!isLatest && !team.memory.has(key)) team.memory.set(key, 'unsold');
      }
    });
  }
```

Check `BotApi` exposes `teamBatches` (add it to the interface in `services/bots/api.ts` if missing; the real client has it). `fakeApi.ts`: make `teamBatches` return `processed_at`, `publish_status` and `sold_count` per joke, and add `setSold(jokeId: number, n: number)` for tests.

`components/BotPanel.tsx:29`: `DEFAULT_COUNTS` gains `LEARNER: 0`. Check `MAX_BOT_TEAMS` clamping still sums correctly in `panelControls` (it counts totals from the record).

- [ ] **Step 4: Run tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: 0 errors; all pass including the five new ones.

- [ ] **Step 5: Commit**

```bash
git add services/bots components/BotPanel.tsx
git commit -m "feat(bots): a Learner persona that keeps what sold and drops what did not

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Phase C — Pilot and documentation

## Task 13: Pilot script

**Repo:** AI-Joke-Factory
**Files:**
- Create: `scripts/pilot/lean-pilot.mts`, `scripts/pilot/report.ts`, `scripts/pilot/report.test.ts`

- [ ] **Step 1: Write the failing test for the report builder**

```ts
// scripts/pilot/report.test.ts
import { describe, expect, it } from 'vitest';
import { summarise, verdict, type RunResult } from './report';

const run = (mode: 'CLASSIC' | 'LEAN', rows: Array<[string, number]>): RunResult => ({
  mode, rep: 1, durationS: 100, calls: 0,
  rows: rows.map(([persona, profit], i) => ({ teamId: i + 1, persona, profit, sales: 0, published: 0, unsold: 0, setup: 0, carrying: 0, leadTimeS: 0, saleTimeS: 0, rank: i + 1 })),
});

describe('pilot report', () => {
  it('averages profit per persona and mode', () => {
    const s = summarise([run('LEAN', [['SPRAY', 10], ['SPRAY', 20], ['CAREFUL', 30]])]);
    expect(s.LEAN.SPRAY.meanProfit).toBe(15);
    expect(s.LEAN.CAREFUL.meanProfit).toBe(30);
  });
  it('passes when Learner and Careful out-earn Spray and Spray wins no lean class', () => {
    const runs = [
      run('LEAN', [['LEARNER', 30], ['CAREFUL', 25], ['SPRAY', 10]]),
      run('LEAN', [['LEARNER', 28], ['CAREFUL', 26], ['SPRAY', 12]]),
    ];
    expect(verdict(runs).pass).toBe(true);
  });
  it('fails when Spray wins a lean class', () => {
    const runs = [run('LEAN', [['SPRAY', 50], ['LEARNER', 30], ['CAREFUL', 25]])];
    expect(verdict(runs).pass).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/pilot/report.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// scripts/pilot/report.ts
/* Pure summarisation for the lean pilot. Kept separate from the runner so the
   verdict rule is unit-tested and the markdown is reproducible. */
export interface TeamRow {
  teamId: number; persona: string; profit: number; sales: number; published: number; unsold: number;
  setup: number; carrying: number; leadTimeS: number; saleTimeS: number; rank: number;
}
export interface RunResult { mode: 'CLASSIC' | 'LEAN'; rep: number; durationS: number; calls: number; rows: TeamRow[]; }
export interface PersonaSummary { n: number; meanProfit: number; meanSales: number; meanPublished: number; meanUnsold: number; meanSetup: number; meanCarrying: number; meanLeadTimeS: number; }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarise(runs: RunResult[]): Record<'CLASSIC' | 'LEAN', Record<string, PersonaSummary>> {
  const out: Record<'CLASSIC' | 'LEAN', Record<string, PersonaSummary>> = { CLASSIC: {}, LEAN: {} };
  for (const mode of ['CLASSIC', 'LEAN'] as const) {
    const rows = runs.filter(r => r.mode === mode).flatMap(r => r.rows);
    for (const persona of new Set(rows.map(r => r.persona))) {
      const xs = rows.filter(r => r.persona === persona);
      out[mode][persona] = {
        n: xs.length, meanProfit: mean(xs.map(x => x.profit)), meanSales: mean(xs.map(x => x.sales)),
        meanPublished: mean(xs.map(x => x.published)), meanUnsold: mean(xs.map(x => x.unsold)),
        meanSetup: mean(xs.map(x => x.setup)), meanCarrying: mean(xs.map(x => x.carrying)), meanLeadTimeS: mean(xs.map(x => x.leadTimeS)),
      };
    }
  }
  return out;
}

/** Spec §9.3: Lean passes when Learner and Careful out-earn Spray on mean
 *  profit across the Lean classes, and Spray does not win any Lean class. */
export function verdict(runs: RunResult[]): { pass: boolean; reasons: string[] } {
  const lean = runs.filter(r => r.mode === 'LEAN');
  const s = summarise(lean).LEAN;
  const reasons: string[] = [];
  const spray = s.SPRAY?.meanProfit ?? -Infinity;
  if (!(s.LEARNER && s.LEARNER.meanProfit > spray)) reasons.push('Learner does not out-earn Spray');
  if (!(s.CAREFUL && s.CAREFUL.meanProfit > spray)) reasons.push('Careful does not out-earn Spray');
  for (const r of lean) {
    const winner = [...r.rows].sort((a, b) => b.profit - a.profit)[0];
    if (winner?.persona === 'SPRAY') reasons.push(`Spray won lean class rep ${r.rep}`);
  }
  return { pass: reasons.length === 0, reasons };
}

export function markdown(runs: RunResult[], date: string): string {
  const s = summarise(runs);
  const v = verdict(runs);
  const row = (mode: 'CLASSIC' | 'LEAN', p: string) => {
    const x = s[mode][p];
    return x ? `| ${mode} | ${p} | ${x.n} | ${x.meanPublished.toFixed(1)} | ${x.meanSales.toFixed(1)} | ${x.meanUnsold.toFixed(1)} | $${x.meanSetup.toFixed(2)} | $${x.meanCarrying.toFixed(2)} | ${Math.round(x.meanLeadTimeS)}s | **$${x.meanProfit.toFixed(2)}** |` : '';
  };
  const personas = ['CAREFUL', 'BALANCED', 'SPRAY', 'LEARNER'];
  return [
    `# Lean pilot — ${date}`, '',
    `Verdict: **${v.pass ? 'PASS' : 'FAIL'}**${v.reasons.length ? ' — ' + v.reasons.join('; ') : ''}`, '',
    '| Mode | Persona | Teams | Published | Sales | Unsold | Setup | Carrying | Lead time | Profit |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...(['CLASSIC', 'LEAN'] as const).flatMap(m => personas.map(p => row(m, p)).filter(Boolean)),
    '', '## Runs', '',
    ...runs.map(r => `- ${r.mode} rep ${r.rep}: ${r.durationS}s, ${r.calls} classification calls, winner ${[...r.rows].sort((a, b) => b.profit - a.profit)[0]?.persona}`),
  ].join('\n');
}
```

```ts
// scripts/pilot/lean-pilot.mts
/* Runs whole bot classes against a backend and writes the pilot report.
   Usage: E2E_ADMIN_PASSWORD=… E2E_BE_URL=http://localhost:8081 npx tsx scripts/pilot/lean-pilot.mts docs/pilots/<date>-lean-pilot.md
   Defaults target the LOCAL backend. Never point it at the live stack without the user's go-ahead. */
import { writeFileSync } from 'node:fs';
import { createClient } from '../../services/shared/client';
import { BotEngine, realDelay } from '../../services/bots/engine';
import { personaSequence, type PersonaId } from '../../services/bots/personas';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { markdown, type RunResult, type TeamRow } from './report';

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const OUT = process.argv[2] ?? `docs/pilots/${new Date().toISOString().slice(0, 10)}-lean-pilot.md`;
const COUNTS: Record<PersonaId, number> = { CAREFUL: 3, BALANCED: 3, SPRAY: 3, LEARNER: 3 };
const PLAN: Array<{ mode: 'CLASSIC' | 'LEAN'; rep: number }> = [
  { mode: 'CLASSIC', rep: 1 }, { mode: 'CLASSIC', rep: 2 }, { mode: 'LEAN', rep: 1 }, { mode: 'LEAN', rep: 2 },
];
// Bots run at 10×, so a 15-minute class compresses to ~90 s of arrivals.
const LEAN_CONFIG = { market_mode: 'LEAN' as const, arrival_window_seconds: 180, setup_cost_per_batch: 3, carrying_cost_per_joke_minute: 0.02, wip_limit: 0 };
const CLASSIC_CONFIG = { market_mode: 'CLASSIC' as const };
const MAX_RUN_MS = 8 * 60_000;
const SETTLE_MS = 30_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runOnce(mode: 'CLASSIC' | 'LEAN', rep: number): Promise<RunResult> {
  const api = createClient({ baseUrl: BE });
  const login = await api.instructorLogin({ display_name: 'Pilot Instructor', password: PASSWORD as string });
  const instructor = api.as(login.user.user_id, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const round1 = (await api.roundsActive()).rounds.find(r => r.round_number === 1);
  if (!round1) throw new Error('no round 1');
  await instructor.instructorConfig(round1.id, mode === 'LEAN' ? LEAN_CONFIG : CLASSIC_CONFIG);

  let status: any = null;
  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'status') status = m.status; if (m.type === 'fatal') console.error('FATAL', m.message); },
    seed: `pilot-${mode}-${rep}`,
  });
  const teams = personaSequence(COUNTS).map((persona, i) => ({ index: i + 1, persona }));
  const t0 = Date.now();
  await engine.start({ roundId: round1.id, teams, speed: 10, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE } });
  console.log(`${mode} rep ${rep}: started, ${teams.length} teams`);

  while (Date.now() - t0 < MAX_RUN_MS) {
    await sleep(5_000);
    const s = engine.status();
    const capped = s.teams.filter(t => /cap reached/.test(t.jm.activity)).length;
    process.stdout.write(`  t=${Math.round((Date.now() - t0) / 1000)}s capped=${capped}/${s.teams.length} calls=${s.classificationCalls}\n`);
    if (capped === s.teams.length && s.teams.every(t => /waiting|resting|done/.test(t.marketing.activity))) break;
  }
  // Let the arrival window finish so late customers are served, then settle.
  if (mode === 'LEAN') await sleep(Math.max(0, LEAN_CONFIG.arrival_window_seconds * 1000 - (Date.now() - t0)) + 5_000);
  const final = engine.status();
  engine.stop();
  await sleep(SETTLE_MS);

  const stats: any = await instructor.instructorStats(round1.id); // serves any last arrivals too
  const personaByTeam = new Map<number, string>();
  for (const t of final.teams) if (t.teamId != null) personaByTeam.set(t.teamId, t.persona);
  const rows: TeamRow[] = (stats.leaderboard ?? []).map((r: any) => ({
    teamId: r.team.id, persona: personaByTeam.get(r.team.id) ?? '?', profit: r.profit, sales: r.total_sales,
    published: r.published_jokes, unsold: r.unsold_jokes, setup: r.lean?.setup_cost ?? 0, carrying: r.lean?.carrying_cost ?? 0,
    leadTimeS: r.lean?.avg_submit_to_publish_s ?? 0, saleTimeS: r.lean?.avg_publish_to_first_sale_s ?? 0, rank: r.rank,
  }));
  await instructor.instructorEnd(round1.id).catch(() => undefined);
  return { mode, rep, durationS: Math.round((Date.now() - t0) / 1000), calls: final.classificationCalls, rows };
}

const results: RunResult[] = [];
for (const step of PLAN) {
  results.push(await runOnce(step.mode, step.rep));
  writeFileSync(OUT, markdown(results, new Date().toISOString().slice(0, 10)));
  console.log(`wrote ${OUT}`);
}
console.log('DONE');
```

Check `instructorStats` returns the wrapped or unwrapped body in `services/shared/client.ts` and adjust the `stats.leaderboard` access to match (the Phase 1 harness used `stats.leaderboard`).

- [ ] **Step 4: Run the tests and a dry type-check**

Run: `npx vitest run scripts/pilot && npx tsc --noEmit -p tsconfig.json`
Expected: 3 PASS; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/pilot
git commit -m "feat(pilot): run whole bot classes in both modes and report by persona

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 14: Run the pilot locally and write the report

**Repo:** AI-Joke-Factory (report) with the jokefactory_be local stack from Task 8 running.

- [ ] **Step 1: Build the frontend bits the engine needs**

Nothing to build: the pilot imports the engine source via `tsx`. Confirm the local backend answers: `curl -s localhost:8081/health`.

- [ ] **Step 2: Run**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
E2E_BE_URL=http://localhost:8081 \
E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
npx tsx scripts/pilot/lean-pilot.mts docs/pilots/2026-10-06-lean-pilot.md 2>&1 | tee /tmp/lean-pilot.log
```

Expected: four runs, each ending with `wrote docs/pilots/…`, then `DONE`. Total time roughly 25–35 minutes. Never echo the password.

- [ ] **Step 3: Read the verdict and iterate once if needed**

Open the report. If the verdict is FAIL, adjust `LEAN_CONFIG` in the script (first lever: raise `setup_cost_per_batch` to 5; second: raise `carrying_cost_per_joke_minute` to 0.05) and re-run the two Lean classes only (temporarily set `PLAN` to the two Lean entries). Record every setting tried in the report under a `## Tuning` heading. Do not change the Classic runs. If after two adjustments Lean still fails, stop and report to the user with the numbers — that is a finding, not a bug.

- [ ] **Step 4: Finish the report**

Append to the report: the exact backend commit, `APP_LLM_MODE=hash`, the settings used, and a short reading of the table (which persona won, by how much, what drove it: sales, setup or carrying). Note the limitation that the hash classifier is not the real LLM.

- [ ] **Step 5: Commit**

```bash
git add docs/pilots/2026-10-06-lean-pilot.md
git commit -m "docs(pilot): simulated classic vs lean classes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 15: The workflow document

**Repo:** AI-Joke-Factory
**Files:**
- Create: `docs/lean-market-mode.md`

- [ ] **Step 1: Write it**

Sections, each written in full (no stubs):

1. **Goal** — the teaching goal in two paragraphs; what the Classic game rewards and why that was a problem (quote the 2026-10-01 pilot table from the spec).
2. **The two rounds** — a step-by-step timeline for a 90-minute class: setup (10 min), Round 1 push (15 min), debrief 1 (10), Round 2 lean (15), debrief 2 (15). For each step: who does what, which screen, what they see.
3. **Human interaction by role** — Instructor (CONFIG, preset, Start, End, leaderboard, debrief table), Joke Maker (writing, Send, setup cost shown, WIP counter and what to do when blocked), Marketing (claim, split, decide, release; tiles; learning curve; what the feedback shows).
4. **How customers buy** — plain-language description of §4 of the spec, with one worked example of a customer arriving at minute 6 with three jokes on the shelf (fits 11, 9, 7, base 2 → odds 16:4:1).
5. **Costs** — the profit formula, each term defined, the worked example from the spec §5, and a table of the preset values with the reasoning for each.
6. **Instructor playbook** — pre-class checklist, mid-round cues to call out, and eight debrief questions tied to the numbers on the debrief table (e.g. "Which team had the shortest lead time in Round 2 — what did they do differently?").
7. **Switching back** — set Market mode to Classic (or press reset); nothing else changes; the columns stay but are ignored.
8. **Limits and open questions** — bots learn only from sold counts; the classifier is the LLM in production; numbers were tuned with the hash classifier and need one live confirmation.

- [ ] **Step 2: Cross-check**

Every number in the document must match `services/leanMode.ts` `LEAN_CLASS_PRESET`, the spec, and the pilot report. Every UI label must match the strings in Tasks 10–11.

- [ ] **Step 3: Commit**

```bash
git add docs/lean-market-mode.md
git commit -m "docs: how Lean market mode works, for instructors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 16: Final verification and hand-off

- [ ] **Step 1: Backend**

```bash
cd ~/Documents/GitHub/jokefactory_be && go build ./... && go vet ./... && go test ./... && git status --short
```

Expected: all PASS, clean tree. Run the existing live e2e preflight against the LOCAL backend if the frontend's `scripts/e2e/preflight.ts` supports a URL override; otherwise skip.

- [ ] **Step 2: Frontend**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build 2>&1 | tail -2 && git status --short
```

Expected: 0 errors, all pass, built, clean tree.

- [ ] **Step 3: Classic regression on the local stack**

With the local backend running, reset the game, leave Round 1 as CLASSIC, and run the Phase 1 live bot test against it: `E2E_FE_URL=<local vite preview built with VITE_API_BASE_URL=http://localhost:8081> E2E_BE_URL=http://localhost:8081 npx playwright test scripts/e2e/browser/bots.spec.ts` (check `session.ts` honours `E2E_BE_URL`). Expected: 2 passed — Classic behaviour is intact.

- [ ] **Step 4: Stop the local stack**

`cd ~/Documents/GitHub/jokefactory_be && make docker-down`

- [ ] **Step 5: Hand off**

Report to the user: what shipped in each repo, the pilot verdict and table, the Classic regression result, and the open decisions — deploying the backend (`make deploy` is theirs), merging either branch, and the one live confirmation class. Use superpowers:finishing-a-development-branch for each repo. Do not push or merge without the user's go-ahead.
