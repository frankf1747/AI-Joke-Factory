# Team screens: Marketing notes, Marketing-only feedback, pop-out feedback — design

Status: approved in conversation 2026-10-11; this document records it.
Branches: `feat/lean-market` in both repos (frontend `AI-Joke-Factory`, backend `jokefactory_be`).

## 1. Goal

Make the two student seats work like a real team:

- Marketing reads what customers say and tells its Joke Maker what to change, batch by batch.
- The Joke Maker hears it from Marketing, not from a panel both seats share.
- Marketing can keep the customer feedback in view while it works.

The student screens also drop the two lean charts, which the students do not need.

Success means:
- a note typed in Marketing's batch box appears under that batch on the Joke Maker's screen within a few seconds;
- the Joke Maker no longer sees, or loads, customer feedback;
- Marketing can float the feedback above the game in Chrome and Edge, and pin it in the page elsewhere;
- nothing changes for the instructor or for gameplay and scoring.

## 2. Decisions (from the conversation)

| Question | Decision |
|---|---|
| Student charts | Remove "Jokes standing still" and "More cycles, more learning" from both student screens. The instructor keeps all four lean charts. |
| Who sees customer feedback | Marketing only. The Joke Maker panel is removed and the Joke Maker stops loading it. |
| Where Marketing writes | The existing "Batch feedback" textarea at the bottom of Marketing's desk. It is written when the batch is released, or discarded as a whole. There is no editing afterwards. |
| Where the Joke Maker reads | In **Value stream**, expanding a batch shows Marketing's note above the jokes. A batch that has a note shows an icon on its collapsed row. |
| Floating window | Option A. A Document Picture-in-Picture window on browsers that support it (Chrome and Edge on desktop), and a panel pinned inside the page on the others. |
| Modes | Notes and the Marketing-only feedback apply to Classic and Lean rounds alike. |

## 3. Today's code (for orientation)

- `views/QualityControl.tsx` has a textarea labelled "Batch feedback (for your team's discussion — not sent)", held in state `batchFeedback`. Its text is never sent anywhere. A code comment there records that an earlier "(sent to Joke Maker)" label was false and should be restored only once the backend stores the note.
- Release and whole-batch discard both call `POST /v1/marketing/batches/:batch_id/publish` with `{ "jokes": [ { joke_id, decision, … } ] }` (`dto.PublishRequest`).
- The Joke Maker's Value stream comes from `GET /v1/rounds/:round_id/teams/:team_id/batches`.
- `pollTeamFeedback` in `context.tsx` loads `GET …/feedback` for both team roles, and `context.teamFeedback.test.ts` pins that behaviour.
- Both team views render `StudentLeanCharts` in Lean rounds, and both render a "Customer feedback" card of `FeedbackCard`s.

## 4. Changes

### 4.1 Remove the student charts

- Remove `StudentLeanCharts` from `views/JokeMaker.tsx` and `views/QualityControl.tsx`.
- Delete `components/leanCharts/StudentLeanCharts.tsx` and its test.
- Delete the transforms that only it used (`cyclesForStudent`, `leanRound1Id`) and their tests.
- Keep the backend team chart route (`GET /v1/rounds/:round_id/teams/:team_id/lean-charts`). It is unused but harmless, and is ready if student charts return.
- The instructor's four charts are unchanged.
- In `docs/lean-market-mode.md`, remove the student-chart descriptions.

### 4.2 Customer feedback is Marketing-only

- Remove the "Customer feedback" card from `views/JokeMaker.tsx`.
- In `pollTeamFeedback`, load feedback only for the Marketing role (`QUALITY_CONTROL`). The Joke Maker makes no feedback requests.
- Update `context.teamFeedback.test.ts` to assert: Marketing loads feedback, the Joke Maker does not, and other roles do not.
- The backend feedback route keeps its access rules; this is a screen change.

### 4.3 Marketing's note to the Joke Maker

**Backend**
- Migration `0004_batch_marketing_note.sql`: `ALTER TABLE batches ADD COLUMN marketing_note TEXT NULL;`. Existing rows stay NULL.
- `dto.PublishRequest` gains an optional field: `Note *string \`json:"note"\``.
- The publish use case:
  - trims the note;
  - stores NULL when the trimmed note is empty or the field is absent;
  - rejects a note longer than **500 characters**, counted in runes after trimming, with a 400 validation error (`note`: "must be at most 500 characters");
  - writes the note in the same transaction that processes the batch.
- The note applies to both a release and a whole-batch discard, since both use the publish call.
- The team batch list (`GET /v1/rounds/:round_id/teams/:team_id/batches`) returns `marketing_note` (string or null) on each batch.
- The in-memory test store (`testutil`) supports the field.

**Marketing screen** (`views/QualityControl.tsx`)
- Relabel the box **"Note to your Joke Maker"**, with the helper text "(sent with this batch)".
- Placeholder: "What should they change next? What did customers like?"
- Show a counter `n/500`, and stop input at 500.
- Release and Discard send `note: batchFeedback` with the decisions. The box clears after success.
- The success toast adds " · note sent" when a note went with the batch.
- Replace the stale code comment with one describing the real behaviour.

**Joke Maker screen** (`views/JokeMaker.tsx`, Value stream)
- A collapsed batch row whose batch has a non-empty `marketing_note` shows a small speech-bubble icon (lucide `MessageSquare`) with the tooltip "Marketing left a note".
- Expanding the batch shows a callout above the jokes:
  - heading **"From Marketing"**;
  - the note text, preserving line breaks, with no HTML interpretation;
  - a light violet tint, the Marketing colour (`#7c3aed` family).
- Batches without a note look exactly as today.
- The note arrives through the existing batch-list poll. There is no new request.

**Bots**
- Bot personas send no note, so the request is unchanged for them.
- The plan includes a manual browser check that types a note on a test batch.

### 4.4 Floating customer feedback for Marketing

- The "Customer feedback" card on Marketing's screen gains a **"Pop out"** button (lucide `PictureInPicture2`) in the card header.
- **When the browser supports it** (`'documentPictureInPicture' in window`):
  - The button calls `documentPictureInPicture.requestWindow({ width: 360, height: 520 })`.
  - The app copies the page's stylesheets and `<style>` elements into the new window. The app uses the Tailwind CDN, whose generated `<style>` tag must be copied and kept in sync. A `MutationObserver` on the main `<head>` re-copies style changes.
  - It renders the same feedback list into the window's body through a React portal, so it updates live from the same state.
  - The window title is "Customer feedback".
  - Closing the window, or the game tab, unmounts the portal. The button then reads "Pop out" again.
  - The window stays on top of other windows until closed. Students keep using the game page.
- **When it is not supported:**
  - The same button opens a panel fixed to the bottom-right of the page: 360 px wide, at most 70 % of the viewport high, scrolling inside.
  - It has a header "Customer feedback" and a close (×) button, and sits above page content.
  - It follows scrolling, and the page underneath stays clickable.
- The inline card stays in place either way. While popped out, its body shows "Showing in the floating window" with a "Bring back" button that closes the floating window.
- The pop-out exists only on Marketing's own screen. It is not offered in instructor watch mode.
- The pop-out and fallback logic live in one component, `components/PopOutPanel.tsx`. It takes `{ title, open, onClose, children }` and decides which mode to use. A pure helper, `supportsDocumentPiP(win)`, is unit-tested.

## 5. Error handling

- **Publish with a note over 500 characters** returns 400. Marketing's screen shows the server message and keeps the note and the decisions, so nothing is lost.
- **Publish fails for any other reason:** the existing behaviour stays, and the note text stays in the box.
- **`requestWindow` rejects** (for example, blocked because the click wasn't a user gesture): fall back to the in-page panel.
- **Batch list without `marketing_note`** (an older backend): treat it as null, show no icon or callout, and nothing breaks.

## 6. Testing

**Go**
- Publish with a note stores it, both for a release and for a whole-batch discard.
- Whitespace-only and absent notes store NULL.
- A 501-rune note returns 400; 500 runes is accepted.
- The team batch list returns `marketing_note`.
- Migration applies on the local Postgres; an integration check reads the column back.

**Vitest**
- `pollTeamFeedback` role gating.
- The note is in the publish body built by the marketing service.
- `supportsDocumentPiP`.
- The batch mapping keeps `marketing_note`, and `null` when it is missing.
- A render test: the "From Marketing" callout and the icon appear only when a note exists.

**Browser (local stack)**
1. Watch a Marketing seat, or act as one with a test identity.
2. Release a batch with a note.
3. Confirm the Joke Maker's Value stream shows the icon and the callout.
4. Confirm the Joke Maker has no Customer feedback panel and makes no `/feedback` requests.
5. Open the pop-out in the Browser pane and check that it renders. The pane may fall back to the in-page panel, and that path must work too.
6. Confirm the instructor dashboard is unchanged.

## 7. Out of scope

- Editing or deleting a note after release.
- Notes from the Joke Maker to Marketing.
- Notes visible to the instructor (possible later).
- Bots writing notes.
- Changes to scoring, customers or the instructor screen.
