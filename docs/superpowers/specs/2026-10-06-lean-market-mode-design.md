# Lean Market Mode — Design

**Date:** 2026-10-06
**Repos:** `jokefactory_be` (Go backend, branch `feat/lean-market`) and `AI-Joke-Factory`
(React frontend, branch `feat/lean-market`, based on `feat/bot-players`).
**Status:** approved in conversation; this document is the written record.

## 1. Why

The pilot runs on 2026-10-01 (12 bot teams, two classes at each cost level) showed that the
current market rewards publishing first, not operating lean:

| Persona | Jokes published | Profit at $0.10 publishing cost | Profit at $5 |
|---|---|---|---|
| Careful | 16 | −$1.84 | −$80 |
| Balanced | 28 | −$2.95 | −$128 |
| Spray | 40 | **+$71** | −$138 |

The cause is structural. All 100 customers shop the moment a joke is classified, each buys
every joke that clears their bar until their $3 is gone, and after that they only swap for a
joke at least 0.5 fit better. The first one or two batches in the whole class take the 300
available sales; everyone else sells nothing. Raising costs just makes everyone lose.

The game must reward what Lean teaches: short lead time, small batches, fast feedback, low
inventory, and learning. It must do so without changing the current game, so the two can be
compared and the old one restored.

## 2. Goal

An instructor can run a class in **Lean market mode**, in which:

- a team's profit depends on how quickly and how well it serves a steady flow of customers;
- waste has a price the team can see: setup cost per batch, carrying cost for work in progress
  and unsold inventory;
- Round 1 is played with push rules and Round 2 with lean rules, and the debrief shows the two
  side by side;
- nothing about the **Classic** game changes, and Classic stays the default.

Non-goals for this version: team-chosen WIP limits (instructor sets them), jokes that go stale,
costs for writing jokes, a shifting ideal profile, and any change to how jokes are classified or
how feedback is curated.

## 3. The switch

Every round carries `market_mode`, one of `CLASSIC` (default) or `LEAN`. The instructor sets it
in the CONFIG panel before the round starts. Everything in sections 4–7 applies only when the
mode is `LEAN`. In `CLASSIC` mode the new columns exist but are never read, so the existing
code paths and SQL run exactly as today.

Lean-only round settings, all stored on `rounds` with defaults, all editable in CONFIG:

| Setting | Default | Meaning |
|---|---|---|
| `arrival_window_seconds` | 900 | Customers arrive evenly over this many seconds from round start. |
| `setup_cost_per_batch` | 0 | Charged to the team each time the Joke Maker submits a batch. |
| `carrying_cost_per_joke_minute` | 0 | Charged per joke per minute for WIP and unsold inventory. |
| `wip_limit` | 0 | Max batches a team may have waiting in Marketing; 0 = no limit. |
| `preference_base` | 2 | Odds multiplier per fit point when a customer chooses. |

The "Lean class preset" button sets Round 1 to `LEAN`, setup $3, carrying $0.02, WIP 0, and
Round 2 to `LEAN`, setup $1, carrying $0.02, WIP 2. Both rounds keep batch size 5 (exact in
Round 1, a cap in Round 2, as today). The preset is a starting point; the pilot in section 9
tunes it.

## 4. The market in Lean mode

### 4.1 Arrival
`StartRound` already generates one customer row per `customer_count` with a personal threshold
of `buy_threshold ± jitter` and a budget of `customer_budget`. In Lean mode each customer also
gets `arrives_at = started_at + (i + 1) × arrival_window_seconds / customer_count`, assigned in
shuffled order so thresholds are not correlated with arrival time. Each round generates its own
customers, so Round 2 always starts with a fresh set.

### 4.2 Shopping once
A customer shops exactly once, at arrival:

1. Candidates are every joke in the round that is published, classified, and has
   `true_fit ≥ personal_threshold`.
2. The customer buys `floor(budget / market_price)` jokes (3 at the defaults), chosen one at a
   time without replacement, each pick weighted by `preference_base ^ true_fit`. With base 2,
   a joke one fit point higher is twice as likely to be chosen. Fewer candidates than the
   budget allows means fewer purchases.
3. Each purchase inserts a `purchases` row and a `purchase_events` row, debits the budget, and
   adds one to the team's `points_earned`, through the existing `BuyJoke`.
4. `shopped_at` is set. The customer never shops again. There are no swaps and `swap_margin`
   is unused.

A customer who arrives when nothing qualifies leaves with their budget unspent. Demand a team
was not ready for is lost; that is the lead-time lesson.

### 4.3 When arrivals are served
There is no scheduler. `ServeArrivals(roundID, now)` serves every customer with
`arrives_at ≤ now` and `shopped_at IS NULL`, selecting them `FOR UPDATE SKIP LOCKED` so two
concurrent calls never serve the same customer twice. It is called:

- at the end of every classification run (in Lean mode this replaces `EvaluatePurchases`);
- inside the polled reads `GET /rounds/{rid}/market`, `GET /rounds/{rid}/teams/{tid}/summary`
  and `GET /instructor/rounds/{rid}/stats`, for an `ACTIVE` Lean round only.

Every client polls at least one of these every 2.5 s, so customers are served within a few
seconds of their arrival time. When nothing is due the call is one indexed query.

### 4.4 Round end
`EndRound` sets `ended_at`. Customers who had not arrived are never served. All cost clocks
stop at `ended_at`.

## 5. Costs in Lean mode

```
profit = total_sales × market_price
       − published_jokes × cost_of_publishing       (existing)
       − discarded_jokes × cost_of_discard          (existing)
       − batches_submitted × setup_cost_per_batch   (new)
       − carrying_cost                              (new)

carrying_cost = carrying_cost_per_joke_minute × (wip_joke_minutes + inventory_joke_minutes)
```

- **`batches_submitted`** counts rows in `batch_submission_events` for the team and round.
- **`wip_joke_minutes`**: for each batch, `jokes × minutes(submitted_at → processed_at)`, where
  the end is `processed_at`, else `LEAST(now, ended_at)`. `jokes` is the batch's joke row count
  once split; an unsplit batch counts as the round's `batch_size`.
- **`inventory_joke_minutes`**: for each published joke, `minutes(published_at → first sale)`,
  where the end is the joke's earliest `purchase_events` row, else `LEAST(now, ended_at)`.
  Discarded jokes never carry.

All of it is computed at read time in the stats SQL from timestamps the schema already records.
Nothing is accrued or stored. The in-memory test store computes the same formula in Go.

Worked example at the preset: a Spray team submits 8 batches in Round 1 ($24 setup). Marketing
lets each batch wait 6 minutes (8 × 5 × 6 × $0.02 = $4.80). It publishes 40 jokes, 20 of which
sit unsold for 10 minutes ($4.00). With 60 sales: 60 − 4 − 24 − 8.80 = **$23.20**. A Careful
team submits 4 batches ($12), processes each in 2 minutes ($0.80), publishes 10 jokes of which
2 go unsold for 10 minutes ($0.40). With 45 sales: 45 − 1 − 12 − 1.20 = **$30.80**. Whether the
sales really split that way is what the pilot measures.

## 6. Pull: the WIP limit

In Lean mode with `wip_limit > 0`, `BatchService.Submit` refuses a submission when the team
already has `wip_limit` batches in status `SUBMITTED` (the existing
`CountSubmittedBatchesForTeam`), returning `409 CONFLICT` with code `WIP_LIMIT_REACHED`. The
Joke Maker screen shows the current count against the limit and disables Send with the text
"Marketing has N of N batches waiting — wait, or go help." Classic mode never checks.

## 7. What students and the instructor see

### 7.1 API additions (Lean mode only; absent in Classic)
`TeamStats` (leaderboard rows) and the team summary gain one nested object, `lean`, present
only for Lean rounds, so Classic responses are byte-identical to today's:

| Field in `lean` | Meaning |
|---|---|
| `setup_cost` | `batches_submitted × setup_cost_per_batch` |
| `carrying_cost` | as in section 5 |
| `batches_submitted` | count |
| `avg_submit_to_publish_s` | mean over processed batches |
| `avg_publish_to_first_sale_s` | mean over published jokes that sold |
| `batch_series` | `[{seq, submitted_at, jokes, published, sold}]` in submission order |

`profit` on those same rows already has setup and carrying subtracted in Lean mode.

`PublicRound` gains `market_mode`, `arrival_window_seconds`, `setup_cost_per_batch`,
`carrying_cost_per_joke_minute` and `wip_limit`, so student screens can show the rules they are
playing under. `preference_base` stays instructor-only like `buy_threshold`.

### 7.2 Team screens
Rendered only when the round is Lean:
- **Marketing:** "Setup cost", "Carrying cost" and "Publish → first sale" tiles next to the
  existing Profit and Created-to-Publish tiles, and a learning-curve sparkline of sold ÷
  published per batch.
- **Joke Maker:** the setup cost per batch beside the Send button, the WIP counter from
  section 6, and the same sparkline.

### 7.3 Instructor
- CONFIG gains the Market mode selector, the five lean fields, and the preset button. Fields are
  editable only while the round is `CONFIGURED`, like the existing ones.
- The leaderboard gains sortable columns Setup, Carrying, Lead time (submit → publish) and Lead
  time (publish → sale), shown only for Lean rounds.
- A **Round 1 vs Round 2** table on the Instructor view lists, per team, profit, sales,
  published, unsold, setup, carrying and both lead times for each round, for the debrief.

## 8. Rollback and safety

- Schema changes are additive (`ALTER TABLE … ADD COLUMN … DEFAULT`) with a goose `Down`.
- `market_mode` defaults to `CLASSIC`; no existing row or request changes behaviour.
- Every Lean branch in Go is guarded by `round.MarketMode == domain.MarketLean`; the Classic
  path is not edited.
- Frontend lean UI is guarded by `round.market_mode === 'LEAN'`; Classic renders as today.
- Tests: the existing suites must pass unchanged. New tests cover arrival scheduling, weighted
  choice, shop-once, concurrent serving, the WIP rule, the cost formula (in-memory store and a
  SQL fixture test), and mode guards.

## 9. Pilot

### 9.1 Classifier for local pilots
The live backend classifies with Azure; the local stub gives every joke the same categories, so
every joke has the same fit and weighted choice cannot be exercised. A third adapter,
`HashClassifier`, assigns each LLM dimension a category chosen deterministically from a hash
of the joke text. The same text always gets the same fit, and the 60-joke corpus spans the fit
range. It is selected by `APP_LLM_MODE=hash` and is never the default; with no mode set the
server chooses Azure when credentials exist and the stub otherwise, as today.

### 9.2 Bot personas
Careful, Balanced and Spray are unchanged. A new **Learner** persona plays Round 2 the lean
way: batches of 3, publishes 2 of 3, and remembers each joke text it has seen sold (from
`sold_count` on the team's batch list). When the deck deals a joke it has seen sell, it keeps
it; when it deals one it has seen fail, it discards it; unknown jokes are published at the
Balanced rate. It is an honest "learn from what the market told you" loop, not a cheat: it sees
only what a human Marketing seat sees.

### 9.3 Runs
`scripts/pilot/lean-pilot.mts` drives the real `BotEngine` against a backend URL. It runs, in
order: 2 × Classic and 2 × Lean, each a 12-team class (3 of each persona) at 10× bot speed with
`arrival_window_seconds` compressed to match, resetting the game before each. It records per
team: persona, profit, sales, published, unsold, setup, carrying, both lead times. It writes
`docs/pilots/<date>-lean-pilot.md` with per-persona means, the Round 1 vs Round 2 comparison,
and a verdict: Lean mode passes when, across both Lean classes, Learner and Careful out-earn
Spray on mean profit and Spray does not win either class.

The pilot runs against a local backend (Docker Compose, `APP_LLM_MODE=hash`) so nothing is
deployed and the live game is untouched. A final confirmation class on the live stack with the
real classifier is run only after the user deploys the backend.

## 10. Deliverables

1. **`docs/lean-market-mode.md`** in the frontend repo: goal, the two-round workflow, every
   human interaction by role, the algorithms with worked examples, the instructor playbook
   (setup, running, debrief questions), and how to switch back to Classic.
2. **`docs/pilots/<date>-lean-pilot.md`**: the simulated classes and the verdict.
3. The two `feat/lean-market` branches, with Classic untouched and all tests green.
