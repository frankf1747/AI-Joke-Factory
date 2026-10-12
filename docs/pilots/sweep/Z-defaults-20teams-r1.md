# Lean fees pilot — 2026-10-12

_Shipped defaults, no overrides, 20 teams r1_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 50.8 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 31 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$8.87 vs $10.93; Round 2: -$9.84 vs $14.47
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.24; Round 2: ρ = -0.39

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 52 | 67 % | 14 s |
| 5 | 79 | 53 % | 25 s |
| 10 | 16 | 88 % | 31 s |
| not split | 9 | 0 % | — |

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
- Bot joke seed: pilot-1791777773581. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $44.75 | $13.50 | $2.57 | $3.32 | $1.20 | **$23.98** | 6.8 | 5.0 | 13 s | 46.4 % |
| BALANCED | 4 | $43.75 | $16.00 | $4.30 | $9.62 | $2.78 | **$10.93** | 8.0 | 5.0 | 19 s | 75.0 % |
| BALANCED_HOLDS | 4 | $26.00 | $16.00 | $11.02 | $5.84 | $1.93 | **-$8.87** | 8.0 | 5.0 | 34 s | 134.1 % |
| SPRAY | 4 | $82.50 | $16.00 | $9.00 | $12.88 | $4.00 | **$40.62** | 8.0 | 5.0 | 30 s | 50.8 % |
| LEARNER | 4 | $55.75 | $16.00 | $3.32 | $3.76 | $1.60 | **$30.83** | 8.0 | 5.0 | 14 s | 44.7 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $23.75 | $12.00 | $2.22 | $2.82 | $1.05 | **$5.50** | 6.0 | 5.0 | 14 s | 76.8 % |
| BALANCED | 4 | $46.25 | $16.00 | $4.39 | $8.51 | $2.75 | **$14.47** | 8.0 | 5.0 | 20 s | 68.7 % |
| BALANCED_HOLDS | 4 | $24.00 | $16.00 | $12.08 | $4.06 | $1.63 | **-$9.84** | 8.0 | 5.0 | 39 s | 141.0 % |
| SPRAY | 4 | $61.00 | $12.00 | $10.40 | $15.07 | $4.00 | **$19.54** | 4.0 | 10.0 | 31 s | 68.0 % |
| LEARNER | 4 | $98.75 | $13.00 | $2.23 | $4.87 | $2.40 | **$76.13** | 13.0 | 3.0 | 15 s | 22.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | CAREFUL | $111.18 | 94s | 460 | 15.7 |
| 2 | LEARNER | $133.50 | 94s | 473 | 15.7 |

