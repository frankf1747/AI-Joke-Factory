# Lean fees pilot — 2026-10-12

_D3-ship-perjoke large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_SHIP_SMALL=0.5 PILOT_SHIP_STANDARD=2 PILOT_SHIP_LARGE=4 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 160.5 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 37 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$18.08 vs -$2.73; Round 2: -$46.40 vs -$36.26
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.08; Round 2: ρ = -0.72

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 113 | 70 % | 14 s |
| 5 | 151 | 42 % | 20 s |
| 10 | 36 | 97 % | 37 s |
| not split | 14 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 9 | $6.11 | $12.44 | $4.91 | $11.24 | $1.13 | **-$23.79** | 6.2 | 5.0 | 14 s | 489.3 % |
| BALANCED | 9 | $52.00 | $16.00 | $8.31 | $27.52 | $2.78 | **-$2.73** | 8.0 | 5.0 | 17 s | 105.2 % |
| BALANCED_HOLDS | 4 | $36.75 | $16.00 | $21.58 | $15.21 | $1.95 | **-$18.08** | 8.0 | 5.0 | 26 s | 149.2 % |
| SPRAY | 9 | $49.67 | $16.00 | $18.27 | $41.44 | $4.00 | **-$30.04** | 8.0 | 5.0 | 31 s | 160.5 % |
| LEARNER | 9 | $26.89 | $16.00 | $6.41 | $13.26 | $1.60 | **-$10.62** | 8.0 | 5.0 | 18 s | 139.5 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $20.00 | $12.89 | $4.88 | $9.05 | $1.16 | **-$8.15** | 6.4 | 5.0 | 16 s | 140.7 % |
| BALANCED | 9 | $19.11 | $16.00 | $7.80 | $28.72 | $2.71 | **-$36.26** | 8.0 | 5.0 | 18 s | 289.7 % |
| BALANCED_HOLDS | 4 | $10.75 | $16.00 | $24.70 | $14.65 | $1.73 | **-$46.40** | 8.0 | 5.0 | 39 s | 531.6 % |
| SPRAY | 9 | $48.67 | $16.00 | $21.91 | $43.20 | $4.00 | **-$36.45** | 4.0 | 10.0 | 37 s | 174.9 % |
| LEARNER | 9 | $59.67 | $6.94 | $4.58 | $14.78 | $2.38 | **$30.86** | 12.9 | 3.0 | 14 s | 48.3 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $49.54 | 94s | 934 | 15.7 |
| 2 | LEARNER | $81.43 | 94s | 991 | 15.7 |

