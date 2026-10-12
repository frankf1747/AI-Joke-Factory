# Lean fees pilot — 2026-10-12

_H-e4-20teams-paired r2 (20 teams, 360 customers)_

## Success checks

- **PASS** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 50.3 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 12 s, Spray 32 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$26.47 vs $5.53; Round 2: -$18.92 vs $4.35
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.26; Round 2: ρ = -0.12

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 51 | 75 % | 12 s |
| 5 | 82 | 41 % | 24 s |
| 10 | 16 | 100 % | 32 s |
| not split | 7 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.05 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($0.5 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_STORAGE, PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUY_THRESHOLD, PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Bot joke seed: pilot-1791773727191. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $32.00 | $14.00 | $2.74 | $3.69 | $1.20 | **$10.19** | 7.0 | 5.0 | 15 s | 68.1 % |
| BALANCED | 4 | $38.25 | $16.00 | $4.17 | $9.68 | $2.75 | **$5.53** | 8.0 | 5.0 | 21 s | 85.6 % |
| BALANCED_HOLDS | 4 | $9.00 | $16.00 | $10.86 | $6.62 | $1.90 | **-$26.47** | 8.0 | 5.0 | 40 s | 394.1 % |
| SPRAY | 4 | $83.75 | $16.00 | $8.58 | $13.53 | $4.00 | **$41.64** | 8.0 | 5.0 | 28 s | 50.3 % |
| LEARNER | 4 | $82.25 | $16.00 | $3.28 | $3.18 | $1.60 | **$57.95** | 8.0 | 5.0 | 14 s | 29.5 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $21.25 | $12.50 | $2.41 | $2.75 | $1.15 | **$2.27** | 6.3 | 5.0 | 20 s | 89.3 % |
| BALANCED | 4 | $36.75 | $16.00 | $4.20 | $9.32 | $2.75 | **$4.35** | 8.0 | 5.0 | 18 s | 88.2 % |
| BALANCED_HOLDS | 4 | $15.50 | $16.00 | $11.85 | $4.70 | $1.77 | **-$18.92** | 8.0 | 5.0 | 41 s | 222.0 % |
| SPRAY | 4 | $78.25 | $12.00 | $9.44 | $14.35 | $4.00 | **$38.46** | 4.0 | 10.0 | 32 s | 50.9 % |
| LEARNER | 4 | $101.50 | $12.75 | $2.26 | $4.65 | $2.40 | **$79.32** | 12.8 | 3.0 | 12 s | 21.9 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $139.19 | 94s | 458 | 15.7 |
| 2 | LEARNER | $157.73 | 94s | 483 | 15.7 |

