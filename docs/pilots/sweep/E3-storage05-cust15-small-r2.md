# Lean fees pilot — 2026-10-12

_E3-storage05-cust15 small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=390_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 72.8 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $0.03 vs $41.45; Round 2: -$17.92 vs -$11.95
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.41; Round 2: ρ = -0.41

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 74 | 76 % | 16 s |
| 5 | 99 | 40 % | 19 s |
| 10 | 24 | 92 % | 36 s |
| not split | 5 | 0 % | — |

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
| CAREFUL | 6 | $6.50 | $12.00 | $2.39 | $3.52 | $1.10 | **-$12.67** | 6.0 | 5.0 | 17 s | 294.9 % |
| BALANCED | 6 | $72.83 | $16.00 | $4.13 | $8.37 | $2.75 | **$41.45** | 8.0 | 5.0 | 16 s | 43.1 % |
| BALANCED_HOLDS | 2 | $35.00 | $16.00 | $11.18 | $5.46 | $2.25 | **$0.03** | 8.0 | 5.0 | 37 s | 99.9 % |
| SPRAY | 6 | $59.00 | $16.00 | $9.32 | $13.62 | $4.00 | **$16.06** | 8.0 | 5.0 | 34 s | 72.8 % |
| LEARNER | 6 | $33.17 | $16.00 | $3.23 | $4.13 | $1.60 | **$7.97** | 8.0 | 5.0 | 17 s | 76.0 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $28.17 | $13.00 | $2.48 | $3.14 | $1.17 | **$8.21** | 6.5 | 5.0 | 15 s | 70.8 % |
| BALANCED | 6 | $20.17 | $16.00 | $4.07 | $9.21 | $2.70 | **-$11.95** | 8.0 | 5.0 | 18 s | 159.2 % |
| BALANCED_HOLDS | 2 | $16.00 | $16.00 | $10.28 | $5.70 | $1.85 | **-$17.92** | 8.0 | 5.0 | 42 s | 212.0 % |
| SPRAY | 6 | $53.83 | $12.00 | $10.79 | $13.93 | $4.00 | **$13.11** | 4.0 | 10.0 | 35 s | 75.6 % |
| LEARNER | 6 | $82.33 | $12.67 | $2.28 | $4.63 | $2.30 | **$60.35** | 12.5 | 3.0 | 16 s | 26.7 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $121.97 | 94s | 612 | 15.7 |
| 2 | LEARNER | $159.04 | 94s | 647 | 15.7 |

