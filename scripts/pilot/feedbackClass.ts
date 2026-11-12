/* Node only: plays one feedback-pilot class against a local backend and
   returns its ClassResult (scripts/pilot/feedbackReport.ts). Used by
   feedback-pilot.mts and cost-sweep.mts.

   The class: an admin reset (it deletes all game data; the runners refuse a
   non-local backend), both rounds configured with the two costs, then the 2×2
   class of bot teams (classTeams) on Round 1. The SAME engine keeps playing
   while the runner ends Round 1 and starts Round 2 (bots read the active round
   every loop). After each round ends, its stats, its lean charts and every
   team's batch list (read as that team's own Joke Maker bot) are collected. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../../services/shared/client';
import type { BotTeamSpec } from '../../services/bots/protocol';
import type { LeaderboardRow } from '../../services/classTotals';
import { buildRunRecord, buildRunRound } from '../../services/runRecord/build';
import type { RunBot, RunRecord, RunRound } from '../../services/runRecord/types';
import { BotEngine, realDelay } from '../../services/bots/engine';
import { DEFAULT_IDEAL_PROFILE, type IdealProfile } from '../../config/dimensions';
import { indexTraitCorpus, type TraitCorpus, type TraitIndex } from '../../services/shared/traitCorpus';
import type { ConfigRequest } from '../../types/api';
import {
  batchFits, classTeams, failedClassMessage, finishClass, money, pairOf, pilotConfig, settingsLines, teamProblems, teamRowFrom, timedRound,
  traitEvidence, traitModeError, traitModeNote,
  type ClassResult, type ClassTeam, type Costs, type GroupId, type PilotEnv, type PilotRound, type PilotSidecar, type RoundResult, type TeamRow,
  type TraitEvidence,
} from './feedbackReport';
import { botOf, fitsOf, pilotRates, recordFileName } from './pilotRecord';

export const SPEED = 10 as const;
/** After the arrival window: let due arrivals be served, then end the round. */
const SETTLE_MS = 4_000;
const POLL_MS = 5_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface ClassOptions {
  baseUrl: string;
  password: string;
  instructor: string;
  costs: Costs;
  windowS: number;
  perGroup: number;
  seed: string;
  classNo: number;
  corpus: TraitCorpus;
  log: (line: string) => void;
}

type Client = ReturnType<typeof createClient>;

/** What a played class gives back: its report figures and its run record (services/runRecord). */
export interface PlayedClass { result: ClassResult; record: RunRecord }

/** "listing $0.10 hosting $0.05": how a class's costs read in its record's name and file. */
const costsLabel = (c: Costs): string => `listing ${money(c.listing)} hosting ${money(c.hosting)}`;

export async function runFeedbackClass(o: ClassOptions): Promise<PlayedClass> {
  const api = createClient({ baseUrl: o.baseUrl });
  const login = await api.instructorLogin({ display_name: o.instructor, password: o.password });
  const instructor = api.as(login.user.user_id, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const rounds = (await api.roundsActive()).rounds;
  const ids = { 1: rounds.find(r => r.round_number === 1)?.id, 2: rounds.find(r => r.round_number === 2)?.id };
  if (ids[1] == null || ids[2] == null) throw new Error('the backend has no rounds 1 and 2 after reset');
  for (const round of [1, 2] as const) {
    await instructor.instructorConfig(ids[round] as number, pilotConfig(o.costs, SPEED, o.windowS, round));
  }

  const teams = classTeams(o.perGroup);
  const groupOf = new Map<number, GroupId>(teams.map(t => [t.index, t.group]));
  const pairs = new Map<number, number>(teams.map(t => [t.index, pairOf(t)]));
  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'fatal') o.log(`FATAL ${m.message}`); },
    seed: o.seed, traitCorpus: o.corpus,
  });
  const index = indexTraitCorpus(o.corpus);
  const result: ClassResult = { classNo: o.classNo, seed: o.seed, rounds: [] };
  const runRounds: RunRound[] = [];
  const specOf = new Map<number, ClassTeam>(teams.map(t => [t.index, t]));
  try {
    await engine.start({
      roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE }, maxTeams: teams.length,
    });
    o.log(`class ${o.classNo}: ${teams.length} teams, round 1 started`);
    // Fit is scored against the ideal the backend stored, not the one the pilot meant to send.
    const evidence: TraitEvidence = { aboveBar: 0, sold: 0 };
    const played1 = await playRound(1, ids[1], await storedIdeal(instructor, ids[1]), o, engine, api, instructor, groupOf, pairs, specOf, index, result, evidence);
    result.rounds.push(played1.result);
    runRounds.push(played1.run);
    // A hash-mode stack must not produce a normal-looking report: stop the class here.
    const notTraits = traitModeError(evidence);
    if (notTraits) throw new Error(notTraits);
    // Too little evidence to tell is not a failure: keep the class, but say so in its errors.
    const cannotTell = traitModeNote(evidence);
    if (cannotTell) {
      o.log(`  class ${o.classNo} ${cannotTell}`);
      (result.errors ??= []).push(`class ${o.classNo} ${cannotTell}`);
    }
    await instructor.instructorStart(ids[2], { ideal_profile: { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'] });
    o.log(`class ${o.classNo}: round 2 started`);
    const played2 = await playRound(2, ids[2], await storedIdeal(instructor, ids[2]), o, engine, api, instructor, groupOf, pairs, specOf, index, result, evidence);
    result.rounds.push(played2.result);
    runRounds.push(played2.run);
  } finally {
    engine.stop();
  }
  const record = buildRunRecord(
    { name: `${costsLabel(o.costs)} class ${o.classNo}`, notes: o.seed, playedBy: 'bots', exportedAt: new Date().toISOString() },
    runRounds,
  );
  return { result: finishClass(result), record };
}

/** The round's ideal as the backend stored it (GET config); an error when it holds none. */
async function storedIdeal(instructor: Client, roundId: number): Promise<IdealProfile> {
  const ideal = (await instructor.instructorGetConfig(roundId)).round.ideal_profile;
  if (!ideal || Object.keys(ideal).length === 0) throw new Error(`round ${roundId} has no stored ideal_profile to score fit against`);
  return { ...ideal };
}

/**
 * Every class of one setting, one after another (class k plays with seed
 * `${env.seed}-c${k}`). A failed class is recorded in `errors` and the next
 * one still runs.
 */
export async function runSetting(
  base: Pick<ClassOptions, 'baseUrl' | 'password' | 'instructor' | 'corpus' | 'log'>,
  env: PilotEnv, costs: Costs, date: string,
  /** Called after every class, played or failed, with the run so far (the runners save their sidecar here). */
  onClass?: (side: PilotSidecar) => void,
  /** When set, each played class's run record is written here (one .jfrun.json file per class). */
  recordsDir?: string,
): Promise<PilotSidecar> {
  const side: PilotSidecar = {
    date, costs, settings: settingsLines({ ...env, costs }, SPEED), classes: [], errors: [], tag: env.tag, requested: env.classes,
  };
  for (let k = 1; k <= env.classes; k++) {
    try {
      const played = await runFeedbackClass({
        ...base, costs, windowS: env.window, perGroup: env.perGroup, seed: `${env.seed}-c${k}`, classNo: k,
      });
      side.classes.push(played.result);
      if (recordsDir) {
        mkdirSync(recordsDir, { recursive: true });
        writeFileSync(join(recordsDir, recordFileName(costsLabel(costs), k)), JSON.stringify(played.record, null, 2));
      }
    } catch (err) {
      const message = failedClassMessage(k, costs, err);
      base.log(`FAILED ${message}`);
      side.errors.push(message);
    }
    onClass?.(side);
  }
  return side;
}

async function playRound(
  round: PilotRound, roundId: number, ideal: IdealProfile, o: ClassOptions, engine: BotEngine, api: Client, instructor: Client,
  groupOf: ReadonlyMap<number, GroupId>, pairs: ReadonlyMap<number, number>, specOf: ReadonlyMap<number, BotTeamSpec>,
  index: TraitIndex, into: ClassResult, evidence: TraitEvidence,
): Promise<{ result: RoundResult; run: RunRound }> {
  const startedAt = Date.parse((await instructor.roundsActive()).rounds.find(r => r.id === roundId)?.started_at ?? '') || Date.now();
  const windowEnds = startedAt + o.windowS * 1000;
  while (Date.now() < windowEnds) {
    await sleep(Math.min(POLL_MS, Math.max(1, windowEnds - Date.now())));
    o.log(`  class ${o.classNo} R${round}: ${Math.max(0, Math.round((windowEnds - Date.now()) / 1000))} s left, `
      + `${engine.status().classificationCalls} jokes released`);
  }
  // Reading stats serves the arrivals that are due; then end the round so hosting stops at the window.
  await sleep(SETTLE_MS / 2);
  await instructor.instructorStats(roundId);
  await sleep(SETTLE_MS / 2);
  await instructor.instructorEnd(roundId);

  const stats = await instructor.instructorStats(roundId);
  const charts = await instructor.instructorLeanCharts(roundId);
  const prices = (await instructor.roundsActive()).rounds.find(r => r.id === roundId);
  if (!prices) throw new Error(`round ${roundId} vanished`);
  const rows: TeamRow[] = [];
  const bots = new Map<number, RunBot>();
  const fits = new Map<number, Array<{ seq: number; fit: number | null }>>();
  const teams = engine.status().teams;
  const problems = teamProblems(round, teams, id => stats.leaderboard.some(x => x.team.id === id));
  (into.errors ??= []).push(...problems.map(p => `class ${o.classNo} ${p}`));
  for (const p of problems) o.log(`  class ${o.classNo} ${p}`);
  for (const t of teams) {
    const r = stats.leaderboard.find(x => x.team.id === t.teamId);
    if (!r || t.teamId == null || t.jm.userId == null) continue;
    const list = (await api.as(t.jm.userId, `bot ${t.index}A`).teamBatches(roundId, t.teamId)).batches ?? [];
    if (round === 1) {
      const e = traitEvidence(list, index, ideal);
      evidence.aboveBar += e.aboveBar;
      evidence.sold += e.sold;
    }
    const fitList = batchFits(list, index, ideal);
    rows.push({
      ...teamRowFrom(r, groupOf.get(t.index) as GroupId, prices, charts.teams.find(c => c.team_id === t.teamId)?.batches, fitList),
      pair: pairs.get(t.index),
    });
    fits.set(t.teamId, fitsOf(fitList));
    const spec = specOf.get(t.index);
    if (spec) bots.set(t.teamId, botOf(spec, `${o.seed}#${spec.deckIndex ?? spec.index}`));
  }
  const endedAt = Date.parse(prices.ended_at ?? '') || Date.now();
  // The stored config carries the round's fees and settings; read once, after the round ended.
  const config = (await instructor.instructorGetConfig(roundId)).round;
  const played = new Set(rows.map(r => r.teamId));
  const run = buildRunRound({
    round, config, stats: { leaderboard: stats.leaderboard.filter(x => played.has(x.team.id)).map((x): LeaderboardRow => ({ points: 0, ...x })) }, charts, teamNames: {},
    rates: pilotRates(config), bots, fits,
  });
  return { result: timedRound(round, Math.round((endedAt - startedAt) / 1000), rows, o.windowS, SETTLE_MS / 1000, SPEED), run };
}
