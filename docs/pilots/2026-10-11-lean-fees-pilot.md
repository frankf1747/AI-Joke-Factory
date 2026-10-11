# Lean fees pilot — 2026-10-11

## Success checks

- **FAIL** — Spray spends 40–60 % of its revenue on fees in Round 1: Spray Round 1 fees are 67.1 % of revenue
- **FAIL** — In Round 2, the Learner's batches of 3 reach their first sale sooner than Spray's batches of 10: send → first sale: Learner 18 s, Spray 7 s
  - Learner also differs in pacing and feedback waits; see the batch-size table
- **FAIL** — No persona profits by leaving batches on Marketing's desk: mean profit, Balanced (holds) vs Balanced: Round 1: -$7.82 vs $8.82; Round 2: -$9.18 vs -$20.52
  - Indicative only (not a pass/fail): rank correlation of storage fee per batch with profit, across all teams: Round 1: ρ = 0.10; Round 2: ρ = -0.09

## Round 2 batches by size

Every batch sent in Round 2, all teams, grouped by its number of jokes.

| Batch size | Batches | Sold | Send → first sale (sold batches) |
|---|---|---|---|
| 3 | 42 | 64 % | 16 s |
| 5 | 60 | 52 % | 16 s |
| 10 | 12 | 100 % | 7 s |

## Settings

- Backend http://localhost:8081.
- Bots at 10×; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER, 2 BALANCED_HOLDS; one class, Round 1 then Round 2.
- Fees (real time): shipping $1 / $2 / $3 for 1–4 / 5 / 6–10 jokes, storage $0.1 and hosting $0.05 per joke-minute.
- Storage and hosting are sent ×10 ($1 and $0.5) because the backend charges per wall-clock minute; shipping is per batch and is not scaled.
- Arrival window 90 s (stands for 15 minutes of class time); batch size 5 exactly in Round 1, up to 10 in Round 2; no WIP limit.
- Bot rounds are capped at 40 jokes per team, whatever the batch size.
- Overrides: none (the spec's starting amounts).
- BALANCED_HOLDS ("Balanced (holds)") is Balanced in every way except that its Marketing seat holds each batch an extra 60 class-seconds (6 s at 10×) before deciding: the controlled contrast for the desk check.
- Each round is ended 4 s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × 10 / 60); a round over 16 (window + settle + 2 s slack) is flagged.

Means per team. Fees are shipping + storage + hosting + listing + discard, so profit = revenue − fees. Mean batch size counts split batches; send → first sale is per batch, over batches that sold.

## Round 1

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 3 | $4.67 | $12.00 | $1.80 | $4.06 | $1.20 | **-$14.57** | 6.0 | 5.0 | 9 s | 412.3 % |
| BALANCED | 3 | $39.67 | $16.00 | $2.44 | $9.45 | $2.83 | **$8.82** | 8.0 | 5.0 | 15 s | 77.8 % |
| BALANCED_HOLDS | 2 | $27.50 | $16.00 | $8.01 | $8.39 | $2.80 | **-$7.82** | 8.0 | 5.0 | 19 s | 128.4 % |
| SPRAY | 3 | $61.67 | $16.00 | $2.53 | $18.88 | $4.00 | **$20.27** | 8.0 | 5.0 | 10 s | 67.1 % |
| LEARNER | 3 | $21.67 | $16.00 | $2.47 | $5.00 | $1.60 | **-$3.64** | 8.0 | 5.0 | 20 s | 116.8 % |

## Round 2

| Persona | Teams | Revenue | Shipping | Storage | Hosting | Listing | Profit | Batches | Mean batch size | Send → first sale | Fees % of revenue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 3 | $20.00 | $13.33 | $1.89 | $3.38 | $1.27 | **-$0.06** | 6.7 | 5.0 | 14 s | 100.3 % |
| BALANCED | 3 | $11.33 | $16.00 | $2.44 | $10.64 | $2.63 | **-$20.52** | 8.0 | 5.0 | 17 s | 281.1 % |
| BALANCED_HOLDS | 2 | $25.50 | $16.00 | $6.93 | $8.74 | $2.90 | **-$9.18** | 8.0 | 5.0 | 17 s | 136.0 % |
| SPRAY | 3 | $67.33 | $12.00 | $2.49 | $19.55 | $4.00 | **$29.29** | 4.0 | 10.0 | 7 s | 56.5 % |
| LEARNER | 3 | $32.33 | $14.00 | $2.61 | $7.42 | $2.80 | **$5.36** | 14.0 | 3.0 | 18 s | 83.4 % |

## Rounds

| Round | Winner | Profit | Duration | Classification calls | Class minutes |
|---|---|---|---|---|---|
| 1 | SPRAY | $53.85 | 94s | 345 | 15.7 |
| 2 | SPRAY | $57.34 | 94s | 379 | 15.7 |

