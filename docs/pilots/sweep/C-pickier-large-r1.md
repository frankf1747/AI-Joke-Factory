# Lean fees pilot — 2026-10-12

_C-pickier large(40 teams) r1: PILOT_BUY_THRESHOLD=8.5 PILOT_PREFERENCE_BASE=5 PILOT_BUDGET=2 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 96.0 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 18 s, Spray 10 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$13.85 vs -$6.94; Round 2: -$27.15 vs -$21.00
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.13; Round 2: ρ = -0.30

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 126 | 68 % | 18 s |
| 5 | 160 | 39 % | 19 s |
| 10 | 36 | 97 % | 10 s |
| not split | 2 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $2.78 | $12.44 | $1.91 | $4.61 | $1.22 | **-$17.59** | 6.2 | 5.0 | 15 s | 733.4 % |
| BALANCED | 9 | $25.89 | $16.00 | $2.45 | $11.47 | $2.78 | **-$6.94** | 8.0 | 5.0 | 12 s | 126.8 % |
| BALANCED_HOLDS | 4 | $23.00 | $16.00 | $7.93 | $9.98 | $2.83 | **-$13.85** | 8.0 | 5.0 | 26 s | 160.2 % |
| SPRAY | 9 | $45.11 | $16.00 | $2.45 | $20.87 | $4.00 | **$1.79** | 8.0 | 5.0 | 12 s | 96.0 % |
| LEARNER | 9 | $20.89 | $16.00 | $2.48 | $6.67 | $1.60 | **-$6.11** | 8.0 | 5.0 | 24 s | 129.2 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $11.89 | $12.89 | $1.89 | $3.84 | $1.20 | **-$8.11** | 6.4 | 5.0 | 19 s | 168.2 % |
| BALANCED | 9 | $11.89 | $16.00 | $2.44 | $11.60 | $2.71 | **-$21.00** | 8.0 | 5.0 | 17 s | 276.6 % |
| BALANCED_HOLDS | 4 | $9.75 | $16.00 | $8.16 | $9.84 | $2.78 | **-$27.15** | 8.0 | 5.0 | 24 s | 378.4 % |
| SPRAY | 9 | $46.22 | $12.00 | $2.50 | $22.14 | $4.00 | **$5.59** | 4.0 | 10.0 | 10 s | 87.9 % |
| LEARNER | 9 | $28.33 | $14.00 | $2.59 | $8.35 | $2.80 | **$0.45** | 14.0 | 3.0 | 18 s | 98.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $26.47 | 94s | 977 | 15.7 |
| 2 | SPRAY | $39.88 | 94s | 1075 | 15.7 |

