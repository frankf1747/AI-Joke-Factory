# Lean pilot — 2026-10-06

_tuning 3: dedupe baskets, preference_base 3, carrying 0.05, setup 2/0.5_

Verdict (Lean round 2): **PASS**

- Lean R2 vs Lean R1 mean profit: -$13.32 vs -$22.78 (improved)

## Settings

- Backend http://localhost:8081; bots at 10x; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER per class.
- Lean R1: setup $2 per batch, carrying $0.5 per joke-minute, WIP limit none, arrival window 180s, preference_base 3.
- Lean R2: setup $0.5 per batch, carrying $0.5 per joke-minute, WIP limit 2, arrival window 180s, preference_base 3.
- Tuning: preference_base 3 (PILOT_PREFERENCE_BASE); carrying $0.05 per joke-minute before the ×10 scaling (PILOT_CARRYING); setup R1 $2 (PILOT_SETUP_R1); setup R2 $0.5 (PILOT_SETUP_R2); plan lean: Lean classes only (PILOT_PLAN).
- Carrying scaled ×10 to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.
- Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.
- Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles 15s before reading stats.

Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). Lead time is submit to publish; time to first sale is publish to first sale (Lean only).

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 10.5 | 12.5 | $16.00 | $17.32 | 4s | 40s | **-$24.66** |
| BALANCED | 6 | 28.8 | 20.3 | 21.8 | $16.00 | $34.26 | 4s | 64s | **-$32.92** |
| SPRAY | 6 | 40.0 | 45.0 | 28.3 | $16.00 | $46.90 | 4s | 46s | **-$21.90** |
| LEARNER | 6 | 16.0 | 23.2 | 8.7 | $16.00 | $16.96 | 4s | 55s | **-$11.64** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 10.7 | 12.8 | $4.00 | $16.92 | 4s | 49s | **-$12.09** |
| BALANCED | 6 | 28.0 | 25.2 | 19.5 | $4.00 | $30.99 | 4s | 48s | **-$12.75** |
| SPRAY | 6 | 40.0 | 31.8 | 29.3 | $4.00 | $48.21 | 4s | 46s | **-$24.38** |
| LEARNER | 6 | 28.0 | 31.7 | 15.5 | $7.00 | $25.81 | 4s | 52s | **-$4.08** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| LEAN | 1 | 1 | LEARNER | $11.54 | 195s | 303 |
| LEAN | 1 | 2 | LEARNER | $13.72 | 195s | 335 |
| LEAN | 2 | 1 | SPRAY | -$2.04 | 195s | 302 |
| LEAN | 2 | 2 | LEARNER | $10.12 | 195s | 337 |
