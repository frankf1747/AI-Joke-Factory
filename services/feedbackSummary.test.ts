import { describe, expect, it } from 'vitest';
import { summarizeFeedback } from './feedbackSummary';
import type { FeedbackRow } from '../views/feedback';

const d = (id: string) => ({ id, label: id.charAt(0) + id.slice(1).toLowerCase() });
const row = (joke_id: number, good: string[], improve: string[]): FeedbackRow => ({
  joke_id, joke_title: `J${joke_id}`, was_bought: false, good: good.map(d), improve: improve.map(d),
});

describe('summarizeFeedback', () => {
  it('is empty with no rows', () => {
    expect(summarizeFeedback([])).toEqual({ keep: [], fix: [] });
  });

  it('counts how many recent jokes each criterion landed or missed on', () => {
    const s = summarizeFeedback([
      row(1, ['LENGTH', 'TOPIC'], ['COMPLEXITY']),
      row(2, ['LENGTH'], ['COMPLEXITY', 'WORDPLAY']),
    ]);
    expect(s.keep).toEqual([{ id: 'LENGTH', label: 'Length', count: 2 }, { id: 'TOPIC', label: 'Topic', count: 1 }]);
    expect(s.fix).toEqual([{ id: 'COMPLEXITY', label: 'Complexity', count: 2 }, { id: 'WORDPLAY', label: 'Wordplay', count: 1 }]);
  });

  it('puts a criterion on the side it fell on more often; a tie goes to Fix next', () => {
    const s = summarizeFeedback([
      row(1, ['TOPIC', 'ENERGY'], ['CLARITY']),
      row(2, ['TOPIC'], ['ENERGY']),
      row(3, ['CLARITY'], ['TOPIC']),
    ]);
    // TOPIC landed 2, missed 1 → keep ×2. ENERGY 1–1 → fix ×1. CLARITY 1–1 → fix ×1.
    expect(s.keep).toEqual([{ id: 'TOPIC', label: 'Topic', count: 2 }]);
    expect(s.fix).toEqual([{ id: 'CLARITY', label: 'Clarity', count: 1 }, { id: 'ENERGY', label: 'Energy', count: 1 }]);
    // Never on both sides.
    const ids = [...s.keep, ...s.fix].map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
