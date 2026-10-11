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
| Customers | 150, arriving over 15 minutes (900 s) | the same, as a fresh market |
| Preference base | 3 | 3 |

**Reset Game** sets all of this: both rounds Lean, Round 1 batches of exactly 5, Round 2 batches of
up to 10, the fees in section 3, 150 customers, preference base 3, arrival window 900 s, no WIP
limit. There is no market mode to choose and no preset button.

Suggested timeline for a 90-minute session (about 65 minutes of game time):

| Step | Time | Instructor (Instructor screen) | Joke Makers | Marketing |
|---|---|---|---|---|
| Setup | 10 min | Presses **Reset Game** if a previous class played, forms teams in the lobby, picks the ideal joke profile. Explains the fees (section 3). | Log in, take their seat, read the brief. | Log in, take their seat, read "The 12 criteria customers judge". |
| Round 1 | 15 min | Presses **Start** on the Round 1 tab. Watches the leaderboard, calls out cues (section 6). Presses **End Round** at about 15 minutes. | Write batches of exactly 5 and press **Send to Marketing**. See "Shipping: $2 per batch of 5". | Split each batch, choose jokes, add a Topic and a title, **Release to market**. Watch the Shipping, Storage and Hosting fees tiles. |
| Debrief 1 | 10 min | Shows the Round 1 leaderboard (Shipping, Storage, Hosting, Lead, Sale) and the lean charts. Asks where the money went. | Discuss. | Discuss; read the Customer feedback panel. |
| Round 2 | 15 min | Selects the Round 2 tab, presses **Start**, ends at about 15 minutes. | Batches of 1 to 10 jokes. The line reads "Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10". | Same desk; in Round 2 Marketing may also discard a whole batch. |
| Debrief 2 | 15+ min | Opens the **Round 1 vs Round 2** table and works through the debrief prompts in section 6. | Discuss. | Discuss. |

Customers arrive over exactly 15 minutes. The rounds are ended by hand: ending early means the
remaining customers never arrive, and running past 15 minutes brings no new customers while
storage and hosting keep charging.

---

## 3. Fees

| Fee | When it is charged | Starting amount |
|---|---|---|
| **Shipping fee** | Each batch the Joke Maker sends, priced by its size | **$1** for 1–4 jokes · **$2** for 5 · **$3** for 6–10 |
| **Storage fee** | Each minute a joke waits on Marketing's desk, from send until released or discarded | **$0.10 per joke per minute** |
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

Storage costs more than hosting on purpose: holding a batch on the desk costs more than releasing
it, so Marketing gains nothing by being the bottleneck.

Nothing is stored: the fees are worked out from timestamps each time a screen refreshes, which is why
the Storage and Hosting tiles tick up during the round, and every clock stops when the round ends.
The inventory clock starts at release, so time spent waiting for AI classification counts as
hosting.

**Worked example** (illustrative numbers, at the starting amounts):

*A pushing team in Round 1.* Sends 8 batches of 5: shipping 8 × $2 = $16. Each batch waits 2 minutes
on the desk: 8 × 5 × 2 × $0.10 = $8.00 storage. Releases all 40 jokes ($4.00 listing); 20 of them sit
unsold for 8 minutes: 20 × 8 × $0.05 = $8.00 hosting. With 60 sales: fees $36.00, 60 % of revenue;
profit $24.00.

*A team that learned, in Round 2.* Sends 13 batches of 3: shipping 13 × $1 = $13. Each is decided
within a minute: 13 × 3 × 1 × $0.10 = $3.90 storage. Releases 26 ($2.60), drops 13 ($0.13); 6 sit
unsold for 5 minutes ($1.50 hosting). With 50 sales: fees $21.13; profit $28.87. It sold less and
earned more.

---

## 4. Who sees what

### Instructor

**CONFIG.** The row edits the round selected by the **Round 1 / Round 2** tabs. It shows the batch
rule as text, **R1 batch: 5 (exactly)** and **R2 batch: up to 10** (Reset Game sets them; they are
not edited here), then:

| Label on screen | What it does |
|---|---|
| **Arrival window (s):** | Customers arrive evenly over this many seconds from Start. Minimum 1. |
| **Shipping fee (1–4 / 5 / 6–10 jokes):** | Three amounts, one per batch size. Each must be 0 or more, and a bigger batch never ships for less. |
| **Storage fee per joke-minute:** | Charged while a batch waits on Marketing's desk. |
| **Hosting fee per joke-minute:** | Charged while a released joke waits for its first sale. |

Changes take effect when you press **Apply**. The fees and the window lock once that round has
started: they are greyed out, and the server refuses a change with "Fees and Lean settings can't
change once a round has started." The other fields (Cust. Budget, Market Price, Cost of Publishing,
the nudges) work as before.

**Leaderboard.** After Profit, five sortable columns:

| Column | Meaning |
|---|---|
| **Shipping** | Shipping fees so far: every batch sent, priced by its size. |
| **Storage** | Storage fees so far: jokes waiting on Marketing's desk. |
| **Hosting** | Hosting fees so far: released jokes waiting for a first sale. |
| **Lead** | Average seconds from a batch being sent to Marketing releasing it. |
| **Sale** | Average seconds from a joke being released to its first sale. |

Profit already has every fee subtracted. The first click on a fee or time column sorts lowest
first, because lower is better. The unsold column is titled **Never Sold**: released jokes with no
sale at all.

**Round 1 vs Round 2 table.** Once Round 2 has stats, a card titled "Round 1 vs Round 2" (subtitle
"Same rules and fees in both rounds, per team") shows per team: R1 profit, R2 profit, Δ profit, R1 and
R2 never sold, **R1 Fees** and **R2 Fees** (shipping + storage + hosting), R1 lead and R2 lead.

**Lean charts.** Four charts replace the Classic chart cards, with a team picker and an **R1 / R2**
control above them.

| Chart | What it shows | How to read it |
|---|---|---|
| **Where the money leaked** | One bar per team, most waste first, split into **Shipping** (blue), **Storage (waiting on Marketing's desk)** (purple), **Hosting (unsold on the shelf)** (amber), **Listing fees on never-sold jokes** (red) and **Discards** (grey), in dollars. | Shorter bars are leaner. Shipping + Storage + Hosting is the leaderboard's three fee columns for that team. |
| **Jokes standing still** | For one team, the jokes waiting for Marketing (purple) and unsold on the shelf (amber) over the round, with the class average dashed. | A growing pile is money: storage and hosting charge for every joke in it. |
| **Smaller batches, faster feedback** | One dot per batch: jokes in the batch across, minutes from sending it to its first sale up. Round 1 circles, Round 2 triangles. | Lower is better. Small Round 2 batches should sit lower. |
| **More cycles, more learning** | The class's sell-through over the round, one line per round; with one team picked, that team's batches. | More dots in the same time means more chances to adjust. |

### Joke Maker

The Joke Maker writes jokes with the AI tool, pastes them in, ticks "I certify these jokes are not
offensive." and presses **Send to Marketing**. The brief reads "Generate 5 jokes" in Round 1 and
"Generate up to 10 jokes … (smaller batches are fine)" in Round 2. Under the Send button, the
shipping line quotes the round's fees: "Shipping: $2 per batch of 5" in Round 1, "Shipping: $1 for
1–4 jokes · $2 for 5 · $3 for 6–10" in Round 2. There is no WIP limit: the Joke Maker can always send.

Under the stat tiles, the **Next step** line gives one instruction, the first that applies:

1. Before the round: "Get your AI tool ready — the round starts soon."
2. Marketing left a note on the latest processed batch, within 2 minutes of Marketing sending it:
   "Marketing says: “…” — use it in your next batch." (the note, up to 80 characters)
3. Round 2, the last batch had 6 or more jokes: "Big batches wait longer for feedback — try 2 or 3
   jokes next." (amber)
4. Marketing's desk is empty: "Marketing's desk is empty — send your next batch of 5." (Round 1) or
   "… — send a small batch now." (Round 2)
5. No batch sent for 90 s: "No batch sent in 90 s — keep the line moving." (amber)
6. Otherwise: "Keep writing — every batch is another chance to sell."

In **Value stream**, a batch Marketing left a note on shows a speech-bubble icon; expanding it shows
the note under "From Marketing". The Joke Maker does not see the customer feedback panel.

### Marketing

The next waiting batch appears on the **Marketing Desk** automatically. Marketing **splits** it
(Round 1 into exactly 5, Round 2 into up to 10), **decides** which jokes to sell with a Topic and a
title (in Round 2 it may discard the whole batch), writes an optional **Note to your Joke Maker**,
and **releases**.

Three fee tiles sit next to the usual ones, each with a one-line tooltip carrying the round's
amounts:

| Tile | Tooltip |
|---|---|
| **Shipping fees** | "Charged per batch you send: $1 for 1–4 jokes, $2 for 5, $3 for 6–10." |
| **Storage fees** | "Every minute a joke waits on Marketing's desk costs 10¢." |
| **Hosting fees** | "Every minute a released joke sits unsold costs 5¢." |

**Publish → first sale** shows how long a sold joke waited for its first buyer.

Under the tiles, the **Next step** line:

1. Before the round: "Watch the desk — your Joke Maker's first batch is coming."
2. A batch has been on the desk 45 s or more: "Batch waiting {n} s — release what's good enough.
   Storage costs 10¢ a joke each minute." (amber; the round's storage fee)
3. The last decision discarded 60 % or more of a batch: "You discarded {d} of {n} last time —
   customers can only buy what's on the shelf." (amber)
4. The customer feedback has a Fix next item: "Tell your Joke Maker: fix {criterion} next."
5. The desk is empty: "Desk is clear — nudge your Joke Maker to send the next batch."
6. Otherwise: "Release what's good enough, then tell your Joke Maker what to change."

The **Customer feedback** panel shows which criteria landed and which missed, never by how much,
and can be popped out above the game.

---

## 5. How customers buy

Each round creates 150 customers, so Round 2 starts with a fresh market. Each has a personal quality
bar of 7 ± 0.3 and a budget of $3. A joke's **fit** is how well it matches the hidden ideal profile:
the sum of its scores on the 12 criteria, from 0 to 12.

- **Arrival.** Customers arrive evenly across the arrival window: with 150 customers and 900 seconds,
  one every 6 seconds. Arrival order is shuffled.
- **Shopping once.** An arriving customer looks at every released, classified joke whose fit clears
  their bar, and buys up to 3 (budget ÷ price), one weighted pick at a time: a joke's weight is 3 to
  the power of its fit, so one fit point higher is three times as likely to be picked. A customer never
  buys two jokes with the same text. Then they leave for good; there are no swaps.
- **Lost demand.** A customer who finds nothing good enough leaves with their money. Customers who
  have not arrived when the round ends are never served.

Customers are served whenever a screen polls and whenever a batch finishes classification, so within
a few seconds of their arrival time.

---

## 6. Instructor playbook

### Before class

- [ ] Press **Reset Game** (this also clears the ideal profile and every team).
- [ ] Form teams in the lobby: one Joke Maker and one Marketing seat per team.
- [ ] Pick the ideal joke profile; a round will not start without a complete profile.
- [ ] Check CONFIG on each tab: R1 batch 5 (exactly), R2 batch up to 10, shipping 1 / 2 / 3, storage
      0.1, hosting 0.05, arrival window 900.

### Cues to call out during a round

- "Look at the Storage column: whose jokes are waiting longest on Marketing's desk?"
- "Your Hosting tile is going up every minute. What is sitting on the shelf unsold?"
- "Customers are arriving now. If your shelf is empty, those sales are gone."
- Round 2: "Smaller batches are allowed now. What does that do to your feedback?"
- "Jokes standing still: whose pile is growing, and what is it waiting for?"

### Debrief prompts

| # | Prompt | Look at |
|---|---|---|
| 1 | Where did your money go? Shipping, storage or hosting? | Leaderboard fee columns; Where the money leaked |
| 2 | Which batch size got feedback fastest in Round 2? | Smaller batches, faster feedback |
| 3 | Did Marketing hold batches? What did that cost? | Storage column; R1 Fees vs R2 Fees |
| 4 | Which team improved most from Round 1 to Round 2, and what did it change? | Δ profit |
| 5 | Did your shipping bill go up or down in Round 2, and was it worth it? | Shipping column per round |
| 6 | Which jokes sat unsold longest, and what does that say about fit? | Hosting column; Sale column |
| 7 | How did you use Marketing's notes and the customer feedback? | More cycles, more learning (pick the team) |

---

## 7. Limits and open questions

- **The amounts are starting values.** They come from the design and are confirmed by the bot pilot
  (`scripts/pilot/lean-pilot.mts`), which plays at 10× with storage and hosting scaled ×10. Human play
  will not match bot numbers exactly.
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
