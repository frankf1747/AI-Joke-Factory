# Lean fees pilot — 2026-10-12

_D3-ship-perjoke small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_SHIP_SMALL=0.5 PILOT_SHIP_STANDARD=2 PILOT_SHIP_LARGE=4 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 175.3 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 33 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$27.87 vs $4.02; Round 2: -$40.23 vs -$37.99
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.25; Round 2: ρ = -0.70

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 75 | 59 % | 12 s |
| 5 | 99 | 39 % | 20 s |
| 10 | 24 | 88 % | 33 s |
| not split | 6 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $0.5 / $2 / $4 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.15 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $1.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_SHIP_SMALL, PILOT_SHIP_STANDARD, PILOT_SHIP_LARGE, PILOT_HOSTING, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $5.33 | $12.00 | $4.78 | $10.70 | $1.10 | **-$23.41** | 6.0 | 5.0 | 26 s | 538.9 % |
| BALANCED | 6 | $56.83 | $16.00 | $8.29 | $25.65 | $2.75 | **$4.02** | 8.0 | 5.0 | 18 s | 92.9 % |
| BALANCED_HOLDS | 2 | $29.00 | $16.00 | $22.35 | $16.19 | $2.25 | **-$27.87** | 8.0 | 5.0 | 35 s | 196.1 % |
| SPRAY | 6 | $45.83 | $16.00 | $18.64 | $41.71 | $4.00 | **-$34.51** | 8.0 | 5.0 | 34 s | 175.3 % |
| LEARNER | 6 | $24.33 | $16.00 | $6.46 | $12.73 | $1.60 | **-$12.70** | 8.0 | 5.0 | 18 s | 152.2 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $23.83 | $13.00 | $4.95 | $9.35 | $1.17 | **-$4.81** | 6.5 | 5.0 | 15 s | 120.2 % |
| BALANCED | 6 | $17.67 | $16.00 | $8.10 | $28.73 | $2.70 | **-$37.99** | 8.0 | 5.0 | 19 s | 315.1 % |
| BALANCED_HOLDS | 2 | $15.50 | $16.00 | $21.05 | $16.73 | $1.85 | **-$40.23** | 8.0 | 5.0 | 41 s | 359.5 % |
| SPRAY | 6 | $44.50 | $16.00 | $21.54 | $42.65 | $4.00 | **-$39.69** | 4.0 | 10.0 | 33 s | 189.2 % |
| LEARNER | 6 | $57.17 | $6.92 | $4.58 | $15.45 | $2.37 | **$27.74** | 12.8 | 3.0 | 13 s | 51.5 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $55.97 | 94s | 612 | 15.7 |
| 2 | LEARNER | $74.55 | 94s | 651 | 15.7 |

