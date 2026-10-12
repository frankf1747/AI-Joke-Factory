# Guided Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the students' pop-up tutorial with a one-minute guided walkthrough of their real Joke Maker or Marketing screen — dimmed page, one spotlighted area at a time with a caption, sample jokes and numbers that change as it plays — that never touches the real game, plays once on its own, and can be skipped and replayed.

**Architecture:** A full-screen, `inert` stage renders the student's real view (`views/JokeMaker.tsx` / `views/QualityControl.tsx` inside `RoleLayout`) under its own `GameContext.Provider` whose value is a scripted demo game with every action a no-op, plus a `DemoModeContext` that switches off polls, the nudge clock and the header launcher and hands the views the script's textbox, picks, note, "More numbers" state and clock. A pure step machine and a pure demo script rebuild the screen state for any (step, elapsed time), so Back and replays are deterministic; a small in-house spotlight (box-shadow cut-out + caption placement) highlights `[data-tour=id]` elements, and `TutorialLauncher` decides auto-play / mid-round prompt / "?" replay, keeping the old modal for the instructor only.

**Tech Stack:** React 19 + TypeScript 5.8 (no `@types/react` in this repo: React is untyped, so JSX props are not type-checked — the tests are the safety net) + Vite 6 + vitest 2 (environment `node`, no DOM: components are tested with `react-dom/server` `renderToStaticMarkup`; `views/testing/renderWithGame.ts` provides `TEST_CONFIG`, `testUser`, `fakeGame`), lucide-react 0.562, Tailwind via the Play CDN.

**Spec:** `~/Documents/GitHub/AI-Joke-Factory/docs/superpowers/specs/2026-10-11-guided-walkthrough-design.md` (refreshed 2026-10-11 for the Lean fees, the Next step line, the tuned defaults and the four key tiles; read it first — this plan argues from it, and its "[default — review]" items are implemented as written).

**Starting point:** branch `feat/lean-market` at `4540404` ("four key stat tiles per student screen") or later. Every anchor below is verbatim text at that commit, and each occurs exactly once in its file at the moment its step runs. This plan was verified by applying every step literally, in order, to a clean copy of `4540404` and running every Run line (see "Verification record" at the end).

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Repo and branch:** frontend only, `~/Documents/GitHub/AI-Joke-Factory`, branch `feat/lean-market`. No backend change. The branch is Lean-only: there is no Classic or WIP branch anywhere in the tour.
- **Git:** new commits only; never `git reset`, `git commit --amend`, `git rebase`, `git stash` or `git push`. Stage files by name (never `git add -A` / `git add .`): `.claude/launch.json` (modified) and `.progress` (untracked) must stay exactly as they are. Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never print secrets; never `cat` `.env.local` or `jokefactory_be/.env`.
- **No new dependency:** nothing added to `package.json`; the spotlight is in-house.
- **Seen flag:** `jf_tour_seen_v1:<ROLE>` in localStorage (`<ROLE>` is `JOKE_MAKER` or `QUALITY_CONTROL`), written when the tour ends (finished or skipped) or the mid-round prompt's × is pressed — never on mount, never after a stage error. The instructor's modal keeps `jf_tutorial_seen_v1:INSTRUCTOR`.
- **Auto-play rule:** the tour plays on its own only when the role is Joke Maker or Marketing, the tab is not in watch mode, the flag is unset (and readable), and the round is not ACTIVE. Flag unset + round ACTIVE → the prompt "New here? Watch the 1-minute tour" instead. The decision waits until the student's round is known (`roundId != null`).
- **Watch mode:** never auto-plays, never prompts, no "?" button (no replay).
- **Pace:** each step auto-advances after its `durationMs`, default **6000 ms** (a few steps 5000 or 7000); the last step waits for "Start". Controls: Back, Pause/Play, Next, **Skip tour**; progress bar and "Step n of N".
- **Keyboard:** Esc skips, ← back, → next, Space pauses/plays (Space on a focused button presses that button).
- **Round goes ACTIVE mid-tour:** the Skip button reads **"Round started — go to the game"**, styled as primary; the steps do not change.
- **Caption copy:** verbatim from spec §4 (the tests in Task 3 hold the full text). Every amount comes from the round's `config` through the game's own formatters in `services/leanMode.ts`: `fmtFee` for prices and fees (`$1` sale, `$0.10` listing, `$0.01` discard, `$1 / $2 / $3` shipping at the defaults), `fmtCents` / `fmtPerMinute` for per-minute rates (`5¢`, `5¢ a joke each minute`). Round 1 and Round 2 differ only in the Joke Maker's shipping step.
- **"More numbers":** a step that needs a tile under "More numbers" opens it through the demo state (`DemoUi.moreOpen` → `StatTiles open`), never by reading or writing the student's `jf_more_tiles_<role>` preference.
- **Next step line:** inside the demo it runs the real rules (`services/nextStep.ts`) on the demo state, with the demo's clock (`DemoUi.clockMs`) in place of `Date.now()`.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, typed text appears whole, the spotlight and caption do not animate, scrolling is instant, and steps still auto-advance.
- **Demo mode makes zero network requests** and writes nothing to localStorage; every demo action is a no-op; the live app keeps running underneath unchanged.
- **Instructor:** keeps the existing "How this works" modal (instructor content only). The modal's Joke Maker, Marketing and AI Customers tabs are removed.
- **Sample data:** team "Team Demo"; five placeholder jokes (original, clean, one line each); one earlier batch on the market with 2 of 5 sold; Profit, Jokes Sold / Made and the three fees follow the game's formulas at the round's prices and fees.

## Review Focus

The five input classes and failure modes most likely to bite a real student that the spec implies but does not spell out, each pinned by a test in the task that owns the code:

1. **The demo leaking into the live game** — a request, a poll, a `joke_factory_*`, `jf_more_tiles_*` or seen-flag localStorage write, a nudge dialog, a nested tour, a click or keypress falling through to the live page. Pinned: Task 1 `demoMode.test.ts` (no-op actions, no request on render, the import-graph audit of direct network calls); Task 4 `DemoStage.test.ts` "never makes a request or writes localStorage, in any frame", "ignores the student's own "More numbers" choice and never writes it" and "is inert"; Task 6 `launcher.test.ts` "writes no seen-flag on mount, however many times it mounts (StrictMode)".
2. **The wall clock leaking into the demo** — the Next step line computes "waited" from `Date.now()`; against the demo's fixed timestamps it would read "Batch waiting 1234567 s". It must follow the script's clock. Pinned: Task 3 `demoScript.test.ts` "the Next step line runs the real rules on the demo state"; Task 4 "the Next step line reads the demo, not the wall clock".
3. **A target that is off screen, inside a scroll container, collapsed or behind "More numbers"** (Marketing's note box and Release button sit far below the fold; the feedback list and Value stream scroll on their own; the fee tiles exist only when "More numbers" is open). The target must be scrolled into view — even when a smooth scroll never runs, as in a background tab — and a zero-size or missing target must become a centred card, never an empty hole. Pinned: Task 5 `spotlightGeometry.test.ts` (`visibleBox`, `needsScroll`, `placeCaption` centring a scrolled-away hole, `findTourTarget` null for zero size); Task 4 `DemoStage.test.ts` (every target exists, start and end of its step, both rounds).
4. **The round's state changing or not yet known** — the round goes ACTIVE mid-tour; a student refreshes mid-round, when the first poll has set their role but not yet `config.isActive`; Round 2 instead of Round 1. Skip must turn into "Round started — go to the game" without reshuffling steps, a mid-round arrival must get the prompt, not the tour, and Round 2 must get the three-size shipping copy. Pinned: Task 5 `tourControls.test.ts` and `GuidedTour.test.ts` "is the same tour whether the round is ACTIVE or not"; Task 6 `launcher.test.ts` "waits for the round's state before deciding"; Task 3 `tourSteps.test.ts` "Joke Maker, Round 2".
5. **The window resized mid-step, down to phone width** (a projector, a phone, a split screen). The caption must stay inside a 16 px gutter above the control bar. Pinned: Task 5 `placeCaption` "stays inside the screen when the window is resized mid-step, down to phone width" and the phone-width "over" case.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `context.tsx` | Modify | Add `DemoModeContext`, `useDemoMode()`, `useDemoUi()` (`GameContext` and `GameContextType` are already exported); `GameProvider` never polls in demo mode. |
| `services/tour/demoUi.ts` | Create | `DemoUi` (the views' local state the script drives, plus `moreOpen` and `clockMs`) and `EMPTY_DEMO_UI`. |
| `services/tour/demoGame.ts` | Create | `DemoGameData`, `DEMO_ACTIONS` (every action a no-op), `demoGameContext()`. |
| `services/tour/tourMachine.ts` | Create | `TourStep<S, C>` type, `TOUR_STEP_MS`, pure `tourReducer` (`next`, `back`, `pause`, `resume`, `togglePause`, `tick`, `skip`, `finish`), `tourProgress`. |
| `services/tour/seen.ts` | Create | `TOUR_SEEN_PREFIX`, `readTourSeen`, `markTourSeen`, `recordTourEnd`, `launchMode`, `shouldAutoPlay`, `isTourRole`. |
| `services/tour/demoScript.ts` | Create | Team Demo, the jokes, the timeline, `TourMoney` / `TourRound` / `DemoOptions`, `initialDemoState`, `demoFees` + `settle` (summary from the game's formulas), the script actions, `buildDemoState`, `demoFrame`, `demoFrameKey`, typing helpers, `demoOptionsFor`. |
| `services/tour/tourSteps.ts` | Create | `JOKE_MAKER_STEPS`, `MARKETING_STEPS` (spec §4 copy), `stepsFor(role, { roundNumber, fees })`, `captionText`. |
| `components/ui.tsx` | Modify | `Card` takes an optional `tour` prop (`data-tour`). |
| `components/StatTiles.tsx` | Modify | Controlled `open` (the demo), `tourKey` / `tourMore` data-tour ids. |
| `views/JokeMaker.tsx`, `views/QualityControl.tsx` | Modify | `data-tour` ids; read `useDemoUi()` in place of local state inside the stage; the Next step line takes the demo clock; Marketing's nudge clock off in demo mode; pass themselves to `RoleLayout` as `tourView`. |
| `components/CustomerFeedbackCard.tsx` | Modify | `data-tour` on the card and the Expand button. |
| `components/tour/DemoStage.tsx` | Create | The inert full-screen stage rendering the role view under the demo contexts. |
| `components/tour/spotlightGeometry.ts` | Create | Pure: `spotlightBox`, `visibleBox`, `needsScroll`, `placeCaption`, `captionWidth`, `findTourTarget`. |
| `components/tour/tourControls.ts` | Create | Pure: control-bar labels (`tourControls`) and `keyAction`. |
| `components/tour/Spotlight.tsx` | Create | Cut-out highlight, caption placement, scroll/resize tracking. |
| `components/tour/GuidedTour.tsx` | Create | Stage + spotlight + control bar + clock + keyboard + error boundary, portalled to `<body>`; `tourPlan`. |
| `components.tsx` | Modify | `RoleLayout` hides the launcher in demo mode and takes `tourView`; `TutorialLauncher`: tour for students (auto-play, prompt, "?" replay), old modal for the instructor. |
| `components/Tutorial.tsx` | Modify | Instructor-only "How this works" (student and AI Customers tabs removed). |
| `components/DevRoleSwitcher.tsx` | Modify | Dev "Reset" also clears the tour flags. |
| `scripts/e2e/browser/session.ts` | Modify | `TOUR_SEEN_PREFIX`; `suppressTutorials` also seeds the tour flags so the browser e2e suite is not blocked. |
| `components/tour/demoMode.test.ts`, `services/tour/tourMachine.test.ts`, `services/tour/seen.test.ts`, `services/tour/demoScript.test.ts`, `services/tour/tourSteps.test.ts`, `components/tour/DemoStage.test.ts`, `components/tour/spotlightGeometry.test.ts`, `components/tour/tourControls.test.ts`, `components/tour/GuidedTour.test.ts`, `components/tour/launcher.test.ts`, `components/Tutorial.test.ts` | Create | Tests, one set per task. |

**Network audit (spec §3.1).** Nothing reachable from the two student views calls the network directly: every request they can cause goes through a `useGame()` action (`submitRawBatch`, `splitBatch`, `unsplitBatch`, `publishBatch`, `logout`), which the demo game replaces with no-ops, and `GameProvider`'s poll, which is never rendered inside the stage. The Customer feedback card's Expand opens a Picture-in-Picture window only on a click, and the stage is inert. What does need a demo-mode gate is not a request but a side effect: Marketing's decision-nudge timer (it would open a dialog over the demo at ~60 s), the header's `TutorialLauncher` (it would start a tour inside the tour and write seen-flags), the "More numbers" preference (read from and written to `jf_more_tiles_<role>`) and the Next step line's wall clock. Task 1 gates the first two and pins the audit with a test that fails if a direct call is ever added; Task 4 routes the last two through the demo state. (The UCLA logo `<img>` in the header is the same URL the live header already loaded; it is not an API request.)

**Baseline:** at `4540404`, `npx tsc --noEmit -p tsconfig.json` exits 0 and `npx vitest run` passes **746 tests in 48 files**. The totals below assume that baseline; if later commits add tests, add the same number to each total. Before Task 1, check the anchors are there:

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -c "moreTilesKey('joke_maker')\|data-tour" views/JokeMaker.tsx && grep -c "moreTilesKey('quality_control')\|<NextStepLive" views/QualityControl.tsx && grep -c "onClick={onPopOut}" components/CustomerFeedbackCard.tsx`
Expected: `1`, `2`, `1`. If not, the key-tiles commit is not in (or the tour is already partly in): stop.

---
## Task 1: Demo mode — a no-op demo game, the demo-mode context, and no way out to the network

**Files:**
- Create: `services/tour/demoUi.ts`, `services/tour/demoGame.ts`
- Modify: `context.tsx` (import, demo-mode exports after `useGame`, `GameProvider` poll guard), `views/QualityControl.tsx` (import, `demoMode`, nudge clock), `components.tsx` (import, `RoleLayout` hides the launcher in demo mode)
- Test: `components/tour/demoMode.test.ts`

**Interfaces:**
- Consumes: `GameContext`, `GameContextType` (`context.tsx`, already exported at HEAD); `TEST_CONFIG`, `testUser` (`views/testing/renderWithGame.ts`).
- Produces:
  ```ts
  // services/tour/demoUi.ts
  export interface DemoUi {
    jmDraft: string; jmCertified: boolean; jmOpenBatchIds: string[];
    mkSelectedIds: number[]; mkTopics: Record<number, string>; mkTitles: Record<number, string>; mkNote: string;
    moreOpen: boolean; clockMs: number;
  }
  export const EMPTY_DEMO_UI: DemoUi;
  // services/tour/demoGame.ts
  export type DemoGameData = Omit<GameContextType, DemoActionKey>; // the 19 actions removed
  export const DEMO_ACTIONS: Pick<GameContextType, DemoActionKey>;
  export function demoGameContext(data: DemoGameData): GameContextType;
  // context.tsx
  export const DemoModeContext: React.Context<DemoUi | null>;
  export const useDemoMode: () => boolean;
  export const useDemoUi: () => DemoUi | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `components/tour/demoMode.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { DemoModeContext, GameContext } from '../../context';
import { RoleLayout } from '../../components';
import JokeMaker from '../../views/JokeMaker';
import QualityControl from '../../views/QualityControl';
import { DEMO_ACTIONS, demoGameContext, type DemoGameData } from '../../services/tour/demoGame';
import { EMPTY_DEMO_UI } from '../../services/tour/demoUi';
import { TEST_CONFIG, testUser } from '../../views/testing/renderWithGame';
import { Role } from '../../types';

/* Demo mode must never reach the network (spec §6). Three locks, one per way a
   request could leave the guided tour's stage:
     1. every action in the demo game is a no-op;
     2. rendering the student views in demo mode makes no request;
     3. nothing reachable from the student views calls the network directly —
        every request they can cause goes through a context action, which (1)
        has replaced. A new direct call in a view fails this test until it is
        routed through the context or checks useDemoMode(). */

const ROOT = resolve(__dirname, '../..');

class SpyStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes.push(`set ${k}`); this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes.push(`remove ${k}`); this.map.delete(k); }
  clear() { this.writes.push('clear'); this.map.clear(); }
}

function data(role: Role): DemoGameData {
  const user = testUser(role, 99);
  return {
    user, roster: [user], config: TEST_CONFIG, teamNames: { '99': 'Team Demo' },
    batches: [], sales: {}, roundId: 1, roundIds: { 1: 1, 2: null }, roundStatuses: { 1: 'ACTIVE', 2: null },
    marketItems: [], teamSummary: null, teamFeedback: null, instructorLobby: null, instructorStats: null,
    instructorStatsRound1: null, instructorStatsRound2: null,
    qcQueue: {
      batch: { batch_id: 7, round_id: 1, team_id: 99, submitted_at: '2026-10-11T10:00:00Z', raw_text: '1) One.\n2) Two.' },
      jokes: [{ joke_id: 71, joke_text: 'One.' }, { joke_id: 72, joke_text: 'Two.' }],
      queue_size: 1,
    },
  };
}

const inDemo = (role: Role, view: ReactElement) =>
  createElement(DemoModeContext.Provider, { value: EMPTY_DEMO_UI },
    createElement(GameContext.Provider, { value: demoGameContext(data(role)) }, view));

const realFetch = globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;
let storage: SpyStorage;

beforeEach(() => {
  fetchSpy = vi.fn(async () => { throw new Error('network call from the demo'); });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  storage = new SpyStorage();
  (globalThis as any).localStorage = storage;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
});

describe('the demo game', () => {
  it('turns every action into a no-op: no request, no storage write, nothing reported as done', async () => {
    const results = await Promise.all([
      DEMO_ACTIONS.login('a', Role.JOKE_MAKER),
      DEMO_ACTIONS.instructorLogin('a', 'b'),
      DEMO_ACTIONS.updateConfig({ marketPrice: 2 }),
      DEMO_ACTIONS.setGameActive(true),
      DEMO_ACTIONS.endRound(),
      DEMO_ACTIONS.toggleTeamPopup(true),
      DEMO_ACTIONS.resetGame(),
      DEMO_ACTIONS.formTeams(),
      DEMO_ACTIONS.updateUser('1', { role: Role.JOKE_MAKER }),
      DEMO_ACTIONS.deleteUser('1'),
      DEMO_ACTIONS.addBatch(['a joke']),
      DEMO_ACTIONS.submitRawBatch('1) a joke that is long enough'),
      DEMO_ACTIONS.splitBatch('7', ['One.', 'Two.']),
      DEMO_ACTIONS.unsplitBatch('7'),
      DEMO_ACTIONS.publishBatch('7', [71], { '71': 'T' }, 'a note'),
    ]);
    DEMO_ACTIONS.logout();
    DEMO_ACTIONS.setRound(2);
    DEMO_ACTIONS.resetToLobby();
    DEMO_ACTIONS.updateTeamName('99', 'x');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([]);
    // The calls that report success report failure, so no view shows a "sent" toast.
    expect(results.filter(r => r === true)).toEqual([]);
    expect(results[2]).toEqual({ saved: false, feeRounds: [] });
  });

  it('keeps the data it was given and adds every action', () => {
    const ctx = demoGameContext(data(Role.JOKE_MAKER));
    expect(ctx.teamNames).toEqual({ '99': 'Team Demo' });
    expect(Object.keys(DEMO_ACTIONS)).toHaveLength(19);
    for (const key of Object.keys(DEMO_ACTIONS)) expect(typeof (ctx as any)[key]).toBe('function');
  });
});

describe('the student views in demo mode', () => {
  it('render without a request or a storage write', () => {
    const jm = renderToStaticMarkup(inDemo(Role.JOKE_MAKER, createElement(JokeMaker)));
    const mk = renderToStaticMarkup(inDemo(Role.QUALITY_CONTROL, createElement(QualityControl)));
    expect(jm).toContain('Production Line');
    expect(mk).toContain('Marketing Desk');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([]);
  });

  it('have no tutorial launcher in the header', () => {
    const header = (demo: boolean) => {
      const layout = createElement(GameContext.Provider, { value: demoGameContext(data(Role.INSTRUCTOR)) },
        createElement(RoleLayout, null, 'body'));
      return renderToStaticMarkup(demo ? createElement(DemoModeContext.Provider, { value: EMPTY_DEMO_UI }, layout) : layout);
    };
    expect(header(false)).toContain('title="How this works"');
    expect(header(true)).not.toContain('title="How this works"');
  });
});

/* ---------- 3. Nothing reachable from the student views calls the network ---------- */

/** The modules that talk to the backend. A view may import a constant from one
 *  (QualityControl reads MARKETING_NOTE_MAX from marketingService), so they are
 *  leaves of the walk, not failures; what fails is a CALL into them. */
const NETWORK_MODULES = new Set([
  'services/apiClient.ts', 'services/shared/client.ts', 'services/mockApi.ts',
  'services/jmService.ts', 'services/marketingService.ts', 'services/customerService.ts',
  'services/sessionService.ts', 'services/instructorService.ts', 'services/useLeanCharts.ts',
  'services/api/index.ts', 'services/api/team.ts', 'services/api/marketing.ts',
  'services/api/session.ts', 'services/api/instructor.ts',
]);
/** context.tsx makes its requests inside GameProvider (never rendered in the
 *  stage: it has its own demo provider) and inside its actions (replaced by
 *  DEMO_ACTIONS). It is the one module the views may reach that is allowed to. */
const ALLOWED_TO_CALL = new Set(['context.tsx']);
const DIRECT_CALLS: RegExp[] = [
  /\bfetch\s*\(/,
  /\bapiRequest\s*[<(]/,
  /\b(jmService|marketingService|customerService|sessionService|instructorService|teamApi|marketingApi|sessionApi|instructorApi)\s*\.\s*\w+\s*\(/,
  /\bnew\s+(WebSocket|EventSource|XMLHttpRequest)\b/,
  /\bsendBeacon\s*\(/,
  /\buseLeanCharts\s*\(/,
];

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // a package
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(cand) && /\.tsx?$/.test(cand)) return cand;
  }
  return null;
}

function reachable(roots: string[]): string[] {
  const seen = new Set<string>();
  const queue = roots.map(r => resolve(ROOT, r));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = relative(ROOT, file);
    if (NETWORK_MODULES.has(rel) || ALLOWED_TO_CALL.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, m[1] ?? m[2]);
      if (next) queue.push(next);
    }
  }
  return [...seen].map(f => relative(ROOT, f));
}

const STUDENT_VIEW_ROOTS = ['views/JokeMaker.tsx', 'views/QualityControl.tsx'];

describe('direct network calls reachable from the student views', () => {
  it('there are none outside context.tsx', () => {
    const files = reachable(STUDENT_VIEW_ROOTS);
    expect(files).toContain('components.tsx');
    expect(files).toContain('components/CustomerFeedbackCard.tsx');
    expect(files).toContain('components/NextStep.tsx');
    expect(files).toContain('components/StatTiles.tsx');
    const offenders: string[] = [];
    for (const rel of files) {
      if (NETWORK_MODULES.has(rel) || ALLOWED_TO_CALL.has(rel)) continue;
      const src = readFileSync(resolve(ROOT, rel), 'utf8');
      for (const re of DIRECT_CALLS) if (re.test(src)) offenders.push(`${rel}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/demoMode.test.ts 2>&1 | grep -E 'FAIL|Error' | head -3`
Expected: `FAIL  components/tour/demoMode.test.ts` — the file does not load (`Failed to load url ../../services/tour/demoGame`).

- [ ] **Step 3: Add the demo UI state and the no-op demo game**

Create `services/tour/demoUi.ts`:

```ts
/* The guided tour's scripted screen state (components/tour/DemoStage.tsx).

   Most of what the tour shows is game data, which reaches the student views
   through a demo GameContext (services/tour/demoGame.ts). A few things on those
   screens are the views' own local state instead: the Joke Maker's textbox, its
   certify box and which Value stream batches are open; Marketing's picks,
   Topics, titles and note; whether "More numbers" is open; and the clock the
   Next step line reads. Inside the demo stage the views read these from a
   DemoUi (context.tsx useDemoUi) in place of their own state, so the script can
   "type" jokes and tick boxes without touching the real game or the student's
   remembered preferences. Outside the stage there is no DemoUi and the views
   behave exactly as before. */
export interface DemoUi {
  /** Joke Maker: the production textbox. */
  jmDraft: string;
  /** Joke Maker: "I certify these jokes are not offensive." */
  jmCertified: boolean;
  /** Joke Maker: Value stream batches shown expanded, by Batch.id. */
  jmOpenBatchIds: string[];
  /** Marketing: joke ids marked "Selected to submit". */
  mkSelectedIds: number[];
  /** Marketing: Topic per joke id. */
  mkTopics: Record<number, string>;
  /** Marketing: market title per joke id. */
  mkTitles: Record<number, string>;
  /** Marketing: the "Note to your Joke Maker" box. */
  mkNote: string;
  /** Both: the "More numbers" panel under the key tiles is open. Never read
      from or written to the student's own remembered choice. */
  moreOpen: boolean;
  /** Both: the demo's "now" (ms epoch) for the Next step line, so its sentence
      follows the script's timeline instead of the wall clock. */
  clockMs: number;
}

export const EMPTY_DEMO_UI: DemoUi = {
  jmDraft: '',
  jmCertified: false,
  jmOpenBatchIds: [],
  mkSelectedIds: [],
  mkTopics: {},
  mkTitles: {},
  mkNote: '',
  moreOpen: false,
  clockMs: 0,
};
```

Create `services/tour/demoGame.ts`:

```ts
/* The demo game the guided tour's stage puts in GameContext.

   It is the real GameContextType with every action replaced by a no-op, so the
   student views run unchanged against sample data and nothing they could call
   reaches the backend or the live game: no submit, split, publish, login,
   logout or config write. The data half (DemoGameData) comes from the tour's
   script (services/tour/demoScript.ts). Adding an action to GameContextType
   without listing it here is a type error, so a new action can never slip
   through to the network. */
import type { GameContextType } from '../../context';

type DemoActionKey =
  | 'login' | 'instructorLogin' | 'logout'
  | 'updateConfig' | 'setRound' | 'setGameActive' | 'endRound' | 'toggleTeamPopup' | 'resetGame'
  | 'formTeams' | 'resetToLobby'
  | 'updateTeamName' | 'updateUser' | 'deleteUser'
  | 'addBatch' | 'submitRawBatch' | 'splitBatch' | 'unsplitBatch' | 'publishBatch';

/** Everything in the game context except the actions. */
export type DemoGameData = Omit<GameContextType, DemoActionKey>;

const done = async (): Promise<void> => undefined;
const refused = async (): Promise<boolean> => false;

/** Every action, as a no-op. The ones that report success report failure. */
export const DEMO_ACTIONS: Pick<GameContextType, DemoActionKey> = {
  login: done,
  instructorLogin: done,
  logout: () => undefined,
  updateConfig: async () => ({ saved: false, feeRounds: [] }),
  setRound: () => undefined,
  setGameActive: done,
  endRound: done,
  toggleTeamPopup: done,
  resetGame: refused,
  formTeams: done,
  resetToLobby: () => undefined,
  updateTeamName: () => undefined,
  updateUser: done,
  deleteUser: done,
  addBatch: done,
  submitRawBatch: refused,
  splitBatch: done,
  unsplitBatch: done,
  publishBatch: refused,
};

export function demoGameContext(data: DemoGameData): GameContextType {
  return { ...data, ...DEMO_ACTIONS };
}
```

- [ ] **Step 4: Add demo mode to the game context**

In `context.tsx`, replace:

```tsx
import { isCompleteProfile } from './components/IdealProfilePicker';

```

with:

```tsx
import { isCompleteProfile } from './components/IdealProfilePicker';
import type { DemoUi } from './services/tour/demoUi';

```

In `context.tsx`, replace:

```tsx
export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

```

with:

```tsx
export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

/**
 * Demo mode: on inside the guided tour's stage (components/tour/DemoStage.tsx),
 * off everywhere else. The stage renders the real student views under its own
 * GameContext.Provider (a scripted demo game, services/tour/demoGame.ts). The
 * value here is the scripted screen state the views read in place of their own
 * local state (services/tour/demoUi.ts); null means "not a demo". Anything that
 * could reach the network, write localStorage or start a timer that opens a
 * dialog checks useDemoMode() first.
 */
export const DemoModeContext = createContext<DemoUi | null>(null);
export const useDemoMode = (): boolean => useContext(DemoModeContext) !== null;
export const useDemoUi = (): DemoUi | null => useContext(DemoModeContext);

```

In `context.tsx`, replace:

```tsx
export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
```

with:

```tsx
export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /* A provider inside the guided tour's demo stage never polls. The stage uses
     its own demo context, not this provider; this is the backstop. */
  const demoMode = useDemoMode();
  const [user, setUser] = useState<User | null>(null);
```

In `context.tsx`, replace:

```tsx
    // Start polling only when a user is present (after login/join).
    if (!user) {
```

with:

```tsx
    // Start polling only when a user is present (after login/join), and never
    // in demo mode.
    if (!user || demoMode) {
```

- [ ] **Step 5: Gate the two side effects inside the stage — Marketing's nudge clock and the header launcher**

In `views/QualityControl.tsx`, replace:

```tsx
import { useGame } from '../context';
```

with:

```tsx
import { useDemoMode, useGame } from '../context';
```

In `views/QualityControl.tsx`, replace:

```tsx
  /* A watch tab shows a bot's seat read-only: no nudges, no modals, no writes. */
  const watching = isWatchMode();

```

with:

```tsx
  /* A watch tab shows a bot's seat read-only: no nudges, no modals, no writes. */
  const watching = isWatchMode();
  /* Inside the guided tour's demo stage (context.tsx useDemoMode) the decision
     clock never arms either: a nudge dialog must not open over the demo. */
  const demoMode = useDemoMode();

```

In `views/QualityControl.tsx`, replace:

```tsx
  const batchReady = !watching && !needsSplit && orderIds.length > 0;
```

with:

```tsx
  const batchReady = !watching && !demoMode && !needsSplit && orderIds.length > 0;
```

In `components.tsx`, replace:

```tsx
import { useGame } from './context';
```

with:

```tsx
import { useDemoMode, useGame } from './context';
```

In `components.tsx`, replace:

```tsx
export const RoleLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, config, teamNames } = useGame();

```

with:

```tsx
export const RoleLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, config, teamNames } = useGame();
  /* Inside the guided tour's demo stage the header has no tutorial launcher: it
     would start a tour inside the tour and write seen-flags to localStorage. */
  const demoMode = useDemoMode();

```

In `components.tsx`, replace:

```tsx
             <TutorialLauncher role={user.role} />
```

with:

```tsx
             {!demoMode && <TutorialLauncher role={user.role} />}
```

- [ ] **Step 6: Run the test to verify it passes, then the whole suite**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/demoMode.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  1 passed (1)`, `Tests  5 passed (5)`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc prints nothing and exits 0; `Test Files  49 passed (49)`, `Tests  751 passed (751)`.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add services/tour/demoUi.ts services/tour/demoGame.ts context.tsx views/QualityControl.tsx components.tsx \
  components/tour/demoMode.test.ts
git commit -m "feat(tour): demo mode — a no-op demo game, the demo-mode context, nothing reaches the network

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Task 2: The step machine and the seen flag

**Files:**
- Create: `services/tour/tourMachine.ts`, `services/tour/seen.ts`
- Test: `services/tour/tourMachine.test.ts`, `services/tour/seen.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  // services/tour/tourMachine.ts
  export const TOUR_STEP_MS = 6000;
  export type TypingField = 'jmDraft' | 'mkNote' | 'mkTitle';
  export interface TourStep<S = unknown, C = unknown> {
    id: string; target: string | null; title: string; body: string | ((c: C) => string);
    durationMs?: number; onEnter?: (s: S) => S;
    beats?: ReadonlyArray<{ atMs: number; apply: (s: S) => S }>; typing?: TypingField; finishLabel?: string;
  }
  export type TourEnd = 'finished' | 'skipped';
  export interface TourState { index: number; elapsedMs: number; paused: boolean; ended: TourEnd | null }
  export type TourAction = { type: 'next' } | { type: 'back' } | { type: 'pause' } | { type: 'resume' } | { type: 'togglePause' } | { type: 'tick'; dtMs: number } | { type: 'skip' } | { type: 'finish' };
  export const INITIAL_TOUR_STATE: TourState;
  export function stepDuration(step: Pick<TourStep, 'durationMs'> | undefined): number;
  export function tourReducer(state: TourState, action: TourAction, steps: ReadonlyArray<Pick<TourStep, 'durationMs'>>): TourState;
  export function tourProgress(state: TourState, steps: ReadonlyArray<Pick<TourStep, 'durationMs'>>): number;
  // services/tour/seen.ts
  export const TOUR_SEEN_PREFIX = 'jf_tour_seen_v1:';
  export type TourRole = 'JOKE_MAKER' | 'QUALITY_CONTROL';
  export function isTourRole(role: unknown): role is TourRole;
  export type SeenStore = Pick<Storage, 'getItem' | 'setItem'>;
  export function readTourSeen(role: TourRole, store?: SeenStore | null): boolean | null;
  export function markTourSeen(role: TourRole, store?: SeenStore | null): void;
  export type TourOutcome = 'finished' | 'skipped' | 'error';
  export function recordTourEnd(role: TourRole, outcome: TourOutcome, store?: SeenStore | null): void;
  export interface LaunchInput { role: unknown; watch: boolean; seen: boolean | null; roundActive: boolean }
  export type LaunchMode = 'tour' | 'prompt' | 'none';
  export function launchMode(input: LaunchInput): LaunchMode;
  export function shouldAutoPlay(input: LaunchInput): boolean;
  ```

- [ ] **Step 1: Write the failing tests**

Create `services/tour/tourMachine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  INITIAL_TOUR_STATE, TOUR_STEP_MS, stepDuration, tourProgress, tourReducer,
  type TourAction, type TourState,
} from './tourMachine';

const STEPS = [{ durationMs: 5000 }, {}, { durationMs: 4000 }];
const run = (actions: TourAction[], from: TourState = INITIAL_TOUR_STATE) =>
  actions.reduce((s, a) => tourReducer(s, a, STEPS), from);
const tick = (dtMs: number): TourAction => ({ type: 'tick', dtMs });

describe('stepDuration', () => {
  it('defaults to 6000 ms', () => {
    expect(TOUR_STEP_MS).toBe(6000);
    expect(stepDuration({})).toBe(6000);
    expect(stepDuration({ durationMs: 0 })).toBe(6000);
    expect(stepDuration({ durationMs: Number.NaN })).toBe(6000);
    expect(stepDuration({ durationMs: 7000 })).toBe(7000);
  });
});

describe('tourReducer', () => {
  it('auto-advances when a step has been up for its duration', () => {
    expect(run([tick(4999)])).toMatchObject({ index: 0, elapsedMs: 4999 });
    expect(run([tick(4999), tick(1)])).toMatchObject({ index: 1, elapsedMs: 0 });
    // Step 2 has no duration: the 6000 ms default.
    expect(run([tick(5000), tick(5999)])).toMatchObject({ index: 1, elapsedMs: 5999 });
    expect(run([tick(5000), tick(6000)])).toMatchObject({ index: 2, elapsedMs: 0 });
  });

  it('holds the last step at its end until Start, instead of closing on its own', () => {
    const atLast = run([tick(5000), tick(6000)]);
    const held = run([tick(4000), tick(9000), tick(100)], atLast);
    expect(held).toMatchObject({ index: 2, elapsedMs: 4000, ended: null });
    expect(tourReducer(held, { type: 'next' }, STEPS).ended).toBe('finished');
  });

  it('pause stops the clock; resume and togglePause start it again', () => {
    const paused = run([tick(1000), { type: 'pause' }, tick(10_000)]);
    expect(paused).toMatchObject({ index: 0, elapsedMs: 1000, paused: true });
    expect(run([{ type: 'resume' }, tick(500)], paused)).toMatchObject({ elapsedMs: 1500, paused: false });
    expect(run([{ type: 'togglePause' }, tick(500)], paused)).toMatchObject({ elapsedMs: 1500, paused: false });
    expect(run([{ type: 'togglePause' }])).toMatchObject({ paused: true });
  });

  it('next and back move one step and restart it from 0 ms', () => {
    const s = run([tick(2000), { type: 'next' }, tick(3000)]);
    expect(s).toMatchObject({ index: 1, elapsedMs: 3000 });
    expect(tourReducer(s, { type: 'back' }, STEPS)).toMatchObject({ index: 0, elapsedMs: 0 });
  });

  it('Back on the first step replays it from the start', () => {
    expect(run([tick(3000), { type: 'back' }])).toMatchObject({ index: 0, elapsedMs: 0 });
  });

  it('Back keeps a paused tour paused', () => {
    expect(run([{ type: 'next' }, { type: 'pause' }, { type: 'back' }])).toMatchObject({ index: 0, paused: true });
  });

  it('skip and finish end the tour, and nothing moves it afterwards', () => {
    const skipped = run([{ type: 'skip' }]);
    expect(skipped.ended).toBe('skipped');
    expect(run([{ type: 'finish' }]).ended).toBe('finished');
    expect(run([{ type: 'next' }, tick(99_999), { type: 'back' }, { type: 'finish' }], skipped)).toBe(skipped);
  });

  it('ignores zero, negative and NaN ticks', () => {
    const s = run([tick(1000)]);
    for (const dt of [0, -50, Number.NaN]) expect(tourReducer(s, tick(dt), STEPS)).toBe(s);
  });
});

describe('tourProgress', () => {
  it('counts finished steps plus the share of the current one', () => {
    expect(tourProgress(INITIAL_TOUR_STATE, STEPS)).toBe(0);
    expect(tourProgress({ ...INITIAL_TOUR_STATE, index: 1, elapsedMs: 3000 }, STEPS)).toBeCloseTo(0.5);
    expect(tourProgress({ ...INITIAL_TOUR_STATE, index: 2, elapsedMs: 4000 }, STEPS)).toBe(1);
  });
});
```

Create `services/tour/seen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  TOUR_SEEN_PREFIX, isTourRole, launchMode, markTourSeen, readTourSeen, recordTourEnd, shouldAutoPlay,
  type SeenStore,
} from './seen';

class MemoryStore implements SeenStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}
const broken: SeenStore = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('the seen flag', () => {
  it('is jf_tour_seen_v1:<ROLE>, a new key, separate from the old tutorial', () => {
    expect(TOUR_SEEN_PREFIX).toBe('jf_tour_seen_v1:');
    const store = new MemoryStore();
    store.setItem('jf_tutorial_seen_v1:JOKE_MAKER', '1');
    expect(readTourSeen('JOKE_MAKER', store)).toBe(false);
    markTourSeen('JOKE_MAKER', store);
    expect(store.getItem('jf_tour_seen_v1:JOKE_MAKER')).toBe('1');
    expect(readTourSeen('JOKE_MAKER', store)).toBe(true);
    expect(readTourSeen('QUALITY_CONTROL', store)).toBe(false);
  });

  it('reads as unknown (null) when storage is missing or throws, and writing never throws', () => {
    expect(readTourSeen('JOKE_MAKER', null)).toBeNull();
    expect(readTourSeen('JOKE_MAKER', broken)).toBeNull();
    expect(() => markTourSeen('JOKE_MAKER', broken)).not.toThrow();
    expect(() => markTourSeen('JOKE_MAKER', null)).not.toThrow();
  });

  it('is set when the tour is finished or skipped, and not after an error', () => {
    for (const outcome of ['finished', 'skipped'] as const) {
      const store = new MemoryStore();
      recordTourEnd('QUALITY_CONTROL', outcome, store);
      expect(readTourSeen('QUALITY_CONTROL', store)).toBe(true);
    }
    const store = new MemoryStore();
    recordTourEnd('QUALITY_CONTROL', 'error', store);
    expect(readTourSeen('QUALITY_CONTROL', store)).toBe(false);
  });
});

describe('isTourRole', () => {
  it('is the Joke Maker and Marketing only', () => {
    expect(isTourRole('JOKE_MAKER')).toBe(true);
    expect(isTourRole('QUALITY_CONTROL')).toBe(true);
    for (const r of ['INSTRUCTOR', 'CUSTOMER', 'UNASSIGNED', 'MARKETING', '', null, undefined]) expect(isTourRole(r)).toBe(false);
  });
});

describe('shouldAutoPlay and launchMode, every combination', () => {
  const roles = ['JOKE_MAKER', 'QUALITY_CONTROL', 'INSTRUCTOR', 'CUSTOMER', 'UNASSIGNED'];
  const seens = [true, false, null] as const;
  for (const role of roles) {
    for (const watch of [false, true]) {
      for (const seen of seens) {
        for (const roundActive of [false, true]) {
          const student = role === 'JOKE_MAKER' || role === 'QUALITY_CONTROL';
          const eligible = student && !watch && seen === false;
          const want = !eligible ? 'none' : roundActive ? 'prompt' : 'tour';
          it(`${role} watch=${watch} seen=${seen} roundActive=${roundActive} → ${want}`, () => {
            const input = { role, watch, seen, roundActive };
            expect(launchMode(input)).toBe(want);
            expect(shouldAutoPlay(input)).toBe(want === 'tour');
          });
        }
      }
    }
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/tour/tourMachine.test.ts services/tour/seen.test.ts 2>&1 | grep -E 'FAIL|Test Files'`
Expected: FAIL — both files fail to load (`Failed to load url ./tourMachine`, `Failed to load url ./seen`).

- [ ] **Step 3: Write the step machine**

Create `services/tour/tourMachine.ts`:

```ts
/* The guided tour's step machine — pure, no timers, no React.

   GuidedTour (components/tour/GuidedTour.tsx) owns one interval that sends
   `tick` with the milliseconds that passed; everything else is a user action.
   A step auto-advances once its time is up, except the last step, which waits
   for "Start" (`next`) or Skip. Back always restarts the previous step from its
   beginning: elapsedMs drops to 0, and the demo state for a step is rebuilt
   from scratch from (index, elapsedMs) by services/tour/demoScript.ts, so going
   back is deterministic and replays any typing. */

/** How long a step stays up when it does not say (spec §3.2). */
export const TOUR_STEP_MS = 6000;

/**
 * One step of a tour. Generic over the demo state the step's script changes
 * (S) and over what its caption is filled from (C, the round's money), so the
 * machine knows nothing about the game.
 */
export interface TourStep<S = unknown, C = unknown> {
  /** Stable id, for tests and logs. */
  id: string;
  /** The `data-tour` id of the element to spotlight; null shows a centred card. */
  target: string | null;
  title: string;
  /** Caption. A function when it quotes the round's money (filled by services/tour/tourSteps.ts stepsFor). */
  body: string | ((c: C) => string);
  /** Auto-advance after this long; TOUR_STEP_MS when absent. */
  durationMs?: number;
  /** Sets the demo state for this moment, applied when the step starts. */
  onEnter?: (s: S) => S;
  /** Later changes within the step, applied once `atMs` has passed. */
  beats?: ReadonlyArray<{ atMs: number; apply: (s: S) => S }>;
  /** A text field that types itself in during this step (whole at once with reduced motion). */
  typing?: TypingField;
  /** Label of the button that ends the tour on the last step. */
  finishLabel?: string;
}

/** DemoUi text fields a step can type in; 'mkTitle' is the first selected joke's title. */
export type TypingField = 'jmDraft' | 'mkNote' | 'mkTitle';

export type TourEnd = 'finished' | 'skipped';

export interface TourState {
  /** The step on screen. */
  index: number;
  /** Time spent on this step while playing. */
  elapsedMs: number;
  paused: boolean;
  /** Set once the tour is over; the component then unmounts it. */
  ended: TourEnd | null;
}

export type TourAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'togglePause' }
  | { type: 'tick'; dtMs: number }
  | { type: 'skip' }
  | { type: 'finish' };

export const INITIAL_TOUR_STATE: TourState = { index: 0, elapsedMs: 0, paused: false, ended: null };

export function stepDuration(step: Pick<TourStep, 'durationMs'> | undefined): number {
  const d = step?.durationMs;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : TOUR_STEP_MS;
}

const enter = (s: TourState, index: number): TourState => ({ ...s, index, elapsedMs: 0 });

export function tourReducer(
  state: TourState,
  action: TourAction,
  steps: ReadonlyArray<Pick<TourStep, 'durationMs'>>,
): TourState {
  if (state.ended) return state;
  const last = steps.length - 1;
  switch (action.type) {
    case 'next':
      return state.index >= last ? { ...state, ended: 'finished' } : enter(state, state.index + 1);
    case 'back':
      return enter(state, Math.max(0, state.index - 1));
    case 'pause':
      return state.paused ? state : { ...state, paused: true };
    case 'resume':
      return state.paused ? { ...state, paused: false } : state;
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'tick': {
      if (state.paused || !(action.dtMs > 0) || steps.length === 0) return state;
      const duration = stepDuration(steps[state.index]);
      const elapsedMs = state.elapsedMs + action.dtMs;
      if (elapsedMs < duration) return { ...state, elapsedMs };
      // The last step holds at its end and waits for Start.
      if (state.index >= last) return state.elapsedMs === duration ? state : { ...state, elapsedMs: duration };
      return enter(state, state.index + 1);
    }
    case 'skip':
      return { ...state, ended: 'skipped' };
    case 'finish':
      return { ...state, ended: 'finished' };
    default:
      return state;
  }
}

/** Overall progress, 0..1, for the control bar. */
export function tourProgress(state: TourState, steps: ReadonlyArray<Pick<TourStep, 'durationMs'>>): number {
  if (steps.length === 0) return 1;
  const within = Math.min(1, state.elapsedMs / stepDuration(steps[state.index]));
  return Math.min(1, (state.index + within) / steps.length);
}
```

- [ ] **Step 4: Write the seen flag and the launch rule**

Create `services/tour/seen.ts`:

```ts
/* Has this browser's student seen the guided tour for their role, and should
   it start on its own?

   The flag is `jf_tour_seen_v1:<ROLE>` in localStorage — a new key, so every
   student sees the new tour once even if they dismissed the old tutorial
   (jf_tutorial_seen_v1, kept for the instructor's modal). It is written when
   the tour ends (finished or skipped) or when the mid-round prompt is
   dismissed, never on mount, so React StrictMode's double mount cannot
   suppress it. Storage that throws or is missing reads as "unknown", which
   never auto-plays (the "?" button still works). */

export const TOUR_SEEN_PREFIX = 'jf_tour_seen_v1:';

/** The roles that have a guided tour. The UI enum calls Marketing QUALITY_CONTROL. */
export type TourRole = 'JOKE_MAKER' | 'QUALITY_CONTROL';

export function isTourRole(role: unknown): role is TourRole {
  return role === 'JOKE_MAKER' || role === 'QUALITY_CONTROL';
}

export type SeenStore = Pick<Storage, 'getItem' | 'setItem'>;

function sharedStore(): SeenStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** true / false, or null when storage cannot be read. */
export function readTourSeen(role: TourRole, store: SeenStore | null = sharedStore()): boolean | null {
  if (!store) return null;
  try {
    return store.getItem(`${TOUR_SEEN_PREFIX}${role}`) !== null;
  } catch {
    return null;
  }
}

export function markTourSeen(role: TourRole, store: SeenStore | null = sharedStore()): void {
  if (!store) return;
  try {
    store.setItem(`${TOUR_SEEN_PREFIX}${role}`, '1');
  } catch {
    // ignore — worst case the tour starts again next time
  }
}

/** How a tour ended. 'error' is the stage's error boundary: nothing is recorded. */
export type TourOutcome = 'finished' | 'skipped' | 'error';

export function recordTourEnd(role: TourRole, outcome: TourOutcome, store: SeenStore | null = sharedStore()): void {
  if (outcome === 'error') return;
  markTourSeen(role, store);
}

export interface LaunchInput {
  role: unknown;
  /** An instructor's watch tab (services/watchMode.ts isWatchMode). */
  watch: boolean;
  /** readTourSeen: null when storage is unavailable. */
  seen: boolean | null;
  /** The student's round is ACTIVE (config.isActive). */
  roundActive: boolean;
}

/** 'tour' auto-plays, 'prompt' shows "New here? Watch the 1-minute tour", 'none' does neither. */
export type LaunchMode = 'tour' | 'prompt' | 'none';

export function launchMode({ role, watch, seen, roundActive }: LaunchInput): LaunchMode {
  if (!isTourRole(role) || watch || seen !== false) return 'none';
  return roundActive ? 'prompt' : 'tour';
}

/** Spec §3.3: a tour role, not watch mode, flag unset, round not ACTIVE. */
export function shouldAutoPlay(input: LaunchInput): boolean {
  return launchMode(input) === 'tour';
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/tour/tourMachine.test.ts services/tour/seen.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  2 passed (2)`, `Tests  74 passed (74)` (10 machine, 64 seen — 60 of them the role × watch × seen × round grid).

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc prints nothing and exits 0; `Test Files  51 passed (51)`, `Tests  825 passed (825)`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add services/tour/tourMachine.ts services/tour/seen.ts services/tour/tourMachine.test.ts services/tour/seen.test.ts
git commit -m "feat(tour): the step machine and the seen flag with its auto-play rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Task 3: The demo script and the two tours

**Files:**
- Create: `services/tour/demoScript.ts`, `services/tour/tourSteps.ts`
- Test: `services/tour/demoScript.test.ts`, `services/tour/tourSteps.test.ts`

**Interfaces:**
- Consumes: Task 1 `DemoGameData` (`services/tour/demoGame.ts`), `DemoUi`, `EMPTY_DEMO_UI` (`services/tour/demoUi.ts`); Task 2 `TourStep`, `TypingField`, `stepDuration` (`services/tour/tourMachine.ts`), `TourRole` (`services/tour/seen.ts`); `computeProfit` (`services/economics.ts`); `shippingFeeFor`, `STANDARD_SHIPMENT_JOKES`, `fmtFee`, `fmtCents`, `fmtPerMinute` (`services/leanMode.ts`); `SIM_CONFIG.economics` (`config/simConfig.ts`).
- Produces:
  ```ts
  // services/tour/demoScript.ts
  export const DEMO_TEAM_ID = 99; export const DEMO_TEAM_NAME = 'Team Demo';
  export const DEMO_JOKES: readonly string[]; export const DEMO_RAW_BATCH: string; export const EARLIER_JOKES: readonly string[];
  export const DEMO_NOTE: string; export const DEMO_KEEP: ReadonlyArray<{ index: number; topic: string; title: string }>;
  export const EARLIER_BATCH_ID = 101; export const SENT_BATCH_ID = 102; export const NEXT_BATCH_ID = 103;
  export const demoJokeId: (batchId: number, n: number) => number;
  export const DEMO_T0: number; export const DEMO_TIMES: { earlierSent: 0; earlierReleased: 60; tourStart: 240; sent: 250; arrivedOnDesk: 255; released: 310; nextSent: 320; nextSeen: 372 };
  export interface TourMoney { marketPrice; costOfPublishing; costOfDiscard; shippingFeeSmall; shippingFeeStandard; shippingFeeLarge; storageFeePerJokeMinute; hostingFeePerJokeMinute: number }
  export interface TourRound { roundNumber: 1 | 2; fees: TourMoney }
  export interface DemoOptions extends TourRound { role: TourRole }
  export interface DemoState { options: DemoOptions; game: DemoGameData; ui: DemoUi }
  export type DemoStep = TourStep<DemoState, TourRound>;
  export function demoOptionsFor(role: TourRole, config: GameConfig): DemoOptions;
  export function demoFees(batches: readonly Batch[], fees: TourMoney, clockMs: number): { shipping: number; storage: number; hosting: number };
  export function settle(s: DemoState): DemoState;
  export function initialDemoState(options: DemoOptions): DemoState;
  // script actions, each (s: DemoState) => DemoState:
  typeDraft, certify, sendBatch, openSentBatch, batchArrives, splitOnDesk, pick(k), topicsAndTitles, writeNote,
  openMore, nextBatchArrives, releaseSentBatch, firstSale, customersReport
  export const TYPING_SHARE = 0.7;
  export function typedLength(length: number, elapsedMs: number, durationMs: number, reducedMotion: boolean): number;
  export function revealTyping(ui: DemoUi, field: TypingField, chars: number): DemoUi;
  export function buildDemoState(steps: ReadonlyArray<DemoStep>, k: number, options: DemoOptions, elapsedMs?: number): DemoState;
  export function demoFrame(steps: ReadonlyArray<DemoStep>, k: number, options: DemoOptions, elapsedMs: number, reducedMotion: boolean): DemoState;
  export function demoFrameKey(steps: ReadonlyArray<DemoStep>, k: number, elapsedMs: number, reducedMotion: boolean): string;
  // services/tour/tourSteps.ts
  export const JOKE_MAKER_STEPS: readonly DemoStep[]; export const MARKETING_STEPS: readonly DemoStep[];
  export function captionText(step: Pick<DemoStep, 'body'>, round: TourRound): string;
  export function stepsFor(role: TourRole, round: TourRound): DemoStep[]; // every body a filled-in string
  ```

**The script, step by step** (what each `onEnter` / beat does; Task 4 checks every target is on the screen):

| Joke Maker step | Target (`data-tour`) | Demo state |
|---|---|---|
| 1 You're the Joke Maker. | centre | Team Demo; batch #101 on the market, 2 of 5 sold. Next step: "Marketing's desk is empty — …". |
| 2 Write, then paste. (7 s) | `jm-draft` | The numbered five-joke reply types into the textbox. |
| 3 Send a batch. | `jm-send` | Box ticked; at 3 s it sends: textbox clears, batch #102 waits for Marketing. |
| 4 Every batch pays shipping. | `jm-shipping` | — (the Round 1 / Round 2 shipping line under Send). |
| 5 Your next step. | `jm-next-step` | "Keep writing — every batch is another chance to sell." |
| 6 Follow your batches. | `jm-value-stream` | At 2 s Marketing releases #102 (3 on the market, 2 wasted, with its note); at 4 s one sells. |
| 7 Read Marketing's note. | `jm-marketing-note` | #102 is expanded: "From Marketing" + the note above the jokes. |
| 8 Your scoreboard. | `jm-stats` (the four key tiles) | Profit ≈ −$2.94 ($2.18 from sales, listing and drops, less $4 shipping, $0.50 storage, $0.63 hosting), Jokes Sold / Made 3/10 at the default prices and fees. |
| 9 How customers buy. / 10 Your goal. [Start] | centre | — |

| Marketing step | Target (`data-tour`) | Demo state |
|---|---|---|
| 1 You're Marketing. | centre | Desk empty ("All Clear!"). |
| 2 A batch arrives. | `mk-desk` | #102 lands unsplit in the splitter; at 3 s it splits into the five jokes. |
| 3 Pick the winners — quickly. | `mk-jokes` | Jokes 1, 3, 5 selected one by one (0 s, 1.5 s, 3 s); 2 and 4 left out. |
| 4 Topic and title. | `mk-topic-title` | Topics set; the first title types in. |
| 5 Tell your Joke Maker. (7 s) | `mk-note` | The note types in; the counter climbs to n/500. |
| 6 Release. (5 s) | `mk-release` | — |
| 7 Your scoreboard. | `mk-stats` (the four key tiles) | Released: desk clear, Content Backlog 0, Profit updates; at 3 s one sells. |
| 8 Fees add up. (7 s) | `mk-more` (the opened "More numbers" panel with the Shipping, Storage and Hosting fee tiles) | "More numbers" opens (demo state only); batch #103 has been waiting 52 s on the desk. |
| 9 Your next step. | `mk-next-step` | "Batch waiting 52 s — release what's good enough. Storage costs 5¢ a joke each minute." |
| 10 What customers said. | `mk-feedback` | A new card for "To-Do Overload": ✓ and ✗ criteria boxes. |
| 11 Keep it in view. (5 s) | `mk-expand` | — |
| 12 Your goal. [Start] | centre | — |

- [ ] **Step 1: Write the failing tests**

Create `services/tour/demoScript.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEMO_JOKES, DEMO_NOTE, DEMO_RAW_BATCH, DEMO_T0, DEMO_TIMES, EARLIER_JOKES, NEXT_BATCH_ID, SENT_BATCH_ID, TYPING_SHARE,
  buildDemoState, demoFrame, demoFrameKey, demoOptionsFor, initialDemoState, revealTyping, typedLength,
  type DemoOptions, type DemoState, type TourMoney,
} from './demoScript';
import { JOKE_MAKER_STEPS, MARKETING_STEPS, stepsFor } from './tourSteps';
import { EMPTY_DEMO_UI } from './demoUi';
import { stepDuration } from './tourMachine';
import { computeProfit, countJokesSold } from '../economics';
import { leanFeesOf, shippingFeeFor } from '../leanMode';
import { jokeMakerInputFrom, jokeMakerNextStep, marketingInputFrom, marketingNextStep } from '../nextStep';
import { toFeedbackRows } from '../../views/feedback';
import { TEST_CONFIG } from '../../views/testing/renderWithGame';
import type { TourRole } from './seen';

/** The game's default prices and Lean fees. */
const DEFAULT_FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
};
const ODD_FEES: TourMoney = {
  marketPrice: 2, costOfPublishing: 0.25, costOfDiscard: 0.05,
  shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 4,
  storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.02,
};
const opts = (role: TourRole, roundNumber: 1 | 2 = 1, fees = DEFAULT_FEES): DemoOptions => ({ role, roundNumber, fees });
const ROLES: TourRole[] = ['JOKE_MAKER', 'QUALITY_CONTROL'];
const ALL: DemoOptions[] = ROLES.flatMap(role => [opts(role, 1), opts(role, 2), opts(role, 2, ODD_FEES)]);

const stepsOf = (o: DemoOptions) => stepsFor(o.role, o);
const indexOf = (o: DemoOptions, id: string) => stepsOf(o).findIndex(s => s.id === id);
const endOf = (o: DemoOptions, k: number) => buildDemoState(stepsOf(o), k, o, stepDuration(stepsOf(o)[k]));
const at = (o: DemoOptions, id: string, elapsedMs = 0) => buildDemoState(stepsOf(o), indexOf(o, id), o, elapsedMs);

/* The game's formulas, written out again here so the script cannot grade its own homework. */
const minutes = (from: number, to: number) => Math.max(0, to - from) / 60_000;
const chargedJokes = (n: number) => (n > 0 ? n : 5);
function expectedFees(s: DemoState) {
  const f = s.options.fees;
  const now = s.ui.clockMs;
  let shipping = 0;
  let storage = 0;
  let hosting = 0;
  for (const b of s.game.batches) {
    const n = chargedJokes(b.jokes.length);
    shipping += shippingFeeFor(n, f);
    const decided = b.status === 'PROCESSED';
    storage += n * minutes(b.submittedAt!, decided ? Math.min(b.ratedAt!, now) : now) * f.storageFeePerJokeMinute;
    if (decided) {
      const unsold = b.jokes.filter(j => j.is_published && !(j.sold_count! > 0)).length;
      hosting += unsold * minutes(b.ratedAt!, now) * f.hostingFeePerJokeMinute;
    }
  }
  return { shipping, storage, hosting };
}
function expectedProfit(s: DemoState): number {
  const decided = s.game.batches.filter(b => b.status === 'PROCESSED');
  const created = decided.reduce((n, b) => n + b.jokes.length, 0);
  const published = decided.reduce((n, b) => n + b.jokes.filter(j => j.is_published).length, 0);
  const sales = s.game.batches.reduce((n, b) => n + b.jokes.reduce((m, j) => m + (j.sold_count ?? 0), 0), 0);
  const f = s.options.fees;
  const fees = expectedFees(s);
  return sales * f.marketPrice - published * f.costOfPublishing - (created - published) * f.costOfDiscard
    - fees.shipping - fees.storage - fees.hosting;
}

describe('the sample data', () => {
  it('has five original one-line placeholder jokes, pasted as a numbered reply', () => {
    expect(DEMO_JOKES).toHaveLength(5);
    expect(new Set(DEMO_JOKES).size).toBe(5);
    for (const j of [...DEMO_JOKES, ...EARLIER_JOKES]) {
      expect(j).not.toContain('\n');
      expect(j.length).toBeLessThanOrEqual(80);
    }
    expect(EARLIER_JOKES.filter(j => DEMO_JOKES.includes(j))).toEqual([]);
    expect(DEMO_RAW_BATCH.split('\n')).toEqual(DEMO_JOKES.map((j, i) => `${i + 1}) ${j}`));
  });

  it('starts as Team Demo in a running Lean round, with one earlier batch on the market, 2 of 5 sold', () => {
    const s = initialDemoState(opts('JOKE_MAKER'));
    expect(s.game.teamNames[s.game.user!.team]).toBe('Team Demo');
    expect(s.game.batches).toHaveLength(1);
    expect(s.game.batches[0].jokes.every(j => j.is_published)).toBe(true);
    expect(countJokesSold(s.game.batches)).toBe(2);
    expect(s.game.config).toMatchObject({ isActive: true, marketMode: 'LEAN', round: 1 });
    expect(s.ui).toEqual({ ...EMPTY_DEMO_UI, clockMs: DEMO_T0 + DEMO_TIMES.tourStart * 1000 });
  });

  it('carries the round number and the round\'s money into the demo game', () => {
    const s = initialDemoState(opts('QUALITY_CONTROL', 2, ODD_FEES));
    expect(s.game.config).toMatchObject({ round: 2, ...ODD_FEES });
  });
});

describe('buildDemoState', () => {
  it('is deterministic: the same step and time always rebuild the same state', () => {
    for (const o of ALL) {
      const steps = stepsOf(o);
      for (let k = 0; k < steps.length; k++) {
        expect(buildDemoState(steps, k, o, 2500)).toEqual(buildDemoState(steps, k, o, 2500));
      }
    }
  });

  it('never shares state between builds', () => {
    const o = opts('JOKE_MAKER');
    const k = indexOf(o, 'jm-note');
    const a = buildDemoState(stepsOf(o), k, o);
    a.game.batches.push(a.game.batches[0]);
    a.ui.jmOpenBatchIds.push('x');
    const b = buildDemoState(stepsOf(o), k, o);
    expect(b.game.batches).toHaveLength(2);
    expect(b.ui.jmOpenBatchIds).toEqual([String(SENT_BATCH_ID)]);
    expect(EMPTY_DEMO_UI.jmOpenBatchIds).toEqual([]);
  });

  it('keeps Profit, Jokes Sold / Made, the backlog and the three fees consistent with the game formulas at every moment', () => {
    for (const o of ALL) {
      const steps = stepsOf(o);
      for (let k = 0; k < steps.length; k++) {
        for (const s of [buildDemoState(steps, k, o, 0), endOf(o, k)]) {
          const sum = s.game.teamSummary!;
          expect(sum.profit!).toBeCloseTo(expectedProfit(s), 10);
          const fees = leanFeesOf(sum.lean);
          const want = expectedFees(s);
          expect(fees.shipping).toBeCloseTo(want.shipping, 10);
          expect(fees.storage).toBeCloseTo(want.storage, 10);
          expect(fees.hosting).toBeCloseTo(want.hosting, 10);
          const decided = s.game.batches.filter(b => b.status === 'PROCESSED');
          expect(sum.jokes_created).toBe(decided.reduce((n, b) => n + b.jokes.length, 0));
          expect(countJokesSold(s.game.batches)).toBeLessThanOrEqual(sum.jokes_created!);
          expect(sum.unprocessed_batches).toBe(s.game.batches.filter(b => b.status === 'SUBMITTED').length);
        }
      }
    }
  });

  it('Joke Maker ends on a plausible scoreboard at the default prices: 3 of 10 sold, listing and fees taken off', () => {
    const o = opts('JOKE_MAKER');
    const s = endOf(o, stepsOf(o).length - 1);
    expect(countJokesSold(s.game.batches)).toBe(3);
    expect(s.game.teamSummary!.jokes_created).toBe(10);
    expect(computeProfit({ created: 10, published: 8, sold: 3 }, DEFAULT_FEES)).toBeCloseTo(2.18, 10);
    // Shipping 2 × $2, storage 10 joke-minutes × 5¢, hosting 12.5 joke-minutes × 5¢.
    expect(leanFeesOf(s.game.teamSummary!.lean)).toEqual({
      shipping: 4, storage: expect.closeTo(0.5, 10), hosting: expect.closeTo(0.625, 10),
    });
    expect(s.game.teamSummary!.profit!).toBeCloseTo(2.18 - 4 - 0.5 - 0.625, 10);
  });

  it('Joke Maker: the send clears the textbox and the batch waits for Marketing, then comes back with a note', () => {
    const o = opts('JOKE_MAKER');
    expect(at(o, 'jm-send').ui).toMatchObject({ jmDraft: DEMO_RAW_BATCH, jmCertified: true });
    const sent = at(o, 'jm-send', 3000);
    expect(sent.ui).toMatchObject({ jmDraft: '', jmCertified: false });
    expect(sent.game.batches.map(b => [b.batch_id, b.status])).toEqual([[101, 'PROCESSED'], [SENT_BATCH_ID, 'SUBMITTED']]);
    const note = at(o, 'jm-note');
    const released = note.game.batches.find(b => b.batch_id === SENT_BATCH_ID)!;
    expect(released.status).toBe('PROCESSED');
    expect(released.marketing_note).toBe(DEMO_NOTE);
    expect(released.jokes.filter(j => j.is_published)).toHaveLength(3);
    expect(note.ui.jmOpenBatchIds).toEqual([String(SENT_BATCH_ID)]);
  });

  it('Marketing: the batch arrives unsplit, splits into five, three are kept, then it is released', () => {
    const o = opts('QUALITY_CONTROL');
    const before = at(o, 'mk-arrives').game.qcQueue!;
    expect(before.batch.raw_text).toBe(DEMO_RAW_BATCH);
    expect(before.jokes).toEqual([]);
    expect(before.queue_size).toBe(1);
    expect(at(o, 'mk-arrives', 3000).game.qcQueue!.jokes.map(j => j.joke_text)).toEqual([...DEMO_JOKES]);
    expect(endOf(o, indexOf(o, 'mk-pick')).ui.mkSelectedIds).toHaveLength(3);
    const ready = at(o, 'mk-release');
    for (const id of ready.ui.mkSelectedIds) {
      expect(ready.ui.mkTopics[id]).toBeTruthy();
      expect(ready.ui.mkTitles[id]).toBeTruthy();
    }
    expect(ready.ui.mkNote).toBe(DEMO_NOTE);
    const after = at(o, 'mk-scoreboard');
    expect(after.game.qcQueue).toBeNull();
    expect(after.ui.mkNote).toBe('');
    expect(after.game.teamSummary!.jokes_created).toBe(10);
    expect(after.game.teamSummary!.unprocessed_batches).toBe(0);
  });

  it('Marketing: "Fees add up" opens More numbers and lands the next batch on the desk; the feedback card gets a new read', () => {
    const o = opts('QUALITY_CONTROL');
    expect(at(o, 'mk-scoreboard').ui.moreOpen).toBe(false);
    const fees = at(o, 'mk-fees');
    expect(fees.ui.moreOpen).toBe(true);
    expect(fees.game.qcQueue!.batch.batch_id).toBe(NEXT_BATCH_ID);
    expect(fees.game.teamSummary!.unprocessed_batches).toBe(1);
    const lean = leanFeesOf(fees.game.teamSummary!.lean);
    expect(lean.shipping).toBe(6);
    expect(lean.storage).toBeGreaterThan(0);
    expect(lean.hosting).toBeGreaterThan(0);
    const feedback = at(o, 'mk-feedback').game.teamFeedback!.jokes[0];
    expect(feedback).toMatchObject({ joke_title: 'To-Do Overload', was_bought: true });
    expect(feedback.good_dimensions.length).toBeGreaterThan(0);
    expect(feedback.improve_dimensions.length).toBeGreaterThan(0);
  });

  it('the Joke Maker tour never opens More numbers', () => {
    const o = opts('JOKE_MAKER');
    for (let k = 0; k < stepsOf(o).length; k++) expect(endOf(o, k).ui.moreOpen).toBe(false);
  });
});

describe('the Next step line runs the real rules on the demo state', () => {
  const jmLine = (s: DemoState) => jokeMakerNextStep(jokeMakerInputFrom({
    now: s.ui.clockMs, roundActive: s.game.config.isActive, round: s.game.config.round,
    roundStatuses: s.game.roundStatuses, teamSummary: s.game.teamSummary, batches: s.game.batches,
  })).text;
  const mkLine = (s: DemoState) => marketingNextStep(marketingInputFrom({
    now: s.ui.clockMs, roundActive: s.game.config.isActive, round: s.game.config.round, roundId: s.game.roundId,
    roundStatuses: s.game.roundStatuses, storageFeePerJokeMinute: s.game.config.storageFeePerJokeMinute,
    teamSummary: s.game.teamSummary, qcQueue: s.game.qcQueue, batches: s.game.batches,
    feedbackRows: toFeedbackRows(s.game.teamFeedback),
  }));

  it('Joke Maker: desk empty, then keep writing while Marketing has the batch, then Marketing\'s note', () => {
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-welcome'))).toBe("Marketing's desk is empty — send your next batch of 5.");
    expect(jmLine(at(opts('JOKE_MAKER', 2), 'jm-welcome'))).toBe("Marketing's desk is empty — send a small batch now.");
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-next'))).toBe('Keep writing — every batch is another chance to sell.');
    expect(jmLine(at(opts('JOKE_MAKER'), 'jm-note'))).toBe(`Marketing says: “${DEMO_NOTE}” — use it in your next batch.`);
  });

  it('Marketing: on its Next step, a batch that has waited too long, with the round\'s storage fee', () => {
    expect(mkLine(at(opts('QUALITY_CONTROL'), 'mk-next'))).toEqual({
      tone: 'warn', text: "Batch waiting 52 s — release what's good enough. Storage costs 5¢ a joke each minute.",
    });
    expect(mkLine(at(opts('QUALITY_CONTROL', 2, ODD_FEES), 'mk-next')).text).toContain('Storage costs 10¢ a joke each minute.');
  });
});

describe('typing', () => {
  it('types over the first 70 % of the step, and shows the whole text at once with reduced motion', () => {
    expect(TYPING_SHARE).toBe(0.7);
    expect(typedLength(100, 0, 7000, false)).toBe(0);
    expect(typedLength(100, 2450, 7000, false)).toBe(50);
    expect(typedLength(100, 4900, 7000, false)).toBe(100);
    expect(typedLength(100, 9999, 7000, false)).toBe(100);
    expect(typedLength(100, 0, 7000, true)).toBe(100);
  });

  it('cuts only the typing field', () => {
    const ui = { ...EMPTY_DEMO_UI, jmDraft: 'abcdef', mkNote: 'note', mkSelectedIds: [7, 8], mkTitles: { 7: 'Title', 8: 'Other' } };
    expect(revealTyping(ui, 'jmDraft', 2)).toEqual({ ...ui, jmDraft: 'ab' });
    expect(revealTyping(ui, 'mkNote', 0)).toEqual({ ...ui, mkNote: '' });
    expect(revealTyping(ui, 'mkTitle', 3).mkTitles).toEqual({ 7: 'Tit', 8: 'Other' });
  });

  it('Back after typing replays it from nothing; Next mid-typing lands on the whole text', () => {
    const o = opts('JOKE_MAKER');
    const steps = stepsOf(o);
    const write = indexOf(o, 'jm-write');
    expect(demoFrame(steps, write, o, 0, false).ui.jmDraft).toBe('');
    const half = demoFrame(steps, write, o, 2000, false).ui.jmDraft;
    expect(half.length).toBeGreaterThan(0);
    expect(DEMO_RAW_BATCH.startsWith(half)).toBe(true);
    // Next while half typed: the following step starts from the full text.
    expect(demoFrame(steps, write + 1, o, 0, false).ui.jmDraft).toBe(DEMO_RAW_BATCH);
    // Back from there: the machine restarts the step at 0 ms, so the typing replays.
    expect(demoFrame(steps, write, o, 0, false).ui.jmDraft).toBe('');
    // Reduced motion: whole at once.
    expect(demoFrame(steps, write, o, 0, true).ui.jmDraft).toBe(DEMO_RAW_BATCH);
  });

  it('demoFrameKey changes only when the frame can change', () => {
    const o = opts('QUALITY_CONTROL');
    const steps = stepsOf(o);
    const pickStep = indexOf(o, 'mk-pick');
    expect(demoFrameKey(steps, pickStep, 100, false)).toBe(demoFrameKey(steps, pickStep, 1400, false));
    expect(demoFrameKey(steps, pickStep, 1400, false)).not.toBe(demoFrameKey(steps, pickStep, 1500, false));
    const note = indexOf(o, 'mk-note');
    expect(demoFrameKey(steps, note, 100, false)).not.toBe(demoFrameKey(steps, note, 200, false));
    expect(demoFrameKey(steps, note, 100, true)).toBe(demoFrameKey(steps, note, 200, true));
  });
});

describe('demoOptionsFor', () => {
  it('reads the round number, prices and fees from the round, never fixed text', () => {
    expect(demoOptionsFor('QUALITY_CONTROL', { ...TEST_CONFIG, round: 2, ...ODD_FEES })).toEqual(opts('QUALITY_CONTROL', 2, ODD_FEES));
    expect(demoOptionsFor('JOKE_MAKER', TEST_CONFIG)).toEqual(opts('JOKE_MAKER', 1, DEFAULT_FEES));
  });

  it('falls back to the default prices and to no fee for broken values', () => {
    const o = demoOptionsFor('JOKE_MAKER', {
      ...TEST_CONFIG, marketPrice: Number.NaN, costOfPublishing: -1, shippingFeeStandard: Number.NaN, storageFeePerJokeMinute: -0.5,
    });
    expect(o.fees).toMatchObject({ marketPrice: 1, costOfPublishing: 0.1, shippingFeeStandard: 0, storageFeePerJokeMinute: 0 });
  });

  it('builds the same demo whether or not the live round has started', () => {
    expect(demoOptionsFor('JOKE_MAKER', { ...TEST_CONFIG, isActive: true }))
      .toEqual(demoOptionsFor('JOKE_MAKER', { ...TEST_CONFIG, isActive: false, status: 'LOBBY' }));
  });
});

describe('the step lists the script runs on', () => {
  it('every onEnter and beat returns a new state and leaves its input alone', () => {
    for (const step of [...JOKE_MAKER_STEPS, ...MARKETING_STEPS]) {
      for (const f of [step.onEnter, ...(step.beats ?? []).map(b => b.apply)]) {
        if (!f) continue;
        const o = opts(step.id.startsWith('jm') ? 'JOKE_MAKER' : 'QUALITY_CONTROL', 2);
        const s = buildDemoState(stepsOf(o), Math.max(0, indexOf(o, step.id) - 1), o, 99_999);
        const copy = JSON.parse(JSON.stringify(s));
        f(s);
        expect(JSON.parse(JSON.stringify(s))).toEqual(copy);
      }
    }
  });
});
```

Create `services/tour/tourSteps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JOKE_MAKER_STEPS, MARKETING_STEPS, captionText, stepsFor } from './tourSteps';
import { stepDuration } from './tourMachine';
import type { TourMoney, TourRound } from './demoScript';
import { DIMENSIONS } from '../../config/dimensions';

const DEFAULT_FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
};
const R1: TourRound = { roundNumber: 1, fees: DEFAULT_FEES };
const R2: TourRound = { roundNumber: 2, fees: DEFAULT_FEES };
const ids = (steps: ReadonlyArray<{ id: string }>) => steps.map(s => s.id);
const text = (steps: ReadonlyArray<{ title: string; body: unknown }>) => steps.map(s => [s.title, s.body]);

describe('stepsFor', () => {
  it('Joke Maker: ten steps, the same in both rounds', () => {
    const want = [
      'jm-welcome', 'jm-write', 'jm-send', 'jm-shipping', 'jm-next', 'jm-value-stream', 'jm-note', 'jm-scoreboard',
      'jm-customers', 'jm-goal',
    ];
    expect(ids(stepsFor('JOKE_MAKER', R1))).toEqual(want);
    expect(ids(stepsFor('JOKE_MAKER', R2))).toEqual(want);
  });

  it('Marketing: twelve steps, the same in both rounds', () => {
    const want = [
      'mk-welcome', 'mk-arrives', 'mk-pick', 'mk-title', 'mk-note', 'mk-release', 'mk-scoreboard', 'mk-fees',
      'mk-next', 'mk-feedback', 'mk-expand', 'mk-goal',
    ];
    expect(ids(stepsFor('QUALITY_CONTROL', R1))).toEqual(want);
    expect(ids(stepsFor('QUALITY_CONTROL', R2))).toEqual(want);
  });

  it('fills every caption in: no step comes back with a function', () => {
    for (const role of ['JOKE_MAKER', 'QUALITY_CONTROL'] as const) {
      for (const s of stepsFor(role, R2)) expect(typeof s.body).toBe('string');
    }
  });

  it('opens and closes on a centred card, and the last button says Start', () => {
    for (const steps of [JOKE_MAKER_STEPS, MARKETING_STEPS]) {
      expect(steps[0].target).toBeNull();
      expect(steps[steps.length - 1].target).toBeNull();
      expect(steps[steps.length - 1].finishLabel).toBe('Start');
      expect(steps.slice(0, -1).every(s => s.finishLabel === undefined)).toBe(true);
    }
  });

  it('runs about a minute', () => {
    const total = (steps: readonly { durationMs?: number }[]) => steps.reduce((ms, s) => ms + stepDuration(s), 0);
    expect(total(JOKE_MAKER_STEPS)).toBe(61_000);
    expect(total(MARKETING_STEPS)).toBe(72_000);
  });

  it('uses data-tour ids that are safe in a CSS selector, and unique step ids', () => {
    for (const steps of [JOKE_MAKER_STEPS, MARKETING_STEPS]) {
      expect(new Set(ids(steps)).size).toBe(steps.length);
      for (const s of steps) if (s.target !== null) expect(s.target).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('captions (spec §4, verbatim)', () => {
  it('Joke Maker, Round 1, at the default fees', () => {
    expect(text(stepsFor('JOKE_MAKER', R1))).toEqual([
      ["You're the Joke Maker.", "Your team earns money when AI customers buy your jokes. Here's your screen in one minute."],
      ['Write, then paste.', 'Write jokes with your AI tool and paste the whole reply here. Marketing splits it into separate jokes.'],
      ['Send a batch.', 'Tick the box and press Send to Marketing. Each send is one batch.'],
      ['Every batch pays shipping.', 'Each batch of 5 costs $2 to ship, so keep them coming but make them count.'],
      ['Your next step.', "This line watches the game and tells you what to do next. Glance at it whenever you're unsure."],
      ['Follow your batches.', 'Each row is a batch. The dots show where every joke is: with Marketing, on the market, sold or wasted.'],
      ["Read Marketing's note.", 'Marketing tells you what customers liked and what to change. Read it before you write the next batch.'],
      ['Your scoreboard.', 'Profit is sales minus fees, and it can go negative. Rank, Jokes Sold / Made and Created to Publish (how long a joke takes to reach the market) complete it. "More numbers" shows the rest.'],
      ['How customers buy.', 'AI customers are picky: they judge every joke on 12 criteria and only buy the ones that fit what they like. Better-aimed jokes beat lots of random ones.'],
      ['Your goal.', 'Keep the line moving, learn from each batch, and improve the next one.'],
    ]);
  });

  it('Joke Maker, Round 2: the shipping step lists the three sizes', () => {
    expect(stepsFor('JOKE_MAKER', R2)[3].body).toBe(
      'You choose the size now: $1 for 1–4 jokes, $2 for 5, $3 for 6–10. Smaller batches come back with feedback sooner.',
    );
    // Every other caption is the same in both rounds.
    const r1 = stepsFor('JOKE_MAKER', R1).map(s => s.body);
    const r2 = stepsFor('JOKE_MAKER', R2).map(s => s.body);
    expect(r2.filter((b, i) => b !== r1[i])).toHaveLength(1);
  });

  it('Marketing, at the default fees', () => {
    expect(text(stepsFor('QUALITY_CONTROL', R1))).toEqual([
      ["You're Marketing.", 'You decide which jokes go to market. Listing a joke costs $0.10, and each sale earns $1.'],
      ['A batch arrives.', "Your Joke Maker's batch lands here. Split it into separate jokes."],
      ['Pick the winners — quickly.', "Keep the jokes customers will buy and drop the rest (dropping costs $0.01). Don't be too strict: customers can only buy what's on the shelf."],
      ['Topic and title.', 'Give each joke a topic and a title. A good title helps it sell.'],
      ['Tell your Joke Maker.', 'Say what to change next. Your note is sent with this batch.'],
      ['Release.', 'Released jokes go on the market, where customers start buying.'],
      ['Your scoreboard.', 'Profit, your rank, how many jokes have sold, and how many batches are waiting on your desk.'],
      ['Fees add up.', 'Every batch pays shipping. A batch waiting on your desk pays storage (5¢ a joke each minute), and an unsold joke pays hosting (5¢ a joke each minute). Holding batches only costs money: release quickly.'],
      ['Your next step.', 'This line watches the game and tells you what to do next, like releasing a batch that has waited too long.'],
      ['What customers said.', 'For your latest jokes: which criteria landed and which missed. It never says by how much.'],
      ['Keep it in view.', 'Expand opens the feedback in a floating window that stays on top while you work.'],
      ['Your goal.', 'Ship what sells, tell your Joke Maker why, and improve every batch.'],
    ]);
  });

  it('every amount comes from the round: non-default fees show in the captions', () => {
    const odd: TourMoney = {
      marketPrice: 2, costOfPublishing: 0.25, costOfDiscard: 0.05,
      shippingFeeSmall: 0.5, shippingFeeStandard: 1.5, shippingFeeLarge: 4,
      storageFeePerJokeMinute: 0.1, hostingFeePerJokeMinute: 0.025,
    };
    const mk = stepsFor('QUALITY_CONTROL', { roundNumber: 1, fees: odd }).map(s => s.body);
    expect(mk[0]).toBe('You decide which jokes go to market. Listing a joke costs $0.25, and each sale earns $2.');
    expect(mk[2]).toContain('(dropping costs $0.05)');
    expect(mk[7]).toContain('pays storage (10¢ a joke each minute), and an unsold joke pays hosting (2.5¢ a joke each minute).');
    expect(stepsFor('JOKE_MAKER', { roundNumber: 1, fees: odd })[3].body).toBe(
      'Each batch of 5 costs $1.50 to ship, so keep them coming but make them count.',
    );
    expect(stepsFor('JOKE_MAKER', { roundNumber: 2, fees: odd })[3].body).toBe(
      'You choose the size now: $0.50 for 1–4 jokes, $1.50 for 5, $4 for 6–10. Smaller batches come back with feedback sooner.',
    );
  });

  it('captionText leaves a plain caption alone', () => {
    expect(captionText(JOKE_MAKER_STEPS[0], R1)).toBe(JOKE_MAKER_STEPS[0].body);
  });

  it('"12 criteria" is still the number of criteria the customers judge', () => {
    expect(DIMENSIONS).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/tour/demoScript.test.ts services/tour/tourSteps.test.ts 2>&1 | grep -E 'FAIL|Test Files'`
Expected: both files `FAIL` to load (`Failed to load url ./demoScript`, `./tourSteps`); `Test Files  2 failed (2)`.

- [ ] **Step 3: Write the demo script**

Create `services/tour/demoScript.ts`:

```ts
/* The guided tour's sample data: "Team Demo", its jokes, and every change the
   tour makes to them as it plays.

   A DemoState is everything the stage shows: the demo game (what the views
   read from GameContext) and the DemoUi (what they read in place of their own
   local state, the demo clock included). buildDemoState(steps, k, options,
   elapsedMs) rebuilds the state for step k from scratch — every onEnter and
   beat of the steps before k, then step k's onEnter and the beats whose time
   has come — so Back, Next and replays are deterministic. Nothing is shared or
   mutated: every helper returns new objects.

   The numbers follow the game's own formulas at the round's prices and fees
   (settle() recomputes the team summary after every change, so Profit, Jokes
   Sold / Made, Content Backlog and the fee tiles always agree with the batches
   on screen):
   - sales, listing and discards: services/economics.ts computeProfit;
   - shipping: every sent batch priced by its size (services/leanMode.ts
     shippingFeeFor; an unsplit batch ships as the standard 5);
   - storage: jokes × minutes each batch waited on Marketing's desk, up to its
     release or, while it still waits, up to the demo clock;
   - hosting: released jokes still unsold × minutes since their release.

   Timeline (seconds after T0): batch #101 sent at 0 and released at 60 with
   2 of its 5 jokes sold since; the tour opens at 240; the Joke Maker sends
   #102 at 250; Marketing releases it at 310 (3 kept, 2 dropped, with a note);
   in the Marketing tour a third batch, #103, is sent at 320 and has waited
   52 s when the Next step line is shown. */
import type { ApiTeamSummaryResponse, Batch, GameConfig, Joke, JokeId, Role, User } from '../../types';
import type { LeanTeamStats, TeamFeedbackResponse } from '../../types/api';
import { computeProfit } from '../economics';
import { STANDARD_SHIPMENT_JOKES, shippingFeeFor } from '../leanMode';
import { SIM_CONFIG } from '../../config/simConfig';
import type { DemoGameData } from './demoGame';
import { EMPTY_DEMO_UI, type DemoUi } from './demoUi';
import type { TourRole } from './seen';
import { stepDuration, type TourStep, type TypingField } from './tourMachine';

export const DEMO_TEAM_ID = 99;
export const DEMO_TEAM_NAME = 'Team Demo';

/** The five placeholder jokes the tour writes, sends and splits. Original, clean, one line each. */
export const DEMO_JOKES: readonly string[] = [
  'My to-do list has its own to-do list, and both are ignoring me.',
  'The office printer only jams when someone says the word urgent.',
  "My smartwatch says I'm stressed, mostly about my smartwatch.",
  "I labeled my lunch 'kale salad' and nobody has touched it since.",
  "The Wi-Fi went down, so we finally learned each other's names.",
];

/** The batch as the Joke Maker pastes it: the AI's numbered reply. */
export const DEMO_RAW_BATCH = DEMO_JOKES.map((text, i) => `${i + 1}) ${text}`).join('\n');

/** The earlier batch, already on the market with 2 of 5 sold. Its row stays collapsed in both tours. */
export const EARLIER_JOKES: readonly string[] = [
  'Our team chat has more emoji reactions than actual messages.',
  'I set my alarm to motivated mode and it hit snooze on me.',
  'The coffee machine knows more office secrets than anyone in HR.',
  'My desk plant and I are both pretending we get enough sunlight.',
  'I finally emptied my inbox, and three new meetings moved in.',
];

/** Marketing's note on the new batch. */
export const DEMO_NOTE = 'Customers loved the work jokes. Keep them short and end on a twist.';

/** The three jokes Marketing keeps (indexes into DEMO_JOKES), with their Topic and title. */
export const DEMO_KEEP: ReadonlyArray<{ index: number; topic: string; title: string }> = [
  { index: 0, topic: 'Work', title: 'To-Do Overload' },
  { index: 2, topic: 'Technology', title: 'Stressed Smartwatch' },
  { index: 4, topic: 'Technology', title: 'Wi-Fi Icebreaker' },
];

export const EARLIER_BATCH_ID = 101;
/** The batch the tour sends (Joke Maker) or receives (Marketing). */
export const SENT_BATCH_ID = 102;
/** The batch that lands on Marketing's desk during "Fees add up". */
export const NEXT_BATCH_ID = 103;

/** Joke id of the n-th joke (0-based) of a demo batch. */
export const demoJokeId = (batchId: number, n: number) => batchId * 10 + n + 1;

/** T0 of the demo's timeline (ms epoch); the clock and every timestamp count from it. */
export const DEMO_T0 = Date.parse('2026-10-11T10:00:00Z');
const at = (seconds: number) => DEMO_T0 + seconds * 1000;
const iso = (seconds: number) => new Date(at(seconds)).toISOString();

/** Seconds after T0 of each moment in the script. */
export const DEMO_TIMES = {
  earlierSent: 0, earlierReleased: 60, tourStart: 240, sent: 250, arrivedOnDesk: 255,
  released: 310, nextSent: 320, nextSeen: 372,
} as const;

/** What a caption or a demo number may quote: the round's prices and Lean fees. */
export interface TourMoney {
  marketPrice: number;
  costOfPublishing: number;
  costOfDiscard: number;
  shippingFeeSmall: number;
  shippingFeeStandard: number;
  shippingFeeLarge: number;
  storageFeePerJokeMinute: number;
  hostingFeePerJokeMinute: number;
}

/** The round a tour is played for: its number (the shipping copy differs) and its money. */
export interface TourRound {
  roundNumber: 1 | 2;
  fees: TourMoney;
}

export interface DemoOptions extends TourRound {
  role: TourRole;
}

export interface DemoState {
  options: DemoOptions;
  game: DemoGameData;
  ui: DemoUi;
}

export type DemoStep = TourStep<DemoState, TourRound>;

const amount = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * The demo's settings, read from the live round's configuration. A price that
 * is missing or broken falls back to the game's default price; a fee falls
 * back to 0, as the rest of the app reads a fee the backend did not send.
 */
export function demoOptionsFor(role: TourRole, config: GameConfig): DemoOptions {
  const econ = SIM_CONFIG.economics;
  return {
    role,
    roundNumber: config.round === 2 ? 2 : 1,
    fees: {
      marketPrice: amount(config.marketPrice, econ.marketPrice),
      costOfPublishing: amount(config.costOfPublishing, econ.costOfPublishing),
      costOfDiscard: amount(config.costOfDiscard, econ.costOfDiscard),
      shippingFeeSmall: amount(config.shippingFeeSmall, 0),
      shippingFeeStandard: amount(config.shippingFeeStandard, 0),
      shippingFeeLarge: amount(config.shippingFeeLarge, 0),
      storageFeePerJokeMinute: amount(config.storageFeePerJokeMinute, 0),
      hostingFeePerJokeMinute: amount(config.hostingFeePerJokeMinute, 0),
    },
  };
}

/* ---------------------------------------------------------------- building blocks */

const isDecided = (b: Batch) => b.status === 'PROCESSED' || b.status === 'RATED';

function joke(id: number, text: string, extra: Partial<Joke> = {}): Joke {
  return { joke_id: id as JokeId, joke_text: text, id: String(id), content: text, ...extra };
}

function batch(id: number, jokes: Joke[], sentS: number, extra: Partial<Batch> = {}): Batch {
  return {
    batch_id: id, round_id: 1, team_id: DEMO_TEAM_ID, status: 'SUBMITTED', jokes,
    submitted_at: iso(sentS), id: String(id), team: String(DEMO_TEAM_ID), round: 1,
    submittedAt: at(sentS), tagSummary: [], marketing_note: null,
    ...extra,
  };
}

/** A sent batch as the team's browser shows it: the pasted jokes, all still with Marketing. */
const waitingBatch = (id: number, sentS: number) =>
  batch(id, DEMO_JOKES.map((text, n) => joke(demoJokeId(id, n), text)), sentS);

const waitingCount = (s: DemoState) => s.game.batches.filter(b => b.status === 'SUBMITTED').length;
/** Jokes a batch is charged for: its jokes, or the standard 5 while unsplit. */
const jokesOf = (b: Batch) => (b.jokes.length > 0 ? b.jokes.length : STANDARD_SHIPMENT_JOKES);
const minutes = (fromMs: number, toMs: number) => Math.max(0, toMs - fromMs) / 60_000;

/** The team's three Lean fees at the demo clock (see the formulas at the top). */
export function demoFees(batches: readonly Batch[], fees: TourMoney, clockMs: number): { shipping: number; storage: number; hosting: number } {
  let shipping = 0;
  let storage = 0;
  let hosting = 0;
  for (const b of batches) {
    shipping += shippingFeeFor(jokesOf(b), fees);
    const sent = b.submittedAt ?? clockMs;
    const left = isDecided(b) && b.ratedAt != null ? Math.min(b.ratedAt, clockMs) : clockMs;
    storage += jokesOf(b) * minutes(sent, left) * fees.storageFeePerJokeMinute;
    if (isDecided(b) && b.ratedAt != null) {
      const unsold = b.jokes.filter(j => j.is_published && !((j.sold_count ?? 0) > 0)).length;
      hosting += unsold * minutes(b.ratedAt, clockMs) * fees.hostingFeePerJokeMinute;
    }
  }
  return { shipping, storage, hosting };
}

/** Recomputes the team summary (and Marketing's queue size) from the batches and the clock. */
export function settle(s: DemoState): DemoState {
  const { fees } = s.options;
  const decided = s.game.batches.filter(isDecided);
  const created = decided.reduce((n, b) => n + b.jokes.length, 0);
  const published = decided.reduce((n, b) => n + b.jokes.filter(j => j.is_published).length, 0);
  const sales = s.game.batches.reduce((n, b) => n + b.jokes.reduce((m, j) => m + (j.sold_count ?? 0), 0), 0);
  const waiting = waitingCount(s);
  const lean = demoFees(s.game.batches, fees, s.ui.clockMs);
  const classic = computeProfit({ created, published, sold: sales }, fees);
  const leanStats: LeanTeamStats = {
    batches_submitted: s.game.batches.length,
    shipping_cost: lean.shipping,
    storage_cost: lean.storage,
    hosting_cost: lean.hosting,
    setup_cost: lean.shipping,
    carrying_cost: lean.storage + lean.hosting,
    avg_submit_to_publish_s: 60,
    avg_publish_to_first_sale_s: 75,
    batch_series: [],
  };
  const summary: ApiTeamSummaryResponse = {
    team: { id: DEMO_TEAM_ID, name: DEMO_TEAM_NAME },
    round_id: 1,
    rank: 2,
    points: sales,
    total_sales: sales,
    profit: classic - lean.shipping - lean.storage - lean.hosting,
    batches_created: s.game.batches.length,
    batches_processed: decided.length,
    published_jokes: published,
    unprocessed_batches: waiting,
    unsold_jokes: Math.max(0, published - sales),
    jokes_created: created,
    jokes_published: published,
    cost_breakdown: {
      revenue: sales * fees.marketPrice,
      publish_cost: published * fees.costOfPublishing,
      discard_cost: (created - published) * fees.costOfDiscard,
      profit: classic,
    },
    lean: leanStats,
  };
  const qcQueue = s.game.qcQueue ? { ...s.game.qcQueue, queue_size: waiting } : null;
  return { ...s, game: { ...s.game, teamSummary: summary, qcQueue } };
}

const withUi = (s: DemoState, ui: Partial<DemoUi>): DemoState => settle({ ...s, ui: { ...s.ui, ...ui } });
const withGame = (s: DemoState, game: Partial<DemoGameData>): DemoState => settle({ ...s, game: { ...s.game, ...game } });
const mapBatch = (s: DemoState, id: number, f: (b: Batch) => Batch): DemoState =>
  withGame(s, { batches: s.game.batches.map(b => (b.batch_id === id ? f(b) : b)) });
const mapJoke = (s: DemoState, batchId: number, n: number, f: (j: Joke) => Joke): DemoState =>
  mapBatch(s, batchId, b => ({ ...b, jokes: b.jokes.map((j, i) => (i === n ? f(j) : j)) }));
const clockAt = (s: DemoState, seconds: number): DemoState => withUi(s, { clockMs: at(seconds) });

/* ---------------------------------------------------------------- the start */

function demoUser(role: TourRole): User {
  return {
    user_id: 900, display_name: 'You', role: role as Role, team_id: DEMO_TEAM_ID,
    id: '900', name: 'You', team: String(DEMO_TEAM_ID), wallet: 0, purchasedJokes: [],
  };
}

function demoConfig(o: DemoOptions): GameConfig {
  return {
    status: 'PLAYING', round: o.roundNumber, isActive: true, showTeamPopup: false, startTime: null, elapsedTime: 0,
    customerBudget: 3, round1BatchSize: 5, round2BatchLimit: 10,
    marketPrice: o.fees.marketPrice, costOfPublishing: o.fees.costOfPublishing, costOfDiscard: o.fees.costOfDiscard,
    marketingNudge1Seconds: 60, marketingNudge2Seconds: 45, idealProfile: {},
    marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
    shippingFeeSmall: o.fees.shippingFeeSmall, shippingFeeStandard: o.fees.shippingFeeStandard,
    shippingFeeLarge: o.fees.shippingFeeLarge, storageFeePerJokeMinute: o.fees.storageFeePerJokeMinute,
    hostingFeePerJokeMinute: o.fees.hostingFeePerJokeMinute, customersPerTeam: 18,
  };
}

const EARLIER_FEEDBACK: TeamFeedbackResponse = {
  jokes: [
    {
      joke_id: demoJokeId(EARLIER_BATCH_ID, 3), joke_title: 'Desk Plant Solidarity', was_bought: true,
      good_dimensions: ['TOPIC', 'LENGTH', 'CLARITY'], improve_dimensions: ['WORDPLAY'],
    },
    {
      joke_id: demoJokeId(EARLIER_BATCH_ID, 2), joke_title: 'Coffee Confidential', was_bought: true,
      good_dimensions: ['TOPIC', 'STRUCTURE'], improve_dimensions: ['FRESHNESS', 'WORDPLAY'],
    },
    {
      joke_id: demoJokeId(EARLIER_BATCH_ID, 0), joke_title: 'Reaction Overload', was_bought: false,
      good_dimensions: ['LENGTH'], improve_dimensions: ['TOPIC', 'SETUP_PAYOFF', 'TITLE_FIT'],
    },
  ],
};

/** Team Demo when the tour opens: one earlier batch on the market, 2 of its 5 jokes sold. */
export function initialDemoState(options: DemoOptions): DemoState {
  const earlier = batch(
    EARLIER_BATCH_ID,
    EARLIER_JOKES.map((text, n) => joke(demoJokeId(EARLIER_BATCH_ID, n), text, {
      is_published: true, sold_count: n === 2 || n === 3 ? 1 : 0,
    })),
    DEMO_TIMES.earlierSent,
    { status: 'PROCESSED', rated_at: iso(DEMO_TIMES.earlierReleased), ratedAt: at(DEMO_TIMES.earlierReleased) },
  );
  return settle({
    options,
    ui: { ...EMPTY_DEMO_UI, clockMs: at(DEMO_TIMES.tourStart) },
    game: {
      user: demoUser(options.role),
      roster: [demoUser(options.role)],
      config: demoConfig(options),
      teamNames: { [String(DEMO_TEAM_ID)]: DEMO_TEAM_NAME },
      batches: [earlier],
      sales: {},
      roundId: 1,
      roundIds: { 1: 1, 2: null },
      roundStatuses: { 1: 'ACTIVE', 2: null },
      marketItems: [],
      teamSummary: null,
      teamFeedback: EARLIER_FEEDBACK,
      instructorLobby: null,
      instructorStats: null,
      instructorStatsRound1: null,
      instructorStatsRound2: null,
      qcQueue: null,
    },
  });
}

/* ---------------------------------------------------------------- script: Joke Maker */

/** The textbox holds the pasted batch (typed in by the stage). */
export const typeDraft = (s: DemoState) => withUi(s, { jmDraft: DEMO_RAW_BATCH });
/** "I certify these jokes are not offensive." is ticked. */
export const certify = (s: DemoState) => withUi(s, { jmCertified: true });

/** Send to Marketing: the textbox clears and batch #102 waits for Marketing. */
export function sendBatch(s: DemoState): DemoState {
  const cleared = clockAt(withUi(s, { jmDraft: '', jmCertified: false }), DEMO_TIMES.sent);
  return withGame(cleared, { batches: [...cleared.game.batches, waitingBatch(SENT_BATCH_ID, DEMO_TIMES.sent)] });
}

/** The sent batch's row is expanded in Value stream. */
export const openSentBatch = (s: DemoState) => withUi(s, { jmOpenBatchIds: [String(SENT_BATCH_ID)] });

/* ---------------------------------------------------------------- script: Marketing */

function landOnDesk(s: DemoState, id: number, sentS: number, seenS: number): DemoState {
  const withBatch = clockAt(withGame(s, { batches: [...s.game.batches, waitingBatch(id, sentS)] }), seenS);
  return withGame(withBatch, {
    qcQueue: {
      batch: { batch_id: id, round_id: 1, team_id: DEMO_TEAM_ID, submitted_at: iso(sentS), raw_text: DEMO_RAW_BATCH },
      jokes: [],
      queue_size: 0,
    },
  });
}

/** The Joke Maker's batch #102 lands on Marketing's desk, not yet split. */
export const batchArrives = (s: DemoState) => landOnDesk(s, SENT_BATCH_ID, DEMO_TIMES.sent, DEMO_TIMES.arrivedOnDesk);

/** Marketing splits the batch on its desk into its five jokes. */
export function splitOnDesk(s: DemoState): DemoState {
  if (!s.game.qcQueue) return s;
  const id = s.game.qcQueue.batch.batch_id;
  return withGame(s, {
    qcQueue: { ...s.game.qcQueue, jokes: DEMO_JOKES.map((text, n) => ({ joke_id: demoJokeId(id, n) as JokeId, joke_text: text })) },
  });
}

/** Marketing selects the k-th joke it keeps. */
export const pick = (k: number) => (s: DemoState): DemoState => {
  const id = demoJokeId(SENT_BATCH_ID, DEMO_KEEP[k].index);
  return s.ui.mkSelectedIds.includes(id) ? s : withUi(s, { mkSelectedIds: [...s.ui.mkSelectedIds, id] });
};

/** Every kept joke gets its Topic and title (the stage types the first title in). */
export function topicsAndTitles(s: DemoState): DemoState {
  const mkTopics: Record<number, string> = {};
  const mkTitles: Record<number, string> = {};
  for (const k of DEMO_KEEP) {
    const id = demoJokeId(SENT_BATCH_ID, k.index);
    mkTopics[id] = k.topic;
    mkTitles[id] = k.title;
  }
  return withUi(s, { mkSelectedIds: DEMO_KEEP.map(k => demoJokeId(SENT_BATCH_ID, k.index)), mkTopics, mkTitles });
}

/** The note box holds Marketing's note (typed in by the stage). */
export const writeNote = (s: DemoState) => withUi(s, { mkNote: DEMO_NOTE });

/** "More numbers" opens, showing the Shipping, Storage and Hosting fee tiles. */
export const openMore = (s: DemoState) => withUi(s, { moreOpen: true });

/** The next batch, #103, has been waiting on Marketing's desk for 52 s. */
export const nextBatchArrives = (s: DemoState) => landOnDesk(s, NEXT_BATCH_ID, DEMO_TIMES.nextSent, DEMO_TIMES.nextSeen);

/* ---------------------------------------------------------------- both tours */

/** Marketing releases #102: 3 jokes on the market, 2 dropped, with its note. The desk is clear again. */
export function releaseSentBatch(s: DemoState): DemoState {
  const keep = new Set(DEMO_KEEP.map(k => k.index));
  const released = mapBatch(s, SENT_BATCH_ID, b => ({
    ...b,
    status: 'PROCESSED',
    rated_at: iso(DEMO_TIMES.released),
    ratedAt: at(DEMO_TIMES.released),
    marketing_note: DEMO_NOTE,
    jokes: DEMO_JOKES.map((text, n) => joke(demoJokeId(SENT_BATCH_ID, n), text, { is_published: keep.has(n), sold_count: 0 })),
  }));
  const cleared = withUi(released, { mkSelectedIds: [], mkTopics: {}, mkTitles: {}, mkNote: '' });
  return clockAt(withGame(cleared, { qcQueue: null }), DEMO_TIMES.released);
}

/** A customer buys the first joke Marketing kept. */
export const firstSale = (s: DemoState) =>
  mapJoke(s, SENT_BATCH_ID, DEMO_KEEP[0].index, j => ({ ...j, sold_count: (j.sold_count ?? 0) + 1 }));

/** The customers' read on that sale reaches Marketing's feedback card: ✓ and ✗ criteria boxes. */
export function customersReport(s: DemoState): DemoState {
  const id = demoJokeId(SENT_BATCH_ID, DEMO_KEEP[0].index);
  const rest = (s.game.teamFeedback?.jokes ?? []).filter(j => j.joke_id !== id);
  return withGame(s, {
    teamFeedback: {
      jokes: [
        {
          joke_id: id, joke_title: DEMO_KEEP[0].title, was_bought: true,
          good_dimensions: ['TOPIC', 'LENGTH', 'STRUCTURE'], improve_dimensions: ['WORDPLAY'],
        },
        ...rest,
      ],
    },
  });
}

/* ---------------------------------------------------------------- frames */

/** Typing finishes at this share of its step. */
export const TYPING_SHARE = 0.7;

/** Characters shown at `elapsedMs` into a typing step; everything at once with reduced motion. */
export function typedLength(length: number, elapsedMs: number, durationMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return length;
  const share = Math.min(1, Math.max(0, elapsedMs / (durationMs * TYPING_SHARE)));
  return Math.floor(length * share);
}

function typingValue(ui: DemoUi, field: TypingField): string {
  if (field === 'jmDraft') return ui.jmDraft;
  if (field === 'mkNote') return ui.mkNote;
  const first = ui.mkSelectedIds[0];
  return first == null ? '' : ui.mkTitles[first] ?? '';
}

/** The ui with `field` cut to its first `chars` characters. */
export function revealTyping(ui: DemoUi, field: TypingField, chars: number): DemoUi {
  const text = typingValue(ui, field).slice(0, Math.max(0, chars));
  if (field === 'jmDraft') return { ...ui, jmDraft: text };
  if (field === 'mkNote') return { ...ui, mkNote: text };
  const first = ui.mkSelectedIds[0];
  return first == null ? ui : { ...ui, mkTitles: { ...ui.mkTitles, [first]: text } };
}

const sortedBeats = (step: DemoStep) => [...(step.beats ?? [])].sort((a, b) => a.atMs - b.atMs);

/**
 * The state for step k, `elapsedMs` into it, rebuilt from scratch: the onEnter
 * and every beat of the steps before k, then step k's onEnter and its beats
 * whose time has come. Same arguments, same state.
 */
export function buildDemoState(steps: ReadonlyArray<DemoStep>, k: number, options: DemoOptions, elapsedMs = 0): DemoState {
  let s = initialDemoState(options);
  const last = Math.min(Math.max(0, Math.floor(k)), steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const step = steps[i];
    if (step.onEnter) s = step.onEnter(s);
    for (const beat of sortedBeats(step)) {
      if (i < last || beat.atMs <= elapsedMs) s = beat.apply(s);
    }
  }
  return s;
}

/** What the stage shows: buildDemoState, with step k's typing field part-typed. */
export function demoFrame(
  steps: ReadonlyArray<DemoStep>, k: number, options: DemoOptions, elapsedMs: number, reducedMotion: boolean,
): DemoState {
  const s = buildDemoState(steps, k, options, elapsedMs);
  const step = steps[Math.min(Math.max(0, k), steps.length - 1)];
  if (!step?.typing) return s;
  const full = typingValue(s.ui, step.typing).length;
  return { ...s, ui: revealTyping(s.ui, step.typing, typedLength(full, elapsedMs, stepDuration(step), reducedMotion)) };
}

/**
 * Changes exactly when demoFrame's result would: the step, the beats that have
 * fired, and how far the typing has got. The stage memoises on it, so the
 * clock's 100 ms ticks do not re-render the view in between.
 */
export function demoFrameKey(steps: ReadonlyArray<DemoStep>, k: number, elapsedMs: number, reducedMotion: boolean): string {
  const step = steps[k];
  if (!step) return `${k}`;
  const beats = (step.beats ?? []).filter(b => b.atMs <= elapsedMs).length;
  const typed = step.typing && !reducedMotion
    ? Math.floor(Math.min(1, Math.max(0, elapsedMs / (stepDuration(step) * TYPING_SHARE))) * 1000)
    : 0;
  return `${k}:${beats}:${typed}`;
}
```

- [ ] **Step 4: Write the two tours**

Create `services/tour/tourSteps.ts`:

```ts
/* The two student tours (spec §4): the Joke Maker's and Marketing's, about a
   minute each. Captions are the spec's copy; every amount in them is read from
   the round (stepsFor fills them in), formatted as the game formats money:
   fmtFee for prices and fees ("$2", "$0.10"), cents for per-minute rates
   ("5¢"). The only round-dependent copy is the Joke Maker's shipping step.

   `target` is a data-tour id on the real screen (views/JokeMaker.tsx,
   views/QualityControl.tsx, components/StatTiles.tsx,
   components/CustomerFeedbackCard.tsx); null shows a centred card. */
import { fmtCents, fmtFee, fmtPerMinute } from '../leanMode';
import {
  batchArrives, certify, customersReport, firstSale, nextBatchArrives, openMore, openSentBatch, pick,
  releaseSentBatch, sendBatch, splitOnDesk, topicsAndTitles, typeDraft, writeNote,
  type DemoStep, type TourRound,
} from './demoScript';
import type { TourRole } from './seen';

export const JOKE_MAKER_STEPS: readonly DemoStep[] = [
  {
    id: 'jm-welcome', target: null,
    title: "You're the Joke Maker.",
    body: "Your team earns money when AI customers buy your jokes. Here's your screen in one minute.",
  },
  {
    id: 'jm-write', target: 'jm-draft', durationMs: 7000,
    title: 'Write, then paste.',
    body: 'Write jokes with your AI tool and paste the whole reply here. Marketing splits it into separate jokes.',
    onEnter: typeDraft, typing: 'jmDraft',
  },
  {
    id: 'jm-send', target: 'jm-send',
    title: 'Send a batch.',
    body: 'Tick the box and press Send to Marketing. Each send is one batch.',
    onEnter: certify, beats: [{ atMs: 3000, apply: sendBatch }],
  },
  {
    id: 'jm-shipping', target: 'jm-shipping',
    title: 'Every batch pays shipping.',
    body: ({ roundNumber, fees }) => (roundNumber === 1
      ? `Each batch of 5 costs ${fmtFee(fees.shippingFeeStandard)} to ship, so keep them coming but make them count.`
      : `You choose the size now: ${fmtFee(fees.shippingFeeSmall)} for 1–4 jokes, ${fmtFee(fees.shippingFeeStandard)} for 5, ${fmtFee(fees.shippingFeeLarge)} for 6–10. Smaller batches come back with feedback sooner.`),
  },
  {
    id: 'jm-next', target: 'jm-next-step',
    title: 'Your next step.',
    body: "This line watches the game and tells you what to do next. Glance at it whenever you're unsure.",
  },
  {
    id: 'jm-value-stream', target: 'jm-value-stream',
    title: 'Follow your batches.',
    body: 'Each row is a batch. The dots show where every joke is: with Marketing, on the market, sold or wasted.',
    beats: [{ atMs: 2000, apply: releaseSentBatch }, { atMs: 4000, apply: firstSale }],
  },
  {
    id: 'jm-note', target: 'jm-marketing-note',
    title: "Read Marketing's note.",
    body: 'Marketing tells you what customers liked and what to change. Read it before you write the next batch.',
    onEnter: openSentBatch,
  },
  {
    id: 'jm-scoreboard', target: 'jm-stats',
    title: 'Your scoreboard.',
    body: 'Profit is sales minus fees, and it can go negative. Rank, Jokes Sold / Made and Created to Publish (how long a joke takes to reach the market) complete it. "More numbers" shows the rest.',
  },
  {
    id: 'jm-customers', target: null,
    title: 'How customers buy.',
    body: 'AI customers are picky: they judge every joke on 12 criteria and only buy the ones that fit what they like. Better-aimed jokes beat lots of random ones.',
  },
  {
    id: 'jm-goal', target: null, finishLabel: 'Start',
    title: 'Your goal.',
    body: 'Keep the line moving, learn from each batch, and improve the next one.',
  },
];

export const MARKETING_STEPS: readonly DemoStep[] = [
  {
    id: 'mk-welcome', target: null,
    title: "You're Marketing.",
    body: ({ fees }) => `You decide which jokes go to market. Listing a joke costs ${fmtFee(fees.costOfPublishing)}, and each sale earns ${fmtFee(fees.marketPrice)}.`,
  },
  {
    id: 'mk-arrives', target: 'mk-desk',
    title: 'A batch arrives.',
    body: "Your Joke Maker's batch lands here. Split it into separate jokes.",
    onEnter: batchArrives, beats: [{ atMs: 3000, apply: splitOnDesk }],
  },
  {
    id: 'mk-pick', target: 'mk-jokes',
    title: 'Pick the winners — quickly.',
    body: ({ fees }) => `Keep the jokes customers will buy and drop the rest (dropping costs ${fmtFee(fees.costOfDiscard)}). Don't be too strict: customers can only buy what's on the shelf.`,
    onEnter: pick(0), beats: [{ atMs: 1500, apply: pick(1) }, { atMs: 3000, apply: pick(2) }],
  },
  {
    id: 'mk-title', target: 'mk-topic-title',
    title: 'Topic and title.',
    body: 'Give each joke a topic and a title. A good title helps it sell.',
    onEnter: topicsAndTitles, typing: 'mkTitle',
  },
  {
    id: 'mk-note', target: 'mk-note', durationMs: 7000,
    title: 'Tell your Joke Maker.',
    body: 'Say what to change next. Your note is sent with this batch.',
    onEnter: writeNote, typing: 'mkNote',
  },
  {
    id: 'mk-release', target: 'mk-release', durationMs: 5000,
    title: 'Release.',
    body: 'Released jokes go on the market, where customers start buying.',
  },
  {
    id: 'mk-scoreboard', target: 'mk-stats',
    title: 'Your scoreboard.',
    body: 'Profit, your rank, how many jokes have sold, and how many batches are waiting on your desk.',
    onEnter: releaseSentBatch, beats: [{ atMs: 3000, apply: firstSale }],
  },
  {
    id: 'mk-fees', target: 'mk-more', durationMs: 7000,
    title: 'Fees add up.',
    body: ({ fees }) => `Every batch pays shipping. A batch waiting on your desk pays storage (${fmtCents(fees.storageFeePerJokeMinute)} a joke each minute), and an unsold joke pays hosting (${fmtPerMinute(fees.hostingFeePerJokeMinute)}). Holding batches only costs money: release quickly.`,
    onEnter: s => nextBatchArrives(openMore(s)),
  },
  {
    id: 'mk-next', target: 'mk-next-step',
    title: 'Your next step.',
    body: 'This line watches the game and tells you what to do next, like releasing a batch that has waited too long.',
  },
  {
    id: 'mk-feedback', target: 'mk-feedback',
    title: 'What customers said.',
    body: 'For your latest jokes: which criteria landed and which missed. It never says by how much.',
    onEnter: customersReport,
  },
  {
    id: 'mk-expand', target: 'mk-expand', durationMs: 5000,
    title: 'Keep it in view.',
    body: 'Expand opens the feedback in a floating window that stays on top while you work.',
  },
  {
    id: 'mk-goal', target: null, finishLabel: 'Start',
    title: 'Your goal.',
    body: 'Ship what sells, tell your Joke Maker why, and improve every batch.',
  },
];

/** A step's caption, with the round's amounts filled in. */
export function captionText(step: Pick<DemoStep, 'body'>, round: TourRound): string {
  return typeof step.body === 'function' ? step.body(round) : step.body;
}

/** The role's tour for this round, every caption filled in from the round. */
export function stepsFor(role: TourRole, round: TourRound): DemoStep[] {
  const all = role === 'JOKE_MAKER' ? JOKE_MAKER_STEPS : MARKETING_STEPS;
  return all.map(step => ({ ...step, body: captionText(step, round) }));
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run services/tour/demoScript.test.ts services/tour/tourSteps.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  2 passed (2)`, `Tests  33 passed (33)`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc prints nothing and exits 0; `Test Files  53 passed (53)`, `Tests  858 passed (858)`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add services/tour/demoScript.ts services/tour/tourSteps.ts services/tour/demoScript.test.ts services/tour/tourSteps.test.ts
git commit -m "feat(tour): Team Demo's script and the Joke Maker and Marketing tours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Task 4: The demo stage on the real screens — data-tour targets and script-driven local state

**Files:**
- Create: `components/tour/DemoStage.tsx`
- Modify: `components/ui.tsx` (`Card` gets `tour`), `components/StatTiles.tsx` (`open`, `tourKey`, `tourMore`), `views/JokeMaker.tsx` (import, `BatchCard` note wrapper, local state → demo-aware, six `data-tour` ids, Next step clock), `views/QualityControl.tsx` (import, local state → demo-aware, eight `data-tour` ids, Next step clock), `components/CustomerFeedbackCard.tsx` (two `data-tour` ids), `components/tour/demoMode.test.ts` (the audit walks the stage too)
- Test: `components/tour/DemoStage.test.ts`

**Interfaces:**
- Consumes: Task 1 `DemoModeContext`, `useDemoUi` (`context.tsx`), `GameContext`, `demoGameContext` (`services/tour/demoGame.ts`); Task 3 `DemoState`, `DemoOptions`, `TourMoney`, `demoFrame`, `DEMO_JOKES`, `DEMO_NOTE`, `DEMO_RAW_BATCH` (`services/tour/demoScript.ts`), `stepsFor` (`services/tour/tourSteps.ts`); Task 2 `stepDuration`.
- Produces:
  ```ts
  // components/tour/DemoStage.tsx
  export interface DemoStageProps { view: React.ComponentType; frame: DemoState; stageRef?: React.Ref<HTMLDivElement> }
  export const DemoStage: React.FC<DemoStageProps>; // memoised; root <div data-tour-stage inert aria-hidden="true" class="fixed inset-0 z-[60] overflow-y-auto …">
  // components/ui.tsx — Card props gain `tour?: string`, rendered as data-tour on the card's root.
  // components/StatTiles.tsx — StatTiles props gain:
  //   open?: boolean   (controlled: overrides the remembered choice, which is then neither read nor written)
  //   tourKey?: string (data-tour on the key-tile grid)   tourMore?: string (data-tour on the More numbers panel)
  ```
  `data-tour` ids on the real screens: Joke Maker `jm-draft`, `jm-send`, `jm-shipping`, `jm-next-step`, `jm-value-stream`, `jm-marketing-note`, `jm-stats`; Marketing `mk-desk`, `mk-jokes`, `mk-topic-title`, `mk-note`, `mk-release`, `mk-stats`, `mk-more`, `mk-next-step`, `mk-feedback`, `mk-expand`.

How the views read the script: inside the stage, `useDemoUi()` returns the frame's `DemoUi`, and the views use it in place of their own state — the Joke Maker's `input`, `certified`, `openSet`; Marketing's `orderIds` (the arrival order), `topics`, `titles`, `selectedIds`, `batchFeedback`; both screens' "More numbers" (`open` on `StatTiles`) and the Next step line's clock (`demoUi.clockMs` instead of `Date.now()`, so the real rule functions in `services/nextStep.ts` read the demo's timeline). Each state hook is renamed `…State`, and the old name becomes "demo value if in the stage, else the state", so no other line of either view changes and the real game behaves exactly as before (`useDemoUi()` is `null` there). The setters keep their names.

- [ ] **Step 1: Write the failing test**

Create `components/tour/DemoStage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoStage } from './DemoStage';
import JokeMaker from '../../views/JokeMaker';
import QualityControl from '../../views/QualityControl';
import { StatTiles } from '../StatTiles';
import {
  DEMO_JOKES, DEMO_NOTE, DEMO_RAW_BATCH, demoFrame, type DemoOptions, type TourMoney,
} from '../../services/tour/demoScript';
import { stepsFor } from '../../services/tour/tourSteps';
import { stepDuration } from '../../services/tour/tourMachine';
import type { TourRole } from '../../services/tour/seen';

/* The guided tour spotlights real elements by their data-tour id. Rendered
   statically here — every step of both tours, in Round 1 and Round 2, at the
   start and at the end of the step — each step's target must be on the demo
   screen, so no step ever falls back to a centred card in a real class. */

const FEES: TourMoney = {
  marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3,
  storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05,
};
const VIEW = { JOKE_MAKER: JokeMaker, QUALITY_CONTROL: QualityControl } as const;
const ROLES: TourRole[] = ['JOKE_MAKER', 'QUALITY_CONTROL'];
const opts = (role: TourRole, roundNumber: 1 | 2 = 1): DemoOptions => ({ role, roundNumber, fees: FEES });

const stepsOf = (o: DemoOptions) => stepsFor(o.role, o);
const render = (o: DemoOptions, k: number, elapsedMs: number, reducedMotion = false) =>
  renderToStaticMarkup(createElement(DemoStage, {
    view: VIEW[o.role], frame: demoFrame(stepsOf(o), k, o, elapsedMs, reducedMotion),
  }));
const renderStep = (o: DemoOptions, id: string, elapsedMs = 0, reducedMotion = false) =>
  render(o, stepsOf(o).findIndex(s => s.id === id), elapsedMs, reducedMotion);
const has = (html: string, id: string) => html.includes(`data-tour="${id}"`);

class SpyStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes.push(`set ${k}`); this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes.push(`remove ${k}`); this.map.delete(k); }
  clear() { this.writes.push('clear'); this.map.clear(); }
}

const realFetch = globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;
let storage: SpyStorage;
beforeEach(() => {
  fetchSpy = vi.fn(async () => { throw new Error('network call from the demo'); });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  storage = new SpyStorage();
  (globalThis as any).localStorage = storage;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).localStorage;
});

describe('every step target is on the demo screen', () => {
  for (const roundNumber of [1, 2] as const) {
    for (const role of ROLES) {
      const o = opts(role, roundNumber);
      for (const [k, step] of stepsOf(o).entries()) {
        if (step.target === null) continue;
        it(`${role} · Round ${roundNumber} · ${step.id} → [data-tour="${step.target}"]`, () => {
          expect(has(render(o, k, 0), step.target!)).toBe(true);
          expect(has(render(o, k, stepDuration(step)), step.target!)).toBe(true);
        });
      }
    }
  }
});

describe('the demo plays on the real screen', () => {
  it('types the batch into the Joke Maker textbox, and shows Marketing\'s note under the batch', () => {
    const o = opts('JOKE_MAKER');
    const typed = renderStep(o, 'jm-write', 7000);
    expect(typed).toContain(DEMO_JOKES[4].replace(/'/g, '&#x27;'));
    expect(typed).toContain(`${DEMO_RAW_BATCH.trim().length} chars`);
    expect(renderStep(o, 'jm-write', 0)).toContain('0 chars');
    const note = renderStep(o, 'jm-note');
    expect(note).toContain('From Marketing');
    expect(note).toContain(DEMO_NOTE);
    expect(note).toContain('Team Demo');
  });

  it('shows the round\'s shipping line: Round 1 one size, Round 2 three', () => {
    expect(renderStep(opts('JOKE_MAKER', 1), 'jm-shipping')).toContain('Shipping: $2 per batch of 5');
    expect(renderStep(opts('JOKE_MAKER', 2), 'jm-shipping')).toContain('Shipping: $1 for 1–4 jokes · $2 for 5 · $3 for 6–10');
  });

  it('the Next step line reads the demo, not the wall clock', () => {
    expect(renderStep(opts('JOKE_MAKER'), 'jm-next')).toContain('Keep writing — every batch is another chance to sell.');
    expect(renderStep(opts('QUALITY_CONTROL'), 'mk-next')).toContain(
      'Batch waiting 52 s — release what&#x27;s good enough. Storage costs 5¢ a joke each minute.',
    );
  });

  it('splits the batch, picks three and types the note on Marketing\'s desk', () => {
    const o = opts('QUALITY_CONTROL');
    expect(renderStep(o, 'mk-arrives', 0)).toContain('Split the batch.');
    expect(renderStep(o, 'mk-arrives', 3000)).toContain('Click to add');
    expect(renderStep(o, 'mk-pick', 3000).split('Selected to submit')).toHaveLength(4);
    expect(renderStep(o, 'mk-note', 7000)).toContain(`${DEMO_NOTE.length}/500`);
    expect(renderStep(o, 'mk-note', 0)).toContain('0/500');
    expect(renderStep(o, 'mk-note', 0, true)).toContain(`${DEMO_NOTE.length}/500`);
  });

  it('opens "More numbers" for the fees step, with the three fee tiles, and shows the new feedback card', () => {
    const o = opts('QUALITY_CONTROL');
    expect(renderStep(o, 'mk-scoreboard')).toContain('More numbers');
    expect(renderStep(o, 'mk-scoreboard')).not.toContain('Shipping fees');
    const fees = renderStep(o, 'mk-fees');
    for (const tile of ['Fewer numbers', 'Shipping fees', 'Storage fees', 'Hosting fees']) expect(fees).toContain(tile);
    expect(renderStep(o, 'mk-feedback')).toContain('To-Do Overload');
    expect(renderStep(o, 'mk-expand')).toContain('Expand');
  });

  it('ignores the student\'s own "More numbers" choice and never writes it', () => {
    storage.setItem('jf_more_tiles_joke_maker', '1');
    storage.setItem('jf_more_tiles_quality_control', '1');
    storage.writes = [];
    expect(renderStep(opts('JOKE_MAKER'), 'jm-scoreboard')).not.toContain('Fewer numbers');
    expect(renderStep(opts('QUALITY_CONTROL'), 'mk-scoreboard')).not.toContain('Fewer numbers');
    expect(storage.writes).toEqual([]);
  });

  it('is inert and hidden from assistive technology', () => {
    const stage = render(opts('JOKE_MAKER'), 0, 0).match(/<div[^>]*data-tour-stage=""[^>]*>/)![0];
    expect(stage).toContain('inert=""');
    expect(stage).toContain('aria-hidden="true"');
  });

  it('never makes a request or writes localStorage, in any frame', () => {
    for (const roundNumber of [1, 2] as const) for (const role of ROLES) {
      const o = opts(role, roundNumber);
      for (const [k, step] of stepsOf(o).entries()) {
        render(o, k, 0);
        render(o, k, stepDuration(step));
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([]);
  });
});

describe('StatTiles open from the outside (the demo)', () => {
  const tiles = (open?: boolean) => renderToStaticMarkup(createElement(StatTiles, {
    keyTiles: [createElement('i', { key: 'a' }, 'KeyA')], moreTiles: [createElement('i', { key: 'c' }, 'MoreC')],
    storageKey: 'k', open, tourKey: 'x-key', tourMore: 'x-more',
  }));

  it('open wins over the remembered choice, both ways', () => {
    storage.setItem('k', '1');
    expect(tiles(false)).not.toContain('MoreC');
    storage.setItem('k', '0');
    expect(tiles(true)).toContain('MoreC');
    expect(tiles(undefined)).not.toContain('MoreC');
  });

  it('carries the data-tour ids on the key grid and the More panel', () => {
    const out = tiles(true);
    expect(out).toContain('data-tour="x-key"');
    expect(out).toContain('data-tour="x-more"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/DemoStage.test.ts 2>&1 | grep -E 'FAIL|Test Files'`
Expected: `FAIL  components/tour/DemoStage.test.ts` — the file does not load (`Failed to load url ./DemoStage`); `Test Files  1 failed (1)`.

- [ ] **Step 3: Let a Card and the stat tiles carry data-tour ids, and let the demo open "More numbers"**

In `components/ui.tsx`, replace:

```tsx
  action?: React.ReactNode;
  accent?: string;
}> = ({ children, className = '', title, subtitle, action, accent }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}
```

with:

```tsx
  action?: React.ReactNode;
  accent?: string;
  /** `data-tour` id: the guided tour can spotlight this card (services/tour/tourSteps.ts). */
  tour?: string;
}> = ({ children, className = '', title, subtitle, action, accent, tour }) => (
  <div
    data-tour={tour}
    className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}
```

In `components/StatTiles.tsx`, replace:

```tsx
  /** Start open (tests); default is the remembered choice, else closed. */
  initialOpen?: boolean;
}> = ({ keyTiles, moreTiles, storageKey, initialOpen }) => {
  const [open, setOpen] = useState(() => initialOpen ?? readMoreOpen(storageKey));
  const panelId = useId();
  const toggle = () => {
    const next = !open;
```

with:

```tsx
  /** Start open (tests); default is the remembered choice, else closed. */
  initialOpen?: boolean;
  /** Controlled (the guided tour's demo): open or closed whatever the student
      chose. The remembered choice is then neither read nor written. */
  open?: boolean;
  /** data-tour ids for the guided tour: the key-tile grid and the More numbers panel. */
  tourKey?: string;
  tourMore?: string;
}> = ({ keyTiles, moreTiles, storageKey, initialOpen, open: forcedOpen, tourKey, tourMore }) => {
  const [openState, setOpen] = useState(() => forcedOpen ?? initialOpen ?? readMoreOpen(storageKey));
  const open = forcedOpen ?? openState;
  const panelId = useId();
  const toggle = () => {
    if (forcedOpen !== undefined) return;
    const next = !open;
```

In `components/StatTiles.tsx`, replace:

```tsx
      <div className="grid grid-cols-2 gap-3">{keyTiles}</div>
```

with:

```tsx
      <div data-tour={tourKey} className="grid grid-cols-2 gap-3">{keyTiles}</div>
```

In `components/StatTiles.tsx`, replace:

```tsx
          <div id={panelId} className="grid grid-cols-2 gap-3 mt-2" hidden={!open}>
```

with:

```tsx
          <div id={panelId} data-tour={tourMore} className="grid grid-cols-2 gap-3 mt-2" hidden={!open}>
```

- [ ] **Step 4: The Joke Maker's screen — targets, and the script drives its textbox, certify box, open batches, tiles and Next step clock**

In `views/JokeMaker.tsx`, replace:

```tsx
import { useGame } from '../context';
```

with:

```tsx
import { useDemoUi, useGame } from '../context';
```

In `views/JokeMaker.tsx`, replace:

```tsx
          {note != null && <MarketingNoteCallout note={note} />}
```

with:

```tsx
          {note != null && (
            <div data-tour="jm-marketing-note">
              <MarketingNoteCallout note={note} />
            </div>
          )}
```

In `views/JokeMaker.tsx`, replace:

```tsx
  const [input, setInput] = useState('');
  const [certified, setCertified] = useState(false);
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
```

with:

```tsx
  const [inputState, setInput] = useState('');
  const [certifiedState, setCertified] = useState(false);
  const [openSetState, setOpenSet] = useState<Set<string>>(() => new Set());
  /* Guided tour: inside the demo stage the script drives the textbox, the
     certify box, which batches are open, "More numbers" and the Next step
     line's clock (services/tour/demoUi.ts). In the real game there is no
     DemoUi and the student's own state does. */
  const demoUi = useDemoUi();
  const input = demoUi ? demoUi.jmDraft : inputState;
  const certified = demoUi ? demoUi.jmCertified : certifiedState;
  const openSet = useMemo(
    () => (demoUi ? new Set(demoUi.jmOpenBatchIds) : openSetState),
    [demoUi, openSetState],
  );
```

In `views/JokeMaker.tsx`, replace:

```tsx
              <div>
                <textarea
                  value={input}
```

with:

```tsx
              <div data-tour="jm-draft">
                <textarea
                  value={input}
```

In `views/JokeMaker.tsx`, replace:

```tsx
              <div className="flex items-center justify-between pt-1">
```

with:

```tsx
              <div data-tour="jm-send" className="flex items-center justify-between pt-1">
```

In `views/JokeMaker.tsx`, replace:

```tsx
                <div className="text-xs text-gray-500 text-right">
                  {shippingLine(config.round, config.round1BatchSize, config)}
```

with:

```tsx
                <div data-tour="jm-shipping" className="text-xs text-gray-500 text-right">
                  {shippingLine(config.round, config.round1BatchSize, config)}
```

In `views/JokeMaker.tsx`, replace:

```tsx
          <Card title="Value stream" subtitle="Your submitted batches — batch-level status" accent={BRAND.production}>
```

with:

```tsx
          <Card tour="jm-value-stream" title="Value stream" subtitle="Your submitted batches — batch-level status" accent={BRAND.production}>
```

In `views/JokeMaker.tsx`, replace:

```tsx
            storageKey={moreTilesKey('joke_maker')}
```

with:

```tsx
            storageKey={moreTilesKey('joke_maker')}
            open={demoUi ? demoUi.moreOpen : undefined}
            tourKey="jm-stats"
```

In `views/JokeMaker.tsx`, replace:

```tsx
          <NextStepLive
            step={now => jokeMakerNextStep(jokeMakerInputFrom({
              now, roundActive: config.isActive, round: config.round, roundStatuses, teamSummary, batches: myBatches,
            }))}
          />
```

with:

```tsx
          <div data-tour="jm-next-step">
            <NextStepLive
              step={now => jokeMakerNextStep(jokeMakerInputFrom({
                now: demoUi ? demoUi.clockMs : now,
                roundActive: config.isActive, round: config.round, roundStatuses, teamSummary, batches: myBatches,
              }))}
            />
          </div>
```

- [ ] **Step 5: Marketing's screen — targets, and the script drives its picks, Topics, titles, note, tiles and Next step clock**

In `views/QualityControl.tsx`, replace:

```tsx
import { useDemoMode, useGame } from '../context';
```

with:

```tsx
import { useDemoMode, useDemoUi, useGame } from '../context';
```

In `views/QualityControl.tsx`, replace:

```tsx
  const [orderIds, setOrderIds] = useState<number[]>([]);
  const [topics, setTopics] = useState<Record<number, string>>({});
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchFeedback, setBatchFeedback] = useState('');
```

with:

```tsx
  const [orderIdsState, setOrderIds] = useState<number[]>([]);
  const [topicsState, setTopics] = useState<Record<number, string>>({});
  const [titlesState, setTitles] = useState<Record<number, string>>({});
  const [selectedIdsState, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchFeedbackState, setBatchFeedback] = useState('');
  /* Guided tour: inside the demo stage the script drives the picks, Topics,
     titles, note, "More numbers" and the Next step line's clock, and the cards
     stay in the order they arrived (services/tour/demoUi.ts). In the real game
     there is no DemoUi and the marketer's own state does. */
  const demoUi = useDemoUi();
  const demoOrderIds = useMemo(() => incomingJokes.map(j => j.id), [incomingJokes]);
  const orderIds = demoUi ? demoOrderIds : orderIdsState;
  const topics = demoUi ? demoUi.mkTopics : topicsState;
  const titles = demoUi ? demoUi.mkTitles : titlesState;
  const selectedIds = useMemo(
    () => (demoUi ? new Set(demoUi.mkSelectedIds) : selectedIdsState),
    [demoUi, selectedIdsState],
  );
  const batchFeedback = demoUi ? demoUi.mkNote : batchFeedbackState;
```

In `views/QualityControl.tsx`, replace:

```tsx
          <Card
            title="Marketing Desk"
```

with:

```tsx
          <Card
            tour="mk-desk"
            title="Marketing Desk"
```

In `views/QualityControl.tsx`, replace:

```tsx
                {orderIds.map((id, idx) => {
                  const j = jokeById(id);
                  if (!j) return null;
```

with:

```tsx
                <div data-tour="mk-jokes" className="space-y-3">
                {orderIds.map((id, idx) => {
                  const j = jokeById(id);
                  if (!j) return null;
```

In `views/QualityControl.tsx`, replace:

```tsx
                })}

                {/* Marketing's note to its Joke Maker. It goes out as `note` on this
```

with:

```tsx
                })}
                </div>

                {/* Marketing's note to its Joke Maker. It goes out as `note` on this
```

In `views/QualityControl.tsx`, replace:

```tsx
                        <div className="mt-3 space-y-3">
```

with:

```tsx
                        <div data-tour="mk-topic-title" className="mt-3 space-y-3">
```

In `views/QualityControl.tsx`, replace:

```tsx
                <div className="rounded-lg border border-gray-200 bg-white p-4">
```

with:

```tsx
                <div data-tour="mk-note" className="rounded-lg border border-gray-200 bg-white p-4">
```

In `views/QualityControl.tsx`, replace:

```tsx
                  <Button
                    variant={!canRelease ? 'secondary' : discardingAll ? 'danger' : 'success'}
                    onClick={release}
```

with:

```tsx
                  <Button
                    data-tour="mk-release"
                    variant={!canRelease ? 'secondary' : discardingAll ? 'danger' : 'success'}
                    onClick={release}
```

In `views/QualityControl.tsx`, replace:

```tsx
            storageKey={moreTilesKey('quality_control')}
```

with:

```tsx
            storageKey={moreTilesKey('quality_control')}
            open={demoUi ? demoUi.moreOpen : undefined}
            tourKey="mk-stats"
            tourMore="mk-more"
```

In `views/QualityControl.tsx`, replace:

```tsx
          <NextStepLive
            step={now => marketingNextStep(marketingInputFrom({
              now, roundActive: config.isActive, round: config.round, roundId, roundStatuses,
              storageFeePerJokeMinute: config.storageFeePerJokeMinute,
              teamSummary, qcQueue, batches: batches.filter(b => b.team === user?.team), feedbackRows,
            }))}
          />
```

with:

```tsx
          <div data-tour="mk-next-step">
            <NextStepLive
              step={now => marketingNextStep(marketingInputFrom({
                now: demoUi ? demoUi.clockMs : now,
                roundActive: config.isActive, round: config.round, roundId, roundStatuses,
                storageFeePerJokeMinute: config.storageFeePerJokeMinute,
                teamSummary, qcQueue, batches: batches.filter(b => b.team === user?.team), feedbackRows,
              }))}
            />
          </div>
```

In `components/CustomerFeedbackCard.tsx`, replace:

```tsx
      <Card
        title={CUSTOMER_FEEDBACK_TITLE}
```

with:

```tsx
      <Card
        tour="mk-feedback"
        title={CUSTOMER_FEEDBACK_TITLE}
```

In `components/CustomerFeedbackCard.tsx`, replace:

```tsx
          <button
            type="button"
            onClick={onPopOut}
```

with:

```tsx
          <button
            type="button"
            data-tour="mk-expand"
            onClick={onPopOut}
```

- [ ] **Step 6: Write the stage**

Create `components/tour/DemoStage.tsx`:

```tsx
/* The guided tour's stage: the student's real screen, filled with sample data.

   A full-screen layer over the app that renders the role's own view
   (views/JokeMaker.tsx or views/QualityControl.tsx, inside its RoleLayout)
   under a GameContext whose value is the demo game — every action a no-op
   (services/tour/demoGame.ts) — and with demo mode on (context.tsx
   DemoModeContext), so the views read the script's textbox, picks and note
   instead of their own state and nothing they render can reach the network.

   The layer is `inert` and hidden from assistive technology: the demo is
   something to watch, not to use. The live app keeps running underneath,
   unchanged, and is what the student sees once the stage unmounts. */
import React, { useMemo } from 'react';
import { DemoModeContext, GameContext } from '../../context';
import { demoGameContext } from '../../services/tour/demoGame';
import type { DemoState } from '../../services/tour/demoScript';

export interface DemoStageProps {
  /** The student's real screen component. */
  view: React.ComponentType;
  /** What to show: demoFrame() for the current step and moment. */
  frame: DemoState;
  /** The stage's scroll container, for the spotlight to search and scroll. */
  stageRef?: React.Ref<HTMLDivElement>;
}

const DemoStageImpl: React.FC<DemoStageProps> = ({ view: View, frame, stageRef }) => {
  const game = useMemo(() => demoGameContext(frame.game), [frame.game]);
  return (
    <div
      ref={stageRef}
      data-tour-stage=""
      inert
      aria-hidden="true"
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-gray-50"
    >
      <DemoModeContext.Provider value={frame.ui}>
        <GameContext.Provider value={game}>
          <View />
        </GameContext.Provider>
      </DemoModeContext.Provider>
    </div>
  );
};

/** Re-renders only when the frame (or the view) changes, not on every clock tick. */
export const DemoStage = React.memo(DemoStageImpl);
export default DemoStage;
```

- [ ] **Step 7: The network audit walks the stage as well**

In `components/tour/demoMode.test.ts`, replace:

```ts
const STUDENT_VIEW_ROOTS = ['views/JokeMaker.tsx', 'views/QualityControl.tsx'];
```

with:

```ts
const STUDENT_VIEW_ROOTS = ['views/JokeMaker.tsx', 'views/QualityControl.tsx', 'components/tour/DemoStage.tsx'];
```

- [ ] **Step 8: Run the tests to verify they pass, then the whole suite**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/DemoStage.test.ts components/tour/demoMode.test.ts components/StatTiles.test.tsx components/MarketingNote.test.ts components/CustomerFeedbackCard.test.ts views/studentScreens.render.test.ts views/nextStep.render.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  7 passed (7)`, `Tests  79 passed (79)`. `DemoStage.test.ts` has 44 tests: 34 target checks (the Joke Maker's 7 and Marketing's 10 targeted steps, in Round 1 and Round 2) and 10 others. The existing screen, tile, note and feedback-card tests pass unchanged.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests '`
Expected: tsc prints nothing and exits 0; `Test Files  54 passed (54)`, `Tests  902 passed (902)`.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components/ui.tsx components/StatTiles.tsx views/JokeMaker.tsx views/QualityControl.tsx \
  components/CustomerFeedbackCard.tsx components/tour/DemoStage.tsx components/tour/DemoStage.test.ts \
  components/tour/demoMode.test.ts
git commit -m "feat(tour): the demo stage renders the real screens; every tour target is on them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Task 5: The spotlight, the control bar and the guided tour

**Files:**
- Create: `components/tour/spotlightGeometry.ts`, `components/tour/tourControls.ts`, `components/tour/Spotlight.tsx`, `components/tour/GuidedTour.tsx`
- Test: `components/tour/spotlightGeometry.test.ts`, `components/tour/tourControls.test.ts`, `components/tour/GuidedTour.test.ts`

**Interfaces:**
- Consumes: Task 4 `DemoStage`; Task 3 `demoFrame`, `demoFrameKey`, `demoOptionsFor`, `DemoOptions`, `DemoStep`, `stepsFor`, `captionText`; Task 2 `INITIAL_TOUR_STATE`, `tourReducer`, `tourProgress`, `TourAction`, `TourState`, `TourStep`, `TourOutcome`, `TourRole`; `Button` (`components/ui.tsx` — never the barrel).
- Produces:
  ```ts
  // components/tour/spotlightGeometry.ts
  export interface Box { top: number; left: number; width: number; height: number }
  export interface Size { width: number; height: number }
  export type CaptionSide = 'below' | 'above' | 'right' | 'left' | 'over' | 'center';
  export interface CaptionPlacement { side: CaptionSide; top: number; left: number; width: number }
  export const SPOT_PADDING = 8, VIEW_MARGIN = 16, CAPTION_GAP = 12, CAPTION_MAX_WIDTH = 360, CONTROL_BAR_HEIGHT = 72;
  export function spotlightBox(target: Box, pad?: number): Box;
  export function visibleBox(box: Box, viewport: Size, bottomReserve?: number): Box | null;
  export function needsScroll(target: Box, viewport: Size, bottomReserve?: number): boolean;
  export function captionWidth(viewport: Size): number;
  export function placeCaption(hole: Box | null, caption: Size, viewport: Size, bottomReserve?: number): CaptionPlacement;
  export function findTourTarget<E extends { getBoundingClientRect(): Box }>(root: { querySelector(s: string): E | null } | null, id: string | null): E | null;
  // components/tour/tourControls.ts
  export const SKIP_LABEL = 'Skip tour'; export const ROUND_STARTED_LABEL = 'Round started — go to the game';
  export interface TourControls { stepText: string; progress: number; backDisabled: boolean; pauseLabel: 'Pause' | 'Play'; nextLabel: string; skipLabel: string; skipPrimary: boolean }
  export function tourControls(state: TourState, steps: ReadonlyArray<Pick<TourStep, 'durationMs' | 'finishLabel'>>, roundActive: boolean): TourControls;
  export interface TourKeyEvent { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; targetTag?: string }
  export function keyAction(e: TourKeyEvent): TourAction | null;
  // components/tour/Spotlight.tsx
  export const SCROLL_SETTLE_MS = 700;
  export interface SpotlightProps { stageRef: React.RefObject<HTMLDivElement | null>; target: string | null; stepIndex: number; frameKey: string; reducedMotion: boolean; bottomReserve?: number; title: string; body: string; stepText: string }
  export const Spotlight: React.FC<SpotlightProps>;
  // components/tour/GuidedTour.tsx
  export const TICK_MS = 100; export const MAX_TICK_MS = 250;
  export interface TourPlan { options: DemoOptions; steps: DemoStep[] }
  export function tourPlan(role: TourRole, config: GameConfig): TourPlan;
  export function usePrefersReducedMotion(): boolean;
  export class TourErrorBoundary; // props { onError(error): void; children }
  export interface GuidedTourProps { role: TourRole; view: React.ComponentType; config: GameConfig; roundActive: boolean; onEnd: (outcome: TourOutcome) => void }
  export const GuidedTour: React.FC<GuidedTourProps>; // portalled to <body>; renders nothing without a document
  ```

Layers, bottom to top: the live app (`#root`, made `inert` while the tour is up), the stage (`z-[60]`, inert, opaque), the spotlight overlay (`z-[61]`, takes every click), the control bar (`z-[62]`). Body scrolling is locked for the tour's lifetime and restored after. The clock is one 100 ms interval; a tick counts at most 250 ms, so a throttled background tab does not fast-forward.

- [ ] **Step 1: Write the failing tests**

Create `components/tour/spotlightGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CAPTION_GAP, VIEW_MARGIN, captionWidth, findTourTarget, needsScroll, placeCaption, spotlightBox, visibleBox,
  type Box, type CaptionPlacement, type Size,
} from './spotlightGeometry';

const DESKTOP: Size = { width: 1280, height: 800 };
const PHONE: Size = { width: 375, height: 667 };
const CAPTION: Size = { width: 360, height: 150 };
const BAR = 72;

/** The caption lies inside the usable viewport (16 px gutters, control bar kept clear). */
function expectInside(p: CaptionPlacement, viewport: Size, height = CAPTION.height) {
  expect(p.left).toBeGreaterThanOrEqual(VIEW_MARGIN);
  expect(p.left + p.width).toBeLessThanOrEqual(viewport.width - VIEW_MARGIN);
  expect(p.top).toBeGreaterThanOrEqual(VIEW_MARGIN);
  expect(p.top + height).toBeLessThanOrEqual(viewport.height - BAR - VIEW_MARGIN);
}

describe('spotlightBox', () => {
  it('pads the target by 8 px on every side', () => {
    expect(spotlightBox({ top: 100, left: 50, width: 200, height: 40 })).toEqual({ top: 92, left: 42, width: 216, height: 56 });
  });
});

describe('visibleBox — a target scrolled partly or wholly out of view', () => {
  it('clips to the viewport above the control bar', () => {
    expect(visibleBox({ top: -50, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toEqual({ top: 0, left: 10, width: 100, height: 50 });
    expect(visibleBox({ top: 700, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toEqual({ top: 700, left: 10, width: 100, height: 28 });
  });
  it('is null when nothing of it is on screen', () => {
    expect(visibleBox({ top: -300, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toBeNull();
    expect(visibleBox({ top: 900, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toBeNull();
    expect(visibleBox({ top: 760, left: 10, width: 100, height: 100 }, DESKTOP, BAR)).toBeNull();
  });
});

describe('needsScroll — a target below the fold, or a smooth scroll that never ran', () => {
  it('is true when none or under half of the target is on screen', () => {
    expect(needsScroll({ top: 1600, left: 40, width: 600, height: 140 }, DESKTOP, BAR)).toBe(true);
    expect(needsScroll({ top: 680, left: 40, width: 600, height: 140 }, DESKTOP, BAR)).toBe(true);
    expect(needsScroll({ top: 300, left: 40, width: 600, height: 140 }, DESKTOP, BAR)).toBe(false);
  });
  it('a target taller than the screen only needs half the screen filled', () => {
    expect(needsScroll({ top: -200, left: 40, width: 600, height: 1000 }, DESKTOP, BAR)).toBe(false);
    expect(needsScroll({ top: 500, left: 40, width: 600, height: 1000 }, DESKTOP, BAR)).toBe(true);
  });
});

describe('placeCaption', () => {
  it('centres the card when the step has no target, or its target is scrolled away', () => {
    for (const hole of [null, { top: -400, left: 0, width: 50, height: 50 }]) {
      const p = placeCaption(hole, CAPTION, DESKTOP, BAR);
      expect(p.side).toBe('center');
      expect(p.left).toBe((DESKTOP.width - 360) / 2);
      expectInside(p, DESKTOP);
    }
  });

  it('prefers below, then above, then right, then left', () => {
    expect(placeCaption({ top: 80, left: 100, width: 300, height: 60 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'below', top: 140 + CAPTION_GAP });
    expect(placeCaption({ top: 550, left: 100, width: 300, height: 140 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'above', top: 550 - CAPTION_GAP - 150 });
    expect(placeCaption({ top: 20, left: 40, width: 700, height: 690 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'right', left: 740 + CAPTION_GAP });
    expect(placeCaption({ top: 20, left: 500, width: 700, height: 690 }, CAPTION, DESKTOP, BAR)).toMatchObject({ side: 'left', left: 500 - CAPTION_GAP - 360 });
  });

  it('a target taller and wider than the room around it (the Marketing Desk on a phone) gets the caption over it, inside the screen', () => {
    const p = placeCaption({ top: -200, left: 8, width: 359, height: 1400 }, CAPTION, PHONE, BAR);
    expect(p.side).toBe('over');
    expectInside(p, PHONE);
  });

  it('stays inside the screen when the window is resized mid-step, down to phone width', () => {
    const targets: Box[] = [
      { top: 10, left: 10, width: 120, height: 40 },
      { top: 300, left: 900, width: 340, height: 200 },
      { top: 620, left: 0, width: 1280, height: 60 },
      { top: 100, left: 1200, width: 70, height: 30 },
    ];
    for (const viewport of [DESKTOP, { width: 1024, height: 700 }, { width: 768, height: 1024 }, PHONE, { width: 320, height: 568 }]) {
      expect(captionWidth(viewport)).toBeLessThanOrEqual(viewport.width - 2 * VIEW_MARGIN);
      for (const t of targets) {
        const p = placeCaption(spotlightBox(t), CAPTION, viewport, BAR);
        expectInside(p, viewport);
      }
    }
  });
});

describe('findTourTarget', () => {
  const el = (box: Box) => ({ getBoundingClientRect: () => box });
  const root = (found: ReturnType<typeof el> | null) => {
    const seen: string[] = [];
    return { seen, querySelector: (sel: string) => { seen.push(sel); return found; } };
  };

  it('looks the target up by its data-tour id inside the stage', () => {
    const r = root(el({ top: 1, left: 2, width: 3, height: 4 }));
    expect(findTourTarget(r, 'jm-draft')).not.toBeNull();
    expect(r.seen).toEqual(['[data-tour="jm-draft"]']);
  });

  it('is null — a centred card — for no target, a missing element, or one with no size', () => {
    expect(findTourTarget(root(el({ top: 0, left: 0, width: 10, height: 10 })), null)).toBeNull();
    expect(findTourTarget(null, 'jm-draft')).toBeNull();
    expect(findTourTarget(root(null), 'mk-expand')).toBeNull();
    expect(findTourTarget(root(el({ top: 0, left: 0, width: 0, height: 0 })), 'mk-expand')).toBeNull();
    expect(findTourTarget(root(el({ top: 0, left: 0, width: 120, height: 0 })), 'mk-expand')).toBeNull();
  });
});
```

Create `components/tour/tourControls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROUND_STARTED_LABEL, SKIP_LABEL, keyAction, tourControls } from './tourControls';
import { INITIAL_TOUR_STATE } from '../../services/tour/tourMachine';

const STEPS = [{}, {}, { finishLabel: 'Start' }];

describe('tourControls', () => {
  it('shows "Step n of N", progress, and Back disabled on the first step', () => {
    const c = tourControls(INITIAL_TOUR_STATE, STEPS, false);
    expect(c).toMatchObject({ stepText: 'Step 1 of 3', progress: 0, backDisabled: true, pauseLabel: 'Pause', nextLabel: 'Next' });
    const mid = tourControls({ ...INITIAL_TOUR_STATE, index: 1, elapsedMs: 3000 }, STEPS, false);
    expect(mid).toMatchObject({ stepText: 'Step 2 of 3', backDisabled: false });
    expect(mid.progress).toBeCloseTo(0.5);
  });

  it('says Play while paused, and Start on the last step', () => {
    expect(tourControls({ ...INITIAL_TOUR_STATE, paused: true }, STEPS, false).pauseLabel).toBe('Play');
    expect(tourControls({ ...INITIAL_TOUR_STATE, index: 2 }, STEPS, false).nextLabel).toBe('Start');
  });

  it('turns Skip into a primary "Round started — go to the game" once the round goes ACTIVE mid-tour', () => {
    expect(tourControls(INITIAL_TOUR_STATE, STEPS, false)).toMatchObject({ skipLabel: SKIP_LABEL, skipPrimary: false });
    expect(SKIP_LABEL).toBe('Skip tour');
    expect(tourControls({ ...INITIAL_TOUR_STATE, index: 1 }, STEPS, true)).toMatchObject({
      skipLabel: 'Round started — go to the game', skipPrimary: true,
    });
    expect(ROUND_STARTED_LABEL).toBe('Round started — go to the game');
  });
});

describe('keyAction', () => {
  it('Esc skips, ← back, → next, Space pauses', () => {
    expect(keyAction({ key: 'Escape' })).toEqual({ type: 'skip' });
    expect(keyAction({ key: 'Esc' })).toEqual({ type: 'skip' });
    expect(keyAction({ key: 'ArrowLeft' })).toEqual({ type: 'back' });
    expect(keyAction({ key: 'ArrowRight' })).toEqual({ type: 'next' });
    expect(keyAction({ key: ' ', targetTag: 'DIV' })).toEqual({ type: 'togglePause' });
    expect(keyAction({ key: 'Spacebar' })).toEqual({ type: 'togglePause' });
  });

  it('leaves browser shortcuts, other keys, and Space on a focused button alone', () => {
    expect(keyAction({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(keyAction({ key: 'ArrowRight', metaKey: true })).toBeNull();
    expect(keyAction({ key: 'Escape', ctrlKey: true })).toBeNull();
    expect(keyAction({ key: 'Enter' })).toBeNull();
    expect(keyAction({ key: 'a' })).toBeNull();
    expect(keyAction({ key: ' ', targetTag: 'BUTTON' })).toBeNull();
  });
});
```

Create `components/tour/GuidedTour.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidedTour, MAX_TICK_MS, TICK_MS, TourErrorBoundary, tourPlan } from './GuidedTour';
import JokeMaker from '../../views/JokeMaker';
import type { GameConfig } from '../../types';
import { TEST_CONFIG } from '../../views/testing/renderWithGame';

/** The lobby before Round 1 starts, at the default fees. */
const CONFIG: GameConfig = { ...TEST_CONFIG, status: 'LOBBY', isActive: false, startTime: null, elapsedTime: 0 };

describe('tourPlan', () => {
  it('builds the role\'s steps for the round, captions filled from its fees', () => {
    const r1 = tourPlan('JOKE_MAKER', CONFIG);
    expect(r1.options).toMatchObject({ role: 'JOKE_MAKER', roundNumber: 1 });
    expect(r1.steps.find(s => s.id === 'jm-shipping')!.body).toBe(
      'Each batch of 5 costs $2 to ship, so keep them coming but make them count.',
    );
    const r2 = tourPlan('JOKE_MAKER', { ...CONFIG, round: 2, shippingFeeSmall: 0.5 });
    expect(r2.steps.find(s => s.id === 'jm-shipping')!.body).toContain('You choose the size now: $0.50 for 1–4 jokes');
    expect(tourPlan('QUALITY_CONTROL', CONFIG).steps).toHaveLength(12);
  });

  it('is the same tour whether the round is ACTIVE or not, so a round starting mid-tour changes nothing but the Skip button', () => {
    const before = tourPlan('QUALITY_CONTROL', CONFIG);
    const after = tourPlan('QUALITY_CONTROL', { ...CONFIG, isActive: true, status: 'PLAYING', startTime: 1, elapsedTime: 3 });
    expect(after.options).toEqual(before.options);
    expect(after.steps.map(s => s.id)).toEqual(before.steps.map(s => s.id));
  });
});

describe('the clock', () => {
  it('ticks ten times a second and never counts more than 250 ms for one tick', () => {
    expect(TICK_MS).toBe(100);
    expect(MAX_TICK_MS).toBe(250);
  });
});

describe('TourErrorBoundary', () => {
  it('reports the error once and renders nothing after it', () => {
    const onError = vi.fn();
    const boundary = new TourErrorBoundary({ onError, children: 'stage' });
    expect(boundary.render()).toBe('stage');
    expect(TourErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    boundary.componentDidCatch(new Error('boom'));
    expect(onError).toHaveBeenCalledTimes(1);
    boundary.state = { failed: true };
    expect(boundary.render()).toBeNull();
  });
});

describe('GuidedTour', () => {
  it('renders nothing without a document (static render), and calls nothing', () => {
    const onEnd = vi.fn();
    const html = renderToStaticMarkup(createElement(GuidedTour, {
      role: 'JOKE_MAKER', view: JokeMaker, config: CONFIG, roundActive: false, onEnd,
    }));
    expect(html).toBe('');
    expect(onEnd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/spotlightGeometry.test.ts components/tour/tourControls.test.ts components/tour/GuidedTour.test.ts 2>&1 | grep -E 'FAIL|Test Files'`
Expected: FAIL — `Test Files  3 failed (3)`; the three files fail to load (`Failed to load url ./spotlightGeometry`, `./tourControls`, `./GuidedTour`).

- [ ] **Step 3: Write the geometry**

Create `components/tour/spotlightGeometry.ts`:

```ts
/* Where the guided tour's spotlight and caption go — pure geometry, no DOM
   beyond what a test can fake.

   Coordinates are viewport pixels (getBoundingClientRect). The control bar is
   fixed at the bottom, so `bottomReserve` pixels there are never used. The
   caption keeps VIEW_MARGIN (16 px) from every edge, the same gutter the app
   keeps at phone width. */

export interface Box { top: number; left: number; width: number; height: number }
export interface Size { width: number; height: number }

export type CaptionSide = 'below' | 'above' | 'right' | 'left' | 'over' | 'center';
export interface CaptionPlacement { side: CaptionSide; top: number; left: number; width: number }

export const SPOT_PADDING = 8;
export const VIEW_MARGIN = 16;
export const CAPTION_GAP = 12;
export const CAPTION_MAX_WIDTH = 360;
/** Fallback height for the control bar until it has been measured. */
export const CONTROL_BAR_HEIGHT = 72;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));

/** The spotlight's hole: the target plus padding. */
export function spotlightBox(target: Box, pad = SPOT_PADDING): Box {
  return { top: target.top - pad, left: target.left - pad, width: target.width + 2 * pad, height: target.height + 2 * pad };
}

/** The part of `box` inside the usable viewport, or null when none of it is (scrolled away). */
export function visibleBox(box: Box, viewport: Size, bottomReserve = CONTROL_BAR_HEIGHT): Box | null {
  const top = Math.max(box.top, 0);
  const left = Math.max(box.left, 0);
  const bottom = Math.min(box.top + box.height, viewport.height - bottomReserve);
  const right = Math.min(box.left + box.width, viewport.width);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * True when too little of the target is on screen to spotlight it: none of
 * it, or less than half of what could fit. Used to finish a smooth scroll that
 * never ran (a background tab, an interrupted scroll).
 */
export function needsScroll(target: Box, viewport: Size, bottomReserve = CONTROL_BAR_HEIGHT): boolean {
  const visible = visibleBox(target, viewport, bottomReserve);
  if (!visible) return true;
  const room = Math.min(target.height, viewport.height - bottomReserve);
  return visible.height < room / 2;
}

/** Caption width: at most 360 px, and never wider than the viewport minus its gutters. */
export function captionWidth(viewport: Size): number {
  return Math.max(0, Math.min(CAPTION_MAX_WIDTH, viewport.width - 2 * VIEW_MARGIN));
}

/**
 * Puts the caption beside the spotlight on the first side with room — below,
 * above, right, left — and otherwise over the spotlight near the bottom of the
 * screen (a target taller than the viewport). With no hole, or a hole scrolled
 * out of view, it is centred. The result is always inside the usable viewport.
 */
export function placeCaption(
  hole: Box | null,
  caption: Size,
  viewport: Size,
  bottomReserve = CONTROL_BAR_HEIGHT,
): CaptionPlacement {
  const width = Math.min(caption.width, captionWidth(viewport));
  const height = caption.height;
  const floor = viewport.height - bottomReserve;
  const clampLeft = (x: number) => clamp(x, VIEW_MARGIN, viewport.width - VIEW_MARGIN - width);
  const clampTop = (y: number) => clamp(y, VIEW_MARGIN, floor - VIEW_MARGIN - height);
  const visible = hole ? visibleBox(hole, viewport, bottomReserve) : null;
  if (!visible) {
    return { side: 'center', top: clampTop((floor - height) / 2), left: clampLeft((viewport.width - width) / 2), width };
  }
  const bottom = visible.top + visible.height;
  const right = visible.left + visible.width;
  const midLeft = clampLeft(visible.left + visible.width / 2 - width / 2);
  const midTop = clampTop(visible.top + visible.height / 2 - height / 2);
  if (floor - VIEW_MARGIN - bottom - CAPTION_GAP >= height) return { side: 'below', top: bottom + CAPTION_GAP, left: midLeft, width };
  if (visible.top - CAPTION_GAP - VIEW_MARGIN >= height) return { side: 'above', top: visible.top - CAPTION_GAP - height, left: midLeft, width };
  if (viewport.width - VIEW_MARGIN - right - CAPTION_GAP >= width) return { side: 'right', top: midTop, left: right + CAPTION_GAP, width };
  if (visible.left - CAPTION_GAP - VIEW_MARGIN >= width) return { side: 'left', top: midTop, left: visible.left - CAPTION_GAP - width, width };
  return { side: 'over', top: clampTop(floor - VIEW_MARGIN - height), left: midLeft, width };
}

/**
 * The element to spotlight inside the stage, or null when the step has no
 * target, the element is missing, or it has no size (hidden or collapsed) —
 * the caller then shows a centred card instead of an empty hole. `root` is
 * the stage element; tests pass a fake with the same two methods.
 */
export function findTourTarget<E extends { getBoundingClientRect(): Box }>(
  root: { querySelector(selectors: string): E | null } | null,
  id: string | null,
): E | null {
  if (!root || !id) return null;
  const el = root.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}
```

- [ ] **Step 4: Write the control-bar and keyboard rules**

Create `components/tour/tourControls.ts`:

```ts
/* The guided tour's control bar and keyboard, as pure functions of the step
   machine's state (services/tour/tourMachine.ts). */
import { tourProgress, type TourAction, type TourState, type TourStep } from '../../services/tour/tourMachine';

export const SKIP_LABEL = 'Skip tour';
/** Spec §3.3: shown, styled as primary, once the student's round goes ACTIVE mid-tour. */
export const ROUND_STARTED_LABEL = 'Round started — go to the game';

export interface TourControls {
  stepText: string;
  progress: number;
  backDisabled: boolean;
  pauseLabel: 'Pause' | 'Play';
  nextLabel: string;
  skipLabel: string;
  skipPrimary: boolean;
}

export function tourControls(
  state: TourState,
  steps: ReadonlyArray<Pick<TourStep, 'durationMs' | 'finishLabel'>>,
  roundActive: boolean,
): TourControls {
  const last = state.index >= steps.length - 1;
  return {
    stepText: `Step ${Math.min(state.index + 1, steps.length)} of ${steps.length}`,
    progress: tourProgress(state, steps),
    backDisabled: state.index === 0,
    pauseLabel: state.paused ? 'Play' : 'Pause',
    nextLabel: last ? steps[steps.length - 1]?.finishLabel ?? 'Done' : 'Next',
    skipLabel: roundActive ? ROUND_STARTED_LABEL : SKIP_LABEL,
    skipPrimary: roundActive,
  };
}

export interface TourKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** The focused element's tag, e.g. 'BUTTON'. */
  targetTag?: string;
}

/**
 * Esc skips, ← goes back, → goes next, Space pauses or plays. Shortcuts with
 * Ctrl, Cmd or Alt are left to the browser, and Space on a focused button or
 * link presses that control as usual.
 */
export function keyAction(e: TourKeyEvent): TourAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'Escape':
    case 'Esc':
      return { type: 'skip' };
    case 'ArrowLeft':
      return { type: 'back' };
    case 'ArrowRight':
      return { type: 'next' };
    case ' ':
    case 'Spacebar':
      return e.targetTag === 'BUTTON' || e.targetTag === 'A' ? null : { type: 'togglePause' };
    default:
      return null;
  }
}
```

- [ ] **Step 5: Write the spotlight**

Create `components/tour/Spotlight.tsx`:

```tsx
/* The guided tour's spotlight: the page dims except a rounded hole around the
   step's target, and a caption sits beside it on the side with room.

   The hole is one element with a huge box-shadow, so everything around it
   dims. The target is looked up as [data-tour=<id>] inside the stage and
   scrolled into view (block: center), which also scrolls any scroll container
   it sits in — the Value stream list, the feedback list. The hole then follows
   the target: scroll events from the stage or any container inside it
   (captured), window resizes, and a ResizeObserver on the stage and target.
   A step with no target, or whose target is missing or has no size, gets a
   centred card over a full dim; the tour never stalls on a missing element.

   The overlay takes every click, so nothing under it — demo or live page — can
   be pressed by accident. Reduced motion: no transitions, instant scrolling. */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  CONTROL_BAR_HEIGHT, findTourTarget, needsScroll, placeCaption, spotlightBox,
  type Box, type CaptionPlacement,
} from './spotlightGeometry';

export interface SpotlightProps {
  /** The demo stage (components/tour/DemoStage.tsx), searched for the target. */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** data-tour id, or null for a centred card. */
  target: string | null;
  /** The step index: a new step looks its target up and scrolls to it again. */
  stepIndex: number;
  /** demoFrameKey: content changed, so measure again (a batch split, a card grew). */
  frameKey: string;
  reducedMotion: boolean;
  /** Height of the fixed control bar, kept clear at the bottom. */
  bottomReserve?: number;
  title: string;
  body: string;
  stepText: string;
}

const DIM = 'rgba(15, 23, 42, 0.62)';
/** How long a smooth scroll gets before the target is jumped into view instead. */
export const SCROLL_SETTLE_MS = 700;
const ESTIMATED_CAPTION = { width: 360, height: 150 };

export const Spotlight: React.FC<SpotlightProps> = ({
  stageRef, target, stepIndex, frameKey, reducedMotion, bottomReserve = CONTROL_BAR_HEIGHT, title, body, stepText,
}) => {
  const captionRef = useRef<HTMLDivElement | null>(null);
  const [hole, setHole] = useState<Box | null>(null);
  const [caption, setCaption] = useState<CaptionPlacement | null>(null);

  const measure = useCallback(() => {
    const el = findTourTarget(stageRef.current, target);
    const nextHole = el ? spotlightBox(el.getBoundingClientRect()) : null;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const size = captionRef.current
      ? { width: ESTIMATED_CAPTION.width, height: captionRef.current.offsetHeight || ESTIMATED_CAPTION.height }
      : ESTIMATED_CAPTION;
    setHole(nextHole);
    setCaption(placeCaption(nextHole, size, viewport, bottomReserve));
  }, [stageRef, target, bottomReserve]);

  // A new step: bring its target into view, then measure. If a smooth scroll
  // did not get it there (a background tab does not animate), jump instead.
  useLayoutEffect(() => {
    const scrollTo = (behavior: 'auto' | 'smooth') => {
      const el = findTourTarget(stageRef.current, target) as HTMLElement | null;
      el?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior });
      return el;
    };
    scrollTo(reducedMotion ? 'auto' : 'smooth');
    measure();
    const settle = window.setTimeout(() => {
      const el = findTourTarget(stageRef.current, target);
      if (el && needsScroll(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, bottomReserve)) {
        scrollTo('auto');
        measure();
      }
    }, SCROLL_SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [stepIndex, target, reducedMotion, measure, stageRef, bottomReserve]);

  // The content changed under the same step.
  useLayoutEffect(() => {
    measure();
  }, [frameKey, title, body, measure]);

  // Follow scrolling (the stage and every container in it), resizes and layout changes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener('resize', schedule);
    stage?.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const el = findTourTarget(stage, target);
    if (observer && stage?.firstElementChild) observer.observe(stage.firstElementChild);
    if (observer && el) observer.observe(el as Element);
    return () => {
      window.removeEventListener('resize', schedule);
      stage?.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [stageRef, target, stepIndex, measure]);

  const move = reducedMotion ? 'none' : 'top .3s ease, left .3s ease, width .3s ease, height .3s ease';
  return (
    <div className="fixed inset-0 z-[61]" data-tour-overlay="">
      {hole ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl ring-2 ring-[#ffd100]"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, boxShadow: `0 0 0 9999px ${DIM}`, transition: move }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: DIM }} />
      )}
      <div
        ref={captionRef}
        role="status"
        aria-live="polite"
        className="absolute rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
        style={{
          top: caption?.top ?? '30%',
          left: caption?.left ?? 'calc(50% - 180px)',
          width: caption?.width ?? ESTIMATED_CAPTION.width,
          maxWidth: 'calc(100vw - 32px)',
          transition: reducedMotion ? 'none' : 'top .3s ease, left .3s ease',
        }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{stepText}</div>
        <h2 className="mt-1 text-lg font-bold leading-snug text-gray-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{body}</p>
      </div>
    </div>
  );
};

export default Spotlight;
```

- [ ] **Step 6: Write the guided tour**

Create `components/tour/GuidedTour.tsx`:

```tsx
/* The guided tour: the demo stage, the spotlight, the control bar, the clock
   and the keyboard, put together (spec §3).

   Mounted by TutorialLauncher (components.tsx) and portalled to <body>, above
   everything, while the live app keeps running underneath — made `inert` for
   the tour's lifetime, so no click or focus reaches it. The steps, prices and
   fees are read once, when the tour starts (tourPlan): the round
   changing mid-tour does not reshuffle the steps, it only turns Skip into
   "Round started — go to the game".

   The clock is one interval sending `tick` to the step machine
   (services/tour/tourMachine.ts); the demo state is rebuilt from (step,
   elapsed) by services/tour/demoScript.ts, memoised on demoFrameKey so the
   view re-renders only when something on it changes. An error anywhere in the
   stage or spotlight ends the tour through the error boundary: logged, no
   seen-flag written, the student lands on the live screen. */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { Button } from '../ui';
import type { GameConfig } from '../../types';
import { DemoStage } from './DemoStage';
import { Spotlight } from './Spotlight';
import { CONTROL_BAR_HEIGHT } from './spotlightGeometry';
import { keyAction, tourControls } from './tourControls';
import {
  demoFrame, demoFrameKey, demoOptionsFor, type DemoOptions, type DemoStep,
} from '../../services/tour/demoScript';
import { captionText, stepsFor } from '../../services/tour/tourSteps';
import { INITIAL_TOUR_STATE, tourReducer, type TourAction, type TourState } from '../../services/tour/tourMachine';
import type { TourOutcome, TourRole } from '../../services/tour/seen';

/** How often the clock ticks. */
export const TICK_MS = 100;
/** A tick never counts for more than this, so a throttled background tab does not fast-forward. */
export const MAX_TICK_MS = 250;

export interface TourPlan { options: DemoOptions; steps: DemoStep[] }

/** The tour for this role and round, fixed when the tour starts. */
export function tourPlan(role: TourRole, config: GameConfig): TourPlan {
  const options = demoOptionsFor(role, config);
  return { options, steps: stepsFor(role, options) };
}

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

interface BoundaryProps { onError: (error: unknown) => void; children?: React.ReactNode }
interface BoundaryState { failed: boolean }

/** Ends the tour on any render error in the stage or spotlight. */
export class TourErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  declare readonly props: Readonly<BoundaryProps>;
  state: BoundaryState = { failed: false };
  constructor(props: BoundaryProps) {
    super(props);
  }
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface GuidedTourProps {
  role: TourRole;
  /** The student's real screen: views/JokeMaker.tsx or views/QualityControl.tsx. */
  view: React.ComponentType;
  /** The live round's configuration, read once when the tour starts. */
  config: GameConfig;
  /** Live: the student's round is ACTIVE. */
  roundActive: boolean;
  /** Called once: 'finished' (Start / → on the last step), 'skipped' (Skip / Esc) or 'error'. */
  onEnd: (outcome: TourOutcome) => void;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({ role, view, config, roundActive, onEnd }) => {
  const [plan] = useState<TourPlan>(() => tourPlan(role, config));
  const { options, steps } = plan;
  const [state, dispatch] = useReducer(
    (s: TourState, a: TourAction) => tourReducer(s, a, steps),
    INITIAL_TOUR_STATE,
  );
  const reducedMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = useState(CONTROL_BAR_HEIGHT);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);

  const end = useCallback((outcome: TourOutcome) => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEndRef.current(outcome);
  }, []);

  // The clock. Stops while paused or ended.
  useEffect(() => {
    if (state.ended || state.paused) return undefined;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', dtMs: Math.min(now - last, MAX_TICK_MS) });
      last = now;
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.ended, state.paused]);

  useEffect(() => {
    if (state.ended) end(state.ended);
  }, [state.ended, end]);

  // Keyboard: Esc, ←, →, Space. Captured before the live page sees them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction({
        key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetTag: (e.target as HTMLElement | null)?.tagName,
      });
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch(action);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // While the tour is up the live app is inert and the page does not scroll.
  useEffect(() => {
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert') ?? false;
    root?.setAttribute('inert', '');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (document.activeElement as HTMLElement | null)?.blur?.();
    controlsRef.current?.focus();
    return () => {
      if (!wasInert) root?.removeAttribute('inert');
      document.body.style.overflow = overflow;
    };
  }, []);

  // Keep the caption clear of the control bar, whatever its height (it wraps on phones).
  useEffect(() => {
    const bar = controlsRef.current;
    if (!bar || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight || CONTROL_BAR_HEIGHT));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const frameKey = demoFrameKey(steps, state.index, state.elapsedMs, reducedMotion);
  const frame = useMemo(
    () => demoFrame(steps, state.index, options, state.elapsedMs, reducedMotion),
    // frameKey changes exactly when the frame would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frameKey, steps, options],
  );
  const controls = tourControls(state, steps, roundActive);
  const step = steps[state.index];
  const onStageError = useCallback((error: unknown) => {
    console.error('Guided tour stopped:', error);
    end('error');
  }, [end]);

  // A static render (tests) has no document to portal into.
  if (typeof document === 'undefined' || !step) return null;

  const label = role === 'JOKE_MAKER' ? 'Joke Maker' : 'Marketing';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${label} tour`} data-guided-tour="">
      <TourErrorBoundary onError={onStageError}>
        <DemoStage view={view} frame={frame} stageRef={stageRef} />
        <Spotlight
          stageRef={stageRef}
          target={step.target}
          stepIndex={state.index}
          frameKey={frameKey}
          reducedMotion={reducedMotion}
          bottomReserve={barHeight}
          title={step.title}
          body={captionText(step, options)}
          stepText={controls.stepText}
        />
      </TourErrorBoundary>
      <div
        ref={controlsRef}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-[62] border-t border-gray-200 bg-white shadow-2xl outline-none"
      >
        <div className="h-1 bg-gray-100" aria-hidden="true">
          <div
            className="h-full bg-[#ffd100]"
            style={{ width: `${Math.round(controls.progress * 1000) / 10}%`, transition: reducedMotion ? 'none' : 'width .1s linear' }}
          />
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="text-xs font-semibold tabular-nums text-gray-500">{controls.stepText}</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm"
              onClick={() => dispatch({ type: 'back' })}
              disabled={controls.backDisabled}
            >
              <ArrowLeft size={14} /> Back
            </Button>
            <Button
              variant="outline"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm"
              onClick={() => dispatch({ type: 'togglePause' })}
            >
              {state.paused ? <Play size={14} /> : <Pause size={14} />} {controls.pauseLabel}
            </Button>
            <Button
              variant="navy"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm"
              onClick={() => dispatch({ type: 'next' })}
            >
              {controls.nextLabel} <ArrowRight size={14} />
            </Button>
            <Button
              variant={controls.skipPrimary ? 'primary' : 'secondary'}
              className="px-3 py-1.5 text-sm font-semibold"
              onClick={() => dispatch({ type: 'skip' })}
            >
              {controls.skipLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GuidedTour;
```

- [ ] **Step 7: Run them to verify they pass, then the whole suite and a build**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/spotlightGeometry.test.ts components/tour/tourControls.test.ts components/tour/GuidedTour.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  3 passed (3)`, `Tests  21 passed (21)`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests ' && npx vite build 2>&1 | tail -1`
Expected: tsc prints nothing and exits 0; `Test Files  57 passed (57)`, `Tests  923 passed (923)`; the build's last line is `✓ built in …`. (Nothing mounts `GuidedTour` yet; Task 6 does.)

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components/tour/spotlightGeometry.ts components/tour/tourControls.ts components/tour/Spotlight.tsx \
  components/tour/GuidedTour.tsx components/tour/spotlightGeometry.test.ts components/tour/tourControls.test.ts \
  components/tour/GuidedTour.test.ts
git commit -m "feat(tour): spotlight, control bar, clock and keyboard for the guided tour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Task 6: Launch it — auto-play, the mid-round prompt, "?" replay; the instructor keeps the modal

**Files:**
- Modify: `components.tsx` (imports, `TutorialLauncher` replaced, `RoleLayout` takes `tourView`), `views/JokeMaker.tsx` and `views/QualityControl.tsx` (`<RoleLayout tourView={…}>`), `components/Tutorial.tsx` (replaced: instructor only), `components/DevRoleSwitcher.tsx` (reset clears the tour flags), `scripts/e2e/browser/session.ts` (`TOUR_SEEN_PREFIX`, `suppressTutorials`)
- Test: `components/tour/launcher.test.ts`, `components/Tutorial.test.ts`

**Interfaces:**
- Consumes: Task 5 `GuidedTour`; Task 2 `isTourRole`, `launchMode`, `readTourSeen`, `markTourSeen`, `recordTourEnd`, `TOUR_SEEN_PREFIX`; Task 1 `useDemoMode`, `GameContext`, `demoGameContext`, `DemoGameData`.
- Produces:
  ```ts
  // components.tsx
  export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:'; // instructor only now
  export const TOUR_PROMPT_TEXT = 'New here? Watch the 1-minute tour';
  export const TOUR_REPLAY_LABEL = 'Replay the 1-minute tour';
  export const RoleLayout: React.FC<{ children: React.ReactNode; tourView?: React.ComponentType }>;
  // components/Tutorial.tsx
  const Tutorial: React.FC<{ onClose?: () => void }>; // default export; `TutorialRole` is gone
  // scripts/e2e/browser/session.ts
  export const TOUR_SEEN_PREFIX = 'jf_tour_seen_v1:';
  ```

`TutorialLauncher` states, for a student: `pending` until `roundId` is known (then `launchMode` decides once), `tour`, `prompt`, `idle`. "?" always goes to `tour`. The tour's `onEnd` records the flag (`recordTourEnd`: finished/skipped yes, error no) and goes `idle`; the prompt's × writes the flag and goes `idle`. The views pass themselves as `tourView`, so `components.tsx` never imports a view (no import cycle). The prompt is `fixed` just under the header, full width with 16 px gutters on a phone and a pill at the right on wider screens.

- [ ] **Step 1: Write the failing tests**

Create `components/tour/launcher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/* The real GuidedTour portals into document.body, which a static render does
   not have; this stand-in shows whether the launcher chose to play it. */
vi.mock('./GuidedTour', async () => {
  const React = await import('react');
  return {
    GuidedTour: (props: { role: string; roundActive: boolean }) =>
      React.createElement('div', { 'data-test-tour': props.role, 'data-round-active': String(props.roundActive) }),
  };
});

import { GameContext } from '../../context';
import { RoleLayout, TOUR_PROMPT_TEXT, TOUR_REPLAY_LABEL } from '../../components';
import { demoGameContext, type DemoGameData } from '../../services/tour/demoGame';
import { TOUR_SEEN_PREFIX } from '../../services/tour/seen';
import { TOUR_SEEN_PREFIX as E2E_TOUR_SEEN_PREFIX } from '../../scripts/e2e/browser/session';
import { Role, type GameConfig, type User } from '../../types';
import { TEST_CONFIG } from '../../views/testing/renderWithGame';

class SpyStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  broken = false;
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { if (this.broken) throw new Error('SecurityError'); return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.writes.push(`set ${k}`); this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes.push(`remove ${k}`); this.map.delete(k); }
  clear() { this.map.clear(); }
}

/** The lobby before Round 1 starts, at the default fees. */
const CONFIG: GameConfig = { ...TEST_CONFIG, status: 'LOBBY', isActive: false, startTime: null, elapsedTime: 0 };

function game(role: Role, over: { isActive?: boolean; roundId?: number | null } = {}): DemoGameData {
  const user: User = {
    user_id: 5, display_name: 'Ann_bo', role, team_id: 3, id: '5', name: 'Ann_bo', team: '3', wallet: 0, purchasedJokes: [],
  };
  return {
    user, roster: [user], config: { ...CONFIG, isActive: over.isActive ?? false }, teamNames: {}, batches: [], sales: {},
    roundId: over.roundId === undefined ? 7 : over.roundId, roundIds: { 1: null, 2: null }, roundStatuses: { 1: null, 2: null },
    marketItems: [], teamSummary: null, teamFeedback: null, instructorLobby: null, instructorStats: null,
    instructorStatsRound1: null, instructorStatsRound2: null, qcQueue: null,
  };
}

const Screen = () => createElement('main', null, 'the live screen');
const render = (role: Role, over: { isActive?: boolean; roundId?: number | null } = {}) =>
  renderToStaticMarkup(createElement(GameContext.Provider, { value: demoGameContext(game(role, over)) },
    createElement(RoleLayout, { tourView: Screen }, createElement(Screen))));

let storage: SpyStorage;
beforeEach(() => {
  storage = new SpyStorage();
  (globalThis as any).localStorage = storage;
});
afterEach(() => {
  delete (globalThis as any).localStorage;
  delete (globalThis as any).sessionStorage;
});

describe('a student\'s first visit', () => {
  for (const role of [Role.JOKE_MAKER, Role.QUALITY_CONTROL]) {
    it(`${role}: the tour plays on its own while the round is not ACTIVE`, () => {
      const html = render(role);
      expect(html).toContain(`data-test-tour="${role}"`);
      expect(html).not.toContain(TOUR_PROMPT_TEXT);
      expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
    });

    it(`${role}: mid-round, a prompt instead of the tour`, () => {
      const html = render(role, { isActive: true });
      expect(html).toContain(TOUR_PROMPT_TEXT);
      expect(html).toContain('aria-label="Dismiss the tour prompt"');
      expect(html).not.toContain('data-test-tour');
    });
  }

  it('waits for the round\'s state before deciding, so a mid-round arrival is never shown the tour by mistake', () => {
    const html = render(Role.JOKE_MAKER, { roundId: null });
    expect(html).not.toContain('data-test-tour');
    expect(html).not.toContain(TOUR_PROMPT_TEXT);
    expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
  });

  it('writes no seen-flag on mount, however many times it mounts (StrictMode)', () => {
    render(Role.JOKE_MAKER);
    render(Role.JOKE_MAKER);
    render(Role.QUALITY_CONTROL, { isActive: true });
    expect(storage.writes).toEqual([]);
    expect(render(Role.JOKE_MAKER)).toContain('data-test-tour="JOKE_MAKER"');
  });
});

describe('a student who has seen it', () => {
  it('gets neither the tour nor the prompt, only the "?" to replay it', () => {
    storage.setItem(`${TOUR_SEEN_PREFIX}JOKE_MAKER`, '1');
    for (const isActive of [false, true]) {
      const html = render(Role.JOKE_MAKER, { isActive });
      expect(html).not.toContain('data-test-tour');
      expect(html).not.toContain(TOUR_PROMPT_TEXT);
      expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
    }
  });

  it('the old tutorial flag does not count: everyone sees the new tour once', () => {
    storage.setItem('jf_tutorial_seen_v1:JOKE_MAKER', '1');
    expect(render(Role.JOKE_MAKER)).toContain('data-test-tour="JOKE_MAKER"');
  });
});

describe('no auto-play', () => {
  it('when localStorage cannot be read; "?" still works', () => {
    storage.broken = true;
    const html = render(Role.QUALITY_CONTROL);
    expect(html).not.toContain('data-test-tour');
    expect(html).not.toContain(TOUR_PROMPT_TEXT);
    expect(html).toContain(`aria-label="${TOUR_REPLAY_LABEL}"`);
  });

  it('in an instructor watch tab — and no "?" there either', () => {
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => (k === 'joke_factory_watch_user_id' ? '42' : k === 'joke_factory_watch_display_name' ? 'Bot 1' : null),
    };
    for (const role of [Role.JOKE_MAKER, Role.QUALITY_CONTROL]) {
      const html = render(role);
      expect(html).not.toContain('data-test-tour');
      expect(html).not.toContain(TOUR_PROMPT_TEXT);
      expect(html).not.toContain(TOUR_REPLAY_LABEL);
    }
  });
});

describe('the instructor', () => {
  it('keeps the "How this works" modal, opened once on its own', () => {
    const html = render(Role.INSTRUCTOR);
    expect(html).toContain('title="How this works"');
    expect(html).toContain('Build the room');
    expect(html).not.toContain('data-test-tour');
    storage.setItem('jf_tutorial_seen_v1:INSTRUCTOR', '1');
    expect(render(Role.INSTRUCTOR)).not.toContain('Build the room');
  });

  it('a customer seat has no tutorial at all now', () => {
    const html = render(Role.CUSTOMER);
    expect(html).not.toContain('How this works');
    expect(html).not.toContain(TOUR_REPLAY_LABEL);
  });
});

describe('the browser e2e suite', () => {
  it('seeds the same seen-flag key, so the tour never covers the screen it drives', () => {
    expect(E2E_TOUR_SEEN_PREFIX).toBe(TOUR_SEEN_PREFIX);
  });
});
```

Create `components/Tutorial.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Tutorial from './Tutorial';

/* The "How this works" modal is the instructor's alone now: students get the
   guided tour of their own screen (components/tour/GuidedTour.tsx). */
describe('Tutorial', () => {
  const html = renderToStaticMarkup(createElement(Tutorial, { onClose: () => {} }));

  it('shows the instructor steps', () => {
    expect(html).toContain('Instructor');
    expect(html).toContain('Build the room');
    expect(html).toContain('Step 1 of 5');
  });

  it('has no Joke Maker, Marketing or AI Customers tabs', () => {
    // The retired tabs' labels and taglines ("Joke Maker · Production", "Marketing ·
    // Curate & publish", "AI Customers · N automated buyers") and their first steps.
    for (const gone of ['Production', 'Curate &amp; publish', 'AI Customers', 'automated buyers', 'You run Production', 'You are Marketing']) {
      expect(html).not.toContain(gone);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/launcher.test.ts components/Tutorial.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: FAIL — `Tests  13 failed | 2 passed (15)`. The old launcher opens the old modal for students, so the tour marker `data-test-tour` and the prompt never render, and `TOUR_PROMPT_TEXT`, `TOUR_REPLAY_LABEL` (components) and `TOUR_SEEN_PREFIX` (e2e session) do not exist yet. Both `Tutorial.test.ts` cases fail: the old modal opens on the Joke Maker tab. The two that already pass are the instructor modal and the watch-mode case.

- [ ] **Step 3: Replace the launcher**

In `components.tsx`, replace:

```tsx
import { isWatchMode } from './services/watchMode';
import Tutorial, { type TutorialRole } from './components/Tutorial';
```

with:

```tsx
import { isWatchMode } from './services/watchMode';
import Tutorial from './components/Tutorial';
import { GuidedTour } from './components/tour/GuidedTour';
import { isTourRole, launchMode, markTourSeen, readTourSeen, recordTourEnd } from './services/tour/seen';
```

In `components.tsx`, replace:

```tsx
/** localStorage key for "this role has already seen the tutorial". Versioned so a
 *  future copy revision can force it to show again. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';

const ROLE_TO_TUTORIAL_TAB: Record<string, TutorialRole> = {
  [Role.JOKE_MAKER]: 'joke_maker',
  [Role.QUALITY_CONTROL]: 'marketing',
  [Role.CUSTOMER]: 'customers',
  [Role.INSTRUCTOR]: 'instructor',
};

/**
 * Tutorial button + auto-open-once. Kept as its own component because RoleLayout
 * early-returns before its JSX — adding hooks there would make them conditional.
 */
const TutorialLauncher: React.FC<{ role: Role }> = ({ role }) => {
  const tab = ROLE_TO_TUTORIAL_TAB[role];

  // Decide during the first render, not in an effect. StrictMode mounts twice in
  // dev; writing the "seen" flag from an effect would mark it seen on mount #1 and
  // then suppress the modal on mount #2, so the tutorial would never appear.
  // Instead we mark it seen when the user actually dismisses it.
  const [open, setOpen] = React.useState(() => {
    // A watch tab is looking at someone else's seat; a tutorial modal would
    // cover the screen being watched and write a seen-flag into shared storage.
    if (!tab || isWatchMode()) return false;
    try {
      return !localStorage.getItem(`${TUTORIAL_SEEN_PREFIX}${role}`);
    } catch {
      return false; // private mode / storage disabled — don't auto-open
    }
  });

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(`${TUTORIAL_SEEN_PREFIX}${role}`, '1');
    } catch {
      // ignore — worst case it opens again next time
    }
  };

  // Hooks above run unconditionally; only then bail. A watch tab gets no
  // button at all, since dismissing the tutorial writes a seen-flag into the
  // shared localStorage that belongs to whoever else uses this browser.
  if (!tab || isWatchMode()) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-gray-400 hover:text-blue-600 transition-colors"
        title="How this works"
        aria-label="Open the tutorial"
      >
        <HelpCircle size={18} />
      </button>
      <Modal isOpen={open} onClose={dismiss} title="How this works" maxWidth="max-w-5xl">
        <Tutorial initialRole={tab} onClose={dismiss} />
      </Modal>
    </>
  );
};

export const RoleLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
```

with:

```tsx
/** localStorage key for "the instructor has already seen How this works". Versioned
 *  so a future copy revision can force it to show again. The students' guided
 *  tour has its own key: services/tour/seen.ts TOUR_SEEN_PREFIX. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';

/** The mid-round prompt (spec §3.3). */
export const TOUR_PROMPT_TEXT = 'New here? Watch the 1-minute tour';
/** The students' "?" button. */
export const TOUR_REPLAY_LABEL = 'Replay the 1-minute tour';

type TourPhase = 'pending' | 'idle' | 'tour' | 'prompt';

/**
 * The header's "?" button and what opens on its own. Kept as its own component
 * because RoleLayout early-returns before its JSX — hooks there would be
 * conditional.
 *
 * Instructor: the "How this works" modal, opened once on its own.
 * Joke Maker and Marketing: the guided tour of their own screen
 * (components/tour/GuidedTour.tsx). It plays on its own the first time, when
 * the round is not ACTIVE; a student arriving mid-round gets a dismissible
 * prompt instead, and "?" replays it (services/tour/seen.ts launchMode).
 * A watch tab gets none of this: it shows someone else's seat, and a seen-flag
 * written there would land in the shared localStorage of whoever else uses the
 * browser.
 *
 * Seen-flags are written when the modal or tour is dismissed, never on mount:
 * StrictMode mounts twice in dev, and a flag written on mount #1 would
 * suppress the auto-open on mount #2.
 */
const TutorialLauncher: React.FC<{ role: Role; tourView?: React.ComponentType }> = ({ role, tourView }) => {
  const { config, roundId } = useGame();
  const watch = isWatchMode();
  const tourRole = isTourRole(role) && tourView ? role : null;

  // ---- Instructor: the modal, auto-opened once.
  const [modalOpen, setModalOpen] = React.useState(() => {
    if (role !== Role.INSTRUCTOR || watch) return false;
    try {
      return !localStorage.getItem(`${TUTORIAL_SEEN_PREFIX}${role}`);
    } catch {
      return false; // private mode / storage disabled — don't auto-open
    }
  });
  const dismissModal = () => {
    setModalOpen(false);
    try {
      localStorage.setItem(`${TUTORIAL_SEEN_PREFIX}${role}`, '1');
    } catch {
      // ignore — worst case it opens again next time
    }
  };

  // ---- Students: the tour, decided once the round's state is known. roundId
  // arrives in the same poll update as config.isActive; before it, config
  // still holds its defaults (not ACTIVE), so deciding earlier would auto-play
  // the tour over a student who joined mid-round.
  const [phase, setPhase] = React.useState<TourPhase>('pending');
  if (phase === 'pending' && tourRole && roundId != null) {
    const mode = launchMode({ role: tourRole, watch, seen: readTourSeen(tourRole), roundActive: config.isActive });
    setPhase(mode === 'none' ? 'idle' : mode);
  }

  if (watch) return null;

  if (role === Role.INSTRUCTOR) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title="How this works"
          aria-label="Open the tutorial"
        >
          <HelpCircle size={18} />
        </button>
        <Modal isOpen={modalOpen} onClose={dismissModal} title="How this works" maxWidth="max-w-5xl">
          <Tutorial onClose={dismissModal} />
        </Modal>
      </>
    );
  }

  if (!tourRole || !tourView) return null;

  return (
    <>
      <button
        onClick={() => setPhase('tour')}
        className="text-gray-400 hover:text-blue-600 transition-colors"
        title={TOUR_REPLAY_LABEL}
        aria-label={TOUR_REPLAY_LABEL}
      >
        <HelpCircle size={18} />
      </button>
      {phase === 'prompt' && (
        <div
          role="status"
          className="fixed top-[4.5rem] left-4 right-4 sm:left-auto z-20 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-900 shadow-md"
          style={{ marginLeft: 0 }}
        >
          <button onClick={() => setPhase('tour')} className="flex-1 text-left font-semibold underline-offset-2 hover:underline">
            {TOUR_PROMPT_TEXT}
          </button>
          <button
            onClick={() => {
              markTourSeen(tourRole);
              setPhase('idle');
            }}
            className="rounded-full p-1 text-amber-700 hover:bg-amber-100"
            aria-label="Dismiss the tour prompt"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {phase === 'tour' && (
        <GuidedTour
          role={tourRole}
          view={tourView}
          config={config}
          roundActive={config.isActive}
          onEnd={outcome => {
            recordTourEnd(tourRole, outcome);
            setPhase('idle');
          }}
        />
      )}
    </>
  );
};

export const RoleLayout: React.FC<{
  children: React.ReactNode;
  /** The screen this layout wraps. The students' guided tour replays it with sample data. */
  tourView?: React.ComponentType;
}> = ({ children, tourView }) => {
```

In `components.tsx`, replace:

```tsx
             {!demoMode && <TutorialLauncher role={user.role} />}
```

with:

```tsx
             {!demoMode && <TutorialLauncher role={user.role} tourView={tourView} />}
```

- [ ] **Step 4: Each student view hands itself to the tour**

In `views/JokeMaker.tsx`, replace:

```tsx
    <RoleLayout>
```

with:

```tsx
    <RoleLayout tourView={JokeMaker}>
```

In `views/QualityControl.tsx`, replace:

```tsx
    <RoleLayout>
```

with:

```tsx
    <RoleLayout tourView={QualityControl}>
```

- [ ] **Step 5: The modal becomes the instructor's alone**

Replace the whole of `components/Tutorial.tsx` with:

```tsx
/* Tutorial — the instructor's "How this works" modal. Short, no logic dump.

   It used to have Joke Maker, Marketing and AI Customers tabs too. Students now
   get a guided walkthrough of their real screen instead
   (components/tour/GuidedTour.tsx), with the "how customers buy" step folded
   into each tour, so this modal is the instructor's alone.

   Ported from design_handoff_joke_factory_ui/Tutorial.jsx.txt, with the copy
   brought in line with the current rules: 12 judging criteria (incl. Title Fit),
   Marketing-only costs. */

import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, ArrowLeft, ArrowRight, Check, Star, Sparkles } from 'lucide-react';
// Import the leaf modules directly, never the components barrel — the barrel
// imports THIS file, so going back through it would create a cycle.
import { BRAND } from '../config/brand';
import { Button, Card } from './ui';
import {
  DIMENSIONS, IDEAL_DIMENSIONS, MAX_FIT, DEFAULT_IDEAL_PROFILE, TITLE_FIT_GRADES, dimById,
} from '../config/dimensions';
import { DEMO_CONFIG } from '../services/aiCustomerDemo';

const CFG = DEMO_CONFIG;
const COLOR = BRAND.bruinBlue;

/* ---------------------------------------------------------------- tiny visuals */

const Badge: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({ children, icon }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[11px] font-semibold">
    {icon}{children}
  </span>
);

const CostChip: React.FC<{ lines: Array<[string, string]> }> = ({ lines }) => (
  <div className="space-y-2">
    {lines.map((l, i) => (
      <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
        <span className="text-sm text-gray-700">{l[0]}</span>
        <span className="text-sm font-bold tabular-nums text-gray-900">{l[1]}</span>
      </div>
    ))}
  </div>
);

/** "Perfect 1, Strong 0.75, …" — read off the shared map so the prose can't
    drift from the scale the engine actually applies. */
const TITLE_FIT_SCALE = Object.entries(TITLE_FIT_GRADES)
  .map(([grade, value]) => `${grade} ${value}`)
  .join(', ');

/** The 12 judging criteria, with the one Marketing owns called out. */
const CriteriaGrid: React.FC = () => (
  <div>
    <div className="flex flex-wrap gap-1.5 mb-3">
      {DIMENSIONS.map(d => {
        const intrinsic = !d.hasIdeal;
        return (
          <span
            key={d.id}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border ${
              intrinsic
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            {intrinsic ? <Star size={10} /> : <Sparkles size={10} className="opacity-40" />}
            {d.label}
          </span>
        );
      })}
    </div>
    <p className="text-[11px] text-gray-600 leading-relaxed">
      <b className="text-amber-800">Title Fit</b> is the one criterion Marketing owns outright, and the only
      one graded on a scale of its own: it rates how well their title matches the joke — {TITLE_FIT_SCALE} —
      so a vague title costs the team a fraction of a point and a random one costs the whole mark.
    </p>
  </div>
);

const ProfileMini: React.FC = () => {
  const shown = Object.entries(DEFAULT_IDEAL_PROFILE).slice(0, 5);
  return (
    <div className="space-y-1.5">
      {shown.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-[12px]">
          <span className="text-gray-500">{dimById(k)?.label ?? k}</span>
          <span className="px-2 py-0.5 rounded text-white text-[11px] font-semibold" style={{ background: BRAND.bruinBlue }}>{v}</span>
        </div>
      ))}
      <div className="text-[11px] text-gray-400 pt-1">
        + {Object.keys(DEFAULT_IDEAL_PROFILE).length - shown.length} more criteria — hidden from every team.
      </div>
    </div>
  );
};

const RoundMini: React.FC = () => (
  <div className="flex items-center gap-2">
    <div className="flex-1 rounded-lg border-2 p-3 text-center" style={{ borderColor: BRAND.waste }}>
      <div className="text-xs font-bold" style={{ color: BRAND.waste }}>Round 1</div>
      <div className="text-[10px] text-gray-500 mt-0.5">Siloed · push</div>
    </div>
    <ArrowRight size={16} className="text-gray-300" />
    <div className="flex-1 rounded-lg border-2 p-3 text-center" style={{ borderColor: BRAND.sold }}>
      <div className="text-xs font-bold" style={{ color: BRAND.sold }}>Round 2</div>
      <div className="text-[10px] text-gray-500 mt-0.5">Co-located · pull</div>
    </div>
  </div>
);

/* ---------------------------------------------------------------- steps */

interface Step { t: string; b: string; v: () => React.ReactNode }

function buildSteps(): Step[] {
  return [
    { t: 'Build the room', b: 'Create teams, assign Joke Maker / Marketing roles, and watch the live distribution as students join the lobby.', v: () => <CostChip lines={[['4 teams', '8 students'], ['AI customers', String(CFG.customerCount)]]} /> },
    { t: 'Set the hidden ideal', b: `Choose one level on each of the ${IDEAL_DIMENSIONS.length} criteria that have a target — the secret ideal the AI customers reward. Title Fit is the twelfth: it grades itself, so there is nothing to set. Then tune τ, jitter, swap margin, budget, and the two costs.`, v: () => <ProfileMini /> },
    {
      t: `The ${MAX_FIT} criteria`,
      b: `Every published joke is judged on ${MAX_FIT} criteria. ${IDEAL_DIMENSIONS.length} of them are matched against a hidden "ideal joke" the instructor sets before the round; Title Fit grades itself. The more criteria a joke matches outright, the more customers buy it.`,
      v: () => <CriteriaGrid />,
    },
    { t: 'Run the rounds', b: 'Start, end, and reset rounds. Between rounds reveal teammates so Round 2 can co-locate Production and Marketing — the intervention that fixes the information flow.', v: () => <RoundMini /> },
    { t: 'Watch it land', b: 'Your dashboard tracks the leaderboard, sales over time, average fit, waste and lead time — so the chaos-to-kaizen story is visible in the numbers.', v: () => <RoundMini /> },
  ];
}

/* ---------------------------------------------------------------- main */

const Tutorial: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const steps = useMemo(buildSteps, []);
  const [step, setStep] = useState(0);
  const last = step === steps.length - 1;

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-2 gap-0 -m-4">
        {/* left: copy + steps */}
        <div className="p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Badge icon={<SlidersHorizontal size={15} />}>Instructor</Badge>
            <span className="text-[11px] text-gray-400">Master control</span>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mt-4 mb-1">
            Step {step + 1} of {steps.length}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">{steps[step].t}</h2>
          <p className="text-[15px] text-gray-600 mt-3 leading-relaxed flex-1">{steps[step].b}</p>

          {/* progress + nav */}
          <div className="mt-6">
            <div className="flex gap-1.5 mb-4">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === step ? 28 : 14, background: i <= step ? COLOR : '#e5e7eb' }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="px-3 py-1.5 text-sm inline-flex items-center gap-1.5"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ArrowLeft size={14} /> Back
              </Button>
              {!last ? (
                <Button
                  className="ml-auto px-3 py-1.5 text-sm inline-flex items-center gap-1.5"
                  onClick={() => setStep(s => s + 1)}
                >
                  Next <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  className="ml-auto px-3 py-1.5 text-sm text-white inline-flex items-center gap-1.5"
                  style={{ background: COLOR }}
                  onClick={() => onClose?.()}
                >
                  Got it — start <Check size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* right: visual */}
        <div className="p-6 bg-slate-50 border-l border-gray-100 flex items-center">
          <div className="w-full">{steps[step].v()}</div>
        </div>
      </div>
    </Card>
  );
};

export default Tutorial;
```

- [ ] **Step 6: Dev reset and the browser e2e suite know the new flag**

In `components/DevRoleSwitcher.tsx`, replace:

```tsx
import { TUTORIAL_SEEN_PREFIX } from '../components';
```

with:

```tsx
import { TUTORIAL_SEEN_PREFIX } from '../components';
import { TOUR_SEEN_PREFIX } from '../services/tour/seen';
```

In `components/DevRoleSwitcher.tsx`, replace:

```tsx
  // Re-arm the per-role tutorial auto-open, otherwise Reset won't bring it back.
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(TUTORIAL_SEEN_PREFIX)) localStorage.removeItem(k);
  }
```

with:

```tsx
  // Re-arm the instructor's tutorial and the students' guided tour, otherwise
  // Reset won't bring them back.
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(TUTORIAL_SEEN_PREFIX) || k.startsWith(TOUR_SEEN_PREFIX)) localStorage.removeItem(k);
  }
```

In `scripts/e2e/browser/session.ts`, replace:

```ts
/** components.tsx:40 — `${TUTORIAL_SEEN_PREFIX}${Role}` suppresses the auto-opening tutorial. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';
```

with:

```ts
/** components.tsx — `${TUTORIAL_SEEN_PREFIX}${Role}` suppresses the instructor's auto-opening tutorial. */
export const TUTORIAL_SEEN_PREFIX = 'jf_tutorial_seen_v1:';

/** services/tour/seen.ts — `${TOUR_SEEN_PREFIX}${Role}` stops the students' guided tour auto-playing. */
export const TOUR_SEEN_PREFIX = 'jf_tour_seen_v1:';
```

In `scripts/e2e/browser/session.ts`, replace:

```ts
/**
 * Stop the per-role tutorial modal auto-opening and swallowing the first click.
 * Must be called BEFORE the context's first navigation.
 */
export async function suppressTutorials(context: BrowserContext): Promise<void> {
  await context.addInitScript(prefix => {
    try {
      for (const role of ['INSTRUCTOR', 'JOKE_MAKER', 'QUALITY_CONTROL', 'CUSTOMER']) {
        localStorage.setItem(`${prefix}${role}`, '1');
      }
    } catch {
      /* ignore */
    }
  }, TUTORIAL_SEEN_PREFIX);
}
```

with:

```ts
/**
 * Stop the instructor's tutorial modal and the students' guided tour starting
 * on their own and swallowing the first click.
 * Must be called BEFORE the context's first navigation.
 */
export async function suppressTutorials(context: BrowserContext): Promise<void> {
  await context.addInitScript(({ tutorial, tour }) => {
    try {
      for (const role of ['INSTRUCTOR', 'JOKE_MAKER', 'QUALITY_CONTROL', 'CUSTOMER']) {
        localStorage.setItem(`${tutorial}${role}`, '1');
      }
      for (const role of ['JOKE_MAKER', 'QUALITY_CONTROL']) {
        localStorage.setItem(`${tour}${role}`, '1');
      }
    } catch {
      /* ignore */
    }
  }, { tutorial: TUTORIAL_SEEN_PREFIX, tour: TOUR_SEEN_PREFIX });
}
```

- [ ] **Step 7: Run them to verify they pass, then everything**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx vitest run components/tour/launcher.test.ts components/Tutorial.test.ts components/tour/demoMode.test.ts 2>&1 | grep -E 'Test Files|Tests '`
Expected: `Test Files  3 passed (3)`, `Tests  20 passed (20)`.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && grep -rn "TutorialRole\|initialRole\|ROLE_TO_TUTORIAL_TAB" --include='*.ts' --include='*.tsx' components components.tsx views`
Expected: no output.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | grep -E 'Test Files|Tests ' && npx vite build 2>&1 | tail -1`
Expected: tsc prints nothing and exits 0; `Test Files  59 passed (59)`, `Tests  938 passed (938)`; the build's last line is `✓ built in …`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/AI-Joke-Factory
git add components.tsx views/JokeMaker.tsx views/QualityControl.tsx components/Tutorial.tsx \
  components/DevRoleSwitcher.tsx scripts/e2e/browser/session.ts \
  components/tour/launcher.test.ts components/Tutorial.test.ts
git commit -m "feat(tour): students get the guided tour — once on their own, a prompt mid-round, ? to replay

The instructor keeps the How this works modal; its student and AI Customers
tabs are gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Task 7: Final verification and the browser checklist

**Files:** none (no code changes; if a check fails, fix it in the owning task's files as a new commit).

**Interfaces:** Consumes everything above. Produces nothing.

- [ ] **Step 1: Types, tests, build**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && npx tsc --noEmit -p tsconfig.json && echo TSC-OK && npx vitest run 2>&1 | grep -E 'Test Files|Tests ' && npx vite build 2>&1 | tail -1`
Expected: `TSC-OK`; `Test Files  59 passed (59)`, `Tests  938 passed (938)`; `✓ built in …`.

- [ ] **Step 2: Nothing stray**

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && git status --short`
Expected: only ` M .claude/launch.json` and `?? .progress` (both pre-existing, untouched), plus `?? docs/superpowers/plans/…` files if the plan itself was not committed.

Run: `cd ~/Documents/GitHub/AI-Joke-Factory && git diff --stat HEAD~6 -- package.json package-lock.json`
Expected: no output (no new dependency).

- [ ] **Step 3: Browser checklist (the controller runs this; local stack or mock mode)**

Start the app the usual way (`.claude/launch.json` "joke-factory" for mock mode, or "joke-factory-lean-local" against the local backend on :8081). Use the Browser pane; for each check, record pass/fail.

1. **Fresh flags.** Clear the tour flags: run `Object.keys(localStorage).filter(k => k.startsWith('jf_tour_seen_v1:')).forEach(k => localStorage.removeItem(k))` with the JavaScript tool, then reload.
2. **Joke Maker, round not started (Round 1).** Join as a student pair and let the instructor assign teams without starting the round. On reaching the Joke Maker screen the tour starts by itself: the page dims; step 1 is a centred card "You're the Joke Maker."; step 2 spotlights the textbox and the five numbered jokes type in; step 3 ticks the box and, after ~3 s, the textbox clears and a new batch appears in Value stream; step 4 spotlights the shipping line ("Shipping: $2 per batch of 5") with the caption "Each batch of 5 costs $2 to ship, …"; step 5 spotlights the Next step line, which reads "Keep writing — every batch is another chance to sell."; Value stream: the new batch's dots change from yellow to grey/red, then one turns green; the expanded batch shows "From Marketing" and the note; the four key tiles (Profit, Rank, Jokes Sold / Made, Created to Publish), with "More numbers" still closed; two centred cards; "Start" closes it. Then `localStorage.getItem('jf_tour_seen_v1:JOKE_MAKER')` is `"1"` and the live screen is unchanged (its textbox empty, its batches the real ones, its Next step line live again).
3. **Round 2 copy.** With the class in Round 2 (not started) and the flag removed, the shipping step reads "You choose the size now: $1 for 1–4 jokes, $2 for 5, $3 for 6–10. …".
4. **Controls.** Press "?" (title "Replay the 1-minute tour"): the tour replays. Pause stops the progress bar; Play resumes. Back on step 3 returns to step 2 and the typing restarts from nothing. → and ← move steps; Space pauses; Esc skips (flag stays set). Every highlighted element is fully visible (scroll positions follow), including at phone width (resize the pane to mobile: the caption stays inside the screen, the control bar wraps, nothing scrolls sideways).
5. **Marketing, round not started.** Same with a fresh `jf_tour_seen_v1:QUALITY_CONTROL`: the batch lands unsplit in the splitter, splits into five, three get "Selected to submit" one by one, a Topic and the first title type in, the note box counts up to n/500, Release is spotlighted, then the four key tiles change (Content Backlog 0); on "Fees add up" the "More numbers" panel opens by itself with the Shipping, Storage and Hosting fee tiles spotlighted, and a new batch lands on the desk; the Next step line then reads "Batch waiting 52 s — release what's good enough. Storage costs 5¢ a joke each minute."; the Customer feedback card shows a new "To-Do Overload" card with ✓ and ✗ criteria boxes; the Expand button; the closing card. The captions quote the round's amounts ("$0.10", "$1", "$0.01", "5¢" at the defaults). Afterwards "More numbers" on the live screen is as the student left it (check `localStorage.getItem('jf_more_tiles_quality_control')` is unchanged).
6. **Mid-round arrival.** With the round ACTIVE and the flag removed, reload: no tour; the pill "New here? Watch the 1-minute tour" appears under the header. Its × removes it and sets the flag; clicking the text starts the tour. While a tour is playing, start the round from the instructor tab: the Skip button turns yellow and reads "Round started — go to the game"; the steps do not change.
7. **Instructor.** As the instructor, "?" (title "How this works") opens the old modal with instructor steps only — no Joke Maker / Marketing / AI Customers tabs.
8. **Watch mode.** Open a bot's seat from the Bot Panel (👁): no tour, no prompt, no "?".
9. **No requests from the demo.** With the network log open (`read_network_requests`), replay a tour: the only requests during it are the live app's usual 2.5 s polls (`/v1/session/me`, `/v1/rounds/active`, and the role's usual reads). No POST, PATCH or DELETE; no request to a URL the live screen was not already polling; no `localStorage` key other than `jf_tour_seen_v1:<ROLE>` changes (compare `Object.keys(localStorage)` and the `joke_factory_*` and `jf_more_tiles_*` values before and after).
10. **Clicks and keys do not leak.** During the tour, click where the live "Send to Marketing" or "Release to market" button would be: nothing happens (the overlay takes the click and the live app is `inert`). After the tour, `document.getElementById('root').hasAttribute('inert')` is `false` and the page scrolls again.
11. **Console.** `read_console_messages` with `onlyErrors: true` shows nothing from the tour.

---
## Self-review against the spec

**Coverage (spec section → task):**
- §1 goal, one-minute walkthrough of the real screen, sample data that changes: Tasks 3 (script; Joke Maker 61 s, Marketing 72 s, pinned), 4 (real views under the demo game), 5 (dim + spotlight + caption).
- §2 decisions: auto-play once + skippable + "?" replay (Task 6); in-house engine, no dependency (Tasks 4–5, Global Constraints); per-role tours, instructor keeps the modal, student/Customers tabs removed, "how customers buy" folded into the Joke Maker tour (Tasks 3, 6); mid-round prompt (Tasks 2, 6); Lean only, Round 1 vs Round 2 shipping copy, amounts from the round (Task 3 `stepsFor`); watch mode never auto-plays and has no replay (Tasks 2, 6).
- §3.1 stage: `GameContext` exported (already at HEAD), demo provider, no-op actions, `DemoModeContext` / `useDemoMode`, audit of direct calls, live app untouched (Tasks 1, 4, 5).
- §3.2 engine: `data-tour` ids (Task 4), scroll into view + cut-out + caption side with room + resize/scroll tracking with `ResizeObserver` (Task 5), centred card for no/missing target (Task 5 `findTourTarget`, `placeCaption`), control bar with progress, "Step n of N", Back/Pause/Next/Skip (Task 5), keyboard (Task 5 `keyAction`), `durationMs` default 6000 + `onEnter` + deterministic Back by rebuilding from steps 1..k (Tasks 2–3), reduced motion (Tasks 3 `typedLength`, 5), reducer driven by a timer (Tasks 2, 5).
- §3.3 seen flag key, written on dismissal not mount, auto-play conditions, prompt with × that sets the flag, "?" replays / opens the instructor modal, "Round started — go to the game" (Tasks 2, 5, 6).
- §4 scripts and copy: Task 3 (verbatim captions pinned for both roles and both rounds; amounts from the round with the game's formatters; Team Demo; five placeholder jokes; earlier batch 2 of 5 sold; numbers from the game's formulas incl. shipping, storage and hosting; the Next step step shows a real sentence; "More numbers" opened by the demo for the fee step; the Customer feedback card's ✓/✗ boxes and its Expand button).
- §5 units: every unit exists with the named responsibility; `components/tour/spotlightGeometry.ts` and `tourControls.ts` are pure helpers split out of `Spotlight.tsx` / `GuidedTour.tsx` so they can be tested without a DOM; `services/tour/demoUi.ts` and `demoGame.ts` are split out of the script so `context.tsx` imports only a type.
- §6 errors: missing target → centred card (no step is ever dropped: the branch is Lean-only, so every step applies in both rounds); storage unavailable → no auto-play, "?" works (Tasks 2, 6 tests); error boundary ends the tour, sets nothing, logs (Task 5 `TourErrorBoundary`, Task 2 `recordTourEnd('error')`); demo never sends a request (Tasks 1, 4 tests).
- §7 tests: machine (Task 2), `stepsFor` Round 1 vs Round 2 and non-default fees (Task 3), `shouldAutoPlay` grid (Task 2), `buildDemoState` determinism and profit consistency incl. the fees (Task 3), zero fetch in demo mode with fetch stubbed (Tasks 1, 4), static target render for both roles and both rounds with "More numbers" opened where a step needs it (Task 4); browser list (Task 7).

**Placeholders:** none — every code step has the full code, every edit an exact anchor taken from `4540404` (or from the text an earlier step of this plan leaves).

**Type consistency:** `DemoUi` (Task 1) is what `demoScript` changes (Task 3) and what the views read (Task 4); `TourStep<DemoState, TourRound>` = `DemoStep` everywhere; `DemoOptions extends TourRound`, so `stepsFor(role, options)` and `captionText(step, options)` take the plan's options directly (Task 5 `tourPlan`); `TourOutcome` flows `GuidedTour.onEnd` → `recordTourEnd`; `tourView: React.ComponentType` flows `RoleLayout` → `TutorialLauncher` → `GuidedTour.view` → `DemoStage.view`; `StatTiles` `open` / `tourKey` / `tourMore` (Task 4) are what the views pass.

**Review Focus:** each of the five lines above has its pinning test in the owning task (named there).

## Spec ambiguities and how this plan resolves them

1. **"{hosting}" has no unit in the copy.** `{storage}` is followed by "a joke each minute" in the spec text, so it is `fmtCents` ("5¢"). `{hosting}` stands alone in parentheses, so it is `fmtPerMinute` ("5¢ a joke each minute"), the phrase the game itself uses for per-minute fees. Prices and per-batch fees use `fmtFee` ("$1", "$0.10", "$2"), the game's "whole dollars as `$2`" format.
2. **"The 'More numbers' area … spotlighting the Shipping, Storage and Hosting fee tiles."** The three fee tiles are not contiguous in the More grid (Content Waste sits between them), and moving tiles would change the student's screen. The spotlight covers the whole opened More numbers panel (`mk-more`), which holds the three fee tiles; the caption names them. The panel is opened through the demo state, never through `jf_more_tiles_<role>`.
3. **The Next step line inside the demo.** It runs the real rule functions on the demo state with a demo clock (`DemoUi.clockMs`), so its sentence follows the script: "Marketing's desk is empty — …", then "Keep writing — …" at the Joke Maker's Next step, then Marketing's note once it arrives. For Marketing's "like releasing a batch that has waited too long", "Fees add up" lands a second batch (#103) on the desk, so at the Next step the line really says "Batch waiting 52 s — release what's good enough. Storage costs 5¢ a joke each minute." — and the fee step's "a batch waiting on your desk pays storage" is visible on screen.
4. **"Five placeholder jokes" vs an earlier batch already on the market.** The five jokes are the batch the tour writes, sends and splits. The earlier batch (2 of 5 sold) gets five more original one-liners (`EARLIER_JOKES`) and stays collapsed in both tours. Batch #103 reuses the five jokes; it is never split.
5. **"Consistent with the game's own formulas … plus the Lean costs."** Shipping is `shippingFeeFor` per sent batch (unsplit = the standard 5); storage is jokes × minutes on the desk; hosting is released-but-unsold jokes × minutes since release. The demo has no per-joke sale time, so a sold joke stops counting for hosting altogether — an approximation, consistent between the numbers and the test that re-derives them. At the default fees the Joke Maker's tour ends at about −$2.94 profit: honest arithmetic for two batches with 3 sales, and the caption says profit can go negative.
6. **Length.** The spec says ~60 s; Marketing has 12 steps. At the spec's 5–7 s pace the Joke Maker tour is 61 s and the Marketing tour 72 s (short steps 5 s, typing and fee steps 7 s). Both are pinned in Task 3.
7. **"Auto-play: each step advances on its own" vs the last step's [Start] button.** The last step holds at its end and waits for Start (or Skip / Esc); it does not close itself.
8. **When is "the round not ACTIVE" known?** The poll sets the student's role before `config.isActive`, so a student refreshing mid-round would see a stale "not ACTIVE". The launcher decides only once `roundId` is set (same poll update as `isActive`); until then neither the tour nor the prompt shows, and "?" works.
9. **"Data-tour attributes … in RoleLayout."** No step of §4 targets the header, so `RoleLayout` gets the demo-mode gate and the `tourView` prop, but no `data-tour` id.
10. **How the demo "types into the textbox".** The textbox, certify box, open batches, Marketing's picks/titles/note, "More numbers" and the Next step clock are the views' local state, which a GameContext cannot reach. The views read a `DemoUi` from `DemoModeContext` in place of that state inside the stage; outside it nothing changes.
11. **Marketing's release moment.** Step 6 only spotlights the button; the release happens on entering step 7 ("Your scoreboard"), so the button never vanishes from under its own spotlight.
12. **A round whose config is missing a fee** (an older backend). The demo game is always Lean (this branch is Lean-only); a fee the round does not carry reads 0, as everywhere else in the app, and a broken price falls back to `SIM_CONFIG.economics`.
13. **Customer role.** The old modal's "AI Customers" tab served the dev-only Customer seat; with the tab retired, that seat has no "?" (it is reached only through the dev switcher).
14. **Click-through.** `inert` elements let clicks pass to what is underneath, so the spotlight overlay takes every click and the live `#root` is made `inert` for the tour's lifetime; neither is in the spec, both follow from "the tour never changes the real game".

## Verification record

Every step above was applied literally, in order, to a fresh clone of `4540404` (with `node_modules` linked), every Run line was run, and every commit block was run. Each RED step failed as stated, each GREEN step passed with the stated counts, and `git status --short` was clean after every commit. Totals: **746 tests in 48 files → 938 tests in 59 files**; `npx tsc --noEmit -p tsconfig.json` exits 0 after every task; `npx vite build` succeeds after Tasks 5 and 6. Task 7's browser checklist was not run (it needs the live stack).
