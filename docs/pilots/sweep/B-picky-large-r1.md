# Lean fees pilot — 2026-10-12

_B-picky large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 64.4 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$8.13 vs $9.77; Round 2: -$16.19 vs -$13.23
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.05; Round 2: ρ = -0.11

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 126 | 67 % | 15 s |
| 5 | 160 | 44 % | 16 s |
| 10 | 36 | 97 % | 7 s |
| not split | 2 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 9 | $4.33 | $12.44 | $1.91 | $4.39 | $1.22 | **-$15.81** | 6.2 | 5.0 | 22 s | 464.9 % |
| BALANCED | 9 | $42.00 | $16.00 | $2.47 | $10.87 | $2.78 | **$9.77** | 8.0 | 5.0 | 11 s | 76.7 % |
| BALANCED_HOLDS | 4 | $28.50 | $16.00 | $7.90 | $9.78 | $2.83 | **-$8.13** | 8.0 | 5.0 | 21 s | 128.5 % |
| SPRAY | 9 | $65.22 | $16.00 | $2.45 | $19.55 | $4.00 | **$23.22** | 8.0 | 5.0 | 8 s | 64.4 % |
| LEARNER | 9 | $31.22 | $16.00 | $2.47 | $5.53 | $1.60 | **$5.38** | 8.0 | 5.0 | 13 s | 82.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $14.00 | $12.89 | $1.89 | $3.83 | $1.20 | **-$5.99** | 6.4 | 5.0 | 14 s | 142.8 % |
| BALANCED | 9 | $19.33 | $16.00 | $2.43 | $11.29 | $2.71 | **-$13.23** | 8.0 | 5.0 | 14 s | 168.4 % |
| BALANCED_HOLDS | 4 | $20.25 | $16.00 | $8.12 | $9.42 | $2.78 | **-$16.19** | 8.0 | 5.0 | 21 s | 179.9 % |
| SPRAY | 9 | $70.44 | $12.00 | $2.50 | $21.32 | $4.00 | **$30.62** | 4.0 | 10.0 | 7 s | 56.5 % |
| LEARNER | 9 | $42.89 | $14.00 | $2.58 | $7.69 | $2.80 | **$15.68** | 14.0 | 3.0 | 14 s | 63.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $64.51 | 94s | 977 | 15.7 |
| 2 | SPRAY | $66.63 | 94s | 1075 | 15.7 |

