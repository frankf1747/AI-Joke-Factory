# Lean fees pilot — 2026-10-12

_E4 at 20 teams r3_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 61.1 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 11 s, Spray 34 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **FAIL** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $18.14 vs $52.92; Round 2: -$1.42 vs -$6.28
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.36; Round 2: ρ = -0.33

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 50 | 74 % | 11 s |
| 5 | 82 | 49 % | 21 s |
| 10 | 16 | 94 % | 34 s |
| not split | 10 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.05 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($0.5 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_STORAGE, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $4.00 | $12.00 | $2.40 | $3.80 | $1.10 | **-$15.47** | 6.0 | 5.0 | 13 s | 486.7 % |
| BALANCED | 4 | $84.50 | $16.00 | $4.49 | $8.17 | $2.80 | **$52.92** | 8.0 | 5.0 | 19 s | 37.4 % |
| BALANCED_HOLDS | 4 | $52.25 | $16.00 | $11.34 | $4.89 | $1.80 | **$18.14** | 8.0 | 5.0 | 31 s | 65.3 % |
| SPRAY | 4 | $70.25 | $16.00 | $9.21 | $13.70 | $4.00 | **$27.35** | 8.0 | 5.0 | 30 s | 61.1 % |
| LEARNER | 4 | $43.25 | $16.00 | $3.30 | $3.65 | $1.60 | **$18.46** | 8.0 | 5.0 | 17 s | 57.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $48.25 | $13.50 | $2.48 | $2.88 | $1.15 | **$28.07** | 6.8 | 5.0 | 14 s | 41.8 % |
| BALANCED | 4 | $25.25 | $16.00 | $3.82 | $8.90 | $2.68 | **-$6.28** | 8.0 | 5.0 | 18 s | 124.9 % |
| BALANCED_HOLDS | 4 | $33.50 | $16.00 | $12.07 | $4.93 | $1.85 | **-$1.42** | 8.0 | 5.0 | 35 s | 104.2 % |
| SPRAY | 4 | $69.25 | $12.00 | $10.81 | $14.16 | $4.00 | **$28.28** | 4.0 | 10.0 | 34 s | 59.2 % |
| LEARNER | 4 | $76.75 | $13.00 | $2.29 | $4.26 | $2.35 | **$54.74** | 12.8 | 3.0 | 11 s | 28.7 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $79.04 | 94s | 452 | 15.7 |
| 2 | CAREFUL | $105.38 | 94s | 481 | 15.7 |

