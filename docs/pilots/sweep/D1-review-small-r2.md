# Lean fees pilot — 2026-10-12

_D1-review small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 121.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$15.58 vs $25.10; Round 2: -$28.77 vs -$19.45
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.12; Round 2: ρ = -0.45

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 75 | 67 % | 15 s |
| 5 | 99 | 39 % | 18 s |
| 10 | 24 | 96 % | 36 s |
| not split | 5 | 0 % | — |

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
| CAREFUL | 6 | $6.67 | $12.00 | $4.77 | $3.58 | $1.10 | **-$14.95** | 6.0 | 5.0 | 14 s | 324.2 % |
| BALANCED | 6 | $60.83 | $16.00 | $8.29 | $8.57 | $2.75 | **$25.10** | 8.0 | 5.0 | 19 s | 58.7 % |
| BALANCED_HOLDS | 2 | $30.50 | $16.00 | $22.27 | $5.48 | $2.25 | **-$15.58** | 8.0 | 5.0 | 38 s | 151.1 % |
| SPRAY | 6 | $43.50 | $16.00 | $18.66 | $13.99 | $4.00 | **-$9.15** | 8.0 | 5.0 | 33 s | 121.0 % |
| LEARNER | 6 | $26.67 | $16.00 | $6.26 | $4.17 | $1.60 | **-$1.60** | 8.0 | 5.0 | 16 s | 106.0 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $24.50 | $13.00 | $4.96 | $3.05 | $1.17 | **$2.15** | 6.5 | 5.0 | 16 s | 91.2 % |
| BALANCED | 6 | $16.83 | $16.00 | $8.12 | $9.33 | $2.70 | **-$19.45** | 8.0 | 5.0 | 17 s | 215.5 % |
| BALANCED_HOLDS | 2 | $15.50 | $16.00 | $20.84 | $5.49 | $1.85 | **-$28.77** | 8.0 | 5.0 | 28 s | 285.6 % |
| SPRAY | 6 | $45.67 | $12.00 | $21.59 | $14.11 | $4.00 | **-$6.03** | 4.0 | 10.0 | 36 s | 113.2 % |
| LEARNER | 6 | $59.83 | $12.83 | $4.55 | $5.17 | $2.37 | **$34.80** | 12.7 | 3.0 | 15 s | 41.8 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $54.61 | 94s | 612 | 15.7 |
| 2 | LEARNER | $112.84 | 94s | 651 | 15.7 |

