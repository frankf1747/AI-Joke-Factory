# Lean fees pilot — 2026-10-12

_B-picky large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 70.2 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **FAIL** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$4.06 vs $8.72; Round 2: -$17.20 vs -$18.28
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.09; Round 2: ρ = -0.19

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 126 | 67 % | 13 s |
| 5 | 160 | 46 % | 18 s |
| 10 | 36 | 97 % | 8 s |
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
| CAREFUL | 9 | $3.78 | $12.44 | $1.91 | $4.50 | $1.22 | **-$16.48** | 6.2 | 5.0 | 20 s | 536.3 % |
| BALANCED | 9 | $40.89 | $16.00 | $2.46 | $10.80 | $2.78 | **$8.72** | 8.0 | 5.0 | 12 s | 78.7 % |
| BALANCED_HOLDS | 4 | $32.25 | $16.00 | $7.90 | $9.47 | $2.83 | **-$4.06** | 8.0 | 5.0 | 22 s | 112.6 % |
| SPRAY | 9 | $60.22 | $16.00 | $2.44 | $19.81 | $4.00 | **$17.97** | 8.0 | 5.0 | 11 s | 70.2 % |
| LEARNER | 9 | $37.22 | $16.00 | $2.47 | $5.33 | $1.60 | **$11.59** | 8.0 | 5.0 | 13 s | 68.9 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $13.00 | $12.89 | $1.88 | $3.60 | $1.20 | **-$6.75** | 6.4 | 5.0 | 21 s | 151.9 % |
| BALANCED | 9 | $14.56 | $16.00 | $2.45 | $11.55 | $2.71 | **-$18.28** | 8.0 | 5.0 | 13 s | 225.6 % |
| BALANCED_HOLDS | 4 | $19.25 | $16.00 | $8.10 | $9.45 | $2.77 | **-$17.20** | 8.0 | 5.0 | 23 s | 189.4 % |
| SPRAY | 9 | $67.67 | $12.00 | $2.49 | $21.50 | $4.00 | **$27.68** | 4.0 | 10.0 | 7 s | 59.1 % |
| LEARNER | 9 | $54.22 | $14.00 | $2.61 | $7.41 | $2.80 | **$27.26** | 14.0 | 3.0 | 13 s | 49.7 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $60.57 | 94s | 977 | 15.7 |
| 2 | LEARNER | $96.95 | 94s | 1075 | 15.7 |

