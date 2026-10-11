# Lean fees, one rule set, and the "Next step" line — design

Status: approved in conversation 2026-10-11 (amounts are starting values for the pilot).
Branch: `feat/lean-market` in both repos. This branch is Lean-only from here on.

## 1. Goal

Teach one lesson with one rule set:
- In **Round 1**, the Joke Maker keeps pushing jokes.
- In **Round 2**, the team discovers that smaller batches bring faster feedback and faster improvement.

The two rounds keep the same rules and fees, so any change in results comes from the team's behaviour, not from the game. The only exception is batch size, which is the lever the lesson is about.

Costs must be big enough to shape decisions, and named the way a real operation names them.

**Success** (checked by the bot pilot, §7):
- a pushing team spends roughly **40–60 % of its revenue** on fees in a 15-minute round;
- in Round 2, small batches reach their first sale sooner than batches of 10;
- Marketing gains nothing by holding batches back.

## 2. Rules (both rounds unless stated)

| Rule | Round 1 | Round 2 |
|---|---|---|
| Jokes per batch | **exactly 5** | **1 to 10**, the team's choice |
| Work-in-progress limit | none | none |
| Fees | same | same |
| Customers | 150, arriving over 15 min (900 s) | same, as a fresh market |
| Preference base | 3 | 3 |

**Lean is the only mode on this branch.**
- Backend defaults and Reset Game produce the rules above.
- The instructor screen drops the Market mode selector, the Lean class preset button and the WIP limit field.
- The backend Classic code stays, unused, so that rolling back is a branch switch, not a rewrite.

## 3. Fees (student-facing names)

| Fee | When it is charged | Starting amount |
|---|---|---|
| **Shipping fee** | Each batch the Joke Maker sends, priced by its size | **$1** for 1–4 jokes · **$2** for 5 · **$3** for 6–10 |
| **Storage fee** | Each minute a joke waits on Marketing's desk, from send until released or discarded | **$0.10 per joke per minute** |
| **Hosting fee** | Each minute a released joke sits unsold, from release until its first sale (or until the round ends) | **$0.05 per joke per minute** |
| **Listing fee** | Each joke Marketing releases | $0.10 (unchanged; renamed from "publishing cost") |
| Discard fee | Each joke Marketing drops | $0.01 (unchanged) |

Profit = sales × $1 − shipping − storage − hosting − listing − discard.

**How a batch's size is counted.** A pasted batch has no joke count until Marketing splits it.
- **Before the split:** it counts as **5 jokes** for both the storage fee and the shipping fee. That is the standard shipment, $2, and the same rule as today's WIP counting.
- **After the split:** its real count sets both.

Storage and hosting are the two halves of the old "carrying cost", now at separate rates. Storage is set higher than hosting on purpose: holding a batch costs more than releasing it, so Marketing is not the bottleneck.

## 4. Backend

- **Migration `0005_lean_fees.sql`** adds to `rounds`:
  - `shipping_fee_small`, `shipping_fee_standard`, `shipping_fee_large` (NUMERIC(10,2), default 0);
  - `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute` (NUMERIC(10,4), default 0).

  The old `setup_cost_per_batch` and `carrying_cost_per_joke_minute` columns stay but are no longer read.
- **`domain.RoundConfig` / `Round`** gain the five fields.
- **Defaults** (`defaults.go`):

  | Setting | Value |
  |---|---|
  | `MarketMode` | LEAN |
  | Shipping fees | 1 / 2 / 3 |
  | Storage fee | 0.10 |
  | Hosting fee | 0.05 |
  | WIP limit | 0 |
  | Preference base | 3 |
  | Customer count | 150 |
  | Arrival window | 900 |

- **Per-round batch size:** Reset Game creates Round 1 with `batch_size` 5 and Round 2 with `batch_size` 10. The existing rules apply unchanged: Round 1 requires exactly `batch_size`, and Round 2+ allows up to `batch_size`.
- **Config API** accepts the five fields:
  - all must be ≥ 0, with `small ≤ standard ≤ large` (400 `VALIDATION_ERROR` otherwise);
  - like the other Lean settings, they are locked once the round has started.
- **Lean stats** (`leanTeamCTE`, used by the leaderboard, the team summary and the lean charts):
  - `shipping_cost` = the sum over sent batches of the tier fee for the batch's joke count (joke rows, or 5 if unsplit). The tiers are 1–4 → small, 5 → standard, 6+ → large.
  - `storage_cost` = storage fee × WIP joke-minutes, with an unsplit batch counting 5 jokes.
  - `hosting_cost` = hosting fee × inventory joke-minutes.
  - Profit subtracts all three plus the listing and discard fees.
- **API:** the `lean` block gains `shipping_cost`, `storage_cost` and `hosting_cost`.
  - `setup_cost` (= shipping) and `carrying_cost` (= storage + hosting) remain as aliases, so an older frontend keeps working.
  - Lean charts: `waste.setup` carries shipping, `waste.waiting` storage and `waste.shelf` hosting. The keys are unchanged; only the frontend labels change.
- **Unsplit counting:** the WIP rule that counts an unsplit batch as `batch_size` jokes changes to a constant 5, so a Round 2 unsplit batch is not counted as 10.

## 5. Frontend

- **Instructor CONFIG:**
  - remove the Market mode selector, the Lean class preset button and the WIP limit field;
  - replace Setup cost and Carrying cost with "Shipping fee (1–4 / 5 / 6–10 jokes)" (three inputs), "Storage fee per joke-minute" and "Hosting fee per joke-minute";
  - show the R1 batch size as 5 and the R2 batch size as "up to 10".
- **Leaderboard** Lean columns: Shipping, Storage, Hosting, Lead, Sale.
- **Round 1 vs Round 2 table:** "setup+carry" becomes "Fees".
- **Lean charts:**
  - waste segments: Shipping · Storage (waiting on Marketing's desk) · Hosting (unsold on the shelf) · Listing fees on never-sold jokes · Discards;
  - the colours stay;
  - the guide uses the same names.
- **Joke Maker:**
  - the setup-cost line becomes: R1 "Shipping: $2 per batch of 5"; R2 "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10";
  - the WIP counter is removed;
  - R2 copy says "up to 10 jokes"; smaller is allowed.
- **Marketing tiles:**
  - Setup cost → **Shipping fees**;
  - Carrying cost → **Storage fees** and **Hosting fees** (two tiles), each with a one-line tooltip from §3.
- **Next step line** (§6) on both student screens.
- **Instructor guide** (`docs/lean-market-mode.md`): one rule set, the fee table, and the debrief prompts ("Where did your money go? Shipping, storage or hosting?").

## 6. The "Next step" line

A single sentence near the top of each student screen, under the stat tiles:
- a small coloured bar with an arrow icon, labelled **"Next step"**;
- recomputed on every poll;
- a pure function `nextStep(input) → { text, tone: 'info' | 'warn' }` in `services/nextStep.ts`;
- the first matching rule wins.

**Joke Maker** (goal: keep the line moving; in Round 2, learn that smaller is faster):

1. The round hasn't started → "Get your AI tool ready — the round starts soon."
2. Marketing left a note on the latest processed batch, sent within the last 2 minutes → "Marketing says: “{note, ≤ 80 chars…}” — use it in your next batch."
3. Round 2, and the last batch had 6+ jokes → "Big batches wait longer for feedback — try 2 or 3 jokes next." (warn)
4. Marketing's desk is empty (no batch waiting) → R1: "Marketing's desk is empty — send your next batch of 5." R2: "Marketing's desk is empty — send a small batch now."
5. No batch sent for 90 s while the round is running → "No batch sent in 90 s — keep the line moving." (warn)
6. Otherwise → "Keep writing — every batch is another chance to sell."

**Marketing** (goal: don't be the bottleneck; turn feedback into instructions):

1. The round hasn't started → "Watch the desk — your Joke Maker's first batch is coming."
2. A batch has been on the desk 45 s or more → "Batch waiting {n} s — release what's good enough. Storage costs 10¢ a joke each minute." (warn) Use the configured storage fee, not a fixed 10¢.
3. The last decision discarded 60 % or more of a batch → "You discarded {d} of {n} last time — customers can only buy what's on the shelf." (warn)
4. The feedback summary has a Fix next item → "Tell your Joke Maker: fix {top Fix next label} next."
5. The desk is empty → "Desk is clear — nudge your Joke Maker to send the next batch."
6. Otherwise → "Release what's good enough, then tell your Joke Maker what to change."

Inputs come from data the screens already load: round status and number; batches (sent time, joke count, status, `marketing_note`); the queue (the desk batch and when it was sent); the last decision's published and discarded counts; feedback rows via `summarizeFeedback`.

If a needed field is not available on a screen, that rule is skipped. The implementer must say which rules were skipped and why. The function is pure, so time comes in as `now`.

## 7. Pilot (run after implementation; not part of this build)

An end-to-end Round 1 → Round 2 bot class:
- 12 teams: 3 each of Careful, Balanced, Spray and Learner;
- **fast for testing:** bots at 10× with a 90 s arrival window (= 15 minutes compressed); per-minute fees scaled ×10 so their weight matches a real 15-minute round;
- the shipping fee is not scaled.

**Bot batch sizes in Round 2:**

| Persona | Round 2 batch size |
|---|---|
| Spray | 10 |
| Balanced | 5 |
| Careful | 5 |
| Learner | 3 |

Round 1 is 5 for everyone. The per-round cap is 40 jokes in both rounds, so a 10-joke Spray bot is not given more jokes.

**The report shows, per persona and round:** revenue, shipping, storage, hosting, listing, profit, batches sent, mean batch size, time from send to first sale, and fees as a % of revenue.

**Success checks:**
- fees are 40–60 % of revenue for Spray in Round 1;
- in Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10;
- no persona profits by leaving batches on Marketing's desk.

The pilot runs on the local stack with the hash classifier (no Azure calls). Token use: one background run of about 10 minutes, then a summary.

## 8. Out of scope

- Classic mode UI. The backend code stays, and nothing new is built for it.
- Any scoring or customer change.
- The guided walkthrough. It is a separate plan, and its captions must be updated to the new fee names before it is built.
