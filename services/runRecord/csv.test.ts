import { describe, expect, it } from 'vitest';
import { csvCell, recordCsv } from './csv';
import { buildRunRecord } from './build';
import { SETTING_FIELDS, type RunRound, type RunTeam } from './types';

describe('csvCell', () => {
  it('writes null and undefined as empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
  it('writes numbers and booleans plainly, a negative number unprefixed', () => {
    expect(csvCell(-1.25)).toBe('-1.25');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(true)).toBe('true');
  });
  it('neutralises a string that starts a formula', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@a')).toBe("'@a");
  });
  it('quotes a cell with a comma, quote or line break and doubles quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });
  it('neutralises a string that starts with a tab or a carriage return', () => {
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('\r=1')).toBe('"\'\r=1"');
  });
  it('applies the formula prefix before quoting', () => {
    expect(csvCell('=a,b')).toBe('"\'=a,b"');
  });
});

const team = (id: number, over: Partial<RunTeam> = {}): RunTeam => ({
  team_id: id, team: `Team ${id}`, profit: 4.5, sold: 3, released: 5, made: 6, never_sold: 1, discarded: 0,
  fees: { listing: 0.5, hosting: 0.1, shipping: 0.2, storage: 0.3, discard: 0.4, total: 1.5 },
  sent_to_released_s: 20, to_first_sale_s: null, ...over,
});

const batch = (seq: number) => ({ seq, sent_s: seq, jokes: 5, released: 4, sold: 3, first_sale_s: null });

const round = (n: 1 | 2, teams: RunTeam[]): RunRound => ({
  round: n, round_id: n, status: 'ENDED', started_at: null, ended_at: null,
  settings: { market_mode: 'LEAN', batch_size: 5, cost_of_discard: 0 }, teams,
});

describe('recordCsv', () => {
  const rec = buildRunRecord({ name: 'Run, "A"', playedBy: 'mixed', exportedAt: 'x' }, [
    round(1, [team(1, { batches: [batch(1), batch(2), batch(3)] }), team(2, { never_sold: null, profit: -1.25 })]),
    round(2, [team(1), team(2)]),
  ]);
  const text = recordCsv(rec);
  const lines = text.split('\r\n');

  it('ends with CRLF and has a header plus one row per team per round', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('');
  });

  it('has the fixed columns then every setting key', () => {
    const fixed = 'run,played_by,round,team,profit,sold,released,made,never_sold,discarded,listing,hosting,shipping,storage,discard,fees_total,sent_to_released_s,to_first_sale_s,batches';
    expect(lines[0]).toBe([fixed, ...SETTING_FIELDS.map(([k]) => k)].join(','));
    expect(lines[0].startsWith('run,played_by,round,team,profit')).toBe(true);
    expect(lines[0].endsWith('cost_of_discard')).toBe(true);
  });

  it('writes a lean team with its batch count and settings, empty where unknown', () => {
    expect(lines[1].startsWith('"Run, ""A""",mixed,1,Team 1,4.5,3,5,6,1,0,0.5,0.1,0.2,0.3,0.4,1.5,20,,3,LEAN,5,')).toBe(true);
  });

  it('leaves null cells empty and keeps a negative profit unprefixed', () => {
    expect(lines[2]).toContain(',Team 2,-1.25,3,5,6,,0,');
  });

  it('leaves batches empty for a Classic team', () => {
    const classic = lines[3].split(',').slice(1); // the quoted run name splits into 2 pieces
    expect(classic[18]).toBe('');
    expect(classic[19]).toBe('LEAN');
  });

  it('writes a missing setting as an empty cell, so every row has the same width', () => {
    const width = lines[0].split(',').length;
    // the quoted run name adds 1 comma to the naive split
    for (const l of lines.slice(1, 5)) expect(l.split(',').length).toBe(width + 1);
  });

  it('prefixes a formula-looking team name, quotes it for its quote, and leaves a negative profit plain', () => {
    const evil = buildRunRecord({ name: 'R', playedBy: 'students', exportedAt: 'x' }, [
      round(1, [team(1, { team: '=HYPERLINK("x")', profit: -2.5 })]),
    ]);
    const row = recordCsv(evil).split('\r\n')[1];
    expect(row).toContain(',"\'=HYPERLINK(""x"")",-2.5,');
  });
});
