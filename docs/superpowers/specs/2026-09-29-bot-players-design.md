# Bot Players — Design

**Date:** 2026-09-29
**Status:** Approved in brainstorming, pending spec review
**Scope:** Frontend only. No backend change, no backend deploy.

## Problem

Testing a round properly needs many teams playing at once — queue contention, a
populated leaderboard, market competition. Assembling 12 real student pairs to
test is not feasible. The instructor needs to run a full-size class alone, and to
see what each seat is doing rather than trusting a status line.

## Goals

1. **All-bot class, one click.** The instructor starts a full class of bot teams
   and watches from the normal instructor dashboard.
2. **Bot teams alongside human teams.** Humans join the usual way; bots fill the
   class up to a target team count. Every team is either all-human or all-bot —
   never mixed.
3. **Watch any bot seat.** Open the real Joke Maker or Marketing screen of any bot,
   live, with the bot's reasoning shown beside it.
4. **Answer the Lean waste question.** Bots play distinct strategies, so the
   leaderboard shows whether publishing less ever beats publishing more under the
   current cost structure.

## Non-goals

Adaptive or quality-aware bots; LLM-generated jokes; taking over a bot's seat;
a CLI runner; human and bot on the same team; any backend change. The persona
interface and the watch channel are shaped so the first three can be added later
without rework.

---

## 1. User-facing behaviour

### The Bot Panel

Rendered inside the instructor view **only when the page URL carries `?bots=1`**.
This is a test tool on the production deployment; it must not be one misclick
away during a real class.

| Control | Behaviour |
|---|---|
| **Run all-bot class** | Creates bot pairs, forms teams, starts the current round with the instructor's existing config, bots begin playing. Enabled only when the lobby has no non-bot participants and no round is `ACTIVE`. |
| **Fill with bot teams** | Adds the chosen number of bot teams after the human teams. Humans keep the low-numbered teams. |
| Bot teams | How many **bot** teams to create, 1–12. Total teams = human teams + bot teams. |
| Persona mix | Count of Careful / Balanced / Spray teams; defaults to an even split. |
| Speed | 1× (default) / 3× / 10×, changeable mid-round. |
| **Stop** | Halts every bot actor. Bot users remain. |
| **Remove bots** | Stops bots, then deletes each bot user. Never touches humans. |
| **Re-form teams** | Shown when bots detect their teams were scrambled (see §4). |

A live row per bot team shows: team number, persona, each seat's current activity,
batches published this round, and the last error if any. Each row has
**👁 JM** and **👁 Marketing** buttons (§5).

A running **classification calls** counter shows how many published jokes the
bots have sent to the Azure LLM this round.

### Bot identity

Bots join with deterministic display names: `🤖 Bot 03A` (Joke Maker) and
`🤖 Bot 03B` (Marketing), where `03` is the bot team's index. Because the name
itself carries the marker, every existing screen — lobby, leaderboard, team
names — shows bots as bots with no component changes.

Join is idempotent by display name, so re-running reuses the same bot users.

*Verify during implementation:* that the backend and `normalizeTeamName` accept
the emoji. If not, fall back to `[BOT] 03A`. Either way the prefix is the single
source of truth for "is this user a bot".

---

## 2. Architecture

Architecture A from brainstorming: a framework-free bot engine running in a Web
Worker inside the instructor's tab, driving the real HTTP API.

| Unit | Responsibility | Depends on |
|---|---|---|
| `services/bots/personas.ts` | Pure decisions: submit interval, how many to publish, which ones, whether to wait for feedback | — |
| `services/bots/placement.ts` | Pure: lobby snapshot → deterministic team layout → list of `PATCH` calls | — |
| `services/bots/engine.ts` | One async actor per bot seat; staged pacing; error isolation; emits status and reasoning events | personas, placement, transport |
| `services/bots/worker.ts` | Web Worker host: `start` / `stop` / `setSpeed` / `remove` messages in; status out; reasoning to `BroadcastChannel` | engine |
| `services/bots/protocol.ts` | Shared message types for the worker and the channel | — |
| `components/BotPanel.tsx` | The panel UI | worker, protocol |

**Shared transport and corpus (targeted cleanup).** `scripts/e2e/harness/client.ts`
(per-actor HTTP client, verified to have no Node-only imports) and
`scripts/e2e/fixtures/jokes.ts` (the 60-joke corpus, also portable) move to
`services/shared/`. The e2e suite and the bot engine then import one copy rather
than two that drift. Because the corpus is only imported by the worker, Vite
splits it out of the main bundle.

**Instructor authority** comes from the already-logged-in instructor user id —
instructor-ness is a property of the user row, so no password is needed.

**The only edits to existing app files** are: one import and one render line in
`views/Instructor.tsx`; the watch-mode identity override in
`services/apiClient.ts` and `context.tsx` (§5); and a `readOnly` flag honoured by
`views/JokeMaker.tsx` and `views/QualityControl.tsx`.

---

## 3. How a bot team plays

### Joke Maker seat

Every `interval ÷ speed`, jittered ±25% so bots do not move in lockstep:

1. Draw `batch_size` jokes from the corpus. Each bot team draws **with
   replacement** from its own seeded shuffle, so the pool never runs out. Every
   persona draws from the same pool, which keeps the strategy comparison fair.
2. Submit them as a `raw_text` blob separated by blank lines.

Round 1 requires the split to equal `batch_size` exactly, so bots always submit
exactly `batch_size` jokes.

### Marketing seat

Poll `queue/next` (which is also the claim). On receiving a batch, act in stages,
dwelling between each so the watched screen shows every state:

| Stage | Dwell at 1× |
|---|---|
| claimed → split | 10s |
| split → decide | 15s |
| decide → publish | 10s |

Dwells divide by speed and carry ±25% jitter. **Split** cuts at the blank-line
boundaries. **Decide** applies the persona's publish count, choosing *which*
jokes by seeded random. **Publish** sends topic and title from the corpus
fixture for each joke.

### Personas

Personas differ in **volume and pace, not selection quality.** Bots cannot see
fit — it is never served to any client — and the corpus carries no structured
dimension tags. This is deliberate, and it bounds what the feature can answer:
*"under the current cost structure, does publishing less ever beat publishing
more?"* It cannot answer whether *well-chosen* jokes beat *more* jokes; that needs
a quality-aware persona, for which the interface leaves room.

| Persona | JM interval at 1× | Publishes | Extra rule |
|---|---|---|---|
| Careful | 150s | 2 of 5 | Waits until its previous batch has feedback, or `180s ÷ speed`, before submitting again |
| Balanced | 90s | 3 or 4 of 5, chosen per batch by the team's seeded random | — |
| Spray | 45s | 5 of 5 | — |

All three satisfy round 1's "at least one published" rule.

### Lifecycle

Bots idle while no round is `ACTIVE` and resume if one becomes active. `Stop`
halts actors immediately. Each bot team is capped at **8 batches per round** to
bound LLM cost.

---

## 4. Team formation

`POST .../assign` **randomly shuffles** every `WAITING` *and* `ASSIGNED`
participant (`usecase/instructor.go`, `loadAssignableParticipants`). Left to
itself it would put bots and humans on the same teams. So whenever bots exist,
the panel owns team formation:

1. Call `assign` once with the total team count. This creates the teams and their
   round state.
2. Read the lobby back.
3. `placement.ts` computes a deterministic layout: humans on teams `1…k`, bots on
   `k+1…n`. Humans are paired in the order `assign` returned them, and each keeps
   the role `assign` gave it **unless** that would put two Joke Makers (or two
   Marketers) on one team — in which case the second human of the pair takes the
   other role. The shuffle makes such collisions routine, so this is the normal
   path, not an edge case.
4. Re-pin every user whose placement differs, via
   `PATCH /instructor/rounds/{id}/users/{userId}` with `status`, `role` and
   `team_id`.

**Scramble detection.** Bot actors read their own assignment on each poll. If the
instructor presses the ordinary Auto-Assign while bots exist, bots notice their
team or role moved, the panel shows **Re-form teams**, and bots pause until it
runs.

**Odd number of humans.** One human is left without a partner. The panel flags it
and does not silently pair them with a bot, since mixed teams are out of scope.

---

## 5. Watch mode

Each bot row's **👁 JM** / **👁 Marketing** button opens a new tab at
`/?watch=<botUserId>`, rendering the real Joke Maker or Marketing view as that bot.

### Per-tab identity — the critical constraint

Identity lives in `localStorage` (`apiClient.ts`, `context.tsx`), which every tab
on the site shares. A watch tab that wrote the bot's id there would log the
instructor out of every other tab.

In watch mode, therefore:

- The bot's user id is held in **`sessionStorage`** (per-tab). Both identity reads
  prefer it over `localStorage`.
- **Nothing writes or clears `localStorage`.** This includes the automatic
  `logout()` that `context.tsx` runs on a `404` from `/session/me` — otherwise
  removing a bot while watching it would wipe the instructor's session.
- The tutorial modal is suppressed without writing its seen-flags.

### Read-only, enforced twice

- A banner: `👁 WATCHING 🤖 Bot 03B · Marketing · Team 3 · Careful · read-only`.
- Every action control is disabled via a `readOnly` flag.
- **Defence in depth:** in watch mode `apiClient` refuses any non-`GET` request.
  Disabled buttons are a UX guarantee; this is the safety guarantee.

`queue/next` is a `GET` that also takes the claim lock, but the watch tab polls as
the *same* user the bot is, so it re-reads the lock the bot already holds.

### The reasoning strip

The UI can only show server state: a batch arriving, cards splitting, a publish
landing. It cannot show *why* the bot kept two jokes and dropped three, because
that choice is not server state until publish. So the engine publishes a narrated
log per bot over `BroadcastChannel('jf-bots')`, e.g.
`Careful: keeping 2 of 5 — "Uncrackable", "Just In Time"`. The watch tab renders
the entries for its bot beside the real screen.

The engine keeps the last 50 entries per bot and replays them when a watch tab
opens, so a late-opened tab has history.

### Honest limits

- Changes appear on the next poll (~2.5s), not as animated clicks — bots act
  through the API. Literal clicking already exists for one team:
  `npm run e2e:browser:headed`.
- Bots that drive the real UI in hidden iframes were considered and rejected:
  24 full app instances is heavy, and DOM-driving proved fragile (the splitter's
  caret race).

---

## 6. Safety, cost and cleanup

- **No reset path.** The bot engine has no code path to `/v1/admin/reset`.
- **Remove bots** deletes bot users individually via
  `DELETE /instructor/rounds/{id}/users/{userId}`. It identifies bots from the
  engine's registry of created ids, falling back to a lobby scan by name prefix if
  the tab was reloaded.
- **LLM cost.** Every published joke is one Azure classification call. Bounded by
  at most 12 bot teams × 8 batches × 5 jokes per round, and shown live on the
  counter.
- **Closing the tab stops the bots.** Documented, not hidden; it doubles as a kill
  switch. Bot users persist until removed or reset.

## 7. Error handling

- **Per-bot isolation**, as in the e2e harness: a failing actor marks its row
  errored with the real message and retries with exponential backoff; other bots
  keep playing.
- `409 ROUND_NOT_ACTIVE` means "idle", not an error.
- A `404` for a bot's own user means it was removed; that actor stops cleanly.

## 8. Testing

| Layer | What |
|---|---|
| `placement.test.ts` | Layout for 0/1/odd/even humans; re-pin list is minimal; idempotent. |
| `personas.test.ts` | Publish counts per round; round-1 rule never violated; Careful's feedback wait. |
| `engine.test.ts` | Against an in-memory fake client with fake timers: start, stop, speed change, per-bot error isolation, batch cap, scramble detection. |
| `apiClient` watch-mode tests | Identity from `sessionStorage`; non-`GET` refused; `localStorage` untouched, including on logout. |
| Playwright `bots.spec.ts` | Instructor with `?bots=1` → **Run all-bot class** at 10× → teams formed, batches flow, sales happen. Open a watch tab → banner shown, controls disabled, reasoning entries arrive, **and the instructor tab is still logged in.** |

## 9. Delivery in two phases

The feature splits cleanly, and each phase is independently useful:

- **Phase 1 — Bots.** Shared transport move, personas, placement, engine, worker,
  Bot Panel, and the all-bot / fill-with-bots flows. Delivers goals 1, 2 and 4.
- **Phase 2 — Watch mode.** Per-tab identity, read-only enforcement, and the
  reasoning strip. Delivers goal 3. It depends on Phase 1's `BroadcastChannel`
  events, but Phase 1 does not depend on it.

Phase 1 ships first; the engine emits reasoning events from the start so Phase 2
adds only a consumer.

## 10. Verify first

**Background-tab throttling.** Opening a watch tab puts the instructor tab — where
the bots run — into the background, which is exactly when browsers throttle
timers. The Web Worker is expected to avoid the worst of it; this is the first
implementation task, measured over a 10-minute hidden-tab run. If bots cannot
keep pace, the fallback is a dedicated bot-host window kept visible, documented
in the panel — not keep-alive hacks.

## 11. Assumptions to confirm at spec review

- Bots reuse the 60-joke corpus with replacement rather than expanding it.
- Default target: 12 bot teams, evenly split across the three personas.
- Pacing and dwell numbers in §3 are starting values, expected to be tuned by eye.
