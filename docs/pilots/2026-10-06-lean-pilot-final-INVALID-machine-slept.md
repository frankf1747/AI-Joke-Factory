# Lean pilot — 2026-10-06

_final confirmation: tuned settings, Classic and Lean with 150 customers_

Verdict (Lean round 2): **FAIL** — Learner does not out-earn Spray; Careful does not out-earn Spray; Spray won Lean class rep 2 round 2

- Lean R2 vs Lean R1 mean profit: -$1.12 vs -$88.15 (improved)
- Classic R2 vs Classic R1 mean profit: $35.86 vs $35.90 (not improved)

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
| CAREFUL | 6 | 9.0 | 25.0 | — | $0.00 | $0.00 | 0s | 0s | **$23.97** |
| BALANCED | 6 | 16.5 | 47.5 | — | $0.00 | $0.00 | 0s | 0s | **$45.78** |
| SPRAY | 6 | 25.0 | 77.5 | — | $0.00 | $0.00 | 0s | 0s | **$75.00** |
| LEARNER | 6 | 10.0 | 0.0 | — | $0.00 | $0.00 | 0s | 0s | **-$1.15** |

## CLASSIC R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 9.0 | 25.0 | — | $0.00 | $0.00 | 0s | 0s | **$23.97** |
| BALANCED | 6 | 15.5 | 54.7 | — | $0.00 | $0.00 | 0s | 0s | **$53.05** |
| SPRAY | 6 | 23.3 | 55.8 | — | $0.00 | $0.00 | 0s | 0s | **$53.50** |
| LEARNER | 6 | 15.0 | 14.5 | — | $0.00 | $0.00 | 0s | 0s | **$12.93** |

## LEAN R1

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 10.0 | 10.2 | 7.8 | $10.00 | $39.94 | 4s | 178s | **-$40.92** |
| BALANCED | 6 | 18.5 | 19.3 | 14.0 | $11.00 | $114.40 | 131s | 45s | **-$107.99** |
| SPRAY | 6 | 29.2 | 72.7 | 21.3 | $12.33 | $180.63 | 21s | 35s | **-$123.22** |
| LEARNER | 6 | 11.0 | 29.0 | 4.3 | $12.00 | $96.19 | 24s | 11s | **-$80.45** |

## LEAN R2

| Persona | Teams | Published | Sales | Never sold | Setup | Carrying | Lead time | Time to first sale | Profit |
|---|---|---|---|---|---|---|---|---|---|
| CAREFUL | 6 | 12.0 | 11.3 | 9.8 | $3.17 | $14.72 | 18s | 17s | **-$7.93** |
| BALANCED | 6 | 26.5 | 28.7 | 20.2 | $3.83 | $24.94 | 8s | 31s | **-$2.86** |
| SPRAY | 6 | 40.0 | 60.5 | 29.2 | $4.00 | $43.81 | 13s | 28s | **$8.69** |
| LEARNER | 6 | 23.3 | 25.7 | 16.0 | $6.08 | $19.51 | 8s | 38s | **-$2.38** |

## Classes

| Mode | Rep | Round | Winner | Profit | Duration | Classification calls |
|---|---|---|---|---|---|---|
| CLASSIC | 1 | 1 | CAREFUL | $148.16 | 140s | 300 |
| CLASSIC | 1 | 2 | SPRAY | $152.00 | 150s | 335 |
| CLASSIC | 2 | 1 | SPRAY | $205.00 | 1858s | 63 |
| CLASSIC | 2 | 2 | CAREFUL | $149.77 | 1097s | 42 |
| LEAN | 1 | 1 | LEARNER | $27.14 | 203s | 303 |
| LEAN | 1 | 2 | LEARNER | -$1.61 | 823s | 335 |
| LEAN | 2 | 1 | CAREFUL | -$29.47 | 2000s | 101 |
| LEAN | 2 | 2 | SPRAY | $69.16 | 1370s | 273 |
