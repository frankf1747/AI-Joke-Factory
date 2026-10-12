# Lean fees pilot — 2026-10-11

_S0 baseline, 44 teams, spec defaults_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 247.9 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 22 s, Spray 16 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$23.71 vs -$23.71; Round 2: -$30.39 vs -$27.11
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.05; Round 2: ρ = -0.61

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 140 | 49 % | 22 s |
| 5 | 174 | 30 % | 22 s |
| 10 | 40 | 93 % | 16 s |
| not split | 2 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 10 CAREFUL, 10 BALANCED, 10 SPRAY, 10 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 10 | $2.60 | $12.60 | $1.93 | $4.37 | $1.24 | **-$17.73** | 6.3 | 5.0 | 14 s | 781.9 % |
| BALANCED | 10 | $9.40 | $16.00 | $2.46 | $11.75 | $2.78 | **-$23.71** | 8.0 | 5.0 | 16 s | 352.2 % |
| BALANCED_HOLDS | 4 | $12.50 | $16.00 | $7.66 | $9.61 | $2.83 | **-$23.71** | 8.0 | 5.0 | 24 s | 289.7 % |
| SPRAY | 10 | $17.50 | $16.00 | $2.44 | $20.95 | $4.00 | **-$25.89** | 8.0 | 5.0 | 19 s | 247.9 % |
| LEARNER | 10 | $9.40 | $16.00 | $2.46 | $7.35 | $1.60 | **-$18.25** | 8.0 | 5.0 | 24 s | 294.2 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 10 | $4.60 | $12.80 | $1.90 | $4.07 | $1.20 | **-$15.55** | 6.4 | 5.0 | 24 s | 438.1 % |
| BALANCED | 10 | $5.70 | $16.00 | $2.51 | $11.46 | $2.71 | **-$27.11** | 8.0 | 5.0 | 20 s | 575.7 % |
| BALANCED_HOLDS | 4 | $5.75 | $16.00 | $8.97 | $8.44 | $2.57 | **-$30.39** | 8.0 | 5.0 | 23 s | 628.4 % |
| SPRAY | 10 | $17.10 | $12.00 | $2.49 | $22.73 | $4.00 | **-$24.12** | 4.0 | 10.0 | 16 s | 241.1 % |
| LEARNER | 10 | $12.90 | $14.00 | $2.67 | $8.81 | $2.80 | **-$15.52** | 14.0 | 3.0 | 22 s | 220.3 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | -$3.73 | 94s | 1075 | 15.7 |
| 2 | LEARNER | -$4.26 | 94s | 1174 | 15.7 |

