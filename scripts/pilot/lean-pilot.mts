/* Runs whole two-round bot classes against a backend, in CLASSIC and LEAN
   market mode, and writes the pilot report (scripts/pilot/report.ts).

   Usage (local docker backend, password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/lean-pilot.mts docs/pilots/<date>-lean-pilot.md

   Environment:
     E2E_ADMIN_PASSWORD   required.
     E2E_BE_URL           default http://localhost:8081. A URL containing
                          azurecontainerapps.io is refused unless PILOT_ALLOW_REMOTE=1:
                          every class starts with an admin reset that deletes all game data.
     PILOT_INSTRUCTOR     instructor display name, default "Local Instructor".
     PILOT_WINDOW         Lean arrival window in seconds, default 180 (bots run at 10x,
                          so a 15-minute class compresses to a few minutes).
     Carrying cost is charged per WALL-CLOCK minute, but the bots run at 10x, so a
     compressed class would pay a tenth of a real class's inventory cost. Lean rounds
     are therefore configured with carrying = LEAN_CLASS_PRESET carrying x SPEED (10).
     Setup cost is per batch, not per minute, and stays unscaled; the window is as given.
     PILOT_SMOKE=1        a quick end-to-end check: ONE Lean class, one team per persona,
                          window 60 s unless PILOT_WINDOW says otherwise.

   Each class: reset; configure rounds 1 and 2 (Lean: LEAN_CLASS_PRESET plus the
   window; Classic: defaults); start the bot engine on round 1 with startRound.
   The SAME engine keeps running while the script ends round 1 and starts round 2:
   the bots read the active round on every loop and keep their per-round batch
   caps by round id, and team assignments live on the users, so nobody re-seats. */
import { writeFileSync } from 'node:fs';
import { createClient } from '../../services/shared/client';
import { BotEngine, CAP_REACHED, realDelay } from '../../services/bots/engine';
import { personaSequence, type PersonaId } from '../../services/bots/personas';
import type { EngineStatus } from '../../services/bots/protocol';
import { LEAN_CLASS_PRESET, leanConfigToBody } from '../../services/leanMode';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import type { ConfigRequest } from '../../types/api';
import { markdown, type PilotMode, type PilotRound, type RunResult, type TeamRow } from './report';

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (/azurecontainerapps\.io/i.test(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the pilot against ${BE}: it resets all game data. Use the local backend.`);
}
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const INSTRUCTOR = process.env.PILOT_INSTRUCTOR ?? 'Local Instructor';
const SMOKE = process.env.PILOT_SMOKE === '1';
const WINDOW = Number(process.env.PILOT_WINDOW ?? (SMOKE ? 60 : 180));
if (!Number.isInteger(WINDOW) || WINDOW < 1) throw new Error(`PILOT_WINDOW must be a positive integer, got ${process.env.PILOT_WINDOW}`);
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-lean-pilot.md`;

const COUNTS: Record<PersonaId, number> = SMOKE
  ? { CAREFUL: 1, BALANCED: 1, SPRAY: 1, LEARNER: 1 }
  : { CAREFUL: 3, BALANCED: 3, SPRAY: 3, LEARNER: 3 };
// Alternating, to spread any drift in the backend over both modes.
const PLAN: Array<{ mode: PilotMode; rep: number }> = SMOKE
  ? [{ mode: 'LEAN', rep: 1 }]
  : [{ mode: 'CLASSIC', rep: 1 }, { mode: 'LEAN', rep: 1 }, { mode: 'CLASSIC', rep: 2 }, { mode: 'LEAN', rep: 2 }];
const SPEED = 10 as const;
const POLL_MS = 5_000;
const MAX_ROUND_MS = 8 * 60_000;
const SETTLE_MS = 15_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ideal = { ...DEFAULT_IDEAL_PROFILE } as ConfigRequest['ideal_profile'];

function configFor(mode: PilotMode, round: PilotRound): ConfigRequest {
  if (mode === 'CLASSIC') return leanConfigToBody({ marketMode: 'CLASSIC' });
  const preset = LEAN_CLASS_PRESET[round];
  return leanConfigToBody({
    ...preset, arrivalWindowSeconds: WINDOW,
    carryingCostPerJokeMinute: (preset.carryingCostPerJokeMinute ?? 0) * SPEED,
  });
}

/** The report's settings section. */
const SETTINGS: string[] = [
  `Backend ${BE}; bots at ${SPEED}x; ${Object.entries(COUNTS).map(([p, n]) => `${n} ${p}`).join(', ')} per class${SMOKE ? ' (PILOT_SMOKE)' : ''}.`,
  ...([1, 2] as const).map(r => {
    const c = configFor('LEAN', r);
    return `Lean R${r}: setup $${c.setup_cost_per_batch} per batch, carrying $${c.carrying_cost_per_joke_minute} per joke-minute, `
      + `WIP limit ${c.wip_limit || 'none'}, arrival window ${c.arrival_window_seconds}s.`;
  }),
  `Carrying scaled ×${SPEED} to match bot speed (the backend charges per wall-clock minute); setup cost unscaled.`,
  'Bot rounds are capped by jokes (8 × batch_size), not batches, so small-batch personas are not penalised.',
];

async function runClass(mode: PilotMode, rep: number): Promise<RunResult[]> {
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
  const results: RunResult[] = [];
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
  return results;
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
    published: r.published_jokes, unsold: r.unsold_jokes, setup: r.lean?.setup_cost ?? 0, carrying: r.lean?.carrying_cost ?? 0,
    leadTimeS: r.lean?.avg_submit_to_publish_s ?? 0, saleTimeS: r.lean?.avg_publish_to_first_sale_s ?? 0, rank: r.rank,
  }));
  await instructor.instructorEnd(roundId);
  const durationS = Math.round((Date.now() - t0) / 1000);
  console.log(`  R${round} ended after ${durationS}s`);
  return { mode, rep, round, durationS, calls: final.classificationCalls - calls0, rows };
}

const results: RunResult[] = [];
const t0 = Date.now();
for (const step of PLAN) {
  results.push(...(await runClass(step.mode, step.rep)));
  writeFileSync(OUT, markdown(results, TODAY, SETTINGS));
  console.log(`wrote ${OUT}`);
}
console.log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
