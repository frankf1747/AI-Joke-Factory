# Lean fees pilot — 2026-10-12

_E3-storage05-cust15 large(40 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=600_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 68.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $6.61 vs $35.03; Round 2: -$16.46 vs -$7.83
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.34; Round 2: ρ = -0.35

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 115 | 64 % | 13 s |
| 5 | 150 | 43 % | 19 s |
| 10 | 36 | 97 % | 36 s |
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
| CAREFUL | 9 | $8.11 | $12.44 | $2.46 | $3.73 | $1.13 | **-$11.82** | 6.2 | 5.0 | 18 s | 245.7 % |
| BALANCED | 9 | $67.00 | $16.00 | $4.15 | $8.92 | $2.78 | **$35.03** | 8.0 | 5.0 | 17 s | 47.7 % |
| BALANCED_HOLDS | 4 | $40.50 | $16.00 | $10.78 | $5.07 | $1.95 | **$6.61** | 8.0 | 5.0 | 26 s | 83.7 % |
| SPRAY | 9 | $61.89 | $16.00 | $9.12 | $13.54 | $4.00 | **$19.22** | 8.0 | 5.0 | 34 s | 68.9 % |
| LEARNER | 9 | $32.78 | $16.00 | $3.27 | $4.06 | $1.60 | **$7.61** | 8.0 | 5.0 | 15 s | 76.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $27.33 | $12.89 | $2.44 | $2.99 | $1.16 | **$7.68** | 6.4 | 5.0 | 14 s | 71.9 % |
| BALANCED | 9 | $24.44 | $16.00 | $3.92 | $9.52 | $2.71 | **-$7.83** | 8.0 | 5.0 | 17 s | 132.0 % |
| BALANCED_HOLDS | 4 | $18.00 | $16.00 | $12.14 | $4.52 | $1.73 | **-$16.46** | 8.0 | 5.0 | 36 s | 191.4 % |
| SPRAY | 9 | $57.89 | $12.00 | $10.95 | $13.97 | $4.00 | **$16.97** | 4.0 | 10.0 | 36 s | 70.7 % |
| LEARNER | 9 | $70.11 | $12.78 | $2.27 | $4.72 | $2.36 | **$47.87** | 12.8 | 3.0 | 13 s | 31.7 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $161.89 | 94s | 934 | 15.7 |
| 2 | LEARNER | $98.05 | 94s | 989 | 15.7 |

