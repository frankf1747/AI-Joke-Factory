# Tuned defaults and customers per team — design

Status: approved in conversation 2026-10-11 ("go ahead and make them the defaults").
Branch: `feat/lean-market` in both repos. Builds on `2026-10-11-lean-fees-next-step-design.md`.
Evidence: `docs/pilots/2026-10-11-fee-sweep.md` (E4 passed all three checks in 4 of 4 classes at 20 teams).

## 1. Goal

Make the settings the sweep validated the game's defaults, so an instructor who changes nothing gets a
game that teaches the lesson for a class of up to 20 teams (about 80 students, two per login).

## 2. New defaults

| Setting | Old default | New default |
|---|---|---|
| Storage fee per joke-minute | $0.10 | **$0.05** |
| Buy threshold (τ) | 7 | **8** |
| Preference base | 3 | **5** |
| Customers per team | — | **18** (new setting) |
| Shipping $1 / $2 / $3, hosting $0.05, listing $0.10, discard $0.01, budget $3, price $1, window 900 s, jitter 0.3 | unchanged | unchanged |

They apply wherever defaults apply today: `domain` defaults, admin login, Reset Game, a config call that
creates a round. Existing rounds in a database keep their stored values until Reset Game.

## 3. Customers per team

- **Migration `0006_customers_per_team.sql`:** `rounds.customers_per_team INT NOT NULL DEFAULT 0
  CHECK (customers_per_team >= 0)`. 0 means "use the fixed `customer_count`" (the old behaviour, which
  the pilot's fixed-count override still uses).
- **Default:** 18 (`domain.DefaultCustomersPerTeam`).
- **At StartRound, LEAN rounds only:** when `customers_per_team > 0`, the round's `customer_count`
  becomes `customers_per_team × T`, where T is the number of teams that have at least one participant
  assigned as JM or MARKETING at that moment (minimum 1). It is written to the round before customers
  are generated, so the instructor screens and stats show the real number. CLASSIC rounds are unchanged.
- **Config API:** `customers_per_team` is accepted on `POST /v1/instructor/rounds/:id/config` (and the
  `/start` body): integer 0–1000, else 400 `VALIDATION_ERROR` on that field. Like the other Lean
  settings it is locked once the round has started (409 `MARKET_MODE_LOCKED` on change; re-sending the
  stored value is allowed). It is returned on the instructor round (not on the public, student-facing
  round).

## 4. Frontend

- **Instructor CONFIG:** a "Customers per team:" number input (default 18) next to the other market
  settings, with a hint "≈ {18 × T} customers for {T} teams" when the team count is known. Like the fee
  fields, a change applies to every round still CONFIGURED, and the field greys out once the selected
  round has started.
- **Customer Budget display bug:** the CONFIG "Cust. Budget" box shows 10 while the backend holds 3.
  It must show the round's stored value, and Apply must never send a budget the instructor didn't edit.
- **Frontend defaults** (`LEAN_DEFAULTS`, test fixtures, any hard-coded copy) follow §2. Tooltips and the
  Next step line already read amounts from the round; at the new default the storage copy reads "5¢".

## 5. Pilot and guide

- The pilot's defaults follow the backend: no override needed for the recommended configuration.
  `PILOT_CUSTOMERS` (fixed count) still works and sends `customers_per_team: 0`; a new
  `PILOT_CUSTOMERS_PER_TEAM` overrides the per-team number. Default class in the pilot stays as is.
- `docs/lean-market-mode.md`: the new defaults, customers per team, and the debrief note that teams that
  don't change in Round 2 lose sales to teams that improve.

## 6. Done when

- Backend and frontend suites pass; integration tests (throwaway DB) cover migration 0006 and the
  start-time customer count.
- The local `jokefactory` DB is migrated to 0006, the API rebuilt (hash classifier), and after Reset Game
  both rounds carry the new defaults.
- One confirming pilot at 20 teams with **no overrides** passes the three spec checks.

## 7. Out of scope

Scoring, customer buying logic, Classic mode, the guided walkthrough.
