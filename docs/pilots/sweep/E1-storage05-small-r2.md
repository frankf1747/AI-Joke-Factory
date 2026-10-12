# Lean fees pilot — 2026-10-12

_E1-storage05 small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 89.3 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 34 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$6.57 vs $21.49; Round 2: -$22.94 vs -$16.19
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.25; Round 2: ρ = -0.56

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 76 | 61 % | 13 s |
| 5 | 99 | 38 % | 20 s |
| 10 | 24 | 88 % | 34 s |
| not split | 6 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 6 | $5.50 | $12.00 | $2.38 | $3.65 | $1.10 | **-$13.80** | 6.0 | 5.0 | 19 s | 350.8 % |
| BALANCED | 6 | $53.17 | $16.00 | $4.15 | $8.65 | $2.75 | **$21.49** | 8.0 | 5.0 | 18 s | 59.6 % |
| BALANCED_HOLDS | 2 | $28.50 | $16.00 | $11.14 | $5.61 | $2.25 | **-$6.57** | 8.0 | 5.0 | 38 s | 123.1 % |
| SPRAY | 6 | $48.00 | $16.00 | $9.31 | $13.57 | $4.00 | **$5.12** | 8.0 | 5.0 | 31 s | 89.3 % |
| LEARNER | 6 | $25.83 | $16.00 | $3.23 | $4.26 | $1.60 | **$0.50** | 8.0 | 5.0 | 18 s | 98.1 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $28.67 | $13.00 | $2.48 | $3.09 | $1.17 | **$8.76** | 6.5 | 5.0 | 17 s | 69.4 % |
| BALANCED | 6 | $16.17 | $16.00 | $4.04 | $9.49 | $2.70 | **-$16.19** | 8.0 | 5.0 | 17 s | 200.2 % |
| BALANCED_HOLDS | 2 | $11.00 | $16.00 | $10.34 | $5.66 | $1.85 | **-$22.94** | 8.0 | 5.0 | 50 s | 308.5 % |
| SPRAY | 6 | $39.17 | $12.00 | $10.79 | $14.25 | $4.00 | **-$1.88** | 4.0 | 10.0 | 34 s | 104.8 % |
| LEARNER | 6 | $64.33 | $13.33 | $2.27 | $4.84 | $2.43 | **$41.33** | 13.0 | 3.0 | 13 s | 35.8 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $63.05 | 94s | 612 | 15.7 |
| 2 | LEARNER | $93.59 | 94s | 655 | 15.7 |

