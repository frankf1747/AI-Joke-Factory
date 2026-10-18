import { describe, expect, it, vi } from 'vitest';
import Instructor from './Instructor';
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
   (usecase/instructor.go): a round cannot be resumed, so the control offers
   Start only while the selected round is CONFIGURED. */
describe('Instructor screen, the Start control', () => {
  const stopped = { ...TEST_CONFIG, isActive: false };
  const r2Stats = { round_id: 2, leaderboard: [] };
  const startButton = /<button[^>]*>(?:(?!<\/button>).)*Start<\/button>/s;

  it('offers Start when the selected round is CONFIGURED', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, round: 2 }, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' },
    });
    expect(out).toMatch(startButton);
    expect(out).not.toContain('Resume');
  });

  it('offers no Start or Resume once Round 2 has ended, only a disabled Ended', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, round: 2 }, roundStatuses: { 1: 'ENDED', 2: 'ENDED' },
      instructorStatsRound2: r2Stats,
    });
    expect(out).not.toContain('Resume');
    expect(out).not.toMatch(startButton);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Ended<\/button>/);
  });

  it('offers no Start once Round 1 has ended while Round 1 is selected', () => {
    const out = renderWithGame(Instructor, {
      user: instructor, config: { ...stopped, round: 1 }, roundStatuses: { 1: 'ENDED', 2: 'CONFIGURED' },
    });
    expect(out).not.toMatch(startButton);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Ended<\/button>/);
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
