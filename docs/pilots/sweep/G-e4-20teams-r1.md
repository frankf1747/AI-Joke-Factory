# Lean fees pilot — 2026-10-12

_E4 at 20 teams r1_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 59.7 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **FAIL** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $16.28 vs $54.85; Round 2: $0.51 vs -$9.22
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.32; Round 2: ρ = -0.34

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 69 % | 14 s |
| 5 | 82 | 49 % | 23 s |
| 10 | 16 | 94 % | 35 s |
| not split | 9 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 4 | $3.00 | $12.00 | $2.41 | $3.96 | $1.10 | **-$16.63** | 6.0 | 5.0 | 11 s | 654.5 % |
| BALANCED | 4 | $86.75 | $16.00 | $4.47 | $8.51 | $2.80 | **$54.85** | 8.0 | 5.0 | 17 s | 36.8 % |
| BALANCED_HOLDS | 4 | $50.25 | $16.00 | $11.34 | $4.74 | $1.80 | **$16.28** | 8.0 | 5.0 | 30 s | 67.6 % |
| SPRAY | 4 | $71.50 | $16.00 | $9.23 | $13.46 | $4.00 | **$28.81** | 8.0 | 5.0 | 33 s | 59.7 % |
| LEARNER | 4 | $42.25 | $16.00 | $3.27 | $3.51 | $1.60 | **$17.63** | 8.0 | 5.0 | 15 s | 58.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $50.75 | $13.50 | $2.48 | $2.92 | $1.15 | **$30.53** | 6.8 | 5.0 | 18 s | 39.8 % |
| BALANCED | 4 | $22.75 | $16.00 | $3.83 | $9.34 | $2.68 | **-$9.22** | 8.0 | 5.0 | 16 s | 140.5 % |
| BALANCED_HOLDS | 4 | $35.25 | $16.00 | $12.07 | $4.76 | $1.85 | **$0.51** | 8.0 | 5.0 | 36 s | 98.6 % |
| SPRAY | 4 | $67.25 | $12.00 | $10.83 | $14.30 | $4.00 | **$26.11** | 4.0 | 10.0 | 35 s | 61.2 % |
| LEARNER | 4 | $78.75 | $12.75 | $2.28 | $4.55 | $2.35 | **$56.70** | 12.8 | 3.0 | 14 s | 28.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $79.99 | 94s | 452 | 15.7 |
| 2 | CAREFUL | $113.52 | 94s | 481 | 15.7 |

