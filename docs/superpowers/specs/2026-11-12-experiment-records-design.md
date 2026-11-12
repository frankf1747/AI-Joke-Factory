# Experiment records and Compare runs — design

Status: approved in conversation 2026-11-12 ("yes, write the spec").
Source: instructor review of the live game (Nov 2026), item 4: "export results and compare paths".
Purpose, in the user's words: an instructor sets a different configuration, runs it (with students or
with bots), keeps a record, and later compares records side by side to find the best configuration,
deciding for themselves what counts as "worked".
Builds on `feat/two-costs-feedback-bots` (two costs, feedback bots, per-round rates). Frontend only.

## 1. Goal

1. **A record of every run.** After a class (students or bots), the instructor saves one file that holds
   the full configuration of both rounds and what happened in them.
2. **One view to compare.** The instructor loads 2–6 record files and sees the settings side by side,
   with the differences highlighted, and the same outcome measures under them.
3. **The instructor decides what worked.** No built-in PASS/FAIL. The instructor picks the measures that
   matter, says whether higher or lower is better, and may set a target. The view marks the best run per
   measure and which runs met each target.

## 2. What a run is

One **run** = one class played once: Round 1 and, if it was played, Round 2. The same record format is
used whether students or bots played, so a bot rehearsal and a real class can sit side by side.

Records live in files the instructor keeps (a course folder, a shared drive). Nothing is stored on the
server: Reset Game cannot lose a record, and a record can be compared on any computer.

## 3. The record file

`<name>.jfrun.json`, UTF-8 JSON. Raw facts only; every measure in §5 is computed when the file is
loaded, so a measure added later also works on old files.

```jsonc
{
  "format": "jf-run-record",
  "version": 1,
  "name": "Week 3, listing 25¢",          // the instructor's label, required
  "notes": "Section B, 2 students per login",  // free text, optional
  "played_by": "students",                 // "students" | "bots" | "mixed"
  "exported_at": "2026-11-20T15:04:05Z",
  "rounds": [
    {
      "round": 1,                          // 1 or 2
      "round_id": 41,
      "status": "ENDED",
      "started_at": "…", "ended_at": "…",  // ended_at = clock_end
      "settings": { … },                   // §3.1
      "ideal_profile": { "topic": "…", … },// from the stored config; absent if the round had none
      "teams": [ { …, "bot": { … } } ]     // §3.2; "bot" (§3.3) only on a bot team
    }
  ]
}
```

### 3.1 Settings (per round)

Every value the instructor can set, read from that round's stored config
(`GET /v1/instructor/rounds/:id/config`), never from the Setup form:

market mode, batch size (Round 1 fixed size, Round 2 per-team choice), round length, market price,
customer budget, customers per team and the resulting customer count, buy threshold, jitter,
preference base, swap margin, feedback pass threshold, feedback jokes shown (`feedback_joke_count`),
WIP limit, and every fee (listing, hosting, shipping small/standard/large, storage, discard), including
fees at 0. A key the backend does not return is omitted, not guessed.

### 3.2 Teams (per round)

One entry per team that played (`playingStats`, the same teams as the Live board and Debrief):

| Field | Source |
|---|---|
| `team_id`, `team` (shown name, with the instructor's rename) | stats leaderboard, `teamNames` |
| `profit`, `sold` (`total_sales`), `released` (`published_jokes`), `made` (`total_jokes`), `discarded` (`discarded_jokes`) | stats leaderboard |
| `never_sold`: released jokes that never sold, as the Debrief's Never sold column (`boardRows`, from the Lean batch series); null in a Classic round | `boardRows` |
| `fees`: `listing`, `hosting`, `shipping`, `storage`, `discard`, `total` | `boardRows` with that round's rates (as the Debrief's Fees column), the fees its fetched config stores taking precedence, so settings and fees in one record agree |
| `sent_to_released_s` | `boardRows` |
| `batches`: `seq`, `sent_s`, `jokes`, `released`, `sold`, `first_sale_s` | lean charts (`GET /v1/instructor/rounds/:id/lean-charts`); omitted in a Classic round |

Revenue is not stored; it is `market_price × sold`. No student logins, emails or joke text are stored,
so a record can be shared with colleagues.

### 3.3 Bots (only when bots played)

On each bot team, a `bot` object: `persona`, and when set, `use_feedback`, `round2_batch_size`,
`release_all`, `seed`. The pilot scripts also add `fit_by_batch` (`[{seq, fit}]`) on each team and round (mean fit of the batch's released jokes, from the corpus
traits; §6). Students' jokes have no known traits, so a student record never has it.

## 4. Export

**Debrief tab → "Save run record".** Enabled once Round 1 has ENDED; a run with Round 2 not yet
ended saves Round 1 only, and the dialog says so. The dialog asks for:

- **Name** (required, prefilled `<date> class`),
- **Who played**: Students / Bots / Mixed, prefilled Bots when this browser's bot panel created every
  playing team, Mixed when it created some, Students otherwise,
- **Notes** (optional).

Save downloads two files built in the browser:

- `<name>.jfrun.json`, the record (§3);
- `<name>.csv`, one row per team per round with the round's settings as columns, for a spreadsheet.

If a fetch fails (stats, config or lean charts), the dialog shows which one and saves nothing.
After saving, the dialog stays open: "Saved. If a file did not download, use the links below.", with
both files offered again and Done. While saving, Cancel and the close button are unavailable.

**Bot players panel.** No separate export button. The panel remembers (in memory, for this page) which
teams it created and their options, so the Debrief dialog can prefill "Who played" and attach the §3.3
bot fields. After a page reload that link is lost and the dialog falls back to Students; the instructor
can still pick Bots by hand (the bot fields are then absent). Reset Game also clears it, and a record
saved as Students carries no bot fields.

## 5. Compare runs

A fifth instructor tab, **Compare**, after Debrief. It works without a live class: everything happens
in the browser on the loaded files.

**Loading.** "Add record files" (file picker, several at once, or drag and drop), up to 6. Each loaded
run is a column headed by its name, who played, date and team count, with a remove control. A file
that is not a run record, or a newer `version`, is refused with its file name and the reason; the
others still load.

**Settings.** A table, one row per setting (§3.1) and per round, one column per run. A row whose
values differ across runs is highlighted and listed first; identical rows fold behind "Same in every
run (n)". The ideal joke is one row, "Ideal joke", that reads Same or Different (expand to see it).

**Measures.** Computed per run and round (class-level), in one table under the settings:

| Group | Measure |
|---|---|
| Money | Mean profit per team · Median profit · Teams in profit (%) · Total fees · Fees as % of revenue · Listing · Hosting |
| Sales | Jokes sold · Released · Sold share (sold ÷ released) · Never sold |
| Flow | Batches per team · Mean batch size · Sent → released (s) · Send → first sale (s) · First sale in the round (s) |
| Round 1 → 2 | Mean profit change · Teams that improved (%) · Sold share change |
| Bots only | Fit, first → last Round 2 batch (only when every loaded run has `fit_by_batch`) |

Below the table, a line chart for one chosen measure by batch number (sold share by batch, or fit by
batch for bot runs), one line per run, so the learning curve can be compared.

**What counts as worked.** Each measure row has a checkbox "Use", a direction (Higher is better /
Lower is better, each measure has a sensible default), and an optional target (e.g. Teams in profit
≥ 50%). For each used measure the best run's cell is marked "Best", and a cell that meets the target
gets a check. A summary line names, per run, how many used measures met their targets. The choices are
remembered per browser (`localStorage` key `jf_compare_criteria`, wrapped in try/catch; failure just
means the defaults).

**Per team.** Expanding a run shows its teams (one row each, both rounds), the same columns as the
Debrief table, so an outlier team can be seen.

**Export the comparison.** "Save comparison (CSV)": the measures table with the runs as columns.

## 6. Pilot scripts write the same records

`feedback-pilot.mts` and `cost-sweep.mts` write one `.jfrun.json` per class, with `played_by: "bots"`,
the §3.3 bot fields and `fit_by_batch`, into `docs/pilots/<date>-records/`, next to their markdown
reports. Their reports are unchanged. A sweep's records can then be loaded into Compare.

## 7. Implementation

- `services/runRecord/types.ts`: the record types (`RunRecord`, `RunRound`, `RunTeam`, `RunBatch`).
- `services/runRecord/build.ts`: pure; builds a record from stats, config and lean charts responses
  (the same inputs Debrief has), plus name, who played and bot fields.
- `services/runRecord/parse.ts`: validates a loaded file, returns a record or a reason.
- `services/runRecord/measures.ts`: pure; the §5 measures from a record, each with its default direction.
- `services/runRecord/csv.ts`: the export CSV and the comparison CSV.
- `components/instructor/SaveRunDialog.tsx`, `components/instructor/CompareTab.tsx`.
- Tests: build round-trips a fixture (two rounds, two teams, a Classic round without batches); parse
  refuses a wrong format, newer version and bad JSON; every measure on hand-computed fixtures (including
  a team with no sales and a run with no Round 2); differing settings sorted first; Best and target
  marks; the criteria fall back when storage fails; the pilot writes a record that parse accepts.

## 8. Done when

- Suites pass. A local class (bots) is saved from Debrief and loads in Compare with no settings
  missing; two records with different listing fees show Listing highlighted.
- A pilot run writes records that load in Compare.
- The instructor doc (`docs/lean-market-mode.md`) has a short "Keep a record, compare runs" section.

## 9. Out of scope

Storing records on the server, comparing more than 6 runs or averaging several classes into one
column, editing a record, and any automatic "this configuration is best" verdict.
