# Lean fees pilot — 2026-10-12

_E3-storage05-cust15 small(26 teams) r3: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=390_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 78.2 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 12 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $5.38 vs $36.54; Round 2: -$18.46 vs -$8.27
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.38; Round 2: ρ = -0.34

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 75 | 72 % | 12 s |
| 5 | 99 | 41 % | 19 s |
| 10 | 24 | 96 % | 35 s |
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
| CAREFUL | 6 | $7.00 | $12.00 | $2.39 | $3.47 | $1.10 | **-$12.13** | 6.0 | 5.0 | 14 s | 273.2 % |
| BALANCED | 6 | $68.17 | $16.00 | $4.15 | $8.60 | $2.75 | **$36.54** | 8.0 | 5.0 | 19 s | 46.4 % |
| BALANCED_HOLDS | 2 | $40.50 | $16.00 | $11.18 | $5.62 | $2.25 | **$5.38** | 8.0 | 5.0 | 35 s | 86.7 % |
| SPRAY | 6 | $55.17 | $16.00 | $9.32 | $13.83 | $4.00 | **$12.03** | 8.0 | 5.0 | 31 s | 78.2 % |
| LEARNER | 6 | $33.83 | $16.00 | $3.19 | $4.25 | $1.60 | **$8.55** | 8.0 | 5.0 | 18 s | 74.7 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $24.33 | $13.00 | $2.48 | $3.17 | $1.17 | **$4.34** | 6.5 | 5.0 | 15 s | 82.2 % |
| BALANCED | 6 | $24.00 | $16.00 | $4.05 | $9.39 | $2.70 | **-$8.27** | 8.0 | 5.0 | 19 s | 134.5 % |
| BALANCED_HOLDS | 2 | $15.50 | $16.00 | $10.54 | $5.48 | $1.85 | **-$18.46** | 8.0 | 5.0 | 39 s | 219.1 % |
| SPRAY | 6 | $60.33 | $12.00 | $10.74 | $14.16 | $4.00 | **$19.43** | 4.0 | 10.0 | 35 s | 67.8 % |
| LEARNER | 6 | $76.50 | $13.17 | $2.29 | $4.42 | $2.37 | **$54.14** | 12.8 | 3.0 | 12 s | 29.2 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $71.82 | 94s | 612 | 15.7 |
| 2 | LEARNER | $141.57 | 94s | 651 | 15.7 |

