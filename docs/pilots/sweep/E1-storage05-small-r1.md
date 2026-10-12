# Lean fees pilot — 2026-10-12

_E1-storage05 small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 94.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 37 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$4.61 vs $25.10; Round 2: -$25.02 vs -$14.94
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.32; Round 2: ρ = -0.30

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 76 | 68 % | 16 s |
| 5 | 99 | 35 % | 23 s |
| 10 | 24 | 92 % | 36 s |
| not split | 4 | 0 % | — |

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
| CAREFUL | 6 | $5.67 | $12.00 | $2.39 | $3.63 | $1.10 | **-$13.61** | 6.0 | 5.0 | 12 s | 340.2 % |
| BALANCED | 6 | $56.83 | $16.00 | $4.14 | $8.71 | $2.75 | **$25.10** | 8.0 | 5.0 | 17 s | 55.8 % |
| BALANCED_HOLDS | 2 | $30.00 | $16.00 | $11.14 | $5.14 | $2.25 | **-$4.61** | 8.0 | 5.0 | 31 s | 115.4 % |
| SPRAY | 6 | $46.00 | $16.00 | $9.32 | $13.91 | $4.00 | **$2.78** | 8.0 | 5.0 | 33 s | 94.0 % |
| LEARNER | 6 | $28.67 | $16.00 | $3.25 | $4.28 | $1.60 | **$3.30** | 8.0 | 5.0 | 20 s | 88.5 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $20.50 | $13.00 | $2.48 | $3.38 | $1.17 | **$0.30** | 6.5 | 5.0 | 28 s | 98.6 % |
| BALANCED | 6 | $17.50 | $16.00 | $4.06 | $9.55 | $2.70 | **-$14.94** | 8.0 | 5.0 | 23 s | 185.4 % |
| BALANCED_HOLDS | 2 | $9.00 | $16.00 | $10.51 | $5.57 | $1.85 | **-$25.02** | 8.0 | 5.0 | 32 s | 378.0 % |
| SPRAY | 6 | $53.17 | $12.00 | $10.77 | $14.46 | $4.00 | **$11.93** | 4.0 | 10.0 | 37 s | 77.6 % |
| LEARNER | 6 | $54.17 | $12.67 | $2.29 | $5.12 | $2.33 | **$31.64** | 12.7 | 3.0 | 16 s | 41.6 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $55.44 | 94s | 612 | 15.7 |
| 2 | LEARNER | $101.07 | 94s | 649 | 15.7 |

