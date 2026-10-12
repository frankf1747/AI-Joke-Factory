# Lean fees pilot — 2026-10-12

_H-e4-20teams-paired r3 (20 teams, 360 customers)_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 44.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 12 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$11.54 vs $25.36; Round 2: -$21.80 vs $21.63
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.16; Round 2: ρ = -0.35

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 52 | 71 % | 12 s |
| 5 | 80 | 61 % | 25 s |
| 10 | 16 | 94 % | 36 s |
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
- Bot joke seed: pilot-1791773916272. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $11.25 | $14.00 | $2.66 | $3.89 | $1.25 | **-$10.74** | 7.0 | 5.0 | 21 s | 195.5 % |
| BALANCED | 4 | $57.25 | $16.00 | $3.81 | $9.21 | $2.75 | **$25.36** | 8.0 | 5.0 | 14 s | 55.7 % |
| BALANCED_HOLDS | 4 | $22.50 | $16.00 | $10.71 | $5.34 | $1.90 | **-$11.54** | 8.0 | 5.0 | 36 s | 151.3 % |
| SPRAY | 4 | $96.25 | $16.00 | $9.53 | $12.83 | $4.00 | **$53.89** | 8.0 | 5.0 | 31 s | 44.0 % |
| LEARNER | 4 | $64.25 | $16.00 | $3.29 | $3.39 | $1.60 | **$39.73** | 8.0 | 5.0 | 14 s | 38.2 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $17.75 | $12.50 | $2.44 | $3.28 | $1.10 | **-$1.74** | 6.3 | 5.0 | 16 s | 109.8 % |
| BALANCED | 4 | $53.50 | $16.00 | $4.02 | $8.97 | $2.75 | **$21.63** | 8.0 | 5.0 | 17 s | 59.6 % |
| BALANCED_HOLDS | 4 | $13.50 | $16.00 | $12.66 | $4.71 | $1.85 | **-$21.80** | 8.0 | 5.0 | 39 s | 261.5 % |
| SPRAY | 4 | $71.50 | $12.00 | $10.79 | $14.56 | $4.00 | **$30.15** | 4.0 | 10.0 | 36 s | 57.8 % |
| LEARNER | 4 | $99.25 | $13.00 | $2.28 | $4.80 | $2.40 | **$76.64** | 13.0 | 3.0 | 12 s | 22.8 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $113.99 | 94s | 460 | 15.7 |
| 2 | LEARNER | $145.78 | 94s | 484 | 15.7 |

