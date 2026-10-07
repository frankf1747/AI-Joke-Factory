# Lean pilot — 2026-10-06

_tuning 2: preference_base 3, carrying 0.05_

Verdict (Lean round 2): **PASS**

- Lean R2 vs Lean R1 mean profit: -$17.92 vs -$30.75 (improved)

## Settings

- Backend http://localhost:8081; bots at 10x; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER per class.
- Lean R1: setup $3 per batch, carrying $0.5 per joke-minute, WIP limit none, arrival window 180s, preference_base 3.
- Lean R2: setup $1 per batch, carrying $0.5 per joke-minute, WIP limit 2, arrival window 180s, preference_base 3.
- Tuning: preference_base 3 (PILOT_PREFERENCE_BASE); carrying $0.05 per joke-minute before the ×10 scaling (PILOT_CARRYING); plan lean: Lean classes only (PILOT_PLAN).
- Carrying scaled ×10 to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.
- Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.
- Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles 15s before reading stats.

Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). Lead time is submit to publish; time to first sale is publish to first sale (Lean only).

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 12.2 | 12.2 | $24.00 | $17.47 | 4s | 75s | **-$31.15** |
| BALANCED | 6 | 28.8 | 18.7 | 22.2 | $24.00 | $34.03 | 4s | 58s | **-$42.36** |
| SPRAY | 6 | 40.0 | 49.3 | 28.3 | $24.00 | $46.11 | 4s | 37s | **-$24.78** |
| LEARNER | 6 | 16.0 | 19.0 | 10.0 | $24.00 | $17.87 | 4s | 45s | **-$24.71** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 12.0 | 12.3 | $8.00 | $16.33 | 4s | 54s | **-$14.17** |
| BALANCED | 6 | 28.0 | 27.3 | 18.8 | $8.00 | $29.61 | 4s | 43s | **-$13.20** |
| SPRAY | 6 | 40.0 | 26.7 | 29.3 | $8.00 | $48.92 | 4s | 56s | **-$34.25** |
| LEARNER | 6 | 28.0 | 34.0 | 17.2 | $14.00 | $27.11 | 4s | 50s | **-$10.05** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| LEAN | 1 | 1 | LEARNER | -$8.07 | 195s | 303 |
| LEAN | 1 | 2 | LEARNER | $22.36 | 195s | 335 |
| LEAN | 2 | 1 | SPRAY | -$7.17 | 195s | 302 |
| LEAN | 2 | 2 | LEARNER | $6.43 | 195s | 337 |
