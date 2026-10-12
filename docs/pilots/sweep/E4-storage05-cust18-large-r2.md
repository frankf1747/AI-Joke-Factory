# Lean fees pilot — 2026-10-12

_E4-storage05-cust18 large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=720_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 56.3 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $19.77 vs $45.74; Round 2: -$13.18 vs -$4.75
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.44; Round 2: ρ = -0.21

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 114 | 72 % | 13 s |
| 5 | 151 | 43 % | 19 s |
| 10 | 36 | 97 % | 37 s |
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
| CAREFUL | 9 | $10.33 | $12.44 | $2.46 | $3.62 | $1.13 | **-$9.49** | 6.2 | 5.0 | 16 s | 191.9 % |
| BALANCED | 9 | $77.67 | $16.00 | $4.15 | $8.89 | $2.78 | **$45.74** | 8.0 | 5.0 | 17 s | 41.1 % |
| BALANCED_HOLDS | 4 | $53.75 | $16.00 | $10.79 | $5.15 | $1.95 | **$19.77** | 8.0 | 5.0 | 30 s | 63.2 % |
| SPRAY | 9 | $75.33 | $16.00 | $9.13 | $13.27 | $4.00 | **$32.93** | 8.0 | 5.0 | 31 s | 56.3 % |
| LEARNER | 9 | $38.56 | $16.00 | $3.25 | $4.08 | $1.60 | **$13.38** | 8.0 | 5.0 | 15 s | 65.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $28.44 | $12.89 | $2.44 | $2.87 | $1.16 | **$8.92** | 6.4 | 5.0 | 15 s | 68.7 % |
| BALANCED | 9 | $27.67 | $16.00 | $3.92 | $9.66 | $2.71 | **-$4.75** | 8.0 | 5.0 | 16 s | 117.2 % |
| BALANCED_HOLDS | 4 | $21.50 | $16.00 | $12.32 | $4.46 | $1.83 | **-$13.18** | 8.0 | 5.0 | 33 s | 161.3 % |
| SPRAY | 9 | $76.78 | $12.00 | $10.95 | $14.03 | $4.00 | **$35.79** | 4.0 | 10.0 | 36 s | 53.4 % |
| LEARNER | 9 | $83.44 | $12.89 | $2.29 | $4.67 | $2.38 | **$61.10** | 12.8 | 3.0 | 14 s | 26.8 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $110.88 | 94s | 934 | 15.7 |
| 2 | LEARNER | $112.30 | 94s | 995 | 15.7 |

