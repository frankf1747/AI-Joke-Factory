import { describe, expect, it, vi } from 'vitest';
import Instructor from './Instructor';
import { TEST_CONFIG, renderWithGame, testUser } from './testing/renderWithGame';
import { Role } from '../types';

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
