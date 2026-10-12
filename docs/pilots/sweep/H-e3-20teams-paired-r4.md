# Lean fees pilot — 2026-10-12

_H-e3-20teams-paired r4 (20 teams, 300 customers)_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 73.4 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 11 s, Spray 36 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$14.18 vs $9.82; Round 2: -$20.18 vs $25.28
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.21; Round 2: ρ = -0.29

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 69 % | 11 s |
| 5 | 81 | 48 % | 26 s |
| 10 | 16 | 94 % | 36 s |
| not split | 9 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.05 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($0.5 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_STORAGE, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Bot joke seed: pilot-1791774861648. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $32.25 | $14.00 | $2.71 | $3.23 | $1.20 | **$10.93** | 7.0 | 5.0 | 12 s | 66.1 % |
| BALANCED | 4 | $42.25 | $16.00 | $3.82 | $9.65 | $2.85 | **$9.82** | 8.0 | 5.0 | 18 s | 76.8 % |
| BALANCED_HOLDS | 4 | $20.50 | $16.00 | $10.70 | $5.90 | $2.00 | **-$14.18** | 8.0 | 5.0 | 38 s | 169.2 % |
| SPRAY | 4 | $58.25 | $16.00 | $9.54 | $13.24 | $4.00 | **$15.47** | 8.0 | 5.0 | 32 s | 73.4 % |
| LEARNER | 4 | $50.25 | $16.00 | $3.27 | $3.87 | $1.60 | **$25.27** | 8.0 | 5.0 | 18 s | 49.7 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $4.25 | $13.00 | $2.48 | $3.36 | $1.15 | **-$15.91** | 6.5 | 5.0 | 15 s | 474.4 % |
| BALANCED | 4 | $57.00 | $16.00 | $4.11 | $8.63 | $2.88 | **$25.28** | 8.0 | 5.0 | 16 s | 55.6 % |
| BALANCED_HOLDS | 4 | $15.25 | $16.00 | $12.82 | $4.74 | $1.80 | **-$20.18** | 8.0 | 5.0 | 45 s | 232.3 % |
| SPRAY | 4 | $49.50 | $12.00 | $10.58 | $14.40 | $4.00 | **$8.52** | 4.0 | 10.0 | 36 s | 82.8 % |
| LEARNER | 4 | $86.50 | $12.75 | $2.28 | $4.32 | $2.35 | **$64.68** | 12.8 | 3.0 | 11 s | 25.2 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $93.52 | 94s | 466 | 15.7 |
| 2 | LEARNER | $112.30 | 94s | 487 | 15.7 |

