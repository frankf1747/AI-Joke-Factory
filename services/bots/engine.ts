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

/** A bot's own user row is gone — it was removed — so its actor stops. */
class SeatGone extends Error {
  constructor() {
    super('this bot user no longer exists');
  }
}

interface SeatRuntime extends SeatStatus {
  seat: Seat;
}

interface TeamRuntime {
  index: number;
  persona: PersonaId;
  teamId: number | null;
  jm: SeatRuntime;
  marketing: SeatRuntime;
  submittedByRound: Map<number, number>;
  submitted: number;
  published: number;
  /** Joke ids of the last publish; Careful waits for their feedback. */
  awaitingFeedback: number[];
}

function newSeat(index: number, seat: Seat): SeatRuntime {
  return { seat, userId: null, name: botName(index, seat), activity: 'not started', error: null };
}

function newTeam(spec: BotTeamSpec): TeamRuntime {
  return {
    index: spec.index, persona: spec.persona, teamId: null,
    jm: newSeat(spec.index, 'A'), marketing: newSeat(spec.index, 'B'),
    submittedByRound: new Map(), submitted: 0, published: 0, awaitingFeedback: [],
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
  private roundId: number | null = null;
  private roundCache: { at: number; round: PublicRound | null } | null = null;
  /** Bumped at the end of every team formation; see checkSeat. */
  private formationEpoch = 0;
  private forming = false;
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
      warnings: [...this.warnings],
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

  async start(options: StartOptions): Promise<void> {
    if (this.running) throw new Error('Bots are already running — stop them first.');
    if (options.teams.length === 0) throw new Error('Choose at least one bot team.');
    if (options.teams.length > MAX_BOT_TEAMS) throw new Error(`At most ${MAX_BOT_TEAMS} bot teams.`);
    if (options.startRound) {
      // Check BEFORE seating anyone. The backend refuses to start a round that
      // is ACTIVE or ENDED (usecase/instructor.go:232-237); bots seated for a
      // round that can never start would just sit there.
      const rounds = (await this.deps.api.roundsActive()).rounds;
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
    this.teams = options.teams.map(newTeam);
    this.emitStatus();

    await this.joinBots();
    await this.formTeams();
    if (options.startRound) {
      const body: ConfigRequest = options.idealProfile
        ? { ideal_profile: options.idealProfile as ConfigRequest['ideal_profile'] }
        : {};
      await this.instructor().instructorStart(options.roundId, body);
      this.roundCache = null;
    }

    const controller = new AbortController();
    this.controller = controller;
    for (const team of this.teams) {
      void this.runJokeMaker(team, controller.signal);
      void this.runMarketing(team, controller.signal);
    }
    this.emitStatus();
  }

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

  async reform(): Promise<void> {
    await this.formTeams();
    this.scrambled = false;
    this.emitStatus();
  }

  /** Stop, then delete every bot user — never a human. Returns how many were removed. */
  async remove(roundId: number): Promise<number> {
    this.stop();
    const instructor = this.instructor();
    const ids = new Set(
      participantsOf(await instructor.instructorLobby(roundId)).filter(p => isBotName(p.name)).map(p => p.userId),
    );
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
    this.scrambled = false;
    this.emitStatus();
    return ids.size;
  }

  // ---- formation -----------------------------------------------------------

  private instructor(): BotApi {
    return this.deps.api.as(this.deps.instructorUserId, 'instructor');
  }

  private requireRoundId(): number {
    if (this.roundId == null) throw new Error('No round selected.');
    return this.roundId;
  }

  private async joinBots(): Promise<void> {
    for (const team of this.teams) {
      for (const seat of [team.jm, team.marketing]) {
        const joined = await this.deps.api.sessionJoin({ display_name: seat.name });
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

  private async runJokeMaker(team: TeamRuntime, signal: AbortSignal): Promise<void> {
    const persona = PERSONAS[team.persona];
    const seat = team.jm;
    const me = this.deps.api.as(seat.userId as number, `bot ${team.index}A`);
    const rand = seededRng(`${this.deps.seed}:jm:${team.index}`);
    const deck = new Deck(variedCorpus, rand);
    let attempt = 0;

    while (!signal.aborted) {
      try {
        if (!(await this.checkSeat(me, team, seat))) {
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const round = await this.activeRound();
        if (!round) {
          this.setActivity(seat, 'idle — no active round');
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const submitted = team.submittedByRound.get(round.id) ?? 0;
        if (submitted >= BATCH_CAP_PER_ROUND) {
          this.setActivity(seat, `done — ${BATCH_CAP_PER_ROUND}-batch cap reached`);
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        if (persona.waitForFeedback) await this.waitUntilSettled(me, team, round.id, signal);
        if (signal.aborted) break;

        const jokes = deck.draw(round.batch_size);
        this.setActivity(seat, 'submitting a batch');
        await me.submitBatch(round.id, { team_id: team.teamId as number, raw_text: asRawBlob(jokes) });
        team.submittedByRound.set(round.id, submitted + 1);
        team.submitted++;
        seat.error = null;
        attempt = 0;
        this.log(team, seat, `submitted batch ${submitted + 1}: ${jokes.map(j => j.id).join(', ')}`);
        this.setActivity(seat, 'resting before the next batch');
        await this.pace(jitter(persona.submitIntervalMs, rand), signal);
      } catch (err) {
        if (signal.aborted) break;
        if (!(await this.recover(team, seat, err, ++attempt, signal))) break;
      }
    }
  }

  /** Careful only: hold the next batch until the last one is published and scored. */
  private async waitUntilSettled(me: BotApi, team: TeamRuntime, roundId: number, signal: AbortSignal): Promise<void> {
    if (team.submitted === 0) return;
    const seat = team.jm;
    let waited = 0;
    while (!signal.aborted && waited < FEEDBACK_WAIT_MS) {
      const published = team.published >= team.submitted;
      if (published && team.awaitingFeedback.length === 0) return;
      if (published) {
        const feedback = await me.teamFeedback(roundId, team.teamId as number);
        const scored = feedback.jokes.some(
          j => team.awaitingFeedback.includes(j.joke_id) && j.good_dimensions.length + j.improve_dimensions.length > 0,
        );
        if (scored) {
          team.awaitingFeedback = [];
          this.log(team, seat, 'feedback arrived on the last batch — writing the next one');
          return;
        }
      }
      this.setActivity(seat, published ? 'waiting for customer feedback' : 'waiting for Marketing to publish');
      await this.pace(QUEUE_POLL_MS, signal);
      waited += QUEUE_POLL_MS;
    }
    if (!signal.aborted) {
      team.awaitingFeedback = [];
      // If a publish committed but its response was lost, `published` would stay
      // one behind `submitted` for good and every later batch would wait the full
      // timeout. Giving up is the moment to re-sync.
      team.published = Math.max(team.published, team.submitted);
      this.log(team, seat, 'gave up waiting for feedback — writing the next batch anyway');
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
        if (!(await this.checkSeat(me, team, seat))) {
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const round = await this.activeRound();
        if (!round) {
          this.setActivity(seat, 'idle — no active round');
          await this.pace(IDLE_POLL_MS, signal);
          continue;
        }
        const envelope = await me.marketingQueueNext(round.id);
        if (!envelope.batch) {
          this.setActivity(seat, 'waiting for a batch');
          await this.pace(QUEUE_POLL_MS, signal);
          continue;
        }

        const batch = envelope.batch;
        let jokes = envelope.jokes;
        this.log(team, seat, `claimed batch #${batch.batch_id}`);
        this.setActivity(seat, `reading batch #${batch.batch_id}`);
        await this.pace(jitter(DWELL_MS.claim, rand), signal);
        if (signal.aborted) break;

        if (jokes.length === 0 && batch.raw_text) {
          const pieces = fitPieces(splitBlob(batch.raw_text), round.batch_size, round.round_number);
          const split = await me.marketingSplit(batch.batch_id, { jokes: pieces });
          jokes = split.jokes;
          this.log(team, seat, `split batch #${batch.batch_id} into ${jokes.length} jokes`);
          this.setActivity(seat, `choosing from ${jokes.length} jokes`);
          await this.pace(jitter(DWELL_MS.split, rand), signal);
          if (signal.aborted) break;
        }

        const count = publishCount(persona, jokes.length, round.round_number, rand);
        const keep = choosePublished(jokes.map(j => j.joke_id), count, rand);
        const kept = jokes.filter(j => keep.has(j.joke_id)).map(j => `"${titleOf(j.joke_text)}"`);
        this.log(team, seat, `${persona.label}: keeping ${keep.size} of ${jokes.length} — ${kept.join(', ') || 'none'}`);
        this.setActivity(seat, `publishing ${keep.size} of ${jokes.length}`);
        await this.pace(jitter(DWELL_MS.decide, rand), signal);
        if (signal.aborted) break;

        await me.marketingPublish(batch.batch_id, {
          jokes: jokes.map(j => ({ joke_id: j.joke_id, joke_title: titleOf(j.joke_text), is_published: keep.has(j.joke_id) })),
        });
        team.published++;
        team.awaitingFeedback = [...keep];
        this.classificationCalls += keep.size;
        seat.error = null;
        attempt = 0;
        this.log(team, seat, `published ${keep.size}, discarded ${jokes.length - keep.size}`);
        this.emitStatus();
      } catch (err) {
        if (signal.aborted) break;
        if (!(await this.recover(team, seat, err, ++attempt, signal))) break;
      }
    }
  }

  /**
   * Is this seat still where formation put it? If not, someone pressed the
   * ordinary Auto-Assign and scattered bots among humans: every bot pauses until
   * the instructor re-forms teams.
   *
   * A reading taken while formation is running — or that straddled one — says
   * nothing about the settled layout, so it is ignored rather than trusted.
   */
  private async checkSeat(me: BotApi, team: TeamRuntime, seat: SeatRuntime): Promise<boolean> {
    if (this.forming) return false;
    const epoch = this.formationEpoch;
    let mine: SessionMeResponse;
    try {
      mine = await me.sessionMe();
    } catch (err) {
      if (statusOf(err) === 404) throw new SeatGone();
      throw err;
    }
    if (this.forming || epoch !== this.formationEpoch) return false;

    const inPlace = mine.assignment.team_id === team.teamId && mine.assignment.role === SEAT_ROLE[seat.seat];
    if (!inPlace && !this.scrambled) {
      this.scrambled = true;
      this.log(
        team, seat,
        `my seat moved (now ${mine.assignment.role ?? 'unassigned'} on team ${mine.assignment.team_id ?? '—'}) — every bot pauses until teams are re-formed`,
      );
      this.emitStatus();
    }
    if (this.scrambled) {
      this.setActivity(seat, 'paused — teams were re-shuffled');
      return false;
    }
    return true;
  }

  /** Returns false when the actor should stop for good. */
  private async recover(
    team: TeamRuntime, seat: SeatRuntime, err: unknown, attempt: number, signal: AbortSignal,
  ): Promise<boolean> {
    if (err instanceof SeatGone) {
      seat.error = err.message;
      this.setActivity(seat, 'stopped');
      return false;
    }
    if (statusOf(err) === 403) {
      // Refused, but not broken. For Marketing this is usually a batch that moved
      // out from under us — a stale lock someone else claimed, or another team's
      // batch — which production reports as 403, not 409
      // (usecase/marketing.go:143-160). Every other 403 comes from the role/team
      // fields checkSeat compares, so a genuinely mis-seated bot pauses there on
      // the next loop instead of spinning here.
      this.log(team, seat, 'the backend refused this (403) — polling again');
      this.setActivity(seat, 'not allowed right now — polling again');
      await this.pace(QUEUE_POLL_MS, signal);
      return true;
    }
    if (statusOf(err) === 409) {
      // ROUND_NOT_ACTIVE, or a batch already processed: the game moved on.
      this.roundCache = null;
      this.setActivity(seat, 'idle — round not active');
      await this.pace(IDLE_POLL_MS, signal);
      return true;
    }
    seat.error = err instanceof Error ? err.message : String(err);
    const backoff = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(attempt, 5));
    this.log(team, seat, `error: ${seat.error} — retrying in ${Math.round(backoff / 1000)}s`);
    this.setActivity(seat, `retrying in ${Math.round(backoff / 1000)}s`);
    await this.deps.delay(backoff, signal);
    return true;
  }

  private async activeRound(): Promise<PublicRound | null> {
    const now = this.deps.now();
    if (this.roundCache && now - this.roundCache.at < ROUND_CACHE_MS) return this.roundCache.round;
    const { rounds } = await this.deps.api.roundsActive();
    const round = rounds.find(r => r.status === 'ACTIVE') ?? null;
    this.roundCache = { at: now, round };
    return round;
  }

  private async pace(msAt1x: number, signal: AbortSignal): Promise<void> {
    for (const wall of wallClockSteps(msAt1x, () => this.speed)) {
      if (signal.aborted) return;
      await this.deps.delay(wall, signal);
    }
  }

  private setActivity(seat: SeatRuntime, activity: string): void {
    // An actor can be mid-request when stop() runs; when that request returns it
    // must not overwrite 'stopped' with a stale activity or emit after the stop.
    if (!this.running) return;
    if (seat.activity === activity) return;
    seat.activity = activity;
    this.emitStatus();
  }

  private log(team: TeamRuntime, seat: SeatRuntime, text: string): void {
    if (seat.userId == null) return;
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
