# Two Costs and Bots That Use Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two costs only (listing and hosting, both Marketing's; shipping, storage and discard default to 0 and are shown nowhere while they are 0), and evidence that feedback matters: bots whose Marketing sends a plain-words note built from customer feedback and whose Joke Maker writes its next batch from it, a trait classifier that makes that feedback meaningful, a 2×2 pilot (small/large batches × feedback on/off) with five PASS/FAIL checks, and a cost sweep that picks the defaults.

**Architecture:** The backend only changes defaults (`domain` constants feed Reset Game, admin login and config-created rounds alike) and gains a local-only `TraitClassifier` (`APP_LLM_MODE=traits`, same confirmation guard as hash) that grades jokes from an embedded trait corpus, falling back to the hash classifier. The frontend generates that corpus (1,000 synthetic jokes, deterministic) and keeps a byte-identical copy pinned by SHA-256 in both repos, plus shared fit fixtures both scoring implementations run. One pure module, `services/shownFees.ts`, decides which fees a round charges; every screen, the tour and the Next step line name only those. The bot engine gains per-team pilot options (`useFeedback`, `round2BatchSize`, `releaseAll`) and a pure feedback loop (`services/bots/feedbackLoop.ts`: compose note → parse note → belief → pick corpus jokes). The pilot (`scripts/pilot/feedback-pilot.mts`, `cost-sweep.mts`) plays the 2×2 class against a local stack and renders the report from a JSON sidecar; the sweep itself is run by the controller after the build.

**Tech Stack:** Go (module `jokefactory`, gin, pgx v5, `go:embed`, in-memory `testutil.Store`, build tag `integration` against a throwaway Postgres database); React 19 + TypeScript 5.8 + Vite 6 + vitest 2 (environment `node`, `renderToStaticMarkup` screen tests via `views/testing/renderWithGame.ts`), tsx for scripts; local Docker stack (`jokefactory_be-api-1` on :8081, `jokefactory-postgres` on :55432).

**Spec:** `~/Documents/GitHub/AI-Joke-Factory/docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md` (binding; read it first — copy and amounts below are copied from it).

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Reading the edit steps:** "In `file`, replace: … with: …" means the first block occurs exactly once in the file, verbatim (whole lines, tabs in Go), at the moment that step is applied (earlier steps of the same task already applied), and is replaced by the second. "Create `file`:" writes a new file with exactly the block's content plus a final newline; "Replace the whole of `file` with:" overwrites it the same way. A block fenced with four backticks contains a three-backtick fence of its own. Paths are relative to the task's repo. Each `Run:` line `cd`s itself; compare its result with its `Expected:` (PASS = exit status 0, FAIL = non-zero).
- **Repos and branches:** backend `~/Documents/GitHub/jokefactory_be` (HEAD `5d7b4e9` when this plan was written), frontend `~/Documents/GitHub/AI-Joke-Factory` (HEAD `4ca7a35` plus this plan's own commit), both on branch `feat/two-costs-feedback-bots`. Each task names its repo; commit only there. The two repos sit next to each other: the parity tests compare the shared files across `~/Documents/GitHub/` when both are present.
- **Git:** new commits only. Never `git reset`, `git commit --amend`, `git rebase`, `git stash` or `git push`. Stage files by name (never `git add -A` / `git add .`). Never stage the frontend's `.claude/launch.json`, `.progress` or `node_modules`. Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never print secrets. Never `cat` `jokefactory_be/.env`; the admin password is only ever read by shell substitution (`$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)`) inside a command. Never run `docker compose config`.
- **Databases:** integration tests run ONLY against the throwaway database `jokefactory_twocosts_test` on the local Postgres (`postgres://postgres:postgres@localhost:55432/jokefactory_twocosts_test?sslmode=disable`), created and migrated in Task 1 and dropped in Task 8. No migration is added (spec §2.1); the real `jokefactory` database is never touched by this plan.
- **The two costs (spec §2):** Listing = `cost_of_publishing`, once per joke Marketing releases, starting value **$0.10**. Hosting = `hosting_fee_per_joke_minute`, every minute a released joke has not yet sold (release to first sale, or round end), starting value **$0.05 per joke-minute**. Everything else defaults to 0: shipping 0 / 0 / 0, storage 0, discard 0. `Profit = Sales × price − Listing − Hosting`. The API still accepts every fee; the profit formula is unchanged.
- **The display rule (spec §2.2):** a fee whose amount is 0 for the round is not shown anywhere — student screens, Next step, tour captions, fees panel, Setup → Costs, Live/Debrief fee columns, "Where the money leaked", class totals — so an old round with shipping still shows it and a class that sets storage back above 0 sees it again. Implemented once in `services/shownFees.ts` (`shownFees(config)`, an amount `> 0`, any shipping tier for shipping).
- **Copy (spec §2.2, verbatim):** Joke Maker: no cost copy at all (the shipping line is gone). Next step (Marketing, desk wait): "Batch waiting {n} s. Release what's good enough: customers arriving now can't buy it." (a round that charges storage appends the old "Storage costs … a joke each minute."). Tour, Joke Maker batch-size step: Round 1 "Every batch is 5 jokes. Keep them coming." Round 2 "You choose the batch size now. Smaller batches reach customers and come back with feedback sooner." Marketing fee step: "Every joke you release costs {listing} to list, and {hosting} a minute while it sits unsold. Release jokes that will sell." Wait timeline labels "With Marketing" and "Waiting for first buyer". Setup → Costs: Listing and Hosting. Class totals "Fees" = listing + hosting.
- **Trait corpus (spec §3):** 1,000 synthetic jokes, ids `T0001`…`T1000`, unique titles and texts, a non-catch-all category on all 11 matched criteria, word count inside its Length bucket (Short ≤ 15, Medium 16–40, Long ≥ 41). Generated by `scripts/traits/generate-trait-corpus.mts` (seed `trait-corpus-v1`) into `scripts/traits/trait-corpus.json`; the backend copy is `src/infra/llm/traitdata/trait-corpus.json`; SHA-256 `7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33` pinned in both repos. Shared fit fixtures: `config/fit-fixtures.json` (frontend) = `src/core/domain/scoring/testdata/fit-fixtures.json` (backend), SHA-256 `8ebe339deb91d1b661d6f4b1c25f2aab8d67da5ff4e73f303aee3bb55c431dd9`.
- **Trait classifier (spec §3):** `APP_LLM_MODE=traits` with `APP_LLM_HASH_CONFIRM=local-pilot-only` (else startup fails naming `APP_LLM_HASH_CONFIRM`); a corpus text (whitespace collapsed) gets its corpus categories and Title Fit "Strong"; any other text gets the hash classifier's categories. Never on the live site.
- **Feedback loop (spec §4):** the Marketing bot's note, one line per newly scored joke, `On "<title>": Keep: A, B. Change: C, D. D: <direction word>.` (labels and direction words of `config/dimensions.ts` and `views/feedback.ts`), at most 500 characters; the Joke Maker bot reads the latest note on its team's batch list; landed → keep that joke's category, missed categorical (or a scale without a direction) → avoid it, missed scale with a direction → move one step that way, unmentioned → unchanged; next batch = best-matching unused corpus jokes, ties by the run's seed. Feedback off = same persona, pace, batch sizes and seed; no note, picks by seed only. `useFeedback` is a per-team pilot option the bot panel never shows.
- **Pilot (spec §5):** one class = 20 teams (5 per group: Small + feedback, Small no feedback, Large + feedback, Large no feedback; Round 1 batches 5, Round 2 batches 3 or 10), matched pairs, Balanced pace, bots at 10×, 90 s window, trait classifier, every Marketing releases every joke, 3 classes per setting, fresh seed per class. Five checks as in spec §5. Sweep: listing {$0.10, $0.25, $0.50} × hosting {$0.05, $0.10, $0.20}; defaults = cheapest setting passing checks 2, 3 and 5.

Baselines (verified 2026-11-10 on the HEADs above): backend `gofmt -l .` clean, `go build ./... && go vet ./... && go vet -tags integration ./...` clean, `go test ./...` passes **193** tests (subtests included, `--- PASS` lines of `go test -v ./...`), integration **10** passing on a freshly migrated database; frontend `npx tsc --noEmit -p tsconfig.json` exits 0, `npx vitest run` passes **1375 tests in 87 files**, `npx vite build` succeeds.

## Review Focus

The five failure modes most likely to bite a real class or a real pilot, each pinned by a test in the owning task:

1. **A round where only some fees are 0** — storage set back above 0 on a two-cost class, or listing set to 0: each screen must show exactly the charged fees and never "$0.00" or "0¢" for a fee. Pinned: Task 4 `shownFees.test.ts` (0, missing, NaN), `tourSteps.test.ts` "a fee that is 0 is never named", `marketingRelease.test.ts` two-cost toast, `studentScreens.render.test.ts` two-cost tally; Task 5 `Instructor.render.test.ts` "Costs shows only Listing and Hosting … and shipping and storage again once charged".
2. **An old round that still charges shipping and storage** (the five-fee rule set): everything that was shown must still be shown, with the same amounts. Pinned: Task 4 `FeesAndWaits.test.tsx` "a round that still charges shipping and storage shows them", `nextStep.test.ts` storage clause; Task 5 `Instructor.leaderboard.render.test.ts` five-fee bar title and total.
3. **A note the Joke Maker bot did not expect** — a human-written note, a line about another team's joke, an unknown label, a note at the 500-character limit. It must never crash, never apply a line twice, never act on a joke it did not send. Pinned: Task 6 `feedbackLoop.test.ts` "parses back exactly what it says, and ignores anything else", "stays within the backend's 500 characters"; the engine applies a line only for a title in its own `sent` set (Task 6 `engine.feedback.test.ts`).
4. **The trait classifier switched on by accident, or fed text it does not know** — without the confirmation it must refuse to start; a non-corpus text (a human joke, a whitespace variant) must still be graded. Pinned: Task 3 `TestBuildClassifierTraitsNeedsConfirmation`, `TestTraitClassifierFallsBackToHashForOtherText`, `TestTraitClassifierGivesCorpusJokesTheirTraits` (newlines and tabs in the text).
5. **The two corpus copies drift** (regenerated in one repo only), so the pilot's fit and the backend's grading disagree silently. Pinned: Task 2 `traitCorpusParity.test.ts` and Task 3 `TestTraitCorpusIsTheVersionedCopy` / `TestTraitCorpusMatchesTheFrontendCopy` (and the same pair for the fit fixtures).

## File Structure

Backend (`~/Documents/GitHub/jokefactory_be`):

| File | Action | Responsibility |
|---|---|---|
| `src/core/domain/defaults.go` | Modify | Two-cost defaults: shipping 0/0/0, storage 0, discard 0 (listing 0.10 and hosting 0.05 unchanged). |
| `src/core/usecase/testutil/helpers.go` | Modify | `FiveFees(cfg)`: the old fee amounts, for tests whose arithmetic is about them. |
| `src/core/domain/{lean_fees,tuned_defaults}_test.go`, `src/core/usecase/{lean_fees,lean_fees_stats,lean_chart_rows}_test.go`, `src/app/server/{lean_fees,customers_per_team}_routes_test.go`, `src/infra/repo/postgres/customers_per_team_integration_test.go` | Modify | New defaults; fee arithmetic on `FiveFees`. |
| `src/app/server/two_costs_routes_test.go` | Create | Login, config-created round and Reset Game all start with the two costs. |
| `src/infra/llm/traitdata/trait-corpus.json`, `src/core/domain/scoring/testdata/fit-fixtures.json` | Create (copied) | Byte-identical copies of the frontend's files. |
| `src/infra/llm/trait_classifier.go` (+ `_test.go`), `src/infra/llm/trait_corpus_parity_test.go` | Create | `TraitClassifier`, the embedded corpus, its parity. |
| `src/core/domain/scoring/fit_fixtures_test.go` | Create | The shared fit fixtures in Go. |
| `main.go`, `main_test.go`, `src/infra/config/config.go`, `docker-compose.yml`, `README.md` | Modify | `APP_LLM_MODE=traits` wiring and guard; docs. |

Frontend (`~/Documents/GitHub/AI-Joke-Factory`):

| File | Action | Responsibility |
|---|---|---|
| `services/shared/traitCorpus.ts` (+ test) | Create | Corpus types, parse/validate, `traitFit`, index by text and title (browser-safe). |
| `scripts/traits/buildTraitCorpus.ts`, `generate-trait-corpus.mts`, `loadTraitCorpus.ts`, `trait-corpus.json` (+ tests) | Create | Deterministic generator, the committed corpus, the Node loader, parity. |
| `config/fit-fixtures.json`, `config/fitFixtures.test.ts` | Create | Shared fit fixtures for the TS port of DimFit/TrueFit. |
| `services/shownFees.ts` (+ test) | Create | Which fees a round charges; a team's fees by kind; fee names. |
| `views/testing/renderWithGame.ts` | Modify | `TWO_COST_CONFIG` beside `TEST_CONFIG` (now "an old round"). |
| `components/FeesAndWaits.tsx`, `views/{JokeMaker,QualityControl,WaitingRoom}.tsx`, `views/marketingRelease.ts`, `services/nextStep.ts`, `services/tour/tourSteps.ts`, `services/leanMode.ts`, `context.tsx` (+ tests) | Modify | Student screens, Next step and tour on the display rule; Joke Maker without cost copy. |
| `components/FeeConfigFields.tsx`, `components/instructor/{SetupTab,LiveBoard,LiveTab,DebriefTab}.tsx`, `components/LeanDebrief.tsx`, `components/leanCharts/{WasteBreakdownChart,LeanChartsPanel}.tsx`, `services/{liveBoard,classTotals,leanCharts}.ts` (+ tests) | Modify | Instructor screens on the display rule; Fees = every charged fee (listing + hosting). |
| `services/bots/feedbackLoop.ts` (+ test), `services/bots/testing/feedbackSim.ts` (+ test) | Create | Note, parse, belief, picking; a TS port of the backend's feedback selection for tests. |
| `services/bots/{engine,protocol}.ts`, `services/bots/testing/fakeApi.ts`, `services/bots/engine.feedback.test.ts` | Modify / Create | Per-team `useFeedback`, `round2BatchSize`, `releaseAll`; notes in the fake backend. |
| `scripts/pilot/feedbackReport.ts` (+ test), `feedbackClass.ts`, `feedback-pilot.mts`, `cost-sweep.mts` | Create | The 2×2 pilot, its checks, the sweep, reports. |
| `docs/lean-market-mode.md`, `README.md` | Modify | The guide (the instructor doc) on two costs and the feedback pilot. |

---

## Task 1: Backend — the two costs are the defaults

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Modify: `src/core/domain/defaults.go` (the fee constants), `src/core/usecase/testutil/helpers.go` (new `FiveFees`)
- Test: create `src/app/server/two_costs_routes_test.go`; modify `src/core/domain/lean_fees_test.go`, `src/core/domain/tuned_defaults_test.go`, `src/core/usecase/lean_fees_test.go`, `src/core/usecase/lean_fees_stats_test.go`, `src/core/usecase/lean_chart_rows_test.go`, `src/app/server/lean_fees_routes_test.go`, `src/app/server/customers_per_team_routes_test.go`, `src/infra/repo/postgres/customers_per_team_integration_test.go`

**Interfaces:**
- Consumes: `domain.DefaultRoundConfig()` / `DefaultRoundConfigFor(n)` (every way a round is created already goes through them: `admin_auth.go` Login, `round_repo.go` ResetGame, `memstore.go` ResetGame, `handler/instructor.go` Config/StartRound for a missing round), `server.New(...).Router()`, `feesRequest` (`src/app/server/lean_fees_routes_test.go`).
- Produces: `domain.DefaultShippingFeeSmall/Standard/Large = 0`, `DefaultStorageFeePerJokeMinute = 0`, `DefaultCostOfDiscard = 0` (`DefaultCostOfPublishing = 0.1`, `DefaultHostingFeePerJokeMinute = 0.05` unchanged); `func testutil.FiveFees(cfg domain.RoundConfig) domain.RoundConfig` (shipping 1/2/3, storage 0.05, discard 0.01). Wire: every new round's `cost_of_publishing` 0.1, `hosting_fee_per_joke_minute` 0.05, the other five fee keys 0.

- [ ] **Step 1: Create and migrate the throwaway database**

Run: `PGPASSWORD=postgres psql -h localhost -p 55432 -U postgres -d postgres -c "DROP DATABASE IF EXISTS jokefactory_twocosts_test" -c "CREATE DATABASE jokefactory_twocosts_test" && cd ~/Documents/GitHub/jokefactory_be && DB_DSN="postgres://postgres:postgres@localhost:55432/jokefactory_twocosts_test?sslmode=disable" make migrate-up`
Expected: PASS — prints `CREATE DATABASE`, then goose ends with `successfully migrated database to version: 6`.

- [ ] **Step 2: Write the failing tests (and the `FiveFees` test helper they use)**

In `src/core/usecase/testutil/helpers.go`, replace:

```go
	"jokefactory/src/core/domain/scoring"
)

```

with:

```go
	"jokefactory/src/core/domain/scoring"
)

// FiveFees is cfg with the five-fee amounts that preceded the two costs:
// shipping $1 / $2 / $3 per batch of 1–4 / 5 / 6+ jokes, storage $0.05 per
// joke-minute and discard $0.01 per joke. For tests whose arithmetic is about
// those fees; the defaults now charge only listing and hosting.
func FiveFees(cfg domain.RoundConfig) domain.RoundConfig {
	cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge = 1, 2, 3
	cfg.StorageFeePerJokeMinute = 0.05
	cfg.CostOfDiscard = 0.01
	return cfg
}

```

In `src/core/domain/lean_fees_test.go`, replace:

```go
// One Lean rule set for both rounds (spec §4 Defaults).
```

with:

```go
// One Lean rule set for both rounds, with two costs: listing and hosting
// (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §2).
```

In `src/core/domain/lean_fees_test.go`, replace:

```go
	if cfg.ShippingFeeSmall != 1 || cfg.ShippingFeeStandard != 2 || cfg.ShippingFeeLarge != 3 {
		t.Fatalf("shipping fees %v / %v / %v; want 1 / 2 / 3",
			cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge)
	}
	if cfg.StorageFeePerJokeMinute != 0.05 || cfg.HostingFeePerJokeMinute != 0.05 {
		t.Fatalf("storage %v, hosting %v; want 0.05, 0.05", cfg.StorageFeePerJokeMinute, cfg.HostingFeePerJokeMinute)
```

with:

```go
	if cfg.ShippingFeeSmall != 0 || cfg.ShippingFeeStandard != 0 || cfg.ShippingFeeLarge != 0 {
		t.Fatalf("shipping fees %v / %v / %v; want 0 / 0 / 0",
			cfg.ShippingFeeSmall, cfg.ShippingFeeStandard, cfg.ShippingFeeLarge)
	}
	if cfg.StorageFeePerJokeMinute != 0 || cfg.CostOfDiscard != 0 {
		t.Fatalf("storage %v, discard %v; want 0, 0", cfg.StorageFeePerJokeMinute, cfg.CostOfDiscard)
	}
	if cfg.CostOfPublishing != 0.10 || cfg.HostingFeePerJokeMinute != 0.05 {
		t.Fatalf("listing %v, hosting %v; want 0.10, 0.05", cfg.CostOfPublishing, cfg.HostingFeePerJokeMinute)
```

In `src/core/domain/tuned_defaults_test.go`, replace:

```go
	if DefaultStorageFeePerJokeMinute != 0.05 || DefaultBuyThreshold != 8 || DefaultPreferenceBase != 5 ||
		DefaultCustomersPerTeam != 18 {
		t.Fatalf("storage %v, buy threshold %v, preference base %v, customers per team %d; want 0.05, 8, 5, 18",
```

with:

```go
	if DefaultStorageFeePerJokeMinute != 0 || DefaultBuyThreshold != 8 || DefaultPreferenceBase != 5 ||
		DefaultCustomersPerTeam != 18 {
		t.Fatalf("storage %v, buy threshold %v, preference base %v, customers per team %d; want 0, 8, 5, 18",
```

In `src/core/domain/tuned_defaults_test.go`, replace:

```go
		if cfg.StorageFeePerJokeMinute != 0.05 || cfg.BuyThreshold != 8 || cfg.PreferenceBase != 5 ||
			cfg.CustomersPerTeam != 18 {
			t.Fatalf("round %d defaults %+v; want storage 0.05, buy threshold 8, preference base 5, 18 customers per team",
				n, cfg)
		}
		// Unchanged by the tuning.
		if cfg.ShippingFeeSmall != 1 || cfg.ShippingFeeStandard != 2 || cfg.ShippingFeeLarge != 3 ||
			cfg.HostingFeePerJokeMinute != 0.05 || cfg.CostOfPublishing != 0.1 || cfg.CostOfDiscard != 0.01 ||
```

with:

```go
		if cfg.StorageFeePerJokeMinute != 0 || cfg.BuyThreshold != 8 || cfg.PreferenceBase != 5 ||
			cfg.CustomersPerTeam != 18 {
			t.Fatalf("round %d defaults %+v; want storage 0, buy threshold 8, preference base 5, 18 customers per team",
				n, cfg)
		}
		// The two costs (listing and hosting); every other fee is 0.
		if cfg.ShippingFeeSmall != 0 || cfg.ShippingFeeStandard != 0 || cfg.ShippingFeeLarge != 0 ||
			cfg.HostingFeePerJokeMinute != 0.05 || cfg.CostOfPublishing != 0.1 || cfg.CostOfDiscard != 0 ||
```

In `src/core/usecase/lean_fees_test.go`, replace:

```go
				rd.ShippingFeeStandard != 2 || rd.StorageFeePerJokeMinute != 0.05 || rd.HostingFeePerJokeMinute != 0.05 ||
				rd.StartedAt != nil {
				t.Fatalf("%s: round %d = %+v; want CONFIGURED LEAN, batch size %d, default fees",
```

with:

```go
				rd.ShippingFeeStandard != 0 || rd.StorageFeePerJokeMinute != 0 || rd.CostOfDiscard != 0 ||
				rd.CostOfPublishing != 0.1 || rd.HostingFeePerJokeMinute != 0.05 || rd.StartedAt != nil {
				t.Fatalf("%s: round %d = %+v; want CONFIGURED LEAN, batch size %d, the two costs",
```

In `src/core/usecase/lean_fees_test.go`, replace:

```go
// startedDefaultRound configures round 1 with the defaults and starts it.
func startedDefaultRound(t *testing.T, svc *usecase.InstructorService) domain.RoundConfig {
	t.Helper()
	ctx := context.Background()
	cfg := domain.DefaultRoundConfig()
```

with:

```go
// startedDefaultRound configures round 1 with the defaults and the five fees
// (so every fee has a value to change) and starts it.
func startedDefaultRound(t *testing.T, svc *usecase.InstructorService) domain.RoundConfig {
	t.Helper()
	ctx := context.Background()
	cfg := testutil.FiveFees(domain.DefaultRoundConfig())
```

In `src/core/usecase/lean_fees_stats_test.go`, replace:

```go
	cfg := domain.DefaultRoundConfigFor(2)
```

with:

```go
	cfg := testutil.FiveFees(domain.DefaultRoundConfigFor(2))
```

In `src/core/usecase/lean_chart_rows_test.go`, replace:

```go
	cfg := domain.DefaultRoundConfig()
	cfg.MarketMode = domain.MarketLean
	cfg.BatchSize = 10
	cfg.StorageFeePerJokeMinute = 0.05
```

with:

```go
	cfg := testutil.FiveFees(domain.DefaultRoundConfig())
	cfg.MarketMode = domain.MarketLean
	cfg.BatchSize = 10
```

Create `src/app/server/two_costs_routes_test.go`:

```go
package server_test

import (
	"io"
	"log/slog"
	"net/http"
	"testing"

	"jokefactory/src/app/server"
	"jokefactory/src/core/usecase/testutil"
	"jokefactory/src/infra/config"
)

// twoCostsIssue names what differs from the two costs on a round as the API
// returns it: listing $0.10 per released joke and hosting $0.05 per
// joke-minute, every other fee 0. "" when it matches.
func twoCostsIssue(r map[string]any) string {
	want := map[string]float64{
		"cost_of_publishing": 0.1, "hosting_fee_per_joke_minute": 0.05,
		"shipping_fee_small": 0, "shipping_fee_standard": 0, "shipping_fee_large": 0,
		"storage_fee_per_joke_minute": 0, "cost_of_discard": 0,
	}
	for k, v := range want {
		if got, ok := r[k].(float64); !ok || got != v {
			return k
		}
	}
	return ""
}

// Every way a round comes to exist starts with the two costs (spec §2.1):
// admin login (rounds 1 and 2), a config call that creates a round (round 3)
// and Reset Game.
func TestTwoCostsOnEveryNewRound(t *testing.T) {
	st := testutil.NewStore()
	cfg := &config.Config{Admin: config.AdminConfig{AdminPassword: "pw"}}
	h := server.New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), st, nil, nil).Router()

	code, login := feesRequest(t, h, http.MethodPost, "/v1/instructor/login", 0,
		map[string]any{"display_name": "Instructor", "password": "pw"})
	if code != http.StatusOK {
		t.Fatalf("login: %d %v", code, login)
	}
	instructor := int64(login["user"].(map[string]any)["user_id"].(float64))

	publicRounds := func(when string) {
		t.Helper()
		code, body := feesRequest(t, h, http.MethodGet, "/v1/rounds/active", 0, nil)
		if code != http.StatusOK {
			t.Fatalf("%s: rounds/active: %d %v", when, code, body)
		}
		seen := 0
		for _, r := range body["data"].(map[string]any)["rounds"].([]any) {
			m := r.(map[string]any)
			if n := m["round_number"]; n != 1.0 && n != 2.0 {
				continue
			}
			seen++
			if k := twoCostsIssue(m); k != "" {
				t.Errorf("%s: public round %v %s = %v; want the two costs", when, m["round_number"], k, m[k])
			}
		}
		if seen != 2 {
			t.Fatalf("%s: %d of rounds 1 and 2 listed", when, seen)
		}
	}
	publicRounds("after login")

	code, body := feesRequest(t, h, http.MethodPost, "/v1/instructor/rounds/3/config", instructor, map[string]any{})
	if code != http.StatusOK {
		t.Fatalf("config creating round 3: %d %v", code, body)
	}
	r3 := body["data"].(map[string]any)["round"].(map[string]any)
	if k := twoCostsIssue(r3); k != "" {
		t.Errorf("round 3 created by config: %s = %v; want the two costs", k, r3[k])
	}

	code, body = feesRequest(t, h, http.MethodPost, "/v1/instructor/rounds/1/config", instructor,
		map[string]any{"shipping_fee_small": 1, "shipping_fee_standard": 2, "shipping_fee_large": 3, "storage_fee_per_joke_minute": 0.2})
	if code != http.StatusOK {
		t.Fatalf("config round 1: %d %v", code, body)
	}
	if code, body := feesRequest(t, h, http.MethodPost, "/v1/admin/reset", instructor, nil); code != http.StatusOK {
		t.Fatalf("reset: %d %v", code, body)
	}
	publicRounds("after reset")
}
```

In `src/app/server/lean_fees_routes_test.go`, replace:

```go
	if r1 := publicRound(1); r1["shipping_fee_standard"] != 2.0 || r1["storage_fee_per_joke_minute"] != 0.05 ||
```

with:

```go
	if r1 := publicRound(1); r1["shipping_fee_standard"] != 0.0 || r1["storage_fee_per_joke_minute"] != 0.0 ||
```

In `src/app/server/lean_fees_routes_test.go`, replace:

```go
	if r2 := publicRound(2); r2["batch_size"] != 10.0 || r2["shipping_fee_small"] != 1.0 ||
		r2["storage_fee_per_joke_minute"] != 0.05 || r2["status"] != "CONFIGURED" {
```

with:

```go
	if r2 := publicRound(2); r2["batch_size"] != 10.0 || r2["shipping_fee_small"] != 0.0 ||
		r2["storage_fee_per_joke_minute"] != 0.0 || r2["status"] != "CONFIGURED" {
```

In `src/app/server/customers_per_team_routes_test.go`, replace:

```go
		r["storage_fee_per_joke_minute"] != 0.05 {
```

with:

```go
		r["storage_fee_per_joke_minute"] != 0.0 {
```

In `src/infra/repo/postgres/customers_per_team_integration_test.go`, replace:

```go
			rd.StorageFeePerJokeMinute != 0.05 || domain.ConfigFromRound(rd) != domain.DefaultRoundConfigFor(int(n)) {
```

with:

```go
			rd.StorageFeePerJokeMinute != 0 || domain.ConfigFromRound(rd) != domain.DefaultRoundConfigFor(int(n)) {
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/domain/ ./src/core/usecase/ ./src/app/server/`
Expected: FAIL — `TestDefaultRoundConfigIsTheLeanRuleSet` ("shipping fees 1 / 2 / 3; want 0 / 0 / 0"), `TestTunedDefaults`, `TestLoginAndResetGiveRound1FiveAndRound2Ten`, `TestTwoCostsOnEveryNewRound`, `TestLeanFeesRoutes` and `TestCustomersPerTeamRoutes` fail; the fee-arithmetic tests now on `FiveFees` still pass.

- [ ] **Step 4: Set the two-cost defaults**

In `src/core/domain/defaults.go`, replace:

```go
	DefaultCostOfDiscard         = 0.01
```

with:

```go
	DefaultCostOfDiscard         = 0.0
```

In `src/core/domain/defaults.go`, replace:

```go
	// Lean fees (see lean_fees.go).
	DefaultShippingFeeSmall        = 1.0
	DefaultShippingFeeStandard     = 2.0
	DefaultShippingFeeLarge        = 3.0
	DefaultStorageFeePerJokeMinute = 0.05
```

with:

```go
	// Two costs, both Marketing's: listing (DefaultCostOfPublishing, per
	// released joke) and hosting (per joke-minute unsold). Shipping, storage
	// and discard default to 0; the columns and the API keep them as knobs
	// (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §2).
	DefaultShippingFeeSmall        = 0.0
	DefaultShippingFeeStandard     = 0.0
	DefaultShippingFeeLarge        = 0.0
	DefaultStorageFeePerJokeMinute = 0.0
```

In `src/core/domain/defaults.go`, replace:

```go
	// moment. 0 keeps the fixed DefaultCustomerCount. Buy threshold 8,
	// preference base 5 and storage $0.05 are the values the 20-team sweep
	// validated (docs/superpowers/specs/2026-10-11-tuned-defaults-design.md).
```

with:

```go
	// moment. 0 keeps the fixed DefaultCustomerCount. Buy threshold 8 and
	// preference base 5 are the values the 20-team sweep validated
	// (docs/superpowers/specs/2026-10-11-tuned-defaults-design.md).
```

- [ ] **Step 5: Run the tests, the gates and the integration tests**

Run: `cd ~/Documents/GitHub/jokefactory_be && test -z "$(gofmt -l .)" && go build ./... && go vet ./... && go vet -tags integration ./... && go test ./...`
Expected: PASS — every package `ok`.

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_ALLOW_RESET=1 JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory_twocosts_test?sslmode=disable" go test -count=1 -tags integration ./src/infra/repo/postgres/ -run Integration -v`
Expected: PASS — 10 `--- PASS` lines, including `TestResetGameGivesTheTunedDefaultsIntegration` (SQL Reset Game gives exactly `DefaultRoundConfigFor(n)`, storage 0).

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be && git add src/core/domain/defaults.go src/core/usecase/testutil/helpers.go src/core/domain/lean_fees_test.go src/core/domain/tuned_defaults_test.go src/core/usecase/lean_fees_test.go src/core/usecase/lean_fees_stats_test.go src/core/usecase/lean_chart_rows_test.go src/app/server/two_costs_routes_test.go src/app/server/lean_fees_routes_test.go src/app/server/customers_per_team_routes_test.go src/infra/repo/postgres/customers_per_team_integration_test.go && git commit -q -F - <<'EOF'
feat(costs): two costs by default, listing and hosting

Shipping, storage and discard default to 0 on every new round (login,
config-created rounds, Reset Game); the columns and the API keep them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 2: Frontend — the trait corpus and the shared fit fixtures

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `services/shared/traitCorpus.ts`, `scripts/traits/buildTraitCorpus.ts`, `scripts/traits/loadTraitCorpus.ts`, `scripts/traits/generate-trait-corpus.mts`, `scripts/traits/trait-corpus.json` (generated in Step 4)
- Test: create `config/fit-fixtures.json`, `config/fitFixtures.test.ts`, `services/shared/traitCorpus.test.ts`, `scripts/traits/buildTraitCorpus.test.ts`, `scripts/traits/traitCorpusParity.test.ts`

**Interfaces:**
- Consumes: `config/dimensions.ts` (`IDEAL_DIMENSIONS`, `DEFAULT_IDEAL_PROFILE`, `classifyLength`, `wordCount`, `isCatchAll`, `dimFit`, `trueFit`, the TS port of the Go scoring rules), `seededRng` and `asRawBlob` (`services/shared/jokes.ts`), `splitBlob` (`services/bots/engine.ts`).
- Produces:
  ```ts
  // services/shared/traitCorpus.ts (browser-safe)
  export const TRAIT_CORPUS_VERSION = 1; export const TRAIT_TITLE_FIT = 'Strong';
  export type Traits = Record<IdealDimension, string>;
  export interface TraitJoke { id: string; title: string; text: string; traits: Traits }
  export interface TraitCorpus { version: number; seed: string; jokes: TraitJoke[] }
  export function normalizeJokeText(text: string): string;            // whitespace collapsed, trimmed
  export function parseTraitCorpus(raw: unknown): TraitCorpus;          // throws naming the bad joke
  export function traitClassification(j: Pick<TraitJoke, 'traits'>): Classification; // + TITLE_FIT Strong
  export function traitFit(j: Pick<TraitJoke, 'traits'>, ideal: IdealProfile): number;
  export interface TraitIndex { byText: ReadonlyMap<string, TraitJoke>; byTitle: ReadonlyMap<string, TraitJoke> }
  export function indexTraitCorpus(c: TraitCorpus): TraitIndex;
  // scripts/traits/loadTraitCorpus.ts (Node only)
  export const TRAIT_CORPUS_PATH: string; export function loadTraitCorpus(path?: string): TraitCorpus;
  // scripts/traits/buildTraitCorpus.ts
  export const TRAIT_CORPUS_SEED = 'trait-corpus-v1', TRAIT_CORPUS_SIZE = 1000, QUALITY_EXPONENT = 20;
  export const PILOT_IDEAL; export const WORD_RANGES;
  export function buildTraitCorpus(size?: number, seed?: string): TraitCorpus;
  export function serializeTraitCorpus(c: TraitCorpus): string;     // one joke per line
  ```
  Files: `scripts/traits/trait-corpus.json` (SHA-256 `7daeba04…7e33`), `config/fit-fixtures.json` (SHA-256 `8ebe339d…1dd9`).

- [ ] **Step 1: Write the failing tests and the shared fit fixtures**

Create `config/fit-fixtures.json`:

```json
{
  "about": "Shared scoring fixtures: the backend (src/core/domain/scoring/testdata/fit-fixtures.json, fit_fixtures_test.go) and the frontend (config/fit-fixtures.json, config/fitFixtures.test.ts) keep byte-identical copies and both assert every case. dim_fit lists all 12 dimensions; a missing classification key is an empty category.",
  "ideals": {
    "pilot": {"LENGTH": "Medium", "TOPIC": "Work", "HUMOR_STYLE": "Observational", "COMPLEXITY": "Moderate", "EDGINESS": "Clean", "STRUCTURE": "Setup–punchline", "WORDPLAY": "Light", "FRESHNESS": "Timeless", "SETUP_PAYOFF": "Balanced", "CLARITY": "Crystal clear", "ENERGY": "Conversational"},
    "far": {"LENGTH": "Short", "TOPIC": "Food", "HUMOR_STYLE": "Pun", "COMPLEXITY": "Very simple", "EDGINESS": "Slightly edgy", "STRUCTURE": "One-liner", "WORDPLAY": "Heavy", "FRESHNESS": "Time-sensitive", "SETUP_PAYOFF": "Immediate", "CLARITY": "Reinterpretation", "ENERGY": "Deadpan"}
  },
  "cases": [
    {
      "name": "on the ideal everywhere, perfect title",
      "ideal": "pilot",
      "classification": {"LENGTH": "Medium", "TOPIC": "Work", "HUMOR_STYLE": "Observational", "COMPLEXITY": "Moderate", "EDGINESS": "Clean", "STRUCTURE": "Setup–punchline", "WORDPLAY": "Light", "FRESHNESS": "Timeless", "SETUP_PAYOFF": "Balanced", "CLARITY": "Crystal clear", "ENERGY": "Conversational", "TITLE_FIT": "Perfect"},
      "dim_fit": {"LENGTH": 1, "TOPIC": 1, "HUMOR_STYLE": 1, "COMPLEXITY": 1, "EDGINESS": 1, "STRUCTURE": 1, "WORDPLAY": 1, "FRESHNESS": 1, "SETUP_PAYOFF": 1, "CLARITY": 1, "ENERGY": 1, "TITLE_FIT": 1},
      "true_fit": 12
    },
    {
      "name": "on the ideal everywhere, the trait classifier's Strong title",
      "ideal": "pilot",
      "classification": {"LENGTH": "Medium", "TOPIC": "Work", "HUMOR_STYLE": "Observational", "COMPLEXITY": "Moderate", "EDGINESS": "Clean", "STRUCTURE": "Setup–punchline", "WORDPLAY": "Light", "FRESHNESS": "Timeless", "SETUP_PAYOFF": "Balanced", "CLARITY": "Crystal clear", "ENERGY": "Conversational", "TITLE_FIT": "Strong"},
      "dim_fit": {"LENGTH": 1, "TOPIC": 1, "HUMOR_STYLE": 1, "COMPLEXITY": 1, "EDGINESS": 1, "STRUCTURE": 1, "WORDPLAY": 1, "FRESHNESS": 1, "SETUP_PAYOFF": 1, "CLARITY": 1, "ENERGY": 1, "TITLE_FIT": 0.75},
      "true_fit": 11.75
    },
    {
      "name": "every ordered scale one step off, moderate title",
      "ideal": "pilot",
      "classification": {"LENGTH": "Short", "TOPIC": "Work", "HUMOR_STYLE": "Observational", "COMPLEXITY": "Thoughtful", "EDGINESS": "Clean", "STRUCTURE": "Setup–punchline", "WORDPLAY": "Moderate", "FRESHNESS": "Slightly current", "SETUP_PAYOFF": "Quick", "CLARITY": "Mostly clear", "ENERGY": "Animated", "TITLE_FIT": "Moderate"},
      "dim_fit": {"LENGTH": 0.5, "TOPIC": 1, "HUMOR_STYLE": 1, "COMPLEXITY": 0.5, "EDGINESS": 1, "STRUCTURE": 1, "WORDPLAY": 0.5, "FRESHNESS": 0.5, "SETUP_PAYOFF": 0.5, "CLARITY": 0.5, "ENERGY": 0.5, "TITLE_FIT": 0.5},
      "true_fit": 8
    },
    {
      "name": "the pilot's ideal judged against a far ideal, weak title",
      "ideal": "far",
      "classification": {"LENGTH": "Medium", "TOPIC": "Work", "HUMOR_STYLE": "Observational", "COMPLEXITY": "Moderate", "EDGINESS": "Clean", "STRUCTURE": "Setup–punchline", "WORDPLAY": "Light", "FRESHNESS": "Timeless", "SETUP_PAYOFF": "Balanced", "CLARITY": "Crystal clear", "ENERGY": "Conversational", "TITLE_FIT": "Weak"},
      "dim_fit": {"LENGTH": 0.5, "TOPIC": 0, "HUMOR_STYLE": 0, "COMPLEXITY": 0, "EDGINESS": 0, "STRUCTURE": 0, "WORDPLAY": 0, "FRESHNESS": 0, "SETUP_PAYOFF": 0, "CLARITY": 0, "ENERGY": 0, "TITLE_FIT": 0.25},
      "true_fit": 0.75
    },
    {
      "name": "catch-all categories score 0 against a real ideal",
      "ideal": "pilot",
      "classification": {"LENGTH": "Medium", "TOPIC": "Work", "HUMOR_STYLE": "None of the above", "COMPLEXITY": "Moderate", "EDGINESS": "Clean", "STRUCTURE": "None of the above", "WORDPLAY": "Light", "FRESHNESS": "Timeless", "SETUP_PAYOFF": "Balanced", "CLARITY": "Crystal clear", "ENERGY": "None of the above", "TITLE_FIT": "Mismatch"},
      "dim_fit": {"LENGTH": 1, "TOPIC": 1, "HUMOR_STYLE": 0, "COMPLEXITY": 1, "EDGINESS": 1, "STRUCTURE": 0, "WORDPLAY": 1, "FRESHNESS": 1, "SETUP_PAYOFF": 1, "CLARITY": 1, "ENERGY": 0, "TITLE_FIT": 0},
      "true_fit": 8
    },
    {
      "name": "unknown and missing categories score 0",
      "ideal": "pilot",
      "classification": {"LENGTH": "Medium", "TOPIC": "Weather", "HUMOR_STYLE": "Observational", "EDGINESS": "Clean", "STRUCTURE": "Setup–punchline", "WORDPLAY": "Light", "FRESHNESS": "Timeless", "SETUP_PAYOFF": "Balanced", "CLARITY": "Crystal clear", "ENERGY": "Conversational", "TITLE_FIT": "Great"},
      "dim_fit": {"LENGTH": 1, "TOPIC": 0, "HUMOR_STYLE": 1, "COMPLEXITY": 0, "EDGINESS": 1, "STRUCTURE": 1, "WORDPLAY": 1, "FRESHNESS": 1, "SETUP_PAYOFF": 1, "CLARITY": 1, "ENERGY": 1, "TITLE_FIT": 0},
      "true_fit": 9
    }
  ]
}
```

Create `config/fitFixtures.test.ts`:

```ts
/* The shared fit fixtures (config/fit-fixtures.json): the backend runs the same
   file in src/core/domain/scoring/fit_fixtures_test.go, so the TypeScript port
   of DimFit and TrueFit (config/dimensions.ts) and the Go rules agree on every
   case. scripts/traits/traitCorpusParity.test.ts checks the two copies match. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIMENSIONS, dimFit, trueFit } from './dimensions';

interface FitCase {
  name: string;
  ideal: string;
  classification: Record<string, string>;
  dim_fit: Record<string, number>;
  true_fit: number;
}

const fixtures = JSON.parse(readFileSync(new URL('./fit-fixtures.json', import.meta.url), 'utf8')) as {
  ideals: Record<string, Record<string, string>>;
  cases: FitCase[];
};

describe('shared fit fixtures', () => {
  it('lists every one of the 12 dimensions in each case', () => {
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of fixtures.cases) {
      expect(Object.keys(c.dim_fit).sort()).toEqual(DIMENSIONS.map(d => d.id).sort());
      expect(fixtures.ideals[c.ideal]).toBeDefined();
    }
  });

  for (const c of fixtures.cases) {
    it(c.name, () => {
      const ideal = fixtures.ideals[c.ideal];
      for (const d of DIMENSIONS) {
        expect(dimFit(d.id, d.hasIdeal ? ideal[d.id] ?? '' : '', c.classification[d.id] ?? ''), d.id).toBe(c.dim_fit[d.id]);
      }
      expect(trueFit(c.classification, ideal)).toBe(c.true_fit);
    });
  }
});
```

Create `services/shared/traitCorpus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import {
  TRAIT_TITLE_FIT, indexTraitCorpus, normalizeJokeText, parseTraitCorpus, traitClassification, traitFit,
  type TraitCorpus, type TraitJoke,
} from './traitCorpus';

const IDEAL_TRAITS = { ...DEFAULT_IDEAL_PROFILE } as TraitJoke['traits'];
/** 20 words: Medium, like the ideal's LENGTH. */
const MEDIUM_TEXT = 'The intern scheduled the quarterly goals with a straight face. Payroll lost my lunch break and nobody noticed at all.';

const joke = (over: Partial<TraitJoke> = {}): TraitJoke => ({
  id: 'T0001', title: 'Office Memo No. 1', text: MEDIUM_TEXT, traits: { ...IDEAL_TRAITS }, ...over,
});
const corpus = (jokes: unknown[], over: Record<string, unknown> = {}) => ({ version: 1, seed: 's', jokes, ...over });

describe('parseTraitCorpus', () => {
  it('accepts a well-formed corpus', () => {
    const c = parseTraitCorpus(corpus([joke(), joke({ id: 'T0002', title: 'Office Memo No. 2', text: `${MEDIUM_TEXT} Again.` })]));
    expect(c.jokes).toHaveLength(2);
  });

  it.each([
    ['a wrong version', corpus([joke()], { version: 2 }), /version/],
    ['a missing criterion', corpus([joke({ traits: { ...IDEAL_TRAITS, ENERGY: undefined } as unknown as TraitJoke['traits'] })]), /ENERGY/],
    ['a catch-all category', corpus([joke({ traits: { ...IDEAL_TRAITS, ENERGY: 'None of the above' } })]), /ENERGY/],
    ['an unknown category', corpus([joke({ traits: { ...IDEAL_TRAITS, TOPIC: 'Weather' } })]), /TOPIC/],
    ['Title Fit among the traits', corpus([joke({ traits: { ...IDEAL_TRAITS, TITLE_FIT: 'Strong' } as TraitJoke['traits'] })]), /exactly/],
    ['a LENGTH the text does not have', corpus([joke({ traits: { ...IDEAL_TRAITS, LENGTH: 'Short' } })]), /LENGTH Short/],
    ['a repeated title', corpus([joke(), joke({ id: 'T0002', text: `${MEDIUM_TEXT} Again.` })]), /repeats/],
    ['a repeated text up to spacing', corpus([joke(), joke({ id: 'T0002', title: 'Other', text: `  ${MEDIUM_TEXT.replace(' ', '   ')} ` })]), /repeats/],
  ])('refuses %s', (_name, raw, message) => {
    expect(() => parseTraitCorpus(raw)).toThrow(message);
  });
});

describe('trait fit', () => {
  it('grades a corpus joke with its traits and Title Fit "Strong"', () => {
    expect(TRAIT_TITLE_FIT).toBe('Strong');
    expect(traitClassification(joke())).toEqual({ ...IDEAL_TRAITS, TITLE_FIT: 'Strong' });
  });

  it('scores a joke on the ideal at 11.75 and one off it lower', () => {
    expect(traitFit(joke(), DEFAULT_IDEAL_PROFILE)).toBe(11.75);
    expect(traitFit(joke({ traits: { ...IDEAL_TRAITS, TOPIC: 'Food', COMPLEXITY: 'Expert' } }), DEFAULT_IDEAL_PROFILE)).toBe(9.75);
  });
});

describe('indexTraitCorpus', () => {
  it('finds a joke by its text, whatever the spacing, and by its title', () => {
    const c: TraitCorpus = parseTraitCorpus(corpus([joke()]));
    const idx = indexTraitCorpus(c);
    expect(idx.byText.get(normalizeJokeText(`\n ${MEDIUM_TEXT.replace(/ /g, '  ')} `))?.id).toBe('T0001');
    expect(idx.byTitle.get('Office Memo No. 1')?.id).toBe('T0001');
  });
});
```

Create `scripts/traits/buildTraitCorpus.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IDEAL_DIMENSIONS, classifyLength, isCatchAll, wordCount } from '../../config/dimensions';
import { asRawBlob } from '../../services/shared/jokes';
import { splitBlob } from '../../services/bots/engine';
import { parseTraitCorpus, traitFit } from '../../services/shared/traitCorpus';
import { PILOT_IDEAL, TRAIT_CORPUS_SIZE, WORD_RANGES, buildTraitCorpus, serializeTraitCorpus } from './buildTraitCorpus';
import { TRAIT_CORPUS_PATH } from './loadTraitCorpus';

const built = buildTraitCorpus();

describe('buildTraitCorpus', () => {
  it('is deterministic and builds 1,000 jokes the parser accepts', () => {
    expect(TRAIT_CORPUS_SIZE).toBe(1000);
    expect(serializeTraitCorpus(buildTraitCorpus())).toBe(serializeTraitCorpus(built));
    expect(parseTraitCorpus(JSON.parse(serializeTraitCorpus(built))).jokes).toHaveLength(1000);
  });

  it('uses every category but the catch-all on each of the 11 matched criteria', () => {
    for (const d of IDEAL_DIMENSIONS) {
      const seen = new Set(built.jokes.map(j => j.traits[d.id as keyof typeof j.traits]));
      expect([...seen].sort(), d.id).toEqual(d.categories.filter(c => !isCatchAll(c)).sort());
    }
  });

  it('writes texts whose word count sits inside their Length category', () => {
    for (const j of built.jokes) {
      const [lo, hi] = WORD_RANGES[j.traits.LENGTH];
      expect(wordCount(j.text)).toBeGreaterThanOrEqual(lo);
      expect(wordCount(j.text)).toBeLessThanOrEqual(hi);
      expect(classifyLength(j.text)).toBe(j.traits.LENGTH);
    }
  });

  it('puts about 4 % of jokes over the customers\' bar of 8 for the pilot ideal, most far below it', () => {
    const fits = built.jokes.map(j => traitFit(j, PILOT_IDEAL)).sort((a, b) => a - b);
    const share = fits.filter(f => f >= 8).length / fits.length;
    expect(share).toBeGreaterThanOrEqual(0.02);
    expect(share).toBeLessThanOrEqual(0.06);
    expect(fits[fits.length / 2]).toBeLessThan(6);
  });

  it('survives the Joke Maker blob and the bots\' blank-line split', () => {
    const five = built.jokes.slice(0, 5);
    expect(splitBlob(asRawBlob(five.map(j => j.text)))).toEqual(five.map(j => j.text));
  });

  it('is exactly the committed scripts/traits/trait-corpus.json', () => {
    expect(readFileSync(TRAIT_CORPUS_PATH, 'utf8')).toBe(serializeTraitCorpus(built));
  });
});
```

Create `scripts/traits/traitCorpusParity.test.ts`:

```ts
/* The trait corpus and the fit fixtures are versioned files kept byte-identical
   in both repos (spec §3). Each repo pins their SHA-256 here (the backend in
   src/infra/llm/trait_corpus_parity_test.go), so a copy that drifts fails in the
   repo where it changed; when the backend repo sits next to this one, the copies
   are also compared directly. After regenerating, update both constants. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TRAIT_CORPUS_SHA256 = '7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33';
const FIT_FIXTURES_SHA256 = '8ebe339deb91d1b661d6f4b1c25f2aab8d67da5ff4e73f303aee3bb55c431dd9';

const here = (p: string) => new URL(p, import.meta.url);
const sha256 = (u: URL) => createHash('sha256').update(readFileSync(u)).digest('hex');

const FILES = [
  { name: 'trait corpus', mine: here('./trait-corpus.json'), sum: TRAIT_CORPUS_SHA256,
    backend: here('../../../jokefactory_be/src/infra/llm/traitdata/trait-corpus.json') },
  { name: 'fit fixtures', mine: here('../../config/fit-fixtures.json'), sum: FIT_FIXTURES_SHA256,
    backend: here('../../../jokefactory_be/src/core/domain/scoring/testdata/fit-fixtures.json') },
];

describe('shared files', () => {
  for (const f of FILES) {
    it(`the ${f.name} is the versioned copy`, () => {
      expect(sha256(f.mine)).toBe(f.sum);
    });
    it.skipIf(!existsSync(f.backend))(`the backend's ${f.name} matches byte for byte`, () => {
      expect(readFileSync(f.backend).equals(readFileSync(f.mine))).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run config/fitFixtures.test.ts services/shared/traitCorpus.test.ts scripts/traits/`
Expected: FAIL — `services/shared/traitCorpus.test.ts` and `scripts/traits/buildTraitCorpus.test.ts` cannot import their modules, and the parity test cannot read `scripts/traits/trait-corpus.json`; `config/fitFixtures.test.ts` already passes (the TS port exists; it pins it).

- [ ] **Step 3: Write the corpus module, the generator and the loader**

Create `services/shared/traitCorpus.ts`:

```ts
/* The trait corpus (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §3):
   synthetic jokes, each with a known category on all 11 matched criteria, for
   LOCAL bot pilots only. The backend's trait classifier (APP_LLM_MODE=traits)
   grades a joke whose text is in the corpus with exactly these categories and
   Title Fit "Strong", so a bot knows its own jokes' traits the way a writer
   knows they wrote a long pun. It never sees the ideal or a fit score; the
   pilot computes fit with traitFit to measure the bots.

   The file is scripts/traits/trait-corpus.json (generated by
   scripts/traits/generate-trait-corpus.mts; the backend keeps a byte-identical
   copy). Pure and browser-safe: Node code reads the file
   (scripts/traits/loadTraitCorpus.ts) and hands the parsed corpus in. */
import {
  IDEAL_DIMENSIONS, classifyLength, isCatchAll, trueFit,
  type Classification, type IdealDimension, type IdealProfile,
} from '../../config/dimensions';

export const TRAIT_CORPUS_VERSION = 1;
/** The Title Fit the trait classifier gives every corpus joke. */
export const TRAIT_TITLE_FIT = 'Strong';

/** A category for each of the 11 matched criteria (every dimension but Title Fit). */
export type Traits = Record<IdealDimension, string>;

export interface TraitJoke {
  /** "T0001" … */
  id: string;
  /** What Marketing types as the title; unique in the corpus. */
  title: string;
  /** One line; its word count matches traits.LENGTH. */
  text: string;
  traits: Traits;
}

export interface TraitCorpus {
  version: number;
  seed: string;
  jokes: TraitJoke[];
}

/** Whitespace collapsed and trimmed, as the backend's trait classifier matches text. */
export function normalizeJokeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * The corpus file's JSON, checked: the version, unique ids, titles and texts,
 * a valid category other than the catch-all on all 11 matched criteria, and a
 * LENGTH that matches the text's word count (scoring/length.go). Throws an
 * Error naming the first bad joke.
 */
export function parseTraitCorpus(raw: unknown): TraitCorpus {
  const c = raw as Partial<TraitCorpus> | null;
  if (!c || c.version !== TRAIT_CORPUS_VERSION || !isString(c.seed) || !Array.isArray(c.jokes)) {
    throw new Error(`trait corpus: want {version: ${TRAIT_CORPUS_VERSION}, seed, jokes: [...]}`);
  }
  const ids = new Set<string>();
  const titles = new Set<string>();
  const texts = new Set<string>();
  for (const j of c.jokes as Partial<TraitJoke>[]) {
    const where = `trait corpus joke ${JSON.stringify(j?.id)}`;
    if (!j || !isString(j.id) || !isString(j.title) || !isString(j.text) || !j.traits) {
      throw new Error(`${where}: needs id, title, text and traits`);
    }
    if (ids.has(j.id) || titles.has(j.title) || texts.has(normalizeJokeText(j.text))) {
      throw new Error(`${where}: id, title or text repeats an earlier joke`);
    }
    ids.add(j.id);
    titles.add(j.title);
    texts.add(normalizeJokeText(j.text));
    for (const d of IDEAL_DIMENSIONS) {
      const cat = (j.traits as Record<string, unknown>)[d.id];
      if (typeof cat !== 'string' || !d.categories.includes(cat) || isCatchAll(cat)) {
        throw new Error(`${where}: ${d.id} ${JSON.stringify(cat)} is not one of its categories`);
      }
    }
    if (Object.keys(j.traits).length !== IDEAL_DIMENSIONS.length) {
      throw new Error(`${where}: traits must hold exactly the ${IDEAL_DIMENSIONS.length} matched criteria`);
    }
    if (classifyLength(j.text) !== j.traits.LENGTH) {
      throw new Error(`${where}: LENGTH ${j.traits.LENGTH} but the text reads ${classifyLength(j.text)}`);
    }
  }
  return c as TraitCorpus;
}

/** How the trait classifier grades a corpus joke: its traits plus Title Fit "Strong". */
export function traitClassification(j: Pick<TraitJoke, 'traits'>): Classification {
  return { ...j.traits, TITLE_FIT: TRAIT_TITLE_FIT };
}

/** The joke's true fit (0–12) against an ideal, as the backend scores it. */
export function traitFit(j: Pick<TraitJoke, 'traits'>, ideal: IdealProfile): number {
  return trueFit(traitClassification(j), ideal);
}

export interface TraitIndex {
  byText: ReadonlyMap<string, TraitJoke>;
  byTitle: ReadonlyMap<string, TraitJoke>;
}

/** Lookups by normalized text and by title. */
export function indexTraitCorpus(c: TraitCorpus): TraitIndex {
  return {
    byText: new Map(c.jokes.map(j => [normalizeJokeText(j.text), j])),
    byTitle: new Map(c.jokes.map(j => [j.title, j])),
  };
}
```

Create `scripts/traits/buildTraitCorpus.ts`:

```ts
/* Builds the trait corpus (spec §3) deterministically from a seed. Run
   scripts/traits/generate-trait-corpus.mts to write the file; a test checks the
   committed file is exactly what this builds.

   Each joke gets a hidden "quality" q = u^QUALITY_EXPONENT (u uniform), and on
   each of the 11 matched criteria lands on PILOT_IDEAL's category with
   probability q, else on a uniformly drawn category (never the catch-all). So
   most jokes sit far from the pilot's ideal and a few sit close: about 4 % clear
   the customers' bar of 8 (buildTraitCorpus.test.ts pins 2–6 %). Fit means
   something only against PILOT_IDEAL (config/dimensions DEFAULT_IDEAL_PROFILE,
   the ideal the pilot starts both rounds with; the backend's llm.PilotIdeal).

   The text is whole sentences of plain synthetic prose from a small word bank
   for the joke's topic, with a word count inside its Length category
   (scoring/length.go: Short ≤ 15 words, Medium 16–40, Long ≥ 41). */
import { DEFAULT_IDEAL_PROFILE, IDEAL_DIMENSIONS, isCatchAll, type IdealDimension } from '../../config/dimensions';
import { seededRng } from '../../services/shared/jokes';
import { TRAIT_CORPUS_VERSION, type TraitCorpus, type TraitJoke, type Traits } from '../../services/shared/traitCorpus';

export const TRAIT_CORPUS_SEED = 'trait-corpus-v1';
export const TRAIT_CORPUS_SIZE = 1000;
export const QUALITY_EXPONENT = 20;
/** The ideal the corpus is aligned to: the pilot's ideal. */
export const PILOT_IDEAL: Readonly<Record<IdealDimension, string>> = DEFAULT_IDEAL_PROFILE;

/** Word counts per Length category, inside scoring/length.go's buckets. */
export const WORD_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  Short: [7, 15],
  Medium: [16, 40],
  Long: [41, 60],
};

interface Bank { stem: string; subjects: string[]; objects: string[] }

const BANKS: Readonly<Record<string, Bank>> = {
  Work: { stem: 'Office Memo', subjects: ['My boss', 'The intern', 'Our standup', 'The office printer', 'Payroll', 'The new manager'], objects: ['the meeting about meetings', 'a spreadsheet nobody reads', 'the quarterly goals', 'the shared calendar', 'my lunch break', 'the reply-all thread'] },
  Relationships: { stem: 'Date Night', subjects: ['My partner', 'My date', 'Our couples therapist', 'My ex', 'The wedding planner', 'My best friend'], objects: ['the dinner reservation', 'our anniversary', 'the shared playlist', 'the last slice of pizza', 'my texting style', 'the thermostat'] },
  Family: { stem: 'Family Dinner', subjects: ['My grandmother', 'My little brother', 'Dad', 'My aunt', 'The family group chat', 'My cousin'], objects: ['the holiday seating chart', 'the television remote', 'the family recipe', 'the road trip snacks', 'the baby photos', 'the borrowed lawnmower'] },
  Food: { stem: 'Kitchen Note', subjects: ['The chef', 'My toaster', 'The waiter', 'My smoothie', 'The food truck', 'Our pizza place'], objects: ['the secret sauce', 'a gluten-free menu', 'the last avocado', 'the dessert cart', 'the soup of the day', 'my sandwich order'] },
  Technology: { stem: 'Tech Support', subjects: ['My phone', 'The smart fridge', 'The update', 'My laptop', 'The password manager', 'The chatbot'], objects: ['the Wi-Fi password', 'my search history', 'the cloud backup', 'the terms of service', 'the loading bar', 'the printer driver'] },
  Animals: { stem: 'Pet Report', subjects: ['My cat', 'The neighbor dog', 'A pigeon', 'Our goldfish', 'The parrot', 'A raccoon'], objects: ['the sunny spot', 'the treat jar', 'my good shoes', 'the bird feeder', 'the vet appointment', 'the garden hose'] },
  School: { stem: 'Class Notes', subjects: ['My teacher', 'The principal', 'My lab partner', 'The substitute', 'The school bus', 'The cafeteria'], objects: ['the pop quiz', 'my homework', 'the group project', 'the field trip', 'the seating plan', 'the science fair'] },
  Money: { stem: 'Budget Line', subjects: ['My bank', 'The tax form', 'My budget app', 'The landlord', 'My wallet', 'The coupon'], objects: ['the late fee', 'my savings goal', 'the receipt', 'the monthly subscription', 'the rent increase', 'my credit score'] },
  Travel: { stem: 'Travel Log', subjects: ['The airline', 'My suitcase', 'The tour guide', 'The hotel', 'The GPS', 'The train'], objects: ['the boarding pass', 'the window seat', 'my packing list', 'the hotel breakfast', 'the scenic route', 'the travel pillow'] },
  Health: { stem: 'Health Check', subjects: ['My doctor', 'The gym', 'My step counter', 'The dentist', 'My yoga teacher', 'The pharmacy'], objects: ['the annual checkup', 'my water intake', 'the new diet', 'the waiting room', 'the flu shot', 'my posture'] },
  Sports: { stem: 'Game Day', subjects: ['The coach', 'The referee', 'Our goalie', 'The mascot', 'My fantasy team', 'The marathon'], objects: ['the final whistle', 'the team photo', 'the halftime snacks', 'the warm-up lap', 'the trophy case', 'the playbook'] },
  Politics: { stem: 'Town Hall', subjects: ['The mayor', 'The city council', 'The campaign', 'The committee', 'The debate moderator', 'The petition'], objects: ['the budget vote', 'the new parking rules', 'the ribbon cutting', 'the town meeting', 'the yard signs', 'the press release'] },
  Everyday: { stem: 'Daily Life', subjects: ['My alarm clock', 'The laundry', 'My neighbor', 'The mail carrier', 'The grocery list', 'My umbrella'], objects: ['the morning commute', 'the junk drawer', 'the parking spot', 'the self-checkout', 'the lost sock', 'the weekend plans'] },
  Language: { stem: 'Word Play', subjects: ['The dictionary', 'My spellchecker', 'The grammar teacher', 'A comma', 'The thesaurus', 'An apostrophe'], objects: ['the silent letter', 'the run-on sentence', 'the plural of moose', 'the semicolon', 'the long word', 'the typo'] },
  Other: { stem: 'Odd Fact', subjects: ['A ghost', 'The universe', 'A time traveler', 'The moon', 'A wizard', 'The weather'], objects: ['the full moon', 'the lucky penny', 'the mystery box', 'the old map', 'the crystal ball', 'the plot twist'] },
};

const VERBS = ['asked about', 'forgot', 'replaced', 'scheduled', 'explained', 'lost', 'renamed', 'approved', 'questioned', 'praised'];
const TAILS = [
  'and nobody noticed', 'twice before lunch', 'with a straight face', 'in the group chat', 'on a Friday afternoon',
  'for the third time', 'without asking anyone', 'and called it progress', 'right before the deadline', 'with great confidence',
];

const pick = <T,>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number, rand: () => number): number => lo + Math.floor(rand() * (hi - lo + 1));

/**
 * Whole sentences from the topic's bank until the text reaches a word count
 * drawn from [lo, hi]; a text that overshoots hi is drawn again.
 */
function prose(topic: string, [lo, hi]: readonly [number, number], rand: () => number): string {
  const bank = BANKS[topic];
  for (;;) {
    const target = between(lo, hi, rand);
    const words: string[] = [];
    while (words.length < target) {
      words.push(...`${pick(bank.subjects, rand)} ${pick(VERBS, rand)} ${pick(bank.objects, rand)} ${pick(TAILS, rand)}.`.split(' '));
    }
    if (words.length <= hi) return words.join(' ');
  }
}

export function buildTraitCorpus(size = TRAIT_CORPUS_SIZE, seed = TRAIT_CORPUS_SEED): TraitCorpus {
  const rand = seededRng(seed);
  const texts = new Set<string>();
  const perTopic = new Map<string, number>();
  const jokes: TraitJoke[] = [];
  for (let i = 1; i <= size; i++) {
    const q = rand() ** QUALITY_EXPONENT;
    const traits = {} as Traits;
    for (const d of IDEAL_DIMENSIONS) {
      traits[d.id as IdealDimension] = rand() < q
        ? PILOT_IDEAL[d.id as IdealDimension]
        : pick(d.categories.filter(c => !isCatchAll(c)), rand);
    }
    let text = prose(traits.TOPIC, WORD_RANGES[traits.LENGTH], rand);
    // A repeated text gets a fresh draw.
    while (texts.has(text)) text = prose(traits.TOPIC, WORD_RANGES[traits.LENGTH], rand);
    texts.add(text);
    const n = (perTopic.get(traits.TOPIC) ?? 0) + 1;
    perTopic.set(traits.TOPIC, n);
    jokes.push({ id: `T${String(i).padStart(4, '0')}`, title: `${BANKS[traits.TOPIC].stem} No. ${n}`, text, traits });
  }
  return { version: TRAIT_CORPUS_VERSION, seed, jokes };
}

/** The file's exact text: one joke per line, so a diff names the jokes that changed. */
export function serializeTraitCorpus(c: TraitCorpus): string {
  const head = JSON.stringify({ version: c.version, seed: c.seed });
  const lines = c.jokes.map(j => JSON.stringify({ id: j.id, title: j.title, text: j.text, traits: j.traits }));
  return `${head.slice(0, -1)},"jokes":[\n${lines.join(',\n')}\n]}\n`;
}
```

Create `scripts/traits/loadTraitCorpus.ts`:

```ts
/* Node only: reads the committed trait corpus (spec §3). The pilot and the tests
   hand the parsed corpus to the bot engine (EngineDeps.traitCorpus); the browser
   worker never loads it. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTraitCorpus, type TraitCorpus } from '../../services/shared/traitCorpus';

export const TRAIT_CORPUS_PATH = fileURLToPath(new URL('./trait-corpus.json', import.meta.url));

export function loadTraitCorpus(path = TRAIT_CORPUS_PATH): TraitCorpus {
  return parseTraitCorpus(JSON.parse(readFileSync(path, 'utf8')));
}
```

Create `scripts/traits/generate-trait-corpus.mts`:

```ts
/* Writes scripts/traits/trait-corpus.json from buildTraitCorpus (deterministic).
   After regenerating: copy the file to the backend
   (jokefactory_be/src/infra/llm/traitdata/trait-corpus.json) and update
   TRAIT_CORPUS_SHA256 in both repos' parity tests.

   Usage: npx tsx scripts/traits/generate-trait-corpus.mts */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildTraitCorpus, serializeTraitCorpus } from './buildTraitCorpus';
import { TRAIT_CORPUS_PATH } from './loadTraitCorpus';

const text = serializeTraitCorpus(buildTraitCorpus());
writeFileSync(TRAIT_CORPUS_PATH, text);
console.log(`wrote ${TRAIT_CORPUS_PATH} sha256 ${createHash('sha256').update(text).digest('hex')}`);
```

- [ ] **Step 4: Generate the corpus file**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsx scripts/traits/generate-trait-corpus.mts && test "$(shasum -a 256 scripts/traits/trait-corpus.json | cut -d' ' -f1)" = 7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33`
Expected: PASS — prints `wrote …/scripts/traits/trait-corpus.json sha256 7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33` (1,002 lines, about 510 kB).

- [ ] **Step 5: Run the tests and the gates**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run config/fitFixtures.test.ts services/shared/traitCorpus.test.ts scripts/traits/`
Expected: PASS — 4 files; the two "backend's … matches byte for byte" tests are skipped until Task 3 copies the files.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: PASS — tsc silent; every test file passes.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add services/shared/traitCorpus.ts services/shared/traitCorpus.test.ts scripts/traits/buildTraitCorpus.ts scripts/traits/buildTraitCorpus.test.ts scripts/traits/loadTraitCorpus.ts scripts/traits/generate-trait-corpus.mts scripts/traits/trait-corpus.json scripts/traits/traitCorpusParity.test.ts config/fit-fixtures.json config/fitFixtures.test.ts && git commit -q -F - <<'EOF'
feat(traits): trait corpus of 1,000 synthetic jokes and shared fit fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 3: Backend — the trait classifier (`APP_LLM_MODE=traits`)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Create: `src/infra/llm/trait_classifier.go`, `src/infra/llm/traitdata/trait-corpus.json` and `src/core/domain/scoring/testdata/fit-fixtures.json` (copied in Step 1)
- Modify: `main.go` (`buildClassifier`, the startup warning), `src/infra/config/config.go` (comments), `docker-compose.yml` (comment), `README.md`
- Test: create `src/infra/llm/trait_classifier_test.go`, `src/infra/llm/trait_corpus_parity_test.go`, `src/core/domain/scoring/fit_fixtures_test.go`; modify `main_test.go`

**Interfaces:**
- Consumes: Task 2's files (`~/Documents/GitHub/AI-Joke-Factory/scripts/traits/trait-corpus.json`, `config/fit-fixtures.json`); `llm.HashClassifier`, `llm.PilotIdeal`, `scoring.IdealDimensions/LLMDimensions/IsValidCategory/IsCatchAll/ClassifyLength/TrueFit/DimFit`, `config.HashConfirmValue`.
- Produces:
  ```go
  // package llm
  const TraitTitleFit = "Strong"; const TraitCorpusVersion = 1
  type TraitClassifier struct{ /* corpus by normalized text; HashClassifier fallback */ }
  func NewTraitClassifier() (*TraitClassifier, error) // the embedded traitdata/trait-corpus.json
  func (c *TraitClassifier) Len() int
  func (c *TraitClassifier) Classify(ctx context.Context, jokes []ports.JokeInput) ([]ports.JokeClassification, error)
  // package main
  // buildClassifier: Mode "traits" + HashConfirm → (*llm.TraitClassifier, "traits"); without the confirmation an error naming APP_LLM_HASH_CONFIRM.
  ```

- [ ] **Step 1: Copy the shared files from the frontend**

Run: `cd ~/Documents/GitHub/jokefactory_be && mkdir -p src/infra/llm/traitdata src/core/domain/scoring/testdata && cp ~/Documents/GitHub/AI-Joke-Factory/scripts/traits/trait-corpus.json src/infra/llm/traitdata/trait-corpus.json && cp ~/Documents/GitHub/AI-Joke-Factory/config/fit-fixtures.json src/core/domain/scoring/testdata/fit-fixtures.json && test "$(shasum -a 256 src/infra/llm/traitdata/trait-corpus.json | cut -d' ' -f1)" = 7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33`
Expected: PASS — silent.

- [ ] **Step 2: Write the failing tests**

Create `src/core/domain/scoring/fit_fixtures_test.go`:

```go
package scoring

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"testing"

	"jokefactory/src/core/domain"
)

// fitFixturesSHA256 pins testdata/fit-fixtures.json, which the frontend keeps
// byte-identical (config/fit-fixtures.json, checked by its
// scripts/traits/traitCorpusParity.test.ts) and runs against its TypeScript
// port of DimFit and TrueFit (config/fitFixtures.test.ts).
const fitFixturesSHA256 = "8ebe339deb91d1b661d6f4b1c25f2aab8d67da5ff4e73f303aee3bb55c431dd9"

type fitFixtures struct {
	Ideals map[string]map[domain.Dimension]string `json:"ideals"`
	Cases  []struct {
		Name           string                       `json:"name"`
		Ideal          string                       `json:"ideal"`
		Classification map[domain.Dimension]string  `json:"classification"`
		DimFit         map[domain.Dimension]float64 `json:"dim_fit"`
		TrueFit        float64                      `json:"true_fit"`
	} `json:"cases"`
}

func TestSharedFitFixtures(t *testing.T) {
	raw, err := os.ReadFile("testdata/fit-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	if sum := sha256.Sum256(raw); hex.EncodeToString(sum[:]) != fitFixturesSHA256 {
		t.Fatalf("testdata/fit-fixtures.json sha256 %x; want %s (copy it from the frontend's config/fit-fixtures.json)", sum, fitFixturesSHA256)
	}
	var fx fitFixtures
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx.Cases) < 6 {
		t.Fatalf("%d cases; want at least 6", len(fx.Cases))
	}
	for _, c := range fx.Cases {
		t.Run(c.Name, func(t *testing.T) {
			ideal, ok := fx.Ideals[c.Ideal]
			if !ok {
				t.Fatalf("unknown ideal %q", c.Ideal)
			}
			if len(c.DimFit) != len(AllDimensions) {
				t.Fatalf("dim_fit lists %d dimensions; want %d", len(c.DimFit), len(AllDimensions))
			}
			for _, dim := range AllDimensions {
				if got := DimFit(dim, ideal[dim], c.Classification[dim]); got != c.DimFit[dim] {
					t.Errorf("DimFit(%s) = %v; want %v", dim, got, c.DimFit[dim])
				}
			}
			if got := TrueFit(Classification(c.Classification), IdealProfile(ideal)); math.Abs(got-c.TrueFit) > 1e-9 {
				t.Errorf("TrueFit = %v; want %v", got, c.TrueFit)
			}
		})
	}
}

// When the frontend repo sits next to this one, its copy must be the same bytes.
func TestSharedFitFixturesMatchTheFrontendCopy(t *testing.T) {
	theirs, err := os.ReadFile("../../../../../AI-Joke-Factory/config/fit-fixtures.json")
	if os.IsNotExist(err) {
		t.Skip("the frontend repo is not next to this one")
	}
	if err != nil {
		t.Fatal(err)
	}
	mine, err := os.ReadFile("testdata/fit-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(mine, theirs) {
		t.Fatal("testdata/fit-fixtures.json differs from the frontend's config/fit-fixtures.json")
	}
}
```

Create `src/infra/llm/trait_classifier_test.go`:

```go
package llm

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/domain/scoring"
	"jokefactory/src/core/ports"
)

func corpusJokes(t *testing.T) traitCorpusFile {
	t.Helper()
	var f traitCorpusFile
	if err := json.Unmarshal(traitCorpusJSON, &f); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestTraitClassifierLoadsTheCorpus(t *testing.T) {
	c, err := NewTraitClassifier()
	if err != nil {
		t.Fatal(err)
	}
	if c.Len() != 1000 {
		t.Fatalf("corpus has %d jokes; want 1000", c.Len())
	}
}

// A corpus joke gets exactly its corpus categories for the LLM dimensions,
// Title Fit "Strong", whatever its spacing; Length stays the code's job.
func TestTraitClassifierGivesCorpusJokesTheirTraits(t *testing.T) {
	c, err := NewTraitClassifier()
	if err != nil {
		t.Fatal(err)
	}
	f := corpusJokes(t)
	first, last := f.Jokes[0], f.Jokes[len(f.Jokes)-1]
	out, err := c.Classify(context.Background(), []ports.JokeInput{
		{JokeID: 7, Text: first.Text, Title: "anything"},
		{JokeID: 8, Text: "  " + strings.ReplaceAll(last.Text, " ", "\n  ") + "\t"},
	})
	if err != nil || len(out) != 2 {
		t.Fatal(err, len(out))
	}
	for i, j := range []struct {
		id     int64
		traits map[domain.Dimension]string
	}{{7, first.Traits}, {8, last.Traits}} {
		got := out[i]
		if got.JokeID != j.id {
			t.Fatalf("result %d has joke id %d; want %d", i, got.JokeID, j.id)
		}
		if len(got.Categories) != len(scoring.LLMDimensions()) {
			t.Fatalf("joke %d: %d categories; want %d", j.id, len(got.Categories), len(scoring.LLMDimensions()))
		}
		if _, ok := got.Categories[domain.DimLength]; ok {
			t.Fatalf("joke %d: the classifier returned Length", j.id)
		}
		for _, dim := range scoring.LLMDimensions() {
			want := j.traits[dim]
			if dim == domain.DimTitleFit {
				want = "Strong"
			}
			if got.Categories[dim] != want {
				t.Errorf("joke %d %s = %q; want %q", j.id, dim, got.Categories[dim], want)
			}
		}
	}
}

// Text outside the corpus is graded exactly as the hash classifier grades it.
func TestTraitClassifierFallsBackToHashForOtherText(t *testing.T) {
	c, err := NewTraitClassifier()
	if err != nil {
		t.Fatal(err)
	}
	in := []ports.JokeInput{{JokeID: 3, Text: "My password is the last eight digits of pi."}}
	got, err := c.Classify(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := HashClassifier{}.Classify(context.Background(), in)
	for _, dim := range scoring.LLMDimensions() {
		if got[0].Categories[dim] != want[0].Categories[dim] || got[0].JokeID != 3 {
			t.Fatalf("%s = %q; want the hash classifier's %q", dim, got[0].Categories[dim], want[0].Categories[dim])
		}
	}
}

func TestTraitClassifierRefusesABadCorpus(t *testing.T) {
	good := `{"id":"T1","title":"t","text":"one two three four five six seven","traits":{"LENGTH":"Short","TOPIC":"Work","HUMOR_STYLE":"Pun","COMPLEXITY":"Simple","EDGINESS":"Clean","STRUCTURE":"One-liner","WORDPLAY":"None","FRESHNESS":"Timeless","SETUP_PAYOFF":"Quick","CLARITY":"Crystal clear","ENERGY":"Low"}}`
	if _, err := newTraitClassifier([]byte(`{"version":1,"seed":"s","jokes":[` + good + `]}`)); err != nil {
		t.Fatalf("a good one-joke corpus: %v", err)
	}
	for name, raw := range map[string]string{
		"wrong version": `{"version":2,"seed":"s","jokes":[` + good + `]}`,
		"no jokes":      `{"version":1,"seed":"s","jokes":[]}`,
		"repeated text": `{"version":1,"seed":"s","jokes":[` + good + `,` + strings.Replace(good, `"T1"`, `"T2"`, 1) + `]}`,
		"catch-all":     `{"version":1,"seed":"s","jokes":[` + strings.Replace(good, `"Low"`, `"None of the above"`, 1) + `]}`,
		"unknown topic": `{"version":1,"seed":"s","jokes":[` + strings.Replace(good, `"Work"`, `"Weather"`, 1) + `]}`,
		"wrong length":  `{"version":1,"seed":"s","jokes":[` + strings.Replace(good, `"Short"`, `"Long"`, 1) + `]}`,
		"missing trait": `{"version":1,"seed":"s","jokes":[` + strings.Replace(good, `,"ENERGY":"Low"`, ``, 1) + `]}`,
	} {
		if _, err := newTraitClassifier([]byte(raw)); err == nil {
			t.Errorf("%s: accepted; want an error", name)
		}
	}
}

// The corpus scores as the pilot expects against PilotIdeal: most jokes far
// from the customers' bar of 8, a few (2–6 %) over it.
func TestTraitCorpusFitAgainstThePilotIdeal(t *testing.T) {
	c, err := NewTraitClassifier()
	if err != nil {
		t.Fatal(err)
	}
	f := corpusJokes(t)
	in := make([]ports.JokeInput, len(f.Jokes))
	for i, j := range f.Jokes {
		in[i] = ports.JokeInput{JokeID: int64(i + 1), Text: j.Text}
	}
	out, err := c.Classify(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	over := 0
	for i, r := range out {
		cls := scoring.Classification{domain.DimLength: scoring.ClassifyLength(f.Jokes[i].Text)}
		for dim, cat := range r.Categories {
			cls[dim] = cat
		}
		if scoring.TrueFit(cls, scoring.IdealProfile(PilotIdeal)) >= 8 {
			over++
		}
	}
	if share := float64(over) / float64(len(out)); share < 0.02 || share > 0.06 {
		t.Fatalf("%d of %d jokes clear 8; want 2–6 %%", over, len(out))
	}
}
```

Create `src/infra/llm/trait_corpus_parity_test.go`:

```go
package llm

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"testing"
)

// traitCorpusSHA256 pins traitdata/trait-corpus.json. The frontend generates
// the file (scripts/traits/generate-trait-corpus.mts) and pins the same hash in
// scripts/traits/traitCorpusParity.test.ts; after regenerating, copy the file
// here and update both constants.
const traitCorpusSHA256 = "7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33"

func TestTraitCorpusIsTheVersionedCopy(t *testing.T) {
	sum := sha256.Sum256(traitCorpusJSON)
	if got := hex.EncodeToString(sum[:]); got != traitCorpusSHA256 {
		t.Fatalf("traitdata/trait-corpus.json sha256 %s; want %s (copy it from the frontend's scripts/traits/trait-corpus.json)", got, traitCorpusSHA256)
	}
}

// When the frontend repo sits next to this one, its copy must be the same bytes.
func TestTraitCorpusMatchesTheFrontendCopy(t *testing.T) {
	theirs, err := os.ReadFile("../../../../AI-Joke-Factory/scripts/traits/trait-corpus.json")
	if os.IsNotExist(err) {
		t.Skip("the frontend repo is not next to this one")
	}
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(traitCorpusJSON, theirs) {
		t.Fatal("traitdata/trait-corpus.json differs from the frontend's scripts/traits/trait-corpus.json")
	}
}
```

In `main_test.go`, replace:

```go
func TestBuildClassifierRejectsUnknownMode(t *testing.T) {
	for _, mode := range []string{"HASH", "azure", "stub", " hash"} {
```

with:

```go
// Traits mode takes the same confirmation as hash mode, and reads the corpus.
func TestBuildClassifierTraitsNeedsConfirmation(t *testing.T) {
	for _, confirm := range []string{"", "yes", "LOCAL-PILOT-ONLY"} {
		_, _, err := buildClassifier(config.LLMConfig{Mode: "traits", HashConfirm: confirm})
		if err == nil || !strings.Contains(err.Error(), "APP_LLM_HASH_CONFIRM") {
			t.Fatalf("confirm %q: want an error naming APP_LLM_HASH_CONFIRM, got %v", confirm, err)
		}
	}

	c, model, err := buildClassifier(config.LLMConfig{
		Mode: "traits", HashConfirm: "local-pilot-only", BaseURL: "https://x", APIKey: "k",
	})
	if err != nil {
		t.Fatal(err)
	}
	tc, ok := c.(*llm.TraitClassifier)
	if !ok || model != "traits" || tc.Len() != 1000 {
		t.Fatalf("confirmed traits: got %T %q, want the trait classifier with the 1000-joke corpus", c, model)
	}
}

func TestBuildClassifierRejectsUnknownMode(t *testing.T) {
	for _, mode := range []string{"HASH", "azure", "stub", " hash", "TRAITS", "trait"} {
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/domain/scoring/ ./src/infra/llm/ .`
Expected: FAIL — `src/infra/llm` and the root package do not compile (`undefined: traitCorpusJSON`, `undefined: NewTraitClassifier`, `undefined: llm.TraitClassifier`); `src/core/domain/scoring` passes (the Go rules already agree with the fixtures).

- [ ] **Step 4: Write the trait classifier and wire it**

Create `src/infra/llm/trait_classifier.go`:

```go
package llm

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/domain/scoring"
	"jokefactory/src/core/ports"
)

// traitCorpusJSON is the trait corpus, a byte-identical copy of the frontend's
// scripts/traits/trait-corpus.json (generated there; trait_corpus_parity_test.go
// pins it). Embedded, so the API image needs no data file at run time.
//
//go:embed traitdata/trait-corpus.json
var traitCorpusJSON []byte

// TraitTitleFit is the Title Fit every corpus joke gets: graded, never an ideal.
const TraitTitleFit = "Strong"

// TraitCorpusVersion is the corpus file format this classifier reads.
const TraitCorpusVersion = 1

type traitCorpusFile struct {
	Version int    `json:"version"`
	Seed    string `json:"seed"`
	Jokes   []struct {
		ID     string                      `json:"id"`
		Title  string                      `json:"title"`
		Text   string                      `json:"text"`
		Traits map[domain.Dimension]string `json:"traits"`
	} `json:"jokes"`
}

// TraitClassifier is for LOCAL PILOTS ONLY (APP_LLM_MODE=traits plus
// APP_LLM_HASH_CONFIRM=local-pilot-only), like HashClassifier. A joke whose
// text (whitespace collapsed) is in the trait corpus gets that joke's
// categories, with Title Fit "Strong"; any other text falls back to
// HashClassifier. So the bots know their own jokes' traits and feedback on one
// joke says something about the next
// (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §3).
type TraitClassifier struct {
	byText   map[string]map[domain.Dimension]string
	fallback HashClassifier
}

// NewTraitClassifier parses the embedded corpus. It fails on a corpus that is
// not version 1, or whose jokes repeat a text, miss one of the 11 matched
// criteria, use a category scoring does not know (or the catch-all), or have a
// LENGTH their text does not have.
func NewTraitClassifier() (*TraitClassifier, error) {
	return newTraitClassifier(traitCorpusJSON)
}

func newTraitClassifier(raw []byte) (*TraitClassifier, error) {
	var f traitCorpusFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, fmt.Errorf("trait corpus: %w", err)
	}
	if f.Version != TraitCorpusVersion || len(f.Jokes) == 0 {
		return nil, fmt.Errorf("trait corpus: version %d with %d jokes; want version %d with jokes", f.Version, len(f.Jokes), TraitCorpusVersion)
	}
	byText := make(map[string]map[domain.Dimension]string, len(f.Jokes))
	for _, j := range f.Jokes {
		key := normalizeJokeText(j.Text)
		if _, dup := byText[key]; dup || key == "" {
			return nil, fmt.Errorf("trait corpus joke %s: empty or repeated text", j.ID)
		}
		if len(j.Traits) != len(scoring.IdealDimensions()) {
			return nil, fmt.Errorf("trait corpus joke %s: %d traits; want the %d matched criteria", j.ID, len(j.Traits), len(scoring.IdealDimensions()))
		}
		for _, dim := range scoring.IdealDimensions() {
			cat := j.Traits[dim]
			if !scoring.IsValidCategory(dim, cat) || scoring.IsCatchAll(cat) {
				return nil, fmt.Errorf("trait corpus joke %s: %s %q is not one of its categories", j.ID, dim, cat)
			}
		}
		if got := scoring.ClassifyLength(j.Text); got != j.Traits[domain.DimLength] {
			return nil, fmt.Errorf("trait corpus joke %s: LENGTH %s but the text reads %s", j.ID, j.Traits[domain.DimLength], got)
		}
		byText[key] = j.Traits
	}
	return &TraitClassifier{byText: byText}, nil
}

// Len is the number of jokes in the corpus.
func (c *TraitClassifier) Len() int { return len(c.byText) }

// Classify implements ports.Classifier.
func (c *TraitClassifier) Classify(ctx context.Context, jokes []ports.JokeInput) ([]ports.JokeClassification, error) {
	out := make([]ports.JokeClassification, 0, len(jokes))
	for _, j := range jokes {
		traits, ok := c.byText[normalizeJokeText(j.Text)]
		if !ok {
			hashed, err := c.fallback.Classify(ctx, []ports.JokeInput{j})
			if err != nil {
				return nil, err
			}
			out = append(out, hashed...)
			continue
		}
		cats := make(map[domain.Dimension]string, len(scoring.LLMDimensions()))
		for _, dim := range scoring.LLMDimensions() {
			if dim == domain.DimTitleFit {
				cats[dim] = TraitTitleFit
				continue
			}
			cats[dim] = traits[dim]
		}
		out = append(out, ports.JokeClassification{JokeID: j.JokeID, Categories: cats})
	}
	return out, nil
}

// normalizeJokeText collapses runs of whitespace and trims, as the frontend's
// normalizeJokeText does, so a joke matches after a trip through a textarea.
func normalizeJokeText(text string) string {
	return strings.Join(strings.Fields(text), " ")
}
```

In `main.go`, replace:

```go
	if modelName == "hash" {
		log.Warn("HASH CLASSIFIER ACTIVE: jokes are NOT graded by the LLM; scores are a deterministic hash. Local pilots only, never production.",
```

with:

```go
	if modelName == "hash" || modelName == "traits" {
		log.Warn("LOCAL PILOT CLASSIFIER ACTIVE: jokes are NOT graded by the LLM; scores come from a hash or the trait corpus. Local pilots only, never production.",
```

In `main.go`, replace:

```go
// buildClassifier picks the classifier from the LLM settings. Hash mode needs
// both APP_LLM_MODE=hash and APP_LLM_HASH_CONFIRM=local-pilot-only, and an
// unknown mode is an error, so a typo or a single stray variable can never
// silently swap LLM grading for the hash classifier.
func buildClassifier(cfg config.LLMConfig) (c ports.Classifier, model string, err error) {
	switch cfg.Mode {
	case "":
	case "hash":
		if cfg.HashConfirm != config.HashConfirmValue {
			return nil, "", fmt.Errorf(
				"APP_LLM_MODE=hash grades jokes with a hash, not the LLM: set APP_LLM_HASH_CONFIRM=%s to confirm this is a local pilot, or unset APP_LLM_MODE",
				config.HashConfirmValue)
		}
		return llm.HashClassifier{}, "hash", nil
	default:
		return nil, "", fmt.Errorf("APP_LLM_MODE=%q is not supported: leave it unset, or use \"hash\" for local pilots", cfg.Mode)
```

with:

```go
// buildClassifier picks the classifier from the LLM settings. Hash and traits
// modes each need APP_LLM_MODE (hash or traits) and
// APP_LLM_HASH_CONFIRM=local-pilot-only, and an unknown mode is an error, so a
// typo or a single stray variable can never silently swap LLM grading for a
// local-pilot classifier.
func buildClassifier(cfg config.LLMConfig) (c ports.Classifier, model string, err error) {
	switch cfg.Mode {
	case "":
	case "hash", "traits":
		if cfg.HashConfirm != config.HashConfirmValue {
			return nil, "", fmt.Errorf(
				"APP_LLM_MODE=%s does not grade jokes with the LLM: set APP_LLM_HASH_CONFIRM=%s to confirm this is a local pilot, or unset APP_LLM_MODE",
				cfg.Mode, config.HashConfirmValue)
		}
		if cfg.Mode == "hash" {
			return llm.HashClassifier{}, "hash", nil
		}
		traits, err := llm.NewTraitClassifier()
		if err != nil {
			return nil, "", err
		}
		return traits, "traits", nil
	default:
		return nil, "", fmt.Errorf("APP_LLM_MODE=%q is not supported: leave it unset, or use \"hash\" or \"traits\" for local pilots", cfg.Mode)
```

In `src/infra/config/config.go`, replace:

```go
	// stub; "hash" = HashClassifier, for local pilots only. Any other value
	// fails startup.
	Mode string `envconfig:"LLM_MODE" default:""`

	// HashConfirm must equal HashConfirmValue for Mode "hash" to start, so the
	// hash classifier (which does not grade jokes with the LLM) cannot be
```

with:

```go
	// stub; "hash" = HashClassifier and "traits" = TraitClassifier (the trait
	// corpus, hash for other text), both for local pilots only. Any other value
	// fails startup.
	Mode string `envconfig:"LLM_MODE" default:""`

	// HashConfirm must equal HashConfirmValue for Mode "hash" or "traits" to
	// start, so a classifier that does not grade jokes with the LLM cannot be
```

In `src/infra/config/config.go`, replace:

```go
// HashConfirmValue is the only APP_LLM_HASH_CONFIRM value that enables hash mode.
```

with:

```go
// HashConfirmValue is the only APP_LLM_HASH_CONFIRM value that enables hash or traits mode.
```

In `docker-compose.yml`, replace:

```yaml
      # Set APP_LLM_MODE=hash for local pilots (deterministic hash classifier).
      # Hash mode also needs APP_LLM_HASH_CONFIRM=local-pilot-only, or the server
      # refuses to start: it does not grade jokes with the LLM.
```

with:

```yaml
      # Set APP_LLM_MODE=hash (deterministic hash classifier) or traits (the
      # trait corpus, hash for other text) for local pilots. Both also need
      # APP_LLM_HASH_CONFIRM=local-pilot-only, or the server refuses to start:
      # they do not grade jokes with the LLM.
```

In `README.md`, replace:

```markdown

If something else already holds host port 5432, remap the compose Postgres with an override file kept outside the repo (`ports: !override ["55432:5432"]`), pass it with `docker compose -f docker-compose.yml -f <override> ...`, and run migrations with `DB_DSN=postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable make migrate-up`.
```

with:

````markdown

### The trait classifier (feedback pilots)

`APP_LLM_MODE=traits` (with the same `APP_LLM_HASH_CONFIRM=local-pilot-only`) grades a joke whose text is in the trait corpus with that joke's categories and Title Fit "Strong", and any other text with the hash classifier. The corpus (`src/infra/llm/traitdata/trait-corpus.json`, 1,000 synthetic jokes, embedded in the binary) is generated by the frontend (`scripts/traits/generate-trait-corpus.mts`) and kept byte-identical in both repos; `TestTraitCorpusIsTheVersionedCopy` pins its SHA-256. The bots of the frontend's feedback pilot (`scripts/pilot/feedback-pilot.mts`) write only corpus jokes, so they know their own jokes' traits. Like hash mode, never for production.

```bash
APP_LLM_MODE=traits APP_LLM_HASH_CONFIRM=local-pilot-only docker compose up -d --build api
```

If something else already holds host port 5432, remap the compose Postgres with an override file kept outside the repo (`ports: !override ["55432:5432"]`), pass it with `docker compose -f docker-compose.yml -f <override> ...`, and run migrations with `DB_DSN=postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable make migrate-up`.
````

- [ ] **Step 5: Run the tests and the gates**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/domain/scoring/ ./src/infra/llm/ . -v -run 'Trait|Shared|BuildClassifier'`
Expected: PASS — includes `TestSharedFitFixtures` (6 subtests), `TestSharedFitFixturesMatchTheFrontendCopy`, `TestTraitClassifierLoadsTheCorpus`, `TestTraitClassifierGivesCorpusJokesTheirTraits`, `TestTraitClassifierFallsBackToHashForOtherText`, `TestTraitClassifierRefusesABadCorpus`, `TestTraitCorpusFitAgainstThePilotIdeal`, `TestTraitCorpusIsTheVersionedCopy`, `TestTraitCorpusMatchesTheFrontendCopy`, `TestBuildClassifierTraitsNeedsConfirmation` (no `SKIP`: the frontend repo sits next to this one).

Run: `cd ~/Documents/GitHub/jokefactory_be && test -z "$(gofmt -l .)" && go build ./... && go vet ./... && go vet -tags integration ./... && go test ./...`
Expected: PASS — every package `ok`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run scripts/traits/traitCorpusParity.test.ts`
Expected: PASS — 4 tests, none skipped: the backend copies now match byte for byte.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be && git add src/infra/llm/trait_classifier.go src/infra/llm/trait_classifier_test.go src/infra/llm/trait_corpus_parity_test.go src/infra/llm/traitdata/trait-corpus.json src/core/domain/scoring/fit_fixtures_test.go src/core/domain/scoring/testdata/fit-fixtures.json main.go main_test.go src/infra/config/config.go docker-compose.yml README.md && git commit -q -F - <<'EOF'
feat(llm): trait classifier for local feedback pilots

APP_LLM_MODE=traits (with APP_LLM_HASH_CONFIRM=local-pilot-only) grades
a joke from the embedded trait corpus, Title Fit "Strong", and any other
text with the hash classifier. Shared fit fixtures run in Go too.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 4: Frontend — only charged fees on the student screens, the Next step line and the tour

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `services/shownFees.ts`
- Modify: `components/FeesAndWaits.tsx` (`SalesChart`, `WaitChart`), `views/JokeMaker.tsx` (no shipping line, no fees panel), `views/QualityControl.tsx` (tally and discard dialog), `views/WaitingRoom.tsx` (the goal sentence), `views/marketingRelease.ts` (`releaseOutcome`), `services/nextStep.ts` (Marketing rule 2), `services/tour/tourSteps.ts` (`jm-batch-size`, `jm-scoreboard`, Marketing captions, new `feesCaption`), `services/leanMode.ts` (`shippingLine` removed), `context.tsx` (`DEFAULT_COST_OF_DISCARD` 0)
- Test: create `services/shownFees.test.ts`; modify `views/testing/renderWithGame.ts` (`TWO_COST_CONFIG`), `components/FeesAndWaits.test.tsx`, `components/StatTiles.test.tsx`, `components/tour/DemoStage.test.ts`, `components/tour/GuidedTour.test.ts`, `services/leanMode.test.ts`, `services/nextStep.test.ts`, `services/tour/demoScript.test.ts`, `services/tour/tourSteps.test.ts`, `views/loginWaiting.render.test.ts`, `views/marketingRelease.test.ts`, `views/nextStep.render.test.ts`, `views/studentScreens.render.test.ts`

**Interfaces:**
- Consumes: `leanFeesOf`, `fmtFee`, `fmtCents`, `fmtPerMinute` (`services/leanMode.ts`), `GameConfig` fee fields, `TourMoney` (`services/tour/demoScript.ts`).
- Produces (Task 5 uses all of these):
  ```ts
  // services/shownFees.ts
  export interface FeeRates { costOfPublishing; costOfDiscard; shippingFeeSmall; shippingFeeStandard; shippingFeeLarge; storageFeePerJokeMinute; hostingFeePerJokeMinute: number }
  export type FeeKind = 'listing' | 'hosting' | 'shipping' | 'storage' | 'discard';
  export const FEE_KINDS: readonly FeeKind[];                 // display order, listing first
  export type ShownFees = Readonly<Record<FeeKind, boolean>>; export const ALL_FEES_SHOWN: ShownFees;
  export function shownFees(r: Partial<FeeRates> | null | undefined): ShownFees;   // amount > 0
  export type TeamFees = Record<FeeKind, number>;
  export function teamFees(row: { lean?; published_jokes?; discarded_jokes? }, rates: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null | undefined): TeamFees;
  export function feesTotal(f: TeamFees): number;
  export function feeNames(shown: ShownFees): string;          // "listing and hosting"
  // views/testing/renderWithGame.ts
  export const TWO_COST_CONFIG: GameConfig;  // TEST_CONFIG with discard 0, shipping 0/0/0, storage 0
  // services/tour/tourSteps.ts
  export function feesCaption(fees: TourRound['fees']): string;
  ```
  Tour step id `jm-shipping` becomes `jm-batch-size` (target `jm-send`); the `data-tour="jm-shipping"` element is gone.

- [ ] **Step 1: Write the failing tests (and `TWO_COST_CONFIG`)**

In `views/testing/renderWithGame.ts`, replace:

```ts
/** A running Round 1 at the default Lean fees. */
```

with:

```ts
/** A running Round 1 at the five fees that preceded the two costs (an old round: every fee shown). */
```

In `views/testing/renderWithGame.ts`, replace:

```ts
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05, customersPerTeam: 18,
```

with:

```ts
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05, customersPerTeam: 18,
};

/** A running Round 1 at the two-cost defaults: listing $0.10 and hosting 5¢ a joke-minute, every other fee 0. */
export const TWO_COST_CONFIG: GameConfig = {
  ...TEST_CONFIG, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0, storageFeePerJokeMinute: 0,
```

Create `services/shownFees.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALL_FEES_SHOWN, feeNames, feesTotal, shownFees, teamFees } from './shownFees';
import { TEST_CONFIG, TWO_COST_CONFIG } from '../views/testing/renderWithGame';

describe('shownFees', () => {
  it('shows only listing and hosting at the two-cost defaults', () => {
    expect(shownFees(TWO_COST_CONFIG)).toEqual({ listing: true, hosting: true, shipping: false, storage: false, discard: false });
  });

  it('still shows shipping, storage and discard in a round that charges them', () => {
    expect(shownFees(TEST_CONFIG)).toEqual(ALL_FEES_SHOWN);
    expect(shownFees({ ...TWO_COST_CONFIG, shippingFeeLarge: 3 }).shipping).toBe(true);
    expect(shownFees({ ...TWO_COST_CONFIG, storageFeePerJokeMinute: 0.01 }).storage).toBe(true);
  });

  it('hides a fee that is 0, missing or not a number', () => {
    expect(shownFees({ costOfPublishing: 0, hostingFeePerJokeMinute: Number.NaN })).toEqual(
      { listing: false, hosting: false, shipping: false, storage: false, discard: false });
    expect(shownFees(null).listing).toBe(false);
  });
});

describe('teamFees', () => {
  it('adds listing and discard at the round prices to the Lean fees', () => {
    const f = teamFees({
      published_jokes: 8, discarded_jokes: 2,
      lean: { shipping_cost: 0, storage_cost: 0, hosting_cost: 1.25 },
    }, TWO_COST_CONFIG);
    expect(f).toEqual({ listing: 0.8, hosting: 1.25, shipping: 0, storage: 0, discard: 0 });
    expect(feesTotal(f)).toBeCloseTo(2.05);
  });

  it('reads 0, never NaN, for missing counts or prices', () => {
    const f = teamFees({ published_jokes: undefined, lean: undefined }, null);
    expect(feesTotal(f)).toBe(0);
  });
});

describe('feeNames', () => {
  it('names the shown fees in order', () => {
    expect(feeNames(shownFees(TWO_COST_CONFIG))).toBe('listing and hosting');
    expect(feeNames(ALL_FEES_SHOWN)).toBe('listing, hosting, shipping, storage and discard');
    expect(feeNames({ ...shownFees(null), hosting: true })).toBe('hosting');
    expect(feeNames(shownFees(null))).toBe('no fees');
  });
});
```

In `components/FeesAndWaits.test.tsx`, replace:

```tsx
import { TEST_CONFIG } from '../views/testing/renderWithGame';
```

with:

```tsx
import { TEST_CONFIG, TWO_COST_CONFIG } from '../views/testing/renderWithGame';
```

In `components/FeesAndWaits.test.tsx`, replace:

```tsx
    expect(t).toContain('On market, waiting for a buyer 0:52');
    expect(t).toContain('hosting is charged');
    expect(t).toContain('about 3:33');
    for (const tick of ['Sent', 'Released', 'First sale']) expect(t).toContain(tick);
```

with:

```tsx
    expect(t).toContain('Waiting for first buyer 0:52');
    expect(t).toContain('hosting is charged');
    expect(t).toContain('about 3:33');
    for (const tick of ['Sent', 'Released', 'First sale']) expect(t).toContain(tick);
  });

  it('at the two-cost defaults lists only listing and hosting, and no wait says storage is charged', () => {
    const out = renderToStaticMarkup(
      <FeesAndWaits summary={summary({ shipping_cost: 0, storage_cost: 0, hosting_cost: 1.65 })} config={TWO_COST_CONFIG} storageKey="k" initialOpen />,
    );
    const t = text(out);
    for (const l of ['Listing fees', '$0.80', 'Hosting', '$1.65', 'With Marketing 2:41', 'Waiting for first buyer 0:52', 'hosting is charged']) {
      expect(t).toContain(l);
    }
    for (const l of ['Shipping', 'Storage', 'storage is charged', 'discard', 'batches sent', '$0.00']) expect(t).not.toContain(l);
    expect(out).not.toContain('var(--chart-shipping)');
  });

  it('a round that still charges shipping and storage shows them (and discard joins listing)', () => {
    const t = text(render(summary()));
    for (const l of ['Shipping', 'Storage', 'storage is charged', 'Listing and discard fees']) expect(t).toContain(l);
```

In `components/StatTiles.test.tsx`, replace:

```tsx
  it('Joke Maker: the Scoreboard replaces the key tiles; Fees and wait times replaces More numbers in Lean', () => {
```

with:

```tsx
  it('Joke Maker: the Scoreboard replaces the key tiles; More numbers stays folded, with no fees (the Joke Maker pays none)', () => {
```

In `components/StatTiles.test.tsx`, replace:

```tsx
    for (const folded of ['Batches', 'Created to Publish', 'Content Waste', 'Where your sales went']) expect(out).not.toContain(folded);
    expect(out).toContain('Fees and wait times');
    expect(out).not.toContain('More numbers');
```

with:

```tsx
    for (const folded of ['Where your sales went']) expect(out).not.toContain(folded);
    expect(out).toContain('More numbers');
    expect(out).not.toContain('Fees and wait times');
```

In `components/StatTiles.test.tsx`, replace:

```tsx
  it('open (remembered), Lean: the charts, then the plain list of the other numbers; the fee and wait tiles are gone', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const j = jm();
    expect(j).toContain('Fees and wait times appear once the round starts.');
    expect(j).toContain('Content Waste');
    expect(j).toContain('Batches');
    expect(j).not.toContain('Created to Publish');
```

with:

```tsx
  it('open (remembered), Lean: the Joke Maker\'s own numbers; Marketing\'s charts, then the plain list of the other numbers', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const j = jm();
    for (const l of ['Fewer numbers', 'Batches', 'Created to Publish', 'Content Waste']) expect(j).toContain(l);
    expect(j).not.toContain('Fees and wait times');
```

In `components/tour/DemoStage.test.ts`, replace:

```ts
  it('shows the round\'s shipping line: Round 1 one size, Round 2 three', () => {
    expect(renderStep(opts('JOKE_MAKER', 1), 'jm-shipping')).toContain('Shipping: $2 per batch of 5');
    expect(renderStep(opts('JOKE_MAKER', 2), 'jm-shipping')).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
```

with:

```ts
  it('the batch-size step shows the send row and no shipping line, in either round', () => {
    for (const round of [1, 2] as const) {
      const out = renderStep(opts('JOKE_MAKER', round), 'jm-batch-size');
      expect(out).toContain('data-tour="jm-send"');
      expect(out).not.toContain('Shipping');
    }
```

In `components/tour/DemoStage.test.ts`, replace:

```ts
    expect(renderStep(opts('JOKE_MAKER'), 'jm-shipping')).toContain('Keep writing. Every batch is another chance to sell.');
    expect(renderStep(opts('QUALITY_CONTROL'), 'mk-fees')).toContain(
      'Batch waiting 52 s. Release what&#x27;s good enough. Storage costs 5¢ a joke each minute.',
```

with:

```ts
    expect(renderStep(opts('JOKE_MAKER'), 'jm-batch-size')).toContain('Keep writing. Every batch is another chance to sell.');
    expect(renderStep(opts('QUALITY_CONTROL'), 'mk-fees')).toContain(
      'Batch waiting 52 s. Release what&#x27;s good enough: customers arriving now can&#x27;t buy it. Storage costs 5¢ a joke each minute.',
```

In `components/tour/GuidedTour.test.ts`, replace:

```ts
    expect(r1.steps.find(s => s.id === 'jm-shipping')!.body).toBe(
      'Each batch of 5 costs $2 to ship, so keep them coming but make them count.',
    );
    const r2 = tourPlan('JOKE_MAKER', { ...CONFIG, round: 2, shippingFeeSmall: 0.5 });
    expect(r2.steps.find(s => s.id === 'jm-shipping')!.body).toContain('You choose the size now: $0.50 for 1–4 jokes');
```

with:

```ts
    expect(r1.steps.find(s => s.id === 'jm-batch-size')!.body).toBe('Every batch is 5 jokes. Keep them coming.');
    const r2 = tourPlan('JOKE_MAKER', { ...CONFIG, round: 2 });
    expect(r2.steps.find(s => s.id === 'jm-batch-size')!.body).toBe(
      'You choose the batch size now. Smaller batches reach customers and come back with feedback sooner.',
    );
    expect(tourPlan('QUALITY_CONTROL', CONFIG).steps.find(s => s.id === 'mk-fees')!.body)
      .toContain('Every joke you release costs $0.10 to list, and 5¢ a minute while it sits unsold.');
```

In `services/leanMode.test.ts`, replace:

```ts
  leanConfigFromRound, leanConfigToBody, leanFeesOf, learningCurvePoints, neverSold, shippingFeeFor, shippingLine,
```

with:

```ts
  leanConfigFromRound, leanConfigToBody, leanFeesOf, learningCurvePoints, neverSold, shippingFeeFor,
```

In `services/leanMode.test.ts`, replace:

```ts
    });
  });

  it('writes the Joke Maker\'s shipping line from the round\'s fees', () => {
    expect(shippingLine(1, 5, fees)).toBe('Shipping: $2 per batch of 5');
    expect(shippingLine(2, 5, fees)).toBe('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
    expect(shippingLine(1, 5, { shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 2 }))
      .toBe('Shipping: $1.50 per batch of 5');
```

with:

```ts
    });
```

In `services/nextStep.test.ts`, replace:

```ts
  it('rule 2: a batch on the desk for 45 s or more, priced at the round\'s storage fee', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45) }))).toEqual({
      text: "Batch waiting 45 s. Release what's good enough. Storage costs 5¢ a joke each minute.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(44) })).tone).toBe('info');
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(130.9), storageFeePerJokeMinute: 0.25 })).text)
      .toBe("Batch waiting 2 min 10 s. Release what's good enough. Storage costs 25¢ a joke each minute.");
```

with:

```ts
  it('rule 2: a batch on the desk for 45 s or more; a round that charges storage also prices it', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45) }))).toEqual({
      text: "Batch waiting 45 s. Release what's good enough: customers arriving now can't buy it. Storage costs 5¢ a joke each minute.", tone: 'warn',
    });
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(44) })).tone).toBe('info');
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(130.9), storageFeePerJokeMinute: 0.25 })).text)
      .toBe("Batch waiting 2 min 10 s. Release what's good enough: customers arriving now can't buy it. Storage costs 25¢ a joke each minute.");
```

In `services/nextStep.test.ts`, replace:

```ts
  it('rule 2: no storage clause when storage is free (CLASSIC)', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45), storageFeePerJokeMinute: 0 })).text)
      .toBe("Batch waiting 45 s. Release what's good enough.");
```

with:

```ts
  it('rule 2: at the two-cost defaults (storage 0) the line names no storage price', () => {
    expect(marketingNextStep(mk({ deskBatchSentAt: NOW - s(45), storageFeePerJokeMinute: 0 })).text)
      .toBe("Batch waiting 45 s. Release what's good enough: customers arriving now can't buy it.");
```

In `services/tour/demoScript.test.ts`, replace:

```ts
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-shipping'))).toBe('Keep writing. Every batch is another chance to sell.');
```

with:

```ts
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-batch-size'))).toBe('Keep writing. Every batch is another chance to sell.');
```

In `services/tour/demoScript.test.ts`, replace:

```ts
      tone: 'warn', text: "Batch waiting 52 s. Release what's good enough. Storage costs 5¢ a joke each minute.",
```

with:

```ts
      tone: 'warn', text: "Batch waiting 52 s. Release what's good enough: customers arriving now can't buy it. Storage costs 5¢ a joke each minute.",
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
const DEFAULT_FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
```

with:

```ts
/** The two-cost defaults: listing $0.10, hosting 5¢ a joke-minute, every other fee 0. */
const DEFAULT_FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0,
  shippingFeeSmall: 0, shippingFeeStandard: 0, shippingFeeLarge: 0,
  storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0.05,
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
      'jm-welcome', 'jm-next', 'jm-write', 'jm-send', 'jm-shipping', 'jm-value-stream', 'jm-note', 'jm-scoreboard',
```

with:

```ts
      'jm-welcome', 'jm-next', 'jm-write', 'jm-send', 'jm-batch-size', 'jm-value-stream', 'jm-note', 'jm-scoreboard',
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
      ['Every batch pays shipping.', 'Each batch of 5 costs $2 to ship, so keep them coming but make them count.'],
      ['Follow your batches.', 'Each row is a batch and each square is a joke. Outline means with Marketing, green is selling, amber is waiting for a buyer, pale green sold before but lost its buyer, and grey was not released. Open a row to see each joke.'],
      ["Read Marketing's note.", 'Open a batch and Marketing\'s note sits above its jokes. It says what customers liked and what to change. Read it before you write the next batch.'],
      ['Your scoreboard.', 'Team rank, by profit, is your place among all teams, and profit is sales minus fees. "Found a buyer" counts the jokes that have sold. "Fees and wait times" shows where the money went.'],
```

with:

```ts
      ['Batch size.', 'Every batch is 5 jokes. Keep them coming.'],
      ['Follow your batches.', 'Each row is a batch and each square is a joke. Outline means with Marketing, green is selling, amber is waiting for a buyer, pale green sold before but lost its buyer, and grey was not released. Open a row to see each joke.'],
      ["Read Marketing's note.", 'Open a batch and Marketing\'s note sits above its jokes. It says what customers liked and what to change. Read it before you write the next batch.'],
      ['Your scoreboard.', 'Team rank, by profit, is your place among all teams. "Found a buyer" counts the jokes that have sold, so you can see which batches worked.'],
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
  it('Joke Maker, Round 2: the shipping step lists the three sizes', () => {
    expect(stepsFor('JOKE_MAKER', R2)[4].body).toBe(
      'You choose the size now: $1 for 1–4 jokes, $2 for 5, $3 for 6–10. Smaller batches come back with feedback sooner.',
```

with:

```ts
  it('Joke Maker, Round 2: the batch-size step hands over the choice', () => {
    expect(stepsFor('JOKE_MAKER', R2)[4].body).toBe(
      'You choose the batch size now. Smaller batches reach customers and come back with feedback sooner.',
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
      ['Pick the winners, quickly.', "Tick the jokes customers will buy and leave the rest to be discarded (discarding costs $0.01). Don't be too strict: customers can only buy what's on the shelf."],
```

with:

```ts
      ['Pick the winners, quickly.', "Tick the jokes customers will buy and leave the rest to be discarded. Don't be too strict: customers can only buy what's on the shelf."],
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
      ['Fees add up.', '"Fees and wait times" shows where your sales went. Every batch pays shipping. A batch waiting on your desk pays storage (5¢ a joke each minute), and an unsold joke pays hosting (5¢ a joke each minute). Release quickly.'],
```

with:

```ts
      ['Fees add up.', 'Every joke you release costs $0.10 to list, and 5¢ a minute while it sits unsold. Release jokes that will sell.'],
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
    expect(mk[8]).toContain('pays storage (10¢ a joke each minute), and an unsold joke pays hosting (2.5¢ a joke each minute).');
    expect(stepsFor('JOKE_MAKER', { roundNumber: 1, fees: odd })[4].body).toBe(
      'Each batch of 5 costs $1.50 to ship, so keep them coming but make them count.',
    );
    expect(stepsFor('JOKE_MAKER', { roundNumber: 2, fees: odd })[4].body).toBe(
      'You choose the size now: $0.50 for 1–4 jokes, $1.50 for 5, $4 for 6–10. Smaller batches come back with feedback sooner.',
    );
```

with:

```ts
    // A round that still charges shipping and storage names them after the two costs.
    expect(mk[8]).toBe(
      'Every joke you release costs $0.25 to list, and 2.5¢ a minute while it sits unsold. Every batch pays shipping. '
        + 'A batch waiting on your desk pays storage (10¢ a joke each minute). Release jokes that will sell.',
    );
  });

  it('the Joke Maker tour names no cost in any round, at any fees', () => {
    const odd: TourMoney = { ...DEFAULT_FEES, costOfDiscard: 0.05, shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 4, storageFeePerJokeMinute: 0.1 };
    for (const round of [R1, R2, { roundNumber: 1 as const, fees: odd }, { roundNumber: 2 as const, fees: odd }]) {
      for (const s of stepsFor('JOKE_MAKER', round)) expect(`${s.title} ${s.body}`).not.toMatch(/\bfees?\b|\bcosts?\b|shipping|storage|hosting|listing|\$|¢/i);
    }
  });

  it('a fee that is 0 is never named: with no fees at all Marketing hears only about sales', () => {
    const free: TourMoney = { ...DEFAULT_FEES, costOfPublishing: 0, hostingFeePerJokeMinute: 0 };
    const mk = stepsFor('QUALITY_CONTROL', { roundNumber: 1, fees: free }).map(s => s.body as string);
    expect(mk[0]).toBe('You decide which jokes go to market. Each sale earns $1.');
    expect(mk[8]).toBe('Release jokes that will sell.');
    for (const b of mk) expect(b).not.toMatch(/\$0[^.]|\$0$|0¢|discarding costs/);
    const listingOnly = stepsFor('QUALITY_CONTROL', { roundNumber: 1, fees: { ...free, costOfPublishing: 0.1 } })[8].body;
    expect(listingOnly).toBe('Every joke you release costs $0.10 to list. Release jokes that will sell.');
    const hostingOnly = stepsFor('QUALITY_CONTROL', { roundNumber: 1, fees: { ...free, hostingFeePerJokeMinute: 0.05 } })[8].body;
    expect(hostingOnly).toBe('Every joke you release costs 5¢ a minute while it sits unsold. Release jokes that will sell.');
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
    expect(jm.body).toContain('Fees and wait times');
```

with:

```ts
    expect(jm.body).not.toContain('Fees');
```

In `services/tour/tourSteps.test.ts`, replace:

```ts
    expect(mkFees.body(R1)).toContain('Fees and wait times');
```

with:

```ts
    expect(mkFees.body(R1)).toContain('to list');
```

In `views/loginWaiting.render.test.ts`, replace:

```ts
import { renderWithGame, testUser } from './testing/renderWithGame';
```

with:

```ts
import { TEST_CONFIG, TWO_COST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
```

In `views/loginWaiting.render.test.ts`, replace:

```ts

  it('greets the pair by their formatted names, in the heading and the header', () => {
```

with:

```ts

  it('names discarding as a cost only in a round that charges it', () => {
    const goal = (config: typeof TEST_CONFIG) =>
      text(renderWithGame(WaitingRoom, { user: seat(Role.UNASSIGNED), config, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } }));
    expect(goal(TWO_COST_CONFIG)).toContain('and every joke you release has a cost.');
    expect(goal(TEST_CONFIG)).toContain('and every joke you release or discard has a cost.');
  });

  it('greets the pair by their formatted names, in the heading and the header', () => {
```

In `views/marketingRelease.test.ts`, replace:

```ts

  it('a failed publish shows no toast and keeps the typed note', () => {
```

with:

```ts

  it('at the two-cost defaults (discards free) a pass names no charge, and a release charges listing only', () => {
    const twoCosts = { ...base, costOfDiscard: 0 };
    expect(releaseOutcome({ ...twoCosts, releasedCount: 0, ok: true, note: '' }))
      .toEqual({ toast: 'Passed on this batch · 5 jokes discarded', cost: 0, clearNote: true });
    expect(releaseOutcome({ ...twoCosts, ok: true, note: 'More puns' }).toast).toBe('Released 2 jokes · 3 discarded · −$0.20 · note sent');
  });

  it('a failed publish shows no toast and keeps the typed note', () => {
```

In `views/nextStep.render.test.ts`, replace:

```ts
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
```

with:

```ts
import { TEST_CONFIG, TWO_COST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
```

In `views/nextStep.render.test.ts`, replace:

```ts
  it('sits under the Joke Maker\'s stat tiles, above Jokes by stage', () => {
    const out = renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), teamSummary: summary });
    const line = out.indexOf('Next step');
    expect(line).toBeGreaterThan(out.indexOf('More numbers'));
    expect(line).toBeGreaterThan(out.indexOf('Created to Publish'));
```

with:

```ts
  it('sits in the Joke Maker\'s Production line card, before the stat tiles and Jokes by stage', () => {
    const out = renderWithGame(JokeMaker, { user: testUser(Role.JOKE_MAKER), teamSummary: summary });
    const line = out.indexOf('Next step');
    expect(line).toBeGreaterThan(out.indexOf('Production line'));
    expect(line).toBeLessThan(out.indexOf('More numbers'));
```

In `views/nextStep.render.test.ts`, replace:

```ts
  it('is the first row of Marketing\'s desk card and prices a waiting batch at the round\'s storage fee', () => {
```

with:

```ts
  it('is the first row of Marketing\'s desk card; a waiting batch names the customers it misses, and storage only when the round charges it', () => {
```

In `views/nextStep.render.test.ts`, replace:

```ts
    expect(out).toMatch(/Batch waiting (5\d) s\. Release what&#x27;s good enough\. Storage costs 5¢ a joke each minute\./);
```

with:

```ts
    expect(out).toMatch(/Batch waiting (5\d) s\. Release what&#x27;s good enough: customers arriving now can&#x27;t buy it\. Storage costs 5¢ a joke each minute\./);
    const twoCosts = renderWithGame(QualityControl, {
      user: testUser(Role.QUALITY_CONTROL), config: TWO_COST_CONFIG,
      teamSummary: { ...summary, unprocessed_batches: 1 },
      qcQueue: { batch: { batch_id: 9, round_id: 1, team_id: 1, submitted_at: sent, raw_text: 'one\n\ntwo' }, jokes: [], queue_size: 1 },
    });
    expect(twoCosts).toMatch(/Batch waiting (5\d) s\. Release what&#x27;s good enough: customers arriving now can&#x27;t buy it\./);
    expect(twoCosts).not.toContain('Storage costs');
```

In `views/studentScreens.render.test.ts`, replace:

```ts
import { TEST_CONFIG, fakeGame, renderWithGame, testUser } from './testing/renderWithGame';
```

with:

```ts
import { TEST_CONFIG, TWO_COST_CONFIG, fakeGame, renderWithGame, testUser } from './testing/renderWithGame';
```

In `views/studentScreens.render.test.ts`, replace:

```ts
describe('Joke Maker screen', () => {
  it('quotes Round 1 shipping for its batch of 5', () => {
    expect(jokeMaker(1)).toContain('Shipping: $2 per batch of 5');
  });

  it('quotes the three Round 2 tiers and says up to 10 jokes, smaller allowed', () => {
    const out = jokeMaker(2);
    expect(out).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
    expect(out).toContain('make up to 10 jokes per batch');
```

with:

```ts
/** The Joke Maker pays nothing (spec 2026-11-10 §2.2): no fee, cost or price anywhere on its screen. */
const NO_COST_COPY = /Shipping|Storage|Hosting|Listing|\bfees?\b|\bcosts?\b|per batch of|Fees and wait times/i;

describe('Joke Maker screen', () => {
  it('names no cost in either round, even in a round that still charges shipping and storage', () => {
    for (const round of [1, 2] as const) {
      const out = jokeMaker(round).replace(/<[^>]+>/g, ' ');
      expect(out).not.toMatch(NO_COST_COPY);
    }
    expect(jokeMaker(2)).not.toContain('data-tour="jm-shipping"');
  });

  it('says up to 10 jokes in Round 2, smaller allowed', () => {
    expect(jokeMaker(2)).toContain('make up to 10 jokes per batch');
```

In `views/studentScreens.render.test.ts`, replace:

```ts
    it('puts Next step first in the card, then the paste box, the send row and the shipping line', () => {
      const out = jokeMaker(1, { ...lean, round1BatchSize: 5 });
      const at = (t: string) => out.indexOf(`data-tour="${t}"`);
      expect(out.split('data-tour="jm-next-step"').length).toBe(2);
      const order = ['jm-next-step', 'jm-draft', 'jm-send', 'jm-shipping'].map(at);
```

with:

```ts
    it('puts Next step first in the card, then the paste box and the send row', () => {
      const out = jokeMaker(1, { ...lean, round1BatchSize: 5 });
      const at = (t: string) => out.indexOf(`data-tour="${t}"`);
      expect(out.split('data-tour="jm-next-step"').length).toBe(2);
      const order = ['jm-next-step', 'jm-draft', 'jm-send'].map(at);
```

In `views/studentScreens.render.test.ts`, replace:

```ts
      expect(out).toContain('Shipping: $2 per batch of 5');
```

with:

```ts
      expect(out).not.toContain('Shipping');
```

In `views/studentScreens.render.test.ts`, replace:

```ts
      for (const t of ['jm-next-step', 'jm-draft', 'jm-send', 'jm-shipping']) expect(fieldset).toContain(`data-tour="${t}"`);
    });
  });

  it('reads the amounts from the round, never from fixed copy', () => {
    const out = jokeMaker(2, { shippingFeeSmall: 0.5, shippingFeeStandard: 1, shippingFeeLarge: 4 });
    expect(out).toContain('Shipping: $0.50 for 1–4 jokes · $1 for 5 · $4 for 6–10');
```

with:

```ts
      for (const t of ['jm-next-step', 'jm-draft', 'jm-send']) expect(fieldset).toContain(`data-tour="${t}"`);
    });
  });

  it('keeps its own numbers under More numbers: batches, waste and created to publish', () => {
    const out = jokeMaker(1, { marketMode: 'LEAN' });
    expect(out).toContain('More numbers');
    expect(out).not.toContain('Fees and wait times');
```

In `views/studentScreens.render.test.ts`, replace:

```ts

  it('counts Content Backlog from queue/count, as the desk header does', () => {
```

with:

```ts

  it('at the two-cost defaults lists only listing and hosting, and the wait timeline names no storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1' });
    const out = renderWithGame(QualityControl, {
      user: testUser(Role.QUALITY_CONTROL), config: TWO_COST_CONFIG,
      teamSummary: summary({ shipping_cost: 0, storage_cost: 0, hosting_cost: 0.2, avg_submit_to_publish_s: 161, avg_publish_to_first_sale_s: 52 }),
    }).replace(/<[^>]+>/g, ' ');
    for (const l of ['Listing fees', 'Hosting', 'With Marketing 2:41', 'Waiting for first buyer 0:52']) expect(out).toContain(l);
    for (const l of ['Shipping', 'Storage', 'storage is charged', 'discard fees']) expect(out).not.toContain(l);
  });

  it('counts Content Backlog from queue/count, as the desk header does', () => {
```

In `views/studentScreens.render.test.ts`, replace:

```ts

  it('keeps the four tour targets on the screen', () => {
```

with:

```ts

  it('at the two-cost defaults the tally charges listing only, and a free discard shows no cost', () => {
    expect(choose(THREE, { config: TWO_COST_CONFIG }).replace(/<[^>]+>/g, '')).toContain('Selling 3, discarding 2, costs $0.30');
    const none = choose({}, { config: TWO_COST_CONFIG }).replace(/<[^>]+>/g, '');
    expect(none).toContain('Selling 0, discarding 5');
    expect(none).not.toContain('costs $0.00');
  });

  it('keeps the four tour targets on the screen', () => {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/shownFees.test.ts components/FeesAndWaits.test.tsx components/StatTiles.test.tsx components/tour services/nextStep.test.ts services/tour views/loginWaiting.render.test.ts views/marketingRelease.test.ts views/nextStep.render.test.ts views/studentScreens.render.test.ts`
Expected: FAIL — `services/shownFees.test.ts` cannot import `./shownFees`; the Joke Maker tests still find the shipping line and "Fees and wait times"; the tour tests find `jm-shipping` and the old Marketing captions; the Next step tests find the old desk-wait sentence; the two-cost toast, tally and waiting-room tests find "$0.00" / "or discard".

- [ ] **Step 3: Implement the display rule on the student screens, the Next step line and the tour**

Create `services/shownFees.ts`:

```ts
/* Which fees a round charges, and a team's fees by kind
   (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §2.2).
   The default round charges two costs, both Marketing's: listing
   (cost_of_publishing, once per released joke) and hosting (per joke-minute a
   released joke has not sold). A fee whose amount is 0 for the round is not
   shown anywhere, so an old round with shipping still shows shipping, and a
   class that sets storage back above 0 sees storage again. */
import { leanFeesOf } from './leanMode';

/** The round's fee amounts, as GameConfig carries them. */
export interface FeeRates {
  costOfPublishing: number;
  costOfDiscard: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}

export type FeeKind = 'listing' | 'hosting' | 'shipping' | 'storage' | 'discard';

/** Display order everywhere a list of fees is written out. */
export const FEE_KINDS: readonly FeeKind[] = ['listing', 'hosting', 'shipping', 'storage', 'discard'];

export type ShownFees = Readonly<Record<FeeKind, boolean>>;

/** Every fee shown: what a caller that knows no round falls back to. */
export const ALL_FEES_SHOWN: ShownFees = { listing: true, hosting: true, shipping: true, storage: true, discard: true };

const charged = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A fee is shown when the round charges it: an amount above 0 (any shipping tier for shipping). */
export function shownFees(r: Partial<FeeRates> | null | undefined): ShownFees {
  return {
    listing: charged(r?.costOfPublishing),
    hosting: charged(r?.hostingFeePerJokeMinute),
    shipping: charged(r?.shippingFeeSmall) || charged(r?.shippingFeeStandard) || charged(r?.shippingFeeLarge),
    storage: charged(r?.storageFeePerJokeMinute),
    discard: charged(r?.costOfDiscard),
  };
}

/** A team's fees so far, in dollars, by kind. */
export type TeamFees = Record<FeeKind, number>;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * One team's fees: shipping, storage and hosting from its Lean stats (an older
 * backend's setup and carrying costs, see leanFeesOf), listing and discard from
 * its released and discarded jokes at the round's prices. Never NaN.
 */
export function teamFees(
  row: { lean?: Parameters<typeof leanFeesOf>[0]; published_jokes?: unknown; discarded_jokes?: unknown },
  rates: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null | undefined,
): TeamFees {
  const lean = leanFeesOf(row.lean);
  return {
    ...lean,
    listing: num(row.published_jokes) * num(rates?.costOfPublishing),
    discard: num(row.discarded_jokes) * num(rates?.costOfDiscard),
  };
}

/** Every fee added up: profit = sales × price − this. */
export function feesTotal(f: TeamFees): number {
  return FEE_KINDS.reduce((sum, k) => sum + f[k], 0);
}

/** "listing and hosting", "listing, hosting and shipping": the shown fees in words; "no fees" when none. */
export function feeNames(shown: ShownFees): string {
  const names = FEE_KINDS.filter(k => shown[k]);
  if (names.length === 0) return 'no fees';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
   in Lean rounds, on both student screens. Collapsed by default. Two charts:
   where this round's sales went (shipping, storage, hosting, listing and
   discard fees, profit) and how long a joke waits on average. Amber is
```

with:

```tsx
   on Marketing's screen in Lean rounds. Collapsed by default. Two charts: where
   this round's sales went (the fees the round charges, then profit) and how
   long a joke waits on average. Only the fees whose amount is above 0 for the
   round appear (services/shownFees.ts): listing and hosting by default, plus
   shipping, storage or discard in a round that still charges them. Amber is
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
import { fmtMoney, leanFeesOf } from '../services/leanMode';
```

with:

```tsx
import { fmtMoney, leanFeesOf } from '../services/leanMode';
import { shownFees, type ShownFees } from '../services/shownFees';
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
  listing: { name: 'Listing and discard fees', color: 'var(--chart-discards)' },
```

with:

```tsx
  listing: { name: 'Listing fees', color: 'var(--chart-discards)' },
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
  const amountOf = (key: FeeSegmentKey) => bar.segments.find(s => s.key === key)?.amount ?? 0;
```

with:

```tsx
  const amountOf = (key: FeeSegmentKey) => bar.segments.find(s => s.key === key)?.amount ?? 0;
  const shown: ShownFees = shownFees(config);
  // Listing carries the discard fee too (feeBar), so it shows while either is charged.
  const isShown = (key: FeeSegmentKey) =>
    key === 'profit' || (key === 'listing' ? shown.listing || shown.discard : shown[key]);
  const nameOf = (key: FeeSegmentKey) =>
    key === 'listing' && shown.discard ? 'Listing and discard fees' : SEGMENT[key].name;
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
  const rows: FeeSegmentKey[] = ['shipping', 'storage', 'hosting', 'listing'];
```

with:

```tsx
  const rows = (['shipping', 'storage', 'hosting', 'listing'] as const).filter(isShown);
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
        parts={bar.segments.map(s => ({
          key: s.key,
          weight: bar.scaleTo > 0 ? s.amount : 0,
          color: SEGMENT[s.key].color,
          title: `${SEGMENT[s.key].name} ${fmtMoney(s.amount)}, ${pct(s.amount)}% of sales`,
        }))}
      />
      <ul className="space-y-1">
        {rows.map(k => <LegendRow key={k} color={SEGMENT[k].color} sub={sub[k]} right={fmtMoney(amountOf(k))}>{SEGMENT[k].name}</LegendRow>)}
```

with:

```tsx
        parts={bar.segments.filter(s => isShown(s.key)).map(s => ({
          key: s.key,
          weight: bar.scaleTo > 0 ? s.amount : 0,
          color: SEGMENT[s.key].color,
          title: `${nameOf(s.key)} ${fmtMoney(s.amount)}, ${pct(s.amount)}% of sales`,
        }))}
      />
      <ul className="space-y-1">
        {rows.map(k => <LegendRow key={k} color={SEGMENT[k].color} sub={sub[k]} right={fmtMoney(amountOf(k))}>{nameOf(k)}</LegendRow>)}
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
/** Two averages over different sets of jokes, so the total reads "about". The Released label is clamped so the tick labels never collide. */
const WaitChart: React.FC<{ marketing: number; market: number }> = ({ marketing, market }) => {
```

with:

```tsx
/**
 * Two averages over different sets of jokes, so the total reads "about". The
 * Released label is clamped so the tick labels never collide. Each wait says
 * which fee it costs only while the round charges that fee.
 */
const WaitChart: React.FC<{ marketing: number; market: number; shown: ShownFees }> = ({ marketing, market, shown }) => {
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
          { key: 'market', weight: market, color: 'var(--chart-hosting)', title: `On market, waiting for a buyer ${fmtMinSec(market)}` },
```

with:

```tsx
          { key: 'market', weight: market, color: 'var(--chart-hosting)', title: `Waiting for first buyer ${fmtMinSec(market)}` },
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
        <LegendRow color="var(--chart-storage)" sub="storage is charged">{`With Marketing ${fmtMinSec(marketing)}`}</LegendRow>
        <LegendRow color="var(--chart-hosting)" sub="hosting is charged">{`On market, waiting for a buyer ${fmtMinSec(market)}`}</LegendRow>
```

with:

```tsx
        <LegendRow color="var(--chart-storage)" sub={shown.storage ? 'storage is charged' : undefined}>{`With Marketing ${fmtMinSec(marketing)}`}</LegendRow>
        <LegendRow color="var(--chart-hosting)" sub={shown.hosting ? 'hosting is charged' : undefined}>{`Waiting for first buyer ${fmtMinSec(market)}`}</LegendRow>
```

In `components/FeesAndWaits.tsx`, replace:

```tsx
                {marketing + market > 0 && <WaitChart marketing={marketing} market={market} />}
```

with:

```tsx
                {marketing + market > 0 && <WaitChart marketing={marketing} market={market} shown={shownFees(config)} />}
```

In `views/JokeMaker.tsx`, replace:

```tsx
import { shippingLine } from '../services/leanMode';
import { ValueStream } from '../components/jokeMaker/ValueStream';
import { JokesByStage } from '../components/jokeMaker/JokesByStage';
import { StatTiles, moreTilesKey } from '../components/StatTiles';
import { FeesAndWaits } from '../components/FeesAndWaits';
```

with:

```tsx
import { ValueStream } from '../components/jokeMaker/ValueStream';
import { JokesByStage } from '../components/jokeMaker/JokesByStage';
import { StatTiles, moreTilesKey } from '../components/StatTiles';
```

In `views/JokeMaker.tsx`, replace:

```tsx
     certify box, which batches are open, "Fees and wait times" and the Next step
```

with:

```tsx
     certify box, which batches are open, "More numbers" and the Next step
```

In `views/JokeMaker.tsx`, replace:

```tsx
  /* Lean market mode: every batch sent pays a shipping fee by its size (the
     line under Send). There is no WIP limit: the Joke Maker may always send. */
```

with:

```tsx
  /* The Joke Maker pays nothing and sees no cost copy: both costs, listing and
     hosting, are Marketing's (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md
     §2.2). There is no WIP limit: the Joke Maker may always send. */
```

In `views/JokeMaker.tsx`, replace:

```tsx
              </div>
              {leanMode && (
                <div data-tour="jm-shipping" className="text-xs text-right text-[color:var(--ink-3)]">
                  {shippingLine(config.round, config.round1BatchSize, config)}
                </div>
              )}
```

with:

```tsx
              </div>
```

In `views/JokeMaker.tsx`, replace:

```tsx
            {leanMode ? (
              <FeesAndWaits
                summary={teamSummary}
                config={config}
                storageKey={moreTilesKey('joke_maker')}
                open={demoUi ? demoUi.feesOpen : undefined}
                extras={[{ label: 'Batches', value: batchesCreated }, { label: 'Content Waste', value: waste }]}
              />
            ) : (
              <StatTiles
                storageKey={moreTilesKey('joke_maker')}
                open={demoUi ? demoUi.feesOpen : undefined}
                keyTiles={[]}
                moreTiles={[
                  <StatBox key="lead" label="Created to Publish" value={fmtSeconds(avgLeadSec)} tone="sky" />,
                  <StatBox key="batches" label="Batches" value={batchesCreated} tone="slate" />,
                  <StatBox key="waste" label="Content Waste" value={waste} tone="rose" />,
                ]}
              />
            )}
```

with:

```tsx
            <StatTiles
              storageKey={moreTilesKey('joke_maker')}
              open={demoUi ? demoUi.feesOpen : undefined}
              keyTiles={[]}
              moreTiles={[
                <StatBox key="lead" label="Created to Publish" value={fmtSeconds(avgLeadSec)} tone="sky" />,
                <StatBox key="batches" label="Batches" value={batchesCreated} tone="slate" />,
                <StatBox key="waste" label="Content Waste" value={waste} tone="rose" />,
              ]}
            />
```

In `views/QualityControl.tsx`, replace:

```tsx
                      <b className="font-semibold tabular-nums" style={{ fontFamily: MONO }}>{orderIds.length - submittingIds.length}</b>,{' '}
                      <span style={{ color: 'var(--ink-3)' }}>{`costs ${fmt$(tallyCost)}`}</span>
```

with:

```tsx
                      <b className="font-semibold tabular-nums" style={{ fontFamily: MONO }}>{orderIds.length - submittingIds.length}</b>
                      {/* A $0 tally is no fee (nothing listed, discards free), so it is not shown. */}
                      {tallyCost > 0 && <>, <span style={{ color: 'var(--ink-3)' }}>{`costs ${fmt$(tallyCost)}`}</span></>}
```

In `views/QualityControl.tsx`, replace:

```tsx
              : 'joke stays unpublished and counts as waste'}{' '}
            (<b>{fmt$(discardAllCost)}</b>). Or keep looking for something worth selling.
```

with:

```tsx
              : 'joke stays unpublished and counts as waste'}
            {discardAllCost > 0 && <> (<b>{fmt$(discardAllCost)}</b>)</>}. Or keep looking for something worth selling.
```

In `views/WaitingRoom.tsx`, replace:

```tsx
  const { user, roundStatuses } = useGame();
```

with:

```tsx
  const { user, roundStatuses, config } = useGame();
```

In `views/WaitingRoom.tsx`, replace:

```tsx
            Earn the most profit as a team. AI customers buy the jokes that fit their hidden taste, and every joke you release or discard has a cost.
```

with:

```tsx
            Earn the most profit as a team. AI customers buy the jokes that fit their hidden taste, and every joke you release{config.costOfDiscard > 0 ? ' or discard' : ''} has a cost.
```

In `views/marketingRelease.ts`, replace:

```ts
  const base = i.releasedCount === 0
    ? `Passed on this batch · ${i.batchSize} joke${i.batchSize > 1 ? 's' : ''} discarded · −${fmt$(cost)}`
    : `Released ${i.releasedCount} joke${i.releasedCount > 1 ? 's' : ''}${discarded > 0 ? ` · ${discarded} discarded` : ''} · −${fmt$(cost)}`;
```

with:

```ts
  // A charge of $0 (no listing, discards free: the two-cost default) is not a fee, so it is not shown.
  const charge = cost > 0 ? ` · −${fmt$(cost)}` : '';
  const base = i.releasedCount === 0
    ? `Passed on this batch · ${i.batchSize} joke${i.batchSize > 1 ? 's' : ''} discarded${charge}`
    : `Released ${i.releasedCount} joke${i.releasedCount > 1 ? 's' : ''}${discarded > 0 ? ` · ${discarded} discarded` : ''}${charge}`;
```

In `services/nextStep.ts`, replace:

```ts
      const storage = i.storageFeePerJokeMinute > 0 ? ` Storage costs ${fmtPerMinute(i.storageFeePerJokeMinute)}.` : '';
      return warn(`Batch waiting ${fmtDuration(waited)}. Release what's good enough.${storage}`);
```

with:

```ts
      // Two costs by default: no storage, so the cost of waiting is the customers it misses
      // (spec 2026-11-10 §2.2). A round that still charges storage says so too.
      const storage = i.storageFeePerJokeMinute > 0 ? ` Storage costs ${fmtPerMinute(i.storageFeePerJokeMinute)}.` : '';
      return warn(`Batch waiting ${fmtDuration(waited)}. Release what's good enough: customers arriving now can't buy it.${storage}`);
```

In `services/tour/tourSteps.ts`, replace:

```ts
   ("5¢"). The only round-dependent copy is the Joke Maker's shipping step.
```

with:

```ts
   ("5¢"). The Joke Maker pays nothing, so its tour names no cost; the only
   round-dependent copy in it is the batch-size step. Marketing's captions name
   only the fees the round charges (an amount above 0): listing and hosting by
   default (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §2.2).
```

In `services/tour/tourSteps.ts`, replace:

```ts
import { fmtCents, fmtFee, fmtPerMinute } from '../leanMode';
```

with:

```ts
import { fmtCents, fmtFee, fmtPerMinute } from '../leanMode';
import { shownFees } from '../shownFees';
```

In `services/tour/tourSteps.ts`, replace:

```ts
    id: 'jm-shipping', target: 'jm-shipping',
    title: 'Every batch pays shipping.',
    body: ({ roundNumber, fees }) => (roundNumber === 1
      ? `Each batch of 5 costs ${fmtFee(fees.shippingFeeStandard)} to ship, so keep them coming but make them count.`
      : `You choose the size now: ${fmtFee(fees.shippingFeeSmall)} for 1–4 jokes, ${fmtFee(fees.shippingFeeStandard)} for 5, ${fmtFee(fees.shippingFeeLarge)} for 6–10. Smaller batches come back with feedback sooner.`),
```

with:

```ts
    id: 'jm-batch-size', target: 'jm-send',
    title: 'Batch size.',
    body: ({ roundNumber }) => (roundNumber === 1
      ? 'Every batch is 5 jokes. Keep them coming.'
      : 'You choose the batch size now. Smaller batches reach customers and come back with feedback sooner.'),
```

In `services/tour/tourSteps.ts`, replace:

```ts
    body: 'Team rank, by profit, is your place among all teams, and profit is sales minus fees. "Found a buyer" counts the jokes that have sold. "Fees and wait times" shows where the money went.',
```

with:

```ts
    body: 'Team rank, by profit, is your place among all teams. "Found a buyer" counts the jokes that have sold, so you can see which batches worked.',
```

In `services/tour/tourSteps.ts`, replace:

```ts
    body: ({ fees }) => `You decide which jokes go to market. Listing a joke costs ${fmtFee(fees.costOfPublishing)}, and each sale earns ${fmtFee(fees.marketPrice)}.`,
```

with:

```ts
    body: ({ fees }) => (shownFees(fees).listing
      ? `You decide which jokes go to market. Listing a joke costs ${fmtFee(fees.costOfPublishing)}, and each sale earns ${fmtFee(fees.marketPrice)}.`
      : `You decide which jokes go to market. Each sale earns ${fmtFee(fees.marketPrice)}.`),
```

In `services/tour/tourSteps.ts`, replace:

```ts
    body: ({ fees }) => `Tick the jokes customers will buy and leave the rest to be discarded (discarding costs ${fmtFee(fees.costOfDiscard)}). Don't be too strict: customers can only buy what's on the shelf.`,
```

with:

```ts
    body: ({ fees }) => `Tick the jokes customers will buy and leave the rest to be discarded${shownFees(fees).discard ? ` (discarding costs ${fmtFee(fees.costOfDiscard)})` : ''}. Don't be too strict: customers can only buy what's on the shelf.`,
```

In `services/tour/tourSteps.ts`, replace:

```ts
    body: ({ fees }) => `"Fees and wait times" shows where your sales went. Every batch pays shipping. A batch waiting on your desk pays storage (${fmtCents(fees.storageFeePerJokeMinute)} a joke each minute), and an unsold joke pays hosting (${fmtPerMinute(fees.hostingFeePerJokeMinute)}). Release quickly.`,
```

with:

```ts
    body: ({ fees }) => feesCaption(fees),
```

In `services/tour/tourSteps.ts`, replace:

```ts

/** A step's caption, with the round's amounts filled in. */
```

with:

```ts

/**
 * Marketing's fee step: listing and hosting in the spec's words ("Every joke you
 * release costs $0.10 to list, and 5¢ a minute while it sits unsold. Release
 * jokes that will sell."), then shipping and storage only in a round that still
 * charges them. A fee that is 0 is never named.
 */
export function feesCaption(fees: TourRound['fees']): string {
  const shown = shownFees(fees);
  const list = `${fmtFee(fees.costOfPublishing)} to list`;
  const host = `${fmtCents(fees.hostingFeePerJokeMinute)} a minute while it sits unsold`;
  const parts: string[] = [];
  if (shown.listing && shown.hosting) parts.push(`Every joke you release costs ${list}, and ${host}.`);
  else if (shown.listing) parts.push(`Every joke you release costs ${list}.`);
  else if (shown.hosting) parts.push(`Every joke you release costs ${host}.`);
  if (shown.shipping) parts.push('Every batch pays shipping.');
  if (shown.storage) parts.push(`A batch waiting on your desk pays storage (${fmtPerMinute(fees.storageFeePerJokeMinute)}).`);
  parts.push('Release jokes that will sell.');
  return parts.join(' ');
}

/** A step's caption, with the round's amounts filled in. */
```

In `services/leanMode.ts`, replace:

```ts
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
```

with:

```ts
  return `${fmtCents(v)} a joke each minute`;
```

In `context.tsx`, replace:

```tsx
const DEFAULT_COST_OF_DISCARD = 0.01;
```

with:

```tsx
// The two-cost defaults (jokefactory_be domain defaults): discards are free.
const DEFAULT_COST_OF_DISCARD = 0;
```

- [ ] **Step 4: Run the tests and the gates**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/shownFees.test.ts components/FeesAndWaits.test.tsx components/StatTiles.test.tsx components/tour services/nextStep.test.ts services/tour views/loginWaiting.render.test.ts views/marketingRelease.test.ts views/nextStep.render.test.ts views/studentScreens.render.test.ts`
Expected: PASS.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: PASS — tsc silent; every test file passes (the instructor screens are unchanged until Task 5).

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add services/shownFees.ts services/shownFees.test.ts views/testing/renderWithGame.ts components/FeesAndWaits.tsx components/FeesAndWaits.test.tsx components/StatTiles.test.tsx components/tour/DemoStage.test.ts components/tour/GuidedTour.test.ts views/JokeMaker.tsx views/QualityControl.tsx views/WaitingRoom.tsx views/marketingRelease.ts views/marketingRelease.test.ts services/nextStep.ts services/nextStep.test.ts services/tour/tourSteps.ts services/tour/tourSteps.test.ts services/tour/demoScript.test.ts services/leanMode.ts services/leanMode.test.ts context.tsx views/loginWaiting.render.test.ts views/nextStep.render.test.ts views/studentScreens.render.test.ts && git commit -q -F - <<'EOF'
feat(costs): students see only the fees the round charges

The Joke Maker has no cost copy; Marketing's fees panel, Next step line,
release toast and tally, and both tours name listing and hosting, plus
shipping, storage or discard only while the round charges them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 5: Frontend — only charged fees on the instructor screens

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Modify: `services/liveBoard.ts` (`BoardRow.fees`, `boardRows`), `services/classTotals.ts` (`classTotals`), `services/leanCharts.ts` (`WASTE_SEGMENTS`, new `wasteSegmentsFor`), `components/instructor/LiveBoard.tsx` (`ClassTotalsRow`, `FeeBar`, `LeaderboardTable`, `PresentBoard`), `components/instructor/LiveTab.tsx`, `components/instructor/SetupTab.tsx` (Costs group), `components/instructor/DebriefTab.tsx`, `components/FeeConfigFields.tsx` (`shown` prop), `components/LeanDebrief.tsx` (`debriefRows`, `LeanDebrief`), `components/leanCharts/WasteBreakdownChart.tsx`, `components/leanCharts/LeanChartsPanel.tsx`
- Test: modify `services/classTotals.test.ts`, `services/liveBoard.test.ts`, `components/leanDebrief.test.ts`, `components/leanCharts/leanCharts.render.test.ts`, `views/Instructor.leaderboard.render.test.ts`, `views/Instructor.render.test.ts`

**Interfaces:**
- Consumes: Task 4's `shownFees`, `teamFees`, `feesTotal`, `feeNames`, `FEE_KINDS`, `ALL_FEES_SHOWN`, `FeeRates`, `ShownFees`, `FeeKind`, `TWO_COST_CONFIG`.
- Produces:
  ```ts
  export function boardRows(rows, teamNames, rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null): BoardRow[]; // BoardRow.fees: TeamFees
  export function classTotals(rows, lean: boolean, rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null): ClassTotals;
  export function debriefRows(r1, r2, teamNames?, rates?): DebriefRow[];
  export function wasteSegmentsFor(shown: ShownFees): typeof WASTE_SEGMENTS; // each segment now has `fee: FeeKind`
  // props: ClassTotalsRow { shown? }, LeaderboardTable { shown? }, PresentBoard { shown? }, LeanDebrief { rates? },
  //        WasteBreakdownChart { shown? }, LeanChartsPanel { shown? }, FeeConfigFields { shown?: { shipping: boolean; storage: boolean } }
  ```
  Every new prop defaults to "show everything" / "no rates", so a caller that passes nothing behaves as before.

- [ ] **Step 1: Write the failing tests**

In `services/classTotals.test.ts`, replace:

```ts
      sales: 15, profit: 3.25, best: 4.5, worst: -1.25, released: 15, neverSold: 7, neverSoldShare: 7 / 15, fees: 13,
    });
  });
```

with:

```ts
      sales: 15, profit: 3.25, best: 4.5, worst: -1.25, released: 15, neverSold: 7, neverSoldShare: 7 / 15, fees: 13,
    });
  });

  it('counts listing at the round\'s price in the fees: listing + hosting at the two-cost defaults', () => {
    const rows = [
      row(1, { published_jokes: 9, discarded_jokes: 1, lean: lean({ shipping_cost: 0, storage_cost: 0, hosting_cost: 0.5 }, []) }),
      row(2, { published_jokes: 6, discarded_jokes: 4, lean: lean({ shipping_cost: 0, storage_cost: 0, hosting_cost: 0.75 }, []) }),
    ];
    expect(classTotals(rows, true, { costOfPublishing: 0.1, costOfDiscard: 0 }).fees).toBeCloseTo(1.5 + 1.25);
  });
```

In `services/liveBoard.test.ts`, replace:

```ts
    expect(r.fees).toEqual({ shipping: 2, storage: 0.5, hosting: 0.25 });
```

with:

```ts
    expect(r.fees).toEqual({ shipping: 2, storage: 0.5, hosting: 0.25, listing: 0, discard: 0 });
  });

  it('adds listing (and discard) at the round\'s prices to the fees', () => {
    const [r] = boardRows([row(3, 2, 1.5, {
      published_jokes: 8, discarded_jokes: 2,
      lean: {
        batches_submitted: 1, setup_cost: 0, carrying_cost: 0, shipping_cost: 0, storage_cost: 0, hosting_cost: 1.25,
        avg_submit_to_publish_s: 72, avg_publish_to_first_sale_s: 0, batch_series: [],
      },
    })], {}, { costOfPublishing: 0.1, costOfDiscard: 0 });
    expect(r.fees).toEqual({ shipping: 0, storage: 0, hosting: 1.25, listing: 0.8, discard: 0 });
    expect(r.feesTotal).toBeCloseTo(2.05);
```

In `components/leanDebrief.test.ts`, replace:

```ts
  });
  it('tolerates a team present in one round only', () => {
```

with:

```ts
  });
  it('counts listing at the round\'s price in the fees, as the Live board does', () => {
    const rows = debriefRows(r1 as any, r2 as any, {}, { costOfPublishing: 0.1, costOfDiscard: 0 });
    expect(rows[0].r1?.fees).toBeCloseTo(24 + 8.8 + 40 * 0.1);
    expect(rows[0].r2?.fees).toBeCloseTo(4 + 1.2 + 10 * 0.1);
  });

  it('tolerates a team present in one round only', () => {
```

In `components/leanCharts/leanCharts.render.test.ts`, replace:

```ts
import { batchScatter, cyclesForInstructor } from '../../services/leanCharts';
```

with:

```ts
import { batchScatter, cyclesForInstructor } from '../../services/leanCharts';
import { shownFees } from '../../services/shownFees';
import { TWO_COST_CONFIG } from '../../views/testing/renderWithGame';
```

In `components/leanCharts/leanCharts.render.test.ts`, replace:

```ts
  });
  it('says when the data is unavailable', () => {
```

with:

```ts
  });
  it('at the two-cost defaults shows only Hosting and Listing fees, never sold', () => {
    const out = html(createElement(WasteBreakdownChart, { data: res, teamNames: {}, shown: shownFees(TWO_COST_CONFIG) }));
    for (const label of ['Hosting, unsold on the market', 'Listing fees, never sold']) expect(out).toContain(label);
    for (const label of ['Shipping', 'Storage, waiting on Marketing', 'Discards']) expect(out).not.toContain(label);
    expect(out).not.toContain('var(--chart-shipping)');
  });

  it('says when the data is unavailable', () => {
```

In `views/Instructor.leaderboard.render.test.ts`, replace:

```ts
import { renderWithGame, testUser, TEST_CONFIG } from './testing/renderWithGame';
```

with:

```ts
import { renderWithGame, testUser, TEST_CONFIG, TWO_COST_CONFIG } from './testing/renderWithGame';
```

In `views/Instructor.leaderboard.render.test.ts`, replace:

```ts
    expect(out).toContain('title="Shipping $8.00, storage $1.50, hosting $0.20"');
    expect(out).toContain('$9.70');
```

with:

```ts
    // An old round charges all five: listing 8 × $0.10 and discard 1 × $0.01 join the Lean fees.
    expect(out).toContain('title="Listing $0.80, Hosting $0.20, Shipping $8.00, Storage $1.50, Discard $0.01"');
    expect(out).toContain('$10.51');
```

In `views/Instructor.leaderboard.render.test.ts`, replace:

```ts
    expect(out).toContain('title="Shipping $4.00, storage $2.50, hosting $0.00"');
    expect(out).toContain('$6.50');
```

with:

```ts
    expect(out).toContain('title="Listing $0.80, Hosting $0.00, Shipping $4.00, Storage $2.50, Discard $0.01"');
    expect(out).toContain('$7.31');
```

In `views/Instructor.leaderboard.render.test.ts`, replace:

```ts
    expect(out).toContain('shipping, storage and hosting');
```

with:

```ts
    expect(out).toContain('listing, hosting, shipping, storage and discard');
  });

  it('at the two-cost defaults: Fees = listing + hosting, named so, with a two-segment fee bar', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: TWO_COST_CONFIG,
      instructorStatsRound1: { round_id: 1, leaderboard: [row(1, { shipping_cost: 0, storage_cost: 0, hosting_cost: 0.2 })] },
    });
    expect(out).toContain('listing and hosting');
    expect(out).toContain('title="Listing $0.80, Hosting $0.20"');
    expect(out).toContain('$1.00');
    for (const gone of ['Shipping $', 'Storage $', 'shipping, storage', 'var(--chart-shipping)']) expect(out).not.toContain(gone);
```

In `views/Instructor.render.test.ts`, replace:

```ts
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
```

with:

```ts
import { TEST_CONFIG, TWO_COST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
```

In `views/Instructor.render.test.ts`, replace:

```ts
    expect(out).toContain('Publishing');
    expect(out).toContain('per joke-minute');
```

with:

```ts
    expect(out).toContain('Listing');
    expect(out).not.toContain('Publishing');
    expect(out).toContain('per joke-minute');
  });

  it('Costs shows only Listing and Hosting at the two-cost defaults, and shipping and storage again once charged', () => {
    const two = setup({ config: { ...TWO_COST_CONFIG, isActive: false } });
    expect(two).toMatch(/id="cfg-publishing"[^>]*value="0.1"/);
    expect(two).toMatch(/id="cfg-hosting-fee"[^>]*value="0.05"/);
    for (const gone of ['cfg-shipping-small', 'cfg-shipping-standard', 'cfg-shipping-large', 'cfg-storage-fee', 'Shipping per batch', 'Storage, waiting']) {
      expect(two).not.toContain(gone);
    }
    expect(two.indexOf('id="cfg-publishing"')).toBeLessThan(two.indexOf('id="cfg-hosting-fee"'));
    const storageBack = setup({ config: { ...TWO_COST_CONFIG, isActive: false, storageFeePerJokeMinute: 0.02 } });
    expect(storageBack).toContain('id="cfg-storage-fee"');
    expect(storageBack).not.toContain('cfg-shipping-small');
    const oldRound = setup();
    for (const id of ['cfg-shipping-small', 'cfg-storage-fee']) expect(oldRound).toContain(`id="${id}"`);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/classTotals.test.ts services/liveBoard.test.ts components/leanDebrief.test.ts components/leanCharts/leanCharts.render.test.ts views/Instructor.leaderboard.render.test.ts views/Instructor.render.test.ts`
Expected: FAIL — fees leave out listing (`$9.70` instead of `$10.51`, "shipping, storage and hosting"), `BoardRow.fees` has no `listing`/`discard`, the waste chart still lists Shipping at the two-cost defaults, and Setup still shows "Publishing" and the shipping and storage inputs.

- [ ] **Step 3: Implement the display rule on the instructor screens**

In `services/liveBoard.ts`, replace:

```ts
import { leanFeesOf, neverSold, type LeanFees } from './leanMode';
```

with:

```ts
import { neverSold } from './leanMode';
import { feesTotal, teamFees, type FeeRates, type TeamFees } from './shownFees';
```

In `services/liveBoard.ts`, replace:

```ts
  fees: LeanFees;
```

with:

```ts
  /** Every fee by kind: listing and discard at the round's prices, the rest from the Lean stats. */
  fees: TeamFees;
  /** All the team's fees (listing + hosting by default); null without lean figures. */
```

In `services/liveBoard.ts`, replace:

```ts
/** The stats rows as the board shows them. A renamed team keeps its new name. */
export function boardRows(rows: LeaderboardRow[], teamNames: Record<string, string>): BoardRow[] {
  return rows.map((r, i) => {
    const teamId = String(r.team.id);
    const fees = leanFeesOf(r.lean);
```

with:

```ts
/**
 * The stats rows as the board shows them. A renamed team keeps its new name.
 * `rates` are the round's listing and discard prices (GameConfig): without
 * them listing and discard read 0.
 */
export function boardRows(
  rows: LeaderboardRow[], teamNames: Record<string, string>,
  rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null,
): BoardRow[] {
  return rows.map((r, i) => {
    const teamId = String(r.team.id);
    const fees = teamFees(r, rates);
```

In `services/liveBoard.ts`, replace:

```ts
      feesTotal: r.lean ? fees.shipping + fees.storage + fees.hosting : null,
```

with:

```ts
      feesTotal: r.lean ? feesTotal(fees) : null,
```

In `services/classTotals.ts`, replace:

```ts
import { leanFeesOf, neverSold } from './leanMode';
```

with:

```ts
import { neverSold } from './leanMode';
import { feesTotal, teamFees, type FeeRates } from './shownFees';
```

In `services/classTotals.ts`, replace:

```ts
  /** Shipping + storage + hosting; null in a Classic round. */
```

with:

```ts
  /** Every fee the teams paid (listing + hosting at the two-cost defaults); null in a Classic round. */
```

In `services/classTotals.ts`, replace:

```ts
export function classTotals(rows: LeaderboardRow[], lean: boolean): ClassTotals {
```

with:

```ts
/** `rates` are the round's listing and discard prices (GameConfig); without them those two read 0. */
export function classTotals(
  rows: LeaderboardRow[], lean: boolean, rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null,
): ClassTotals {
```

In `services/classTotals.ts`, replace:

```ts
    const f = leanFeesOf(r.lean);
    fees += f.shipping + f.storage + f.hosting;
```

with:

```ts
    fees += feesTotal(teamFees(r, rates));
```

In `services/leanCharts.ts`, replace:

```ts
import type { LeanChartsClassAverage, LeanChartsResponse, LeanChartsTeam } from '../types/api';
```

with:

```ts
import type { LeanChartsClassAverage, LeanChartsResponse, LeanChartsTeam } from '../types/api';
import type { FeeKind, ShownFees } from './shownFees';
```

In `services/leanCharts.ts`, replace:

```ts
export const WASTE_SEGMENTS: ReadonlyArray<{ key: WasteSegmentKey; label: string; color: string }> = [
  { key: 'setup', label: 'Shipping', color: LEAN_CHART_COLORS.shipping },
  { key: 'waiting', label: 'Storage, waiting on Marketing', color: LEAN_CHART_COLORS.storage },
  { key: 'shelf', label: 'Hosting, unsold on the market', color: LEAN_CHART_COLORS.hosting },
  { key: 'neverSold', label: 'Listing fees, never sold', color: LEAN_CHART_COLORS.neverSold },
  { key: 'discarded', label: 'Discards', color: LEAN_CHART_COLORS.discarded },
];
```

with:

```ts
export const WASTE_SEGMENTS: ReadonlyArray<{ key: WasteSegmentKey; label: string; color: string; fee: FeeKind }> = [
  { key: 'setup', label: 'Shipping', color: LEAN_CHART_COLORS.shipping, fee: 'shipping' },
  { key: 'waiting', label: 'Storage, waiting on Marketing', color: LEAN_CHART_COLORS.storage, fee: 'storage' },
  { key: 'shelf', label: 'Hosting, unsold on the market', color: LEAN_CHART_COLORS.hosting, fee: 'hosting' },
  { key: 'neverSold', label: 'Listing fees, never sold', color: LEAN_CHART_COLORS.neverSold, fee: 'listing' },
  { key: 'discarded', label: 'Discards', color: LEAN_CHART_COLORS.discarded, fee: 'discard' },
];

/** The segments of the fees the round charges: Hosting and Listing fees, never sold, at the two-cost defaults. */
export function wasteSegmentsFor(shown: ShownFees): typeof WASTE_SEGMENTS {
  return WASTE_SEGMENTS.filter(s => shown[s.fee]);
}
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
import { formatProfit } from '../../services/scoreboard';
```

with:

```tsx
import { formatProfit } from '../../services/scoreboard';
import { ALL_FEES_SHOWN, FEE_KINDS, feeNames, type FeeKind, type ShownFees } from '../../services/shownFees';

/** Fee colours on the board, the chart tokens of index.css. */
const FEE_COLOR: Record<FeeKind, string> = {
  listing: 'var(--chart-never-sold)', hosting: 'var(--chart-hosting)', shipping: 'var(--chart-shipping)',
  storage: 'var(--chart-storage)', discard: 'var(--chart-discards)',
};
const FEE_LABEL: Record<FeeKind, string> = {
  listing: 'Listing', hosting: 'Hosting', shipping: 'Shipping', storage: 'Storage', discard: 'Discard',
};
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
/** Sales, profit with best and worst, and in a Lean round never sold and fees. */
export const ClassTotalsRow: React.FC<{ totals: ClassTotals }> = ({ totals: t }) => {
```

with:

```tsx
/** Sales, profit with best and worst, and in a Lean round never sold and fees (the round's charged fees, named). */
export const ClassTotalsRow: React.FC<{ totals: ClassTotals; shown?: ShownFees }> = ({ totals: t, shown = ALL_FEES_SHOWN }) => {
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
          <Kpi label="Fees paid" value={fmtMoney(t.fees!)} sub="shipping, storage and hosting" />
```

with:

```tsx
          <Kpi label="Fees paid" value={fmtMoney(t.fees!)} sub={feeNames(shown)} />
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
const FeeBar: React.FC<{ row: BoardRow; max: number }> = ({ row, max }) => {
  const w = (v: number) => `${(Math.max(0, v) / max) * 70}px`;
  const { shipping, storage, hosting } = row.fees;
  return (
    <span
      className="mr-2 inline-flex h-[7px] w-[70px] gap-px align-middle"
      title={`Shipping ${fmtMoney(shipping)}, storage ${fmtMoney(storage)}, hosting ${fmtMoney(hosting)}`}
    >
      <i className="block h-full rounded-[1px]" style={{ width: w(shipping), background: 'var(--chart-shipping)' }} />
      <i className="block h-full rounded-[1px]" style={{ width: w(storage), background: 'var(--chart-storage)' }} />
      <i className="block h-full rounded-[1px]" style={{ width: w(hosting), background: 'var(--chart-hosting)' }} />
```

with:

```tsx
/** One segment per fee the round charges (listing and hosting by default), widths to scale with `max`. */
const FeeBar: React.FC<{ row: BoardRow; max: number; shown: ShownFees }> = ({ row, max, shown }) => {
  const w = (v: number) => `${(Math.max(0, v) / max) * 70}px`;
  const kinds = FEE_KINDS.filter(k => shown[k]);
  return (
    <span
      className="mr-2 inline-flex h-[7px] w-[70px] gap-px align-middle"
      title={kinds.map(k => `${FEE_LABEL[k]} ${fmtMoney(row.fees[k])}`).join(', ')}
    >
      {kinds.map(k => (
        <i key={k} className="block h-full rounded-[1px]" style={{ width: w(row.fees[k]), background: FEE_COLOR[k] }} />
      ))}
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ rows, lean, sort, onSort, ranks, big = false }) => {
```

with:

```tsx
  /** The fees the round charges: the fee bar has a segment for each. */
  shown?: ShownFees;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ rows, lean, sort, onSort, ranks, big = false, shown = ALL_FEES_SHOWN }) => {
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
                          <FeeBar row={r} max={maxFees} />
```

with:

```tsx
                          <FeeBar row={r} max={maxFees} shown={shown} />
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
}

/** The full-screen, large-type copy of the board for the projector. Esc or Close exits. */
export const PresentBoard: React.FC<PresentBoardProps> = ({ round, rows, lean, sort, onClose }) => {
```

with:

```tsx
  shown?: ShownFees;
}

/** The full-screen, large-type copy of the board for the projector. Esc or Close exits. */
export const PresentBoard: React.FC<PresentBoardProps> = ({ round, rows, lean, sort, onClose, shown }) => {
```

In `components/instructor/LiveBoard.tsx`, replace:

```tsx
        <LeaderboardTable rows={rows} lean={lean} sort={sort} big />
```

with:

```tsx
        <LeaderboardTable rows={rows} lean={lean} sort={sort} big shown={shown} />
```

In `components/instructor/LiveTab.tsx`, replace:

```tsx
import { boardRows, nextBoardSort, type BoardRanks, type BoardSort } from '../../services/liveBoard';
```

with:

```tsx
import { boardRows, nextBoardSort, type BoardRanks, type BoardSort } from '../../services/liveBoard';
import { shownFees } from '../../services/shownFees';
```

In `components/instructor/LiveTab.tsx`, replace:

```tsx
  const { teamNames, marketItems } = useGame();
  const rows = useMemo(() => boardRows(leaderboard, teamNames), [leaderboard, teamNames]);
  const totals = useMemo(() => classTotals(leaderboard, boardLean), [leaderboard, boardLean]);
```

with:

```tsx
  const { teamNames, marketItems, config } = useGame();
  // Both rounds play one rule set, so the selected config's prices price every row; only charged fees show.
  const { costOfPublishing, costOfDiscard } = config;
  const shown = shownFees(config);
  const rows = useMemo(
    () => boardRows(leaderboard, teamNames, { costOfPublishing, costOfDiscard }),
    [leaderboard, teamNames, costOfPublishing, costOfDiscard],
  );
  const totals = useMemo(
    () => classTotals(leaderboard, boardLean, { costOfPublishing, costOfDiscard }),
    [leaderboard, boardLean, costOfPublishing, costOfDiscard],
  );
```

In `components/instructor/LiveTab.tsx`, replace:

```tsx
      <ClassTotalsRow totals={totals} />
```

with:

```tsx
      <ClassTotalsRow totals={totals} shown={shown} />
```

In `components/instructor/LiveTab.tsx`, replace:

```tsx
          ranks={boardRanks}
```

with:

```tsx
          ranks={boardRanks}
          shown={shown}
```

In `components/instructor/LiveTab.tsx`, replace:

```tsx
        <PresentBoard round={viewRound} rows={rows} lean={boardLean} sort={boardSort} onClose={closePresent} />,
```

with:

```tsx
        <PresentBoard round={viewRound} rows={rows} lean={boardLean} sort={boardSort} onClose={closePresent} shown={shown} />,
```

In `components/instructor/LiveTab.tsx`, replace:

```tsx
          teamNames={teamNames}
```

with:

```tsx
          teamNames={teamNames}
          shown={shown}
```

In `components/instructor/SetupTab.tsx`, replace:

```tsx
import { productionTeamCount } from '../../services/leanMode';
```

with:

```tsx
import { productionTeamCount } from '../../services/leanMode';
import { shownFees } from '../../services/shownFees';
```

In `components/instructor/SetupTab.tsx`, replace:

```tsx
  const set = (k: 'budget' | 'marketPrice' | 'costOfPublishing') => (v: number) => setLocal({ ...local, [k]: v });
```

with:

```tsx
  const set = (k: 'budget' | 'marketPrice' | 'costOfPublishing') => (v: number) => setLocal({ ...local, [k]: v });
  // Shipping and storage appear only while the round charges them (the saved values, so a field
  // does not vanish while the instructor types 0 into it).
  const charged = shownFees(config);
```

In `components/instructor/SetupTab.tsx`, replace:

```tsx
              <FeeConfigFields part="costs" {...fees} />
              <SetupField label="Publishing" htmlFor="cfg-publishing">
                <SetupInput
                  id="cfg-publishing" label="Publishing cost per joke" value={local.costOfPublishing} step="0.01" min="0" prefix="$" suffix="per joke"
                  disabled={!canEditPricing} changed={changed.has('costOfPublishing')} onChange={set('costOfPublishing')}
                />
              </SetupField>
```

with:

```tsx
              <SetupField label="Listing" htmlFor="cfg-publishing" hint="Once for every joke Marketing releases.">
                <SetupInput
                  id="cfg-publishing" label="Listing fee per joke" value={local.costOfPublishing} step="0.01" min="0" prefix="$" suffix="per joke"
                  disabled={!canEditPricing} changed={changed.has('costOfPublishing')} onChange={set('costOfPublishing')}
                />
              </SetupField>
              <FeeConfigFields part="costs" {...fees} shown={{ shipping: charged.shipping, storage: charged.storage }} />
```

In `components/instructor/DebriefTab.tsx`, replace:

```tsx
  const { teamNames } = useGame();
  return (
    <Card title="Round 1 vs Round 2" subtitle="Same rules and fees in both rounds, per team. Sorted by Round 2 profit.">
      <LeanDebrief r1={statsR1} r2={statsR2} round2Started={round2Started} teamNames={teamNames} />
```

with:

```tsx
  const { teamNames, config } = useGame();
  return (
    <Card title="Round 1 vs Round 2" subtitle="Same rules and fees in both rounds, per team. Sorted by Round 2 profit.">
      <LeanDebrief r1={statsR1} r2={statsR2} round2Started={round2Started} teamNames={teamNames} rates={config} />
```

In `components/FeeConfigFields.tsx`, replace:

```tsx
   timing), customers per team (Market) and the five fees (Costs). One rule set
   for both rounds, so there is no market mode, preset or WIP limit to choose.
   Apply writes them to every round still being configured (both rounds before
   the class starts); a round that has started is locked. */
```

with:

```tsx
   timing), customers per team (Market) and the per-minute and shipping fees
   (Costs). One rule set for both rounds, so there is no market mode, preset or
   WIP limit to choose. Apply writes them to every round still being configured
   (both rounds before the class starts); a round that has started is locked.
   Costs shows hosting always; shipping and storage only while the round charges
   them (spec 2026-11-10 §2.2: two costs, listing and hosting, by default). */
```

In `components/FeeConfigFields.tsx`, replace:

```tsx
}> = ({ part, values, onChange, disabled, lockHint, teamCount, changed }) => {
```

with:

```tsx
  /** Costs only: whether the round charges shipping and storage (stored above 0); both shown when not given. */
  shown?: { shipping: boolean; storage: boolean };
}> = ({ part, values, onChange, disabled, lockHint, teamCount, changed, shown = { shipping: true, storage: true } }) => {
```

In `components/FeeConfigFields.tsx`, replace:

```tsx
  const orderError = disabled ? null : shippingOrderError(values);
  return (
    <>
```

with:

```tsx
  const orderError = disabled || !shown.shipping ? null : shippingOrderError(values);
  return (
    <>
      <SetupField label="Hosting, unsold on the market" htmlFor="cfg-hosting-fee" hint="Every minute a released joke has not sold.">
        <SetupInput
          id="cfg-hosting-fee" label="Hosting fee per joke-minute" value={values.hostingFeePerJokeMinute}
          step="0.01" min="0" prefix="$" suffix="per joke-minute" {...common('hostingFeePerJokeMinute')} onChange={set('hostingFeePerJokeMinute')}
        />
      </SetupField>
      {shown.shipping && (
```

In `components/FeeConfigFields.tsx`, replace:

```tsx
      </SetupField>
      <SetupField label="Storage, waiting on Marketing" htmlFor="cfg-storage-fee">
```

with:

```tsx
      </SetupField>
      )}
      {shown.storage && (
      <SetupField label="Storage, waiting on Marketing" htmlFor="cfg-storage-fee">
```

In `components/FeeConfigFields.tsx`, replace:

```tsx
      <SetupField label="Hosting, unsold on the market" htmlFor="cfg-hosting-fee">
        <SetupInput
          id="cfg-hosting-fee" label="Hosting fee per joke-minute" value={values.hostingFeePerJokeMinute}
          step="0.01" min="0" prefix="$" suffix="per joke-minute" {...common('hostingFeePerJokeMinute')} onChange={set('hostingFeePerJokeMinute')}
        />
      </SetupField>
```

with:

```tsx
      )}
```

In `components/LeanDebrief.tsx`, replace:

```tsx
import { fmtMoney } from '../services/leanMode';
```

with:

```tsx
import { fmtMoney } from '../services/leanMode';
import type { FeeRates } from '../services/shownFees';
```

In `components/LeanDebrief.tsx`, replace:

```tsx
  /** Shipping + storage + hosting (an older backend's setup + carrying). */
```

with:

```tsx
  /** Every fee the team paid (listing + hosting at the two-cost defaults), as the Live board's Fees column. */
```

In `components/LeanDebrief.tsx`, replace:

```tsx
): DebriefRow[] {
  const byTeam = new Map<string, DebriefRow>();
  for (const [key, stats] of [['r1', r1], ['r2', r2]] as const) {
    for (const b of boardRows(stats?.leaderboard ?? [], teamNames)) {
```

with:

```tsx
  rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null,
): DebriefRow[] {
  const byTeam = new Map<string, DebriefRow>();
  for (const [key, stats] of [['r1', r1], ['r2', r2]] as const) {
    for (const b of boardRows(stats?.leaderboard ?? [], teamNames, rates)) {
```

In `components/LeanDebrief.tsx`, replace:

```tsx
}> = ({ r1, r2, round2Started, teamNames }) => {
```

with:

```tsx
  /** Listing and discard prices; both rounds play one rule set. */
  rates?: Pick<FeeRates, 'costOfPublishing' | 'costOfDiscard'> | null;
}> = ({ r1, r2, round2Started, teamNames, rates }) => {
```

In `components/LeanDebrief.tsx`, replace:

```tsx
  const rows = debriefRows(r1, r2, teamNames);
```

with:

```tsx
  const rows = debriefRows(r1, r2, teamNames, rates);
```

In `components/leanCharts/WasteBreakdownChart.tsx`, replace:

```tsx
   fees first, split into the five kinds of waste in dollars, with the total at
   the end of each bar. Shipping + Storage + Hosting equals the leaderboard's
   fees for that team. Plain rounded segments, like the fee bars elsewhere. */
```

with:

```tsx
   fees first, split into the kinds of waste in dollars, with the total at the
   end of each bar. Only the fees the round charges get a segment and a legend
   entry: Hosting and "Listing fees, never sold" at the two-cost defaults
   (spec 2026-11-10 §2.2). Plain rounded segments, like the fee bars elsewhere. */
```

In `components/leanCharts/WasteBreakdownChart.tsx`, replace:

```tsx
import { LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, WASTE_SEGMENTS, hasWaste, wasteBars } from '../../services/leanCharts';
```

with:

```tsx
import { LEAN_CHARTS_UNAVAILABLE_TEXT, NO_BATCHES_TEXT, hasWaste, wasteBars, wasteSegmentsFor } from '../../services/leanCharts';
import { ALL_FEES_SHOWN, type ShownFees } from '../../services/shownFees';
```

In `components/leanCharts/WasteBreakdownChart.tsx`, replace:

```tsx
}

export const WasteBreakdownChart: React.FC<WasteBreakdownChartProps> = ({
  data, teamNames, unavailable = false, className = '',
}) => {
  const rows = wasteBars(data, teamNames);
```

with:

```tsx
  /** The fees the round charges; every kind when not given. */
  shown?: ShownFees;
}

export const WasteBreakdownChart: React.FC<WasteBreakdownChartProps> = ({
  data, teamNames, unavailable = false, className = '', shown = ALL_FEES_SHOWN,
}) => {
  const rows = wasteBars(data, teamNames);
  const segments = wasteSegmentsFor(shown);
```

In `components/leanCharts/WasteBreakdownChart.tsx`, replace:

```tsx
                  {WASTE_SEGMENTS.filter(s => r[s.key] > 0).map(s => (
```

with:

```tsx
                  {segments.filter(s => r[s.key] > 0).map(s => (
```

In `components/leanCharts/WasteBreakdownChart.tsx`, replace:

```tsx
      <ChartLegend items={WASTE_SEGMENTS.map(s => ({ label: s.label, color: s.color, kind: 'square' as const }))} />
```

with:

```tsx
      <ChartLegend items={segments.map(s => ({ label: s.label, color: s.color, kind: 'square' as const }))} />
```

In `components/leanCharts/LeanChartsPanel.tsx`, replace:

```tsx
import { ChartNotice } from './chartParts';
```

with:

```tsx
import { ChartNotice } from './chartParts';
import type { ShownFees } from '../../services/shownFees';
```

In `components/leanCharts/LeanChartsPanel.tsx`, replace:

```tsx
}

export const LeanChartsPanel: React.FC<LeanChartsPanelProps> = ({ lean, round, r1, r2, teamNames }) => {
```

with:

```tsx
  /** The fees the round charges, for "Where the money leaked"; every kind when not given. */
  shown?: ShownFees;
}

export const LeanChartsPanel: React.FC<LeanChartsPanelProps> = ({ lean, round, r1, r2, teamNames, shown }) => {
```

In `components/leanCharts/LeanChartsPanel.tsx`, replace:

```tsx
      <WasteBreakdownChart data={selected.data} teamNames={teamNames} unavailable={selected.unavailable} />
```

with:

```tsx
      <WasteBreakdownChart data={selected.data} teamNames={teamNames} unavailable={selected.unavailable} shown={shown} />
```

- [ ] **Step 4: Run the tests and the gates**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/classTotals.test.ts services/liveBoard.test.ts components/leanDebrief.test.ts components/leanCharts/leanCharts.render.test.ts views/Instructor.leaderboard.render.test.ts views/Instructor.render.test.ts`
Expected: PASS.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent; every test file passes; `✓ built`.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add services/liveBoard.ts services/liveBoard.test.ts services/classTotals.ts services/classTotals.test.ts services/leanCharts.ts components/instructor/LiveBoard.tsx components/instructor/LiveTab.tsx components/instructor/SetupTab.tsx components/instructor/DebriefTab.tsx components/FeeConfigFields.tsx components/LeanDebrief.tsx components/leanDebrief.test.ts components/leanCharts/WasteBreakdownChart.tsx components/leanCharts/LeanChartsPanel.tsx components/leanCharts/leanCharts.render.test.ts views/Instructor.leaderboard.render.test.ts views/Instructor.render.test.ts && git commit -q -F - <<'EOF'
feat(costs): the instructor sees only the fees the round charges

Fees = every charged fee (listing + hosting by default) in class totals,
the leaderboard, Present and the Debrief; Setup Costs shows Listing and
Hosting (shipping and storage only while charged); the money-leaked chart
shows Hosting and Listing on never-sold jokes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 6: Frontend — bots that use feedback

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `services/bots/feedbackLoop.ts`
- Modify: `services/bots/protocol.ts` (`BotTeamSpec`), `services/bots/engine.ts` (`EngineDeps.traitCorpus`, `TeamRuntime`, `start`, `runJokeMaker`, `drawTraitBatch`, `marketingLoop`)
- Test: create `services/bots/feedbackLoop.test.ts`, `services/bots/engine.feedback.test.ts`, `services/bots/testing/feedbackSim.ts`, `services/bots/testing/feedbackSim.test.ts`; modify `services/bots/testing/fakeApi.ts` (notes, titles, `feedbackFor`)

**Interfaces:**
- Consumes: Task 2's `TraitCorpus`, `TraitJoke`, `Traits`, `TraitIndex`, `indexTraitCorpus`, `normalizeJokeText`, `traitClassification`, `traitFit`, `loadTraitCorpus`; `DIRECTION_WORDS` (`views/feedback.ts`); `dimById`, `DIMENSIONS`, `IDEAL_DIMENSIONS`, `dimFit` (`config/dimensions.ts`); `FeedbackJoke`, `PublishRequest.note`, `TeamBatch.marketing_note` (`types/api.ts`).
- Produces (Task 7 uses the protocol and the engine deps):
  ```ts
  // services/bots/protocol.ts — BotTeamSpec gains (pilot-only; the panel never sets them)
  useFeedback?: boolean;   // set (true or false): the team writes trait-corpus jokes; true: notes are sent and read
  round2BatchSize?: number; // instead of the persona's, from round 2 on, capped at the round's batch_size
  releaseAll?: boolean;    // Marketing releases every joke
  // services/bots/engine.ts — EngineDeps gains
  traitCorpus?: TraitCorpus; // required when a team sets useFeedback (start() throws otherwise)
  // services/bots/feedbackLoop.ts
  export const NOTE_MAX = 500; export type Direction = 'LOWER' | 'HIGHER';
  export interface NoteEntry { title: string; landed: string[]; missed: Array<{ dim: string; direction?: Direction }> }
  export function noteLine(e: NoteEntry): string;
  export function composeNote(jokes: readonly FeedbackJoke[], reported: ReadonlySet<number>): { note: string; reported: number[] };
  export function parseNote(note: string | null | undefined): NoteEntry[];
  export interface Belief { want: Partial<Record<IdealDimension, string>>; avoid: Partial<Record<IdealDimension, string[]>> }
  export const emptyBelief: () => Belief;
  export function applyFeedback(belief: Belief, traits: Traits, entry: NoteEntry): Belief;
  export function beliefScore(belief: Belief, traits: Traits): number;
  export const beliefSize: (b: Belief) => number;
  export function seededOrder(corpus: readonly TraitJoke[], rand: () => number): string[];
  export function pickBatch(corpus, order: readonly string[], belief: Belief, used: ReadonlySet<string>, size: number): TraitJoke[];
  // services/bots/testing/feedbackSim.ts (tests only): a port of core/usecase/feedback.go
  export function simulateFeedback(jokeId: number, classification: Classification, ideal: IdealProfile): Pick<FeedbackJoke, 'good_dimensions' | 'improve_dimensions' | 'improve_hints'>;
  export function directionHint(dim: string, ideal: string, joke: string): 'LOWER' | 'HIGHER' | undefined;
  // FakeWorld gains feedbackFor (null = the old LENGTH-landed stub), jokeById(id); FakeBatch.note
  ```
  Engine behaviour: a trait team's Joke Maker keeps, per round id, an empty-at-start belief, a seeded order of corpus ids (seed `${seed}:traits:${deckIndex}:${round_number}`), the ids it used and the titles it sent; before each batch (feedback on) it reads the latest `marketing_note` on its own batch list and applies each line about a title it sent, once. The feedback team's Marketing reads the team feedback just before each release and sends `composeNote(...)` as `note`; corpus jokes are titled with their corpus title.

- [ ] **Step 1: Write the failing tests (and the test backend's feedback)**

Create `services/bots/testing/feedbackSim.ts`:

```ts
// services/bots/testing/feedbackSim.ts
/**
 * The backend's customer feedback for one joke, for the fake backend and the
 * learning tests: a port of jokefactory_be core/usecase/feedback.go
 * (SelectFeedbackDimensionsFrom from FeedbackStart, DirectionHint). Pass =
 * dim_fit ≥ 0.75; up to 2 landed and 3 missed, backfilled to 5, walking the 12
 * dimensions from joke id mod 12; a missed ordered dimension says LOWER or
 * HIGHER.
 */
import { DIMENSIONS, dimFit, isCatchAll, type Classification, type IdealProfile } from '../../../config/dimensions';
import type { FeedbackJoke } from '../../../types/api';

export const FEEDBACK_PASS = 0.75;

export function directionHint(dim: string, ideal: string, joke: string): 'LOWER' | 'HIGHER' | undefined {
  const spec = DIMENSIONS.find(d => d.id === dim);
  if (!spec || spec.scoring !== 'ordinal' || !ideal || !joke || isCatchAll(ideal) || isCatchAll(joke)) return undefined;
  const ii = spec.categories.indexOf(ideal);
  const ji = spec.categories.indexOf(joke);
  if (ii < 0 || ji < 0 || ii === ji) return undefined;
  return ji > ii ? 'LOWER' : 'HIGHER';
}

export function simulateFeedback(
  jokeId: number, classification: Classification, ideal: IdealProfile,
): Pick<FeedbackJoke, 'good_dimensions' | 'improve_dimensions' | 'improve_hints'> {
  const n = DIMENSIONS.length;
  const start = ((jokeId % n) + n) % n;
  const pass: string[] = [];
  const fail: string[] = [];
  for (let k = 0; k < n; k++) {
    const d = DIMENSIONS[(start + k) % n];
    const fit = dimFit(d.id, d.hasIdeal ? ideal[d.id] ?? '' : '', classification[d.id] ?? '');
    (fit >= FEEDBACK_PASS ? pass : fail).push(d.id);
  }
  const improve = fail.slice(0, 3);
  const good = pass.slice(0, 2);
  let fi = improve.length;
  let pi = good.length;
  while (improve.length + good.length < 5) {
    if (fi < fail.length) improve.push(fail[fi++]);
    else if (pi < pass.length) good.push(pass[pi++]);
    else break;
  }
  const hints: Record<string, 'LOWER' | 'HIGHER'> = {};
  for (const dim of improve) {
    const h = directionHint(dim, ideal[dim] ?? '', classification[dim] ?? '');
    if (h) hints[dim] = h;
  }
  return {
    good_dimensions: good as FeedbackJoke['good_dimensions'],
    improve_dimensions: improve as FeedbackJoke['improve_dimensions'],
    improve_hints: hints,
  };
}
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
interface FakeJoke { joke_id: number; joke_text: string; published: boolean }
```

with:

```ts
interface FakeJoke { joke_id: number; joke_text: string; published: boolean; title?: string }
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
  processedAt?: string;
}
```

with:

```ts
  processedAt?: string;
  /** Marketing's note, stored at publish (trimmed; null when blank). */
  note?: string | null;
}

/** What the customers said about one classified joke (FeedbackJoke without id, title or sale). */
export type FakeFeedback = Pick<FeedbackJoke, 'good_dimensions' | 'improve_dimensions' | 'improve_hints'>;
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
  readonly sold = new Map<number, number>();
```

with:

```ts
  readonly sold = new Map<number, number>();
  /**
   * The feedback for a classified joke. Null (the default) reports LENGTH as
   * landed and nothing missed; tests of the feedback loop set the backend's
   * selection (testing/feedbackSim.ts).
   */
  feedbackFor: ((joke: { joke_id: number; joke_text: string }) => FakeFeedback) | null = null;
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
  newBatchId(): number { return this.nextBatchId++; }
```

with:

```ts
  newBatchId(): number { return this.nextBatchId++; }
  jokeById(id: number): FakeJoke | undefined {
    for (const b of this.batches) for (const j of b.jokes) if (j.joke_id === id) return j;
    return undefined;
  }
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
        return {
          joke_id: id, joke_title: 't', was_bought: false,
          good_dimensions: (done ? ['LENGTH'] : []) as FeedbackJoke['good_dimensions'],
          improve_dimensions: [],
        };
```

with:

```ts
        const joke = this.w.jokeById(id);
        const said: FakeFeedback = !done
          ? { good_dimensions: [], improve_dimensions: [] }
          : this.w.feedbackFor && joke
            ? this.w.feedbackFor(joke)
            : { good_dimensions: ['LENGTH'], improve_dimensions: [] };
        return { joke_id: id, joke_title: joke?.title ?? 't', was_bought: false, ...said };
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
          batch_id: b.id,
```

with:

```ts
          batch_id: b.id,
          marketing_note: b.note ?? null,
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
              joke_id: j.joke_id, joke_text: j.joke_text, joke_title: null,
```

with:

```ts
              joke_id: j.joke_id, joke_text: j.joke_text, joke_title: j.title ?? null,
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
      body.jokes.some(d => d.is_published && !(d.joke_title ?? '').trim())
```

with:

```ts
      body.jokes.some(d => d.is_published && !(d.joke_title ?? '').trim()) ||
      // real: usecase/marketing.go — a note over 500 characters (runes) is refused.
      Array.from(body.note ?? '').length > 500
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
      joke.published = d.is_published;
```

with:

```ts
      joke.published = d.is_published;
      if (d.is_published) joke.title = d.joke_title;
```

In `services/bots/testing/fakeApi.ts`, replace:

```ts
    b.processedAt = this.w.nextProcessedAt();
```

with:

```ts
    b.processedAt = this.w.nextProcessedAt();
    b.note = body.note?.trim() ? body.note.trim() : null;
```

Create `services/bots/testing/feedbackSim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../../config/dimensions';
import { directionHint, simulateFeedback } from './feedbackSim';

const IDEAL = { ...DEFAULT_IDEAL_PROFILE };

describe('simulateFeedback (a port of feedback.go)', () => {
  it('shows 3 missed and 2 landed criteria, walking the 12 from joke id mod 12, with directions on scales', () => {
    const joke = { ...IDEAL, TOPIC: 'Food', HUMOR_STYLE: 'Pun', COMPLEXITY: 'Expert', LENGTH: 'Long', TITLE_FIT: 'Strong' };
    // id 13 starts at TOPIC (index 1): fails TOPIC, HUMOR_STYLE, COMPLEXITY; then passes EDGINESS, STRUCTURE.
    expect(simulateFeedback(13, joke, IDEAL)).toEqual({
      good_dimensions: ['EDGINESS', 'STRUCTURE'],
      improve_dimensions: ['TOPIC', 'HUMOR_STYLE', 'COMPLEXITY'],
      improve_hints: { COMPLEXITY: 'LOWER' },
    });
  });

  it('backfills to 5 from the other side, and a Strong title passes', () => {
    const out = simulateFeedback(0, { ...IDEAL, TITLE_FIT: 'Strong' }, IDEAL);
    expect(out.improve_dimensions).toEqual([]);
    expect(out.good_dimensions).toEqual(['LENGTH', 'TOPIC', 'HUMOR_STYLE', 'COMPLEXITY', 'EDGINESS']);
  });

  it('gives no direction for categories, the catch-all, or a joke on the ideal', () => {
    expect(directionHint('TOPIC', 'Work', 'Food')).toBeUndefined();
    expect(directionHint('ENERGY', 'Conversational', 'None of the above')).toBeUndefined();
    expect(directionHint('LENGTH', 'Medium', 'Medium')).toBeUndefined();
    expect(directionHint('LENGTH', 'Medium', 'Short')).toBe('HIGHER');
  });
});
```

Create `services/bots/feedbackLoop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { seededRng } from '../shared/jokes';
import { traitClassification, traitFit, type TraitJoke, type Traits } from '../shared/traitCorpus';
import { loadTraitCorpus } from '../../scripts/traits/loadTraitCorpus';
import type { FeedbackJoke } from '../../types/api';
import {
  NOTE_MAX, applyFeedback, beliefScore, composeNote, emptyBelief, noteLine, parseNote, pickBatch, seededOrder,
} from './feedbackLoop';
import { simulateFeedback } from './testing/feedbackSim';

const corpus = loadTraitCorpus();
const IDEAL = { ...DEFAULT_IDEAL_PROFILE } as Traits;

const fb = (id: number, title: string, good: string[], improve: string[], hints: Record<string, string> = {}): FeedbackJoke => ({
  joke_id: id, joke_title: title, was_bought: false,
  good_dimensions: good as FeedbackJoke['good_dimensions'],
  improve_dimensions: improve as FeedbackJoke['improve_dimensions'],
  improve_hints: hints as FeedbackJoke['improve_hints'],
});

describe('the note', () => {
  it('says, per joke, what landed, what missed and which way to move, in plain words', () => {
    expect(noteLine({
      title: 'Office Memo No. 3', landed: ['TOPIC', 'LENGTH'],
      missed: [{ dim: 'HUMOR_STYLE' }, { dim: 'ENERGY', direction: 'LOWER' }],
    })).toBe('On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy: calmer.');
    expect(noteLine({ title: 'T', landed: [], missed: [{ dim: 'SETUP_PAYOFF', direction: 'HIGHER' }] }))
      .toBe('On "T": Change: Setup→Payoff. Setup→Payoff: longer build-up.');
  });

  it('reports only scored jokes it has not reported before, newest first', () => {
    const jokes = [
      fb(3, 'C', ['TOPIC'], ['LENGTH'], { LENGTH: 'LOWER' }),
      fb(2, 'B', [], []),
      fb(1, 'A', ['ENERGY'], []),
    ];
    const out = composeNote(jokes, new Set([1]));
    expect(out).toEqual({ note: 'On "C": Keep: Topic. Change: Length. Length: shorter.', reported: [3] });
    expect(composeNote(jokes, new Set([1, 3]))).toEqual({ note: '', reported: [] });
  });

  it(`stays within the backend's ${NOTE_MAX} characters, dropping whole lines`, () => {
    const all = ['LENGTH', 'TOPIC', 'HUMOR_STYLE', 'COMPLEXITY', 'EDGINESS', 'STRUCTURE'];
    const many = Array.from({ length: 8 }, (_, i) => fb(i + 1, `A long title for joke number ${i + 1}`, all, all));
    const out = composeNote(many, new Set());
    expect(Array.from(out.note).length).toBeLessThanOrEqual(NOTE_MAX);
    expect(out.reported.length).toBe(out.note.split('\n').length);
    expect(out.reported.length).toBeGreaterThan(0);
  });

  it('parses back exactly what it says, and ignores anything else', () => {
    const note = [
      'On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy: calmer.',
      'Great batch, keep going!',
      'On "Pet Report No. 9": Change: Setup→Payoff, Weather. Setup→Payoff: longer build-up. Topic: sideways.',
    ].join('\n');
    expect(parseNote(note)).toEqual([
      { title: 'Office Memo No. 3', landed: ['TOPIC', 'LENGTH'], missed: [{ dim: 'HUMOR_STYLE' }, { dim: 'ENERGY', direction: 'LOWER' }] },
      { title: 'Pet Report No. 9', landed: [], missed: [{ dim: 'SETUP_PAYOFF', direction: 'HIGHER' }] },
    ]);
    expect(parseNote(null)).toEqual([]);
    expect(parseNote('')).toEqual([]);
  });
});

describe('the Joke Maker\'s picture of what customers want', () => {
  const joke: Traits = { ...IDEAL, TOPIC: 'Food', LENGTH: 'Long', ENERGY: 'High-energy', HUMOR_STYLE: 'Pun' };

  it('keeps a landed category, avoids a missed categorical one, moves one step on a missed scale, leaves the rest', () => {
    const b = applyFeedback(emptyBelief(), joke, {
      title: 't', landed: ['HUMOR_STYLE'],
      missed: [{ dim: 'TOPIC' }, { dim: 'LENGTH', direction: 'LOWER' }, { dim: 'ENERGY', direction: 'HIGHER' }],
    });
    expect(b.want).toEqual({ HUMOR_STYLE: 'Pun', LENGTH: 'Medium', ENERGY: 'High-energy' });
    expect(b.avoid).toEqual({ TOPIC: ['Food'], LENGTH: ['Long'], ENERGY: ['High-energy'] });
  });

  it('drops a wanted category that later missed, and ignores Title Fit (it has no ideal)', () => {
    let b = applyFeedback(emptyBelief(), joke, { title: 't', landed: ['TOPIC', 'TITLE_FIT'], missed: [] });
    expect(b.want).toEqual({ TOPIC: 'Food' });
    b = applyFeedback(b, joke, { title: 't', landed: [], missed: [{ dim: 'TOPIC' }, { dim: 'TITLE_FIT' }] });
    expect(b.want).toEqual({});
    expect(b.avoid).toEqual({ TOPIC: ['Food'] });
  });

  it('a missed scale without a direction is avoided like a category', () => {
    const b = applyFeedback(emptyBelief(), joke, { title: 't', landed: [], missed: [{ dim: 'COMPLEXITY' }] });
    expect(b.want).toEqual({});
    expect(b.avoid).toEqual({ COMPLEXITY: ['Moderate'] });
  });

  it('scores a joke +1 per wanted category, +0.5 one step off a wanted scale, −1 per avoided one', () => {
    const b = { want: { TOPIC: 'Work', LENGTH: 'Medium' }, avoid: { HUMOR_STYLE: ['Pun'] } };
    expect(beliefScore(b, IDEAL)).toBe(2);
    expect(beliefScore(b, joke)).toBe(-0.5); // Long is one step off Medium, Pun is avoided
    expect(beliefScore(b, { ...IDEAL, LENGTH: 'Short' })).toBe(1.5);
  });
});

describe('pickBatch', () => {
  const order = seededOrder(corpus.jokes, seededRng('pick'));

  it('with nothing learned follows the seeded order, skipping jokes already used this round', () => {
    expect(pickBatch(corpus.jokes, order, emptyBelief(), new Set(), 3).map(j => j.id)).toEqual(order.slice(0, 3));
    expect(pickBatch(corpus.jokes, order, emptyBelief(), new Set(order.slice(0, 2)), 3).map(j => j.id)).toEqual(order.slice(2, 5));
  });

  it('takes the jokes that best match what it believes, never one already used', () => {
    const belief = { want: { TOPIC: 'Work', HUMOR_STYLE: 'Observational', STRUCTURE: 'Setup–punchline' }, avoid: {} };
    const first = pickBatch(corpus.jokes, order, belief, new Set(), 3);
    for (const j of first) expect(beliefScore(belief, j.traits)).toBe(3);
    const next = pickBatch(corpus.jokes, order, belief, new Set(first.map(j => j.id)), 3);
    expect(next.some(j => first.includes(j))).toBe(false);
  });

  it('is the same order for the same seed, a different one for another', () => {
    expect(seededOrder(corpus.jokes, seededRng('a'))).toEqual(seededOrder(corpus.jokes, seededRng('a')));
    expect(seededOrder(corpus.jokes, seededRng('a'))).not.toEqual(seededOrder(corpus.jokes, seededRng('b')));
  });

  it('refuses a batch larger than what is left', () => {
    expect(() => pickBatch(corpus.jokes, order, emptyBelief(), new Set(order.slice(2)), 3)).toThrow(RangeError);
  });
});

/**
 * The whole loop without the engine: each batch is released, the backend's
 * feedback on the team's latest 3 released jokes goes into the next release's
 * note (one batch behind, as in a class), and the Joke Maker reads it before
 * writing. Ten batches of 3, twenty seeds, against the pilot's ideal.
 */
function learningCurve(seed: string, useFeedback: boolean): number[] {
  const byTitle = new Map(corpus.jokes.map(j => [j.title, j]));
  const order = seededOrder(corpus.jokes, seededRng(seed));
  let belief = emptyBelief();
  const used = new Set<string>();
  const released: Array<{ id: number; joke: TraitJoke }> = [];
  const reported = new Set<number>();
  let note = '';
  const curve: number[] = [];
  for (let b = 0; b < 10; b++) {
    if (useFeedback) for (const e of parseNote(note)) belief = applyFeedback(belief, (byTitle.get(e.title) as TraitJoke).traits, e);
    const batch = pickBatch(corpus.jokes, order, belief, used, 3);
    for (const j of batch) used.add(j.id);
    curve.push(batch.reduce((s, j) => s + traitFit(j, DEFAULT_IDEAL_PROFILE), 0) / batch.length);
    const said = [...released].reverse().slice(0, 3).map(r => ({
      joke_id: r.id, joke_title: r.joke.title, was_bought: false,
      ...simulateFeedback(r.id, traitClassification(r.joke), DEFAULT_IDEAL_PROFILE),
    }));
    const composed = composeNote(said, reported);
    for (const id of composed.reported) reported.add(id);
    note = composed.note;
    batch.forEach((joke, k) => released.push({ id: 1000 + 10 * b + k, joke }));
  }
  return curve;
}

describe('the loop, offline', () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const seeds = Array.from({ length: 20 }, (_, i) => `loop-${i}`);
  const on = seeds.map(s => learningCurve(s, true));
  const off = seeds.map(s => learningCurve(s, false));

  it('twins write the same first two batches: feedback cannot arrive before the third', () => {
    for (let i = 0; i < seeds.length; i++) expect(on[i].slice(0, 2)).toEqual(off[i].slice(0, 2));
  });

  it('with feedback the mean fit of later batches rises well above the twin that ignores it', () => {
    const late = (cs: number[][]) => mean(cs.map(c => mean(c.slice(4))));
    expect(late(on)).toBeGreaterThan(late(off) + 2);
    expect(late(off)).toBeLessThan(mean(off.map(c => c[0])) + 1);
  });
});
```

Create `services/bots/engine.feedback.test.ts`:

```ts
// services/bots/engine.feedback.test.ts — bots that use feedback (spec 2026-11-10 §4), against the in-memory backend.
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { loadTraitCorpus } from '../../scripts/traits/loadTraitCorpus';
import { indexTraitCorpus, normalizeJokeText, traitClassification, traitFit } from '../shared/traitCorpus';
import { BotEngine, splitBlob } from './engine';
import { parseNote } from './feedbackLoop';
import type { FromWorker, StartOptions } from './protocol';
import { FakeWorld, type FakeBatch } from './testing/fakeApi';
import { simulateFeedback } from './testing/feedbackSim';

const corpus = loadTraitCorpus();
const index = indexTraitCorpus(corpus);
const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

/** A world whose customers judge corpus jokes against the pilot's ideal, as the trait classifier would. */
function setup(withCorpus = true) {
  const world = new FakeWorld();
  world.feedbackFor = joke => {
    const traits = index.byText.get(normalizeJokeText(joke.joke_text));
    return traits
      ? simulateFeedback(joke.joke_id, traitClassification(traits), DEFAULT_IDEAL_PROFILE)
      : { good_dimensions: [], improve_dimensions: [] };
  };
  const instructorId = world.addUser('Instructor', 'INSTRUCTOR');
  let clock = 0;
  const logs: string[] = [];
  const engine = new BotEngine({
    api: world.api(),
    instructorUserId: instructorId,
    delay: ms => { clock += ms; return nextTick(); },
    now: () => clock,
    emit: (m: FromWorker) => { if (m.type === 'log') logs.push(`${m.entry.teamIndex}${m.entry.seat}: ${m.entry.text}`); },
    seed: 'feedback-test',
    ...(withCorpus ? { traitCorpus: corpus } : {}),
  });
  return { world, engine, logs };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 50_000; i++) {
    if (condition()) return;
    await nextTick();
  }
  throw new Error(`timed out waiting for: ${what}`);
}

const twins = (over: Partial<StartOptions['teams'][number]> = {}): StartOptions => ({
  roundId: 1, speed: 10, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE },
  teams: [
    { index: 1, persona: 'BALANCED', useFeedback: true, releaseAll: true, ...over },
    { index: 2, persona: 'BALANCED', useFeedback: false, releaseAll: true, deckIndex: 1, ...over },
  ],
});

const teamBatches = (world: FakeWorld, teamId: number | null): FakeBatch[] => world.batches.filter(b => b.teamId === teamId);
const textsOf = (b: FakeBatch): string[] => (b.jokes.length ? b.jokes.map(j => j.joke_text) : splitBlob(b.rawText ?? ''));

describe('bots that use feedback', () => {
  it('refuses to start a useFeedback team without the trait corpus', async () => {
    const { engine } = setup(false);
    await expect(engine.start(twins())).rejects.toThrow(/traitCorpus/);
  });

  it('Marketing sends a plain-words note with each release; the Joke Maker reads it; the twin neither sends nor reads', async () => {
    const { world, engine, logs } = setup();
    await engine.start(twins());
    const [on, off] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 5 && teamBatches(world, off).length >= 5, 'five batches each');
    engine.stop();

    const notes = teamBatches(world, on).map(b => b.note).filter((n): n is string => !!n);
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note).toMatch(/^On "[^"]+": (Keep|Change): /);
      expect(parseNote(note).length).toBeGreaterThan(0);
    }
    expect(teamBatches(world, off).every(b => !b.note)).toBe(true);
    expect(logs.some(l => l.startsWith('1A: read Marketing\'s note'))).toBe(true);
    expect(logs.some(l => l.startsWith('2A: read Marketing\'s note'))).toBe(false);
    expect(logs.some(l => l.startsWith('1B: note to the Joke Maker: On "'))).toBe(true);
  });

  it('twins draw the same starting jokes, only corpus jokes, never one twice in a round', async () => {
    const { world, engine } = setup();
    await engine.start(twins());
    const [on, off] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 4 && teamBatches(world, off).length >= 4, 'four batches each');
    engine.stop();
    expect(textsOf(teamBatches(world, on)[0])).toEqual(textsOf(teamBatches(world, off)[0]));
    for (const team of [on, off]) {
      const texts = teamBatches(world, team).flatMap(textsOf);
      expect(texts.every(t => index.byText.has(normalizeJokeText(t)))).toBe(true);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('titles each corpus joke with its corpus title, and releaseAll publishes every joke', async () => {
    const { world, engine } = setup();
    await engine.start(twins());
    await until(() => world.decisions.length >= 4, 'four decisions');
    engine.stop();
    for (const d of world.decisions) expect(d.published).toBe(d.total);
    const published = world.batches.flatMap(b => b.jokes).filter(j => j.published);
    expect(published.length).toBeGreaterThan(0);
    for (const j of published) expect(j.title).toBe(index.byText.get(normalizeJokeText(j.joke_text))?.title);
  });

  it('the feedback team\'s later batches fit the hidden ideal better than its twin\'s', async () => {
    const { world, engine } = setup();
    await engine.start(twins());
    const [on, off] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 8 && teamBatches(world, off).length >= 8, 'eight batches each');
    engine.stop();
    const fitOf = (b: FakeBatch) => {
      const fits = textsOf(b).map(t => traitFit(index.byText.get(normalizeJokeText(t))!, DEFAULT_IDEAL_PROFILE));
      return fits.reduce((a, x) => a + x, 0) / fits.length;
    };
    const late = (team: number | null) => teamBatches(world, team).slice(4, 8).map(fitOf).reduce((a, x) => a + x, 0) / 4;
    expect(late(on)).toBeGreaterThan(late(off) + 1);
  });

  it('a Round 2 batch size per team overrides the persona\'s, capped at the round\'s batch_size', async () => {
    const { world, engine } = setup();
    world.round = { ...world.round, round_number: 2, batch_size: 10, max_batch_size: 10 };
    await engine.start(twins({ round2BatchSize: 3 }));
    const [on] = engine.status().teams.map(t => t.teamId);
    await until(() => teamBatches(world, on).length >= 2, 'two batches');
    engine.stop();
    for (const b of teamBatches(world, on)) expect(textsOf(b)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/bots`
Expected: FAIL — `feedbackLoop.test.ts` and `engine.feedback.test.ts` cannot import `./feedbackLoop`; `feedbackSim.test.ts` and the existing engine tests pass (the fake's default feedback is unchanged).

- [ ] **Step 3: Implement the feedback loop and the engine options**

Create `services/bots/feedbackLoop.ts`:

```ts
// services/bots/feedbackLoop.ts
/**
 * Bots that use feedback (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §4).
 *
 * Pure, so the engine and the tests share it:
 *   - Marketing turns the team's customer feedback (the endpoint and fields its
 *     screen reads: landed, missed, direction hints) into a plain-words note,
 *     one line per joke, named by its title:
 *       On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy: calmer.
 *   - The Joke Maker parses its team's latest note and updates its picture of
 *     what customers want (a Belief): a landed criterion keeps that joke's
 *     category; a missed categorical one (or an ordered one without a
 *     direction) avoids it; a missed ordered one with a direction moves one
 *     step that way from the joke's category; criteria nobody mentioned stay.
 *   - Its next batch is the trait-corpus jokes that best match the belief,
 *     ties broken by the team's seeded order, never a joke already used this
 *     round. With an empty belief that is exactly the seeded order, which is
 *     how a feedback-off twin always picks.
 *
 * A bot knows its own jokes' traits (by title, from the trait corpus) and
 * nothing else: never the ideal, never a fit score.
 */
import { DIMENSIONS, IDEAL_DIMENSIONS, dimById, isCatchAll, type IdealDimension } from '../../config/dimensions';
import { DIRECTION_WORDS } from '../../views/feedback';
import type { FeedbackJoke } from '../../types/api';
import type { TraitJoke, Traits } from '../shared/traitCorpus';

/** The backend refuses a publish note over 500 characters (runes). */
export const NOTE_MAX = 500;

export type Direction = 'LOWER' | 'HIGHER';

/** One joke's line in a note. */
export interface NoteEntry {
  title: string;
  /** Dimension ids that landed. */
  landed: string[];
  /** Dimension ids that missed, with the direction when the note gives one. */
  missed: Array<{ dim: string; direction?: Direction }>;
}

const labelOf = (id: string): string => dimById(id)?.label ?? id;
const byLabel = new Map(DIMENSIONS.map(d => [d.label, d.id as string]));

/** The note line for one joke: `On "<title>": Keep: A, B. Change: C. C: shorter.` */
export function noteLine(e: NoteEntry): string {
  const parts: string[] = [];
  if (e.landed.length) parts.push(`Keep: ${e.landed.map(labelOf).join(', ')}.`);
  if (e.missed.length) parts.push(`Change: ${e.missed.map(m => labelOf(m.dim)).join(', ')}.`);
  for (const m of e.missed) {
    const word = m.direction ? DIRECTION_WORDS[m.dim]?.[m.direction] : undefined;
    if (word) parts.push(`${labelOf(m.dim)}: ${word}.`);
  }
  return `On "${e.title}": ${parts.join(' ')}`;
}

/**
 * Marketing's note from its team's feedback: one line per joke that has been
 * scored (it has landed or missed criteria) and is not in `reported`, newest
 * first as the feedback lists them, kept under NOTE_MAX. Returns the note ("" when
 * there is nothing new) and the joke ids it reported.
 */
export function composeNote(
  jokes: readonly FeedbackJoke[], reported: ReadonlySet<number>,
): { note: string; reported: number[] } {
  const lines: string[] = [];
  const ids: number[] = [];
  for (const j of jokes) {
    if (reported.has(j.joke_id) || j.good_dimensions.length + j.improve_dimensions.length === 0) continue;
    const hints = (j.improve_hints ?? {}) as Partial<Record<string, string>>;
    const line = noteLine({
      title: j.joke_title,
      landed: [...j.good_dimensions],
      missed: j.improve_dimensions.map(dim => {
        const h = hints[dim];
        return h === 'LOWER' || h === 'HIGHER' ? { dim, direction: h } : { dim };
      }),
    });
    if (Array.from([...lines, line].join('\n')).length > NOTE_MAX) break;
    lines.push(line);
    ids.push(j.joke_id);
  }
  return { note: lines.join('\n'), reported: ids };
}

const LINE = /^On "(.+)": (.*)$/;

/** The entries of a note, one per `On "<title>": …` line; anything else is ignored. */
export function parseNote(note: string | null | undefined): NoteEntry[] {
  const out: NoteEntry[] = [];
  for (const raw of (note ?? '').split('\n')) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const entry: NoteEntry = { title: m[1], landed: [], missed: [] };
    const directions = new Map<string, Direction>();
    for (const sentence of m[2].split(/\.(?:\s+|$)/).map(s => s.trim()).filter(Boolean)) {
      const colon = sentence.indexOf(': ');
      if (colon < 0) continue;
      const head = sentence.slice(0, colon);
      const tail = sentence.slice(colon + 2);
      if (head === 'Keep' || head === 'Change') {
        const ids = tail.split(', ').map(l => byLabel.get(l)).filter((id): id is string => id != null);
        if (head === 'Keep') entry.landed.push(...ids);
        else entry.missed.push(...ids.map(dim => ({ dim })));
        continue;
      }
      const dim = byLabel.get(head);
      const words = dim ? DIRECTION_WORDS[dim] : undefined;
      if (dim && words) {
        if (words.LOWER === tail) directions.set(dim, 'LOWER');
        else if (words.HIGHER === tail) directions.set(dim, 'HIGHER');
      }
    }
    entry.missed = entry.missed.map(x => (directions.has(x.dim) ? { ...x, direction: directions.get(x.dim) } : x));
    out.push(entry);
  }
  return out;
}

/** The Joke Maker's picture of what customers want, per matched criterion. */
export interface Belief {
  /** The category it aims for. */
  want: Partial<Record<IdealDimension, string>>;
  /** Categories it has seen miss. */
  avoid: Partial<Record<IdealDimension, string[]>>;
}

export const emptyBelief = (): Belief => ({ want: {}, avoid: {} });

const IDEAL_IDS = new Set<string>(IDEAL_DIMENSIONS.map(d => d.id));

/** The category one step from `cat` on dim's ordered scale, never the catch-all; `cat` itself at an end. */
function step(dim: IdealDimension, cat: string, direction: Direction): string {
  const scale = (dimById(dim)?.categories ?? []).filter(c => !isCatchAll(c));
  const i = scale.indexOf(cat);
  if (i < 0) return cat;
  return scale[Math.max(0, Math.min(scale.length - 1, i + (direction === 'LOWER' ? -1 : 1)))];
}

/** The belief after one joke's feedback, given that joke's traits. Title Fit is ignored (it has no ideal). */
export function applyFeedback(belief: Belief, traits: Traits, entry: NoteEntry): Belief {
  const want = { ...belief.want };
  const avoid: Belief['avoid'] = { ...belief.avoid };
  for (const id of entry.landed) {
    if (!IDEAL_IDS.has(id)) continue;
    const dim = id as IdealDimension;
    want[dim] = traits[dim];
    const left = (avoid[dim] ?? []).filter(c => c !== traits[dim]);
    if (left.length > 0) avoid[dim] = left;
    else delete avoid[dim];
  }
  for (const { dim: id, direction } of entry.missed) {
    if (!IDEAL_IDS.has(id)) continue;
    const dim = id as IdealDimension;
    const cat = traits[dim];
    avoid[dim] = [...new Set([...(avoid[dim] ?? []), cat])];
    const ordered = dimById(dim)?.scoring === 'ordinal';
    if (ordered && direction) want[dim] = step(dim, cat, direction);
    else if (want[dim] === cat) delete want[dim];
  }
  return { want, avoid };
}

/** How well a joke matches the belief: +1 per wanted category, +0.5 for one step off on an ordered scale, −1 per avoided one. */
export function beliefScore(belief: Belief, traits: Traits): number {
  let score = 0;
  for (const d of IDEAL_DIMENSIONS) {
    const dim = d.id as IdealDimension;
    const cat = traits[dim];
    const want = belief.want[dim];
    if (want !== undefined) {
      if (cat === want) score += 1;
      else if (d.scoring === 'ordinal' && Math.abs(d.categories.indexOf(cat) - d.categories.indexOf(want)) === 1) score += 0.5;
    }
    if (belief.avoid[dim]?.includes(cat)) score -= 1;
  }
  return score;
}

/** How many criteria the belief aims at (for the reasoning log). */
export const beliefSize = (b: Belief): number => Object.keys(b.want).length;

/** A seeded shuffle of the corpus ids: the order a team falls back on (and a feedback-off team always uses). */
export function seededOrder(corpus: readonly TraitJoke[], rand: () => number): string[] {
  const ids = corpus.map(j => j.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const k = Math.floor(rand() * (i + 1));
    [ids[i], ids[k]] = [ids[k], ids[i]];
  }
  return ids;
}

/**
 * The next batch: the `size` unused corpus jokes that best match the belief,
 * ties in `order`. Throws when the corpus has fewer unused jokes than `size`.
 */
export function pickBatch(
  corpus: readonly TraitJoke[], order: readonly string[], belief: Belief, used: ReadonlySet<string>, size: number,
): TraitJoke[] {
  const byId = new Map(corpus.map(j => [j.id, j]));
  const candidates = order.filter(id => !used.has(id)).map(id => byId.get(id) as TraitJoke);
  if (candidates.length < size) throw new RangeError(`only ${candidates.length} unused corpus jokes for a batch of ${size}`);
  const rank = new Map(order.map((id, i) => [id, i]));
  return candidates
    .map(j => ({ j, score: beliefScore(belief, j.traits) }))
    .sort((a, b) => b.score - a.score || (rank.get(a.j.id) as number) - (rank.get(b.j.id) as number))
    .slice(0, size)
    .map(x => x.j);
}
```

In `services/bots/protocol.ts`, replace:

```ts
  deckIndex?: number;
```

with:

```ts
  deckIndex?: number;
  /**
   * Pilot-only (spec 2026-11-10 §4): the team writes trait-corpus jokes
   * (EngineDeps.traitCorpus). true: Marketing sends a note built from the
   * team's customer feedback with each release, and the Joke Maker picks its
   * next batch by what the latest note says. false: the twin that ignores
   * feedback (no note; it picks by its seed only). Absent: the ordinary deck.
   * The Bot players panel never sets it.
   */
  useFeedback?: boolean;
  /** Pilot-only: the batch size from round 2 on (capped at the round's batch_size) instead of the persona's. */
  round2BatchSize?: number;
  /** Pilot-only: Marketing releases every joke of each batch; the persona still sets the pace. */
  releaseAll?: boolean;
```

In `services/bots/engine.ts`, replace:

```ts
import { asRawBlob, seededRng, titleFor, variedCorpus, type JokeFixture } from '../shared/jokes';
```

with:

```ts
import { asRawBlob, seededRng, titleFor, variedCorpus, type JokeFixture } from '../shared/jokes';
import { indexTraitCorpus, normalizeJokeText, type TraitCorpus, type TraitIndex, type TraitJoke } from '../shared/traitCorpus';
import {
  applyFeedback, beliefSize, composeNote, emptyBelief, parseNote, pickBatch, seededOrder, type Belief,
} from './feedbackLoop';
```

In `services/bots/engine.ts`, replace:

```ts
  emit: (message: FromWorker) => void;
  seed: string;
}
```

with:

```ts
  emit: (message: FromWorker) => void;
  seed: string;
  /**
   * The trait corpus (scripts/traits/loadTraitCorpus.ts), for teams with
   * BotTeamSpec.useFeedback set. Only the pilot gives it; the browser worker never does.
   */
  traitCorpus?: TraitCorpus;
}
```

In `services/bots/engine.ts`, replace:

```ts
  deckIndex: number;
```

with:

```ts
  deckIndex: number;
  /** BotTeamSpec.useFeedback: undefined plays the ordinary deck. */
  useFeedback: boolean | undefined;
  /** BotTeamSpec.round2BatchSize, else the persona's. */
  round2BatchSize: number | undefined;
  /** BotTeamSpec.releaseAll. */
  releaseAll: boolean;
  /** Trait teams' Joke Maker, per round id. */
  traitRounds: Map<number, TraitRound>;
  /** Trait teams' Marketing: joke ids already reported in a note. */
  reportedJokeIds: Set<number>;
}

/**
 * A trait team's Joke Maker in one round. Its picture of what customers want
 * starts empty each round (a new round can have a new ideal), and no corpus
 * joke is written twice in a round.
 */
interface TraitRound {
  belief: Belief;
  /** The seeded order of corpus ids it falls back on. */
  order: string[];
  /** Corpus ids sent this round. */
  used: Set<string>;
  /** Titles of the jokes sent this round: a note line about any other title is not about our jokes. */
  sent: Set<string>;
  /** Titles whose feedback is already in the belief. */
  applied: Set<string>;
```

In `services/bots/engine.ts`, replace:

```ts
    memory: new Map(), marketingHoldMs: Math.max(0, spec.marketingHoldMs ?? 0), deckIndex: spec.deckIndex ?? spec.index,
```

with:

```ts
    memory: new Map(), marketingHoldMs: Math.max(0, spec.marketingHoldMs ?? 0), deckIndex: spec.deckIndex ?? spec.index,
    useFeedback: spec.useFeedback, round2BatchSize: spec.round2BatchSize, releaseAll: spec.releaseAll === true,
    traitRounds: new Map(), reportedJokeIds: new Set(),
```

In `services/bots/engine.ts`, replace:

```ts
  private readonly history = new Map<number, ReasoningEntry[]>();
```

with:

```ts
  private readonly history = new Map<number, ReasoningEntry[]>();
  private traitIndexCache: TraitIndex | null = null;
```

In `services/bots/engine.ts`, replace:

```ts
    if (options.teams.length > maxTeams) throw new Error(`At most ${maxTeams} bot teams.`);
```

with:

```ts
    if (options.teams.length > maxTeams) throw new Error(`At most ${maxTeams} bot teams.`);
    if (options.teams.some(t => t.useFeedback !== undefined) && !this.deps.traitCorpus) {
      throw new Error('Teams with useFeedback write trait-corpus jokes: start the engine with deps.traitCorpus.');
    }
```

In `services/bots/engine.ts`, replace:

```ts
        // size applies only from round 2, capped at that round's batch_size.
        const size = round.round_number >= 2
          ? Math.min(persona.round2BatchSize, round.batch_size)
          : round.batch_size;
        let jokes: JokeFixture[];
        if (persona.learns) {
```

with:

```ts
        // size (or the team's pilot override) applies only from round 2,
        // capped at that round's batch_size.
        const size = round.round_number >= 2
          ? Math.min(team.round2BatchSize ?? persona.round2BatchSize, round.batch_size)
          : round.batch_size;
        let jokes: Array<Pick<JokeFixture, 'id' | 'text'>>;
        let traitJokes: TraitJoke[] = [];
        if (team.useFeedback !== undefined) {
          traitJokes = await this.drawTraitBatch(me, team, round, size, signal);
          if (signal.aborted) break;
          jokes = traitJokes;
        } else if (persona.learns) {
```

In `services/bots/engine.ts`, replace:

```ts
        await me.submitBatch(round.id, { team_id: team.teamId as number, raw_text: asRawBlob(jokes) });
        // A batch in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
```

with:

```ts
        await me.submitBatch(round.id, { team_id: team.teamId as number, raw_text: asRawBlob(jokes.map(j => j.text)) });
        // A batch in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
        const traitRound = team.traitRounds.get(round.id);
        for (const j of traitJokes) {
          traitRound?.used.add(j.id);
          traitRound?.sent.add(j.title);
        }
```

In `services/bots/engine.ts`, replace:

```ts
  }

  /**
   * Careful only: hold the next batch until this round's last one is published
```

with:

```ts
  }

  /** The trait corpus by text and by title (built on first use). */
  private traitIndex(): TraitIndex | null {
    if (!this.traitIndexCache && this.deps.traitCorpus) this.traitIndexCache = indexTraitCorpus(this.deps.traitCorpus);
    return this.traitIndexCache;
  }

  /** The trait corpus title of a joke text, when it is a corpus joke. */
  private traitTitle(text: string): string | undefined {
    return this.traitIndex()?.byText.get(normalizeJokeText(text))?.title;
  }

  private traitRound(team: TeamRuntime, round: PublicRound): TraitRound {
    let state = team.traitRounds.get(round.id);
    if (!state) {
      const corpus = (this.deps.traitCorpus as TraitCorpus).jokes;
      // Seeded by the deck index and the round number, so twins draw alike and Round 2 is a new order.
      const order = seededOrder(corpus, seededRng(`${this.deps.seed}:traits:${team.deckIndex}:${round.round_number}`));
      state = { belief: emptyBelief(), order, used: new Set(), sent: new Set(), applied: new Set() };
      team.traitRounds.set(round.id, state);
    }
    return state;
  }

  /**
   * A trait team's next batch. With feedback on, the Joke Maker first reads
   * the latest note from Marketing on its own team's batch list (the field its
   * screen shows) and folds in each line about a joke it sent this round, once.
   * Then it takes the unused corpus jokes that best fit its picture; with
   * feedback off (or nothing learned yet) that is its seeded order.
   */
  private async drawTraitBatch(
    me: BotApi, team: TeamRuntime, round: PublicRound, size: number, signal: AbortSignal,
  ): Promise<TraitJoke[]> {
    const state = this.traitRound(team, round);
    if (team.useFeedback && team.teamId != null) {
      const batches = (await me.teamBatches(round.id, team.teamId)).batches ?? [];
      if (signal.aborted) return [];
      const latest = batches
        .filter(b => b.marketing_note && b.processed_at && !Number.isNaN(Date.parse(b.processed_at)))
        .sort((a, b) => Date.parse(b.processed_at as string) - Date.parse(a.processed_at as string))[0];
      const index = this.traitIndex() as TraitIndex;
      let applied = 0;
      for (const entry of parseNote(latest?.marketing_note)) {
        const joke = index.byTitle.get(entry.title);
        if (!joke || !state.sent.has(entry.title) || state.applied.has(entry.title)) continue;
        state.belief = applyFeedback(state.belief, joke.traits, entry);
        state.applied.add(entry.title);
        applied++;
      }
      if (applied > 0) {
        this.log(team, team.jm, `read Marketing's note on ${applied} joke(s): now aiming at ${beliefSize(state.belief)} criteria`, signal);
      }
    }
    return pickBatch((this.deps.traitCorpus as TraitCorpus).jokes, state.order, state.belief, state.used, size);
  }

  /**
   * Careful only: hold the next batch until this round's last one is published
```

In `services/bots/engine.ts`, replace:

```ts
        const keep = persona.learns
          ? chooseWithMemory(jokes, team.memory, count, rand, round.round_number)
          : choosePublished(jokes.map(j => j.joke_id), count, rand);
        const kept = jokes.filter(j => keep.has(j.joke_id)).map(j => `"${titleOf(j.joke_text)}"`);
```

with:

```ts
        const chosen = persona.learns
          ? chooseWithMemory(jokes, team.memory, count, rand, round.round_number)
          : choosePublished(jokes.map(j => j.joke_id), count, rand);
        const keep = team.releaseAll ? new Set(jokes.map(j => j.joke_id)) : chosen;
        const title = (text: string) => this.traitTitle(text) ?? titleOf(text);
        const kept = jokes.filter(j => keep.has(j.joke_id)).map(j => `"${title(j.joke_text)}"`);
```

In `services/bots/engine.ts`, replace:

```ts
        await me.marketingPublish(batch.batch_id, {
          jokes: jokes.map(j => ({ joke_id: j.joke_id, joke_title: titleOf(j.joke_text), is_published: keep.has(j.joke_id) })),
        });
        // A publish in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
```

with:

```ts
        // Feedback on: what customers said about the jokes released so far, in
        // plain words, goes to the Joke Maker with this release.
        let note = { note: '', reported: [] as number[] };
        if (team.useFeedback && team.teamId != null) {
          note = composeNote((await me.teamFeedback(round.id, team.teamId)).jokes, team.reportedJokeIds);
          if (signal.aborted) break;
          if (this.scrambled) continue;
        }
        await me.marketingPublish(batch.batch_id, {
          jokes: jokes.map(j => ({ joke_id: j.joke_id, joke_title: title(j.joke_text), is_published: keep.has(j.joke_id) })),
          ...(note.note ? { note: note.note } : {}),
        });
        // A publish in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
        for (const id of note.reported) team.reportedJokeIds.add(id);
        if (note.note) this.log(team, seat, `note to the Joke Maker: ${note.note.replace(/\n/g, ' / ')}`, signal);
```

- [ ] **Step 4: Run the tests and the gates**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/bots`
Expected: PASS — including "the feedback team's later batches fit the hidden ideal better than its twin's" and, offline, "with feedback the mean fit of later batches rises well above the twin that ignores it".

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent; every test file passes; `✓ built` (the worker never loads the corpus: it comes in through `EngineDeps`).

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add services/bots/feedbackLoop.ts services/bots/feedbackLoop.test.ts services/bots/engine.ts services/bots/engine.feedback.test.ts services/bots/protocol.ts services/bots/testing/fakeApi.ts services/bots/testing/feedbackSim.ts services/bots/testing/feedbackSim.test.ts && git commit -q -F - <<'EOF'
feat(bots): Marketing sends a plain-words note, the Joke Maker writes from it

Pilot-only per-team options: useFeedback (trait-corpus jokes; notes sent
and read when true), round2BatchSize and releaseAll.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 7: Frontend — the feedback pilot and the cost sweep

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `scripts/pilot/feedbackReport.ts`, `scripts/pilot/feedbackClass.ts`, `scripts/pilot/feedback-pilot.mts`, `scripts/pilot/cost-sweep.mts`
- Test: create `scripts/pilot/feedbackReport.test.ts`

**Interfaces:**
- Consumes: Task 6's `BotEngine` with `traitCorpus`, `BotTeamSpec.useFeedback/round2BatchSize/releaseAll`; Task 2's `loadTraitCorpus`, `indexTraitCorpus`, `traitFit`, `normalizeJokeText`; `leanFeesOf`; `isLocalUrl` (`scripts/pilot/report.ts`); `createClient` (`services/shared/client.ts`).
- Produces:
  ```ts
  // scripts/pilot/feedbackReport.ts (pure)
  export type GroupId = 'SMALL_ON' | 'SMALL_OFF' | 'LARGE_ON' | 'LARGE_OFF'; export const GROUPS;
  export const CUSTOMERS_BAR = 8, RISE = 0.5, PROFIT_SHARE_MIN = 0.45; export const FEE_SHARE_RANGE = [0.4, 0.6];
  export function classTeams(perGroup = 5): ClassTeam[];                    // 20 Balanced teams, twins share deckIndex
  export interface Costs { listing: number; hosting: number }
  export function pilotConfig(costs: Costs, speed: number, windowS: number, round: 1 | 2): ConfigRequest; // hosting × speed
  export function batchFits(batches, index: TraitIndex, ideal: IdealProfile, bar?): BatchFit[];
  export function teamRowFrom(r, group, prices, chartBatches, batches: BatchFit[]): TeamRow;
  export function summariseGroup(rows: readonly TeamRow[]): GroupSummary;
  export function successChecks(classes: readonly ClassResult[]): Check[];   // the five checks of spec §5
  export function markdown(side: PilotSidecar): string;
  export const SWEEP_LISTING = [0.1, 0.25, 0.5], SWEEP_HOSTING = [0.05, 0.1, 0.2];
  export function sweepCost(c: Costs): number;                              // listing + 15 × hosting
  export function chooseDefaults(settings: readonly SweepSetting[]): Costs | null; // cheapest passing 2, 3, 5
  export function sweepMarkdown(side: SweepSidecar): string;
  export function parsePilotEnv(env, now?): PilotEnv; export function settingsLines(e: PilotEnv, speed: number): string[];
  // scripts/pilot/feedbackClass.ts (Node, network)
  export const SPEED = 10; export async function runFeedbackClass(o: ClassOptions): Promise<ClassResult>;
  export async function runSetting(base, env: PilotEnv, costs: Costs, date: string): Promise<PilotSidecar>;
  ```
  Runners: `npx tsx scripts/pilot/feedback-pilot.mts [out.md]` (one setting, `PILOT_LISTING`/`PILOT_HOSTING`), `npx tsx scripts/pilot/cost-sweep.mts [out.md]` (the 3 × 3 grid); both write a JSON sidecar beside the markdown, refuse a non-local backend unless `PILOT_ALLOW_REMOTE=1`, and re-render from a sidecar with `PILOT_RENDER_ONLY=<sidecar>`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/pilot/feedbackReport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { indexTraitCorpus, traitFit } from '../../services/shared/traitCorpus';
import { loadTraitCorpus } from '../traits/loadTraitCorpus';
import {
  CUSTOMERS_BAR, GROUPS, batchFits, chooseDefaults, classTeams, markdown, parsePilotEnv, pilotConfig, successChecks,
  summariseGroup, sweepCost, sweepMarkdown, teamRowFrom,
  type BatchFit, type ClassResult, type Costs, type GroupId, type PilotSidecar, type TeamRow,
} from './feedbackReport';

const corpus = loadTraitCorpus();
const index = indexTraitCorpus(corpus);

describe('classTeams', () => {
  it('is 20 Balanced teams, 5 per group, every no-feedback team the twin of a feedback team', () => {
    const teams = classTeams();
    expect(teams).toHaveLength(20);
    expect(teams.map(t => t.index)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const g of GROUPS) expect(teams.filter(t => t.group === g.id)).toHaveLength(5);
    for (const t of teams) {
      expect(t).toMatchObject({ persona: 'BALANCED', releaseAll: true });
      expect(t.round2BatchSize).toBe(t.group.startsWith('SMALL') ? 3 : 10);
      expect(t.useFeedback).toBe(t.group.endsWith('_ON'));
    }
    for (const off of teams.filter(t => !t.useFeedback)) {
      const twin = teams.find(t => t.index === off.deckIndex);
      expect(twin?.useFeedback).toBe(true);
      expect(twin?.round2BatchSize).toBe(off.round2BatchSize);
    }
  });
});

describe('pilotConfig', () => {
  it('charges the two costs only: listing unscaled, hosting × speed; batches of 5, then up to 10', () => {
    expect(pilotConfig({ listing: 0.25, hosting: 0.05 }, 10, 90, 1)).toEqual({
      market_mode: 'LEAN', arrival_window_seconds: 90, wip_limit: 0, batch_size: 5,
      cost_of_publishing: 0.25, cost_of_discard: 0, hosting_fee_per_joke_minute: 0.5,
      shipping_fee_small: 0, shipping_fee_standard: 0, shipping_fee_large: 0, storage_fee_per_joke_minute: 0,
    });
    expect(pilotConfig({ listing: 0.1, hosting: 0.2 }, 10, 90, 2)).toMatchObject({ batch_size: 10, hosting_fee_per_joke_minute: 2 });
  });
});

describe('batchFits', () => {
  const good = corpus.jokes.find(j => traitFit(j, DEFAULT_IDEAL_PROFILE) >= CUSTOMERS_BAR)!;
  const bad = corpus.jokes.find(j => traitFit(j, DEFAULT_IDEAL_PROFILE) < 6)!;
  it('scores each batch\'s released corpus jokes in send order, and marks the batches that clear the bar', () => {
    const fits = batchFits([
      { batch_id: 9, submitted_at: '2026-11-10T10:02:00Z', jokes: [{ joke_text: good.text, publish_status: 'PUBLISHED' }, { joke_text: bad.text, publish_status: 'PUBLISHED' }] },
      { batch_id: 4, submitted_at: '2026-11-10T10:01:00Z', jokes: [{ joke_text: bad.text, publish_status: 'PUBLISHED' }, { joke_text: good.text, publish_status: 'DISCARDED' }] },
      { batch_id: 11, submitted_at: '2026-11-10T10:03:00Z', jokes: null },
      { batch_id: 12, submitted_at: '2026-11-10T10:04:00Z', jokes: [{ joke_text: 'not a corpus joke', publish_status: 'PUBLISHED' }] },
    ], index, DEFAULT_IDEAL_PROFILE);
    const fb = traitFit(bad, DEFAULT_IDEAL_PROFILE);
    const fg = traitFit(good, DEFAULT_IDEAL_PROFILE);
    expect(fits).toEqual([
      { seq: 1, released: 1, meanFit: fb, aboveBar: 0, cleared: false },
      { seq: 2, released: 2, meanFit: (fb + fg) / 2, aboveBar: 1, cleared: true },
      { seq: 3, released: 0, meanFit: null, aboveBar: 0, cleared: false },
      { seq: 4, released: 0, meanFit: null, aboveBar: 0, cleared: false },
    ]);
  });
});

describe('teamRowFrom', () => {
  it('prices listing at the round, reads hosting from the Lean stats, averages send → first sale over sold batches', () => {
    const row = teamRowFrom(
      {
        team: { id: 7 }, total_sales: 12, published_jokes: 20, discarded_jokes: 0, profit: 5.5,
        lean: { batches_submitted: 4, setup_cost: 0, carrying_cost: 4.5, shipping_cost: 0, storage_cost: 0, hosting_cost: 4.5, avg_submit_to_publish_s: 0, avg_publish_to_first_sale_s: 0, batch_series: [] },
      },
      'SMALL_ON', { market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0 },
      [{ first_sale_s: 60 }, { first_sale_s: null }, { first_sale_s: 120 }], [],
    );
    expect(row).toMatchObject({ teamId: 7, group: 'SMALL_ON', revenue: 12, listing: 2, hosting: 4.5, otherFees: 0, profit: 5.5, sendToFirstSaleS: 90 });
  });
});

/* ---- Synthetic classes for the checks ------------------------------------ */

const batch = (seq: number, meanFit: number | null, cleared = false): BatchFit => ({
  seq, released: meanFit == null ? 0 : 3, meanFit, aboveBar: cleared ? 1 : 0, cleared,
});
const team = (group: GroupId, profit: number, fits: Array<number | null>, clearAt: number | null, over: Partial<TeamRow> = {}): TeamRow => ({
  teamId: 1, group, revenue: 20, listing: 2, hosting: 4, otherFees: 0, profit, sales: 20,
  batches: fits.map((f, i) => batch(i + 1, f, clearAt === i + 1)), sendToFirstSaleS: 60, ...over,
});

/** A class where feedback works, gradually, and pays most for small batches. */
function goodClass(): ClassResult {
  const r1 = GROUPS.map(g => team(g.id, 5, [5, 5, 5], null, { revenue: 20, listing: 4, hosting: 6 }));
  const r2 = [
    team('SMALL_ON', 30, [5, 5, 7, 9, 10], 4), team('SMALL_OFF', -4, [5, 5, 5, 5, 5], null),
    team('LARGE_ON', 6, [5, 5, 6, 7], 3), team('LARGE_OFF', 3, [5, 5, 5, 5], null),
  ];
  return { classNo: 1, seed: 's-c1', rounds: [{ round: 1, durationS: 94, rows: r1 }, { round: 2, durationS: 94, rows: r2 }] };
}

describe('successChecks', () => {
  it('passes all five on a class where feedback works, gradually, and pays most for small batches', () => {
    expect(successChecks([goodClass()]).map(c => [c.id, c.pass])).toEqual([[1, true], [2, true], [3, true], [4, true], [5, true]]);
  });

  it('fails check 1 when the no-feedback twins rise too, or the feedback teams do not', () => {
    const c = goodClass();
    c.rounds[1].rows[1] = team('SMALL_OFF', -4, [5, 7], null);
    expect(successChecks([c])[0].pass).toBe(false);
  });

  it('fails checks 2 and 3 when the twins earn more, and when large batches gain more', () => {
    const c = goodClass();
    c.rounds[1].rows[0] = team('SMALL_ON', -10, [5, 5, 7, 9], 4);
    const checks = successChecks([c]);
    expect(checks[1].pass).toBe(false);
    expect(checks[2].pass).toBe(false);
    expect(checks[2].detail).toContain('small -$6.00, large $3.00');
  });

  it('fails check 4 when feedback solves it in one or two batches, or never', () => {
    const fast = goodClass();
    fast.rounds[1].rows[0] = team('SMALL_ON', 30, [9, 10], 1);
    fast.rounds[1].rows[2] = team('LARGE_ON', 6, [5, 9], 2);
    expect(successChecks([fast])[3].pass).toBe(false);
    const never = goodClass();
    never.rounds[1].rows[0] = team('SMALL_ON', 30, [5, 5], null);
    never.rounds[1].rows[2] = team('LARGE_ON', 6, [5, 5], null);
    expect(successChecks([never])[3]).toMatchObject({ pass: false, detail: expect.stringContaining('no feedback team cleared') });
  });

  it('fails check 5 when fewer than about half finish Round 2 in profit, or Round 1 fees are outside 40–60 % of revenue', () => {
    const losing = goodClass();
    losing.rounds[1].rows = losing.rounds[1].rows.map((r, i) => (i === 0 ? r : { ...r, profit: -1 }));
    expect(successChecks([losing])[4].pass).toBe(false);
    const cheap = goodClass();
    cheap.rounds[0].rows = cheap.rounds[0].rows.map(r => ({ ...r, listing: 1, hosting: 1 }));
    expect(successChecks([cheap])[4]).toMatchObject({ pass: false, detail: expect.stringContaining('10 % of revenue') });
  });
});

describe('summariseGroup', () => {
  it('gives the learning curve by batch number, batches to clear, and the share of released jokes over the bar', () => {
    const s = summariseGroup([team('SMALL_ON', 10, [5, 7, 9], 3), team('SMALL_ON', 20, [6, 8], 2)]);
    expect(s.curve).toEqual([5.5, 7.5, 9]);
    expect(s.batchesToClear).toBe(2.5);
    expect(s.shareAboveBar).toBeCloseTo(2 / 15);
    expect(s.profit).toBe(15);
  });
});

const sidecar = (costs: Costs, cls = goodClass()): PilotSidecar => ({
  date: '2026-11-10', costs, settings: ['One class.'], classes: [cls], errors: [],
});

describe('markdown', () => {
  it('leads with the five checks, then each round\'s groups and learning curves', () => {
    const md = markdown(sidecar({ listing: 0.1, hosting: 0.05 }));
    expect(md).toContain('# Feedback pilot — listing $0.10, hosting $0.05 per joke-minute — 2026-11-10');
    expect(md.match(/^- \*\*PASS\*\* — [1-5]\./gm)).toHaveLength(5);
    for (const h of ['## Settings', '## Round 1', '## Round 2', '| Small + feedback |', '| Large, no feedback |', '| B5 |']) {
      expect(md).toContain(h);
    }
    expect(md.indexOf('## Success checks')).toBeLessThan(md.indexOf('## Round 1'));
  });
});

describe('the sweep', () => {
  it('orders settings by a joke listed and unsold for the 15-minute window', () => {
    expect(sweepCost({ listing: 0.1, hosting: 0.05 })).toBeCloseTo(0.85);
    expect(sweepCost({ listing: 0.5, hosting: 0.05 })).toBeLessThan(sweepCost({ listing: 0.1, hosting: 0.1 }));
  });

  it('chooses the cheapest setting that passes checks 2, 3 and 5, whatever checks 1 and 4 say', () => {
    const pass = successChecks([goodClass()]);
    const fail5 = pass.map(c => (c.id === 5 ? { ...c, pass: false } : c));
    const fail4 = pass.map(c => (c.id === 4 ? { ...c, pass: false } : c));
    expect(chooseDefaults([
      { costs: { listing: 0.1, hosting: 0.05 }, checks: fail5 },
      { costs: { listing: 0.25, hosting: 0.1 }, checks: pass },
      { costs: { listing: 0.1, hosting: 0.1 }, checks: fail4 },
    ])).toEqual({ listing: 0.1, hosting: 0.1 });
    expect(chooseDefaults([{ costs: { listing: 0.1, hosting: 0.05 }, checks: fail5 }])).toBeNull();
  });

  it('renders the grid, the chosen defaults and that setting in full', () => {
    const md = sweepMarkdown({
      date: '2026-11-10', settings: ['Grid.'],
      runs: [sidecar({ listing: 0.1, hosting: 0.05 }), sidecar({ listing: 0.25, hosting: 0.05 })],
    });
    expect(md).toContain('# Cost sweep — 2026-11-10');
    expect(md).toContain('**Chosen defaults:** listing $0.10 per joke, hosting $0.05 per joke-minute');
    expect(md).toContain('| $0.25 | $0.05 | PASS | PASS | PASS | PASS | PASS |');
    expect(md).toContain('### Round 2');
    expect(md).toContain('feedback_joke_count');
  });

  it('says so when no setting passes', () => {
    const losing = goodClass();
    losing.rounds[1].rows = losing.rounds[1].rows.map(r => ({ ...r, profit: -1 }));
    const md = sweepMarkdown({ date: '2026-11-10', settings: [], runs: [sidecar({ listing: 0.1, hosting: 0.05 }, losing)] });
    expect(md).toContain('**No setting passes checks 2, 3 and 5**');
  });
});

describe('parsePilotEnv', () => {
  it('defaults to the starting costs, 3 classes, a 90 s window, 5 pairs per size and a fresh seed', () => {
    expect(parsePilotEnv({}, 42)).toEqual({
      costs: { listing: 0.1, hosting: 0.05 }, window: 90, classes: 3, perGroup: 5, seed: 'feedback-42', tag: undefined,
    });
  });

  it('reads overrides and refuses bad values', () => {
    expect(parsePilotEnv({ PILOT_LISTING: '0.25', PILOT_HOSTING: '0.2', PILOT_CLASSES: '1', PILOT_SEED: ' s ', PILOT_TAG: 'x' }, 0))
      .toMatchObject({ costs: { listing: 0.25, hosting: 0.2 }, classes: 1, seed: 's', tag: 'x' });
    expect(() => parsePilotEnv({ PILOT_HOSTING: '-1' })).toThrow(/PILOT_HOSTING/);
    expect(() => parsePilotEnv({ PILOT_CLASSES: '1.5' })).toThrow(/PILOT_CLASSES/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run scripts/pilot/feedbackReport.test.ts`
Expected: FAIL — cannot import `./feedbackReport`.

- [ ] **Step 3: Write the report, the class runner and the two scripts**

Create `scripts/pilot/feedbackReport.ts`:

```ts
/* Pure summarisation for the feedback pilot and the cost sweep
   (docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §5).
   Kept apart from the runners (feedback-pilot.mts, cost-sweep.mts) so the
   checks are unit-tested and the markdown is reproducible from a sidecar.

   One class = 20 bot teams, Round 1 then Round 2, trait classifier, bots at
   10×. Four groups of 5: small (Round 2 batches of 3) or large (10), with or
   without feedback. Each feedback team has a twin without it: same persona
   (Balanced), pace, batch sizes and seed (deckIndex), so the pair draws the
   same starting jokes. Every Marketing seat releases every joke, so each team
   is "a team releasing everything". The pilot computes each released joke's
   fit from its corpus traits and the round's ideal (services/shared/traitCorpus.ts
   traitFit, the port of the Go rules); the bots never see it. */
import type { ConfigRequest, LeanTeamStats } from '../../types/api';
import type { BotTeamSpec } from '../../services/bots/protocol';
import { leanFeesOf } from '../../services/leanMode';
import { normalizeJokeText, traitFit, type TraitIndex } from '../../services/shared/traitCorpus';
import type { IdealProfile } from '../../config/dimensions';

export type GroupId = 'SMALL_ON' | 'SMALL_OFF' | 'LARGE_ON' | 'LARGE_OFF';
export type PilotRound = 1 | 2;

export const GROUPS: ReadonlyArray<{ id: GroupId; label: string; round2BatchSize: number; useFeedback: boolean }> = [
  { id: 'SMALL_ON', label: 'Small + feedback', round2BatchSize: 3, useFeedback: true },
  { id: 'SMALL_OFF', label: 'Small, no feedback', round2BatchSize: 3, useFeedback: false },
  { id: 'LARGE_ON', label: 'Large + feedback', round2BatchSize: 10, useFeedback: true },
  { id: 'LARGE_OFF', label: 'Large, no feedback', round2BatchSize: 10, useFeedback: false },
];

/** The customers' bar: the backend's default buy threshold (domain.DefaultBuyThreshold); the pilot never changes it. */
export const CUSTOMERS_BAR = 8;
/** A mean fit "rises" from the first to the last Round 2 batch when it gains at least this much. */
export const RISE = 0.5;
/** "About half of teams or more" finish Round 2 in profit. */
export const PROFIT_SHARE_MIN = 0.45;
/** A team releasing everything spends this share of its Round 1 revenue on fees. */
export const FEE_SHARE_RANGE: readonly [number, number] = [0.4, 0.6];

export interface ClassTeam extends BotTeamSpec { group: GroupId }

/**
 * The 2×2 class: `perGroup` matched pairs of each size. Indices run 1…4×perGroup;
 * each no-feedback twin plays with its partner's deckIndex.
 */
export function classTeams(perGroup = 5): ClassTeam[] {
  const out: ClassTeam[] = [];
  for (let k = 0; k < perGroup; k++) {
    for (const size of [3, 10]) {
      const on = out.length + 1;
      const base = { persona: 'BALANCED' as const, releaseAll: true, round2BatchSize: size };
      out.push({ ...base, index: on, useFeedback: true, group: size === 3 ? 'SMALL_ON' : 'LARGE_ON' });
      out.push({ ...base, index: on + 1, useFeedback: false, deckIndex: on, group: size === 3 ? 'SMALL_OFF' : 'LARGE_OFF' });
    }
  }
  return out;
}

/** Listing per released joke and hosting per joke-minute, at classroom (1×) rates. */
export interface Costs { listing: number; hosting: number }

/**
 * One round's config. Two costs: listing (per joke, unscaled) and hosting,
 * which the backend charges per wall-clock minute, so it is sent × speed to
 * weigh what it weighs in a real 15-minute round; shipping, storage and discard 0.
 */
export function pilotConfig(costs: Costs, speed: number, windowS: number, round: PilotRound): ConfigRequest {
  return {
    market_mode: 'LEAN', arrival_window_seconds: windowS, wip_limit: 0, batch_size: round === 1 ? 5 : 10,
    cost_of_publishing: costs.listing, cost_of_discard: 0,
    hosting_fee_per_joke_minute: Number((costs.hosting * speed).toFixed(4)),
    shipping_fee_small: 0, shipping_fee_standard: 0, shipping_fee_large: 0, storage_fee_per_joke_minute: 0,
  };
}

/** One sent batch, in send order. */
export interface BatchFit {
  seq: number;
  released: number;
  /** Mean fit of its released jokes; null when it released none (or none is a corpus joke). */
  meanFit: number | null;
  /** Released jokes at or above the bar. */
  aboveBar: number;
  /** At least one released joke at or above the bar. */
  cleared: boolean;
}

/**
 * Each batch's released jokes scored against the ideal, from the team's batch
 * list (what the bots' own seats read). Batches in send order; jokes not in
 * the corpus are left out.
 */
export function batchFits(
  batches: ReadonlyArray<{ batch_id: number; submitted_at: string | null; jokes: ReadonlyArray<{ joke_text: string; publish_status: string }> | null }>,
  index: TraitIndex, ideal: IdealProfile, bar = CUSTOMERS_BAR,
): BatchFit[] {
  return [...batches]
    .sort((a, b) => (Date.parse(a.submitted_at ?? '') || 0) - (Date.parse(b.submitted_at ?? '') || 0) || a.batch_id - b.batch_id)
    .map((b, i) => {
      const fits = (b.jokes ?? [])
        .filter(j => j.publish_status === 'PUBLISHED')
        .map(j => index.byText.get(normalizeJokeText(j.joke_text)))
        .filter(j => j != null)
        .map(j => traitFit(j, ideal));
      const aboveBar = fits.filter(f => f >= bar).length;
      return {
        seq: i + 1, released: fits.length,
        meanFit: fits.length ? fits.reduce((a, f) => a + f, 0) / fits.length : null,
        aboveBar, cleared: aboveBar > 0,
      };
    });
}

export interface TeamRow {
  teamId: number;
  group: GroupId;
  revenue: number;
  listing: number;
  hosting: number;
  /** Shipping + storage + discard: 0 at the pilot's costs, kept so a misconfigured run shows. */
  otherFees: number;
  profit: number;
  sales: number;
  batches: BatchFit[];
  /** Mean seconds from sending a batch to its first sale, over batches that sold; null when none did. */
  sendToFirstSaleS: number | null;
}

/** A team's row from its leaderboard row, the round's prices, its lean charts batches and its batch fits. */
export function teamRowFrom(
  r: { team: { id: number }; total_sales: number; published_jokes: number; discarded_jokes: number; profit: number; lean?: LeanTeamStats },
  group: GroupId,
  prices: { market_price: number; cost_of_publishing: number; cost_of_discard: number },
  chartBatches: ReadonlyArray<{ first_sale_s: number | null }> | undefined,
  batches: BatchFit[],
): TeamRow {
  const lean = leanFeesOf(r.lean);
  const sold = (chartBatches ?? []).map(b => b.first_sale_s).filter((v): v is number => v != null);
  return {
    teamId: r.team.id, group,
    revenue: r.total_sales * prices.market_price,
    listing: r.published_jokes * prices.cost_of_publishing,
    hosting: lean.hosting,
    otherFees: lean.shipping + lean.storage + r.discarded_jokes * prices.cost_of_discard,
    profit: r.profit, sales: r.total_sales, batches,
    sendToFirstSaleS: sold.length ? sold.reduce((a, b) => a + b, 0) / sold.length : null,
  };
}

export interface RoundResult { round: PilotRound; durationS: number; rows: TeamRow[] }
export interface ClassResult { classNo: number; seed: string; rounds: RoundResult[] }
export interface PilotSidecar {
  date: string; costs: Costs; settings: string[]; classes: ClassResult[]; errors: string[]; tag?: string;
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: ReadonlyArray<number | null>): number | null => {
  const known = xs.filter((x): x is number => x != null);
  return known.length ? mean(known) : null;
};

const rowsOf = (classes: readonly ClassResult[], round: PilotRound, groups: readonly GroupId[]): TeamRow[] =>
  classes.flatMap(c => c.rounds.filter(r => r.round === round).flatMap(r => r.rows)).filter(r => groups.includes(r.group));

const fitted = (r: TeamRow) => r.batches.filter(b => b.meanFit != null);
/** First and last batch fit of a team (batches that released a corpus joke); null without any. */
export function firstLastFit(r: TeamRow): { first: number; last: number } | null {
  const b = fitted(r);
  return b.length ? { first: b[0].meanFit as number, last: b[b.length - 1].meanFit as number } : null;
}
/** The 1-based batch number of the first batch that cleared the bar; null when none did. */
export const firstClear = (r: TeamRow): number | null => r.batches.find(b => b.cleared)?.seq ?? null;

export interface GroupSummary {
  teams: number;
  /** Mean fit of released jokes by batch number (1-based index = batch), over the teams that sent that batch. */
  curve: Array<number | null>;
  /** Mean over teams that cleared the bar; null when none did. */
  batchesToClear: number | null;
  cleared: number;
  /** Released jokes at or above the bar, over all released jokes; null without any. */
  shareAboveBar: number | null;
  sales: number; listing: number; hosting: number; profit: number;
  sendToFirstSaleS: number | null;
}

export function summariseGroup(rows: readonly TeamRow[]): GroupSummary {
  const longest = Math.max(0, ...rows.map(r => r.batches.length));
  const curve = Array.from({ length: longest }, (_, i) => meanOrNull(rows.map(r => r.batches[i]?.meanFit ?? null)));
  const clears = rows.map(firstClear).filter((v): v is number => v != null);
  let released = 0;
  let above = 0;
  for (const r of rows) for (const b of r.batches) { released += b.released; above += b.aboveBar; }
  return {
    teams: rows.length, curve,
    batchesToClear: clears.length ? mean(clears) : null, cleared: clears.length,
    shareAboveBar: released ? above / released : null,
    sales: mean(rows.map(r => r.sales)), listing: mean(rows.map(r => r.listing)), hosting: mean(rows.map(r => r.hosting)),
    profit: mean(rows.map(r => r.profit)), sendToFirstSaleS: meanOrNull(rows.map(r => r.sendToFirstSaleS)),
  };
}

export interface Check { id: 1 | 2 | 3 | 4 | 5; name: string; pass: boolean; detail: string }

const money = (v: number) => (v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`);
const fit1 = (v: number | null) => (v == null ? '—' : v.toFixed(1));
const pct = (v: number) => `${Math.round(v * 100)} %`;

/** The five success checks of spec §5, over every class of one setting. */
export function successChecks(classes: readonly ClassResult[]): Check[] {
  const on = rowsOf(classes, 2, ['SMALL_ON', 'LARGE_ON']);
  const off = rowsOf(classes, 2, ['SMALL_OFF', 'LARGE_OFF']);
  const rise = (rows: TeamRow[]) => {
    const pairs = rows.map(firstLastFit).filter((p): p is { first: number; last: number } => p != null);
    return pairs.length ? mean(pairs.map(p => p.last - p.first)) : null;
  };
  const onRise = rise(on);
  const offRise = rise(off);
  const c1: Check = {
    id: 1, name: "Feedback teams' mean fit rises from their first to their last Round 2 batches; no-feedback twins' does not",
    pass: onRise != null && offRise != null && onRise >= RISE && offRise < RISE,
    detail: `first → last batch: feedback ${onRise == null ? '—' : `${onRise >= 0 ? '+' : ''}${onRise.toFixed(2)}`}, `
      + `no feedback ${offRise == null ? '—' : `${offRise >= 0 ? '+' : ''}${offRise.toFixed(2)}`} (rises = at least +${RISE})`,
  };

  const onProfit = mean(on.map(r => r.profit));
  const offProfit = mean(off.map(r => r.profit));
  const c2: Check = {
    id: 2, name: 'In Round 2, feedback teams earn more profit than their no-feedback twins',
    pass: on.length > 0 && onProfit > offProfit,
    detail: `mean Round 2 profit: feedback ${money(onProfit)}, no feedback ${money(offProfit)}`,
  };

  const gain = (a: GroupId, b: GroupId) => mean(rowsOf(classes, 2, [a]).map(r => r.profit)) - mean(rowsOf(classes, 2, [b]).map(r => r.profit));
  const small = gain('SMALL_ON', 'SMALL_OFF');
  const large = gain('LARGE_ON', 'LARGE_OFF');
  const c3: Check = {
    id: 3, name: 'The feedback gain is larger for small batches than for large ones',
    pass: small > large,
    detail: `Round 2 profit gain from feedback: small ${money(small)}, large ${money(large)}`,
  };

  const clears = on.map(firstClear).filter((v): v is number => v != null);
  const meanClear = clears.length ? mean(clears) : null;
  // Per size too: a large team gets no feedback before its last batches, so its first clear is batch-size luck.
  const bySize = (['SMALL_ON', 'LARGE_ON'] as const).map(g => {
    const xs = rowsOf(classes, 2, [g]).map(firstClear).filter((v): v is number => v != null);
    return `${g === 'SMALL_ON' ? 'small' : 'large'} ${xs.length ? mean(xs).toFixed(1) : '—'}`;
  }).join(', ');
  const c4: Check = {
    id: 4, name: 'Feedback is gradual: a feedback team needs at least 3 batches to first clear the bar',
    pass: meanClear != null && meanClear >= 3,
    detail: meanClear == null
      ? `no feedback team cleared the bar of ${CUSTOMERS_BAR} in Round 2`
      : `feedback teams first clear the bar of ${CUSTOMERS_BAR} at batch ${meanClear.toFixed(1)} on average (${bySize}; `
        + `${clears.length} of ${on.length} teams cleared it)`,
  };

  const all2 = rowsOf(classes, 2, GROUPS.map(g => g.id));
  const inProfit = all2.length ? all2.filter(r => r.profit > 0).length / all2.length : 0;
  const r1 = rowsOf(classes, 1, GROUPS.map(g => g.id));
  const revenue1 = r1.reduce((n, r) => n + r.revenue, 0);
  const fees1 = r1.reduce((n, r) => n + r.listing + r.hosting + r.otherFees, 0);
  const feeShare = revenue1 > 0 ? fees1 / revenue1 : null;
  const c5: Check = {
    id: 5, name: 'About half of teams or more finish Round 2 in profit, and a team releasing everything spends 40–60 % of its Round 1 revenue on fees',
    pass: inProfit >= PROFIT_SHARE_MIN && feeShare != null && feeShare >= FEE_SHARE_RANGE[0] && feeShare <= FEE_SHARE_RANGE[1],
    detail: `${pct(inProfit)} of teams in profit in Round 2 (want ≥ ${pct(PROFIT_SHARE_MIN)}); Round 1 fees are `
      + `${feeShare == null ? '— (no revenue)' : pct(feeShare)} of revenue (every team releases everything)`,
  };
  return [c1, c2, c3, c4, c5];
}

/** Groups' tables for one round, and the learning curves. */
function roundSection(classes: readonly ClassResult[], round: PilotRound): string[] {
  const s = GROUPS.map(g => ({ g, x: summariseGroup(rowsOf(classes, round, [g.id])) }));
  const longest = Math.max(0, ...s.map(({ x }) => x.curve.length));
  return [
    `## Round ${round}`, '',
    '| Group | Teams | Batches to clear the bar | Released jokes over the bar | Sales | Listing | Hosting | Profit | Send → first sale |',
    '|---|---|---|---|---|---|---|---|---|',
    ...s.map(({ g, x }) => `| ${g.label} | ${x.teams} | ${x.batchesToClear == null ? '— (none)' : `${x.batchesToClear.toFixed(1)} (${x.cleared} teams)`} | `
      + `${x.shareAboveBar == null ? '—' : pct(x.shareAboveBar)} | ${x.sales.toFixed(1)} | ${money(x.listing)} | ${money(x.hosting)} | `
      + `**${money(x.profit)}** | ${x.sendToFirstSaleS == null ? '—' : `${Math.round(x.sendToFirstSaleS)} s`} |`),
    '',
    `Mean fit of released jokes by batch (the learning curve; the bar is ${CUSTOMERS_BAR}):`, '',
    `| Group | ${Array.from({ length: longest }, (_, i) => `B${i + 1}`).join(' | ')} |`,
    `|---|${Array.from({ length: longest }, () => '---').join('|')}|`,
    ...s.map(({ g, x }) => `| ${g.label} | ${Array.from({ length: longest }, (_, i) => fit1(x.curve[i] ?? null)).join(' | ')} |`),
    '',
  ];
}

export function markdown(side: PilotSidecar): string {
  const checks = successChecks(side.classes);
  return [
    `# Feedback pilot — listing ${money(side.costs.listing)}, hosting ${money(side.costs.hosting)} per joke-minute — ${side.date}`, '',
    ...(side.tag ? [`_${side.tag}_`, ''] : []),
    '## Success checks', '',
    ...checks.map(c => `- **${c.pass ? 'PASS' : 'FAIL'}** — ${c.id}. ${c.name}: ${c.detail}`),
    '',
    ...(side.errors.length ? ['## Errors', '', ...side.errors.map(e => `- ${e}`), ''] : []),
    ...(side.settings.length ? ['## Settings', '', ...side.settings.map(x => `- ${x}`), ''] : []),
    `Means per team over ${side.classes.length} ${side.classes.length === 1 ? 'class' : 'classes'}. `
      + 'Fit is computed by the pilot from each released joke\'s corpus traits and the round\'s ideal; the bots never see it.', '',
    ...([1, 2] as const).filter(r => side.classes.some(c => c.rounds.some(x => x.round === r))).flatMap(r => roundSection(side.classes, r)),
  ].join('\n');
}

/* ---- The cost sweep ------------------------------------------------------ */

export const SWEEP_LISTING: readonly number[] = [0.1, 0.25, 0.5];
export const SWEEP_HOSTING: readonly number[] = [0.05, 0.1, 0.2];
/** What "cheapest" orders by: a joke listed and unsold for the whole 15-minute window. */
export const sweepCost = (c: Costs): number => c.listing + 15 * c.hosting;

export interface SweepSetting { costs: Costs; checks: Check[] }

/** The cheapest setting that passes checks 2, 3 and 5 (spec §5); null when none does. */
export function chooseDefaults(settings: readonly SweepSetting[]): Costs | null {
  const ok = settings.filter(s => [2, 3, 5].every(id => s.checks.find(c => c.id === id)?.pass));
  ok.sort((a, b) => sweepCost(a.costs) - sweepCost(b.costs) || a.costs.hosting - b.costs.hosting);
  return ok[0]?.costs ?? null;
}

export interface SweepSidecar { date: string; settings: string[]; runs: PilotSidecar[]; tag?: string }

export function sweepMarkdown(side: SweepSidecar): string {
  const rows: SweepSetting[] = side.runs.map(r => ({ costs: r.costs, checks: successChecks(r.classes) }));
  const chosen = chooseDefaults(rows);
  const mark = (s: SweepSetting, id: number) => (s.checks.find(c => c.id === id)?.pass ? 'PASS' : 'FAIL');
  return [
    `# Cost sweep — ${side.date}`, '',
    ...(side.tag ? [`_${side.tag}_`, ''] : []),
    chosen
      ? `**Chosen defaults:** listing ${money(chosen.listing)} per joke, hosting ${money(chosen.hosting)} per joke-minute (the cheapest setting that passes checks 2, 3 and 5).`
      : '**No setting passes checks 2, 3 and 5**: keep the starting values (listing $0.10, hosting $0.05) and revisit.',
    '',
    ...(side.settings.length ? ['## Settings', '', ...side.settings.map(x => `- ${x}`), ''] : []),
    '| Listing | Hosting | 1 rises | 2 profit | 3 small > large | 4 gradual | 5 costs | Teams in profit (R2) | Fees % of R1 revenue |',
    '|---|---|---|---|---|---|---|---|---|',
    ...side.runs.map((r, i) => {
      const s = rows[i];
      const all2 = rowsOf(r.classes, 2, GROUPS.map(g => g.id));
      const r1 = rowsOf(r.classes, 1, GROUPS.map(g => g.id));
      const rev = r1.reduce((n, x) => n + x.revenue, 0);
      const fees = r1.reduce((n, x) => n + x.listing + x.hosting + x.otherFees, 0);
      return `| ${money(r.costs.listing)} | ${money(r.costs.hosting)} | ${[1, 2, 3, 4, 5].map(id => mark(s, id)).join(' | ')} | `
        + `${all2.length ? pct(all2.filter(x => x.profit > 0).length / all2.length) : '—'} | ${rev > 0 ? pct(fees / rev) : '—'} |`;
    }),
    '',
    'If check 4 fails (feedback solves the puzzle too fast), the knobs are the jokes per feedback (`feedback_joke_count`, default 3) '
      + 'and the criteria shown per joke (5), not the costs.',
    '',
    ...detailOf(side.runs, chosen),
  ].join('\n');
}

/** The comparison in full for the chosen setting, else for the starting values (the first run when neither ran); headings one level down. */
function detailOf(runs: readonly PilotSidecar[], chosen: Costs | null): string[] {
  const want = chosen ?? { listing: 0.1, hosting: 0.05 };
  const run = runs.find(r => r.costs.listing === want.listing && r.costs.hosting === want.hosting) ?? runs[0];
  if (!run) return [];
  return markdown({ ...run, settings: [], tag: undefined }).split('\n').map(l => (l.startsWith('#') ? `#${l}` : l));
}

/* ---- Settings from the environment --------------------------------------- */

export interface PilotEnv {
  costs: Costs;
  /** Arrival window in seconds: 90 at 10× stands for a 15-minute round. */
  window: number;
  classes: number;
  perGroup: number;
  /** Base seed; class k plays with `${seed}-c${k}`. */
  seed: string;
  tag?: string;
}

/**
 * PILOT_LISTING and PILOT_HOSTING (classroom rates; default the starting values
 * $0.10 and $0.05), PILOT_CLASSES (3), PILOT_WINDOW (90 s), PILOT_PER_GROUP (5
 * pairs of each size), PILOT_SEED (default a fresh one) and PILOT_TAG. Throws
 * on a bad value.
 */
export function parsePilotEnv(env: Record<string, string | undefined>, now = Date.now()): PilotEnv {
  const num = (name: string, ok: (v: number) => boolean, rule: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const v = Number(raw);
    if (!Number.isFinite(v) || !ok(v)) throw new Error(`${name} must be ${rule}, got ${raw}`);
    return v;
  };
  const whole = (v: number) => Number.isInteger(v) && v >= 1;
  return {
    costs: {
      listing: num('PILOT_LISTING', v => v >= 0, 'a number >= 0', 0.1),
      hosting: num('PILOT_HOSTING', v => v >= 0, 'a number >= 0', 0.05),
    },
    window: num('PILOT_WINDOW', whole, 'an integer >= 1', 90),
    classes: num('PILOT_CLASSES', whole, 'an integer >= 1', 3),
    perGroup: num('PILOT_PER_GROUP', whole, 'an integer >= 1', 5),
    seed: env.PILOT_SEED?.trim() || `feedback-${now}`,
    tag: env.PILOT_TAG?.trim() || undefined,
  };
}

/** The Settings lines of a report. */
export function settingsLines(e: PilotEnv, speed: number): string[] {
  return [
    `One class = ${4 * e.perGroup} bot teams (${e.perGroup} matched pairs of each batch size), Balanced pace, bots at ${speed}×, `
      + `trait classifier; Round 1 then Round 2; ${e.classes} ${e.classes === 1 ? 'class' : 'classes'}, seeds ${e.seed}-c1… .`,
    'Round 1: batches of 5 for everyone. Round 2: small teams send 3, large teams 10. Every Marketing seat releases every joke.',
    `Costs (classroom rates): listing $${e.costs.listing} per released joke, hosting $${e.costs.hosting} per joke-minute `
      + `(sent ×${speed}, $${Number((e.costs.hosting * speed).toFixed(4))}, because the backend charges per wall-clock minute). `
      + 'Shipping, storage and discard 0.',
    `Arrival window ${e.window} s (${Math.round((e.window * speed) / 60)} class minutes). The ideal is the pilot ideal `
      + `(config/dimensions DEFAULT_IDEAL_PROFILE) in both rounds. The bar is the customers' default buy threshold, ${CUSTOMERS_BAR}.`,
  ];
}
```

Create `scripts/pilot/feedbackClass.ts`:

```ts
/* Node only: plays one feedback-pilot class against a local backend and
   returns its ClassResult (scripts/pilot/feedbackReport.ts). Used by
   feedback-pilot.mts and cost-sweep.mts.

   The class: an admin reset (it deletes all game data; the runners refuse a
   non-local backend), both rounds configured with the two costs, then the 2×2
   class of bot teams (classTeams) on Round 1. The SAME engine keeps playing
   while the runner ends Round 1 and starts Round 2 (bots read the active round
   every loop). After each round ends, its stats, its lean charts and every
   team's batch list (read as that team's own Joke Maker bot) are collected. */
import { createClient } from '../../services/shared/client';
import { BotEngine, realDelay } from '../../services/bots/engine';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { indexTraitCorpus, type TraitCorpus, type TraitIndex } from '../../services/shared/traitCorpus';
import type { ConfigRequest } from '../../types/api';
import {
  batchFits, classTeams, pilotConfig, settingsLines, teamRowFrom,
  type ClassResult, type Costs, type GroupId, type PilotEnv, type PilotRound, type PilotSidecar, type RoundResult, type TeamRow,
} from './feedbackReport';

export const SPEED = 10 as const;
/** After the arrival window: let due arrivals be served, then end the round. */
const SETTLE_MS = 4_000;
const POLL_MS = 5_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface ClassOptions {
  baseUrl: string;
  password: string;
  instructor: string;
  costs: Costs;
  windowS: number;
  perGroup: number;
  seed: string;
  classNo: number;
  corpus: TraitCorpus;
  log: (line: string) => void;
}

type Client = ReturnType<typeof createClient>;

export async function runFeedbackClass(o: ClassOptions): Promise<ClassResult> {
  const api = createClient({ baseUrl: o.baseUrl });
  const login = await api.instructorLogin({ display_name: o.instructor, password: o.password });
  const instructor = api.as(login.user.user_id, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const rounds = (await api.roundsActive()).rounds;
  const ids = { 1: rounds.find(r => r.round_number === 1)?.id, 2: rounds.find(r => r.round_number === 2)?.id };
  if (ids[1] == null || ids[2] == null) throw new Error('the backend has no rounds 1 and 2 after reset');
  for (const round of [1, 2] as const) {
    await instructor.instructorConfig(ids[round] as number, pilotConfig(o.costs, SPEED, o.windowS, round));
  }

  const teams = classTeams(o.perGroup);
  const groupOf = new Map<number, GroupId>(teams.map(t => [t.index, t.group]));
  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'fatal') o.log(`FATAL ${m.message}`); },
    seed: o.seed, traitCorpus: o.corpus,
  });
  const index = indexTraitCorpus(o.corpus);
  const result: ClassResult = { classNo: o.classNo, seed: o.seed, rounds: [] };
  try {
    await engine.start({
      roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE }, maxTeams: teams.length,
    });
    o.log(`class ${o.classNo}: ${teams.length} teams, round 1 started`);
    result.rounds.push(await playRound(1, ids[1], o, engine, api, instructor, groupOf, index));
    await instructor.instructorStart(ids[2], { ideal_profile: { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'] });
    o.log(`class ${o.classNo}: round 2 started`);
    result.rounds.push(await playRound(2, ids[2], o, engine, api, instructor, groupOf, index));
  } finally {
    engine.stop();
  }
  return result;
}

/**
 * Every class of one setting, one after another (class k plays with seed
 * `${env.seed}-c${k}`). A failed class is recorded in `errors` and the next
 * one still runs.
 */
export async function runSetting(
  base: Pick<ClassOptions, 'baseUrl' | 'password' | 'instructor' | 'corpus' | 'log'>,
  env: PilotEnv, costs: Costs, date: string,
): Promise<PilotSidecar> {
  const side: PilotSidecar = { date, costs, settings: settingsLines({ ...env, costs }, SPEED), classes: [], errors: [], tag: env.tag };
  for (let k = 1; k <= env.classes; k++) {
    try {
      side.classes.push(await runFeedbackClass({
        ...base, costs, windowS: env.window, perGroup: env.perGroup, seed: `${env.seed}-c${k}`, classNo: k,
      }));
    } catch (err) {
      const message = `class ${k} (listing $${costs.listing}, hosting $${costs.hosting}): ${err instanceof Error ? err.message : String(err)}`;
      base.log(`FAILED ${message}`);
      side.errors.push(message);
    }
  }
  return side;
}

async function playRound(
  round: PilotRound, roundId: number, o: ClassOptions, engine: BotEngine, api: Client, instructor: Client,
  groupOf: ReadonlyMap<number, GroupId>, index: TraitIndex,
): Promise<RoundResult> {
  const startedAt = Date.parse((await instructor.roundsActive()).rounds.find(r => r.id === roundId)?.started_at ?? '') || Date.now();
  const windowEnds = startedAt + o.windowS * 1000;
  while (Date.now() < windowEnds) {
    await sleep(Math.min(POLL_MS, Math.max(1, windowEnds - Date.now())));
    o.log(`  class ${o.classNo} R${round}: ${Math.max(0, Math.round((windowEnds - Date.now()) / 1000))} s left, `
      + `${engine.status().classificationCalls} jokes released`);
  }
  // Reading stats serves the arrivals that are due; then end the round so hosting stops at the window.
  await sleep(SETTLE_MS / 2);
  await instructor.instructorStats(roundId);
  await sleep(SETTLE_MS / 2);
  await instructor.instructorEnd(roundId);

  const stats = await instructor.instructorStats(roundId);
  const charts = await instructor.instructorLeanCharts(roundId);
  const prices = (await instructor.roundsActive()).rounds.find(r => r.id === roundId);
  if (!prices) throw new Error(`round ${roundId} vanished`);
  const rows: TeamRow[] = [];
  for (const t of engine.status().teams) {
    const r = stats.leaderboard.find(x => x.team.id === t.teamId);
    if (!r || t.teamId == null || t.jm.userId == null) continue;
    const list = (await api.as(t.jm.userId, `bot ${t.index}A`).teamBatches(roundId, t.teamId)).batches ?? [];
    rows.push(teamRowFrom(
      r, groupOf.get(t.index) as GroupId, prices, charts.teams.find(c => c.team_id === t.teamId)?.batches,
      batchFits(list, index, DEFAULT_IDEAL_PROFILE),
    ));
  }
  const endedAt = Date.parse(prices.ended_at ?? '') || Date.now();
  return { round, durationS: Math.round((endedAt - startedAt) / 1000), rows };
}
```

Create `scripts/pilot/feedback-pilot.mts`:

```ts
/* Runs the feedback comparison (spec docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §5)
   at ONE setting of the two costs against a local backend: PILOT_CLASSES classes
   (default 3) of 20 bot teams each, Round 1 then Round 2, and writes the report
   (scripts/pilot/feedbackReport.ts markdown) plus its JSON sidecar.

   Usage (password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/feedback-pilot.mts docs/pilots/<date>-feedback-pilot.md

   The stack MUST run the trait classifier (APP_LLM_MODE=traits with
   APP_LLM_HASH_CONFIRM=local-pilot-only): the bots write trait-corpus jokes and
   the pilot reads their fit from the corpus.

   Environment:
     E2E_ADMIN_PASSWORD   required (not for PILOT_RENDER_ONLY).
     E2E_BE_URL           default http://localhost:8081; only localhost, 127.0.0.1 and [::1]
                          unless PILOT_ALLOW_REMOTE=1 (every class starts with an admin reset).
     PILOT_RENDER_ONLY    a sidecar from an earlier run: re-render its markdown (to the output
                          path, default the sidecar's with .md) and exit. No backend, no password.
     PILOT_INSTRUCTOR     instructor display name, default "Local Instructor".
     PILOT_LISTING, PILOT_HOSTING, PILOT_CLASSES, PILOT_WINDOW, PILOT_PER_GROUP, PILOT_SEED, PILOT_TAG
                          see feedbackReport.ts parsePilotEnv. */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTraitCorpus } from '../traits/loadTraitCorpus';
import { isLocalUrl } from './report';
import { runSetting } from './feedbackClass';
import { markdown, parsePilotEnv, type PilotSidecar } from './feedbackReport';

const RENDER_ONLY = process.env.PILOT_RENDER_ONLY;
if (RENDER_ONLY) {
  const side = JSON.parse(readFileSync(RENDER_ONLY, 'utf8')) as PilotSidecar;
  const out = process.argv[2] ?? `${RENDER_ONLY.replace(/\.json$/, '')}.md`;
  writeFileSync(out, markdown(side));
  console.log(`rendered ${out} from ${RENDER_ONLY}`);
  process.exit(0);
}

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the pilot against ${BE}: it resets all game data. Use the local backend.`);
}
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const env = parsePilotEnv(process.env);
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-feedback-pilot.md`;
const SIDECAR = `${OUT.replace(/\.md$/, '')}.json`;

const t0 = Date.now();
const side = await runSetting(
  { baseUrl: BE, password: PASSWORD, instructor: process.env.PILOT_INSTRUCTOR ?? 'Local Instructor', corpus: loadTraitCorpus(), log: l => console.log(l) },
  env, env.costs, TODAY,
);
writeFileSync(SIDECAR, JSON.stringify(side, null, 2));
writeFileSync(OUT, markdown(side));
console.log(`wrote ${OUT} and ${SIDECAR} in ${Math.round((Date.now() - t0) / 1000)} s`);
```

Create `scripts/pilot/cost-sweep.mts`:

```ts
/* The cost sweep (spec docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §5):
   the feedback comparison at listing {$0.10, $0.25, $0.50} × hosting {$0.05,
   $0.10, $0.20} per joke-minute, PILOT_CLASSES classes each (default 3), against
   a local backend running the trait classifier. Writes the sweep report
   (feedbackReport.ts sweepMarkdown: every setting's five checks, the chosen
   defaults = the cheapest setting that passes checks 2, 3 and 5, and that
   setting's comparison in full) and its JSON sidecar, rewritten after every
   setting so a stopped sweep keeps what it ran. About 3.5 minutes per class:
   27 classes take about an hour and a half.

   Usage (password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/cost-sweep.mts docs/pilots/<date>-cost-sweep.md

   Environment: as feedback-pilot.mts (PILOT_LISTING and PILOT_HOSTING are
   ignored: the grid sets them). PILOT_RENDER_ONLY re-renders a sweep sidecar. */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTraitCorpus } from '../traits/loadTraitCorpus';
import { isLocalUrl } from './report';
import { runSetting, SPEED } from './feedbackClass';
import { SWEEP_HOSTING, SWEEP_LISTING, parsePilotEnv, settingsLines, sweepMarkdown, type SweepSidecar } from './feedbackReport';

const RENDER_ONLY = process.env.PILOT_RENDER_ONLY;
if (RENDER_ONLY) {
  const side = JSON.parse(readFileSync(RENDER_ONLY, 'utf8')) as SweepSidecar;
  const out = process.argv[2] ?? `${RENDER_ONLY.replace(/\.json$/, '')}.md`;
  writeFileSync(out, sweepMarkdown(side));
  console.log(`rendered ${out} from ${RENDER_ONLY}`);
  process.exit(0);
}

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the sweep against ${BE}: it resets all game data. Use the local backend.`);
}
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const env = parsePilotEnv(process.env);
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-cost-sweep.md`;
const SIDECAR = `${OUT.replace(/\.md$/, '')}.json`;
const base = {
  baseUrl: BE, password: PASSWORD, instructor: process.env.PILOT_INSTRUCTOR ?? 'Local Instructor',
  corpus: loadTraitCorpus(), log: (l: string) => console.log(l),
};

const sweep: SweepSidecar = {
  date: TODAY, tag: env.tag,
  // Every line but the costs, which the grid sets.
  settings: [...settingsLines(env, SPEED).filter(l => !l.startsWith('Costs')),
    `Grid: listing ${SWEEP_LISTING.map(v => `$${v}`).join(' / ')} × hosting ${SWEEP_HOSTING.map(v => `$${v}`).join(' / ')} per joke-minute.`],
  runs: [],
};
const t0 = Date.now();
for (const listing of SWEEP_LISTING) {
  for (const hosting of SWEEP_HOSTING) {
    console.log(`setting: listing $${listing}, hosting $${hosting}`);
    sweep.runs.push(await runSetting(base, { ...env, seed: `${env.seed}-L${listing}-H${hosting}` }, { listing, hosting }, TODAY));
    writeFileSync(SIDECAR, JSON.stringify(sweep, null, 2));
    writeFileSync(OUT, sweepMarkdown(sweep));
  }
}
console.log(`wrote ${OUT} and ${SIDECAR} in ${Math.round((Date.now() - t0) / 1000)} s`);
```

- [ ] **Step 4: Run the tests and the gates**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run scripts/pilot && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — `feedbackReport.test.ts` (17 tests) and the old `report.test.ts`; tsc silent (it checks the `.mts` runners too).

- [ ] **Step 5: Run both render-only paths on a sidecar (no backend, no password)**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && D="$(mktemp -d)" && printf '%s' '{"date":"2026-11-10","costs":{"listing":0.1,"hosting":0.05},"settings":[],"classes":[],"errors":["none ran"]}' > "$D/p.json" && printf '{"date":"2026-11-10","settings":[],"runs":[%s]}' "$(cat "$D/p.json")" > "$D/s.json" && PILOT_RENDER_ONLY="$D/p.json" npx tsx scripts/pilot/feedback-pilot.mts && PILOT_RENDER_ONLY="$D/s.json" npx tsx scripts/pilot/cost-sweep.mts && grep -q '^# Feedback pilot — listing \$0.10, hosting \$0.05 per joke-minute — 2026-11-10' "$D/p.md" && grep -q 'No setting passes checks 2, 3 and 5' "$D/s.md"`
Expected: PASS — prints `rendered …/p.md from …/p.json` and `rendered …/s.md from …/s.json`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add scripts/pilot/feedbackReport.ts scripts/pilot/feedbackReport.test.ts scripts/pilot/feedbackClass.ts scripts/pilot/feedback-pilot.mts scripts/pilot/cost-sweep.mts && git commit -q -F - <<'EOF'
feat(pilot): feedback comparison (2x2) and the cost sweep

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Task 8: The guide, final verification, the local stack and the hand-off

**Repo:** `~/Documents/GitHub/AI-Joke-Factory` for the edits; both repos for the verification.

**Files:**
- Modify: `docs/lean-market-mode.md` (the instructor guide: §1, §2 timeline, §3 rewritten as "Fees: two costs", §4 Setup / leaderboard / debrief / charts / Joke Maker / Marketing, §6 checklist and prompts, §7 limits and the feedback pilot), `README.md` (Bot players)

**Interfaces:**
- Consumes: every task above; the throwaway database `jokefactory_twocosts_test`; the local Docker stack.
- Produces: the guide on two costs; a rebuilt local API on the trait classifier; the exact pilot and sweep commands for the controller.

- [ ] **Step 1: Update the guide and the README**

In `docs/lean-market-mode.md`, replace:

```markdown
Everything here describes the code on the `feat/lean-market` branches of both repositories, which
play Lean only. The design is `docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md`.
```

with:

```markdown
Everything here describes the code on the `feat/two-costs-feedback-bots` branches of both
repositories, which play Lean only. The designs are
`docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md` and, for the two costs and the
bots that use feedback, `docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md`.
```

In `docs/lean-market-mode.md`, replace:

```markdown
about. The fees are named the way a real operation names them, and they are big enough to shape
decisions: a team that pushes should see roughly half of its revenue go to fees.
```

with:

```markdown
about. Money is simple: **two costs, both Marketing's** (section 3). The Joke Maker pays nothing.
With no setup cost the best batch is small, and Round 2's advantage comes from flow and feedback: a
small batch reaches customers sooner (they arrive over the round, so a late joke misses buyers) and
comes back with feedback sooner.
```

In `docs/lean-market-mode.md`, replace:

```markdown
| Setup | 10 min | Presses **Reset game** at the bottom of the Setup tab if a previous class played, seats the pairs on the Teams tab, picks the hidden ideal joke on the Setup tab. Explains the fees (section 3). | Log in, take their seat, read the brief. | Log in, take their seat, read "What customers judge" (the 12 criteria). |
| Round 1 | 15 min | Presses **Start Round 1** in the control bar. Watches the Live tab, calls out cues (section 6). Presses **End Round 1** at about 15 minutes. | Write batches of exactly 5 and press **Send to Marketing**. See "Shipping: $2 per batch of 5". | Split each batch, choose jokes, add a Topic and a title, **Release to market**. Open "Fees and wait times" to watch the shipping, storage and hosting fees. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard (Fees, Sent to released, To first sale) and the lean charts on the Live tab. Asks where the money went. | Discuss. | Discuss; read the Customer feedback card. |
| Round 2 | 15 min | Turns on **Show students their teammates**, presses **Start Round 2** in the control bar, ends at about 15 minutes. | Batches of 1 to 10 jokes. The line reads "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10". | Same desk; in Round 2 Marketing may also discard a whole batch. |
```

with:

```markdown
| Setup | 10 min | Presses **Reset game** at the bottom of the Setup tab if a previous class played, seats the pairs on the Teams tab, picks the hidden ideal joke on the Setup tab. Explains the two costs (section 3). | Log in, take their seat, read the brief. | Log in, take their seat, read "What customers judge" (the 12 criteria). |
| Round 1 | 15 min | Presses **Start Round 1** in the control bar. Watches the Live tab, calls out cues (section 6). Presses **End Round 1** at about 15 minutes. | Write batches of exactly 5 and press **Send to Marketing**. | Split each batch, choose jokes, add a Topic and a title, **Release to market**. Open "Fees and wait times" to watch the listing and hosting fees. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard (Fees, Sent to released, To first sale) and the lean charts on the Live tab. Asks where the money went. | Discuss. | Discuss; read the Customer feedback card. |
| Round 2 | 15 min | Turns on **Show students their teammates**, presses **Start Round 2** in the control bar, ends at about 15 minutes. | Batches of 1 to 10 jokes, their choice. | Same desk; in Round 2 Marketing may also discard a whole batch. |
```

In `docs/lean-market-mode.md`, replace:

````markdown
storage and hosting keep charging.

---

## 3. Fees

| Fee | When it is charged | Starting amount |
|---|---|---|
| **Shipping fee** | Each batch the Joke Maker sends, priced by its size | **$1** for 1–4 jokes · **$2** for 5 · **$3** for 6–10 |
| **Storage fee** | Each minute a joke waits on Marketing's desk, from send until released or discarded | **$0.05 per joke per minute** |
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

Storage and hosting are both 5¢ a joke each minute. A joke held on the desk is charged and cannot
sell; a released joke can sell and stops being charged once it does. Marketing gains nothing by
being the bottleneck.

Nothing is stored: the fees are worked out from timestamps each time a screen refreshes, which is why
the storage and hosting fees in "Fees and wait times" tick up during the round, and every clock stops when the round ends.
The inventory clock starts at release, so time spent waiting for AI classification counts as
````

with:

````markdown
hosting keeps charging.

---

## 3. Fees: two costs

| Cost | When it is charged | Who | Starting amount |
|---|---|---|---|
| **Listing fee** | Once for each joke Marketing releases | Marketing | **$0.10 per joke** |
| **Hosting fee** | Each minute a released joke has not yet sold, from release to its first sale (or to the round's end) | Marketing | **$0.05 per joke per minute** |

```
profit = sales × $1 − listing − hosting
```

Everything else is 0 by default: shipping, storage and discard. The amounts are starting values;
the defaults are whatever the cost sweep chose (section 7). Both stay editable per class on the
Setup tab.

**A fee that is 0 is shown nowhere**, on any screen, in the tour or in the Next step line. The
backend still accepts every fee (shipping by batch size, storage while a batch waits on Marketing's
desk, discard per dropped joke), so an old round that charged shipping still shows it, and a class
whose shipping, storage or discard is set above 0 (through the API, for example by a pilot) sees
that fee again everywhere, with the same names and rules as before.

**Waiting still costs, just not as a fee.** A batch held on Marketing's desk is charged nothing,
but the customers who arrive meanwhile cannot buy it, and they never come back. A released joke
that does not sell pays hosting every minute until it sells.

Nothing is stored: the hosting fee is worked out from timestamps each time a screen refreshes, which
is why it ticks up in "Fees and wait times" during the round, and the clock stops when the round
ends. The inventory clock starts at release, so time spent waiting for AI classification counts as
````

In `docs/lean-market-mode.md`, replace:

```markdown
*A pushing team in Round 1.* Sends 8 batches of 5: shipping 8 × $2 = $16. Each batch waits 2 minutes
on the desk: 8 × 5 × 2 × $0.05 = $4.00 storage. Releases all 40 jokes ($4.00 listing); 20 of them sit
unsold for 8 minutes: 20 × 8 × $0.05 = $8.00 hosting. With 60 sales: fees $32.00, 53 % of revenue;
profit $28.00.

*A team that learned, in Round 2.* Sends 13 batches of 3: shipping 13 × $1 = $13. Each is decided
within a minute: 13 × 3 × 1 × $0.05 = $1.95 storage. Releases 26 ($2.60), drops 13 ($0.13); 6 sit
unsold for 5 minutes ($1.50 hosting). With 50 sales: fees $19.18; profit $30.82. It sold less and
earned more.
```

with:

```markdown
*A pushing team in Round 1.* Sends 8 batches of 5 and Marketing releases all 40 jokes: listing
40 × $0.10 = $4.00. 30 of them sit unsold for 10 minutes on average: 30 × 10 × $0.05 = $15.00
hosting. With 40 sales: fees $19.00, 48 % of revenue; profit $21.00.

*A team that learned, in Round 2.* Sends 13 batches of 3 and releases 30 ($3.00 listing); 8 sit
unsold for 4 minutes ($1.60 hosting). With 50 sales: fees $4.60; profit $45.40. It released less
and earned more.
```

In `docs/lean-market-mode.md`, replace:

```markdown
| **Shipping per batch, by size** | Three amounts, for 1–4, 5 and 6–10 jokes. Each must be 0 or more, and a bigger batch never ships for less. |
| **Storage, waiting on Marketing** | Per joke-minute, charged while a batch waits on Marketing's desk. |
| **Hosting, unsold on the market** | Per joke-minute, charged while a released joke waits for its first sale. |
| **Customers per team** | How many AI customers each team brings (default 18, 0 to 1000; 0 keeps a fixed count). A hint beside it gives the class total, for example about 360 customers for 20 teams. |

Changes take effect when you press **Apply**. The fees, the window and customers per team are one set for the whole
class: Apply writes them to every round that has not started yet (both rounds before Round 1), and
says so next to the button, for example "Fees applied to Rounds 1 and 2". Shipping fees that fall
with batch size are flagged under the shipping inputs ("Shipping fees must rise with batch size …")
and are not sent; any other value the server refuses is shown with the server's own message. The
```

with:

```markdown
| **Listing** (Costs) | Per joke, charged once when Marketing releases it. |
| **Hosting, unsold on the market** (Costs) | Per joke-minute, charged while a released joke waits for its first sale. |
| **Customers per team** | How many AI customers each team brings (default 18, 0 to 1000; 0 keeps a fixed count). A hint beside it gives the class total, for example about 360 customers for 20 teams. |

Costs shows **Listing** and **Hosting** only. **Shipping per batch, by size** (three amounts, for
1–4, 5 and 6–10 jokes, rising with size) and **Storage, waiting on Marketing** (per joke-minute)
appear only while the round charges them, that is when their stored amount is above 0.

Changes take effect when you press **Apply**. The fees, the window and customers per team are one set for the whole
class: Apply writes them to every round that has not started yet (both rounds before Round 1), and
says so next to the button, for example "Fees applied to Rounds 1 and 2". When shipping is shown,
shipping fees that fall with batch size are flagged under its inputs ("Shipping fees must rise with
batch size …") and are not sent; any other value the server refuses is shown with the server's own message. The
```

In `docs/lean-market-mode.md`, replace:

```markdown
other fields (Customer budget, Price per sale, Publishing) work as before. Changed fields are
```

with:

```markdown
other fields (Customer budget, Price per sale) work as before. Changed fields are
```

In `docs/lean-market-mode.md`, replace:

```markdown
| **Fees** | Shipping + storage + hosting so far, with a small bar split into the three. Hover it for each amount. |
```

with:

```markdown
| **Fees** | Every fee the round charges, so far: listing + hosting by default. A small bar is split by fee; hover it for each amount. |
```

In `docs/lean-market-mode.md`, replace:

```markdown
profit.") with, per team: profit R1 / R2 / change, never sold R1 / R2, fees R1 / R2 (shipping +
storage + hosting), and sent to released R1 / R2.
```

with:

```markdown
profit.") with, per team: profit R1 / R2 / change, never sold R1 / R2, fees R1 / R2 (listing +
hosting, as the Fees column), and sent to released R1 / R2.
```

In `docs/lean-market-mode.md`, replace:

```markdown
| **Where the money leaked** | One bar per team, most waste first, split into **Shipping** (red), **Storage, waiting on Marketing** (blue), **Hosting, unsold on the market** (amber), **Listing fees, never sold** (purple) and **Discards** (grey), in dollars. | Shorter bars are leaner. Shipping + Storage + Hosting is the leaderboard's Fees column for that team. |
| **Jokes standing still** | One row per team, biggest pile first: a bar of the jokes waiting on Marketing (blue) and unsold on the market (amber) right now, a dashed class-average tick, and a small trend over the round. Click a team for its full chart. | A growing pile is money: storage and hosting charge for every joke in it. |
```

with:

```markdown
| **Where the money leaked** | One bar per team, most waste first, split into **Hosting, unsold on the market** (amber) and **Listing fees, never sold** (purple), in dollars. A round that charges shipping (red), storage (blue) or discard (grey) shows those too. | Shorter bars are leaner. Listing on jokes that sold is not waste, so a bar is shorter than the team's Fees column. |
| **Jokes standing still** | One row per team, biggest pile first: a bar of the jokes waiting on Marketing (blue) and unsold on the market (amber) right now, a dashed class-average tick, and a small trend over the round. Click a team for its full chart. | A growing pile costs: hosting charges for every unsold joke, and a joke on the desk cannot be bought. |
```

In `docs/lean-market-mode.md`, replace:

```markdown
"Generate up to 10 jokes … (smaller batches are fine)" in Round 2. Under the Send button, the
shipping line quotes the round's fees: "Shipping: $2 per batch of 5" in Round 1, "Shipping: $1 for
1–4 jokes · $2 for 5 · $3 for 6–10" in Round 2. There is no WIP limit: the Joke Maker can always send.
```

with:

```markdown
"Generate up to 10 jokes … (smaller batches are fine)" in Round 2. The Joke Maker pays nothing, so
its screen and its tour name no cost at all; its "More numbers" are its batches, its content waste
and the time from sending to release. There is no WIP limit: the Joke Maker can always send.
```

In `docs/lean-market-mode.md`, replace:

```markdown
| **Where your sales went** | Shipping, storage, hosting, listing and discard fees, and what is left as profit. |
| **How long a joke waits, on average** | The average time a joke spends with Marketing, then on the market waiting for a buyer. |

The round's amounts are $1 for 1–4 jokes, $2 for 5 and $3 for 6–10 in shipping, 5¢ a joke each
minute while a joke waits on Marketing's desk (storage), and 5¢ a joke each minute while a released
joke sits unsold (hosting).
```

with:

```markdown
| **Where your sales went** | The listing and hosting fees, and what is left as profit (plus shipping, storage or discard in a round that charges them). |
| **How long a joke waits, on average** | "With Marketing", then "Waiting for first buyer"; the second says "hosting is charged" (the first says "storage is charged" only in a round that charges storage). |

At the starting amounts a joke costs $0.10 to list, and 5¢ a minute while it sits unsold.
```

In `docs/lean-market-mode.md`, replace:

```markdown
   enough. Storage costs 5¢ a joke each minute." (amber; the duration reads like "52 s" or
   "1 min 12 s", and the storage sentence uses the round's storage fee and is left out if it is 0)
```

with:

```markdown
   enough: customers arriving now can't buy it." (amber; the duration reads like "52 s" or
   "1 min 12 s"; a round that charges storage adds "Storage costs {fee} a joke each minute.")
```

In `docs/lean-market-mode.md`, replace:

```markdown
- [ ] Check the Setup tab: Round 1 exactly 5 jokes, Round 2 up to 10, shipping 1 / 2 / 3, storage
      0.05, hosting 0.05, customers per team 18, customers arrive over 15 min.
```

with:

```markdown
- [ ] Check the Setup tab: Round 1 exactly 5 jokes, Round 2 up to 10, Costs showing only Listing
      and Hosting (0.10 and 0.05 at the starting amounts), customers per team 18, customers arrive
      over 15 min.
```

In `docs/lean-market-mode.md`, replace:

```markdown
| 1 | Where did your money go? Shipping, storage or hosting? | Leaderboard Fees column; Where the money leaked |
| 2 | Which batch size got feedback fastest in Round 2? | Smaller batches, faster feedback |
| 3 | Did Marketing hold batches? What did that cost? | Sent to released; fees R1 vs R2 on the Debrief tab |
| 4 | Which team improved most from Round 1 to Round 2, and what did it change? | Profit change on the Debrief tab |
| 5 | Did your shipping bill go up or down in Round 2, and was it worth it? | Where the money leaked, per round |
```

with:

```markdown
| 1 | Where did your money go: listing jokes, or hosting jokes nobody bought? | Leaderboard Fees column; Where the money leaked |
| 2 | Which batch size got feedback fastest in Round 2? | Smaller batches, faster feedback |
| 3 | Did Marketing hold batches? What did that cost? | Sent to released; fees R1 vs R2 on the Debrief tab |
| 4 | Which team improved most from Round 1 to Round 2, and what did it change? | Profit change on the Debrief tab |
| 5 | Did a batch held on the desk cost you sales? Who bought while it waited? | Sent to released; Jokes standing still |
```

In `docs/lean-market-mode.md`, replace:

```markdown
- **The amounts are the tuned defaults.** They come from the bot fee sweep of 2026-10-11
  (`docs/pilots/2026-10-11-fee-sweep.md`): configuration E4 passed all three checks in 4 of 4 runs
  at 20 teams, with 62 % / 59 % of teams in profit. Human play will not match bot numbers exactly,
  and the buy threshold should be checked with real LLM-scored jokes in a small trial before class.
  The pilot (`scripts/pilot/lean-pilot.mts`) plays one class at 10× with storage and hosting scaled
  ×10; its default class is 14 bot teams (`PILOT_PER_PERSONA` sets a bigger one): 3 each of
  Careful, Balanced, Spray and Learner, plus 2 **Balanced (holds)** teams, identical to Balanced
  except that their Marketing seat holds each batch an extra 60 class-seconds before deciding. Its
  three checks: Spray spends 40–60 % of its revenue on fees in Round 1; in Round 2 the Learner's
  batches of 3 reach a first sale sooner than Spray's batches of 10 (with a caveat, since the Learner
  also paces differently, and a Round 2 table of every batch by size: count, share sold, time to
  first sale); and holding does not pay: in each round the Balanced (holds) teams' mean profit is
  below Balanced's. A rank correlation of storage per batch with profit is printed as an indicative
  line only.
- **Bots learn only from sold counts.** The Learner bot remembers which joke texts sold. It does not
  read the customer feedback panel; human teams can learn more.
- **The pilot does not use the real classifier.** It runs with a deterministic hash classifier
  (`APP_LLM_MODE=hash`). In class, jokes are classified by the LLM.
```

with:

```markdown
- **The amounts are starting values.** Listing $0.10 and hosting $0.05 per joke-minute; the
  defaults are the cheapest setting of the cost sweep that passes its checks 2, 3 and 5
  (`scripts/pilot/cost-sweep.mts`, report under `docs/pilots/`). The customer settings (18 per
  team, buy threshold 8, preference base 5) come from the fee sweep of 2026-10-11
  (`docs/pilots/2026-10-11-fee-sweep.md`). Human play will not match bot numbers exactly.
- **Evidence that feedback matters: the feedback pilot.** `scripts/pilot/feedback-pilot.mts` plays
  classes of 20 bot teams at 10× on a local stack running the trait classifier
  (`APP_LLM_MODE=traits`): five matched pairs with Round 2 batches of 3 and five with batches of 10,
  each pair identical (Balanced pace, same seed and starting jokes, every joke released) except
  that one team uses Marketing's feedback and its twin does not. With feedback on, the Marketing bot
  reads the team's customer feedback and sends the Joke Maker a note with its next release, one
  line per joke ("On "Office Memo No. 3": Keep: Topic, Length. Change: Humor Style, Energy. Energy:
  calmer."); the Joke Maker bot reads the latest note and picks its next jokes from the trait corpus
  (1,000 synthetic jokes whose categories it knows) to match: keep what landed, avoid what missed,
  move one step on a scale that missed with a direction. The pilot computes each released joke's
  fit from the corpus and the round's ideal (the bots never see it) and checks: (1) feedback teams'
  fit rises over Round 2 and their twins' does not; (2) feedback teams earn more in Round 2;
  (3) the gain is larger for small batches; (4) feedback is gradual (at least 3 batches to first
  clear the bar); (5) about half the teams or more end Round 2 in profit, and Round 1 fees are
  40–60 % of revenue. If check 4 fails, the knobs are the jokes per feedback
  (`feedback_joke_count`, 3) and the criteria shown per joke (5), not the costs.
- **The older fees pilot.** `scripts/pilot/lean-pilot.mts` still plays the persona class of the
  five-fee rule set (shipping and storage sent explicitly) with the hash classifier.
- **No pilot uses the real classifier.** The feedback pilot uses the trait classifier, the fees
  pilot the hash classifier; both are local only and refuse to start without
  `APP_LLM_HASH_CONFIRM=local-pilot-only`. In class, jokes are classified by the LLM.
```

In `README.md`, replace:

```markdown
- **Speed** 1× plays at human pace; 10× compresses a round into about a minute.
```

with:

```markdown
- **Speed** 1× plays at human pace; 10× compresses a round into about a minute.
- **Bots that use feedback** are a pilot option only (`useFeedback` per team, never on the
  panel): with a local backend on the trait classifier, `scripts/pilot/feedback-pilot.mts` and
  `scripts/pilot/cost-sweep.mts` compare teams that read Marketing's notes with twins that do not
  (see `docs/lean-market-mode.md` §7).
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory && git add docs/lean-market-mode.md README.md && git commit -q -F - <<'EOF'
docs: two costs and the feedback pilot in the guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: Full suites in both repos**

Run: `cd ~/Documents/GitHub/jokefactory_be && test -z "$(gofmt -l .)" && go build ./... && go vet ./... && go vet -tags integration ./... && go test ./...`
Expected: PASS — every package `ok`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build`
Expected: PASS — tsc silent; every test file passes (no skipped parity test); `✓ built`.

- [ ] **Step 4: The integration tests one last time, then drop the throwaway database**

Run: `cd ~/Documents/GitHub/jokefactory_be && JF_TEST_ALLOW_RESET=1 JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory_twocosts_test?sslmode=disable" go test -count=1 -tags integration ./src/infra/repo/postgres/ ./src/core/usecase/ -run Integration -v`
Expected: PASS — 10 `--- PASS` lines.

Run: `PGPASSWORD=postgres psql -h localhost -p 55432 -U postgres -d postgres -c "DROP DATABASE jokefactory_twocosts_test"`
Expected: PASS — prints `DROP DATABASE`.

- [ ] **Step 5: Rebuild the local API on the trait classifier**

The stock compose file publishes Postgres on 5432, which a host Postgres already holds; a one-line override kept outside the repo publishes it on 55432 instead. No migration is needed (the real local database is already at version 6).

Run: `O="${TMPDIR:-/tmp}/jokefactory-compose.override.yml" && printf 'services:\n  postgres:\n    ports: !override ["55432:5432"]\n' > "$O" && cd ~/Documents/GitHub/jokefactory_be && APP_LLM_MODE=traits APP_LLM_HASH_CONFIRM=local-pilot-only docker compose -f docker-compose.yml -f "$O" up -d --build api`
Expected: PASS — the `api` image builds and `jokefactory_be-api-1` is recreated; `curl -s localhost:8081/health` answers `{"status":"ok"}` within a few seconds. Compose reads `APP_ADMIN_PASSWORD` from the backend's `.env` itself; nothing prints it.

Run: `docker logs jokefactory_be-api-1 2>&1 | grep -c 'LOCAL PILOT CLASSIFIER ACTIVE'`
Expected: PASS — prints a count of at least 1 (the trait classifier is on).

- [ ] **Step 6: API smoke — Reset Game gives both rounds the two costs**

Run: `cd ~/Documents/GitHub/jokefactory_be && PW="$(grep '^APP_ADMIN_PASSWORD=' .env | cut -d= -f2-)" B=http://localhost:8081 python3 -c 'import json,os,urllib.request as u; B=os.environ["B"]; post=lambda p,b,h={}: json.load(u.urlopen(u.Request(B+p, data=json.dumps(b).encode(), headers={"Content-Type":"application/json",**h}))); uid=post("/v1/instructor/login",{"display_name":"Local Instructor","password":os.environ["PW"]})["user"]["user_id"]; post("/v1/admin/reset",{},{"X-User-Id":str(uid)}); rs={r["round_number"]:r for r in json.load(u.urlopen(B+"/v1/rounds/active"))["data"]["rounds"]}; want={"market_mode":"LEAN","cost_of_publishing":0.1,"hosting_fee_per_joke_minute":0.05,"shipping_fee_small":0,"shipping_fee_standard":0,"shipping_fee_large":0,"storage_fee_per_joke_minute":0,"cost_of_discard":0}; bad=[(n,k,rs[n].get(k)) for n in (1,2) for k,v in {**want,"batch_size":5 if n==1 else 10}.items() if rs[n].get(k)!=v]; print("rounds 1 and 2: the two costs" if not bad else bad); raise SystemExit(1 if bad else 0)'`
Expected: PASS — prints `rounds 1 and 2: the two costs`. The password travels only inside the request body. (This resets the local game.)

- [ ] **Step 7: Hand off the browser check (the controller)**

Against `npm run dev` pointed at `http://localhost:8081`: the Joke Maker shows no cost anywhere (no shipping line, "More numbers" instead of "Fees and wait times", the tour's "Batch size." step); Marketing's "Fees and wait times" lists Listing fees and Hosting only, with "With Marketing" and "Waiting for first buyer"; a batch held 45 s reads "Batch waiting 45 s. Release what's good enough: customers arriving now can't buy it."; Setup → Costs shows Listing and Hosting only; the Live board's Fees bar has two segments and "Fees paid" reads "listing and hosting".

- [ ] **Step 8: Hand off the pilot and the sweep (the controller runs them after the build)**

One setting, three classes (about 11 minutes), from the frontend repo; the password only by shell substitution; the local-only guard refuses any non-local backend:

```sh
cd ~/Documents/GitHub/AI-Joke-Factory && D="$(date +%F)" && E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" npx tsx scripts/pilot/feedback-pilot.mts "docs/pilots/$D-feedback-pilot.md"
```

The sweep (9 settings × 3 classes, about 1 h 35 min; run it in the background; it rewrites its report after every setting):

```sh
cd ~/Documents/GitHub/AI-Joke-Factory && D="$(date +%F)" && E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" npx tsx scripts/pilot/cost-sweep.mts "docs/pilots/$D-cost-sweep.md"
```

Re-render without a backend: `PILOT_RENDER_ONLY="docs/pilots/$D-cost-sweep.json" npx tsx scripts/pilot/cost-sweep.mts` (same for `feedback-pilot.mts`). Commit the reports (frontend):

```sh
cd ~/Documents/GitHub/AI-Joke-Factory && D="$(date +%F)" && git add "docs/pilots/$D-feedback-pilot.md" "docs/pilots/$D-feedback-pilot.json" "docs/pilots/$D-cost-sweep.md" "docs/pilots/$D-cost-sweep.json" && git commit -q -F - <<'EOF'
docs(pilot): feedback comparison and cost sweep

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

**Making the chosen costs the defaults (spec §6).** The sweep report's first line names them ("**Chosen defaults:** listing $L per joke, hosting $H per joke-minute"). If they are not $0.10 and $0.05, change, in one backend commit: `DefaultCostOfPublishing` and `DefaultHostingFeePerJokeMinute` in `src/core/domain/defaults.go`, and the amounts the tests pin (`src/core/domain/lean_fees_test.go` `TestDefaultRoundConfigIsTheLeanRuleSet`, `src/core/domain/tuned_defaults_test.go`, `src/core/usecase/lean_fees_test.go` `checkRounds`, `src/app/server/two_costs_routes_test.go` `twoCostsIssue`, `src/app/server/lean_fees_routes_test.go` round 1 hosting); in one frontend commit, `DEFAULT_COST_OF_PUBLISHING` in `context.tsx` and the amounts in `docs/lean-market-mode.md` §3 and §6 (the screen tests use `TWO_COST_CONFIG` amounts of their own and need no change). Then rebuild the API (Step 5) and rerun Step 6 with the new amounts. If no setting passes, the defaults stay at the starting values and the report says so.

---

## Self-review against the spec

**Verification of this plan (2026-11-10).** Every step of this text was applied literally, in order, to fresh clones of both repos at `5d7b4e9` / `4ca7a35` (checked out side by side under the real names, `node_modules` linked), by a script that executes each `Create`, `Replace the whole of` and `In …, replace … with` step, refuses an anchor that does not occur exactly once, and runs each `Run:` line and commit block against its PASS/FAIL expectation. 37 of 37 checked runs matched (in three clean runs), including all seven RED steps, each of which failed for the reason stated before its implementation. Not run: Task 8 Steps 5–6, because they rebuild and reset the real local stack. In their place the API built from this plan's code ran on a throwaway database with `APP_LLM_MODE=traits`: Step 6's smoke script printed `rounds 1 and 2: the two costs` against it, and one 20-team feedback-pilot class ran end to end (about 3 minutes; see Concerns). Integration tests ran only against the throwaway `jokefactory_twocosts_test`, created in Task 1 and dropped in Task 8. Results: backend `gofmt -l .` clean, `go build`, `go vet`, `go vet -tags integration` clean, `go test ./...` **193 → 210** passing tests (subtests included), integration **10 → 10**; frontend `tsc --noEmit` clean, `vitest run` **1375 tests in 87 files → 1463 in 96**, `vite build` succeeds. The end state of both repos is identical, file for file, to the implementation the plan was written from.

**1. Spec coverage**

| Spec | Where |
|---|---|
| §1 Goal: two costs, both Marketing's; evidence that feedback matters | Tasks 1, 4, 5 (two costs); Tasks 2, 3, 6, 7 (the evidence). |
| §2 Two costs table, "everything else 0", profit formula | Task 1 (defaults), Task 4 `shownFees`, guide §3 (Task 8). |
| §2 amounts: starting listing $0.10, hosting $0.05; final from §5 | Task 1 keeps 0.10 / 0.05; Task 8 Step 8 says how the sweep's choice becomes the default. |
| §2.1 Backend defaults (domain, admin login, Reset Game, config-created rounds); no migration; API accepts every fee | Task 1 (`TestTwoCostsOnEveryNewRound`, the SQL Reset Game integration test); no migration; the fee validation and columns are untouched. |
| §2.2 Joke Maker: no cost copy | Task 4 (`views/JokeMaker.tsx`; `studentScreens.render.test.ts` "names no cost in either round"; the tour test "names no cost in any round"). |
| §2.2 Marketing fees panel, wait labels | Task 4 `FeesAndWaits`. |
| §2.2 Next step desk wait | Task 4 `services/nextStep.ts`. |
| §2.2 Tour batch-size step and fee step | Task 4 `tourSteps.ts` (`jm-batch-size`, `feesCaption`). |
| §2.2 Instructor Setup Costs, Live/Debrief columns, money-leaked chart, class totals | Task 5. |
| §2.2 Rule: 0 not shown anywhere; old rounds and re-raised fees shown | `shownFees` (Task 4) used by every screen in Tasks 4–5; both directions tested (Review Focus 1–2). |
| §2.2 Guide and instructor doc | Task 8 Step 1 (`docs/lean-market-mode.md`, the instructor guide; `README.md` Bot players). |
| §3 Trait corpus: generated, versioned, ~1,000, 11 categories, title, Length word counts, script in the frontend, one copy per repo, a failing test on drift | Task 2 (generator, file, tests), Task 3 (copy, Go parity), both SHA-256 pins plus a direct byte comparison. |
| §3 Trait classifier: `APP_LLM_MODE=traits`, same guard, corpus categories with Title Fit "Strong", hash fallback, never live | Task 3. |
| §3 The bot knows its own jokes' traits, never the ideal or fit | Task 6 (`drawTraitBatch` reads traits by title from the corpus; nothing reads the ideal); the pilot alone computes fit (Task 7). |
| §4 Loop steps 1–4 (Marketing reads feedback, sends a plain-words note with the next release; Joke Maker reads the latest note, updates its picture by the four rules, picks best matches, ties by seed, no repeat in a round) | Task 6 `feedbackLoop.ts` and `engine.ts`; tests for each rule. |
| §4 Feedback off; per-team `useFeedback`, not a persona, not on the panel | Task 6 (`BotTeamSpec.useFeedback`; `BotPanel.tsx` untouched). |
| §5 Design: 20 teams, 4 groups, R1 5 / R2 3 or 10, matched pairs (same seed, Balanced pace), fresh seed, 3 classes | Task 7 `classTeams`, `runSetting`, `parsePilotEnv`. |
| §5 Measures: learning curve, batches to clear, share above the bar, sales, listing, hosting, profit, send → first sale; fit from traits with the TS port tested against shared fixtures | Task 7 `batchFits`, `summariseGroup`, `markdown`; Task 2/3 shared fixtures. |
| §5 Five checks | Task 7 `successChecks`, each with a passing and a failing test. |
| §5 Sweep grid, 3 classes each, cheapest passing 2, 3, 5; check-4 knobs | Task 7 `cost-sweep.mts`, `chooseDefaults`, `sweepMarkdown`. |
| §6 Done when | Suites (Task 8 Step 3), copies match (parity tests), classifier refuses without confirmation (Task 3), no zero fee anywhere and non-zero still shown (Tasks 4–5), report committed and defaults chosen (Task 8 Step 8, the controller). |
| §7 Out of scope | No export, no change to customers or the real classifier; the Learner persona is untouched. |

**2. Step scan.** Every edit step carries its full code (a new file in full, an existing file as exact anchor/replacement pairs); every Run line has its expected result. The only placeholders are the shell expressions that resolve themselves (`$(date +%F)`, `$(mktemp -d)`, `${TMPDIR:-/tmp}`, the password substitution) and `$L`/`$H` in the hand-off, which the sweep report fills in.

**3. Type and name consistency.** `shownFees`, `teamFees`, `feesTotal`, `feeNames`, `FEE_KINDS`, `ALL_FEES_SHOWN`, `TWO_COST_CONFIG` (Task 4) are the names Task 5 imports; `TraitCorpus`, `TraitJoke`, `Traits`, `TraitIndex`, `indexTraitCorpus`, `normalizeJokeText`, `traitFit`, `traitClassification`, `loadTraitCorpus` (Task 2) are the names Tasks 6–7 import; `BotTeamSpec.useFeedback/round2BatchSize/releaseAll` and `EngineDeps.traitCorpus` (Task 6) are what Task 7's `classTeams` and `runFeedbackClass` set. The note format is produced by `noteLine` and read by `parseNote` in the same module. Go: `TraitClassifier`, `NewTraitClassifier`, `TraitTitleFit` "Strong" equal the frontend's `TRAIT_TITLE_FIT`; `normalizeJokeText` collapses whitespace in both languages; both SHA-256 constants are written once in Global Constraints and in each repo's parity test.

**4. Review Focus.** Each of the five lines above names its pinning tests; all ran in the verification.

**5. Proportion.** The plan is long because the user asked for complete code in every step; the decisions it adds beyond the code are listed below.

## Spec ambiguities and how this plan resolves them

1. **"No cost copy at all" on the Joke Maker.** Read as everything that names a fee or cost: the shipping line, the "Fees and wait times" panel (it showed the team's fees) and the tour's cost sentences. The Joke Maker keeps its own numbers under "More numbers" (Created to Publish, Batches, Content Waste), the existing component.
2. **The batch-size tour step's target and title.** The shipping line it pointed at is gone, so the step (`jm-batch-size`) spotlights the send row (`jm-send`) with the title "Batch size."; its captions are the spec's.
3. **"Waiting for first buyer".** The wait timeline's second label, "On market, waiting for a buyer", is renamed to the spec's words; "hosting is charged" stays (hosting is charged), "storage is charged" shows only when storage is.
4. **What "the amount is 0 for the round" means.** The round's configured rate, not a team's accrued total: a charged fee shows even while a team has paid $0 of it. Shipping counts as charged when any tier is above 0. Listing and discard share one segment on Marketing's chart (as before): "Listing fees", or "Listing and discard fees" when discard is charged. A $0.00 release toast or tally (nothing listed, discards free) shows no charge.
5. **Instructor "Fees".** "Fees = listing + hosting" is implemented as every charged fee (listing at the round's `cost_of_publishing` × released jokes, discard × discarded, plus the Lean stats' shipping, storage and hosting), which is listing + hosting at the defaults and keeps an old round's total honest. Both rounds play one rule set, so the selected config's prices price both Debrief columns.
6. **Setup → Costs.** Listing (the renamed "Publishing") and Hosting always; shipping and storage only while the saved values are above 0, so a field never vanishes while the instructor types 0 into it. Setting them back above 0 is done through the API (a pilot knob), after which they show again.
7. **The tour's other money captions.** The welcome ("Listing a joke costs …") and pick ("discarding costs …") captions drop their amount when it is 0; the fee step adds "Every batch pays shipping." and the storage sentence only in a round that charges them.
8. **"Starting values … final defaults come from the sweep".** The code ships the starting values (0.10 / 0.05, the current defaults); the controller applies the sweep's choice after running it (Task 8 Step 8 lists the exact lines).
9. **Corpus design.** Synthetic sentences from a word bank per topic; each joke's traits land on the pilot's ideal (`DEFAULT_IDEAL_PROFILE`, Go's `llm.PilotIdeal`) with probability q = u^20, else on a uniform non-catch-all category, so about 4 % of jokes clear the bar of 8 (pinned 2–6 %) and most sit near fit 5. No catch-all categories (valid but never an ideal). Unique titles ("Office Memo No. 3") so a note line can name its joke. The bots get the corpus through `EngineDeps.traitCorpus` (the pilot reads the file with Node), so the browser worker never bundles 0.5 MB of JSON and `tsconfig.json` needs no JSON modules.
10. **Parity test.** Both: a SHA-256 constant in each repo (fails in the repo whose copy drifted) and a byte comparison with the sibling repo when it is checked out next door (`~/Documents/GitHub/`).
11. **Which joke a note line is about.** The spec's example note is per batch and unlabelled; the Joke Maker cannot keep "that joke's category" without knowing the joke, so each line starts `On "<title>":` (Marketing's title, the corpus title), one line per newly scored joke, newest first, under the backend's 500-character limit. Title Fit is ignored by the Joke Maker (it has no ideal).
12. **When Marketing reads the feedback.** Just before each release (the spec's "after a release … with the next batch it releases"): the feedback then includes every joke classified since the previous release. Jokes already reported are not repeated, and the Joke Maker applies a line once and only for a joke it sent this round.
13. **The Joke Maker's picture across rounds.** It starts empty in each round (a new round can have a new ideal), and Round 2 has its own seeded order, so Round 2 is a fresh learning episode for every group; twins stay matched in both rounds. "Move one step" is taken from the missed joke's own category; a missed scale without a direction is avoided like a category.
14. **Marketing in the pilot releases every joke** (`releaseAll`), so check 5's "a team releasing everything" is every team (class-wide Round 1 fees ÷ revenue), and the comparison isolates the Joke Maker's use of feedback from Marketing's random choices.
15. **Check thresholds.** Check 1: "rises" = mean (last − first released batch fit) ≥ +0.5, over the feedback teams; the twins' must stay below +0.5. Check 2: mean Round 2 profit, feedback teams vs twins. Check 3: profit gain from feedback, small vs large. Check 4: mean first-clearing batch over feedback teams that cleared, ≥ 3 (a run where none cleared FAILs), with small and large shown separately. Check 5: ≥ 45 % of teams in profit in Round 2 ("about half or more") and class Round 1 fees 40–60 % of revenue. "The bar" is the customers' default buy threshold, 8.
16. **"Cheapest setting".** Ordered by the cost of one joke listed and unsold for the whole 15-minute window, listing + 15 × hosting (ties: lower hosting). The sweep report shows the chosen setting's comparison in full.
17. **The old fees pilot** (`scripts/pilot/lean-pilot.mts`) is kept as is: it sends its five fees explicitly, so it still runs; the guide says so.

**Concerns.** In a one-class trial run during verification (20 teams, local API built from this plan's code on a throwaway database, listing $0.10, hosting $0.05) checks 1–3 passed, check 4 failed (feedback teams first cleared at batch 2.3 on average: one note is enough to find good jokes, and large random batches clear by luck) and check 5 narrowly failed (40 % of teams in profit, Round 1 fees 39 % of revenue). The sweep will move check 5; per spec §5 check 4's knobs are `feedback_joke_count` and the criteria shown per joke, not the costs.
