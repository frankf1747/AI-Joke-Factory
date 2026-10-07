# Lean pilot — 2026-10-06

Verdict (Lean round 2): **FAIL** — Learner does not out-earn Spray; Careful does not out-earn Spray

- Lean R2 vs Lean R1 mean profit: $0.67 vs -$12.82 (improved)
- Classic R2 vs Classic R1 mean profit: $22.09 vs $22.34 (not improved)

## Settings

- Backend http://localhost:8081; bots at 10x; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER per class.
- Lean R1: setup $3 per batch, carrying $0.2 per joke-minute, WIP limit none, arrival window 180s.
- Lean R2: setup $1 per batch, carrying $0.2 per joke-minute, WIP limit 2, arrival window 180s.
- Carrying scaled ×10 to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.
- Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.
- Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles 15s before reading stats.

Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). Lead time is submit to publish; time to first sale is publish to first sale (Lean only).

## CLASSIC R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 11.8 | — | $0.00 | $0.00 | 0s | 0s | **$9.99** |
| BALANCED | 6 | 28.3 | 25.7 | — | $0.00 | $0.00 | 0s | 0s | **$22.72** |
| SPRAY | 6 | 40.0 | 62.5 | — | $0.00 | $0.00 | 0s | 0s | **$58.50** |
| LEARNER | 6 | 16.0 | 0.0 | — | $0.00 | $0.00 | 0s | 0s | **-$1.84** |

## CLASSIC R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 9.5 | — | $0.00 | $0.00 | 0s | 0s | **$7.66** |
| BALANCED | 6 | 27.3 | 23.3 | — | $0.00 | $0.00 | 0s | 0s | **$20.47** |
| SPRAY | 6 | 40.0 | 31.5 | — | $0.00 | $0.00 | 0s | 0s | **$27.50** |
| LEARNER | 6 | 28.0 | 35.7 | — | $0.00 | $0.00 | 0s | 0s | **$32.73** |

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 11.7 | 11.0 | $24.00 | $6.52 | 4s | 55s | **-$20.69** |
| BALANCED | 6 | 28.8 | 21.7 | 20.3 | $24.00 | $13.04 | 4s | 58s | **-$18.37** |
| SPRAY | 6 | 40.0 | 43.0 | 25.2 | $24.00 | $17.68 | 4s | 51s | **-$2.68** |
| LEARNER | 6 | 16.0 | 22.5 | 7.5 | $24.00 | $6.21 | 4s | 49s | **-$9.55** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 10.3 | 12.0 | $8.00 | $6.55 | 4s | 46s | **-$6.06** |
| BALANCED | 6 | 28.0 | 27.5 | 18.7 | $8.00 | $11.99 | 4s | 54s | **$4.59** |
| SPRAY | 6 | 40.0 | 33.8 | 26.7 | $8.00 | $17.89 | 4s | 41s | **$3.94** |
| LEARNER | 6 | 28.0 | 27.7 | 14.5 | $14.00 | $10.54 | 4s | 65s | **$0.19** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| CLASSIC | 1 | 1 | SPRAY | $78.00 | 140s | 300 |
| CLASSIC | 1 | 2 | LEARNER | $81.06 | 150s | 335 |
| CLASSIC | 2 | 1 | SPRAY | $172.00 | 145s | 302 |
| CLASSIC | 2 | 2 | LEARNER | $127.06 | 145s | 333 |
| LEAN | 1 | 1 | LEARNER | $14.19 | 195s | 303 |
| LEAN | 1 | 2 | BALANCED | $14.14 | 195s | 335 |
| LEAN | 2 | 1 | LEARNER | $5.03 | 195s | 302 |
| LEAN | 2 | 2 | LEARNER | $19.89 | 195s | 337 |
