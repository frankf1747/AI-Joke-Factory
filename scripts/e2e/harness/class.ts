/**
 * The classroom, simulated at the API layer.
 *
 * WHY THIS IS NOT A LOOP OVER TEAMS. A round is not 12 teams taking turns; it
 * is 12 Joke Makers hitting POST /batches inside the same second and then 12
 * Marketing students hitting GET /marketing/queue/next inside the same second
 * after that. Every interesting failure this suite exists to catch lives in
 * that simultaneity: a batch claimed by two marketers, a batch claimed by
 * nobody, a dispatcher pool of two workers queueing twelve jobs behind each
 * other. A sequential harness reproduces none of it and passes against a
 * backend that would fall over in front of a real class. So the teams run under
 * a single Promise.all and nothing in here serialises them.
 *
 * ONE TEAM'S FAILURE IS NOT THE RUN'S FAILURE. If team 7's marketer gets a 403,
 * the other eleven teams are still producing the evidence the oracle needs —
 * and "eleven of twelve succeeded" is a far more useful finding than a stack
 * trace from whichever team happened to break first. Every team therefore runs
 * inside a guard that converts any throw into a recorded TeamOutcome with the
 * phase it died in. `runClassRound` never rejects. Judging is the oracle's job,
 * not this file's.
 *
 * IDENTITY. Each actor gets its own frozen client from `client.as()`. A
 * marketer is never handed the JM's client and neither is ever handed the
 * instructor's — see the AUTH MODEL note on JokeFactoryClient.as(), which is
 * the reason that matters more here than it looks.
 *
 * Zero dependencies, Node 20+ built-ins only, same as client.ts and wait.ts.
 */

import type {
  LobbyResponse,
  LobbyTeam,
  ParticipantStatus,
  PublishJokeDecision,
  Role,
} from '../../../types/api';
import {
  asRawBlob,
  blandControl,
  dealToTeams,
  titleFor,
  variedCorpus,
  type JokeFixture,
} from '../fixtures/jokes';
import { ApiError, type JokeFactoryClient } from './client';
import { waitForBatchInMarketingQueue, type WaitTimings } from './wait';

/* ===========================================================================
   The roster
=========================================================================== */

export interface StudentIdentity {
  displayName: string;
  userId: number;
  /**
   * Position in the join order, 0-based. Load-bearing, not decorative:
   * InstructorService.Assign round-robins whoever is WAITING `ORDER BY
   * joined_at ASC`, so join order is the only lever the harness has over who
   * lands on team 1.
   */
  joinIndex: number;
}

export interface TeamRoster {
  /** 1-based, assigned by ascending team id — i.e. creation order, which is
   *  the order Assign created them in. */
  teamNumber: number;
  teamId: number;
  teamName: string;
  jm: StudentIdentity;
  marketing: StudentIdentity;
}

/** A role the caller insists on after Assign has shuffled. */
export interface RolePin {
  displayName: string;
  role: Extract<Role, 'JM' | 'MARKETING'>;
  /** 1-based team number, in the same ascending-team-id order as TeamRoster. */
  teamNumber: number;
}

/**
 * Display names for a whole class: `priority` first, in order, then generated
 * fill-ins.
 *
 * The priority names go first because of Assign's `ORDER BY joined_at ASC`
 * round-robin — the first two joiners land on team 1. That is how a
 * browser-driven Layer 3 run finds its two students on a predictable team
 * without anyone hardcoding a user id.
 *
 * The generated names are deliberately ugly. An instructor who opens the lobby
 * and sees `e2e_student_07` knows immediately that a test is running; one who
 * sees "Alex and Sam" does not.
 */
export function classroomNames(teamCount: number, priority: readonly string[] = []): string[] {
  const wanted = teamCount * 2;
  const names: string[] = [];
  for (const p of priority) {
    const trimmed = p.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
  }
  for (let i = names.length; i < wanted; i++) {
    names.push(`e2e_student_${String(i + 1).padStart(2, '0')}`);
  }
  return names.slice(0, wanted);
}

/**
 * Join every student, IN ORDER, one at a time.
 *
 * Sequential on purpose, and the only place in this file that is. POST
 * /v1/session/join is idempotent by display name, so re-running is safe, but
 * `joined_at` is written at insert time and Assign round-robins on it. Firing
 * 24 joins concurrently would hand the ordering to whichever request the
 * database committed first, and team 1 would be a different pair on every run.
 * Twenty-four sequential requests cost a couple of seconds; a non-reproducible
 * roster costs an afternoon.
 */
export async function joinStudents(
  anon: JokeFactoryClient,
  names: readonly string[],
): Promise<StudentIdentity[]> {
  const out: StudentIdentity[] = [];
  for (const [joinIndex, displayName] of names.entries()) {
    const res = await anon.sessionJoin({ display_name: displayName });
    out.push({ displayName, userId: res.user.user_id, joinIndex });
  }
  return out;
}

export interface AssembledClass {
  roster: TeamRoster[];
  /** The lobby as it stood after every correction — the state the assertions
   *  and the report describe. */
  lobby: LobbyResponse;
  /** PATCHes that were actually issued, phrased for a human. Empty is the
   *  happy path; anything here means Assign's shuffle needed correcting. */
  corrections: string[];
  /** Everything about the final lobby that is not what a 12-team round should
   *  look like. Non-empty means the run should not proceed. */
  problems: string[];
}

/** Lobby `Teams` is null (not []) when empty, and its order is not promised.
 *  Sort by team id so "team 1" means the first team Assign created, on every
 *  run and in every report. */
function sortedTeams(lobby: LobbyResponse): LobbyTeam[] {
  return [...(lobby.Teams ?? [])].sort((a, b) => a.Team.id - b.Team.id);
}

function rosterFrom(lobby: LobbyResponse, students: readonly StudentIdentity[]): TeamRoster[] {
  const byId = new Map(students.map((s) => [s.userId, s]));
  const out: TeamRoster[] = [];

  sortedTeams(lobby).forEach((t, i) => {
    const jm = t.Members.find((m) => m.Role === 'JM');
    const mk = t.Members.find((m) => m.Role === 'MARKETING');
    if (!jm || !mk) return; // reported by validateClass, not silently patched here
    const jmId = byId.get(jm.UserID);
    const mkId = byId.get(mk.UserID);
    if (!jmId || !mkId) return; // a member this harness never joined — also reported
    out.push({
      teamNumber: i + 1,
      teamId: t.Team.id,
      teamName: t.Team.name,
      jm: jmId,
      marketing: mkId,
    });
  });

  return out;
}

function validateClass(
  lobby: LobbyResponse,
  roster: readonly TeamRoster[],
  teamCount: number,
  students: readonly StudentIdentity[],
): string[] {
  const problems: string[] = [];
  const teams = sortedTeams(lobby);

  if (teams.length !== teamCount) {
    problems.push(
      `lobby has ${teams.length} team(s), expected ${teamCount} — Assign creates one team per ` +
        'requested count and puts everyone beyond 2N back to WAITING, so a short count usually ' +
        'means fewer students joined than this harness thinks it joined',
    );
  }

  for (const t of teams) {
    const roles = t.Members.map((m) => m.Role).sort();
    if (t.Members.length !== 2 || roles.join('+') !== 'JM+MARKETING') {
      problems.push(
        `team ${t.Team.id} (${t.Team.name}) has ${t.Members.length} member(s) with role(s) ` +
          `[${roles.join(', ') || 'none'}] — a team is exactly 1 Joke Maker + 1 Marketing`,
      );
    }
  }

  const unassigned = lobby.Unassigned ?? [];
  if (unassigned.length > 0) {
    problems.push(
      `${unassigned.length} student(s) left unassigned (${unassigned
        .map((u) => u.DisplayName)
        .join(', ')}) — with exactly 2N students and N teams nobody should be spare, so either a ` +
        'join failed or the lobby held users from a previous run that the reset did not remove',
    );
  }

  if (roster.length !== teamCount) {
    problems.push(
      `only ${roster.length} of ${teamCount} team(s) could be resolved to a JM/Marketing pair this ` +
        'harness actually joined — a member id in the lobby is not one of the ' +
        `${students.length} students joined above`,
    );
  }

  return problems;
}

/**
 * Turn a pile of joined students into 12 teams of two, with the roles the
 * caller asked for.
 *
 * ASSIGN IS A SHUFFLE, NOT AN INSTRUCTION. `POST .../assign` takes a team_count
 * and nothing else: it creates N teams and deals one JM + one MARKETING into
 * each from the WAITING pool, shuffled. There is no way to say "this student is
 * the marketer". The only way to get a specific arrangement is to let Assign
 * run, READ BACK what it decided, and correct the difference with `PATCH
 * .../users/{uid}`, which is exactly what this function does. It never
 * hardcodes a user id — every id here came back from a join or from the lobby.
 *
 * Correcting within a team is a straight two-PATCH swap. There is no unique
 * constraint on (team, role), so the intermediate state where both members are
 * momentarily JM is legal; the lobby is re-read afterwards and the result is
 * what gets validated, not what was intended.
 */
export async function assembleClass(
  instructor: JokeFactoryClient,
  roundId: number,
  teamCount: number,
  students: readonly StudentIdentity[],
  pins: readonly RolePin[] = [],
): Promise<AssembledClass> {
  let lobby = await instructor.instructorAssign(roundId, { team_count: teamCount });
  let roster = rosterFrom(lobby, students);
  const corrections: string[] = [];

  const byName = new Map(students.map((s) => [s.displayName, s]));
  const ASSIGNED: ParticipantStatus = 'ASSIGNED';

  for (const pin of pins) {
    const student = byName.get(pin.displayName);
    const team = roster[pin.teamNumber - 1];
    if (!student || !team) continue; // validateClass reports the shape problem

    const alreadyRight =
      (pin.role === 'JM' ? team.jm : team.marketing).userId === student.userId;
    if (alreadyRight) continue;

    // The student who currently holds the wanted seat, and the seat the pinned
    // student currently holds. Both are on a team somewhere; swapping them is
    // two PATCHes and leaves every other team untouched.
    const occupant = pin.role === 'JM' ? team.jm : team.marketing;
    const current = roster.find(
      (t) => t.jm.userId === student.userId || t.marketing.userId === student.userId,
    );
    if (!current) continue;
    const currentRole: Extract<Role, 'JM' | 'MARKETING'> =
      current.jm.userId === student.userId ? 'JM' : 'MARKETING';

    await instructor.instructorPatchUser(roundId, student.userId, {
      status: ASSIGNED,
      role: pin.role,
      team_id: team.teamId,
    });
    lobby = await instructor.instructorPatchUser(roundId, occupant.userId, {
      status: ASSIGNED,
      role: currentRole,
      team_id: current.teamId,
    });
    roster = rosterFrom(lobby, students);
    corrections.push(
      `swapped ${student.displayName} -> ${pin.role} on team ${pin.teamNumber} ` +
        `(u${student.userId}), moving ${occupant.displayName} (u${occupant.userId}) to ` +
        `${currentRole} on team ${current.teamNumber}`,
    );
  }

  // Read the lobby back one final time even when nothing was patched: the
  // assign response and the lobby endpoint are the same snapshot type, but the
  // thing worth asserting on is the state the round actually starts in.
  lobby = await instructor.instructorLobby(roundId);
  roster = rosterFrom(lobby, students);

  return {
    roster,
    lobby,
    corrections,
    problems: validateClass(lobby, roster, teamCount, students),
  };
}

/* ===========================================================================
   The round
=========================================================================== */

export type TeamPhase = 'submit' | 'claim' | 'split' | 'publish';

export interface StepTiming {
  phase: TeamPhase;
  ms: number;
  detail: string;
}

/** Which corpus a team was dealt. The control team exists so the classifier
 *  verdict has something to compare the varied teams against — see the SET B
 *  block in fixtures/jokes.ts, which explains why the control is boring. */
export type Corpus = 'varied' | 'bland';

export interface TeamPlan {
  teamNumber: number;
  corpus: Corpus;
  hand: readonly JokeFixture[];
  /** How many of the hand Marketing publishes; the rest are discarded.
   *  Round 1 rejects an all-discard batch, so this is always >= 1. */
  publishCount: number;
}

/**
 * Everything one team did, whether or not it worked. Deliberately flat and
 * JSON-safe: this object goes straight into report.json, and a field the
 * reporter has to reconstruct is a field that will be wrong.
 */
export interface TeamOutcome {
  teamNumber: number;
  teamId: number;
  teamName: string;
  corpus: Corpus;
  jm: { userId: number; displayName: string };
  marketing: { userId: number; displayName: string };

  /** Fixture ids, so a failure names a specific joke rather than a text blob. */
  handIds: string[];
  /** Exactly what the JM pasted. */
  blobChars: number;

  submittedBatchId: number | null;
  submittedStatus: string | null;

  /** What queue/next handed this marketer. The claim-race evidence. */
  claimedBatchId: number | null;
  /** The backend's own record of who holds the lock. If it is not this
   *  marketer's user id, someone else claimed the batch. */
  claimedLockedBy: number | null;
  claimQueueSize: number | null;

  splitJokeIds: number[];
  splitJokeTexts: string[];

  publishedJokeIds: number[];
  discardedJokeIds: number[];
  /** joke_id -> the title Marketing typed. TITLE_FIT is a graded dimension, so
   *  these are the fixtures' curated titles, not placeholders. */
  titles: Record<string, string>;

  ok: boolean;
  failedPhase: TeamPhase | null;
  /** The full multi-line ApiError message when there was one — it already
   *  carries the route, status, backend error code and request_id. */
  error: string | null;
  errorStatus: number | null;
  errorCode: string | null;

  steps: StepTiming[];
  /** ms from the start of the concurrent round to this team's first request.
   *  Near-zero across all teams is the proof they really did run at once. */
  startedAtMs: number;
  finishedAtMs: number;
}

/**
 * The two actor clients one team acts through.
 *
 * Held here rather than on TeamRoster because a roster is plain data that goes
 * straight into report.json, and a fetch closure does not serialise. See
 * `bindClients`.
 */
export interface TeamClients {
  jm: JokeFactoryClient;
  marketing: JokeFactoryClient;
}

export interface ClassRoundOptions {
  roundId: number;
  roster: readonly TeamRoster[];
  plans: readonly TeamPlan[];
  /** Keyed by teamNumber. Build it with `bindClients`. */
  clients: ReadonlyMap<number, TeamClients>;
  /** Budget for one marketer's queue poll. Not worker-dependent — CreateBatch
   *  is synchronous — so anything long here is a submit that never landed. */
  claimBudgetMs?: number;
  timings?: WaitTimings;
  /** Called as each team finishes, for a live progress line. */
  onTeamDone?: (outcome: TeamOutcome) => void;
}

/**
 * One frozen client per actor, derived from the anonymous base client.
 *
 * `client.as()` returns a NEW instance rather than mutating identity, which is
 * the whole reason 24 students and an instructor can act at once without a
 * marketer ever being mistaken for the JM whose batch they are claiming. Doing
 * it once up front also means no code path inside the round can accidentally
 * reach for the instructor client.
 */
export function bindClients(
  roster: readonly TeamRoster[],
  base: JokeFactoryClient,
): Map<number, TeamClients> {
  return new Map(
    roster.map((team) => [
      team.teamNumber,
      {
        jm: base.as(team.jm.userId, `JM t${team.teamNumber}`),
        marketing: base.as(team.marketing.userId, `MK t${team.teamNumber}`),
      },
    ]),
  );
}

export interface ClassRoundResult {
  outcomes: TeamOutcome[];
  /** Wall time of the whole concurrent phase. */
  elapsedMs: number;
  /** Spread of team start times. Large means the teams were not concurrent
   *  after all, which would invalidate the claim-race assertion. */
  startSpreadMs: number;
}

/**
 * Deal the corpora to teams.
 *
 * The varied corpus is dealt to ALL teams first and the control team's hand is
 * then overwritten, rather than dealing to `teamCount - 1` teams. That keeps
 * every other team's hand byte-identical to a run with no control team at all,
 * so turning the control on or off does not silently re-deal the class and move
 * every score in the report.
 */
export function planTeams(
  teamCount: number,
  perTeam: number,
  controlTeamNumber: number,
  seed?: string | number,
): TeamPlan[] {
  const varied = dealToTeams(variedCorpus, { teams: teamCount, perTeam, seed });

  return Array.from({ length: teamCount }, (_, i) => {
    const teamNumber = i + 1;
    const isControl = teamNumber === controlTeamNumber;
    return {
      teamNumber,
      corpus: isControl ? ('bland' as const) : ('varied' as const),
      hand: isControl ? blandControl.slice(0, perTeam) : varied[i],
      // One discard per team, always. Round 1 refuses an all-discard batch, and
      // a batch with no discard leaves cost_of_discard unexercised — the
      // economics assertion needs both prices to appear in a real profit
      // figure, not just the one that happens to dominate.
      publishCount: Math.max(1, perTeam - 1),
    };
  });
}

/**
 * Run the whole class through one round, concurrently.
 *
 * Never rejects. A team that throws comes back as a TeamOutcome with `ok:
 * false` and the phase it died in, and the other teams are unaffected —
 * Promise.all over guarded closures, so there is no rejection for it to
 * short-circuit on. (Promise.allSettled would do the same job, but it would
 * also hide the fact that the guarding is deliberate and hand the caller a
 * union type to unwrap for no benefit.)
 */
export async function runClassRound(opts: ClassRoundOptions): Promise<ClassRoundResult> {
  const started = performance.now();
  const byNumber = new Map(opts.plans.map((p) => [p.teamNumber, p]));

  const outcomes = await Promise.all(
    opts.roster.map(async (team) => {
      const plan = byNumber.get(team.teamNumber);
      const outcome = await runOneTeam(opts, team, plan, started);
      opts.onTeamDone?.(outcome);
      return outcome;
    }),
  );

  outcomes.sort((a, b) => a.teamNumber - b.teamNumber);
  const starts = outcomes.map((o) => o.startedAtMs);

  return {
    outcomes,
    elapsedMs: performance.now() - started,
    startSpreadMs: starts.length ? Math.max(...starts) - Math.min(...starts) : 0,
  };
}

/** The guard. Everything below the try is the happy path; everything a real
 *  backend can do to a team lands in the catch as a diagnosable outcome. */
async function runOneTeam(
  opts: ClassRoundOptions,
  team: TeamRoster,
  plan: TeamPlan | undefined,
  roundStarted: number,
): Promise<TeamOutcome> {
  const hand = plan?.hand ?? [];
  const blob = asRawBlob(hand);

  const outcome: TeamOutcome = {
    teamNumber: team.teamNumber,
    teamId: team.teamId,
    teamName: team.teamName,
    corpus: plan?.corpus ?? 'varied',
    jm: { userId: team.jm.userId, displayName: team.jm.displayName },
    marketing: { userId: team.marketing.userId, displayName: team.marketing.displayName },
    handIds: hand.map((j) => j.id),
    blobChars: blob.length,
    submittedBatchId: null,
    submittedStatus: null,
    claimedBatchId: null,
    claimedLockedBy: null,
    claimQueueSize: null,
    splitJokeIds: [],
    splitJokeTexts: [],
    publishedJokeIds: [],
    discardedJokeIds: [],
    titles: {},
    ok: false,
    failedPhase: null,
    error: null,
    errorStatus: null,
    errorCode: null,
    steps: [],
    startedAtMs: performance.now() - roundStarted,
    finishedAtMs: 0,
  };

  let phase: TeamPhase = 'submit';
  /** `detail` is handed the RESOLVED value, not closed over the outcome. The
   *  outcome fields are assigned after the step returns, so a detail that read
   *  them would describe every step as having produced nothing. */
  const step = async <T>(
    p: TeamPhase,
    detail: (value: T) => string,
    fn: () => Promise<T>,
  ): Promise<T> => {
    phase = p;
    const t0 = performance.now();
    const value = await fn();
    outcome.steps.push({ phase: p, ms: performance.now() - t0, detail: detail(value) });
    return value;
  };

  try {
    if (!plan) {
      throw new Error(
        `no TeamPlan for team ${team.teamNumber} — planTeams and the roster disagree about how ` +
          'many teams exist, which is a harness bug rather than a finding about the backend',
      );
    }

    const bound = opts.clients.get(team.teamNumber);
    if (!bound) {
      throw new Error(
        `team ${team.teamNumber} has no bound clients — call bindClients(roster, client) and pass ` +
          'the result as ClassRoundOptions.clients. This is a harness bug, not a backend finding.',
      );
    }
    const jmClient = bound.jm;
    const mkClient = bound.marketing;

    // ---- JM: paste the blob -------------------------------------------------
    // The RAW path, not the pre-split one. A real Joke Maker pastes text and
    // Marketing does the cutting; submitting `jokes: [...]` would skip the
    // split entirely and leave the whole QualityControl flow untested.
    const submitted = await step(
      'submit',
      (r) => `raw blob, ${blob.length} chars, ${hand.length} joke(s) -> batch ${r.batch.batch_id} (${r.batch.status})`,
      () => jmClient.submitBatch(opts.roundId, { team_id: team.teamId, raw_text: blob }),
    );
    outcome.submittedBatchId = submitted.batch.batch_id;
    outcome.submittedStatus = submitted.batch.status;

    // ---- Marketing: claim ---------------------------------------------------
    // queue/next is not a read — it LOCKS the batch to this marketer. Twelve
    // marketers calling it at the same instant is the concurrency the headline
    // assertion judges, and `locked_by` in the response is the evidence.
    const claimed = await step(
      'claim',
      (r) =>
        `claimed batch ${r.value.batch?.batch_id ?? '—'}, locked_by u${r.value.batch?.locked_by ?? '—'}, ` +
        `after ${r.polls} poll(s)`,
      () =>
        waitForBatchInMarketingQueue(mkClient, opts.roundId, {
          batchId: submitted.batch.batch_id,
          budgetMs: opts.claimBudgetMs ?? 45_000,
          timings: opts.timings,
        }),
    );
    const claimedBatch = claimed.value.batch;
    if (!claimedBatch) {
      throw new Error('queue/next settled with a null batch — waitForBatchInMarketingQueue is broken');
    }
    outcome.claimedBatchId = claimedBatch.batch_id;
    outcome.claimedLockedBy = claimedBatch.locked_by;
    outcome.claimQueueSize = claimed.value.queue_size;

    // ---- Marketing: split ---------------------------------------------------
    // Round 1 demands EXACTLY batch_size jokes here. The cut is the fixture's
    // own joke boundaries rather than a re-run of services/jokeSplit, so a
    // splitter regression shows up as a text mismatch in the oracle instead of
    // being quietly reproduced by the test.
    const split = await step(
      'split',
      (r) => `${r.jokes.length} joke(s) cut from the blob`,
      () => mkClient.marketingSplit(claimedBatch.batch_id, { jokes: hand.map((j) => j.text) }),
    );
    outcome.splitJokeIds = split.jokes.map((j) => j.joke_id);
    outcome.splitJokeTexts = split.jokes.map((j) => j.joke_text);

    // ---- Marketing: title, publish, discard ---------------------------------
    // titleFor throws on text it does not recognise. That is wanted: a joke
    // that came back from the backend mangled must fail loudly here rather than
    // be published under an invented title, which would corrupt TITLE_FIT and
    // quietly poison the classifier verdict downstream.
    const decisions: PublishJokeDecision[] = split.jokes.map((j, i) => {
      const title = titleFor(j.joke_text);
      outcome.titles[String(j.joke_id)] = title;
      return { joke_id: j.joke_id, joke_title: title, is_published: i < plan.publishCount };
    });

    const published = await step(
      'publish',
      (r) =>
        `${r.published.count} published, ${r.discarded.count} discarded ` +
        '(classification is NOT done — the worker only starts here)',
      () => mkClient.marketingPublish(claimedBatch.batch_id, { jokes: decisions }),
    );
    outcome.publishedJokeIds = published.published.joke_ids;
    outcome.discardedJokeIds = published.discarded.joke_ids;

    outcome.ok = true;
  } catch (err) {
    outcome.failedPhase = phase;
    outcome.error = err instanceof Error ? err.message : String(err);
    if (err instanceof ApiError) {
      outcome.errorStatus = err.status;
      outcome.errorCode = err.code ?? null;
    }
  }

  outcome.finishedAtMs = performance.now() - roundStarted;
  return outcome;
}
