# Lean fees pilot — 2026-10-12

_H-e3-20teams-paired r1 (20 teams, 300 customers)_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 60.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 14 s, Spray 35 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: $3.85 vs $22.73; Round 2: -$17.59 vs $16.46
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.21; Round 2: ρ = -0.39

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 63 % | 14 s |
| 5 | 82 | 46 % | 24 s |
| 10 | 16 | 100 % | 35 s |
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
- Bot joke seed: pilot-1791774294505. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $12.75 | $13.50 | $2.60 | $3.70 | $1.20 | **-$8.43** | 6.8 | 5.0 | 14 s | 166.1 % |
| BALANCED | 4 | $54.50 | $16.00 | $4.15 | $8.61 | $2.90 | **$22.73** | 8.0 | 5.0 | 17 s | 58.3 % |
| BALANCED_HOLDS | 4 | $37.25 | $16.00 | $10.41 | $5.01 | $1.90 | **$3.85** | 8.0 | 5.0 | 27 s | 89.7 % |
| SPRAY | 4 | $68.75 | $16.00 | $8.51 | $13.38 | $4.00 | **$26.86** | 8.0 | 5.0 | 29 s | 60.9 % |
| LEARNER | 4 | $38.00 | $16.00 | $3.13 | $4.01 | $1.60 | **$13.03** | 8.0 | 5.0 | 16 s | 65.7 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $10.50 | $13.50 | $2.41 | $3.35 | $1.15 | **-$10.08** | 6.8 | 5.0 | 15 s | 196.0 % |
| BALANCED | 4 | $48.25 | $16.00 | $4.04 | $8.86 | $2.78 | **$16.46** | 8.0 | 5.0 | 18 s | 65.9 % |
| BALANCED_HOLDS | 4 | $17.50 | $16.00 | $12.20 | $5.09 | $1.73 | **-$17.59** | 8.0 | 5.0 | 43 s | 200.5 % |
| SPRAY | 4 | $60.50 | $12.00 | $10.85 | $13.88 | $4.00 | **$19.77** | 4.0 | 10.0 | 35 s | 67.3 % |
| LEARNER | 4 | $77.75 | $12.75 | $2.29 | $5.08 | $2.35 | **$55.17** | 12.8 | 3.0 | 14 s | 29.0 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $46.49 | 94s | 464 | 15.7 |
| 2 | LEARNER | $127.89 | 94s | 480 | 15.7 |

