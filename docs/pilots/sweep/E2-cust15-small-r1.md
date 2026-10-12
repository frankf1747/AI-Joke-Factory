# Lean fees pilot — 2026-10-12

_E2-cust15 small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=390_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 99.2 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$1.57 vs $39.38; Round 2: -$31.21 vs -$15.21
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.34; Round 2: ρ = -0.41

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 77 | 71 % | 14 s |
| 5 | 98 | 40 % | 21 s |
| 10 | 24 | 96 % | 35 s |
| not split | 6 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 6 | $7.83 | $12.00 | $4.78 | $3.52 | $1.10 | **-$13.73** | 6.0 | 5.0 | 21 s | 275.3 % |
| BALANCED | 6 | $75.00 | $16.00 | $8.29 | $8.46 | $2.75 | **$39.38** | 8.0 | 5.0 | 19 s | 47.5 % |
| BALANCED_HOLDS | 2 | $44.50 | $16.00 | $22.35 | $5.40 | $2.25 | **-$1.57** | 8.0 | 5.0 | 35 s | 103.5 % |
| SPRAY | 6 | $52.50 | $16.00 | $18.64 | $13.45 | $4.00 | **$0.41** | 8.0 | 5.0 | 37 s | 99.2 % |
| LEARNER | 6 | $33.17 | $16.00 | $6.52 | $3.97 | $1.60 | **$4.85** | 8.0 | 5.0 | 15 s | 85.4 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $25.33 | $13.00 | $4.95 | $3.03 | $1.17 | **$3.02** | 6.5 | 5.0 | 19 s | 88.1 % |
| BALANCED | 6 | $21.33 | $16.00 | $8.10 | $9.62 | $2.70 | **-$15.21** | 8.0 | 5.0 | 21 s | 171.3 % |
| BALANCED_HOLDS | 2 | $13.50 | $16.00 | $21.06 | $5.70 | $1.85 | **-$31.21** | 8.0 | 5.0 | 42 s | 331.2 % |
| SPRAY | 6 | $59.33 | $12.00 | $21.55 | $13.94 | $4.00 | **$7.85** | 4.0 | 10.0 | 35 s | 86.8 % |
| LEARNER | 6 | $79.83 | $13.17 | $4.57 | $4.72 | $2.40 | **$54.86** | 13.0 | 3.0 | 14 s | 31.3 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $113.61 | 94s | 612 | 15.7 |
| 2 | LEARNER | $146.53 | 94s | 653 | 15.7 |

