# Lean fees pilot — 2026-10-12

_E4 at 20 teams r2_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 57.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **FAIL** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $20.99 vs $49.51; Round 2: $1.68 vs -$10.72
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.38; Round 2: ρ = -0.34

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 73 % | 15 s |
| 5 | 82 | 49 % | 21 s |
| 10 | 16 | 94 % | 35 s |
| not split | 10 | 0 % | — |

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
| CAREFUL | 4 | $3.75 | $12.00 | $2.41 | $3.73 | $1.10 | **-$15.66** | 6.0 | 5.0 | 18 s | 517.6 % |
| BALANCED | 4 | $81.25 | $16.00 | $4.49 | $8.33 | $2.80 | **$49.51** | 8.0 | 5.0 | 17 s | 39.1 % |
| BALANCED_HOLDS | 4 | $55.25 | $16.00 | $11.36 | $5.01 | $1.80 | **$20.99** | 8.0 | 5.0 | 33 s | 62.0 % |
| SPRAY | 4 | $73.25 | $16.00 | $9.19 | $13.22 | $4.00 | **$30.85** | 8.0 | 5.0 | 31 s | 57.9 % |
| LEARNER | 4 | $41.50 | $16.00 | $3.29 | $3.56 | $1.60 | **$16.81** | 8.0 | 5.0 | 15 s | 59.5 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $47.75 | $13.50 | $2.48 | $2.96 | $1.15 | **$27.49** | 6.8 | 5.0 | 15 s | 42.4 % |
| BALANCED | 4 | $20.75 | $16.00 | $3.85 | $8.82 | $2.68 | **-$10.72** | 8.0 | 5.0 | 17 s | 151.7 % |
| BALANCED_HOLDS | 4 | $36.75 | $16.00 | $12.05 | $5.11 | $1.85 | **$1.68** | 8.0 | 5.0 | 32 s | 95.4 % |
| SPRAY | 4 | $63.25 | $12.00 | $10.84 | $14.14 | $4.00 | **$22.26** | 4.0 | 10.0 | 35 s | 64.8 % |
| LEARNER | 4 | $88.25 | $13.25 | $2.30 | $4.57 | $2.40 | **$65.62** | 13.0 | 3.0 | 15 s | 25.6 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $79.05 | 94s | 452 | 15.7 |
| 2 | LEARNER | $106.17 | 94s | 483 | 15.7 |

