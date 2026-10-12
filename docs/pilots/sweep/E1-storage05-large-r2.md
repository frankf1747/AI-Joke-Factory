# Lean fees pilot — 2026-10-12

_E1-storage05 large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 86.8 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 37 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $0.41 vs $20.87; Round 2: -$23.81 vs -$8.85
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.30; Round 2: ρ = -0.26

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 112 | 60 % | 14 s |
| 5 | 150 | 42 % | 20 s |
| 10 | 36 | 94 % | 37 s |
| not split | 15 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 9 | $6.56 | $12.44 | $2.46 | $3.78 | $1.13 | **-$13.43** | 6.2 | 5.0 | 17 s | 304.9 % |
| BALANCED | 9 | $53.00 | $16.00 | $4.16 | $9.07 | $2.78 | **$20.87** | 8.0 | 5.0 | 19 s | 60.6 % |
| BALANCED_HOLDS | 4 | $34.50 | $16.00 | $10.76 | $5.29 | $1.95 | **$0.41** | 8.0 | 5.0 | 27 s | 98.8 % |
| SPRAY | 9 | $49.11 | $16.00 | $9.12 | $13.52 | $4.00 | **$6.47** | 8.0 | 5.0 | 33 s | 86.8 % |
| LEARNER | 9 | $26.56 | $16.00 | $3.23 | $4.21 | $1.60 | **$1.27** | 8.0 | 5.0 | 17 s | 95.2 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $19.78 | $12.89 | $2.45 | $3.01 | $1.16 | **$0.10** | 6.4 | 5.0 | 21 s | 99.5 % |
| BALANCED | 9 | $23.44 | $16.00 | $3.92 | $9.54 | $2.71 | **-$8.85** | 8.0 | 5.0 | 19 s | 137.7 % |
| BALANCED_HOLDS | 4 | $11.00 | $16.00 | $12.27 | $4.73 | $1.73 | **-$23.81** | 8.0 | 5.0 | 36 s | 316.4 % |
| SPRAY | 9 | $51.11 | $12.00 | $10.97 | $14.40 | $4.00 | **$9.74** | 4.0 | 10.0 | 37 s | 80.9 % |
| LEARNER | 9 | $52.56 | $13.11 | $2.28 | $5.22 | $2.38 | **$29.45** | 12.8 | 3.0 | 14 s | 44.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $64.72 | 94s | 934 | 15.7 |
| 2 | LEARNER | $83.68 | 94s | 991 | 15.7 |

