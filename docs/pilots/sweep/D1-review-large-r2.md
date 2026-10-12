# Lean fees pilot — 2026-10-12

_D1-review large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 107.7 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 34 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$12.21 vs $19.19; Round 2: -$31.94 vs -$17.10
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.21; Round 2: ρ = -0.41

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 113 | 65 % | 15 s |
| 5 | 151 | 41 % | 20 s |
| 10 | 36 | 92 % | 35 s |
| not split | 12 | 0 % | — |

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
| CAREFUL | 9 | $6.22 | $12.44 | $4.91 | $3.73 | $1.13 | **-$16.17** | 6.2 | 5.0 | 24 s | 359.8 % |
| BALANCED | 9 | $55.22 | $16.00 | $8.26 | $8.87 | $2.78 | **$19.19** | 8.0 | 5.0 | 17 s | 65.2 % |
| BALANCED_HOLDS | 4 | $32.75 | $16.00 | $21.51 | $5.41 | $1.95 | **-$12.21** | 8.0 | 5.0 | 30 s | 137.3 % |
| SPRAY | 9 | $48.00 | $16.00 | $18.26 | $13.42 | $4.00 | **-$3.68** | 8.0 | 5.0 | 33 s | 107.7 % |
| LEARNER | 9 | $26.33 | $16.00 | $6.36 | $4.40 | $1.60 | **-$2.26** | 8.0 | 5.0 | 19 s | 108.6 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $18.56 | $12.89 | $4.88 | $3.05 | $1.16 | **-$3.59** | 6.4 | 5.0 | 17 s | 119.4 % |
| BALANCED | 9 | $19.22 | $16.00 | $7.84 | $9.64 | $2.71 | **-$17.10** | 8.0 | 5.0 | 19 s | 188.9 % |
| BALANCED_HOLDS | 4 | $15.00 | $16.00 | $24.23 | $4.81 | $1.83 | **-$31.94** | 8.0 | 5.0 | 33 s | 312.9 % |
| SPRAY | 9 | $49.00 | $12.00 | $21.92 | $14.31 | $4.00 | **-$3.22** | 4.0 | 10.0 | 34 s | 106.6 % |
| LEARNER | 9 | $58.00 | $12.78 | $4.55 | $5.31 | $2.33 | **$32.92** | 12.7 | 3.0 | 16 s | 43.2 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $106.13 | 94s | 934 | 15.7 |
| 2 | LEARNER | $105.04 | 94s | 991 | 15.7 |

