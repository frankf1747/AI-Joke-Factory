# Lean fees pilot — 2026-10-12

_D3-ship-perjoke large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_SHIP_SMALL=0.5 PILOT_SHIP_STANDARD=2 PILOT_SHIP_LARGE=4 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 154.3 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 39 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$21.31 vs -$0.96; Round 2: -$42.63 vs -$33.67
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.06; Round 2: ρ = -0.73

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 115 | 58 % | 15 s |
| 5 | 151 | 42 % | 20 s |
| 10 | 36 | 97 % | 39 s |
| not split | 13 | 0 % | — |

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
| CAREFUL | 9 | $5.89 | $12.44 | $4.91 | $11.23 | $1.13 | **-$24.01** | 6.2 | 5.0 | 19 s | 507.7 % |
| BALANCED | 9 | $54.00 | $16.00 | $8.30 | $27.75 | $2.78 | **-$0.96** | 8.0 | 5.0 | 18 s | 101.8 % |
| BALANCED_HOLDS | 4 | $33.50 | $16.00 | $21.60 | $15.17 | $1.95 | **-$21.31** | 8.0 | 5.0 | 28 s | 163.6 % |
| SPRAY | 9 | $51.33 | $16.00 | $18.27 | $40.93 | $4.00 | **-$27.86** | 8.0 | 5.0 | 32 s | 154.3 % |
| LEARNER | 9 | $24.44 | $16.00 | $6.33 | $12.70 | $1.60 | **-$12.42** | 8.0 | 5.0 | 17 s | 150.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $19.33 | $12.89 | $4.89 | $9.32 | $1.16 | **-$9.09** | 6.4 | 5.0 | 16 s | 147.0 % |
| BALANCED | 9 | $21.56 | $16.00 | $7.80 | $28.58 | $2.71 | **-$33.67** | 8.0 | 5.0 | 19 s | 256.2 % |
| BALANCED_HOLDS | 4 | $13.75 | $16.00 | $24.64 | $13.94 | $1.73 | **-$42.63** | 8.0 | 5.0 | 33 s | 410.0 % |
| SPRAY | 9 | $48.11 | $16.00 | $21.92 | $43.40 | $4.00 | **-$37.21** | 4.0 | 10.0 | 39 s | 177.4 % |
| LEARNER | 9 | $55.22 | $6.83 | $4.58 | $15.40 | $2.40 | **$25.89** | 13.0 | 3.0 | 15 s | 53.1 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $56.54 | 94s | 934 | 15.7 |
| 2 | LEARNER | $60.85 | 94s | 993 | 15.7 |

