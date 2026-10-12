# Lean fees pilot — 2026-10-12

_D2-hosting15 small(26 teams) r2: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 199.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$23.59 vs $6.14; Round 2: -$44.34 vs -$39.97
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.30; Round 2: ρ = -0.68

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 76 | 67 % | 15 s |
| 5 | 98 | 38 % | 18 s |
| 10 | 24 | 92 % | 37 s |
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
| CAREFUL | 6 | $7.33 | $12.00 | $4.77 | $10.50 | $1.10 | **-$21.20** | 6.0 | 5.0 | 16 s | 389.2 % |
| BALANCED | 6 | $60.00 | $16.00 | $8.28 | $26.71 | $2.75 | **$6.14** | 8.0 | 5.0 | 18 s | 89.8 % |
| BALANCED_HOLDS | 2 | $33.00 | $16.00 | $22.28 | $15.99 | $2.25 | **-$23.59** | 8.0 | 5.0 | 32 s | 171.5 % |
| SPRAY | 6 | $40.33 | $16.00 | $18.70 | $41.93 | $4.00 | **-$40.30** | 8.0 | 5.0 | 34 s | 199.9 % |
| LEARNER | 6 | $28.17 | $16.00 | $6.35 | $12.22 | $1.60 | **-$8.25** | 8.0 | 5.0 | 16 s | 129.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $21.17 | $13.00 | $4.95 | $9.75 | $1.17 | **-$7.87** | 6.5 | 5.0 | 14 s | 137.2 % |
| BALANCED | 6 | $15.50 | $16.00 | $8.12 | $28.53 | $2.70 | **-$39.97** | 8.0 | 5.0 | 17 s | 357.9 % |
| BALANCED_HOLDS | 2 | $11.50 | $16.00 | $20.99 | $16.90 | $1.85 | **-$44.34** | 8.0 | 5.0 | 32 s | 485.5 % |
| SPRAY | 6 | $47.33 | $12.00 | $21.51 | $43.19 | $4.00 | **-$33.37** | 4.0 | 10.0 | 36 s | 170.5 % |
| LEARNER | 6 | $60.33 | $12.67 | $4.56 | $15.67 | $2.33 | **$24.99** | 12.7 | 3.0 | 15 s | 58.6 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $45.05 | 94s | 612 | 15.7 |
| 2 | LEARNER | $77.58 | 94s | 649 | 15.7 |

