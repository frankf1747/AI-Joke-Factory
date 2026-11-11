/* Runs the feedback comparison (spec docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §5)
   at ONE setting of the two costs against a local backend: PILOT_CLASSES classes
   (default 3) of 20 bot teams each, Round 1 then Round 2, and writes the report
   (scripts/pilot/feedbackReport.ts markdown) plus its JSON sidecar.

   Usage (password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/feedback-pilot.mts docs/pilots/<date>-feedback-pilot.md

   The stack MUST run the trait classifier (APP_LLM_MODE=traits with
   APP_LLM_HASH_CONFIRM=local-pilot-only): the bots write trait-corpus jokes and
   the pilot reads their fit from the corpus.

   Environment:
     E2E_ADMIN_PASSWORD   required (not for PILOT_RENDER_ONLY).
     E2E_BE_URL           default http://localhost:8081; only localhost, 127.0.0.1 and [::1]
                          unless PILOT_ALLOW_REMOTE=1 (every class starts with an admin reset).
     PILOT_RENDER_ONLY    a sidecar from an earlier run: re-render its markdown (to the output
                          path, default the sidecar's with .md) and exit. No backend, no password.
     PILOT_INSTRUCTOR     instructor display name, default "Local Instructor".
     PILOT_LISTING, PILOT_HOSTING, PILOT_CLASSES, PILOT_WINDOW, PILOT_PER_GROUP, PILOT_SEED, PILOT_TAG
                          see feedbackReport.ts parsePilotEnv. */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTraitCorpus } from '../traits/loadTraitCorpus';
import { isLocalUrl } from './report';
import { runSetting } from './feedbackClass';
import { markdown, parsePilotEnv, type PilotSidecar } from './feedbackReport';

const RENDER_ONLY = process.env.PILOT_RENDER_ONLY;
if (RENDER_ONLY) {
  const side = JSON.parse(readFileSync(RENDER_ONLY, 'utf8')) as PilotSidecar;
  const out = process.argv[2] ?? `${RENDER_ONLY.replace(/\.json$/, '')}.md`;
  writeFileSync(out, markdown(side));
  console.log(`rendered ${out} from ${RENDER_ONLY}`);
  process.exit(0);
}

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the pilot against ${BE}: it resets all game data. Use the local backend.`);
}
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const env = parsePilotEnv(process.env);
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-feedback-pilot.md`;
const SIDECAR = `${OUT.replace(/\.md$/, '')}.json`;

const t0 = Date.now();
const side = await runSetting(
  { baseUrl: BE, password: PASSWORD, instructor: process.env.PILOT_INSTRUCTOR ?? 'Local Instructor', corpus: loadTraitCorpus(), log: l => console.log(l) },
  env, env.costs, TODAY,
  // After every class, so a stopped pilot keeps what it ran.
  partial => { writeFileSync(SIDECAR, JSON.stringify(partial, null, 2)); writeFileSync(OUT, markdown(partial)); },
);
writeFileSync(SIDECAR, JSON.stringify(side, null, 2));
writeFileSync(OUT, markdown(side));
console.log(`wrote ${OUT} and ${SIDECAR} in ${Math.round((Date.now() - t0) / 1000)} s`);
