# Lean fees pilot — 2026-10-12

_E2-cust15 small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=390_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 93.7 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 33 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$3.72 vs $42.60; Round 2: -$25.93 vs -$14.78
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.30; Round 2: ρ = -0.50

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 76 | 63 % | 13 s |
| 5 | 98 | 45 % | 20 s |
| 10 | 24 | 92 % | 33 s |
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
| CAREFUL | 6 | $8.50 | $12.00 | $4.77 | $3.37 | $1.10 | **-$12.91** | 6.0 | 5.0 | 17 s | 251.8 % |
| BALANCED | 6 | $78.33 | $16.00 | $8.31 | $8.55 | $2.75 | **$42.60** | 8.0 | 5.0 | 17 s | 45.6 % |
| BALANCED_HOLDS | 2 | $42.50 | $16.00 | $22.35 | $5.55 | $2.25 | **-$3.72** | 8.0 | 5.0 | 32 s | 108.8 % |
| SPRAY | 6 | $55.83 | $16.00 | $18.66 | $13.67 | $4.00 | **$3.50** | 8.0 | 5.0 | 34 s | 93.7 % |
| LEARNER | 6 | $30.17 | $16.00 | $6.41 | $4.06 | $1.60 | **$1.86** | 8.0 | 5.0 | 18 s | 93.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $31.67 | $13.00 | $4.95 | $2.83 | $1.17 | **$9.55** | 6.5 | 5.0 | 18 s | 69.9 % |
| BALANCED | 6 | $21.50 | $16.00 | $8.10 | $9.35 | $2.70 | **-$14.78** | 8.0 | 5.0 | 18 s | 168.7 % |
| BALANCED_HOLDS | 2 | $18.50 | $16.00 | $21.05 | $5.44 | $1.85 | **-$25.93** | 8.0 | 5.0 | 41 s | 240.2 % |
| SPRAY | 6 | $59.00 | $12.00 | $21.50 | $13.93 | $4.00 | **$7.57** | 4.0 | 10.0 | 33 s | 87.2 % |
| LEARNER | 6 | $66.83 | $12.67 | $4.57 | $5.07 | $2.33 | **$42.08** | 12.7 | 3.0 | 13 s | 37.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $102.51 | 94s | 612 | 15.7 |
| 2 | LEARNER | $91.92 | 94s | 649 | 15.7 |

