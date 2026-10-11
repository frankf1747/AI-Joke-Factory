# Lean Fees and Next Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one Lean rule set for both rounds. It covers:
- realistic, impactful fees (shipping by batch size, storage, hosting, listing);
- Round 1 exactly 5 jokes per batch, Round 2 1–10;
- no WIP limit, and no Classic UI;
- a "Next step" coaching line on both student screens.

**Architecture:**
- **Backend:** five new fee columns with Lean-preset defaults. One CTE change computes the shipping, storage and hosting costs that feed the leaderboard, the team summary and the lean charts. API keys are additive, with the old `setup_cost`/`carrying_cost` kept as aliases.
- **Frontend:** relabelling plus config/UI removal, and a pure `nextStep()` rule function wired into both team views.
- **Bots and pilot:** the bot personas and the pilot script learn the new fees and Round 2 batch sizes. The pilot itself is run separately.

**Tech Stack:** Go (gin, pgx, goose migrations, `testutil` memstore), React 19 + TS + vitest (node env; render tests via `renderToStaticMarkup`), recharts.

**Spec:** `docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md` (binding — read it first; amounts and copy below are verbatim from it).

**Plan style (user request: keep token use low):**
- Each task lists exact files, interfaces, the failing tests to write first, and the key code.
- Routine glue code follows the surrounding patterns, which the implementer reads in place.
- Anything the implementer has to decide beyond the plan goes in the report.

## Global Constraints

- **Repos:** backend `~/Documents/GitHub/jokefactory_be`, frontend `~/Documents/GitHub/AI-Joke-Factory`, both on branch `feat/lean-market`.
- **Git:** new commits only; never reset, amend, rebase, stash or push. Stage explicit paths only. Never stage `.claude/launch.json`, `.progress` or `docs/superpowers/plans/2026-10-11-guided-walkthrough.md`. Commit trailer: a blank line, then `Co-Authored-By: <your model> <noreply@anthropic.com>`.
- **Secrets:** never print secrets; the admin password is read only by shell substitution from `jokefactory_be/.env`.
- **Fees (defaults, both rounds):**

  | Fee | Default |
  |---|---|
  | Shipping | small (1–4 jokes) **$1**, standard (5) **$2**, large (6–10) **$3** |
  | Storage | **$0.10** per joke-minute on Marketing's desk |
  | Hosting | **$0.05** per joke-minute unsold on the shelf |
  | Listing | $0.10 per released joke (existing `cost_of_publishing`) |
  | Discard | $0.01 |

- **Unsplit batch:** counts **5** jokes for storage and is charged the **standard** shipping fee until split.
- **Batch size:** Round 1 `batch_size` 5, exactly. Round 2 `batch_size` 10, as a cap (1–10). These are the existing rules; only the Round 2 default changes.
- **Other defaults:** `market_mode` LEAN, `wip_limit` 0, `preference_base` 3, `customer_count` 150, `arrival_window_seconds` 900.
- **Classic:** the backend Classic code paths are untouched. The frontend shows no Classic or WIP controls.
- **Student-facing names:**
  - "Shipping fee", "Storage fee", "Hosting fee", "Listing fee";
  - tile labels "Shipping fees", "Storage fees", "Hosting fees";
  - leaderboard columns "Shipping", "Storage", "Hosting".
- **Tooltips (verbatim):**
  - Shipping: "Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10."
  - Storage: "Every minute a joke waits on Marketing's desk costs {storage}."
  - Hosting: "Every minute a released joke sits unsold costs {hosting}."

  Fee values are always read from the round config, never hard-coded in the copy.
- **Next step copy:** verbatim from spec §6, including the rule order.

## File Structure

| File | Change |
|---|---|
| `jokefactory_be/src/infra/db/migrations/0005_lean_fees.sql` | create — 5 columns |
| `jokefactory_be/src/core/domain/{round_config.go,defaults.go,entities.go}` | fields + Lean-preset defaults |
| `jokefactory_be/src/core/usecase/instructor.go` | validate + lock new fees |
| `jokefactory_be/src/app/http/dto/*.go`, `handler/instructor.go` | accept/return fee fields |
| `jokefactory_be/src/infra/repo/postgres/{round_repo.go,mapper.go}` | read/write columns; ResetGame R2 batch_size 10 |
| `jokefactory_be/src/infra/repo/postgres/lean_stats_repo.go` | CTE: shipping/storage/hosting; unsplit = 5 |
| `jokefactory_be/src/core/ports/repositories.go` | `LeanTeamStats` + `LeanChartTeamRow` gain cost fields |
| `jokefactory_be/src/core/usecase/lean_charts.go` | waste from the new costs |
| `jokefactory_be/src/core/usecase/testutil/memstore*.go` | mirror |
| tests: `src/core/usecase/lean_fees_test.go` (new), integration `src/infra/repo/postgres/lean_fees_integration_test.go` (new) | |
| `AI-Joke-Factory/types/api.ts`, `types.ts`, `context.tsx`, `services/leanMode.ts` | fee fields, mapping, `shippingFeeFor()`, `fmtPerMinute()` |
| `AI-Joke-Factory/views/Instructor.tsx`, `components/LeanDebrief.tsx`, `services/leanCharts.ts` (+ chart labels) | remove mode/preset/WIP UI; fee inputs; labels |
| `AI-Joke-Factory/views/JokeMaker.tsx`, `views/QualityControl.tsx` | shipping line, tiles, WIP counter removed, R2 "up to 10" |
| `AI-Joke-Factory/services/nextStep.ts` (+ test), `components/NextStep.tsx` (+ test) | coaching line |
| `AI-Joke-Factory/services/bots/{personas.ts,engine.ts}` | R2 sizes; 40-joke cap |
| `AI-Joke-Factory/scripts/pilot/{lean-pilot.mts,report.ts}` (+ test) | fee knobs, ×speed scaling, new columns + success checks |
| `AI-Joke-Factory/docs/lean-market-mode.md` | one rule set, fee table, debrief prompts |

---

### Task 1: Backend — fee columns, defaults, config API, Lean-only reset

**Files:** migration `0005_lean_fees.sql`; `domain/round_config.go`, `domain/defaults.go`, `domain/entities.go`; `postgres/round_repo.go` (+ `mapper.go`); `usecase/instructor.go`; the DTO/handler for round config and the round responses; memstore; tests in `usecase/lean_fees_test.go`.

**Interfaces:**
- **Produces:** `domain.RoundConfig` and `domain.Round` fields:
  - `ShippingFeeSmall`, `ShippingFeeStandard`, `ShippingFeeLarge float64`;
  - `StorageFeePerJokeMinute`, `HostingFeePerJokeMinute float64`.

  JSON keys `shipping_fee_small`, `shipping_fee_standard`, `shipping_fee_large`, `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute` on the config request and on both the instructor and public round responses (optional in the request, like the other Lean fields).
- **Produces:** `domain.StandardShipmentJokes = 5`.

**Steps:**

- [ ] **1. Failing tests** (`lean_fees_test.go`, memstore pattern from `lean_config_test.go`):
  - `DefaultRoundConfig()` has `MarketMode` LEAN, fees 1/2/3, storage 0.10, hosting 0.05, `WIPLimit` 0, `PreferenceBase` 3, `CustomerCount` 150, `ArrivalWindowSeconds` 900.
  - After reset, round 1 has `BatchSize` 5 and round 2 has `BatchSize` 10. Memstore reset must mirror the Postgres reset.
  - Config validation rejects:
    - a negative value in any of the five fields (400, field named);
    - `small > standard` or `standard > large` (400, field `shipping_fee_standard`).
  - Changing a fee on an ACTIVE round → 409 `MARKET_MODE_LOCKED`; resending the same values → ok. Extend `checkStartedRoundLock`.

  Run `go test ./src/core/usecase/ -run 'LeanFee|DefaultRound' -v` → FAIL (undefined fields).
- [ ] **2. Migration:**
  ```sql
  -- +goose Up
  BEGIN;
  ALTER TABLE rounds
    ADD COLUMN shipping_fee_small          NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN shipping_fee_standard       NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN shipping_fee_large          NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN storage_fee_per_joke_minute NUMERIC(10,4) NOT NULL DEFAULT 0,
    ADD COLUMN hosting_fee_per_joke_minute NUMERIC(10,4) NOT NULL DEFAULT 0;
  COMMIT;
  -- +goose Down
  BEGIN;
  ALTER TABLE rounds
    DROP COLUMN shipping_fee_small, DROP COLUMN shipping_fee_standard, DROP COLUMN shipping_fee_large,
    DROP COLUMN storage_fee_per_joke_minute, DROP COLUMN hosting_fee_per_joke_minute;
  COMMIT;
  ```
- [ ] **3. Domain, defaults, repo, DTO and validation:**
  - Add the fields and defaults.
  - Read and write the columns everywhere the existing Lean columns are (follow `setup_cost_per_batch` through `round_repo.go`, `mapper.go`, the DTOs and the overlay in `instructor.go`).
  - `ResetGame` inserts round 2 with `batch_size` 10. Keep `DefaultInstructorBatchSize` 5 for round 1, and add a `DefaultRound2BatchSize = 10` constant.
- [ ] **4. Verify and commit:**
  - Tests green; `gofmt -l src`, `go build ./... && go vet ./... && go test ./...`.
  - Apply the migration to a throwaway database copy only if you also run integration tests (Task 2 does that). Do **not** migrate the real `jokefactory` database.
  - Commit `feat(lean): fee columns, Lean-only defaults, round 2 batches up to 10`.

### Task 2: Backend — shipping, storage and hosting costs in stats and charts

**Files:** `postgres/lean_stats_repo.go`, `postgres/lean_charts_repo.go`, `ports/repositories.go`, `usecase/lean_charts.go`, memstore lean stats and chart rows, `handler`/DTO for the `lean` block; tests: extend `lean_fees_test.go`, plus a new integration test `postgres/lean_fees_integration_test.go`.

**Interfaces:**
- **Produces:** `ports.LeanTeamStats` gains `ShippingCost`, `StorageCost`, `HostingCost float64` (JSON `shipping_cost`, `storage_cost`, `hosting_cost`).
  - `SetupCost` is set equal to `ShippingCost`.
  - `CarryingCost` is set equal to `StorageCost + HostingCost`.
- **Produces:** `ports.LeanChartTeamRow` gains `ShippingCost float64`.
  - `BuildLeanCharts` sets `waste.setup = ShippingCost`, `waste.waiting = storage fee × WIPJokeMinutes` and `waste.shelf = hosting fee × InventoryJokeMinutes`. The JSON keys are unchanged.

**Steps:**

- [ ] **1. Failing tests** (memstore):
  - A team that sent batches of 5 (split), 3 (split), 8 (split) and one unsplit batch → `ShippingCost` = 2 + 1 + 3 + 2 = **8.00**.
  - A batch of 5 left on the desk for 2 minutes → `StorageCost` = 5 × 2 × 0.10 = **1.00**.
  - An unsplit Round 2 batch left on the desk for 1 minute → storage counts **5** jokes (0.50), not 10.
  - One released joke unsold for 4 minutes → `HostingCost` = 4 × 0.05 = **0.20**.
  - `profit = sales − listing − discard − shipping − storage − hosting`. The leaderboard and the team summary agree.
  - The lean charts `waste` equals the stats: setup = shipping, waiting = storage, shelf = hosting.

  Run them → FAIL.
- [ ] **2. CTE** (`leanTeamCTE`):
  - `cfg` selects the five fee columns.
  - Replace the `submitted`-based setup with:
    ```sql
    shipping AS (
      SELECT bj.team_id,
             SUM(CASE WHEN eff < 5 THEN c.shipping_fee_small
                      WHEN eff = 5 THEN c.shipping_fee_standard
                      ELSE c.shipping_fee_large END) AS shipping_cost
      FROM (SELECT team_id, CASE WHEN joke_rows > 0 THEN joke_rows ELSE 5 END AS eff FROM batch_jokes) bj
      CROSS JOIN cfg c
      GROUP BY bj.team_id
    ),
    ```
  - In `wip`, change `ELSE c.batch_size` to `ELSE 5`.
  - `lean` computes:
    - `storage_cost = storage_fee_per_joke_minute × wip_joke_minutes`;
    - `hosting_cost = hosting_fee_per_joke_minute × inventory_joke_minutes`;
    - `setup_cost = shipping_cost`;
    - `carrying_cost = storage_cost + hosting_cost`.
  - `profits` subtracts `shipping_cost + storage_cost + hosting_cost`.
  - Keep `batches_submitted` as it is.
  - Expose `shipping_cost` to the chart rows.
- [ ] **3. Memstore** mirrors exactly the same rules.
- [ ] **4. Integration test** (build tag `integration`, `JF_TEST_DATABASE_URL`):
  - Run on a **throwaway** database migrated to 0005; create it the way `marketing_note_integration_test.go`'s report describes.
  - Seed the step-1 scenario.
  - Assert leaderboard `shipping_cost`, `storage_cost`, `hosting_cost` and profit to the cent, and that the chart `waste` equals them.
- [ ] **5. Verify and commit:**
  - All Go checks, plus the integration tests (existing and new) against the throwaway database.
  - Commit `feat(lean): shipping, storage and hosting fees in stats and charts`.

### Task 3: Frontend — fee config, Lean-only instructor screen, labels

**Files:** `types/api.ts`, `types.ts`, `context.tsx` (config mapping and `updateConfig` body), `services/leanMode.ts` (+ test), `views/Instructor.tsx`, `components/LeanDebrief.tsx`, `services/leanCharts.ts` and the chart label constants, plus the existing tests that pin old labels.

**Interfaces:**
- **Produces:** `LeanConfig` gains `shippingFeeSmall`, `shippingFeeStandard`, `shippingFeeLarge`, `storageFeePerJokeMinute`, `hostingFeePerJokeMinute`, mapped to and from the snake_case keys in Task 1.
- **Produces:** `shippingFeeFor(jokes: number, c: LeanConfig): number`, giving the small fee for 1–4, standard for 5, large for 6+. A raw (unknown) batch is treated as 5.
- **Produces:** `fmtPerMinute(v: number): string`, e.g. `fmtPerMinute(0.1) === '10¢ a joke each minute'` and `fmtPerMinute(0.05) === '5¢ a joke each minute'`. Values of $1 or more format as dollars.
- **Removes:** `LEAN_CLASS_PRESET` usage in the UI, the preset button, the Market mode select and the WIP limit input.
- **Keeps:** `isLeanRound` etc. for logic.

**Steps:**

- [ ] **1. Failing tests:**
  - `shippingFeeFor` across 1, 4, 5, 6, 10 and unknown.
  - `fmtPerMinute`.
  - `leanConfigToBody` maps the five fields.
  - Instructor static render (follow the existing Instructor/LeanChartsPanel test patterns, or test via a small extracted `FeeConfigFields` component) contains "Shipping fee", "Storage fee", "Hosting fee" and no "Market mode", "Lean class preset" or "WIP limit".
  - The leaderboard column labels include Shipping, Storage and Hosting.
  - `WASTE_SEGMENTS` labels read "Shipping", "Storage (waiting on Marketing's desk)", "Hosting (unsold on the shelf)", "Listing fees on never-sold jokes", "Discards".
  - LeanDebrief shows "Fees" instead of "setup+carry".
- [ ] **2. Implement:**
  - Mapping and config inputs: three shipping inputs in one row labelled "Shipping fee (1–4 / 5 / 6–10 jokes)", then Storage and Hosting.
  - Remove the controls.
  - Leaderboard columns read `lean.shipping_cost`, `lean.storage_cost` and `lean.hosting_cost`, falling back to `setup_cost` and `carrying_cost` when absent.
  - Rename the labels.
  - The config shows "R1 batch: 5 (exactly)" and "R2 batch: up to 10" as read-only text. Remove the R1 Batch Size input if it would let the instructor break the rule.
  - Report any other place you find old fee wording.
- [ ] **3. Verify and commit:** `npx tsc --noEmit`, `npx vitest run`, `npx vite build`. Commit `feat(lean): fee settings and labels; Lean-only instructor config`.

### Task 4: Frontend — student screens show the fees

**Files:** `views/JokeMaker.tsx`, `views/QualityControl.tsx`, `types/api.ts` (`LeanTeamStats` fields), and existing view tests that pin "setup", "carrying" or WIP text.

**Steps:**

- [ ] **1. Failing tests** (render or helper tests, following the existing view test patterns):
  - The JM shipping line reads "Shipping: $2 per batch of 5" in Round 1, and "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10" in Round 2, built from the config.
  - No WIP counter text appears ("batches waiting").
  - The Round 2 instruction says "up to 10 jokes".
  - Marketing tiles "Shipping fees", "Storage fees" and "Hosting fees" show `fmtMoney(lean.shipping_cost)` etc. Each tile's `title` is the tooltip from Global Constraints.
  - No "Setup cost" or "Carrying cost" text remains on either screen.
- [ ] **2. Implement** following the existing tile and line code. Remove `wipStatus` usage from the JM view; leave the helper if other code uses it.
- [ ] **3. Verify and commit** (tsc, vitest, vite build). Commit `feat(lean): students see shipping, storage and hosting fees`.

### Task 5: Frontend — the "Next step" line

**Files:** create `services/nextStep.ts` and `services/nextStep.test.ts`; create `components/NextStep.tsx` and `components/NextStep.test.ts`; modify `views/JokeMaker.tsx` and `views/QualityControl.tsx`, placing the line directly under the stat tiles.

**Interfaces:**
```ts
export type NextStepTone = 'info' | 'warn';
export interface NextStep { text: string; tone: NextStepTone }
export interface JokeMakerStepInput {
  now: number; roundActive: boolean; roundNumber: 1 | 2;
  marketingBacklog: number | null;           // batches waiting on Marketing's desk; null = unknown
  lastSentAt: number | null;                 // ms epoch of the team's latest sent batch
  lastBatchJokes: number | null;             // joke count of the latest sent batch (null if unsplit/unknown)
  latestNote: { text: string; batchSentAt: number } | null; // newest processed batch with a non-empty marketing_note
}
export interface MarketingStepInput {
  now: number; roundActive: boolean; storageFeePerJokeMinute: number;
  deskBatchSentAt: number | null;            // ms epoch the batch on the desk was sent; null = desk empty / unknown
  deskEmpty: boolean | null;
  lastDecision: { published: number; discarded: number } | null;
  topFixNext: string | null;                 // summarizeFeedback(rows).fix[0]?.label
}
export function jokeMakerNextStep(i: JokeMakerStepInput): NextStep;
export function marketingNextStep(i: MarketingStepInput): NextStep;
export const NextStepLine: React.FC<{ step: NextStep }>; // components/NextStep.tsx
```

**Steps:**

- [ ] **1. Failing tests:**
  - One test per rule, for both roles: the exact copy from spec §6, plus the thresholds at their boundaries:
    - the note is shown at 119 s but not at 121 s after its batch was sent;
    - batch-size warning at 6 jokes, none at 5;
    - JM idle at 90 s, none at 89 s;
    - desk waiting at 45 s, none at 44 s;
    - discard warning at 3 of 5, none at 2 of 5.
  - Priority order holds when several rules match.
  - A null or unknown input skips its rule.
  - The note is truncated to 80 characters followed by "…".
  - The storage fee in the Marketing line comes from the input, e.g. 0.1 → "10¢". Use `fmtPerMinute` without the "a joke each minute" suffix, or a sibling `fmtCents`.
  - `NextStepLine` renders "Next step" and the text, with an amber style for `warn`.
- [ ] **2. Implement** the pure functions (rules in spec order, first match wins) and the component: a small rounded bar, an icon, and the label "Next step" in small caps, followed by the text.
- [ ] **3. Wire:**
  - Build the inputs from data each view already has: `teamSummary.unprocessed_batches`; batches (`submitted_at`, jokes length, `marketing_note`, status); `qcQueue` (desk batch and its `submitted_at`); the last release outcome (Marketing view state after `publishBatch`); feedback rows via `summarizeFeedback`.
  - Use a 1 s or poll-driven `now` (`useState` + interval, cleared on unmount).
  - If a field isn't available, pass null and list it in the report.
  - In watch mode, show the line read-only (it is useful to the instructor).
- [ ] **4. Verify and commit** (tsc, vitest, vite build). Commit `feat(coach): Next step line for the Joke Maker and Marketing`.

### Task 6: Bots, pilot script, guide

**Files:** `services/bots/personas.ts`, `services/bots/engine.ts` (+ engine tests), `scripts/pilot/lean-pilot.mts`, `scripts/pilot/report.ts` (+ `report.test.ts`), `docs/lean-market-mode.md`.

**Steps:**

- [ ] **1. Failing tests:**
  - **Personas:** Round 2 batch size Spray 10, Balanced 5, Careful 5, Learner 3; Round 1 is 5 for all.
  - **Engine:** the per-round cap is 40 jokes regardless of `batch_size`, and a Round 2 batch never exceeds the round's `batch_size`.
  - **Report:**
    - new columns: Revenue, Shipping, Storage, Hosting, Listing, Profit, Batches, Mean batch size, Send→first sale, Fees % of revenue;
    - success checks from spec §7 rendered as PASS/FAIL lines:
      - Spray's Round 1 fees are 40–60 % of revenue;
      - in Round 2, the Learner's mean send→first-sale is below Spray's;
      - no persona's profit rises with a longer mean desk wait. Use a simple check: the rank correlation between mean storage per batch and profit across teams is not positive.
- [ ] **2. Implement:**
  - **Pilot knobs** (env, defaults = spec): `PILOT_SHIP_SMALL`, `PILOT_SHIP_STANDARD`, `PILOT_SHIP_LARGE`, `PILOT_STORAGE`, `PILOT_HOSTING`.
  - **Scaling:** per-minute fees are multiplied by the speed factor (10 by default); shipping is not scaled.
  - **Plan:** one end-to-end class, Round 1 then Round 2, 12 teams (3 per persona), `PILOT_WINDOW` default 90, speed 10×. Remove the Classic arm and the WIP and setup knobs.
  - **Guard:** keep the local-only guard.
- [ ] **3. Guide:** in `docs/lean-market-mode.md`:
  - replace the two-rule-set ("push vs pull") text with one rule set;
  - add the fee table (spec §3) and the batch-size rule;
  - add debrief prompts: "Where did your money go — shipping, storage or hosting?", "Which batch size got feedback fastest in Round 2?", "Did Marketing hold batches? What did that cost?";
  - remove the Classic, preset and WIP sections, and the old pilot-evidence numbers. Leave a one-line note that the earlier evidence was for a different rule set and is in git history.
- [ ] **4. Verify and commit** (tsc, vitest, vite build). Commit `feat(pilot): fees and one rule set in bots, pilot and guide`.

### Task 7: Verification and local stack

- [ ] **1. Full suites:** backend fmt, build, vet, test; frontend tsc, vitest, vite build.
- [ ] **2. Local database and stack:**
  - Migrate the local `jokefactory` database: `cd ~/Documents/GitHub/jokefactory_be && DB_DSN="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" make migrate-up`. Then run all integration tests against it.
  - Rebuild the stack: `APP_LLM_MODE=hash APP_LLM_HASH_CONFIRM=local-pilot-only docker compose -f docker-compose.yml -f /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean/compose.override.yml up -d --build`. If that override file is missing, recreate it with `services.postgres.ports: !override ["55432:5432"]`.
- [ ] **3. Smoke** (API only, no pilot):
  - reset the local game;
  - `GET /v1/rounds/active` shows both rounds LEAN with fees 1/2/3, 0.10, 0.05, WIP 0, and batch_size 5 / 10.
- [ ] **4. Hand off:** the controller runs the browser check and then the pilot (spec §7) as a separate step.

## Review Focus

1. **A pasted batch never split before the round ends:** charged standard shipping, and storage counted as 5 jokes through to `clock_end`.
2. **A Round 2 batch of exactly 5:** standard fee, not small or large. The boundary 4/5/6 must be pinned in both the SQL and memstore tests.
3. **The instructor edits fees after start:** 409. Before start, `small ≤ standard ≤ large` is enforced.
4. **An older frontend against the new backend:** the `setup_cost`/`carrying_cost` aliases still sum correctly. And a new frontend against an older backend: fall back to the aliases, with no NaN on tiles.
5. **Next step flicker:** `now` ticking must not re-order rules unexpectedly. Boundary tests cover it; the line must not throw when inputs are null.

## Self-review

- **Spec coverage:** §2 → Tasks 1, 3, 4; §3 → Tasks 1, 2, 4; §4 → Tasks 1–2; §5 → Tasks 3–4; §6 → Task 5; §7 → Task 6 (tooling; the run itself comes after); §8 is respected (the walkthrough is untouched).
- **Placeholder scan:** the routine glue code is intentionally described rather than pasted, at the user's request to limit tokens. Every rule, amount, copy string, interface and test case is explicit.
- **Type consistency:**
  - JSON keys `shipping_fee_small`, `shipping_fee_standard`, `shipping_fee_large`, `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute`, `shipping_cost`, `storage_cost`, `hosting_cost` are used identically in Tasks 1–6.
  - `StandardShipmentJokes = 5` is the unsplit rule in both SQL and memstore.
