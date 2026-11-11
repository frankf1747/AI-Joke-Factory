/* Node only: plays one feedback-pilot class against a local backend and
   returns its ClassResult (scripts/pilot/feedbackReport.ts). Used by
   feedback-pilot.mts and cost-sweep.mts.

   The class: an admin reset (it deletes all game data; the runners refuse a
   non-local backend), both rounds configured with the two costs, then the 2×2
   class of bot teams (classTeams) on Round 1. The SAME engine keeps playing
   while the runner ends Round 1 and starts Round 2 (bots read the active round
   every loop). After each round ends, its stats, its lean charts and every
   team's batch list (read as that team's own Joke Maker bot) are collected. */
import { createClient } from '../../services/shared/client';
import { BotEngine, realDelay } from '../../services/bots/engine';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { indexTraitCorpus, type TraitCorpus, type TraitIndex } from '../../services/shared/traitCorpus';
import type { ConfigRequest } from '../../types/api';
import {
  batchFits, classTeams, pilotConfig, settingsLines, teamRowFrom,
  type ClassResult, type Costs, type GroupId, type PilotEnv, type PilotRound, type PilotSidecar, type RoundResult, type TeamRow,
} from './feedbackReport';

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

export async function runFeedbackClass(o: ClassOptions): Promise<ClassResult> {
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
  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'fatal') o.log(`FATAL ${m.message}`); },
    seed: o.seed, traitCorpus: o.corpus,
  });
  const index = indexTraitCorpus(o.corpus);
  const result: ClassResult = { classNo: o.classNo, seed: o.seed, rounds: [] };
  try {
    await engine.start({
      roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE }, maxTeams: teams.length,
    });
    o.log(`class ${o.classNo}: ${teams.length} teams, round 1 started`);
    result.rounds.push(await playRound(1, ids[1], o, engine, api, instructor, groupOf, index));
    await instructor.instructorStart(ids[2], { ideal_profile: { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'] });
    o.log(`class ${o.classNo}: round 2 started`);
    result.rounds.push(await playRound(2, ids[2], o, engine, api, instructor, groupOf, index));
  } finally {
    engine.stop();
  }
  return result;
}

/**
 * Every class of one setting, one after another (class k plays with seed
 * `${env.seed}-c${k}`). A failed class is recorded in `errors` and the next
 * one still runs.
 */
export async function runSetting(
  base: Pick<ClassOptions, 'baseUrl' | 'password' | 'instructor' | 'corpus' | 'log'>,
  env: PilotEnv, costs: Costs, date: string,
): Promise<PilotSidecar> {
  const side: PilotSidecar = { date, costs, settings: settingsLines({ ...env, costs }, SPEED), classes: [], errors: [], tag: env.tag };
  for (let k = 1; k <= env.classes; k++) {
    try {
      side.classes.push(await runFeedbackClass({
        ...base, costs, windowS: env.window, perGroup: env.perGroup, seed: `${env.seed}-c${k}`, classNo: k,
      }));
    } catch (err) {
      const message = `class ${k} (listing $${costs.listing}, hosting $${costs.hosting}): ${err instanceof Error ? err.message : String(err)}`;
      base.log(`FAILED ${message}`);
      side.errors.push(message);
    }
  }
  return side;
}

async function playRound(
  round: PilotRound, roundId: number, o: ClassOptions, engine: BotEngine, api: Client, instructor: Client,
  groupOf: ReadonlyMap<number, GroupId>, index: TraitIndex,
): Promise<RoundResult> {
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
  for (const t of engine.status().teams) {
    const r = stats.leaderboard.find(x => x.team.id === t.teamId);
    if (!r || t.teamId == null || t.jm.userId == null) continue;
    const list = (await api.as(t.jm.userId, `bot ${t.index}A`).teamBatches(roundId, t.teamId)).batches ?? [];
    rows.push(teamRowFrom(
      r, groupOf.get(t.index) as GroupId, prices, charts.teams.find(c => c.team_id === t.teamId)?.batches,
      batchFits(list, index, DEFAULT_IDEAL_PROFILE),
    ));
  }
  const endedAt = Date.parse(prices.ended_at ?? '') || Date.now();
  return { round, durationS: Math.round((endedAt - startedAt) / 1000), rows };
}
