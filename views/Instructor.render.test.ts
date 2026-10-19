import { createElement, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Instructor, { type ScreenTab } from './Instructor';
import { ControlBar, type ControlBarProps } from '../components/instructor/ControlBar';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role } from '../types';
import { leanConfigFromRound } from '../services/leanMode';
import { DEFAULT_IDEAL_PROFILE } from '../config/dimensions';
import { TeamsBoard, TeamsTab, type TeamsBoardProps } from '../components/instructor/TeamsTab';
import { seatedTeams } from '../services/teamSeats';
import type { InstructorLobby } from '../types';

// Instructor reads window.location.search while rendering (the bot panel switch).
vi.stubGlobal('window', { location: { search: '' } });

const instructor = testUser(Role.INSTRUCTOR, null);
/** The Instructor screen opened on one tab (renderToStaticMarkup cannot click a tab). */
const onTab = (initialTab: ScreenTab) => () => createElement(Instructor, { initialTab });

describe('Instructor screen, one Lean rule set (Setup tab)', () => {
  it('shows the fee settings and the batch-size rule, and no market mode, preset or WIP limit', () => {
    const out = renderWithGame(onTab('setup'), { user: instructor });
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
    const open = renderWithGame(onTab('setup'), { user: instructor, config: between, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(open).not.toMatch(/id="cfg-storage-fee"[^>]*disabled=""/);
    const locked = renderWithGame(onTab('setup'), { user: instructor, config: between, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' } });
    expect(locked).toMatch(/id="cfg-storage-fee"[^>]*disabled=""/);
    expect(locked).toContain('title="Lean settings lock once the round starts"');
  });

  it('shows customers per team with the team-count hint, and greys it out once the selected round has started', () => {
    const between = { ...TEST_CONFIG, isActive: false };
    const roster = [1, 2, 3].flatMap(t => [testUser(Role.JOKE_MAKER, t), testUser(Role.QUALITY_CONTROL, t)])
      .map((u, i) => ({ ...u, id: String(i + 10), user_id: i + 10 }));
    const open = renderWithGame(onTab('setup'), { user: instructor, config: between, roster, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(open).toContain('Customers per team:');
    expect(open).toContain('≈ 54 customers for 3 teams');
    expect(open).not.toMatch(/id="cfg-customers-per-team"[^>]*disabled=""/);
    const locked = renderWithGame(onTab('setup'), { user: instructor, config: between, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' } });
    expect(locked).toMatch(/id="cfg-customers-per-team"[^>]*disabled=""/);
  });

  it('shows the stored customers per team (12 from the round) in CONFIG', () => {
    const stored = { ...TEST_CONFIG, isActive: false, ...leanConfigFromRound({ market_mode: 'LEAN', customers_per_team: 12 }) };
    const out = renderWithGame(onTab('setup'), { user: instructor, config: stored, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(out).toMatch(/id="cfg-customers-per-team"[^>]*value="12"/);
  });

  it('shows the stored customer budget in the CONFIG row', () => {
    const out = renderWithGame(onTab('setup'), { user: instructor, config: { ...TEST_CONFIG, isActive: false, customerBudget: 3 }, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(out).toMatch(/Cust\. Budget:<\/label><input[^>]*value="3"/);
  });

  it('says inline why shipping fees that fall with batch size cannot be applied', () => {
    const between = { ...TEST_CONFIG, isActive: false, shippingFeeSmall: 4 };
    const out = renderWithGame(onTab('setup'), { user: instructor, config: between, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
    expect(out).toContain('Shipping fees must rise with batch size: 1–4 jokes ≤ 5 jokes ≤ 6–10 jokes.');
    const ok = renderWithGame(onTab('setup'), { user: instructor, config: { ...TEST_CONFIG, isActive: false }, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' } });
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

describe('Instructor screen, the hidden ideal joke (Setup tab)', () => {
  const between = { ...TEST_CONFIG, isActive: false };
  it('shows the stored ideal in the picker (Topic Animals selected)', () => {
    const out = renderWithGame(onTab('setup'), {
      user: instructor, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
      config: { ...between, idealProfile: { ...DEFAULT_IDEAL_PROFILE, TOPIC: 'Animals' } },
    });
    expect(out).toMatch(/<option value="Animals" selected="">Animals<\/option>/);
    expect(out).not.toMatch(/<option value="Work" selected="">/);
  });
});

/* Four tabs under the control bar; the one open by default follows the phase
   (spec 6b): Teams in the lobby, Live during and between rounds, Debrief after Round 2. */
describe('Instructor screen, the tabs', () => {
  const stopped = { ...TEST_CONFIG, isActive: false };
  const selectedTab = (out: string) => out.match(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>([^<]*)</)?.[1];

  it('shows Live, Teams, Setup and Debrief as tabs in a tablist', () => {
    const out = renderWithGame(Instructor, { user: instructor });
    expect(out).toMatch(/role="tablist"/);
    const labels = [...out.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)</g)].map(m => m[1]);
    expect(labels).toEqual(['Live', 'Teams', 'Setup', 'Debrief']);
  });

  it('opens on Teams in the lobby, Live while a round runs or between rounds, and Debrief once both rounds ended', () => {
    const cases = [
      [{ 1: 'CONFIGURED', 2: 'CONFIGURED' }, 'Teams'],
      [{ 1: 'ACTIVE', 2: 'CONFIGURED' }, 'Live'],
      [{ 1: 'ENDED', 2: 'CONFIGURED' }, 'Live'],
      [{ 1: 'ENDED', 2: 'ACTIVE' }, 'Live'],
      [{ 1: 'ENDED', 2: 'ENDED' }, 'Debrief'],
    ] as const;
    for (const [roundStatuses, tab] of cases) {
      const out = renderWithGame(Instructor, { user: instructor, config: stopped, roundStatuses: { ...roundStatuses } });
      expect(selectedTab(out)).toBe(tab);
    }
  });

  it('commits no tab while both round statuses are still unknown (a reload before the first poll)', () => {
    const out = renderWithGame(Instructor, { user: instructor, config: stopped, roundStatuses: { 1: null, 2: null } });
    expect(selectedTab(out)).toBeUndefined();
    expect(out).not.toContain('Auto-assign');
    expect(out).toContain('Waiting for the round status.');
  });

  it('shows only the open tab: the settings on Setup, the leaderboard on Live, the team cards on Teams', () => {
    const live = renderWithGame(Instructor, { user: instructor, roundStatuses: { 1: 'ACTIVE', 2: 'CONFIGURED' } });
    expect(live).toContain('Live market');
    expect(live).not.toContain('Storage fee per joke-minute:');
    expect(live).not.toContain('Auto-assign');
    const setup = renderWithGame(onTab('setup'), { user: instructor });
    expect(selectedTab(setup)).toBe('Setup');
    expect(setup).toContain('Storage fee per joke-minute:');
    expect(setup).toContain('Reset game');
    expect(setup).not.toContain('Live market');
    const teams = renderWithGame(onTab('teams'), { user: instructor });
    expect(teams).toContain('Auto-assign');
    expect(teams).not.toContain('Live market');
  });
});

/* The Teams tab (spec 6b, 7.4): the lobby strip, one card per real team with a
   Joke Maker slot and a Marketing slot, the safe swap and an honest Auto-assign. */
describe('Instructor screen, the Teams tab', () => {
  const lobby: InstructorLobby = {
    round_id: 1,
    summary: { waiting: 4, assigned: 2, dropped: 0, team_count: 2 },
    teams: [
      { team: { id: 3, name: 'Team 3' }, members: [
        { user_id: 12, display_name: 'ama_kenji', role: 'JM' },
        { user_id: 13, display_name: 'noor_ben', role: 'MARKETING' },
      ] },
      { team: { id: 4, name: 'Team 4' }, members: [] },
    ],
    customers: [],
    unassigned: [20, 21, 22, 23].map(id => ({ user_id: id, display_name: `kim${id}_lee${id}`, status: 'WAITING' as const })),
  };
  const teamsTab = (over: Partial<ComponentProps<typeof TeamsTab>> = {}) => () => createElement(TeamsTab, over);
  const render = (over: Partial<ComponentProps<typeof TeamsTab>> = {}, l: InstructorLobby = lobby) =>
    renderWithGame(teamsTab(over), { user: instructor, instructorLobby: l });

  it('shows the lobby strip: the waiting count and Auto-assign for everyone, floor((4 + 2) / 2) = 3 teams', () => {
    const out = render();
    expect(out).toContain('Lobby: 4 pairs waiting');
    expect(out).toContain('Auto-assign 3 teams');
    expect(out).toContain('Kim20 and Lee20');
  });

  it('draws only real teams, with a Joke Maker and a Marketing slot, and no team id', () => {
    const out = render();
    expect(out).toContain('value="Team 3"');
    expect(out).not.toContain('Team 4');
    expect(out).not.toContain('ID:');
    expect(out).toContain('Joke Maker');
    expect(out).toContain('Marketing');
    expect(out).toContain('Ama and Kenji');
    expect(out).toContain('in this browser only');
  });

  it('turns Auto-assign off while either round runs, and keeps it in the lobby and between rounds', () => {
    const autoAssign = (out: string) => out.match(/<button([^>]*)>Auto-assign 3 teams<\/button>/)?.[1] ?? '';
    for (const roundStatuses of [{ 1: 'ACTIVE', 2: 'CONFIGURED' }, { 1: 'ENDED', 2: 'ACTIVE' }] as const) {
      const out = renderWithGame(teamsTab(), { user: instructor, instructorLobby: lobby, roundStatuses: { ...roundStatuses } });
      expect(autoAssign(out)).toContain('disabled=""');
      expect(out).toContain('Auto-assign is off while a round runs. Drag pairs to move them.');
    }
    for (const roundStatuses of [{ 1: 'CONFIGURED', 2: 'CONFIGURED' }, { 1: 'ENDED', 2: 'CONFIGURED' }] as const) {
      const out = renderWithGame(teamsTab(), { user: instructor, instructorLobby: lobby, roundStatuses: { ...roundStatuses } });
      expect(autoAssign(out)).not.toContain('disabled=""');
      expect(out).not.toContain('Auto-assign is off');
    }
  });

  it('gives each team name its own label', () => {
    expect(render()).toContain('aria-label="Name of Team 3"');
  });

  it('asks "This reshuffles every team." before Auto-assign reshuffles existing teams', () => {
    expect(render({ initialConfirm: { kind: 'reshuffle' } })).toContain('This reshuffles every team.');
    expect(render()).not.toContain('This reshuffles every team.');
  });

  it('confirms a removal in the modal', () => {
    const out = render({ initialConfirm: { kind: 'remove', userId: 13, name: 'Noor and Ben' } });
    expect(out).toContain('Remove Noor and Ben?');
  });

  /* The board is hook-free, so the test calls it and walks its element tree to
     press buttons and drop pairs (renderToStaticMarkup cannot). */
  type El = { type: unknown; props: Record<string, any> };
  const walk = (n: any, pick: (el: El) => boolean, acc: El[] = []): El[] => {
    if (Array.isArray(n)) n.forEach(c => walk(c, pick, acc));
    else if (n && typeof n === 'object' && 'props' in n) {
      if (pick(n)) acc.push(n);
      walk(n.props.children, pick, acc);
    }
    return acc;
  };
  const boardProps = (over: Partial<TeamsBoardProps> = {}): TeamsBoardProps => ({
    teams: seatedTeams(lobby, {}), waiting: lobby.unassigned.map(u => ({ userId: u.user_id, name: u.display_name })),
    waitingCount: 4, autoAssignTeams: 3, totalPairs: 6, roundRunning: false, busyTeams: [], dropKey: null,
    onDropKey: vi.fn(), onRename: vi.fn(), onAutoAssign: vi.fn(), onConfirm: vi.fn(), onMove: vi.fn(), onExchange: vi.fn(), onSwap: vi.fn(),
    ...over,
  });

  it('Auto-assign with teams on the board asks first and does not assign', () => {
    const p = boardProps();
    const btn = walk(TeamsBoard(p), el => el.type === 'button' && String(el.props.children).startsWith('Auto-assign'))[0];
    btn.props.onClick();
    expect(p.onConfirm).toHaveBeenCalledWith({ kind: 'reshuffle' });
    expect(p.onAutoAssign).not.toHaveBeenCalled();
    const fresh = boardProps({ teams: [] });
    walk(TeamsBoard(fresh), el => el.type === 'button' && String(el.props.children).startsWith('Auto-assign'))[0].props.onClick();
    expect(fresh.onAutoAssign).toHaveBeenCalledTimes(1);
  });

  it('× asks the modal to confirm, never window.confirm', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { location: { search: '' }, confirm });
    const p = boardProps();
    const x = walk(TeamsBoard(p), el => el.type === 'button' && el.props['aria-label'] === 'Remove Ama and Kenji')[0];
    x.props.onClick({ preventDefault() {}, stopPropagation() {} });
    expect(p.onConfirm).toHaveBeenCalledWith({ kind: 'remove', userId: 12, name: 'Ama and Kenji' });
    expect(confirm).not.toHaveBeenCalled();
    vi.stubGlobal('window', { location: { search: '' } });
  });

  it('dropping a waiting pair into the open Marketing slot PATCHes role MARKETING on that team', () => {
    const jmOnly: InstructorLobby = { ...lobby, teams: [{ ...lobby.teams[0], members: [lobby.teams[0].members[0]] }] };
    const p = boardProps({ teams: seatedTeams(jmOnly, {}) });
    const slot = walk(TeamsBoard(p), el => el.props['data-seat'] === 'MARKETING' && el.props['data-team'] === 3)[0];
    slot.props.onDrop({ preventDefault() {}, dataTransfer: { getData: () => '20' } });
    expect(p.onMove).toHaveBeenCalledWith(20, { status: 'ASSIGNED', role: 'MARKETING', team_id: 3 });
  });

  it('dropping a waiting pair onto an occupied slot trades it with the occupant', () => {
    const p = boardProps();
    const slot = walk(TeamsBoard(p), el => el.props['data-seat'] === 'JM' && el.props['data-team'] === 3)[0];
    slot.props.onDrop({ preventDefault() {}, dataTransfer: { getData: () => '20' } });
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onExchange).toHaveBeenCalledWith(
      { userId: 20, body: { status: 'ASSIGNED', role: 'JM', team_id: 3 }, undo: { status: 'WAITING', team_id: null } },
      { userId: 12, body: { status: 'WAITING', team_id: null } },
    );
  });

  it('a drag leaving into a child of the slot keeps the highlight', () => {
    const p = boardProps({ dropKey: '3:JM' });
    const slot = walk(TeamsBoard(p), el => el.props['data-seat'] === 'JM' && el.props['data-team'] === 3)[0];
    slot.props.onDragLeave({ currentTarget: { contains: () => true }, relatedTarget: {} });
    expect(p.onDropKey).not.toHaveBeenCalled();
    slot.props.onDragLeave({ currentTarget: { contains: () => false }, relatedTarget: null });
    expect(p.onDropKey).toHaveBeenCalledWith(null);
  });

  it('⇄ swaps the team\'s two roles through onSwap', () => {
    const p = boardProps();
    const sw = walk(TeamsBoard(p), el => el.type === 'button' && el.props['aria-label'] === 'Switch roles in Team 3')[0];
    sw.props.onClick({ preventDefault() {}, stopPropagation() {} });
    expect(p.onSwap).toHaveBeenCalledWith(3);
  });
});
