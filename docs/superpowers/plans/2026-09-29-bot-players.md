# Bot Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an instructor run a full class of bot teams from one click — alone or alongside human teams — and open any bot's real Joke Maker or Marketing screen, read-only, with the bot's reasoning beside it.

**Architecture:** A framework-free bot engine (`services/bots/`) runs inside a Web Worker hosted by a new `BotPanel` in the instructor view, driving the real HTTP API with one `X-User-Id` per bot. Watch mode is a per-tab identity override (`?watch=<id>`, held in sessionStorage) plus read-only enforcement and a reasoning strip fed over `BroadcastChannel`. Frontend only — no backend change.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6 (module workers), Vitest 2 (node environment), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-29-bot-players-design.md`
**Branch:** `feat/bot-players`

---

## Facts this plan depends on (verified against source)

- **Auto-Assign shuffles.** `usecase/instructor.go` `loadAssignableParticipants` loads `WAITING` *and* `ASSIGNED` users and calls `r.Shuffle`. Deterministic teams need a re-pin with `PATCH /v1/instructor/rounds/{id}/users/{uid}`, whose body is `{status, role?, team_id?}`.
- **Starting needs an ideal profile.** `usecase/instructor.go:239-245` returns `409 "ideal_profile must be configured before start"` when the round has none. `POST /v1/admin/reset` truncates `round_ideal_profile`. The real Start button (`context.tsx:1935`) therefore sends `ideal_profile: config.idealProfile` in the start body, and bots must do the same.
- **Publish carries no topic.** `dto/models.go:34-38`: `{joke_id, joke_title, is_published}` only.
- **Round 1 rules.** The split must equal `batch_size`, and at least one joke must be published (`usecase/marketing.go:218`).
- **`titleFor(text)` throws** on text that is not a corpus fixture (`jokes.ts` `lookup`).
- **Identity is in localStorage** (`apiClient.ts:103`, `context.tsx:509`), shared by every tab. The only localStorage write a read-only watch tab can reach is `logout()` (`context.tsx:1490-1493`, `1515-1516`); the rest run only after a successful POST.
- **Playwright disables background throttling by default** (`--disable-background-timer-throttling`, `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows`). A throttling experiment must remove those flags or it proves nothing.

## File structure

**Moved (Task 2)**
- `scripts/e2e/harness/client.ts` → `services/shared/client.ts` — per-actor HTTP client.
- `scripts/e2e/fixtures/jokes.ts` → `services/shared/jokes.ts` — 60-joke corpus, gains `seededRng`.

**Created — Phase 1**
- `scripts/spikes/worker-throttle/run.mjs` — throttling spike.
- `services/bots/naming.ts` — bot display names; the single "is this a bot" test.
- `services/bots/personas.ts` — persona table, pacing constants, pure decisions.
- `services/bots/deck.ts` — draws jokes with replacement.
- `services/bots/placement.ts` — lobby → deterministic layout → PATCH list.
- `services/bots/api.ts` — `BotApi`, the client slice the engine uses.
- `services/bots/protocol.ts` — worker and channel message types.
- `services/bots/testing/fakeApi.ts` — in-memory backend for engine tests.
- `services/bots/engine.ts` — the actors.
- `services/bots/worker.ts` — Web Worker host.
- `components/BotPanel.tsx` — the panel.
- `scripts/e2e/browser/session.ts` — Playwright session helpers, extracted.
- `scripts/e2e/browser/bots.spec.ts` — live test.
- Tests: `services/shared/jokes.rng.test.ts`, `services/bots/{naming,personas,deck,placement,engine}.test.ts`.

**Created — Phase 2**
- `services/watchMode.ts` + `services/watchMode.test.ts` — per-tab identity.
- `components/WatchShell.tsx` — banner and reasoning strip.

**Modified**
- `scripts/e2e/{run.ts,harness/class.ts,harness/wait.ts,assertions/*.ts}` — import paths (Task 2).
- `services/apiClient.ts` + test — base-URL export (Task 10); watch identity and read-only (Task 15).
- `views/Instructor.tsx` — mount the panel (Task 11).
- `scripts/e2e/browser/roles.spec.ts` — import extracted helpers (Task 12).
- `context.tsx`, `components.tsx`, `index.tsx` — watch-mode identity, logout guard, tutorial (Task 16).
- `views/JokeMaker.tsx`, `views/QualityControl.tsx` — read-only action cards (Task 17).
- `App.tsx` — wrap in `WatchShell` (Task 18).
- `README.md` — docs (Task 21).

## Conventions for every task

- Comments explain **why**, in the codebase's existing voice. Cite `file:line` for backend facts.
- After each task: `npx tsc --noEmit -p tsconfig.json` → **0 errors**, and `npx vitest run` → all pass. The suite is at **299** tests before this plan.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Never run `npm run e2e` or anything that resets the live database unless a step says to.

---

# PHASE 1 — Bots

## Task 1: Spike — does a Web Worker keep pace in a hidden tab?

The spec's "verify first". Opening a watch tab backgrounds the instructor tab that hosts the bots. If a worker is throttled like main-thread timers, the architecture needs a visible bot-host window. Measure before building.

**Files:**
- Create: `scripts/spikes/worker-throttle/run.mjs`
- Modify: `docs/superpowers/specs/2026-09-29-bot-players-design.md` (record the result)

- [ ] **Step 1: Write the spike**

```js
// scripts/spikes/worker-throttle/run.mjs
/*
 * SPIKE — does a dedicated Web Worker keep ticking while its tab is hidden?
 *
 * The bot engine runs in a worker inside the instructor's tab. The moment the
 * instructor switches to a watch tab, that tab is hidden, and Chrome throttles
 * hidden pages: after ~5 minutes "intensive throttling" limits main-thread timer
 * chains to roughly one wake-up per minute. If a worker suffers the same, bots
 * would crawl exactly when someone is watching them.
 *
 * Two counters tick once a second: one on the main thread (the CONTROL — it must
 * slow down, or throttling never engaged and the run proves nothing) and one in
 * a worker (the SUBJECT).
 *
 * Playwright launches Chromium with background throttling switched OFF. Those
 * flags are removed below; without that, every run would "pass".
 *
 * Usage: node scripts/spikes/worker-throttle/run.mjs     (SPIKE_MINUTES=7 default)
 */
import { chromium } from '@playwright/test';

const MINUTES = Number(process.env.SPIKE_MINUTES ?? 7);
const ORIGIN = 'http://spike.local/';
const PAGE = `<!doctype html><html><body><script>
  window.mainTicks = 0; window.workerTicks = 0; window.hiddenSeen = false;
  setInterval(() => { window.mainTicks++; }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') window.hiddenSeen = true;
  });
  const src = 'let n = 0; setInterval(() => postMessage(++n), 1000);';
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = e => { window.workerTicks = e.data; };
</script></body></html>`;

const browser = await chromium.launch({
  headless: false,
  ignoreDefaultArgs: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const context = await browser.newContext();
await context.route(`${ORIGIN}**`, route => route.fulfill({ contentType: 'text/html', body: PAGE }));

const botHost = await context.newPage();
await botHost.goto(ORIGIN);
const watcher = await context.newPage();
await watcher.goto('about:blank');
await watcher.bringToFront();

console.log(`bot-host tab is behind another tab; waiting ${MINUTES} minute(s)…`);
await watcher.waitForTimeout(MINUTES * 60_000);

const r = await botHost.evaluate(() => ({
  main: window.mainTicks,
  worker: window.workerTicks,
  hiddenSeen: window.hiddenSeen,
}));
await browser.close();

const expected = MINUTES * 60;
const pct = n => Math.round((100 * n) / expected);
console.log(`expected ≈${expected} ticks · main thread ${r.main} (${pct(r.main)}%) · worker ${r.worker} (${pct(r.worker)}%)`);

if (!r.hiddenSeen) {
  console.log('INCONCLUSIVE: the bot-host tab never became hidden.');
  process.exit(2);
}
if (pct(r.main) >= 90) {
  console.log('INCONCLUSIVE: the main-thread control was not throttled, so throttling never engaged.');
  process.exit(2);
}
if (pct(r.worker) >= 90) {
  console.log('PASS: main thread was throttled, the worker kept pace.');
  process.exit(0);
}
console.log('FAIL: the worker was throttled too.');
process.exit(1);
```

- [ ] **Step 2: Run it**

Run: `node scripts/spikes/worker-throttle/run.mjs`
Expected: after ~7 minutes, a line `PASS: main thread was throttled, the worker kept pace.` with the worker at ≥90% and the main thread noticeably lower.

- [ ] **Step 3: Act on the result**

- **PASS** → continue with Task 2.
- **INCONCLUSIVE** → rerun once with `SPIKE_MINUTES=10`. If still inconclusive, record that and continue; the Task 13 live test and a manual watch session become the verification.
- **FAIL** → **stop the plan and report to the user.** The spec's fallback is a dedicated, visible bot-host window, which changes Task 11's design.

- [ ] **Step 4: Record the result in the spec**

Append to §10 "Verify first" of `docs/superpowers/specs/2026-09-29-bot-players-design.md`:

```markdown

**Result (<today's date>):** <PASS | INCONCLUSIVE | FAIL> — main thread <N>% of expected ticks,
worker <N>% over <M> minutes hidden, Chromium <version from `npx playwright --version`>.
Measured by `scripts/spikes/worker-throttle/run.mjs` with Playwright's anti-throttling flags removed.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/spikes/worker-throttle/run.mjs docs/superpowers/specs/2026-09-29-bot-players-design.md
git commit -m "spike: measure Web Worker timers in a hidden tab

Records whether the bot engine can live in the instructor tab while the
instructor is looking at a watch tab.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Move the shared client and corpus; export a seeded RNG

The bot engine and the e2e suite need the same per-actor client and joke corpus. Move them once so there is one copy.

**Files:**
- Move: `scripts/e2e/harness/client.ts` → `services/shared/client.ts`
- Move: `scripts/e2e/fixtures/jokes.ts` → `services/shared/jokes.ts`
- Modify: every importer under `scripts/e2e/`
- Create: `services/shared/jokes.rng.test.ts`

- [ ] **Step 1: Move the files**

```bash
mkdir -p services/shared
git mv scripts/e2e/harness/client.ts services/shared/client.ts
git mv scripts/e2e/fixtures/jokes.ts services/shared/jokes.ts
```

- [ ] **Step 2: Fix the moved files' own imports**

```bash
sed -i '' "s#from '../../../types/api'#from '../../types/api'#" services/shared/client.ts
sed -i '' "s#from '../../../config/dimensions'#from '../../config/dimensions'#g; s#from '../../../services/jokeSplit'#from '../jokeSplit'#" services/shared/jokes.ts
```

- [ ] **Step 3: Rewrite the importers**

```bash
sed -i '' "s#from './fixtures/jokes'#from '../../services/shared/jokes'#; s#from './harness/client'#from '../../services/shared/client'#" scripts/e2e/run.ts
sed -i '' "s#from '../fixtures/jokes'#from '../../../services/shared/jokes'#; s#from './client'#from '../../../services/shared/client'#" scripts/e2e/harness/class.ts scripts/e2e/harness/wait.ts
sed -i '' "s#from '../fixtures/jokes'#from '../../../services/shared/jokes'#; s#from '../harness/client'#from '../../../services/shared/client'#" scripts/e2e/assertions/*.ts
```

- [ ] **Step 4: Verify nothing still points at the old paths**

Run: `grep -rnE "fixtures/jokes|harness/client|from '\./client'" scripts services --include=*.ts`
Expected: no output.

- [ ] **Step 5: Write the failing RNG test**

```ts
// services/shared/jokes.rng.test.ts
import { describe, it, expect } from 'vitest';
import { seededRng } from './jokes';

describe('seededRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRng('bots:1');
    const b = seededRng('bots:1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs between seeds', () => {
    expect(seededRng('bots:1')()).not.toBe(seededRng('bots:2')());
  });

  it('stays in [0, 1)', () => {
    const r = seededRng('range');
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run services/shared/jokes.rng.test.ts`
Expected: FAIL — `seededRng` is not exported.

- [ ] **Step 7: Export `seededRng`**

In `services/shared/jokes.ts`, directly after the `mulberry32` function, add:

```ts
/** A seeded PRNG for callers outside this file. The bot engine deals its decks
 *  and makes its persona choices with it. Same FNV-1a + mulberry32 pair the
 *  fixture dealer uses, so a seed string means the same thing everywhere. */
export function seededRng(seed: string | number): () => number {
  return mulberry32(hashSeed(seed));
}
```

- [ ] **Step 8: Verify everything still passes**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK`
Expected: 302 passed, then `TYPECHECK_OK`.

Run: `env -u E2E_ADMIN_PASSWORD npx tsx scripts/e2e/run.ts; echo "exit=$?"`
Expected: the `REFUSING TO RUN — E2E_ADMIN_PASSWORD is not set.` message and `exit=1` — proves the e2e module graph still loads after the move.

- [ ] **Step 9: Commit**

```bash
git add -A services/shared scripts/e2e
git commit -m "refactor: share the per-actor client and joke corpus

Moves them out of scripts/e2e so the bot engine and the e2e suite use one
copy, and exports the corpus's seeded RNG.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Bot naming

**Files:**
- Create: `services/bots/naming.ts`
- Test: `services/bots/naming.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/bots/naming.test.ts
import { describe, it, expect } from 'vitest';
import { BOT_PREFIX, SEAT_ROLE, botName, isBotName, parseBotName } from './naming';

describe('bot naming', () => {
  it('names seats with a two-digit team index', () => {
    expect(botName(3, 'A')).toBe(`${BOT_PREFIX}03A`);
    expect(botName(12, 'B')).toBe(`${BOT_PREFIX}12B`);
  });

  it('round-trips through the parser', () => {
    expect(parseBotName(botName(7, 'B'))).toEqual({ index: 7, seat: 'B' });
  });

  it('also accepts the text-only prefix', () => {
    expect(parseBotName('[BOT] 04A')).toEqual({ index: 4, seat: 'A' });
  });

  it('does not mistake humans for bots', () => {
    for (const name of ['alice_bob', 'Bot 03A', '🤖 Bot 3A', '🤖 Bot 03C', '🤖 Bot 03A extra']) {
      expect(isBotName(name)).toBe(false);
    }
  });

  it('maps seat A to the Joke Maker and B to Marketing', () => {
    expect(SEAT_ROLE).toEqual({ A: 'JM', B: 'MARKETING' });
  });

  it('refuses indices it cannot print in two digits', () => {
    expect(() => botName(0, 'A')).toThrow(RangeError);
    expect(() => botName(100, 'A')).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run services/bots/naming.test.ts`
Expected: FAIL — cannot find module `./naming`.

- [ ] **Step 3: Implement**

```ts
// services/bots/naming.ts
/**
 * Bot identity lives entirely in the display name.
 *
 * WHY THE NAME AND NOT A FLAG: the backend has no notion of a bot user, and this
 * feature is frontend-only by design. A name the backend stores verbatim is the
 * one marker every existing screen already renders — lobby, leaderboard, team
 * names — so bots show up as bots with zero component changes. The prefix is
 * therefore the single source of truth for "is this user a bot".
 *
 * `🤖 Bot 03A`: two-digit team index, then the seat. A is the Joke Maker, B is
 * Marketing. Session join is idempotent by display name, so a second run reuses
 * the same users instead of accumulating new ones.
 *
 * The parser also accepts `[BOT] 03A`, the fallback if a deployment ever turns
 * out to mangle the emoji.
 */
export const BOT_PREFIX = '🤖 Bot ';

export type Seat = 'A' | 'B';
export type SeatRole = 'JM' | 'MARKETING';

export const SEAT_ROLE: Readonly<Record<Seat, SeatRole>> = { A: 'JM', B: 'MARKETING' };

export interface BotIdentity {
  index: number;
  seat: Seat;
}

export function botName(index: number, seat: Seat): string {
  if (!Number.isInteger(index) || index < 1 || index > 99) {
    throw new RangeError(`bot team index must be 1..99, got ${index}`);
  }
  return `${BOT_PREFIX}${String(index).padStart(2, '0')}${seat}`;
}

const PATTERN = /^(?:🤖 Bot |\[BOT\] )(\d{2})([AB])$/u;

export function parseBotName(name: string): BotIdentity | null {
  const m = PATTERN.exec(name);
  return m ? { index: Number(m[1]), seat: m[2] as Seat } : null;
}

export function isBotName(name: string): boolean {
  return parseBotName(name) !== null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run services/bots/naming.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Verify the live backend stores the emoji verbatim**

This creates one throwaway user on the live backend and deletes it again.

```bash
BE=https://jokefactory-api.whitepebble-2daa4226.westus2.azurecontainerapps.io
PW=$(cat ~/.jokefactory-admin-password)
BOT=$(curl -s -X POST "$BE/v1/session/join" -H 'Content-Type: application/json' -d '{"display_name":"🤖 Bot 99A"}')
echo "$BOT"
BOT_ID=$(echo "$BOT" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['user_id'])")
python3 -c "import json,sys; n=json.loads(sys.argv[1])['user']['display_name']; print('VERBATIM' if n=='🤖 Bot 99A' else 'MANGLED: '+repr(n))" "$BOT"
IID=$(curl -s -X POST "$BE/v1/instructor/login" -H 'Content-Type: application/json' -d "$(printf '{"display_name":"E2E Instructor","password":"%s"}' "$PW")" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['user_id'])")
curl -s -o /dev/null -w "cleanup: HTTP %{http_code}\n" -X DELETE "$BE/v1/instructor/rounds/1/users/$BOT_ID" -H "X-User-Id: $IID"
```

Expected: `VERBATIM` and `cleanup: HTTP 200`.
If `MANGLED`: change `BOT_PREFIX` to `'[BOT] '`, update the first test's expectations to match, rerun Step 4, and note the finding in the commit message.

- [ ] **Step 6: Commit**

```bash
git add services/bots/naming.ts services/bots/naming.test.ts
git commit -m "feat(bots): name bot seats so every screen shows them as bots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Personas and the joke deck

**Files:**
- Create: `services/bots/personas.ts`, `services/bots/deck.ts`
- Test: `services/bots/personas.test.ts`, `services/bots/deck.test.ts`

- [ ] **Step 1: Write the failing persona test**

```ts
// services/bots/personas.test.ts
import { describe, it, expect } from 'vitest';
import {
  PERSONAS, choosePublished, jitter, personaSequence, publishCount, type Persona,
} from './personas';

const always = (x: number) => () => x;

describe('publishCount', () => {
  it('Careful publishes two, Spray publishes everything', () => {
    expect(publishCount(PERSONAS.CAREFUL, 5, 1, always(0.5))).toBe(2);
    expect(publishCount(PERSONAS.SPRAY, 5, 1, always(0.5))).toBe(5);
  });

  it('Balanced publishes three or four depending on the roll', () => {
    expect(publishCount(PERSONAS.BALANCED, 5, 1, always(0.1))).toBe(3);
    expect(publishCount(PERSONAS.BALANCED, 5, 1, always(0.9))).toBe(4);
  });

  it('never publishes more jokes than the batch has', () => {
    expect(publishCount(PERSONAS.SPRAY, 3, 2, always(0.5))).toBe(3);
    expect(publishCount(PERSONAS.BALANCED, 2, 2, always(0.9))).toBe(2);
  });

  it('enforces round 1\'s at-least-one rule even for a persona that would publish nothing', () => {
    const silent: Persona = { ...PERSONAS.CAREFUL, publish: () => 0 };
    expect(publishCount(silent, 5, 1, always(0.5))).toBe(1);
    expect(publishCount(silent, 5, 2, always(0.5))).toBe(0);
  });

  it('publishes nothing from an empty batch', () => {
    expect(publishCount(PERSONAS.SPRAY, 0, 1, always(0.5))).toBe(0);
  });
});

describe('choosePublished', () => {
  const ids = [11, 12, 13, 14, 15];

  it('keeps exactly the requested number of the given ids', () => {
    let seed = 0.37;
    const rand = () => (seed = (seed * 9301 + 0.49297) % 1);
    const kept = choosePublished(ids, 2, rand);
    expect(kept.size).toBe(2);
    for (const id of kept) expect(ids).toContain(id);
  });

  it('clamps to the pool', () => {
    expect(choosePublished(ids, 9, always(0.5)).size).toBe(5);
    expect(choosePublished(ids, -1, always(0.5)).size).toBe(0);
  });
});

describe('jitter', () => {
  it('stays within ±25% by default', () => {
    expect(jitter(1000, always(0))).toBe(750);
    expect(jitter(1000, always(0.999999))).toBe(1250);
  });
});

describe('personaSequence', () => {
  it('interleaves personas so each spans the team numbers', () => {
    expect(personaSequence({ CAREFUL: 2, BALANCED: 2, SPRAY: 2 }))
      .toEqual(['CAREFUL', 'BALANCED', 'SPRAY', 'CAREFUL', 'BALANCED', 'SPRAY']);
  });

  it('handles uneven and empty counts', () => {
    expect(personaSequence({ CAREFUL: 2, BALANCED: 0, SPRAY: 1 })).toEqual(['CAREFUL', 'SPRAY', 'CAREFUL']);
    expect(personaSequence({ CAREFUL: 0, BALANCED: 0, SPRAY: 0 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing deck test**

```ts
// services/bots/deck.test.ts
import { describe, it, expect } from 'vitest';
import { Deck } from './deck';
import { seededRng, variedCorpus } from '../shared/jokes';

describe('Deck', () => {
  it('never repeats a joke within one batch, even across reshuffles', () => {
    const deck = new Deck(variedCorpus, seededRng('deck'));
    for (let batch = 0; batch < 200; batch++) {
      const ids = deck.draw(5).map(j => j.id);
      expect(new Set(ids).size).toBe(5);
    }
  });

  it('works through the whole corpus before repeating', () => {
    const deck = new Deck(variedCorpus, seededRng('coverage'));
    const seen = new Set<string>();
    for (let i = 0; i < variedCorpus.length / 5; i++) for (const j of deck.draw(5)) seen.add(j.id);
    expect(seen.size).toBe(variedCorpus.length);
  });

  it('refuses a draw larger than the corpus', () => {
    expect(() => new Deck(variedCorpus.slice(0, 3), seededRng('x')).draw(4)).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run services/bots/personas.test.ts services/bots/deck.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement personas**

```ts
// services/bots/personas.ts
/**
 * How each bot team plays.
 *
 * Personas differ in VOLUME and PACE, not in selection quality. Bots cannot see
 * fit — no route serves it to any client — and the corpus has no structured
 * dimension tags, so a bot has nothing to judge quality with. That bounds what
 * this feature can answer: "under the current cost structure, does publishing
 * less ever beat publishing more?" It cannot answer whether well-chosen jokes
 * beat more jokes; that needs a quality-aware persona, which fits this table
 * without changing the engine.
 */
export type PersonaId = 'CAREFUL' | 'BALANCED' | 'SPRAY';

export interface Persona {
  readonly id: PersonaId;
  readonly label: string;
  /** The Joke Maker's gap between batches, at 1× speed. */
  readonly submitIntervalMs: number;
  /** Careful holds its next batch until the previous one has customer feedback. */
  readonly waitForFeedback: boolean;
  /** How many of `jokeCount` to publish, before round rules are applied. */
  readonly publish: (jokeCount: number, rand: () => number) => number;
}

export const PERSONAS: Readonly<Record<PersonaId, Persona>> = {
  CAREFUL: {
    id: 'CAREFUL', label: 'Careful', submitIntervalMs: 150_000, waitForFeedback: true,
    publish: n => Math.min(2, n),
  },
  BALANCED: {
    id: 'BALANCED', label: 'Balanced', submitIntervalMs: 90_000, waitForFeedback: false,
    publish: (n, rand) => Math.min(rand() < 0.5 ? 3 : 4, n),
  },
  SPRAY: {
    id: 'SPRAY', label: 'Spray', submitIntervalMs: 45_000, waitForFeedback: false,
    publish: n => n,
  },
};

export const PERSONA_ORDER: readonly PersonaId[] = ['CAREFUL', 'BALANCED', 'SPRAY'];

/** Marketing's pause after each stage, at 1×, so a watched screen shows every state. */
export const DWELL_MS = { claim: 10_000, split: 15_000, decide: 10_000 } as const;
/** Careful's longest wait for feedback, at 1×. Divided by speed like every other wait. */
export const FEEDBACK_WAIT_MS = 180_000;
export const QUEUE_POLL_MS = 3_000;
export const IDLE_POLL_MS = 5_000;
/** Each classification is a paid Azure LLM call, so each bot team is capped per round. */
export const BATCH_CAP_PER_ROUND = 8;
export const MAX_BOT_TEAMS = 12;

export function publishCount(
  persona: Persona, jokeCount: number, roundNumber: number, rand: () => number,
): number {
  if (jokeCount <= 0) return 0;
  const wanted = Math.max(0, Math.min(persona.publish(jokeCount, rand), jokeCount));
  // Round 1 refuses a batch with nothing published (usecase/marketing.go:218).
  // Every persona already clears it; this guards a future one that would not.
  return roundNumber === 1 ? Math.max(1, wanted) : wanted;
}

/** Which jokes to keep. Seeded random: personas choose volume, not quality. */
export function choosePublished(
  jokeIds: readonly number[], count: number, rand: () => number,
): Set<number> {
  const pool = jokeIds.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, Math.max(0, Math.min(count, pool.length))));
}

/** Spread a duration by ±`spread` so bots never move in lockstep. */
export function jitter(ms: number, rand: () => number, spread = 0.25): number {
  return Math.round(ms * (1 - spread + 2 * spread * rand()));
}

/** Persona per bot team, interleaved so each persona spans the team numbers. */
export function personaSequence(counts: Readonly<Record<PersonaId, number>>): PersonaId[] {
  const left: Record<PersonaId, number> = { ...counts };
  const out: PersonaId[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const id of PERSONA_ORDER) {
      if (left[id] > 0) {
        out.push(id);
        left[id]--;
        progressed = true;
      }
    }
  }
  return out;
}
```

- [ ] **Step 5: Implement the deck**

```ts
// services/bots/deck.ts
import type { JokeFixture } from '../shared/jokes';

/**
 * Draws jokes WITH replacement.
 *
 * The corpus has 60 jokes. At human pace a bot team submits every one to two
 * minutes, so a ten-minute round wants 25–40 jokes per team. Each team works
 * through its own shuffle of the corpus and reshuffles when it runs dry. A
 * reshuffle never hands back a joke already in the batch being drawn, so one
 * batch never contains the same joke twice.
 */
export class Deck {
  private pile: JokeFixture[] = [];

  constructor(
    private readonly corpus: readonly JokeFixture[],
    private readonly rand: () => number,
  ) {
    if (corpus.length === 0) throw new Error('Deck needs a non-empty corpus');
  }

  draw(n: number): JokeFixture[] {
    if (n > this.corpus.length) {
      throw new RangeError(`cannot draw ${n} distinct jokes from ${this.corpus.length}`);
    }
    const out: JokeFixture[] = [];
    while (out.length < n) {
      if (this.pile.length === 0) this.pile = this.reshuffle(out);
      out.push(this.pile.pop() as JokeFixture);
    }
    return out;
  }

  private reshuffle(exclude: readonly JokeFixture[]): JokeFixture[] {
    const taken = new Set(exclude.map(j => j.id));
    const pile = this.corpus.filter(j => !taken.has(j.id));
    for (let i = pile.length - 1; i > 0; i--) {
      const k = Math.floor(this.rand() * (i + 1));
      [pile[i], pile[k]] = [pile[k], pile[i]];
    }
    return pile;
  }
}
```

- [ ] **Step 6: Run both to verify they pass**

Run: `npx vitest run services/bots/personas.test.ts services/bots/deck.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add services/bots/personas.ts services/bots/personas.test.ts services/bots/deck.ts services/bots/deck.test.ts
git commit -m "feat(bots): add Careful, Balanced and Spray personas and a joke deck

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Team placement

**Files:**
- Create: `services/bots/placement.ts`
- Test: `services/bots/placement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/bots/placement.test.ts
import { describe, it, expect } from 'vitest';
import type { LobbyResponse, Role } from '../../types/api';
import { botName } from './naming';
import { planPlacement, teamsNeeded } from './placement';

type Member = [userId: number, name: string, role: Role];

function lobby(teams: Array<[teamId: number, members: Member[]]>, unassigned: Array<[number, string]> = []): LobbyResponse {
  return {
    RoundID: 1,
    Summary: {
      Waiting: unassigned.length,
      Assigned: teams.reduce((n, [, m]) => n + m.length, 0),
      Dropped: 0,
      TeamCount: teams.length,
    },
    Teams: teams.map(([id, members]) => ({
      Team: { id, name: `Team ${id}`, created_at: '2026-01-01T00:00:00Z' },
      Members: members.map(([UserID, DisplayName, Role]) => ({ UserID, DisplayName, Role })),
    })),
    Unassigned: unassigned.map(([UserID, DisplayName]) => ({ UserID, DisplayName, Status: 'WAITING' as const })),
  };
}

const target = (plan: ReturnType<typeof planPlacement>, userId: number) =>
  plan.placements.find(p => p.userId === userId);

describe('teamsNeeded', () => {
  it('is one team per human pair plus one per bot team', () => {
    expect(teamsNeeded(0, 3)).toBe(3);
    expect(teamsNeeded(2, 3)).toBe(4);
    expect(teamsNeeded(3, 3)).toBe(5);
  });
});

describe('planPlacement', () => {
  it('gives each bot team its own team, seat A as Joke Maker', () => {
    const plan = planPlacement(lobby([
      [1, [[10, botName(2, 'B'), 'JM'], [11, botName(1, 'A'), 'MARKETING']]],
      [2, [[12, botName(1, 'B'), 'JM'], [13, botName(2, 'A'), 'MARKETING']]],
    ]));
    expect(target(plan, 11)).toMatchObject({ teamId: 1, role: 'JM' });
    expect(target(plan, 12)).toMatchObject({ teamId: 1, role: 'MARKETING' });
    expect(target(plan, 13)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(target(plan, 10)).toMatchObject({ teamId: 2, role: 'MARKETING' });
    expect(plan).toMatchObject({ humanTeamCount: 0, botTeamCount: 2, unpairedHuman: null });
  });

  it('moves humans to the lowest-numbered teams and bots after them', () => {
    const plan = planPlacement(lobby([
      [1, [[30, botName(1, 'A'), 'JM'], [31, botName(1, 'B'), 'MARKETING']]],
      [2, [[20, 'alice', 'JM'], [21, 'bob', 'MARKETING']]],
    ]));
    expect(target(plan, 20)).toMatchObject({ teamId: 1, role: 'JM' });
    expect(target(plan, 21)).toMatchObject({ teamId: 1, role: 'MARKETING' });
    expect(target(plan, 30)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(plan.teamIdByBotIndex.get(1)).toBe(2);
    expect(plan.patches).toHaveLength(4);
  });

  it('gives the second human of a pair the other role when the shuffle made both Joke Makers', () => {
    const plan = planPlacement(lobby([
      [1, [[20, 'alice', 'JM']]],
      [2, [[21, 'bob', 'JM']]],
    ]));
    expect(target(plan, 20)).toMatchObject({ teamId: 1, role: 'JM' });
    expect(target(plan, 21)).toMatchObject({ teamId: 1, role: 'MARKETING' });
  });

  it('flags an odd human instead of pairing them with a bot', () => {
    const plan = planPlacement(lobby([[1, []], [2, []]], [[20, 'alice'], [21, 'bob'], [22, 'carol']]));
    expect(plan.unpairedHuman?.userId).toBe(22);
    expect(target(plan, 22)).toMatchObject({ teamId: 2, role: 'JM' });
    expect(plan.humanTeamCount).toBe(2);
  });

  it('places unassigned bots too', () => {
    const plan = planPlacement(lobby([[5, []]], [[40, botName(1, 'B')], [41, botName(1, 'A')]]));
    expect(target(plan, 41)).toMatchObject({ teamId: 5, role: 'JM' });
    expect(target(plan, 40)).toMatchObject({ teamId: 5, role: 'MARKETING' });
  });

  it('produces no patches when the lobby is already in place', () => {
    const plan = planPlacement(lobby([
      [1, [[20, 'alice', 'JM'], [21, 'bob', 'MARKETING']]],
      [2, [[30, botName(1, 'A'), 'JM'], [31, botName(1, 'B'), 'MARKETING']]],
    ]));
    expect(plan.patches).toEqual([]);
  });

  it('refuses a lobby with too few teams', () => {
    expect(() => planPlacement(lobby([[1, []]], [
      [30, botName(1, 'A')], [31, botName(1, 'B')], [32, botName(2, 'A')], [33, botName(2, 'B')],
    ]))).toThrow(/needs 2 teams/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run services/bots/placement.test.ts`
Expected: FAIL — cannot find module `./placement`.

- [ ] **Step 3: Implement**

```ts
// services/bots/placement.ts
/**
 * Where everyone sits.
 *
 * WHY THIS EXISTS. `POST .../assign` randomly shuffles every WAITING and
 * ASSIGNED participant (usecase/instructor.go, loadAssignableParticipants), so
 * left alone it puts bots and humans on the same teams. The engine calls assign
 * once — that creates the teams and their round state — and then uses this plan
 * to PATCH everyone into a deterministic layout: humans on the lowest team ids,
 * each bot team on its own team after them.
 *
 * Pure: a lobby snapshot in, a layout out. No I/O.
 */
import type { LobbyResponse } from '../../types/api';
import { parseBotName, SEAT_ROLE, type SeatRole } from './naming';

export interface Participant {
  userId: number;
  name: string;
  role: SeatRole | null;
  teamId: number | null;
}

export interface Placement {
  userId: number;
  name: string;
  role: SeatRole;
  teamId: number;
}

export interface PlacementPlan {
  /** Every participant's target seat. */
  placements: Placement[];
  /** Only the placements that differ from where the participant is now. */
  patches: Placement[];
  humanTeamCount: number;
  botTeamCount: number;
  /** An odd human out. Flagged, never silently paired with a bot. */
  unpairedHuman: Participant | null;
  /** Bot team index (the `03` in `🤖 Bot 03A`) → backend team id. */
  teamIdByBotIndex: Map<number, number>;
}

export function participantsOf(lobby: LobbyResponse): Participant[] {
  const out: Participant[] = [];
  for (const team of lobby.Teams ?? []) {
    for (const m of team.Members) {
      const role = m.Role === 'JM' || m.Role === 'MARKETING' ? m.Role : null;
      out.push({ userId: m.UserID, name: m.DisplayName, role, teamId: team.Team.id });
    }
  }
  for (const u of lobby.Unassigned ?? []) {
    out.push({ userId: u.UserID, name: u.DisplayName, role: null, teamId: null });
  }
  return out;
}

export function teamsNeeded(humanCount: number, botTeamCount: number): number {
  return Math.ceil(humanCount / 2) + botTeamCount;
}

export function planPlacement(lobby: LobbyResponse): PlacementPlan {
  const teamIds = (lobby.Teams ?? []).map(t => t.Team.id).sort((a, b) => a - b);
  const everyone = participantsOf(lobby);

  // Sorting by current team keeps a human pair that assign already put together
  // together, and JM-first keeps their roles, so a good shuffle costs no patches.
  const humans = everyone.filter(p => parseBotName(p.name) === null).sort(byTeamRoleId);
  const bots = everyone.filter(p => parseBotName(p.name) !== null);
  const botIndices = [...new Set(bots.map(b => (parseBotName(b.name) as { index: number }).index))]
    .sort((a, b) => a - b);

  const humanTeamCount = Math.ceil(humans.length / 2);
  const needed = humanTeamCount + botIndices.length;
  if (teamIds.length < needed) {
    throw new Error(
      `placement needs ${needed} teams (${humanTeamCount} human + ${botIndices.length} bot) ` +
        `but the lobby has ${teamIds.length}`,
    );
  }

  const placements: Placement[] = [];
  for (let pair = 0; pair < humanTeamCount; pair++) {
    const teamId = teamIds[pair];
    const first = humans[pair * 2];
    const second = humans[pair * 2 + 1];
    const firstRole: SeatRole = first.role ?? 'JM';
    placements.push({ userId: first.userId, name: first.name, role: firstRole, teamId });
    if (second) {
      // The shuffle routinely makes two humans both Joke Makers; one team cannot
      // hold that, so the second of the pair takes the other role.
      placements.push({ userId: second.userId, name: second.name, role: other(firstRole), teamId });
    }
  }
  const unpairedHuman = humans.length % 2 === 1 ? humans[humans.length - 1] : null;

  const teamIdByBotIndex = new Map<number, number>();
  botIndices.forEach((index, rank) => teamIdByBotIndex.set(index, teamIds[humanTeamCount + rank]));
  for (const bot of bots) {
    const id = parseBotName(bot.name) as { index: number; seat: 'A' | 'B' };
    placements.push({
      userId: bot.userId,
      name: bot.name,
      role: SEAT_ROLE[id.seat],
      teamId: teamIdByBotIndex.get(id.index) as number,
    });
  }

  const current = new Map(everyone.map(p => [p.userId, p]));
  const patches = placements.filter(p => {
    const now = current.get(p.userId) as Participant;
    return now.teamId !== p.teamId || now.role !== p.role;
  });

  return {
    placements, patches, humanTeamCount, botTeamCount: botIndices.length, unpairedHuman, teamIdByBotIndex,
  };
}

function other(role: SeatRole): SeatRole {
  return role === 'JM' ? 'MARKETING' : 'JM';
}

function byTeamRoleId(a: Participant, b: Participant): number {
  const team = (p: Participant) => p.teamId ?? Number.MAX_SAFE_INTEGER;
  const role = (p: Participant) => (p.role === 'JM' ? 0 : p.role === 'MARKETING' ? 1 : 2);
  return team(a) - team(b) || role(a) - role(b) || a.userId - b.userId;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run services/bots/placement.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add services/bots/placement.ts services/bots/placement.test.ts
git commit -m "feat(bots): plan deterministic teams around Auto-Assign's shuffle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Engine contracts and an in-memory backend

Types only, plus the test double the engine tests run against. No test of its own — Task 7's tests exercise it.

**Files:**
- Create: `services/bots/api.ts`, `services/bots/protocol.ts`, `services/bots/testing/fakeApi.ts`

- [ ] **Step 1: Write `api.ts`**

```ts
// services/bots/api.ts
import type {
  AssignRequest, BatchSplitRequest, BatchSubmitRequest, ConfigRequest, LobbyResponse,
  MarketingQueueEnvelope, PatchUserRequest, PublishRequest, RoundsActiveResponse,
  SessionJoinRequest, SessionJoinResponse, SessionMeResponse, TeamFeedbackResponse,
} from '../../types/api';

/**
 * The slice of the shared HTTP client the engine uses. An interface, so tests
 * can hand the engine an in-memory fake; the real JokeFactoryClient satisfies it
 * structurally (worker.ts assigns one to this type, so tsc checks that).
 */
export interface BotApi {
  as(userId: number, label: string): BotApi;
  sessionJoin(body: SessionJoinRequest): Promise<SessionJoinResponse>;
  sessionMe(): Promise<SessionMeResponse>;
  roundsActive(): Promise<RoundsActiveResponse>;
  submitBatch(roundId: number, body: BatchSubmitRequest): Promise<unknown>;
  teamFeedback(roundId: number, teamId: number): Promise<TeamFeedbackResponse>;
  marketingQueueNext(roundId: number): Promise<MarketingQueueEnvelope>;
  marketingSplit(batchId: number, body: BatchSplitRequest): Promise<MarketingQueueEnvelope>;
  marketingPublish(batchId: number, body: PublishRequest): Promise<unknown>;
  instructorLobby(roundId: number): Promise<LobbyResponse>;
  instructorAssign(roundId: number, body: AssignRequest): Promise<LobbyResponse>;
  instructorPatchUser(roundId: number, userId: number, body: PatchUserRequest): Promise<LobbyResponse>;
  instructorDeleteUser(roundId: number, userId: number): Promise<unknown>;
  instructorStart(roundId: number, body?: ConfigRequest): Promise<unknown>;
}

/** HTTP status off either the real ApiError or the fake's error. */
export function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}
```

- [ ] **Step 2: Write `protocol.ts`**

```ts
// services/bots/protocol.ts
/**
 * Messages between the Bot Panel, its worker, and watch tabs.
 *
 * Panel ↔ worker uses postMessage. Worker → watch tabs uses a BroadcastChannel,
 * because a watch tab is a separate tab with no handle on the worker; the
 * channel reaches every same-origin tab with no backend involved.
 */
import type { Seat } from './naming';
import type { PersonaId } from './personas';

export type Speed = 1 | 3 | 10;
export const SPEEDS: readonly Speed[] = [1, 3, 10];
export const BOT_CHANNEL = 'jf-bots';

export interface BotTeamSpec {
  index: number;
  persona: PersonaId;
}

export interface StartOptions {
  roundId: number;
  teams: BotTeamSpec[];
  speed: Speed;
  /** true for "Run all-bot class"; false for "Fill with bot teams". */
  startRound: boolean;
  /**
   * The instructor's hidden ideal joke, sent in the start request exactly as the
   * real Start button does (context.tsx). A freshly reset round has none, and
   * the backend refuses to start without one (usecase/instructor.go:239-245).
   */
  idealProfile?: Record<string, string>;
}

/**
 * The panel's commands. Each carries a `commandId` from a counter in the panel,
 * and the worker answers each with exactly one `done` carrying the same id once
 * the engine call settles. The panel's "working…" state is keyed to that id, so
 * it never guesses completion from how the status looks.
 */
export type Command = 'start' | 'stop' | 'remove' | 'reform';

export type ToWorker =
  | { type: 'init'; baseUrl: string; instructorUserId: number; seed: string }
  | { type: 'probe'; roundId: number }
  | { type: 'start'; commandId: number; options: StartOptions }
  | { type: 'stop'; commandId: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'remove'; commandId: number; roundId: number }
  | { type: 'reform'; commandId: number };

export interface SeatStatus {
  userId: number | null;
  name: string;
  activity: string;
  error: string | null;
}

export interface TeamStatus {
  index: number;
  persona: PersonaId;
  teamId: number | null;
  batchesPublished: number;
  jm: SeatStatus;
  marketing: SeatStatus;
}

export interface EngineStatus {
  running: boolean;
  speed: Speed;
  teams: TeamStatus[];
  /** Published jokes = Azure LLM classification calls this session. */
  classificationCalls: number;
  scrambled: boolean;
  warnings: string[];
}

export interface ProbeResult {
  humans: number;
  bots: number;
  roundStatus: 'CONFIGURED' | 'ACTIVE' | 'ENDED' | 'UNKNOWN';
}

export interface ReasoningEntry {
  botUserId: number;
  teamIndex: number;
  seat: Seat;
  persona: PersonaId;
  at: number;
  text: string;
}

export interface BotMeta {
  teamIndex: number;
  seat: Seat;
  persona: PersonaId;
  teamId: number | null;
}

export type CommandDone =
  | { type: 'done'; commandId: number; command: Command; ok: true }
  | { type: 'done'; commandId: number; command: Command; ok: false; message: string };

export type FromWorker =
  | { type: 'status'; status: EngineStatus }
  | { type: 'probe'; result: ProbeResult }
  | { type: 'log'; entry: ReasoningEntry }
  | CommandDone
  /** A failure outside any command: init, or a probe or speed change before init. */
  | { type: 'fatal'; message: string };

export type ChannelMessage =
  | { type: 'log'; entry: ReasoningEntry }
  | { type: 'history-request'; botUserId: number }
  | { type: 'history'; botUserId: number; entries: ReasoningEntry[]; meta: BotMeta | null };
```

- [ ] **Step 3: Write the fake backend**

```ts
// services/bots/testing/fakeApi.ts
/**
 * An in-memory backend for engine tests. It models only what the engine relies
 * on, but models it strictly: role checks, round-1 rules, claim locks, and an
 * Auto-Assign that deliberately scrambles bots and humans together so the tests
 * prove the engine re-pins them.
 */
import type {
  BatchSubmitRequest, ConfigRequest, FeedbackJoke, LobbyResponse, MarketingQueueEnvelope,
  PatchUserRequest, PublicRound, PublishRequest, Role, SessionMeResponse,
} from '../../../types/api';
import type { BotApi } from '../api';

export class FakeApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'FakeApiError';
  }
}

export interface FakeUser {
  id: number;
  name: string;
  role: Role | null;
  teamId: number | null;
  status: 'WAITING' | 'ASSIGNED';
}

interface FakeJoke { joke_id: number; joke_text: string; published: boolean }

export interface FakeBatch {
  id: number;
  /** The round it was submitted in; the queue and feedback are round-scoped. */
  roundId: number;
  teamId: number;
  rawText: string | null;
  jokes: FakeJoke[];
  state: 'QUEUED' | 'CLAIMED' | 'DONE';
  lockedBy: number | null;
}

export interface Decision { teamId: number; batchId: number; published: number; total: number }

const STAMP = '2026-01-01T00:00:00Z';

export class FakeWorld {
  readonly users = new Map<number, FakeUser>();
  teamIds: number[] = [];
  profileConfigured = false;
  round: PublicRound = {
    id: 1, round_number: 1, status: 'CONFIGURED', batch_size: 5, max_batch_size: 5,
    customer_budget: 3, market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0.01,
    customer_count: 100, feedback_joke_count: 3, started_at: null, ended_at: null,
    is_popped_active: false,
  };
  readonly batches: FakeBatch[] = [];
  readonly decisions: Decision[] = [];
  readonly calls: string[] = [];
  /**
   * Publishing enqueues an LLM classification, so a joke's dimensions arrive
   * after the publish, not with it. Tests turn this off to model the lag, then
   * call classify().
   */
  autoClassify = true;
  readonly classified = new Set<number>();
  /** Published joke ids in publish order, oldest first. */
  readonly publishOrder: number[] = [];
  /**
   * The order Auto-Assign deals participants into seats, two per team. The
   * default, newest first, puts bots and humans on each other's teams. The real
   * assign shuffles randomly (usecase/instructor.go, r.Shuffle), so two calls
   * rarely agree; tests that need that pass an order that changes per call.
   */
  assignOrder: (participants: FakeUser[], call: number) => FakeUser[] =
    ps => [...ps].sort((a, b) => b.id - a.id);
  private assignCalls = 0;
  private failures: Array<{ method: string; userName?: string; remaining: number; status: number }> = [];
  private nextUserId = 100;
  private nextBatchId = 1;
  private nextJokeId = 1000;

  addUser(name: string, role: Role | null = null, teamId: number | null = null): number {
    const id = this.nextUserId++;
    this.users.set(id, { id, name, role, teamId, status: teamId == null ? 'WAITING' : 'ASSIGNED' });
    return id;
  }

  userNamed(name: string): FakeUser | undefined {
    return [...this.users.values()].find(u => u.name === name);
  }

  /**
   * Make `method` fail `times` times, optionally only for one user. Defaults to
   * a 500 'INTERNAL'; pass another status (e.g. 403) to test that error path.
   */
  failNext(method: string, times: number, userName?: string, status = 500): void {
    this.failures.push({ method, userName, remaining: times, status });
  }

  /** Classify the given published jokes, or every published joke when none are named. */
  classify(jokeIds?: number[]): void {
    for (const id of jokeIds ?? this.publishOrder) this.classified.add(id);
  }

  api(): BotApi {
    return new FakeApi(this, null);
  }

  record(method: string, user: FakeUser | undefined): void {
    this.calls.push(method);
    const f = this.failures.find(
      x => x.method === method && x.remaining > 0 && (x.userName === undefined || x.userName === user?.name),
    );
    if (f) {
      f.remaining--;
      throw new FakeApiError(f.status, f.status === 500 ? 'INTERNAL' : 'INJECTED');
    }
  }

  participants(): FakeUser[] {
    return [...this.users.values()].filter(u => u.role !== 'INSTRUCTOR');
  }

  lobby(): LobbyResponse {
    const ps = this.participants();
    const unassigned = ps.filter(u => u.teamId == null);
    return {
      RoundID: this.round.id,
      Summary: { Waiting: unassigned.length, Assigned: ps.length - unassigned.length, Dropped: 0, TeamCount: this.teamIds.length },
      // real: stats_repo.go:42 — a team with no members is not listed.
      Teams: this.teamIds
        .map(id => ({
          Team: { id, name: `Team ${id}`, created_at: STAMP },
          Members: ps.filter(u => u.teamId === id).map(u => ({ UserID: u.id, DisplayName: u.name, Role: (u.role ?? 'JM') as Role })),
        }))
        .filter(t => t.Members.length > 0),
      Unassigned: unassigned.map(u => ({ UserID: u.id, DisplayName: u.name, Status: 'WAITING' as const })),
    };
  }

  newBatchId(): number { return this.nextBatchId++; }
  nextAssignCall(): number { return ++this.assignCalls; }
  newJokeId(): number { return this.nextJokeId++; }

  /**
   * real: usecase/marketing.go:143-160, repo/marketing_repo.go:228-238 — a batch
   * of another team or held by another marketer is 403, not 409; 409 is only
   * for a batch that is already processed.
   */
  claimedBy(batchId: number, user: FakeUser): FakeBatch {
    const b = this.batches.find(x => x.id === batchId);
    if (!b) throw new FakeApiError(404, 'NOT_FOUND');
    if (b.teamId !== user.teamId) throw new FakeApiError(403, 'FORBIDDEN');
    if (b.state === 'DONE') throw new FakeApiError(409, 'CONFLICT');
    if (b.state !== 'CLAIMED' || b.lockedBy !== user.id) throw new FakeApiError(403, 'FORBIDDEN');
    return b;
  }

  envelope(b: FakeBatch): MarketingQueueEnvelope {
    return {
      batch: {
        batch_id: b.id, round_id: b.roundId, team_id: b.teamId, status: 'SUBMITTED',
        submitted_at: STAMP, locked_at: STAMP, locked_by: b.lockedBy, raw_text: b.rawText,
      },
      jokes: b.jokes.map(j => ({ joke_id: j.joke_id, joke_text: j.joke_text })),
      queue_size: this.batches.filter(x => x.roundId === b.roundId && x.teamId === b.teamId && x.state === 'QUEUED').length,
    };
  }
}

class FakeApi implements BotApi {
  constructor(private readonly w: FakeWorld, private readonly userId: number | null) {}

  as(userId: number): BotApi {
    return new FakeApi(this.w, userId);
  }

  private enter(method: string): FakeUser | undefined {
    const user = this.userId == null ? undefined : this.w.users.get(this.userId);
    this.w.record(method, user);
    return user;
  }

  private requireUser(method: string): FakeUser {
    const user = this.enter(method);
    if (!user) throw new FakeApiError(404, 'NOT_FOUND');
    return user;
  }

  private requireInstructor(method: string): void {
    if (this.requireUser(method).role !== 'INSTRUCTOR') throw new FakeApiError(403, 'FORBIDDEN');
  }

  private requireMarketing(method: string): FakeUser {
    const u = this.requireUser(method);
    if (u.role !== 'MARKETING') throw new FakeApiError(403, 'FORBIDDEN');
    return u;
  }

  private requireActive(): void {
    if (this.w.round.status !== 'ACTIVE') throw new FakeApiError(409, 'ROUND_NOT_ACTIVE');
  }

  async sessionJoin(body: { display_name: string }) {
    this.enter('sessionJoin');
    const id = this.w.userNamed(body.display_name)?.id ?? this.w.addUser(body.display_name);
    const u = this.w.users.get(id) as FakeUser;
    return { user: { user_id: id, display_name: u.name }, participant: { status: u.status, joined_at: STAMP, assigned_at: null } };
  }

  async sessionMe(): Promise<SessionMeResponse> {
    const u = this.requireUser('sessionMe');
    return {
      user: { user_id: u.id, display_name: u.name },
      participant: { status: u.status, joined_at: STAMP, assigned_at: null },
      assignment: { role: u.role, team_id: u.teamId },
      teammates: [],
    };
  }

  async roundsActive() {
    this.enter('roundsActive');
    return { rounds: [{ ...this.w.round }] };
  }

  async submitBatch(_roundId: number, body: BatchSubmitRequest) {
    // real: usecase/batch.go:41-71 — validate the body, then role/team, then
    // round status, in that order.
    const u = this.requireUser('submitBatch');
    const raw = 'raw_text' in body && body.raw_text ? body.raw_text : null;
    if (!raw || raw.trim().length < 20) throw new FakeApiError(400, 'VALIDATION_ERROR');
    if (u.role !== 'JM' || u.teamId !== body.team_id) throw new FakeApiError(403, 'FORBIDDEN');
    this.requireActive();
    this.w.batches.push({
      id: this.w.newBatchId(), roundId: this.w.round.id, teamId: u.teamId, rawText: raw, jokes: [], state: 'QUEUED', lockedBy: null,
    });
    return {};
  }

  async teamFeedback(roundId: number, teamId: number) {
    this.requireUser('teamFeedback');
    // real: usecase/feedback.go:38-76 — nothing before the round has started.
    if (this.w.round.status === 'CONFIGURED') throw new FakeApiError(409, 'ROUND_NOT_ACTIVE');
    // real: repo/stats_repo.go:134-157 — only the latest feedback_joke_count
    // published jokes of the team in this round (WHERE b.round_id = $1), newest
    // first; dimensions land once classified.
    const mine = new Set(
      this.w.batches
        .filter(b => b.roundId === roundId && b.teamId === teamId && b.state === 'DONE')
        .flatMap(b => b.jokes.map(j => j.joke_id)),
    );
    const jokes: FeedbackJoke[] = [...this.w.publishOrder]
      .reverse()
      .filter(id => mine.has(id))
      .slice(0, this.w.round.feedback_joke_count)
      .map(id => {
        const done = this.w.classified.has(id);
        return {
          joke_id: id, joke_title: 't', was_bought: false,
          good_dimensions: (done ? ['LENGTH'] : []) as FeedbackJoke['good_dimensions'],
          improve_dimensions: [],
        };
      });
    return { jokes };
  }

  async marketingQueueNext(roundId: number): Promise<MarketingQueueEnvelope> {
    // real: usecase/marketing.go:33-43 — role is checked before round status.
    const u = this.requireMarketing('marketingQueueNext');
    this.requireActive();
    // real: repo/marketing_repo.go:38,52 — the queue is scoped to the round.
    const b = this.w.batches.find(
      x => x.roundId === roundId && x.teamId === u.teamId
        && (x.state === 'QUEUED' || (x.state === 'CLAIMED' && x.lockedBy === u.id)),
    );
    if (!b) return { batch: null, jokes: [], queue_size: 0 };
    b.state = 'CLAIMED';
    b.lockedBy = u.id;
    return this.w.envelope(b);
  }

  async marketingSplit(batchId: number, body: { jokes: string[] }) {
    // real: usecase/marketing.go:236-241 — role, then round status, then the claim.
    const u = this.requireMarketing('marketingSplit');
    this.requireActive();
    const b = this.w.claimedBy(batchId, u);
    // real: usecase/marketing.go:85-102 — blanks are dropped first; round 1
    // must split into exactly batch_size, later rounds into 1..batch_size.
    const jokes = body.jokes.map(t => t.trim()).filter(t => t !== '');
    const size = this.w.round.batch_size;
    const ok = this.w.round.round_number === 1 ? jokes.length === size : jokes.length >= 1 && jokes.length <= size;
    if (!ok) throw new FakeApiError(400, 'VALIDATION_ERROR');
    b.jokes = jokes.map(joke_text => ({ joke_id: this.w.newJokeId(), joke_text, published: false }));
    b.rawText = null;
    return this.w.envelope(b);
  }

  async marketingPublish(batchId: number, body: PublishRequest) {
    // real: usecase/marketing.go:236-241 — role, round status, then the claim.
    const u = this.requireMarketing('marketingPublish');
    this.requireActive();
    const b = this.w.claimedBy(batchId, u);
    // real: handler/marketing.go:189, usecase/marketing.go:209,
    // repo/marketing_repo.go:254-273 — exactly one decision per joke in the
    // batch, a title on every published one, and round 1 needs a publish.
    const ids = body.jokes.map(d => d.joke_id);
    const batchIds = new Set(b.jokes.map(j => j.joke_id));
    if (
      body.jokes.length === 0 ||
      new Set(ids).size !== ids.length ||
      ids.length !== batchIds.size ||
      !ids.every(id => batchIds.has(id)) ||
      body.jokes.some(d => d.is_published && !(d.joke_title ?? '').trim())
    ) {
      throw new FakeApiError(400, 'VALIDATION_ERROR');
    }
    const published = body.jokes.filter(j => j.is_published).length;
    if (this.w.round.round_number === 1 && published === 0) throw new FakeApiError(400, 'VALIDATION_ERROR');
    for (const d of body.jokes) {
      const joke = b.jokes.find(j => j.joke_id === d.joke_id) as FakeJoke;
      joke.published = d.is_published;
      if (d.is_published) {
        this.w.publishOrder.push(d.joke_id);
        if (this.w.autoClassify) this.w.classified.add(d.joke_id);
      }
    }
    b.state = 'DONE';
    this.w.decisions.push({ teamId: b.teamId, batchId, published, total: body.jokes.length });
    return {};
  }

  async instructorLobby() {
    this.requireInstructor('instructorLobby');
    return this.w.lobby();
  }

  async instructorAssign(_roundId: number, body: { team_count: number }) {
    this.requireInstructor('instructorAssign');
    // real: repo/team_repo.go:20, usecase/instructor.go:114-124 — Assign only
    // ever adds teams; existing ones (and their ids) are kept and reused.
    while (this.w.teamIds.length < body.team_count) {
      this.w.teamIds.push(Math.max(0, ...this.w.teamIds) + 1);
    }
    // Deliberately scrambled, like the real shuffle: newest users first, so
    // bots and humans land on each other's teams and must be re-pinned.
    const ps = this.w.assignOrder(this.w.participants(), this.w.nextAssignCall());
    ps.forEach((u, i) => {
      const t = Math.floor(i / 2);
      if (t < this.w.teamIds.length) {
        u.teamId = this.w.teamIds[t];
        u.role = i % 2 === 0 ? 'JM' : 'MARKETING';
        u.status = 'ASSIGNED';
      } else {
        u.teamId = null;
        u.role = null;
        u.status = 'WAITING';
      }
    });
    return this.w.lobby();
  }

  async instructorPatchUser(_roundId: number, userId: number, body: PatchUserRequest) {
    this.requireInstructor('instructorPatchUser');
    const u = this.w.users.get(userId);
    if (!u) throw new FakeApiError(404, 'NOT_FOUND');
    u.status = body.status;
    if (body.role !== undefined) u.role = body.role;
    if (body.team_id !== undefined) u.teamId = body.team_id;
    return this.w.lobby();
  }

  async instructorDeleteUser(_roundId: number, userId: number) {
    this.requireInstructor('instructorDeleteUser');
    if (!this.w.users.delete(userId)) throw new FakeApiError(404, 'NOT_FOUND');
    return { deleted_user_id: userId };
  }

  async instructorStart(_roundId: number, body?: ConfigRequest) {
    this.requireInstructor('instructorStart');
    // real: usecase/instructor.go:232-245 — status checks precede the profile check.
    if (this.w.round.status === 'ACTIVE') throw new FakeApiError(409, 'CONFLICT');
    if (this.w.round.status === 'ENDED') throw new FakeApiError(409, 'CONFLICT');
    const sent = body?.ideal_profile && Object.keys(body.ideal_profile).length > 0;
    if (!this.w.profileConfigured && !sent) throw new FakeApiError(409, 'IDEAL_PROFILE_REQUIRED');
    this.w.profileConfigured = true;
    this.w.round.status = 'ACTIVE';
    return {};
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK`
Expected: `TYPECHECK_OK`.

- [ ] **Step 5: Commit**

```bash
git add services/bots/api.ts services/bots/protocol.ts services/bots/testing/fakeApi.ts
git commit -m "feat(bots): define engine contracts and an in-memory test backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: The engine

**Files:**
- Create: `services/bots/engine.ts`
- Test: `services/bots/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/bots/engine.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { seededRng, variedCorpus } from '../shared/jokes';
import { BotEngine, SEAT_CHECK_MS, fitPieces, splitBlob, titleOf, wallClockSteps } from './engine';
import { botName, isBotName } from './naming';
import { BATCH_CAP_PER_ROUND } from './personas';
import type { BotApi } from './api';
import type { FromWorker, StartOptions } from './protocol';
import { FakeWorld, type FakeUser } from './testing/fakeApi';

const nextTick = () => new Promise<void>(resolve => setImmediate(resolve));

interface Hooks {
  /** Called after each message is recorded; lets a test act mid-operation. */
  onEmit?: (message: FromWorker) => void;
  /** Wraps the fake client, e.g. to hold a request in flight. */
  wrapApi?: (api: BotApi) => BotApi;
}

function setup(humans: string[] = [], hooks: Hooks = {}) {
  const world = new FakeWorld();
  const instructorId = world.addUser('Instructor', 'INSTRUCTOR');
  for (const name of humans) world.addUser(name);
  let clock = 0;
  const emitted: FromWorker[] = [];
  const api = world.api();
  const engine = new BotEngine({
    api: hooks.wrapApi ? hooks.wrapApi(api) : api,
    instructorUserId: instructorId,
    // Advances fake time and yields a macrotask, so waiting tests get a turn.
    delay: ms => { clock += ms; return nextTick(); },
    now: () => clock,
    emit: m => { emitted.push(m); hooks.onEmit?.(m); },
    seed: 'engine-test',
  });
  return { world, engine, emitted, clock: () => clock };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 50_000; i++) {
    if (condition()) return;
    await nextTick();
  }
  throw new Error(`timed out waiting for: ${what}`);
}

async function settle(ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i++) await nextTick();
}

function options(overrides: Partial<StartOptions> = {}): StartOptions {
  return {
    roundId: 1,
    teams: [{ index: 1, persona: 'SPRAY' }],
    speed: 10,
    startRound: true,
    idealProfile: { ...DEFAULT_IDEAL_PROFILE },
    ...overrides,
  };
}

/**
 * Holds chosen calls in flight until release(), to model a slow network. In
 * 'request' mode the call reaches the backend only on release; in 'response'
 * mode it lands at once and only the reply is late.
 */
class Gate {
  private held: Array<{ method: string; client: string | null; go: () => void }> = [];
  /** Each held method keeps its own mode, so one hold() never changes another's. */
  private modes = new Map<string, 'request' | 'response'>();

  /** How many calls are held, optionally of one method and one client (the label given to `as`). */
  count(method?: string, client?: string): number {
    return this.held.filter(
      h => (method === undefined || h.method === method) && (client === undefined || h.client === client),
    ).length;
  }

  hold(method: string, mode: 'request' | 'response'): void {
    this.modes.set(method, mode);
  }

  stopHolding(method?: string): void {
    if (method === undefined) this.modes.clear();
    else this.modes.delete(method);
  }

  /** Let held calls go, optionally only those of one method. */
  release(method?: string): void {
    const go = this.held.filter(h => method === undefined || h.method === method);
    this.held = this.held.filter(h => !go.includes(h));
    for (const h of go) h.go();
  }

  wrap(api: BotApi, client: string | null = null): BotApi {
    return new Proxy(api, {
      get: (target, prop, receiver) => {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (prop === 'as') return (id: number, label: string) => this.wrap(target.as(id, label), label);
        if (typeof value !== 'function') return value;
        const method = String(prop);
        return (...args: unknown[]) => {
          const call = () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          const mode = this.modes.get(method);
          if (mode === undefined) return call();
          const released = new Promise<void>(go => this.held.push({ method, client, go }));
          if (mode === 'request') return released.then(call);
          const result = call();
          result.catch(() => undefined); // observed later, after release
          return released.then(() => result);
        };
      },
    });
  }
}

const teamOf = (world: FakeWorld, name: string) => world.userNamed(name)?.teamId ?? null;

/** Every human team holds exactly one JM and one Marketing, and no bot. */
function expectCleanHumanTeams(world: FakeWorld): void {
  const byTeam = new Map<number, FakeUser[]>();
  for (const u of world.participants()) {
    if (u.teamId == null) continue;
    byTeam.set(u.teamId, [...(byTeam.get(u.teamId) ?? []), u]);
  }
  for (const [teamId, members] of byTeam) {
    if (!members.some(m => !isBotName(m.name))) continue;
    const layout = members.map(m => `${m.name}:${m.role}`).sort();
    expect({ teamId, layout }).toEqual({
      teamId,
      layout: expect.arrayContaining([expect.stringMatching(/:JM$/), expect.stringMatching(/:MARKETING$/)]),
    });
    expect({ teamId, size: members.length, bots: members.filter(m => isBotName(m.name)).length })
      .toEqual({ teamId, size: 2, bots: 0 });
  }
}

describe('BotEngine', () => {
  it('puts humans on the lowest team and each bot team on its own team', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'CAREFUL' }], startRound: false }));
    engine.stop();

    const alice = world.userNamed('alice');
    const bob = world.userNamed('bob');
    expect(alice?.teamId).toBe(1);
    expect(bob?.teamId).toBe(1);
    expect(new Set([alice?.role, bob?.role])).toEqual(new Set(['JM', 'MARKETING']));
    for (const [index, team] of [[1, 2], [2, 3]] as const) {
      expect(world.userNamed(botName(index, 'A'))).toMatchObject({ teamId: team, role: 'JM' });
      expect(world.userNamed(botName(index, 'B'))).toMatchObject({ teamId: team, role: 'MARKETING' });
    }
  });

  it('surfaces the backend refusal when the round has no ideal profile', async () => {
    const { engine } = setup();
    await expect(engine.start(options({ idealProfile: undefined }))).rejects.toMatchObject({ status: 409 });
    expect(engine.status().running).toBe(false);
  });

  it('plays: Spray publishes every joke, Careful publishes two', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'CAREFUL' }] }));
    const spray = teamOf(world, botName(1, 'A'));
    const careful = teamOf(world, botName(2, 'A'));
    await until(
      () => world.decisions.filter(d => d.teamId === spray).length >= 2
        && world.decisions.filter(d => d.teamId === careful).length >= 2,
      'two publishes from each team',
    );
    engine.stop();

    for (const d of world.decisions.filter(x => x.teamId === spray)) expect(d).toMatchObject({ published: 5, total: 5 });
    for (const d of world.decisions.filter(x => x.teamId === careful)) expect(d).toMatchObject({ published: 2, total: 5 });
  });

  it('stops every actor', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'BALANCED' }] }));
    await until(() => world.decisions.length >= 1, 'a first publish');
    engine.stop();
    await settle(200);
    const callsAfterStop = world.calls.length;
    await settle(2_000);
    expect(world.calls.length).toBe(callsAfterStop);
    expect(engine.status().running).toBe(false);
  });

  it('keeps playing when one bot keeps failing', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'));
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'SPRAY' }] }));
    const healthy = teamOf(world, botName(2, 'A'));
    await until(
      () => world.decisions.some(d => d.teamId === healthy) && engine.status().teams[0].jm.error !== null,
      'team 2 publishing while team 1 errors',
    );
    engine.stop();

    const broken = teamOf(world, botName(1, 'A'));
    expect(world.decisions.filter(d => d.teamId === broken)).toHaveLength(0);
    expect(engine.status().teams[0].jm.error).toContain('INTERNAL');
  });

  it('stops submitting at the per-round batch cap', async () => {
    const { world, engine } = setup();
    await engine.start(options());
    await until(() => engine.status().teams[0].jm.activity.includes('cap'), 'the batch cap');
    engine.stop();
    const team = teamOf(world, botName(1, 'A'));
    expect(world.batches.filter(b => b.teamId === team)).toHaveLength(BATCH_CAP_PER_ROUND);
  });

  it('pauses every bot when seats are re-shuffled, and resumes after re-forming', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const bot = world.userNamed(botName(1, 'A'));
    if (!bot) throw new Error('bot 01A missing');
    bot.teamId = 999;
    await until(() => engine.status().scrambled, 'scramble detection');

    await engine.reform();
    expect(engine.status().scrambled).toBe(false);
    expect(world.userNamed(botName(1, 'A'))).toMatchObject({ teamId: 1, role: 'JM' });
    engine.stop();
  });

  it('removes bots and only bots', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    await engine.start(options({ startRound: false }));
    const removed = await engine.remove(1);
    expect(removed).toBe(2);
    expect([...world.users.values()].map(u => u.name).sort()).toEqual(['Instructor', 'alice', 'bob']);
    expect(engine.status()).toMatchObject({ running: false, teams: [] });
  });

  it('narrates each decision for watchers', async () => {
    const { world, engine, emitted } = setup();
    await engine.start(options());
    await until(() => world.decisions.length >= 1, 'a publish');
    engine.stop();

    const marketer = world.userNamed(botName(1, 'B'));
    if (!marketer) throw new Error('bot 01B missing');
    expect(engine.historyFor(marketer.id).map(e => e.text).join('\n')).toMatch(/Spray: keeping 5 of 5/);
    expect(engine.metaFor(marketer.id)).toMatchObject({ teamIndex: 1, seat: 'B', persona: 'SPRAY' });
    expect(emitted.some(m => m.type === 'log' && m.entry.botUserId === marketer.id)).toBe(true);
  });

  it('probes the lobby and round', async () => {
    const { engine, emitted } = setup(['alice']);
    await engine.start(options({ startRound: false }));
    engine.stop();
    expect(await engine.probe(1)).toEqual({ humans: 1, bots: 2, roundStatus: 'CONFIGURED' });
    expect(emitted[emitted.length - 1]).toMatchObject({ type: 'probe' });
    expect(engine.status().warnings.join(' ')).toMatch(/alice has no human partner/);
  });

  it('refuses a round that has already ended, before seating anyone', async () => {
    const { world, engine } = setup();
    world.round.status = 'ENDED';
    await expect(engine.start(options())).rejects.toThrow(/ENDED/);
    expect([...world.users.values()].some(u => isBotName(u.name))).toBe(false);
  });

  it('Careful gives up when feedback never arrives, then keeps playing', async () => {
    const { world, engine } = setup();
    world.autoClassify = false;
    await engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }] }));
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => engine.historyFor(jm.id).some(e => /gave up waiting/.test(e.text)), 'the feedback timeout');
    await until(() => world.decisions.length >= 2, 'a second batch after giving up');
    engine.stop();
  });

  it('Careful starts round 2 without waiting on a batch round 1 never published', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], speed: 1 }));
    const team = teamOf(world, botName(1, 'A'));
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => world.batches.some(b => b.teamId === team && b.roundId === 1), 'a round-1 batch');
    world.round.status = 'ENDED';
    // Marketing's dwell runs out, its split or publish meets a 409, and the
    // round-1 batch is never published.
    await settle(300);
    expect(world.decisions).toHaveLength(0);

    world.round = { ...world.round, id: 2, round_number: 2, status: 'ACTIVE' };
    await until(() => world.batches.some(b => b.teamId === team && b.roundId === 2), 'a round-2 batch');
    engine.stop();
    expect(engine.historyFor(jm.id).map(e => e.text).join('\n')).not.toMatch(/gave up waiting/);
  });

  it('never lets a bot moved into a human team publish that team\'s batch', async () => {
    const { world, engine } = setup(['alice', 'bob']);
    await engine.start(options({ speed: 10 }));
    const humanTeam = teamOf(world, 'alice');
    if (humanTeam == null) throw new Error('human team missing');
    const batchId = world.newBatchId();
    world.batches.push({
      id: batchId, roundId: world.round.id, teamId: humanTeam, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: variedCorpus.slice(0, 5).map(j => j.text).join('\n\n'),
    });
    // A mid-round Auto-Assign swaps the bot marketer with the human marketer.
    const botMarketer = world.userNamed(botName(1, 'B'));
    const humanMarketer = [...world.users.values()].find(u => !isBotName(u.name) && u.role === 'MARKETING');
    if (!botMarketer || !humanMarketer) throw new Error('marketers missing');
    [botMarketer.teamId, humanMarketer.teamId] = [humanMarketer.teamId, botMarketer.teamId];

    await until(() => engine.status().scrambled, 'scramble detection');
    await settle(500);
    engine.stop();
    expect(world.decisions.filter(d => d.teamId === humanTeam)).toEqual([]);
    // The claim that revealed the move still holds the batch; the instructor is told.
    expect(engine.status().warnings).toContain(
      `${botName(1, 'B')} picked up team ${humanTeam}'s batch #${batchId} before noticing it was moved. `
        + `That batch stays hidden from team ${humanTeam} for up to 15 minutes; Remove bots releases it at once.`,
    );
  });

  it('reports a batch held for a human team once, and keeps reporting it after re-forming', async () => {
    const gate = new Gate();
    const { world, engine } = setup(['alice', 'bob'], { wrapApi: api => gate.wrap(api) });
    await engine.start(options({ speed: 10 }));
    const humanTeam = teamOf(world, 'alice');
    if (humanTeam == null) throw new Error('human team missing');
    const batchId = world.newBatchId();
    world.batches.push({
      id: batchId, roundId: world.round.id, teamId: humanTeam, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: variedCorpus.slice(0, 5).map(j => j.text).join('\n\n'),
    });
    const botMarketer = world.userNamed(botName(1, 'B'));
    const humanMarketer = [...world.users.values()].find(u => !isBotName(u.name) && u.role === 'MARKETING');
    if (!botMarketer || !humanMarketer) throw new Error('marketers missing');
    const swap = () => { [botMarketer.teamId, humanMarketer.teamId] = [humanMarketer.teamId, botMarketer.teamId]; };
    const reports = () => engine.historyFor(botMarketer.id).filter(e => e.text.startsWith('the queue handed me')).length;
    swap();
    await until(() => reports() === 1, 'the first report');

    // Re-forming puts the bot back but does not release the batch it holds.
    await engine.reform();
    const held = () => engine.status().warnings.filter(w => w.includes(`batch #${batchId}`));
    expect(held()).toHaveLength(1);
    // The bot reads its seat just before a second swap and trusts that answer,
    // so its queue hands it the same held batch again.
    gate.hold('sessionMe', 'response');
    await until(() => gate.count('sessionMe', 'bot 1B') >= 1, 'the bot marketer checking its seat');
    swap();
    gate.stopHolding();
    gate.release();
    await until(() => reports() === 2, 'the second report');
    engine.stop();
    expect(held()).toHaveLength(1);
  });

  it('stops a Marketing bot mid-dwell once any seat sees a re-shuffle', async () => {
    // The Joke Maker is moved the moment Marketing starts reading a batch. A
    // Joke Maker that had just submitted would rest ~45 s without checking its
    // seat, far past the dwell, so this one never lands a batch: each refused
    // submit brings it back to its seat check within a few seconds, while
    // Marketing is still reading.
    let moved = false;
    let marketingWhenScrambled: string | null = null;
    const { world, engine } = setup([], {
      onEmit: m => {
        if (m.type !== 'status' || m.status.teams.length === 0) return;
        const marketing = m.status.teams[0].marketing.activity;
        if (!moved && marketing.startsWith('reading batch')) {
          moved = true;
          const jm = world.userNamed(botName(1, 'A'));
          if (jm) jm.teamId = 999;
        }
        if (m.status.scrambled && marketingWhenScrambled === null) marketingWhenScrambled = marketing;
      },
    });
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'), 403);
    await engine.start(options({ speed: 1, startRound: false }));
    const team = teamOf(world, botName(1, 'A'));
    if (team == null) throw new Error('bot team missing');
    world.batches.push({
      id: world.newBatchId(), roundId: world.round.id, teamId: team, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: variedCorpus.slice(0, 5).map(j => j.text).join('\n\n'),
    });
    world.round.status = 'ACTIVE';

    await until(() => engine.status().scrambled, 'scramble detection');
    await settle(300);
    engine.stop();
    // The re-shuffle landed while Marketing was still reading, so the dwell
    // guard is what held the split back.
    expect(marketingWhenScrambled).toMatch(/^reading batch/);
    expect(world.calls).not.toContain('marketingSplit');
    expect(world.decisions).toEqual([]);
  });

  it('shows only the new run\'s seats once a restart is under way', async () => {
    const { engine } = setup();
    await engine.start(options({ startRound: false }));
    engine.stop();
    const restart = engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], startRound: false }));
    const status = engine.status();
    expect(status.running).toBe(true);
    expect(status.teams.map(t => [t.persona, t.jm.activity, t.marketing.activity]))
      .toEqual([['CAREFUL', 'not started', 'not started']]);
    await restart;
    engine.stop();
  });

  it('keeps the new run\'s seats when a start queues behind a remove', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const removing = engine.remove(1);
    const restart = engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], startRound: false }));
    await removing;
    await restart;
    engine.stop();
    expect(engine.status().teams.map(t => t.persona)).toEqual(['CAREFUL']);
    expect(world.userNamed(botName(1, 'B'))).toMatchObject({ role: 'MARKETING' });
  });

  it('Careful starts round 2 without waiting on round-1 jokes still being classified', async () => {
    const { world, engine } = setup();
    world.autoClassify = false;
    await engine.start(options({ teams: [{ index: 1, persona: 'CAREFUL' }], speed: 1 }));
    const team = teamOf(world, botName(1, 'A'));
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => world.decisions.some(d => d.teamId === team), 'a round-1 publish');
    expect(world.classified.size).toBe(0);

    world.round = { ...world.round, id: 2, round_number: 2, status: 'ACTIVE' };
    await until(() => world.batches.some(b => b.teamId === team && b.roundId === 2), 'a round-2 batch');
    engine.stop();
    expect(engine.historyFor(jm.id).map(e => e.text).join('\n')).not.toMatch(/gave up waiting/);
  });

  it('publishes an inherited batch that does not split cleanly into the round-1 count', async () => {
    const { world, engine } = setup();
    await engine.start(options({ startRound: false }));
    const team = teamOf(world, botName(1, 'A'));
    if (team == null) throw new Error('bot team missing');
    // Adjust this literal to FakeBatch's required fields if the fake has grown more.
    world.batches.push({
      id: world.newBatchId(), roundId: world.round.id, teamId: team, state: 'QUEUED', lockedBy: null, jokes: [],
      rawText: 'A joke nobody on this team wrote, told as one long rambling story\n\n!!! and a tail',
    });
    world.round.status = 'ACTIVE';
    world.profileConfigured = true;
    await until(() => world.decisions.some(d => d.teamId === team), 'the inherited batch to publish');
    engine.stop();
    expect(world.decisions[0]).toMatchObject({ teamId: team, total: 5 });
  });

  it('refuses a second start while the first is still starting, and stop() halts the one that ran', async () => {
    const { world, engine } = setup();
    const first = engine.start(options({ startRound: false }));
    const second = engine.start(options({ startRound: false }));
    await first;
    await expect(second).rejects.toThrow(/already running/);
    engine.stop();
    await settle(200);
    const callsAfterStop = world.calls.length;
    await settle(2_000);
    expect(world.calls.length).toBe(callsAfterStop);
  });

  it('stop() cancels a start that is still seating bots', async () => {
    let stopped = false;
    const { world, engine } = setup([], {
      onEmit: m => {
        if (stopped || m.type !== 'status') return;
        if (m.status.teams.length > 0 && m.status.teams.every(t => t.jm.activity === 'joined')) {
          stopped = true;
          engine.stop();
        }
      },
    });
    await engine.start(options());
    expect(stopped).toBe(true);
    await settle(200);
    expect(world.round.status).toBe('CONFIGURED');
    expect(world.calls).not.toContain('instructorAssign');
    expect(world.calls).not.toContain('sessionMe');
    expect(engine.status().running).toBe(false);
  });

  it('runs overlapping re-forms one at a time, so no human team is left stranded', async () => {
    const { world, engine } = setup(['alice', 'bob', 'carol', 'dave', 'erin', 'frank']);
    // Like the real shuffle (usecase/instructor.go, r.Shuffle), each Auto-Assign
    // deals seats in a different order. Seeded, so the interleaving is repeatable.
    world.assignOrder = (ps, call) => {
      const rand = seededRng(`assign:${call}`);
      const out = [...ps].sort((a, b) => a.id - b.id);
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'SPRAY' }], startRound: false }));
    expectCleanHumanTeams(world);
    await Promise.all([engine.reform(), engine.reform()]);
    engine.stop();
    expectCleanHumanTeams(world);
    for (const index of [1, 2]) {
      const team = teamOf(world, botName(index, 'A'));
      expect(world.userNamed(botName(index, 'B'))).toMatchObject({ teamId: team, role: 'MARKETING' });
      expect(world.userNamed(botName(index, 'A'))).toMatchObject({ role: 'JM' });
    }
  });

  it('leaves every seat exactly "stopped" after stop()', async () => {
    const { world, engine } = setup();
    await engine.start(options({ teams: [{ index: 1, persona: 'SPRAY' }, { index: 2, persona: 'CAREFUL' }] }));
    await until(() => world.decisions.length >= 1, 'a first publish');
    engine.stop();
    await settle(200);
    for (const team of engine.status().teams) {
      expect([team.jm.activity, team.marketing.activity]).toEqual(['stopped', 'stopped']);
    }
  });

  it("does not let a stopped run's in-flight seat check pause the next run", async () => {
    const gate = new Gate();
    const { world, engine } = setup([], { wrapApi: api => gate.wrap(api) });
    await engine.start(options({ startRound: false }));
    gate.hold('sessionMe', 'request');
    await until(() => gate.count('sessionMe') >= 2, 'both actors mid seat-check');
    engine.stop();
    gate.stopHolding();
    // Between runs the instructor pressed the ordinary Auto-Assign.
    const bot = world.userNamed(botName(1, 'A'));
    if (!bot) throw new Error('bot 01A missing');
    bot.teamId = 999;
    // The next run is still seating its bots when the old checks come back.
    gate.hold('sessionJoin', 'request');
    const restart = engine.start(options({ startRound: false }));
    await until(() => gate.count('sessionJoin') >= 1, 'the next run joining');
    gate.release('sessionMe');
    await settle(5);
    gate.stopHolding();
    gate.release();
    await restart;
    await settle(50);
    expect(engine.status().scrambled).toBe(false);
    engine.stop();
  });

  it('does not count a publish from a stopped run in the next run', async () => {
    const gate = new Gate();
    const { world, engine } = setup([], { wrapApi: api => gate.wrap(api) });
    gate.hold('marketingPublish', 'response');
    await engine.start(options());
    await until(() => gate.count() >= 1, 'a publish in flight');
    expect(world.decisions).toHaveLength(1);
    engine.stop();
    gate.stopHolding();
    const restart = engine.start(options({ startRound: false }));
    gate.release();
    await restart;
    expect(engine.status().classificationCalls).toBe(0);
    engine.stop();
  });

  it("does not re-add a removed bot's history from a late response", async () => {
    const gate = new Gate();
    const { world, engine } = setup([], { wrapApi: api => gate.wrap(api) });
    gate.hold('marketingPublish', 'response');
    await engine.start(options());
    const marketer = world.userNamed(botName(1, 'B'));
    if (!marketer) throw new Error('bot 01B missing');
    await until(() => gate.count() >= 1, 'a publish in flight');
    gate.stopHolding();
    await engine.remove(1);
    gate.release();
    await settle(50);
    expect(engine.historyFor(marketer.id)).toEqual([]);
  });

  it('backs off from scratch on a real error after a run of 409s', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 5, botName(1, 'A'), 409);
    world.failNext('submitBatch', 1, botName(1, 'A'), 500);
    await engine.start(options());
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    await until(() => engine.historyFor(jm.id).some(e => e.text.startsWith('error:')), 'the 500');
    engine.stop();
    expect(engine.historyFor(jm.id).find(e => e.text.startsWith('error:'))?.text).toMatch(/retrying in 2s/);
  });

  it('keeps backing off while the same call keeps failing', async () => {
    const { world, engine } = setup();
    world.failNext('submitBatch', 1_000_000, botName(1, 'A'));
    await engine.start(options());
    const jm = world.userNamed(botName(1, 'A'));
    if (!jm) throw new Error('bot 01A missing');
    const errors = () => engine.historyFor(jm.id).filter(e => e.text.startsWith('error:'));
    await until(() => errors().length >= 6, 'six failed submits');
    engine.stop();
    expect(errors().map(e => e.text.match(/retrying in (\d+)s/)?.[1])).toEqual(['2', '4', '8', '16', '30', '30']);
  });

  it('asks the backend where each seat is at most once per SEAT_CHECK_MS', async () => {
    const { world, engine, clock } = setup();
    await engine.start(options({ startRound: false }));
    const seatChecks = () => world.calls.filter(c => c === 'sessionMe').length;
    const t0 = clock();
    const c0 = seatChecks();
    await settle(400);
    engine.stop();
    const elapsed = clock() - t0;
    expect(elapsed).toBeGreaterThan(20 * SEAT_CHECK_MS);
    expect(seatChecks() - c0).toBeLessThanOrEqual(2 * (Math.floor(elapsed / SEAT_CHECK_MS) + 1));
  });

  it('treats a lost batch (403) as a re-poll, not an error', async () => {
    const { world, engine } = setup();
    world.failNext('marketingPublish', 1, botName(1, 'B'), 403);
    await engine.start(options());
    const team = teamOf(world, botName(1, 'A'));
    await until(() => world.decisions.some(d => d.teamId === team), 'a publish after the lost batch');
    engine.stop();
    expect(engine.status().teams[0].marketing.error).toBeNull();
    const marketer = world.userNamed(botName(1, 'B'));
    if (!marketer) throw new Error('bot 01B missing');
    const texts = engine.historyFor(marketer.id).map(e => e.text);
    expect(texts.some(t => /refused this \(403\)/.test(t))).toBe(true);
    expect(texts.filter(t => t.startsWith('error:'))).toEqual([]);
  });
});

describe('wallClockSteps', () => {
  const total = (steps: Iterable<number>) => [...steps].reduce((a, b) => a + b, 0);

  it('divides the 1× duration by the speed', () => {
    expect(total(wallClockSteps(150_000, () => 1))).toBeCloseTo(150_000);
    expect(total(wallClockSteps(150_000, () => 10))).toBeCloseTo(15_000);
  });

  it('never sleeps longer than one tick, so a speed change lands within a second', () => {
    expect(Math.max(...wallClockSteps(150_000, () => 1))).toBeLessThanOrEqual(1_000);
  });

  it('re-reads the speed on every tick', () => {
    let calls = 0;
    expect(total(wallClockSteps(150_000, () => (calls++ < 10 ? 1 : 10)))).toBeCloseTo(24_000);
  });
});

describe('splitBlob', () => {
  it('cuts on blank lines and trims', () => {
    expect(splitBlob('a\n\n  b \n \nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('titleOf', () => {
  it('uses the curated title for a corpus joke', () => {
    expect(titleOf(variedCorpus[0].text)).toBe(variedCorpus[0].title);
  });

  it('falls back instead of throwing on text it does not know', () => {
    expect(titleOf('A brand new joke about ducks')).toBe('A brand new joke');
  });

  it('never returns an empty title, which publish would reject', () => {
    expect(titleOf('!!! ???')).toBe('Untitled joke');
  });
});

describe('fitPieces', () => {
  it('merges extra pieces into the last one for round 1', () => {
    expect(fitPieces(['a b', 'c', 'd', 'e', 'f', 'g'], 5, 1)).toEqual(['a b', 'c', 'd', 'e', 'f g']);
  });

  it('halves the longest piece until round 1 has enough, keeping the text in order', () => {
    const out = fitPieces(['one two three four', 'five six'], 5, 1);
    expect(out).toHaveLength(5);
    expect(out.join(' ')).toBe('one two three four five six');
  });

  it('only caps later rounds, never pads them', () => {
    expect(fitPieces(['a', 'b'], 5, 2)).toEqual(['a', 'b']);
    expect(fitPieces(['a', 'b', 'c', 'd', 'e', 'f'], 5, 2)).toHaveLength(5);
  });

  it('drops blank pieces first', () => {
    expect(fitPieces(['a', '  ', 'b'], 2, 1)).toEqual(['a', 'b']);
  });

  it('halves by character when there are too few words, never cutting an emoji or CJK character', () => {
    const knock = fitPieces(['Knock-knock!'], 5, 1);
    expect(knock).toHaveLength(5);
    expect(knock.join('')).toBe('Knock-knock!');

    const cjk = fitPieces(['为什么程序员分不清万圣节和圣诞节'], 5, 1);
    expect(cjk).toHaveLength(5);
    expect(cjk.join('')).toBe('为什么程序员分不清万圣节和圣诞节');

    const emoji = fitPieces(['🤖🤖🤖🤖🤖🤖'], 5, 1);
    expect(emoji).toHaveLength(5);
    for (const piece of emoji) expect(Array.from(piece).every(ch => ch === '🤖')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run services/bots/engine.test.ts`
Expected: FAIL — cannot find module `./engine`.

- [ ] **Step 3: Implement the engine**

```ts
// services/bots/engine.ts
/**
 * The bot engine: one async actor per bot seat, driving the real HTTP API.
 *
 * Framework-free on purpose — no React, no DOM — so it runs inside a Web Worker
 * (worker.ts) and under vitest against an in-memory fake alike. Everything
 * time-related arrives through `deps`, which is what keeps the tests fast.
 *
 * Bots act through the API, never through the UI. A watcher sees the server-side
 * effect of each step on the next poll; the reasoning log explains the parts
 * that are not server state, such as why a bot kept two jokes and dropped three.
 */
import type { ConfigRequest, PublicRound, SessionMeResponse } from '../../types/api';
import { asRawBlob, seededRng, titleFor, variedCorpus } from '../shared/jokes';
import { statusOf, type BotApi } from './api';
import { Deck } from './deck';
import { botName, isBotName, parseBotName, SEAT_ROLE, type Seat } from './naming';
import {
  BATCH_CAP_PER_ROUND, DWELL_MS, FEEDBACK_WAIT_MS, IDLE_POLL_MS, MAX_BOT_TEAMS, PERSONAS,
  QUEUE_POLL_MS, choosePublished, jitter, publishCount, type PersonaId,
} from './personas';
import { participantsOf, planPlacement, teamsNeeded } from './placement';
import type {
  BotMeta, BotTeamSpec, EngineStatus, FromWorker, ProbeResult, ReasoningEntry, SeatStatus,
  Speed, StartOptions, TeamStatus,
} from './protocol';

export interface EngineDeps {
  /** Anonymous client; the engine derives per-bot and instructor clients with `.as()`. */
  api: BotApi;
  /** The logged-in instructor. Instructor authority is that user row, so no password is needed. */
  instructorUserId: number;
  delay: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  emit: (message: FromWorker) => void;
  seed: string;
}

export const TICK_MS = 1_000;
const HISTORY_PER_BOT = 50;
const ROUND_CACHE_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
/**
 * How often one seat asks the backend where it sits. Every loop pass used to
 * ask, which at 10× with 12 bot teams is about 100 requests a second against
 * production. A re-shuffle is still noticed within this window.
 */
export const SEAT_CHECK_MS = 2_000;

/** A real sleep that ends early on abort. */
export function realDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Break a 1×-speed duration into wall-clock sleeps of at most one tick,
 * re-reading the speed each time. A long rest at 1× therefore shortens within a
 * second of the instructor switching to 10×, instead of finishing at the old pace.
 */
export function* wallClockSteps(
  msAt1x: number, currentSpeed: () => Speed, tickMs = TICK_MS,
): Generator<number> {
  let remaining = msAt1x;
  while (remaining > 0) {
    const speed = currentSpeed();
    const wall = Math.min(tickMs, remaining / speed);
    yield wall;
    remaining -= wall * speed;
  }
}

/** A raw blob as the Joke Maker wrote it, cut at blank lines. */
export function splitBlob(raw: string): string[] {
  return raw.split(/\n[ \t]*\n/).map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * The corpus title for a joke, or a derived one. `titleFor` throws on text that
 * is not a corpus fixture, and a Marketing bot can inherit a leftover batch
 * written by someone else, so a fallback beats a crashed actor.
 */
export function titleOf(text: string): string {
  try {
    return titleFor(text);
  } catch {
    // Never empty: publish rejects a blank title with a 400
    // (usecase/marketing.go:209), and the backend hands a marketer its own held
    // batch first on every poll, so one bad title would stall the team all round.
    const derived = text.split(/\s+/).slice(0, 4).join(' ').replace(/[^\p{L}\p{N} ']/gu, '').trim();
    return derived || 'Untitled joke';
  }
}

/**
 * Coerce split pieces into a count the backend accepts: exactly `batchSize` in
 * round 1, 1..`batchSize` after (usecase/marketing.go:98-102).
 *
 * A bot's own blobs always split cleanly, but a Marketing bot can inherit a
 * batch someone else wrote. The backend hands a marketer its own held batch
 * first on every poll, so a split it rejects is rejected forever. Merging the
 * tail, or halving the longest piece, always lands on a legal count without
 * reordering the text.
 *
 * Halving prefers a word boundary, then falls back to the middle CHARACTER for
 * text with too few words — a two-word knock-knock, or Chinese, which has no
 * spaces at all. `Array.from` splits by code point, so an emoji or a CJK
 * character is never cut in half. The submit minimum of 20 characters
 * (usecase/batch.go:42-45) guarantees enough characters to reach any batch size.
 */
export function fitPieces(pieces: readonly string[], batchSize: number, roundNumber: number): string[] {
  const out = pieces.map(p => p.trim()).filter(p => p.length > 0);
  const target = roundNumber === 1 ? batchSize : Math.min(Math.max(out.length, 1), batchSize);
  while (out.length > target) {
    const last = out.pop() as string;
    out[out.length - 1] = `${out[out.length - 1]} ${last}`;
  }
  while (out.length < target) {
    const byWords = longestIndex(out, p => p.split(/\s+/).length >= 2);
    if (byWords !== -1) {
      const words = out[byWords].split(/\s+/);
      const mid = Math.ceil(words.length / 2);
      out.splice(byWords, 1, words.slice(0, mid).join(' '), words.slice(mid).join(' '));
      continue;
    }
    const byChars = longestIndex(out, p => Array.from(p).length >= 2);
    if (byChars === -1) break; // every piece is one character: impossible above the submit minimum
    const chars = Array.from(out[byChars]);
    const mid = Math.ceil(chars.length / 2);
    out.splice(byChars, 1, chars.slice(0, mid).join(''), chars.slice(mid).join(''));
  }
  return out;
}

function longestIndex(pieces: readonly string[], eligible: (p: string) => boolean): number {
  let best = -1;
  for (let i = 0; i < pieces.length; i++) {
    if (eligible(pieces[i]) && (best === -1 || pieces[i].length > pieces[best].length)) best = i;
  }
  return best;
}

/**
 * The backoff counter after `err`. A 403 or 409 is the backend answering
 * coherently — the game moved on — not the backend failing, so it resets the
 * count rather than growing it: a 500 after a run of 409s backs off from 2 s,
 * not 30 s. A call that keeps failing still backs off all the way.
 */
function nextAttempt(err: unknown, attempt: number): number {
  const status = statusOf(err);
  return status === 403 || status === 409 ? 0 : attempt + 1;
}

/** A bot's own user row is gone — it was removed — so its actor stops. */
class SeatGone extends Error {
  constructor() {
    super('this bot user no longer exists');
  }
}

interface SeatRuntime extends SeatStatus {
  seat: Seat;
  /** When this seat last asked the backend where it sits, and in which formation. */
  checkedAt: number | null;
  checkedEpoch: number;
}

interface TeamRuntime {
  index: number;
  persona: PersonaId;
  teamId: number | null;
  jm: SeatRuntime;
  marketing: SeatRuntime;
  /**
   * Counted per round because the backend scopes the marketing queue and team
   * feedback to a round (repo/marketing_repo.go:38,52; repo/stats_repo.go:138-150):
   * a batch left unpublished when a round ends is never seen again, so it must
   * not hold up the next round.
   */
  submittedByRound: Map<number, number>;
  publishedByRound: Map<number, number>;
  /** All rounds, for the panel. */
  published: number;
  /** The last publish's joke ids; Careful waits for their feedback. */
  awaitingFeedback: { roundId: number; jokeIds: number[] } | null;
}

function newSeat(index: number, seat: Seat): SeatRuntime {
  return { seat, userId: null, name: botName(index, seat), activity: 'not started', error: null, checkedAt: null, checkedEpoch: -1 };
}

function newTeam(spec: BotTeamSpec): TeamRuntime {
  return {
    index: spec.index, persona: spec.persona, teamId: null,
    jm: newSeat(spec.index, 'A'), marketing: newSeat(spec.index, 'B'),
    submittedByRound: new Map(), publishedByRound: new Map(), published: 0, awaitingFeedback: null,
  };
}

function seatStatus(s: SeatRuntime): SeatStatus {
  return { userId: s.userId, name: s.name, activity: s.activity, error: s.error };
}

function teamStatus(t: TeamRuntime): TeamStatus {
  return {
    index: t.index, persona: t.persona, teamId: t.teamId, batchesPublished: t.published,
    jm: seatStatus(t.jm), marketing: seatStatus(t.marketing),
  };
}

export class BotEngine {
  private speed: Speed = 1;
  private controller: AbortController | null = null;
  private teams: TeamRuntime[] = [];
  private classificationCalls = 0;
  private scrambled = false;
  private warnings: string[] = [];
  /**
   * Another team's batch a moved Marketing bot claimed before it noticed the
   * move, by batch id. Kept apart from `warnings` because re-forming rewrites
   * those but does not release the lock; start and remove clear it.
   */
  private heldBatches = new Map<number, string>();
  private roundId: number | null = null;
  private roundCache: { at: number; round: PublicRound | null } | null = null;
  /** Bumped at the end of every team formation; see checkSeat. */
  private formationEpoch = 0;
  private forming = false;
  /** start, reform and remove queue here; see serialize. */
  private opChain: Promise<unknown> = Promise.resolve();
  private readonly history = new Map<number, ReasoningEntry[]>();

  constructor(private readonly deps: EngineDeps) {}

  get running(): boolean {
    return this.controller !== null;
  }

  status(): EngineStatus {
    return {
      running: this.running,
      speed: this.speed,
      teams: this.teams.map(teamStatus),
      classificationCalls: this.classificationCalls,
      scrambled: this.scrambled,
      warnings: [...this.warnings, ...this.heldBatches.values()],
    };
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.emitStatus();
  }

  historyFor(botUserId: number): ReasoningEntry[] {
    return [...(this.history.get(botUserId) ?? [])];
  }

  metaFor(botUserId: number): BotMeta | null {
    for (const team of this.teams) {
      for (const seat of [team.jm, team.marketing]) {
        if (seat.userId === botUserId) {
          return { teamIndex: team.index, seat: seat.seat, persona: team.persona, teamId: team.teamId };
        }
      }
    }
    return null;
  }

  async probe(roundId: number): Promise<ProbeResult> {
    const everyone = participantsOf(await this.instructor().instructorLobby(roundId));
    const bots = everyone.filter(p => isBotName(p.name)).length;
    const round = (await this.deps.api.roundsActive()).rounds.find(r => r.id === roundId);
    const result: ProbeResult = { humans: everyone.length - bots, bots, roundStatus: round?.status ?? 'UNKNOWN' };
    this.deps.emit({ type: 'probe', result });
    return result;
  }

  /**
   * Seat the bots, form teams, optionally start the round, then launch the
   * actors.
   *
   * The controller is claimed synchronously, before any await, so a second
   * start() is refused at once and stop() can cancel a start still in progress.
   * The new run's seats are shown from that same moment, so status() never
   * pairs `running` with the previous run's stopped seats. The work itself runs
   * on the op chain, never overlapping a reform or remove.
   */
  async start(options: StartOptions): Promise<void> {
    if (this.running) throw new Error('Bots are already running — stop them first.');
    if (options.teams.length === 0) throw new Error('Choose at least one bot team.');
    if (options.teams.length > MAX_BOT_TEAMS) throw new Error(`At most ${MAX_BOT_TEAMS} bot teams.`);
    const controller = new AbortController();
    this.controller = controller;
    const teams = options.teams.map(newTeam);
    this.teams = teams;
    try {
      await this.serialize(() => this.startNow(options, teams, controller));
    } catch (err) {
      if (this.controller === controller) {
        this.controller = null;
        this.emitStatus();
      }
      throw err;
    }
  }

  private async startNow(options: StartOptions, teams: TeamRuntime[], controller: AbortController): Promise<void> {
    const { signal } = controller;
    if (signal.aborted) return;
    if (options.startRound) {
      // Check BEFORE seating anyone. The backend refuses to start a round that
      // is ACTIVE or ENDED (usecase/instructor.go:232-237); bots seated for a
      // round that can never start would just sit there.
      const rounds = (await this.deps.api.roundsActive()).rounds;
      if (signal.aborted) return;
      const round = rounds.find(r => r.id === options.roundId);
      if (!round || round.status !== 'CONFIGURED') {
        throw new Error(
          `Round ${round?.round_number ?? options.roundId} is ${round?.status ?? 'missing'}; an all-bot class needs a round that has not started.`,
        );
      }
      // Only one round may be active at a time (a unique index,
      // migrations/0001_schema.sql:84); starting a second returns a 500.
      const busy = rounds.find(r => r.status === 'ACTIVE');
      if (busy) throw new Error(`Round ${busy.round_number} is still active; end it before starting an all-bot class.`);
    }

    this.speed = options.speed;
    this.roundId = options.roundId;
    this.roundCache = null;
    this.classificationCalls = 0;
    this.scrambled = false;
    this.warnings = [];
    this.heldBatches.clear();
    // Again, because a remove() queued ahead of this start clears the teams.
    this.teams = teams;
    this.emitStatus();

    await this.joinBots(signal);
    if (signal.aborted) return;
    await this.formTeams();
    if (signal.aborted) return;
    if (options.startRound) {
      const body: ConfigRequest = options.idealProfile
        ? { ideal_profile: options.idealProfile as ConfigRequest['ideal_profile'] }
        : {};
      await this.instructor().instructorStart(options.roundId, body);
      this.roundCache = null;
      if (signal.aborted) return;
    }

    for (const team of this.teams) {
      void this.runJokeMaker(team, signal);
      void this.runMarketing(team, signal);
    }
    this.emitStatus();
  }

  /** The kill switch: synchronous and immediate, never queued behind the op chain. */
  stop(): void {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    for (const team of this.teams) {
      team.jm.activity = 'stopped';
      team.marketing.activity = 'stopped';
    }
    this.emitStatus();
  }

  reform(): Promise<void> {
    return this.serialize(async () => {
      await this.formTeams();
      this.scrambled = false;
      this.emitStatus();
    });
  }

  /** Stop, then delete every bot user — never a human. Returns how many were removed. */
  remove(roundId: number): Promise<number> {
    this.stop();
    return this.serialize(async () => {
      const instructor = this.instructor();
      const ids = new Set(
        participantsOf(await instructor.instructorLobby(roundId)).filter(p => isBotName(p.name)).map(p => p.userId),
      );
      // When a start() is queued behind this remove, `this.teams` is already that
      // new run's, not yet joined (every userId null), so this adds nothing. That
      // is deliberate and safe: the lobby scan above finds every bot seated in
      // the round, and the new run joins its bots only after this op finishes.
      for (const team of this.teams) {
        for (const seat of [team.jm, team.marketing]) if (seat.userId != null) ids.add(seat.userId);
      }
      for (const id of ids) {
        try {
          await instructor.instructorDeleteUser(roundId, id);
        } catch (err) {
          if (statusOf(err) !== 404) throw err;
        }
      }
      this.teams = [];
      this.history.clear();
      this.warnings = [];
      this.heldBatches.clear();
      this.scrambled = false;
      this.emitStatus();
      return ids.size;
    });
  }

  /**
   * Run start, reform and remove one at a time. Each re-forms teams, and two
   * formations interleaving their assign and PATCHes strand humans on broken
   * teams, since every assign reshuffles. A failed op does not poison the chain.
   */
  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    this.opChain = run.catch(() => undefined);
    return run;
  }

  // ---- formation -----------------------------------------------------------

  private instructor(): BotApi {
    return this.deps.api.as(this.deps.instructorUserId, 'instructor');
  }

  private requireRoundId(): number {
    if (this.roundId == null) throw new Error('No round selected.');
    return this.roundId;
  }

  private async joinBots(signal: AbortSignal): Promise<void> {
    for (const team of this.teams) {
      for (const seat of [team.jm, team.marketing]) {
        const joined = await this.deps.api.sessionJoin({ display_name: seat.name });
        if (signal.aborted) return;
        seat.userId = joined.user.user_id;
        seat.activity = 'joined';
      }
    }
    this.emitStatus();
  }

  private async formTeams(): Promise<void> {
    this.forming = true;
    try {
      const roundId = this.requireRoundId();
      const instructor = this.instructor();
      const everyone = participantsOf(await instructor.instructorLobby(roundId));
      const humans = everyone.filter(p => !isBotName(p.name)).length;
      const botIndices = new Set<number>();
      for (const p of everyone) {
        const id = parseBotName(p.name);
        if (id) botIndices.add(id.index);
      }

      const lobby = await instructor.instructorAssign(roundId, { team_count: teamsNeeded(humans, botIndices.size) });
      const plan = planPlacement(lobby);
      for (const p of plan.patches) {
        await instructor.instructorPatchUser(roundId, p.userId, { status: 'ASSIGNED', role: p.role, team_id: p.teamId });
      }
      for (const team of this.teams) team.teamId = plan.teamIdByBotIndex.get(team.index) ?? null;

      const warnings: string[] = [];
      if (plan.unpairedHuman) {
        warnings.push(`${plan.unpairedHuman.name} has no human partner and is alone on a team. Add one more human, or remove them.`);
      }
      const leftovers = botIndices.size - this.teams.filter(t => botIndices.has(t.index)).length;
      if (leftovers > 0) {
        warnings.push(`${leftovers} bot team(s) from an earlier run are in the lobby and will not play. Remove bots to clear them.`);
      }
      this.warnings = warnings;
    } finally {
      this.forming = false;
      this.formationEpoch++;
    }
    this.emitStatus();
  }

  // ---- actors --------------------------------------------------------------
  //
  // One rule keeps a stopped run from leaking into the next: once an actor's
  // signal is aborted it touches no engine or team state at all — no counters,
  // no `scrambled`, no round cache, no history, no activity, no emits. It just
  // exits. So every await in an actor is followed by an abort check before the
  // next mutation.

  private async runJokeMaker(team: TeamRuntime, signal: AbortSignal): Promise<void> {
    const persona = PERSONAS[team.persona];
    const seat = team.jm;
    const me = this.deps.api.as(seat.userId as number, `bot ${team.index}A`);
    const rand = seededRng(`${this.deps.seed}:jm:${team.index}`);
    const deck = new Deck(variedCorpus, rand);
    let attempt = 0;

    while (!signal.aborted) {
      try {
        const inPlace = await this.checkSeat(me, team, seat, signal);
        if (signal.aborted) break;
        if (!inPlace) {
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const round = await this.activeRound(signal);
        if (signal.aborted) break;
        if (!round) {
          this.setActivity(seat, 'idle — no active round', signal);
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const submitted = team.submittedByRound.get(round.id) ?? 0;
        if (submitted >= BATCH_CAP_PER_ROUND) {
          this.setActivity(seat, `done — ${BATCH_CAP_PER_ROUND}-batch cap reached`, signal);
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        if (persona.waitForFeedback) await this.waitUntilSettled(me, team, round.id, signal);
        if (signal.aborted) break;

        const jokes = deck.draw(round.batch_size);
        this.setActivity(seat, 'submitting a batch', signal);
        await me.submitBatch(round.id, { team_id: team.teamId as number, raw_text: asRawBlob(jokes) });
        // A batch in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
        team.submittedByRound.set(round.id, submitted + 1);
        seat.error = null;
        attempt = 0;
        this.log(team, seat, `submitted batch ${submitted + 1}: ${jokes.map(j => j.id).join(', ')}`, signal);
        this.setActivity(seat, 'resting before the next batch', signal);
        await this.pace(jitter(persona.submitIntervalMs, rand), signal);
      } catch (err) {
        if (signal.aborted) break;
        attempt = nextAttempt(err, attempt);
        if (!(await this.recover(team, seat, err, attempt, signal))) break;
      }
    }
  }

  /** Careful only: hold the next batch until this round's last one is published and scored. */
  private async waitUntilSettled(me: BotApi, team: TeamRuntime, roundId: number, signal: AbortSignal): Promise<void> {
    const submitted = team.submittedByRound.get(roundId) ?? 0;
    if (submitted === 0) return;
    const seat = team.jm;
    let waited = 0;
    while (!signal.aborted && waited < FEEDBACK_WAIT_MS) {
      const published = (team.publishedByRound.get(roundId) ?? 0) >= submitted;
      const awaiting = team.awaitingFeedback?.roundId === roundId ? team.awaitingFeedback.jokeIds : [];
      if (published && awaiting.length === 0) return;
      if (published) {
        const feedback = await me.teamFeedback(roundId, team.teamId as number);
        if (signal.aborted) return;
        const scored = feedback.jokes.some(
          j => awaiting.includes(j.joke_id) && j.good_dimensions.length + j.improve_dimensions.length > 0,
        );
        if (scored) {
          team.awaitingFeedback = null;
          this.log(team, seat, 'feedback arrived on the last batch — writing the next one', signal);
          return;
        }
      }
      this.setActivity(seat, published ? 'waiting for customer feedback' : 'waiting for Marketing to publish', signal);
      await this.pace(QUEUE_POLL_MS, signal);
      waited += QUEUE_POLL_MS;
    }
    if (!signal.aborted) {
      team.awaitingFeedback = null;
      // If a publish committed but its response was lost, this round's published
      // count would stay one behind submitted for good and every later batch
      // would wait the full timeout. Giving up is the moment to re-sync.
      team.publishedByRound.set(roundId, Math.max(team.publishedByRound.get(roundId) ?? 0, submitted));
      this.log(team, seat, 'gave up waiting for feedback — writing the next batch anyway', signal);
    }
  }

  private async runMarketing(team: TeamRuntime, signal: AbortSignal): Promise<void> {
    const persona = PERSONAS[team.persona];
    const seat = team.marketing;
    const me = this.deps.api.as(seat.userId as number, `bot ${team.index}B`);
    const rand = seededRng(`${this.deps.seed}:mkt:${team.index}`);
    let attempt = 0;

    while (!signal.aborted) {
      try {
        const inPlace = await this.checkSeat(me, team, seat, signal);
        if (signal.aborted) break;
        if (!inPlace) {
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const round = await this.activeRound(signal);
        if (signal.aborted) break;
        if (!round) {
          this.setActivity(seat, 'idle — no active round', signal);
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const envelope = await me.marketingQueueNext(round.id);
        if (signal.aborted) break;
        if (envelope.batch && envelope.batch.team_id !== team.teamId) {
          // The backend hands a marketer its own team's queue, so another team's
          // batch means this seat was moved — seen here at no extra request, and
          // possibly before the throttled seat check would notice. Never split
          // or publish it: that would decide a human team's jokes.
          this.markScrambled(
            team, seat, `the queue handed me team ${envelope.batch.team_id}'s batch, but my team is ${team.teamId ?? '—'}`, signal,
          );
          this.reportHeldBatch(seat, envelope.batch.batch_id, envelope.batch.team_id, signal);
          continue;
        }
        if (!envelope.batch) {
          this.setActivity(seat, 'waiting for a batch', signal);
          await this.pace(QUEUE_POLL_MS, signal);
          continue;
        }

        const batch = envelope.batch;
        let jokes = envelope.jokes;
        this.log(team, seat, `claimed batch #${batch.batch_id}`, signal);
        this.setActivity(seat, `reading batch #${batch.batch_id}`, signal);
        await this.pace(jitter(DWELL_MS.claim, rand), signal);
        if (signal.aborted) break;
        // Seats can move during a dwell; never write for a team we may have left.
        // The batch stays locked to this bot when it continues, on purpose: after
        // Re-form the backend hands a marketer its own held batch first, so the
        // bot resumes where it left off. Do not try to release it here.
        if (this.scrambled) continue;

        if (jokes.length === 0 && batch.raw_text) {
          const pieces = fitPieces(splitBlob(batch.raw_text), round.batch_size, round.round_number);
          const split = await me.marketingSplit(batch.batch_id, { jokes: pieces });
          if (signal.aborted) break;
          jokes = split.jokes;
          this.log(team, seat, `split batch #${batch.batch_id} into ${jokes.length} jokes`, signal);
          this.setActivity(seat, `choosing from ${jokes.length} jokes`, signal);
          await this.pace(jitter(DWELL_MS.split, rand), signal);
          if (signal.aborted) break;
          if (this.scrambled) continue;
        }

        const count = publishCount(persona, jokes.length, round.round_number, rand);
        const keep = choosePublished(jokes.map(j => j.joke_id), count, rand);
        const kept = jokes.filter(j => keep.has(j.joke_id)).map(j => `"${titleOf(j.joke_text)}"`);
        this.log(team, seat, `${persona.label}: keeping ${keep.size} of ${jokes.length} — ${kept.join(', ') || 'none'}`, signal);
        this.setActivity(seat, `publishing ${keep.size} of ${jokes.length}`, signal);
        await this.pace(jitter(DWELL_MS.decide, rand), signal);
        if (signal.aborted) break;
        if (this.scrambled) continue;

        await me.marketingPublish(batch.batch_id, {
          jokes: jokes.map(j => ({ joke_id: j.joke_id, joke_title: titleOf(j.joke_text), is_published: keep.has(j.joke_id) })),
        });
        // A publish in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
        team.publishedByRound.set(round.id, (team.publishedByRound.get(round.id) ?? 0) + 1);
        team.published++;
        team.awaitingFeedback = { roundId: round.id, jokeIds: [...keep] };
        this.classificationCalls += keep.size;
        seat.error = null;
        attempt = 0;
        this.log(team, seat, `published ${keep.size}, discarded ${jokes.length - keep.size}`, signal);
        this.emitStatus();
      } catch (err) {
        if (signal.aborted) break;
        attempt = nextAttempt(err, attempt);
        if (!(await this.recover(team, seat, err, attempt, signal))) break;
      }
    }
  }

  /**
   * Is this seat still where formation put it? If not, someone pressed the
   * ordinary Auto-Assign and scattered bots among humans: every bot pauses until
   * the instructor re-forms teams.
   *
   * A reading taken while formation is running — or that straddled one — says
   * nothing about the settled layout, so it is ignored rather than trusted. So
   * is one that comes back after this actor was stopped.
   *
   * The backend is asked at most once per SEAT_CHECK_MS per seat. In between,
   * the last answer stands — unless any seat has since seen a re-shuffle, which
   * pauses every bot, or teams were re-formed, which forces a fresh answer.
   */
  private async checkSeat(me: BotApi, team: TeamRuntime, seat: SeatRuntime, signal: AbortSignal): Promise<boolean> {
    if (this.forming) return false;
    const epoch = this.formationEpoch;
    const now = this.deps.now();
    if (seat.checkedEpoch === epoch && seat.checkedAt !== null && now - seat.checkedAt < SEAT_CHECK_MS) {
      if (!this.scrambled) return true;
      this.setActivity(seat, 'paused — teams were re-shuffled', signal);
      return false;
    }
    let mine: SessionMeResponse;
    try {
      mine = await me.sessionMe();
    } catch (err) {
      if (statusOf(err) === 404) throw new SeatGone();
      throw err;
    }
    if (signal.aborted) return false;
    if (this.forming || epoch !== this.formationEpoch) return false;
    seat.checkedAt = now;
    seat.checkedEpoch = epoch;

    const inPlace = mine.assignment.team_id === team.teamId && mine.assignment.role === SEAT_ROLE[seat.seat];
    if (!inPlace) {
      this.markScrambled(
        team, seat, `my seat moved (now ${mine.assignment.role ?? 'unassigned'} on team ${mine.assignment.team_id ?? '—'})`, signal,
      );
    }
    if (this.scrambled) {
      this.setActivity(seat, 'paused — teams were re-shuffled', signal);
      return false;
    }
    return true;
  }

  /**
   * The queue call that revealed the move also claimed the batch, and the lock
   * outlives the bot's return to its own team. The backend skips a batch another
   * marketer holds (repo/marketing_repo.go:34-67), so it is hidden from its team,
   * not blocking it, until the lock goes stale after 15 minutes
   * (marketing_repo.go:53) or the bot user is deleted (batches.locked_by is ON
   * DELETE SET NULL, migrations/0001_schema.sql:124).
   */
  private reportHeldBatch(seat: SeatRuntime, batchId: number, teamId: number, signal: AbortSignal): void {
    if (signal.aborted || this.heldBatches.has(batchId)) return;
    this.heldBatches.set(
      batchId,
      `${seat.name} picked up team ${teamId}'s batch #${batchId} before noticing it was moved. `
        + `That batch stays hidden from team ${teamId} for up to 15 minutes; Remove bots releases it at once.`,
    );
    this.emitStatus();
  }

  /** Pause every bot until teams are re-formed; the first seat to notice says why. */
  private markScrambled(team: TeamRuntime, seat: SeatRuntime, why: string, signal: AbortSignal): void {
    if (signal.aborted) return;
    if (!this.scrambled) {
      this.scrambled = true;
      this.log(team, seat, `${why} — every bot pauses until teams are re-formed`, signal);
      this.emitStatus();
    }
    this.setActivity(seat, 'paused — teams were re-shuffled', signal);
  }

  /** Returns false when the actor should stop for good. Only called while not aborted. */
  private async recover(
    team: TeamRuntime, seat: SeatRuntime, err: unknown, attempt: number, signal: AbortSignal,
  ): Promise<boolean> {
    if (err instanceof SeatGone) {
      seat.error = err.message;
      this.setActivity(seat, 'stopped', signal);
      return false;
    }
    if (statusOf(err) === 403) {
      // Refused, but not broken. For Marketing this is usually a batch that moved
      // out from under us — a stale lock someone else claimed, or another team's
      // batch — which production reports as 403, not 409
      // (usecase/marketing.go:143-160). Every other 403 comes from the role/team
      // fields checkSeat compares, so a genuinely mis-seated bot pauses there on
      // the next loop instead of spinning here.
      this.log(team, seat, 'the backend refused this (403) — polling again', signal);
      this.setActivity(seat, 'not allowed right now — polling again', signal);
      await this.pace(QUEUE_POLL_MS, signal);
      return true;
    }
    if (statusOf(err) === 409) {
      // ROUND_NOT_ACTIVE, or a batch already processed: the game moved on.
      this.roundCache = null;
      this.setActivity(seat, 'idle — round not active', signal);
      await this.pace(IDLE_POLL_MS, signal);
      return true;
    }
    seat.error = err instanceof Error ? err.message : String(err);
    const backoff = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(attempt, 5));
    this.log(team, seat, `error: ${seat.error} — retrying in ${Math.round(backoff / 1000)}s`, signal);
    this.setActivity(seat, `retrying in ${Math.round(backoff / 1000)}s`, signal);
    await this.deps.delay(backoff, signal);
    return true;
  }

  private async activeRound(signal: AbortSignal): Promise<PublicRound | null> {
    const now = this.deps.now();
    if (this.roundCache && now - this.roundCache.at < ROUND_CACHE_MS) return this.roundCache.round;
    const { rounds } = await this.deps.api.roundsActive();
    const round = rounds.find(r => r.status === 'ACTIVE') ?? null;
    if (signal.aborted) return round;
    this.roundCache = { at: now, round };
    return round;
  }

  private async pace(msAt1x: number, signal: AbortSignal): Promise<void> {
    for (const wall of wallClockSteps(msAt1x, () => this.speed)) {
      if (signal.aborted) return;
      await this.deps.delay(wall, signal);
    }
  }

  private setActivity(seat: SeatRuntime, activity: string, signal: AbortSignal): void {
    if (signal.aborted || seat.activity === activity) return;
    seat.activity = activity;
    this.emitStatus();
  }

  private log(team: TeamRuntime, seat: SeatRuntime, text: string, signal: AbortSignal): void {
    if (signal.aborted || seat.userId == null) return;
    const entry: ReasoningEntry = {
      botUserId: seat.userId, teamIndex: team.index, seat: seat.seat, persona: team.persona,
      at: this.deps.now(), text,
    };
    const list = this.history.get(seat.userId) ?? [];
    list.push(entry);
    if (list.length > HISTORY_PER_BOT) list.splice(0, list.length - HISTORY_PER_BOT);
    this.history.set(seat.userId, list);
    this.deps.emit({ type: 'log', entry });
  }

  private emitStatus(): void {
    this.deps.emit({ type: 'status', status: this.status() });
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run services/bots/engine.test.ts`
Expected: 43 passed.

> **Revised in review.** The engine and fake above are the committed versions, not the first
> draft. Review rounds against the Go backend and adversarial probes added: serialized
> start/reform/remove with a stop that cancels a start in progress; per-actor abort checks so a
> stopped run never touches the next; per-round counters for Careful; a throttled seat check
> with an envelope `team_id` guard so a moved bot never decides another team's batch; and a
> held-batch warning. Each fix is pinned by a mutation-checked regression test. If a play test times out, print `world.calls.slice(-40)` and `engine.status()` inside `until`'s error path to see where the actor loop stalled — do not raise the iteration limit to make it pass.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK`
Expected: all pass, then `TYPECHECK_OK`.

- [ ] **Step 6: Commit**

```bash
git add services/bots/engine.ts services/bots/engine.test.ts
git commit -m "feat(bots): add the bot engine

One actor per seat, paced in 1-second ticks so speed changes land fast,
isolated so one failing bot never stops the rest, and paused class-wide
when Auto-Assign scatters bots among humans.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Worker host and base-URL export

**Files:**
- Create: `services/bots/worker.ts`
- Modify: `services/apiClient.ts`, `services/apiClient.test.ts`

- [ ] **Step 1: Write the failing apiClient test**

Append to `services/apiClient.test.ts`, and add `getApiBaseUrl, isMockApiMode` to its existing `import { … } from './apiClient'` line:

```ts
describe('getApiBaseUrl', () => {
  it('reports the configured backend without a trailing slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/');
    expect(getApiBaseUrl()).toBe('http://api.test');
  });
});

describe('isMockApiMode', () => {
  it('is false against a real backend and true when the mock is forced', () => {
    expect(isMockApiMode()).toBe(false);
    vi.stubEnv('VITE_USE_MOCK_API', 'true');
    expect(isMockApiMode()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run services/apiClient.test.ts`
Expected: FAIL — `getApiBaseUrl` is not exported.

- [ ] **Step 3: Add the exports**

In `services/apiClient.ts`, directly after `function shouldUseMockApi()`, add:

```ts
/** The backend origin this build talks to. The Bot Panel hands it to its worker
 *  so bots hit exactly the server the instructor's own screen does. */
export function getApiBaseUrl(): string {
  return getBaseUrl().replace(/\/+$/, '');
}

/** True when requests go to the in-browser mock. Bots need a real backend. */
export function isMockApiMode(): boolean {
  return shouldUseMockApi();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run services/apiClient.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the worker**

```ts
// services/bots/worker.ts
/**
 * Hosts the bot engine in a dedicated Web Worker.
 *
 * WHY A WORKER. Bots have to keep playing while the instructor looks at another
 * tab, and browsers throttle timers on a hidden page's main thread hard. See the
 * spike result in the spec's §10 for what was measured.
 *
 * Commands arrive from the Bot Panel by postMessage. Reasoning goes out twice:
 * to the panel, and on a BroadcastChannel, which is the only way to reach a
 * watch tab — a separate tab with no handle on this worker.
 */
import { createClient } from '../shared/client';
import type { BotApi } from './api';
import { handleMessage } from './commands';
import { BotEngine, realDelay } from './engine';
import { BOT_CHANNEL, type ChannelMessage, type FromWorker, type ToWorker } from './protocol';

// Typed narrowly instead of pulling in the WebWorker lib, which conflicts with
// the DOM lib the rest of the project compiles against.
interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;
const channel = new BroadcastChannel(BOT_CHANNEL);
let engine: BotEngine | null = null;

function post(message: FromWorker): void {
  scope.postMessage(message);
  if (message.type === 'log') {
    const forward: ChannelMessage = { type: 'log', entry: message.entry };
    channel.postMessage(forward);
  }
}

channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
  const m = event.data;
  // Same-origin, so this is robustness rather than security: ignore anything
  // that isn't a message object.
  if (!m || typeof m !== 'object') return;
  if (m.type !== 'history-request' || !engine) return;
  const entries = engine.historyFor(m.botUserId);
  const meta = engine.metaFor(m.botUserId);
  // A second instructor tab has an idle engine. A watch tab keeps the last reply
  // it receives, so an empty answer from a worker that doesn't run this bot
  // could erase the real history.
  if (!meta && entries.length === 0) return;
  const reply: ChannelMessage = { type: 'history', botUserId: m.botUserId, entries, meta };
  channel.postMessage(reply);
};

scope.onmessage = event => {
  void handle(event.data);
};

async function handle(m: ToWorker): Promise<void> {
  if (m.type !== 'init') {
    // Commands answer with `done` (their own failures included); see commands.ts.
    await handleMessage(engine, m, post);
    return;
  }
  try {
    engine?.stop();
    // Assigning the real client to BotApi is also the compile-time proof that
    // the engine's fake and the real thing agree on shape.
    const api: BotApi = createClient({ baseUrl: m.baseUrl });
    engine = new BotEngine({
      api, instructorUserId: m.instructorUserId, delay: realDelay,
      now: () => Date.now(), emit: post, seed: m.seed,
    });
  } catch (err) {
    // No command waits on init, so its failure has no `done` to ride on.
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK`
Expected: `TYPECHECK_OK`. A failure on `const api: BotApi = createClient(...)` means `BotApi` and the real client disagree — fix `api.ts` to match the real signature, never the other way round.

- [ ] **Step 7: Commit**

```bash
git add services/bots/worker.ts services/apiClient.ts services/apiClient.test.ts
git commit -m "feat(bots): host the engine in a Web Worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: The Bot Panel

**Files:**
- Create: `components/BotPanel.tsx`
- Modify: `views/Instructor.tsx` (imports; the `<div className="space-y-8">` at ~line 1934)

- [ ] **Step 1: Write the panel**

```tsx
// components/BotPanel.tsx
/* BotPanel — the instructor's control surface for bot players.

   Rendered only when the page is opened with ?bots=1 (botPanelRequested): this
   is a test tool on the production deployment, and it must not be one misclick
   away during a real class.

   The panel owns no game logic. It hosts services/bots/worker.ts, sends it
   commands, and renders what the engine reports. Unmounting — including closing
   the tab — terminates the worker, which stops every bot. That is the kill
   switch, by design. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../context';
import { Button, Card } from '../components';
import { isCompleteProfile } from './IdealProfilePicker';
import { getApiBaseUrl, isMockApiMode } from '../services/apiClient';
import { MAX_BOT_TEAMS, PERSONAS, PERSONA_ORDER, personaSequence, type PersonaId } from '../services/bots/personas';
import {
  SPEEDS, type Command, type EngineStatus, type FromWorker, type ProbeResult, type SeatStatus, type Speed, type ToWorker,
} from '../services/bots/protocol';
import { panelControls, probeIsStale, type Pending } from './botPanelLogic';

export function botPanelRequested(search: string): boolean {
  return new URLSearchParams(search).get('bots') === '1';
}

const PROBE_EVERY_MS = 5_000;
const DEFAULT_COUNTS: Record<PersonaId, number> = { CAREFUL: 4, BALANCED: 4, SPRAY: 4 };
const COMMAND_LABEL: Record<Command, string> = { start: 'Start', stop: 'Stop', remove: 'Remove bots', reform: 'Re-form teams' };

function clampCount(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(MAX_BOT_TEAMS, Math.max(0, n)) : 0;
}

const SeatCell: React.FC<{ seat: SeatStatus }> = ({ seat }) => (
  <div>
    <div>{seat.activity}</div>
    {seat.error && <div className="text-rose-700">{seat.error}</div>}
  </div>
);

export const BotPanel: React.FC = () => {
  const { user, roundId, config } = useGame();
  const workerRef = useRef<Worker | null>(null);
  const commandIdRef = useRef(0);
  /** For the worker's message handler, which outlives any one roundId. */
  const roundIdRef = useRef<number | null>(null);
  const [counts, setCounts] = useState<Record<PersonaId, number>>(DEFAULT_COUNTS);
  const [speed, setSpeed] = useState<Speed>(1);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  /** When the last lobby reading arrived, or when the panel started waiting for one. */
  const [heardAt, setHeardAt] = useState(() => Date.now());
  /** Re-read on every probe tick, so staleness is re-evaluated without a reply. */
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const mock = isMockApiMode();
  const instructorId = user ? Number(user.user_id) : null;
  const send = useCallback((message: ToWorker) => {
    workerRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    if (instructorId == null || mock) return undefined;
    // A new worker holds a new, idle engine: nothing from the old one applies.
    setStatus(null);
    setPending(null);
    setError(null);
    setProbe(null);
    setHeardAt(Date.now());
    const worker = new Worker(new URL('../services/bots/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const probeNow = () => {
      if (roundIdRef.current != null) worker.postMessage({ type: 'probe', roundId: roundIdRef.current } satisfies ToWorker);
    };
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data;
      if (m.type === 'status') setStatus(m.status);
      else if (m.type === 'probe') {
        setProbe(m.result);
        setHeardAt(Date.now());
      } else if (m.type === 'done') {
        // Only the acknowledgement of the command still pending clears it: a
        // start superseded by Stop must not clear Stop's pending state.
        setPending(p => (p?.id === m.commandId ? null : p));
        if (!m.ok) setError(`${COMMAND_LABEL[m.command]} failed: ${m.message}`);
        // The lobby just changed; don't leave the buttons on a reading up to 5 s old.
        probeNow();
      } else if (m.type === 'fatal') {
        setError(m.message);
      }
    };
    // WHY: a deploy replaces the hashed worker-*.js chunk, so a tab opened before
    // it asks for a file that no longer exists. That worker never replies: a
    // pending command would stick, and even Stop would post into the void. Drop
    // it, so nothing else is sent to it, and tell the instructor how to recover.
    const workerFailed = () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setPending(null);
      setError('The bot worker stopped responding. Reload this page to get the current version.');
    };
    worker.onerror = workerFailed;
    worker.onmessageerror = workerFailed;
    const init: ToWorker = { type: 'init', baseUrl: getApiBaseUrl(), instructorUserId: instructorId, seed: `bots-${Date.now()}` };
    worker.postMessage(init);
    probeNow();
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [instructorId, mock]);

  useEffect(() => {
    roundIdRef.current = roundId == null ? null : Number(roundId);
    // Fail closed until this round's own reading arrives.
    setProbe(null);
    const started = Date.now();
    setHeardAt(started);
    setNow(started);
    if (roundId == null || instructorId == null || mock) return undefined;
    const tick = () => {
      setNow(Date.now());
      send({ type: 'probe', roundId: Number(roundId) });
    };
    tick();
    const timer = window.setInterval(tick, PROBE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [roundId, instructorId, mock, send]);

  if (mock) {
    return (
      <Card title="🤖 Bot players" subtitle="Test tool">
        <p className="text-sm text-gray-600">Bot players need the real backend. This build is serving the in-browser mock API.</p>
      </Card>
    );
  }

  const controls = panelControls({
    hasRound: roundId != null,
    probe,
    probeStale: probeIsStale(heardAt, now),
    status,
    pending,
    counts,
    profileComplete: isCompleteProfile(config.idealProfile),
  });
  const { idle, total } = controls;
  const reasons = [...new Set([...controls.runAllBotsBlockedBy, ...controls.fillBlockedBy])];

  /** Every command goes through here: a fresh id, a fresh error line, pending keyed to the id. */
  const issue = (command: Command, message: (commandId: number) => ToWorker) => {
    if (!workerRef.current) return;
    const id = ++commandIdRef.current;
    setError(null);
    setPending({ id, command });
    send(message(id));
  };

  const start = (startRound: boolean) => {
    if (roundId == null) return;
    const teams = personaSequence(counts).map((persona, i) => ({ index: i + 1, persona }));
    issue('start', commandId => ({
      type: 'start',
      commandId,
      options: { roundId: Number(roundId), teams, speed, startRound, idealProfile: { ...config.idealProfile } },
    }));
  };

  const changeSpeed = (next: Speed) => {
    setSpeed(next);
    send({ type: 'setSpeed', speed: next });
  };

  return (
    <Card title="🤖 Bot players" subtitle="Test tool — shown because the URL has ?bots=1. Closing this tab stops every bot.">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-4">
          {PERSONA_ORDER.map(id => (
            <label key={id} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-500">{PERSONAS[id].label}</span>
              <input
                type="number" min={0} max={MAX_BOT_TEAMS} value={counts[id]} disabled={!idle}
                aria-label={`${PERSONAS[id].label} bot teams`}
                onChange={e => setCounts(c => ({ ...c, [id]: clampCount(e.target.value) }))}
                className="w-20 rounded border border-gray-300 px-2 py-1"
              />
            </label>
          ))}
          <div className="text-xs text-gray-500">
            {total} bot team{total === 1 ? '' : 's'}{total > MAX_BOT_TEAMS ? ` — max ${MAX_BOT_TEAMS}` : ''}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Bot speed">
            {SPEEDS.map(s => (
              <button
                key={s} type="button" onClick={() => changeSpeed(s)} aria-pressed={speed === s}
                className={`rounded px-2 py-1 text-xs font-semibold ${speed === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start(true)} disabled={!controls.canRunAllBots}>Run all-bot class</Button>
          <Button variant="secondary" onClick={() => start(false)} disabled={!controls.canFill}>Fill with bot teams</Button>
          <Button
            variant="secondary"
            onClick={() => issue('stop', commandId => ({ type: 'stop', commandId }))}
            disabled={!controls.canStop}
          >
            Stop
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (roundId == null) return;
              issue('remove', commandId => ({ type: 'remove', commandId, roundId: Number(roundId) }));
            }}
            disabled={!controls.canRemove}
          >
            Remove bots
          </Button>
          {status?.scrambled && (
            <Button onClick={() => issue('reform', commandId => ({ type: 'reform', commandId }))} disabled={!controls.canReform}>
              Re-form teams
            </Button>
          )}
        </div>

        <div aria-live="polite" className="space-y-1">
          <p className="text-xs text-gray-500">
            Lobby: {probe ? `${probe.humans} human${probe.humans === 1 ? '' : 's'}, ${probe.bots} bot${probe.bots === 1 ? '' : 's'}` : 'checking…'}
            {' · '}Round: {probe?.roundStatus ?? '…'}
            {' · '}Classification calls: {status?.classificationCalls ?? 0}
          </p>
          {reasons.map(r => <p key={r} className="text-xs text-amber-700">{r}</p>)}
          {status?.warnings.map(w => <p key={w} className="text-xs text-amber-700">{w}</p>)}
          {status?.scrambled && (
            <p className="text-xs text-rose-700">Teams were re-shuffled — probably Auto-Assign. Bots are paused until you re-form teams.</p>
          )}
          {error && <p className="text-xs text-rose-700">Error: {error}</p>}
        </div>

        {status && status.teams.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Bot teams, and what each seat is doing</caption>
              <thead className="text-gray-500">
                <tr>
                  <th scope="col" className="py-1 pr-3">Bot team</th>
                  <th scope="col" className="pr-3">Persona</th>
                  <th scope="col" className="pr-3">Joke Maker</th>
                  <th scope="col" className="pr-3">Marketing</th>
                  <th scope="col" className="pr-3">Published</th>
                </tr>
              </thead>
              <tbody>
                {status.teams.map(t => (
                  <tr key={t.index} className="border-t border-gray-100 align-top">
                    <td className="py-1 pr-3 font-semibold">
                      {String(t.index).padStart(2, '0')}{t.teamId != null ? ` · team ${t.teamId}` : ''}
                    </td>
                    <td className="pr-3">{PERSONAS[t.persona].label}</td>
                    <td className="pr-3"><SeatCell seat={t.jm} /></td>
                    <td className="pr-3"><SeatCell seat={t.marketing} /></td>
                    <td className="pr-3">{t.batchesPublished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
};
```

- [ ] **Step 2: Mount it in the instructor view**

In `views/Instructor.tsx`, add to the imports:

```tsx
import { BotPanel, botPanelRequested } from '../components/BotPanel';
```

Then change the start of the render (~line 1932):

```tsx
  return (
    <RoleLayout>
      <div className="space-y-8">
```

to:

```tsx
  return (
    <RoleLayout>
      <div className="space-y-8">
        {botPanelRequested(window.location.search) && <BotPanel />}
```

- [ ] **Step 3: Typecheck, test, build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build 2>&1 | tail -4`
Expected: 0 type errors, all tests pass, `✓ built`, and a separate `assets/worker-*.js` chunk listed — proof Vite bundled the worker.

- [ ] **Step 4: Commit**

```bash
git add components/BotPanel.tsx views/Instructor.tsx
git commit -m "feat(bots): add the Bot Panel to the instructor view behind ?bots=1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

> **Revised in review (Tasks 8–9).** The protocol, worker and panel above are the committed
> versions. Review replaced status-inferred completion with explicit command acknowledgements:
> `start`/`stop`/`remove`/`reform` carry a `commandId`, and the worker answers each with exactly
> one `done`. Two modules were added that this plan did not originally have:
> `services/bots/commands.ts` (the worker's dispatch, pure and tested) and
> `components/botPanelLogic.ts` (`panelControls`: every button's enablement plus the reason it
> is disabled, tested). Stop stays enabled while a start is pending; Fill re-checks the round;
> probes are best-effort; a failed worker load recovers the panel.

## Task 10: Extract the Playwright session helpers

`roles.spec.ts` exports its session helpers, but importing a spec re-registers its tests in the importer. Move the helpers into a plain module.

**Files:**
- Create: `scripts/e2e/browser/session.ts`
- Modify: `scripts/e2e/browser/roles.spec.ts`

- [ ] **Step 1: Create `session.ts` from the existing code, moved verbatim**

Create `scripts/e2e/browser/session.ts` whose first line is:

```ts
import type { BrowserContext, Page } from '@playwright/test';
```

Then **cut** these declarations from `scripts/e2e/browser/roles.spec.ts`, together with their doc comments, and paste them unchanged: `ADMIN_PASSWORD`, `FE_URL`, `BE_URL`, `INSTRUCTOR_NAME`, `LS`, `TUTORIAL_SEEN_PREFIX`, `SeedableRole`, `SessionSeed`, `seedSession`, `suppressTutorials`, `readSession`.

Leave in `roles.spec.ts`: `MISSING_PASSWORD_MESSAGE`, the `if (!ADMIN_PASSWORD) console.warn(...)` block, and everything else.

- [ ] **Step 2: Re-import in `roles.spec.ts`**

Directly below the existing `@playwright/test` import in `roles.spec.ts`, add:

```ts
import {
  ADMIN_PASSWORD, BE_URL, FE_URL, INSTRUCTOR_NAME, LS, TUTORIAL_SEEN_PREFIX,
  readSession, seedSession, suppressTutorials, type SeedableRole, type SessionSeed,
} from './session';

// Re-exported so anything that imported these from this spec keeps working.
export {
  ADMIN_PASSWORD, BE_URL, FE_URL, INSTRUCTOR_NAME, LS, TUTORIAL_SEEN_PREFIX,
  readSession, seedSession, suppressTutorials, type SeedableRole, type SessionSeed,
};
```

Remove `BrowserContext` from the `@playwright/test` import in `roles.spec.ts` if it is now unused.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK && npx playwright test --list`
Expected: `TYPECHECK_OK`, and the listing still shows exactly one `roles.spec.ts` test.

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e/browser/session.ts scripts/e2e/browser/roles.spec.ts
git commit -m "refactor(e2e): move browser session helpers out of roles.spec

Importing a spec re-registers its tests in the importer, so shared
helpers live in their own module.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: Live test — one click runs an all-bot class

**Destructive:** resets the live game, like every other live suite in this repo.

**Files:**
- Create: `scripts/e2e/browser/bots.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// scripts/e2e/browser/bots.spec.ts
/**
 * Bot players, driven through the real Bot Panel against the live backend.
 *
 * DESTRUCTIVE: resets the game first, exactly as the orchestrated suite does,
 * because "Run all-bot class" needs an empty lobby and an unstarted round. Run
 * it only against a backend nobody is using.
 *
 * Assertions go through the API, not the panel's own text: the panel reports
 * what the engine BELIEVES; the backend is what actually happened.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type JokeFactoryClient } from '../../../services/shared/client';
import { isBotName } from '../../../services/bots/naming';
import { participantsOf } from '../../../services/bots/placement';
import { ADMIN_PASSWORD, BE_URL, FE_URL, INSTRUCTOR_NAME, seedSession, suppressTutorials } from './session';

const CLASS_BUDGET_MS = 6 * 60_000;

interface Setup {
  instructor: JokeFactoryClient;
  api: JokeFactoryClient;
  instructorId: number;
  roundId: number;
}

async function resetAndLogin(): Promise<Setup> {
  const api = createClient({ baseUrl: BE_URL });
  const login = await api.instructorLogin({ display_name: INSTRUCTOR_NAME, password: ADMIN_PASSWORD as string });
  const instructorId = login.user.user_id;
  const instructor = api.as(instructorId, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const round1 = (await api.roundsActive()).rounds.find(r => r.round_number === 1);
  if (!round1) throw new Error('no round 1 after reset');
  return { instructor, api, instructorId, roundId: round1.id };
}

async function openPanel(page: Page, s: Setup): Promise<void> {
  await suppressTutorials(page.context());
  await seedSession(page.context(), {
    userId: s.instructorId, displayName: INSTRUCTOR_NAME, role: 'INSTRUCTOR', roundId: s.roundId,
  });
  await page.goto(`${FE_URL}/?bots=1`);
  await expect(page.getByText('🤖 Bot players')).toBeVisible({ timeout: 30_000 });
}

test.describe('Bot players (live)', () => {
  test.skip(!ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD is not set');

  test('one click runs an all-bot class that publishes and gets scored', async ({ page }) => {
    test.setTimeout(CLASS_BUDGET_MS + 2 * 60_000);
    const s = await resetAndLogin();
    await openPanel(page, s);

    await page.getByLabel('Careful bot teams').fill('1');
    await page.getByLabel('Balanced bot teams').fill('1');
    await page.getByLabel('Spray bot teams').fill('1');
    await page.getByRole('button', { name: '10×' }).click();
    await expect(page.getByText(/Lobby: 0 humans/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Run all-bot class' }).click();

    // Teams formed: three teams, every member a bot, one of each role per team.
    await expect.poll(async () => {
      const lobby = await s.instructor.instructorLobby(s.roundId);
      const teams = (lobby.Teams ?? []).filter(t => t.Members.length > 0);
      return teams.length === 3 && teams.every(t =>
        t.Members.length === 2 && t.Members.every(m => isBotName(m.DisplayName))
        && new Set(t.Members.map(m => m.Role)).size === 2);
    }, { timeout: 60_000, message: 'three all-bot teams, one Joke Maker and one Marketer each' }).toBe(true);

    await expect.poll(
      async () => (await s.api.roundsActive()).rounds.find(r => r.id === s.roundId)?.status,
      { timeout: 30_000 },
    ).toBe('ACTIVE');

    // Jokes flowed all the way through: published, then classified by the LLM.
    const lobby = await s.instructor.instructorLobby(s.roundId);
    const seats = (lobby.Teams ?? []).flatMap(t => t.Members.map(m => ({ teamId: t.Team.id, userId: m.UserID })));
    await expect.poll(async () => {
      for (const seat of seats) {
        const fb = await s.api.as(seat.userId, 'bot').teamFeedback(s.roundId, seat.teamId);
        if (fb.jokes.some(j => j.good_dimensions.length + j.improve_dimensions.length > 0)) return true;
      }
      return false;
    }, { timeout: CLASS_BUDGET_MS, intervals: [5_000], message: 'a bot joke published and scored' }).toBe(true);

    // Scoped to the panel's own table: the instructor view also renders the
    // leaderboard and Live Market tables, whose rows a bare `tbody tr` counts.
    await expect(
      page.getByRole('table', { name: 'Bot teams, and what each seat is doing' }).locator('tbody tr'),
    ).toHaveCount(3);

    // Clean up through the panel, and prove it removed bots and nothing else.
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Remove bots' }).click();
    await expect.poll(async () => {
      const after = participantsOf(await s.instructor.instructorLobby(s.roundId));
      return after.filter(p => isBotName(p.name)).length;
    }, { timeout: 60_000 }).toBe(0);
  });
});

- [ ] **Step 2: Build a local production bundle against the live backend and serve it**

The feature is not deployed yet, so test a local build pointed at the real backend.

```bash
VITE_USE_MOCK_API=false VITE_API_BASE_URL=https://jokefactory-api.whitepebble-2daa4226.westus2.azurecontainerapps.io npx vite build
```

Then start the preview server in the background (a separate terminal, or a background task):

```bash
npx vite preview --port 4173 --strictPort
```

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/`
Expected: `200`.

- [ ] **Step 3: Run the live test**

```bash
E2E_FE_URL=http://localhost:4173 E2E_ADMIN_PASSWORD="$(cat ~/.jokefactory-admin-password)" npx playwright test scripts/e2e/browser/bots.spec.ts --reporter=line
```

Expected: `1 passed`. On failure, read `test-results/**/error-context.md` and the screenshot before changing anything — the page snapshot shows what the panel actually displayed.

- [ ] **Step 4: Stop the preview server**, then commit

```bash
git add scripts/e2e/browser/bots.spec.ts
git commit -m "test(e2e): drive a one-click all-bot class through the live backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Phase 1 checkpoint:** bots are usable end to end. Report to the user before starting Phase 2.

---

# PHASE 2 — Watch mode

## Task 12: Per-tab watch identity

**Files:**
- Create: `services/watchMode.ts`
- Test: `services/watchMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/watchMode.test.ts
import { describe, it, expect } from 'vitest';
import { captureWatchIdentity, clearPersisted, getWatchIdentity, isWatchMode, watchRequested, watchUrl } from './watchMode';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('watch mode identity', () => {
  it('captures the bot from the URL into per-tab storage', () => {
    const tab = new MemoryStorage();
    const w = captureWatchIdentity('?watch=17&watchName=%F0%9F%A4%96%20Bot%2003B', tab);
    expect(w).toEqual({ userId: 17, displayName: '🤖 Bot 03B' });
    expect(getWatchIdentity(tab)).toEqual(w);
    expect(isWatchMode(tab)).toBe(true);
  });

  it('survives a reload, because the reload keeps the query string', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('?watch=17&watchName=x', tab)).toEqual({ userId: 17, displayName: 'x' });
  });

  it('ends watch mode when the URL no longer carries ?watch', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('?bots=1', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
    expect(tab.getItem('joke_factory_watch_user_id')).toBeNull();
    expect(tab.getItem('joke_factory_watch_display_name')).toBeNull();
  });

  it('clears a stale identity when the new ?watch is invalid', () => {
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17&watchName=x', tab);
    expect(captureWatchIdentity('?watch=abc', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
    expect(tab.getItem('joke_factory_watch_display_name')).toBeNull();
  });

  it('is off without a watch parameter', () => {
    const tab = new MemoryStorage();
    expect(captureWatchIdentity('?bots=1', tab)).toBeNull();
    expect(isWatchMode(tab)).toBe(false);
  });

  it('ignores ids that are not positive integers', () => {
    for (const bad of ['abc', '0', '-3', '2.5', '99999999999999999999']) {
      const tab = new MemoryStorage();
      expect(captureWatchIdentity(`?watch=${bad}`, tab)).toBeNull();
    }
  });

  it('builds a URL that round-trips', () => {
    const url = new URL(watchUrl('https://app.test', 42, '🤖 Bot 01A'));
    expect(captureWatchIdentity(url.search, new MemoryStorage())).toEqual({ userId: 42, displayName: '🤖 Bot 01A' });
  });

  it('is off when there is no sessionStorage at all', () => {
    expect(getWatchIdentity(null)).toBeNull();
    expect(captureWatchIdentity('?watch=17', null)).toBeNull();
  });
});

describe('watch name', () => {
  it('falls back to "user <id>" when the name is missing, blank or only control characters', () => {
    for (const q of ['?watch=9', '?watch=9&watchName=', '?watch=9&watchName=%20%20', '?watch=9&watchName=%00%1F%0A']) {
      expect(captureWatchIdentity(q, new MemoryStorage())).toEqual({ userId: 9, displayName: 'user 9' });
    }
  });

  it('trims and strips control characters and bidi overrides', () => {
    const name = encodeURIComponent('  Bo\u0007b\u202E 03\u202CB\n ');
    expect(captureWatchIdentity(`?watch=9&watchName=${name}`, new MemoryStorage())).toEqual({
      userId: 9,
      displayName: 'Bob 03B',
    });
  });

  it('caps the name at 60 characters without splitting an emoji', () => {
    const a = captureWatchIdentity(`?watch=9&watchName=${'a'.repeat(500)}`, new MemoryStorage());
    expect(a?.displayName).toBe('a'.repeat(60));
    const b = captureWatchIdentity(`?watch=9&watchName=${encodeURIComponent('🤖'.repeat(100))}`, new MemoryStorage());
    expect(b?.displayName).toBe('🤖'.repeat(60));
  });
});

describe('a store that throws', () => {
  it('returns null instead of throwing when setItem fails (quota, blocked storage)', () => {
    const removed: string[] = [];
    const broken = {
      getItem: () => null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: (k: string) => { removed.push(k); },
    };
    expect(() => captureWatchIdentity('?watch=17&watchName=x', broken)).not.toThrow();
    expect(captureWatchIdentity('?watch=17&watchName=x', broken)).toBeNull();
    expect(removed).toContain('joke_factory_watch_user_id');
  });

  it('returns null instead of throwing when removeItem fails', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(captureWatchIdentity('?bots=1', broken)).toBeNull();
  });
});

describe('watchRequested', () => {
  it('is true whenever the URL carries a watch parameter, valid or not', () => {
    expect(watchRequested('?watch=17')).toBe(true);
    expect(watchRequested('?watch=abc')).toBe(true);
    expect(watchRequested('?watch=')).toBe(true);
    expect(watchRequested('?bots=1&watch=3')).toBe(true);
  });

  it('is false without one', () => {
    expect(watchRequested('')).toBe(false);
    expect(watchRequested('?bots=1')).toBe(false);
    expect(watchRequested('?watchName=x')).toBe(false);
  });
});

describe('clearPersisted', () => {
  it('clears the shared keys in a normal tab', () => {
    const shared = new MemoryStorage();
    shared.setItem('joke_factory_user_id', '5');
    clearPersisted(['joke_factory_user_id'], shared, new MemoryStorage());
    expect(shared.getItem('joke_factory_user_id')).toBeNull();
  });

  it('never touches them from a watch tab — that would log the instructor out everywhere', () => {
    const shared = new MemoryStorage();
    shared.setItem('joke_factory_user_id', '5');
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    clearPersisted(['joke_factory_user_id'], shared, tab);
    expect(shared.getItem('joke_factory_user_id')).toBe('5');
  });

  it('clears every listed key in a normal tab, and leaves unlisted ones', () => {
    const shared = new MemoryStorage();
    shared.setItem('a', '1');
    shared.setItem('b', '2');
    shared.setItem('c', '3');
    clearPersisted(['a', 'b'], shared, new MemoryStorage());
    expect([shared.getItem('a'), shared.getItem('b'), shared.getItem('c')]).toEqual([null, null, '3']);
  });

  it('leaves every listed key alone in a watch tab', () => {
    const shared = new MemoryStorage();
    shared.setItem('a', '1');
    shared.setItem('b', '2');
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    clearPersisted(['a', 'b'], shared, tab);
    expect([shared.getItem('a'), shared.getItem('b')]).toEqual(['1', '2']);
  });

  it('clears again once the tab has left watch mode', () => {
    const shared = new MemoryStorage();
    shared.setItem('a', '1');
    const tab = new MemoryStorage();
    captureWatchIdentity('?watch=17', tab);
    captureWatchIdentity('?bots=1', tab);
    clearPersisted(['a'], shared, tab);
    expect(shared.getItem('a')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run services/watchMode.test.ts`
Expected: FAIL — cannot find module `./watchMode`.

- [ ] **Step 3: Implement**

```ts
// services/watchMode.ts
/**
 * Watch mode: a tab that renders a bot's real Joke Maker or Marketing screen.
 *
 * THE CONSTRAINT THIS FILE EXISTS FOR. The app keeps its identity in
 * localStorage, and localStorage is shared by every tab on the origin. A watch
 * tab that wrote the bot's id there would switch the INSTRUCTOR tab to that bot
 * on its next poll; one that cleared it — which context.tsx's logout() does on a
 * 404 from /session/me — would log the instructor out of every tab. So a watch
 * tab keeps its identity in sessionStorage, which is per-tab, and never writes
 * or clears the shared keys. apiClient and context consult this module first.
 */
export const WATCH_PARAM = 'watch';
export const WATCH_NAME_PARAM = 'watchName';
const SS_USER_ID = 'joke_factory_watch_user_id';
const SS_DISPLAY_NAME = 'joke_factory_watch_display_name';
/** Enough for "🤖 Bot 03B"; small enough that a hostile link cannot fill the banner or the quota. */
const MAX_NAME_LENGTH = 60;

export interface WatchIdentity {
  userId: number;
  displayName: string;
}

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function tabStore(): WriteStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function sharedStore(): Pick<Storage, 'removeItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function parseId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  // isSafeInteger: "99999999999999999999" parses to 1e20, which is no user id.
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The name arrives in a link anyone can craft and is rendered in a banner, so
 * drop control characters and bidi overrides (which can reorder the text around
 * them), then cap it. Capping by code point keeps an emoji from being cut in half.
 */
function sanitizeName(raw: string | null, userId: number): string {
  const cleaned = (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  const capped = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
  return capped || `user ${userId}`;
}

/** True when the URL asks for watch mode at all, valid id or not. A caller uses
 *  it to tell "not a watch tab" from "asked to watch but capture failed". */
export function watchRequested(search: string): boolean {
  return new URLSearchParams(search).has(WATCH_PARAM);
}

/**
 * Call once at startup, before rendering. The URL is authoritative: `?watch=`
 * puts this tab in watch mode, and a URL without a valid one takes it out again,
 * so an instructor who reuses the tab for `/?bots=1` is not left acting as a
 * read-only bot. Never throws — a blocked or full sessionStorage returns null,
 * and the caller can tell that apart from "not requested" with watchRequested().
 */
export function captureWatchIdentity(search: string, store: WriteStore | null = tabStore()): WatchIdentity | null {
  if (!store) return null;
  try {
    const params = new URLSearchParams(search);
    const userId = parseId(params.get(WATCH_PARAM));
    if (userId === null) {
      store.removeItem(SS_USER_ID);
      store.removeItem(SS_DISPLAY_NAME);
      return null;
    }
    store.setItem(SS_USER_ID, String(userId));
    store.setItem(SS_DISPLAY_NAME, sanitizeName(params.get(WATCH_NAME_PARAM), userId));
    return getWatchIdentity(store);
  } catch {
    // Half-written state must not read back as a watch identity.
    try {
      store.removeItem(SS_USER_ID);
      store.removeItem(SS_DISPLAY_NAME);
    } catch {
      /* nothing more to do */
    }
    return null;
  }
}

export function getWatchIdentity(store: ReadStore | null = tabStore()): WatchIdentity | null {
  if (!store) return null;
  const userId = parseId(store.getItem(SS_USER_ID));
  if (userId === null) return null;
  return { userId, displayName: store.getItem(SS_DISPLAY_NAME) ?? `user ${userId}` };
}

export function isWatchMode(store: ReadStore | null = tabStore()): boolean {
  return getWatchIdentity(store) !== null;
}

export function watchUrl(origin: string, userId: number, displayName: string): string {
  const url = new URL('/', origin);
  url.searchParams.set(WATCH_PARAM, String(userId));
  url.searchParams.set(WATCH_NAME_PARAM, displayName);
  return url.toString();
}

/** Remove shared keys — unless this is a watch tab, where that would be sabotage. */
export function clearPersisted(
  keys: readonly string[],
  storage: Pick<Storage, 'removeItem'> | null = sharedStore(),
  watchStore: ReadStore | null = tabStore(),
): void {
  if (!storage || isWatchMode(watchStore)) return;
  for (const key of keys) storage.removeItem(key);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run services/watchMode.test.ts`
Expected: 20 passed.

- [ ] **Step 5: Commit**

```bash
git add services/watchMode.ts services/watchMode.test.ts
git commit -m "feat(watch): hold a watched bot's identity per tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


> **Revised in review.** The code above is the committed version (3769bf5 + 3d32a8e). Review
> changed four things from the first draft: the URL is authoritative, so a tab loaded without a
> valid `?watch` clears any stored identity instead of staying in watch mode; `watchRequested`
> tells index.tsx that a watch link was intended even when it is invalid, so it can say "watch
> mode unavailable" instead of silently logging in as the instructor; `parseId` requires a safe
> positive integer; and `watchName` is stripped of control and bidi characters, capped at 60
> code points, and capture never throws when storage does.

---

## Task 13: apiClient honours watch mode

**Files:**
- Modify: `services/apiClient.ts` (`getUserIdHeader`, top of `apiRequest`)
- Modify: `services/apiClient.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `services/apiClient.test.ts`:

```ts
describe('watch mode', () => {
  class TabStorage {
    private map = new Map<string, string>();
    getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
    setItem(k: string, v: string) { this.map.set(k, String(v)); }
    removeItem(k: string) { this.map.delete(k); }
  }

  beforeEach(() => {
    const tab = new TabStorage();
    tab.setItem('joke_factory_watch_user_id', '17');
    (globalThis as any).sessionStorage = tab;
    localStorage.setItem('joke_factory_user_id', '5');
  });

  afterEach(() => {
    delete (globalThis as any).sessionStorage;
  });

  it('sends the watched bot as X-User-Id, not the instructor in localStorage', async () => {
    let sent: string | null = null;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent = new Headers(init?.headers).get('X-User-Id');
      return new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    await apiRequest('/v1/rounds/active');
    expect(sent).toBe('17');
  });

  it('refuses to send anything that is not a GET, without touching the network', async () => {
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
    await expect(apiRequest('/v1/marketing/batches/1/publish', { method: 'POST', body: {} }))
      .rejects.toMatchObject({ code: 'WATCH_READ_ONLY' });
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run services/apiClient.test.ts`
Expected: the two watch-mode tests FAIL (header is `5`; POST reaches fetch).

- [ ] **Step 3: Implement**

In `services/apiClient.ts`, add near the top:

```ts
import { getWatchIdentity, isWatchMode } from './watchMode';
```

Replace `getUserIdHeader`:

```ts
function getUserIdHeader(): string | undefined {
  // A watch tab acts as the bot it is watching, from its own per-tab identity.
  // See services/watchMode.ts for why that must never come from localStorage.
  const watching = getWatchIdentity();
  if (watching) return String(watching.userId);
  // Guarded: this module is also imported by Node-side tooling (the smoke
  // script, the test suite), where there is no DOM and no localStorage.
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem('joke_factory_user_id') ?? undefined;
}
```

Make these the first lines of `apiRequest`'s body:

```ts
  // Defence in depth for watch mode. Disabled buttons are the UX guarantee;
  // this is the safety one: a watch tab cannot act for the bot at all.
  const method = (opts.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && isWatchMode()) {
    throw new ApiError({
      status: 0,
      code: 'WATCH_READ_ONLY',
      message: 'This tab is watching a bot and is read-only.',
    });
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run services/apiClient.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/apiClient.ts services/apiClient.test.ts
git commit -m "feat(watch): send the watched bot's id and refuse writes from a watch tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 14: Context, logout and tutorial respect watch mode

**Files:**
- Modify: `context.tsx` (initial-load effect ~line 508; `logout` ~lines 1490-1493 and 1515-1516)
- Modify: `components.tsx` (`TutorialLauncher` ~line 60)
- Modify: `index.tsx` (capture, and the "Watch mode unavailable" notice)

- [ ] **Step 1: Capture the identity before the app renders**

Replace `index.tsx`. Capture runs before the first render, because context and apiClient read the
watch identity on mount. A watch link that fails to capture (an invalid id, or blocked
sessionStorage) must not fall through to `<App />`: that tab would silently restore the
instructor's shared session, with write access, while the person looking at it believes it is a
read-only view of a bot.

```tsx
// index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { captureWatchIdentity, watchRequested } from './services/watchMode';

// Must run before the first render: context and apiClient read the watch identity on mount.
const search = window.location.search;
const watching = captureWatchIdentity(search);
// A watch link that could not be captured must not fall through to the shared
// session: that tab would silently be the instructor, with write access, while
// the person looking at it believes it is a read-only view of a bot.
const watchFailed = watchRequested(search) && !watching;

const WatchUnavailable: React.FC = () => (
  <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
    <div role="alert" className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
      <h1 className="mb-2 text-lg font-semibold text-gray-900">Watch mode unavailable</h1>
      <p>
        This link could not open a read-only view of a bot: either the link is malformed, or this
        browser blocks per-tab storage. Close this tab and use a 👁 button in the Bot Panel again.
      </p>
    </div>
  </main>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {watchFailed ? <WatchUnavailable /> : <App />}
  </React.StrictMode>
);
```

- [ ] **Step 2: Restore the watched identity in context**

In `context.tsx`, add to the imports:

```ts
import { clearPersisted, getWatchIdentity } from './services/watchMode';
```

In the `// Initial load from localStorage (session only)` effect, make these the first lines of its body:

```ts
    // A watch tab takes its identity from this tab only; the shared
    // localStorage belongs to the instructor. See services/watchMode.ts.
    const watching = getWatchIdentity();
    if (watching) {
      setUser(makeUser({ user_id: watching.userId as UserId, display_name: watching.displayName }, 'UNASSIGNED' as Role, null));
      return;
    }
```

- [ ] **Step 3: Guard logout**

In `logout`, replace:

```ts
    localStorage.removeItem(LS_USER_ID);
    localStorage.removeItem(LS_DISPLAY_NAME);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_ROUND_ID);
```

with:

```ts
    // No-op in a watch tab: this runs on a 404 from /session/me, so removing a
    // bot while watching it would otherwise log the instructor out everywhere.
    clearPersisted([LS_USER_ID, LS_DISPLAY_NAME, LS_ROLE, LS_ROUND_ID]);
```

and further down in the same function replace:

```ts
    localStorage.removeItem(LS_SUBMITTED_BATCH_JOKES);
    localStorage.removeItem(LS_QC_RATED_HISTORY);
```

with:

```ts
    clearPersisted([LS_SUBMITTED_BATCH_JOKES, LS_QC_RATED_HISTORY]);
```

Leave the identical two lines in the reset function (~line 2046) alone: that is an instructor action a read-only tab cannot reach.

- [ ] **Step 4: Never auto-open the tutorial in a watch tab**

In `components.tsx`, add:

```ts
import { isWatchMode } from './services/watchMode';
```

In `TutorialLauncher`'s `useState` initialiser, change `if (!tab) return false;` to:

```ts
    // A watch tab is looking at someone else's seat; a tutorial modal would
    // cover the screen being watched and write a seen-flag into shared storage.
    if (!tab || isWatchMode()) return false;
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: 0 errors, all pass.

Run: `grep -nE "localStorage\.removeItem" context.tsx`
Expected: exactly three lines — `LS_ROUND_ID` inside `join` (~1436), which only runs after a successful POST and so is unreachable from a watch tab, and the two in the reset function (~2046-2047), an instructor action. Nothing inside `logout`.

- [ ] **Step 6: Commit**

```bash
git add context.tsx components.tsx index.tsx
git commit -m "feat(watch): keep watch tabs out of the instructor's shared session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: Read-only action cards

Disable only the controls that act, so view-only interactions (expanding a batch card to read its jokes) keep working for the watcher.

**Files:**
- Modify: `views/JokeMaker.tsx` (the "Production Line" `<Card>` ~lines 272-324)
- Modify: `views/QualityControl.tsx` (the "Marketing Desk" `<Card>` ~lines 564-744)

- [ ] **Step 1: Joke Maker**

In `views/JokeMaker.tsx`, add `import { isWatchMode } from '../services/watchMode';`. The file holds several components; use the main `JokeMaker` component — the one whose `return` renders `<RoleLayout>` (~line 247). Inside it, before that `return`, add `const watching = isWatchMode();`.

Wrap the "Production Line" card:

```tsx
          {/* Read-only in watch mode: this tab shows a bot's seat and must not act for it.
              A disabled fieldset disables every control inside natively; `contents`
              keeps it out of the layout. The rest of the view stays interactive. */}
          <fieldset disabled={watching} className="contents">
            <Card title="Production Line" accent={BRAND.production}>
              {/* …existing card body, unchanged… */}
            </Card>
          </fieldset>
```

- [ ] **Step 2: Marketing**

In `views/QualityControl.tsx`, add the same import. In the main `QualityControl` component — the one whose `return` renders `<RoleLayout>` (~line 540) — add `const watching = isWatchMode();` before that `return`, then wrap the `<Card title="Marketing Desk" …>…</Card>` block in the same `<fieldset disabled={watching} className="contents">` with the same comment.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build 2>&1 | tail -2`
Expected: 0 errors, all pass, `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add views/JokeMaker.tsx views/QualityControl.tsx
git commit -m "feat(watch): make the action cards read-only in a watch tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


> **Revised in review (af8f8aa + 66869b5).** A disabled fieldset only disables native controls,
> so review added three guards, all keyed on the same `watching` const, which is declared at the
> top of `QualityControl` because it is not a hook. First, the joke-card `<div>` ignores clicks
> and drags (`draggable={!watching}`, early returns), so a watcher cannot fake a selection the bot
> never made. Second, `batchReady` includes `!watching`, so the Marketing nudge timers never arm
> in a watch tab. Otherwise a full-screen modal would cover the watched screen, `autoPickTop()`
> would fake a pick, and its live Publish button would end in a WATCH_READ_ONLY alert plus a
> false success toast. `release()` also returns early. Third, the undismissable "Meet Your Team"
> modal is suppressed in both views.

---

## Task 16: The watch banner and reasoning strip

**Files:**
- Create: `components/WatchShell.tsx`
- Modify: `App.tsx`
- Modify: `components.tsx` (RoleLayout header: hide Logout, stick below the banner)

- [ ] **Step 1: Write the shell**

```tsx
// components/WatchShell.tsx
/* WatchShell — frames a watch tab: who you are watching, and why the bot did
   what it did.

   The screen underneath is the real Joke Maker or Marketing view, but it can
   only show server state — a batch arriving, cards splitting, a publish landing.
   A bot's CHOICES (why it kept two jokes and dropped three) are not server state
   until publish, so the engine narrates them on a BroadcastChannel and this
   strip shows the entries for the watched bot. */
import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context';
import { getWatchIdentity } from '../services/watchMode';
import { PERSONAS } from '../services/bots/personas';
import { BOT_CHANNEL, type BotMeta, type ChannelMessage, type ReasoningEntry } from '../services/bots/protocol';

const MAX_ENTRIES = 200;

function seatLabel(meta: BotMeta | null, role: unknown): string | null {
  if (meta) return meta.seat === 'A' ? 'Joke Maker' : 'Marketing';
  if (role === 'JOKE_MAKER') return 'Joke Maker';
  if (role === 'QUALITY_CONTROL') return 'Marketing';
  return null;
}

// A stale worker build may send a persona id this bundle does not know.
function personaLabel(meta: BotMeta): string {
  const known = PERSONAS as unknown as Record<string, { label: string } | undefined>;
  return known[meta.persona]?.label ?? meta.persona;
}

export const WatchShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useGame();
  const watching = getWatchIdentity();
  const botUserId = watching?.userId ?? null;
  const [entries, setEntries] = useState<ReasoningEntry[]>([]);
  const [meta, setMeta] = useState<BotMeta | null>(null);

  // Once this tab has shown the bot, losing the user means the bot is gone:
  // /session/me 404s after Remove bots or a class reset, and context logs out.
  // Say so, instead of dropping to a login screen whose join would be refused.
  const hadUser = useRef(false);
  const [botLeft, setBotLeft] = useState(false);
  useEffect(() => {
    if (user) hadUser.current = true;
    else if (hadUser.current) setBotLeft(true);
  }, [user]);

  useEffect(() => {
    if (botUserId == null || typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(BOT_CHANNEL);
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const m = event.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'history' && m.botUserId === botUserId) {
        setEntries(m.entries.slice(-MAX_ENTRIES));
        setMeta(m.meta);
      } else if (m.type === 'log' && m.entry.botUserId === botUserId) {
        setEntries(prev => [...prev, m.entry].slice(-MAX_ENTRIES));
      }
    };
    const ask: ChannelMessage = { type: 'history-request', botUserId };
    channel.postMessage(ask);
    return () => channel.close();
  }, [botUserId]);

  if (!watching) return <>{children}</>;
  const seat = seatLabel(meta, user?.role);

  return (
    <div className="min-h-screen">
      <div role="status" data-testid="watch-banner" className="sticky top-0 z-50 flex h-9 items-center bg-gray-900 px-4 text-sm text-white">
        <span>
          👁 WATCHING <strong>{watching.displayName}</strong>
          {seat ? ` · ${seat}` : ''}
          {user?.team_id != null ? ` · Team ${user.team_id}` : ''}
          {meta ? ` · ${personaLabel(meta)}` : ''}
          {' · read-only'}
        </span>
      </div>
      <div className="lg:pr-80">
        {botLeft ? (
          <div role="alert" data-testid="watch-bot-left" className="mx-auto mt-16 max-w-md rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
            <h1 className="mb-2 text-lg font-semibold text-gray-900">{watching.displayName} has left the game</h1>
            <p>The bot was removed, or the class was reset. Close this tab.</p>
          </div>
        ) : children}
      </div>
      <aside
        aria-label="Bot reasoning"
        className="border-t border-gray-200 bg-white p-4 text-xs lg:fixed lg:bottom-0 lg:right-0 lg:top-9 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0"
      >
        <h2 className="mb-2 font-semibold uppercase tracking-wide text-gray-500">Bot&apos;s reasoning (newest first)</h2>
        {entries.length === 0 ? (
          <p className="italic text-gray-400">
            Nothing yet. Entries appear as the bot acts, while the instructor tab with the Bot Panel stays open.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {[...entries].reverse().map((e, i) => (
              <li key={`${e.at}-${e.botUserId}-${entries.length - 1 - i}`} data-testid="reasoning-entry">
                <time className="mr-2 tabular-nums text-gray-400">{new Date(e.at).toLocaleTimeString()}</time>
                {e.text}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
};
```

- [ ] **Step 2: Wire it into the app**

In `App.tsx`, add:

```tsx
import { WatchShell } from './components/WatchShell';
import { isWatchMode } from './services/watchMode';
```

Replace the `App` component:

```tsx
const App: React.FC = () => {
  const watching = isWatchMode();
  return (
    <GameProvider>
      {watching ? <WatchShell><GameRouter /></WatchShell> : <GameRouter />}
      {!watching && <DevRoleSwitcher />}
    </GameProvider>
  );
};
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npx vite build 2>&1 | tail -2`
Expected: 0 errors, all pass, `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add components/WatchShell.tsx App.tsx
git commit -m "feat(watch): frame watch tabs with a banner and the bot's reasoning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


> **Revised in review (7e7a227 + bedf5e6).** The shell above is the committed version. Review made
> five changes to the first draft. (1) A "has left the game" notice replaces the screen once the
> watched user goes from present to absent, because a 404 from `/session/me` logs the tab out, and
> its login screen would only offer a join that apiClient refuses. (2) The persona label falls
> back to the raw id, so a stale worker cannot blank the tab. (3) The banner is a fixed `h-9`.
> (4) In a watch tab, RoleLayout's sticky header in `components.tsx` uses `top-9` instead of
> `top-0`, so the banner no longer covers it after scrolling, and the header's Logout button is
> hidden, because a watch tab has no session of its own to end. (5) Reasoning renders newest
> first, so the latest decision is visible without scrolling.

---

## Task 17: 👁 buttons in the Bot Panel

**Files:**
- Modify: `components/BotPanel.tsx`

- [ ] **Step 1: Replace `SeatCell` and its call sites**

Add the import:

```tsx
import { watchUrl } from '../services/watchMode';
```

Replace the `SeatCell` component:

```tsx
const SeatCell: React.FC<{ seat: SeatStatus; label: 'Joke Maker' | 'Marketing'; teamIndex: number }> = ({ seat, label, teamIndex }) => (
  <div>
    <div className="flex items-center gap-2">
      <span>{seat.activity}</span>
      {seat.userId != null && (
        <a
          href={watchUrl(window.location.origin, seat.userId, seat.name)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`👁 ${label} for bot team ${String(teamIndex).padStart(2, '0')}`}
          title={`Watch ${seat.name}'s ${label} screen in a new tab`}
          className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-700 hover:bg-gray-200"
        >
          👁
        </a>
      )}
    </div>
    {seat.error && <div className="text-rose-700">{seat.error}</div>}
  </div>
);
```

Update the two table cells:

```tsx
                    <td className="pr-3"><SeatCell seat={t.jm} label="Joke Maker" teamIndex={t.index} /></td>
                    <td className="pr-3"><SeatCell seat={t.marketing} label="Marketing" teamIndex={t.index} /></td>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK`
Expected: `TYPECHECK_OK`.

- [ ] **Step 3: Commit**

```bash
git add components/BotPanel.tsx
git commit -m "feat(watch): open any bot's seat from the Bot Panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 18: Live test — watching a bot never disturbs the instructor

**Files:**
- Modify: `scripts/e2e/browser/bots.spec.ts`

- [ ] **Step 1: Add the watch test**

Add `readSession` to the `./session` import, then append inside the `test.describe` block:

```ts
  test('watching a bot shows its real screen, read-only, without disturbing the instructor', async ({ page, context }) => {
    test.setTimeout(CLASS_BUDGET_MS);
    const s = await resetAndLogin();
    await openPanel(page, s);

    await page.getByLabel('Careful bot teams').fill('0');
    await page.getByLabel('Balanced bot teams').fill('0');
    await page.getByLabel('Spray bot teams').fill('1');
    await page.getByRole('button', { name: '3×' }).click();
    await expect(page.getByText(/Lobby: 0 humans/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Run all-bot class' }).click();

    const watchLink = page.getByRole('link', { name: '👁 Marketing for bot team 01' });
    await expect(watchLink).toBeVisible({ timeout: 60_000 });
    const [watch] = await Promise.all([context.waitForEvent('page'), watchLink.click()]);
    await watch.waitForLoadState();

    // The real Marketing screen, framed and locked.
    // By test id, not role: a transient toast with role=status would trip strict mode.
    await expect(watch.getByTestId('watch-banner')).toContainText('WATCHING');
    await expect(watch.getByTestId('watch-banner')).toContainText('Bot 01B');
    await expect(watch.getByText('Marketing Desk', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(watch.locator('fieldset[disabled]')).toHaveCount(1);
    await expect(watch.getByTitle('Logout')).toHaveCount(0);
    await expect(watch.locator('[draggable="true"]')).toHaveCount(0);

    // The bot's reasoning arrives live over the channel.
    await expect(watch.getByTestId('reasoning-entry').first()).toBeVisible({ timeout: 3 * 60_000 });

    // Shared storage still belongs to the instructor, seen from both tabs.
    expect((await readSession(page)).userId).toBe(String(s.instructorId));
    expect((await readSession(watch)).userId).toBe(String(s.instructorId));

    // Removing the watched bot 404s the watch tab's session. The tab must say so,
    // and its logout must not clear the instructor's identity.
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Remove bots' }).click();
    await expect.poll(async () => {
      const after = participantsOf(await s.instructor.instructorLobby(s.roundId));
      return after.filter(p => isBotName(p.name)).length;
    }, { timeout: 60_000 }).toBe(0);
    await expect(watch.getByTestId('watch-bot-left')).toBeVisible({ timeout: 60_000 });
    expect((await readSession(page)).userId).toBe(String(s.instructorId));

    // And the instructor tab is still the instructor after a reload.
    await page.reload();
    await expect(page.getByText('🤖 Bot players')).toBeVisible({ timeout: 30_000 });
  });
```

- [ ] **Step 2: Rebuild, serve and run both live tests**

```bash
VITE_USE_MOCK_API=false VITE_API_BASE_URL=https://jokefactory-api.whitepebble-2daa4226.westus2.azurecontainerapps.io npx vite build
```

Start `npx vite preview --port 4173 --strictPort` in the background, confirm `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/` prints `200`, then:

```bash
E2E_FE_URL=http://localhost:4173 E2E_ADMIN_PASSWORD="$(cat ~/.jokefactory-admin-password)" npx playwright test scripts/e2e/browser/bots.spec.ts --reporter=line
```

Expected: `2 passed` (37.1s on 2026-09-29). Stop the preview server afterwards.

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e/browser/bots.spec.ts
git commit -m "test(e2e): prove a watch tab is read-only and leaves the instructor signed in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


> **Revised in review.** The test above is the committed version (b99f117). It adds three watch
> assertions to the first draft: the Logout button is absent, no card is draggable, and the tab
> shows `watch-bot-left` after Remove bots, in place of a blind 10-second wait. Remove bots deletes
> the user rows, so `/session/me` 404s. Verified by hand as well: 👁 → Bot 02B's real Marketing
> Desk, "Balanced: keeping 4 of 5 — …" in the strip, 0 enabled buttons inside the disabled
> fieldset, and the instructor's `joke_factory_user_id` untouched throughout.

---

## Task 19: Documentation and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the feature**

In `README.md`, at the end of the `## End-to-end tests` section (just before `## Deployment`, so the paragraphs after the table stay where they are), add the section below. The committed version also has a **Watching a bot** subsection and puts the Stop and Auto-Assign notes under **Caveats**:

````markdown
### Bot players

To test with a full class when you do not have one, open the instructor view with
`?bots=1` — for example `https://<your-site>/?bots=1` — and use the **Bot players** panel.

- **Run all-bot class** fills an empty lobby with bot teams and starts the round. Use it to
  watch a full-size class from your dashboard.
- **Fill with bot teams** adds bot teams after any humans already in the lobby, before the
  round starts. Every team is all-human or all-bot.
- **Personas** play differently: *Careful* publishes 2 of 5 and waits for feedback, *Balanced*
  publishes 3–4, *Spray* publishes everything as fast as it can. They differ in volume and
  pace, not in how well they pick, so the leaderboard shows whether publishing less ever
  beats publishing more.
- **Speed** 1× plays at human pace; 10× compresses a round into about a minute.
- **👁** on any bot opens its real Joke Maker or Marketing screen in a new tab, read-only,
  with the bot's reasoning alongside.

Every published bot joke is an Azure LLM classification call, and the panel counts them.
Closing the instructor tab stops the bots. **Remove bots** deletes bot users and never
touches humans.

If you press **Stop** at the instant an all-bot class is starting, the round can already be
active with bots seated but idle. Bots can only be added to a round that has not started, so
press **Remove bots**, then end or reset the round before running another class.

Avoid pressing the ordinary **Auto-Assign** while bots are playing. It shuffles bots and
humans together; the bots notice and pause until you press **Re-form teams**, and none will
ever decide a human team's jokes. A Marketing bot moved onto a human team can still pick up
one of that team's batches before it notices. The panel warns you when that happens: the
batch is hidden from the team for up to 15 minutes (the team keeps receiving its other
batches), and **Remove bots** releases it at once.

```bash
E2E_ADMIN_PASSWORD='…' npx playwright test scripts/e2e/browser/bots.spec.ts
```

The live test above resets the game first. Run it only against a backend nobody is using.
````

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit -p tsconfig.json && echo TYPECHECK_OK`
Expected: `TYPECHECK_OK`.

Run: `npx vitest run`
Expected: all pass — 455 tests on 2026-09-29, up from 299.

Run: `npx vite build 2>&1 | tail -4`
Expected: `✓ built`, with a separate worker chunk.

Run: `npx tsx scripts/e2e/preflight.ts; echo "exit=$?"`
Expected: `all 8 checks passed` and `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: explain bot players and watch mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off**

Report to the user: what shipped, the spike result, both live test results, and the open decision — deploying means pushing to `main`, which triggers the Azure Static Web Apps workflow. Do not push or merge without the user's go-ahead; use superpowers:finishing-a-development-branch.

---

## After the plan: final-review fixes (2026-09-30)

The whole-branch review of Phase 2 found one issue the per-task reviews could not see, because
it only appears when the pieces are combined.

**A watch tab could claim batches as the bot.** `GET /v1/marketing/queue/next` locks the team's
next batch to its caller. The ordinary Marketing poll in `context.tsx` calls it on every tick, and
in a watch tab the caller is the bot. After an ordinary Auto-Assign, the engine deliberately
stops claiming for a bot moved onto a human team, but an open 👁 tab would have kept locking that
team's batches, with no held-batch warning, for as long as the tab stayed open.

Fixed in df82ac6 and 6eb6e4a, and proven live in 07d3f82:
- `services/watchMode.ts` gains `setWatchedSeat` and `mayClaimMarketingBatch(teamId)`. In a normal
  tab the check is always true. In a watch tab it is true only when all of these hold:
  - the bot's own engine reports seat B;
  - on the same team that `/session/me` reports;
  - with `BotMeta.claiming` set, meaning the engine is running, not scrambled or forming teams,
    and this Marketing loop is live;
  - and the report is younger than 15 s.

  It fails closed: with no report, or a stale one, the desk just shows no batch.
- `WatchShell` re-requests the bot's history every 5 s, which keeps the seat fresh after
  Re-form and fills it in when the instructor tab opens later.
- The live watch test now also asserts that the locked desk shows the batch the bot holds, which
  proves the gate lets the legitimate case through. It passed 3 of 3 runs.

Minor items fixed in 9a37e91:
- The Bot Panel never renders in a watch tab.
- The tutorial "?" button is hidden in a watch tab.
- A watch tab skips restoring the shared per-user caches.
- Stale comments about identity storage are corrected.
- A new test shows the WATCH_READ_ONLY refusal also holds when the mock API is forced on.

Left as known, low-risk gaps:
- A Stop or pause reaches an open watch tab only on the next 5 s refresh.
- `SeatRuntime.live` has no dedicated test; the engine review traced it by hand.
