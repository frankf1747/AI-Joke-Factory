/* Reading a run record back in, and the list of runs Compare holds
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md). Pure: no DOM, no I/O. */
import { RUN_RECORD_FORMAT, RUN_RECORD_VERSION, type RunRecord } from './types';

export const MAX_RECORD_BYTES = 5_000_000;
export const MAX_RUNS = 6;

export type ParseResult = { ok: true; record: RunRecord } | { ok: false; reason: string };

const NOT_A_RECORD = 'is not a Joke Factory run record';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Only what Compare reads is checked; unknown extra keys are kept as they are. */
function looksLikeRecord(v: unknown): boolean {
  if (!isObject(v) || v.format !== RUN_RECORD_FORMAT) return false;
  if (!Array.isArray(v.rounds) || v.rounds.length === 0) return false;
  return v.rounds.every(r =>
    isObject(r) && (r.round === 1 || r.round === 2) && isObject(r.settings) && Array.isArray(r.teams)
    && r.teams.every(t => isObject(t) && typeof t.profit === 'number'
      && isObject(t.fees) && typeof t.fees.total === 'number'));
}

export function parseRunRecord(text: string): ParseResult {
  if (text.length > MAX_RECORD_BYTES) return { ok: false, reason: 'is larger than 5 MB' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'is not JSON' };
  }
  if (!looksLikeRecord(data)) return { ok: false, reason: NOT_A_RECORD };
  const record = data as unknown as RunRecord;
  if (typeof record.version === 'number' && record.version > RUN_RECORD_VERSION) {
    return { ok: false, reason: `was saved by a newer version of the game (version ${record.version})` };
  }
  return { ok: true, record };
}

export interface LoadedRun { fileName: string; record: RunRecord }
export interface Refusal { fileName: string; reason: string }

const sameRun = (a: RunRecord, b: RunRecord) => a.name === b.name && a.exported_at === b.exported_at;

/** Appends parsed files to `current`, refusing bad files, duplicates and any past MAX_RUNS. */
export function addRecords(
  current: readonly LoadedRun[],
  files: ReadonlyArray<{ fileName: string; text: string }>,
): { runs: LoadedRun[]; refused: Refusal[] } {
  const runs = [...current];
  const refused: Refusal[] = [];
  for (const { fileName, text } of files) {
    const parsed = parseRunRecord(text);
    if (!parsed.ok) {
      refused.push({ fileName, reason: parsed.reason });
    } else if (runs.some(r => sameRun(r.record, parsed.record))) {
      refused.push({ fileName, reason: 'is already loaded' });
    } else if (runs.length >= MAX_RUNS) {
      refused.push({ fileName, reason: `was not added: Compare shows at most ${MAX_RUNS} runs` });
    } else {
      runs.push({ fileName, record: parsed.record });
    }
  }
  return { runs, refused };
}
