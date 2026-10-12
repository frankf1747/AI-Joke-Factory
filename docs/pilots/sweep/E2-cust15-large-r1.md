# Lean fees pilot — 2026-10-12

_E2-cust15 large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=600_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 84.8 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$1.07 vs $30.04; Round 2: -$26.38 vs -$13.08
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.23; Round 2: ρ = -0.30

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 114 | 64 % | 13 s |
| 5 | 150 | 46 % | 21 s |
| 10 | 36 | 94 % | 35 s |
| not split | 12 | 0 % | — |

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
| CAREFUL | 9 | $8.67 | $12.44 | $4.92 | $3.69 | $1.13 | **-$13.69** | 6.2 | 5.0 | 21 s | 258.0 % |
| BALANCED | 9 | $66.11 | $16.00 | $8.29 | $8.89 | $2.78 | **$30.04** | 8.0 | 5.0 | 17 s | 54.6 % |
| BALANCED_HOLDS | 4 | $43.75 | $16.00 | $21.58 | $5.20 | $1.95 | **-$1.07** | 8.0 | 5.0 | 30 s | 102.4 % |
| SPRAY | 9 | $60.89 | $16.00 | $18.24 | $13.42 | $4.00 | **$9.23** | 8.0 | 5.0 | 33 s | 84.8 % |
| LEARNER | 9 | $33.33 | $16.00 | $6.44 | $4.03 | $1.60 | **$5.02** | 8.0 | 5.0 | 15 s | 84.9 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $23.44 | $12.89 | $4.89 | $3.11 | $1.16 | **$1.23** | 6.4 | 5.0 | 21 s | 94.8 % |
| BALANCED | 9 | $23.00 | $16.00 | $7.81 | $9.43 | $2.71 | **-$13.08** | 8.0 | 5.0 | 18 s | 156.9 % |
| BALANCED_HOLDS | 4 | $20.25 | $16.00 | $24.29 | $4.54 | $1.73 | **-$26.38** | 8.0 | 5.0 | 36 s | 230.3 % |
| SPRAY | 9 | $63.33 | $12.00 | $21.91 | $13.91 | $4.00 | **$11.52** | 4.0 | 10.0 | 35 s | 81.8 % |
| LEARNER | 9 | $71.44 | $12.67 | $4.54 | $5.06 | $2.33 | **$46.73** | 12.7 | 3.0 | 13 s | 34.6 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $78.63 | 94s | 934 | 15.7 |
| 2 | LEARNER | $153.35 | 94s | 987 | 15.7 |

