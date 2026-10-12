# Lean fees pilot — 2026-10-12

_H-e4-20teams-paired r4 (20 teams, 360 customers)_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 42.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 12 s, Spray 34 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$12.82 vs $11.38; Round 2: -$5.36 vs $10.86
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.16; Round 2: ρ = -0.33

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 69 % | 12 s |
| 5 | 79 | 51 % | 24 s |
| 10 | 16 | 100 % | 34 s |
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
- Bot joke seed: pilot-1791774105448. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $34.00 | $14.00 | $2.65 | $3.38 | $1.25 | **$12.53** | 7.0 | 5.0 | 15 s | 63.1 % |
| BALANCED | 4 | $45.00 | $16.00 | $4.31 | $10.25 | $2.95 | **$11.38** | 8.0 | 5.0 | 19 s | 74.7 % |
| BALANCED_HOLDS | 4 | $23.00 | $16.00 | $11.37 | $6.17 | $2.20 | **-$12.82** | 8.0 | 5.0 | 39 s | 155.7 % |
| SPRAY | 4 | $98.75 | $16.00 | $8.33 | $13.10 | $4.00 | **$57.32** | 8.0 | 5.0 | 31 s | 42.0 % |
| LEARNER | 4 | $48.25 | $16.00 | $3.23 | $3.43 | $1.60 | **$23.75** | 8.0 | 5.0 | 15 s | 50.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $10.25 | $11.50 | $2.15 | $2.89 | $1.05 | **-$7.50** | 5.8 | 5.0 | 15 s | 173.1 % |
| BALANCED | 4 | $43.00 | $16.00 | $4.27 | $8.97 | $2.78 | **$10.86** | 8.0 | 5.0 | 21 s | 74.8 % |
| BALANCED_HOLDS | 4 | $29.00 | $16.00 | $11.63 | $4.93 | $1.73 | **-$5.36** | 8.0 | 5.0 | 33 s | 118.5 % |
| SPRAY | 4 | $64.50 | $12.00 | $10.45 | $14.59 | $4.00 | **$23.46** | 4.0 | 10.0 | 34 s | 63.6 % |
| LEARNER | 4 | $108.00 | $13.25 | $2.29 | $3.98 | $2.40 | **$85.97** | 13.0 | 3.0 | 12 s | 20.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $79.64 | 94s | 480 | 15.7 |
| 2 | LEARNER | $119.47 | 94s | 478 | 15.7 |

