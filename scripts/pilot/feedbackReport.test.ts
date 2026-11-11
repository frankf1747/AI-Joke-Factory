import { describe, expect, it } from 'vitest';
import { DEFAULT_IDEAL_PROFILE } from '../../config/dimensions';
import { indexTraitCorpus, traitFit } from '../../services/shared/traitCorpus';
import { loadTraitCorpus } from '../traits/loadTraitCorpus';
import {
  CUSTOMERS_BAR, GROUPS, MIN_ABOVE_BAR_JOKES, MIN_SOLD_SHARE, batchFits, chooseDefaults, classTeams, finishClass, markdown,
  money, overLongNote, parsePilotEnv, pilotConfig, settingsLines, successChecks, summariseGroup, sweepCost, sweepMarkdown,
  teamProblems, teamRowFrom, traitEvidence, traitModeError, usableClasses,
  type BatchFit, type ClassResult, type Costs, type GroupId, type PilotSidecar, type RoundResult, type TeamRow,
} from './feedbackReport';
import { classMinuteLimit, classMinutesOf } from './report';

const corpus = loadTraitCorpus();
const index = indexTraitCorpus(corpus);

describe('classTeams', () => {
  it('is 20 Balanced teams, 5 per group, every no-feedback team the twin of a feedback team', () => {
    const teams = classTeams();
    expect(teams).toHaveLength(20);
    expect(teams.map(t => t.index)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const g of GROUPS) expect(teams.filter(t => t.group === g.id)).toHaveLength(5);
    for (const t of teams) {
      expect(t).toMatchObject({ persona: 'BALANCED', releaseAll: true });
      expect(t.round2BatchSize).toBe(t.group.startsWith('SMALL') ? 3 : 10);
      expect(t.useFeedback).toBe(t.group.endsWith('_ON'));
    }
    for (const off of teams.filter(t => !t.useFeedback)) {
      const twin = teams.find(t => t.index === off.deckIndex);
      expect(twin?.useFeedback).toBe(true);
      expect(twin?.round2BatchSize).toBe(off.round2BatchSize);
    }
  });
});

describe('pilotConfig', () => {
  it('charges the two costs only: listing unscaled, hosting × speed; batches of 5, then up to 10', () => {
    expect(pilotConfig({ listing: 0.25, hosting: 0.05 }, 10, 90, 1)).toEqual({
      market_mode: 'LEAN', arrival_window_seconds: 90, wip_limit: 0, batch_size: 5,
      cost_of_publishing: 0.25, cost_of_discard: 0, hosting_fee_per_joke_minute: 0.5,
      shipping_fee_small: 0, shipping_fee_standard: 0, shipping_fee_large: 0, storage_fee_per_joke_minute: 0,
    });
    expect(pilotConfig({ listing: 0.1, hosting: 0.2 }, 10, 90, 2)).toMatchObject({ batch_size: 10, hosting_fee_per_joke_minute: 2 });
  });
});

describe('batchFits', () => {
  const good = corpus.jokes.find(j => traitFit(j, DEFAULT_IDEAL_PROFILE) >= CUSTOMERS_BAR)!;
  const bad = corpus.jokes.find(j => traitFit(j, DEFAULT_IDEAL_PROFILE) < 6)!;
  it('scores each batch\'s released corpus jokes in send order, and marks the batches that clear the bar', () => {
    const fits = batchFits([
      { batch_id: 9, submitted_at: '2026-11-10T10:02:00Z', jokes: [{ joke_text: good.text, publish_status: 'PUBLISHED' }, { joke_text: bad.text, publish_status: 'PUBLISHED' }] },
      { batch_id: 4, submitted_at: '2026-11-10T10:01:00Z', jokes: [{ joke_text: bad.text, publish_status: 'PUBLISHED' }, { joke_text: good.text, publish_status: 'DISCARDED' }] },
      { batch_id: 11, submitted_at: '2026-11-10T10:03:00Z', jokes: null },
      { batch_id: 12, submitted_at: '2026-11-10T10:04:00Z', jokes: [{ joke_text: 'not a corpus joke', publish_status: 'PUBLISHED' }] },
    ], index, DEFAULT_IDEAL_PROFILE);
    const fb = traitFit(bad, DEFAULT_IDEAL_PROFILE);
    const fg = traitFit(good, DEFAULT_IDEAL_PROFILE);
    expect(fits).toEqual([
      { seq: 1, released: 1, meanFit: fb, aboveBar: 0, cleared: false },
      { seq: 2, released: 2, meanFit: (fb + fg) / 2, aboveBar: 1, cleared: true },
      { seq: 3, released: 0, meanFit: null, aboveBar: 0, cleared: false },
      { seq: 4, released: 0, meanFit: null, aboveBar: 0, cleared: false },
    ]);
  });
});

describe('teamRowFrom', () => {
  it('prices listing at the round, reads hosting from the Lean stats, averages send → first sale over sold batches', () => {
    const row = teamRowFrom(
      {
        team: { id: 7 }, total_sales: 12, published_jokes: 20, discarded_jokes: 0, profit: 5.5,
        lean: { batches_submitted: 4, setup_cost: 0, carrying_cost: 4.5, shipping_cost: 0, storage_cost: 0, hosting_cost: 4.5, avg_submit_to_publish_s: 0, avg_publish_to_first_sale_s: 0, batch_series: [] },
      },
      'SMALL_ON', { market_price: 1, cost_of_publishing: 0.1, cost_of_discard: 0 },
      [{ first_sale_s: 60 }, { first_sale_s: null }, { first_sale_s: 120 }], [],
    );
    expect(row).toMatchObject({ teamId: 7, group: 'SMALL_ON', revenue: 12, listing: 2, hosting: 4.5, otherFees: 0, profit: 5.5, sendToFirstSaleS: 90 });
  });
});

/* ---- Synthetic classes for the checks ------------------------------------ */

const batch = (seq: number, meanFit: number | null, cleared = false): BatchFit => ({
  seq, released: meanFit == null ? 0 : 3, meanFit, aboveBar: cleared ? 1 : 0, cleared,
});
const team = (group: GroupId, profit: number, fits: Array<number | null>, clearAt: number | null, over: Partial<TeamRow> = {}): TeamRow => ({
  teamId: 1, group, revenue: 20, listing: 2, hosting: 4, otherFees: 0, profit, sales: 20,
  batches: fits.map((f, i) => batch(i + 1, f, clearAt === i + 1)), sendToFirstSaleS: 60, ...over,
});

/** A class where feedback works, gradually, and pays most for small batches. */
function goodClass(): ClassResult {
  const r1 = GROUPS.map(g => team(g.id, 5, [5, 5, 5], null, { revenue: 20, listing: 4, hosting: 6 }));
  const r2 = [
    team('SMALL_ON', 30, [5, 5, 7, 9, 10], 4), team('SMALL_OFF', -4, [5, 5, 5, 5, 5], null),
    team('LARGE_ON', 6, [5, 5, 6, 7], 3), team('LARGE_OFF', 3, [5, 5, 5, 5], null),
  ];
  return { classNo: 1, seed: 's-c1', rounds: [{ round: 1, durationS: 94, rows: r1 }, { round: 2, durationS: 94, rows: r2 }] };
}

describe('successChecks', () => {
  it('passes all five on a class where feedback works, gradually, and pays most for small batches', () => {
    expect(successChecks([goodClass()]).map(c => [c.id, c.pass])).toEqual([[1, true], [2, true], [3, true], [4, true], [5, true]]);
  });

  it('fails check 1 when the no-feedback twins rise too, or the feedback teams do not', () => {
    const c = goodClass();
    c.rounds[1].rows[1] = team('SMALL_OFF', -4, [5, 7], null);
    expect(successChecks([c])[0].pass).toBe(false);
  });

  it('fails checks 2 and 3 when the twins earn more, and when large batches gain more', () => {
    const c = goodClass();
    c.rounds[1].rows[0] = team('SMALL_ON', -10, [5, 5, 7, 9], 4);
    const checks = successChecks([c]);
    expect(checks[1].pass).toBe(false);
    expect(checks[2].pass).toBe(false);
    expect(checks[2].detail).toContain('small -$6.00, large $3.00');
  });

  it('fails check 4 when feedback solves it in one or two batches, or never', () => {
    const fast = goodClass();
    fast.rounds[1].rows[0] = team('SMALL_ON', 30, [9, 10], 1);
    fast.rounds[1].rows[2] = team('LARGE_ON', 6, [5, 9], 2);
    expect(successChecks([fast])[3].pass).toBe(false);
    const never = goodClass();
    never.rounds[1].rows[0] = team('SMALL_ON', 30, [5, 5], null);
    never.rounds[1].rows[2] = team('LARGE_ON', 6, [5, 5], null);
    expect(successChecks([never])[3]).toMatchObject({ pass: false, detail: expect.stringContaining('no feedback team cleared') });
  });

  it('fails check 5 when fewer than about half finish Round 2 in profit, or Round 1 fees are outside 40–60 % of revenue', () => {
    const losing = goodClass();
    losing.rounds[1].rows = losing.rounds[1].rows.map((r, i) => (i === 0 ? r : { ...r, profit: -1 }));
    expect(successChecks([losing])[4].pass).toBe(false);
    const cheap = goodClass();
    cheap.rounds[0].rows = cheap.rounds[0].rows.map(r => ({ ...r, listing: 1, hosting: 1 }));
    expect(successChecks([cheap])[4]).toMatchObject({ pass: false, detail: expect.stringContaining('10 % of revenue') });
  });
});

describe('summariseGroup', () => {
  it('gives the learning curve by batch number, batches to clear, and the share of released jokes over the bar', () => {
    const s = summariseGroup([team('SMALL_ON', 10, [5, 7, 9], 3), team('SMALL_ON', 20, [6, 8], 2)]);
    expect(s.curve).toEqual([5.5, 7.5, 9]);
    expect(s.batchesToClear).toBe(2.5);
    expect(s.shareAboveBar).toBeCloseTo(2 / 15);
    expect(s.profit).toBe(15);
  });
});

const sidecar = (costs: Costs, cls = goodClass()): PilotSidecar => ({
  date: '2026-11-10', costs, settings: ['One class.'], classes: [cls], errors: [],
});

describe('markdown', () => {
  it('leads with the five checks, then each round\'s groups and learning curves', () => {
    const md = markdown(sidecar({ listing: 0.1, hosting: 0.05 }));
    expect(md).toContain('# Feedback pilot — listing $0.10, hosting $0.05 per joke-minute — 2026-11-10');
    expect(md.match(/^- \*\*PASS\*\* — [1-5]\./gm)).toHaveLength(5);
    for (const h of ['## Settings', '## Round 1', '## Round 2', '| Small + feedback |', '| Large, no feedback |', '| B5 |']) {
      expect(md).toContain(h);
    }
    expect(md.indexOf('## Success checks')).toBeLessThan(md.indexOf('## Round 1'));
  });
});

describe('the sweep', () => {
  it('orders settings by a joke listed and unsold for the 15-minute window', () => {
    expect(sweepCost({ listing: 0.1, hosting: 0.05 })).toBeCloseTo(0.85);
    expect(sweepCost({ listing: 0.5, hosting: 0.05 })).toBeLessThan(sweepCost({ listing: 0.1, hosting: 0.1 }));
  });

  it('chooses the cheapest setting that passes checks 2, 3 and 5, whatever checks 1 and 4 say', () => {
    const pass = successChecks([goodClass()]);
    const fail5 = pass.map(c => (c.id === 5 ? { ...c, pass: false } : c));
    const fail4 = pass.map(c => (c.id === 4 ? { ...c, pass: false } : c));
    expect(chooseDefaults([
      { costs: { listing: 0.1, hosting: 0.05 }, checks: fail5 },
      { costs: { listing: 0.25, hosting: 0.1 }, checks: pass },
      { costs: { listing: 0.1, hosting: 0.1 }, checks: fail4 },
    ])).toEqual({ listing: 0.1, hosting: 0.1 });
    expect(chooseDefaults([{ costs: { listing: 0.1, hosting: 0.05 }, checks: fail5 }])).toBeNull();
  });

  it('renders the grid, the chosen defaults and that setting in full', () => {
    const md = sweepMarkdown({
      date: '2026-11-10', settings: ['Grid.'],
      runs: [sidecar({ listing: 0.1, hosting: 0.05 }), sidecar({ listing: 0.25, hosting: 0.05 })],
    });
    expect(md).toContain('# Cost sweep — 2026-11-10');
    expect(md).toContain('**Chosen defaults:** listing $0.10 per joke, hosting $0.05 per joke-minute');
    expect(md).toContain('| $0.25 | $0.05 | PASS | PASS | PASS | PASS | PASS |');
    expect(md).toContain('### Round 2');
    expect(md).toContain('feedback_joke_count');
  });

  it('says so when no setting passes', () => {
    const losing = goodClass();
    losing.rounds[1].rows = losing.rounds[1].rows.map(r => ({ ...r, profit: -1 }));
    const md = sweepMarkdown({ date: '2026-11-10', settings: [], runs: [sidecar({ listing: 0.1, hosting: 0.05 }, losing)] });
    expect(md).toContain('**No setting passes checks 2, 3 and 5**');
  });
});

describe('parsePilotEnv', () => {
  it('defaults to the starting costs, 3 classes, a 90 s window, 5 pairs per size and a fresh seed', () => {
    expect(parsePilotEnv({}, 42)).toEqual({
      costs: { listing: 0.1, hosting: 0.05 }, window: 90, classes: 3, perGroup: 5, seed: 'feedback-42', tag: undefined,
    });
  });

  it('reads overrides and refuses bad values', () => {
    expect(parsePilotEnv({ PILOT_LISTING: '0.25', PILOT_HOSTING: '0.2', PILOT_CLASSES: '1', PILOT_SEED: ' s ', PILOT_TAG: 'x' }, 0))
      .toMatchObject({ costs: { listing: 0.25, hosting: 0.2 }, classes: 1, seed: 's', tag: 'x' });
    expect(() => parsePilotEnv({ PILOT_HOSTING: '-1' })).toThrow(/PILOT_HOSTING/);
    expect(() => parsePilotEnv({ PILOT_CLASSES: '1.5' })).toThrow(/PILOT_CLASSES/);
  });
});

/* ---- Failed, over-long and under-sampled classes ------------------------- */

/** goodClass with its rounds timed: a 94 s round at 10× is 15.7 class minutes, 110 s is 18.3 (limit 16). */
const timed = (durationS: number, classNo = 1): ClassResult => {
  const c = goodClass();
  c.classNo = classNo;
  for (const r of c.rounds) {
    r.durationS = durationS;
    r.classMinutes = classMinutesOf(durationS, 10);
    r.maxClassMinutes = classMinuteLimit(90, 4, 10);
  }
  return c;
};

describe('over-long rounds', () => {
  it('notes a round that ran longer than window + settle + slack, and only that', () => {
    const [ok, over] = [timed(94), timed(110)];
    expect(overLongNote(1, ok.rounds[0])).toBeNull();
    expect(overLongNote(1, over.rounds[1])).toContain('class 1 round 2 ran 18.3 class minutes, longer than 16');
    const untimed: RoundResult = { round: 1, durationS: 500, rows: [] };
    expect(overLongNote(1, untimed)).toBeNull();
  });

  it('finishClass records the note in the class errors and excludes the class', () => {
    const over = finishClass(timed(110, 2));
    expect(over.excluded).toBe(true);
    expect(over.errors).toHaveLength(2);
    expect(finishClass(timed(94)).excluded).toBeFalsy();
    expect(usableClasses([timed(94), over])).toHaveLength(1);
  });

  it('leaves an excluded class out of the averages, the checks and the class count', () => {
    const bad = finishClass(timed(110, 2));
    bad.rounds[1].rows = bad.rounds[1].rows.map(r => ({ ...r, profit: -100 }));
    expect(successChecks([timed(94), bad])).toEqual(successChecks([timed(94)]));
    const side = { ...sidecar({ listing: 0.1, hosting: 0.05 }, timed(94)), classes: [timed(94), bad], requested: 2 };
    const md = markdown(side);
    expect(md).toContain('Classes counted: 1 of 2 requested; 1 excluded (a round ran over its limit).');
    expect(md).toContain('## Errors');
    expect(md).toContain('class 2 round 1 ran 18.3 class minutes, longer than 16');
    expect(md).toContain('Means per team over 1 class.');
  });
});

describe('the sweep with failed and under-sampled settings', () => {
  const run = (costs: Costs, ran: number, requested: number, errors: string[] = []): PilotSidecar => ({
    date: '2026-11-10', costs, settings: [], requested, errors,
    classes: Array.from({ length: ran }, (_, i) => timed(94, i + 1)),
  });

  it('shows ran/requested per setting and each setting\'s errors', () => {
    const md = sweepMarkdown({
      date: '2026-11-10', settings: [],
      runs: [run({ listing: 0.1, hosting: 0.05 }, 1, 3, ['class 2 (listing $0.1, hosting $0.05): boom']), run({ listing: 0.25, hosting: 0.05 }, 3, 3)],
    });
    expect(md).toContain('| $0.10 | $0.05 | PASS | PASS | PASS | PASS | PASS | 1/3 |');
    expect(md).toContain('| $0.25 | $0.05 | PASS | PASS | PASS | PASS | PASS | 3/3 |');
    expect(md).toContain('## Errors');
    expect(md).toContain('- listing $0.10, hosting $0.05: class 2 (listing $0.1, hosting $0.05): boom');
  });

  it('never chooses a setting that ran fewer classes than requested, and says so', () => {
    const md = sweepMarkdown({
      date: '2026-11-10', settings: [],
      runs: [run({ listing: 0.1, hosting: 0.05 }, 1, 3), run({ listing: 0.25, hosting: 0.05 }, 3, 3)],
    });
    expect(md).toContain('**Chosen defaults:** listing $0.25 per joke');
    expect(md).toContain('**Not eligible** (fewer classes ran than requested): listing $0.10, hosting $0.05 (1 of 3)');
    const none = sweepMarkdown({ date: '2026-11-10', settings: [], runs: [run({ listing: 0.1, hosting: 0.05 }, 2, 3)] });
    expect(none).toContain('**No setting passes checks 2, 3 and 5**');
    expect(none).toContain('**Not eligible**');
  });

  it('counts an over-long class as not run', () => {
    const r = run({ listing: 0.1, hosting: 0.05 }, 2, 2);
    r.classes[1] = finishClass(timed(110, 2));
    const md = sweepMarkdown({ date: '2026-11-10', settings: [], runs: [r] });
    expect(md).toContain('| 1/2 |');
    expect(md).toContain('**No setting passes checks 2, 3 and 5**');
    expect(md).toContain('class 2 round 1 ran 18.3 class minutes');
  });

  it('chooseDefaults skips a setting with ran below expected, and accepts one without counts', () => {
    const pass = successChecks([goodClass()]);
    expect(chooseDefaults([
      { costs: { listing: 0.1, hosting: 0.05 }, checks: pass, ran: 2, expected: 3 },
      { costs: { listing: 0.5, hosting: 0.2 }, checks: pass, ran: 3, expected: 3 },
    ])).toEqual({ listing: 0.5, hosting: 0.2 });
    expect(chooseDefaults([{ costs: { listing: 0.1, hosting: 0.05 }, checks: pass }])).toEqual({ listing: 0.1, hosting: 0.05 });
  });
});

describe('checks 2 and 3 with an empty group', () => {
  it('fail with a detail when there are no feedback teams, no twins, or a size is missing', () => {
    const noTwins = goodClass();
    noTwins.rounds[1].rows = noTwins.rounds[1].rows.filter(r => !r.group.endsWith('_OFF'));
    const a = successChecks([noTwins]);
    expect(a[1]).toMatchObject({ pass: false, detail: expect.stringContaining('no no-feedback teams') });
    expect(a[2]).toMatchObject({ pass: false, detail: expect.stringContaining('Small, no feedback') });

    const noLarge = goodClass();
    noLarge.rounds[1].rows = noLarge.rounds[1].rows.filter(r => !r.group.startsWith('LARGE'));
    const b = successChecks([noLarge]);
    expect(b[1].pass).toBe(true);
    expect(b[2]).toMatchObject({ pass: false, detail: expect.stringContaining('Large + feedback') });

    const none = successChecks([{ classNo: 1, seed: 's', rounds: [] }]);
    expect(none[1]).toMatchObject({ pass: false, detail: expect.stringContaining('no feedback teams') });
    expect(none[2].pass).toBe(false);
  });
});

describe('teamProblems', () => {
  const seat = (userId: number | null, error: string | null = null) => ({ userId, error });
  it('names teams without an id or a leaderboard row, and every seat error', () => {
    const problems = teamProblems(2, [
      { index: 1, teamId: 11, jm: seat(5), marketing: seat(6) },
      { index: 2, teamId: null, jm: seat(null), marketing: seat(null) },
      { index: 3, teamId: 13, jm: seat(7), marketing: seat(8) },
      { index: 4, teamId: 14, jm: seat(9, 'HTTP 500'), marketing: seat(10, 'locked') },
    ], id => id !== 13);
    expect(problems).toEqual([
      'round 2 team 2 skipped: it never got a team id',
      'round 2 team 3 skipped: no leaderboard row',
      'round 2 team 4 Joke Maker seat error: HTTP 500',
      'round 2 team 4 Marketing seat error: locked',
    ]);
    expect(teamProblems(1, [{ index: 1, teamId: 1, jm: seat(null), marketing: seat(2) }], () => true))
      .toEqual(['round 1 team 1 skipped: its Joke Maker seat has no user']);
  });
});

describe('the trait-classifier sanity check', () => {
  const good = corpus.jokes.find(j => traitFit(j, DEFAULT_IDEAL_PROFILE) >= CUSTOMERS_BAR)!;
  const bad = corpus.jokes.find(j => traitFit(j, DEFAULT_IDEAL_PROFILE) < 6)!;
  const batchOf = (id: number, jokes: Array<{ text: string; sold: boolean; status?: string }>) => ({
    batch_id: id, submitted_at: '2026-11-10T10:00:00Z',
    jokes: jokes.map(j => ({ joke_text: j.text, publish_status: j.status ?? 'PUBLISHED', first_sold_at: j.sold ? '2026-11-10T10:00:30Z' : null })),
  });

  it('counts released corpus jokes over the bar and how many of them sold', () => {
    const e = traitEvidence([
      batchOf(1, [{ text: good.text, sold: true }, { text: good.text, sold: false }, { text: bad.text, sold: true }]),
      batchOf(2, [{ text: good.text, sold: true, status: 'DISCARDED' }, { text: 'not a corpus joke', sold: true }]),
    ], index, DEFAULT_IDEAL_PROFILE);
    expect(e).toEqual({ aboveBar: 2, sold: 1 });
  });

  it('refuses a stack where over-the-bar jokes hardly ever sell, and accepts one where they do', () => {
    expect(MIN_SOLD_SHARE).toBe(0.25);
    expect(traitModeError({ aboveBar: 20, sold: 1 })).toMatch(/APP_LLM_MODE=traits.*1 of 20.*5 %/);
    expect(traitModeError({ aboveBar: 20, sold: 5 })).toBeNull();
    expect(traitModeError({ aboveBar: 20, sold: 12 })).toBeNull();
  });

  it('cannot tell on too few over-the-bar jokes, and does not guess', () => {
    expect(traitModeError({ aboveBar: MIN_ABOVE_BAR_JOKES - 1, sold: 0 })).toBeNull();
    expect(traitModeError({ aboveBar: MIN_ABOVE_BAR_JOKES, sold: 0 })).not.toBeNull();
  });
});

describe('money in the settings lines', () => {
  it('prints two decimals', () => {
    expect(money(0.5)).toBe('$0.50');
    const lines = settingsLines(parsePilotEnv({ PILOT_LISTING: '0.5', PILOT_HOSTING: '0.1' }, 1), 10).join('\n');
    expect(lines).toContain('listing $0.50 per released joke, hosting $0.10 per joke-minute (sent ×10, $1.00,');
  });
});
