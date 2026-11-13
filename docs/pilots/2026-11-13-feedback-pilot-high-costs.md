# Feedback pilot — listing $0.25, hosting $0.20 per joke-minute — 2026-11-13

## Success checks

- **PASS** — 1. Feedback teams' mean fit rises from their first to their last Round 2 batches; no-feedback twins' does not: first → last batch: feedback +3.14, no feedback +0.20 (rises = at least +0.5)
- **PASS** — 2. In Round 2, feedback teams earn more profit than their no-feedback twins: mean Round 2 profit difference, each feedback team minus its own twin: +$52.41 over 10 pairs
- **PASS** — 3. The feedback gain is larger for small batches than for large ones: Round 2 profit gain from feedback (mean paired difference): small +$104.32 over 5 pairs, large +$0.50 over 5 pairs
- **FAIL** — 4. Feedback is gradual: a feedback team needs at least 3 batches to first clear the bar: mean over the 9 of 10 feedback teams that cleared the bar of 8 in Round 2: first cleared at batch 2.3 (small 2.8, large 1.8)
- **FAIL** — 5. About half of teams or more finish Round 2 in profit, and a team releasing everything spends 40–60 % of its Round 1 revenue on fees: 30 % of teams in profit in Round 2 (want ≥ 45 %); Round 1 fees are 145 % of revenue (every team releases everything)

## Reading the evidence

- Twins share one market. Every team stocks the same shelf and each customer shops once, so a feedback team's extra sales are partly sales its twin (or another team) would have made. The profit gap between twins therefore overstates the absolute gain from feedback; read it as a direction, not a size.
- This is a best case for feedback. The bots turn each note into exact, known categories (they know every corpus joke's traits), while students do not know which categories their jokes fall into, so people will get less out of the same feedback.

## Settings

- One class = 20 bot teams (5 matched pairs of each batch size), Balanced pace, bots at 10×, trait classifier; Round 1 then Round 2; 1 class, seeds feedback-1794608890467-c1… .
- Round 1: batches of 5 for everyone. Round 2: small teams send 3, large teams 10. Every Marketing seat releases every joke.
- Costs (classroom rates): listing $0.25 per released joke, hosting $0.20 per joke-minute (sent ×10, $2.00, because the backend charges per wall-clock minute). Shipping, storage and discard 0.
- Arrival window 90 s (15 class minutes). The ideal is the pilot ideal (config/dimensions DEFAULT_IDEAL_PROFILE) in both rounds. The bar is the customers' default buy threshold, 8.

Classes counted: 1 of 1 requested.

Means per team over 1 class. Fit is computed by the pilot from each released joke's corpus traits and the round's ideal; the bots never see it.

## Round 1

| Group | Teams | Batches to clear the bar | Released jokes over the bar | Sales | Listing | Hosting | Profit | Send → first sale |
|---|---|---|---|---|---|---|---|---|
| Small + feedback | 5 | 3.0 (5 teams) | 58 % | 74.8 | $10.00 | $47.42 | **$17.38** | 17 s |
| Small, no feedback | 5 | 3.3 (4 teams) | 6 % | 21.2 | $10.00 | $60.84 | **-$49.64** | 18 s |
| Large + feedback | 5 | 3.0 (5 teams) | 59 % | 66.4 | $10.00 | $47.29 | **$9.11** | 17 s |
| Large, no feedback | 5 | 3.8 (5 teams) | 5 % | 14.6 | $10.00 | $60.53 | **-$55.93** | 17 s |

Mean fit of released jokes by batch (the learning curve; the bar is 8):

| Group | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 |
|---|---|---|---|---|---|---|---|---|
| Small + feedback | 4.7 | 5.1 | 4.8 | 8.8 | 10.8 | 11.3 | 10.9 | 10.7 |
| Small, no feedback | 4.7 | 5.1 | 4.8 | 5.0 | 4.3 | 4.8 | 5.0 | 4.9 |
| Large + feedback | 5.0 | 4.7 | 5.4 | 9.3 | 11.2 | 11.3 | 10.7 | 10.8 |
| Large, no feedback | 5.0 | 4.7 | 5.4 | 4.3 | 4.9 | 4.9 | 5.6 | 5.2 |

## Round 2

| Group | Teams | Batches to clear the bar | Released jokes over the bar | Sales | Listing | Hosting | Profit | Send → first sale |
|---|---|---|---|---|---|---|---|---|
| Small + feedback | 5 | 2.8 (5 teams) | 72 % | 115.6 | $7.35 | $27.48 | **$80.77** | 12 s |
| Small, no feedback | 5 | 4.4 (5 teams) | 7 % | 25.6 | $7.50 | $41.65 | **-$23.55** | 17 s |
| Large + feedback | 5 | 1.8 (4 teams) | 3 % | 20.8 | $10.00 | $66.43 | **-$55.63** | 27 s |
| Large, no feedback | 5 | 1.8 (4 teams) | 3 % | 20.6 | $10.00 | $66.73 | **-$56.13** | 28 s |

Mean fit of released jokes by batch (the learning curve; the bar is 8):

| Group | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | B11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Small + feedback | 4.6 | 5.2 | 7.3 | 10.8 | 11.2 | 11.4 | 11.2 | 11.0 | 10.8 | 10.8 | — |
| Small, no feedback | 4.6 | 5.2 | 6.0 | 5.0 | 5.6 | 4.6 | 5.8 | 5.0 | 4.8 | 4.9 | 6.4 |
| Large + feedback | 5.0 | 4.7 | 4.7 | 5.0 | — | — | — | — | — | — | — |
| Large, no feedback | 5.0 | 4.7 | 4.7 | 5.0 | — | — | — | — | — | — | — |
