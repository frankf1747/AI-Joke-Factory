# Quiet Factory UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Joke Maker, Marketing and Instructor screens in the locked "quiet factory" design, with every on-screen value wired to the backend field the spec names.

**Architecture:**
- **Logic in pure helpers.** Decisions (joke states, fee bar segments, rank movement, split validation, header round, idle ranking, class totals) move into small pure modules under `services/`, unit-tested first.
- **Thin components.** Screens become small components that render those helpers' output, and render tests check them.
- **Instructor split.** `views/Instructor.tsx` (about 3,300 lines) is split into a control bar plus four tab components under `components/instructor/`.
- **One backend endpoint.** `GET /v1/instructor/rounds/:round_id/config` is added in `jokefactory_be`.
- **Four pull requests**, in order: Phases A, B, C and D.

**Tech Stack:** React 19 + TypeScript, Tailwind via CDN plus CSS tokens in `index.css`, Vitest (node environment; render tests use `react-dom/server` `renderToStaticMarkup`), Go + gin in `jokefactory_be`.

**Spec:** `docs/superpowers/specs/2026-10-18-quiet-factory-ui-design.md` (sections cited as "spec §n").

## Global Constraints

- **Branches:**
  - Frontend: `feat/quiet-factory-ui` off `feat/lean-market` (after commit `f908d45`). One PR per phase into `feat/lean-market`.
  - Backend: `feat/instructor-config-read` off `main` in `jokefactory_be`.
- **Tokens:** use the CSS custom properties from spec §3 exactly (`--paper #f5f3ee`, `--sheet #fffefb`, `--navy #003b5c`, `--gold #ffd100`, `--selling #2e7d52` on `#eaf2ec`, `--waiting #8a6400` / dot `#d9a92b` on `#f9f1dc`, `--warn #9a3b1c` on `#f6e3da`, chart shipping `#c4553a`, storage `#3f7cc0`, hosting `#d9a92b`, never-sold `#7a4f9a`, discards `#bdb7ab`, Round 1 `#a7aaa8`, Round 2 `--navy`). Gold is used only on primary buttons.
- **Fonts:**
  - IBM Plex Sans 400/500/600/700, IBM Plex Mono 400/500/600, Lora 400/500.
  - Instrument Sans 600 is for the rank ordinal only.
  - Numbers use `font-variant-numeric: tabular-nums`.
- **Copy:** sentence case, no em dashes, no exclamation marks in any string you touch. Durations read "45 s", "1 min", "1 min 12 s", "56 min".
- **Forbidden by design decision:**
  - rubber stamps;
  - edge accent lines (left-border callouts);
  - icons or avatars on message bubbles;
  - renaming "Next step";
  - removing a state's colour highlight;
  - surfacing Marketing's note anywhere but inside the opened batch.
- **No game-rule changes.** API request bodies stay as they are, except the new GET (spec §8).
- **Tour:** every tour target in `services/tour/tourSteps.ts` (`jm-draft`, `jm-send`, `jm-shipping`, `jm-next-step`, `jm-value-stream`, `jm-marketing-note`, `jm-stats`, `mk-desk`, `mk-jokes`, `mk-topic-title`, `mk-note`, `mk-release`, `mk-stats`, `mk-more`, `mk-next-step`, `mk-feedback`, `mk-expand`) stays on the real screens; the tour's target test stays green.
- **Gate for every task:** `npm test` and `npm run typecheck` pass before you commit.

## Review Focus

1. **A joke that sold and was swapped out** (`sold_count = 0`, `first_sold_at` set) reads "Sold before, swapped out", never "No buyer yet". Pinned in Task B1.
2. **Negative profit**: the fee bar scales to total costs, omits the profit segment and says "Loss −$x". Pinned in Task A8.
3. **Wrong split count**: in Round 1, a split that isn't exactly `batch_size` keeps "Confirm, next" disabled and names the count. Pinned in Tasks C2 and C3.
4. **Between rounds** (Round 1 ENDED, Round 2 CONFIGURED): students see "Round 1 · Round over", not "Round 2 · Not started". Pinned in Task A4.
5. **Marketing while a teammate holds the batch** (`queue/next` → `batch: null`, `queue_size` 2): the desk header shows a waiting count, not "nothing waiting", and the summary, feedback and batches polls keep refreshing while a batch is on the desk. Pinned in Tasks C1 and C2.

---

## Phase A: shared shell (PR 1)

### Task A0: Branch

- [ ] **Step 1:** `git switch feat/lean-market && git switch -c feat/quiet-factory-ui`. Expected: a clean tree apart from `.claude/launch.json`, which you never stage.

### Task A1: Tokens and fonts

**Files:**
- Modify: `index.html` (Google Fonts link), `index.css` (`:root` tokens; delete the duplicated `.flip-card*` and `.jf-leaderboard-rankup` blocks, each defined twice).
- Test: `designTokens.test.ts` (new, repo root).

- [ ] **Step 1: Write the failing test.** Read the files with `fs` and assert:
  - `index.html` requests `IBM+Plex+Sans`, `IBM+Plex+Mono`, `Lora` and `Instrument+Sans`.
  - `index.css` defines each token in the Global Constraints list with that exact value (e.g. `expect(css).toMatch(/--paper:\s*#f5f3ee/)`).
  - `index.css` contains `.flip-card-inner {` exactly once.
- [ ] **Step 2:** `npx vitest run designTokens.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Add the font link and the tokens. Set `body` to `background: var(--paper); color: var(--ink); font-family: 'IBM Plex Sans', …`, and `.joke-font` to Lora. Remove the duplicates.
- [ ] **Step 4:** Run the test. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): quiet factory tokens and fonts`.

### Task A2: Shared formatters

**Files:**
- Create: `services/format.ts`, `services/format.test.ts`
- Modify: `services/nextStep.ts` (replace its private `fmtWait` with `fmtDuration`)

**Interfaces:**
- Produces:
  - `fmtDuration(secs: number): string`
  - `fmtClock(secs: number): string` ("07:19", "96:35")
  - `pairNames(displayName: string): string`
  - `ordinal(n: number): { n: number; suffix: 'st' | 'nd' | 'rd' | 'th' }`

- [ ] **Step 1: Write the failing tests.**
  - `fmtDuration`: 45 → `'45 s'`; 60 → `'1 min'`; 72 → `'1 min 12 s'`; 599 → `'9 min 59 s'`; 600 → `'10 min'`; 3391 → `'56 min'`.
  - `fmtClock`: 439 → `'07:19'`; 5795 → `'96:35'`.
  - `pairNames('priya_tomás')` → `'Priya and Tomás'`; `pairNames('solo')` → `'Solo'`; `pairNames('')` → `''`.
  - `ordinal`: 1 → `'st'`, 2 → `'nd'`, 3 → `'rd'`, 4 → `'th'`, 11/12/13 → `'th'`, 21 → `'st'`, 22 → `'nd'`.
- [ ] **Step 2:** `npx vitest run services/format.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `nextStep.ts` imports `fmtDuration`; its existing tests keep passing unchanged.
- [ ] **Step 4:** Run the format and nextStep tests. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): shared duration, clock, pair-name and ordinal formatters`.

### Task A3: Joke fields on the wire

**Files:**
- Modify: `types.ts` (`Joke`), `context.tsx` (`mapBatchFromTeamList`, ~lines 156–196)
- Test: `context.batchMapping.test.ts` (existing; extend)

**Interfaces:**
- Produces: `Joke` gains `joke_title?: string | null`, `publish_status?: 'PENDING' | 'PUBLISHED' | 'DISCARDED'`, `published_at?: string | null` and `first_sold_at?: string | null`. The mapper fills all four from the wire, and keeps `is_published`.

- [ ] **Step 1: Write the failing test.** Map a batch whose jokes carry `joke_title: 'The Self-Starter'`, `publish_status: 'PENDING'` and `first_sold_at: '2026-10-18T10:00:00Z'`. Assert the mapped joke has exactly those values, and `is_published === false`.
- [ ] **Step 2:** Run it. Expected: FAIL on `joke_title` and `publish_status`.
- [ ] **Step 3:** Add the fields to `Joke` and map `joke_title` and `publish_status`. `published_at` and `first_sold_at` are already mapped; drop their `as any` casts.
- [ ] **Step 4:** Run the test. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(data): map joke_title and publish_status onto Joke`.

### Task A4: Which round the header shows, and its clock

**Files:**
- Create: `services/headerRound.ts`, `services/headerRound.test.ts`
- Modify: `context.tsx`: expose `roundTimes`, filled from every row of `/rounds/active` whatever its status.

**Interfaces:**
- Produces:
  - `roundTimes: Record<1 | 2, { startedAt: number | null; endedAt: number | null }>` on the context.
  - `headerRound(a: { selectedRound: 1 | 2; statuses: Record<1 | 2, 'CONFIGURED' | 'ACTIVE' | 'ENDED' | null>; times: Record<1 | 2, { startedAt: number | null; endedAt: number | null }>; now: number }): { round: 1 | 2; state: 'not-started' | 'running' | 'over'; clockSecs: number; clockLabel: 'not started' | 'elapsed' | 'total' }`

- [ ] **Step 1: Write the failing tests.**
  - R1 ACTIVE, started 439 s ago → `{ round: 1, state: 'running', clockSecs: 439, clockLabel: 'elapsed' }`.
  - **Review Focus 4:** selected round 2; R1 ENDED (900 s total), R2 CONFIGURED → `{ round: 1, state: 'over', clockSecs: 900, clockLabel: 'total' }`.
  - R2 ACTIVE → round 2, running.
  - Both ENDED → round 2, over.
  - Nothing started → round 1, `not-started`, 0.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. In `context.tsx`, set `roundTimes` from each round's `started_at`/`ended_at` on every poll. `config.startTime` stays as it is for existing readers.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): header round and clock, including between rounds`.

### Task A5: Header (RoleLayout)

**Files:**
- Modify: `components.tsx` (`RoleLayout`, ~lines 184–248)
- Test: `views/studentScreens.render.test.ts` (extend; follow its existing render setup)

**Interfaces:**
- Consumes: `headerRound` (Task A4), `pairNames` and `fmtClock` (Task A2), `teamSummary.team.name`.

- [ ] **Step 1: Write the failing test.** Render the Joke Maker with R1 ACTIVE, `display_name: 'priya_tomás'`, `user.team: '3'`, and no local team name. Assert the markup contains:
  - "Running", "Round 1" and `/\d\d:\d\d/` with "elapsed";
  - "Priya and Tomás";
  - "Team 3, Joke Maker";
  - a button labelled "Replay the 1-minute tour".
  - It must not contain "New here? Watch".

  A second case with `teamSummary.team.name: 'Team Alpha'` shows "Team Alpha, Joke Maker".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Restyle per spec §4.1:
  - andon lamp, state word and colour, the 3 px strip;
  - team label order `teamNames[user.team]` → `teamSummary.team.name` → `Team ${user.team}`.
  - The first-time prompt logic in `services/tour/seen.ts` is unchanged; only the gold pill goes.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): andon header with round state and clock`.

### Task A6: Next step row

**Files:**
- Modify: `components/NextStep.tsx` (`NextStepLine`, `NextStepLive`)
- Test: `components/NextStep.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Info tone renders the label "Next step" and the text, with no background class.
  - Warn tone renders the text with the `--warn` colour class.
  - Text stays escaped (the existing test).
  - `NextStepLive` sets `data-changed="true"` on the render where the text changes, and not on a re-render with the same text. Test the "changed" decision as a pure `didChange(prev: string | null, next: string): boolean` exported from the file.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the one-line row:
  - the gold flash is a CSS keyframe (`#fff1b8` fading out over 2.2 s) applied while `data-changed="true"`;
  - the slide-in is applied to the text span;
  - respect `prefers-reduced-motion`.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): quiet Next step row that flashes only on change`.

### Task A7: Scoreboard

**Files:**
- Create: `services/scoreboard.ts`, `services/scoreboard.test.ts`, `components/Scoreboard.tsx`
- Modify: `views/JokeMaker.tsx`, `views/QualityControl.tsx` (replace the key `StatTiles` with `Scoreboard`); `components/StatTiles.test.tsx` (retarget or remove the key-tile assertions)

**Interfaces:**
- Produces:
  - `rankMovement(prev: number | null, now: number | null): { kind: 'up' | 'down' | 'same' | 'lead' | 'none'; by: number }`
  - `foundABuyer(batches: Batch[]): number`: jokes with `publish_status === 'PUBLISHED'` and `first_sold_at` set.
  - `<Scoreboard rank profit totalSales publishedJokes foundBuyer tourId />`, where `tourId` is `'jm-stats' | 'mk-stats'`.

- [ ] **Step 1: Write the failing tests.**
  - `rankMovement(3, 2)` → up 1; `(1, 3)` → down 2; `(2, 2)` → same; `(2, 1)` → lead; `(null, 2)` → same; `(2, null)` → none.
  - `foundABuyer` over these jokes counts 2: PUBLISHED with `first_sold_at`; PUBLISHED, `sold_count 0`, with `first_sold_at` (swapped out, still counts); PUBLISHED without `first_sold_at`; DISCARDED; PENDING.
  - A render with rank 1 shows "1", "st" and "In the lead".
  - A render with `profit: -6.55` shows "−$6.55" in the warn colour.
  - With no summary (round not started), every value shows "—".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §4.3:
  - The ordinal uses Instrument Sans 600 at 54 px.
  - The previous rank lives in a `useRef` updated after each successful summary.
  - Never read `sold_jokes_count`.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): rank-by-profit scoreboard on both student screens`.

### Task A8: Fees and wait times

**Files:**
- Create: `services/feeBar.ts`, `services/feeBar.test.ts`, `components/FeesAndWaits.tsx`
- Modify: `views/JokeMaker.tsx`, `views/QualityControl.tsx` (the disclosure replaces "More numbers" in Lean; Classic keeps today's more-tiles)

**Interfaces:**
- Produces:
  - `feeBar(a: { marketPrice: number; totalSales: number; costOfPublishing: number; costOfDiscard: number; publishedJokes: number; discardedJokes: number; shipping: number; storage: number; hosting: number }): { revenue: number; segments: Array<{ key: 'shipping' | 'storage' | 'hosting' | 'listing' | 'profit'; amount: number }>; loss: number | null; scaleTo: number }`
  - `<FeesAndWaits summary={teamSummary} config={config} tourId />`, where `tourId` is `'mk-more' | undefined`; it stays collapsed by default.

- [ ] **Step 1: Write the failing tests.**
  - Inputs `{ marketPrice 1, totalSales 23, costOfPublishing 0.10, costOfDiscard 0.01, publishedJokes 8, discardedJokes 2, shipping 6, storage 1.95, hosting 1.65 }` give revenue 23 and segments shipping 6, storage 1.95, hosting 1.65, listing 0.82, profit 12.58. The amounts sum to 23.
  - **Review Focus 2:** shipping 30 with the same other inputs gives `loss` 11.42, no profit segment, and `scaleTo` 34.42.
  - The wait timeline renders "With Marketing 2:41", "On market, waiting for a buyer 0:52" and "about 3:33".
  - The timeline is hidden when both averages are 0.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §4.4:
  - Colours come from the tokens, and every segment shows a text amount in the legend.
  - Read fees through `leanFeesOf(teamSummary.lean)`.
  - Hovering a segment shows "{name} ${amount}, {pct}% of sales".
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(ui): fees and wait times, matching the backend's lean profit`.

### Task A9: Shared tour captions

**Files:**
- Modify: `services/tour/tourSteps.ts` (`jm-scoreboard`, `mk-scoreboard`, `mk-fees`), `services/tour/demoUi.ts` and `demoScript.ts` ("More numbers" → "Fees and wait times")
- Test: `services/tour/tourSteps.test.ts`, `components/tour/DemoStage.test.ts`

- [ ] **Step 1: Write the failing test.** The `jm-scoreboard` body mentions "Team rank, by profit" and "Fees and wait times", and no step body contains "More numbers" or "Jokes Sold / Made".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Rewrite those captions in the copy rules.
- [ ] **Step 4:** Run the tour suites. Expected: PASS, including the target test. Then the gate.
- [ ] **Step 5: Commit**, then open **PR 1** into `feat/lean-market`. Manually check the dev preview at 1280 and 1440 wide.

---

## Phase B: Joke Maker (PR 2)

### Task B1: Joke and batch states

**Files:**
- Create: `services/jokeState.ts`, `services/jokeState.test.ts`

**Interfaces:**
- Produces:
  - `type JokeState = 'with-marketing' | 'selling' | 'lost-buyers' | 'no-buyer' | 'not-released'`
  - `jokeState(j: Joke): JokeState`
  - `jokeDetail(j: Joke, now: number): string`
  - `batchSummary(b: Batch): string`
  - `stageCounts(batches: Batch[]): { selling: number; lostBuyers: number; noBuyer: number; notReleased: number }`

- [ ] **Step 1: Write the failing tests.**
  - PENDING → `with-marketing`.
  - PUBLISHED with `sold_count 6` → `selling`, detail "6 buyers"; with `sold_count 1`, "1 buyer".
  - **Review Focus 1:** PUBLISHED, `sold_count 0`, `first_sold_at` set → `lost-buyers`, detail "Sold before, swapped out".
  - PUBLISHED, `sold_count 0`, no `first_sold_at`, published 240 s ago → `no-buyer`, detail "No buyer yet, on market 4 min".
  - DISCARDED → `not-released`, detail "Not released by Marketing".
  - `batchSummary`: a SUBMITTED batch → "With Marketing"; a batch with 4 PUBLISHED jokes holding 12 buyers in total → "4 on market, 12 buyers".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. `jokeDetail` uses `fmtDuration` from Task A2.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(jm): joke and batch states from publish_status, sold_count and first_sold_at`.

### Task B2: Value stream

**Files:**
- Create: `components/jokeMaker/ValueStream.tsx` (`ValueStream`, `BatchRow`, `JokeCard`, `NoteCard`)
- Modify: `views/JokeMaker.tsx` (remove the old `BatchCard` and status dots; use `ValueStream`); `components/MarketingNote.tsx` (keep `marketingNoteOf`; replace the violet colour with `--navy`)
- Test: `views/studentScreens.render.test.ts`

**Interfaces:**
- Consumes: Task B1 helpers and `Joke` (Task A3).

- [ ] **Step 1: Write the failing test.** Render the Joke Maker with three batches given oldest-first, the way the context provides them (ids 5001, 5002, 5003).
  - The markup shows `B-5003` before `B-5001`.
  - The opened batch (5002, with `marketing_note: 'Shorter setups sell.'`) shows "From Marketing", the note, a `data-tour="jm-marketing-note"` element, "#1", "The Self-Starter" and "6 buyers".
  - The wrapper has `data-tour="jm-value-stream"`.
  - A batch without a note has no note card.
  - The header reads "Value stream" and "3 batches".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §5:
  - the tray background `--paper`;
  - the note card is the only raised surface, with a tail;
  - joke cards are flat tints by state;
  - Lora for joke text.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(jm): value stream with joke states and Marketing's note in the batch`.

### Task B3: Production line card

**Files:**
- Modify: `views/JokeMaker.tsx` (Production line card)
- Test: `views/studentScreens.render.test.ts`

- [ ] **Step 1: Write the failing test.**
  - In a Lean round 1 with batch size 5, the card shows `data-tour` `jm-next-step`, `jm-draft`, `jm-send` and `jm-shipping`, the brief "make exactly 5 jokes per batch", and "Shipping: $2.00 per batch of 5".
  - "Send to Marketing" is disabled with empty text.
  - In Round 2 with limit 10, the brief reads "up to 10".
- [ ] **Step 2:** Run it. Expected: FAIL on the new copy and order.
- [ ] **Step 3:** Restyle per spec §5:
  - the Next step row first in the card;
  - the paste box ruled with a background gradient that scrolls with the text;
  - the disabled button grey;
  - the shipping line under the button.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(jm): production line card`.

### Task B4: Jokes by stage and empty states

**Files:**
- Create: `components/jokeMaker/JokesByStage.tsx`
- Modify: `views/JokeMaker.tsx`
- Test: `views/studentScreens.render.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - With `unprocessed_batches: 1` and the B1 fixture, the card shows "With Marketing" "1 batch", "Selling", "Lost its buyers", "No buyer yet" and "Not released", with counts from `stageCounts`.
  - Before the first round (no summary, no batches), the value stream says "Your batches show up here once the round starts." and the scoreboard shows "—".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(jm): jokes by stage and pre-round empty states`.

### Task B5: Joke Maker tour

**Files:**
- Modify: `services/tour/tourSteps.ts` (Joke Maker captions), `services/tour/demoScript.ts` (demo jokes carry `joke_title`, `publish_status`, `published_at`, `first_sold_at`)
- Test: tour suites

- [ ] **Step 1: Write the failing test.** The demo's opened batch renders "6 buyers"-style details: assert `jokeDetail` on the demo jokes yields a non-empty detail for every published joke.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Update the demo data and captions.
- [ ] **Step 4:** Tour suites. Expected: PASS, including targets. Then the gate.
- [ ] **Step 5: Commit**, then open **PR 2**. Check the preview at 1280 and 1440 wide.

---

## Phase C: Marketing (PR 3)

### Task C1: Poll continuity and the queue count

**Files:**
- Modify: `context.tsx` (the Marketing poll, ~lines 1260–1390)
- Test: `context.marketingPoll.test.ts` (new; drive the poll function with a fake API, as `context.instructorLobby.test.ts` does)

**Interfaces:**
- Produces: `qcQueueSize: number | null` on the context, set from `queue/count` on every poll, independent of `qcQueue`.

- [ ] **Step 1: Write the failing test.** **Review Focus 5:** with a batch on the desk, run two poll ticks. Assert:
  - summary, feedback and batches are each fetched on both ticks;
  - `queue/next` is not re-fetched while the held batch is unchanged;
  - with `queue/count` 2 and `queue/next` returning `batch: null`, `qcQueueSize === 2`.
- [ ] **Step 2:** Run it. Expected: FAIL (`qcQueueSize` undefined).
- [ ] **Step 3:** Implement:
  - Replace `if (qcQueue) return;` with a ref-based check that skips only the `queue/next` call.
  - Store `queue_size` in `qcQueueSize`.
  - Keep re-fetching `queue/next` when the desk is empty or every 10 s while held, so lock changes and the round ending are still seen. Spec §7.3 "Poll continuity".
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `fix(mk): poll guard skips only queue/next; keep queue_size apart`.

### Task C2: Desk decisions

**Files:**
- Create: `services/desk.ts`, `services/desk.test.ts`
- Modify: `views/marketingRelease.ts` (`releaseOutcome`), `views/marketingRelease.test.ts`

**Interfaces:**
- Produces:
  - `moreWaiting(queueSize: number | null, hasDeskBatch: boolean): number | null`
  - `splitStatus(a: { cuts: number; remainder: string; round: 1 | 2; batchSize: number; limit: number }): { count: number; valid: boolean; message: string }`
  - `latestRelease(batches: Batch[]): { batchId: number; published: number; discarded: number; noteSent: boolean } | null`
  - `releaseOutcome` now charges `published × costOfPublishing + discarded × costOfDiscard`.

- [ ] **Step 1: Write the failing tests.**
  - `moreWaiting`: `(2, true)` → 1; `(1, true)` → 0; `(2, false)` → 2; `(null, false)` → null.
  - `splitStatus`, **Review Focus 3**, Round 1 with `batchSize 5`:
    - `{ cuts 0, remainder 'x' }` → "Split at least one joke first.", invalid;
    - `{ cuts 3, remainder 'x' }` → "Split the remaining text to finish.", invalid;
    - `{ cuts 4, remainder '' }` → "Round 1 needs exactly 5 jokes; you have 4.", invalid;
    - `{ cuts 5, remainder '' }` → "All split. Check the jokes, then confirm.", valid.
  - `splitStatus`, Round 2 with limit 10: `{ cuts 11, remainder '' }` → "Round 2 allows up to 10; you have 11.", invalid.
  - `latestRelease` picks the batch with the largest `ratedAt`, not the largest id.
  - `releaseOutcome` with 3 published and 2 discarded at $0.10 / $0.01 → cost 0.32.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(mk): desk decisions; release cost includes discards`.

### Task C3: Desk card and split stage

**Files:**
- Modify: `views/QualityControl.tsx` (desk header, batch bar, `BatchSplitter`)
- Test: `views/studentScreens.render.test.ts`

- [ ] **Step 1: Write the failing test.**
  - With `qcQueueSize 2` and a batch `B-5004` submitted 72 s ago, the markup shows "1 more waiting", "B-5004", "waiting 1:12", "Split", "Choose", "Release", the keycap "Enter", and `data-tour="mk-desk"` and `mk-next-step`.
  - With four cut pieces in Round 1, the status reads "Round 1 needs exactly 5 jokes; you have 4." and "Confirm, next" is disabled.
  - A null `submitted_at` omits the time.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Restyle per spec §6:
  - The counter counts cut pieces only.
  - Confirm uses `splitStatus().valid`.
  - The splitting behaviour is otherwise unchanged.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(mk): desk card and validated split stage`.

### Task C4: Choose stage and release

**Files:**
- Modify: `views/QualityControl.tsx` (choose list, topic as `<select>`, footer)
- Test: `views/studentScreens.render.test.ts`

- [ ] **Step 1: Write the failing test.** With 5 jokes, 3 selected:
  - the selected cards have `aria-checked="true"` checkboxes and a "Deselect" button;
  - a selected card without topic or title shows "Needs a topic and a title";
  - the others show "Discard";
  - the footer shows "Selling 3, discarding 2, costs $0.32";
  - `data-tour` `mk-jokes`, `mk-topic-title`, `mk-note` and `mk-release` are present;
  - the topic is a `<select>` whose options are the 15 categories.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6:
  - selected cards: navy tint, 1.5 px navy border, filled checkbox;
  - unselected: dashed outline;
  - release rules and the Round 2 discard path unchanged.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(mk): choose stage with clear selected state`.

### Task C5: Desk clear

**Files:**
- Modify: `views/QualityControl.tsx`
- Test: `views/studentScreens.render.test.ts`

- [ ] **Step 1: Write the failing test.**
  - With no desk batch and a released batch 5004 (3 published, 2 discarded, with a note), the markup shows "Desk is clear" and "Last release, B-5004" "3 to market, 2 discarded, note sent", and no "All Clear!".
  - With the round ENDED, it shows "Round over. Nothing more to release."
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement with `latestRelease`.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(mk): desk clear with last release`.

### Task C6: Feedback card and criteria list

**Files:**
- Modify: `components/CustomerFeedbackCard.tsx`, `components/FeedbackCard.tsx`; `views/QualityControl.tsx` (replace the 12-criteria chip card with the static list)
- Test: `components/CustomerFeedbackCard.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Two rows render "Your latest 2 released jokes", the tags "Has a buyer" / "No buyer now", and Landed and Missed chips.
  - A row with empty good and improve lists shows "No customer read on this one yet."
  - The criteria list shows 11 names, then "Title Fit" with "set by the title you write", and no "×" tallies.
  - `data-tour` `mk-feedback` and `mk-expand` are present.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(mk): feedback card and criteria list`.

### Task C7: Pop-out matrix

**Files:**
- Create: `services/feedbackJokeContext.ts` (+ test), `components/FeedbackMatrix.tsx`
- Modify: `components/PopOutPanel.tsx` (`POP_OUT_WIDTH = 840`, `POP_OUT_HEIGHT = 820`; fallback panel `min(840px, 100vw - 48px)` × `min(820px, 100vh - 48px)`, draggable by its title bar and kept fully on screen); `components/CustomerFeedbackCard.tsx` (pop-out content)
- Test: `components/PopOutPanel.test.ts`, `components/FeedbackMatrix.test.ts`

**Interfaces:**
- Produces: `feedbackJokeContext(rows: FeedbackRow[], batches: Batch[]): Array<FeedbackRow & { batchId: number | null; position: number | null; text: string | null; releasedAt: number | null; soldCount: number | null }>`

- [ ] **Step 1: Write the failing tests.**
  - The join fills `batchId`, `position` (1-based index in the batch's `jokes`), `text`, `releasedAt` and `soldCount`.
  - A joke missing from `batches` keeps its title and gets nulls.
  - The matrix renders the column header "B-5002 #1" with the title, the groups "Fix next" and "Keep doing", "Energy" "×3" with three ✕ cells, and "No word yet: Humor Style, Complexity.".
  - An unread joke's column is all "·" and doesn't change "No word yet".
  - Each key row has a `<details>` containing the joke text.
  - `POP_OUT_WIDTH === 840` and `POP_OUT_HEIGHT === 820`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6 (pop-out). Clicking a header opens its key row; hover highlights the column and the key row together.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(mk): feedback matrix pop-out with joke key`.

### Task C8: Marketing tour

**Files:**
- Modify: `services/tour/tourSteps.ts` (Marketing captions: topic dropdown, pop-out), demo data
- Test: tour suites

- [ ] **Step 1: Write the failing test.** The `mk-title` body says "topic" and "title" without "chips"; the `mk-expand` body mentions the window and "Fix next".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Update the copy and demo data.
- [ ] **Step 4:** Tour suites. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit**, then open **PR 3**. Check the preview, including the pop-out in Chrome (Document PiP) and Safari (fallback).

---

## Phase D: Instructor (PR 4)

### Task D1: Backend `GET /v1/instructor/rounds/:round_id/config`

**Files** (in `jokefactory_be`, branch `feat/instructor-config-read`):
- Modify: `src/app/http/handler/instructor.go` (add `GetConfig`, the body given in spec §8), `src/app/server/server.go` (route after line 157)
- Create: `src/app/server/instructor_config_read_routes_test.go`

- [ ] **Step 1: Write the failing route tests** (model: `customers_per_team_routes_test.go` 20–103, the `feesRequest` helper):
  - GET `/v1/instructor/rounds/1/config` → 200, `data.round.id == 1`, no `ideal_profile` key.
  - POST config with `testutil.ValidIdealProfile()`, then GET → the same map.
  - GET `/rounds/99/config` → 404 `NOT_FOUND`.
  - GET `/rounds/abc/config` → 400.
  - GET with no `X-User-Id` → 401.
- [ ] **Step 2:** `go test ./src/app/server/ -run InstructorConfigRead`. Expected: FAIL (404 route).
- [ ] **Step 3:** Add the handler and the route.
- [ ] **Step 4:** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(instructor): read back round config and ideal profile`, then open a backend PR. Deploy it before PR 4 merges.

### Task D2: Read the ideal joke back

**Files:**
- Modify: `services/instructorService.ts` (add `getRoundConfig`), `context.tsx` (replace "defaults after reload", ~line 582), `services/mockApi.ts` (serve the GET)
- Test: `services/instructorService.test.ts` (new or existing), `views/Instructor.render.test.ts`

**Interfaces:**
- Produces: `getRoundConfig(roundId: number): Promise<{ round: ApiInstructorRound }>`, where `ApiInstructorRound` = `PublicRound` & `{ ideal_profile?: Record<string, string>; buy_threshold: number; jitter: number; swap_margin: number; feedback_pass_threshold: number; preference_base: number }`.

- [ ] **Step 1: Write the failing tests.**
  - `getRoundConfig(7)` calls `GET /v1/instructor/rounds/7/config`.
  - After mount, the picker shows the stored `TOPIC: 'Animals'`, not the default `'Work'`.
  - An absent `ideal_profile` falls back to `DEFAULT_IDEAL_PROFILE`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Call it on mount and when the viewed round changes.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): show the stored ideal joke after reload`.

### Task D3: Control bar and the viewed round

**Files:**
- Create: `components/instructor/ControlBar.tsx`, `services/instructorPhase.ts` (+ test)
- Modify: `views/Instructor.tsx` (remove the old top-controls row; add `viewRound` state, independent of `config.round`)
- Test: `views/Instructor.render.test.ts`

**Interfaces:**
- Produces:
  - `instructorPhase(statuses): 'lobby' | 'r1-running' | 'between' | 'r2-running' | 'over'`
  - `defaultTab(phase): 'teams' | 'live' | 'debrief'`
  - `phaseAction(phase): 'start-r1' | 'end-r1' | 'start-r2' | 'end-r2' | 'debrief'`

- [ ] **Step 1: Write the failing tests.**
  - Phase mapping: both CONFIGURED → `lobby`; R1 ACTIVE → `r1-running`; R1 ENDED and R2 CONFIGURED → `between`; R2 ACTIVE → `r2-running`; both ENDED → `over`.
  - `defaultTab`: lobby → `teams`; `between` → `live`; `over` → `debrief`.
  - Render, phase `between`: the status sentence, the "Show students their teammates" switch, "Start Round 2", and no "Resume".
  - Clicking the Round 1 segment changes the viewed round only; Start still targets Round 2.
  - The arrival window 900 s renders "Customers stop arriving at 15:00".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6b. End Round uses a confirm modal for both rounds.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): control bar; round control views, never retargets`.

### Task D4: Tabs and the Instructor split

**Files:**
- Create: `components/instructor/LiveTab.tsx`, `TeamsTab.tsx`, `SetupTab.tsx`, `DebriefTab.tsx`
- Modify: `views/Instructor.tsx` (becomes the header, control bar and tab switch; move each existing section into its tab unchanged, then restyle in D5–D9)
- Test: `views/Instructor.render.test.ts`, `views/Instructor.leaderboard.render.test.ts` (update imports only)

- [ ] **Step 1: Write the failing test.** The page renders four tabs (Live, Teams, Setup, Debrief), and the default tab follows `defaultTab`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Move code, with no behaviour changes. Existing instructor render tests pass after an import-path change only.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `refactor(instructor): split the screen into four tabs`.

### Task D5: Live tab: totals, leaderboard, market

**Files:**
- Create: `services/classTotals.ts` (+ test)
- Modify: `components/instructor/LiveTab.tsx`, `index.css` (gold row fade replaces `jf-leaderboard-rankup`)
- Test: `views/Instructor.leaderboard.render.test.ts`

**Interfaces:**
- Produces: `type LeaderboardRow = ApiInstructorStatsResponse['leaderboard'][number]` (exported from `services/classTotals.ts`); `classTotals(rows: LeaderboardRow[], lean: boolean): { sales: number; profit: number; best: number | null; worst: number | null; released: number; neverSold: number | null; fees: number | null }`

- [ ] **Step 1: Write the failing tests.**
  - `classTotals` over two Lean rows sums sales, profit and fees, and computes never-sold via `neverSold()`.
  - A Classic round gives `neverSold: null` and `fees: null`.
  - The leaderboard has the columns "#, Team, Profit, Sales, Released, Discarded, Never sold, Fees, Sent to released, To first sale"; a Classic round drops the last four.
  - A team that moved up shows "↑".
  - Live market: items sort by `sold_count` descending, show the top 5 and "Show all {n}", label "buyers"; before start it says "Market opens when the round starts."
  - "Present" opens the full-screen board.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6b.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): live totals, leaderboard and market`.

### Task D6: Lean charts and idle rows

**Files:**
- Create: `services/idleRows.ts` (+ test), `components/leanCharts/IdleRows.tsx`
- Modify: `components/leanCharts/LeanChartsPanel.tsx` (use `IdleRows` instead of `IdleJokesChart`'s single-team view; restyle the other three; Classic notice), `components/instructor/LiveTab.tsx` (delete the Classic chart cards: Cumulative Sales, Batch Sequence vs Quality, Wasted Jokes, Scatter Plots, Unrated Jokes)
- Test: `services/leanCharts.test.ts`, the LeanChartsPanel render test

**Interfaces:**
- Produces: `idleRows(charts: LeanChartsResponse)` (type from `types/api.ts`): Array<{ teamId: number; teamName: string; waiting: number; shelf: number; total: number; aboveAverage: boolean; series: Array<{ t: number; waiting: number; shelf: number }>; avgSeries: Array<{ t: number; total: number }> }>`. It's sorted by `total` descending, then team name; the latest sample counts as "now"; the average comes from `class_average.idle`.

- [ ] **Step 1: Write the failing tests.**
  - Ordering and `aboveAverage` on a three-team fixture.
  - A team with an empty `idle` array gets zeros and sorts last.
  - The panel renders "Right now" and "Over the round" and one row per team, and has no team `<select>`.
  - A Classic round renders "Lean charts appear in Lean rounds.".
  - The smaller-batches chart shows the Round 1 note until Round 2 data exists.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6b:
  - The trend is a light stacked area with no dark stroke.
  - Clicking a row expands the team chart.
  - Keep the 10 s lean-charts poll.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): idle rows for every team; Classic charts removed`.

### Task D7: Teams tab

**Files:**
- Modify: `components/instructor/TeamsTab.tsx`, `context.tsx` (add `swapTeamRoles`)
- Test: `context.instructorLobby.test.ts` (extend), `views/Instructor.render.test.ts`

**Interfaces:**
- Produces: `swapTeamRoles(teamId: number): Promise<void>`. It sends two `PATCH …/users/:uid` with `{ status: 'ASSIGNED', role }`, adopts the second response as the lobby, and reverts the first if the second fails.

- [ ] **Step 1: Write the failing tests.**
  - The swap sends two PATCHes with the roles flipped and no `QC`.
  - When the second PATCH fails, a third PATCH restores the first pair's role.
  - The lobby strip shows "Lobby: 4 pairs waiting" and "Auto-assign 3 teams" with `Waiting 4`, `Assigned 2` (floor((4 + 2) / 2)).
  - When teams exist, Auto-assign asks "This reshuffles every team.".
  - Empty teams are not rendered, and no "ID:" appears.
  - Remove uses the modal, not `window.confirm`.
  - Dropping a pair into the Marketing slot PATCHes `role: 'MARKETING'`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6b and §7.4.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): team slots, safe role swap, honest auto-assign`.

### Task D8: Setup tab

**Files:**
- Modify: `components/instructor/SetupTab.tsx`, `components/FeeConfigFields.tsx` (labels above the three shipping inputs), `services/roundConfig.ts`; remove the nudge inputs and their `GameConfig` UI wiring from the instructor screen. The student-side 60/45 defaults stay.
- Test: `components/FeeConfigFields.test.ts`, `services/roundConfig.test.ts`, `views/Instructor.render.test.ts`

**Interfaces:**
- Produces: `arrivalSecondsFromMinutes(min: number): number`, which returns `Math.round(min * 60)`.

- [ ] **Step 1: Write the failing tests.**
  - `arrivalSecondsFromMinutes(15)` → 900; `(1.5)` → 90; `(0.0167)` → 1 (an integer).
  - The Setup tab shows the groups "Round timing", "Market", "Costs" and "Batches", with no "nudge" text.
  - "Rounds don't end on their own." appears.
  - Changing one field shows "1 unsaved change." and enables Apply.
  - While a round is ACTIVE, the lock banner shows and the ideal joke's "Use defaults" is hidden.
  - The picker's option values equal the backend strings (`config/dimensions.backend-parity.test.ts` stays green).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6b.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): setup tab; arrival in minutes; nudge settings removed`.

### Task D9: Debrief tab

**Files:**
- Modify: `components/instructor/DebriefTab.tsx`, `components/LeanDebrief.tsx`
- Test: `components/LeanDebrief.render.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Rows sort by Round 2 profit.
  - The change column shows "+$10.99" in green and a negative change in warn.
  - A Classic round's lean columns show "–".
  - Before Round 2 starts it shows "Available once Round 2 has started".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit:** `feat(instructor): round 1 vs round 2 debrief`.

### Task D10: "How this works" tutorial

**Files:**
- Modify: `components/Tutorial.tsx`
- Test: `components/Tutorial.test.ts`

- [ ] **Step 1: Write the failing test.** The instructor steps mention "Live", "Teams", "Setup" and "Debrief", and no step contains "τ", "jitter" or "swap margin".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Rewrite the instructor steps in the copy rules.
- [ ] **Step 4:** Run it. Expected: PASS. Then the gate.
- [ ] **Step 5: Commit**, then open **PR 4** after the backend PR is deployed. Check the preview: every phase, Present at 1440, a Classic round, and a 20-team class with `?bots=1`.
