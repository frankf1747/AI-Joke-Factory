# Lean fees pilot — 2026-10-12

_H-e3-20teams-paired r3 (20 teams, 300 customers)_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 53.3 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 28 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$11.78 vs $20.55; Round 2: -$20.91 vs $4.12
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.05; Round 2: ρ = -0.09

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 69 % | 13 s |
| 5 | 80 | 46 % | 21 s |
| 10 | 16 | 88 % | 29 s |
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
- Bot joke seed: pilot-1791774672623. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $21.00 | $13.50 | $2.59 | $3.53 | $1.20 | **$0.00** | 6.8 | 5.0 | 15 s | 100.0 % |
| BALANCED | 4 | $52.50 | $16.00 | $3.86 | $9.15 | $2.83 | **$20.55** | 8.0 | 5.0 | 18 s | 60.9 % |
| BALANCED_HOLDS | 4 | $22.75 | $16.00 | $10.56 | $5.84 | $2.05 | **-$11.78** | 8.0 | 5.0 | 35 s | 151.8 % |
| SPRAY | 4 | $79.25 | $16.00 | $8.80 | $13.45 | $4.00 | **$37.00** | 8.0 | 5.0 | 34 s | 53.3 % |
| LEARNER | 4 | $30.50 | $16.00 | $3.35 | $3.97 | $1.60 | **$5.34** | 8.0 | 5.0 | 18 s | 82.5 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $12.25 | $12.50 | $2.51 | $3.18 | $1.15 | **-$7.26** | 6.3 | 5.0 | 15 s | 159.3 % |
| BALANCED | 4 | $36.75 | $16.00 | $3.85 | $9.74 | $2.93 | **$4.12** | 8.0 | 5.0 | 15 s | 88.8 % |
| BALANCED_HOLDS | 4 | $14.00 | $16.00 | $12.39 | $4.69 | $1.75 | **-$20.91** | 8.0 | 5.0 | 35 s | 249.4 % |
| SPRAY | 4 | $82.50 | $12.00 | $9.27 | $15.87 | $4.00 | **$41.36** | 4.0 | 10.0 | 28 s | 49.9 % |
| LEARNER | 4 | $72.75 | $13.25 | $2.28 | $4.78 | $2.40 | **$49.91** | 13.0 | 3.0 | 13 s | 31.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $111.31 | 94s | 467 | 15.7 |
| 2 | LEARNER | $121.89 | 94s | 489 | 15.7 |

