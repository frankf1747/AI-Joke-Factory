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
| Round 1 — push | 15 min | Presses **Start** with the Round 1 tab selected. Watches the leaderboard, calls out cues (section 6). Presses **End Round** at about 15 minutes. | Write batches of exactly 5 jokes and press **Send to Marketing**. See "Each batch costs $2.00 to set up". No WIP limit. | Split each batch, choose jokes, add a Topic and title, **Release to market**. Watch the Setup cost, Carrying cost and Publish → first sale tiles. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard with the Setup, Carrying, Lead and Sale columns, and the lean charts (section 3). Asks what drove cost and why jokes sat unsold. | Discuss. | Discuss; read the Customer feedback panel and the two lean charts. |
| Round 2 — lean | 15 min | Selects the Round 2 tab, confirms Market mode is Lean with WIP limit 2, presses **Start**, ends at about 15 minutes. | Batches may be smaller than 5 (5 is now a cap). See the WIP counter; when it reads "— wait, or go help", stop and help Marketing. | Same desk; in Round 2 Marketing may also discard a whole batch. |
| Debrief 2 | 15+ min | Opens the **Round 1 vs Round 2** table and works through the debrief questions in section 6. | Discuss. | Discuss. |

The default **Arrival window** is 900 seconds, so customers arrive over exactly 15 minutes. The
rounds are ended by hand: ending early means the remaining customers never arrive, and running
much past 15 minutes brings no new customers while carrying costs keep running.

---

## 3. Human interaction by role

### Instructor

**CONFIG panel.** The CONFIG panel edits the round selected by the **Round 1 / Round 2** tabs at
the top of the screen. The Lean settings (Market mode and the four fields below) can be changed
only while that round has not started: once it starts they are greyed out in CONFIG, and the server
refuses any change to them. When Market mode is set to Lean, four extra fields appear:

| Label on screen | What it does |
|---|---|
| **Market mode:** Classic / Lean | Chooses the market. |
| **Arrival window (s):** | Customers arrive evenly over this many seconds from Start. Minimum 1. |
| **Setup cost / batch:** | Charged every time the Joke Maker sends a batch. |
| **Carrying cost / joke-min:** | Charged per joke per minute for work waiting in Marketing and for published jokes not yet sold (see section 5). |
| **WIP limit:** | How many batches may wait for Marketing before the Joke Maker is blocked. 0 means no limit. |

Changes take effect when you press **Apply**. The other fields (R1 Batch Size, Cust. Budget,
Market Price (p), Cost of Publishing (c), the nudges) work as in Classic.

**Lean class preset.** One button writes both rounds at once: Round 1 gets Lean, setup $2, carrying
$0.05, WIP limit 0; Round 2 gets Lean, setup $0.50, carrying $0.05, WIP limit 2. Both rounds also
get 150 customers and a customer preference base of 3 (section 4); neither appears in CONFIG. It
does not change the arrival window, batch size, price or publishing costs. It only writes rounds that have not started yet,
and is disabled while a round is running. A notice confirms it, for example
"Lean class preset applied — Round 1: push rules · Round 2: lean rules (150 customers)". If Round 1 has already
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
R1 profit, R2 profit, Δ profit (green when it went up, red when it went down), R1 never sold, R2
never sold, R1 setup+carry, R2 setup+carry, R1 lead, R2 lead. Teams are sorted by Round 2 profit.

**Lean charts.** When the round shown is Lean, the five Classic chart cards (Cumulative Sales Over
Time, Batch Sequence vs Quality, Wasted Jokes, Scatter Plots, Unrated Jokes Over Time) are replaced
by four lean charts in the same place. A bar above them, titled "Lean charts", holds a team picker
("All teams" or one team) and an **R1 / R2** control. The control sets the round of the first two
charts; the last two always compare both rounds. The picker applies to charts 2 to 4; chart 1
always shows every team. A round that is not Lean is disabled in the control, and if the picked
round is not Lean the charts fall back to the round that is live. The charts refresh every 10
seconds while a round runs and are fetched once for a round that has ended. If the server cannot
be reached three times in a row, a card says "Chart data unavailable — retrying" and keeps the
last picture.

| Chart | What it shows | How to read it |
|---|---|---|
| **Where the money leaked** | One bar per team, most waste first, split into Setup (blue), Waiting at Marketing (purple), Unsold on shelf (amber), Published, never sold (red) and Discarded (grey), in dollars, with the total at the end. | Shorter bars are leaner. Setup + Waiting + Unsold is the leaderboard's Setup + Carrying for that team. While a round is live, "Published, never sold" counts released jokes that have not sold yet; it is final only when the round ends. |
| **Jokes standing still** | For one team, the jokes waiting for Marketing (purple) and unsold on the shelf (amber) over the minutes of the round, with the class average dashed. With "All teams" it shows the team with the most idle jokes right now, and says so. In a round with a WIP limit the subtitle ends with it, for example "WIP limit: 2 batches". | A growing pile is waste: work that has cost money and has not earned any. |
| **Smaller batches, faster feedback** | One dot per batch: jokes in the batch across, minutes from sending it to its first sale up. Round 1 circles (blue), Round 2 triangles (orange). Batches with no sale yet are hollow, in a "no sale yet" band at the top (a batch with nothing released yet is also hollow, and its tooltip says "Nothing released yet"). | Lower is better: the market answered sooner. Small batches should sit lower. |
| **More cycles, more learning** | With "All teams": the class's sell-through (the share of released jokes that sold) over the minutes of the round, one line per round. With one team: that team's batches, one dot per batch at the minute it was sent, showing the share of its released jokes that sold, for each round. Batches with nothing released are left out. A batch sent too recently to judge (less than two samples ago, or in the last sample of the customers' arrival window or after it) is drawn as a hollow dot, "Too recent to judge — still selling", and the line does not run through it; the class line stops at the same point. | More dots in the same time means more chances to adjust; a rising line through the solid dots means the team is learning what sells. Hollow dots are still selling, so a low hollow dot at the end is not a drop. |

### Joke Maker

The Joke Maker writes jokes with the AI tool, pastes them in, ticks "I certify these jokes are not
offensive." and presses **Send to Marketing**, as in Classic.

In a Lean round, a line under the Send button shows the setup cost:
"Each batch costs $2.00 to set up" (or whatever the round's setup cost is). When the round has a
WIP limit, the same line adds the counter, for example "Marketing has 1 of 2 batches waiting".
When the count reaches the limit the text turns amber, reads
"Marketing has 2 of 2 batches waiting — wait, or go help", and **Send to Marketing** is disabled.
A batch counts as waiting from the moment it is sent until Marketing releases it.

What to do when blocked: stop writing new batches, walk over and help your Marketing partner
decide, or improve the next batch using the customer feedback. If the limit is reached between
screen refreshes and the server refuses the send, an alert says
"Marketing still has batches waiting. In a pull system you wait — or go help them decide." and the
draft is kept so it can be sent later.

The Joke Maker also sees the two lean charts described under Marketing and the Customer feedback panel.

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

Two lean charts sit below the tiles (in a Lean round). They show the team's own data and an
anonymous class average, never another team by name:

- **Jokes standing still** — the team's jokes waiting for Marketing and unsold on the shelf over
  the minutes of the round, with the class average dashed. A growing pile is waste.
- **More cycles, more learning** — one dot per batch at the minute it was sent, showing the share
  of its released jokes that sold; the class average is a dashed line. In Round 2 the team's
  Round 1 batches are drawn faded behind, when Round 1 was also Lean, so the two rounds can be
  compared. Batches with nothing released are left out. Batches sent too recently to judge are
  hollow dots off the line, since they are still selling. A rising line through the solid dots
  means the team is learning what the market wants.

The **Customer feedback** panel is unchanged: it shows which of the criteria landed and which
missed, never by how much.

---

## 4. How customers buy

Each round creates its own customers (150 under the Lean class preset, 100 by default), so Round 2
starts with a fresh market. Each customer has a personal quality bar of 7 ± 0.3 (threshold 7, random jitter up
to 0.3 either way) and a budget of $3. A joke's **fit** is how well it matches the hidden ideal
profile: the sum of its scores on the 12 criteria, from 0 to 12.

**Arrival.** Customers arrive evenly across the arrival window. With 150 customers and 900
seconds, one arrives every 6 seconds, the first at 0:06 and the last at 15:00. Arrival order is
shuffled so a customer's quality bar has nothing to do with when they arrive.

**Shopping once.** When a customer arrives they look at the shelf exactly once:

1. They consider every joke in the round that is published, classified, and has a fit at or above
   their personal bar.
2. They buy up to budget ÷ price jokes — 3 at the default $3 budget and $1 price — picking one at a
   time without replacement. Each pick is a weighted draw: a joke's weight is the **preference
   base** raised to its fit. The preset sets the base to 3, so one fit point higher means three
   times as likely to be chosen (the default base, 2, means twice). Better jokes sell more often,
   but good jokes still sell. A customer never buys two jokes with the same text, so copying a
   joke onto the shelf twice does not double its sales.
3. They leave and never shop again. There are no swaps.

A customer who finds nothing that clears their bar leaves with their money unspent. That sale is
lost for good: demand a team was not ready for does not wait. Customers who have not arrived by the
time the round ends are never served; End Round does serve customers who have already arrived. A joke can be bought by many different customers, but each
customer buys a given joke at most once.

Customers are served whenever the round is polled (every screen refreshes every few seconds) and
whenever a batch finishes classification, so they are served within a few seconds of their
arrival time.

**Worked example.** A customer arrives at minute 6 (customer number 60 under the preset). Their
personal bar is 6.9. On the shelf are three qualifying jokes with fits 11, 9 and 7. At the preset's
base of 3:

| Joke fit | Weight (3^fit) | Odds | Chance of being the first pick |
|---|---|---|---|
| 11 | 177,147 | 81 | 81/91 ≈ 89% |
| 9 | 19,683 | 9 | 9/91 ≈ 10% |
| 7 | 2,187 | 1 | 1/91 ≈ 1% |

If the fit-11 joke is picked first, the second pick is between the other two at 9 : 1 (90% / 10%).
At the default base of 2 the same shelf gives 76% / 19% / 5%: fit still matters, but less.
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

In a Lean round the leaderboard's unsold column is titled **Never Sold**, and the Round 1 vs
Round 2 table has **R1 never sold** and **R2 never sold**: published jokes with no sale at all. The
Classic **Unsold Jokes** figure is published jokes minus sales, floored at zero; because one joke
can sell many times, it measures something different, so the two are never shown side by side.

**Worked example at the preset** ($1 price, $0.10 publishing, $0.01 discard, $2 setup, $0.05
carrying, Round 1):

*Spray team.* Sends 8 batches of 5: setup 8 × $2 = $16. Marketing lets each batch wait 6 minutes:
8 × 5 × 6 × $0.05 = $12.00. Publishes all 40 jokes ($4.00); 20 of them sit unsold for 10 minutes:
20 × 10 × $0.05 = $10.00. With 60 sales: 60 − 4.00 − 16 − 22.00 = **$18.00**.

*Careful team.* Sends 4 batches ($8), each processed in 2 minutes: 4 × 5 × 2 × $0.05 = $2.00.
Publishes 10 of its 20 jokes ($1.00) and discards 10 ($0.10); 2 go unsold for 10 minutes ($1.00).
With 45 sales: 45 − 1.00 − 0.10 − 8 − 3.00 = **$32.90**.

The careful team earns more despite selling less. Whether sales really split that way depends on
the players; see section 9.

**The preset and why:**

| Setting | Round 1 (push) | Round 2 (lean) | Reasoning |
|---|---|---|---|
| Market mode | Lean | Lean | Both rounds need steady arrivals and visible costs so they can be compared. |
| Setup cost / batch | $2 | $0.50 | Round 1 has costly changeovers, so each batch must earn its keep. Round 2 shows the payoff of setup reduction: small batches become affordable. At $3 / $1 (the first design) every persona averaged a loss in Round 1 of the pilot. |
| Carrying cost / joke-min | $0.05 | $0.05 | Kept the same so the comparison isolates the pull rule and setup. A joke left unsold for the whole 15 minutes costs $0.75 — less than one sale, but enough that a shelf of duds visibly eats profit. At $0.02 waste barely registered and spraying still paid. |
| WIP limit | 0 (none) | 2 | Round 1 lets work pile up (push). Round 2 caps it at two waiting batches (pull, like a kanban). |
| Arrival window | 900 s | 900 s | Not set by the preset; the default matches a 15-minute round. |
| Batch size | 5, exact | 5, a cap | Unchanged from Classic: Round 2 allows smaller batches. |
| Customers | 150 | 150 | More demand than the default 100, so a well-aimed small batch can sell through. With 100 in the pilot, every persona averaged a loss in both rounds. |
| Preference base | 3 | 3 | Each fit point triples a joke's chance of being picked, so learning what sells pays off. At the default 2 in the pilot, the learning bot earned less than the bot that sprayed jokes. |

Customers and preference base are not shown in CONFIG; only the preset sets them. Reset Game
returns them to 100 and 2.

---

## 6. Instructor playbook

### Before class

- [ ] Reset the game if a previous class used it (this also clears the ideal profile).
- [ ] Form teams in the lobby: one Joke Maker and one Marketing seat per team.
- [ ] Press **Lean class preset**.
- [ ] Pick the ideal joke profile in CONFIG; a round will not start without a complete profile.
- [ ] Select the **Round 1** tab: Market mode shows **Lean**, Setup cost / batch 2, Carrying cost /
      joke-min 0.05, WIP limit 0, Arrival window 900.
- [ ] Select the **Round 2** tab: Market mode **Lean**, setup 0.5, carrying 0.05, WIP limit 2.
- [ ] Return to the Round 1 tab and plan to end each round at about 15 minutes.

### Cues to call out during a round

- "Look at the Lead column — whose batches are waiting longest at Marketing?"
- "Your Carrying tile is going up every minute. What is sitting still?"
- "Customers are arriving now. If your shelf is empty, those sales are gone."
- Round 2: "If your Joke Maker is blocked, that is the system working. Go help."
- Round 2: "Smaller batches are allowed now. What does that do to your lead time?"
- "Look at More cycles, more learning: following the solid dots, are later batches selling better than earlier ones? (Hollow dots were sent too recently to judge; they are still selling.)"
- "Jokes standing still: whose pile is growing, and what is it waiting for?"

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
| 8 | Did your sell-through rise from batch to batch (solid dots; hollow ones are still selling)? How did you use the customer feedback? | Δ profit, R2 unsold, More cycles, more learning (pick the team) |

### Debrief with the lean charts

Pick the round with **R1 / R2** and, where it helps, one team in the team picker.

1. **Where the money leaked**, Round 1 then Round 2: "Which colour shrank most? Was it setup
   (fewer changeovers) or waiting (less work piled up in front of Marketing)?"
2. **Jokes standing still**, the most idle team: "When did the pile start to grow? What was the
   Joke Maker doing then, and what was Marketing doing?"
3. **Smaller batches, faster feedback**: "Are the orange triangles lower than the blue circles?
   What did a smaller batch buy you?"
4. **More cycles, more learning**: "How many dots did your team get in Round 1, and in Round 2?
   Did the line through the solid dots rise? (Ignore the hollow dots: they were sent too late to
   judge yet.) Which feedback did you act on?"

---

## 7. Switching back to Classic

Set **Market mode** to **Classic** in CONFIG and press **Apply**, for each round, before that round
starts. All Lean settings lock once a round has started; trying to change the market mode then shows
"The market mode can't change once a round has started."

**Reset Game** also returns both rounds to the Classic defaults (and clears all game data and the
ideal profile).

Nothing else changes. In Classic mode the lean settings are stored but ignored, the lean fields,
tiles, columns, debrief table and lean charts are hidden (the instructor sees the five Classic
chart cards), and profit is calculated exactly as before.

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
  Because the server charges carrying per wall-clock minute, carrying was scaled ×10 ($0.50 per
  joke-minute at the preset) to match; setup cost was not scaled. Human play will not match the bot numbers
  exactly.
- **WIP limit race.** The server counts waiting batches and then inserts the new one, so two sends
  in the same instant could both pass the check. With one Joke Maker per team this is negligible.
- **Classic stays the default.** Every round is Classic unless the instructor chooses Lean.

---

## 9. Pilot evidence

### Baseline (the first design)

The baseline pilot (`docs/pilots/2026-10-06-lean-pilot-baseline.md`) ran 2 Classic and 2 Lean
two-round classes, each with 12 bot teams (3 Careful, 3 Balanced, 3 Spray, 3 Learner), on a local
backend with the hash classifier, at the first design's values: setup $3 / $1, carrying $0.02,
preference base 2, 100 customers (carrying scaled ×10 as above).

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

### Tuning

Four tuning runs (Lean classes only, 12 teams × 2 classes each) changed one thing at a time. Lean
Round 2 mean profit per persona:

| Run | Change | Careful | Balanced | Spray | Learner | Strict bar |
|---|---|---|---|---|---|---|
| Baseline | $3/$1 setup, $0.02 carrying, base 2, 100 customers | −$6.06 | $4.59 | $3.94 | $0.19 | FAIL |
| Tuning 1 | preference base 3 | −$6.68 | $4.52 | −$0.54 | $3.78 | FAIL |
| Tuning 2 | + carrying $0.05 | −$14.17 | −$13.20 | −$34.25 | −$10.05 | PASS |
| Tuning 3 | + setup $2/$0.50, no duplicate jokes in one basket | −$12.09 | −$12.75 | −$24.38 | −$4.08 | PASS |
| Tuning 4 | + 150 customers (the preset) | −$4.39 | $2.33 | −$7.22 | $12.05 | PASS |

Tuning 2 made waste cost enough to matter, but every persona lost money. Tuning 3 and 4 brought
profit back by making changeovers cheaper and adding demand, without letting spraying pay again.

### Final confirmation

The final run (`docs/pilots/2026-10-06-lean-pilot-final.md`) played 2 Classic and 2 Lean classes
at the preset (12 teams each, every round 140–196 s, so the run was clean). A first attempt was
discarded because the machine slept mid-run; it is kept as
`2026-10-06-lean-pilot-final-INVALID-machine-slept.md`.

| Persona | Classic R1 | Classic R2 | Lean R1 | Lean R2 |
|---|---|---|---|---|
| Careful | $18.99 | $15.33 | −$20.14 | −$7.76 |
| Balanced | $31.72 | $27.64 | −$22.19 | $5.64 |
| Spray | **$90.50** | **$56.17** | **$8.44** | −$5.09 |
| Learner | −$1.84 | $39.23 | $0.24 | **$13.23** |

- **Classic rewards spraying; Lean Round 2 does not.** Spray tops both Classic rounds and Lean
  Round 1 (push rules), then drops below the Learner and Balanced teams once lean rules apply.
- **Lean rewards improvement; Classic does not.** Lean mean profit rose from −$8.41 to +$1.50.
  Classic stayed flat ($34.84 → $34.59).
- **Learning pays.** The Learner won 3 of the 4 Lean rounds and averaged the highest Lean Round 2
  profit ($13.23). It sold as much as Spray (46.7 vs 46.8 sales) from 30% fewer jokes, with less
  than half as many never sold (12.2 vs 27.2).
- **Lean spreads outcomes.** The best single team made $283 in Classic and $46 in Lean.

**Strict bar: FAIL by a narrow margin.** Careful averaged −$7.76 in Lean Round 2 against Spray's
−$5.09. In tuning 4, at the same settings, the order was reversed (−$4.39 vs −$7.22); pooled over
both runs the two are tied (−$6.08 vs −$6.16). The Careful bot publishes fewer jokes but picks
them at random, so it carries the cost of being careful without the judgement that makes care
pay. A human careful team chooses which jokes to keep. The setting was not tuned further to make
a random-choice bot win, because that would fit the economics to the bot rather than to students.
