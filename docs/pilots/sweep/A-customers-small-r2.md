# Lean fees pilot — 2026-10-11

_A-customers small(26 teams) r2:  PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 75.4 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 6 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$10.40 vs $14.74; Round 2: -$19.79 vs -$15.85
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.09; Round 2: ρ = -0.09

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 84 | 70 % | 14 s |
| 5 | 102 | 51 % | 18 s |
| 10 | 24 | 100 % | 6 s |
| not split | 1 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 6 | $9.00 | $12.00 | $1.84 | $3.83 | $1.20 | **-$10.05** | 6.0 | 5.0 | 17 s | 211.7 % |
| BALANCED | 6 | $45.00 | $16.00 | $2.49 | $8.89 | $2.75 | **$14.74** | 8.0 | 5.0 | 11 s | 67.2 % |
| BALANCED_HOLDS | 2 | $27.00 | $16.00 | $8.23 | $10.12 | $2.95 | **-$10.40** | 8.0 | 5.0 | 21 s | 138.5 % |
| SPRAY | 6 | $55.00 | $16.00 | $2.47 | $19.00 | $4.00 | **$13.53** | 8.0 | 5.0 | 10 s | 75.4 % |
| LEARNER | 6 | $34.50 | $16.00 | $2.46 | $5.00 | $1.60 | **$9.20** | 8.0 | 5.0 | 18 s | 73.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $15.67 | $13.00 | $1.91 | $3.58 | $1.23 | **-$4.23** | 6.5 | 5.0 | 13 s | 127.0 % |
| BALANCED | 6 | $15.83 | $16.00 | $2.45 | $10.40 | $2.70 | **-$15.85** | 8.0 | 5.0 | 16 s | 200.1 % |
| BALANCED_HOLDS | 2 | $15.50 | $16.00 | $7.46 | $9.00 | $2.70 | **-$19.79** | 8.0 | 5.0 | 28 s | 227.7 % |
| SPRAY | 6 | $69.17 | $12.00 | $2.50 | $18.60 | $4.00 | **$32.07** | 4.0 | 10.0 | 6 s | 53.6 % |
| LEARNER | 6 | $41.33 | $14.00 | $2.62 | $7.11 | $2.80 | **$14.66** | 14.0 | 3.0 | 14 s | 64.5 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $33.63 | 94s | 632 | 15.7 |
| 2 | SPRAY | $60.03 | 94s | 698 | 15.7 |

