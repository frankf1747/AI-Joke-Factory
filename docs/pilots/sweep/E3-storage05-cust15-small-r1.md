# Lean fees pilot — 2026-10-12

_E3-storage05-cust15 small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=390_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 74.4 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $5.56 vs $44.45; Round 2: -$20.87 vs -$9.32
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.36; Round 2: ρ = -0.32

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 74 | 65 % | 16 s |
| 5 | 99 | 42 % | 20 s |
| 10 | 24 | 96 % | 35 s |
| not split | 5 | 0 % | — |

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
| CAREFUL | 6 | $5.83 | $12.00 | $2.39 | $3.66 | $1.10 | **-$13.48** | 6.0 | 5.0 | 16 s | 331.0 % |
| BALANCED | 6 | $76.17 | $16.00 | $4.14 | $8.70 | $2.75 | **$44.45** | 8.0 | 5.0 | 18 s | 41.6 % |
| BALANCED_HOLDS | 2 | $40.50 | $16.00 | $11.18 | $5.43 | $2.25 | **$5.56** | 8.0 | 5.0 | 35 s | 86.3 % |
| SPRAY | 6 | $57.50 | $16.00 | $9.33 | $13.47 | $4.00 | **$14.70** | 8.0 | 5.0 | 31 s | 74.4 % |
| LEARNER | 6 | $34.83 | $16.00 | $3.17 | $3.77 | $1.60 | **$10.05** | 8.0 | 5.0 | 18 s | 71.1 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $29.50 | $13.00 | $2.49 | $2.96 | $1.17 | **$9.72** | 6.5 | 5.0 | 21 s | 67.1 % |
| BALANCED | 6 | $22.83 | $16.00 | $4.07 | $9.25 | $2.70 | **-$9.32** | 8.0 | 5.0 | 17 s | 140.8 % |
| BALANCED_HOLDS | 2 | $13.00 | $16.00 | $10.29 | $5.63 | $1.85 | **-$20.87** | 8.0 | 5.0 | 38 s | 260.5 % |
| SPRAY | 6 | $59.33 | $12.00 | $10.78 | $13.87 | $4.00 | **$18.68** | 4.0 | 10.0 | 35 s | 68.5 % |
| LEARNER | 6 | $71.50 | $12.67 | $2.28 | $4.76 | $2.33 | **$49.35** | 12.5 | 3.0 | 16 s | 31.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $107.87 | 94s | 612 | 15.7 |
| 2 | LEARNER | $122.97 | 94s | 649 | 15.7 |

