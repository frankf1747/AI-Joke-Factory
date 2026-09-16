/**
 * The end-to-end classroom run. One entry point, one destructive round, one
 * verdict.
 *
 *   npx tsx scripts/e2e/run.ts --wipe-db
 *
 * WHAT THIS ACTUALLY DOES, SAID PLAINLY: it wipes the live database, invents 24
 * students, drives them through a complete round of the game at the API layer,
 * and then judges what the backend did with them. It is the only thing in this
 * repository that can answer "will this deployment survive a class of 24 on
 * Monday" — and it is also the only thing that can destroy a class already in
 * progress. Both facts come from the same call, `POST /v1/admin/reset`, which
 * truncates every table the game writes to and deletes every non-instructor
 * user. There is no undo and no backup.
 *
 * SO THE GATE IS DELIBERATE FRICTION. `--wipe-db` must be typed, every time, by
 * a person who has read what it means. There is no environment variable that
 * sets it, on purpose: an env var gets exported into a shell profile once and
 * then forgotten, and the whole value of the flag is that it cannot be
 * forgotten. See `refuseWithoutWipeFlag`.
 *
 * PHASE ORDER, and the one place it departs from the plan it was written to:
 *
 *   preflight (read-only, abort on failure)
 *     -> instructor login        <- BEFORE the reset, not after
 *     -> reset                   <- opening reset: never trust prior state
 *     -> resolve + configure round 1
 *     -> join 24 students, in order
 *     -> assign 12 teams, read the lobby back, correct roles
 *     -> start round
 *     -> 12 teams submit/claim/split/publish CONCURRENTLY
 *     -> wait for convergence (classification, then sales — separately)
 *     -> gather evidence, run claims 2-8
 *     -> end round, evaluate claim 1
 *     -> reset again, in a finally
 *
 * Login has to precede the reset because `/v1/admin/reset` is behind
 * middleware.InstructorAuth, which authenticates from the `X-User-Id` header of
 * a user row whose role is INSTRUCTOR. That row is created by
 * `/v1/instructor/login`, which is the only place the admin password is used.
 * Resetting first would be a 401. The reset does not undo the login: ResetGame
 * deletes every user whose role is NOT INSTRUCTOR, so the identity survives its
 * own reset.
 *
 * CLEANUP IS UNCONDITIONAL. The closing reset runs in a `finally`, after a pass,
 * after a failure, and after a crash. It runs at the START too, because a run
 * that inherits a half-finished round from the last one measures that round's
 * leftovers and reports them as findings.
 *
 * Zero dependencies, Node 20+ fetch, ESM, runs under tsx.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import type { FeedbackJoke, InstructorRound, MarketItem } from '../../types/api';
import {
  ACTIVE_ROUND_ASSERTIONS,
  inClaimOrder,
  roundLifecycle,
  runAssertions,
  type AssertionResult,
  type Evidence,
  type LifecycleEvent,
  type SalesWait,
  type TeamBatchesRecord,
  type TeamConvergence,
  type TeamSummaryRecord,
} from './assertions/index';
import { assertFixtureIntegrity } from './fixtures/jokes';
import {
  assembleClass,
  bindClients,
  classroomNames,
  joinStudents,
  planTeams,
  runClassRound,
  type ClassRoundOptions,
  type RolePin,
  type TeamOutcome,
} from './harness/class';
import { ApiError, createClient, type JokeFactoryClient } from './harness/client';
import {
  judgeClassifier,
  waitForClassification,
  waitForSalesOnMarket,
  WaitTimeoutError,
  WaitTimings,
} from './harness/wait';
import { DEFAULT_BE, DEFAULT_FE, preflight, type PreflightReport } from './preflight';
import {
  fmtMs,
  renderReport,
  writeArtifacts,
  type PhaseRecord,
  type RunConfig,
  type RunReport,
} from './report';

/* ===========================================================================
   Configuration
=========================================================================== */

const RESULTS_DIR = new URL('./.results/', import.meta.url).pathname;

interface Config extends RunConfig {
  wipeDb: boolean;
  adminPassword: string | undefined;
  /** The two display names a browser-driven Layer 3 run will look for. They
   *  join FIRST so Assign's joined_at round-robin puts them on team 1. */
  browserPair: { jm: string; marketing: string };
  /** Per-team budget for the feedback panel to fill. */
  classificationBudgetMs: number;
  salesBudgetMs: number;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/**
 * How long to let classification run before calling it dead.
 *
 * A FLAT BUDGET IS WRONG HERE, and the first live run proved it: at 180s, ten
 * teams converged and teams 7 and 10 "failed" — not because anything was broken,
 * but because they were simply last in a queue that had not reached them yet.
 * The timings came out perfectly linear in pairs, which is the shape of a
 * saturated worker pool, not a fault.
 *
 * So the budget is derived from the work instead:
 *
 *     teams × jokes × PER_JOKE_MS ÷ WORKERS × HEADROOM
 *
 * PER_JOKE_MS is measured, not guessed — 14.9s/joke against
 * grok-4-1-fast-reasoning on the live deployment. WORKERS is 2 because
 * DefaultDispatcherConfig() hardcodes it (worker/dispatcher.go:40) with no env
 * override; if that ever becomes configurable, this constant has to follow it or
 * the suite starts failing honest runs again.
 *
 * The point of the headroom is that a breach now means something real — the LLM
 * is down, the worker is wedged, the deployment name is wrong — rather than
 * "twelve teams is more than two workers can chew through in three minutes".
 */
const PER_JOKE_MS = 15_000;
const DISPATCHER_WORKERS = 2;
const BUDGET_HEADROOM = 1.5;

function classificationBudgetFor(teams: number, jokesPerTeam: number): number {
  const serialisedMs = (teams * jokesPerTeam * PER_JOKE_MS) / DISPATCHER_WORKERS;
  return Math.max(120_000, Math.round(serialisedMs * BUDGET_HEADROOM));
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trimUrl(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

/**
 * Mirrors LoginScreen.normalizeTeamName in App.tsx, and therefore
 * roles.spec.ts's copy of it.
 *
 * Duplicated rather than imported, and the duplication is the lesser evil:
 * roles.spec.ts is a Playwright spec, so importing it registers `test()` cases
 * and pulls in a runner this script does not have. Ten lines of agreement is
 * cheaper than making the orchestrator depend on the test framework it is
 * supposed to be independent of.
 */
function normalizeTeamName(a: string, b: string): string {
  return [a, b]
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .sort((x, y) => x.localeCompare(y))
    .join('_');
}

function parseConfig(argv: readonly string[]): Config {
  const teamCount = num(flag(argv, 'teams') ?? process.env.E2E_TEAM_COUNT, 12);
  const perTeam = num(flag(argv, 'per-team') ?? process.env.E2E_JOKES_PER_TEAM, 5);

  return {
    fe: trimUrl(flag(argv, 'fe') ?? process.env.E2E_FE_URL ?? process.env.FE_BASE_URL ?? DEFAULT_FE),
    be: trimUrl(flag(argv, 'be') ?? process.env.E2E_BE_URL ?? process.env.BE_BASE_URL ?? DEFAULT_BE),
    roundId: null,
    teamCount,
    perTeam,
    // The LAST team carries the bland control, so team 1 — the one a browser
    // run drives — keeps the varied corpus and behaves like a normal team.
    controlTeamNumber: num(flag(argv, 'control-team'), teamCount),
    instructorName: flag(argv, 'instructor-name') ?? process.env.E2E_INSTRUCTOR_NAME ?? 'E2E Instructor',
    seed: flag(argv, 'seed') ?? process.env.E2E_DEAL_SEED ?? 'joke-factory-e2e-v1',
    adminPasswordSupplied: Boolean(process.env.E2E_ADMIN_PASSWORD),

    wipeDb: argv.includes('--wipe-db'),
    adminPassword: process.env.E2E_ADMIN_PASSWORD,
    browserPair: {
      jm: normalizeTeamName(
        process.env.E2E_JM_MEMBER_1 ?? 'e2e_jm_one',
        process.env.E2E_JM_MEMBER_2 ?? 'e2e_jm_two',
      ),
      marketing: normalizeTeamName(
        process.env.E2E_MK_MEMBER_1 ?? 'e2e_mk_one',
        process.env.E2E_MK_MEMBER_2 ?? 'e2e_mk_two',
      ),
    },
    classificationBudgetMs: num(process.env.E2E_LLM_BUDGET_MS, classificationBudgetFor(teamCount, perTeam)),
    salesBudgetMs: num(process.env.E2E_SALES_BUDGET_MS, 180_000),
  };
}

/* ===========================================================================
   The safety gates

   Both refuse loudly and exit 1. Neither can be satisfied by anything except
   the operator's own deliberate action.
=========================================================================== */

const WIPE_REFUSAL = `
REFUSING TO RUN — this suite DESTROYS the data on the backend it is pointed at.

  It calls POST /v1/admin/reset, which in one transaction:
    · TRUNCATEs purchases, purchase_events, ai_customers, classification_jobs,
      joke_fit, joke_dim_fit, joke_dimension_values, batch_submission_events,
      jokes, batches and team_rounds_state — RESTART IDENTITY CASCADE;
    · resets every round to CONFIGURED with DEFAULT config, wiping started_at,
      ended_at and every instructor-tuned knob;
    · DELETEs every user who is not an INSTRUCTOR, and every team.

  There is no undo and no backup. If a class is using this backend right now,
  this ends their session and deletes their work.

  It then invents 24 students, runs a full round through them, and resets again
  on the way out.

To proceed, confirm you know that, on a backend nobody is using:

    npx tsx scripts/e2e/run.ts --wipe-db

There is deliberately no environment variable for this flag. An exported
variable is a decision made once and forgotten; this one has to be made every
time.
`.trim();

function refuseWithoutWipeFlag(cfg: Config): void {
  console.error(WIPE_REFUSAL);
  console.error(`\nThe backend that would have been wiped: ${cfg.be}`);
}

const PASSWORD_REFUSAL = `
REFUSING TO RUN — E2E_ADMIN_PASSWORD is not set.

Everything this suite does is instructor-gated. POST /v1/instructor/login is the
only route that takes the admin password; it promotes a user row to INSTRUCTOR
and returns the user id that authenticates every instructor call afterwards
(there is no token and no cookie — instructor-ness IS that user row). Without
the password there is no way to reset the database, configure round 1, assign
teams, start or end the round.

Set it for this one command rather than exporting it, so it does not end up in
a shell history file or a profile:

    E2E_ADMIN_PASSWORD='…' npx tsx scripts/e2e/run.ts --wipe-db

The password is never logged, never written to report.json, and never passed to
anything but POST /v1/instructor/login.
`.trim();

/* ===========================================================================
   Phase plumbing
=========================================================================== */

class Run {
  readonly phases: PhaseRecord[] = [];
  readonly lifecycle: LifecycleEvent[] = [];
  readonly timings = new WaitTimings();

  /** Run one phase, time it, record it, print it. Rethrows — a phase that
   *  fails is fatal to the run unless its caller catches, and the catcher is
   *  always the one that knows whether the round can continue without it. */
  async phase<T>(name: string, fn: () => Promise<T>, detail: (value: T) => string): Promise<T> {
    const t0 = performance.now();
    process.stdout.write(`  ${name} … `);
    try {
      const value = await fn();
      const ms = performance.now() - t0;
      const text = detail(value);
      this.phases.push({ name, ok: true, ms, detail: text });
      console.log(`ok (${fmtMs(ms)}) — ${text}`);
      return value;
    } catch (err) {
      const ms = performance.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      this.phases.push({ name, ok: false, ms, detail: message });
      console.log(`FAILED (${fmtMs(ms)})`);
      console.log(indent(message, 4));
      throw err;
    }
  }

  record(status: InstructorRound['status'], source: string): void {
    this.lifecycle.push({ status, at: new Date().toISOString(), source });
  }
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

/** An error, reduced to the one line that identifies it. ApiError's own message
 *  is already a multi-line block with route, status, code and request_id, so it
 *  is kept whole; anything else gets its message. */
function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof WaitTimeoutError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/* ===========================================================================
   Main
=========================================================================== */

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cfg = parseConfig(argv);

  // Gates first, before a single socket is opened.
  if (!cfg.adminPassword) {
    console.error(PASSWORD_REFUSAL);
    return 1;
  }
  if (!cfg.wipeDb) {
    refuseWithoutWipeFlag(cfg);
    return 1;
  }

  const startedAt = new Date();
  const t0 = performance.now();
  const run = new Run();

  console.log('AI Joke Factory — end-to-end classroom run');
  console.log(`  frontend  ${cfg.fe}`);
  console.log(`  backend   ${cfg.be}`);
  console.log(`  class     ${cfg.teamCount} teams × ${cfg.perTeam} jokes (control: team ${cfg.controlTeamNumber})`);
  console.log('  THIS RUN WILL DESTROY THE DATA ON THAT BACKEND.\n');

  const anon = createClient({ baseUrl: cfg.be });

  let preflightReport: PreflightReport | null = null;
  let instructor: JokeFactoryClient | null = null;
  let evidence: Evidence | null = null;
  let assertions: AssertionResult[] = [];
  let abortReason: string | null = null;

  try {
    // ---- The fixture, before the network ---------------------------------
    // Cheap, local, and a failure here reads as "the fixture is broken" rather
    // than as a mysterious backend error twenty steps later.
    await run.phase(
      'fixture integrity',
      async () => assertFixtureIntegrity(),
      () => 'varied corpus and bland control both intact',
    );

    // ---- Layer 1: preflight ----------------------------------------------
    // Read-only and cheap, so it runs before anything destructive. If the
    // deployed pair is incoherent — a mock build, a bundle pointed at another
    // backend — the round below would only be testing the damage.
    preflightReport = await run.phase(
      'preflight (layer 1, read-only)',
      () => preflight({ fe: cfg.fe, be: cfg.be }),
      (r) => `${r.checks.filter((c) => c.ok).length}/${r.checks.length} check(s) passed`,
    );
    if (!preflightReport.ok) {
      const failed = preflightReport.checks.filter((c) => !c.ok);
      abortReason =
        `preflight failed (${failed.map((c) => c.name).join(', ')}) — the deployed frontend and ` +
        'backend are not coherent, so nothing was wiped and no round was run. Fix those first; the ' +
        'detail for each is in the preflight section above.';
      throw new Error(abortReason);
    }

    // ---- Instructor identity ----------------------------------------------
    // BEFORE the reset: /v1/admin/reset is behind InstructorAuth, which reads
    // X-User-Id and requires role INSTRUCTOR. The reset then deletes every
    // non-instructor user, so this identity survives it.
    const login = await run.phase(
      'instructor login',
      () =>
        anon.instructorLogin({
          display_name: cfg.instructorName,
          password: cfg.adminPassword as string,
        }),
      (r) => `${r.user.display_name} is u${r.user.user_id} (${r.user.role})`,
    );
    instructor = anon.as(login.user.user_id, 'instructor');

    // ---- Opening reset ----------------------------------------------------
    await run.phase(
      'reset (opening) — DESTRUCTIVE',
      () => instructor!.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA(),
      (r) => `${r.status}: ${r.message}`,
    );

    // ---- Round 1 ----------------------------------------------------------
    const round1 = await run.phase(
      'resolve round 1',
      async () => {
        const { rounds } = await anon.roundsActive();
        // "active" applies no status filter — every round in the table comes
        // back. Take the lowest round_number that the reset left CONFIGURED.
        const configured = rounds
          .filter((r) => r.status === 'CONFIGURED')
          .sort((a, b) => a.round_number - b.round_number);
        if (!configured.length) {
          throw new Error(
            `no CONFIGURED round exists after the reset — the table holds ${rounds
              .map((r) => `#${r.round_number}:${r.status}`)
              .join(', ')}. ResetGame sets every round back to CONFIGURED, so this means the reset ` +
              'did not take, or something started a round between the reset and this read.',
          );
        }
        return configured[0];
      },
      (r) => `round id ${r.id} (round_number ${r.round_number}, ${r.status})`,
    );
    cfg.roundId = round1.id;
    run.record(round1.status, 'GET /v1/rounds/active (after reset)');

    const configured = await run.phase(
      'configure round',
      () =>
        instructor!.instructorConfig(round1.id, {
          batch_size: cfg.perTeam,
          // Raised to the batch size on purpose. The feedback panel shows the
          // LATEST N published jokes, so with the default of 3 the async
          // pipeline claim could only ever check three of a team's jokes and
          // would have to call the rest uncovered. Setting it to the batch size
          // makes "every published joke reaches a fit score" literally
          // checkable. Claim 6 reads this value back rather than assuming it.
          feedback_joke_count: cfg.perTeam,
          // start revalidates the profile unconditionally and 409s without one.
          // The reset wipes instructor-tuned knobs, so it has to be re-sent.
          ideal_profile: DEFAULT_IDEAL_PROFILE,
        }),
      (r) =>
        `batch_size ${r.round.batch_size}, feedback_joke_count ${r.round.feedback_joke_count}, ` +
        `publish ${r.round.cost_of_publishing}/discard ${r.round.cost_of_discard}, ` +
        `buy_threshold ${r.round.buy_threshold}`,
    );
    run.record(configured.round.status, 'POST /v1/instructor/rounds/{id}/config');

    // ---- The class ---------------------------------------------------------
    const names = classroomNames(cfg.teamCount, [cfg.browserPair.jm, cfg.browserPair.marketing]);
    const students = await run.phase(
      `join ${names.length} students (sequential — join order decides team 1)`,
      () => joinStudents(anon, names),
      (s) => `${s.length} student(s), first two: ${s.slice(0, 2).map((x) => `${x.displayName}=u${x.userId}`).join(', ')}`,
    );

    const pins: RolePin[] = [
      { displayName: cfg.browserPair.jm, role: 'JM', teamNumber: 1 },
      { displayName: cfg.browserPair.marketing, role: 'MARKETING', teamNumber: 1 },
    ];
    const assembled = await run.phase(
      `assign ${cfg.teamCount} teams and verify the lobby`,
      () => assembleClass(instructor!, round1.id, cfg.teamCount, students, pins),
      (a) =>
        `${a.roster.length} team(s), ${a.corrections.length} role correction(s)` +
        (a.problems.length ? `, ${a.problems.length} PROBLEM(S)` : ''),
    );
    for (const c of assembled.corrections) console.log(`      correction: ${c}`);
    if (assembled.problems.length) {
      abortReason =
        'the lobby is not a valid 12-team classroom after assign:\n' +
        assembled.problems.map((p) => `  · ${p}`).join('\n');
      throw new Error(abortReason);
    }

    // ---- Start -------------------------------------------------------------
    const started = await run.phase(
      'start round',
      () => instructor!.instructorStart(round1.id),
      (r) => `status ${r.round.status}, ${r.round.customer_count} AI customer(s) generated`,
    );
    run.record(started.round.status, 'POST /v1/instructor/rounds/{id}/start');
    const round: InstructorRound = started.round;

    // ---- The concurrent round ----------------------------------------------
    const plans = planTeams(cfg.teamCount, cfg.perTeam, cfg.controlTeamNumber, cfg.seed);
    const roundOptions: ClassRoundOptions = {
      roundId: round1.id,
      roster: assembled.roster,
      plans,
      clients: bindClients(assembled.roster, anon),
      timings: run.timings,
      onTeamDone: (o) =>
        console.log(
          `      team ${String(o.teamNumber).padStart(2)} ${o.ok ? 'ok  ' : 'FAIL'} ` +
            `${o.corpus.padEnd(6)} batch ${o.submittedBatchId ?? '—'} ` +
            `published ${o.publishedJokeIds.length}/${o.splitJokeIds.length}` +
            (o.ok ? '' : `  (died at ${o.failedPhase})`),
        ),
    };

    const classRound = await run.phase(
      `${cfg.teamCount} teams submit, claim, split and publish — CONCURRENTLY`,
      () => runClassRound(roundOptions),
      (r) =>
        `${r.outcomes.filter((o) => o.ok).length}/${r.outcomes.length} team(s) completed; teams ` +
        `started within ${Math.round(r.startSpreadMs)}ms of each other`,
    );

    const completed = classRound.outcomes.filter((o) => o.ok);
    if (completed.length === 0) {
      abortReason =
        'no team completed the submit → claim → split → publish flow, so there is nothing for the ' +
        'async pipeline to converge on. The per-team errors are in the report above and in ' +
        'report.json.';
      // Not thrown: the evidence gathered so far is still worth asserting over,
      // and claims 2 and 3 will name the failure precisely.
    }

    // ---- Convergence: classification, then sales, SEPARATELY ---------------
    // Publish returns before any of this. Classification completing does NOT
    // imply sales arrived — EvaluatePurchases runs after fits persist and its
    // failure is logged and swallowed on its own — so these are two waits, not
    // one, and they fail independently.
    const convergence = await run.phase(
      'wait for classification (per team, concurrently)',
      () => waitForAllClassification(roundOptions, completed, round, run.timings, cfg),
      (c) =>
        `${c.filter((x) => !x.timedOut).length}/${c.length} team(s) converged; ` +
        `${c.filter((x) => x.timedOut).length} timed out`,
    );

    const salesClient = pickReader(roundOptions, completed, instructor);
    const salesOutcome = await run.phase(
      'wait for sales on the market board',
      () => waitForSales(salesClient, round1.id, convergence, cfg),
      (s) => (s.wait.timedOut ? `no sale within ${fmtMs(s.wait.elapsedMs)} — ${s.wait.observed}` : s.wait.observed),
    );

    // ---- Evidence ----------------------------------------------------------
    const market = await readMarket(salesClient, round1.id);
    const summaries = await readSummaries(roundOptions, completed, round1.id);
    const batches = await readBatches(roundOptions, completed, round1.id);

    evidence = {
      roundId: round1.id,
      round,
      lifecycle: run.lifecycle,
      teamCount: cfg.teamCount,
      perTeam: cfg.perTeam,
      roster: assembled.roster,
      outcomes: classRound.outcomes,
      startSpreadMs: classRound.startSpreadMs,
      convergence,
      market: market.items,
      marketError: market.error,
      salesWait: salesOutcome.wait,
      summaries,
      batches,
      timings: run.timings,
    };

    // ---- The oracle, claims 2-8 -------------------------------------------
    assertions = await run.phase(
      'run assertions',
      async () => runAssertions(ACTIVE_ROUND_ASSERTIONS, evidence as Evidence),
      (rs) => `${rs.filter((r) => r.ok).length}/${rs.length} claim(s) upheld`,
    );

    // ---- End the round, then judge claim 1 ---------------------------------
    // Claim 1 is evaluated LAST and reported FIRST. ENDED does not exist until
    // this call returns, and the lifecycle is an observation log rather than a
    // read, so it cannot be judged any earlier.
    try {
      const ended = await run.phase(
        'end round',
        () => instructor!.instructorEnd(round1.id),
        (r) => `status ${r.round.status}`,
      );
      run.record(ended.round.status, 'POST /v1/instructor/rounds/{id}/end');
    } catch {
      // Already recorded as a failed phase; claim 1 turns it into a verdict.
    }
    assertions.push(roundLifecycle(evidence));
    assertions = inClaimOrder(assertions);
  } catch (err) {
    if (!abortReason) abortReason = describeError(err);
    console.log(`\n  RUN ABORTED — ${abortReason.split('\n')[0]}`);
  } finally {
    // ---- Closing reset, unconditionally ------------------------------------
    // Even after a crash, even after an abort. A backend left holding an ACTIVE
    // round full of e2e_student_NN is worse than one that is merely empty.
    if (instructor) {
      try {
        await run.phase(
          'reset (closing, finally) — DESTRUCTIVE',
          () => instructor!.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA(),
          (r) => `${r.status}: ${r.message}`,
        );
      } catch {
        console.log(
          '      the closing reset FAILED — the backend may still hold this run\'s round and its 24 ' +
            'synthetic students. Reset it by hand before anyone uses it.',
        );
      }
    } else {
      run.phases.push({
        name: 'reset (closing, finally)',
        ok: true,
        ms: 0,
        detail: 'skipped — the run never authenticated, so it never wrote anything to reset',
      });
    }
  }

  // ---- Report --------------------------------------------------------------
  const finishedAt = new Date();
  const failed = assertions.filter((a) => !a.ok).length;
  const report: RunReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalMs: performance.now() - t0,
    config: cfg,
    preflight: preflightReport,
    phases: run.phases,
    assertions,
    evidence,
    waitSummary: run.timings.count() ? run.timings.summary() : null,
    abortReason,
    verdict: !abortReason && assertions.length > 0 && failed === 0 ? 'GO' : 'NO-GO',
  };

  console.log(`\n${renderReport(report)}`);

  const written = writeArtifacts(RESULTS_DIR, report);
  if (written.error) {
    console.log(`\nartifacts NOT written to ${written.dir} — ${written.error}`);
  } else {
    console.log(`\nartifacts: ${written.dir}`);
    for (const f of written.files) console.log(`  ${f}`);
  }

  return report.verdict === 'GO' ? 0 : 1;
}

/* ===========================================================================
   Evidence gathering

   Every reader below is guarded the same way the class round is: one team's
   4xx must not cost the other eleven their evidence, and a missing reading is
   recorded as a missing reading rather than as a crash. The assertions know how
   to say "unverified".
=========================================================================== */

/**
 * Wait for every team's feedback panel to fill, concurrently.
 *
 * The wait is what measures classification latency; a second, plain read
 * afterwards is what captures the panel. They are separate because the waiter
 * returns only the SCORED jokes, and claim 6 needs to see the unscored ones too
 * — a joke with both dimension arrays empty is the evidence that it was
 * published and never classified, and it would be invisible in the waiter's
 * return value.
 */
async function waitForAllClassification(
  opts: ClassRoundOptions,
  completed: readonly TeamOutcome[],
  round: InstructorRound,
  timings: WaitTimings,
  cfg: Config,
): Promise<TeamConvergence[]> {
  return Promise.all(
    completed.map(async (o): Promise<TeamConvergence> => {
      const client = opts.clients.get(o.teamNumber)?.marketing;
      if (!client) {
        return {
          teamNumber: o.teamNumber,
          teamId: o.teamId,
          jokes: [],
          classificationMs: 0,
          polls: 0,
          timedOut: true,
          observed: 'no bound client for this team',
          error: 'harness bug: bindClients did not cover this team',
        };
      }

      const expect = Math.min(o.publishedJokeIds.length, round.feedback_joke_count);
      let classificationMs = 0;
      let polls = 0;
      let timedOut = false;
      let observed = '';
      let error: string | null = null;

      try {
        const result = await waitForClassification(client, opts.roundId, o.teamId, {
          expectJokes: expect,
          budgetMs: cfg.classificationBudgetMs,
          timings,
        });
        classificationMs = result.elapsedMs;
        polls = result.polls;
        observed = result.observed;
      } catch (err) {
        timedOut = true;
        error = describeError(err);
        if (err instanceof WaitTimeoutError) {
          classificationMs = err.elapsedMs;
          polls = err.polls;
          observed = err.lastObserved;
        } else {
          observed = 'the wait threw before it could observe anything';
        }
      }

      // The panel as it stands, scored or not. Failure here is recorded, not
      // thrown: a team whose feedback read 500s still has a latency worth
      // reporting.
      let jokes: FeedbackJoke[] = [];
      try {
        jokes = (await client.teamFeedback(opts.roundId, o.teamId)).jokes;
      } catch (err) {
        error = `${error ? `${error}\n` : ''}final feedback read failed: ${describeError(err)}`;
      }

      return { teamNumber: o.teamNumber, teamId: o.teamId, jokes, classificationMs, polls, timedOut, observed, error };
    }),
  );
}

/**
 * Wait for at least one purchase to land on the market board.
 *
 * THE BUDGET IS SHORTENED WHEN CLASSIFICATION ALREADY SMELLS LIKE THE STUB.
 * Under StubClassifier every joke gets an identical constant fit that cannot
 * clear the default buy_threshold, so NOTHING WILL EVER SELL and the full
 * three-minute budget would be three minutes spent confirming something the
 * latency already said. The shortening is recorded on the result so claim 5's
 * diagnosis can say the wait was cut and why — a shorter wait must never be
 * able to masquerade as a fair one.
 */
async function waitForSales(
  reader: JokeFactoryClient,
  roundId: number,
  convergence: readonly TeamConvergence[],
  cfg: Config,
): Promise<{ wait: SalesWait; items: MarketItem[] }> {
  const converged = convergence.filter((c) => !c.timedOut);
  const latencies = converged.map((c) => c.classificationMs).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.ceil(latencies.length / 2) - 1] : NaN;
  const jokesPerBatch = Math.max(
    1,
    Math.round(converged.reduce((n, c) => n + c.jokes.length, 0) / Math.max(1, converged.length)),
  );

  let budgetMs = cfg.salesBudgetMs;
  let shortenedBecause: string | null = null;
  if (Number.isFinite(p50) && judgeClassifier(p50, jokesPerBatch).verdict === 'LIKELY_STUB') {
    budgetMs = Math.min(budgetMs, 20_000);
    shortenedBecause =
      `classification converged in ${fmtMs(p50)}, which judgeClassifier reads as LIKELY_STUB. Under ` +
      'StubClassifier every joke gets a constant fit that cannot clear the buy threshold, so no sale ' +
      `can ever arrive; the budget was cut to ${fmtMs(budgetMs)} rather than spent confirming it.`;
  }

  try {
    const result = await waitForSalesOnMarket(reader, roundId, { minSold: 1, budgetMs });
    return {
      wait: { elapsedMs: result.elapsedMs, timedOut: false, observed: result.observed, shortenedBecause },
      items: result.value,
    };
  } catch (err) {
    const timeout = err instanceof WaitTimeoutError;
    return {
      wait: {
        elapsedMs: timeout ? (err as WaitTimeoutError).elapsedMs : 0,
        timedOut: true,
        observed: timeout ? (err as WaitTimeoutError).lastObserved : describeError(err),
        shortenedBecause,
      },
      items: [],
    };
  }
}

/** The market board, read once for the record. Separate from the sales WAIT:
 *  the wait may have given up, and the assertions still need to see whichever
 *  jokes are listed. */
async function readMarket(
  reader: JokeFactoryClient,
  roundId: number,
): Promise<{ items: MarketItem[]; error: string | null }> {
  try {
    return { items: (await reader.market(roundId)).items, error: null };
  } catch (err) {
    return { items: [], error: describeError(err) };
  }
}

async function readSummaries(
  opts: ClassRoundOptions,
  completed: readonly TeamOutcome[],
  roundId: number,
): Promise<TeamSummaryRecord[]> {
  return Promise.all(
    completed.map(async (o): Promise<TeamSummaryRecord> => {
      const client = opts.clients.get(o.teamNumber)?.jm;
      if (!client) {
        return { teamNumber: o.teamNumber, teamId: o.teamId, summary: null, error: 'no bound client' };
      }
      try {
        return { teamNumber: o.teamNumber, teamId: o.teamId, summary: await client.teamSummary(roundId, o.teamId), error: null };
      } catch (err) {
        return { teamNumber: o.teamNumber, teamId: o.teamId, summary: null, error: describeError(err) };
      }
    }),
  );
}

async function readBatches(
  opts: ClassRoundOptions,
  completed: readonly TeamOutcome[],
  roundId: number,
): Promise<TeamBatchesRecord[]> {
  return Promise.all(
    completed.map(async (o): Promise<TeamBatchesRecord> => {
      const client = opts.clients.get(o.teamNumber)?.jm;
      if (!client) {
        return { teamNumber: o.teamNumber, teamId: o.teamId, body: null, error: 'no bound client' };
      }
      try {
        return { teamNumber: o.teamNumber, teamId: o.teamId, body: await client.teamBatches(roundId, o.teamId), error: null };
      } catch (err) {
        return { teamNumber: o.teamNumber, teamId: o.teamId, body: null, error: describeError(err) };
      }
    }),
  );
}

/**
 * Who reads the round-wide endpoints.
 *
 * A real participant, not the instructor: /market and /feedback both require an
 * X-User-Id that can see the round, and reading them as a student is the same
 * request a student's browser makes. Falls back to the instructor only when no
 * team completed, in which case the reading is for the record rather than for a
 * claim.
 */
function pickReader(
  opts: ClassRoundOptions,
  completed: readonly TeamOutcome[],
  instructor: JokeFactoryClient,
): JokeFactoryClient {
  for (const o of completed) {
    const client = opts.clients.get(o.teamNumber)?.marketing;
    if (client) return client;
  }
  return instructor;
}

/* ===========================================================================
   Entry point

   Only the CLI path prints or exits; importing this module must do neither, so
   the entry script is compared by real path rather than by name — same guard
   preflight.ts uses.
=========================================================================== */

function isStandalone(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isStandalone()) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      // Nothing above should reach here — every phase is caught and every
      // reader is guarded — so this is a bug in the orchestrator itself, and it
      // says so rather than posing as a finding about the deployment.
      console.error(
        '\nrun.ts crashed outside its own error handling. This is a fault in the orchestrator, not a ' +
          `verdict on the deployment:\n${describeError(err)}`,
      );
      console.error(
        '\nTHE BACKEND MAY STILL HOLD THIS RUN\'S ROUND AND ITS SYNTHETIC STUDENTS. Reset it by hand.',
      );
      process.exit(1);
    });
}

export { main };
