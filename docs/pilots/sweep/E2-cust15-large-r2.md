# Lean fees pilot — 2026-10-12

_E2-cust15 large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=600_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 84.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$4.17 vs $31.09; Round 2: -$27.37 vs -$13.71
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.23; Round 2: ρ = -0.43

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 113 | 68 % | 13 s |
| 5 | 150 | 41 % | 20 s |
| 10 | 36 | 94 % | 36 s |
| not split | 15 | 0 % | — |

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
| CAREFUL | 9 | $9.11 | $12.44 | $4.92 | $3.66 | $1.13 | **-$13.22** | 6.2 | 5.0 | 16 s | 245.1 % |
| BALANCED | 9 | $67.33 | $16.00 | $8.31 | $9.03 | $2.78 | **$31.09** | 8.0 | 5.0 | 16 s | 53.8 % |
| BALANCED_HOLDS | 4 | $40.50 | $16.00 | $21.59 | $5.04 | $1.95 | **-$4.17** | 8.0 | 5.0 | 29 s | 110.3 % |
| SPRAY | 9 | $61.56 | $16.00 | $18.22 | $13.48 | $4.00 | **$9.86** | 8.0 | 5.0 | 32 s | 84.0 % |
| LEARNER | 9 | $31.89 | $16.00 | $6.53 | $4.37 | $1.60 | **$3.16** | 8.0 | 5.0 | 18 s | 90.1 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $21.67 | $12.89 | $4.88 | $3.08 | $1.16 | **-$0.51** | 6.4 | 5.0 | 19 s | 102.4 % |
| BALANCED | 9 | $22.44 | $16.00 | $7.82 | $9.49 | $2.71 | **-$13.71** | 8.0 | 5.0 | 16 s | 161.1 % |
| BALANCED_HOLDS | 4 | $19.25 | $16.00 | $24.31 | $4.51 | $1.73 | **-$27.37** | 8.0 | 5.0 | 33 s | 242.2 % |
| SPRAY | 9 | $58.00 | $12.00 | $21.90 | $14.05 | $4.00 | **$6.05** | 4.0 | 10.0 | 35 s | 89.6 % |
| LEARNER | 9 | $84.11 | $13.22 | $4.53 | $4.75 | $2.40 | **$59.09** | 12.9 | 3.0 | 13 s | 29.7 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $101.96 | 94s | 934 | 15.7 |
| 2 | LEARNER | $176.12 | 94s | 993 | 15.7 |

