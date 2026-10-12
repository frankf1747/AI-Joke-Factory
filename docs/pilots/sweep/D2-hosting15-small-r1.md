# Lean fees pilot — 2026-10-12

_D2-hosting15 small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 187.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 16 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$26.40 vs $7.56; Round 2: -$41.40 vs -$37.31
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.10; Round 2: ρ = -0.59

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 76 | 59 % | 15 s |
| 5 | 98 | 37 % | 17 s |
| 10 | 24 | 92 % | 36 s |
| not split | 5 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.15 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $1.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_HOSTING, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $4.50 | $12.00 | $4.77 | $11.44 | $1.10 | **-$24.98** | 6.0 | 5.0 | 18 s | 655.0 % |
| BALANCED | 6 | $61.17 | $16.00 | $8.31 | $26.43 | $2.75 | **$7.56** | 8.0 | 5.0 | 20 s | 87.6 % |
| BALANCED_HOLDS | 2 | $30.50 | $16.00 | $22.35 | $16.23 | $2.25 | **-$26.40** | 8.0 | 5.0 | 31 s | 186.6 % |
| SPRAY | 6 | $43.00 | $16.00 | $18.65 | $42.15 | $4.00 | **-$37.80** | 8.0 | 5.0 | 34 s | 187.9 % |
| LEARNER | 6 | $28.50 | $16.00 | $6.32 | $12.41 | $1.60 | **-$8.07** | 8.0 | 5.0 | 16 s | 128.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $25.33 | $13.00 | $4.95 | $9.50 | $1.17 | **-$3.46** | 6.5 | 5.0 | 12 s | 113.7 % |
| BALANCED | 6 | $18.50 | $16.00 | $8.08 | $28.91 | $2.70 | **-$37.31** | 8.0 | 5.0 | 17 s | 301.7 % |
| BALANCED_HOLDS | 2 | $14.00 | $16.00 | $21.07 | $16.40 | $1.85 | **-$41.40** | 8.0 | 5.0 | 38 s | 395.7 % |
| SPRAY | 6 | $49.00 | $12.00 | $21.54 | $43.29 | $4.00 | **-$31.83** | 4.0 | 10.0 | 36 s | 165.0 % |
| LEARNER | 6 | $52.50 | $12.67 | $4.57 | $16.15 | $2.33 | **$16.66** | 12.7 | 3.0 | 16 s | 68.3 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $52.64 | 94s | 612 | 15.7 |
| 2 | LEARNER | $84.15 | 94s | 649 | 15.7 |

