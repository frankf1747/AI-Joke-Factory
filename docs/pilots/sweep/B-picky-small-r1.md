# Lean fees pilot — 2026-10-12

_B-picky small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 68.7 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $2.31 vs $9.95; Round 2: -$22.82 vs -$17.88
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.08; Round 2: ρ = -0.14

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 84 | 65 % | 13 s |
| 5 | 101 | 44 % | 13 s |
| 10 | 24 | 96 % | 7 s |
| not split | 2 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $3.67 | $12.00 | $1.86 | $4.11 | $1.20 | **-$15.68** | 6.0 | 5.0 | 29 s | 527.6 % |
| BALANCED | 6 | $41.83 | $16.00 | $2.48 | $10.53 | $2.75 | **$9.95** | 8.0 | 5.0 | 15 s | 76.2 % |
| BALANCED_HOLDS | 2 | $39.50 | $16.00 | $8.23 | $9.90 | $2.95 | **$2.31** | 8.0 | 5.0 | 19 s | 94.1 % |
| SPRAY | 6 | $61.17 | $16.00 | $2.47 | $19.57 | $4.00 | **$19.13** | 8.0 | 5.0 | 11 s | 68.7 % |
| LEARNER | 6 | $30.83 | $16.00 | $2.44 | $5.43 | $1.60 | **$5.13** | 8.0 | 5.0 | 15 s | 83.4 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $18.67 | $13.00 | $1.90 | $3.68 | $1.23 | **-$1.33** | 6.5 | 5.0 | 11 s | 107.1 % |
| BALANCED | 6 | $14.67 | $16.00 | $2.47 | $11.25 | $2.70 | **-$17.88** | 8.0 | 5.0 | 12 s | 221.9 % |
| BALANCED_HOLDS | 2 | $13.50 | $16.00 | $7.38 | $10.12 | $2.70 | **-$22.82** | 8.0 | 5.0 | 20 s | 269.1 % |
| SPRAY | 6 | $70.17 | $12.00 | $2.52 | $20.88 | $4.00 | **$30.77** | 4.0 | 10.0 | 7 s | 56.1 % |
| LEARNER | 6 | $42.50 | $14.00 | $2.64 | $7.53 | $2.80 | **$15.39** | 14.0 | 3.0 | 13 s | 63.8 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $43.72 | 94s | 632 | 15.7 |
| 2 | SPRAY | $86.99 | 94s | 698 | 15.7 |

