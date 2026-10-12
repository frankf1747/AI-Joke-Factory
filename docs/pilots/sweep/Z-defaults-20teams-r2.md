# Lean fees pilot — 2026-10-12

_Shipped defaults, no overrides, 20 teams r2_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 47.8 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 38 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$4.16 vs $45.72; Round 2: -$8.95 vs $41.11
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.04; Round 2: ρ = -0.35

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 78 % | 13 s |
| 5 | 81 | 51 % | 23 s |
| 10 | 16 | 100 % | 38 s |
| not split | 8 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.05 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($0.5 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Customers: the backend default, 18 per team (the count at start is 18 × the number of teams).
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Bot joke seed: pilot-1791777962793. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $9.50 | $13.50 | $2.69 | $4.00 | $1.15 | **-$12.01** | 6.8 | 5.0 | 17 s | 226.4 % |
| BALANCED | 4 | $78.00 | $16.00 | $3.63 | $9.68 | $2.85 | **$45.72** | 8.0 | 5.0 | 16 s | 41.4 % |
| BALANCED_HOLDS | 4 | $30.50 | $16.00 | $10.56 | $5.84 | $2.18 | **-$4.16** | 8.0 | 5.0 | 30 s | 113.6 % |
| SPRAY | 4 | $88.00 | $16.00 | $9.15 | $12.89 | $4.00 | **$45.96** | 8.0 | 5.0 | 30 s | 47.8 % |
| LEARNER | 4 | $56.25 | $16.00 | $3.18 | $3.55 | $1.60 | **$31.69** | 8.0 | 5.0 | 15 s | 43.7 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $7.00 | $12.50 | $2.39 | $3.07 | $1.10 | **-$12.22** | 6.3 | 5.0 | 19 s | 274.5 % |
| BALANCED | 4 | $72.25 | $16.00 | $3.54 | $8.66 | $2.83 | **$41.11** | 8.0 | 5.0 | 18 s | 43.1 % |
| BALANCED_HOLDS | 4 | $25.50 | $16.00 | $12.59 | $3.91 | $1.88 | **-$8.95** | 8.0 | 5.0 | 38 s | 135.1 % |
| SPRAY | 4 | $54.75 | $12.00 | $10.65 | $14.35 | $4.00 | **$13.75** | 4.0 | 10.0 | 38 s | 74.9 % |
| LEARNER | 4 | $97.00 | $12.75 | $2.26 | $4.49 | $2.35 | **$75.03** | 12.8 | 3.0 | 13 s | 22.6 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $160.16 | 94s | 471 | 15.7 |
| 2 | LEARNER | $112.66 | 94s | 486 | 15.7 |

