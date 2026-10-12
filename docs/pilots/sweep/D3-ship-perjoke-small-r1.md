# Lean fees pilot — 2026-10-12

_D3-ship-perjoke small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_SHIP_SMALL=0.5 PILOT_SHIP_STANDARD=2 PILOT_SHIP_LARGE=4 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 179.5 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$25.73 vs $7.49; Round 2: -$43.71 vs -$35.20
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.22; Round 2: ρ = -0.72

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 76 | 67 % | 16 s |
| 5 | 99 | 38 % | 20 s |
| 10 | 24 | 96 % | 36 s |
| not split | 4 | 0 % | — |

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
| CAREFUL | 6 | $6.83 | $12.00 | $4.78 | $10.69 | $1.10 | **-$21.91** | 6.0 | 5.0 | 22 s | 420.6 % |
| BALANCED | 6 | $60.33 | $16.00 | $8.33 | $25.64 | $2.75 | **$7.49** | 8.0 | 5.0 | 17 s | 87.6 % |
| BALANCED_HOLDS | 2 | $31.00 | $16.00 | $22.28 | $16.12 | $2.25 | **-$25.73** | 8.0 | 5.0 | 36 s | 183.0 % |
| SPRAY | 6 | $44.50 | $16.00 | $18.67 | $41.21 | $4.00 | **-$35.38** | 8.0 | 5.0 | 32 s | 179.5 % |
| LEARNER | 6 | $25.33 | $16.00 | $6.41 | $13.26 | $1.60 | **-$12.17** | 8.0 | 5.0 | 21 s | 148.1 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $23.50 | $13.00 | $4.96 | $9.29 | $1.17 | **-$5.09** | 6.5 | 5.0 | 18 s | 121.7 % |
| BALANCED | 6 | $19.67 | $16.00 | $8.11 | $27.93 | $2.70 | **-$35.20** | 8.0 | 5.0 | 19 s | 279.0 % |
| BALANCED_HOLDS | 2 | $12.00 | $16.00 | $21.01 | $16.76 | $1.85 | **-$43.71** | 8.0 | 5.0 | 29 s | 464.3 % |
| SPRAY | 6 | $48.33 | $16.00 | $21.54 | $42.80 | $4.00 | **-$36.00** | 4.0 | 10.0 | 36 s | 174.5 % |
| LEARNER | 6 | $52.83 | $6.33 | $4.58 | $14.22 | $2.37 | **$25.22** | 12.7 | 3.0 | 15 s | 52.3 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $36.04 | 94s | 612 | 15.7 |
| 2 | LEARNER | $59.80 | 94s | 651 | 15.7 |

