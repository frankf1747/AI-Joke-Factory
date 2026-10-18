# Quiet factory UI: design and data wiring

Date: 2026-10-18
Status: Design locked by Frank (Joke Maker and Marketing 2026-10-12, Instructor 2026-10-18). Spec pending review.
Branches: frontend `AI-Joke-Factory` on a branch off `feat/lean-market`; backend `jokefactory_be` (one small addition, section 8).
Area: `index.html`, `index.css`, `components/ui.tsx`, `components/StatTiles.tsx`, `components.tsx` (RoleLayout), `views/JokeMaker.tsx`, `views/QualityControl.tsx`, `views/Instructor.tsx`, `components/CustomerFeedbackCard.tsx`, `components/PopOutPanel.tsx`, `components/leanCharts/*`, `components/LeanDebrief.tsx`, `components/IdealProfilePicker.tsx`, `services/nextStep.ts`, `services/tour/*`, `components/Tutorial.tsx`, `context.tsx`, `types.ts`.

Supersedes the visual parts of `2026-10-11-key-tiles-design.md` (stat tiles) and the Classic-chart clause of `2026-10-06-lean-charts-design.md` (decision 5 below).

## 1. Goal

Make the three screens look specific to this simulation and calm to use, without changing how the game is played. Students should read their state at a glance; the instructor should be able to project the Live tab and call out teams by name.

Success:
- every value on screen comes from a field the backend already sends (or the one new endpoint in section 8), wired as the tables in section 7 say;
- no feature is lost, except the ones Frank chose to remove (section 2);
- the guided tour and the "How this works" tutorial describe the new screens;
- `npm test` and `npm run typecheck` pass, and the tour's "every target exists" test stays green.

Out of scope: game rules, the AI customer engine, scoring, prices and fees, the Customer role screen, the login screen (a later pass).

## 2. Decisions (Frank)

Visual direction ("quiet factory"), 2026-10-12: warm paper neutrals, navy for structure, gold only for the primary action, no purple accents; IBM Plex Sans (UI) and IBM Plex Mono (ids and numbers), Lora for joke text; an andon-style round status in the header. No rubber stamps, no edge accent lines on containers, no icons or avatars on message bubbles; existing labels keep their names ("Next step", not "Hint"); existing colour highlights that separate states stay (recoloured, not removed).

Instructor, 2026-10-18:
1. No pause or resume. Rounds stay CONFIGURED → ACTIVE → ENDED.
2. Rounds end manually. The arrival window is the only timing setting; no countdown, no automatic end.
3. Remove the Marketing nudge settings from the instructor screen (they were never sent; students keep 60 s and 45 s).
4. Add a backend read of the stored ideal joke (section 8).
5. Remove the Classic charts (Cumulative Sales, Batch Sequence vs Quality, Wasted Jokes, Scatter Plots, Unrated Jokes). Keep the four lean charts.
6. The Round 1 / Round 2 control only chooses which round is viewed. Start and End act on the next or running round.
7. Team names stay browser-only, and the screen says so.

Marketing, 2026-10-12 and later: topic is a dropdown; the Keep doing / Fix next tally lives only in the pop-out window; the pop-out opens at about 840 × 820.

Marketing's note to the Joke Maker is deliberately found only by opening the batch. Frank decided (2026-10-18) to remove the "Marketing says: …" Next step message; done before this work, in `services/nextStep.ts` (with its tests).

## 3. Design system

Tokens (add to `index.css` `:root`; the Tailwind CDN stays, components use the tokens through arbitrary values or small CSS classes):

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f5f3ee` | page background |
| `--paper-2` | `#ece8df` | inset, disabled button |
| `--sheet` | `#fffefb` | cards |
| `--rule` / `--rule-2` | `#e2ddd2` / `#d3ccbe` | hairlines, dashed outlines |
| `--ink` … `--ink-4` | `#14202b` `#44505c` `#7a828a` `#a7aaa8` | text, strongest to faintest |
| `--navy` | `#003b5c` | structure, Marketing, selection |
| `--navy-tint` | `#e8eef2` | selected and hover fills |
| `--gold` / `--gold-2` | `#ffd100` / `#f2c500` | primary button only |
| `--selling` | `#2e7d52` on `#eaf2ec` | joke has sales, profit up |
| `--waiting` | `#8a6400`, dot `#d9a92b`, on `#f9f1dc` | released, no buyer yet |
| `--warn` | `#9a3b1c` on `#f6e3da` | warn tone, missed, loss |
| chart: shipping / storage / hosting | `#c4553a` / `#3f7cc0` / `#d9a92b` | validated with the dataviz validator against `--sheet` (adjacent CVD ΔE ≥ 19.8) |
| chart: never-sold listing fees / discards | `#7a4f9a` / `#bdb7ab` | Instructor waste chart only; violet is a chart category, never a UI accent |
| chart: Round 1 / Round 2 | `#a7aaa8` / `--navy` | before / after |

Amber is under 3:1 on `--sheet`, so every chart that uses it shows a text value next to each segment.

Type: Plex Sans 400/500/600/700, Plex Mono 400/500/600, Lora 400/500 (Google Fonts link in `index.html`). Large display numerals (the rank ordinal) use Instrument Sans 600, because Plex Sans' "1" reads as cut off at 54 px. Numbers use tabular figures.

Radius: 4 px chips and inputs, 8 px buttons and joke cards, 12 px cards and bubbles. No drop shadows except the two raised surfaces named below.

Copy rules for every string this work touches: sentence case, no em dashes, no exclamation marks, durations as "45 s", "1 min 12 s", "56 min".

## 4. Shared pieces

### 4.1 Header (RoleLayout)
Left: "The Joke Factory", then "Team {n}, {Role}" (students) or "Instructor". Centre: andon lamp, state word, "Round {n}", clock. Right: UCLA lockup, the pair's names, `?` (replays the tour), sign out. A 3 px strip under the header in the state colour.

| State (round status) | Word | Colour | Clock |
|---|---|---|---|
| CONFIGURED | Not started | `--ink-3` | `00:00 not started` |
| ACTIVE | Running | `--selling` | elapsed since `started_at`, counting up |
| ENDED | Round over | `--navy` | `ended_at − started_at`, labelled "total" |

Which round the header shows: once Round 1 ends, `context.tsx` (~999–1002) moves students to Round 2, which is CONFIGURED. Between rounds the header therefore reads "Round 1 · Round over" by using the Round 1 row of `/rounds/active` when Round 2 is CONFIGURED and Round 1 is ENDED. It switches to Round 2 when Round 2 starts.

Team label: "Team {n}" uses `teamNames[user.team]`, then `teamSummary.team.name`, then `Team {user.team}`. `user.team` is the database team id. The summary is only fetched once a round has started.

The gold "New here? Watch the 1-minute tour" pill is replaced by the `?` button; the first-time prompt behaviour in `services/tour/seen.ts` is unchanged.

### 4.2 Next step row
One line at the top of the student's main card (Production line / Marketing desk): small "Next step" label, then the message. No background normally. When the message text changes, the new text slides in and the row flashes `#fff1b8` fading out over about 2 s. Tone `warn` turns the text `--warn`. Text and tone come from `services/nextStep.ts`, unchanged except for the copy rules. It never quotes Marketing's note.

### 4.3 Scoreboard (both student screens)
"Team rank, by profit": ordinal (Instrument Sans 54 px, superscript suffix), a movement tag, and profit on the right. Movement compares `teamSummary.rank` with the value from the previous successful poll, kept in component state: "↑ up n" (green), "↓ down n" (warn), "no change"; rank 1 shows "In the lead" (gold tint) instead. After a reload the first comparison shows "no change".
Second row: "Found a buyer {n} of {published_jokes} on market", and "Sales {total_sales}".
- `n` = PUBLISHED jokes in the team batch list with `first_sold_at` set (ever sold). Do NOT use the summary's `sold_jokes_count`: it is `LEAST(published_jokes, total_sales)` (`lean_stats_repo.go:238`, `stats_repo.go:104`), not a count of jokes.
- `total_sales` is net: when a customer swaps a joke out, the backend removes that purchase (section 7.2 note).
Before the first round starts, the summary is not fetched (`context.tsx` polls it only in ACTIVE or ENDED), so the scoreboard shows "—" for every value.

### 4.4 "Fees and wait times" disclosure (both student screens; replaces "More numbers")
Collapsed by default. Two charts:
1. **Where your sales went.** One bar, the round's revenue `market_price × total_sales`, split into Shipping, Storage, Hosting, Listing and discard fees (`cost_of_publishing × published_jokes + cost_of_discard × discarded_jokes`, shown together, grey `#bdb7ab`), and Profit. This is exactly the backend's lean profit (section 7.4), so the segments always sum to revenue. Legend rows give each amount. When profit is negative the bar is scaled to total costs, the profit segment is omitted and the legend reads "Loss −$x".
2. **How long a joke waits, on average.** A two-segment timeline: With Marketing (`lean.avg_submit_to_publish_s`, storage blue) then On market, waiting for a buyer (`lean.avg_publish_to_first_sale_s`, hosting amber), ticks Sent / Released / First sale, total on the right. Hidden when both are 0. The two averages are over different sets (processed batches; jokes that sold), so the total is labelled "about".

Shown only in Lean rounds (`teamSummary.lean` present). In a Classic round the disclosure shows the Classic numbers it shows today.

## 5. Joke Maker screen (`views/JokeMaker.tsx`)

Layout: left column Production line, then Value stream; right column Scoreboard, then Jokes by stage.

- **Production line card:** Next step row; brief "Round {n}: make exactly {round1BatchSize} jokes per batch…" (Round 2: "up to {round2BatchLimit}"); paste box (faintly ruled, Plex Sans); hint "Stuck? Try work, family, food, tech or animals."; character count; "I certify these jokes are not offensive." checkbox; gold "Send to Marketing →", disabled (grey `--paper-2`) until there is text and the box is ticked. In Lean rounds, under the button, the shipping line from `shippingLine()` (`services/leanMode.ts:173`), e.g. "Shipping: $2.00 per batch of 5", in `--ink-3` (tour target `jm-shipping`).
- **Value stream** ("{batches_created} batches"): one row per batch, newest first (the API returns newest first; `context.tsx` ~1190 sorts oldest first, so the view reverses it): `B-{batch_id}`, "Sent {time} ago", the note indicator when `marketing_note` is set, one square per joke coloured by state, and a summary ("4 on market, 12 buyers" / "With Marketing").
  - Batch with Marketing (`status = SUBMITTED`): "With Marketing". With no jokes yet it also says "not split yet". Once Marketing has split it, its jokes are PENDING and show as outline squares, but are still "With Marketing".
  - Open batch: a paper-coloured tray. If `marketing_note` is set, a white raised card (the one shadow) with a small tail pointing at the row, label "From Marketing", time "with the release, {processed_at} ago", the note text. Then one card per joke:

`sold_count` is the number of customers who hold the joke right now (`purchases`; `batch_repo.go` ~93–104). A customer who swaps a joke out removes that purchase, so `sold_count` can fall back to 0. `first_sold_at` comes from the append-only `purchase_events` log and stays set once a joke has ever sold.

| Joke state | Rule | Card | Top-right detail |
|---|---|---|---|
| With Marketing | `publish_status = PENDING` (batch split, not released) | not shown as a card; outline square in the row | |
| Selling | `PUBLISHED` and `sold_count > 0` | `#eaf2ec`, no border | "{sold_count} buyers" (green), or "1 buyer" |
| Lost its buyers | `PUBLISHED`, `sold_count = 0`, `first_sold_at` set | `#eaf2ec` at half strength | "Sold before, swapped out" (muted green) |
| No buyer yet | `PUBLISHED`, `sold_count = 0`, `first_sold_at` null | `#f9f1dc` | "No buyer yet, on market {now − published_at}" (amber text) |
| Not released | `DISCARDED` | transparent, 1 px dashed `--rule-2` | "Not released by Marketing" (muted) |

Card head: `#{position}` (mono) and `joke_title` when set; body: `joke_text` in Lora. "Sold" is never a final state; a published joke stays on the market. The per-joke "buyers" add up to the team's net `total_sales`.
- **Jokes by stage:**
  - With Marketing: {unprocessed_batches} batches (summary). This counts every SUBMITTED batch, including the one Marketing holds or has split.
  - On the market: Selling / Lost its buyers / No buyer yet (from the team batch list).
  - Not released (from the team batch list).
- **Before the first round starts**, batches and summary are not polled (`context.tsx` ~1128), so the Value stream says "Your batches show up here once the round starts." Note the existing risk: a 404 from the summary or batches call turns that polling off for the rest of the session (`context.tsx` ~1192–1196). Keep that behaviour, but it must not leave the scoreboard silently stale. Show "—".

## 6. Marketing screen (`views/QualityControl.tsx`)

Layout: left column Marketing desk; right column Scoreboard (with Fees and wait times), Customer feedback, What customers judge.

- **Desk header:** "Marketing desk" + "{n} more waiting", where n = `queue_size` minus 1 when a batch is on the desk (`queue_size` counts every SUBMITTED batch of the team, including the one on the desk). Shows "nothing else waiting" at 0. A null `qcQueue` does not prove the queue is empty (`queue/next` can return `batch: null` while `queue_size` > 0, e.g. a teammate holds the batch), so the header reads `queue_size` from `queue/count` directly.
- **Desk card:** Next step row; batch bar "B-{batch_id} waiting {now − submitted_at}" (omit the time if `submitted_at` is null) and a small Split / Choose / Release position marker.
- **Split stage** (`raw_text` set, no jokes; `raw_text` is null once split, and also when a batch was submitted already split as `jokes[]`): cut pieces stack above as numbered cards with "Undo from here"; the remaining text in a Lora box; under the box "Click between two jokes and press [Enter] to cut. The wording stays as written." (Enter as a keycap) and a status line; "Confirm, next" (gold). Splitting behaviour is unchanged (`BatchSplitter`).
  - Counter, Round 1: {batch_size} squares, filled by **cut pieces only** ("2 of 5"). Today's counter also counts the uncut remainder as a joke (`QualityControl.tsx` ~154, ~247); change it.
  - Counter, Round 2: "up to {round2BatchLimit}" with the cut count.
  - Status line: "Split at least one joke first." / "Split the remaining text to finish." / when all text is cut: "All split. Check the jokes, then confirm." only if the count is valid, else "Round 1 needs exactly {batch_size} jokes; you have {n}." or "Round 2 allows up to {limit}; you have {n}.". "Confirm, next" stays disabled while the count is invalid. The backend rejects a wrong count (`usecase/marketing.go` ~122–126); today the frontend only finds out from that error.
- **Choose stage** (jokes present): "Choose what to sell. Every joke you sell needs a topic and a title. The rest are discarded." and "Back to splitting". Each joke has a checkbox and a drag handle.
  - Selected: `--navy-tint` fill, 1.5 px `--navy` border, filled navy checkbox; fields on one row: Topic (a `<select>`, required, decorative as today, never sent) and Market title (max 120, counter); "Deselect". Missing fields show "Needs a topic and a title" in `--warn`; otherwise "To market" in navy.
  - Not selected: dashed outline, muted text, empty checkbox, "Discard".
  - Footer: note box "Note to your Joke Maker, sent with this batch" (max 500, counter); tally "Selling {n}, discarding {m}, costs ${n × cost_of_publishing + m × cost_of_discard}" (both are charged at publish, `marketing_repo.go` ~320–330); gold "Release to market". Round 2 with nothing selected keeps today's "Discard batch · N jokes" path. Release rules unchanged. The release toast must use the same formula: today `releaseOutcome` charges only the published jokes (`marketingRelease.ts` ~35–37).
- **Desk clear:** "Desk is clear" + "Your Joke Maker's next batch shows up here as soon as they send it." + a recap of this team's most recent processed batch: the batch in the team batch list with the latest `processed_at` (mapped as `ratedAt`; the list is sorted by id), counts from `publish_status` once it is mapped (section 7.2), "{published} to market, {discarded} discarded{, note sent}". Replaces "All Clear!". When the round has ended, `queue/next` answers 409 and the desk is empty for that reason: show "Round over. Nothing more to release." instead.
- **Customer feedback card:** "Your latest {rows.length} released jokes. Customers say what landed and what missed, never by how much." (`rows.length` ≤ `feedback_joke_count`, default 3; fewer early in a round.) One row per joke, in API order (`published_at DESC, joke_id DESC`; jokes of one batch share a `published_at`, so within a batch they run #5, #4, …): title (or "Untitled joke"), tag from `was_bought`, Landed chips (green) and Missed chips (warn). `was_bought` means a customer owns the joke **right now** (`stats_repo.go` ~141–144), so the tags read "Has a buyer" / "No buyer now". A joke with no customer read yet (empty `good`/`improve`) keeps today's "No customer read on this one yet." "Pop out" opens the window.
- **What customers judge:** a static 3-column list of the 11 matched criteria, then Title Fit set apart ("set by the title you write"). No tallies here.
- **Pop-out window** (`PopOutPanel`; change `POP_OUT_WIDTH`/`POP_OUT_HEIGHT` from 360 × 520 to 840 × 820, `PopOutPanel.tsx:32–33`; the browser may shrink the PiP window. The fallback panel for browsers without Document PiP is fixed bottom-right and today capped at `maxHeight: 70vh`, `PopOutPanel.tsx` ~170: make it `min(840px, 100vw − 48px)` × `min(820px, 100vh − 48px)`, draggable by its title bar): "What customers keep telling you", "Your latest {n} released jokes".
  - A criteria × jokes matrix. Columns in the feedback's API order, headed "B-{batch_id} #{position}", the title (2 lines max, full title on hover) and "{sold_count} buyers" / "No buyer now". Rows grouped "Fix next" then "Keep doing" (rule and order from `summarizeFeedback`), each label followed by "×{count}", where count is the number of jokes on the criterion's **winning side** (a row can also show marks from the other side); cells ✓ (landed), ✕ (missed), · (not mentioned). "No word yet: …" lists criteria no joke mentions. A joke with no customer read yet gets an all-"·" column and does not affect "No word yet".
  - Feedback and the batch list are both round-scoped: at the start of Round 2 the Round 1 jokes leave the matrix.
  - Below, a key: one row per joke with title, "B-{id}, joke #{position}, released {time} ago", the sales tag, and a disclosure that shows `joke_text`. Clicking a column header opens its key row. Hovering a column or key row highlights both.
  - The fallback panel (browsers without Document Picture-in-Picture) renders the same content.

## 6b. Instructor screen (`views/Instructor.tsx`)

Layout: header (4.1, "Instructor"), a control bar, then four tabs. The default tab follows the phase: Teams in the lobby, Live during and between rounds, Debrief after Round 2.

- **Control bar:**
  - The Round 1 / Round 2 segmented control. Each segment shows its status ("running", "ended", "not started"). It selects the **viewed** round only (decision 6): Round 2 can be viewed once it has started.
  - A status sentence:
    - Lobby: "Seat every pair, check the setup, then start. Customers arrive over {arrival} minutes from Start."
    - Running: "{n} teams playing. Customers stop arriving at {mm:ss}; end the round around then."
    - Between rounds: "Show students their teammates, then start Round 2 when the room is ready."
    - Over: "Both rounds ended. Open Debrief to compare the rounds."
  - One action:
    - "Start Round {n}" (gold), only when the target round is CONFIGURED.
    - "End Round {n}", with a confirm modal for both rounds.
    - Between rounds: the "Show students their teammates" switch, then "Start Round 2".
    - Over: "Open debrief".
  - There is no pause or resume (decision 1).
- **Live tab:**
  - Class totals: sales, profit (with best and worst), released but never sold (with the share), and fees.
  - Leaderboard "Leaderboard, Round {n}": `#` (backend rank), Team, Profit, Sales, Released, Discarded, Never sold, Fees (micro-bar + amount), Sent to released, To first sale.
    - Click a column to sort; the default is profit.
    - A "↑n / ↓n" tag shows when the rank changed since the last poll, and that row fades from gold once. This replaces the rainbow `jf-leaderboard-rankup`.
    - "Present" opens a full-screen, large-type copy.
  - The four lean charts in a 2 × 2 grid:
    - **Where the money leaked:** stacked bars, most first.
    - **Jokes standing still:** one row per team, worst first. Each row has a "Right now" bar (waiting on Marketing in storage blue, then unsold in hosting amber), the count (in `--warn` when above the class average), a dashed class-average tick, and an "Over the round" trend drawn as a light stacked area in the same two colours, with the class average dashed. Hovering the trend shows "peak {n} jokes at {m} min". Clicking a row expands that team's full chart. There is no team dropdown; at about 26 px per row, 20 teams fit.
    - **Smaller batches, faster feedback:** a scatter of Round 1 (grey) and Round 2 (navy); hollow dots = no sale yet. Until Round 2 exists it notes "Round 1 batches are all 5 jokes. Round 2 lets teams pick 1 to 10."
    - **More cycles, more learning:** class sell-through, with end labels.
  - Live market, best sellers first.
- **Teams tab:**
  - A lobby strip: "Lobby: {n} pairs waiting", the waiting pairs as chips, and "Auto-assign {k} teams".
  - One card per real team. Empty teams are not drawn and there is no "ID: n". Each card has an editable name (browser-only, said in a note), a Joke Maker slot and a Marketing slot.
  - Pairs can be dragged between slots or back to the lobby. ⇄ swaps the team's two roles. × removes the account, through the confirm modal.
- **Setup tab:**
  - A lock banner when anything is locked.
  - Round timing: "Customers arrive over [15] min", and the note "Rounds don't end on their own…".
  - Market: customers per team ("about {n} customers for {t} teams"), customer budget, price per sale.
  - Costs: shipping per batch with labels "1–4 jokes / 5 jokes / 6–10 jokes" above the three inputs, storage per joke-minute, hosting per joke-minute, publishing per joke.
  - Batches: fixed text.
  - Changed fields are outlined in amber; "Apply" shows the number of changes.
  - "Hidden ideal joke": 11 rows of label + select, "Use defaults", and "Saved as you make each change". Hidden while locked.
  - "Reset game" at the bottom, behind a confirm modal.
  - The nudge fields are gone (decision 3).
- **Debrief tab:** "Round 1 vs Round 2". For each team: profit R1 / R2 / change (green or `--warn`), never sold R1 / R2, fees R1 / R2, and sent to released R1 / R2. Sorted by Round 2 profit. Before Round 2 starts it shows "Available once Round 2 has started".

## 7. Data wiring

Poll: `context.tsx` polls every 2.5 s while the tab is visible; the instructor's lean charts poll every 10 s while ACTIVE and once when ENDED. "Go" names the handler that builds the field. Every row below was checked against the Go source on 2026-10-18.

### 7.1 Shared (all roles)

| UI element | Endpoint | Go field (handler) | Frontend today | Change needed |
|---|---|---|---|---|
| Round number, state word, lamp colour | `GET /v1/rounds/active` | `rounds[].round_number`, `status` (`dto/round.go` PublicRound) | `config.round`, `roundStatuses` | none |
| Elapsed clock | same | `started_at`, `ended_at` | `config.startTime`, set to null whenever the round is not ACTIVE (`context.tsx` ~724–728, ~1029–1032); `ended_at` never read | keep `startedAt` and `endedAt` for the displayed round whatever its status; header round choice per section 4.1 |
| Pair names | `GET /v1/session/me` | `user.display_name` (`session.go`) | `user.display_name` | display: split on `_`, capitalise, join with " and "; fall back to the raw name |
| Team name | `GET …/teams/:t/summary` | `team.name` (`round.go` TeamSummary) | header uses `teamNames[user.team] || Team ${user.team}` (`components.tsx:198`) | add `teamSummary.team.name` as the second choice (section 4.1) |
| Rank, profit, sales | same | `rank`, `profit`, `total_sales` | `teamSummary.*` | none; movement tag is client state |
| Found a buyer N of M | `GET …/teams/:t/batches` (N); summary (M) | N: count of jokes with `publish_status = PUBLISHED` and `first_sold_at` set; M: `published_jokes` | `first_sold_at` mapped (`context.tsx:179`) but missing from the `Joke` type | add `first_sold_at` and `publish_status` to `Joke`; do not use `sold_jokes_count` |
| Fees chart amounts | same | `lean.shipping_cost`, `lean.storage_cost`, `lean.hosting_cost` | `leanFeesOf(teamSummary.lean)` (`leanMode.ts:354`), used only by Marketing (`QualityControl.tsx:585`) | Joke Maker: build the disclosure and call `leanFeesOf` |
| Listing and discard fees | summary + active round | `published_jokes`, `discarded_jokes`; `cost_of_publishing`, `cost_of_discard` | `config.costOfPublishing`, `config.costOfDiscard` | none |
| Revenue | same | `market_price × total_sales` | `config.marketPrice` | none |
| Wait timeline | summary | `lean.avg_submit_to_publish_s`, `lean.avg_publish_to_first_sale_s` | only `QualityControl.tsx:587` reads first-sale time | read both from `teamSummary.lean` on both screens |
| Next step text and tone | (client) | from the inputs below | `services/nextStep.ts` (the note message is already removed) | copy rules |

### 7.2 Joke Maker

| UI element | Endpoint | Go field | Frontend today | Change needed |
|---|---|---|---|---|
| Batch size line | `/rounds/active` | Round 1 row `batch_size`; Round 2 row `batch_size` (`max_batch_size` mirrors it: the branch at `dto/round.go:58–61` is dead) | `config.round1BatchSize`; `config.round2BatchLimit` = `r2.max_batch_size ?? r2.batch_size`, only while that round is ACTIVE/ENDED and > 1, else default 10 (`context.tsx` ~1048–1049, ~52) | none; the Round 2 limit is enforced at Marketing's split (`marketing.go` ~122–125), not at the Joke Maker's paste |
| Send to Marketing | `POST /v1/rounds/:r/batches` | body `{team_id, raw_text}` (`dto.BatchSubmitRequest`) | `submitRawBatch` | none |
| Batch row: id, sent time, status | `GET …/teams/:t/batches` | `batch_id`, `submitted_at`, `status` (`batch.go` List) | `batches[]` via `mapBatchFromTeamList` | none |
| Note indicator, note text, note time | same | `marketing_note`, `processed_at` | `batch.marketing_note`, `ratedAt` | none |
| Joke text, title | same | `jokes[].joke_text`, `jokes[].joke_title` | text mapped; **title not mapped** | map `joke_title` in `mapBatchFromTeamList`, add `joke_title` to `Joke` |
| Joke state, buyers | same | `publish_status` (PENDING / PUBLISHED / DISCARDED), `sold_count` (current holders), `first_sold_at` | reduced to boolean `is_published` (`context.tsx` ~175–178), so PENDING and DISCARDED look the same | map `publish_status` and `first_sold_at` onto `Joke`; rules per section 5 |
| "on market N min" | same | `published_at` | mapped (`published_at`) | add to the `Joke` type |
| Joke position "#n" | same | order of `jokes[]` | array index | none |
| With Marketing count | summary | `unprocessed_batches` = count of SUBMITTED batches, including the one Marketing holds (`lean_stats_repo.go` ~219–223) | `teamSummary.unprocessed_batches` | none; wording per section 5 |
| Poll scope | | | session/me and rounds/active always; summary and batches only in ACTIVE/ENDED (`context.tsx` ~1128) | empty states before the first start |

### 7.3 Marketing

| UI element | Endpoint | Go field | Frontend today | Change needed |
|---|---|---|---|---|
| "{n} more waiting" | `GET /v1/marketing/queue/count?round_id=` (no round-status check) | `queue_size`: team's SUBMITTED batches in the round, incl. the one on the desk (`marketing_repo.go` ~70–74) | `qcQueue.queue_size`; `qcQueue` is null when the count is 0 **or** when `queue/next` returns `batch: null` (`context.tsx` ~1267–1268, ~1294–1300) | keep the count separately from `qcQueue`; show `queue_size − (desk ? 1 : 0)` |
| Batch id, wait time, raw text | `GET /v1/marketing/queue/next?round_id=`: **claims and locks** the next batch to the caller, or returns the one it holds (`marketing_repo.go` ~34–66); 409 `ROUND_NOT_ACTIVE` after the round ends | `batch.batch_id`, `batch.submitted_at` (nullable), `batch.raw_text` (null once split, or if submitted as `jokes[]`) | `qcQueue.batch` (nullable since the bug-fix pass) | guard null `submitted_at`; ended-round copy (section 6) |
| Split / unsplit | `POST /v1/marketing/batches/:id/split`, `/unsplit` | body `{jokes: string[]}` | `splitBatch`, `unsplitBatch` | none |
| Choose stage jokes | queue/next | `jokes[{joke_id, joke_text}]` | `incomingJokes` | none |
| Release | `POST /v1/marketing/batches/:id/publish` | body `{jokes: [{joke_id, joke_title, is_published}], note?}` (`dto.PublishRequest`) | `publishBatch` | none; topic stays client-only |
| Cost tally | `/rounds/active` | `cost_of_publishing`, `cost_of_discard` | `config.*` | none |
| Release toast | (client) | same costs | `releaseOutcome` charges published only (`marketingRelease.ts` ~35–37) | add `discarded × cost_of_discard` so it matches the tally |
| Split counter and validation | `/rounds/active` | Round 1 `batch_size`; Round 2 limit | counter counts the uncut remainder (`QualityControl.tsx` ~154, ~247); Confirm does not check the count (~156) | count cut pieces only; block Confirm on a wrong count with the section 6 message |
| Desk clear recap | `GET …/teams/:t/batches` | the batch with the latest `processed_at`: `batch_id`, jokes `publish_status`, `marketing_note` | `batches` (sorted by id; `ratedAt` = `processed_at`) | pick by `ratedAt`; counts from `publish_status` once mapped |
| Feedback rows | `GET …/teams/:t/feedback` | `jokes[{joke_id, joke_title, was_bought, good_dimensions[], improve_dimensions[]}]` (`feedback.go`); ids `LENGTH` … `TITLE_FIT`; order `published_at DESC, joke_id DESC`; `was_bought` = owned now | `teamFeedback` → `toFeedbackRows` | copy "Has a buyer" / "No buyer now" |
| "latest N" | feedback response | number of rows returned (≤ `feedback_joke_count` on `/rounds/active`) | not read | use `rows.length` |
| Pop-out column header and key: batch, position, text, release time, buyers | `GET …/teams/:t/batches` joined by `joke_id` | `batch_id`, index in `jokes[]` (ordered by `joke_id`), `joke_text`, `published_at`, `sold_count` | `batches` polled for Marketing, same round and team as feedback (`context.tsx` ~1340–1383); feedback is set before batches in a poll, so a new joke can render title-only for one poll | add a pure join `feedbackJokeContext(rows, batches)`; a joke missing from `batches` shows its title only |
| Poll continuity | | | `if (qcQueue) return;` (`context.tsx` ~1272) only works because it reads a stale `qcQueue`; if it ever saw the real value, the summary, feedback and batches polls would stop while a batch is on the desk | move the guard so it skips only `queue/next` (the safe fix found in the bug-fix pass); add a test |
| Pop-out size | (client) | | `POP_OUT_WIDTH` 360, `POP_OUT_HEIGHT` 520, fallback `maxHeight: 70vh` (`PopOutPanel.tsx` 32–33, ~170) | 840 × 820; fallback per section 6 |
| Keep doing / Fix next | (client) | from feedback rows | `summarizeFeedback` | none |

### 7.4 Instructor

| UI element | Endpoint | Go field | Frontend today | Change needed |
|---|---|---|---|---|
| Round statuses, start time | `GET /v1/rounds/active` | `rounds[].status`, `started_at`, `ended_at`, `arrival_window_seconds` | `roundStatuses`, `config` | separate `viewRound` (UI state) from `config.round` (decision 6) |
| Start Round n | `POST /v1/instructor/rounds/:id/start` | `ConfigRequest` merged first; returns `{round}` | `setGameActive(true)` | Start only when the target round is CONFIGURED (bug-fix pass) |
| End Round n | `POST …/end` | returns `{round}` | `endRound` | confirm modal for both rounds |
| Show teammates toggle | `POST …/popups` | `{is_popped_active}` | `toggleTeamPopup` | none |
| Class totals | `GET /v1/instructor/rounds/:id/stats` | sum of `leaderboard[].total_sales`, `profit`, `published_jokes`; never sold from `lean.batch_series` (`leanMode.ts` neverSold); fees `lean.shipping_cost + storage_cost + hosting_cost` | `instructorStats*` | new pure `classTotals(rows)` |
| Leaderboard | same | `rank`, `team.name`, `profit`, `total_sales`, `published_jokes`, `discarded_jokes`, never sold, fees, `lean.avg_submit_to_publish_s`, `lean.avg_publish_to_first_sale_s` | rows (rank wired in the bug-fix pass) | new columns/order; team name prefers `teamNames[id]` |
| Rank move tag and row flash | same | `rank` vs previous poll | `jf-leaderboard-rankup` | one gold fade replaces the gradient |
| Where the money leaked | `GET /v1/instructor/rounds/:id/lean-charts` (polled every 10 s while ACTIVE, once when ENDED; `leanCharts.ts:21`) | `teams[].waste.{setup = shipping, waiting = storage, shelf = hosting, never_sold = listing fees on never-sold jokes, discarded, total}` in dollars (`lean_charts.go` 15–18) | `WasteBreakdownChart` | restyle. `never_sold` is already inside `cost_of_publishing × published`, so never show `total` as a loss on top of profit |
| Jokes standing still | same | `teams[].idle[{t, waiting, shelf}]`, `class_average.idle[{t, waiting, shelf}]` | `IdleJokesChart` (one team) | ranked rows: latest sample per team, trend from the series, class average from `class_average.idle` |
| Smaller batches, faster feedback | same, one call per round (a Classic round answers 409) | `teams[].batches[{jokes, first_sale_s}]`: seconds from the batch being **sent** to its first sale; null = no sale yet | `BatchFeedbackChart` | restyle; Round 1 note |
| More cycles, more learning | same | `class_average.sell_through[{t, value}]`: `value` null when nothing was published in that interval (`lean_charts.go` ~281–308); with a team picked, `teams[].batches` sold/published per batch | `LearningCyclesChart`; "too recent to judge" is a client rule (`leanCharts.ts` ~354–358) | restyle; keep both rules |
| Live market | `GET /v1/rounds/:id/market` (any valid `X-User-Id`, not the instructor group; 409 `ROUND_NOT_ACTIVE` before start) | `items[{joke_id, joke_text, joke_title, team_id, team_name, sold_count, published_at?}]`, ordered by `published_at` ascending (`aicustomer_repo.go:235`); `sold_count` = current holders | `marketItems` | client sort by `sold_count` desc for "best sellers first"; label "{n} buyers"; top 5, "Show all {n}" keeps today's paging; before start show "Market opens when the round starts." |
| Lobby and teams | `GET /v1/instructor/rounds/:id/lobby` | PascalCase `Teams[{Team{id,name}, Members[{UserID, DisplayName, Role}]}]`, `Unassigned[{UserID, DisplayName, Status}]` | `instructorLobby` via `normalizeInstructorLobby` (bug-fix pass) | none |
| Auto-assign | `POST …/assign` | `{team_count}`; reshuffles waiting **and** assigned pairs into new teams (`instructor.go` ~269–287) | `formTeams` sends floor(non-instructor roster / 2) (`context.tsx` ~1636–1637) | label "Auto-assign {floor((Summary.Waiting + Summary.Assigned) / 2)} teams"; when teams exist, confirm "This reshuffles every team." |
| Move pair, switch role | `PATCH …/users/:uid` | body `{status: "ASSIGNED" (required), role: "JM" | "MARKETING" (never QC), team_id? (omit or null keeps the team)}`; returns the full PascalCase lobby | `updateUser`; `toggleUserRole` flips one pair only (`Instructor.tsx` ~902–905) and can leave two of one role; the backend has no (team, role) uniqueness (`PatchUser`, `instructor.go` ~314–350) | ⇄ sends two PATCHes in any order and uses the second response as the new lobby; if the second fails, revert the first. Dropping a pair into a slot sets that slot's role |
| Remove pair | `DELETE …/users/:uid` | `{deleted_user_id}` | `deleteUser` | replace `window.confirm` with the modal |
| Setup fields | `POST …/config` (`ConfigRequest`, `dto/models.go` 66–99; it has no nudge fields) | `arrival_window_seconds` (`*int`), `customers_per_team`, `customer_budget`, `market_price`, `cost_of_publishing`, `shipping_fee_small/standard/large`, `storage_fee_per_joke_minute`, `hosting_fee_per_joke_minute` | `updateConfig` via `roundConfig.ts`; arrival entered in seconds today (`FeeConfigFields.tsx` ~111–112) | enter arrival in minutes, send `Math.round(min × 60)` (an integer, else 400); remove the nudge fields (decision 3). Locks: once a round leaves CONFIGURED, `market_mode` and, in LEAN, arrival, customers per team and the five fees answer 409 (`error.code` `CONFLICT`, message prefix `MARKET_MODE_LOCKED`, `instructor.go` ~93–135); re-sending the same value is accepted. `customer_budget`, `market_price`, `cost_of_publishing` are never locked by the backend; the UI locks them while ACTIVE |
| Ideal joke (read) | **new** `GET /v1/instructor/rounds/:id/config` | `round.ideal_profile` | defaults after reload | section 8 |
| Ideal joke (write) | `POST …/config` | `ideal_profile` map, keys `LENGTH` … `ENERGY`, values the exact strings in `scoring/dimensions.go` | `IdealProfilePicker` already shows and sends the raw backend strings (`IdealProfilePicker.tsx` ~76–78); `config/dimensions.backend-parity.test.ts` guards them | none: the restyle must keep the raw strings as option values and labels. The backend does not lock `ideal_profile` after start (`usecase/instructor.go` ~93–111; classification reads it per job), so keep the picker disabled while ACTIVE, as today |
| Reset game | `POST /v1/admin/reset` | `{status, message}` | `resetGame` | modal unchanged |
| Debrief | stats for R1 and R2 | `profit`, never sold, fees, `lean.avg_submit_to_publish_s` per team | `LeanDebrief` | restyle; sort by R2 profit |

Lean profit (backend, `infra/repo/postgres/lean_stats_repo.go`, `profits` CTE):
`market_price × total_sales − cost_of_publishing × published_jokes − cost_of_discard × discarded_jokes − shipping_cost − storage_cost − hosting_cost`.
Section 4.4's bar uses exactly these terms.

Classic rounds (`market_mode = CLASSIC`; lean-charts answers 409 with `error.code` `CONFLICT` and message prefix `NOT_LEAN_ROUND`, `usecase/stats.go` ~85–89): leaderboard rows have no `lean` key at all, so there are no fees, wait times or `batch_series`; `neverSold()` returns null and today falls back to `unsold_jokes` = max(published − sales, 0), which is not the same measure. The Live tab shows totals (sales and profit only), the leaderboard without the fee, never-sold and wait columns, and the live market; the chart area says "Lean charts appear in Lean rounds." (decision 5). Rank is DENSE_RANK by Classic profit (`stats_repo.go:228`). Debrief shows "–" for a Classic round's lean columns.

## 8. Backend addition: read the round config

`GET /v1/instructor/rounds/:round_id/config`, in the instructor group (`server.go`, add after line 157).

On the wire `{"data": {"round": InstructorRound}}` (`apiClient` unwraps `data`), the same shape as the POST response: `dto.ToInstructorRound(round, profile)`, so `ideal_profile` comes back with the keys and values the POST accepted. With no stored profile, `GetIdealProfile` returns an empty map and `omitempty` drops the key.

Handler, modelled on `Config` (`handler/instructor.go` 38–77) but without its fall-back to defaults:

```go
func (h *InstructorHandler) GetConfig(c *gin.Context) {
	roundID, err := strconv.ParseInt(c.Param("round_id"), 10, 64)
	if err != nil { response.BadRequest(c, "invalid round id", middleware.GetRequestID(c)); return }
	round, err := h.instructorService.GetRound(c.Request.Context(), roundID)
	if err != nil { response.FromDomainError(c, err, middleware.GetRequestID(c)); return }
	profile, err := h.instructorService.GetIdealProfile(c.Request.Context(), roundID)
	if err != nil { response.FromDomainError(c, err, middleware.GetRequestID(c)); return }
	response.OK(c, gin.H{"round": dto.ToInstructorRound(round, profile)})
}
```

Errors: 400 malformed round id or malformed `X-User-Id`; 401 missing header or unknown user; 403 not an instructor; 404 `NOT_FOUND` unknown round (`round_repo.go` 24–33).

Tests: route tests in `app/server` (there are no handler-package tests), modelled on `customers_per_team_routes_test.go` 20–103 with the `feesRequest` helper (`lean_fees_routes_test.go` 18–40):
- GET `/rounds/1/config` → 200, `data.round.id == 1`, no `ideal_profile`;
- POST config with `testutil.ValidIdealProfile()`, then GET → the profile comes back;
- GET `/rounds/99/config` → 404 `NOT_FOUND`;
- GET `/rounds/abc/config` → 400;
- GET with no header → 401.

Frontend: `instructorService.getRoundConfig(roundId)`; the instructor screen calls it on mount and when the viewed round changes, and fills `IdealProfilePicker` from `ideal_profile`, falling back to `DEFAULT_IDEAL_PROFILE` only when the key is absent (today it always shows the defaults after a reload, `context.tsx` ~582).

## 9. Open items

None. The last one, the "Marketing says" Next step message, was removed on 2026-10-18 (section 2).

## 10. Guided tour and tutorial

Update in the same change as each screen:
- `services/tour/tourSteps.ts`: captions for the scoreboard ("Team rank, by profit…"), "Fees and wait times", the Next step location, the criteria list and the pop-out, the topic dropdown.
- `services/tour/demoUi.ts` and `demoScript.ts`: "More numbers open" becomes "Fees and wait times open"; demo data covers `joke_title`, `published_at`, `feedback_joke_count`.
- `data-tour` targets move with their elements; the "every tour target exists" test stays green.
- `components/Tutorial.tsx` (instructor "How this works"): steps follow Live / Teams / Setup / Debrief; remove "tune τ, jitter, swap margin".

## 11. Testing

- Pure helpers with unit tests:
  - rank movement and `classTotals`;
  - the fee bar segments, including negative profit and the listing and discard term;
  - "found a buyer" (PUBLISHED with `first_sold_at`);
  - joke state rules (PENDING, selling, lost its buyers, no buyer yet, not released);
  - `feedbackJokeContext` (join, missing joke, round boundary);
  - pair-name formatting and idle ranking;
  - the split counter and count validation (Round 1 exact, Round 2 limit);
  - the release cost (tally and toast agree);
  - the desk-clear pick (latest `processed_at`);
  - the role swap (two PATCHes, revert on failure);
  - arrival minutes → integer seconds.
- Render tests per screen for each state: Joke Maker (no batches, unsplit, open batch with note, every joke state), Marketing (split, choose with selected and unselected, desk clear, pop-out matrix), Instructor (each phase, Classic round, nudges absent).
- Existing suites stay green, including tour targets and `config/dimensions.backend-parity.test.ts`.
- Poll continuity: a test that summary, feedback and batches keep refreshing while a batch is on Marketing's desk.
- Backend: the route tests in section 8.
- Manual check in the dev preview at 1280 and 1440 wide, and the projector view (Present).

## 12. Delivery

One pull request per step, each with its tour updates and tests:
1. Tokens, fonts and the shared shell (header, Next step row, scoreboard, Fees and wait times).
2. Joke Maker.
3. Marketing (with the pop-out).
4. Backend `GET …/config`, then Instructor.

Reference mockups: `joke-maker-v1-locked.html`, `marketing-v1-locked.html`, `instructor-v1-locked.html` (session scratchpad; rebuildable from the session log).
