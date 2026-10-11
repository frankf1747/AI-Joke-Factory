/* Runs ONE Lean bot class against a local backend — Round 1 then Round 2,
   one rule set and one set of fees — and writes the fees pilot report
   (scripts/pilot/report.ts; spec docs/superpowers/specs/2026-10-11-lean-fees-next-step-design.md §7).

   Usage (local docker backend, password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/lean-pilot.mts docs/pilots/<date>-lean-fees-pilot.md

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
                          per joke-minute at classroom speed, default 0.10 / 0.05. The backend
                          charges per wall-clock minute, so both are sent ×10.
     PILOT_PREFERENCE_BASE, PILOT_CUSTOMERS, PILOT_BUDGET
                          optional overrides of the backend defaults (3, 150, $3).
     PILOT_TAG            free-text label printed under the report title.

   The class: reset (Round 1 batch size 5 exactly, Round 2 up to 10); configure both rounds
   with the fees (pilotConfig); start the bot engine on Round 1 with 12 teams, 3 per persona
   (Careful, Balanced, Spray, Learner). The SAME engine keeps running while the script ends
   Round 1 and starts Round 2: the bots read the active round on every loop and keep their
   40-joke cap per round id, and team assignments live on the users, so nobody re-seats. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '../../services/shared/client';
import { BotEngine, CAP_REACHED, realDelay } from '../../services/bots/engine';
import { personaSequence, type PersonaId } from '../../services/bots/personas';
import type { EngineStatus } from '../../services/bots/protocol';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import type { ConfigRequest } from '../../types/api';
import {
  isLocalUrl, markdown, parseTuning, pilotConfig, settingsLines, teamRowFrom,
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

const COUNTS: Record<PersonaId, number> = { CAREFUL: 3, BALANCED: 3, SPRAY: 3, LEARNER: 3 };
const SPEED = 10 as const;
const POLL_MS = 5_000;
const MAX_ROUND_MS = 8 * 60_000;
const SETTLE_MS = 15_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ideal = { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'];

const SETTINGS: string[] = [
  `Backend ${BE}.`,
  ...settingsLines(TUNING, SPEED, Object.entries(COUNTS).map(([p, n]) => `${n} ${p}`).join(', ')),
  `Each round waits for every team's cap and the arrival window, then settles ${SETTLE_MS / 1000} s before reading stats.`,
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
    seed: 'pilot-fees',
  });
  const teams = personaSequence(COUNTS).map((persona, i) => ({ index: i + 1, persona }));
  try {
    await engine.start({ roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE } });
    console.log(`${teams.length} teams, round 1 started`);
    results.push(await playRound(1, ids[1], engine, instructor));
    await instructor.instructorStart(ids[2], { ideal_profile: ideal });
    console.log('round 2 started');
    results.push(await playRound(2, ids[2], engine, instructor));
  } finally {
    engine.stop();
  }
}

/** Wait for the round to play out, read its stats and lean charts, end it. */
async function playRound(round: PilotRound, roundId: number, engine: BotEngine, instructor: Instructor): Promise<RunResult> {
  const t0 = Date.now();
  const calls0 = engine.status().classificationCalls;
  const startedAt = Date.parse(
    (await instructor.roundsActive()).rounds.find(r => r.id === roundId)?.started_at ?? '',
  ) || t0;
  const windowEnds = startedAt + TUNING.window * 1000;

  while (Date.now() - t0 < MAX_ROUND_MS) {
    await sleep(POLL_MS);
    const s: EngineStatus = engine.status();
    const capped = s.teams.filter(t => t.jm.activity.includes(CAP_REACHED)).length;
    const idle = s.teams.filter(t => /waiting for a batch/.test(t.marketing.activity)).length;
    const windowLeft = Math.max(0, Math.round((windowEnds - Date.now()) / 1000));
    console.log(
      `  R${round} t=${Math.round((Date.now() - t0) / 1000)}s capped=${capped}/${s.teams.length} `
        + `marketing idle=${idle}/${s.teams.length} calls=${s.classificationCalls} window left=${windowLeft}s`,
    );
    if (capped === s.teams.length && idle === s.teams.length && windowLeft === 0) break;
  }
  if (Date.now() - t0 >= MAX_ROUND_MS) console.warn(`  R${round}: hit the ${MAX_ROUND_MS / 60_000}-minute cap`);
  await sleep(SETTLE_MS);

  // Reading stats also serves any Lean arrivals that are due.
  const final = engine.status();
  const stats = await instructor.instructorStats(roundId);
  const charts = await instructor.instructorLeanCharts(roundId);
  const prices = (await instructor.roundsActive()).rounds.find(r => r.id === roundId);
  if (!prices) throw new Error(`round ${roundId} vanished`);
  const personaByTeam = new Map<number, string>();
  for (const t of final.teams) if (t.teamId != null) personaByTeam.set(t.teamId, t.persona);
  const rows = stats.leaderboard.map(r => teamRowFrom(
    r, personaByTeam.get(r.team.id) ?? '?', prices,
    charts.teams.find(t => t.team_id === r.team.id)?.batches,
  ));
  await instructor.instructorEnd(roundId);
  const durationS = Math.round((Date.now() - t0) / 1000);
  console.log(`  R${round} ended after ${durationS}s`);
  return { round, durationS, calls: final.classificationCalls - calls0, rows };
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
const sidecar: PilotSidecar = { date: TODAY, settings: SETTINGS, results, errors, tag: TUNING.tag };
writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2));
writeFileSync(OUT, markdown(results, TODAY, SETTINGS, errors, TUNING.tag));
console.log(`wrote ${OUT} and ${SIDECAR}`);
console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
