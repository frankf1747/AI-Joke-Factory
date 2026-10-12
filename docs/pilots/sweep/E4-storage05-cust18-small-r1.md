# Lean fees pilot — 2026-10-12

_E4-storage05-cust18 small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=468_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 67.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $14.03 vs $61.37; Round 2: -$10.22 vs -$6.78
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.36; Round 2: ρ = -0.25

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 75 | 71 % | 13 s |
| 5 | 99 | 41 % | 19 s |
| 10 | 24 | 96 % | 35 s |
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
| CAREFUL | 6 | $8.67 | $12.00 | $2.39 | $3.46 | $1.10 | **-$10.45** | 6.0 | 5.0 | 13 s | 220.6 % |
| BALANCED | 6 | $92.67 | $16.00 | $4.15 | $8.28 | $2.75 | **$61.37** | 8.0 | 5.0 | 15 s | 33.8 % |
| BALANCED_HOLDS | 2 | $49.00 | $16.00 | $11.18 | $5.47 | $2.25 | **$14.03** | 8.0 | 5.0 | 35 s | 71.4 % |
| SPRAY | 6 | $63.00 | $16.00 | $9.33 | $13.42 | $4.00 | **$20.25** | 8.0 | 5.0 | 34 s | 67.9 % |
| LEARNER | 6 | $40.33 | $16.00 | $3.14 | $3.93 | $1.60 | **$15.42** | 8.0 | 5.0 | 16 s | 61.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $29.83 | $13.00 | $2.48 | $2.95 | $1.17 | **$10.05** | 6.5 | 5.0 | 15 s | 66.3 % |
| BALANCED | 6 | $25.00 | $16.00 | $4.06 | $8.90 | $2.70 | **-$6.78** | 8.0 | 5.0 | 19 s | 127.1 % |
| BALANCED_HOLDS | 2 | $23.50 | $16.00 | $10.29 | $5.49 | $1.85 | **-$10.22** | 8.0 | 5.0 | 36 s | 143.5 % |
| SPRAY | 6 | $69.50 | $12.00 | $10.77 | $13.68 | $4.00 | **$29.05** | 4.0 | 10.0 | 35 s | 58.2 % |
| LEARNER | 6 | $93.33 | $12.83 | $2.27 | $4.70 | $2.33 | **$71.08** | 12.7 | 3.0 | 13 s | 23.8 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $100.25 | 94s | 612 | 15.7 |
| 2 | LEARNER | $153.31 | 94s | 649 | 15.7 |

