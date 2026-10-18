import { describe, expect, it, vi } from 'vitest';
import Instructor from './Instructor';
import { ControlBar, type ControlBarProps } from '../components/instructor/ControlBar';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role } from '../types';
import { leanConfigFromRound } from '../services/leanMode';
import { DEFAULT_IDEAL_PROFILE } from '../config/dimensions';

// Instructor reads window.location.search while rendering (the bot panel switch).
vi.stubGlobal('window', { location: { search: '' } });

const instructor = testUser(Role.INSTRUCTOR, null);

describe('Instructor screen, one Lean rule set', () => {
  it('shows the fee settings and the batch-size rule, and no market mode, preset or WIP limit', () => {
    const out = renderWithGame(Instructor, { user: instructor });
    expect(out).toContain('Shipping fee (1–4 / 5 / 6–10 jokes):');
    expect(out).toContain('Storage fee per joke-minute:');
    expect(out).toContain('Hosting fee per joke-minute:');
    expect(out).toContain('R1 batch: 5 (exactly)');
    expect(out).toContain('R2 batch: up to 10');
    for (const gone of ['Market mode', 'Lean class preset', 'WIP limit', 'Setup cost', 'Carrying cost', 'R1 Batch Size']) {
      expect(out).not.toContain(gone);
    }
  });

  it('lets the instructor edit the fees between rounds, and greys them out once the selected round has started', () => {
    const between = { ...TEST_CONFIG, isActive: false };
    const open = renderWithGame(Instructor, { user: instructor, config: between, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(open).not.toMatch(/id="cfg-storage-fee"[^>]*disabled=""/);
    const locked = renderWithGame(Instructor, { user: instructor, config: between, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' } });
    expect(locked).toMatch(/id="cfg-storage-fee"[^>]*disabled=""/);
    expect(locked).toContain('title="Lean settings lock once the round starts"');
  });

  it('shows customers per team with the team-count hint, and greys it out once the selected round has started', () => {
    const between = { ...TEST_CONFIG, isActive: false };
    const roster = [1, 2, 3].flatMap(t => [testUser(Role.JOKE_MAKER, t), testUser(Role.QUALITY_CONTROL, t)])
      .map((u, i) => ({ ...u, id: String(i + 10), user_id: i + 10 }));
    const open = renderWithGame(Instructor, { user: instructor, config: between, roster, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(open).toContain('Customers per team:');
    expect(open).toContain('≈ 54 customers for 3 teams');
    expect(open).not.toMatch(/id="cfg-customers-per-team"[^>]*disabled=""/);
    const locked = renderWithGame(Instructor, { user: instructor, config: between, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' } });
    expect(locked).toMatch(/id="cfg-customers-per-team"[^>]*disabled=""/);
  });

  it('shows the stored customers per team (12 from the round) in CONFIG', () => {
    const stored = { ...TEST_CONFIG, isActive: false, ...leanConfigFromRound({ market_mode: 'LEAN', customers_per_team: 12 }) };
    const out = renderWithGame(Instructor, { user: instructor, config: stored, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(out).toMatch(/id="cfg-customers-per-team"[^>]*value="12"/);
  });

  it('shows the stored customer budget in the CONFIG row', () => {
    const out = renderWithGame(Instructor, { user: instructor, config: { ...TEST_CONFIG, isActive: false, customerBudget: 3 }, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(out).toMatch(/Cust\. Budget:<\/label><input[^>]*value="3"/);
  });

  it('says inline why shipping fees that fall with batch size cannot be applied', () => {
    const between = { ...TEST_CONFIG, isActive: false, shippingFeeSmall: 4 };
    const out = renderWithGame(Instructor, { user: instructor, config: between, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(out).toContain('Shipping fees must rise with batch size: 1–4 jokes ≤ 5 jokes ≤ 6–10 jokes.');
    const ok = renderWithGame(Instructor, { user: instructor, config: { ...TEST_CONFIG, isActive: false }, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(ok).not.toContain('Shipping fees must rise');
  });
});

/* POST /start on an ENDED round answers 409 "round already ended"
   (usecase/instructor.go): a round cannot be resumed, so the control bar offers
   Start only while the round it would start is CONFIGURED. There is no pause. */
describe('Instructor screen, the control bar', () => {
  const stopped = { ...TEST_CONFIG, isActive: false };
  // An ended Round 1 has Lean stats; without them the page falls back to the Classic charts.
  const r1Stats = {
    round_id: 1,
    leaderboard: [{
      rank: 1, team: { id: 1, name: 'Team 1' }, points: 0, total_sales: 0, unsold_jokes: 0, discarded_jokes: 0,
      batches_processed: 0, profit: 0, total_jokes: 0, published_jokes: 0,
      lean: { batches_submitted: 0, setup_cost: 0, carrying_cost: 0, avg_submit_to_publish_s: 0, avg_publish_to_first_sale_s: 0, batch_series: [] },
    }],
  };
  const startButton = (n: number) => new RegExp(`<button[^>]*>(?:(?!</button>).)*Start Round ${n}(?:(?!</button>).)*</button>`, 's');

  it('between rounds: the status sentence, the teammates switch, Start Round 2 and no Resume', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, round: 2 }, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' }, instructorStatsRound1: r1Stats,
    });
    expect(out).toContain('Round 1 is over');
    expect(out).toContain('Show students their teammates, then start Round 2 when the room is ready.');
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*role="switch"/);
    expect(out).toContain('Show students their teammates</label>');
    expect(out).toMatch(startButton(2));
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Start Round 2/s);
    expect(out).not.toContain('Resume');
    expect(out).toMatch(/Round 1<small[^>]*>ended<\/small>/);
    expect(out).toMatch(/Round 2<small[^>]*>not started<\/small>/);
  });

  it('while Round 1 runs: the teams playing and when customers stop arriving (900 s reads 15:00)', () => {
    const roster = [1, 2].flatMap(t => [testUser(Role.JOKE_MAKER, t), testUser(Role.QUALITY_CONTROL, t)])
      .map((u, i) => ({ ...u, id: String(i + 10), user_id: i + 10 }));
    const out = renderWithGame(Instructor, {
      user: instructor, roster, config: { ...TEST_CONFIG, arrivalWindowSeconds: 900 }, roundStatuses: { 1: 'ACTIVE', 2: 'CONFIGURED' },
    });
    expect(out).toContain('Round 1 is running');
    expect(out).toContain('2 teams playing. Customers stop arriving at 15:00; end the round around then.');
    expect(out).toContain('End Round 1');
    expect(out).not.toMatch(startButton(1));
    expect(out).not.toContain('Resume');
    expect(out).not.toContain('Pause');
  });

  it('in the lobby: Start Round 1 and the arrival window in minutes', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, arrivalWindowSeconds: 900 }, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
    });
    expect(out).toContain('Seat every pair, check the setup, then start. Customers arrive over 15 minutes from Start.');
    expect(out).toMatch(startButton(1));
  });

  it('once both rounds have ended: Open debrief and no Start', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, round: 2 }, roundStatuses: { 1: 'ENDED', 2: 'ENDED' },
      instructorStatsRound2: { round_id: 2, leaderboard: [] },
    });
    expect(out).toContain('Both rounds ended. Open Debrief to compare the rounds.');
    expect(out).toContain('Open debrief');
    expect(out).not.toMatch(startButton(1));
    expect(out).not.toMatch(startButton(2));
    expect(out).not.toContain('Resume');
  });

  it('keeps the Round 2 segment disabled until Round 2 has started', () => {
    const before = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, round: 2 }, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' }, instructorStatsRound1: r1Stats,
    });
    expect(before).toMatch(/<button[^>]*disabled=""[^>]*>Round 2<small/);
    const running = renderWithGame(Instructor, {
      user: instructor, config: { ...TEST_CONFIG, round: 2 }, roundStatuses: { 1: 'ENDED', 2: 'ACTIVE' },
    });
    expect(running).not.toMatch(/<button[^>]*disabled=""[^>]*>Round 2<small/);
    expect(running).toMatch(/Round 2<small[^>]*>running<\/small>/);
  });
});

/* The control bar is hook-free, so the test calls it and walks the element tree
   to press its buttons (renderToStaticMarkup cannot click). */
describe('ControlBar, the round control views and never retargets', () => {
  type El = { type: unknown; props: Record<string, any> };
  const textOf = (n: any): string =>
    n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n)
      : Array.isArray(n) ? n.map(textOf).join('') : textOf(n.props?.children);
  const buttons = (n: any, acc: El[] = []): El[] => {
    if (Array.isArray(n)) n.forEach(c => buttons(c, acc));
    else if (n && typeof n === 'object' && 'props' in n) {
      if (n.type === 'button') acc.push(n);
      buttons(n.props.children, acc);
    }
    return acc;
  };
  const props = (over: Partial<ControlBarProps> = {}): ControlBarProps => ({
    statuses: { 1: 'ENDED', 2: 'CONFIGURED' }, viewRound: 1, onViewRound: vi.fn(),
    arrivalWindowSeconds: 900, teamsPlaying: 3, showTeammates: false, onShowTeammates: vi.fn(),
    onStart: vi.fn(), onEnd: vi.fn(), onOpenDebrief: vi.fn(), ...over,
  });

  it('pressing Round 1 changes the viewed round only, and Start still targets Round 2', () => {
    const p = props({ statuses: { 1: 'ENDED', 2: 'ACTIVE' }, viewRound: 2 });
    const r1 = buttons(ControlBar(p)).find(b => textOf(b).startsWith('Round 1'))!;
    r1.props.onClick();
    expect(p.onViewRound).toHaveBeenCalledWith(1);
    expect(p.onStart).not.toHaveBeenCalled();
    expect(p.onEnd).not.toHaveBeenCalled();

    const between = props({ viewRound: 1 });
    const labels = buttons(ControlBar(between)).map(textOf);
    expect(labels).toContain('Start Round 2');
    expect(labels).not.toContain('Start Round 1');
  });

  it('End Round asks the parent to confirm for both rounds', () => {
    for (const statuses of [{ 1: 'ACTIVE', 2: 'CONFIGURED' }, { 1: 'ENDED', 2: 'ACTIVE' }] as const) {
      const p = props({ statuses });
      const end = buttons(ControlBar(p)).find(b => textOf(b).startsWith('End Round'))!;
      end.props.onClick();
      expect(p.onEnd).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Instructor screen, the Live Market', () => {
  const item = (id: number, text = `Joke ${id}`) => ({
    joke_id: id, joke_text: text, joke_title: `Title ${id}`, team_id: 1, team_name: 'Team 1', sold_count: 0,
  });

  it('pages 20 jokes at a time and offers Show more past 180 characters', () => {
    const items = [item(1, 'x'.repeat(181)), ...Array.from({ length: 20 }, (_, i) => item(i + 2))];
    const out = renderWithGame(Instructor, { user: instructor, marketItems: items });
    expect(out).toContain('Page 1 / 2');
    expect(out).toContain('Title 21');
    expect(out).not.toContain('Title 1<');
    const long = renderWithGame(Instructor, { user: instructor, marketItems: [item(1, 'x'.repeat(181))] });
    expect(long).toContain('Show more');
    expect(long).not.toContain('Page ');
  });
});

describe('Instructor screen, the hidden ideal joke', () => {
  const between = { ...TEST_CONFIG, isActive: false };
  it('shows the stored ideal in the picker (Topic Animals selected)', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
      config: { ...between, idealProfile: { ...DEFAULT_IDEAL_PROFILE, TOPIC: 'Animals' } },
    });
    expect(out).toMatch(/<option value="Animals" selected="">Animals<\/option>/);
    expect(out).not.toMatch(/<option value="Work" selected="">/);
  });
});
