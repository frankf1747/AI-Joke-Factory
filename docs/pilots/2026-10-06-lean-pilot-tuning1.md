# Lean pilot — 2026-10-06

_tuning 1: preference_base 3_

Verdict (Lean round 2): **FAIL** — Careful does not out-earn Spray

- Lean R2 vs Lean R1 mean profit: $0.27 vs -$13.43 (improved)

## Settings

- Backend http://localhost:8081; bots at 10x; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER per class.
- Lean R1: setup $3 per batch, carrying $0.2 per joke-minute, WIP limit none, arrival window 180s, preference_base 3.
- Lean R2: setup $1 per batch, carrying $0.2 per joke-minute, WIP limit 2, arrival window 180s, preference_base 3.
- Tuning: preference_base 3 (PILOT_PREFERENCE_BASE); plan lean: Lean classes only (PILOT_PLAN).
- Carrying scaled ×10 to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.
- Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.
- Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles 15s before reading stats.

Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). Lead time is submit to publish; time to first sale is publish to first sale (Lean only).

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 11.7 | 12.2 | $24.00 | $6.83 | 4s | 60s | **-$21.00** |
| BALANCED | 6 | 28.8 | 20.3 | 21.3 | $24.00 | $13.49 | 4s | 62s | **-$20.15** |
| SPRAY | 6 | 40.0 | 45.8 | 27.7 | $24.00 | $18.33 | 4s | 41s | **-$0.50** |
| LEARNER | 6 | 16.0 | 20.8 | 10.0 | $24.00 | $7.09 | 4s | 49s | **-$12.09** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 9.7 | 12.5 | $8.00 | $6.51 | 4s | 28s | **-$6.68** |
| BALANCED | 6 | 28.0 | 27.5 | 19.0 | $8.00 | $12.06 | 4s | 44s | **$4.52** |
| SPRAY | 6 | 40.0 | 30.8 | 29.0 | $8.00 | $19.37 | 4s | 55s | **-$0.54** |
| LEARNER | 6 | 28.0 | 31.3 | 15.5 | $14.00 | $10.61 | 4s | 56s | **$3.78** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| LEAN | 1 | 1 | LEARNER | $27.37 | 195s | 303 |
| LEAN | 1 | 2 | BALANCED | $12.06 | 195s | 335 |
| LEAN | 2 | 1 | SPRAY | $11.26 | 195s | 302 |
| LEAN | 2 | 2 | BALANCED | $14.38 | 195s | 337 |
