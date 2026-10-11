# Team Screens: Marketing Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two student seats work as a team: Marketing writes a note with each batch it releases or discards and the Joke Maker reads it under that batch in Value stream; customer feedback becomes Marketing-only, and Marketing can float it above the game; both student screens drop the two lean charts.

**Architecture:** The backend gains one nullable column, `batches.marketing_note`, written by the existing publish call (an optional `note` in `dto.PublishRequest`, normalised in `usecase.NormalizeMarketingNote` and stored by `markBatchProcessed` in the publish transaction) and returned by the existing team batch list, so the Joke Maker's screen picks it up on its existing 2.5 s poll with no new request. The frontend sends the note from Marketing's desk, renders it in the Joke Maker's `BatchCard`, stops the Joke Maker's feedback poll, and moves Marketing's feedback card into a component whose "Pop out" uses `components/PopOutPanel.tsx` (a Document Picture-in-Picture window, or a fixed in-page panel where that is unsupported).

**Tech Stack:** Go (module `jokefactory`, gin, pgx v5, goose SQL migrations applied by hand, in-memory `testutil.Store` for usecase tests, build tag `integration` for Postgres tests); React 19 + TypeScript 5.8 + Vite 6 + vitest 2 (environment `node`, components tested with `react-dom/server` `renderToStaticMarkup`), lucide-react 0.562, Tailwind via the Play CDN; local Docker stack (api on :8081, Postgres on :55432).

**Spec:** `~/Documents/GitHub/AI-Joke-Factory/docs/superpowers/specs/2026-10-11-team-screens-notes-design.md` (read it first; this plan argues from it).

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Repos and branches:** backend `~/Documents/GitHub/jokefactory_be` (HEAD `67cf96a` when this plan was written), frontend `~/Documents/GitHub/AI-Joke-Factory` (HEAD `94be133`, one docs commit after `e1c2980`), both on branch `feat/lean-market`. Each task names its repo; commit only in that repo.
- **Git:** new commits only. Never `git reset`, `git commit --amend`, `git rebase`, `git stash` or `git push`. Stage files by name (never `git add -A` / `git add .`): the frontend has an uncommitted `.claude/launch.json` and an untracked `.progress` that must stay as they are. Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never print secrets. Never `cat` `jokefactory_be/.env`; the admin password is only ever read by shell substitution (`$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)`) inside a command. Never run `docker compose config` unfiltered (it prints the interpolated password).
- **The note, backend:** migration `0004_batch_marketing_note.sql` runs `ALTER TABLE batches ADD COLUMN marketing_note TEXT NULL;` (goose Up/Down, each in `BEGIN; … COMMIT;`, like `0002`/`0003`). Request field `note` (``Note *string `json:"note"` ``). The note is trimmed (`strings.TrimSpace`) after dropping NUL characters (Postgres TEXT cannot hold `\x00`); absent, null or blank after trimming stores SQL NULL; more than **500** characters counted in **runes** after trimming (`utf8.RuneCountInString`) is a 400 `VALIDATION_ERROR` with `field: "note"` and `message: "must be at most 500 characters"`, and nothing is written. The note is stored in the same transaction that marks the batch `PROCESSED`, for a release and for a whole-batch discard alike. `GET /v1/rounds/:round_id/teams/:team_id/batches` returns `marketing_note` (string or null) on every batch.
- **Migrations are not applied at startup.** The API never runs goose. Apply `0004` by hand (`goose … up` or `DB_DSN=… make migrate-up`) **before** starting an API built from this branch: once `batchColumns` includes `marketing_note`, every batch query fails on a database without the column.
- **Texts (verbatim):** box label **"Note to your Joke Maker"** with helper **"(sent with this batch)"**; placeholder **"What should they change next? What did customers like?"**; counter **`n/500`** (`{batchFeedback.length}/{MARKETING_NOTE_MAX}`), input stops at 500 (`maxLength`); success toast suffix **" · note sent"**; row icon tooltip **"Marketing left a note"**; callout heading **"From Marketing"**; card button **"Pop out"**; while out the card body reads **"Showing in the floating window"** with a **"Bring back"** button (the header button also reads "Bring back" while out, and "Pop out" again once closed); PiP window title and fallback panel header **"Customer feedback"**, with a close (×) button labelled "Close Customer feedback"; over-limit alert **"Your note to the Joke Maker was not sent: must be at most 500 characters. Shorten it and release again."** (the middle part is the server's message).
- **Icons:** lucide `MessageSquare` (note icon) and `PictureInPicture2` (Pop out).
- **Colour:** Marketing violet, `#7c3aed` family: callout `bg-violet-50 border-violet-200` with a `3px solid #7c3aed` left border, heading and icon `#7c3aed`.
- **Rendering the note:** a React text child (never `dangerouslySetInnerHTML`), inline `white-space: pre-wrap` and `overflow-wrap: anywhere`.
- **Pop-out:** supported when `'documentPictureInPicture' in window` and it has `requestWindow` (Chrome and Edge on desktop): `documentPictureInPicture.requestWindow({ width: 360, height: 520 })`, styles mirrored into the window (every `<style>` and stylesheet `<link>`, kept in sync by a `MutationObserver` on the main `<head>`) plus the page's Tailwind CDN script loaded into the window, content rendered through a React portal; `pagehide` on the window means it closed. Otherwise, or when `requestWindow` rejects: a panel `position: fixed` bottom-right (`bottom-4 right-4`), **360 px** wide (`maxWidth: calc(100vw - 2rem)`), at most **70 %** of the viewport high (`maxHeight: 70vh`), scrolling inside, `z-40` (above page content, below the app's `z-50` modals and toasts), no backdrop, so the page stays clickable. The inline card stays in place either way. Offered on Marketing's own screen only, never in watch mode (`isWatchMode()`).
- **Modes:** notes and Marketing-only feedback apply to Classic and Lean rounds alike. Bots send no note (their request is unchanged).
- **Unchanged:** the instructor screen (all four lean charts and every Classic card), gameplay, scoring, customers; the backend feedback route's access rules; the backend team lean-charts route `GET /v1/rounds/:round_id/teams/:team_id/lean-charts` and its frontend client (`teamApi.leanCharts`, `useLeanCharts`'s `teamId`, `sessionApi.activeRounds`) stay in place, unused by the student screens.
- **Out of scope:** editing or deleting a note; notes from the Joke Maker; notes on the instructor screen; bots writing notes.

## Review Focus

The five input classes and failure modes most likely to bite a real class, each pinned by a test in the owning task:

1. **Hostile or odd note text** — HTML or `<script>`, line breaks, a 500-character word with no spaces, emoji (rune counting), a NUL byte. It must be stored verbatim (minus padding and NULs), counted in runes, shown as text, keep its line breaks and wrap inside the card. Pinned: Task 1 `TestNormalizeMarketingNote` (markup kept verbatim, NUL dropped), `TestPublishRejectsNoteOver500Runes` (501 emoji rejected, 500 accepted after trimming), `TestMarketingNoteRoutes` (HTML stored as plain text over HTTP); Task 2 `TestMarketingNoteIntegration` (HTML and emoji round-trip through Postgres); Task 5 `components/MarketingNote.test.ts` "shows markup in a note as text, never as HTML" and "keeps line breaks and wraps a long unbroken word inside the card".
2. **A publish that fails must not lose the note** — a note over the limit (400 on `note`), Round 1 all-discard (`NO_JOKE_PUBLISHED`), a network error. No success toast, the box keeps its text, the batch stays claimed, nothing is written. Pinned: Task 1 `TestPublishRejectsNoteOver500Runes` ("Nothing was written"); Task 2 the rejected-publish section (status stays `SUBMITTED`, note NULL); Task 5 `views/marketingRelease.test.ts` "a failed publish shows no toast and keeps the typed note", `services/marketingService.test.ts` "surfaces a note over the limit as an ApiError on field note" and "keeps the existing messages for the existing failures".
3. **Batches with no note, including old data** — a batch released before the migration (NULL), an older backend that sends no `marketing_note` key, `null`, or a blank string: no icon, no callout, the row renders exactly as today. Pinned: Task 1 `TestMarketingNoteRoutes` (every batch carries the key; a waiting batch is `null`); Task 2 the legacy `PROCESSED` row reads NULL; Task 5 `context.batchMapping.test.ts` "reads a missing, null or blank marketing_note as null" and `MarketingNote.test.ts` "absent, null or blank alike" (byte-identical markup).
4. **The pop-out's lifecycle** — a browser without Document PiP, `requestWindow` refused (no user gesture), the window closed by the user or by the game tab closing, "Bring back", watch mode, and Tailwind classes missing in the PiP window (the Play CDN only generates classes it sees in its own document). Pinned: Task 6 `components/PopOutPanel.test.ts` (`supportsDocumentPiP`, `requestPopOutWindow` resolving null on refusal, `onPopOutClosed` firing once on `pagehide`, `tailwindCdnSrc`, the fallback panel's size), `components/CustomerFeedbackCard.test.ts` (no pop-out in watch mode; popped state); Task 7 browser checklist step 7 (styles present inside the PiP window, or the fallback path).
5. **The Joke Maker must never request `/feedback`** while Marketing still polls it (with the 404 latch and keep-last-good intact). Pinned: Task 4 `context.teamFeedback.test.ts` "never asks as the JOKE_MAKER"; Task 7 browser checklist step 6 (`read_network_requests` on the Joke Maker tab).

## File Structure

Backend (`~/Documents/GitHub/jokefactory_be`):

| File | Action | Responsibility |
|---|---|---|
| `src/infra/db/migrations/0004_batch_marketing_note.sql` | Create | `batches.marketing_note TEXT NULL` (goose Up/Down). |
| `src/core/domain/entities.go` | Modify | `domain.Batch.MarketingNote *string`. |
| `src/core/ports/repositories.go` | Modify | `MarketingRepository.PublishBatch(…, requireAtLeastOnePublished bool, note *string)`. |
| `src/core/usecase/marketing.go` | Modify | `MaxMarketingNoteRunes`, `NormalizeMarketingNote`, `MarketingService.PublishWithNote`; `Publish` delegates with a nil note. |
| `src/core/usecase/testutil/memstore.go` | Modify | In-memory `PublishBatch` stores the note; `cloneBatch` copies it. |
| `src/infra/repo/postgres/batch_repo.go` | Modify | `batchColumns` and `scanBatch` read `marketing_note`. |
| `src/infra/repo/postgres/marketing_repo.go` | Modify | `PublishBatch` passes the note to `markBatchProcessed`, which writes it in the publish transaction. |
| `src/app/http/dto/models.go` | Modify | ``PublishRequest.Note *string `json:"note"` ``. |
| `src/app/http/handler/marketing.go` | Modify | `Publish` calls `PublishWithNote(…, req.Note)`. |
| `src/app/http/handler/batch.go` | Modify | `List` returns `marketing_note` per batch. |
| `src/core/usecase/marketing_note_test.go` | Create | Usecase tests: store on release and on discard, NULL for absent/blank, 500/501 runes, normalisation table. |
| `src/app/server/marketing_note_routes_test.go` | Create | HTTP through the real router: 400 on `note`, note stored, batch list returns `marketing_note`. |
| `src/infra/repo/postgres/marketing_note_integration_test.go` | Create | Build tag `integration`: the column, release/discard/none/rejected/legacy rows, list read-back. |

Frontend (`~/Documents/GitHub/AI-Joke-Factory`):

| File | Action | Responsibility |
|---|---|---|
| `components/leanCharts/StudentLeanCharts.tsx`, `components/leanCharts/StudentLeanCharts.test.ts` | Delete | The student lean charts. |
| `services/leanCharts.ts`, `services/leanCharts.test.ts` | Modify | Remove `leanRound1Id` and `cyclesForStudent` and their tests. |
| `components/leanCharts/LearningCyclesChart.tsx` | Modify | Comment only (no `cyclesForStudent`). |
| `docs/lean-market-mode.md` | Modify | Remove the student-chart descriptions; describe Marketing-only feedback, the note and Pop out. |
| `context.tsx` | Modify | `TEAM_FEEDBACK_ROLES` = Marketing only; the Joke Maker branch stops polling feedback; `mapBatchFromTeamList` keeps `marketing_note`; `publishBatch` sends the note and resolves `boolean`. |
| `context.teamFeedback.test.ts` | Replace | Marketing asks, the Joke Maker and every other role never do. |
| `views/JokeMaker.tsx` | Modify | No student charts, no Customer feedback card; `BatchCard` exported, with the note icon and callout. |
| `views/QualityControl.tsx` | Modify | No student charts; the note box (label, helper, placeholder, counter, `maxLength`); `release()` sends the note and uses `releaseOutcome`; the feedback card becomes `CustomerFeedbackCard`. |
| `views/feedback.ts`, `components/FeedbackCard.tsx` | Modify | Comments only (Marketing-only). |
| `types/api.ts`, `types.ts` | Modify | `TeamBatch.marketing_note?`, `PublishRequest.note?`, `Batch.marketing_note?`, `ApiTeamBatchesResponse` batches' `marketing_note?`. |
| `services/marketingService.ts` | Replace | `MARKETING_NOTE_MAX`, `PublishBody`, `buildPublishBody`, `toMarketingNote`, `publishFailureMessage`; `publish(batch_id, PublishBody)`. |
| `services/marketingService.test.ts` | Create | Body building, the note on the wire, failure messages, `toMarketingNote`. |
| `views/marketingRelease.ts`, `views/marketingRelease.test.ts` | Create | `releaseOutcome`: toast text with " · note sent", clear the box only on success. |
| `components/MarketingNote.tsx` | Create | `marketingNoteOf`, `MarketingNoteIcon`, `MarketingNoteCallout`. |
| `components/MarketingNote.test.ts` | Create | Static render of `BatchCard` with and without a note. |
| `services/api/contract.test.ts`, `context.batchMapping.test.ts` | Modify | `marketing_note` on the listing and in the mapping; `note` in the publish body and its 400. |
| `components/PopOutPanel.tsx`, `components/PopOutPanel.test.ts` | Create | `supportsDocumentPiP`, `requestPopOutWindow`, `onPopOutClosed`, `tailwindCdnSrc`, `mirrorStyles`, `PopOutFallbackPanel`, `PopOutPanel`. |
| `components/CustomerFeedbackCard.tsx`, `components/CustomerFeedbackCard.test.ts` | Create | Marketing's "Customer feedback" card with Pop out / Bring back. |

Baselines (verified 2026-10-11 on the HEADs above): backend `go build ./... && go vet ./... && go test ./...` passes; frontend `npx tsc --noEmit -p tsconfig.json` exits 0 and `npx vitest run` passes **589 tests in 33 files**. The local stack runs (containers `jokefactory_be-api-1` on :8081 and `jokefactory-postgres` on :55432) with goose at version 3. The compose override that published Postgres on 55432 no longer exists on disk; Task 7 recreates it (a host Postgres already listens on 5432, so the stock `docker-compose.yml` port cannot bind).

---

## Task 1: Store Marketing's note with the batch and list it (backend)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Create: `src/infra/db/migrations/0004_batch_marketing_note.sql`
- Modify: `src/core/domain/entities.go` (`type Batch`), `src/infra/repo/postgres/batch_repo.go` (`batchColumns`, `scanBatch`), `src/core/ports/repositories.go` (`MarketingRepository.PublishBatch`), `src/infra/repo/postgres/marketing_repo.go` (`PublishBatch`, `markBatchProcessed`), `src/core/usecase/testutil/memstore.go` (`PublishBatch`, `cloneBatch`), `src/core/usecase/marketing.go` (imports, `Publish`), `src/app/http/dto/models.go` (`PublishRequest`), `src/app/http/handler/marketing.go` (`Publish`), `src/app/http/handler/batch.go` (`List`)
- Test: `src/core/usecase/marketing_note_test.go`, `src/app/server/marketing_note_routes_test.go`

**Interfaces:**
- Consumes: `testutil.NewStore`, `(*Store).InsertRoundConfig/StartRound/CreateUser/UpdateUserAssignment/CreateBatch/ClaimNextBatch`, `worker.NoopDispatcher{}`, `server.New(cfg, log, repo, dispatcher, aiCustomers).Router()`, the usecase test helpers `joinMany`, `findJM`, `findMarketingOnTeam` (`src/core/usecase/test_helpers_test.go`).
- Produces:
  ```go
  // package domain — type Batch gains:
  MarketingNote *string
  // package ports — MarketingRepository:
  PublishBatch(ctx context.Context, batchID, marketerID, teamID int64, decisions []JokePublishDecision, requireAtLeastOnePublished bool, note *string) (*PublishResult, error)
  // package usecase:
  const MaxMarketingNoteRunes = 500
  func NormalizeMarketingNote(note *string) (*string, error) // nil for absent/blank; error field "note", message "must be at most 500 characters"
  func (s *MarketingService) PublishWithNote(ctx context.Context, userID, batchID int64, decisions []ports.JokePublishDecision, note *string) (*ports.PublishResult, error)
  func (s *MarketingService) Publish(ctx context.Context, userID, batchID int64, decisions []ports.JokePublishDecision) (*ports.PublishResult, error) // unchanged signature; PublishWithNote(…, nil)
  // package dto — PublishRequest gains:
  Note *string `json:"note"`
  ```
  Wire: `POST /v1/marketing/batches/:batch_id/publish` body `{"jokes":[…],"note":"…"}` (note optional); `GET /v1/rounds/:round_id/teams/:team_id/batches` → `data.batches[i].marketing_note: string | null`.

- [ ] **Step 1: Write the failing usecase tests**

Create `src/core/usecase/marketing_note_test.go`:

```go
package usecase_test

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"testing"
	"unicode/utf8"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
	"jokefactory/src/core/usecase"
	"jokefactory/src/core/usecase/testutil"
	"jokefactory/src/infra/worker"
)

// noteFixture is a claimed two-joke batch on an ACTIVE Round 2 (the in-memory
// store uses the round id as the round number), so both a release and a
// whole-batch discard are legal publishes.
type noteFixture struct {
	store     *testutil.Store
	marketing *usecase.MarketingService
	batches   *usecase.BatchService
	jm        *domain.User
	mkt       *domain.User
	batchID   int64
	jokeIDs   []int64
}

const noteRound int64 = 2

func newNoteFixture(t *testing.T) *noteFixture {
	t.Helper()
	ctx := context.Background()
	store := testutil.NewStore()
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	session := usecase.NewSessionService(store, log)
	instructor := usecase.NewInstructorService(store, nil, log)
	batches := usecase.NewBatchService(store, log)
	marketing := usecase.NewMarketingService(store, worker.NoopDispatcher{}, log)

	defaults := domain.DefaultRoundConfig()
	defaults.BatchSize = 2
	if _, err := store.InsertRoundConfig(ctx, noteRound, &defaults); err != nil {
		t.Fatal(err)
	}
	users := joinMany(t, session, []string{"A", "B", "C", "D"})
	if _, err := instructor.Assign(ctx, noteRound, 2); err != nil {
		t.Fatal(err)
	}
	cfg := defaults
	if _, err := instructor.Config(ctx, noteRound, &cfg, testutil.ValidIdealProfile()); err != nil {
		t.Fatal(err)
	}
	if _, err := instructor.StartRound(ctx, noteRound); err != nil {
		t.Fatal(err)
	}
	jm := findJM(t, session, users)
	mkt := findMarketingOnTeam(t, session, users, *jm.TeamID)
	batch, err := batches.Submit(ctx, jm.ID, noteRound, *jm.TeamID, []string{"j1", "j2"}, "")
	if err != nil {
		t.Fatal(err)
	}
	item, err := marketing.QueueNext(ctx, mkt.ID, noteRound)
	if err != nil {
		t.Fatal(err)
	}
	return &noteFixture{
		store: store, marketing: marketing, batches: batches, jm: jm, mkt: mkt,
		batchID: batch.ID, jokeIDs: []int64{item.Jokes[0].ID, item.Jokes[1].ID},
	}
}

// release publishes the first joke and discards the second; discardAll
// discards both (the whole-batch discard).
func (f *noteFixture) decisions(release bool) []ports.JokePublishDecision {
	return []ports.JokePublishDecision{
		{JokeID: f.jokeIDs[0], Title: "Kept", IsPublished: release},
		{JokeID: f.jokeIDs[1], Title: "", IsPublished: false},
	}
}

func (f *noteFixture) publish(t *testing.T, release bool, note *string) (*ports.PublishResult, error) {
	t.Helper()
	return f.marketing.PublishWithNote(context.Background(), f.mkt.ID, f.batchID, f.decisions(release), note)
}

// listedNote is what the Joke Maker's batch list returns for the batch.
func (f *noteFixture) listedNote(t *testing.T) *string {
	t.Helper()
	listed, err := f.batches.List(context.Background(), noteRound, *f.jm.TeamID, f.jm.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, b := range listed {
		if b.ID == f.batchID {
			return b.MarketingNote
		}
	}
	t.Fatalf("batch %d not listed", f.batchID)
	return nil
}

func strPtr(s string) *string { return &s }

func TestPublishStoresMarketingNote(t *testing.T) {
	for _, tc := range []struct {
		name    string
		release bool
	}{{"release", true}, {"whole-batch discard", false}} {
		t.Run(tc.name, func(t *testing.T) {
			f := newNoteFixture(t)
			result, err := f.publish(t, tc.release, strPtr("  Shorter setups, please.\nMore puns.  "))
			if err != nil {
				t.Fatalf("publish: %v", err)
			}
			const want = "Shorter setups, please.\nMore puns."
			if result.Batch.MarketingNote == nil || *result.Batch.MarketingNote != want {
				t.Fatalf("result note = %v; want %q", result.Batch.MarketingNote, want)
			}
			if got := f.listedNote(t); got == nil || *got != want {
				t.Fatalf("listed note = %v; want %q", got, want)
			}
		})
	}
}

func TestPublishStoresNullForAbsentOrBlankNote(t *testing.T) {
	for _, tc := range []struct {
		name string
		note *string
	}{{"absent", nil}, {"empty", strPtr("")}, {"whitespace only", strPtr("  \n\t  ")}} {
		t.Run(tc.name, func(t *testing.T) {
			f := newNoteFixture(t)
			if _, err := f.publish(t, true, tc.note); err != nil {
				t.Fatalf("publish: %v", err)
			}
			if got := f.listedNote(t); got != nil {
				t.Fatalf("listed note = %q; want nil", *got)
			}
		})
	}
}

func TestPublishWithoutNoteKeepsTheOldEntryPoint(t *testing.T) {
	f := newNoteFixture(t)
	if _, err := f.marketing.Publish(context.Background(), f.mkt.ID, f.batchID, f.decisions(true)); err != nil {
		t.Fatalf("publish: %v", err)
	}
	if got := f.listedNote(t); got != nil {
		t.Fatalf("listed note = %q; want nil", *got)
	}
}

func TestPublishRejectsNoteOver500Runes(t *testing.T) {
	f := newNoteFixture(t)
	// 501 emoji: 501 runes but 2004 bytes, so a byte count would be wrong twice over.
	_, err := f.publish(t, true, strPtr(strings.Repeat("😀", 501)))
	if err == nil || !domain.IsValidationError(err) {
		t.Fatalf("501 runes: err = %v; want a validation error", err)
	}
	if de, ok := err.(*domain.DomainError); !ok || de.Field != "note" || de.Message != "must be at most 500 characters" {
		t.Fatalf("501 runes: err = %#v; want field note, message %q", err, "must be at most 500 characters")
	}
	// Nothing was written: the batch is still waiting, claimed, with no note.
	if b := f.store.Batches[f.batchID]; b.Status != domain.BatchSubmitted || b.MarketingNote != nil {
		t.Fatalf("after rejection: status %s note %v; want SUBMITTED and nil", b.Status, b.MarketingNote)
	}

	// Exactly 500 runes is accepted, and padding is trimmed before counting.
	result, err := f.publish(t, true, strPtr("  "+strings.Repeat("😀", 500)+"\n"))
	if err != nil {
		t.Fatalf("500 runes: %v", err)
	}
	if n := utf8.RuneCountInString(*result.Batch.MarketingNote); n != 500 {
		t.Fatalf("stored %d runes; want 500", n)
	}
}

func TestNormalizeMarketingNote(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   *string
		want *string
	}{
		{"absent", nil, nil},
		{"blank", strPtr(" \r\n "), nil},
		{"trimmed", strPtr("\tMore puns\n"), strPtr("More puns")},
		{"inner line breaks kept", strPtr("Line one\n\nLine two"), strPtr("Line one\n\nLine two")},
		{"markup kept verbatim", strPtr("<script>alert('x')</script>"), strPtr("<script>alert('x')</script>")},
		{"NUL dropped", strPtr("a\x00b"), strPtr("ab")},
		{"only NUL", strPtr("\x00"), nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := usecase.NormalizeMarketingNote(tc.in)
			if err != nil {
				t.Fatalf("err = %v", err)
			}
			if (got == nil) != (tc.want == nil) || (got != nil && *got != *tc.want) {
				t.Fatalf("got %v; want %v", got, tc.want)
			}
		})
	}
}
```

- [ ] **Step 2: Write the failing HTTP test**

Create `src/app/server/marketing_note_routes_test.go`:

```go
package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"jokefactory/src/app/server"
	"jokefactory/src/core/domain"
	"jokefactory/src/core/usecase/testutil"
	"jokefactory/src/infra/config"
	"jokefactory/src/infra/worker"
)

// noteRouteFixture seeds an ACTIVE Round 2 with one team, a Joke Maker, a
// Marketing seat holding the lock on a two-joke batch, and a second batch still
// waiting. It returns the router and the ids the requests need.
func noteRouteFixture(t *testing.T) (http.Handler, int64, int64, int64, []int64) {
	t.Helper()
	ctx := context.Background()
	st := testutil.NewStore()
	st.Teams = []domain.Team{{ID: 1, Name: "Team 1"}}
	cfg := domain.DefaultRoundConfig()
	if _, err := st.InsertRoundConfig(ctx, 2, &cfg); err != nil {
		t.Fatal(err)
	}
	if _, err := st.StartRound(ctx, 2); err != nil {
		t.Fatal(err)
	}
	team := int64(1)
	seat := func(name string, role domain.Role) int64 {
		u, err := st.CreateUser(ctx, name)
		if err != nil {
			t.Fatal(err)
		}
		if err := st.UpdateUserAssignment(ctx, u.ID, &role, &team); err != nil {
			t.Fatal(err)
		}
		return u.ID
	}
	jm := seat("JM", domain.RoleJM)
	mkt := seat("Mkt", domain.RoleMarketing)
	batch, err := st.CreateBatch(ctx, 2, team, []string{"one", "two"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateBatch(ctx, 2, team, []string{"three"}, ""); err != nil {
		t.Fatal(err)
	}
	claimed, err := st.ClaimNextBatch(ctx, 2, team, mkt)
	if err != nil || claimed == nil || claimed.Batch.ID != batch.ID {
		t.Fatalf("claim: %+v %v", claimed, err)
	}
	ids := []int64{claimed.Jokes[0].ID, claimed.Jokes[1].ID}
	h := server.New(&config.Config{}, slog.New(slog.NewTextHandler(io.Discard, nil)), st, worker.NoopDispatcher{}, nil).Router()
	return h, jm, mkt, batch.ID, ids
}

func noteRouteDo(t *testing.T, h http.Handler, method, path string, userID int64, body any) (int, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-Id", strconv.FormatInt(userID, 10))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s %s: %v\n%s", method, path, err, rec.Body.String())
	}
	return rec.Code, out
}

func TestMarketingNoteRoutes(t *testing.T) {
	h, jm, mkt, batchID, jokeIDs := noteRouteFixture(t)
	publishPath := "/v1/marketing/batches/" + strconv.FormatInt(batchID, 10) + "/publish"
	jokes := []map[string]any{
		{"joke_id": jokeIDs[0], "joke_title": "Kept", "is_published": true},
		{"joke_id": jokeIDs[1], "joke_title": "", "is_published": false},
	}

	// 501 runes: 400 VALIDATION_ERROR on field note, and the batch is untouched.
	code, body := noteRouteDo(t, h, http.MethodPost, publishPath, mkt, map[string]any{
		"jokes": jokes, "note": strings.Repeat("é", 501),
	})
	e, _ := body["error"].(map[string]any)
	if code != http.StatusBadRequest || e["code"] != "VALIDATION_ERROR" || e["field"] != "note" ||
		e["message"] != "must be at most 500 characters" {
		t.Fatalf("501-rune note: %d %v; want 400 VALIDATION_ERROR note", code, body)
	}

	// A valid note goes through, and HTML in it is stored as plain text.
	const note = "<b>Shorter</b> setups.\nMore puns."
	if code, body = noteRouteDo(t, h, http.MethodPost, publishPath, mkt, map[string]any{
		"jokes": jokes, "note": "  " + note + "  ",
	}); code != http.StatusOK {
		t.Fatalf("publish with note: %d %v", code, body)
	}

	code, body = noteRouteDo(t, h, http.MethodGet, "/v1/rounds/2/teams/1/batches", jm, nil)
	if code != http.StatusOK {
		t.Fatalf("batch list: %d %v", code, body)
	}
	listed := body["data"].(map[string]any)["batches"].([]any)
	seen := 0
	for _, raw := range listed {
		b := raw.(map[string]any)
		got, present := b["marketing_note"]
		if !present {
			t.Fatalf("batch %v has no marketing_note key: %v", b["batch_id"], b)
		}
		if int64(b["batch_id"].(float64)) == batchID {
			if got != note {
				t.Fatalf("published batch marketing_note = %#v; want %q", got, note)
			}
		} else if got != nil {
			t.Fatalf("waiting batch marketing_note = %#v; want null", got)
		}
		seen++
	}
	if seen != 2 {
		t.Fatalf("listed %d batches; want 2", seen)
	}
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ ./src/app/server/ -run 'Note'`
Expected: the usecase package fails to build (`f.marketing.PublishWithNote undefined`, `b.MarketingNote undefined`, `undefined: usecase.NormalizeMarketingNote`); `TestMarketingNoteRoutes` FAILS with `501-rune note: 200 … want 400 VALIDATION_ERROR note` (the field is ignored today).

- [ ] **Step 4: Add the migration**

Create `src/infra/db/migrations/0004_batch_marketing_note.sql`:

```sql
-- +goose Up
BEGIN;

-- Marketing's note to its Joke Maker. Written once, in the same transaction
-- that releases the batch or discards it as a whole, and never edited after.
-- NULL when Marketing wrote nothing, and on every batch processed before this
-- column existed, so existing rows need no backfill.
ALTER TABLE batches ADD COLUMN marketing_note TEXT NULL;

COMMIT;

-- +goose Down
BEGIN;

ALTER TABLE batches DROP COLUMN marketing_note;

COMMIT;
```

- [ ] **Step 5: Add the domain field**

In `src/core/domain/entities.go`, replace:

```go
	// RawTextOriginal is the immutable copy set at submit, so unsplit is lossless.
	RawTextOriginal *string
}
```

with:

```go
	// RawTextOriginal is the immutable copy set at submit, so unsplit is lossless.
	RawTextOriginal *string
	// MarketingNote is Marketing's note to the Joke Maker, written once when the
	// batch is published (released or discarded as a whole). Nil when Marketing
	// wrote nothing, and on batches published before migration 0004.
	MarketingNote *string
}
```

- [ ] **Step 6: Read the column on every batch query**

In `src/infra/repo/postgres/batch_repo.go`, replace:

```go
const batchColumns = `batch_id, round_id, team_id, status, submitted_at, processed_at, locked_at, locked_by, created_at, raw_text, raw_text_original`
```

with:

```go
const batchColumns = `batch_id, round_id, team_id, status, submitted_at, processed_at, locked_at, locked_by, created_at, raw_text, raw_text_original, marketing_note`
```

In `src/infra/repo/postgres/batch_repo.go`, replace:

```go
		&b.RawText, &b.RawTextOriginal,
	)
```

with:

```go
		&b.RawText, &b.RawTextOriginal, &b.MarketingNote,
	)
```

- [ ] **Step 7: Pass the note through the port and write it in the publish transaction**

In `src/core/ports/repositories.go`, replace:

```go
	// it as a flag instead of looking the round number up itself.
	PublishBatch(ctx context.Context, batchID, marketerID, teamID int64, decisions []JokePublishDecision, requireAtLeastOnePublished bool) (*PublishResult, error)
```

with:

```go
	// it as a flag instead of looking the round number up itself. note is
	// Marketing's already-validated note to the Joke Maker (nil stores NULL); it
	// is written in the same transaction that marks the batch PROCESSED.
	PublishBatch(ctx context.Context, batchID, marketerID, teamID int64, decisions []JokePublishDecision, requireAtLeastOnePublished bool, note *string) (*PublishResult, error)
```

In `src/infra/repo/postgres/marketing_repo.go`, replace:

```go
	decisions []ports.JokePublishDecision,
	requireAtLeastOnePublished bool,
) (*ports.PublishResult, error) {
	var result *ports.PublishResult
```

with:

```go
	decisions []ports.JokePublishDecision,
	requireAtLeastOnePublished bool,
	note *string,
) (*ports.PublishResult, error) {
	var result *ports.PublishResult
```

In `src/infra/repo/postgres/marketing_repo.go`, replace:

```go
		processed, err := markBatchProcessed(ctx, tx, batchID)
```

with:

```go
		processed, err := markBatchProcessed(ctx, tx, batchID, note)
```

In `src/infra/repo/postgres/marketing_repo.go`, replace:

```go
func markBatchProcessed(ctx context.Context, tx pgx.Tx, batchID int64) (*domain.Batch, error) {
	return scanBatch(tx.QueryRow(ctx, `
		UPDATE batches
		SET status = 'PROCESSED',
		    processed_at = now(),
		    locked_by = NULL,
		    locked_at = NULL
		WHERE batch_id = $1
		RETURNING `+batchColumns, batchID))
}
```

with:

```go
// markBatchProcessed closes the batch and stores Marketing's note with it, in
// the caller's transaction, so a note can never outlive a rolled-back publish.
func markBatchProcessed(ctx context.Context, tx pgx.Tx, batchID int64, note *string) (*domain.Batch, error) {
	return scanBatch(tx.QueryRow(ctx, `
		UPDATE batches
		SET status = 'PROCESSED',
		    processed_at = now(),
		    locked_by = NULL,
		    locked_at = NULL,
		    marketing_note = $2
		WHERE batch_id = $1
		RETURNING `+batchColumns, batchID, note))
}
```

- [ ] **Step 8: Mirror it in the in-memory store**

In `src/core/usecase/testutil/memstore.go`, replace:

```go
	decisions []ports.JokePublishDecision,
	requireAtLeastOnePublished bool,
) (*ports.PublishResult, error) {
	b, ok := st.Batches[batchID]
```

with:

```go
	decisions []ports.JokePublishDecision,
	requireAtLeastOnePublished bool,
	note *string,
) (*ports.PublishResult, error) {
	b, ok := st.Batches[batchID]
```

In `src/core/usecase/testutil/memstore.go`, replace:

```go
	b.Status = domain.BatchProcessed
	b.ProcessedAt = &now
	b.LockedBy = nil
	b.LockedAt = nil
```

with:

```go
	b.Status = domain.BatchProcessed
	b.ProcessedAt = &now
	b.LockedBy = nil
	b.LockedAt = nil
	// Mirrors markBatchProcessed: the note is stored with the PROCESSED flip.
	b.MarketingNote = nil
	if note != nil {
		n := *note
		b.MarketingNote = &n
	}
```

In `src/core/usecase/testutil/memstore.go`, replace:

```go
	if b.RawTextOriginal != nil {
		t := *b.RawTextOriginal
		cp.RawTextOriginal = &t
	}
	return &cp
}
```

with:

```go
	if b.RawTextOriginal != nil {
		t := *b.RawTextOriginal
		cp.RawTextOriginal = &t
	}
	if b.MarketingNote != nil {
		t := *b.MarketingNote
		cp.MarketingNote = &t
	}
	return &cp
}
```

- [ ] **Step 9: Validate and normalise the note in the use case**

In `src/core/usecase/marketing.go`, replace:

```go
import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)
```

with:

```go
import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"unicode/utf8"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
)

// MaxMarketingNoteRunes caps Marketing's note to the Joke Maker, counted in
// runes (not bytes) after trimming, so an emoji counts once.
const MaxMarketingNoteRunes = 500

// NormalizeMarketingNote turns the optional note from the publish request into
// what is stored: nil (SQL NULL) when the field is absent or blank after
// trimming, otherwise the trimmed text. NUL characters are dropped first,
// because Postgres TEXT cannot store them. A note longer than
// MaxMarketingNoteRunes is a validation error on field "note".
func NormalizeMarketingNote(note *string) (*string, error) {
	if note == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(strings.ReplaceAll(*note, "\x00", ""))
	if trimmed == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(trimmed) > MaxMarketingNoteRunes {
		return nil, domain.NewValidationError("note", fmt.Sprintf("must be at most %d characters", MaxMarketingNoteRunes))
	}
	return &trimmed, nil
}
```

In `src/core/usecase/marketing.go`, replace:

```go
// Publish titles jokes and publishes/discards them for a claimed batch.
func (s *MarketingService) Publish(
	ctx context.Context,
	userID, batchID int64,
	decisions []ports.JokePublishDecision,
) (*ports.PublishResult, error) {
	user, err := s.requireMarketer(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(decisions) == 0 {
		return nil, domain.NewValidationError("jokes", "at least one joke decision required")
	}
```

with:

```go
// Publish titles jokes and publishes/discards them for a claimed batch, with no
// note to the Joke Maker. Kept for callers that never send one.
func (s *MarketingService) Publish(
	ctx context.Context,
	userID, batchID int64,
	decisions []ports.JokePublishDecision,
) (*ports.PublishResult, error) {
	return s.PublishWithNote(ctx, userID, batchID, decisions, nil)
}

// PublishWithNote is Publish plus Marketing's optional note to the Joke Maker.
// The note is normalised by NormalizeMarketingNote and stored in the same
// transaction that processes the batch, for a release and for a whole-batch
// discard alike.
func (s *MarketingService) PublishWithNote(
	ctx context.Context,
	userID, batchID int64,
	decisions []ports.JokePublishDecision,
	note *string,
) (*ports.PublishResult, error) {
	user, err := s.requireMarketer(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(decisions) == 0 {
		return nil, domain.NewValidationError("jokes", "at least one joke decision required")
	}
	storedNote, err := NormalizeMarketingNote(note)
	if err != nil {
		return nil, err
	}
```

In `src/core/usecase/marketing.go`, replace:

```go
	result, err := s.repo.PublishBatch(ctx, batchID, user.ID, *user.TeamID, normalized, requireAtLeastOnePublished)
```

with:

```go
	result, err := s.repo.PublishBatch(ctx, batchID, user.ID, *user.TeamID, normalized, requireAtLeastOnePublished, storedNote)
```

- [ ] **Step 10: Accept it on the wire and return it on the batch list**

In `src/app/http/dto/models.go`, replace:

```go
// PublishRequest is the payload for POST /marketing/batches/{id}/publish.
type PublishRequest struct {
	Jokes []PublishJokeDecision `json:"jokes" binding:"required"`
}
```

with:

```go
// PublishRequest is the payload for POST /marketing/batches/{id}/publish.
// Note is Marketing's optional note to the Joke Maker; absent, null or blank
// stores NULL (see usecase.NormalizeMarketingNote).
type PublishRequest struct {
	Jokes []PublishJokeDecision `json:"jokes" binding:"required"`
	Note  *string               `json:"note"`
}
```

In `src/app/http/handler/marketing.go`, replace:

```go
	result, err := h.marketingService.Publish(c.Request.Context(), userID, batchID, decisions)
```

with:

```go
	result, err := h.marketingService.PublishWithNote(c.Request.Context(), userID, batchID, decisions, req.Note)
```

In `src/app/http/handler/batch.go`, replace:

```go
		out = append(out, gin.H{
			"batch_id":     b.ID,
			"status":       b.Status,
			"submitted_at": b.SubmittedAt,
			"processed_at": b.ProcessedAt,
			"jokes":        jokes,
		})
```

with:

```go
		out = append(out, gin.H{
			"batch_id":     b.ID,
			"status":       b.Status,
			"submitted_at": b.SubmittedAt,
			"processed_at": b.ProcessedAt,
			// Marketing's note to the Joke Maker: a string, or null when none.
			"marketing_note": b.MarketingNote,
			"jokes":          jokes,
		})
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/jokefactory_be && go test ./src/core/usecase/ ./src/app/server/ -run 'Note' -v 2>&1 | grep -E '^(--- |ok|FAIL)'`
Expected:
```
--- PASS: TestPublishStoresMarketingNote (0.00s)
--- PASS: TestPublishStoresNullForAbsentOrBlankNote (0.00s)
--- PASS: TestPublishWithoutNoteKeepsTheOldEntryPoint (0.00s)
--- PASS: TestPublishRejectsNoteOver500Runes (0.00s)
--- PASS: TestNormalizeMarketingNote (0.00s)
ok  	jokefactory/src/core/usecase	…
--- PASS: TestMarketingNoteRoutes (0.00s)
ok  	jokefactory/src/app/server	…
```

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go build ./... && go vet ./... && go vet -tags integration ./src/infra/repo/postgres/ && go test ./...`
Expected: `gofmt -l` prints nothing; every package `ok` (no FAIL).

- [ ] **Step 12: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be
git add src/infra/db/migrations/0004_batch_marketing_note.sql src/core/domain/entities.go \
  src/core/ports/repositories.go src/core/usecase/marketing.go src/core/usecase/testutil/memstore.go \
  src/infra/repo/postgres/batch_repo.go src/infra/repo/postgres/marketing_repo.go \
  src/app/http/dto/models.go src/app/http/handler/marketing.go src/app/http/handler/batch.go \
  src/core/usecase/marketing_note_test.go src/app/server/marketing_note_routes_test.go
git commit -m "feat(notes): store Marketing's note with the batch and list it for the Joke Maker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Marketing's note against real Postgres (backend integration)

**Repo:** `~/Documents/GitHub/jokefactory_be`

**Files:**
- Test: `src/infra/repo/postgres/marketing_note_integration_test.go` (build tag `integration`)

**Interfaces:**
- Consumes: Task 1's `(*Repositories).PublishBatch(ctx, batchID, marketerID, teamID, decisions, requireAtLeastOnePublished, note)`, `(*Repositories).ListBatchesByTeam(ctx, roundID, teamID)`, `domain.Batch.MarketingNote`; `New(&db.Postgres{Pool: pool}, slog.Default())` and the `JF_TEST_DATABASE_URL` pattern of `lean_charts_integration_test.go`.
- Produces: `TestMarketingNoteIntegration` and a package-level test helper `notePtr(string) *string`.

It runs against a throwaway database `jf_note_it` on the local Postgres (container `jokefactory-postgres`, port 55432), so the game database is not migrated until Task 7.

- [ ] **Step 1: Write the integration test**

Create `src/infra/repo/postgres/marketing_note_integration_test.go`:

```go
//go:build integration

// Marketing's note against a real Postgres. Run with
//
//	JF_TEST_DATABASE_URL=postgres://… go test -count=1 -tags integration ./src/infra/repo/postgres/ -run TestMarketingNoteIntegration
//
// The database must already be migrated through 0004_batch_marketing_note; the
// test applies nothing. It inserts its own ENDED round (so it never collides
// with a live ACTIVE round), a uniquely named team and a Marketing user, and
// deletes them afterwards.
package postgres

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"jokefactory/src/core/domain"
	"jokefactory/src/core/ports"
	"jokefactory/src/infra/db"
)

func TestMarketingNoteIntegration(t *testing.T) {
	dsn := os.Getenv("JF_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("JF_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Registered first so it runs last: the data cleanup below needs the pool.
	t.Cleanup(pool.Close)
	repo := New(&db.Postgres{Pool: pool}, slog.Default())

	// The migration: a nullable TEXT column on batches.
	var dataType, nullable string
	if err := pool.QueryRow(ctx, `
		SELECT data_type, is_nullable FROM information_schema.columns
		WHERE table_name = 'batches' AND column_name = 'marketing_note'`).Scan(&dataType, &nullable); err != nil {
		t.Fatalf("batches.marketing_note missing — run migration 0004 first: %v", err)
	}
	if dataType != "text" || nullable != "YES" {
		t.Fatalf("batches.marketing_note is %s nullable=%s; want text nullable=YES", dataType, nullable)
	}

	mustID := func(q string, args ...any) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(ctx, q, args...).Scan(&id); err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
		return id
	}
	// Explicit ids above each table's maximum, as the lean integration tests do.
	nextID := func(table, col string) int64 {
		t.Helper()
		return mustID(`SELECT COALESCE(MAX(` + col + `), 0) + 1000 FROM ` + table)
	}

	var roundID, teamID, userID int64
	t.Cleanup(func() {
		// Rounds cascade to batches, jokes, events and jobs. The user goes before
		// the team: deleting the team would null a MARKETING user's team_id,
		// which users_team_id_role_chk forbids.
		for _, q := range []struct {
			sql string
			id  int64
		}{
			{`DELETE FROM rounds WHERE round_id = $1`, roundID},
			{`DELETE FROM users WHERE user_id = $1`, userID},
			{`DELETE FROM teams WHERE id = $1`, teamID},
		} {
			if q.id == 0 {
				continue
			}
			if _, err := pool.Exec(ctx, q.sql, q.id); err != nil {
				t.Errorf("cleanup %q %d: %v", q.sql, q.id, err)
			}
		}
	})

	roundID = mustID(`
		INSERT INTO rounds (round_id, round_number, status, batch_size, started_at, ended_at)
		VALUES ($1, 999, 'ENDED', 5, now() - interval '10 minutes', now())
		RETURNING round_id`, nextID("rounds", "round_id"))
	teamID = mustID(`INSERT INTO teams (id, name) VALUES ($1, $2) RETURNING id`,
		nextID("teams", "id"), fmt.Sprintf("marketing-note-it-%d", time.Now().UnixNano()))
	userID = mustID(`
		INSERT INTO users (user_id, display_name, role, team_id, status)
		VALUES ($1, 'note-it-marketer', 'MARKETING', $2, 'ASSIGNED')
		RETURNING user_id`, nextID("users", "user_id"), teamID)
	if _, err := pool.Exec(ctx, `INSERT INTO team_rounds_state (round_id, team_id) VALUES ($1, $2)`, roundID, teamID); err != nil {
		t.Fatal(err)
	}

	// newBatch inserts a batch with two PENDING jokes. A claimed batch is
	// SUBMITTED and locked by the marketer; a legacy one is PROCESSED with no
	// note, the way every batch published before 0004 looks.
	newBatch := func(claimed bool) (int64, []int64) {
		t.Helper()
		status, lockedBy := "PROCESSED", any(nil)
		if claimed {
			status, lockedBy = "SUBMITTED", userID
		}
		batchID := mustID(`
			INSERT INTO batches (batch_id, round_id, team_id, status, submitted_at, locked_at, locked_by)
			VALUES ($1, $2, $3, $4::text::batch_status, now(), now(), $5)
			RETURNING batch_id`, nextID("batches", "batch_id"), roundID, teamID, status, lockedBy)
		var jokes []int64
		for _, text := range []string{"first joke", "second joke"} {
			jokes = append(jokes, mustID(`
				INSERT INTO jokes (joke_id, batch_id, joke_text) VALUES ($1, $2, $3) RETURNING joke_id`,
				nextID("jokes", "joke_id"), batchID, text))
		}
		return batchID, jokes
	}
	decisions := func(jokes []int64, release bool) []ports.JokePublishDecision {
		return []ports.JokePublishDecision{
			{JokeID: jokes[0], Title: "Kept", IsPublished: release},
			{JokeID: jokes[1], Title: "", IsPublished: false},
		}
	}
	storedNote := func(batchID int64) *string {
		t.Helper()
		var note *string
		if err := pool.QueryRow(ctx, `SELECT marketing_note FROM batches WHERE batch_id = $1`, batchID).Scan(&note); err != nil {
			t.Fatal(err)
		}
		return note
	}

	const note = "Shorter setups.\n<b>More</b> puns — 😀"

	// A release with a note stores it and returns it on the processed batch.
	released, releasedJokes := newBatch(true)
	res, err := repo.PublishBatch(ctx, released, userID, teamID, decisions(releasedJokes, true), true, notePtr(note))
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	if res.Batch.MarketingNote == nil || *res.Batch.MarketingNote != note {
		t.Fatalf("release result note = %v; want %q", res.Batch.MarketingNote, note)
	}

	// A whole-batch discard with a note stores it too.
	discarded, discardedJokes := newBatch(true)
	if _, err := repo.PublishBatch(ctx, discarded, userID, teamID, decisions(discardedJokes, false), false, notePtr("Nothing landed.")); err != nil {
		t.Fatalf("discard: %v", err)
	}

	// No note stores NULL.
	silent, silentJokes := newBatch(true)
	if _, err := repo.PublishBatch(ctx, silent, userID, teamID, decisions(silentJokes, true), true, nil); err != nil {
		t.Fatalf("silent release: %v", err)
	}

	// A publish that fails inside the transaction (all-discard where one
	// publish is required) writes no note and leaves the batch SUBMITTED.
	rejected, rejectedJokes := newBatch(true)
	if _, err := repo.PublishBatch(ctx, rejected, userID, teamID, decisions(rejectedJokes, false), true, notePtr("lost")); !domain.IsValidationError(err) {
		t.Fatalf("rejected publish: err = %v; want NO_JOKE_PUBLISHED", err)
	}
	var rejectedStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM batches WHERE batch_id = $1`, rejected).Scan(&rejectedStatus); err != nil {
		t.Fatal(err)
	}
	if rejectedStatus != "SUBMITTED" || storedNote(rejected) != nil {
		t.Fatalf("rejected batch: status %s note %v; want SUBMITTED and NULL", rejectedStatus, storedNote(rejected))
	}

	// A batch processed before the migration has NULL.
	legacy, _ := newBatch(false)

	want := map[int64]*string{released: notePtr(note), discarded: notePtr("Nothing landed."), silent: nil, rejected: nil, legacy: nil}
	for id, w := range want {
		if got := storedNote(id); (got == nil) != (w == nil) || (got != nil && *got != *w) {
			t.Fatalf("batch %d stored note = %v; want %v", id, got, w)
		}
	}

	// The team batch list reads the column back on every batch.
	listed, err := repo.ListBatchesByTeam(ctx, roundID, teamID)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != len(want) {
		t.Fatalf("listed %d batches; want %d", len(listed), len(want))
	}
	for _, b := range listed {
		w := want[b.ID]
		if (b.MarketingNote == nil) != (w == nil) || (b.MarketingNote != nil && *b.MarketingNote != *w) {
			t.Fatalf("listed batch %d note = %v; want %v", b.ID, b.MarketingNote, w)
		}
	}
}

func notePtr(s string) *string { return &s }
```

- [ ] **Step 2: Run it against a database without the column to verify it fails**

```bash
docker exec jokefactory-postgres psql -U postgres -c "DROP DATABASE IF EXISTS jf_note_it" -c "CREATE DATABASE jf_note_it"
cd ~/Documents/GitHub/jokefactory_be
goose -dir src/infra/db/migrations postgres "postgres://postgres:postgres@localhost:55432/jf_note_it?sslmode=disable" up-to 3
JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jf_note_it?sslmode=disable" \
  go test -count=1 -tags integration ./src/infra/repo/postgres/ -run TestMarketingNoteIntegration
```
Expected: `goose: successfully migrated database to version: 3`; the test FAILS with `batches.marketing_note missing — run migration 0004 first`. (If `goose` is not on `PATH`, use `$(go env GOPATH)/bin/goose`; `make dev-deps` installs it.)

- [ ] **Step 3: Apply 0004 and run it to verify it passes**

```bash
cd ~/Documents/GitHub/jokefactory_be
goose -dir src/infra/db/migrations postgres "postgres://postgres:postgres@localhost:55432/jf_note_it?sslmode=disable" up
JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jf_note_it?sslmode=disable" \
  go test -count=1 -tags integration ./src/infra/repo/postgres/ -v 2>&1 | grep -E '^(--- |ok|FAIL)'
```
Expected: `OK   0004_batch_marketing_note.sql` and `successfully migrated database to version: 4`; then
```
--- PASS: TestLeanChartsSQLIntegration (…)
--- PASS: TestLeanStatsSQLIntegration (…)
--- PASS: TestMarketingNoteIntegration (…)
ok  	jokefactory/src/infra/repo/postgres	…
```

Check the migration's Down as well, then drop the throwaway database:

```bash
cd ~/Documents/GitHub/jokefactory_be
goose -dir src/infra/db/migrations postgres "postgres://postgres:postgres@localhost:55432/jf_note_it?sslmode=disable" down
docker exec jokefactory-postgres psql -U postgres -d jf_note_it -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='batches' AND column_name='marketing_note'"
docker exec jokefactory-postgres psql -U postgres -c "DROP DATABASE jf_note_it"
```
Expected: `OK   0004_batch_marketing_note.sql` (down), then `0`, then `DROP DATABASE`.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/GitHub/jokefactory_be
git add src/infra/repo/postgres/marketing_note_integration_test.go
git commit -m "test(notes): Marketing's note against real Postgres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Drop the lean charts from the student screens (frontend)

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Delete: `components/leanCharts/StudentLeanCharts.tsx`, `components/leanCharts/StudentLeanCharts.test.ts`
- Modify: `views/JokeMaker.tsx` (imports, `useGame()` destructure, right column), `views/QualityControl.tsx` (imports, `useGame()` destructure, lean comment, right column), `services/leanCharts.ts` (`leanRound1Id`, `cyclesForStudent`), `services/leanCharts.test.ts`, `components/leanCharts/LearningCyclesChart.tsx` (header comment), `docs/lean-market-mode.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `services/leanCharts.ts` no longer exports `leanRound1Id` or `cyclesForStudent`; every other export (`cyclesForInstructor`, `batchSellThrough`, `classSellThrough`, `LEAN_CHART_COLORS`, …) is unchanged. `useGame()`'s `roundId` is no longer read by either team view.

A removal has no behaviour to test first; the gate is a search that must go from matches to none, plus the whole suite.

- [ ] **Step 1: Run the check to see what is still there**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -rn "StudentLeanCharts\|cyclesForStudent\|leanRound1Id" views components services docs/lean-market-mode.md`
Expected: matches in `views/JokeMaker.tsx`, `views/QualityControl.tsx`, `components/leanCharts/StudentLeanCharts.tsx`, `components/leanCharts/StudentLeanCharts.test.ts`, `components/leanCharts/LearningCyclesChart.tsx`, `services/leanCharts.ts`, `services/leanCharts.test.ts`.

- [ ] **Step 2: Delete the component and its test**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git rm components/leanCharts/StudentLeanCharts.tsx components/leanCharts/StudentLeanCharts.test.ts
```

- [ ] **Step 3: Remove it from the Joke Maker's screen**

In `views/JokeMaker.tsx`, replace:

```tsx
import { fmtMoney, wipStatus } from '../services/leanMode';
import { StudentLeanCharts } from '../components/leanCharts/StudentLeanCharts';
```

with:

```tsx
import { fmtMoney, wipStatus } from '../services/leanMode';
```

In `views/JokeMaker.tsx`, replace:

```tsx
  const { user, roster, batches, submitRawBatch, config, teamSummary, teamFeedback, roundId } = useGame();
```

with:

```tsx
  const { user, roster, batches, submitRawBatch, config, teamSummary, teamFeedback } = useGame();
```

In `views/JokeMaker.tsx`, replace:

```tsx
          </div>
          {leanMode && (
            <StudentLeanCharts
              roundId={config.status === 'PLAYING' ? roundId : null}
              teamId={user?.team_id ?? null}
              roundNumber={config.round === 2 ? 2 : 1}
              live={config.isActive}
            />
          )}
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
```

with:

```tsx
          </div>
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
```

- [ ] **Step 4: Remove it from Marketing's screen**

In `views/QualityControl.tsx`, replace:

```tsx
import { fmtMoney } from '../services/leanMode';
import { StudentLeanCharts } from '../components/leanCharts/StudentLeanCharts';
```

with:

```tsx
import { fmtMoney } from '../services/leanMode';
```

In `views/QualityControl.tsx`, replace:

```tsx
  const { user, roster, qcQueue, publishBatch, splitBatch, unsplitBatch, config, teamSummary, teamFeedback, batches, roundId } = useGame();
```

with:

```tsx
  const { user, roster, qcQueue, publishBatch, splitBatch, unsplitBatch, config, teamSummary, teamFeedback, batches } = useGame();
```

In `views/QualityControl.tsx`, replace:

```tsx
  /* Lean market mode only: the team's setup and carrying costs, how long a
     released joke waits for its first buyer, and the per-batch learning curve.
     Nothing below renders for a CLASSIC round. */
```

with:

```tsx
  /* Lean market mode only: the team's setup and carrying costs and how long a
     released joke waits for its first buyer. Nothing below renders for a
     CLASSIC round. The lean charts are instructor-only. */
```

In `views/QualityControl.tsx`, replace:

```tsx
          {leanMode && (
            <StudentLeanCharts
              roundId={config.status === 'PLAYING' ? roundId : null}
              teamId={user?.team_id ?? null}
              roundNumber={config.round === 2 ? 2 : 1}
              live={config.isActive}
            />
          )}

          {/* The 12 criteria — so Marketing knows what to coach the Joke Maker on. */}
```

with:

```tsx
          {/* The 12 criteria — so Marketing knows what to coach the Joke Maker on. */}
```

- [ ] **Step 5: Delete the transforms only it used, and their tests**

In `services/leanCharts.ts`, replace:

```ts
/** Round 1's id from /v1/rounds/active, only if Round 1 was Lean. */
export function leanRound1Id(
  rounds: ReadonlyArray<{ id: number; round_number: number; market_mode?: string }> | null | undefined,
): number | null {
  const r1 = (rounds ?? []).find(r => Number(r.round_number) === 1);
  return r1 && r1.market_mode === 'LEAN' ? r1.id : null;
}

/** The instructor's team picker: every team in either round, by id. */
```

with:

```ts
/** The instructor's team picker: every team in either round, by id. */
```

In `services/leanCharts.ts`, replace:

```ts
  return { series, emptyText: cyclesEmptyText(series, teams) };
}

/** Student: own batches this round, the class average dashed, and in Round 2 the team's Round 1 batches faded. */
export function cyclesForStudent(
  current: LeanChartsResponse | null,
  round: 1 | 2,
  earlier: LeanChartsResponse | null,
): CyclesModel {
  const mine = current?.teams[0] ?? null;
  const before = round === 2 ? earlier?.teams[0] ?? null : null;
  const series: CyclesSeries[] = [];
  if (before) {
    series.push({
      key: 'earlier', name: 'Your Round 1 batches', color: LEAN_CHART_COLORS.round1, round: 1,
      dashed: false, markers: true, faded: true, points: batchSellThrough(before, leanJudgeTiming(earlier)),
    });
  }
  series.push({
    key: 'mine', name: `Your batches · Round ${round}`, color: roundColor(round), round,
    dashed: false, markers: true, faded: false, points: batchSellThrough(mine, leanJudgeTiming(current)),
  });
  series.push({
    key: 'class', name: 'Class average', color: LEAN_CHART_COLORS.classAverage, round,
    dashed: true, markers: false, faded: false,
    points: classSellThrough(current?.class_average, leanJudgeTiming(current)),
  });
  const teams = [mine, before].filter((t): t is LeanChartsTeam => t != null);
  return { series, emptyText: cyclesEmptyText(series, teams) };
}
```

with:

```ts
  return { series, emptyText: cyclesEmptyText(series, teams) };
}
```

In `services/leanCharts.test.ts`, replace:

```ts
  batchScatter, batchSellThrough, classSellThrough, cyclesForInstructor, cyclesForStudent,
  defaultIdleTeamId, hasIdle, hasWaste, idleRows, idleSubtitle, integerTicks, isNotLeanRound,
  isTooRecentToJudge, leanChartsVisibility, leanJudgeTiming, leanRound1Id, leanRoundFlags, minuteTicks,
```

with:

```ts
  batchScatter, batchSellThrough, classSellThrough, cyclesForInstructor,
  defaultIdleTeamId, hasIdle, hasWaste, idleRows, idleSubtitle, integerTicks, isNotLeanRound,
  isTooRecentToJudge, leanChartsVisibility, leanJudgeTiming, leanRoundFlags, minuteTicks,
```

In `services/leanCharts.test.ts`, replace:

```ts
describe('leanRound1Id', () => {
  it('finds Round 1 only when it was Lean', () => {
    expect(leanRound1Id([{ id: 4, round_number: 1, market_mode: 'LEAN' }, { id: 5, round_number: 2, market_mode: 'LEAN' }])).toBe(4);
    expect(leanRound1Id([{ id: 4, round_number: 1, market_mode: 'CLASSIC' }])).toBeNull();
    expect(leanRound1Id([{ id: 4, round_number: 1 }])).toBeNull();
    expect(leanRound1Id(undefined)).toBeNull();
  });
});

describe('teamOptions', () => {
```

with:

```ts
describe('teamOptions', () => {
```

In `services/leanCharts.test.ts`, replace:

```ts
describe('cyclesForStudent', () => {
  const current = leanChartsFixture({ round_id: 8, teams: [res.teams[0]] });
  const earlier = leanChartsFixture({ teams: [res.teams[1]] });
  it('in Round 2: faded Round 1 batches, own batches in orange, dashed class average', () => {
    const m = cyclesForStudent(current, 2, earlier);
    expect(m.series.map(s => s.key)).toEqual(['earlier', 'mine', 'class']);
    expect(m.series[0]).toMatchObject({ faded: true, color: LEAN_CHART_COLORS.round1, round: 1 });
    expect(m.series[1]).toMatchObject({ faded: false, color: LEAN_CHART_COLORS.round2, round: 2, markers: true });
    expect(m.series[2]).toMatchObject({ dashed: true, markers: false, color: LEAN_CHART_COLORS.classAverage });
  });
  it('in Round 1: no earlier round, own batches in blue', () => {
    const m = cyclesForStudent(current, 1, earlier);
    expect(m.series.map(s => s.key)).toEqual(['mine', 'class']);
    expect(m.series[0].color).toBe(LEAN_CHART_COLORS.round1);
  });
});

describe('resolveLeanChartsRound / leanChartsVisibility', () => {
```

with:

```ts
describe('resolveLeanChartsRound / leanChartsVisibility', () => {
```

In `services/leanCharts.test.ts`, replace:

```ts
    expect(cyclesForInstructor(ended, null, 1).series[0].points[0].pending).toBe(false);
    expect(cyclesForStudent(running, 1, null).series[0].points[0].pending).toBe(true);
    expect(cyclesForStudent(ended, 1, null).series[0].points[0].pending).toBe(false);
    // In Round 2 the earlier round is timed by its own response.
    const r2 = at('2026-10-06T10:03:00Z', { round_id: 8, teams: [team(100)] });
    const m = cyclesForStudent(r2, 2, ended);
    expect(m.series[0].points[0].pending).toBe(false);
    expect(m.series[1].points[0].pending).toBe(true);
  });
```

with:

```ts
    expect(cyclesForInstructor(ended, null, 1).series[0].points[0].pending).toBe(false);
  });
```

In `components/leanCharts/LearningCyclesChart.tsx`, replace:

```tsx
   Series come from services/leanCharts.ts cyclesForInstructor / cyclesForStudent. */
```

with:

```tsx
   Series come from services/leanCharts.ts cyclesForInstructor. Instructor
   screen only: the student screens dropped their lean charts. */
```

- [ ] **Step 6: Remove the student-chart text from the guide**

In `docs/lean-market-mode.md`, replace:

```markdown
| Debrief 1 | 10 min | Shows the Round 1 leaderboard with the Setup, Carrying, Lead and Sale columns, and the lean charts (section 3). Asks what drove cost and why jokes sat unsold. | Discuss. | Discuss; read the Customer feedback panel and the two lean charts. |
```

with:

```markdown
| Debrief 1 | 10 min | Shows the Round 1 leaderboard with the Setup, Carrying, Lead and Sale columns, and the lean charts (section 3). Asks what drove cost and why jokes sat unsold. | Discuss. | Discuss; read the Customer feedback panel. |
```

In `docs/lean-market-mode.md`, replace:

```markdown
The Joke Maker also sees the two lean charts described under Marketing and the Customer feedback panel.
```

with:

```markdown
The Joke Maker also sees the Customer feedback panel. The lean charts are on the instructor's
screen only; the student screens do not show them.
```

In `docs/lean-market-mode.md`, replace:

```markdown
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

The **Customer feedback** panel
```

with:

```markdown
The **Customer feedback** panel
```

- [ ] **Step 7: Run the check and the suite to verify**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -rn "StudentLeanCharts\|cyclesForStudent\|leanRound1Id" views components services docs/lean-market-mode.md`
Expected: no output.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc exits 0; `Test Files  32 passed (32)` and `Tests  585 passed (585)` (589 − 1 StudentLeanCharts − 1 leanRound1Id − 2 cyclesForStudent).

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add views/JokeMaker.tsx views/QualityControl.tsx services/leanCharts.ts services/leanCharts.test.ts \
  components/leanCharts/LearningCyclesChart.tsx docs/lean-market-mode.md
git commit -m "refactor(lean): drop the lean charts from the student screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(`git rm` in Step 2 already staged the two deletions.)

---

## Task 4: Customer feedback is Marketing-only (frontend)

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Modify: `context.tsx` (`TEAM_FEEDBACK_ROLES` and the `pollTeamFeedback` doc comment; the Joke Maker poll branch; the Marketing branch's comment), `views/JokeMaker.tsx` (imports, comment, destructure, `feedbackRows`, right column), `components/FeedbackCard.tsx` (comment), `views/feedback.ts` (comment), `docs/lean-market-mode.md`
- Test: `context.teamFeedback.test.ts` (replaced)

**Interfaces:**
- Consumes: `pollTeamFeedback(role: Role, roundId: RoundId | number | null, teamId: TeamId | null, unsupportedRef: { current: boolean }): Promise<TeamFeedbackResponse | null | undefined>` (signature unchanged).
- Produces: `TEAM_FEEDBACK_ROLES = new Set(['QUALITY_CONTROL'])`. `pollTeamFeedback` resolves `undefined` without a request for `Role.JOKE_MAKER`. The Joke Maker's screen reads neither `teamFeedback` nor `toFeedbackRows`.

- [ ] **Step 1: Write the failing test**

Replace the whole of `context.teamFeedback.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollTeamFeedback } from './context';
import { Role } from './types';
import type { Wrapped, TeamFeedbackResponse } from './types/api';

/* ============================================================================
   Who gets to hear from the customers: Marketing, and only Marketing.

   GET /v1/rounds/{rid}/teams/{tid}/feedback is a TEAM route the backend would
   serve to either team role (core/usecase/feedback.go:44-49). The game wants
   the Joke Maker to hear from Marketing instead — Marketing reads the customers
   and writes a note with each batch — so the Joke Maker's screen has no
   feedback panel and its poll must never ask for the route. These tests pin
   that: Marketing asks, the Joke Maker and every other role stay off the wire,
   and a failed poll never blanks a panel that already has feedback on it.

   Driven through the real service and the real apiRequest over a stubbed fetch,
   the way services/api/contract.test.ts does, so what is asserted is the
   request that would actually go on the wire.
============================================================================ */

/** environment is 'node' — no DOM, no localStorage. Same stand-in the contract
 *  tests use, so apiRequest's real X-User-Id path runs rather than a mock. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

const realFetch = globalThis.fetch;

const FEEDBACK: Wrapped<TeamFeedbackResponse> = {
  data: {
    jokes: [{
      joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
      good_dimensions: ['LENGTH', 'TOPIC'],
      improve_dimensions: ['WORDPLAY', 'CLARITY', 'ENERGY'],
    }],
  },
};

function stub(body: unknown, status = 200) {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
  globalThis.fetch = spy;
  return spy;
}

const urls = (spy: any): string[] => spy.mock.calls.map((c: any[]) => String(c[0]));

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  localStorage.clear();
  // The repo commits a .env.local with VITE_USE_MOCK_API=true; without these the
  // mock branch answers and the stubbed fetch is never called.
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  vi.stubEnv('VITE_USE_MOCK_API', 'false');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
});

describe('pollTeamFeedback', () => {
  it('asks for the team route when the poll is running as MARKETING', async () => {
    const spy = stub(FEEDBACK);
    const res = await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, { current: false });
    expect(urls(spy)).toEqual(['http://api.test/v1/rounds/7/teams/3/feedback']);
    // The {data} envelope is unwrapped by teamApi.feedback, not by the caller.
    expect(res?.jokes[0].good_dimensions).toEqual(['LENGTH', 'TOPIC']);
  });

  it('never asks as the JOKE_MAKER — the Joke Maker hears from Marketing instead', async () => {
    const spy = stub(FEEDBACK);
    expect(await pollTeamFeedback(Role.JOKE_MAKER, 7, 3, { current: false })).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('stays off the wire for every other role', async () => {
    for (const role of [Role.INSTRUCTOR, Role.CUSTOMER, Role.UNASSIGNED]) {
      const spy = stub(FEEDBACK);
      expect(await pollTeamFeedback(role, 7, 3, { current: false })).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('stays off the wire before the round or the team is known', async () => {
    const spy = stub(FEEDBACK);
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, null, 3, { current: false })).toBeUndefined();
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, 7, null, { current: false })).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('latches on a 404 so a backend without the route is asked once, not forever', async () => {
    const spy = stub({ code: 'NOT_FOUND', message: 'not found' }, 404);
    const unsupported = { current: false };
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported)).toBeUndefined();
    expect(unsupported.current).toBe(true);
    await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a transient failure, and applies nothing', async () => {
    // undefined, not null: a 500 must leave the last good feedback on screen
    // rather than blanking the panel mid-round.
    const spy = stub({ code: 'INTERNAL', message: 'boom' }, 500);
    const unsupported = { current: false };
    expect(await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported)).toBeUndefined();
    expect(unsupported.current).toBe(false);
    await pollTeamFeedback(Role.QUALITY_CONTROL, 7, 3, unsupported);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run context.teamFeedback.test.ts`
Expected: 1 failed, 5 passed — `never asks as the JOKE_MAKER — the Joke Maker hears from Marketing instead` with `AssertionError: expected { jokes: [ { joke_id: 9101, …(4) } ] } to be undefined`.

- [ ] **Step 3: Gate the poll to Marketing and stop the Joke Maker's request**

In `context.tsx`, replace:

```tsx
/**
 * Roles allowed to read their team's customer feedback.
 *
 * Both team seats poll it, because the payload is per TEAM, not per seat:
 * FeedbackService.Get rejects anyone who is not JM or MARKETING on that team
 * (core/usecase/feedback.go:44-49). The Joke Maker used to be left out on this
 * side only — the fetch lived inside the Marketing branch of the poll — so the
 * people writing the jokes were the one role that never heard what the
 * customers thought of them.
 */
const TEAM_FEEDBACK_ROLES: ReadonlySet<string> = new Set(['JOKE_MAKER', 'QUALITY_CONTROL']);

/**
 * One poll of GET /v1/rounds/{rid}/teams/{tid}/feedback, shared by both team
 * branches so their behaviour and failure modes cannot drift apart.
```

with:

```tsx
/**
 * Roles that load their team's customer feedback: Marketing only.
 *
 * The backend would let the Joke Maker read it too (FeedbackService.Get
 * accepts JM or MARKETING on the team, core/usecase/feedback.go:44-49), but the
 * game wants the Joke Maker to hear from Marketing, not from a panel both
 * seats share: Marketing reads the customers and writes a note with each
 * batch. So the Joke Maker makes no /feedback requests at all.
 */
const TEAM_FEEDBACK_ROLES: ReadonlySet<string> = new Set(['QUALITY_CONTROL']);

/**
 * One poll of GET /v1/rounds/{rid}/teams/{tid}/feedback for the Marketing
 * branch. Every other role gets `undefined` without a request.
```

In `context.tsx`, replace:

```tsx
          /* The team's customer feedback, same route and same guards Marketing
             uses (see pollTeamFeedback). The Joke Maker reads it to learn which
             of the 12 criteria their jokes keep missing — the feedback loop the
             per-batch "Marketing note" modal only ever pretended to close. */
          const jmFeedback = await pollTeamFeedback(
            role, effectiveRound, me.assignment.team_id as TeamId, teamFeedbackUnsupportedRef,
          );
          if (jmFeedback !== undefined && !cancelled) setTeamFeedback(jmFeedback);
```

with:

```tsx
          /* No customer feedback for the Joke Maker: it is Marketing-only (see
             TEAM_FEEDBACK_ROLES). The Joke Maker hears from Marketing instead. */
```

In `context.tsx`, replace:

```tsx
          /* Marketing's feedback panel. Gated on the user actually being on a
             team, because the route is per-team — pollTeamFeedback owns that
             gate and the 404 latch, and the Joke Maker branch above calls the
             same helper so both seats poll identically. */
```

with:

```tsx
          /* Marketing's feedback panel. Gated on the user actually being on a
             team, because the route is per-team — pollTeamFeedback owns that
             gate, the Marketing-only role gate and the 404 latch. */
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run context.teamFeedback.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Remove the Customer feedback card from the Joke Maker's screen**

In `views/JokeMaker.tsx`, replace:

```tsx
/* The same mapper and card Marketing renders — the feedback is per TEAM, so
   both seats must read it identically. See views/feedback.ts. */
import { toFeedbackRows } from './feedback';
import { FeedbackCard } from '../components/FeedbackCard';
import { isWatchMode } from '../services/watchMode';
```

with:

```tsx
import { isWatchMode } from '../services/watchMode';
```

In `views/JokeMaker.tsx`, replace:

```tsx
/* The per-batch "Marketing feedback" modal used to live here. It rendered
   batch.feedback, which NOTHING ever persisted — the publish payload carries
   only {joke_id, joke_title, is_published} and there is no batch feedback
   column — so it was permanently empty, and the button that opened it promised
   a conversation that never happened. Replaced by the team-level "Customer
   feedback" card below, which reads the real per-team route. Don't bring the
   modal back: the data it wanted is per TEAM, not per batch. */
```

with:

```tsx
/* Customer feedback is Marketing-only: the Joke Maker hears from Marketing,
   not from a panel both seats share (context.tsx TEAM_FEEDBACK_ROLES). */
```

In `views/JokeMaker.tsx`, replace:

```tsx
  const { user, roster, batches, submitRawBatch, config, teamSummary, teamFeedback } = useGame();
```

with:

```tsx
  const { user, roster, batches, submitRawBatch, config, teamSummary } = useGame();
```

In `views/JokeMaker.tsx`, replace:

```tsx
  /* The team's customer feedback — the same rows Marketing sees, fetched by the
     same poll in context.tsx. Per TEAM and capped at the round's
     feedback_joke_count, so it is a short standing list, not a per-batch log. */
  const feedbackRows = useMemo(() => toFeedbackRows(teamFeedback), [teamFeedback]);

  React.useEffect(() => {
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
```

with:

```tsx
  React.useEffect(() => {
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
```

In `views/JokeMaker.tsx`, replace:

```tsx
        {/* RIGHT: stat tiles + Jokes by stage + the team's customer feedback */}
```

with:

```tsx
        {/* RIGHT: stat tiles + Jokes by stage */}
```

In `views/JokeMaker.tsx`, replace:

```tsx
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
            <StageDots batches={myBatches} />
          </Card>
          <Card
            title="Customer feedback"
            subtitle="Which criteria landed and which missed — the customers never say by how much"
            accent={BRAND.sold}
          >
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {feedbackRows.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  No feedback yet — release jokes to start uncovering the target.
                </p>
              ) : (
                feedbackRows.map(r => <FeedbackCard key={r.joke_id} row={r} />)
              )}
            </div>
          </Card>
        </div>
```

with:

```tsx
          <Card title="Jokes by stage" subtitle="Where your output sits right now">
            <StageDots batches={myBatches} />
          </Card>
        </div>
```

- [ ] **Step 6: Correct the comments and the guide**

In `components/FeedbackCard.tsx`, replace:

```tsx
   Shared by both team seats — Marketing (views/QualityControl.tsx) and the Joke
   Maker (views/JokeMaker.tsx) — because they read the same per-team rows. One
   component, so the two screens cannot drift into telling the same team two
   different stories about the same joke.
```

with:

```tsx
   Rendered on Marketing's screen only (views/QualityControl.tsx). The Joke
   Maker no longer sees customer feedback; it hears from Marketing instead.
```

In `views/feedback.ts`, replace:

```ts
   This lives outside any view because BOTH team seats read it: Marketing
   (views/QualityControl.tsx) and the Joke Maker (views/JokeMaker.tsx). The
   payload is scoped to the TEAM, not to a batch or a seat — the backend returns
   the team's latest `feedback_joke_count` published jokes
   (core/usecase/feedback.go:38-74) and its handler accepts exactly the two team
   roles — so the two screens are looking at the same rows and must agree on
   what they mean.
```

with:

```ts
   Only Marketing's screen (views/QualityControl.tsx) renders it; the Joke
   Maker no longer loads it (context.tsx TEAM_FEEDBACK_ROLES). The payload is
   scoped to the TEAM, not to a batch or a seat — the backend returns the
   team's latest `feedback_joke_count` published jokes
   (core/usecase/feedback.go:38-74).
```

In `docs/lean-market-mode.md`, replace:

```markdown
The Joke Maker also sees the Customer feedback panel. The lean charts are on the instructor's
screen only; the student screens do not show them.
```

with:

```markdown
The Joke Maker does not see the Customer feedback panel; it is on Marketing's screen only. The
lean charts are on the instructor's screen only; the student screens do not show them.
```

- [ ] **Step 7: Verify**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -n "teamFeedback\|FeedbackCard\|toFeedbackRows\|title=\"Customer feedback\"" views/JokeMaker.tsx`
Expected: no output.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc exits 0; `Test Files  32 passed (32)`, `Tests  585 passed (585)`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add context.tsx context.teamFeedback.test.ts views/JokeMaker.tsx components/FeedbackCard.tsx \
  views/feedback.ts docs/lean-market-mode.md
git commit -m "feat(feedback): customer feedback is Marketing-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Marketing sends a note; the Joke Maker sees it in Value stream (frontend)

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `components/MarketingNote.tsx`, `views/marketingRelease.ts`
- Replace: `services/marketingService.ts`
- Modify: `types/api.ts` (`TeamBatch`, `PublishRequest`), `types.ts` (`Batch`, `ApiTeamBatchesResponse`), `context.tsx` (import, `mapBatchFromTeamList`, `GameContextType.publishBatch`, `publishBatch`), `views/QualityControl.tsx` (imports, `release`, the note box), `views/JokeMaker.tsx` (import, `BatchCard`, comment), `docs/lean-market-mode.md`
- Test: `components/MarketingNote.test.ts`, `services/marketingService.test.ts`, `views/marketingRelease.test.ts` (create); `services/api/contract.test.ts`, `context.batchMapping.test.ts` (modify)

**Interfaces:**
- Consumes: Task 1's wire contract — publish body key `note` (optional string), 400 `{"error":{"code":"VALIDATION_ERROR","message":"must be at most 500 characters","field":"note"}}`; batch list key `marketing_note: string | null`. `ApiError` (`services/apiClient.ts`: `status`, `code?`, `field?`, `message`). `fmt$` (`config/brand.ts`).
- Produces:
  ```ts
  // services/marketingService.ts
  export const MARKETING_NOTE_MAX = 500;
  export interface PublishBody { jokes: Array<{ joke_id: number; joke_title: string; is_published: boolean }>; note?: string }
  export function buildPublishBody(jokes: ReadonlyArray<{ joke_id: number | string }>, publishedIds: ReadonlyArray<number>, jokeTitles: Readonly<Record<string, string>>, note: string): PublishBody;
  export function toMarketingNote(raw: unknown): string | null;
  export function publishFailureMessage(e: unknown): string;
  marketingService.publish(batch_id: BatchId, body: PublishBody): Promise<unknown>;
  // views/marketingRelease.ts
  export const NOTE_SENT_SUFFIX = ' · note sent';
  export interface ReleaseOutcomeInput { ok: boolean; releasedCount: number; batchSize: number; costOfPublishing: number; costOfDiscard: number; note: string }
  export interface ReleaseOutcome { toast: string | null; clearNote: boolean }
  export function releaseOutcome(i: ReleaseOutcomeInput): ReleaseOutcome;
  // components/MarketingNote.tsx
  export const MARKETING_NOTE_COLOR = '#7c3aed'; MARKETING_NOTE_TOOLTIP = 'Marketing left a note'; MARKETING_NOTE_HEADING = 'From Marketing';
  export function marketingNoteOf(batch: { marketing_note?: string | null }): string | null;
  export const MarketingNoteIcon: React.FC; export const MarketingNoteCallout: React.FC<{ note: string }>;
  // views/JokeMaker.tsx
  export const BatchCard: React.FC<{ batch: Batch; open: boolean; onToggle: () => void }>;
  // context.tsx (GameContextType)
  publishBatch: (batchId: string, publishedIds: number[], jokeTitles: { [jokeId: string]: string }, note?: string) => Promise<boolean>;
  // types.ts Batch / ApiTeamBatchesResponse batches[i], types/api.ts TeamBatch:
  marketing_note?: string | null;
  // types/api.ts
  export interface PublishRequest { jokes: PublishJokeDecision[]; note?: string; }
  ```

- [ ] **Step 1: Write the failing render test for the Joke Maker's batch row**

Create `components/MarketingNote.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchCard } from '../views/JokeMaker';
import { marketingNoteOf } from './MarketingNote';
import type { Batch } from '../types';

/* The Joke Maker's Value stream row (views/JokeMaker.tsx BatchCard), rendered
   statically: the speech-bubble icon and the "From Marketing" callout appear
   only for a batch that has a note, and the note is shown as text. */

function batch(over: Partial<Batch> = {}): Batch {
  return {
    batch_id: 41, round_id: 1, team_id: 3, status: 'PROCESSED',
    jokes: [{ joke_id: 1, joke_text: 'Why did the intern cross the road?', id: '1', content: 'x', is_published: true, sold_count: 0 } as Batch['jokes'][number]],
    id: '41', team: '3', round: 1,
    ...over,
  };
}

const render = (b: Batch, open: boolean) =>
  renderToStaticMarkup(createElement(BatchCard, { batch: b, open, onToggle: () => {} }));

describe('BatchCard and Marketing notes', () => {
  it('a batch without a note shows neither the icon nor the callout — absent, null or blank alike', () => {
    const plain = render(batch(), true);
    for (const marketing_note of [undefined, null, '', '   \n ']) {
      const out = render(batch({ marketing_note }), true);
      expect(out).toBe(plain);
      expect(out).not.toContain('Marketing left a note');
      expect(out).not.toContain('From Marketing');
      expect(render(batch({ marketing_note }), false)).not.toContain('Marketing left a note');
    }
  });

  it('a collapsed batch with a note shows the icon with its tooltip, but not the note', () => {
    const out = render(batch({ marketing_note: 'More puns, please.' }), false);
    expect(out).toContain('title="Marketing left a note"');
    expect(out).toContain('aria-label="Marketing left a note"');
    expect(out).not.toContain('From Marketing');
    expect(out).not.toContain('More puns, please.');
  });

  it('an expanded batch with a note shows the callout above the jokes', () => {
    const out = render(batch({ marketing_note: 'More puns, please.' }), true);
    expect(out).toContain('From Marketing');
    expect(out).toContain('More puns, please.');
    expect(out.indexOf('From Marketing')).toBeLessThan(out.indexOf('Why did the intern cross the road?'));
    expect(out).toContain('#7c3aed');
  });

  it('shows markup in a note as text, never as HTML', () => {
    const out = render(batch({ marketing_note: '<img src=x onerror="alert(1)"><script>alert(2)</script>' }), true);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;');
  });

  it('keeps line breaks and wraps a long unbroken word inside the card', () => {
    const word = 'a'.repeat(500);
    const out = render(batch({ marketing_note: `Line one\nLine two\n${word}` }), true);
    expect(out).toContain('white-space:pre-wrap');
    expect(out).toContain('overflow-wrap:anywhere');
    expect(out).toContain(`Line one\nLine two\n${word}`);
  });
});

describe('marketingNoteOf', () => {
  it('returns the note, or null for absent, null and blank', () => {
    expect(marketingNoteOf({ marketing_note: 'Keep it short' })).toBe('Keep it short');
    expect(marketingNoteOf({ marketing_note: '  padded  ' })).toBe('  padded  ');
    expect(marketingNoteOf({})).toBeNull();
    expect(marketingNoteOf({ marketing_note: null })).toBeNull();
    expect(marketingNoteOf({ marketing_note: ' \n\t' })).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing service and release tests**

Create `services/marketingService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from './apiClient';
import {
  MARKETING_NOTE_MAX, buildPublishBody, marketingService, publishFailureMessage, toMarketingNote,
} from './marketingService';

/* The publish body Marketing's desk sends, and what it does with a failure.
   The wire test drives the real service through the real apiRequest over a
   stubbed fetch, the way services/api/contract.test.ts does. */

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}

const realFetch = globalThis.fetch;

function stub(body: unknown, status = 200) {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
  globalThis.fetch = spy;
  return spy;
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  vi.stubEnv('VITE_USE_MOCK_API', 'false');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
});

const JOKES = [{ joke_id: 11 }, { joke_id: 12 }];

describe('buildPublishBody', () => {
  it('sends one decision per joke, titles only on published ones, and the note as typed', () => {
    const body = buildPublishBody(JOKES, [11], { '11': '  Office Hours  ', '12': 'ignored' }, 'More puns.\nShorter setups.');
    expect(body).toEqual({
      jokes: [
        { joke_id: 11, joke_title: 'Office Hours', is_published: true },
        { joke_id: 12, joke_title: '', is_published: false },
      ],
      note: 'More puns.\nShorter setups.',
    });
  });

  it('carries the note on a whole-batch discard too', () => {
    const body = buildPublishBody(JOKES, [], {}, 'Nothing landed — try workplace jokes.');
    expect(body.jokes.every(j => !j.is_published)).toBe(true);
    expect(body.note).toBe('Nothing landed — try workplace jokes.');
  });

  it('leaves a blank note off the wire, so the request is what it was before notes', () => {
    for (const note of ['', '   ', '\n\t']) {
      expect('note' in buildPublishBody(JOKES, [11], { '11': 't' }, note)).toBe(false);
    }
  });
});

describe('marketingService.publish', () => {
  it('puts the note on the wire next to the decisions', async () => {
    const spy = stub({ data: { batch: { batch_id: 7, status: 'PROCESSED', processed_at: null }, published: { count: 1, joke_ids: [11] }, discarded: { count: 1, joke_ids: [12] } } });
    await marketingService.publish(7, buildPublishBody(JOKES, [11], { '11': 'T' }, 'Keep it clean'));
    expect(String(spy.mock.calls[0][0])).toBe('http://api.test/v1/marketing/batches/7/publish');
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      jokes: [
        { joke_id: 11, joke_title: 'T', is_published: true },
        { joke_id: 12, joke_title: '', is_published: false },
      ],
      note: 'Keep it clean',
    });
  });

  it('surfaces a note over the limit as an ApiError on field note', async () => {
    stub({ error: { code: 'VALIDATION_ERROR', message: 'must be at most 500 characters', field: 'note' } }, 400);
    const err = (await marketingService.publish(7, buildPublishBody(JOKES, [11], { '11': 'T' }, 'x')).catch(e => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.field).toBe('note');
    expect(publishFailureMessage(err)).toBe(
      'Your note to the Joke Maker was not sent: must be at most 500 characters. Shorten it and release again.',
    );
  });
});

describe('publishFailureMessage', () => {
  it('keeps the existing messages for the existing failures', () => {
    expect(publishFailureMessage(new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'NO_JOKE_PUBLISHED', field: 'jokes' })))
      .toBe('Round 1 requires at least one joke to be published.');
    expect(publishFailureMessage(new ApiError({ status: 409, code: 'BATCH_ALREADY_PROCESSED', message: 'x' })))
      .toBe('This batch was already processed.');
    expect(publishFailureMessage(new ApiError({ status: 403, code: 'NOT_ASSIGNED_TO_THIS_MARKETER', message: 'x' })))
      .toBe('You are not assigned to this batch.');
    expect(publishFailureMessage(new ApiError({ status: 409, code: 'ROUND_NOT_ACTIVE', message: 'x' })))
      .toBe('Round is not active. Please wait for the instructor to start.');
    expect(publishFailureMessage(new TypeError('Failed to fetch'))).toBe('Failed to publish the batch. Please try again.');
  });
});

describe('toMarketingNote', () => {
  it('keeps text and turns absent, null, blank and non-strings into null', () => {
    expect(toMarketingNote('More puns')).toBe('More puns');
    for (const raw of [undefined, null, '', '  \n', 42, {}]) expect(toMarketingNote(raw)).toBeNull();
  });
});

describe('MARKETING_NOTE_MAX', () => {
  it('matches the backend limit', () => {
    expect(MARKETING_NOTE_MAX).toBe(500);
  });
});
```

Create `views/marketingRelease.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { releaseOutcome } from './marketingRelease';

const base = { releasedCount: 2, batchSize: 5, costOfPublishing: 0.1, costOfDiscard: 0.01 };

describe('releaseOutcome', () => {
  it('a release without a note: the usual toast, and the box clears', () => {
    expect(releaseOutcome({ ...base, ok: true, note: '' })).toEqual({
      toast: 'Released 2 jokes · −$0.20', clearNote: true,
    });
  });

  it('a release with a note adds " · note sent"', () => {
    expect(releaseOutcome({ ...base, ok: true, note: 'More puns' }).toast).toBe('Released 2 jokes · −$0.20 · note sent');
  });

  it('a whole-batch discard with a note says so too', () => {
    expect(releaseOutcome({ ...base, releasedCount: 0, ok: true, note: 'Nothing landed' }).toast)
      .toBe('Passed on this batch · 5 jokes discarded · −$0.05 · note sent');
  });

  it('a blank note is not "sent"', () => {
    expect(releaseOutcome({ ...base, releasedCount: 1, ok: true, note: '  \n' }).toast).toBe('Released 1 joke · −$0.10');
  });

  it('a failed publish shows no toast and keeps the typed note', () => {
    expect(releaseOutcome({ ...base, ok: false, note: 'Keep this' })).toEqual({ toast: null, clearNote: false });
  });
});
```

- [ ] **Step 3: Extend the contract and mapping tests**

In `services/api/contract.test.ts`, replace:

```ts
    stub(body);
    const res = await teamApi.batches(1, 3);
    expect(res.batches![0].jokes![1].joke_title).toBeNull();
    expect(res.batches![0].jokes![1].first_sold_at).toBeNull();
  });
```

with:

```ts
    stub(body);
    const res = await teamApi.batches(1, 3);
    expect(res.batches![0].jokes![1].joke_title).toBeNull();
    expect(res.batches![0].jokes![1].first_sold_at).toBeNull();
  });

  /** ADDED 2026-10-11 with migration 0004 (handler/batch.go List). Every batch
   *  carries marketing_note: Marketing's note as a string, or null. */
  it('reads marketing_note on a team batch listing', async () => {
    const body: Wrapped<TeamBatchesResponse> = {
      data: {
        batches: [
          {
            batch_id: 502, status: 'PROCESSED',
            submitted_at: '2026-01-12T10:20:00Z', processed_at: '2026-01-12T10:30:00Z',
            marketing_note: 'Shorter setups.\nMore puns.',
            jokes: null,
          },
          {
            batch_id: 503, status: 'SUBMITTED',
            submitted_at: '2026-01-12T10:31:00Z', processed_at: null,
            marketing_note: null,
            jokes: null,
          },
        ],
      },
    };
    stub(body);
    const res = await teamApi.batches(1, 3);
    expect(res.batches![0].marketing_note).toBe('Shorter setups.\nMore puns.');
    expect(res.batches![1].marketing_note).toBeNull();
  });
```

In `services/api/contract.test.ts`, replace:

```ts
    const spy = stub(body);
    await marketingApi.publish(501, { jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
    expect(sentBody(spy)).toEqual({ jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
  });
```

with:

```ts
    const spy = stub(body);
    await marketingApi.publish(501, { jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
    expect(sentBody(spy)).toEqual({ jokes: [{ joke_id: 1, joke_title: 't', is_published: true }] });
  });

  it('sends Marketing\'s note with the decisions (dto.PublishRequest.Note)', async () => {
    const body: Wrapped<PublishResponse> = {
      data: {
        batch: { batch_id: 501, status: 'PROCESSED', processed_at: '2026-01-12T10:30:00Z' },
        published: { count: 1, joke_ids: [1] },
        discarded: { count: 0, joke_ids: [] },
      },
    };
    const spy = stub(body);
    await marketingApi.publish(501, { jokes: [{ joke_id: 1, joke_title: 't', is_published: true }], note: 'More puns' });
    expect(sentBody(spy)).toEqual({ jokes: [{ joke_id: 1, joke_title: 't', is_published: true }], note: 'More puns' });
  });

  it('rejects a note over 500 characters with VALIDATION_ERROR on field note', async () => {
    const body: ApiErrorBody = {
      error: { code: 'VALIDATION_ERROR', message: 'must be at most 500 characters', field: 'note' },
    };
    stub(body, 400);
    const err = await marketingApi.publish(501, {
      jokes: [{ joke_id: 1, joke_title: 't', is_published: true }],
      note: 'x'.repeat(501),
    }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.field).toBe('note');
    expect(err.message).toBe('must be at most 500 characters');
  });
```

In `context.batchMapping.test.ts`, replace:

```ts
  it('survives a null jokes array', () => {
```

with:

```ts
  it('keeps Marketing\'s note', () => {
    const b = mapBatchFromTeamList(1, 1 as never, { ...realBatch, marketing_note: 'More puns.\nShorter setups.' } as never);
    expect(b.marketing_note).toBe('More puns.\nShorter setups.');
  });

  it('reads a missing, null or blank marketing_note as null', () => {
    // realBatch has no marketing_note key at all: what a backend before migration 0004 sends.
    expect(mapBatchFromTeamList(1, 1 as never, realBatch as never).marketing_note).toBeNull();
    for (const marketing_note of [null, '', '  \n']) {
      expect(mapBatchFromTeamList(1, 1 as never, { ...realBatch, marketing_note } as never).marketing_note).toBeNull();
    }
  });

  it('survives a null jokes array', () => {
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/MarketingNote.test.ts services/marketingService.test.ts views/marketingRelease.test.ts services/api/contract.test.ts context.batchMapping.test.ts`
Expected: `components/MarketingNote.test.ts` and `views/marketingRelease.test.ts` fail to load (`Failed to load url ./MarketingNote`, `Failed to load url ./marketingRelease`); `services/marketingService.test.ts` fails with `TypeError: buildPublishBody is not a function`; `context.batchMapping.test.ts` fails "keeps Marketing's note" (`expected undefined to be 'More puns.\nShorter setups.'`) and "reads a missing, null or blank marketing_note as null" (`expected undefined to be null`). The contract tests pass at runtime (the stub echoes), but `npx tsc --noEmit -p tsconfig.json` reports `'marketing_note' does not exist`, `'note' does not exist in type 'PublishRequest'` and `Module '"../views/JokeMaker"' has no exported member 'BatchCard'`.

- [ ] **Step 5: Add the types**

In `types/api.ts`, replace:

```ts
  jokes: TeamBatchJoke[] | null;
}
```

with:

```ts
  jokes: TeamBatchJoke[] | null;
  /** Marketing's note to the Joke Maker, written once at publish (handler/batch.go
   *  List). null when Marketing wrote nothing; absent on a backend older than
   *  migration 0004_batch_marketing_note, which the client treats as null. */
  marketing_note?: string | null;
}
```

In `types/api.ts`, replace:

```ts
/** app/http/dto/models.go:36-38 */
export interface PublishRequest { jokes: PublishJokeDecision[]; }
```

with:

```ts
/** app/http/dto/models.go PublishRequest. `note` is Marketing's optional note to
 *  the Joke Maker: the backend trims it, stores NULL when it is blank, and
 *  answers 400 VALIDATION_ERROR field "note" when it is over 500 characters
 *  (runes). Bots never send one. */
export interface PublishRequest { jokes: PublishJokeDecision[]; note?: string; }
```

In `types.ts`, replace:

```ts
  tagSummary?: Array<{ tag: string; count: number }>;
}
```

with:

```ts
  tagSummary?: Array<{ tag: string; count: number }>;
  /* From the wire (batch list marketing_note): Marketing's note to the Joke
     Maker, or null when there is none. Set by mapBatchFromTeamList. */
  marketing_note?: string | null;
}
```

In `types.ts`, replace:

```ts
    jokes?: Array<{ joke_id: JokeId; joke_text: string }>;
  }>;
}
```

with:

```ts
    jokes?: Array<{ joke_id: JokeId; joke_text: string }>;
    // Marketing's note to the Joke Maker; absent on backends before migration 0004.
    marketing_note?: string | null;
  }>;
}
```

- [ ] **Step 6: Build the publish body, map the note, explain failures**

Replace the whole of `services/marketingService.ts` with:

```ts
import { apiRequest, ApiError } from './apiClient';
import type {
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiSplitBatchRequest,
  BatchId,
  RoundId,
} from '../types';

/**
 * Longest note Marketing may send with a batch. The backend counts runes after
 * trimming (usecase.MaxMarketingNoteRunes); the textarea's maxLength counts
 * UTF-16 code units, which are never fewer than runes, so the box can never
 * hold a note the backend would reject for length.
 */
export const MARKETING_NOTE_MAX = 500;

/** The body of POST /v1/marketing/batches/{id}/publish (dto.PublishRequest). */
export interface PublishBody {
  jokes: Array<{ joke_id: number; joke_title: string; is_published: boolean }>;
  /** Marketing's note to the Joke Maker. Left off when blank, so a publish
   *  without a note is exactly what it was before notes existed. */
  note?: string;
}

/**
 * Builds the publish body from the claimed batch. The backend requires a
 * decision for EVERY joke in the batch, not just the published ones (a partial
 * list is rejected), so it is built from the batch contents. A published joke
 * carries its trimmed title; a discarded one sends ''. The note is sent as
 * typed when it has any non-blank text (the backend trims it).
 */
export function buildPublishBody(
  jokes: ReadonlyArray<{ joke_id: number | string }>,
  publishedIds: ReadonlyArray<number>,
  jokeTitles: Readonly<Record<string, string>>,
  note: string,
): PublishBody {
  const published = new Set(publishedIds.map(Number));
  const body: PublishBody = {
    jokes: jokes.map(j => {
      const id = Number(j.joke_id);
      const isPublished = published.has(id);
      return {
        joke_id: id,
        joke_title: isPublished ? (jokeTitles[String(id)] ?? '').trim() : '',
        is_published: isPublished,
      };
    }),
  };
  if (note.trim() !== '') body.note = note;
  return body;
}

/** A batch's marketing_note as the UI keeps it: the text, or null when absent, null or blank. */
export function toMarketingNote(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

/** The alert Marketing sees when a publish fails. The batch stays claimed and
 *  the desk keeps its decisions and note, so the user can fix and retry. */
export function publishFailureMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // A note over the limit: show the server's own message ("must be at most 500 characters").
    if (e.field === 'note') {
      return `Your note to the Joke Maker was not sent: ${e.message}. Shorten it and release again.`;
    }
    // NO_JOKE_PUBLISHED arrives as a 400 VALIDATION_ERROR whose *message* is the
    // sentinel (field: 'jokes'). Round 1 only — round 2 accepts an all-discard
    // batch by design, so this alert should never fire there.
    if (e.message === 'NO_JOKE_PUBLISHED') return 'Round 1 requires at least one joke to be published.';
    if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
      return 'Round is not active. Please wait for the instructor to start.';
    }
    // V2 renamed these two: BATCH_ALREADY_RATED -> BATCH_ALREADY_PROCESSED and
    // NOT_ASSIGNED_TO_THIS_QC -> NOT_ASSIGNED_TO_THIS_MARKETER.
    if (e.status === 409 && e.code === 'BATCH_ALREADY_PROCESSED') return 'This batch was already processed.';
    if (e.status === 403 && e.code === 'NOT_ASSIGNED_TO_THIS_MARKETER') return 'You are not assigned to this batch.';
  }
  return 'Failed to publish the batch. Please try again.';
}

/**
 * Marketing API client — formerly `qcService`.
 *
 * The backend's V2 refactor renamed the route prefix `/v1/qc` → `/v1/marketing`.
 * Four of the five calls that used to live here needed nothing but that prefix
 * change: `queueNext`, `queueCount`, `splitBatch` and `unsplitBatch` are
 * otherwise byte-for-byte what `qcService` sent.
 *
 * Split and unsplit were dropped during that V2 refactor and RESTORED in phase
 * 3B, so both routes exist again under the new prefix. An older audit that told
 * us to delete these two calls is out of date — do not remove them.
 *
 * The fifth call, `submitRatings`, is gone. V2 deleted the rating model outright
 * — no `joke_ratings` table, no `avg_score`, no `/ratings` route under either
 * prefix — so `publish` replaces it with an explicit per-joke decision.
 */
export const marketingService = {
  queueNext(round_id: RoundId): Promise<ApiQcQueueNextResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/queue/next?round_id=${q}`, { method: 'GET' });
  },

  queueCount(round_id: RoundId): Promise<ApiQcQueueCountResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueCountResponse>(`/v1/marketing/queue/count?round_id=${q}`, { method: 'GET' });
  },

  splitBatch(batch_id: BatchId, body: ApiSplitBatchRequest): Promise<ApiQcQueueNextResponse> {
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/batches/${batch_id}/split`, { method: 'POST', body });
  },

  unsplitBatch(batch_id: BatchId): Promise<ApiQcQueueNextResponse> {
    return apiRequest<ApiQcQueueNextResponse>(`/v1/marketing/batches/${batch_id}/unsplit`, { method: 'POST' });
  },

  /** One decision per joke in the batch, plus Marketing's optional note. A
   *  published joke needs a non-empty title. Round 1 rejects an all-discard
   *  batch with 400 NO_JOKE_PUBLISHED; round 2 allows it. A note over 500
   *  characters is 400 VALIDATION_ERROR field "note". Build the body with
   *  buildPublishBody. */
  publish(batch_id: BatchId, body: PublishBody): Promise<unknown> {
    return apiRequest<unknown>(`/v1/marketing/batches/${batch_id}/publish`, { method: 'POST', body });
  },
};
```

- [ ] **Step 7: Add the release outcome**

Create `views/marketingRelease.ts`:

```ts
/* What Marketing's desk does after it presses Release (or Discard batch):
   which toast to show and whether to clear the "Note to your Joke Maker" box.
   Pure and JSX-free so the rules are testable without React
   (views/marketingRelease.test.ts).

   - The publish succeeded: the usual toast, plus " · note sent" when a note
     went with the batch, and the note box clears.
   - It failed: no toast (context.publishBatch has already alerted) and the
     note stays in the box, so nothing the marketer typed is lost. */
import { fmt$ } from '../config/brand';

export const NOTE_SENT_SUFFIX = ' · note sent';

export interface ReleaseOutcomeInput {
  /** Whether the backend accepted the publish. */
  ok: boolean;
  /** Jokes released to market (0 for a whole-batch discard). */
  releasedCount: number;
  /** Jokes in the batch. */
  batchSize: number;
  costOfPublishing: number;
  costOfDiscard: number;
  /** The note box's text when Release or Discard was pressed. */
  note: string;
}

export interface ReleaseOutcome {
  toast: string | null;
  clearNote: boolean;
}

export function releaseOutcome(i: ReleaseOutcomeInput): ReleaseOutcome {
  if (!i.ok) return { toast: null, clearNote: false };
  const base = i.releasedCount === 0
    ? `Passed on this batch · ${i.batchSize} joke${i.batchSize > 1 ? 's' : ''} discarded · −${fmt$(i.batchSize * i.costOfDiscard)}`
    : `Released ${i.releasedCount} joke${i.releasedCount > 1 ? 's' : ''} · −${fmt$(i.releasedCount * i.costOfPublishing)}`;
  return { toast: base + (i.note.trim() !== '' ? NOTE_SENT_SUFFIX : ''), clearNote: true };
}
```

- [ ] **Step 8: Send the note from the context, and keep it on the mapped batch**

In `context.tsx`, replace:

```tsx
import { marketingService } from './services/marketingService';
```

with:

```tsx
import { buildPublishBody, marketingService, publishFailureMessage, toMarketingNote } from './services/marketingService';
```

In `context.tsx`, replace:

```tsx
    rated_at: ratedAtRaw,
```

with:

```tsx
    rated_at: ratedAtRaw,
    // Marketing's note to the Joke Maker. An older backend sends no key at all,
    // and that, null and a blank string all read as "no note".
    marketing_note: toMarketingNote(teamBatches.marketing_note),
```

In `context.tsx`, replace:

```tsx
  publishBatch: (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
  ) => Promise<void>;
```

with:

```tsx
  /** Resolves true when the backend accepted the publish. False after an alert
   *  otherwise, so the caller keeps its decisions and the typed note. */
  publishBatch: (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
    note?: string,
  ) => Promise<boolean>;
```

In `context.tsx`, replace:

```tsx
  const publishBatch = async (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
  ) => {
    if (!roundId) return;
    const bid = Number(batchId) as BatchId;
    const active = qcQueue?.batch?.batch_id === bid ? qcQueue : null;
    if (!active) return;

    // The backend requires a decision for EVERY joke in the batch, not just the published
    // ones (a partial list is rejected), so build from the batch contents.
    const published = new Set(publishedIds);
    const jokes = (active.jokes ?? []).map(j => ({
      joke_id: Number(j.joke_id),
      joke_title: published.has(Number(j.joke_id)) ? (jokeTitles[String(j.joke_id)] ?? '').trim() : '',
      is_published: published.has(Number(j.joke_id)),
    }));

    try {
      await marketingService.publish(bid, { jokes });
      setQcQueue(null);
    } catch (e) {
      if (e instanceof ApiError) {
        // NO_JOKE_PUBLISHED arrives as a 400 VALIDATION_ERROR whose *message* is the
        // sentinel (field: 'jokes'). Round 1 only — round 2 accepts an all-discard
        // batch by design, so this alert should never fire there.
        if (e.message === 'NO_JOKE_PUBLISHED') {
          alert('Round 1 requires at least one joke to be published.');
          return;
        }
        if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
          alert('Round is not active. Please wait for the instructor to start.');
          return;
        }
        // V2 renamed these two: BATCH_ALREADY_RATED -> BATCH_ALREADY_PROCESSED and
        // NOT_ASSIGNED_TO_THIS_QC -> NOT_ASSIGNED_TO_THIS_MARKETER. The old handler
        // was matching codes this backend no longer emits.
        if (e.status === 409 && e.code === 'BATCH_ALREADY_PROCESSED') {
          alert('This batch was already processed.');
          return;
        }
        if (e.status === 403 && e.code === 'NOT_ASSIGNED_TO_THIS_MARKETER') {
          alert('You are not assigned to this batch.');
          return;
        }
      }
      alert('Failed to publish the batch. Please try again.');
    }
  };
```

with:

```tsx
  const publishBatch = async (
    batchId: string,
    publishedIds: number[],
    jokeTitles: { [jokeId: string]: string },
    note = '',
  ): Promise<boolean> => {
    if (!roundId) return false;
    const bid = Number(batchId) as BatchId;
    const active = qcQueue?.batch?.batch_id === bid ? qcQueue : null;
    if (!active) return false;

    // One decision per joke in the batch, plus Marketing's note when it has any
    // text — see buildPublishBody.
    const body = buildPublishBody(active.jokes ?? [], publishedIds, jokeTitles, note);

    try {
      await marketingService.publish(bid, body);
      setQcQueue(null);
      return true;
    } catch (e) {
      // The batch stays claimed and the desk keeps its decisions and note, so the
      // marketer can fix the problem and release again. A note over 500
      // characters shows the server's own message (publishFailureMessage).
      alert(publishFailureMessage(e));
      return false;
    }
  };
```

- [ ] **Step 9: Turn Marketing's box into the note**

In `views/QualityControl.tsx`, replace:

```tsx
import { fmtMoney } from '../services/leanMode';
```

with:

```tsx
import { fmtMoney } from '../services/leanMode';
import { MARKETING_NOTE_MAX } from '../services/marketingService';
import { releaseOutcome } from './marketingRelease';
```

In `views/QualityControl.tsx`, replace:

```tsx
  const release = async () => {
    if (watching) return;
    if (!canRelease || !qcQueue) return;
    /* Only titles survive to the wire now. The backend stores no rating, no tag,
       no batch feedback and no topic, so the old ratings/tags/topics payloads had
       nowhere to go; `submittingIds` already states exactly which jokes ship, which
       is what publish wants. The topic picker stays — it is deliberately decorative
       (the LLM classifies topic from the joke text), and nothing here claims it was
       saved. It is still required by `canRelease` as a "think about it" gate. */
    const titlesOut: Record<string, string> = {};
    for (const id of submittingIds) {
      titlesOut[String(id)] = titles[id];
    }

    const batchId = String(qcQueue.batch.batch_id);
    const count = submittingIds.length;
    dispatchNudge({ type: 'RELEASED' });   // no popup may ambush a team that shipped
    await publishBatch(batchId, submittingIds, titlesOut);

    /* No local feedback entry is appended here. Releasing a joke does not mean a
       customer has judged it — the panel fills in from the backend's own
       feedback poll once the scoring engine has actually run. */

    // TEMP (ranking disabled): used to read "Rank 1 + N selected".
    setToast(
      count === 0
        ? `Passed on this batch · ${orderIds.length} joke${orderIds.length > 1 ? 's' : ''} discarded · −${fmt$(orderIds.length * config.costOfDiscard)}`
        : `Released ${count} joke${count > 1 ? 's' : ''} · −${fmt$(count * config.costOfPublishing)}`,
    );
    window.setTimeout(() => setToast(null), 2800);
  };
```

with:

```tsx
  const release = async () => {
    if (watching) return;
    if (!canRelease || !qcQueue) return;
    /* Titles and Marketing's note go on the wire. The backend stores no rating,
       no tag and no topic, so the old ratings/tags/topics payloads had nowhere to
       go; `submittingIds` already states exactly which jokes ship, which is what
       publish wants. The topic picker stays — it is deliberately decorative (the
       LLM classifies topic from the joke text), and nothing here claims it was
       saved. It is still required by `canRelease` as a "think about it" gate. */
    const titlesOut: Record<string, string> = {};
    for (const id of submittingIds) {
      titlesOut[String(id)] = titles[id];
    }

    const batchId = String(qcQueue.batch.batch_id);
    const count = submittingIds.length;
    const note = batchFeedback;
    dispatchNudge({ type: 'RELEASED' });   // no popup may ambush a team that shipped
    const ok = await publishBatch(batchId, submittingIds, titlesOut, note);

    /* No local feedback entry is appended here. Releasing a joke does not mean a
       customer has judged it — the panel fills in from the backend's own
       feedback poll once the scoring engine has actually run. */

    // A failed publish has already alerted: no toast, and the note stays in the box.
    const outcome = releaseOutcome({
      ok,
      releasedCount: count,
      batchSize: orderIds.length,
      costOfPublishing: config.costOfPublishing,
      costOfDiscard: config.costOfDiscard,
      note,
    });
    if (outcome.clearNote) setBatchFeedback('');
    if (outcome.toast) {
      setToast(outcome.toast);
      window.setTimeout(() => setToast(null), 2800);
    }
  };
```

In `views/QualityControl.tsx`, replace:

```tsx
                {/* TODO(phase-3D): batch feedback is COLLECTED BUT NOT PERSISTED.
                    V2 has no field for it — the publish payload carries only
                    {joke_id, joke_title, is_published}, and there is no batch
                    feedback column, no /ratings route and nothing on the Joke
                    Maker's batch list that could return it. The label used to read
                    "(sent to Joke Maker)" and the release toast used to say
                    "feedback sent to Joke Maker"; both were false, and doubly so
                    across browsers, since the only thing that ever stored this was
                    the marketer's OWN localStorage. Copy now says what actually
                    happens. Restore the promise only once the backend grows a
                    field to put it in. */}
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <SectionLabel className="mb-1.5">
                    Batch feedback <span className="text-gray-400">(for your team's discussion — not sent)</span>
                  </SectionLabel>
                  <textarea
                    value={batchFeedback}
                    onChange={(e) => setBatchFeedback(e.target.value)}
                    rows={3}
                    placeholder="Notes on the whole batch — what landed, what to drop next round…"
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#8bb8e8] resize-none placeholder-gray-400"
                  />
                </div>
```

with:

```tsx
                {/* Marketing's note to its Joke Maker. It goes out as `note` on this
                    batch's publish call — Release or Discard batch alike — is stored
                    on the batch (batches.marketing_note) and shows under the batch
                    in the Joke Maker's Value stream. Written once: there is no
                    editing after release. The box clears when the publish succeeds
                    and keeps its text when it fails (views/marketingRelease.ts).
                    maxLength stops input at MARKETING_NOTE_MAX. */}
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <SectionLabel>
                      Note to your Joke Maker <span className="text-gray-400">(sent with this batch)</span>
                    </SectionLabel>
                    <span
                      className={`text-[11px] tabular-nums ${
                        batchFeedback.length >= MARKETING_NOTE_MAX ? 'font-semibold text-amber-700' : 'text-gray-400'
                      }`}
                    >
                      {batchFeedback.length}/{MARKETING_NOTE_MAX}
                    </span>
                  </div>
                  <textarea
                    value={batchFeedback}
                    onChange={(e) => setBatchFeedback(e.target.value.slice(0, MARKETING_NOTE_MAX))}
                    maxLength={MARKETING_NOTE_MAX}
                    rows={3}
                    aria-label="Note to your Joke Maker"
                    placeholder="What should they change next? What did customers like?"
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#8bb8e8] resize-none placeholder-gray-400"
                  />
                </div>
```

- [ ] **Step 10: Show the note on the Joke Maker's batch row**

Create `components/MarketingNote.tsx`:

```tsx
/* Marketing's note to its Joke Maker, as the Joke Maker's Value stream shows it.

   Marketing writes the note in the "Note to your Joke Maker" box and it goes out
   with the batch's publish call; the batch list returns it as marketing_note.
   A collapsed batch row shows MarketingNoteIcon when the batch has a note, and
   the expanded batch shows MarketingNoteCallout above its jokes. Batches
   without a note render exactly as before.

   The note is untrusted student text. It is rendered as a React text child, so
   markup in it is shown, never interpreted; `white-space: pre-wrap` keeps its
   line breaks and `overflow-wrap: anywhere` breaks a long unbroken word instead
   of widening the card. Both are inline styles so they hold even where a
   Tailwind class was never generated. Imports components/ui-free on purpose:
   no barrel, no context. */
import React from 'react';
import { MessageSquare } from 'lucide-react';

/** Marketing's colour (the --marketing violet the lean charts use). */
export const MARKETING_NOTE_COLOR = '#7c3aed';
export const MARKETING_NOTE_TOOLTIP = 'Marketing left a note';
export const MARKETING_NOTE_HEADING = 'From Marketing';

/** The note to show for a batch, or null when there is none (absent, null or blank). */
export function marketingNoteOf(batch: { marketing_note?: string | null }): string | null {
  const note = batch.marketing_note;
  return typeof note === 'string' && note.trim() !== '' ? note : null;
}

/** The speech bubble on a collapsed batch row that has a note. */
export const MarketingNoteIcon: React.FC = () => (
  <span
    role="img"
    aria-label={MARKETING_NOTE_TOOLTIP}
    title={MARKETING_NOTE_TOOLTIP}
    className="inline-flex shrink-0"
    style={{ color: MARKETING_NOTE_COLOR }}
  >
    <MessageSquare size={13} aria-hidden="true" />
  </span>
);

/** The callout above an expanded batch's jokes. */
export const MarketingNoteCallout: React.FC<{ note: string }> = ({ note }) => (
  <div
    className="mx-3 my-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2"
    style={{ borderLeft: `3px solid ${MARKETING_NOTE_COLOR}` }}
  >
    <div className="mb-0.5 text-xs font-semibold" style={{ color: MARKETING_NOTE_COLOR }}>
      {MARKETING_NOTE_HEADING}
    </div>
    <p className="text-sm text-gray-800" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {note}
    </p>
  </div>
);
```

In `views/JokeMaker.tsx`, replace:

```tsx
import { fmtMoney, wipStatus } from '../services/leanMode';
```

with:

```tsx
import { fmtMoney, wipStatus } from '../services/leanMode';
import { MarketingNoteCallout, MarketingNoteIcon, marketingNoteOf } from '../components/MarketingNote';
```

In `views/JokeMaker.tsx`, replace:

```tsx
/* ============================ Batch card (collapsible) ============================ */
const BatchCard: React.FC<{
  batch: Batch;
  open: boolean;
  onToggle: () => void;
}> = ({ batch, open, onToggle }) => {
  const jokes = batch.jokes as any[];
```

with:

```tsx
/* ============================ Batch card (collapsible) ============================
   A batch with a note from Marketing shows a speech bubble on its collapsed row
   and a "From Marketing" callout above its jokes when expanded; a batch without
   one renders exactly as before (components/MarketingNote.tsx). Exported for
   components/MarketingNote.test.ts. */
export const BatchCard: React.FC<{
  batch: Batch;
  open: boolean;
  onToggle: () => void;
}> = ({ batch, open, onToggle }) => {
  const jokes = batch.jokes as any[];
  const note = marketingNoteOf(batch);
```

In `views/JokeMaker.tsx`, replace:

```tsx
            {jokes.map((j, i) => <StatusDot key={i} status={jokeStatus(batch, j)} size={10} />)}
          </span>
          <span className="text-[11px] text-gray-400 ml-auto pl-2 group-hover:text-gray-600">
```

with:

```tsx
            {jokes.map((j, i) => <StatusDot key={i} status={jokeStatus(batch, j)} size={10} />)}
          </span>
          {note != null && <MarketingNoteIcon />}
          <span className="text-[11px] text-gray-400 ml-auto pl-2 group-hover:text-gray-600">
```

In `views/JokeMaker.tsx`, replace:

```tsx
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {jokes.map((j, i) => (
```

with:

```tsx
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {note != null && <MarketingNoteCallout note={note} />}
          {jokes.map((j, i) => (
```

In `views/JokeMaker.tsx`, replace:

```tsx
/* Customer feedback is Marketing-only: the Joke Maker hears from Marketing,
   not from a panel both seats share (context.tsx TEAM_FEEDBACK_ROLES). */
```

with:

```tsx
/* Customer feedback is Marketing-only: the Joke Maker hears from Marketing,
   not from a panel both seats share (context.tsx TEAM_FEEDBACK_ROLES).
   Marketing's note on each batch arrives with the batch-list poll and shows in
   the Value stream (BatchCard above). */
```

- [ ] **Step 11: Describe it in the guide**

In `docs/lean-market-mode.md`, replace:

```markdown
What to do when blocked: stop writing new batches, walk over and help your Marketing partner
decide, or improve the next batch using the customer feedback. If the limit is reached between
```

with:

```markdown
What to do when blocked: stop writing new batches, walk over and help your Marketing partner
decide, or improve the next batch using Marketing's notes. If the limit is reached between
```

In `docs/lean-market-mode.md`, replace:

```markdown
The Joke Maker does not see the Customer feedback panel; it is on Marketing's screen only. The
lean charts are on the instructor's screen only; the student screens do not show them.
```

with:

```markdown
The Joke Maker does not see the Customer feedback panel; it is on Marketing's screen only. The
Joke Maker hears from Marketing instead: in **Value stream**, a batch Marketing left a note on
shows a speech-bubble icon ("Marketing left a note"), and expanding it shows the note under
"From Marketing", above the jokes. The lean charts are on the instructor's screen only; the
student screens do not show them.
```

In `docs/lean-market-mode.md`, replace:

```markdown
3. **Releases** with **Release to market**. Released jokes are published, classified by the AI and
   put on the shelf for customers.
```

with:

```markdown
3. **Releases** with **Release to market**. Released jokes are published, classified by the AI and
   put on the shelf for customers.

Before releasing (or discarding the batch), Marketing can write in **Note to your Joke Maker**
(sent with this batch), up to 500 characters: what to change next, what customers liked. The
note goes with the batch, shows on the Joke Maker's screen within a few seconds, and cannot be
edited afterwards. The release message ends with "· note sent" when a note went with it. This
works the same in Classic and Lean rounds.
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/MarketingNote.test.ts services/marketingService.test.ts views/marketingRelease.test.ts services/api/contract.test.ts context.batchMapping.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  5 passed (5)`, no failures.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -n "not sent)\|TODO(phase-3D)\|Batch feedback" views/QualityControl.tsx`
Expected: no output (the stale label and comment are gone).

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc exits 0; `Test Files  35 passed (35)`, `Tests  609 passed (609)`.

- [ ] **Step 13: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add types/api.ts types.ts services/marketingService.ts services/marketingService.test.ts \
  views/marketingRelease.ts views/marketingRelease.test.ts context.tsx context.batchMapping.test.ts \
  services/api/contract.test.ts views/QualityControl.tsx views/JokeMaker.tsx \
  components/MarketingNote.tsx components/MarketingNote.test.ts docs/lean-market-mode.md
git commit -m "feat(notes): Marketing sends a note with each batch; the Joke Maker reads it in Value stream

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Pop the customer feedback out (frontend)

**Repo:** `~/Documents/GitHub/AI-Joke-Factory`

**Files:**
- Create: `components/PopOutPanel.tsx`, `components/CustomerFeedbackCard.tsx`
- Modify: `views/QualityControl.tsx` (imports, the "Customer feedback" card), `docs/lean-market-mode.md`
- Test: `components/PopOutPanel.test.ts`, `components/CustomerFeedbackCard.test.ts`

**Interfaces:**
- Consumes: `FeedbackRow` and `toFeedbackRows` (`views/feedback.ts`), `FeedbackCard` (`components/FeedbackCard.tsx`), `Card` (`components/ui.tsx`, has an `action` slot), `BRAND.sold` (`config/brand.ts`), `isWatchMode()` (already `watching` in `QualityControl`).
- Produces:
  ```ts
  // components/PopOutPanel.tsx
  export const POP_OUT_WIDTH = 360; export const POP_OUT_HEIGHT = 520;
  export function supportsDocumentPiP(win: unknown): boolean;
  export async function requestPopOutWindow(win: unknown, title: string): Promise<Window | null>;
  export function onPopOutClosed(pip: Pick<Window, 'addEventListener' | 'removeEventListener'>, onClosed: () => void): () => void;
  export function tailwindCdnSrc(doc: Pick<Document, 'querySelector'>): string | null;
  export function mirrorStyles(source: Document, target: Document): () => void;
  export interface PopOutPanelProps { title: string; open: boolean; onClose: () => void; children: React.ReactNode }
  export const PopOutFallbackPanel: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }>;
  export const PopOutPanel: React.FC<PopOutPanelProps>;
  // components/CustomerFeedbackCard.tsx
  export const CUSTOMER_FEEDBACK_TITLE = 'Customer feedback';
  export const FeedbackList: React.FC<{ rows: FeedbackRow[] }>;
  export interface CustomerFeedbackCardViewProps { rows: FeedbackRow[]; canPopOut: boolean; popped: boolean; onPopOut: () => void; onBringBack: () => void }
  export const CustomerFeedbackCardView: React.FC<CustomerFeedbackCardViewProps>;
  export const CustomerFeedbackCard: React.FC<{ rows: FeedbackRow[]; canPopOut: boolean }>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `components/PopOutPanel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  POP_OUT_HEIGHT, POP_OUT_WIDTH, PopOutPanel, onPopOutClosed, requestPopOutWindow,
  supportsDocumentPiP, tailwindCdnSrc,
} from './PopOutPanel';

/* environment is 'node': no window, no document. The browser-only paths
   (mirrorStyles, the portal into the PiP window) are checked by hand in the
   final browser checklist; everything that decides WHICH mode runs is here. */

const fakePipWindow = () => ({ document: { title: '' } }) as unknown as Window;

describe('supportsDocumentPiP', () => {
  it('is true only when documentPictureInPicture.requestWindow exists', () => {
    expect(supportsDocumentPiP({ documentPictureInPicture: { requestWindow: () => Promise.resolve(fakePipWindow()) } })).toBe(true);
  });
  it('is false for browsers without it, and for anything that is not a window', () => {
    for (const win of [undefined, null, 42, 'window', {}, { documentPictureInPicture: undefined },
      { documentPictureInPicture: null }, { documentPictureInPicture: {} }, { documentPictureInPicture: { requestWindow: 'no' } }]) {
      expect(supportsDocumentPiP(win)).toBe(false);
    }
  });
});

describe('requestPopOutWindow', () => {
  it('asks for a 360 × 520 window and titles it', async () => {
    const pip = fakePipWindow();
    const requestWindow = vi.fn(async () => pip);
    const got = await requestPopOutWindow({ documentPictureInPicture: { requestWindow } }, 'Customer feedback');
    expect(requestWindow).toHaveBeenCalledWith({ width: 360, height: 520 });
    expect([POP_OUT_WIDTH, POP_OUT_HEIGHT]).toEqual([360, 520]);
    expect(got).toBe(pip);
    expect(got!.document.title).toBe('Customer feedback');
  });
  it('resolves null without Document PiP, so the caller shows the in-page panel', async () => {
    expect(await requestPopOutWindow({}, 'Customer feedback')).toBeNull();
    expect(await requestPopOutWindow(undefined, 'Customer feedback')).toBeNull();
  });
  it('resolves null when the browser refuses (e.g. no user gesture), so the caller falls back', async () => {
    const requestWindow = vi.fn(async () => { throw new DOMException('needs a user gesture', 'NotAllowedError'); });
    expect(await requestPopOutWindow({ documentPictureInPicture: { requestWindow } }, 'Customer feedback')).toBeNull();
  });
});

describe('onPopOutClosed', () => {
  it('fires once when the window is closed (pagehide), and not after it is stopped', () => {
    const pip = new EventTarget();
    const closed = vi.fn();
    const stop = onPopOutClosed(pip as unknown as Window, closed);
    pip.dispatchEvent(new Event('pagehide'));
    expect(closed).toHaveBeenCalledTimes(1);
    stop();
    pip.dispatchEvent(new Event('pagehide'));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('tailwindCdnSrc', () => {
  it('finds the Tailwind Play CDN script the page loads, so the PiP window can load it too', () => {
    const doc = {
      querySelector: (sel: string) =>
        sel === 'script[src*="cdn.tailwindcss.com"]' ? { getAttribute: (a: string) => (a === 'src' ? 'https://cdn.tailwindcss.com' : null) } : null,
    } as unknown as Document;
    expect(tailwindCdnSrc(doc)).toBe('https://cdn.tailwindcss.com');
    expect(tailwindCdnSrc({ querySelector: () => null } as unknown as Document)).toBeNull();
  });
});

describe('PopOutPanel', () => {
  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(createElement(PopOutPanel, { title: 'Customer feedback', open: false, onClose: () => {} }, 'rows'))).toBe('');
  });
  it('without Document PiP, opens as the in-page panel: header, close button, 360 px wide, at most 70 % high', () => {
    const out = renderToStaticMarkup(createElement(PopOutPanel, { title: 'Customer feedback', open: true, onClose: () => {} }, 'the rows'));
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Customer feedback"');
    expect(out).toContain('aria-label="Close Customer feedback"');
    expect(out).toContain('width:360px');
    expect(out).toContain('max-height:70vh');
    expect(out).toContain('fixed bottom-4 right-4');
    expect(out).toContain('overflow-y-auto');
    expect(out).toContain('the rows');
  });
});
```

Create `components/CustomerFeedbackCard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerFeedbackCardView } from './CustomerFeedbackCard';
import type { FeedbackRow } from '../views/feedback';

const ROWS: FeedbackRow[] = [{
  joke_id: 9101, joke_title: 'Corporate Comedy', was_bought: true,
  good: [{ id: 'TOPIC', label: 'Topic' }], improve: [{ id: 'WORDPLAY', label: 'Wordplay' }],
}];

const render = (props: Partial<Parameters<typeof CustomerFeedbackCardView>[0]> = {}) =>
  renderToStaticMarkup(createElement(CustomerFeedbackCardView, {
    rows: ROWS, canPopOut: true, popped: false, onPopOut: () => {}, onBringBack: () => {}, ...props,
  }));

describe('CustomerFeedbackCardView', () => {
  it('offers Pop out on Marketing\'s own screen and shows the list inline', () => {
    const out = render();
    expect(out).toContain('Customer feedback');
    expect(out).toContain('Pop out');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('Corporate Comedy');
    expect(out).not.toContain('Showing in the floating window');
  });

  it('offers no pop-out in watch mode, even if asked to be popped', () => {
    for (const popped of [false, true]) {
      const out = render({ canPopOut: false, popped });
      expect(out).not.toContain('Pop out');
      expect(out).not.toContain('Bring back');
      expect(out).not.toContain('Showing in the floating window');
      expect(out).not.toContain('role="dialog"');
      expect(out).toContain('Corporate Comedy');
    }
  });

  it('while popped out, the card says so and offers Bring back; the list floats', () => {
    const out = render({ popped: true });
    expect(out).toContain('Showing in the floating window');
    expect(out).toContain('Bring back');
    expect(out).toContain('aria-pressed="true"');
    // No Document PiP under node, so the floating copy is the in-page panel.
    expect(out).toContain('role="dialog"');
    expect(out.split('Corporate Comedy')).toHaveLength(2);
  });

  it('shows the empty state when there is no feedback yet', () => {
    expect(render({ rows: [] })).toContain('No feedback yet — release jokes to start uncovering the target.');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/PopOutPanel.test.ts components/CustomerFeedbackCard.test.ts`
Expected: both files fail to load (`Failed to load url ./PopOutPanel`, `Failed to load url ./CustomerFeedbackCard`).

- [ ] **Step 3: Write the pop-out**

Create `components/PopOutPanel.tsx`:

```tsx
/* PopOutPanel — float some of the page above everything else.

   Where the browser supports Document Picture-in-Picture (Chrome and Edge on
   desktop: `'documentPictureInPicture' in window`), `open` asks for an
   always-on-top window of POP_OUT_WIDTH × POP_OUT_HEIGHT and renders `children`
   into its body through a React portal, so the content stays live from the same
   state. Everywhere else — and whenever requestWindow rejects, for example
   because the click was not a user gesture — it shows PopOutFallbackPanel, a
   panel fixed to the bottom-right of the page.

   Styling the PiP window. The app styles itself with the Tailwind Play CDN,
   which generates a <style> tag in the page's <head> from the classes it sees in
   the page's DOM. mirrorStyles copies every <style> and stylesheet <link> into
   the window and a MutationObserver keeps the copies in sync as Tailwind
   regenerates. Classes that only ever appear inside the PiP window would never
   be generated by the page's Tailwind, so the same CDN script is also loaded
   into the window (tailwindCdnSrc), where it generates them from the window's
   own DOM.

   Closing. The user closing the window (or the game tab closing, which closes
   it too) fires `pagehide` on it, which calls `onClose`; the parent sets
   `open` false and the portal unmounts. Setting `open` false closes the window.

   The parent decides whether a pop-out is offered at all (Marketing's own
   screen only, never in watch mode). Mount this component unconditionally and
   drive it with `open`, so React StrictMode's mount-time double effect never
   requests two windows. */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const POP_OUT_WIDTH = 360;
export const POP_OUT_HEIGHT = 520;

/** The slice of the Document Picture-in-Picture API this file uses (not in TS's DOM lib yet). */
interface DocumentPictureInPictureApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

/** True when `win` offers Document Picture-in-Picture (Chrome and Edge on desktop). */
export function supportsDocumentPiP(win: unknown): boolean {
  if (typeof win !== 'object' || win === null) return false;
  if (!('documentPictureInPicture' in win)) return false;
  const api = (win as { documentPictureInPicture?: Partial<DocumentPictureInPictureApi> | null }).documentPictureInPicture;
  return typeof api?.requestWindow === 'function';
}

/**
 * Opens the always-on-top window, titled `title`. Resolves null when the
 * browser has no Document PiP or the request is refused, so the caller falls
 * back to the in-page panel.
 */
export async function requestPopOutWindow(win: unknown, title: string): Promise<Window | null> {
  if (!supportsDocumentPiP(win)) return null;
  const api = (win as { documentPictureInPicture: DocumentPictureInPictureApi }).documentPictureInPicture;
  try {
    const pip = await api.requestWindow({ width: POP_OUT_WIDTH, height: POP_OUT_HEIGHT });
    pip.document.title = title;
    return pip;
  } catch {
    return null;
  }
}

/** Calls `onClosed` once when the window goes away (closed by the user, or by its tab closing). */
export function onPopOutClosed(pip: Pick<Window, 'addEventListener' | 'removeEventListener'>, onClosed: () => void): () => void {
  const handler = () => onClosed();
  pip.addEventListener('pagehide', handler);
  return () => pip.removeEventListener('pagehide', handler);
}

/** The Tailwind Play CDN script the page loads, or null when it loads none. */
export function tailwindCdnSrc(doc: Pick<Document, 'querySelector'>): string | null {
  const script = doc.querySelector('script[src*="cdn.tailwindcss.com"]');
  return script?.getAttribute('src') ?? null;
}

/**
 * Copies every <style> and stylesheet <link> in `source`'s head into
 * `target`'s head and keeps them in sync: a changed <style> (the Tailwind CDN
 * rewrites its own on every new class) is updated in place, a new one is
 * added, a removed one is removed. Links are copied by absolute URL and never
 * re-added, so fonts and stylesheets do not reload. Returns a stop function.
 */
export function mirrorStyles(source: Document, target: Document): () => void {
  const copies = new Map<Element, Element>();
  const sync = () => {
    const live = new Set<Element>();
    source.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
      live.add(node);
      const existing = copies.get(node);
      if (node.tagName === 'STYLE') {
        if (!existing) {
          const copy = target.createElement('style');
          copy.textContent = node.textContent;
          target.head.appendChild(copy);
          copies.set(node, copy);
        } else if (existing.textContent !== node.textContent) {
          existing.textContent = node.textContent;
        }
      } else if (!existing) {
        const copy = target.createElement('link');
        copy.rel = 'stylesheet';
        copy.href = (node as HTMLLinkElement).href;
        target.head.appendChild(copy);
        copies.set(node, copy);
      }
    });
    copies.forEach((copy, node) => {
      if (!live.has(node)) {
        copy.remove();
        copies.delete(node);
      }
    });
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(source.head, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}

export interface PopOutPanelProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** The in-page fallback: fixed bottom-right, 360 px wide, at most 70 % of the viewport high. */
export const PopOutFallbackPanel: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title, onClose, children,
}) => (
  <div
    role="dialog"
    aria-label={title}
    className="fixed bottom-4 right-4 z-40 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
    style={{ width: POP_OUT_WIDTH, maxWidth: 'calc(100vw - 2rem)', maxHeight: '70vh' }}
  >
    <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2">
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${title}`}
        className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <X size={16} />
      </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
  </div>
);

type Mode = { kind: 'closed' } | { kind: 'pending' } | { kind: 'pip'; win: Window } | { kind: 'panel' };

const currentWindow = (): Window | undefined => (typeof window === 'undefined' ? undefined : window);

export const PopOutPanel: React.FC<PopOutPanelProps> = ({ title, open, onClose, children }) => {
  // Without Document PiP the panel is known up front (and renders in a static render).
  const [mode, setMode] = useState<Mode>(() =>
    open && !supportsDocumentPiP(currentWindow()) ? { kind: 'panel' } : { kind: 'closed' });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setMode({ kind: 'closed' });
      return undefined;
    }
    const win = currentWindow();
    if (!win || !supportsDocumentPiP(win)) {
      setMode({ kind: 'panel' });
      return undefined;
    }
    let cancelled = false;
    let pip: Window | null = null;
    let stopMirror: (() => void) | null = null;
    let stopWatching: (() => void) | null = null;
    setMode({ kind: 'pending' });
    void requestPopOutWindow(win, title).then(w => {
      if (cancelled) {
        w?.close();
        return;
      }
      if (!w) {
        setMode({ kind: 'panel' });
        return;
      }
      pip = w;
      stopMirror = mirrorStyles(win.document, w.document);
      const tailwind = tailwindCdnSrc(win.document);
      if (tailwind) {
        const script = w.document.createElement('script');
        script.src = tailwind;
        w.document.head.appendChild(script);
      }
      w.document.body.style.margin = '0';
      stopWatching = onPopOutClosed(w, () => onCloseRef.current());
      setMode({ kind: 'pip', win: w });
    });
    return () => {
      cancelled = true;
      stopWatching?.();
      stopMirror?.();
      pip?.close();
    };
  }, [open, title]);

  if (!open) return null;
  if (mode.kind === 'pip') {
    return createPortal(<div className="space-y-3 p-3">{children}</div>, mode.win.document.body);
  }
  if (mode.kind === 'panel') {
    const panel = <PopOutFallbackPanel title={title} onClose={onClose}>{children}</PopOutFallbackPanel>;
    // A portal keeps the fixed panel clear of any transformed ancestor; a static
    // render (tests) has no document and renders it in place.
    return typeof document === 'undefined' ? panel : createPortal(panel, document.body);
  }
  return null;
};

export default PopOutPanel;
```

- [ ] **Step 4: Write Marketing's feedback card**

Create `components/CustomerFeedbackCard.tsx`:

```tsx
/* Marketing's "Customer feedback" card, with its Pop out button.

   Pop out floats the same live list above the game (components/PopOutPanel.tsx):
   a Document Picture-in-Picture window in Chrome and Edge, a panel pinned to the
   bottom-right of the page elsewhere. While it is out, the card stays in place
   and says "Showing in the floating window", with "Bring back" to close it.

   `canPopOut` is false in watch mode: the pop-out is for Marketing's own
   screen only, so a watch tab gets the plain card. */
import React, { useState } from 'react';
import { PictureInPicture2 } from 'lucide-react';
import { Card } from './ui';
import { BRAND } from '../config/brand';
import { FeedbackCard } from './FeedbackCard';
import { PopOutPanel } from './PopOutPanel';
import type { FeedbackRow } from '../views/feedback';

export const CUSTOMER_FEEDBACK_TITLE = 'Customer feedback';

export const FeedbackList: React.FC<{ rows: FeedbackRow[] }> = ({ rows }) =>
  rows.length === 0 ? (
    <p className="text-sm text-gray-400 italic py-4 text-center">
      No feedback yet — release jokes to start uncovering the target.
    </p>
  ) : (
    <>{rows.map(r => <FeedbackCard key={r.joke_id} row={r} />)}</>
  );

export interface CustomerFeedbackCardViewProps {
  rows: FeedbackRow[];
  canPopOut: boolean;
  popped: boolean;
  onPopOut: () => void;
  onBringBack: () => void;
}

/** Stateless, so tests can render both states. */
export const CustomerFeedbackCardView: React.FC<CustomerFeedbackCardViewProps> = ({
  rows, canPopOut, popped, onPopOut, onBringBack,
}) => {
  const out = canPopOut && popped;
  return (
    <>
      <Card
        title={CUSTOMER_FEEDBACK_TITLE}
        subtitle="Which criteria landed and which missed — the customers never say by how much"
        accent={BRAND.sold}
        action={canPopOut ? (
          <button
            type="button"
            onClick={out ? onBringBack : onPopOut}
            aria-pressed={out}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <PictureInPicture2 size={13} aria-hidden="true" />
            {out ? 'Bring back' : 'Pop out'}
          </button>
        ) : undefined}
      >
        {out ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-gray-500">Showing in the floating window</p>
            <button
              type="button"
              onClick={onBringBack}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Bring back
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            <FeedbackList rows={rows} />
          </div>
        )}
      </Card>
      {canPopOut && (
        <PopOutPanel title={CUSTOMER_FEEDBACK_TITLE} open={out} onClose={onBringBack}>
          <div className="space-y-3">
            <FeedbackList rows={rows} />
          </div>
        </PopOutPanel>
      )}
    </>
  );
};

export const CustomerFeedbackCard: React.FC<{ rows: FeedbackRow[]; canPopOut: boolean }> = ({ rows, canPopOut }) => {
  const [popped, setPopped] = useState(false);
  return (
    <CustomerFeedbackCardView
      rows={rows}
      canPopOut={canPopOut}
      popped={popped}
      onPopOut={() => setPopped(true)}
      onBringBack={() => setPopped(false)}
    />
  );
};

export default CustomerFeedbackCard;
```

- [ ] **Step 5: Use it on Marketing's screen**

In `views/QualityControl.tsx`, replace:

```tsx
/* The feedback mapper and its card moved out of this file when the Joke Maker
   started showing the same per-team rows — see views/feedback.ts. */
import { toFeedbackRows } from './feedback';
import { FeedbackCard } from '../components/FeedbackCard';
```

with:

```tsx
/* The feedback mapper lives in views/feedback.ts; the card, with its Pop out
   button, in components/CustomerFeedbackCard.tsx. */
import { toFeedbackRows } from './feedback';
import { CustomerFeedbackCard } from '../components/CustomerFeedbackCard';
```

In `views/QualityControl.tsx`, replace:

```tsx
          <Card
            title="Customer feedback"
            subtitle="Which criteria landed and which missed — the customers never say by how much"
            accent={BRAND.sold}
          >
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {feedbackRows.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  No feedback yet — release jokes to start uncovering the target.
                </p>
              ) : (
                feedbackRows.map(r => <FeedbackCard key={r.joke_id} row={r} />)
              )}
            </div>
          </Card>
```

with:

```tsx
          {/* Pop out floats this list above the game; never offered in a watch tab. */}
          <CustomerFeedbackCard rows={feedbackRows} canPopOut={!watching} />
```

- [ ] **Step 6: Describe it in the guide**

In `docs/lean-market-mode.md`, replace:

```markdown
The **Customer feedback** panel is unchanged: it shows which of the criteria landed and which
missed, never by how much.
```

with:

```markdown
The **Customer feedback** panel shows which of the criteria landed and which missed, never by how
much. It is on Marketing's screen only. **Pop out** in its header floats the same live list above
the game: in Chrome and Edge on a computer it opens a small always-on-top window ("Customer
feedback", 360 × 520) that stays in front while Marketing works; in other browsers it opens a
panel pinned to the bottom-right of the page. While it is out, the card reads "Showing in the
floating window"; **Bring back** (or closing the window) puts it back. Watching a bot's Marketing
seat from the Bot Panel shows no Pop out button.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/PopOutPanel.test.ts components/CustomerFeedbackCard.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  2 passed (2)`, `Tests  13 passed (13)`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests ' && npx vite build 2>&1 | tail -1`
Expected: tsc exits 0; `Test Files  37 passed (37)`, `Tests  622 passed (622)`; `✓ built in …`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components/PopOutPanel.tsx components/PopOutPanel.test.ts components/CustomerFeedbackCard.tsx \
  components/CustomerFeedbackCard.test.ts views/QualityControl.tsx docs/lean-market-mode.md
git commit -m "feat(feedback): Marketing can pop the customer feedback out above the game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Final verification, local stack and browser checklist

**Repo:** both (no code changes; commit only if a check fails and you fix it, as a new commit in the repo concerned).

**Files:** none (the compose override lives in the scratchpad, never in a repo).

**Interfaces:** Consumes everything above. Produces nothing.

- [ ] **Step 1: Backend, full**

Run: `cd ~/Documents/GitHub/jokefactory_be && gofmt -l src && go build ./... && go vet ./... && go vet -tags integration ./src/infra/repo/postgres/ && go test ./... && git status --short`
Expected: `gofmt -l` prints nothing; every package `ok`; clean tree.

- [ ] **Step 2: Frontend, full**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests ' && npx vite build 2>&1 | tail -1 && git status --short`
Expected: tsc exits 0; `Test Files  37 passed (37)`, `Tests  622 passed (622)`; `✓ built in …`; status shows only ` M .claude/launch.json` and `?? .progress`.

- [ ] **Step 3: Migrate the local game database (before the new image)**

```bash
cd ~/Documents/GitHub/jokefactory_be
DB_DSN="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" make migrate-up
DB_DSN="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" make migrate-status 2>&1 | tail -2
```
Expected: `OK   0004_batch_marketing_note.sql`, then status lists `0004_batch_marketing_note.sql` as applied. (The API still running from the old image ignores the new column.)

Run the integration tests against the game database:
`cd ~/Documents/GitHub/jokefactory_be && JF_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/jokefactory?sslmode=disable" go test -count=1 -tags integration ./src/infra/repo/postgres/ -v 2>&1 | grep -E '^(--- |ok|FAIL)'`
Expected: `TestLeanChartsSQLIntegration`, `TestLeanStatsSQLIntegration`, `TestMarketingNoteIntegration` PASS (each deletes its own rows).

- [ ] **Step 4: Rebuild the local stack**

The stock `docker-compose.yml` publishes Postgres on 5432, which a host Postgres already holds, and the running containers were created with an override that published it on 55432. That override file is gone; recreate it (Compose concatenates `ports` lists, so `!override` is required to drop 5432):

```bash
mkdir -p /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean
cat > /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean/compose.override.yml <<'EOF'
# Local only: a Postgres on the host already listens on 5432, so publish the
# compose Postgres on 55432 instead (the port the integration tests use).
services:
  postgres:
    ports: !override
      - "55432:5432"
EOF
cd ~/Documents/GitHub/jokefactory_be
APP_LLM_MODE=hash APP_LLM_HASH_CONFIRM=local-pilot-only docker compose \
  -f docker-compose.yml \
  -f /private/tmp/claude-501/-Users-frankfu-Documents-GitHub-AI-Joke-Factory/5d3ab128-29ff-485e-92d2-950202272f87/scratchpad/lean/compose.override.yml \
  up -d --build
docker ps --format '{{.Names}} {{.Ports}}' | grep jokefactory
curl -s http://localhost:8081/health
```
Expected: `jokefactory_be-api-1 0.0.0.0:8081->8080/tcp…` and `jokefactory-postgres 0.0.0.0:55432->5432/tcp…`; health returns `{"status":…}`. (`APP_ADMIN_PASSWORD` comes from `jokefactory_be/.env`, which Compose reads itself.)

- [ ] **Step 5: Seed one team and a batch through the API**

The password is read by shell substitution and never printed. This resets the LOCAL game. Shell variables do not survive from one command run to the next, so each block below sets the ones it uses from values printed by an earlier block (`<IID>`, `<R1>`, `<JM>`, `<MKT>`, `<TEAM>`).

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
BE=http://localhost:8081
IID=$(jq -n --arg p "$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
  '{display_name:"Local Instructor", password:$p}' \
  | curl -s -X POST $BE/v1/instructor/login -H 'Content-Type: application/json' -d @- | jq -r '.user.user_id')
curl -s -X POST -H "X-User-Id: $IID" $BE/v1/admin/reset | jq -c .
# The reset may remove the instructor user; log in again.
IID=$(jq -n --arg p "$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
  '{display_name:"Local Instructor", password:$p}' \
  | curl -s -X POST $BE/v1/instructor/login -H 'Content-Type: application/json' -d @- | jq -r '.user.user_id')
R1=$(curl -s $BE/v1/rounds/active | jq -r '.data.rounds[] | select(.round_number==1) | .id')
for n in "Note JM" "Note Marketing"; do
  curl -s -X POST $BE/v1/session/join -H 'Content-Type: application/json' -d "$(jq -n --arg n "$n" '{display_name:$n}')" | jq -c '.user'
done
curl -s -X POST -H "X-User-Id: $IID" -H 'Content-Type: application/json' $BE/v1/instructor/rounds/$R1/assign -d '{"team_count":1}' | jq -c .
curl -s -H "X-User-Id: $IID" $BE/v1/instructor/rounds/$R1/lobby | jq -c '.data.Teams[0] | {team: .Team.id, members: [.Members[] | {UserID, DisplayName, Role}]}'
echo "IID=$IID R1=$R1"
```
Read `JM` (the member whose `Role` is `JM`), `MKT` (`Role` `MARKETING`) and `TEAM` (`team`) off the lobby line, then start Round 1 (Classic, the reset default) with the default ideal profile and send one five-joke batch as the Joke Maker:

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
BE=http://localhost:8081; IID=<IID>; R1=<R1>; JM=<JM UserID>; MKT=<MARKETING UserID>; TEAM=<team ID>
IDEAL=$(npx tsx -e "import('./config/dimensions.ts').then(m=>console.log(JSON.stringify(m.DEFAULT_IDEAL_PROFILE)))")
curl -s -X POST -H "X-User-Id: $IID" -H 'Content-Type: application/json' $BE/v1/instructor/rounds/$R1/start \
  -d "$(jq -n --argjson p "$IDEAL" '{ideal_profile:$p}')" | jq -c '.data.round | {id, status}'
curl -s -X POST -H "X-User-Id: $JM" -H 'Content-Type: application/json' $BE/v1/rounds/$R1/batches \
  -d "$(jq -n --argjson t $TEAM '{team_id:$t, jokes:["My boss said dress for the job you want. Now I am in HR trouble for the cape.","I told my team we need synergy. They synergised an early lunch.","Our printer only jams when the deadline is near. It has a sense of drama.","The meeting could have been an email. The email could have been a nap.","I asked IT to fix my attitude. They told me to turn it off and on again."]}')" | jq -c '.data.batch | {batch_id, status}'
```
Expected: the round reads `ACTIVE`; the batch is `SUBMITTED`.

- [ ] **Step 6: Release with a note as Marketing; read it as the Joke Maker**

Read the `anthropic-skills:built-in-browser` skill before the first browser step.

1. `preview_start` with name `joke-factory-lean-local` (http://localhost:3005, pointed at the local API). Sign the tab in as the Marketing user with `javascript_tool` (no password involved):
   ```js
   localStorage.setItem('joke_factory_user_id', '<MKT>');
   localStorage.setItem('joke_factory_display_name', 'Note Marketing');
   localStorage.setItem('joke_factory_role', 'UNASSIGNED');
   localStorage.removeItem('joke_factory_round_id');
   location.reload();
   ```
   Expected (`get_page_text`): the Marketing Desk with the five jokes; "Note to your Joke Maker (sent with this batch)"; "0/500"; no "Jokes standing still" and no "More cycles, more learning"; a "Customer feedback" card with a "Pop out" button. `find` "What should they change next? What did customers like?" finds the textarea.
2. Select the first joke card, pick any Topic, type a title. Click the note textarea and type `Shorter setups, please.`, press `Enter` (a newline inside the textarea), then type `<b>More</b> office puns`. Expected: the counter reads `47/500`.
3. Click **Release to market**. Expected: the toast reads `Released 1 joke · −$0.10 · note sent`; the note box is empty again (`0/500`).
4. Check the wire: `JM=<JM>; R1=<R1>; TEAM=<TEAM>; curl -s -H "X-User-Id: $JM" http://localhost:8081/v1/rounds/$R1/teams/$TEAM/batches | jq -c '.data.batches[] | {batch_id, status, marketing_note}'`
   Expected: the batch is `PROCESSED` with `"marketing_note":"Shorter setups, please.\n<b>More</b> office puns"`.
5. Open a new tab at `http://localhost:3005/?watch=<JM>&watchName=Note%20JM` (a watch tab keeps its identity per tab). In **Value stream**, the batch row shows the speech-bubble icon; `find` "Marketing left a note" finds it. Click the row. Expected: a violet "From Marketing" callout above the jokes, the text on two lines, `<b>More</b>` shown literally (not bold). Screenshot it.
6. On that Joke Maker tab: `get_page_text` contains no "Customer feedback", no "Jokes standing still", no "More cycles, more learning"; wait 10 s, then `read_network_requests` with `urlPattern: "/feedback"` → no requests (while `urlPattern: "/batches"` shows the 2.5 s poll).

- [ ] **Step 7: The pop-out**

On the Marketing tab:
1. `javascript_tool`: `'documentPictureInPicture' in window` — note the answer.
2. Click **Pop out**.
   - If the answer was `false` (or the window was refused): a panel appears bottom-right with the header "Customer feedback" and a × button, about 360 px wide; the card reads "Showing in the floating window" with "Bring back". Scroll the page: the panel stays put. Click the note textarea under it: it takes focus (the page stays clickable). Screenshot. Click × → the panel closes and the card shows the list and "Pop out" again.
   - If the answer was `true`: a separate always-on-top window opens. Verify it from the page with `javascript_tool`:
     ```js
     const w = documentPictureInPicture.window;
     ({ title: w?.document.title, styles: w?.document.head.querySelectorAll('style').length,
        tailwind: !!w?.document.querySelector('script[src*="cdn.tailwindcss.com"]'),
        padded: w ? w.getComputedStyle(w.document.body.firstElementChild).paddingTop : null,
        text: w?.document.body.innerText.slice(0, 80) })
     ```
     Expected: title "Customer feedback", `styles` ≥ 1, `tailwind` true, `padded` "12px" (Tailwind's `p-3` applied inside the window), text starts with the feedback (or "No feedback yet — release jokes to start uncovering the target."). Then click **Bring back** → `documentPictureInPicture.window` is `null` and the card shows the list again. Pop out again and close the window with `javascript_tool` `documentPictureInPicture.window.close()` → the card reads "Pop out" again.
3. Open `http://localhost:3005/?watch=<MKT>&watchName=Note%20Marketing` in a new tab. Expected: the "Customer feedback" card has no "Pop out" button; the note box is disabled (read-only seat).

- [ ] **Step 8: The over-limit note over HTTP, and the instructor screen**

1. Send a second batch as the Joke Maker (only the `curl … /v1/rounds/$R1/batches` command of Step 5 again, with its variables set), then claim it as Marketing and publish with a 501-character note:
   ```bash
   R1=<R1>; MKT=<MKT>
   BID=$(curl -s -H "X-User-Id: $MKT" "http://localhost:8081/v1/marketing/queue/next?round_id=$R1" | jq -r '.data.batch.batch_id')
   JOKES=$(curl -s -H "X-User-Id: $MKT" "http://localhost:8081/v1/marketing/queue/next?round_id=$R1" | jq -c '[.data.jokes[] | {joke_id, joke_title:"T", is_published:true}]')
   curl -s -X POST -H "X-User-Id: $MKT" -H 'Content-Type: application/json' http://localhost:8081/v1/marketing/batches/$BID/publish \
     -d "$(jq -n --argjson j "$JOKES" --arg n "$(printf 'x%.0s' $(seq 1 501))" '{jokes:$j, note:$n}')" | jq -c .
   ```
   Expected: `{"error":{"code":"VALIDATION_ERROR","message":"must be at most 500 characters","field":"note",…}}`; the Marketing tab still shows that batch, undecided.
2. On the Marketing tab, switch the identity to the instructor and reload:
   ```js
   localStorage.setItem('joke_factory_user_id', '<IID>');
   localStorage.setItem('joke_factory_display_name', 'Local Instructor');
   localStorage.setItem('joke_factory_role', 'INSTRUCTOR');
   localStorage.setItem('joke_factory_round_id', '<R1>');
   location.reload();
   ```
   Expected: the instructor dashboard as before — `get_page_text` contains "Cumulative Sales Over Time" (Round 1 is Classic) and no "Note to your Joke Maker", "From Marketing" or "Pop out"; `read_console_messages` with `onlyErrors: true` shows nothing new.

- [ ] **Step 9: Hand off**

Report to the user: the commits in each repo (`git log --oneline 67cf96a..HEAD` in the backend, `git log --oneline 94be133..HEAD` in the frontend), the test counts, the integration result, and the screenshots (Marketing desk with the note box, the toast, the Joke Maker's callout, the pop-out or fallback panel). Deploying needs migration 0004 on the production database **before** the new backend image. Do not push or merge without the user's go-ahead.

---

## Self-review (done while writing; kept for the reviewer)

- **Spec coverage.** §4.1 student charts (both views, component + test, `cyclesForStudent` + `leanRound1Id` + tests, backend team route kept, docs) → Task 3. §4.2 Marketing-only feedback (JM card removed, poll gated to `QUALITY_CONTROL`, test asserts Marketing yes / JM no / others no, backend access unchanged) → Task 4. §4.3 backend (migration, `Note *string`, trim, NULL, 500 runes 400 `note` "must be at most 500 characters", same transaction, release and discard, list returns `marketing_note`, memstore) → Tasks 1–2; Marketing screen (label, helper, placeholder, counter, stop at 500, send with Release and Discard, clear after success, " · note sent", comment replaced) → Task 5; Joke Maker screen (MessageSquare icon + tooltip, callout heading, pre-wrap, no HTML, violet, unchanged without a note, no new request) → Task 5; bots unchanged and a manual check → Global Constraints, Task 7. §4.4 pop-out (button + icon in the header, PiP 360×520, styles copied and kept in sync, portal, window title, close → "Pop out" again, fallback panel 360 px / 70 % / bottom-right / header / × / above content / clickable page, inline card with "Showing in the floating window" + "Bring back", not in watch mode, one component `{ title, open, onClose, children }`, `supportsDocumentPiP` unit-tested) → Task 6. §5 error handling (400 keeps note and decisions; other failures keep the note; `requestWindow` rejects → panel; missing `marketing_note` → null) → Tasks 5–6 (+ Review Focus 2–4). §6 testing: every Go case (release, discard, whitespace/absent NULL, 501/500, list, migration + integration read-back) → Tasks 1–2; every vitest case (role gating, note in the publish body, `supportsDocumentPiP`, mapping keeps/null, render test of icon and callout) → Tasks 4–6; browser steps 1–6 → Task 7 Steps 5–8. §7 out of scope → Global Constraints.
- **Placeholder scan.** No TBD/TODO; every code step has the full code; every modification quotes an exact anchor and its exact replacement. Values the implementer reads at run time (`<MKT>`, `<JM>`, `<TEAM>`, `<IID>`, `<R1>`) are produced by the preceding commands of the same step.
- **Type consistency.** Go: `PublishBatch(…, requireAtLeastOnePublished bool, note *string)` is the same in the port (Task 1 Step 7), Postgres, memstore and both call sites; `MarketingNote *string` in `domain.Batch` is read by `scanBatch`, `cloneBatch`, the handler and the tests; `PublishWithNote`/`NormalizeMarketingNote` names match between Task 1 code and tests. JSON keys `note` and `marketing_note` match between `dto.PublishRequest`, `handler/batch.go`, `types/api.ts`, `types.ts`, `buildPublishBody`, `mapBatchFromTeamList` and every fixture. TS: `MARKETING_NOTE_MAX` (marketingService) is used by `QualityControl`; `releaseOutcome`'s `{ toast, clearNote }` is what `release()` reads; `marketingNoteOf`/`MarketingNoteIcon`/`MarketingNoteCallout` are what `BatchCard` imports; `CustomerFeedbackCard({ rows, canPopOut })` is what `QualityControl` renders; `PopOutPanel({ title, open, onClose, children })` is what `CustomerFeedbackCardView` renders.
- **Review Focus.** Each of the five classes names its tests in the owning task, and the two that a static test cannot reach (styles inside a real PiP window; network traffic of the real Joke Maker poll) have explicit browser checks in Task 7.
- **Verified.** Every code block and edit in this plan was extracted from this document into scratch copies of both repos and applied in task order: backend `gofmt -l`, `go build`, `go vet` (also `-tags integration`) and `go test ./...` pass; the integration tests pass against a throwaway database migrated through 0004 on the local Postgres (rows cleaned up, database dropped); frontend `tsc` exits 0, `vitest` passes 622 tests in 37 files, `vite build` succeeds. The per-task counts above come from running the suite after each task.

## Spec ambiguities and how this plan resolves them

1. **"stop input at 500" vs "500 characters counted in runes".** A textarea's `maxLength` counts UTF-16 code units, the backend counts runes. Resolution: `maxLength={500}` plus a `slice(0, 500)` guard; code units are never fewer than runes, so the box can never hold a note the backend rejects for length (an emoji-heavy note simply stops earlier in the box). The counter shows the same code-unit count the box enforces.
2. **"send `note: batchFeedback`".** Resolution: the note goes on the wire as typed whenever it has non-blank text, and is left off entirely when blank, so a publish without a note is byte-for-byte today's request (which also keeps the bots' requests identical). The backend treats absent and blank identically (NULL).
3. **"The box clears after success" / failures.** Today `publishBatch` swallows errors and the desk shows "Released …" even after a failed publish. Resolution: `publishBatch` resolves `true`/`false`; the toast (with " · note sent") and the clearing happen only on `true`; on `false` the alert has already shown and the note and decisions stay. The existing per-error alert texts are kept verbatim (moved into `publishFailureMessage`); the note error adds one message that includes the server's text.
4. **Where validation lives.** The spec puts trimming and the 500 limit in "the publish use case". Resolution: `usecase.NormalizeMarketingNote` (exported so the rule is tested directly) runs before any repository call; the repository only stores the already-normalised value inside `markBatchProcessed`, the statement that flips the batch to `PROCESSED`, so the note shares the publish transaction and a rolled-back publish writes no note.
5. **NUL characters.** Not in the spec, but Postgres TEXT rejects `\x00`, which would surface as a 500. Resolution: NULs are dropped before trimming (a NUL-only note stores NULL).
6. **Keeping `Publish`.** Nine existing tests call `MarketingService.Publish(ctx, user, batch, decisions)`. Resolution: keep that signature as a wrapper for `PublishWithNote(…, nil)`; the HTTP handler calls `PublishWithNote`.
7. **What the header button says while popped out.** The spec says it reads "Pop out" again after closing, implying a different label while out, but does not name it. Resolution: the header button toggles to "Bring back" (with `aria-pressed`), matching the body's "Bring back" button.
8. **Tailwind classes in the PiP window.** Copying the page's Tailwind `<style>` covers only classes the page itself has rendered. Resolution: besides mirroring the styles as the spec says, the Tailwind Play CDN script (found by `tailwindCdnSrc`) is loaded into the PiP window so it generates classes from the window's own DOM; Task 7 checks `p-3` resolves to 12 px inside the window.
9. **Watch mode and the note box.** The spec only says the pop-out is not offered in watch mode. Resolution: `canPopOut={!watching}`; the note box is already disabled in watch mode by the Marketing Desk's existing `<fieldset disabled={watching}>`, so a watcher cannot send a note for a bot.
10. **Fallback panel stacking.** "Sits above page content" without a z-index. Resolution: `z-40`, below the app's `z-50` modals and toasts, so the decision nudges and the release toast still show over it; no backdrop, so the page stays clickable.
11. **Docs scope.** The spec only asks to remove the student-chart text. Resolution: also correct the guide's statements that became false (the Joke Maker sees the feedback panel; "improve the next batch using the customer feedback") and describe the note and Pop out where Marketing's and the Joke Maker's screens are described.
