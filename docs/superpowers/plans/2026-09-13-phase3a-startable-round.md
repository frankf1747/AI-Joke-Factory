# Phase 3A — A Startable, Reachable Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to configure and start a round against the real Go backend, and let a Marketing student actually reach their screen — the two things that are impossible today.

**Architecture:** Frontend-only, three independent fixes in `context.tsx` plus one new instructor component. No backend change. No view migrates onto `services/api/` in this plan — that is 3C — so the legacy service layer stays in place and only the calls that are *provably broken against the live server* are touched.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 2, `strictNullChecks` on.

---

## Why this plan exists

Three audits compared the frontend against the running backend. Two findings make the app
unusable against a real server, and everything else is downstream of them:

1. **Every Marketing student is stranded in the Waiting Room.** `context.tsx:80-93 toRole()`
   maps any unrecognised role to `UNASSIGNED`, and the backend sends `MARKETING` — a value
   the frontend's `ApiRole` union does not contain. `App.tsx:191-193` then routes
   `UNASSIGNED` to `<WaitingRoom/>`. The server assigns the student correctly; the client
   throws the assignment away.

2. **No round can be started, in either round.** `usecase/instructor.go:239-245` validates
   `ideal_profile` unconditionally on start and returns **409 CONFLICT** when it is unset.
   The frontend has no ideal-profile UI anywhere and never sends one — `setGameActive()`
   posts exactly `{customer_budget, batch_size, market_price, cost_of_publishing}`. The 409
   is swallowed into `alert('Failed to start round.')`.

A third is not a blocker but wastes every setting the instructor types:

3. **`POST /v1/instructor/rounds/{id}/config` is never called.** `context.tsx:1508-1511
   updateConfig()` is pure local React state, with a comment claiming "No server-side config
   endpoint". There is one, and it is the only non-start path that accepts `ideal_profile`.

And one that actively strands students:

4. **The customer-pair selector forces users into limbo.** `calculateValidCustomerOptions()`
   requires `2 ≤ C ≤ 10` pairs be set aside as human customers; "Form Teams" is disabled
   until one is chosen. The backend ignores `customer_count` entirely (`dto.AssignRequest` is
   `{team_count}` only) and `unassignRemainder` pushes every surplus user back to `WAITING`
   with no path out. Human customers were replaced by 100 simulated ones; the selector is a
   vestige that can only do harm.

## Decisions already made — do not re-litigate

- **Wire role value is `MARKETING`.** The backend renamed the domain enum, the Postgres
  `user_role` type and the route prefix. Spec Item #7 said to keep `QC`, but the rename is
  done and half-consumed; reverting is more work for less clarity. The frontend adapts.
- **`ideal_profile` rides on `POST /config`**, not a new dedicated endpoint. Zero backend
  work, and it unblocks a demo today.
- **A "user" is a student pair.** `App.tsx:21-33` already normalises two member names into
  one account key. So the backend's 1 JM + 1 Marketing per team is correct, with two humans
  behind each seat and sometimes one. No third-member or spectator role.
- **Topic palette stays at the backend's 15.** Both repos already agree; the spec's 10-item
  list is the stale artefact. No code change in this plan.

## Explicitly NOT in this plan

Migrating any view onto `services/api/`; the `/v1/qc/*` → `/v1/marketing/*` route fixes; the
publish payload shape; `RATED`→`PROCESSED`; `is_published`←`publish_status`;
`rated_at`←`processed_at`; the `queue/next` null-batch crash; the feedback panel. All of that
is **Phase 3C**, and all of it depends on backend work in **Phase 3B**. Doing any of it here
would couple an unblocking change to a migration and leave the app broken in between.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `types.ts` | `ApiRole` union must list the roles the server actually sends. | Modify |
| `context.tsx` | `toRole` mapping; `updateConfig` calling the server; `formTeams` sending `team_count` alone; `setGameActive` sending the profile. | Modify |
| `components/IdealProfilePicker.tsx` | An 11-dimension picker over `IDEAL_DIMENSIONS`, with a "use defaults" action. One responsibility, no data fetching. | Create |
| `components/IdealProfilePicker.test.tsx` | Proves the picker always emits a complete, backend-valid profile. | Create |
| `views/Instructor.tsx` | Mount the picker; delete the customer-pair selector and the Customers column. | Modify |
| `context.roles.test.ts` | Pins the role mapping against the backend's enum. | Create |

---

## Task 1: Teach the frontend the `MARKETING` role

This is the single highest-value line in the plan. Until it lands, no Marketing screen can be
reached at all, so none of Phase 3B or 3C can be tested by hand.

**Files:**
- Modify: `types.ts:22`
- Modify: `context.tsx:80-93`
- Test: `context.roles.test.ts` (create)

- [ ] **Step 1: Write the failing test**

`toRole` is currently a module-private function in `context.tsx`. Export it — it is a pure
mapping and deserves a test. Add `export` to its declaration, then create
`context.roles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toRole } from './context';
import { Role } from './types';

/* The backend's domain.Role is INSTRUCTOR | JM | MARKETING (core/domain/enums.go:6-14),
   and the Postgres user_role enum carries exactly those three. There is no QC and no
   CUSTOMER — human customers were replaced by simulated ones. A value this function does
   not recognise becomes UNASSIGNED, which App.tsx routes to the Waiting Room, so an
   unmapped role is indistinguishable from "not assigned yet". */
describe('toRole', () => {
  it('maps every role the backend can actually send', () => {
    expect(toRole('INSTRUCTOR')).toBe(Role.INSTRUCTOR);
    expect(toRole('JM')).toBe(Role.JOKE_MAKER);
    expect(toRole('MARKETING')).toBe(Role.QUALITY_CONTROL);
  });

  it('still accepts QC, which older sessions may hold in localStorage', () => {
    expect(toRole('QC')).toBe(Role.QUALITY_CONTROL);
  });

  it('treats null and unknown values as unassigned', () => {
    expect(toRole(null)).toBe(Role.UNASSIGNED);
    expect(toRole('NONSENSE')).toBe(Role.UNASSIGNED);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `npx vitest run context.roles.test.ts`
Expected: FAIL on the `MARKETING` assertion — `expected 'UNASSIGNED' to be 'QUALITY_CONTROL'`.

Do not proceed until you have seen that exact failure. It is the proof that this bug is real.

- [ ] **Step 3: Implement**

In `types.ts:22`, replace the union with what the server sends:

```typescript
/* The backend's domain.Role (core/domain/enums.go:6-14). 'QC' is retained only because a
   browser may still hold it in localStorage from a pre-V2 session; the server never sends
   it. 'CUSTOMER' is gone — human customers were replaced by simulated ones. */
export type ApiRole = 'INSTRUCTOR' | 'JM' | 'MARKETING' | 'QC';
```

In `context.tsx:80-93`, add the `MARKETING` arm:

```typescript
export function toRole(apiRole: string | null): Role {
  switch (apiRole) {
    case 'INSTRUCTOR':
      return 'INSTRUCTOR' as Role;
    case 'JM':
      return 'JOKE_MAKER' as Role;
    // The backend renamed QC to MARKETING in V2 (core/domain/enums.go:6-14). The UI enum
    // keeps the name QUALITY_CONTROL to avoid a repo-wide rename; only the wire value moved.
    case 'MARKETING':
    case 'QC':
      return 'QUALITY_CONTROL' as Role;
    default:
      return 'UNASSIGNED' as Role;
  }
}
```

Leave `Role.CUSTOMER` in the `Role` enum — `views/Customer.tsx` is a standalone offline
explainer and removing the enum value is a separate cleanup. Just stop mapping to it from the
wire, since the server can never send it.

- [ ] **Step 4: Run and confirm it PASSES**

Run: `npx vitest run context.roles.test.ts` → 3 tests pass.
Run: `npx vitest run` → 266 existing + 3 new = **269 passing**.
Run: `npm run typecheck 2>&1 | grep -c "error TS"` → **1** (`services/mockApi.ts:657`, pre-existing).

- [ ] **Step 5: Commit**

```bash
git add types.ts context.tsx context.roles.test.ts
git commit -m "fix(roles): accept the backend's MARKETING role

toRole mapped any unrecognised role to UNASSIGNED, and the backend sends
MARKETING - a value ApiRole did not contain. App.tsx routes UNASSIGNED to
the Waiting Room, so every Marketing student was assigned correctly by the
server and then stranded by the client.

QC is kept as an accepted input because a browser may still hold it from a
pre-V2 session; the server never sends it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The ideal-profile picker

The backend refuses to start a round without a complete, valid `ideal_profile`. The rules are
strict and worth stating precisely, because the type system now enforces them:

- The profile must be **total** over all 11 ideal dimensions (`scoring/dimensions.go:189-194`,
  `"missing category for <DIM>"`).
- `TITLE_FIT` must **not** appear — it is self-scoring and has no ideal
  (`dimensions.go:201-205`, `"dimension has no ideal selector: TITLE_FIT"`).
- A catch-all category (`"None of the above"`) is rejected (`dimensions.go:195-197`).

`config/dimensions.ts` already models all three: `IDEAL_DIMENSIONS` is the 11,
`IdealDimension` is `Exclude<Dimension,'TITLE_FIT'>`, and `DEFAULT_IDEAL_PROFILE` is typed
`Record<IdealDimension, string>`.

**Files:**
- Create: `components/IdealProfilePicker.tsx`
- Test: `components/IdealProfilePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { IDEAL_DIMENSIONS, DEFAULT_IDEAL_PROFILE, CATCH_ALL } from '../config/dimensions';
import { isCompleteProfile, selectableCategories } from './IdealProfilePicker';

describe('selectableCategories', () => {
  it('omits the catch-all, which the backend rejects', () => {
    // scoring/dimensions.go:195-197 rejects a catch-all as an ideal.
    for (const dim of IDEAL_DIMENSIONS) {
      expect(selectableCategories(dim)).not.toContain(CATCH_ALL);
    }
  });

  it('leaves at least one choice on every dimension', () => {
    for (const dim of IDEAL_DIMENSIONS) {
      expect(selectableCategories(dim).length).toBeGreaterThan(0);
    }
  });
});

describe('isCompleteProfile', () => {
  it('accepts the defaults', () => {
    expect(isCompleteProfile(DEFAULT_IDEAL_PROFILE)).toBe(true);
  });

  it('rejects a profile missing any dimension', () => {
    const partial = { ...DEFAULT_IDEAL_PROFILE };
    delete (partial as Record<string, string>).CLARITY;
    expect(isCompleteProfile(partial)).toBe(false);
  });

  it('rejects a blank selection', () => {
    expect(isCompleteProfile({ ...DEFAULT_IDEAL_PROFILE, CLARITY: '' })).toBe(false);
  });

  it('rejects a catch-all selection', () => {
    // ENERGY carries a catch-all; picking it would 400 on the server.
    expect(isCompleteProfile({ ...DEFAULT_IDEAL_PROFILE, ENERGY: CATCH_ALL })).toBe(false);
  });

  it('does not require TITLE_FIT, which has no ideal', () => {
    expect(Object.keys(DEFAULT_IDEAL_PROFILE)).not.toContain('TITLE_FIT');
    expect(isCompleteProfile(DEFAULT_IDEAL_PROFILE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `npx vitest run components/IdealProfilePicker.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `components/IdealProfilePicker.tsx`. Export the two pure helpers *and* the component,
so the rules are testable without rendering:

```tsx
import React from 'react';
import {
  IDEAL_DIMENSIONS, DEFAULT_IDEAL_PROFILE, CATCH_ALL, isCatchAll,
  type DimensionSpec, type IdealDimension,
} from '../config/dimensions';

export type IdealProfile = Record<IdealDimension, string>;

/** The backend rejects a catch-all as an ideal (scoring/dimensions.go:195-197). */
export function selectableCategories(dim: DimensionSpec): string[] {
  return dim.categories.filter(c => !isCatchAll(c));
}

/**
 * A profile the backend will accept: total over all 11 ideal dimensions, no blanks, no
 * catch-alls. Partial profiles 400 with "missing category for <DIM>"
 * (scoring/dimensions.go:189-194), so this must be true before start is even attempted.
 */
export function isCompleteProfile(profile: Partial<Record<string, string>>): boolean {
  return IDEAL_DIMENSIONS.every(dim => {
    const chosen = profile[dim.id];
    return typeof chosen === 'string' && chosen !== '' && !isCatchAll(chosen);
  });
}

interface Props {
  value: IdealProfile;
  onChange: (next: IdealProfile) => void;
  /** Locked once the round is ACTIVE — the backend freezes the profile at start. */
  disabled?: boolean;
}

export function IdealProfilePicker({ value, onChange, disabled = false }: Props) {
  const complete = isCompleteProfile(value);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">Hidden ideal joke</h3>
          <p className="text-xs text-slate-500">
            All {IDEAL_DIMENSIONS.length} dimensions are required. Students never see this.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...DEFAULT_IDEAL_PROFILE })}
          className="text-xs px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          Use defaults
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {IDEAL_DIMENSIONS.map(dim => (
          <label key={dim.id} className="text-xs">
            <span className="block text-slate-600 mb-1">{dim.label}</span>
            <select
              value={value[dim.id as IdealDimension] ?? ''}
              disabled={disabled}
              onChange={e => onChange({ ...value, [dim.id]: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 disabled:opacity-50"
            >
              <option value="">— choose —</option>
              {selectableCategories(dim).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!complete && (
        <p className="text-xs text-amber-700">
          Every dimension must be set before the round can start.
        </p>
      )}
    </div>
  );
}
```

Note `CATCH_ALL` is imported for the test's benefit via `config/dimensions`; if the linter
objects to it being unused in the component, drop it from the component's import list — the
test imports it directly from `config/dimensions`.

- [ ] **Step 4: Widen the vitest include — this is required, not conditional**

`vitest.config.ts:6` is `include: ['**/*.test.ts']`, which does **not** match `.test.tsx`.
Verified. Without this change your new test file is silently skipped and the suite still
reports green — the worst possible failure mode. Change it to:

```typescript
    include: ['**/*.test.ts', '**/*.test.tsx'],
```

**Prove the file is actually collected** before believing any pass: `npx vitest run` must
report **3 files → 4 files** and name `components/IdealProfilePicker.test.tsx` in the list.
If the file count did not change, the test is not running.

- [ ] **Step 5: Run and confirm it PASSES**

Run: `npx vitest run components/IdealProfilePicker.test.tsx` → 7 tests pass.

(Note `components/` is a real directory and a sibling `components.tsx` file also exists.
Both coexist; an explicit subpath import like `'../components/IdealProfilePicker'` resolves
to the directory correctly. Do not rename either.)

- [ ] **Step 6: Commit**

```bash
git add components/IdealProfilePicker.tsx components/IdealProfilePicker.test.tsx vitest.config.ts
git commit -m "feat(instructor): add the ideal-profile picker

The backend refuses to start a round without a complete ideal_profile
(usecase/instructor.go:239-245, 409 CONFLICT) and the frontend had no UI
for it anywhere, so no round could be started at all.

The picker enforces the backend's three rules at the type level: total
over the 11 ideal dimensions, no TITLE_FIT, no catch-all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Send the config to the server

`updateConfig` currently writes React state and nothing else, on the stated belief that no
config endpoint exists. `POST /v1/instructor/rounds/{id}/config` is fully implemented
(`handler/instructor.go:38-89`) and every field is optional — omitted values keep the round's
existing ones.

**Files:**
- Modify: `context.tsx:1508-1511` (`updateConfig`)
- Modify: `context.tsx` (`setGameActive`, the `instructorService.start` call)

- [ ] **Step 1: Add the profile to game state**

`GameConfig` in `types.ts:101-118` gains one field. Put it next to the other instructor knobs:

```typescript
  /** Instructor-only. Never sent to students; the backend strips it from the public round. */
  idealProfile: Record<string, string>;
```

Initialise it from `DEFAULT_IDEAL_PROFILE` wherever `GameConfig`'s initial value is
constructed in `context.tsx` (search for `round1BatchSize:` to find it), importing
`DEFAULT_IDEAL_PROFILE` from `./config/dimensions`.

- [ ] **Step 2: Make `updateConfig` reach the server**

Replace `context.tsx:1508-1511`:

```typescript
  const updateConfig = async (updates: Partial<GameConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));

    // Client-only knobs: the marketing nudge timers are React state by design and have no
    // backend column. Everything else is a real round parameter and must be persisted, or
    // the instructor's settings are silently discarded (they were, until now).
    if (!roundId || !user || user.role !== ('INSTRUCTOR' as Role)) return;

    const body: Record<string, unknown> = {};
    if (updates.customerBudget !== undefined) body.customer_budget = updates.customerBudget;
    if (updates.marketPrice !== undefined) body.market_price = updates.marketPrice;
    if (updates.costOfPublishing !== undefined) body.cost_of_publishing = updates.costOfPublishing;
    if (updates.costOfDiscard !== undefined) body.cost_of_discard = updates.costOfDiscard;
    if (updates.round1BatchSize !== undefined) body.batch_size = updates.round1BatchSize;
    if (updates.idealProfile !== undefined) body.ideal_profile = updates.idealProfile;

    if (Object.keys(body).length === 0) return;

    try {
      await instructorService.updateRoundConfig(roundId, body);
    } catch (e) {
      // Surface it: a silently dropped config is exactly the bug this replaces.
      console.error('Failed to persist round config', e);
      alert('Settings were not saved to the server. Check the connection and try again.');
    }
  };
```

`instructorService.updateRoundConfig` exists at `services/instructorService.ts:43-48` and has
had no caller until now — **and its parameter type is too narrow to use.** It is declared:

```typescript
  updateRoundConfig(
    round_id: RoundId,
    body: { customer_budget: number; batch_size: number },
  ): Promise<ApiInstructorRoundConfigResponse> {
```

Two required fields, and no `ideal_profile`. Widen it to match `dto.ConfigRequest`
(`dto/models.go:51-63`), where every field is optional:

```typescript
  updateRoundConfig(
    round_id: RoundId,
    body: {
      customer_budget?: number;
      batch_size?: number;
      market_price?: number;
      cost_of_publishing?: number;
      cost_of_discard?: number;
      customer_count?: number;
      ideal_profile?: Record<string, string>;
    },
  ): Promise<ApiInstructorRoundConfigResponse> {
```

- [ ] **Step 3: Send the profile on start**

In `setGameActive`, add the profile to the `instructorService.start` body, and check it is
complete *before* posting so the failure is a clear message rather than an opaque 409:

```typescript
        if (!isCompleteProfile(config.idealProfile)) {
          alert('Set every dimension of the hidden ideal joke before starting the round.');
          return;
        }

        await instructorService.start(rid, {
          customer_budget,
          batch_size,
          market_price,
          cost_of_publishing,
          ideal_profile: config.idealProfile,
        });
```

Import `isCompleteProfile` from `./components/IdealProfilePicker`.

- [ ] **Step 4: Verify**

Run: `npx vitest run` → **269 + 7 = 276 passing**.
Run: `npm run typecheck 2>&1 | grep -c "error TS"` → **1**.

- [ ] **Step 5: Commit**

```bash
git add types.ts context.tsx
git commit -m "fix(instructor): persist round config and send the ideal profile

updateConfig wrote React state and nothing else, on a stale comment saying
no config endpoint existed. POST /config is fully implemented and is the
only non-start path that accepts ideal_profile, so every knob the
instructor set was being discarded.

start() now carries the profile, with a completeness check first so a
partial profile fails with a readable message instead of an opaque 409.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Delete the customer-pair selector

With simulated customers, every joined account is a JM or a Marketing seat. The selector
forces the instructor to strand at least two accounts, and the backend ignores the value
anyway.

**Files:**
- Modify: `context.tsx:1515-1554` (`calculateValidCustomerOptions`, `formTeams`)
- Modify: `views/Instructor.tsx` (the selector UI, the Form Teams button, the Customers column)

- [ ] **Step 1: Simplify `formTeams`**

Replace `calculateValidCustomerOptions` and `formTeams` (`context.tsx:1515-1554`) with:

```typescript
  const formTeams = async () => {
    if (!roundId) return;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;

    // One account per seat: a "user" here is a student pair (App.tsx normalises two names
    // into one key), and each team is 1 JM + 1 Marketing. Human customers are gone, so
    // there is nothing to set aside — the backend ignores customer_count entirely
    // (dto.AssignRequest is {team_count} only) and pushes any surplus account back to
    // WAITING (usecase/instructor.go:175-186).
    const assignable = roster.filter(u => u.role !== ('INSTRUCTOR' as Role)).length;
    const teamCount = Math.floor(assignable / 2);
    if (teamCount <= 0) {
      alert('At least 2 participants are needed to form a team.');
      return;
    }

    try {
      await instructorService.autoAssign(roundId, { team_count: teamCount });
      await updateConfig({ status: 'PLAYING' });
    } catch {
      alert('Failed to auto-assign teams. Please try again.');
    }
  };
```

Delete `calculateValidCustomerOptions` entirely and remove it from the context value and its
TypeScript interface.

`instructorService.autoAssign` (`services/instructorService.ts:27`) is declared
`body: { customer_count: number; team_count: number }` — `customer_count` is **required**, so
the call above will not compile until you narrow it:

```typescript
  autoAssign(round_id: RoundId, body: { team_count: number }): Promise<void> {
```

That narrowing is the point, not a side effect: it makes it impossible to send a field the
backend ignores.

- [ ] **Step 2: Update the instructor UI**

In `views/Instructor.tsx`:
- Delete the customer-count selector and its state (`selectedCustomerCount`).
- Change the Form Teams button to `disabled={false}` with respect to customer count, and call
  `formTeams()` with no argument.
- Delete the Customers drop-target column (around `:2468-2510`) and the `customersArr`
  normalisation it reads. The backend's `LobbySnapshot` has no `Customers` field, so this
  column has only ever rendered empty.
- Delete the `'CUSTOMER'` arm of the role-patch handler (around `context.tsx:1602-1604`).
  Dragging a user there produces a guaranteed 400 (`usecase/instructor.go:207-218`).
- Fix the roster label: the non-JM member of each team is shown as `(QC)` around `:2438`.
  Change it to `Marketing`.

Add an odd-count warning where the selector was, since an unpaired account cannot be seated:

```tsx
{assignableCount % 2 === 1 && (
  <p className="text-xs text-amber-700">
    {assignableCount} participants — one will be left unassigned. Each team seats 1 Joke
    Maker and 1 Marketing.
  </p>
)}
```

- [ ] **Step 3: Mount the picker**

Render `<IdealProfilePicker>` in the instructor config area, wired to `config.idealProfile`:

```tsx
<IdealProfilePicker
  value={config.idealProfile as Record<IdealDimension, string>}
  onChange={next => updateConfig({ idealProfile: next })}
  disabled={config.isActive}
/>
```

`disabled={config.isActive}` mirrors the backend, which freezes the profile once the round is
ACTIVE.

- [ ] **Step 4: Verify**

Run: `npx vitest run` → **276 passing**.
Run: `npm run typecheck 2>&1 | grep -c "error TS"` → **1**.
Run: `npm run build` → succeeds, then `git checkout -- dist/ && git clean -f dist/`
(`dist/` is tracked in this repo and must end clean).

- [ ] **Step 5: Commit**

```bash
git add context.tsx views/Instructor.tsx services/instructorService.ts
git commit -m "fix(instructor): drop the customer-pair selector

It required 2-10 pairs be set aside as human customers before Form Teams
would enable. Human customers were replaced by 100 simulated ones: the
backend ignores customer_count and pushes every surplus account back to
WAITING with no path out, so the selector could only strand students.

Also removes the Customers lobby column, which the backend's LobbySnapshot
has no field for and which has only ever rendered empty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Prove it against the live backend

No mock. This task is the whole point of the plan, and it is a manual walk — the tests above
prove the units, this proves the round.

**Files:** none.

- [ ] **Step 1: Start the backend**

```bash
cd /Users/frankfu/Documents/GitHub/jokefactory_be && make run
```

Confirm: `curl -s http://localhost:8080/health/detailed` returns
`{"status":"ok","components":{"database":{"status":"healthy"}}}`.

If the database is dirty from earlier testing, reset it:
`curl -s -X POST -H 'X-User-Id: 1' http://localhost:8080/v1/admin/reset`.

- [ ] **Step 2: Point the frontend at it**

`.env.local` is committed with `VITE_USE_MOCK_API=true`, which routes every call to the
in-browser mock. **Do not edit the committed file.** Override it for this run only:

```bash
cd /Users/frankfu/Documents/GitHub/AI-Joke-Factory
VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://localhost:8080 npm run dev
```

Confirm in the browser devtools Network tab that requests go to `:8080`, not to the mock.

- [ ] **Step 3: Walk it**

1. Log in as instructor (password: whatever `APP_ADMIN_PASSWORD` is in `jokefactory_be/.env`
   — `localdev` in the current local setup).
2. Set a few knobs. **Reload the page.** They must survive — that is Task 3 working. Before
   this plan they would not.
3. Set the ideal profile, or press "Use defaults".
4. Join as 2+ students in other browser windows.
5. Press **Form Teams**. Every student must land on a real screen — **the Marketing student
   must reach the Marketing Desk, not the Waiting Room.** That is Task 1 working.
6. Press **Start Round**. It must start. Before this plan it always returned 409.
7. Confirm via `curl -s -H 'X-User-Id: 1' http://localhost:8080/v1/rounds/active` that the
   round's `status` is `ACTIVE` and — on the instructor projection — that `ideal_profile`
   carries all 11 dimensions.

Expected to still be broken, and **out of scope**: the JM cannot submit (the backend rejects
`raw_text` — Phase 3B), Marketing cannot split (no endpoint — 3B), the Content Backlog tile
reads 0 (`/v1/qc/*` 404s — 3C), and any per-joke sales figure reads 0 (3B). Do not fix these
here. Record what you saw.

- [ ] **Step 4: Commit the evidence**

```bash
git commit --allow-empty -m "chore(fe): verify a round starts against the live backend

Instructor configures, sets the ideal profile, forms teams and starts a
round on a real Go backend with real Postgres. Marketing students reach
the Marketing Desk. Config survives a reload.

Submission, splitting and the metric tiles remain broken by design - they
need phase 3B backend work and 3C contract fixes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done when

- A Marketing student assigned by the server lands on the Marketing Desk.
- An instructor can set the hidden ideal profile in the UI and start a round without a 409.
- Instructor settings survive a page reload, because they are on the server.
- The customer-pair selector is gone and no account is stranded by forming teams.
- 276 tests pass; typecheck holds at its 1 known pre-existing error; `dist/` is clean.

## What this deliberately leaves broken

Submission, splitting, publishing, every metric tile, and the feedback panel. Phase 3A makes
the game **reachable**; 3B makes it **playable**; 3C makes it **correct**.

---

# Execution log — COMPLETE (2026-09-13)

Executed subagent-driven. 5 commits: `b7d752b`, `6501ce7`, `8bd3d1d`, `7ee5603`, `1f46d0a`.
281 tests (from 266), typecheck holding at its 1 pre-existing error, `dist/` clean.

## Task 5 — the live walk, against a real Go backend + real Postgres

Frontend served with `VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://localhost:8080`.
DB wiped with `POST /v1/admin/reset` first. Every step below was observed in the browser and
confirmed against the server with curl.

| Step | Result |
|---|---|
| Instructor login | 200, reached the console |
| Ideal-profile picker | renders, pre-filled with the 11 defaults |
| Two pairs join | `alice_bob` (17), `carol_dave` (18), both WAITING |
| Auto-Assign | 200 — Team 1: 17=`JM`, 18=`MARKETING`, `Assigned: 2, TeamCount: 1` |
| **Start Round** | **200 — round 1 `ACTIVE`**, `started_at` set |
| Profile persisted | **11 dimensions**, no `TITLE_FIT`; en-dash in `Setup–punchline` round-trips |
| Picker after start | greyed out — `disabled={config.isActive}` mirrors the backend freeze |
| **Marketing student** | **reaches the Marketing Desk**, not the Waiting Room |

Both show-stoppers are gone. Before this phase, start always returned
`409 "ideal_profile must be configured before start"` and every Marketing student was
stranded.

## Deviations and discoveries

**Task 1 grew a second half.** The implementer found the *mirror* of the bug it was fixing:
`context.tsx` mapped `Role.QUALITY_CONTROL → 'QC'` on the **outbound** PATCH, which the
backend rejects (`usecase/instructor.go:207-218`, `default: "unsupported role"`). Proven live
as a 400, fixed to `MARKETING`, and verified 400 → 200. The write vocabulary is now a separate
narrower type (`PatchUserRole`) from the read vocabulary (`ApiRole`) — inbound tolerates a
legacy `'QC'` from a stale browser, outbound cannot emit one. Deliberately not unified.

**A plan instruction was correctly refused.** This plan said to drop `'CUSTOMER'` from
`ApiRole` because "the server can never send it". True of the server, false of the repo:
removing it took typecheck from 1 error to 4 (the mock's own response shapes are typed by
`ApiRole`) and would have stranded `DevRoleSwitcher`'s Customer button in the Waiting Room —
the very bug being fixed. The orthogonal half shipped; the rest did not.

**The mock would have broken on partial config bodies.** `services/mockApi.ts` required both
`customer_budget` and `batch_size` and 400'd otherwise. The new `updateConfig` sends only
changed fields, so in mock mode — the committed default — saving just a market price would
have popped "Settings were not saved to the server" every time. The mock now mirrors the real
all-optional `dto.ConfigRequest`.

**`vitest.config.ts` only collected `**/*.test.ts`.** The new `.test.tsx` was silently skipped
while the suite still reported green. Caught by requiring the *file count* to change, 10 → 11,
rather than trusting a pass.

**No debounce needed.** The plan worried `updateConfig` might POST per keystroke. It does not:
the config inputs write local state and `updateConfig` is called only behind an explicit
Apply button, itself disabled unless something changed.

## Known-remaining, by design

- `GET /v1/qc/queue/count` 404s — Content Backlog reads 0. **Phase 3C.**
- `GET /v1/rounds/{id}/market` 409s while the round is not ACTIVE, polled on a loop. Noise,
  pre-existing, not caused by this phase. **3C.**
- "Created to Publish" shows `—` (`rated_at` vs `processed_at`) and Content Waste reads 0
  (`RATED` vs `PROCESSED`, `jokes_created` missing). **3C for the field names, 3B for the
  missing fields.**
- JM cannot submit and Marketing cannot split — the backend has no `raw_text` and no split
  endpoint. **Phase 3B.**
