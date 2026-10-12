# Lean fees pilot — 2026-10-12

_E3-storage05-cust15 large(40 teams) r3: PILOT_BUY_THRESHOLD=8 PILOT_PREFERENCE_BASE=5 PILOT_STORAGE=0.05 PILOT_CUSTOMERS=600_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 66.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 15 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $9.33 vs $32.11; Round 2: -$15.94 vs -$7.06
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.34; Round 2: ρ = -0.10

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 113 | 61 % | 14 s |
| 5 | 151 | 44 % | 21 s |
| 10 | 36 | 94 % | 35 s |
| not split | 14 | 0 % | — |

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
| CAREFUL | 9 | $7.89 | $12.44 | $2.45 | $3.78 | $1.13 | **-$12.10** | 6.2 | 5.0 | 15 s | 253.3 % |
| BALANCED | 9 | $64.11 | $16.00 | $4.16 | $8.94 | $2.78 | **$32.11** | 8.0 | 5.0 | 17 s | 49.9 % |
| BALANCED_HOLDS | 4 | $43.50 | $16.00 | $10.79 | $5.34 | $1.95 | **$9.33** | 8.0 | 5.0 | 35 s | 78.6 % |
| SPRAY | 9 | $63.56 | $16.00 | $9.12 | $13.41 | $4.00 | **$21.03** | 8.0 | 5.0 | 32 s | 66.9 % |
| LEARNER | 9 | $33.78 | $16.00 | $3.20 | $4.28 | $1.60 | **$8.46** | 8.0 | 5.0 | 16 s | 75.0 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 9 | $24.89 | $12.89 | $2.44 | $3.06 | $1.16 | **$5.17** | 6.4 | 5.0 | 23 s | 79.2 % |
| BALANCED | 9 | $25.22 | $16.00 | $3.91 | $9.54 | $2.71 | **-$7.06** | 8.0 | 5.0 | 17 s | 128.0 % |
| BALANCED_HOLDS | 4 | $18.75 | $16.00 | $12.32 | $4.47 | $1.83 | **-$15.94** | 8.0 | 5.0 | 34 s | 185.0 % |
| SPRAY | 9 | $65.67 | $12.00 | $10.96 | $14.12 | $4.00 | **$24.59** | 4.0 | 10.0 | 35 s | 62.5 % |
| LEARNER | 9 | $70.56 | $13.22 | $2.28 | $5.23 | $2.38 | **$47.33** | 12.9 | 3.0 | 15 s | 32.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | BALANCED | $82.16 | 94s | 934 | 15.7 |
| 2 | LEARNER | $234.75 | 94s | 995 | 15.7 |

