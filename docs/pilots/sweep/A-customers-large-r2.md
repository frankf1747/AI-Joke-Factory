# Lean fees pilot — 2026-10-12

_A-customers large(40 teams) r2:  PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 65.7 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 12 s, Spray 8 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$6.46 vs $9.38; Round 2: -$16.51 vs -$11.63
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.12; Round 2: ρ = -0.11

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 126 | 76 % | 12 s |
| 5 | 160 | 55 % | 16 s |
| 10 | 36 | 97 % | 8 s |
| not split | 2 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_CUSTOMERS, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $7.78 | $12.44 | $1.91 | $3.86 | $1.22 | **-$11.85** | 6.2 | 5.0 | 15 s | 252.3 % |
| BALANCED | 9 | $40.78 | $16.00 | $2.46 | $10.04 | $2.78 | **$9.38** | 8.0 | 5.0 | 13 s | 77.0 % |
| BALANCED_HOLDS | 4 | $29.25 | $16.00 | $7.85 | $8.91 | $2.83 | **-$6.46** | 8.0 | 5.0 | 20 s | 122.1 % |
| SPRAY | 9 | $61.89 | $16.00 | $2.45 | $18.20 | $4.00 | **$21.24** | 8.0 | 5.0 | 13 s | 65.7 % |
| LEARNER | 9 | $32.11 | $16.00 | $2.44 | $4.73 | $1.60 | **$7.10** | 8.0 | 5.0 | 14 s | 77.9 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $11.44 | $12.89 | $1.87 | $3.49 | $1.20 | **-$8.18** | 6.4 | 5.0 | 17 s | 171.5 % |
| BALANCED | 9 | $20.11 | $16.00 | $2.45 | $10.45 | $2.71 | **-$11.63** | 8.0 | 5.0 | 13 s | 157.8 % |
| BALANCED_HOLDS | 4 | $19.50 | $16.00 | $8.12 | $8.99 | $2.78 | **-$16.51** | 8.0 | 5.0 | 21 s | 184.7 % |
| SPRAY | 9 | $72.00 | $12.00 | $2.48 | $19.61 | $4.00 | **$33.91** | 4.0 | 10.0 | 8 s | 52.9 % |
| LEARNER | 9 | $41.67 | $14.00 | $2.61 | $6.66 | $2.80 | **$15.45** | 14.0 | 3.0 | 12 s | 62.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $50.41 | 94s | 977 | 15.7 |
| 2 | SPRAY | $80.85 | 94s | 1075 | 15.7 |

