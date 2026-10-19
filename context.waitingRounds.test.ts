import { describe, expect, it } from 'vitest';
import { roundStateFromActive } from './context';

/* The student poll reads /rounds/active for unassigned pairs too, so the waiting room's
   andon and its "Round n starts" step follow the live round. Both paths share this helper. */
describe('roundStateFromActive', () => {
  it('reads both statuses and times from the active-round payload', () => {
    const s = roundStateFromActive({
      rounds: [
        { id: 11, round_number: 1, status: 'ENDED', started_at: '2026-10-19T10:00:00Z', ended_at: '2026-10-19T10:20:00Z' },
        { id: 12, round_number: 2, status: 'ACTIVE', started_at: '2026-10-19T10:30:00Z' },
      ],
    } as any);
    expect(s.statuses).toEqual({ 1: 'ENDED', 2: 'ACTIVE' });
    expect(s.times[1].startedAt).toBe(Date.parse('2026-10-19T10:00:00Z'));
    expect(s.times[1].endedAt).toBe(Date.parse('2026-10-19T10:20:00Z'));
    expect(s.times[2].endedAt).toBeNull();
    expect(s.rounds).toHaveLength(2);
  });

  it('accepts the wrapped { data: { rounds } } shape and an empty payload', () => {
    expect(roundStateFromActive({ data: { rounds: [{ round_number: 1, status: 'ACTIVE' }] } } as any).statuses)
      .toEqual({ 1: 'ACTIVE', 2: null });
    expect(roundStateFromActive({} as any).statuses).toEqual({ 1: null, 2: null });
  });
});
