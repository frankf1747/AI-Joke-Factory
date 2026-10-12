# Lean fees pilot — 2026-10-12

_A-customers large(40 teams) r1:  PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 69.4 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 8 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$3.53 vs $7.36; Round 2: -$14.01 vs -$13.15
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.17; Round 2: ρ = -0.05

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 126 | 77 % | 15 s |
| 5 | 160 | 54 % | 18 s |
| 10 | 36 | 100 % | 8 s |
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
| CAREFUL | 9 | $8.11 | $12.44 | $1.91 | $3.84 | $1.22 | **-$11.49** | 6.2 | 5.0 | 13 s | 241.7 % |
| BALANCED | 9 | $38.56 | $16.00 | $2.45 | $9.85 | $2.78 | **$7.36** | 8.0 | 5.0 | 14 s | 80.9 % |
| BALANCED_HOLDS | 4 | $32.25 | $16.00 | $7.91 | $8.93 | $2.83 | **-$3.53** | 8.0 | 5.0 | 20 s | 110.9 % |
| SPRAY | 9 | $58.67 | $16.00 | $2.45 | $18.29 | $4.00 | **$17.93** | 8.0 | 5.0 | 13 s | 69.4 % |
| LEARNER | 9 | $35.22 | $16.00 | $2.46 | $4.81 | $1.60 | **$10.11** | 8.0 | 5.0 | 13 s | 71.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $14.11 | $12.89 | $1.88 | $3.58 | $1.20 | **-$5.62** | 6.4 | 5.0 | 20 s | 139.8 % |
| BALANCED | 9 | $19.11 | $16.00 | $2.43 | $10.99 | $2.71 | **-$13.15** | 8.0 | 5.0 | 16 s | 168.8 % |
| BALANCED_HOLDS | 4 | $22.00 | $16.00 | $8.15 | $8.97 | $2.78 | **-$14.01** | 8.0 | 5.0 | 24 s | 163.7 % |
| SPRAY | 9 | $71.22 | $12.00 | $2.48 | $19.46 | $4.00 | **$33.28** | 4.0 | 10.0 | 8 s | 53.3 % |
| LEARNER | 9 | $40.11 | $14.00 | $2.58 | $7.07 | $2.80 | **$13.52** | 14.0 | 3.0 | 15 s | 66.3 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $60.28 | 94s | 977 | 15.7 |
| 2 | SPRAY | $67.72 | 94s | 1075 | 15.7 |

