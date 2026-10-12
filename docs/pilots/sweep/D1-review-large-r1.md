# Lean fees pilot — 2026-10-12

_D1-review large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 99.2 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 37 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$12.36 vs $17.53; Round 2: -$32.80 vs -$18.96
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.17; Round 2: ρ = -0.45

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 115 | 60 % | 15 s |
| 5 | 151 | 42 % | 21 s |
| 10 | 36 | 89 % | 37 s |
| not split | 13 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $6.22 | $12.44 | $4.92 | $3.85 | $1.13 | **-$16.30** | 6.2 | 5.0 | 19 s | 361.9 % |
| BALANCED | 9 | $53.67 | $16.00 | $8.30 | $8.94 | $2.78 | **$17.53** | 8.0 | 5.0 | 18 s | 67.3 % |
| BALANCED_HOLDS | 4 | $32.50 | $16.00 | $21.59 | $5.23 | $1.95 | **-$12.36** | 8.0 | 5.0 | 30 s | 138.0 % |
| SPRAY | 9 | $52.22 | $16.00 | $18.26 | $13.54 | $4.00 | **$0.42** | 8.0 | 5.0 | 31 s | 99.2 % |
| LEARNER | 9 | $24.89 | $16.00 | $6.57 | $4.42 | $1.60 | **-$3.93** | 8.0 | 5.0 | 14 s | 115.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $21.33 | $12.89 | $4.89 | $2.96 | $1.16 | **-$0.74** | 6.4 | 5.0 | 19 s | 103.5 % |
| BALANCED | 9 | $17.44 | $16.00 | $7.83 | $9.74 | $2.71 | **-$18.96** | 8.0 | 5.0 | 20 s | 208.7 % |
| BALANCED_HOLDS | 4 | $14.25 | $16.00 | $24.63 | $4.62 | $1.73 | **-$32.80** | 8.0 | 5.0 | 38 s | 330.2 % |
| SPRAY | 9 | $50.22 | $12.00 | $21.91 | $14.37 | $4.00 | **-$2.06** | 4.0 | 10.0 | 37 s | 104.1 % |
| LEARNER | 9 | $54.67 | $13.22 | $4.58 | $5.06 | $2.40 | **$29.29** | 13.0 | 3.0 | 15 s | 46.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $62.61 | 94s | 934 | 15.7 |
| 2 | LEARNER | $54.01 | 94s | 993 | 15.7 |

