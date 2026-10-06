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
import type { ConfigRequest, PublicRound, SessionMeResponse, TeamBatch } from '../../types/api';
import { asRawBlob, seededRng, titleFor, variedCorpus, type JokeFixture } from '../shared/jokes';
import { statusOf, type BotApi } from './api';
import { Deck, drawLearnerBatch } from './deck';
import { botName, isBotName, parseBotName, SEAT_ROLE, type Seat } from './naming';
import {
  BATCH_CAP_PER_ROUND, DWELL_MS, FEEDBACK_WAIT_MS, IDLE_POLL_MS, MAX_BOT_TEAMS, PERSONAS,
  QUEUE_POLL_MS, chooseWithMemory, choosePublished, jitter, publishCount, type JokeMemory, type PersonaId,
} from './personas';
import { isWipLimitReached } from '../leanMode';
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
/** Every Joke Maker's activity at its per-round cap contains this; the pilot waits on it. */
export const CAP_REACHED = 'cap reached';
/** A Joke Maker refused by the Lean WIP limit shows this while it waits. */
export const WIP_WAIT_ACTIVITY = 'waiting — Marketing at WIP limit';

/**
 * The per-round cap in JOKES: BATCH_CAP_PER_ROUND batches of the round's
 * batch_size. A persona that submits full batches stops after exactly
 * BATCH_CAP_PER_ROUND batches, as before; one that submits smaller batches
 * (the Learner's 3 from round 2) sends more, smaller batches instead of fewer
 * jokes. Classification calls are bounded by jokes either way.
 */
export function jokeCapFor(batchSize: number): number {
  return BATCH_CAP_PER_ROUND * batchSize;
}
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
  /** This seat's actor loop is running (set on entry, cleared on exit). */
  live: boolean;
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
  /** Jokes submitted per round, for the per-round cap (jokeCapFor). */
  submittedJokesByRound: Map<number, number>;
  publishedByRound: Map<number, number>;
  /** All rounds, for the panel. */
  published: number;
  /** The last publish's joke ids; Careful waits for their feedback. */
  awaitingFeedback: { roundId: number; jokeIds: number[] } | null;
  /** Learner only: what each published joke text did on the market, by text. */
  memory: JokeMemory;
}

function newSeat(index: number, seat: Seat): SeatRuntime {
  return { seat, userId: null, name: botName(index, seat), activity: 'not started', error: null, checkedAt: null, checkedEpoch: -1, live: false };
}

function newTeam(spec: BotTeamSpec): TeamRuntime {
  return {
    index: spec.index, persona: spec.persona, teamId: null,
    jm: newSeat(spec.index, 'A'), marketing: newSeat(spec.index, 'B'),
    submittedByRound: new Map(), submittedJokesByRound: new Map(), publishedByRound: new Map(), published: 0, awaitingFeedback: null,
    memory: new Map(),
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
          return {
            teamIndex: team.index, seat: seat.seat, persona: team.persona, teamId: team.teamId,
            claiming: this.claiming(seat),
          };
        }
      }
    }
    return null;
  }

  /**
   * Would this seat's actor call queue/next now? Only a live Marketing actor
   * does, and only while the engine runs and is neither paused for a scramble
   * (checkSeat returns false for every bot then) nor forming teams.
   */
  private claiming(seat: SeatRuntime): boolean {
    return seat.seat === 'B' && seat.live && this.running && !this.scrambled && !this.forming;
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
    // Check BEFORE seating anyone, for Fill too. The backend refuses to start a
    // round that is ACTIVE or ENDED (usecase/instructor.go:232-237), so bots
    // seated for one that can never start would just sit there; and bots may
    // only join a round before it starts. The panel's lobby probe can be
    // seconds old — Stop an all-bot run, click Fill at once, and it still reads
    // CONFIGURED — so this fresh reading is the one that counts.
    const rounds = (await this.deps.api.roundsActive()).rounds;
    if (signal.aborted) return;
    const round = rounds.find(r => r.id === options.roundId);
    if (!round || round.status !== 'CONFIGURED') {
      throw new Error(
        `Round ${round?.round_number ?? options.roundId} is ${round?.status ?? 'missing'}; bots need a round that has not started.`,
      );
    }
    if (options.startRound) {
      // Only one round may be active at a time (a unique index,
      // migrations/0001_schema.sql:84); starting a second returns a 500.
      // Fill starts nothing, so another round being active does not matter to it.
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
    /** Learner only: where its rotation through sold texts resumes. */
    let reuseCursor = 0;
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
        const submittedJokes = team.submittedJokesByRound.get(round.id) ?? 0;
        const cap = jokeCapFor(round.batch_size);
        if (submittedJokes >= cap) {
          this.setActivity(seat, `done — ${cap}-joke ${CAP_REACHED}`, signal);
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        if (persona.waitForFeedback) await this.waitUntilSettled(me, team, round.id, signal);
        if (signal.aborted) break;

        // Round 1 must split into exactly batch_size, so a lean batch size
        // applies only from round 2 (usecase/marketing.go:98-102).
        const size = persona.leanBatchSize && round.round_number >= 2
          ? Math.min(persona.leanBatchSize, round.batch_size)
          : round.batch_size;
        let jokes: JokeFixture[];
        if (persona.learns) {
          // The team's memory, shared with its Marketing seat, refreshed from
          // the same batch list a human team sees.
          await this.learn(me, team, round.id, signal);
          if (signal.aborted) break;
          const drawn = drawLearnerBatch(deck, variedCorpus, team.memory, size, reuseCursor);
          jokes = drawn.jokes;
          reuseCursor = drawn.cursor;
        } else {
          jokes = deck.draw(size);
        }
        this.setActivity(seat, 'submitting a batch', signal);
        await me.submitBatch(round.id, { team_id: team.teamId as number, raw_text: asRawBlob(jokes) });
        // A batch in flight when Stop is pressed lands but is not counted or logged.
        if (signal.aborted) break;
        team.submittedByRound.set(round.id, submitted + 1);
        team.submittedJokesByRound.set(round.id, submittedJokes + jokes.length);
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

  /** Marks the seat live for as long as its loop runs; see claiming(). */
  private async runMarketing(team: TeamRuntime, signal: AbortSignal): Promise<void> {
    team.marketing.live = true;
    try {
      await this.marketingLoop(team, signal);
    } finally {
      team.marketing.live = false;
    }
  }

  private async marketingLoop(team: TeamRuntime, signal: AbortSignal): Promise<void> {
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
        if (persona.learns) {
          await this.learn(me, team, round.id, signal);
          if (signal.aborted) break;
        }
        const keep = persona.learns
          ? chooseWithMemory(jokes, team.memory, count, rand, round.round_number)
          : choosePublished(jokes.map(j => j.joke_id), count, rand);
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
   * Learner only: read the team's own batch lists — what a human team sees —
   * for every round it has submitted in plus the current one, so a sale of a
   * round-1 joke that lands after round 1's last read still counts in round 2.
   *
   * A published joke is 'sold' if it has EVER sold: sold_count counts current
   * holdings and falls when a buyer returns it, so first_sold_at (from the
   * append-only purchase log) is read too. It is 'unsold' only once a LATER
   * batch has been processed, so a joke that merely has not sold yet is not
   * written off. 'sold' always wins over 'unsold'.
   */
  private async learn(me: BotApi, team: TeamRuntime, roundId: number, signal: AbortSignal): Promise<void> {
    if (team.teamId == null) return;
    const rounds = new Set([...team.submittedByRound.keys(), roundId]);
    const list: TeamBatch[] = [];
    for (const id of rounds) {
      list.push(...((await me.teamBatches(id, team.teamId)).batches ?? []));
      if (signal.aborted) return;
    }
    const processed = list
      .filter(b => b.processed_at && !Number.isNaN(Date.parse(b.processed_at)))
      .sort((a, b) => Date.parse(a.processed_at as string) - Date.parse(b.processed_at as string));
    processed.forEach((b, i) => {
      const isLatest = i === processed.length - 1;
      for (const j of b.jokes ?? []) {
        if (j.publish_status !== 'PUBLISHED') continue;
        const key = j.joke_text.trim();
        if ((j.sold_count ?? 0) > 0 || j.first_sold_at != null) team.memory.set(key, 'sold');
        else if (!isLatest && !team.memory.has(key)) team.memory.set(key, 'unsold');
      }
    });
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
    if (seat.seat === 'A' && isWipLimitReached(err)) {
      // Lean WIP limit: the round is fine, Marketing just has enough waiting.
      this.setActivity(seat, WIP_WAIT_ACTIVITY, signal);
      await this.pace(IDLE_POLL_MS, signal);
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
