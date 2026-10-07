/* Runs whole two-round bot classes against a backend, in CLASSIC and LEAN
   market mode, and writes the pilot report (scripts/pilot/report.ts).

   Usage (local docker backend, password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/lean-pilot.mts docs/pilots/<date>-lean-pilot.md

   Environment:
     E2E_ADMIN_PASSWORD   required.
     E2E_BE_URL           default http://localhost:8081. Only localhost, 127.0.0.1 and [::1]
                          are allowed unless PILOT_ALLOW_REMOTE=1: every class starts with an
                          admin reset that deletes all game data.
     PILOT_RENDER_ONLY    path to a JSON sidecar from an earlier run: re-render its markdown
                          (to the output path, default the sidecar's path with .md) and exit.
                          Calls no backend and needs no password.
     PILOT_INSTRUCTOR     instructor display name, default "Local Instructor".
     PILOT_WINDOW         Lean arrival window in seconds, default 180 (bots run at 10x,
                          so a 15-minute class compresses to a few minutes).
     Carrying cost is charged per WALL-CLOCK minute, but the bots run at 10x, so a
     compressed class would pay a tenth of a real class's inventory cost. Lean rounds
     are therefore configured with carrying = LEAN_CLASS_PRESET carrying x SPEED (10).
     Setup cost is per batch, not per minute, and stays unscaled; the window is as given.
     Tuning knobs (unset = preset / backend value; all printed in the report's Settings):
     PILOT_PREFERENCE_BASE  sent as preference_base in both Lean round configs (backend default 2).
     PILOT_CARRYING         carrying per joke-minute BEFORE the x10 scaling; replaces the preset 0.05.
     PILOT_SETUP_R1/_R2     setup cost per batch for Lean round 1 / round 2.
     PILOT_CUSTOMERS        customer_count for every round of every class (Classic too), integer >= 1.
     PILOT_BUDGET           customer_budget for every round of every class (Classic too), >= 0.
     PILOT_PLAN             all (default: CLASSIC, LEAN, CLASSIC, LEAN) or lean (LEAN rep 1, rep 2).
     PILOT_TAG              free-text label printed under the report title.
     PILOT_SMOKE=1        a quick end-to-end check: ONE Lean class, one team per persona,
                          window 60 s unless PILOT_WINDOW says otherwise.

   Each class: reset; configure rounds 1 and 2 (Lean: LEAN_CLASS_PRESET plus the
   window; Classic: defaults); start the bot engine on round 1 with startRound.
   The SAME engine keeps running while the script ends round 1 and starts round 2:
   the bots read the active round on every loop and keep their per-round batch
   caps by round id, and team assignments live on the users, so nobody re-seats. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '../../services/shared/client';
import { BotEngine, CAP_REACHED, realDelay } from '../../services/bots/engine';
import { personaSequence, type PersonaId } from '../../services/bots/personas';
import type { EngineStatus } from '../../services/bots/protocol';
import { LEAN_CLASS_PRESET, leanConfigToBody } from '../../services/leanMode';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import type { ConfigRequest } from '../../types/api';
import { isLocalUrl, markdown, neverSoldOf, parseTuning, tuningLine, type PilotMode, type PilotSidecar, type PilotRound, type RunResult, type TeamRow } from './report';

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
const SMOKE = process.env.PILOT_SMOKE === '1';
const WINDOW = Number(process.env.PILOT_WINDOW ?? (SMOKE ? 60 : 180));
if (!Number.isInteger(WINDOW) || WINDOW < 1) throw new Error(`PILOT_WINDOW must be a positive integer, got ${process.env.PILOT_WINDOW}`);
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-lean-pilot.md`;
const SIDECAR = OUT.replace(/\.md$/, '') + '.json';

const COUNTS: Record<PersonaId, number> = SMOKE
  ? { CAREFUL: 1, BALANCED: 1, SPRAY: 1, LEARNER: 1 }
  : { CAREFUL: 3, BALANCED: 3, SPRAY: 3, LEARNER: 3 };
// Alternating, to spread any drift in the backend over both modes.
const PLAN: Array<{ mode: PilotMode; rep: number }> = SMOKE
  ? [{ mode: 'LEAN', rep: 1 }]
  : TUNING.plan === 'lean'
    ? [{ mode: 'LEAN', rep: 1 }, { mode: 'LEAN', rep: 2 }]
    : [{ mode: 'CLASSIC', rep: 1 }, { mode: 'LEAN', rep: 1 }, { mode: 'CLASSIC', rep: 2 }, { mode: 'LEAN', rep: 2 }];
const SPEED = 10 as const;
const POLL_MS = 5_000;
const MAX_ROUND_MS = 8 * 60_000;
const SETTLE_MS = 15_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ideal = { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'];

/** Knobs that apply to every round of every class, so Classic and Lean stay comparable. */
function withMarket(body: ConfigRequest): ConfigRequest {
  if (TUNING.customers !== undefined) body.customer_count = TUNING.customers;
  if (TUNING.budget !== undefined) body.customer_budget = TUNING.budget;
  return body;
}

function configFor(mode: PilotMode, round: PilotRound): ConfigRequest {
  if (mode === 'CLASSIC') return withMarket(leanConfigToBody({ marketMode: 'CLASSIC' }));
  const preset = LEAN_CLASS_PRESET[round];
  const setup = round === 1 ? TUNING.setupR1 : TUNING.setupR2;
  const body: ConfigRequest = leanConfigToBody({
    ...preset, arrivalWindowSeconds: WINDOW,
    setupCostPerBatch: setup ?? preset.setupCostPerBatch,
    carryingCostPerJokeMinute: (TUNING.carrying ?? preset.carryingCostPerJokeMinute ?? 0) * SPEED,
  });
  if (TUNING.preferenceBase !== undefined) body.preference_base = TUNING.preferenceBase;
  return withMarket(body);
}

/** The report's settings section. */
const SETTINGS: string[] = [
  `Backend ${BE}; bots at ${SPEED}x; ${Object.entries(COUNTS).map(([p, n]) => `${n} ${p}`).join(', ')} per class${SMOKE ? ' (PILOT_SMOKE)' : ''}.`,
  ...([1, 2] as const).map(r => {
    const c = configFor('LEAN', r);
    return `Lean R${r}: setup $${c.setup_cost_per_batch} per batch, carrying $${c.carrying_cost_per_joke_minute} per joke-minute, `
      + `WIP limit ${c.wip_limit || 'none'}, arrival window ${c.arrival_window_seconds}s`
      + `${c.preference_base !== undefined ? `, preference_base ${c.preference_base}` : ''}.`;
  }),
  tuningLine(TUNING, SPEED),
  `Carrying scaled ×${SPEED} to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.`,
  'Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.',
  `Lean carrying accrues until stats are read: each round waits for the caps and the window, then settles ${SETTLE_MS / 1000}s before reading stats.`,
];

/** Pushes each round's result into `results` as soon as it is read, so a later failure keeps it. */
async function runClass(mode: PilotMode, rep: number, results: RunResult[]): Promise<void> {
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
  for (const round of [1, 2] as const) await instructor.instructorConfig(ids[round] as number, configFor(mode, round));

  const engine = new BotEngine({
    api, instructorUserId: login.user.user_id, delay: realDelay, now: () => Date.now(),
    emit: m => { if (m.type === 'fatal') console.error('FATAL', m.message); },
    seed: `pilot-${mode}-${rep}`,
  });
  const teams = personaSequence(COUNTS).map((persona, i) => ({ index: i + 1, persona }));
  try {
    await engine.start({ roundId: ids[1], teams, speed: SPEED, startRound: true, idealProfile: { ...DEFAULT_IDEAL_PROFILE } });
    console.log(`${mode} rep ${rep}: ${teams.length} teams, round 1 started`);
    results.push(await playRound(mode, rep, 1, ids[1], engine, instructor));
    await instructor.instructorStart(ids[2], { ideal_profile: ideal });
    console.log(`${mode} rep ${rep}: round 2 started`);
    results.push(await playRound(mode, rep, 2, ids[2], engine, instructor));
  } finally {
    engine.stop();
  }
}

/** Wait for the round to play out, read its stats, end it. */
async function playRound(
  mode: PilotMode, rep: number, round: PilotRound, roundId: number,
  engine: BotEngine, instructor: ReturnType<ReturnType<typeof createClient>['as']>,
): Promise<RunResult> {
  const t0 = Date.now();
  const calls0 = engine.status().classificationCalls;
  const startedAt = Date.parse(
    (await instructor.roundsActive()).rounds.find(r => r.id === roundId)?.started_at ?? '',
  ) || t0;
  const windowEnds = mode === 'LEAN' ? startedAt + WINDOW * 1000 : 0;

  while (Date.now() - t0 < MAX_ROUND_MS) {
    await sleep(POLL_MS);
    const s: EngineStatus = engine.status();
    const capped = s.teams.filter(t => t.jm.activity.includes(CAP_REACHED)).length;
    const idle = s.teams.filter(t => /waiting for a batch/.test(t.marketing.activity)).length;
    const windowLeft = Math.max(0, Math.round((windowEnds - Date.now()) / 1000));
    console.log(
      `  R${round} t=${Math.round((Date.now() - t0) / 1000)}s capped=${capped}/${s.teams.length} `
        + `marketing idle=${idle}/${s.teams.length} calls=${s.classificationCalls}${mode === 'LEAN' ? ` window left=${windowLeft}s` : ''}`,
    );
    if (capped === s.teams.length && idle === s.teams.length && windowLeft === 0) break;
  }
  if (Date.now() - t0 >= MAX_ROUND_MS) console.warn(`  R${round}: hit the ${MAX_ROUND_MS / 60_000}-minute cap`);
  await sleep(SETTLE_MS);

  // Reading stats also serves any Lean arrivals that are due.
  const final = engine.status();
  const stats = await instructor.instructorStats(roundId);
  const personaByTeam = new Map<number, string>();
  for (const t of final.teams) if (t.teamId != null) personaByTeam.set(t.teamId, t.persona);
  const rows: TeamRow[] = stats.leaderboard.map(r => ({
    teamId: r.team.id, persona: personaByTeam.get(r.team.id) ?? '?', profit: r.profit, sales: r.total_sales,
    published: r.published_jokes, neverSold: r.lean ? neverSoldOf(r.lean.batch_series) : null, setup: r.lean?.setup_cost ?? 0, carrying: r.lean?.carrying_cost ?? 0,
    leadTimeS: r.lean?.avg_submit_to_publish_s ?? 0, saleTimeS: r.lean?.avg_publish_to_first_sale_s ?? 0, rank: r.rank,
  }));
  await instructor.instructorEnd(roundId);
  const durationS = Math.round((Date.now() - t0) / 1000);
  console.log(`  R${round} ended after ${durationS}s`);
  return { mode, rep, round, durationS, calls: final.classificationCalls - calls0, rows };
}

const results: RunResult[] = [];
const t0 = Date.now();
const errors: string[] = [];
for (const step of PLAN) {
  try {
    await runClass(step.mode, step.rep, results);
  } catch (err) {
    const message = `${step.mode} rep ${step.rep}: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`FAILED ${message}`);
    errors.push(message);
  }
  const sidecar: PilotSidecar = { date: TODAY, settings: SETTINGS, results, errors, tag: TUNING.tag };
  writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2));
  writeFileSync(OUT, markdown(results, TODAY, SETTINGS, errors, TUNING.tag));
  console.log(`wrote ${OUT} and ${SIDECAR}`);
}
console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
