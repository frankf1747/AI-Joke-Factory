# Lean fees pilot — 2026-10-11

_A-customers small(26 teams) r1:  PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 65.3 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 17 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$4.44 vs $11.45; Round 2: -$15.20 vs -$11.49
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.01; Round 2: ρ = -0.01

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 84 | 75 % | 17 s |
| 5 | 102 | 53 % | 14 s |
| 10 | 24 | 100 % | 7 s |
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
| CAREFUL | 6 | $5.33 | $12.00 | $1.85 | $3.95 | $1.20 | **-$13.85** | 6.0 | 5.0 | 19 s | 359.7 % |
| BALANCED | 6 | $41.83 | $16.00 | $2.49 | $9.02 | $2.75 | **$11.45** | 8.0 | 5.0 | 13 s | 72.6 % |
| BALANCED_HOLDS | 2 | $33.00 | $16.00 | $8.24 | $10.14 | $2.95 | **-$4.44** | 8.0 | 5.0 | 19 s | 113.5 % |
| SPRAY | 6 | $63.17 | $16.00 | $2.47 | $18.75 | $4.00 | **$21.95** | 8.0 | 5.0 | 11 s | 65.3 % |
| LEARNER | 6 | $29.50 | $16.00 | $2.41 | $4.71 | $1.60 | **$4.54** | 8.0 | 5.0 | 11 s | 84.6 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $13.67 | $13.00 | $1.90 | $3.49 | $1.23 | **-$6.14** | 6.5 | 5.0 | 9 s | 144.9 % |
| BALANCED | 6 | $20.00 | $16.00 | $2.46 | $10.20 | $2.70 | **-$11.49** | 8.0 | 5.0 | 14 s | 157.5 % |
| BALANCED_HOLDS | 2 | $19.50 | $16.00 | $7.35 | $8.51 | $2.70 | **-$15.20** | 8.0 | 5.0 | 24 s | 177.9 % |
| SPRAY | 6 | $76.50 | $12.00 | $2.49 | $19.22 | $4.00 | **$38.79** | 4.0 | 10.0 | 7 s | 49.3 % |
| LEARNER | 6 | $31.17 | $14.00 | $2.62 | $7.29 | $2.80 | **$4.31** | 14.0 | 3.0 | 17 s | 86.2 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $48.30 | 94s | 632 | 15.7 |
| 2 | SPRAY | $79.29 | 94s | 698 | 15.7 |

