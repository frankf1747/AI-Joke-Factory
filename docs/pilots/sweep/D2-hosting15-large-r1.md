# Lean fees pilot — 2026-10-12

_D2-hosting15 large(40 teams) r1: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_HOSTING=0.15 PILOT_CUSTOMERS=480_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 148.0 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 13 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$23.18 vs $0.22; Round 2: -$41.94 vs -$33.67
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.03; Round 2: ρ = -0.64

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 117 | 63 % | 13 s |
| 5 | 151 | 44 % | 21 s |
| 10 | 36 | 92 % | 35 s |
| not split | 11 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 9 CAREFUL, 9 BALANCED, 9 SPRAY, 9 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
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
| CAREFUL | 9 | $6.44 | $12.44 | $4.92 | $10.81 | $1.13 | **-$23.03** | 6.2 | 5.0 | 14 s | 457.3 % |
| BALANCED | 9 | $54.78 | $16.00 | $8.30 | $27.36 | $2.78 | **$0.22** | 8.0 | 5.0 | 18 s | 99.6 % |
| BALANCED_HOLDS | 4 | $31.50 | $16.00 | $21.58 | $15.05 | $1.95 | **-$23.18** | 8.0 | 5.0 | 32 s | 173.6 % |
| SPRAY | 9 | $54.00 | $16.00 | $18.26 | $41.64 | $4.00 | **-$25.90** | 8.0 | 5.0 | 33 s | 148.0 % |
| LEARNER | 9 | $21.67 | $16.00 | $6.48 | $13.70 | $1.60 | **-$16.35** | 8.0 | 5.0 | 18 s | 175.5 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $19.56 | $12.89 | $4.89 | $9.38 | $1.16 | **-$8.93** | 6.4 | 5.0 | 17 s | 145.7 % |
| BALANCED | 9 | $21.56 | $16.00 | $7.81 | $28.57 | $2.71 | **-$33.67** | 8.0 | 5.0 | 20 s | 256.2 % |
| BALANCED_HOLDS | 4 | $14.00 | $16.00 | $24.63 | $13.50 | $1.73 | **-$41.94** | 8.0 | 5.0 | 35 s | 399.5 % |
| SPRAY | 9 | $49.44 | $12.00 | $21.90 | $43.01 | $4.00 | **-$31.47** | 4.0 | 10.0 | 35 s | 163.6 % |
| LEARNER | 9 | $57.67 | $13.00 | $4.58 | $14.55 | $2.40 | **$23.02** | 13.0 | 3.0 | 13 s | 60.1 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $44.09 | 94s | 934 | 15.7 |
| 2 | LEARNER | $88.36 | 94s | 993 | 15.7 |

