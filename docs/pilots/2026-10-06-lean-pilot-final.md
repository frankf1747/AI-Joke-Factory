# Lean pilot — 2026-10-07

_final confirmation (re-run with the machine kept awake): Classic vs the tuned Lean preset, preference base 3, 150 customers, setup $2 then $0.50, carrying $0.05/joke-min, WIP 2 in R2_

Verdict (Lean round 2): **FAIL** — Careful does not out-earn Spray

- Lean R2 vs Lean R1 mean profit: $1.50 vs -$8.41 (improved)
- Classic R2 vs Classic R1 mean profit: $34.59 vs $34.84 (not improved)

## Settings

- Backend http://localhost:8081; bots at 10x; 3 CAREFUL, 3 BALANCED, 3 SPRAY, 3 LEARNER per class.
- Lean R1: setup $2 per batch, carrying $0.5 per joke-minute, WIP limit none, arrival window 180s, preference_base 3.
- Lean R2: setup $0.5 per batch, carrying $0.5 per joke-minute, WIP limit 2, arrival window 180s, preference_base 3.
- Tuning: preference_base 3 (PILOT_PREFERENCE_BASE); carrying $0.05 per joke-minute before the ×10 scaling (PILOT_CARRYING); setup R1 $2 (PILOT_SETUP_R1); setup R2 $0.5 (PILOT_SETUP_R2); 150 customers per round, all modes (PILOT_CUSTOMERS); plan all: Classic and Lean classes.
- Carrying scaled ×10 to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.
- Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.
- Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles 15s before reading stats.

Means per team. Sales counts purchases (a joke can sell many times); never sold counts published jokes with no sale (Lean only). Lead time is submit to publish; time to first sale is publish to first sale (Lean only).

## CLASSIC R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 20.8 | — | $0.00 | $0.00 | 0s | 0s | **$18.99** |
| BALANCED | 6 | 28.3 | 34.7 | — | $0.00 | $0.00 | 0s | 0s | **$31.72** |
| SPRAY | 6 | 40.0 | 94.5 | — | $0.00 | $0.00 | 0s | 0s | **$90.50** |
| LEARNER | 6 | 16.0 | 0.0 | — | $0.00 | $0.00 | 0s | 0s | **-$1.84** |

## CLASSIC R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 17.2 | — | $0.00 | $0.00 | 0s | 0s | **$15.33** |
| BALANCED | 6 | 27.3 | 30.5 | — | $0.00 | $0.00 | 0s | 0s | **$27.64** |
| SPRAY | 6 | 40.0 | 60.2 | — | $0.00 | $0.00 | 0s | 0s | **$56.17** |
| LEARNER | 6 | 28.0 | 42.2 | — | $0.00 | $0.00 | 0s | 0s | **$39.23** |

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 14.3 | 11.2 | $16.00 | $16.63 | 4s | 48s | **-$20.14** |
| BALANCED | 6 | 28.8 | 29.3 | 20.8 | $16.00 | $32.53 | 4s | 49s | **-$22.19** |
| SPRAY | 6 | 40.0 | 71.7 | 26.2 | $16.00 | $43.23 | 4s | 32s | **$8.44** |
| LEARNER | 6 | 16.0 | 32.8 | 7.5 | $16.00 | $14.75 | 4s | 38s | **$0.24** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 16.0 | 14.5 | 12.3 | $4.00 | $16.42 | 4s | 42s | **-$7.76** |
| BALANCED | 6 | 28.0 | 41.0 | 17.5 | $4.00 | $28.44 | 4s | 42s | **$5.64** |
| SPRAY | 6 | 40.0 | 46.8 | 27.2 | $4.00 | $43.93 | 4s | 27s | **-$5.09** |
| LEARNER | 6 | 28.0 | 46.7 | 12.2 | $7.00 | $23.50 | 4s | 52s | **$13.23** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| CLASSIC | 1 | 1 | BALANCED | $123.17 | 140s | 300 |
| CLASSIC | 1 | 2 | SPRAY | $154.00 | 150s | 335 |
| CLASSIC | 2 | 1 | SPRAY | $283.00 | 145s | 302 |
| CLASSIC | 2 | 2 | LEARNER | $181.06 | 145s | 333 |
| LEAN | 1 | 1 | LEARNER | $32.39 | 195s | 303 |
| LEAN | 1 | 2 | LEARNER | $46.40 | 195s | 335 |
| LEAN | 2 | 1 | LEARNER | $26.03 | 196s | 302 |
| LEAN | 2 | 2 | BALANCED | $31.22 | 195s | 337 |
