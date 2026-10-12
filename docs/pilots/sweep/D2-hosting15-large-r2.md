# Lean fees pilot — 2026-10-12

_D2-hosting15 large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 153.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 38 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$23.23 vs -$4.12; Round 2: -$41.34 vs -$36.64
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.03; Round 2: ρ = -0.72

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 116 | 61 % | 16 s |
| 5 | 151 | 44 % | 22 s |
| 10 | 36 | 97 % | 38 s |
| not split | 11 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.15 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $1.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_HOSTING, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $6.44 | $12.44 | $4.92 | $11.04 | $1.13 | **-$23.26** | 6.2 | 5.0 | 17 s | 461.0 % |
| BALANCED | 9 | $51.33 | $16.00 | $8.31 | $28.24 | $2.78 | **-$4.12** | 8.0 | 5.0 | 18 s | 108.0 % |
| BALANCED_HOLDS | 4 | $31.50 | $16.00 | $21.59 | $15.09 | $1.95 | **-$23.23** | 8.0 | 5.0 | 32 s | 173.7 % |
| SPRAY | 9 | $51.67 | $16.00 | $18.27 | $40.78 | $4.00 | **-$27.38** | 8.0 | 5.0 | 32 s | 153.0 % |
| LEARNER | 9 | $27.00 | $16.00 | $6.49 | $12.95 | $1.60 | **-$10.28** | 8.0 | 5.0 | 15 s | 138.1 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $18.56 | $12.89 | $4.89 | $9.07 | $1.16 | **-$9.62** | 6.4 | 5.0 | 22 s | 151.9 % |
| BALANCED | 9 | $18.89 | $16.00 | $7.82 | $28.88 | $2.71 | **-$36.64** | 8.0 | 5.0 | 18 s | 294.0 % |
| BALANCED_HOLDS | 4 | $14.50 | $16.00 | $24.63 | $13.40 | $1.73 | **-$41.34** | 8.0 | 5.0 | 32 s | 385.1 % |
| SPRAY | 9 | $47.67 | $12.00 | $21.92 | $42.98 | $4.00 | **-$33.23** | 4.0 | 10.0 | 38 s | 169.7 % |
| LEARNER | 9 | $58.33 | $12.89 | $4.56 | $15.17 | $2.40 | **$23.19** | 12.9 | 3.0 | 16 s | 60.2 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $90.27 | 94s | 934 | 15.7 |
| 2 | LEARNER | $79.44 | 94s | 993 | 15.7 |

