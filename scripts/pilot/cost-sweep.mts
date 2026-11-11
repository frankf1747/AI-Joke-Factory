/* The cost sweep (spec docs/superpowers/specs/2026-11-10-two-costs-feedback-bots-design.md §5):
   the feedback comparison at listing {$0.10, $0.25, $0.50} × hosting {$0.05,
   $0.10, $0.20} per joke-minute, PILOT_CLASSES classes each (default 3), against
   a local backend running the trait classifier. Writes the sweep report
   (feedbackReport.ts sweepMarkdown: every setting's five checks, the chosen
   defaults = the cheapest setting that passes checks 2, 3 and 5, and that
   setting's comparison in full) and its JSON sidecar, rewritten after every
   setting so a stopped sweep keeps what it ran. About 3.5 minutes per class:
   27 classes take about an hour and a half.

   Usage (password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/cost-sweep.mts docs/pilots/<date>-cost-sweep.md

   Environment: as feedback-pilot.mts (PILOT_LISTING and PILOT_HOSTING are
   ignored: the grid sets them). PILOT_RENDER_ONLY re-renders a sweep sidecar. */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTraitCorpus } from '../traits/loadTraitCorpus';
import { isLocalUrl } from './report';
import { runSetting, SPEED } from './feedbackClass';
import { SWEEP_HOSTING, SWEEP_LISTING, money, parsePilotEnv, settingsLines, sweepMarkdown, type SweepSidecar } from './feedbackReport';

const RENDER_ONLY = process.env.PILOT_RENDER_ONLY;
if (RENDER_ONLY) {
  const side = JSON.parse(readFileSync(RENDER_ONLY, 'utf8')) as SweepSidecar;
  const out = process.argv[2] ?? `${RENDER_ONLY.replace(/\.json$/, '')}.md`;
  writeFileSync(out, sweepMarkdown(side));
  console.log(`rendered ${out} from ${RENDER_ONLY}`);
  process.exit(0);
}

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE) && process.env.PILOT_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to run the sweep against ${BE}: it resets all game data. Use the local backend.`);
}
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const env = parsePilotEnv(process.env);
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = process.argv[2] ?? `docs/pilots/${TODAY}-cost-sweep.md`;
const SIDECAR = `${OUT.replace(/\.md$/, '')}.json`;
const base = {
  baseUrl: BE, password: PASSWORD, instructor: process.env.PILOT_INSTRUCTOR ?? 'Local Instructor',
  corpus: loadTraitCorpus(), log: (l: string) => console.log(l),
};

const sweep: SweepSidecar = {
  date: TODAY, tag: env.tag,
  // Every line but the costs, which the grid sets.
  settings: [...settingsLines(env, SPEED).filter(l => !l.startsWith('Costs')),
    `Grid: listing ${SWEEP_LISTING.map(money).join(' / ')} × hosting ${SWEEP_HOSTING.map(money).join(' / ')} per joke-minute.`],
  runs: [],
};
const t0 = Date.now();
for (const listing of SWEEP_LISTING) {
  for (const hosting of SWEEP_HOSTING) {
    console.log(`setting: listing $${listing}, hosting $${hosting}`);
    sweep.runs.push(await runSetting(base, { ...env, seed: `${env.seed}-L${listing}-H${hosting}` }, { listing, hosting }, TODAY));
    writeFileSync(SIDECAR, JSON.stringify(sweep, null, 2));
    writeFileSync(OUT, sweepMarkdown(sweep));
  }
}
console.log(`wrote ${OUT} and ${SIDECAR} in ${Math.round((Date.now() - t0) / 1000)} s`);
