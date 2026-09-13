# Marketing: drop ranking, add a decision timer

Date: 2026-09-12
Status: Approved, not yet implemented
Area: `views/QualityControl.tsx`, `views/Instructor.tsx`, `types.ts`, `context.tsx`, new `services/marketingNudge.ts`

## Problem

Marketing currently ranks a split batch, and rank 1 is force-submitted so the game
always moves. Two things are wrong with that:

1. **Ranking has no consequence.** Nothing downstream reads the order — the AI
   customers score each joke independently against the hidden ideal. Asking students
   to rank teaches them a signal that does not exist.
2. **The forced rank-1 submit removes the decision.** The interesting choice is
   *which joke is worth the publishing cost*, and today that choice is made for them.

Replace the forced submit with time pressure: Marketing chooses freely, but a
deliberation timer nudges them toward shipping.

## Scope

In scope: the Marketing selection view, the nudge state machine, two instructor
settings. Out of scope: the splitting step (unchanged), the AI customer engine,
the backend round config (front-end `GameConfig` only this pass).

---

## 1. Ranking removal

Ranking is **commented out, not deleted** — marked `// TEMP (ranking disabled):` so
it can be restored without archaeology.

Disabled:

- The `idx === 0` clause in `submittingIds`, which becomes
  `orderIds.filter(id => selectedIds.has(id))` — selection is now the only input.
- The `if (orderIds[0] === id) return;` guard in `toggle()`, so every card is
  freely selectable and deselectable.
- The "Rank 1 — always submits / drag another card to the top to change" banner.
- The "Unranked" placeholder block on non-rank-1 cards.
- The `picks` string in the release toast: `"Rank 1 + 2 selected"` becomes
  `"3 selected"`.

Kept, unchanged in behaviour:

- Drag-to-reorder (`onDragOver` / `dragIdx` / `endDrag`).
- The ↑/↓ `move()` buttons.

Restyled: the rank badge becomes a small muted position chip — roughly an 18px
circle showing only the number, no "RANK" label, at the card's left edge. It reads
as a count, not a verdict. Order still matters for exactly one thing: it decides
which joke the nudges treat as "your top joke".

`canRelease` keeps its current shape — at least one joke selected, and every
selected joke has a Topic (plus custom text if `other`) and a non-empty title.

## 2. Instruction line

Replace:

> Rank the cards (best on top) · Rank 1 always ships · click others to add · assign Topic + title · release

with:

> Pick at least one joke to sell · assign a Topic + title to each · release · drag to reorder

## 3. Nudge state machine

New module `services/marketingNudge.ts` — a pure state machine, no React, with
`services/marketingNudge.test.ts` beside it using vitest fake timers. This matches
how `economics.ts` and `aiCustomerDemo.ts` are already structured, and timer logic
is too tedious to verify by hand.

States:

```
waiting --(nudge1Seconds)--> NUDGE_1 --(dismiss)--> settling
settling --(nudge2Seconds)--> NUDGE_2 --(dismiss or publish)--> silent
```

- The clock starts when the selection view **first appears for a batch** — split
  complete, `incomingJokes.length > 0`. Keyed on the existing `queueSig`, so a new
  batch (or a re-split of the current one) restarts it clean.
- **No countdown is shown to the user.** The pressure is felt, not displayed.
- Releasing at any point moves straight to `silent`; a pending nudge never fires.
- Once `silent`, this batch is never nudged again.

Defaults: 60s to the first nudge, then 45s more to the second.

## 4. Popup 1 — first nudge

Fires at `marketingNudge1Seconds`.

> ### Time to ship something
> You've been deliberating a while. We've selected your top joke to get you
> started — change it if you disagree.
>
> `[ Keep choosing ]`

**Joke #1 (current top of order) is selected as the dialog opens**, not when it
closes — the copy is written in the past tense, so the selection has to already be
true while it is on screen. The selection is an ordinary one: fully deselectable
afterward, with no special status.

Single button. Dismissing returns them to the view with that selection in place.

## 5. Popup 2 — second nudge

Fires `marketingNudge2Seconds` after popup 1 is dismissed, only if nothing has been
released yet.

> ### Ready to publish this one?

Body: every **currently selected** joke, each with its joke text, its Topic picker
and its title field **inline in the dialog** — reusing `SIM_CONFIG.categories`,
`TOPIC_ICONS`, and the existing `setTopics` / `setOtherText` / `setTitles` handlers,
so nothing has to be filled in behind the dialog.

If nothing is selected (they deselected after popup 1), it features joke #1 and
selects it, so the dialog always has a subject.

Buttons:

- **Publish** — enabled once every featured joke has a Topic and a non-empty title.
  Calls the existing `release()` unchanged.
- **Not yet** — closes. This is the last nudge for this batch.

## 6. Instructor configuration

Two fields added to `GameConfig` in `types.ts`:

| Key | Default | Meaning |
|---|---|---|
| `marketingNudge1Seconds` | `60` | Seconds on the selection view before the first nudge |
| `marketingNudge2Seconds` | `45` | Seconds after dismissing the first nudge before the second |

Defaults live in `context.tsx`'s `initialConfig()` alongside `DEFAULT_ROUND2_BATCH_LIMIT`.

Two compact number inputs in the Instructor settings row beside "R1 Batch Size",
following the existing `localBatchSize` pattern: local state, synced from `config`
by `useEffect`, written through `updateConfig` on save, included in the dirty check.

Front-end only this pass. When the backend round config lands (REFACTOR_PLAN §3),
these map to `marketing_nudge_1_seconds` / `marketing_nudge_2_seconds` and get read
in the round-config sync the same way `cost_of_publishing` is.

## Testing

- `services/marketingNudge.test.ts` — the state machine under fake timers: first
  nudge fires at the configured time; second fires only after the first is
  dismissed; releasing cancels a pending nudge; `silent` is terminal; a new batch
  signature resets to `waiting`.
- Update existing `QualityControl` expectations that assume rank-1 is force-submitted.
- Manual: run the app as Marketing, split a batch, wait out both nudges.

## Open questions

None.
