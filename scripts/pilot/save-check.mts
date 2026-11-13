/* Runs the Debrief "Save run record" code path against a real local game (the last class a pilot
   played), with no browser: the same reads the dialog makes (stats, config, lean charts, lobby),
   the same playing-team filter and collectRunRecord, then the two files it would download.
   Each file is then read back with parseRunRecord, as the Compare tab does.

   Usage (password read from the backend's .env, never printed):
     E2E_ADMIN_PASSWORD="$(grep '^APP_ADMIN_PASSWORD=' ~/Documents/GitHub/jokefactory_be/.env | cut -d= -f2-)" \
       npx tsx scripts/pilot/save-check.mts <out-dir> [name]
   Read-only against the backend: it resets nothing. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '../../services/shared/client';
import { memberedTeamIds, playingStats } from '../../services/playingTeams';
import { collectRunRecord, roundInputs, savableRounds, savedFiles } from '../../services/runRecord/saveRun';
import { parseRunRecord } from '../../services/runRecord/parse';
import type { RunBot } from '../../services/runRecord/types';
import type { LeaderboardRow } from '../../services/classTotals';
import type { FeeRates } from '../../services/shownFees';
import { isLocalUrl } from './report';

// The Debrief's fallback rates; collectRunRecord prices with the fetched config's fees first.
const ZERO_RATES: FeeRates = {
  costOfPublishing: 0, costOfDiscard: 0, shippingFeeSmall: 0, shippingFeeStandard: 0,
  shippingFeeLarge: 0, storageFeePerJokeMinute: 0, hostingFeePerJokeMinute: 0,
};

const BE = process.env.E2E_BE_URL ?? 'http://localhost:8081';
if (!isLocalUrl(BE)) throw new Error(`save-check reads a local backend only, got ${BE}`);
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('E2E_ADMIN_PASSWORD not set');
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: save-check.mts <out-dir> [name]');
const NAME = process.argv[3] ?? 'Save check from Debrief';

const api = createClient({ baseUrl: BE });
const login = await api.instructorLogin({ display_name: 'Local Instructor', password: PASSWORD });
const ins = api.as(login.user.user_id, 'instructor');
const rounds = (await api.roundsActive()).rounds;
const ids = { 1: rounds.find(r => r.round_number === 1)?.id ?? null, 2: rounds.find(r => r.round_number === 2)?.id ?? null };
const statuses = { 1: rounds.find(r => r.round_number === 1)?.status ?? null, 2: rounds.find(r => r.round_number === 2)?.status ?? null };
const which = savableRounds(statuses);
console.log(`rounds ${JSON.stringify(ids)} statuses ${JSON.stringify(statuses)} -> saving ${JSON.stringify(which)}`);
if (which.length === 0) throw new Error('Round 1 has not ended: the button would be disabled');

const stats: Record<1 | 2, { leaderboard: LeaderboardRow[] } | null> = { 1: null, 2: null };
for (const r of which) {
  const id = ids[r] as number;
  // The raw lobby is PascalCase; the app maps it to { teams: [{ team, members }] } first.
  const raw = await ins.instructorLobby(id);
  const membered = memberedTeamIds({ teams: (raw.Teams ?? []).map(t => ({ team: { id: t.Team.id }, members: t.Members })) } as never);
  stats[r] = playingStats(await ins.instructorStats(id) as never, membered) as never;
}
const inputs = roundInputs(which, ids, stats, { 1: ZERO_RATES, 2: ZERO_RATES });
const record = await collectRunRecord(
  { name: NAME, notes: 'Saved by scripts/pilot/save-check.mts', playedBy: 'bots', now: new Date(), rounds: inputs, teamNames: {}, bots: new Map<number, RunBot>() },
  { getConfig: id => ins.instructorGetConfig(id) as never, getCharts: id => ins.instructorLeanCharts(id) },
);
const files = savedFiles(NAME, record);
mkdirSync(OUT, { recursive: true });
for (const f of [files.json, files.csv]) writeFileSync(join(OUT, f.fileName), f.text);
const back = parseRunRecord(files.json.text);
console.log(`wrote ${files.json.fileName} and ${files.csv.fileName} to ${OUT}`);
console.log(back.ok
  ? `parse: ok, ${back.record.rounds.length} round(s), ${back.record.rounds.map(r => `${r.teams.length} teams, ${Object.keys(r.settings).length} settings`).join(' / ')}`
  : `parse: REFUSED ${back.reason}`);
