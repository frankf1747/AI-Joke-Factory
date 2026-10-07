# Lean pilot — 2026-10-06

_tuning 4: tuning 3 + 150 customers_

Verdict (Lean round 2): **PASS**

- Lean R2 vs Lean R1 mean profit: $0.69 vs -$8.64 (improved)

## Settings

- Backend http://localhost:8081; bots at 10x; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER per class.
- Lean R1: setup $2 per batch, carrying $0.5 per joke-minute, WIP limit none, arrival window 180s, preference_base 3.
- Lean R2: setup $0.5 per batch, carrying $0.5 per joke-minute, WIP limit 2, arrival window 180s, preference_base 3.
- Tuning: preference_base 3 (PILOT_PREFERENCE_BASE); carrying $0.05 per joke-minute before the ×10 scaling (PILOT_CARRYING); setup R1 $2 (PILOT_SETUP_R1); setup R2 $0.5 (PILOT_SETUP_R2); 150 customers per round, all modes (PILOT_CUSTOMERS); plan lean: Lean classes only (PILOT_PLAN).
- Carrying scaled ×10 to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.
- Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.
- Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles 15s before reading stats.

Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). Lead time is submit to publish; time to first sale is publish to first sale (Lean only).

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 15.8 | 11.3 | $16.00 | $16.11 | 4s | 41s | **-$18.12** |
| BALANCED | 6 | 28.8 | 30.5 | 20.5 | $16.00 | $31.97 | 4s | 45s | **-$20.47** |
| SPRAY | 6 | 40.0 | 69.5 | 26.8 | $16.00 | $44.89 | 4s | 40s | **$4.61** |
| LEARNER | 6 | 16.0 | 32.5 | 8.2 | $16.00 | $15.25 | 4s | 37s | **-$0.59** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 17.7 | 11.8 | $4.00 | $16.21 | 4s | 45s | **-$4.39** |
| BALANCED | 6 | 28.0 | 38.5 | 18.3 | $4.00 | $29.25 | 4s | 41s | **$2.33** |
| SPRAY | 6 | 40.0 | 47.2 | 27.5 | $4.00 | $46.39 | 4s | 48s | **-$7.22** |
| LEARNER | 6 | 28.0 | 45.0 | 13.2 | $7.00 | $23.01 | 4s | 43s | **$12.05** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| LEAN | 1 | 1 | LEARNER | $31.52 | 195s | 303 |
| LEAN | 1 | 2 | LEARNER | $25.38 | 195s | 335 |
| LEAN | 2 | 1 | SPRAY | $18.79 | 195s | 302 |
| LEAN | 2 | 2 | LEARNER | $23.18 | 195s | 337 |
