# Lean fees pilot — 2026-10-12

_E4-storage05-cust18 small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=468_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 64.7 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $11.69 vs $60.81; Round 2: -$14.94 vs -$4.81
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.35; Round 2: ρ = -0.28

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 74 | 69 % | 14 s |
| 5 | 99 | 42 % | 18 s |
| 10 | 24 | 96 % | 36 s |
| not split | 6 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 6 | $9.33 | $12.00 | $2.39 | $3.46 | $1.10 | **-$9.78** | 6.0 | 5.0 | 16 s | 204.8 % |
| BALANCED | 6 | $92.17 | $16.00 | $4.15 | $8.33 | $2.75 | **$60.81** | 8.0 | 5.0 | 18 s | 34.0 % |
| BALANCED_HOLDS | 2 | $46.50 | $16.00 | $11.18 | $5.30 | $2.25 | **$11.69** | 8.0 | 5.0 | 33 s | 74.9 % |
| SPRAY | 6 | $66.33 | $16.00 | $9.32 | $13.62 | $4.00 | **$23.40** | 8.0 | 5.0 | 34 s | 64.7 % |
| LEARNER | 6 | $36.67 | $16.00 | $3.12 | $3.96 | $1.60 | **$11.75** | 8.0 | 5.0 | 18 s | 68.0 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $30.50 | $13.00 | $2.49 | $3.05 | $1.17 | **$10.63** | 6.5 | 5.0 | 14 s | 65.2 % |
| BALANCED | 6 | $27.33 | $16.00 | $4.06 | $9.25 | $2.70 | **-$4.81** | 8.0 | 5.0 | 18 s | 117.6 % |
| BALANCED_HOLDS | 2 | $18.50 | $16.00 | $10.46 | $5.03 | $1.85 | **-$14.94** | 8.0 | 5.0 | 29 s | 180.7 % |
| SPRAY | 6 | $74.33 | $12.00 | $10.79 | $13.78 | $4.00 | **$33.76** | 4.0 | 10.0 | 36 s | 54.6 % |
| LEARNER | 6 | $84.17 | $13.00 | $2.29 | $4.98 | $2.33 | **$61.44** | 12.7 | 3.0 | 14 s | 27.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $149.80 | 94s | 612 | 15.7 |
| 2 | LEARNER | $130.07 | 94s | 649 | 15.7 |

