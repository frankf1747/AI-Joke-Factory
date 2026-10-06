# Lean market mode — a guide for instructors

This guide explains how to run the Joke Factory in **Lean market mode**: what it teaches, how a
90-minute class runs, what each person does on which screen, how the simulated customers buy,
how profit is calculated, and how to switch back to the Classic game.

Everything here describes the code as it stands on the `feat/lean-market` branches of both
repositories. Where the code differs from the design spec
(`docs/superpowers/specs/2026-10-06-lean-market-mode-design.md`), this guide follows the code
and says so.

---

## 1. Goal

Lean mode exists to make the game reward what Lean operations teach: short lead times, small
batches, fast feedback, low inventory and learning from the market. A team should earn more by
getting good jokes to customers quickly and listening to what sells than by pushing out as many
jokes as it can.

The Classic game does not reward that. In Classic mode all 100 customers shop the moment a joke
is classified. Each buys every joke that clears their bar until their $3 is spent, and after that
only swaps for a joke at least 0.5 fit points better. The first one or two batches in the room
take almost all of the available sales, and everyone else sells little or nothing. It is a
first-mover market. The bot pilot of 2026-10-01 (12 teams, two classes at each cost level)
showed this clearly:

| Persona | Jokes published | Profit at $0.10 publishing cost | Profit at $5 |
|---|---|---|---|
| Careful | 16 | −$1.84 | −$80 |
| Balanced | 28 | −$2.95 | −$128 |
| Spray | 40 | **+$71** | −$138 |

The team that sprays jokes wins at normal costs, and raising costs only makes everyone lose.
Lean mode changes the market, not the scoring of jokes: customers arrive steadily through the
round, waste carries a visible price, and Round 2 adds a pull rule. Classic remains the default
and is unchanged.

---

## 2. The two rounds

A Lean class has two rounds played back to back. **Round 1 uses push rules**: an expensive setup
per batch, no limit on how much work piles up in front of Marketing. **Round 2 uses lean rules**:
cheaper setup, smaller batches allowed, and a work-in-progress (WIP) limit that stops the Joke
Maker from pushing more batches than Marketing can handle. The debrief compares the two side by
side.

Suggested timeline for a 90-minute session (about 65 minutes of game time, leaving room for an
introduction and overrun):

| Step | Time | Instructor (Instructor screen) | Joke Makers | Marketing |
|---|---|---|---|---|
| Setup | 10 min | Forms teams in the lobby. Presses **Lean class preset**, picks the ideal joke profile, checks both rounds show Market mode **Lean**. Explains the rules. | Log in, take their seat, read the brief. | Log in, take their seat, read "The 12 criteria customers judge". |
| Round 1 — push | 15 min | Presses **Start** with the Round 1 tab selected. Watches the leaderboard, calls out cues (section 6). Presses **End Round** at about 15 minutes. | Write batches of exactly 5 jokes and press **Send to Marketing**. See "Each batch costs $3.00 to set up". No WIP limit. | Split each batch, choose jokes, add a Topic and title, **Release to market**. Watch the Setup cost, Carrying cost and Publish → first sale tiles. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard with the Setup, Carrying, Lead and Sale columns. Asks what drove cost and why jokes sat unsold. | Discuss. | Discuss; read the Customer feedback panel and learning curve. |
| Round 2 — lean | 15 min | Selects the Round 2 tab, confirms Market mode is Lean with WIP limit 2, presses **Start**, ends at about 15 minutes. | Batches may be smaller than 5 (5 is now a cap). See the WIP counter; when it reads "— wait, or go help", stop and help Marketing. | Same desk; in Round 2 Marketing may also discard a whole batch. |
| Debrief 2 | 15+ min | Opens the **Round 1 vs Round 2** table and works through the debrief questions in section 6. | Discuss. | Discuss. |

The default **Arrival window** is 900 seconds, so customers arrive over exactly 15 minutes. The
rounds are ended by hand: ending early means the remaining customers never arrive, and running
much past 15 minutes brings no new customers while carrying costs keep running.

---

## 3. Human interaction by role

### Instructor

**CONFIG panel.** The CONFIG panel edits the round selected by the **Round 1 / Round 2** tabs at
the top of the screen, and only while that round has not started. When Market mode is set to
Lean, four extra fields appear:

| Label on screen | What it does |
|---|---|
| **Market mode:** Classic / Lean | Chooses the market. Locked once the round starts. |
| **Arrival window (s):** | Customers arrive evenly over this many seconds from Start. Minimum 1. |
| **Setup cost / batch:** | Charged every time the Joke Maker sends a batch. |
| **Carrying cost / joke-min:** | Charged per joke per minute for work waiting in Marketing and for published jokes not yet sold (see section 5). |
| **WIP limit:** | How many batches may wait for Marketing before the Joke Maker is blocked. 0 means no limit. |

Changes take effect when you press **Apply**. The other fields (R1 Batch Size, Cust. Budget,
Market Price (p), Cost of Publishing (c), the nudges) work as in Classic.

**Lean class preset.** One button writes both rounds at once: Round 1 gets Lean, setup $3, carrying
$0.02, WIP limit 0; Round 2 gets Lean, setup $1, carrying $0.02, WIP limit 2. It does not change
the arrival window, batch size, price or costs. It only writes rounds that have not started yet,
and is disabled while a round is running. A notice confirms it, for example
"Lean class preset applied — Round 1: push rules · Round 2: lean rules". If Round 1 has already
started, it applies to Round 2 only and says so.

**Start / End Round.** Unchanged from Classic. In Lean mode, Start also stamps each customer's
arrival time. Ending Round 1 asks for confirmation and advances the game to Round 2.

**Leaderboard.** For a Lean round, four sortable columns appear after Profit:

| Column | Meaning |
|---|---|
| **Setup** | Batches submitted × setup cost per batch. |
| **Carrying** | Carrying cost so far (section 5). |
| **Lead** | Average seconds from a batch being sent to Marketing releasing it. |
| **Sale** | Average seconds from a joke being published to its first sale. |

Profit on a Lean leaderboard already has setup and carrying subtracted. The first click on a Lean
column sorts lowest first, because lower is better.

**Round 1 vs Round 2 table.** Once Round 2 has stats and at least one round is Lean, a card titled
"Round 1 vs Round 2" (subtitle "Push rules vs lean rules, per team") appears. Per team it shows:
R1 profit, R2 profit, Δ profit (green when it went up, red when it went down), R1 unsold, R2
unsold, R1 setup+carry, R2 setup+carry, R1 lead, R2 lead. Teams are sorted by Round 2 profit.

### Joke Maker

The Joke Maker writes jokes with the AI tool, pastes them in, ticks "I certify these jokes are not
offensive." and presses **Send to Marketing**, as in Classic.

In a Lean round, a line under the Send button shows the setup cost:
"Each batch costs $3.00 to set up" (or whatever the round's setup cost is). When the round has a
WIP limit, the same line adds the counter, for example "Marketing has 1 of 2 batches waiting".
When the count reaches the limit the text turns amber, reads
"Marketing has 2 of 2 batches waiting — wait, or go help", and **Send to Marketing** is disabled.
A batch counts as waiting from the moment it is sent until Marketing releases it.

What to do when blocked: stop writing new batches, walk over and help your Marketing partner
decide, or improve the next batch using the customer feedback. If the limit is reached between
screen refreshes and the server refuses the send, an alert says
"Marketing still has batches waiting. In a pull system you wait — or go help them decide." and the
draft is kept so it can be sent later.

The Joke Maker also sees a **Learning curve** card (see Marketing) and the Customer feedback panel.

### Marketing

The next waiting batch appears on the **Marketing Desk** automatically (the app claims it for
the team). Marketing then:

1. **Splits** the raw text into individual jokes (cursor between jokes, Enter or **Split**), then
   **Confirm, next**. In Round 1 the batch must split into exactly the batch size; in Round 2 the
   batch size is a cap.
2. **Decides** which jokes to sell, giving each a Topic and a title. In Round 2 Marketing may
   choose none and **Discard batch** instead.
3. **Releases** with **Release to market**. Released jokes are published, classified by the AI and
   put on the shelf for customers.

In a Lean round three extra tiles appear next to the usual ones (Profit, Sold / Total, Created to
Publish, Content Waste):

| Tile | Meaning |
|---|---|
| **Setup cost** | The team's setup cost so far. |
| **Carrying cost** | The team's carrying cost so far; it rises every minute work waits or jokes sit unsold. |
| **Publish → first sale** | Average seconds a sold joke waited for its first buyer. |

A **Learning curve** card ("Share of each batch's released jokes that sold") plots, for each
batch in the order it was sent, the share of its released jokes that have sold at least once.
A rising line means the team is learning what the market wants. Batches with nothing released are
left out.

The **Customer feedback** panel is unchanged: it shows which of the criteria landed and which
missed, never by how much.

---

## 4. How customers buy

Each round creates its own 100 customers (the default customer count), so Round 2 starts with a
fresh market. Each customer has a personal quality bar of 7 ± 0.3 (threshold 7, random jitter up
to 0.3 either way) and a budget of $3. A joke's **fit** is how well it matches the hidden ideal
profile: the sum of its scores on the 12 criteria, from 0 to 12.

**Arrival.** Customers arrive evenly across the arrival window. With 100 customers and 900
seconds, one arrives every 9 seconds, the first at 0:09 and the last at 15:00. Arrival order is
shuffled so a customer's quality bar has nothing to do with when they arrive.

**Shopping once.** When a customer arrives they look at the shelf exactly once:

1. They consider every joke in the round that is published, classified, and has a fit at or above
   their personal bar.
2. They buy up to budget ÷ price jokes — 3 at the default $3 budget and $1 price — picking one at a
   time without replacement. Each pick is a weighted draw: a joke's weight is 2 raised to its fit.
   One fit point higher means twice as likely to be chosen. Better jokes sell more often, but good
   jokes still sell.
3. They leave and never shop again. There are no swaps.

A customer who finds nothing that clears their bar leaves with their money unspent. That sale is
lost for good: demand a team was not ready for does not wait. Customers who have not arrived by the
time the round ends are never served. A joke can be bought by many different customers, but each
customer buys a given joke at most once.

Customers are served whenever the round is polled (every screen refreshes every few seconds) and
whenever a batch finishes classification, so they are served within a few seconds of their
arrival time.

**Worked example.** A customer arrives at minute 6 (customer number 40 at the defaults). Their
personal bar is 6.9. On the shelf are three qualifying jokes with fits 11, 9 and 7.

| Joke fit | Weight (2^fit) | Odds | Chance of being the first pick |
|---|---|---|---|
| 11 | 2,048 | 16 | 16/21 ≈ 76% |
| 9 | 512 | 4 | 4/21 ≈ 19% |
| 7 | 128 | 1 | 1/21 ≈ 5% |

If the fit-11 joke is picked first, the second pick is between the other two at 4 : 1 (80% / 20%).
With a $3 budget and only three qualifying jokes, this customer ends up buying all three; the
weights decide the order, and they start to matter for sales once the shelf holds more qualifying
jokes than a customer can afford. With twenty jokes on the shelf, the fit-11 ones take most of the
sales and the fit-7 ones rarely sell. A customer whose bar was 7.2 would not see the fit-7 joke at
all.

---

## 5. Costs

In a Lean round, profit is:

```
profit = sales × market_price
       − published_jokes × cost_of_publishing
       − discarded_jokes × cost_of_discard
       − batches_submitted × setup_cost_per_batch
       − carrying_cost

carrying_cost = carrying_cost_per_joke_minute × (wip_joke_minutes + inventory_joke_minutes)
```

The terms, exactly as the stats query computes them:

| Term | Definition |
|---|---|
| **sales** | Purchases. A joke bought by three customers counts three times. |
| **published_jokes** / **discarded_jokes** | Jokes Marketing released / did not release. Defaults: $0.10 per published joke, $0.01 per discarded joke. |
| **batches_submitted** | Every time the Joke Maker sent a batch, including batches later discarded. |
| **wip_joke_minutes** | For each batch sent: number of jokes × minutes from being sent until Marketing releases (or discards) it. A batch not yet split counts as the round's batch size (5). If Marketing has not finished, the clock runs to now, or to the round's end. |
| **inventory_joke_minutes** | For each published joke: minutes from being published until its first sale. If it never sells, the clock runs to now, or to the round's end. Discarded jokes never carry. |

All clocks stop when the round ends. Nothing is stored: costs are worked out from timestamps each
time the screen refreshes, which is why the Carrying tile ticks up during the round. Note that the
inventory clock starts at release, so time spent waiting for AI classification counts as inventory.

The **unsold** figure on the leaderboard and the Round 1 vs Round 2 table is published jokes minus
sales, floored at zero. Because one joke can sell many times, this is not the same as the number
of jokes that never sold.

**Worked example at the preset** ($1 price, $0.10 publishing, $0.01 discard, $3 setup, $0.02
carrying, Round 1):

*Spray team.* Sends 8 batches of 5: setup 8 × $3 = $24. Marketing lets each batch wait 6 minutes:
8 × 5 × 6 × $0.02 = $4.80. Publishes all 40 jokes ($4.00); 20 of them sit unsold for 10 minutes:
20 × 10 × $0.02 = $4.00. With 60 sales: 60 − 4.00 − 24 − 8.80 = **$23.20**.

*Careful team.* Sends 4 batches ($12), each processed in 2 minutes: 4 × 5 × 2 × $0.02 = $0.80.
Publishes 10 of its 20 jokes ($1.00) and discards 10 ($0.10); 2 go unsold for 10 minutes ($0.40).
With 45 sales: 45 − 1.00 − 0.10 − 12 − 1.20 = **$30.70**.

The careful team earns more despite selling less. (The spec's version of this example gives
$30.80 because it leaves out the $0.10 discard cost.) Whether sales really split that way depends
on the players; see section 9.

**The preset and why:**

| Setting | Round 1 (push) | Round 2 (lean) | Reasoning |
|---|---|---|---|
| Market mode | Lean | Lean | Both rounds need steady arrivals and visible costs so they can be compared. |
| Setup cost / batch | $3 | $1 | Round 1 has costly changeovers, so each batch must earn its keep. Round 2 shows the payoff of setup reduction: small batches become affordable. |
| Carrying cost / joke-min | $0.02 | $0.02 | Kept the same so the comparison isolates the pull rule and setup. A joke left unsold for the whole 15 minutes costs $0.30 — three times its publishing cost, but less than one sale. |
| WIP limit | 0 (none) | 2 | Round 1 lets work pile up (push). Round 2 caps it at two waiting batches (pull, like a kanban). |
| Arrival window | 900 s | 900 s | Not set by the preset; the default matches a 15-minute round. |
| Batch size | 5, exact | 5, a cap | Unchanged from Classic: Round 2 allows smaller batches. |

The customer preference base (2) is fixed at its default and is not shown in CONFIG.

---

## 6. Instructor playbook

### Before class

- [ ] Reset the game if a previous class used it (this also clears the ideal profile).
- [ ] Form teams in the lobby: one Joke Maker and one Marketing seat per team.
- [ ] Press **Lean class preset**.
- [ ] Pick the ideal joke profile in CONFIG; a round will not start without a complete profile.
- [ ] Select the **Round 1** tab: Market mode shows **Lean**, Setup cost / batch 3, Carrying cost /
      joke-min 0.02, WIP limit 0, Arrival window 900.
- [ ] Select the **Round 2** tab: Market mode **Lean**, setup 1, carrying 0.02, WIP limit 2.
- [ ] Return to the Round 1 tab and plan to end each round at about 15 minutes.

### Cues to call out during a round

- "Look at the Lead column — whose batches are waiting longest at Marketing?"
- "Your Carrying tile is going up every minute. What is sitting still?"
- "Customers are arriving now. If your shelf is empty, those sales are gone."
- Round 2: "If your Joke Maker is blocked, that is the system working. Go help."
- Round 2: "Smaller batches are allowed now. What does that do to your lead time?"
- "Look at the learning curve: are later batches selling better than earlier ones?"

### Eight debrief questions

| # | Question | Look at |
|---|---|---|
| 1 | Which team improved most from Round 1 to Round 2, and what did they change? | Δ profit |
| 2 | Which team had the shortest lead time in Round 2 — what did they do differently? | R2 lead |
| 3 | Did anyone's lead time get worse in Round 2? Why? | R1 lead vs R2 lead |
| 4 | Where did setup and carrying costs fall most, and was it fewer batches or less waiting? | R1 setup+carry vs R2 setup+carry; leaderboard Setup and Carrying |
| 5 | Which team had the most unsold stock in Round 1? Was publishing more worth it? | R1 unsold, R1 profit |
| 6 | Did the WIP limit help or hurt your team? What did the Joke Maker do while blocked? | R2 lead, R2 setup+carry |
| 7 | How long did your jokes wait for their first buyer, and what does that say about fit? | Leaderboard Sale column, per round |
| 8 | Did your learning curve rise? How did you use the customer feedback? | Δ profit, R2 unsold, team learning curves |

---

## 7. Switching back to Classic

Set **Market mode** to **Classic** in CONFIG and press **Apply**, for each round, before that round
starts. The mode locks once a round has started; trying to change it then shows
"The market mode can't change once a round has started."

**Reset Game** also returns both rounds to the Classic defaults (and clears all game data and the
ideal profile).

Nothing else changes. In Classic mode the lean settings are stored but ignored, the lean fields,
tiles, columns and debrief table are hidden, and profit is calculated exactly as before.

---

## 8. Limits and open questions

- **Bots learn only from sold counts.** The Learner bot remembers which joke texts sold, using the
  same sold counts a human Marketing seat sees. It does not read the customer feedback panel.
  Human teams can learn more than the bots did.
- **The pilot did not use the real classifier.** Local pilots used a deterministic hash classifier
  (`APP_LLM_MODE=hash`) so that jokes get different fits without calling Azure. In class, jokes
  are classified by the LLM. The numbers need one live confirmation class before they are relied
  on.
- **Time was compressed in the pilot.** Bots played at 10× speed with a 180-second arrival window.
  Because the server charges carrying per wall-clock minute, carrying was scaled ×10 ($0.20 per
  joke-minute) to match; setup cost was not scaled. Human play will not match the bot numbers
  exactly.
- **WIP limit race.** The server counts waiting batches and then inserts the new one, so two sends
  in the same instant could both pass the check. With one Joke Maker per team this is negligible.
- **Classic stays the default.** Every round is Classic unless the instructor chooses Lean.

---

## 9. Pilot evidence

The baseline pilot (`docs/pilots/2026-10-06-lean-pilot-baseline.md`) ran 2 Classic and 2 Lean
two-round classes, each with 12 bot teams (3 Careful, 3 Balanced, 3 Spray, 3 Learner), on a local
backend with the hash classifier, at the preset values (carrying scaled ×10 as above).

**Verdict: FAIL** against the strict bar set in advance — that in Lean mode, Learner and Careful
both out-earn Spray on mean profit and Spray wins no class. In Lean Round 2, Careful averaged
−$6.06 and Learner $0.19 against Spray's $3.94.

But the results point the right way:

- **Lean rewards improvement; Classic does not.** Lean mean profit went from −$12.82 in Round 1 to
  +$0.67 in Round 2. Classic stayed flat at about $22 ($22.34 → $22.09).
- **Classic is winner-take-all; Lean spreads outcomes.** In Classic a few teams made $60–$172 while
  most finished around −$2. In Lean, team profits ranged from about −$31 to +$20.
- **Learning pays at the top.** The Learner won 3 of the 4 Lean rounds (and both Classic Round 2s),
  but its mean profit in Lean Round 2 ($0.19) trailed Spray ($3.94) and Balanced ($4.59).

Tuning results: see docs/pilots/ — this section is updated after the tuning runs.
