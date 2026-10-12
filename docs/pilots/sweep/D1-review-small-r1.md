# Lean fees pilot — 2026-10-12

_D1-review small(26 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_CUSTOMERS=312_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 117.1 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 37 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$10.97 vs $22.80; Round 2: -$29.05 vs -$18.36
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.27; Round 2: ρ = -0.41

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 75 | 65 % | 15 s |
| 5 | 99 | 39 % | 20 s |
| 10 | 24 | 96 % | 37 s |
| not split | 5 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 6 CAREFUL, 6 BALANCED, 6 SPRAY, 6 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 6 | $5.67 | $12.00 | $4.77 | $3.68 | $1.10 | **-$16.05** | 6.0 | 5.0 | 25 s | 383.2 % |
| BALANCED | 6 | $58.67 | $16.00 | $8.32 | $8.68 | $2.75 | **$22.80** | 8.0 | 5.0 | 17 s | 61.1 % |
| BALANCED_HOLDS | 2 | $35.00 | $16.00 | $22.36 | $5.29 | $2.25 | **-$10.97** | 8.0 | 5.0 | 33 s | 131.4 % |
| SPRAY | 6 | $44.83 | $16.00 | $18.63 | $13.86 | $4.00 | **-$7.66** | 8.0 | 5.0 | 33 s | 117.1 % |
| LEARNER | 6 | $26.33 | $16.00 | $6.41 | $4.26 | $1.60 | **-$2.18** | 8.0 | 5.0 | 17 s | 108.3 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | $23.83 | $13.00 | $4.97 | $2.95 | $1.17 | **$1.57** | 6.5 | 5.0 | 18 s | 93.4 % |
| BALANCED | 6 | $18.17 | $16.00 | $8.11 | $9.59 | $2.70 | **-$18.36** | 8.0 | 5.0 | 20 s | 201.1 % |
| BALANCED_HOLDS | 2 | $15.00 | $16.00 | $20.58 | $5.53 | $1.85 | **-$29.05** | 8.0 | 5.0 | 31 s | 293.7 % |
| SPRAY | 6 | $51.67 | $12.00 | $21.60 | $14.23 | $4.00 | **-$0.16** | 4.0 | 10.0 | 37 s | 100.3 % |
| LEARNER | 6 | $49.00 | $12.83 | $4.55 | $4.39 | $2.33 | **$24.78** | 12.7 | 3.0 | 15 s | 49.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $50.23 | 94s | 612 | 15.7 |
| 2 | LEARNER | $67.09 | 94s | 649 | 15.7 |

