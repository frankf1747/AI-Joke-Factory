# Experiment records and Compare runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An instructor saves a record of each run (students or bots) from Debrief, and compares 2–6 records side by side in a new Compare tab, choosing which measures count and their targets.

**Architecture:** Pure modules under `services/runRecord/` (types, build, parse, measures, compare, csv) do all the work and carry the tests; two thin components (`SaveRunDialog`, `CompareTab`) render them. The record is built from the same responses Debrief already uses (stats, `GET …/config`, `GET …/lean-charts`); the pilot builds the same record from its own reads. No backend change.

**Tech Stack:** React 19 + TypeScript, Vite, vitest (node env, `renderToStaticMarkup` for render tests), recharts (already a dependency).

**Spec:** `docs/superpowers/specs/2026-11-12-experiment-records-design.md`

## Global Constraints

- Frontend repo only, branch `feat/experiment-records`. No backend change, no new npm dependency.
- Record file: `format: "jf-run-record"`, `version: 1`, suffix `.jfrun.json`; a spreadsheet copy `.csv`.
- No student logins, emails or joke text in a record.
- Compare loads at most **6** records. Criteria are remembered in `localStorage` key `jf_compare_criteria`; every read and write in try/catch, failure = defaults.
- No built-in PASS/FAIL anywhere in Compare: only the instructor's own "Use / direction / target".
- A fee at 0 is still recorded in settings (the record is the full config); display rules of `services/shownFees.ts` are untouched.
- Commit with new commits only, message trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `.claude/launch.json` or `.progress`. Never push.
- Run before every commit: `npx vitest run <the task's test files>` and `npm run typecheck`. Before the final commit of each task: `npx vitest run` (whole suite).

## Review Focus

1. **A team name that starts with `=`, `+`, `-` or `@`** (instructor renames are free text) opens as a formula in a spreadsheet: CSV escapes such *string* cells with a leading `'`; numbers (negative profit) are untouched. Test in Task 2.
2. **A Classic round, or a lean-charts read that answers 409 NOT_LEAN_ROUND:** the record still saves, without `batches`; flow measures read "–" (null), not 0. Tests in Tasks 1, 3, 4.
3. **A run with no Round 2** (Round 2 never started, or not ended at save time): Round 1 only; Round-1→2 measures are null; settings rows for Round 2 show "–" for that run. Tests in Tasks 1, 3, 5.
4. **A bad file in the picker** (not JSON, another JSON, a newer version, a huge file, the same record twice, a seventh file): refused with its file name and reason; the good files still load. Tests in Tasks 2 and 5.
5. **Teams with no sales / no releases** (division by zero): sold share and fees % of revenue are null, never `NaN` or `Infinity`, and Best skips nulls. Tests in Task 3.

---

## File map

| File | Responsibility |
|---|---|
| `services/runRecord/types.ts` | Record types, `RUN_RECORD_FORMAT`, `RUN_RECORD_VERSION`, `SETTING_FIELDS` |
| `services/runRecord/build.ts` | Pure: responses → `RunRound`, rounds → `RunRecord`; `defaultPlayedBy`, `defaultRunName`, `fileSafeName` |
| `services/runRecord/parse.ts` | Pure: file text → record or reason; `addRecords` (cap, duplicates) |
| `services/runRecord/measures.ts` | Pure: `MEASURES`, `measureValue`, `batchCurve` |
| `services/runRecord/compare.ts` | Pure: `settingRows`, criteria, `bestRuns`, `meetsTarget`, criteria storage |
| `services/runRecord/csv.ts` | Pure: `recordCsv`, `comparisonCsv`, cell escaping |
| `services/runRecord/botRegistry.ts` | In-memory map of teams the Bot panel created |
| `services/download.ts` | `downloadText` (Blob + anchor), browser only |
| `components/instructor/SaveRunDialog.tsx` | The Debrief "Save run record" dialog |
| `components/instructor/CompareTab.tsx` | The Compare tab |
| `scripts/pilot/feedbackClass.ts`, `feedback-pilot.mts`, `cost-sweep.mts` | Pilot writes records |
| `docs/lean-market-mode.md` | "Keep a record, compare runs" section |

---

### Task 1: Record types and builder

**Files:**
- Create: `services/runRecord/types.ts`, `services/runRecord/build.ts`
- Test: `services/runRecord/build.test.ts`

**Interfaces:**
- Consumes: `boardRows(rows, teamNames, rates)` from `services/liveBoard.ts` (gives `fees: TeamFees`, `feesTotal`, `neverSold`, `sentToReleased`, `toFirstSale`); `LeaderboardRow` from `services/classTotals.ts`; `FeeRates` from `services/shownFees.ts`; `InstructorRound`, `LeanChartsResponse` from `types/api.ts`.
- Produces:

```ts
// types.ts
export const RUN_RECORD_FORMAT = 'jf-run-record';
export const RUN_RECORD_VERSION = 1;
export type PlayedBy = 'students' | 'bots' | 'mixed';
export interface RunBot { persona: string; use_feedback?: boolean; round2_batch_size?: number; release_all?: boolean; seed?: string }
export interface RunBatch { seq: number; sent_s: number; jokes: number; released: number; sold: number; first_sale_s: number | null }
export interface RunFees { listing: number; hosting: number; shipping: number; storage: number; discard: number; total: number }
export interface RunTeam {
  team_id: number; team: string; profit: number; sold: number; released: number; made: number;
  never_sold: number | null; discarded: number; fees: RunFees;
  sent_to_released_s: number | null; to_first_sale_s: number | null;
  batches?: RunBatch[];                       // absent in a Classic round
  fit_by_batch?: Array<{ seq: number; fit: number | null }>;  // pilot only
  bot?: RunBot;
}
export type SettingValue = number | string;
export interface RunRound {
  round: 1 | 2; round_id: number; status: string;
  started_at: string | null; ended_at: string | null;
  settings: Record<string, SettingValue>;
  ideal_profile?: Record<string, string>;
  teams: RunTeam[];
}
export interface RunRecord {
  format: typeof RUN_RECORD_FORMAT; version: number;
  name: string; notes?: string; played_by: PlayedBy; exported_at: string;
  rounds: RunRound[];
}
/** Every setting a record keeps, in display order: [snake_case key on InstructorRound, label]. */
export const SETTING_FIELDS: ReadonlyArray<readonly [string, string]>;

// build.ts
export interface RunRoundInput {
  round: 1 | 2;
  config: InstructorRound;                       // GET /v1/instructor/rounds/:id/config → .round
  stats: { leaderboard: LeaderboardRow[] };      // already filtered to playing teams
  charts: LeanChartsResponse | null;             // null in a Classic round
  teamNames: Record<string, string>;
  rates: FeeRates;                               // that round's own rates (services/roundRates)
  bots?: ReadonlyMap<number, RunBot>;            // team_id → bot fields
  fits?: ReadonlyMap<number, Array<{ seq: number; fit: number | null }>>;
}
export function buildRunRound(input: RunRoundInput): RunRound;
export function buildRunRecord(meta: { name: string; notes?: string; playedBy: PlayedBy; exportedAt: string }, rounds: RunRound[]): RunRecord;
export function defaultPlayedBy(teamIds: readonly number[], botTeamIds: ReadonlySet<number>): PlayedBy;
export function defaultRunName(now: Date): string;   // "2026-11-20 class" (local date)
export function fileSafeName(name: string): string;  // [A-Za-z0-9 ._-] kept, others → "-", trimmed, ≤ 80 chars, "" → "run"
```

`SETTING_FIELDS` (exact keys and labels, this order):
`market_mode` Market mode · `batch_size` Batch size · `max_batch_size` Largest batch · `arrival_window_seconds` Customer arrival window (s) · `market_price` Price · `customer_budget` Customer budget · `customers_per_team` Customers per team · `customer_count` Customers · `buy_threshold` Buy threshold · `jitter` Jitter · `preference_base` Preference base · `swap_margin` Swap margin · `feedback_pass_threshold` Feedback pass threshold · `feedback_joke_count` Feedback jokes shown · `wip_limit` WIP limit · `cost_of_publishing` Listing · `hosting_fee_per_joke_minute` Hosting per joke-minute · `shipping_fee_small` Shipping, small · `shipping_fee_standard` Shipping, standard · `shipping_fee_large` Shipping, large · `storage_fee_per_joke_minute` Storage per joke-minute · `cost_of_discard` Discard.

- [ ] **Step 1: Write the failing tests** in `services/runRecord/build.test.ts`, with a fixture of two leaderboard rows (team 1 "Team A" profit 4.5, total_sales 12, published 9, total_jokes 15, unsold 2, discarded 1, `lean` with hosting 0.5; team 2 profit −1.25, total_sales 0, published 0) and a config with `cost_of_publishing: 0.1`, `hosting_fee_per_joke_minute: 0.05`, `shipping_fee_small: 0`, `ideal_profile` set, and one key absent (`preference_base`):
  - `buildRunRound` keeps every `SETTING_FIELDS` key the config has, **including fees at 0** (`settings.shipping_fee_small === 0`), and omits the absent one (`!('preference_base' in settings)`).
  - `ideal_profile` copied; `round_id`, `status`, `started_at`, `ended_at` from the config.
  - team 1: `sold 12, released 9, made 15, never_sold 2, discarded 1`, `fees.listing` = 0.9 (= boardRows), `fees.total` = boardRows `feesTotal`; `team` = the renamed name when `teamNames['1'] = 'Owls'`.
  - with `charts` holding team 1's batches `[{seq:1, sent_s:30, jokes:5, published:4, sold:3, first_sale_s:40}]` → `batches` = `[{seq:1, sent_s:30, jokes:5, released:4, sold:3, first_sale_s:40}]`; a chart team not in the leaderboard is ignored.
  - `charts: null` → no `batches` key on any team (`'batches' in team === false`).
  - `bots` map `{1: {persona:'BALANCED', use_feedback:true}}` → team 1 has `bot`, team 2 has no `bot` key; `fits` likewise → `fit_by_batch`.
  - `buildRunRecord` sets `format: 'jf-run-record'`, `version: 1`, sorts rounds by `round`, omits `notes` when empty or whitespace.
  - `defaultPlayedBy([1,2],{1,2})` → `'bots'`; `([1,2],{1})` → `'mixed'`; `([1,2],{})` → `'students'`; `([], {})` → `'students'`.
  - `defaultRunName(new Date(2026, 10, 20, 9))` → `'2026-11-20 class'`.
  - `fileSafeName('Week 3: listing/25¢')` → `'Week 3- listing-25-'`; `fileSafeName('   ')` → `'run'`; a 200-char name → length 80.

- [ ] **Step 2:** Run `npx vitest run services/runRecord/build.test.ts` — FAIL (module not found).
- [ ] **Step 3:** Implement `types.ts` and `build.ts`. Team figures come from `boardRows(stats.leaderboard, teamNames, rates)` so fees match Debrief exactly; `made` = `total_jokes`; ids are numbers (`Number(row.team.id)`). Numbers that are not finite become 0 (counts) or null (nullable fields).
- [ ] **Step 4:** Run the test file and `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(records): run record types and builder`.

---

### Task 2: Parse, add, and CSV

**Files:**
- Create: `services/runRecord/parse.ts`, `services/runRecord/csv.ts`
- Test: `services/runRecord/parse.test.ts`, `services/runRecord/csv.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `SETTING_FIELDS`, `buildRunRecord` (for fixtures).
- Produces:

```ts
// parse.ts
export const MAX_RECORD_BYTES = 5_000_000;
export const MAX_RUNS = 6;
export type ParseResult = { ok: true; record: RunRecord } | { ok: false; reason: string };
export function parseRunRecord(text: string): ParseResult;
export interface LoadedRun { fileName: string; record: RunRecord }
export interface Refusal { fileName: string; reason: string }
/** Appends parsed files to `current`, refusing bad files, duplicates and any past MAX_RUNS. */
export function addRecords(current: readonly LoadedRun[], files: ReadonlyArray<{ fileName: string; text: string }>):
  { runs: LoadedRun[]; refused: Refusal[] };

// csv.ts
export function csvCell(v: string | number | boolean | null | undefined): string;
export function recordCsv(record: RunRecord): string;
```

Exact refusal reasons (tests assert them verbatim):
- `"is larger than 5 MB"` (text length > `MAX_RECORD_BYTES`)
- `"is not JSON"`
- `"is not a Joke Factory run record"` (format missing/different, or `rounds` not a non-empty array, or a round's `round` not 1/2, or a team's `profit` not a number)
- `"was saved by a newer version of the game (version N)"` (version > 1)
- `"is already loaded"` (same `name` and `exported_at` as a loaded or earlier-in-batch run)
- `"was not added: Compare shows at most 6 runs"`

`recordCsv`: header row then one row per team per round. Columns, in order: `run, played_by, round, team, profit, sold, released, made, never_sold, discarded, listing, hosting, shipping, storage, discard, fees_total, sent_to_released_s, to_first_sale_s, batches` then every `SETTING_FIELDS` key. Lines joined with `\r\n`, trailing `\r\n`. `csvCell`: null/undefined → empty; numbers as `String(n)`; a **string** starting with `=`, `+`, `-` or `@` gets a leading `'`; a cell containing `,` `"` `\r` or `\n` is quoted with `"` doubled.

- [ ] **Step 1: Write the failing tests.**
  - parse: round-trip `JSON.stringify(buildRunRecord(...))` → `ok: true` and deep-equal; each refusal reason above for: `'{'`, `'{"format":"x"}'`, a record with `version: 2` (reason contains `version 2`), a record with `rounds: []`, a 5 000 001-char string.
  - addRecords: two good files → 2 runs, none refused; the same record twice in one call → second refused `"is already loaded"`; 5 loaded + 3 good → 6 runs, the 2 extra refused with the cap reason; a bad file between good ones → good ones still added, bad one refused with its `fileName`.
  - csv: `csvCell('=SUM(A1)')` → `"'=SUM(A1)"`; `csvCell(-1.25)` → `'-1.25'`; `csvCell('a,b')` → `'"a,b"'`; `csvCell('say "hi"')` → `'"say ""hi"""'`; `csvCell(null)` → `''`.
  - recordCsv of a 2-round, 2-team record: 5 lines (header + 4), header starts `run,played_by,round,team,profit` and ends with `cost_of_discard`; a Classic team (no batches) has an empty `batches` cell, a lean one the batch count.
- [ ] **Step 2:** Run both test files — FAIL.
- [ ] **Step 3:** Implement. `parseRunRecord` validates only what Compare reads; unknown extra keys are kept.
- [ ] **Step 4:** Run both test files and `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(records): parse, add and CSV for run records`.

---

### Task 3: Measures

**Files:**
- Create: `services/runRecord/measures.ts`
- Test: `services/runRecord/measures.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:

```ts
export type MeasureId =
  | 'mean_profit' | 'median_profit' | 'teams_in_profit' | 'fees_total' | 'fees_pct_revenue' | 'listing' | 'hosting'
  | 'sold' | 'released' | 'sold_share' | 'never_sold'
  | 'batches_per_team' | 'mean_batch_size' | 'sent_to_released_s' | 'send_to_first_sale_s' | 'first_sale_in_round_s'
  | 'profit_change' | 'teams_improved' | 'sold_share_change'
  | 'fit_gain';
export type MeasureScope = 'round' | 'change' | 'bots';
export type MeasureUnit = 'money' | 'percent' | 'points' | 'count' | 'seconds' | 'number';
export interface MeasureDef { id: MeasureId; group: 'Money' | 'Sales' | 'Flow' | 'Round 1 → 2' | 'Bots only'; label: string; unit: MeasureUnit; better: 'higher' | 'lower'; scope: MeasureScope }
export const MEASURES: readonly MeasureDef[];
/** `round` is used for scope 'round'; ignored for 'change'; 'bots' reads Round 2. null = cannot be computed. */
export function measureValue(record: RunRecord, id: MeasureId, round: 1 | 2): number | null;
export function formatMeasure(value: number | null, unit: MeasureUnit): string;  // null → "–"
export type CurveKind = 'sold_share' | 'fit';
/** Pooled over teams by batch seq: sold÷released×100, or mean fit. Points with no data are omitted. */
export function batchCurve(record: RunRecord, round: 1 | 2, kind: CurveKind): Array<{ seq: number; value: number }>;
```

Definitions (over the round's teams; a round missing from the record → null for all its measures):

| id | label | unit | better | value |
|---|---|---|---|---|
| mean_profit | Mean profit per team | money | higher | mean of `profit` |
| median_profit | Median profit | money | higher | median (even count: mean of the middle two) |
| teams_in_profit | Teams in profit | percent | higher | % teams with `profit > 0` |
| fees_total | Total fees | money | lower | Σ `fees.total` |
| fees_pct_revenue | Fees as % of revenue | percent | lower | Σ fees.total ÷ (`settings.market_price` × Σ sold) × 100; null if revenue 0 or no price |
| listing | Listing | money | lower | Σ `fees.listing` |
| hosting | Hosting | money | lower | Σ `fees.hosting` |
| sold | Jokes sold | count | higher | Σ sold |
| released | Released | count | higher | Σ released |
| sold_share | Sold share | percent | higher | Σ sold ÷ Σ released × 100; null if released 0 |
| never_sold | Never sold | count | lower | Σ non-null `never_sold`; null if all null |
| batches_per_team | Batches per team | number | higher | mean `batches.length` over teams with `batches`; null if none |
| mean_batch_size | Mean batch size | number | lower | Σ batch jokes ÷ number of batches; null if none |
| sent_to_released_s | Sent → released | seconds | lower | mean of non-null `sent_to_released_s` |
| send_to_first_sale_s | Send → first sale | seconds | lower | mean of non-null batch `first_sale_s` |
| first_sale_in_round_s | First sale in the round | seconds | lower | min of `sent_s + first_sale_s`; null if none |
| profit_change | Mean profit change | money | higher | mean (R2 − R1 profit) over teams in both rounds (by team_id) |
| teams_improved | Teams that improved | percent | higher | % of those teams with R2 profit > R1 |
| sold_share_change | Sold share change | points | higher | sold_share(R2) − sold_share(R1) |
| fit_gain | Fit, first → last Round 2 batch | number | higher | mean over Round 2 teams with ≥ 2 non-null fits of (last − first); null if none |

`formatMeasure`: money `$1.23` / `−$1.25` (use `formatProfit` from `services/scoreboard`), percent `45%` (whole), points `+3 pts`/`−3 pts`, count whole, seconds via `fmtMinSec` from `services/format`, number one decimal.

- [ ] **Step 1: Write the failing tests** on a hand-built record (3 teams R1 and R2, price 1, with exact numbers so every row above has a hand-computed expectation), plus:
  - a round where every team sold 0 and released 0: `sold_share`, `fees_pct_revenue` → `null` (never `NaN`/`Infinity`: assert `=== null`);
  - a Classic round (no `batches`): all Flow measures except `sent_to_released_s` → null;
  - a record with Round 1 only: `profit_change`, `teams_improved`, `sold_share_change`, `fit_gain` → null, and `measureValue(r,'mean_profit',2)` → null;
  - median with 4 teams = mean of middle two;
  - `batchCurve` sold_share pools teams by seq (team A seq1 4 released 2 sold, team B seq1 1 released 1 sold → seq 1 = 60); a seq where nothing was released is omitted; `fit` kind uses `fit_by_batch`, skipping nulls;
  - `MEASURES` ids are unique and every `MeasureId` appears once;
  - `formatMeasure(null, 'money')` → `'–'`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the file and `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(records): comparison measures`.

---

### Task 4: Save run record from Debrief

**Files:**
- Create: `services/runRecord/botRegistry.ts`, `services/download.ts`, `components/instructor/SaveRunDialog.tsx`
- Modify: `components/instructor/DebriefTab.tsx`, `views/Instructor.tsx` (pass `roundIds`, `roundStatuses` to DebriefTab), `components/BotPanel.tsx` (record its teams)
- Test: `services/runRecord/botRegistry.test.ts`, `services/runRecord/saveRun.test.ts`, `components/instructor/SaveRunDialog.render.test.ts`

**Interfaces:**
- Consumes: `buildRunRound`, `buildRunRecord`, `defaultPlayedBy`, `defaultRunName`, `fileSafeName` (Task 1); `recordCsv` (Task 2); `instructorService.getRoundConfig(id)` → `{ round: InstructorRound }`; `instructorApi.leanCharts(id)` (`services/api/instructor.ts`); `isNotLeanRound` from `services/leanCharts.ts`.
- Produces:

```ts
// botRegistry.ts
export function recordBotTeams(teams: ReadonlyArray<{ teamId: number | null; persona: string }>): void; // replaces the map; empty list leaves it as is
export function botTeams(): ReadonlyMap<number, RunBot>;
export function clearBotTeams(): void;  // tests

// download.ts
export function downloadText(fileName: string, text: string, mime: string): void;

// SaveRunDialog.tsx — the save logic is exported pure-ish for tests:
export interface SaveRunDeps {
  getConfig: (roundId: number) => Promise<{ round: InstructorRound }>;
  getCharts: (roundId: number) => Promise<LeanChartsResponse>;
}
export interface SaveRunInput {
  name: string; notes: string; playedBy: PlayedBy; now: Date;
  rounds: Array<{ round: 1 | 2; roundId: number; stats: { leaderboard: LeaderboardRow[] }; rates: FeeRates }>;
  teamNames: Record<string, string>; bots: ReadonlyMap<number, RunBot>;
}
/** Fetches each round's config and charts and builds the record. Throws Error("Could not read Round N settings") / ("… batches") naming the failed read. */
export async function collectRunRecord(input: SaveRunInput, deps: SaveRunDeps): Promise<RunRecord>;
/** Which rounds a save includes: Round 1 when ENDED; Round 2 too when ENDED. [] = button disabled. */
export function savableRounds(statuses: Readonly<Record<1 | 2, string | null>>): Array<1 | 2>;
export const SaveRunDialog: React.FC<{ open: boolean; onClose: () => void; /* + props DebriefTab passes */ }>;
```

UI (exact copy):
- Debrief card gets a secondary button **"Save run record"** (top right of the card), disabled with `title="End Round 1 first"` when `savableRounds` is `[]`.
- Dialog (`Modal`): title "Save run record"; fields **Name** (required, prefilled `defaultRunName`), **Who played** (radio: Students / Bots / Mixed, prefilled `defaultPlayedBy(playing team ids, botTeams() keys)`), **Notes** (textarea, optional). When only Round 1 is savable, a line: "Round 2 has not ended, so this record holds Round 1 only." Buttons "Save" and "Cancel". Save is disabled while the name is blank or a save is running.
- Save: `collectRunRecord`, then `downloadText(\`${fileSafeName(name)}.jfrun.json\`, JSON.stringify(record, null, 2), 'application/json')` and `downloadText(\`${fileSafeName(name)}.csv\`, recordCsv(record), 'text/csv')`, then close. On error, the dialog shows the error message in `var(--warn)` and saves nothing.
- `getCharts` rejecting with `isNotLeanRound(err)` true → that round has `charts: null` (no error).
- BotPanel: whenever `status` changes, `recordBotTeams(status.teams)`.

- [ ] **Step 1: Write the failing tests.**
  - botRegistry: record two teams (one `teamId: null` → skipped) → map has 1 entry `{persona}`; recording `[]` keeps it; recording a new list replaces it.
  - savableRounds: `{1:'ENDED',2:null}` → `[1]`; `{1:'ENDED',2:'ACTIVE'}` → `[1]`; `{1:'ENDED',2:'ENDED'}` → `[1,2]`; `{1:'ACTIVE',2:null}` → `[]`.
  - collectRunRecord with fake deps: two rounds → record with 2 rounds and settings from each config; `getCharts` rejecting with a NOT_LEAN_ROUND error → no `batches`, no throw; `getConfig` rejecting → throws `"Could not read Round 1 settings"`; `getCharts` rejecting with another error → throws `"Could not read Round 2 batches"`; a `bots` entry for team 1 → team 1 has `bot`.
  - SaveRunDialog render (`renderToStaticMarkup`, `open`): shows "Save run record", the three field labels, the Round-1-only line when only Round 1 is savable, and not when both are; Bots radio is `checked` when every playing team is in the bot map.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; wire the button into `DebriefTab` (new props `roundIds`, `roundStatuses`) and pass them from `views/Instructor.tsx`.
- [ ] **Step 4:** Run the three test files, `npx vitest run components views` (existing Debrief/Instructor tests still pass) and `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(records): save a run record from Debrief`.

---

### Task 5: Compare tab

**Files:**
- Create: `services/runRecord/compare.ts`, `components/instructor/CompareTab.tsx`
- Modify: `views/Instructor.tsx` (fifth tab), `views/Instructor.render.test.ts` (tab list), `components/Tutorial.test.ts` only if it asserts the exact tab list
- Test: `services/runRecord/compare.test.ts`, `components/instructor/CompareTab.render.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`SETTING_FIELDS`, `addRecords`, `MEASURES`, `measureValue`, `formatMeasure`, `batchCurve`, `csvCell`).
- Produces:

```ts
// compare.ts
export interface SettingRow { round: 1 | 2; key: string; label: string; values: Array<SettingValue | null>; differs: boolean }
/** One row per SETTING_FIELDS key per round present in any run, plus key 'ideal_profile' label "Ideal joke" whose values are 'Same'|'Different' strings compared as JSON. Differing rows first, then SETTING_FIELDS order, Round 1 before Round 2. A run missing the round/key gives null (null vs a value differs). */
export function settingRows(records: readonly RunRecord[]): SettingRow[];
export interface Criterion { use: boolean; better: 'higher' | 'lower'; target: number | null }
export type CriterionKey = string;  // `${MeasureId}:${1|2}` for scope 'round', `${MeasureId}` otherwise
export function criterionKey(m: MeasureDef, round: 1 | 2): CriterionKey;
export function defaultCriterion(m: MeasureDef): Criterion;  // use: false, better: m.better, target: null
/** Indexes of the best non-null values (ties all marked); [] when every value is null. */
export function bestRuns(values: ReadonlyArray<number | null>, better: 'higher' | 'lower'): number[];
export function meetsTarget(value: number | null, c: Criterion): boolean | null;  // null when no target or no value; higher: ≥, lower: ≤
export const CRITERIA_KEY = 'jf_compare_criteria';
export function loadCriteria(storage: Pick<Storage, 'getItem'> | null): Record<CriterionKey, Criterion>;  // {} on any failure or bad JSON
export function saveCriteria(storage: Pick<Storage, 'setItem'> | null, c: Record<CriterionKey, Criterion>): void;  // swallows failures
/** Per run, how many used measures with a target met it, of how many: e.g. "4 of 5 targets met". */
export function targetsSummary(values: number[][] /* [criterion][run] as number|null */, criteria: Criterion[]): Array<{ met: number; of: number }>;
export function comparisonCsv(runs: readonly RunRecord[]): string;  // rows: group, measure, round, then one column per run name

// CompareTab.tsx
export const CompareTab: React.FC<{ initialRuns?: LoadedRun[] }>;  // initialRuns for render tests
```

UI (exact copy):
- Card title "Compare runs", subtitle "Load saved run records to compare settings and results side by side."
- File input `accept=".json,.jfrun.json,application/json" multiple`, button label **"Add record files"**, plus a drop zone ("or drop files here"). Files read with `file.text()`, then `addRecords`. Each refusal shows: `<file name> <reason>` (e.g. "notes.json is not a Joke Factory run record").
- With 0 runs: "No runs loaded yet. Save a record from Debrief after a class, then add it here." With 1 run: also "Add one more run to compare."
- Run columns headed: name, then a small line `Students · 2026-11-20 · 12 teams` (team count = Round 1 teams; date from `exported_at`), and a "Remove" text button.
- **Settings** section: differing rows highlighted (background `var(--gold-tint)`) and shown; the rest inside `<details>` with summary "Same in every run (n)". Row label `Round 1 · Listing`. Missing value "–".
- **Measures** section, grouped by `group`: scope 'round' measures get a row per round (`Round 1`, `Round 2`), 'change' and 'bots' one row. The 'bots' row only when every run has a Round 2 team with `fit_by_batch`. Each row: a "Use" checkbox, a direction select ("Higher is better" / "Lower is better"), a target number input (placeholder "Target"), then the run values via `formatMeasure`. For used rows: best cells get the text "Best" (small, `var(--selling)`), cells meeting the target a "✓ target" mark. Under the table: one line per run "`<name>`: 3 of 4 targets met" (only when some used row has a target).
- **Batch by batch** chart: select "Sold share by batch" / "Fit by batch" (the latter only when the bots row shows) and a round select (Round 1 / Round 2); recharts `LineChart`, one line per run, x = batch number, y = value, legend = run names.
- **Per team**: under each run's column header, `<details>` "Teams" listing team, R1 profit, R2 profit, change, never sold, fees (reuse `formatProfit`).
- Button "Save comparison (CSV)" → `downloadText('run-comparison.csv', comparisonCsv(records), 'text/csv')`.
- Criteria load once with `loadCriteria(safeLocalStorage())` and save on every change; `safeLocalStorage` = `try { return window.localStorage } catch { return null }`.
- Instructor tab list becomes Live, Teams, Setup, Debrief, **Compare** (`ScreenTab` gains `'compare'`; it is never a phase default).

- [ ] **Step 1: Write the failing tests.**
  - settingRows: two runs differing only in `cost_of_publishing` (0.1 vs 0.25) → first row is `{round:1,key:'cost_of_publishing',differs:true}`; all other rows `differs:false`; a run without Round 2 → its Round 2 values are `null` and those rows differ; identical ideals → "Ideal joke" values `['Same','Same']` and not differing; different ideals → differs.
  - bestRuns `[1, null, 3, 3]` higher → `[2,3]`; lower → `[0]`; `[null,null]` → `[]`.
  - meetsTarget: higher 50 vs target 50 → true; lower 10 vs 5 → false; no target → null; null value → null.
  - loadCriteria: `getItem` throws → `{}`; bad JSON → `{}`; round-trip with saveCriteria; `setItem` throws → no throw.
  - targetsSummary on 2 criteria × 2 runs with one null value → counts exclude the null from `met` but keep it in `of`.
  - comparisonCsv: header `group,measure,round,<run 1 name>,<run 2 name>`; a run named `=evil` appears as `'=evil`.
  - CompareTab render: no runs → the empty-state copy; `initialRuns` of 2 records differing in listing → "Compare runs", both run names, "Round 1 · Listing" before the `<details>` "Same in every run", the "Mean profit per team" row; 1 run → "Add one more run to compare."
  - Instructor render: the tablist labels equal `['Live','Teams','Setup','Debrief','Compare']`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `compare.ts`, `CompareTab.tsx`, and the tab.
- [ ] **Step 4:** Run the new tests, `npx vitest run` (whole suite) and `npm run typecheck` — PASS.
- [ ] **Step 5:** Browser check on the local stack (preview `vite` dev server from `.claude/launch.json`): open the instructor screen, Compare tab, load two record fixtures written by the test helpers to the scratchpad; screenshot. No password typing: if the instructor login is required and not already signed in, skip this step and say so in the report.
- [ ] **Step 6: Commit** `feat(records): Compare runs tab`.

---

### Task 6: Pilot writes records; guide

**Files:**
- Modify: `scripts/pilot/feedbackClass.ts`, `scripts/pilot/feedback-pilot.mts`, `scripts/pilot/cost-sweep.mts`, `docs/lean-market-mode.md`
- Test: `scripts/pilot/pilotRecord.test.ts`
- Create: `scripts/pilot/pilotRecord.ts`

**Interfaces:**
- Consumes: `buildRunRound`, `buildRunRecord`, `fileSafeName` (Task 1); `parseRunRecord` (Task 2); `BatchFit` from `scripts/pilot/feedbackReport.ts`; `BotTeamSpec` (`services/bots/protocol.ts`, fields `persona`, `useFeedback`, `round2BatchSize`, `releaseAll`); `instructor.instructorGetConfig(roundId)`; `boardRows` rates via `feeRatesFromRound` + `ratesFor` (`services/roundRates.ts`) on the stored config.
- Produces:

```ts
// pilotRecord.ts
export function botOf(spec: Pick<BotTeamSpec, 'persona' | 'useFeedback' | 'round2BatchSize' | 'releaseAll'>, seed: string): RunBot;
export function fitsOf(fits: readonly BatchFit[]): Array<{ seq: number; fit: number | null }>;
export function recordFileName(costsLabel: string, classNo: number): string;  // fileSafeName(`${costsLabel} class ${classNo}`) + '.jfrun.json'
// feedbackClass.ts
export interface PlayedClass { result: ClassResult; record: RunRecord }
export async function runFeedbackClass(o: ClassOptions): Promise<PlayedClass>;  // was Promise<ClassResult>
// runSetting gains an optional last parameter `recordsDir?: string`: when set, after each played class it
// mkdirSync(recordsDir, {recursive:true}) and writes the class record there with recordFileName.
```

- `playRound` also reads `instructorGetConfig(roundId)` once after the round ends and builds its `RunRound` with `bots` (team id → `botOf(spec, \`${o.seed}#${spec.deckIndex ?? spec.index}\`)`) and `fits` (team id → `fitsOf(batchFits(...))`, the value it already computes). The class record: `name` = `${costsLabel} class ${classNo}` where `costsLabel` = `listing $X hosting $Y` from `o.costs`, `played_by: 'bots'`, `notes` = the seed.
- `feedback-pilot.mts` and `cost-sweep.mts` pass `recordsDir` = `${OUT without .md}-records` (so `docs/pilots/2026-11-20-feedback-pilot-records/`). Their markdown and sidecar output is unchanged; `PILOT_RENDER_ONLY` still writes no records.
- Guide: add to `docs/lean-market-mode.md` a section **"Keep a record, compare runs"** (≤ 12 lines): after a class, Debrief → Save run record (name, who played, notes; two files); keep the files; Compare tab → Add record files; tick the measures that matter, choose direction and targets; bot rehearsals and pilot runs write the same files (`docs/pilots/<date>-…-records/`).

- [ ] **Step 1: Write the failing tests** in `scripts/pilot/pilotRecord.test.ts`: `botOf({persona:'BALANCED', useFeedback:true, round2BatchSize:3}, 's#1')` → `{persona:'BALANCED', use_feedback:true, round2_batch_size:3, seed:'s#1'}` with no `release_all` key; `fitsOf` maps `meanFit` → `fit`; `recordFileName('listing $0.10 hosting $0.05', 2)` → `'listing -0.10 hosting -0.05 class 2.jfrun.json'`; a record built with `buildRunRound` from a pilot-shaped fixture plus `bots` and `fits` → `parseRunRecord(JSON.stringify(...)).ok === true` and team 1 has `bot.use_feedback === true` and `fit_by_batch`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; update `runSetting` to use `PlayedClass` (push `played.result` into `side.classes` as before).
- [ ] **Step 4:** Run `npx vitest run scripts/pilot` and `npm run typecheck`, then `npx vitest run` — PASS. Do **not** run the pilot itself (it needs the admin password; the controller runs it with the user).
- [ ] **Step 5: Commit** `feat(records): pilot writes run records; guide section`.

---

## Self-review notes

- Spec §3 → Task 1; §3.3 bot fields → Tasks 1, 4 (panel), 6 (pilot); §4 → Task 4 (CSV in Task 2); §5 → Tasks 3 and 5; §6 → Task 6; §8 doc → Task 6; §8 "local class saved and loaded" → Task 5 Step 5 plus the controller's final check.
- Names cross-checked: `RunRound`, `RunTeam`, `RunBot`, `buildRunRound`, `parseRunRecord`, `addRecords`, `LoadedRun`, `MEASURES`, `measureValue`, `batchCurve`, `settingRows`, `Criterion`, `criterionKey`.
