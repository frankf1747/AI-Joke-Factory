# Lean fees pilot — 2026-10-12

_C-pickier small(26 teams) r1: PILOT_BUY_THRESHOLD=8.5 PILOT_PREFERENCE_BASE=5 PILOT_BUDGET=2 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 102.2 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$21.39 vs -$2.41; Round 2: -$26.97 vs -$20.93
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.06; Round 2: ρ = -0.28

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 84 | 63 % | 16 s |
| 5 | 102 | 35 % | 13 s |
| 10 | 24 | 96 % | 7 s |
| not split | 1 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $3.50 | $12.00 | $1.86 | $4.50 | $1.20 | **-$16.24** | 6.0 | 5.0 | 14 s | 564.0 % |
| BALANCED | 6 | $30.00 | $16.00 | $2.48 | $11.05 | $2.75 | **-$2.41** | 8.0 | 5.0 | 12 s | 108.0 % |
| BALANCED_HOLDS | 2 | $17.00 | $16.00 | $8.24 | $11.10 | $2.95 | **-$21.39** | 8.0 | 5.0 | 30 s | 225.8 % |
| SPRAY | 6 | $42.67 | $16.00 | $2.47 | $21.12 | $4.00 | **-$0.93** | 8.0 | 5.0 | 16 s | 102.2 % |
| LEARNER | 6 | $20.33 | $16.00 | $2.46 | $6.02 | $1.60 | **-$5.99** | 8.0 | 5.0 | 12 s | 129.4 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $12.00 | $13.00 | $1.89 | $3.99 | $1.23 | **-$8.31** | 6.5 | 5.0 | 6 s | 169.2 % |
| BALANCED | 6 | $11.50 | $16.00 | $2.46 | $11.14 | $2.70 | **-$20.93** | 8.0 | 5.0 | 14 s | 282.0 % |
| BALANCED_HOLDS | 2 | $9.00 | $16.00 | $7.40 | $9.73 | $2.70 | **-$26.97** | 8.0 | 5.0 | 22 s | 399.6 % |
| SPRAY | 6 | $51.33 | $12.00 | $2.49 | $21.59 | $4.00 | **$11.25** | 4.0 | 10.0 | 7 s | 78.1 % |
| LEARNER | 6 | $26.17 | $14.00 | $2.64 | $7.61 | $2.80 | **-$1.03** | 14.0 | 3.0 | 16 s | 103.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $19.15 | 94s | 632 | 15.7 |
| 2 | SPRAY | $64.52 | 94s | 698 | 15.7 |

