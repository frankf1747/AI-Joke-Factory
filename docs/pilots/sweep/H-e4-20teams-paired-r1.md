# Lean fees pilot — 2026-10-12

_H-e4-20teams-paired r1 (20 teams, 360 customers)_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 58.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 11 s, Spray 34 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$12.46 vs $18.02; Round 2: -$17.21 vs $6.76
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.27; Round 2: ρ = -0.13

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 71 % | 11 s |
| 5 | 80 | 45 % | 22 s |
| 10 | 16 | 100 % | 34 s |
| not split | 8 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.05 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($0.5 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_STORAGE, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Bot joke seed: pilot-1791773538090. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $24.50 | $14.00 | $2.60 | $3.41 | $1.20 | **$3.12** | 7.0 | 5.0 | 13 s | 87.3 % |
| BALANCED | 4 | $49.75 | $16.00 | $3.81 | $8.96 | $2.85 | **$18.02** | 8.0 | 5.0 | 16 s | 63.8 % |
| BALANCED_HOLDS | 4 | $22.00 | $16.00 | $10.87 | $5.50 | $2.00 | **-$12.46** | 8.0 | 5.0 | 36 s | 156.6 % |
| SPRAY | 4 | $73.25 | $16.00 | $9.72 | $12.79 | $4.00 | **$30.74** | 8.0 | 5.0 | 33 s | 58.0 % |
| LEARNER | 4 | $74.75 | $16.00 | $3.19 | $3.09 | $1.60 | **$50.63** | 8.0 | 5.0 | 15 s | 32.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $13.75 | $12.00 | $2.24 | $2.66 | $1.05 | **-$4.36** | 6.0 | 5.0 | 21 s | 131.7 % |
| BALANCED | 4 | $38.75 | $16.00 | $3.45 | $9.60 | $2.83 | **$6.76** | 8.0 | 5.0 | 18 s | 82.6 % |
| BALANCED_HOLDS | 4 | $18.00 | $16.00 | $12.71 | $4.60 | $1.83 | **-$17.21** | 8.0 | 5.0 | 31 s | 195.6 % |
| SPRAY | 4 | $91.75 | $12.00 | $10.54 | $14.40 | $4.00 | **$50.81** | 4.0 | 10.0 | 34 s | 44.6 % |
| LEARNER | 4 | $92.25 | $12.75 | $2.27 | $4.61 | $2.40 | **$70.10** | 12.8 | 3.0 | 11 s | 24.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $95.72 | 94s | 466 | 15.7 |
| 2 | LEARNER | $131.93 | 94s | 484 | 15.7 |

