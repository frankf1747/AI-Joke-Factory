/* Runs ONE Lean bot class against a local backend — Round 1 then Round 2,
   one rule set and one set of fees — and writes the fees pilot report
   (scripts/pilot/report.ts; spec docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §7).

   Usage (local docker backend, password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/lean-pilot.mts docs/pilots/<date>-lean-fees-pilot.md

   The stack MUST run the deterministic hash classifier (APP_LLM_MODE=hash together with
   APP_LLM_HASH_CONFIRM=local-pilot-only); otherwise the bots make paid classification calls.

   Environment:
     E2E_ADMIN_PASSWORD   required.
     E2E_BE_URL           default http://localhost:8081. Only localhost, 127.0.0.1 and [::1]
                          are allowed unless PILOT_ALLOW_REMOTE=1: the class starts with an
                          admin reset that deletes all game data.
     PILOT_RENDER_ONLY    path to a JSON sidecar from an earlier run: re-render its markdown
                          (to the output path, default the sidecar's path with .md) and exit.
                          Calls no backend and needs no password.
     PILOT_INSTRUCTOR     instructor display name, default "Local Instructor".
     PILOT_WINDOW         arrival window in seconds, default 90: the bots play 10× faster, so
                          90 s stands for a 15-minute round.
     PILOT_SHIP_SMALL / PILOT_SHIP_STANDARD / PILOT_SHIP_LARGE
                          shipping fee per batch of 1–4 / 5 / 6–10 jokes, default 1 / 2 / 3.
                          Per batch, so NOT scaled.
     PILOT_STORAGE / PILOT_HOSTING
                          per joke-minute at classroom speed, default 0.05 / 0.05. The backend
                          charges per wall-clock minute, so both are sent ×10.
     PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET, PILOT_BUY_THRESHOLD
                          optional overrides of the backend defaults (5, $3, 8). Customers: the
                          backend default is 18 per team (count at start = 18 x teams).
     PILOT_CUSTOMERS_PER_TEAM
                          customers per team (0-1000), default the backend's 18.
     PILOT_CUSTOMERS      a FIXED customer count; also sends customers_per_team 0 so the
                          per-team rule is off. Not together with PILOT_CUSTOMERS_PER_TEAM.
     PILOT_PER_PERSONA    teams per persona, default 3 (a class of 80 is about 10).
     PILOT_HOLD_TEAMS     extra Balanced teams whose Marketing holds batches, default 2.
     PILOT_SEED           seed for the bots' jokes, default a fresh one per run.
     PILOT_TAG            free-text label printed under the report title.

   The class: reset (Round 1 batch size 5 exactly, Round 2 up to 10); configure both rounds
   with the fees (pilotConfig); start the bot engine on Round 1 with 14 teams: 3 per persona
   (Careful, Balanced, Spray, Learner) plus 2 "Balanced (holds)" — Balanced in every way except
   that Marketing holds each batch an extra 60 class-seconds before deciding (6 s at 10×), the
   controlled contrast for check 3. The SAME engine keeps running while the script ends
   Round 1 and starts Round 2: the bots read the active round on every loop and keep their
   40-joke cap per round id, and team assignments live on the users, so nobody re-seats. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '../../services/shared/client';
import { BotEngine, CAP_REACHED, realDelay } from '../../services/bots/engine';
import { BALANCED_HOLDS, personaSequence, type PersonaId } from '../../services/bots/personas';
import type { BotTeamSpec } from '../../services/bots/protocol';
import type { EngineStatus } from '../../services/bots/protocol';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import type { ConfigRequest } from '../../types/api';
import {
  HOLDS, ROUND_SLACK_S, classMinuteLimit, classMinutesOf, isLocalUrl, isOver, markdown, parseTuning, pilotConfig, settingsLines, teamRowFrom,
  type PilotRound, type PilotSidecar, type RunResult,
} from './report';

const RENDER_ONLY = process.env.PILOT_RENDER_ONLY;
if (RENDER_ONLY) {
  const side = JSON.parse(readFileSync(RENDER_ONLY, 'utf8')) as PilotSidecar;
  const out = process.argv[2] ?? RENDER_ONLY.replace(/\.json$/, '') + '.md';
  writeFileSync(out, markdown(side.results, side.date, side.settings, side.errors, side.tag));
  console.log(`rendered ${out} from ${RENDER_ONLY}`);
  process.exit(0);
}

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the pilot against ${BE}: it resets all game data. Use the local backend.`);
}
const TUNING = parseTuning(process.env);
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const INSTRUCTOR = process.env.PILOT_INSTRUCTOR ?? 'Local Instructor';
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-lean-fees-pilot.md`;
const SIDECAR = OUT.replace(/\.md$/, '') + '.json';

const COUNTS: Record<PersonaId, number> = {
  CAREFUL: TUNING.perPersona, BALANCED: TUNING.perPersona, SPRAY: TUNING.perPersona, LEARNER: TUNING.perPersona,
};
/** Extra Balanced teams whose Marketing holds each batch (BALANCED_HOLDS), reported as HOLDS. */
const HOLD_TEAMS = TUNING.holdTeams;
const SPEED = 10 as const;
/** Seeds the bots' jokes; a fresh one per run unless PILOT_SEED is set, so repeat runs sample joke luck. */
const SEED = process.env.PILOT_SEED?.trim() || `pilot-${Date.now()}`;
const POLL_MS = 5_000;
/** After the arrival window closes: let the backend serve due arrivals, then end the round. */
const SETTLE_MS = 4_000;
/** The longest a round should run in class minutes; longer is flagged. */
const MAX_CLASS_MINUTES = classMinuteLimit(TUNING.window, SETTLE_MS / 1000, SPEED);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ideal = { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'];

const SETTINGS: string[] = [
  `Backend ${BE}.`,
  ...settingsLines(
    TUNING, SPEED,
    [...Object.entries(COUNTS).map(([p, n]) => `${n} ${p}`), `${HOLD_TEAMS} ${HOLDS}`].join(', '),
  ),
  `${HOLDS} ("${BALANCED_HOLDS.label}") is Balanced in every way except that its Marketing seat holds each batch an extra `
    + `${BALANCED_HOLDS.marketingHoldMs / 1000} class-seconds (${BALANCED_HOLDS.marketingHoldMs / 1000 / SPEED} s at ${SPEED}×) before deciding: the controlled contrast for the desk check.`,
  `Bot joke seed: ${SEED}. Each Balanced (holds) team draws the same jokes as a Balanced partner.`,
  `Each round is ended ${SETTLE_MS / 1000} s after its arrival window closes, whatever the bots' progress (a 15-minute class ends at 15 minutes); stats and charts are read after the end, when the fee clocks have stopped. Round length is the server's started_at to ended_at, in class minutes (wall seconds × ${SPEED} / 60); a round over ${MAX_CLASS_MINUTES} (window + settle + ${ROUND_SLACK_S} s slack) is flagged.`,
];

type Instructor = ReturnType<ReturnType<typeof createClient>['as']>;

/** Pushes each round's result into `results` as soon as it is read, so a later failure keeps it. */
async function runClass(results: RunResult[]): Promise<void> {
  const api = createClient({ baseUrl: BE });
  const login = await api.instructorLogin({ display_name: INSTRUCTOR, password: PASSWORD as string });
  const instructor = api.as(login.user.user_id, 'instructor');
  await instructor.adminResetGame_DESTRUCTIVE_TRUNCATES_ALL_GAME_DATA();
  const rounds = (await api.roundsActive()).rounds;
  const ids = {
    1: rounds.find(r => r.round_number === 1)?.id,
    2: rounds.find(r => r.round_number === 2)?.id,
  };
  if (ids[1] == null || ids[2] == null) throw new Error('the backend has no rounds 1 and 2 after reset');
  for (const round of [1, 2] as const) {
    await instructor.instructorConfig(ids[round] as number, pilotConfig(TUNING, SPEED, round));
  }

  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'fatal') console.error('FATAL', m.message); },
    seed: SEED,
  });
  const teams: BotTeamSpec[] = personaSequence(COUNTS).map((persona, i) => ({ index: i + 1, persona }));
  // Each holding team draws exactly the jokes of a Balanced partner, so the
  // contrast measures the hold and not joke luck.
  const balanced = teams.filter(t => t.persona === 'BALANCED');
  for (let k = 0; k < HOLD_TEAMS; k++) {
    teams.push({
      index: teams.length + 1, persona: BALANCED_HOLDS.persona, marketingHoldMs: BALANCED_HOLDS.marketingHoldMs,
      deckIndex: balanced.length ? balanced[k % balanced.length].index : undefined,
    });
  }
  const labelOf = new Map(teams.map(t => [t.index, t.marketingHoldMs ? HOLDS : t.persona]));
  try {
    await engine.start({
      roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE }, maxTeams: teams.length,
    });
    console.log(`${teams.length} teams, round 1 started`);
    results.push(await playRound(1, ids[1], engine, instructor, labelOf));
    await instructor.instructorStart(ids[2], { ideal_profile: ideal });
    console.log('round 2 started');
    results.push(await playRound(2, ids[2], engine, instructor, labelOf));
  } finally {
    engine.stop();
  }
}

/** Let the arrival window play out, end the round, then read its stats and lean charts. */
async function playRound(
  round: PilotRound, roundId: number, engine: BotEngine, instructor: Instructor, labelOf: ReadonlyMap<number, string>,
): Promise<RunResult> {
  const t0 = Date.now();
  const calls0 = engine.status().classificationCalls;
  const startedAt = Date.parse(
    (await instructor.roundsActive()).rounds.find(r => r.id === roundId)?.started_at ?? '',
  ) || t0;
  const windowEnds = startedAt + TUNING.window * 1000;

  // Bounded by the window itself, so there is no other timeout path.
  while (Date.now() < windowEnds) {
    await sleep(Math.min(POLL_MS, Math.max(1, windowEnds - Date.now())));
    const s: EngineStatus = engine.status();
    const capped = s.teams.filter(t => t.jm.activity.includes(CAP_REACHED)).length;
    const idle = s.teams.filter(t => /waiting for a batch/.test(t.marketing.activity)).length;
    const windowLeft = Math.max(0, Math.round((windowEnds - Date.now()) / 1000));
    console.log(
      `  R${round} t=${Math.round((Date.now() - t0) / 1000)}s capped=${capped}/${s.teams.length} `
        + `marketing idle=${idle}/${s.teams.length} calls=${s.classificationCalls} window left=${windowLeft}s`,
    );
  }
  // Reading stats serves any Lean arrivals that are due; then end the round so
  // storage and hosting stop at the window, as a 15-minute class would.
  await sleep(SETTLE_MS / 2);
  await instructor.instructorStats(roundId);
  await sleep(SETTLE_MS / 2);
  await instructor.instructorEnd(roundId);
  const localEnd = Date.now();
  const final = engine.status();

  const stats = await instructor.instructorStats(roundId);
  const charts = await instructor.instructorLeanCharts(roundId);
  const prices = (await instructor.roundsActive()).rounds.find(r => r.id === roundId);
  if (!prices) throw new Error(`round ${roundId} vanished`);
  const personaByTeam = new Map<number, string>();
  for (const t of final.teams) if (t.teamId != null) personaByTeam.set(t.teamId, labelOf.get(t.index) ?? t.persona);
  const rows = stats.leaderboard.map(r => teamRowFrom(
    r, personaByTeam.get(r.team.id) ?? '?', prices,
    charts.teams.find(t => t.team_id === r.team.id)?.batches,
  ));
  // The server's own clock, start to end, read back after the end: the fee clocks run on it.
  const endedAt = Date.parse(prices.ended_at ?? '') || localEnd;
  const durationS = Math.round((endedAt - startedAt) / 1000);
  const classMinutes = classMinutesOf(durationS, SPEED);
  console.log(`  R${round} ended after ${durationS}s (${classMinutes} class minutes)`);
  return {
    round, durationS, classMinutes, maxClassMinutes: MAX_CLASS_MINUTES, calls: final.classificationCalls - calls0, rows,
  };
}

const results: RunResult[] = [];
const t0 = Date.now();
const errors: string[] = [];
try {
  await runClass(results);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAILED ${message}`);
  errors.push(message);
}
for (const r of results) {
  if (isOver(r)) errors.push(`Round ${r.round} ran ${r.classMinutes} class minutes (over ${r.maxClassMinutes})`);
}
const sidecar: PilotSidecar = { date: TODAY, settings: SETTINGS, results, errors, tag: TUNING.tag };
writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2));
writeFileSync(OUT, markdown(results, TODAY, SETTINGS, errors, TUNING.tag));
console.log(`wrote ${OUT} and ${SIDECAR}`);
console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
