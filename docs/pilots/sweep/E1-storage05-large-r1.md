# Lean fees pilot — 2026-10-12

_E1-storage05 large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 89.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 37 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $2.34 vs $22.56; Round 2: -$22.67 vs -$14.55
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.24; Round 2: ρ = -0.44

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 116 | 66 % | 14 s |
| 5 | 150 | 45 % | 20 s |
| 10 | 36 | 94 % | 37 s |
| not split | 12 | 0 % | — |

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
| CAREFUL | 9 | $6.22 | $12.44 | $2.46 | $3.70 | $1.13 | **-$13.68** | 6.2 | 5.0 | 20 s | 319.9 % |
| BALANCED | 9 | $54.67 | $16.00 | $4.16 | $9.05 | $2.78 | **$22.56** | 8.0 | 5.0 | 18 s | 58.7 % |
| BALANCED_HOLDS | 4 | $36.25 | $16.00 | $10.79 | $5.07 | $1.95 | **$2.34** | 8.0 | 5.0 | 30 s | 93.5 % |
| SPRAY | 9 | $48.22 | $16.00 | $9.13 | $13.77 | $4.00 | **$5.32** | 8.0 | 5.0 | 35 s | 89.0 % |
| LEARNER | 9 | $25.67 | $16.00 | $3.25 | $4.31 | $1.60 | **$0.27** | 8.0 | 5.0 | 18 s | 99.0 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $19.78 | $12.89 | $2.44 | $3.03 | $1.16 | **$0.09** | 6.4 | 5.0 | 18 s | 99.6 % |
| BALANCED | 9 | $17.89 | $16.00 | $3.90 | $9.69 | $2.71 | **-$14.55** | 8.0 | 5.0 | 18 s | 181.3 % |
| BALANCED_HOLDS | 4 | $12.25 | $16.00 | $12.32 | $4.80 | $1.73 | **-$22.67** | 8.0 | 5.0 | 36 s | 285.1 % |
| SPRAY | 9 | $48.78 | $12.00 | $10.94 | $14.50 | $4.00 | **$7.34** | 4.0 | 10.0 | 37 s | 84.9 % |
| LEARNER | 9 | $60.11 | $12.89 | $2.28 | $5.10 | $2.38 | **$37.34** | 12.9 | 3.0 | 14 s | 37.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $85.62 | 94s | 934 | 15.7 |
| 2 | LEARNER | $75.55 | 94s | 991 | 15.7 |

