# Lean market mode — a guide for instructors

This guide explains how to run the Joke Factory in **Lean market mode**: the one lesson it teaches,
how a 90-minute class runs, what each person sees on which screen, what the fees are, how the
simulated customers buy, and how to debrief.

Everything here describes the code on the `feat/lean-market` branches of both repositories, which
play Lean only. The design is `docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md`.

---

## 1. Goal

One lesson, one rule set:

- In **Round 1**, the Joke Maker keeps pushing jokes.
- In **Round 2**, the team discovers that smaller batches bring faster feedback and faster
  improvement.

Both rounds keep the same rules and the same fees, so any change in results comes from how the team
played, not from the game. The only difference is the batch size, which is the lever the lesson is
about. The fees are named the way a real operation names them, and they are big enough to shape
decisions: a team that pushes should see roughly half of its revenue go to fees.

---

## 2. The rules

| Rule | Round 1 | Round 2 |
|---|---|---|
| Jokes per batch | **exactly 5** | **1 to 10**, the team's choice |
| Work-in-progress limit | none | none |
| Fees | the same | the same |
| Customers | **18 per team** (360 for 20 teams), arriving over 15 minutes (900 s) | the same, as a fresh market |
| Buy threshold | 8 | 8 |
| Preference base | 5 | 5 |

**Reset game** sets all of this: both rounds Lean, Round 1 batches of exactly 5, Round 2 batches of
up to 10, the fees in section 3, 18 customers per team, buy threshold 8, preference base 5, arrival window
900 s, no WIP limit. There is no market mode to choose and no preset button.

Suggested timeline for a 90-minute session (about 65 minutes of game time):

| Step | Time | Instructor (Instructor screen) | Joke Makers | Marketing |
|---|---|---|---|---|
| Setup | 10 min | Presses **Reset game** at the bottom of the Setup tab if a previous class played, seats the pairs on the Teams tab, picks the hidden ideal joke on the Setup tab. Explains the fees (section 3). | Log in, take their seat, read the brief. | Log in, take their seat, read "What customers judge" (the 12 criteria). |
| Round 1 | 15 min | Presses **Start Round 1** in the control bar. Watches the Live tab, calls out cues (section 6). Presses **End Round 1** at about 15 minutes. | Write batches of exactly 5 and press **Send to Marketing**. See "Shipping: $2 per batch of 5". | Split each batch, choose jokes, add a Topic and a title, **Release to market**. Open "Fees and wait times" to watch the shipping, storage and hosting fees. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard (Fees, Sent to released, To first sale) and the lean charts on the Live tab. Asks where the money went. | Discuss. | Discuss; read the Customer feedback card. |
| Round 2 | 15 min | Turns on **Show students their teammates**, presses **Start Round 2** in the control bar, ends at about 15 minutes. | Batches of 1 to 10 jokes. The line reads "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10". | Same desk; in Round 2 Marketing may also discard a whole batch. |
| Debrief 2 | 15+ min | Presses **Open debrief** for the **Round 1 vs Round 2** table and works through the debrief prompts in section 6. | Discuss. | Discuss. |

Customers arrive over exactly 15 minutes. The rounds are ended by hand: ending early means the
remaining customers never arrive, and running past 15 minutes brings no new customers while
storage and hosting keep charging.

---

## 3. Fees

| Fee | When it is charged | Starting amount |
|---|---|---|
| **Shipping fee** | Each batch the Joke Maker sends, priced by its size | **$1** for 1–4 jokes · **$2** for 5 · **$3** for 6–10 |
| **Storage fee** | Each minute a joke waits on Marketing's desk, from send until released or discarded | **$0.05 per joke per minute** |
| **Hosting fee** | Each minute a released joke sits unsold, from release until its first sale (or until the round ends) | **$0.05 per joke per minute** |
| **Listing fee** | Each joke Marketing releases | $0.10 |
| Discard fee | Each joke Marketing drops | $0.01 |

```
profit = sales × $1 − shipping − storage − hosting − listing − discard
```

**How a batch's size is counted.** A pasted batch has no joke count until Marketing splits it.
Before the split it counts as **5 jokes** for both the storage fee and the shipping fee (the standard
shipment, $2). After the split, its real count sets both. A batch nobody splits before the round ends
is charged as 5 jokes all the way to the end.

Storage and hosting are both 5¢ a joke each minute. A joke held on the desk is charged and cannot
sell; a released joke can sell and stops being charged once it does. Marketing gains nothing by
being the bottleneck.

Nothing is stored: the fees are worked out from timestamps each time a screen refreshes, which is why
the storage and hosting fees in "Fees and wait times" tick up during the round, and every clock stops when the round ends.
The inventory clock starts at release, so time spent waiting for AI classification counts as
hosting.

**Worked example** (illustrative numbers, at the starting amounts):

*A pushing team in Round 1.* Sends 8 batches of 5: shipping 8 × $2 = $16. Each batch waits 2 minutes
on the desk: 8 × 5 × 2 × $0.05 = $4.00 storage. Releases all 40 jokes ($4.00 listing); 20 of them sit
unsold for 8 minutes: 20 × 8 × $0.05 = $8.00 hosting. With 60 sales: fees $32.00, 53 % of revenue;
profit $28.00.

*A team that learned, in Round 2.* Sends 13 batches of 3: shipping 13 × $1 = $13. Each is decided
within a minute: 13 × 3 × 1 × $0.05 = $1.95 storage. Releases 26 ($2.60), drops 13 ($0.13); 6 sit
unsold for 5 minutes ($1.50 hosting). With 50 sales: fees $19.18; profit $30.82. It sold less and
earned more.

---

## 4. Who sees what

### Instructor

**Setup tab.** It edits the round in play (the **Round 1 / Round 2** switch in the control bar only
changes which round is viewed). Under **Batches** it shows the batch rule as text, **Round 1: exactly
5 jokes** and **Round 2: up to 10 jokes** (Reset game sets them; they are not edited here). The
lean fields are:

| Label on screen | What it does |
|---|---|
| **Customers arrive over** | Customers arrive evenly over this many minutes from Start. |
| **Shipping per batch, by size** | Three amounts, for 1–4, 5 and 6–10 jokes. Each must be 0 or more, and a bigger batch never ships for less. |
| **Storage, waiting on Marketing** | Per joke-minute, charged while a batch waits on Marketing's desk. |
| **Hosting, unsold on the market** | Per joke-minute, charged while a released joke waits for its first sale. |
| **Customers per team** | How many AI customers each team brings (default 18, 0 to 1000; 0 keeps a fixed count). A hint beside it gives the class total, for example about 360 customers for 20 teams. |

Changes take effect when you press **Apply**. The fees, the window and customers per team are one set for the whole
class: Apply writes them to every round that has not started yet (both rounds before Round 1), and
says so next to the button, for example "Fees applied to Rounds 1 and 2". Shipping fees that fall
with batch size are flagged under the shipping inputs ("Shipping fees must rise with batch size …")
and are not sent; any other value the server refuses is shown with the server's own message. The
fees and the window lock once a round has started: they are greyed out on the Setup tab, and the
server refuses a change with "Fees and Lean settings can't change once a round has started."

**Customers per team** is turned into a customer count when the round starts: the count becomes
customers per team × the number of teams that have a Joke Maker or Marketing seat (at least 1), and
the screens and stats then show that real number. Before the start the round still shows its old
count; the hint is worked out from the teams in the lobby. About 18 per team keeps roughly 60 % of
teams in profit at 20 teams; fewer customers per team make the market harder for everyone. The
field shows the round's stored value. The
other fields (Customer budget, Price per sale, Publishing) work as before. Changed fields are
outlined and **Apply** shows how many changes it will send. The nudge settings are gone.

**Leaderboard.** On the Live tab, "Leaderboard, Round n" has the columns **#**, **Team**,
**Profit**, **Sales**, **Released**, **Discarded**, then:

| Column | Meaning |
|---|---|
| **Never sold** | Released jokes with no sale at all. |
| **Fees** | Shipping + storage + hosting so far, with a small bar split into the three. Hover it for each amount. |
| **Sent to released** | Average time from a batch being sent to Marketing releasing it. |
| **To first sale** | Average time from a joke being released to its first sale. |

Profit already has every fee subtracted. Click a column to sort (profit by default). **Present**
opens a full-screen, large-type copy for the room.

**Round 1 vs Round 2 table.** The Debrief tab, once Round 2 has started, shows a card titled
"Round 1 vs Round 2" (subtitle "Same rules and fees in both rounds, per team. Sorted by Round 2
profit.") with, per team: profit R1 / R2 / change, never sold R1 / R2, fees R1 / R2 (shipping +
storage + hosting), and sent to released R1 / R2.

**Lean charts.** Four charts on the Live tab, in a 2 × 2 grid. There is no team picker; the
charts that compare rounds show both.

| Chart | What it shows | How to read it |
|---|---|---|
| **Where the money leaked** | One bar per team, most waste first, split into **Shipping** (red), **Storage, waiting on Marketing** (blue), **Hosting, unsold on the market** (amber), **Listing fees, never sold** (purple) and **Discards** (grey), in dollars. | Shorter bars are leaner. Shipping + Storage + Hosting is the leaderboard's Fees column for that team. |
| **Jokes standing still** | One row per team, biggest pile first: a bar of the jokes waiting on Marketing (blue) and unsold on the market (amber) right now, a dashed class-average tick, and a small trend over the round. Click a team for its full chart. | A growing pile is money: storage and hosting charge for every joke in it. |
| **Smaller batches, faster feedback** | One dot per batch: jokes in the batch across, minutes from sending it to its first sale up. Round 1 grey dots, Round 2 navy dots; hollow means no sale yet. | Lower is better. Small Round 2 batches should sit lower. |
| **More cycles, more learning** | The class's sell-through over the round, one line per round, labelled at its end. | More dots in the same time means more chances to adjust. |

### Joke Maker

The Joke Maker writes jokes with the AI tool, pastes them in, ticks "I certify these jokes are not
offensive." and presses **Send to Marketing**. The brief reads "Generate 5 jokes" in Round 1 and
"Generate up to 10 jokes … (smaller batches are fine)" in Round 2. Under the Send button, the
shipping line quotes the round's fees: "Shipping: $2 per batch of 5" in Round 1, "Shipping: $1 for
1–4 jokes · $2 for 5 · $3 for 6–10" in Round 2. There is no WIP limit: the Joke Maker can always send.

The **Next step** line is the first row of the Production line card. It gives one instruction, the first that applies:

1. Before the round (and between rounds): "Get your AI tool ready. The round starts soon." Once
   Round 2 has ended: "Round over. Join the debrief."
2. Round 2, the last batch had 6 or more jokes: "Big batches wait longer for feedback. Try 2 or 3
   jokes next." (amber)
3. Marketing's desk is empty: "Marketing's desk is empty. Send your next batch of 5." (Round 1) or
   "Marketing's desk is empty. Send a small batch now." (Round 2)
4. No batch sent for 90 s: "No batch sent in 90 s. Keep the line moving." (amber)
5. Otherwise: "Keep writing. Every batch is another chance to sell."

The line never quotes Marketing's note. A note shows only inside the opened batch in the Value
stream, under "From Marketing".

In **Value stream**, a batch Marketing left a note on shows a speech-bubble icon; expanding it shows
the note under "From Marketing". The Joke Maker does not see the customer feedback panel.

### Marketing

The next waiting batch appears on the **Marketing desk** automatically. Marketing **splits** it
(Round 1 into exactly 5, Round 2 into up to 10), **decides** which jokes to sell with a Topic and a
title (in Round 2 it may discard the whole batch), writes an optional **Note to your Joke Maker**,
and **releases**.

The Scoreboard shows the team's rank by profit, its profit, how many released jokes have found a
buyer ("Found a buyer {n} of {m} on market") and the number of sales. A collapsed **Fees and wait
times** disclosure under it holds two charts:

| Chart | What it shows |
|---|---|
| **Where your sales went** | Shipping, storage, hosting, listing and discard fees, and what is left as profit. |
| **How long a joke waits, on average** | The average time a joke spends with Marketing, then on the market waiting for a buyer. |

The round's amounts are $1 for 1–4 jokes, $2 for 5 and $3 for 6–10 in shipping, 5¢ a joke each
minute while a joke waits on Marketing's desk (storage), and 5¢ a joke each minute while a released
joke sits unsold (hosting).

The **Next step** line is the first row of the Marketing desk card:

1. Before the round (and between rounds): "Watch the desk. Your Joke Maker's first batch is
   coming." Once Round 2 has ended: "Round over. Join the debrief."
2. A batch has been on the desk 45 s or more: "Batch waiting {duration}. Release what's good
   enough. Storage costs 5¢ a joke each minute." (amber; the duration reads like "52 s" or
   "1 min 12 s", and the storage sentence uses the round's storage fee and is left out if it is 0)
3. The last decision discarded 60 % or more of a batch: "You discarded {d} of {n} last time.
   Customers can only buy what's on the shelf." (amber)
4. The customer feedback has a Fix next item: "Tell your Joke Maker: fix {criterion} next."
5. The desk is empty: "Desk is clear. Nudge your Joke Maker to send the next batch."
6. Otherwise: "Release what's good enough, then tell your Joke Maker what to change."

The **Customer feedback** card lists the team's latest released jokes with the criteria that landed
and the ones that missed, never by how much. **Pop out** opens a window that stays on top of the
game: a criteria × jokes matrix grouped "Fix next" and "Keep doing" (✓ landed, ✕ missed, · not
mentioned), with a key that shows each joke's text. Browsers without Document Picture-in-Picture
show the same content in a panel inside the page. Below it, **What customers judge** lists the 12
criteria.

---

## 5. How customers buy

Each round creates its customers when it starts (customers per team × teams, 18 per team by
default), so Round 2 starts with a fresh market. Each has a personal quality bar of 8 ± 0.3 and a
budget of $3. A joke's **fit** is how well it matches the hidden ideal profile:
the sum of its scores on the 12 criteria, from 0 to 12.

- **Arrival.** Customers arrive evenly across the arrival window: with 360 customers (20 teams) and 900
  seconds, one every 2.5 seconds. Arrival order is shuffled.
- **Shopping once.** An arriving customer looks at every released, classified joke whose fit clears
  their bar, and buys up to 3 (budget ÷ price), one weighted pick at a time: a joke's weight is 5 to
  the power of its fit, so one fit point higher is five times as likely to be picked. A customer never
  buys two jokes with the same text. Then they leave for good; there are no swaps.
- **Lost demand.** A customer who finds nothing good enough leaves with their money. Customers who
  have not arrived when the round ends are never served.

Customers are served whenever a screen polls and whenever a batch finishes classification, so within
a few seconds of their arrival time.

---

## 6. Instructor playbook

### Before class

- [ ] Press **Reset game** at the bottom of the Setup tab (this also clears the ideal profile and every team).
- [ ] Seat the pairs on the Teams tab: one Joke Maker and one Marketing pair per team.
- [ ] Pick the hidden ideal joke on the Setup tab; a round will not start without a complete profile.
- [ ] Check the Setup tab: Round 1 exactly 5 jokes, Round 2 up to 10, shipping 1 / 2 / 3, storage
      0.05, hosting 0.05, customers per team 18, customers arrive over 15 min.

### Cues to call out during a round

- "Look at Jokes standing still: whose jokes are waiting longest on Marketing's desk?"
- "Your hosting fee is going up every minute. What is sitting on the shelf unsold?"
- "Customers are arriving now. If your shelf is empty, those sales are gone."
- Round 2: "Smaller batches are allowed now. What does that do to your feedback?"
- "Jokes standing still: whose pile is growing, and what is it waiting for?"

### Debrief prompts

| # | Prompt | Look at |
|---|---|---|
| 1 | Where did your money go? Shipping, storage or hosting? | Leaderboard Fees column; Where the money leaked |
| 2 | Which batch size got feedback fastest in Round 2? | Smaller batches, faster feedback |
| 3 | Did Marketing hold batches? What did that cost? | Sent to released; fees R1 vs R2 on the Debrief tab |
| 4 | Which team improved most from Round 1 to Round 2, and what did it change? | Profit change on the Debrief tab |
| 5 | Did your shipping bill go up or down in Round 2, and was it worth it? | Where the money leaked, per round |
| 6 | Which jokes sat unsold longest, and what does that say about fit? | Where the money leaked (hosting); To first sale |
| 7 | How did you use Marketing's notes and the customer feedback? | More cycles, more learning |

**Debrief note: standing still loses.** Customers are shared by every team. A team that changes
nothing in Round 2 keeps its Round 1 behaviour while the teams around it improve, so it loses sales
to them and can end Round 2 worse off than Round 1 even though it did nothing differently. Ask the
teams that stayed the same what they expected, and what the improving teams took from them.

---

## 7. Limits and open questions

- **The amounts are the tuned defaults.** They come from the bot fee sweep of 2026-10-11
  (`docs/pilots/2026-10-11-fee-sweep.md`): configuration E4 passed all three checks in 4 of 4 runs
  at 20 teams, with 62 % / 59 % of teams in profit. Human play will not match bot numbers exactly,
  and the buy threshold should be checked with real LLM-scored jokes in a small trial before class.
  The pilot (`scripts/pilot/lean-pilot.mts`) plays one class at 10× with storage and hosting scaled
  ×10; its default class is 14 bot teams (`PILOT_PER_PERSONA` sets a bigger one): 3 each of
  Careful, Balanced, Spray and Learner, plus 2 **Balanced (holds)** teams, identical to Balanced
  except that their Marketing seat holds each batch an extra 60 class-seconds before deciding. Its
  three checks: Spray spends 40–60 % of its revenue on fees in Round 1; in Round 2 the Learner's
  batches of 3 reach a first sale sooner than Spray's batches of 10 (with a caveat, since the Learner
  also paces differently, and a Round 2 table of every batch by size: count, share sold, time to
  first sale); and holding does not pay: in each round the Balanced (holds) teams' mean profit is
  below Balanced's. A rank correlation of storage per batch with profit is printed as an indicative
  line only.
- **Bots learn only from sold counts.** The Learner bot remembers which joke texts sold. It does not
  read the customer feedback panel; human teams can learn more.
- **The pilot does not use the real classifier.** It runs with a deterministic hash classifier
  (`APP_LLM_MODE=hash`). In class, jokes are classified by the LLM.
- **Lean only.** The instructor screen has no Classic mode. The backend still contains the Classic
  code, so returning to Classic is a matter of running the `main` branch.

---

## 8. Earlier pilot evidence

The pilots of 2026-10-06 tested a different rule set (setup and carrying costs, and a WIP limit in
Round 2 only); their numbers do not apply here. They remain in git history and in `docs/pilots/`.
