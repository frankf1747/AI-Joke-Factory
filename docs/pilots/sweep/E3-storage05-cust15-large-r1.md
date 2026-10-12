# Lean fees pilot — 2026-10-12

_E3-storage05-cust15 large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=600_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 67.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $8.27 vs $31.89; Round 2: -$22.97 vs -$7.30
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.37; Round 2: ρ = -0.34

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 116 | 66 % | 13 s |
| 5 | 151 | 43 % | 20 s |
| 10 | 36 | 92 % | 35 s |
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
| CAREFUL | 9 | $9.00 | $12.44 | $2.46 | $3.63 | $1.13 | **-$10.84** | 6.2 | 5.0 | 16 s | 220.4 % |
| BALANCED | 9 | $64.11 | $16.00 | $4.15 | $9.16 | $2.78 | **$31.89** | 8.0 | 5.0 | 18 s | 50.3 % |
| BALANCED_HOLDS | 4 | $42.25 | $16.00 | $10.80 | $5.14 | $1.95 | **$8.27** | 8.0 | 5.0 | 30 s | 80.4 % |
| SPRAY | 9 | $63.33 | $16.00 | $9.15 | $13.27 | $4.00 | **$20.92** | 8.0 | 5.0 | 33 s | 67.0 % |
| LEARNER | 9 | $33.00 | $16.00 | $3.27 | $4.15 | $1.60 | **$7.74** | 8.0 | 5.0 | 15 s | 76.6 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $22.11 | $12.89 | $2.45 | $3.01 | $1.16 | **$2.44** | 6.4 | 5.0 | 15 s | 89.0 % |
| BALANCED | 9 | $24.89 | $16.00 | $3.91 | $9.44 | $2.71 | **-$7.30** | 8.0 | 5.0 | 19 s | 129.3 % |
| BALANCED_HOLDS | 4 | $12.00 | $16.00 | $12.33 | $4.84 | $1.73 | **-$22.97** | 8.0 | 5.0 | 35 s | 291.5 % |
| SPRAY | 9 | $58.78 | $12.00 | $10.94 | $14.06 | $4.00 | **$17.77** | 4.0 | 10.0 | 35 s | 69.8 % |
| LEARNER | 9 | $84.11 | $13.11 | $2.29 | $4.70 | $2.40 | **$61.49** | 13.0 | 3.0 | 13 s | 26.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $95.77 | 94s | 934 | 15.7 |
| 2 | LEARNER | $197.95 | 94s | 993 | 15.7 |

