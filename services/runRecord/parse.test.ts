import { describe, expect, it } from 'vitest';
import { addRecords, MAX_RECORD_BYTES, MAX_RUNS, parseRunRecord, type LoadedRun } from './parse';
import { buildRunRecord } from './build';
import type { RunRecord, RunRound, RunTeam } from './types';

const team = (id: number, over: Partial<RunTeam> = {}): RunTeam => ({
  team_id: id, team: `Team ${id}`, profit: id * 1.5, sold: 3, released: 5, made: 6, never_sold: 1, discarded: 0,
  fees: { listing: 0.5, hosting: 0.1, shipping: 0, storage: 0, discard: 0, total: 0.6 },
  sent_to_released_s: 20, to_first_sale_s: 12, ...over,
});

const round = (n: 1 | 2): RunRound => ({
  round: n, round_id: 40 + n, status: 'ENDED', started_at: null, ended_at: null,
  settings: { market_mode: 'LEAN', batch_size: 5 }, teams: [team(1), team(2)],
});

const record = (name = 'Run A', exportedAt = '2026-11-20T15:00:00Z'): RunRecord =>
  buildRunRecord({ name, playedBy: 'students', exportedAt }, [round(1), round(2)]);

const file = (rec: RunRecord, fileName = `${rec.name}.json`) => ({ fileName, text: JSON.stringify(rec) });

describe('parseRunRecord', () => {
  it('round-trips a built record', () => {
    const rec = record();
    const res = parseRunRecord(JSON.stringify(rec));
    expect(res).toEqual({ ok: true, record: rec });
  });

  it('keeps unknown extra keys', () => {
    const rec = { ...record(), extra: { a: 1 } };
    const res = parseRunRecord(JSON.stringify(rec));
    expect(res.ok && (res.record as unknown as { extra: unknown }).extra).toEqual({ a: 1 });
  });

  it('refuses a file over 5 MB', () => {
    expect(parseRunRecord('x'.repeat(MAX_RECORD_BYTES + 1))).toEqual({ ok: false, reason: 'is larger than 5 MB' });
  });

  it('refuses text that is not JSON', () => {
    expect(parseRunRecord('{')).toEqual({ ok: false, reason: 'is not JSON' });
  });

  it.each([
    ['a different format', '{"format":"x"}'],
    ['no format', '{}'],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
  ])('refuses %s', (_l, text) => {
    expect(parseRunRecord(text)).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses empty rounds', () => {
    expect(parseRunRecord(JSON.stringify({ ...record(), rounds: [] }))).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses a round that is not 1 or 2', () => {
    const rec = record();
    const bad = { ...rec, rounds: [{ ...rec.rounds[0], round: 3 }] };
    expect(parseRunRecord(JSON.stringify(bad))).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses a team whose profit is not a number', () => {
    const rec = record();
    const bad = { ...rec, rounds: [{ ...rec.rounds[0], teams: [{ ...rec.rounds[0].teams[0], profit: '4' }] }] };
    expect(parseRunRecord(JSON.stringify(bad))).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses a team without a fees object', () => {
    const rec = record();
    const { fees: _fees, ...noFees } = rec.rounds[0].teams[0];
    const bad = { ...rec, rounds: [{ ...rec.rounds[0], teams: [noFees] }] };
    expect(parseRunRecord(JSON.stringify(bad))).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses a team whose fees total is not a number', () => {
    const rec = record();
    const t = rec.rounds[0].teams[0];
    const bad = { ...rec, rounds: [{ ...rec.rounds[0], teams: [{ ...t, fees: { ...t.fees, total: '0.6' } }] }] };
    expect(parseRunRecord(JSON.stringify(bad))).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses a round without settings', () => {
    const rec = record();
    const { settings: _settings, ...noSettings } = rec.rounds[0];
    const bad = { ...rec, rounds: [noSettings] };
    expect(parseRunRecord(JSON.stringify(bad))).toEqual({ ok: false, reason: 'is not a Joke Factory run record' });
  });

  it('refuses a newer version and names it', () => {
    const res = parseRunRecord(JSON.stringify({ ...record(), version: 2 }));
    expect(res).toEqual({ ok: false, reason: 'was saved by a newer version of the game (version 2)' });
  });
});

describe('addRecords', () => {
  it('adds two good files', () => {
    const { runs, refused } = addRecords([], [file(record('A')), file(record('B'))]);
    expect(runs.map(r => r.fileName)).toEqual(['A.json', 'B.json']);
    expect(refused).toEqual([]);
  });

  it('keeps what was already loaded, first', () => {
    const first = addRecords([], [file(record('A'))]).runs;
    const { runs } = addRecords(first, [file(record('B'))]);
    expect(runs.map(r => r.record.name)).toEqual(['A', 'B']);
  });

  it('refuses the same record twice in one call', () => {
    const rec = record();
    const { runs, refused } = addRecords([], [file(rec, 'one.json'), file(rec, 'two.json')]);
    expect(runs).toHaveLength(1);
    expect(refused).toEqual([{ fileName: 'two.json', reason: 'is already loaded' }]);
  });

  it('refuses a record already loaded', () => {
    const loaded = addRecords([], [file(record())]).runs;
    const { runs, refused } = addRecords(loaded, [file(record(), 'again.json')]);
    expect(runs).toHaveLength(1);
    expect(refused).toEqual([{ fileName: 'again.json', reason: 'is already loaded' }]);
  });

  it('treats the same name with a different export time as a new run', () => {
    const { runs, refused } = addRecords([], [file(record('A', 't1'), 'a1.json'), file(record('A', 't2'), 'a2.json')]);
    expect(runs).toHaveLength(2);
    expect(refused).toEqual([]);
  });

  it('stops at six runs and refuses the extras', () => {
    const current: LoadedRun[] = [1, 2, 3, 4, 5].map(i => ({ fileName: `c${i}.json`, record: record(`C${i}`) }));
    const { runs, refused } = addRecords(current, [file(record('N1')), file(record('N2')), file(record('N3'))]);
    expect(runs).toHaveLength(MAX_RUNS);
    expect(refused).toEqual([
      { fileName: 'N2.json', reason: 'was not added: Compare shows at most 6 runs' },
      { fileName: 'N3.json', reason: 'was not added: Compare shows at most 6 runs' },
    ]);
  });

  it('adds a good file that follows a refused one, naming the refused file', () => {
    const { runs, refused } = addRecords([], [file(record('A')), { fileName: 'junk.json', text: '{' }, file(record('B'))]);
    expect(runs.map(r => r.fileName)).toEqual(['A.json', 'B.json']);
    expect(refused).toEqual([{ fileName: 'junk.json', reason: 'is not JSON' }]);
  });

  it('does not change the list it was given', () => {
    const current: LoadedRun[] = [];
    addRecords(current, [file(record())]);
    expect(current).toEqual([]);
  });
});
