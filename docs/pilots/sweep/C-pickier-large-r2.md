# Lean fees pilot — 2026-10-12

_C-pickier large(40 teams) r2: PILOT_BUY_THRESHOLD=8.5 PILOT_PREFERENCE_BASE=5 PILOT_BUDGET=2 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 98.5 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 17 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **FAIL** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$10.64 vs -$6.58; Round 2: -$21.97 vs -$22.36
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.10; Round 2: ρ = -0.05

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 126 | 63 % | 16 s |
| 5 | 160 | 40 % | 14 s |
| 10 | 36 | 97 % | 7 s |
| not split | 2 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $2.11 | $12.44 | $1.92 | $4.64 | $1.22 | **-$18.30** | 6.2 | 5.0 | 18 s | 966.7 % |
| BALANCED | 9 | $26.22 | $16.00 | $2.45 | $11.46 | $2.78 | **-$6.58** | 8.0 | 5.0 | 14 s | 125.1 % |
| BALANCED_HOLDS | 4 | $26.00 | $16.00 | $7.91 | $9.78 | $2.83 | **-$10.64** | 8.0 | 5.0 | 20 s | 140.9 % |
| SPRAY | 9 | $43.67 | $16.00 | $2.45 | $20.54 | $4.00 | **$0.68** | 8.0 | 5.0 | 11 s | 98.5 % |
| LEARNER | 9 | $21.22 | $16.00 | $2.44 | $6.15 | $1.60 | **-$5.21** | 8.0 | 5.0 | 18 s | 124.6 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $9.22 | $12.89 | $1.89 | $3.76 | $1.20 | **-$10.69** | 6.4 | 5.0 | 13 s | 216.0 % |
| BALANCED | 9 | $10.67 | $16.00 | $2.45 | $11.73 | $2.71 | **-$22.36** | 8.0 | 5.0 | 12 s | 309.6 % |
| BALANCED_HOLDS | 4 | $14.75 | $16.00 | $8.12 | $9.70 | $2.78 | **-$21.97** | 8.0 | 5.0 | 21 s | 248.9 % |
| SPRAY | 9 | $52.22 | $12.00 | $2.49 | $22.26 | $4.00 | **$11.47** | 4.0 | 10.0 | 7 s | 78.0 % |
| LEARNER | 9 | $28.00 | $14.00 | $2.61 | $8.14 | $2.80 | **$0.31** | 14.0 | 3.0 | 17 s | 98.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $37.12 | 94s | 977 | 15.7 |
| 2 | LEARNER | $40.04 | 94s | 1075 | 15.7 |

