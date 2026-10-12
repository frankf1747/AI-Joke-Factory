# Lean fees pilot — 2026-10-12

_Shipped defaults, no overrides, 20 teams r3_

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 39.9 % of revenue
- **PASS** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 11 s, Spray 34 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **PASS** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$25.33 vs -$5.79; Round 2: -$18.59 vs $42.17
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = -0.27; Round 2: ρ = -0.49

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 52 | 79 % | 11 s |
| 5 | 80 | 56 % | 22 s |
| 10 | 16 | 100 % | 34 s |
| not split | 8 | 0 % | — |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 4 CAREFUL, 4 BALANCED, 4 SPRAY, 4 LEARNER, 4 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.05 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($0.5 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Customers: the backend default, 18 per team (the count at start is 18 × the number of teams).
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: PILOT_PER_PERSONA, PILOT_HOLD_TEAMS.
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Bot joke seed: pilot-1791778151920. Each Balanced (holds) team draws the same jokes as a Balanced partner.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $28.00 | $13.50 | $2.56 | $3.40 | $1.20 | **$7.17** | 6.8 | 5.0 | 15 s | 74.4 % |
| BALANCED | 4 | $26.25 | $16.00 | $4.13 | $9.04 | $2.75 | **-$5.79** | 8.0 | 5.0 | 20 s | 122.1 % |
| BALANCED_HOLDS | 4 | $9.00 | $16.00 | $10.61 | $5.84 | $1.80 | **-$25.33** | 8.0 | 5.0 | 38 s | 381.4 % |
| SPRAY | 4 | $103.50 | $16.00 | $9.63 | $11.68 | $4.00 | **$62.19** | 8.0 | 5.0 | 29 s | 39.9 % |
| LEARNER | 4 | $95.25 | $16.00 | $3.19 | $2.98 | $1.60 | **$71.24** | 8.0 | 5.0 | 14 s | 25.2 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 4 | $12.50 | $12.00 | $2.37 | $3.00 | $1.10 | **-$6.13** | 6.0 | 5.0 | 18 s | 149.0 % |
| BALANCED | 4 | $73.50 | $16.00 | $3.69 | $8.71 | $2.80 | **$42.17** | 8.0 | 5.0 | 17 s | 42.6 % |
| BALANCED_HOLDS | 4 | $16.00 | $16.00 | $11.35 | $5.35 | $1.82 | **-$18.59** | 8.0 | 5.0 | 37 s | 216.2 % |
| SPRAY | 4 | $47.25 | $12.00 | $10.75 | $14.96 | $4.00 | **$5.54** | 4.0 | 10.0 | 34 s | 88.3 % |
| LEARNER | 4 | $113.75 | $13.00 | $2.29 | $4.44 | $2.40 | **$91.49** | 13.0 | 3.0 | 11 s | 19.6 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | LEARNER | $139.41 | 94s | 454 | 15.7 |
| 2 | LEARNER | $142.62 | 94s | 485 | 15.7 |

