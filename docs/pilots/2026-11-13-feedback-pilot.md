# Feedback pilot — listing $0.10, hosting $0.05 per joke-minute — 2026-11-13

## Success checks

- **PASS** — 1. Feedback teams' mean fit rises from their first to their last Round 2 batches; no-feedback twins' does not: first → last batch: feedback +3.50, no feedback +0.27 (rises = at least +0.5)
- **PASS** — 2. In Round 2, feedback teams earn more profit than their no-feedback twins: mean Round 2 profit difference, each feedback team minus its own twin: +$63.29 over 30 pairs
- **PASS** — 3. The feedback gain is larger for small batches than for large ones: Round 2 profit gain from feedback (mean paired difference): small +$119.30 over 15 pairs, large +$7.28 over 15 pairs
- **FAIL** — 4. Feedback is gradual: a feedback team needs at least 3 batches to first clear the bar: mean over the 28 of 30 feedback teams that cleared the bar of 8 in Round 2: first cleared at batch 2.7 (small 3.1, large 2.2)
- **PASS** — 5. About half of teams or more finish Round 2 in profit, and a team releasing everything spends 40–60 % of its Round 1 revenue on fees: 53 % of teams in profit in Round 2 (want ≥ 45 %); Round 1 fees are 43 % of revenue (every team releases everything)

## Reading the evidence

- Twins share one market. Every team stocks the same shelf and each customer shops once, so a feedback team's extra sales are partly sales its twin (or another team) would have made. The profit gap between twins therefore overstates the absolute gain from feedback; read it as a direction, not a size.
- This is a best case for feedback. The bots turn each note into exact, known categories (they know every corpus joke's traits), while students do not know which categories their jokes fall into, so people will get less out of the same feedback.

## Settings

- One class = 20 bot teams (5 matched pairs of each batch size), Balanced pace, bots at 10×, trait classifier; Round 1 then Round 2; 3 classes, seeds feedback-1794608088904-c1… .
- Round 1: batches of 5 for everyone. Round 2: small teams send 3, large teams 10. Every Marketing seat releases every joke.
- Costs (classroom rates): listing $0.10 per released joke, hosting $0.05 per joke-minute (sent ×10, $0.50, because the backend charges per wall-clock minute). Shipping, storage and discard 0.
- Arrival window 90 s (15 class minutes). The ideal is the pilot ideal (config/dimensions DEFAULT_IDEAL_PROFILE) in both rounds. The bar is the customers' default buy threshold, 8.

Classes counted: 3 of 3 requested.

Means per team over 3 classes. Fit is computed by the pilot from each released joke's corpus traits and the round's ideal; the bots never see it.

## Round 1

| Group | Teams | Batches to clear the bar | Released jokes over the bar | Sales | Listing | Hosting | Profit | Send → first sale |
|---|---|---|---|---|---|---|---|---|
| Small + feedback | 15 | 3.2 (15 teams) | 62 % | 77.1 | $4.00 | $12.00 | **$61.13** | 18 s |
| Small, no feedback | 15 | 4.5 (11 teams) | 3 % | 9.5 | $4.00 | $16.02 | **-$10.55** | 15 s |
| Large + feedback | 15 | 3.3 (15 teams) | 59 % | 75.2 | $4.00 | $12.29 | **$58.91** | 18 s |
| Large, no feedback | 15 | 3.8 (10 teams) | 3 % | 7.9 | $4.00 | $16.01 | **-$12.08** | 20 s |

Mean fit of released jokes by batch (the learning curve; the bar is 8):

| Group | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 |
|---|---|---|---|---|---|---|---|---|
| Small + feedback | 4.8 | 4.7 | 6.1 | 10.0 | 11.3 | 10.9 | 10.9 | 10.2 |
| Small, no feedback | 4.8 | 4.7 | 4.8 | 4.8 | 4.6 | 4.8 | 5.2 | 4.9 |
| Large + feedback | 4.5 | 4.8 | 5.3 | 9.9 | 10.6 | 11.2 | 10.9 | 10.5 |
| Large, no feedback | 4.5 | 4.8 | 4.5 | 4.7 | 5.3 | 5.0 | 4.8 | 5.1 |

## Round 2

| Group | Teams | Batches to clear the bar | Released jokes over the bar | Sales | Listing | Hosting | Profit | Send → first sale |
|---|---|---|---|---|---|---|---|---|
| Small + feedback | 15 | 3.1 (15 teams) | 74 % | 122.3 | $2.94 | $6.56 | **$112.84** | 11 s |
| Small, no feedback | 15 | 3.8 (11 teams) | 4 % | 7.1 | $2.94 | $10.66 | **-$6.46** | 12 s |
| Large + feedback | 15 | 2.2 (13 teams) | 7 % | 28.5 | $4.00 | $16.87 | **$7.66** | 26 s |
| Large, no feedback | 15 | 2.2 (13 teams) | 4 % | 21.5 | $4.00 | $17.08 | **$0.38** | 24 s |

Mean fit of released jokes by batch (the learning curve; the bar is 8):

| Group | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | B11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Small + feedback | 4.5 | 4.9 | 8.1 | 10.9 | 11.0 | 11.6 | 11.1 | 11.1 | 10.8 | 10.5 | — |
| Small, no feedback | 4.5 | 4.9 | 5.4 | 4.8 | 4.9 | 4.8 | 4.8 | 4.8 | 5.0 | 5.1 | — |
| Large + feedback | 4.9 | 4.9 | 4.8 | 5.9 | — | — | — | — | — | — | — |
| Large, no feedback | 4.9 | 4.9 | 4.8 | 4.8 | — | — | — | — | — | — | — |
