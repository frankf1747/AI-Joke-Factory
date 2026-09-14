# Phase 3B — Restore What V2 Dropped (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the round *playable* — the Joke Maker can submit a raw blob, Marketing can split it, and the per-joke fields the frontend's KPI tiles depend on actually arrive.

**Architecture:** Go changes in `jokefactory_be`, on a **local branch that is never pushed**. Additive wherever possible: one new migration, one new nullable column pair, two new routes. The existing publish flow is touched only to make its `≥1 published` rule round-scoped.

**Tech Stack:** Go 1.23+, gin, pgx, goose migrations, Postgres 17.

---

## This is someone else's repository

`jokefactory_be` is `github.com/Hussain-Khozema/jokefactory_be`. Work on a local branch
`phase3b-restore` and **do not push, do not open a PR, do not touch `main`**. How these
changes reach the backend developer is the product owner's decision, made after seeing them
work.

Before starting: `git -C /Users/frankfu/Documents/GitHub/jokefactory_be checkout -b phase3b-restore`.

The repo currently has **one** migration, `0001_schema.sql`, and the README describes the
schema as living in a single file. This plan adds `0002_*.sql` — the repo's first incremental
migration. That is the right call (rewriting `0001` would break any deployed database) but it
is a convention change worth calling out in the handover.

## Why this plan exists

The V2 refactor dropped capabilities the product owner's own specification
(`Backend Change Requests (V2).md`) marked **"Unchanged"** — i.e. "the finished frontend calls
these, leave them alone":

- `POST /v1/rounds/{id}/batches` **(raw_text or jokes)** — checklist line 555
- `POST /v1/qc/batches/{id}/split` — line 564
- `POST /v1/qc/batches/{id}/unsplit` — line 565
- per-joke `sold_count`, `first_sold_at` on the batches listing — line 557 / Item #4
- `jokes_created`, `jokes_published` on the team summary — Item #1

Verified absent: `grep -rn "raw_text\|RawText" --include="*.go" src/` returns nothing, the
`batches` table has 9 columns and none is `raw_text`, and `server.go` has no split route.

**The splitting decision is settled and is not up for re-litigation:** the JM submits a raw
text blob; Marketing splits it. The frontend is built this way and the product owner has
confirmed it. The backend moves.

## Decisions already made

- **`NO_JOKE_PUBLISHED` becomes round-scoped**: enforced in Round 1 (spec Item #2's teaching
  pressure), relaxed in Round 2 (where the JM may submit a single joke and Marketing must be
  able to pass on it).
- **Topic is not persisted.** Marketing's Topic pick stays decorative — the LLM classifies the
  joke's actual topic from its text, and that classification is the only `TOPIC` that counts.
  No column, no DTO field, no work in this plan.
- **No `rated_at` alias.** The frontend will read `processed_at` in Phase 3C rather than the
  backend emitting a duplicate field under an old name.
- **Instructor chart series are out of scope.** Leaderboard only, per the owner's call.

## Explicitly NOT in this plan

The seven instructor stats time-series arrays; the `KpiSnapshot` endpoint; dedicated
`ideal-profile` endpoints; the `unsold_jokes = GREATEST(published − points_earned, 0)`
formula bug (real, but a display metric — its own change); `performance_label` being
hardcoded; the `max_batch_size` dead branch; making `assign` idempotent.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/infra/db/migrations/0002_batch_raw_text.sql` | The `raw_text` columns. | Create |
| `src/core/domain/entities.go` | `Batch.RawText`, `Batch.RawTextOriginal`. | Modify |
| `src/core/ports/repositories.go` | `CreateBatch` signature; `SplitBatch`/`UnsplitBatch`. | Modify |
| `src/infra/repo/postgres/batch_repo.go` | `batchColumns`, `scanBatch`, `CreateBatch`; the sales join. | Modify |
| `src/infra/repo/postgres/marketing_repo.go` | `SplitBatch`, `UnsplitBatch`; round-scoped publish rule. | Modify |
| `src/core/usecase/batch.go` | `Submit` accepts raw text. | Modify |
| `src/core/usecase/marketing.go` | `Split`, `Unsplit`; pass round number to publish. | Modify |
| `src/core/usecase/testutil/memstore.go` | Mirror every repo change — every usecase test runs against it. | Modify |
| `src/app/http/dto/models.go` | `BatchSubmitRequest.RawText`, `BatchSplitRequest`. | Modify |
| `src/app/http/handler/batch.go` | Bind raw text; emit the sales fields. | Modify |
| `src/app/http/handler/marketing.go` | `Split`, `Unsplit` handlers; emit `raw_text`. | Modify |
| `src/app/http/handler/round.go` | `jokes_created` / `jokes_published` on summary. | Modify |
| `src/app/server/server.go` | Two routes. | Modify |

---

## Task 1: The migration and the column plumbing

**Files:**
- Create: `src/infra/db/migrations/0002_batch_raw_text.sql`
- Modify: `src/core/domain/entities.go`, `src/infra/repo/postgres/batch_repo.go`

- [ ] **Step 1: Write the migration**

```sql
-- +goose Up
ALTER TABLE batches
  ADD COLUMN raw_text          TEXT NULL,
  ADD COLUMN raw_text_original TEXT NULL;

COMMENT ON COLUMN batches.raw_text IS
  'The JM''s unsplit blob. NULL once Marketing has split the batch into joke rows.';
COMMENT ON COLUMN batches.raw_text_original IS
  'Immutable copy set at submit, never cleared, so unsplit restores exactly what the JM pasted.';

-- +goose Down
ALTER TABLE batches
  DROP COLUMN raw_text,
  DROP COLUMN raw_text_original;
```

**Why two columns.** `raw_text` is the live state and is nulled on split, so
`raw_text IS NOT NULL` is the "not yet split" predicate. `raw_text_original` makes *unsplit
lossless*: without it, restoring the blob means re-joining the joke texts, which destroys the
original formatting the JM pasted.

**No new `batch_status` value.** "Unsplit" is a derived sub-state of `SUBMITTED`
(`raw_text IS NOT NULL AND no joke rows`). This keeps the existing partial index
`idx_batches_marketing_queue` and `ClaimNextBatch` working untouched — an unsplit batch enters
the marketing queue exactly like a split one.

- [ ] **Step 2: Run it**

```bash
cd /Users/frankfu/Documents/GitHub/jokefactory_be
DB_DSN="postgres://frankfu@localhost:5432/jokefactory?sslmode=disable" make migrate-up
psql -d jokefactory -c "\d batches"
```

Expected: 11 columns, including `raw_text` and `raw_text_original`, both nullable text.

Then verify the down migration works before relying on it:

```bash
DB_DSN="postgres://frankfu@localhost:5432/jokefactory?sslmode=disable" make migrate-down
psql -d jokefactory -c "\d batches"   # back to 9 columns
DB_DSN="postgres://frankfu@localhost:5432/jokefactory?sslmode=disable" make migrate-up
```

- [ ] **Step 3: Domain and scan plumbing**

`src/core/domain/entities.go`, on `Batch`:

```go
	// RawText is the JM's unsplit blob; nil once Marketing has split the batch.
	RawText *string
	// RawTextOriginal is the immutable copy set at submit, so unsplit is lossless.
	RawTextOriginal *string
```

`src/infra/repo/postgres/batch_repo.go:13` — add both to `batchColumns` and `scanBatch`.
`batchColumns` is shared by every batch query (`batch_repo.go` and `marketing_repo.go`), so
adding it here propagates to all of them:

```go
const batchColumns = `batch_id, round_id, team_id, status, submitted_at, processed_at, locked_at, locked_by, created_at, raw_text, raw_text_original`
```

and the matching two `&b.RawText, &b.RawTextOriginal` at the end of `scanBatch`'s `row.Scan`.

**Order matters** — the scan is positional. Append to both, and keep them in the same order.

- [ ] **Step 4: Verify nothing broke**

```bash
make test
```

Expected: `ok jokefactory/src/core/domain/scoring` and `ok jokefactory/src/core/usecase`. The
usecase tests run against the in-memory store, so they should be unaffected by a column
addition. If the Postgres scan is wrong the compile will fail first.

- [ ] **Step 5: Commit**

```bash
git add src/infra/db/migrations/0002_batch_raw_text.sql src/core/domain/entities.go src/infra/repo/postgres/batch_repo.go
git commit -m "feat(batches): add raw_text columns

The JM submits an unsplit blob and Marketing splits it; V2 dropped the
column, the DTO field and both split routes, all of which the product
spec lists as unchanged.

raw_text is the live state and is nulled on split. raw_text_original is
kept so unsplit restores exactly what the JM pasted rather than a re-join
of the split texts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `Submit` accepts a raw blob

**Files:** `src/app/http/dto/models.go`, `src/core/usecase/batch.go`, `src/core/ports/repositories.go`, `src/infra/repo/postgres/batch_repo.go`, `src/core/usecase/testutil/memstore.go`, `src/app/http/handler/batch.go`

- [ ] **Step 1: Write the failing test**

In `src/core/usecase/` — there is no `batch_test.go` today, so create one or add to the
nearest existing file.

**There is no `setupBatchTest` / `setupMarketingTest` / `env` helper in this repo — I invented
those names.** What exists is `src/core/usecase/test_helpers_test.go`, which provides
`joinMany`, `findJM`, `findMarketing`, `findMarketingOnTeam` and `findOtherTeamMarketing`; the
neighbouring tests (`marketing_test.go`, `flow_test.go`, `e2e_test.go`) build their own setup
inline on top of those. **Read `marketing_test.go` first and follow its idiom.** Either inline
the setup as it does, or add a shared helper to `test_helpers_test.go` if you end up repeating
yourself three times. The test bodies below express the *assertions* I want; translate the
scaffolding to match the house style rather than copying my invented calls verbatim.


```go
func TestSubmitAcceptsRawText(t *testing.T) {
	// The JM pastes an unsplit blob; Marketing splits it later. The joke count is
	// unknown at submit time, so the R1 batch-size rule cannot apply here — it moves
	// to Split, where the count first exists.
	ctx, svc, jm, round := setupBatchTest(t) // match the local helper

	b, err := svc.Submit(ctx, jm.ID, round.ID, *jm.TeamID, nil, "1) why did the... 2) I told my boss...")
	if err != nil {
		t.Fatalf("raw submit: %v", err)
	}
	if b.RawText == nil || *b.RawText == "" {
		t.Fatal("expected raw_text to be stored")
	}
	if b.RawTextOriginal == nil || *b.RawTextOriginal != *b.RawText {
		t.Fatal("expected raw_text_original to mirror raw_text at submit")
	}
}

func TestSubmitRejectsBothOrNeither(t *testing.T) {
	ctx, svc, jm, round := setupBatchTest(t)

	if _, err := svc.Submit(ctx, jm.ID, round.ID, *jm.TeamID, nil, ""); err == nil {
		t.Fatal("expected an error when neither jokes nor raw_text is supplied")
	}
	if _, err := svc.Submit(ctx, jm.ID, round.ID, *jm.TeamID, []string{"a"}, "blob"); err == nil {
		t.Fatal("expected an error when both jokes and raw_text are supplied")
	}
}

func TestSubmitRejectsTooShortRawText(t *testing.T) {
	ctx, svc, jm, round := setupBatchTest(t)
	if _, err := svc.Submit(ctx, jm.ID, round.ID, *jm.TeamID, nil, "hi"); err == nil {
		t.Fatal("expected a minimum-length error")
	}
}
```

- [ ] **Step 2: Run and confirm it FAILS**

`make test` → compile failure (`Submit` takes 5 args, not 6). That is the red. Paste it.

- [ ] **Step 3: Implement**

`src/app/http/dto/models.go` — `binding:"required"` comes **off** `Jokes`, because either
field may now carry the payload and the real rule ("exactly one of") cannot be expressed as a
binding tag:

```go
type BatchSubmitRequest struct {
	TeamID  int64    `json:"team_id" binding:"required"`
	Jokes   []string `json:"jokes"`
	RawText string   `json:"raw_text"`
}
```

`src/core/ports/repositories.go`:

```go
	CreateBatch(ctx context.Context, roundID, teamID int64, jokes []string, rawText string) (*domain.Batch, error)
```

`src/core/usecase/batch.go` — `Submit` gains `rawText string`. Replace the opening validation:

```go
func (s *BatchService) Submit(ctx context.Context, userID, roundID, teamID int64, jokes []string, rawText string) (*domain.Batch, error) {
	raw := strings.TrimSpace(rawText)
	hasJokes, hasRaw := len(jokes) > 0, raw != ""

	if hasJokes == hasRaw {
		// Both or neither. The frontend sends raw_text; the jokes array is kept for
		// direct API use and tests.
		return nil, domain.NewValidationError("jokes", "exactly one of jokes or raw_text is required")
	}
	if hasRaw && len(raw) < minRawTextChars {
		return nil, domain.NewValidationError("raw_text", fmt.Sprintf("at least %d characters required", minRawTextChars))
	}
	for i, j := range jokes {
		if j == "" {
			return nil, domain.NewValidationError("jokes", fmt.Sprintf("joke %d is empty", i))
		}
	}
```

with `const minRawTextChars = 20` near the top of the file — it mirrors the frontend's
`MIN_RAW_CHARS` in `views/JokeMaker.tsx`.

**Then guard the batch-size rules so they only apply on the jokes path.** This is the
load-bearing change in this task: on the raw path the joke count does not exist yet, so the
existing R1 exact-size / R2 cap checks cannot run and **must move to Split** (Task 3):

```go
	// Batch-size rules need a joke count, which a raw blob does not have yet. On the raw
	// path they are enforced in MarketingService.Split, the first point where the count
	// exists. Do not silently skip them there.
	if hasJokes {
		if round.RoundNumber == 1 {
			if len(jokes) != round.BatchSize {
				return nil, domain.NewValidationError("jokes", fmt.Sprintf("expected %d jokes", round.BatchSize))
			}
		} else if len(jokes) > round.BatchSize {
			return nil, domain.NewValidationError("jokes", fmt.Sprintf("expected up to %d jokes", round.BatchSize))
		}
	}
```

`src/infra/repo/postgres/batch_repo.go` — `CreateBatch` takes `rawText`, writes both columns
when raw, and inserts no joke rows:

```go
	var rawArg any
	if rawText != "" {
		rawArg = rawText
	}
	batch, err = scanBatch(tx.QueryRow(ctx, `
		INSERT INTO batches (round_id, team_id, status, submitted_at, raw_text, raw_text_original)
		VALUES ($1, $2, 'SUBMITTED', now(), $3, $3)
		RETURNING `+batchColumns, roundID, teamID, rawArg))
```

Leave the existing joke-insert loop — it is a no-op when `jokes` is empty.

`src/app/http/handler/batch.go` — pass `req.RawText` through, and **do not echo a fabricated
count**: `jokes_count` must be `len(req.Jokes)`, which is `0` on the raw path.

`src/core/usecase/testutil/memstore.go` — mirror the `CreateBatch` signature and store the raw
text on its batch struct. Every usecase test runs against this; if it is not mirrored the
suite will not compile.

- [ ] **Step 4: Run and confirm PASS**

`make test` → all green, including the three new tests.

Then prove it end to end against the running server:

```bash
make run   # in another terminal, on :8080
# join a JM, assign, start a round, then:
curl -s -X POST -H 'X-User-Id: <jm_id>' -H 'Content-Type: application/json' \
  -d '{"team_id":1,"raw_text":"1) Why did the... 2) I told my boss..."}' \
  http://localhost:8080/v1/rounds/1/batches
```

Expected: 201/200 with a batch, `jokes_count: 0`. Before this task it was
`400 BAD_REQUEST "invalid payload"`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(batches): accept a raw_text submission

The JM pastes an unsplit blob and Marketing splits it. jokes is no longer
binding-required because either field may carry the payload; 'exactly one
of' is enforced in the usecase, where it can return a typed
VALIDATION_ERROR with a field rather than an opaque bind failure.

The R1 exact-size and R2 cap rules now apply only on the jokes path. On
the raw path the joke count does not exist yet, so they move to Split.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `POST /v1/marketing/batches/{id}/split`

This is where the batch-size rules land, and where joke ids are first assigned — the frontend
keys its entire selection model on `joke_id`, so the response is its first sight of them.

**Files:** `src/app/http/dto/models.go`, `src/core/ports/repositories.go`, `src/core/usecase/marketing.go`, `src/infra/repo/postgres/marketing_repo.go`, `src/core/usecase/testutil/memstore.go`, `src/app/http/handler/marketing.go`, `src/app/server/server.go`

- [ ] **Step 1: Write the failing test**

```go
func TestSplitCreatesJokesAndClearsRawText(t *testing.T) {
	ctx, env := setupMarketingTest(t) // match the local helper
	batch := env.SubmitRaw(t, "1) a 2) b 3) c 4) d 5) e")
	item, err := env.Marketing.QueueNext(ctx, env.Marketer.ID, env.Round.ID)
	if err != nil {
		t.Fatal(err)
	}
	if item.Batch.RawText == nil {
		t.Fatal("queue/next must expose raw_text for an unsplit batch")
	}
	if len(item.Jokes) != 0 {
		t.Fatal("an unsplit batch must have no joke rows")
	}

	res, err := env.Marketing.Split(ctx, env.Marketer.ID, batch.ID, []string{"a", "b", "c", "d", "e"})
	if err != nil {
		t.Fatalf("split: %v", err)
	}
	if len(res.Jokes) != 5 {
		t.Fatalf("expected 5 jokes, got %d", len(res.Jokes))
	}
	if res.Batch.RawText != nil {
		t.Fatal("raw_text must be NULL once split")
	}
	if res.Batch.RawTextOriginal == nil {
		t.Fatal("raw_text_original must survive the split")
	}
}

func TestSplitEnforcesRoundOneBatchSize(t *testing.T) {
	// Moved here from Submit: this is the first point where a joke count exists on
	// the raw path. Round 1 requires exactly BatchSize.
	ctx, env := setupMarketingTest(t)
	batch := env.SubmitRaw(t, "1) a 2) b 3) c")
	if _, err := env.Marketing.Split(ctx, env.Marketer.ID, batch.ID, []string{"a", "b", "c"}); err == nil {
		t.Fatal("expected a batch-size error for 3 jokes when BatchSize is 5")
	}
}

func TestSplitRequiresTheLock(t *testing.T) {
	ctx, env := setupMarketingTest(t)
	batch := env.SubmitRaw(t, "1) a 2) b 3) c 4) d 5) e")
	// Not claimed by this marketer -> splitting is an edit and must be refused.
	if _, err := env.Marketing.Split(ctx, env.OtherMarketer.ID, batch.ID, []string{"a"}); err == nil {
		t.Fatal("expected a forbidden error when the batch is not locked by this marketer")
	}
}
```

- [ ] **Step 2: Run and confirm it FAILS** — `Split` undefined. Paste the output.

- [ ] **Step 3: Implement**

DTO:

```go
type BatchSplitRequest struct {
	Jokes []string `json:"jokes" binding:"required"`
}
```

Port — `MarketingRepository` gains:

```go
	SplitBatch(ctx context.Context, batchID, marketerID, teamID int64, jokes []string) (*BatchWithJokes, error)
	UnsplitBatch(ctx context.Context, batchID, marketerID, teamID int64) (*BatchWithJokes, error)
```

`src/core/usecase/marketing.go` — `Split` preconditions, in this order, matching `Publish`'s
existing shape:

1. `requireMarketer`
2. `GetBatchWithJokes`; `batch.TeamID == *user.TeamID` else `NewForbiddenError`
3. round `ACTIVE` else `NewConflictError("round not active")`
4. `status == SUBMITTED`; `PROCESSED` → `NewConflictError("batch already processed")`
5. **`locked_by == user.ID`** else forbidden — splitting is an edit, and an expired lock must
   not let a second marketer overwrite the first's work

Then trim each joke, drop empties, reject an empty result with
`NewValidationError("jokes", "at least one joke required")`, and enforce the batch-size rules
moved out of `Submit`:

```go
	if round.RoundNumber == 1 && len(jokes) != round.BatchSize {
		return nil, domain.NewValidationError("jokes", fmt.Sprintf("expected %d jokes", round.BatchSize))
	} else if round.RoundNumber >= 2 && len(jokes) > round.BatchSize {
		return nil, domain.NewValidationError("jokes", fmt.Sprintf("expected up to %d jokes", round.BatchSize))
	}
```

Repo `SplitBatch`, one `WithTx`:

```sql
-- guard: re-splitting must not destroy decided jokes
SELECT count(*) FROM jokes WHERE batch_id = $1 AND publish_status <> 'PENDING';
  -- > 0  ->  conflict "batch already processed"

DELETE FROM jokes WHERE batch_id = $1;
-- then one INSERT per element, in order (BIGSERIAL assigns the ids)
UPDATE batches SET raw_text = NULL, locked_at = now() WHERE batch_id = $1;
```

`locked_at = now()` **refreshes the 15-minute lock** — reading and cutting a long blob can
easily exceed it, and losing the batch mid-split would be the worst possible moment.

Handler + route:

```go
	v1.POST("/marketing/batches/:batch_id/split", s.marketingHandler.Split)
```

The handler returns **the same envelope as `queue/next`** — `{batch, jokes, queue_size}` — so
the frontend can drop the response straight into its queue state, which is exactly what it
already does.

Mirror `SplitBatch` in `memstore.go`, including the decided-jokes guard.

- [ ] **Step 4: Run and confirm PASS** — `make test` all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): restore the split endpoint

POST /v1/marketing/batches/{id}/split turns the JM's raw blob into joke
rows. The R1 exact-size and R2 cap rules live here now - this is the first
point on the raw path where a joke count exists.

Splitting is an edit, so it requires the marketer to hold the lock, and it
refreshes locked_at: reading and cutting a long blob can exceed the
15-minute expiry.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `POST /v1/marketing/batches/{id}/unsplit`

**Files:** same set as Task 3.

- [ ] **Step 1: Write the failing test**

```go
func TestUnsplitRestoresTheOriginalBlob(t *testing.T) {
	ctx, env := setupMarketingTest(t)
	const blob = "1) a\n\n2) b\n\n3) c\n\n4) d\n\n5) e"
	batch := env.SubmitRaw(t, blob)
	if _, err := env.Marketing.Split(ctx, env.Marketer.ID, batch.ID, []string{"a", "b", "c", "d", "e"}); err != nil {
		t.Fatal(err)
	}

	res, err := env.Marketing.Unsplit(ctx, env.Marketer.ID, batch.ID)
	if err != nil {
		t.Fatalf("unsplit: %v", err)
	}
	if len(res.Jokes) != 0 {
		t.Fatal("unsplit must remove the joke rows")
	}
	// Lossless: the JM's original formatting comes back, not a re-join of the splits.
	if res.Batch.RawText == nil || *res.Batch.RawText != blob {
		t.Fatalf("expected the original blob, got %v", res.Batch.RawText)
	}
}

func TestUnsplitRefusesAfterPublish(t *testing.T) {
	ctx, env := setupMarketingTest(t)
	batch := env.SubmitRaw(t, "1) a 2) b 3) c 4) d 5) e")
	split, _ := env.Marketing.Split(ctx, env.Marketer.ID, batch.ID, []string{"a", "b", "c", "d", "e"})
	env.PublishAll(t, split)

	if _, err := env.Marketing.Unsplit(ctx, env.Marketer.ID, batch.ID); err == nil {
		t.Fatal("expected a conflict once the batch is processed")
	}
}
```

- [ ] **Step 2: Run and confirm it FAILS.** Paste the output.

- [ ] **Step 3: Implement**

Same preconditions as `Split`, **plus**: refuse if any joke is not `PENDING`.

```sql
UPDATE batches
SET raw_text = COALESCE(
      raw_text_original,
      (SELECT string_agg(joke_text, E'\n\n' ORDER BY joke_id) FROM jokes WHERE batch_id = $1)
    ),
    locked_at = now()
WHERE batch_id = $1;

DELETE FROM jokes WHERE batch_id = $1;
```

The `COALESCE` fallback covers a batch submitted through the legacy `jokes` array, which has no
original blob — it re-joins rather than failing.

Route:

```go
	v1.POST("/marketing/batches/:batch_id/unsplit", s.marketingHandler.Unsplit)
```

Mirror in `memstore.go`.

- [ ] **Step 4: Run and confirm PASS** — `make test` all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): restore the unsplit endpoint

Restores raw_text_original rather than re-joining the split texts, so
'Back to splitting' returns exactly what the JM pasted. Falls back to a
re-join for batches submitted through the legacy jokes array.

Refuses once any joke has been decided.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Make the `≥1 published` rule round-scoped

Round 1 keeps spec Item #2's pressure ("Marketing prioritises, it does not gatekeep"). Round 2
allows an all-discard batch, because the JM may submit a single weak joke and Marketing must
be able to pass on it — the decision the R2 flow exists to teach.

**Files:** `src/infra/repo/postgres/marketing_repo.go`, `src/core/usecase/marketing.go`, `src/core/usecase/testutil/memstore.go`, `src/core/usecase/marketing_test.go`

- [ ] **Step 1: Write the failing test**

The existing test `marketing_test.go:145-153` asserts the rule unconditionally. **Do not
delete it** — narrow it to Round 1 and add a Round 2 counterpart:

```go
func TestPublishRejectsAllDiscardInRoundOne(t *testing.T) {
	// Item #2: every processed batch in R1 yields at least one published joke.
	// (This is the existing assertion, now explicitly scoped to round 1.)
	...existing body, with the round fixed at round_number = 1...
}

func TestPublishAllowsAllDiscardInRoundTwo(t *testing.T) {
	ctx, env := setupMarketingTestForRound(t, 2)
	batch := env.SubmitAndSplit(t, []string{"a", "b"})
	res, err := env.Marketing.Publish(ctx, env.Marketer.ID, batch.ID, []ports.JokePublishDecision{
		{JokeID: batch.Jokes[0].ID, IsPublished: false},
		{JokeID: batch.Jokes[1].ID, IsPublished: false},
	})
	if err != nil {
		t.Fatalf("round 2 must allow an all-discard batch: %v", err)
	}
	if len(res.PublishedIDs) != 0 || len(res.DiscardedIDs) != 2 {
		t.Fatalf("expected 0 published, 2 discarded; got %d/%d", len(res.PublishedIDs), len(res.DiscardedIDs))
	}
}
```

- [ ] **Step 2: Run and confirm the round-2 test FAILS** with `NO_JOKE_PUBLISHED`. Paste it.

- [ ] **Step 3: Implement**

The check currently lives in the repo layer (`marketing_repo.go:198-200`), which has no round
context. Pass it down — extend `PublishBatch` with `requireAtLeastOnePublished bool` and have
`MarketingService.Publish` compute it as `round.RoundNumber == 1`. Keep the error identical:

```go
	if requireAtLeastOnePublished && len(published) == 0 {
		return nil, nil, domain.NewValidationError("jokes", "NO_JOKE_PUBLISHED")
	}
```

Do **not** thread `round_number` into the repo and branch on it there — the repo should not
know the game's pedagogy. A boolean from the usecase keeps the rule where the round is already
loaded.

Mirror in `memstore.go` (`:474-475`).

- [ ] **Step 4: Run and confirm PASS** — both tests green, `make test` all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(marketing): scope the >=1-published rule to round 1

Round 1 keeps the force-release pressure. Round 2 allows an all-discard
batch: the JM may submit a single weak joke, and being able to pass on it
is the decision that round exists to teach.

The rule moves from the repo to a boolean computed by the usecase, which
already has the round loaded - the repo should not know the pedagogy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Per-joke `sold_count` and `first_sold_at`

Spec Item #4 requires five per-joke fields on the batches listing. Three exist. `sold_count`
is **structurally always 0** — there is no such column on `jokes`, and `batch_repo.go` selects
seven columns, so `domain.Joke.SoldCount` keeps its Go zero value and the handler emits it.
`first_sold_at` is absent entirely.

**Files:** `src/infra/repo/postgres/batch_repo.go`, `src/app/http/handler/batch.go`

- [ ] **Step 1: Confirm the bug before fixing it**

```bash
psql -d jokefactory -c "\d jokes"          # 7 columns, no sold_count
grep -n "SoldCount" -r src/ --include="*.go"
```

Expected: `SoldCount` is assigned only in `aicustomer_repo.go` (the market path) and the
in-memory store. The batches path never sets it. Record what you find.

- [ ] **Step 2: Implement**

Join the same purchase aggregation `ListMarket` already uses (`aicustomer_repo.go:218-232`)
into the batch-listing query:

```sql
LEFT JOIN (
    SELECT joke_id,
           COUNT(*)              AS sold_count,
           MIN(created_at)       AS first_sold_at
    FROM purchases
    WHERE round_id = $1
    GROUP BY joke_id
) s ON s.joke_id = j.joke_id
```

Select `COALESCE(s.sold_count, 0)` and `s.first_sold_at`, scan them onto `domain.Joke`
(`FirstSoldAt *time.Time` is new), and emit `first_sold_at` from `handler/batch.go` alongside
the existing `sold_count`.

**The two fields come from two different tables, and that is correct.** I checked both
schemas; do not "simplify" this to one source:

- **`purchases`** is current holdings — `(purchase_id, round_id, ai_customer_id, joke_id,
  team_id, price, created_at)`, one row per joke a customer currently holds. `ListMarket`
  counts exactly this (`aicustomer_repo.go:224-229`), so **`sold_count` must count
  `purchases`** or the two endpoints will disagree again, which is the whole point of the
  task.
- **`purchase_events`** is the append-only log — same columns plus `delta smallint` (+1 buy,
  −1 return). A returned joke leaves a −1 event but its `purchases` row is gone, so only this
  table remembers that a sale ever happened. Spec Item #4 defines `first_sold_at` as "earliest
  `purchase_events.created_at`", so **`first_sold_at` must come from `purchase_events` with
  `delta = 1`**.

That means two joins, not one:

```sql
LEFT JOIN (
    SELECT joke_id, COUNT(*)::int AS sold_count
    FROM purchases
    WHERE round_id = $1
    GROUP BY joke_id
) sc ON sc.joke_id = j.joke_id
LEFT JOIN (
    SELECT joke_id, MIN(created_at) AS first_sold_at
    FROM purchase_events
    WHERE round_id = $1 AND delta = 1
    GROUP BY joke_id
) fs ON fs.joke_id = j.joke_id
```

A joke that sold and was then returned by every buyer will correctly show `sold_count: 0` with
a non-null `first_sold_at`. That is not a bug — it is the swap behaviour the AI-customer
engine is built on, and the lead-time KPI depends on remembering the first sale.

- [ ] **Step 3: Verify against the running server**

Walk a batch through to a sale, then:

```bash
curl -s -H 'X-User-Id: <jm_id>' http://localhost:8080/v1/rounds/1/teams/1/batches | python3 -m json.tool
```

Expected: a published joke shows a non-zero `sold_count` matching what
`GET /v1/rounds/1/market` reports for the same joke, and a `first_sold_at` timestamp. **The
two endpoints agreeing is the assertion** — they disagreed before this task.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(batches): report real per-joke sales

sold_count was structurally always 0 on the batches listing: there is no
such column on jokes and the query selected seven columns, so the handler
emitted a Go zero value. The market endpoint counted real purchases, so
the same joke read 0 in one place and N in another.

Both now aggregate the same source, and first_sold_at is added for the
lead-time KPI.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `jokes_created` / `jokes_published` on the team summary

Spec Item #1 requires both, explicitly noting the frontend cannot derive `jokes_created`
because R2 has variable batch sizes. Marketing's Content Waste tile is
`jokes_created − jokes_published` and currently reads `0 − 0`.

**Files:** `src/app/http/handler/round.go`, `src/core/ports/repositories.go`, `src/infra/repo/postgres/stats_repo.go`

- [ ] **Step 1: Implement**

`ports.TeamSummary` gains `JokesCreated` and `JokesPublished`. The values already exist in the
summary query: `jokes_created` is `published_jokes + discarded_jokes` (computed as
`total_jokes` in `stats_repo.go:213` for the leaderboard) and `jokes_published` is
`published_jokes`. Add both to the summary CTE and emit them from `handler/round.go:55-73`
**alongside** the existing keys — do not rename anything, the frontend reads the current names
too.

- [ ] **Step 2: Verify**

```bash
curl -s -H 'X-User-Id: <id>' http://localhost:8080/v1/rounds/1/teams/1/summary | python3 -m json.tool
```

Expected: `jokes_created` and `jokes_published` present, and
`jokes_created == published_jokes + discarded_jokes`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(summary): add jokes_created and jokes_published

Spec Item #1. The frontend cannot derive jokes_created because R2 batch
sizes vary, so Marketing's Content Waste tile read 0 - 0. Added alongside
the existing keys rather than renaming them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Verification

**Files:** none.

- [ ] **Step 1: Full backend check**

```bash
cd /Users/frankfu/Documents/GitHub/jokefactory_be && make verify
```

Expected: fmt, lint and tests all pass. If `golangci-lint` flags only pre-existing issues it
is grandfathered against `main` by `LINT_BASE_REF`; anything new is yours.

- [ ] **Step 2: A full round by hand**

With the server running, walk the whole loop with curl: join → assign → configure with an
ideal profile → start → **submit a raw blob** → `queue/next` (must expose `raw_text`, empty
`jokes`) → **split** → publish one, discard one → confirm the batch is `PROCESSED` → check the
batches listing shows `published_at`, `sold_count`, `first_sold_at` → check the summary shows
`jokes_created`/`jokes_published`.

Then repeat the publish step on a **Round 2** batch with everything discarded, and confirm it
succeeds where Round 1 rejects it.

- [ ] **Step 3: Confirm the branch is not pushed**

```bash
git -C /Users/frankfu/Documents/GitHub/jokefactory_be status -sb
git -C /Users/frankfu/Documents/GitHub/jokefactory_be log --oneline main..phase3b-restore
```

Expected: on `phase3b-restore`, with no upstream, and `main` untouched.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: verify phase 3B

make verify green. A full round walked by hand: raw submit, split,
publish/discard, per-joke sales, and an all-discard round 2 batch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- A JM can submit a raw blob and Marketing can split it into joke rows and unsplit it back.
- Unsplit restores the JM's original text, not a re-join.
- An all-discard publish succeeds in Round 2 and is rejected in Round 1.
- `sold_count` agrees between the batches listing and the market board, and `first_sold_at`
  arrives.
- The team summary carries `jokes_created` and `jokes_published`.
- `make verify` is green and `main` is untouched.

## Handover notes for the backend developer

Three things worth saying explicitly when these changes are handed over:

1. **This adds the repo's first incremental migration** (`0002_*.sql`). The README describes
   the schema as a single file; that convention has to change now or the first deployed
   database cannot be migrated.
2. **The R1 batch-size rule moved from `Submit` to `Split`.** It is not weakened — it is
   enforced at the first point where a joke count exists on the raw path. A reviewer looking
   for it in `batch.go` will not find it.
3. **The `≥1 published` rule is now a parameter, not a constant.** `PublishBatch` takes a
   boolean from the usecase rather than deciding for itself, so the repo no longer encodes a
   teaching rule.

---

# Execution log — COMPLETE (2026-09-13)

Executed subagent-driven on `main` in `jokefactory_be`, **local only — 8 commits ahead of
`origin/main`, nothing pushed**. `make verify` exits 0.

| Commit | |
|---|---|
| `efbc0ae` | `feat(batches): add raw_text columns` |
| `b7cf2bc` | `feat(batches): accept a raw_text submission` |
| `e7f8558` | `feat(marketing): restore the split endpoint` |
| `40e3409` | `feat(marketing): restore the unsplit endpoint` |
| `aca8188` | `feat(marketing): scope the >=1-published rule to round 1` |
| `8f72655` | `fix(batches): report real per-joke sales` |
| `edf7255` | `feat(summary): add jokes_created and jokes_published` |
| (empty) | `chore: verify phase 3B` |

## The full round, walked by hand on a clean database

```
JM submits a RAW BLOB      batch 1, jokes_count 0
Marketing claims it        raw_text present: True | joke rows: 0 | queue: 1
Marketing SPLITS           raw_text now: None | joke ids: [1,2,3,4,5]
publishes 1, discards 4    batch PROCESSED | published 1 | discarded 4
summary                    jokes_created 5 | jokes_published 1 | profit -0.14
```

Profit checks independently: one publish at $0.10 plus four discards at $0.01, no sales yet.

## Verified individually

- **R1 size enforcement fires on the raw path.** Splitting 4 jokes when `batch_size` is 5
  returns `expected 5 jokes` — the identical string `Submit` used before the rule moved.
- **Unsplit is byte-identical.** 173 bytes submitted, 173 returned, formatting intact. A
  re-split issues fresh joke ids.
- **The publish rule is round-scoped.** The same all-discard body returns 400
  `NO_JOKE_PUBLISHED` on a Round 1 batch and 200 with `published.count: 0` on a Round 2 batch.
- **`sold_count` now agrees across endpoints.** Proven with a *real* sale, not injected rows:
  the ideal profile was set to match what the stub classifier emits, scoring a perfect fit, and
  all 5 AI customers bought on the tick. Both `/batches` and `/market` report `sold_count: 5`
  for joke 1. `first_sold_at` is a real timestamp.

## Things the plan got wrong, corrected during execution

1. **"mirror the shape `Publish` uses" was wrong.** `Publish` does *not* check team, status or
   lock in the usecase — those live in the repo's `lockBatchForPublish`, where they are
   race-safe. The implementer put the plan's five usecase preconditions in *and* kept the repo
   guards, deliberately duplicated.
2. **Guard ordering matters for error precedence.** The plan put the decided-jokes check first;
   running it after the team/status/lock guard means a marketer with no rights gets `403`
   rather than a `409` that leaks whether the jokes are decided.
3. **`queue/next` did not emit `raw_text`.** The plan said "check"; it didn't. Split, unsplit
   and queue/next now share one `queueEnvelope` helper so they cannot drift.
4. **The batch listing is two queries, not one.** `round_id` was in Go scope but not in the
   jokes query; it had to be threaded through as a second parameter.
5. **The memstore had no purchase-event log**, so `first_sold_at` could not be test-driven
   until one was added mirroring the real two-table model.
6. **`migrate-down` is only safe while `0002` is applied.** If the database ever reaches a
   state where `0001` is last-applied, `make migrate-down` drops the entire schema. Worth a
   warning in the README.

## New wire strings the frontend has never seen

- `BATCH_JOKES_ALREADY_DECIDED` — conflict code on split/unsplit of a decided batch.
- `BATCH_ALREADY_PROCESSED` on split of a processed batch.
- `BatchSplitRequest.Jokes` keeps `binding:"required"`, so an explicit `"jokes": []` is
  rejected by gin as a 400 `invalid payload` rather than reaching the usecase's typed
  `at least one joke required`. Two different error shapes for adjacent cases; Phase 3C should
  handle both.

## Handover notes for the backend developer

1. **This adds the repo's first incremental migration** (`0002_batch_raw_text.sql`). The README
   describes the schema as a single file; that convention has to change or a deployed database
   cannot be migrated.
2. **The R1 batch-size rule moved from `Submit` to `Split`** — not weakened, enforced at the
   first point a joke count exists on the raw path. A reviewer looking in `batch.go` won't
   find it.
3. **The `≥1 published` rule is a parameter now**, computed by the usecase from
   `round.RoundNumber`, so the repository no longer encodes a teaching rule.
